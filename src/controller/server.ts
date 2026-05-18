import type net from 'node:net';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { parseAdapterDescriptor, type AdapterDescriptor } from '../adapters/descriptor.js';
import { startProcessAdapter, type StartedProcessAdapter } from '../adapters/processAdapter.js';
import { connectSocketAdapter, startServerSocketAdapter, type ConnectedSocketAdapter, type StartedServerSocketAdapter } from '../adapters/socketAdapter.js';
import { applyJsDebugTraceDefaults } from '../adapters/builtins/jsDebug.js';
import { adapterError, CliError, dapError, sessionError, timeoutError, usageError, type CliErrorAdapterContext, type CliErrorOptions, type CliErrorRequestContext } from '../cli/errors.js';
import { DapClient, DapResponseError, DapTransportClosedError } from '../protocol/dapClient.js';
import { DapEventCache } from '../protocol/eventCache.js';
import { DapLifecycleController, DapLifecycleHandshakeTimeoutError } from '../protocol/lifecycle.js';
import { getDapGeneratedCommand } from '../generated/dapCommandRegistry.js';
import type { DapTransport } from '../protocol/transport.js';
import { SessionManager } from '../sessions/sessionManager.js';
import type { CompoundSessionMetadata, OwnedAdapterMetadata, SessionStatus } from '../sessions/session.js';
import { ChildSessionCoordinator } from './childSessions.js';
import { createHelperProcessDetector } from '../sessions/helperProcessDetection.js';
import { derivePausedStateFromStopped } from './pausedState.js';
import { controllerRequestSchema, type ControllerFailureResponse, type ControllerRequest, type ControllerResponse } from './requests.js';
import { createControllerServerSocket, removeControllerDiscovery, writeControllerDiscovery, type ControllerDiscovery, type ControllerEndpoint } from './ipc.js';
import { computeBuildId } from './buildId.js';
import { threadNotPaused } from './diagnostics.js';
import { looksLikePythonStatement, wrapForExec } from './pythonExpressionDetector.js';

export interface StartControllerServerOptions {
  dapCliHome?: string | undefined;
  /**
   * Plan 05-23 (gap H-8): swappable signal helper used by
   * `terminateRuntime` so tests can mock SIGTERM/SIGKILL semantics. The
   * `target` may be negative — by Node/POSIX convention `process.kill(-pgid,
   * signal)` signals every process whose process group id is |target|. This
   * lets us cascade SIGKILL through Chromium subprocesses spawned by
   * js-debug under the adapter's own process group (Task 1.5).
   */
  signalProcess?: (target: number, signal: NodeJS.Signals) => void;
  /**
   * Plan 05-23 (gap H-8): liveness probe used by `terminateRuntime` to
   * decide whether to escalate SIGTERM → SIGKILL and whether to surface a
   * PID under `orphanPids`. Default: `process.kill(pid, 0)` returns true if
   * the OS still owns the pid.
   */
  isProcessAlive?: (pid: number) => boolean;
  /**
   * Phase 17 S-08 Bug 2 test seam. Override the per-pause wait for a
   * `stopped` event in {@link ControllerServer.maybeAttachPauseWarning}.
   * Defaults to 2_000ms in production. Tests inject a small value (e.g.
   * 50ms) so the warning path runs fast.
   */
  pauseStoppedWaitTimeoutMs?: number;
}

export interface ControllerStatus {
  pid: number;
  endpoint: ControllerEndpoint;
  stateDir: string;
  logDir: string;
  uptimeMs: number;
  sessionCount: number;
  buildId: string;
}

export interface ControllerHelloResult {
  buildId: string;
  pid: number;
}

export class ControllerServer {
  private readonly sockets = new Set<net.Socket>();
  private readonly startedAtMs = Date.now();
  private readonly closedPromise: Promise<void>;
  private resolveClosed: () => void = () => undefined;
  private discovery: ControllerDiscovery | undefined;
  private sessionManager: SessionManager | undefined;
  private readonly runtimes = new Map<string, DapSessionRuntime>();
  private stopped = false;
  private buildId: string = '';
  private readonly signalProcess: (target: number, signal: NodeJS.Signals) => void;
  private readonly isProcessAlive: (pid: number) => boolean;
  // Phase 10 plan 03 (DIAG-01): test-only seam. Production callers leave
  // this undefined and the detector falls back to spawning `ps`. In-process
  // integration tests call `setHelperProcessLookupPpid` to inject a stub.
  // The stub receives BOTH the helper pid and the adapter pid so tests can
  // deterministically force a match (return adapterPid) or a miss (return
  // adapterPid + 1) without having to discover the spawned-adapter pid out
  // of band. The seam is on the server (not the JSON-RPC start params)
  // because functions cannot survive JSON serialization.
  private helperProcessLookupPpid: ((helperPid: number, adapterPid: number) => Promise<number | undefined>) | undefined;

  public constructor(private readonly options: StartControllerServerOptions = {}) {
    this.signalProcess = options.signalProcess ?? ((target, signal) => process.kill(target, signal));
    this.isProcessAlive = options.isProcessAlive ?? defaultIsProcessAlive;
    this.closedPromise = new Promise(resolve => {
      this.resolveClosed = resolve;
    });
  }

  /**
   * Phase 10 plan 03 (DIAG-01): test-only. Inject a stub `ps` ppid lookup
   * for the helper-process detector. The stub receives both the helper pid
   * (from the DAP `process` event) and the adapter pid; returning the
   * adapter pid forces a match.
   */
  public setHelperProcessLookupPpid(lookupPpid: ((helperPid: number, adapterPid: number) => Promise<number | undefined>) | undefined): void {
    this.helperProcessLookupPpid = lookupPpid;
  }

  public get closed(): Promise<void> {
    return this.closedPromise;
  }

  public async start(): Promise<ControllerDiscovery> {
    const socket = await createControllerServerSocket(clientSocket => this.handleConnection(clientSocket), this.options);
    this.server = socket.server;
    this.sessionManager = await SessionManager.create({ dapCliHome: this.options.dapCliHome });
    this.buildId = await computeBuildId();
    const now = new Date().toISOString();
    this.discovery = {
      version: 1,
      pid: process.pid,
      endpoint: socket.endpoint,
      stateDir: socket.stateDir,
      logDir: socket.logDir,
      startedAt: now,
      lastHeartbeatAt: now,
    };
    await writeControllerDiscovery(this.discovery, this.options);
    return this.discovery;
  }

  public async stop(): Promise<void> {
    if (this.stopped) {
      return this.closedPromise;
    }

    this.stopped = true;
    await removeControllerDiscovery(this.options);

    // Persist session-store cleanup BEFORE the slow runtime teardown so a
    // racing `dap-cli start` (the CLI returns from `controller.shutdown`
    // as soon as the response is written, not when stop() completes)
    // sees an empty store. Without this, the next controller inherits
    // ghost `running` records pointing at adapters this controller is
    // still in the middle of killing — `events`/`status` then return
    // `session_unavailable` and relaunching with the same name fails as
    // `session_name_in_use`.
    for (const sessionId of [...this.runtimes.keys()]) {
      await this.sessionManager?.closeSession(sessionId).catch(() => undefined);
    }

    for (const runtime of this.runtimes.values()) {
      // Plan 05-23 (gap H-8): controller shutdown converges on the same
      // teardown path as `sessions.close` and `cleanup --purge` so behavior
      // is consistent. Ignore orphan results here — they are not surfaced
      // through any controller response since shutdown has no caller.
      await this.terminateRuntime(runtime, { terminateDebuggee: true }).catch(() => undefined);
    }
    this.runtimes.clear();

    for (const socket of this.sockets) {
      socket.end();
      socket.destroy();
    }
    this.sockets.clear();

    if (this.server === undefined) {
      this.resolveClosed();
      return;
    }

    await new Promise<void>(resolve => {
      this.server?.close(() => resolve());
    });
    this.resolveClosed();
  }

  private server: net.Server | undefined;

  private handleConnection(socket: net.Socket): void {
    this.sockets.add(socket);
    let buffer = '';

    socket.on('data', chunk => {
      buffer += chunk.toString('utf8');
      while (buffer.includes('\n')) {
        const newlineIndex = buffer.indexOf('\n');
        const line = buffer.slice(0, newlineIndex).trim();
        buffer = buffer.slice(newlineIndex + 1);
        void this.handleLine(socket, line);
      }
    });

    socket.on('close', () => {
      this.sockets.delete(socket);
    });
  }

  private async handleLine(socket: net.Socket, line: string): Promise<void> {
    if (line.length === 0) {
      return;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch {
      writeResponse(socket, malformedResponse('unknown', 'Malformed JSON request.'));
      return;
    }

    const request = controllerRequestSchema.safeParse(parsed);
    if (!request.success) {
      const id = extractRequestId(parsed);
      writeResponse(socket, malformedResponse(id, 'Malformed controller request.'));
      return;
    }

    const response = await this.handleRequest(request.data);

    if (request.data.method === 'controller.shutdown') {
      socket.end(`${JSON.stringify(response)}\n`, () => {
        void this.stop();
      });
      return;
    }

    writeResponse(socket, response);
  }

  private async handleRequest(request: ControllerRequest): Promise<ControllerResponse<unknown> | ControllerFailureResponse> {
    if (request.method === 'controller.status') {
      return {
        id: request.id,
        ok: true,
        result: this.createStatus(),
      };
    }

    if (request.method === 'controller.hello') {
      const helloResult: ControllerHelloResult = {
        buildId: this.buildId,
        pid: process.pid,
      };
      return {
        id: request.id,
        ok: true,
        result: helloResult,
      };
    }

    if (request.method === 'controller.shutdown') {
      return {
        id: request.id,
        ok: true,
        result: { stopped: true },
      };
    }

    try {
      if (isImplementedDapRequestMethod(request.method)) {
        const dapResult = await this.handleDapRequest(request);
        return {
          id: request.id,
          ok: true,
          result: dapResult ?? null,
        };
      }

      const sessionResult = await this.handleSessionRequest(request);
      if (sessionResult !== undefined) {
        return {
          id: request.id,
          ok: true,
          result: sessionResult,
        };
      }
    } catch (error) {
      if (error instanceof CliError) {
        return {
          id: request.id,
          ok: false,
          error: toControllerErrorPayload(error),
        };
      }

      return {
        id: request.id,
        ok: false,
        error: {
          code: 'controller_request_failed',
          message: error instanceof Error ? error.message : 'Controller request failed.',
        },
      };
    }

    return {
      id: request.id,
      ok: false,
      error: {
        code: 'method_not_implemented',
        message: `${request.method} is not implemented by the controller yet.`,
      },
    };
  }

  private createStatus(): ControllerStatus {
    if (this.discovery === undefined) {
      throw new Error('Controller server has not started.');
    }

    return {
      pid: process.pid,
      endpoint: this.discovery.endpoint,
      stateDir: this.discovery.stateDir,
      logDir: this.discovery.logDir,
      uptimeMs: Date.now() - this.startedAtMs,
      sessionCount: this.sessionManager?.list().length ?? 0,
      buildId: this.buildId,
    };
  }

  private async handleSessionRequest(request: ControllerRequest): Promise<unknown> {
    const manager = this.sessionManager;
    if (manager === undefined) {
      throw new Error('Session manager has not started.');
    }

    if (request.method === 'sessions.list') {
      const includeChildren = isRecord(request.params) && request.params.includeChildren === true;
      return manager.list({ includeChildren });
    }
    if (request.method === 'sessions.status') {
      const target = getOptionalStringParam(request.params, 'name');
      const status = manager.status(target);
      this.assertNotChildSession(status, target);
      return status;
    }
    if (request.method === 'sessions.target' || request.method === 'sessions.use') {
      const target = getRequiredStringParam(request.params, 'name');
      // Resolve first so we can reject children before mutating active focus.
      const status = manager.status(target);
      this.assertNotChildSession(status, target);
      return manager.targetSession(target);
    }
    if (request.method === 'sessions.stop') {
      const target = getOptionalStringParam(request.params, 'name');
      await this.disconnectRuntimeForTarget(target, { terminateDebuggee: true });
      return manager.stopSession(target);
    }
    if (request.method === 'sessions.detach') {
      const target = getOptionalStringParam(request.params, 'name');
      await this.disconnectRuntimeForTarget(target, { terminateDebuggee: false });
      return manager.detachSession(target);
    }
    if (request.method === 'sessions.close') {
      const target = getOptionalStringParam(request.params, 'name');
      try {
        const status = manager.status(target);
        const closeTargets = status.compound?.stopAll === true
          ? manager.list().filter(session => session.compound?.id === status.compound?.id).map(session => session.id)
          : [status.id];
        const teardownResults = await Promise.all(closeTargets.map(async sessionId => {
          const runtime = this.runtimes.get(sessionId);
          if (runtime !== undefined) {
            const teardown = await this.terminateRuntime(runtime, { terminateDebuggee: true });
            this.runtimes.delete(sessionId);
            return teardown;
          }
          return { orphanPids: [], warnings: [] };
        }));
        for (const sessionId of closeTargets) {
          await manager.closeSession(sessionId);
        }
        const orphanPids = teardownResults.flatMap(result => result.orphanPids);
        const warnings = teardownResults.flatMap(result => result.warnings);
        return { ...status, orphanPids, warnings };
      } catch {
        // Resolution failures (e.g. session_not_found) fall through to
        // closeSession which produces the canonical error.
      }
      const sessionStatus = await manager.closeSession(target);
      return { ...sessionStatus, orphanPids: [], warnings: [] };
    }
    if (request.method === 'sessions.cleanup') {
      const purge = isRecord(request.params) && request.params.purge === true;
      // Plan 05-23 (gap H-8): on `--purge`, run terminateRuntime against
      // every active runtime BEFORE the manager removes records. This
      // converges teardown semantics with `sessions.close` so users don't
      // get silent orphans regardless of which command they use.
      const orphanPids: number[] = [];
      const warnings: string[] = [];
      if (purge) {
        for (const [sessionId, runtime] of [...this.runtimes.entries()]) {
          const teardown = await this.terminateRuntime(runtime, { terminateDebuggee: true }).catch(() => ({ orphanPids: [] as number[], warnings: [] as string[] }));
          orphanPids.push(...teardown.orphanPids);
          warnings.push(...teardown.warnings);
          this.runtimes.delete(sessionId);
        }
      }
      const cleanupResult = await manager.cleanupSessions({ purge });
      return { ...cleanupResult, orphanPids, warnings };
    }

    return undefined;
  }

  private async handleDapRequest(request: ControllerRequest): Promise<unknown> {
    if (request.method === 'dap.start') {
      return this.startDapSession(request.params);
    }
    if (request.method === 'dap.startCompound') {
      return this.startDapCompound(request.params);
    }
    if (request.method === 'dap.request') {
      return this.routeDapRequest(request.params);
    }
    if (request.method === 'dap.capabilities') {
      return this.reportDapCapabilities(request.params);
    }
    if (request.method === 'sessions.breakpoints.list') {
      return this.handleListBreakpoints(request.params);
    }
    if (request.method === 'sessions.breakpoints.clear') {
      return this.handleClearBreakpoints(request.params);
    }
    if (request.method === 'events.recent' || request.method === 'events.list') {
      return this.recentEvents(request.params);
    }

    return undefined;
  }

  private async startDapSession(params: unknown): Promise<DapStartResult> {
    return this.startDapSessionFromParams(parseDapStartParams(params));
  }

  private async startDapCompound(params: unknown): Promise<DapStartCompoundResult> {
    const manager = this.requireSessionManager();
    const startParams = parseDapStartCompoundParams(params);
    const compoundId = createCompoundId();
    const memberNames = startParams.members.map(member => member.memberName);
    const startedMembers: Array<{ memberName: string; result: DapStartResult }> = [];

    try {
      for (const member of startParams.members) {
        const compound: CompoundSessionMetadata = {
          id: compoundId,
          name: startParams.name,
          memberName: member.memberName,
          stopAll: startParams.stopAll,
          members: memberNames,
        };
        const result = await this.startDapSessionFromParams({
          mode: member.mode,
          name: `${startParams.name}/${member.memberName}`,
          use: startParams.use,
          descriptor: member.descriptor,
          config: member.config,
          compound,
        });
        startedMembers.push({ memberName: member.memberName, result });
      }
    } catch (error) {
      for (const started of [...startedMembers].reverse()) {
        const runtime = this.runtimes.get(started.result.sessionId);
        if (runtime !== undefined) {
          await this.terminateRuntime(runtime, { terminateDebuggee: true }).catch(() => undefined);
          this.runtimes.delete(started.result.sessionId);
        }
        await manager.closeSession(started.result.sessionId).catch(() => undefined);
      }
      const failedMemberName = findFailedCompoundMemberName(error, startParams.members, startedMembers.map(member => member.memberName));
      if (failedMemberName !== undefined) {
        await manager.closeSession(`${startParams.name}/${failedMemberName}`).catch(() => undefined);
      }
      throw dapError(`Compound member '${failedMemberName ?? 'unknown'}' failed to start.`, {
        code: 'compound_member_start_failed',
        diagnostics: createCompoundFailureDiagnostics(startParams.name, failedMemberName, error),
        data: {
          compoundName: startParams.name,
          memberName: failedMemberName,
          startedMembers: startedMembers.map(member => member.memberName),
        },
      });
    }

    return {
      compoundId,
      name: startParams.name,
      stopAll: startParams.stopAll,
      members: startedMembers.map(member => member.result),
    };
  }

  private async startDapSessionFromParams(startParams: DapStartSessionParams): Promise<DapStartResult> {
    const manager = this.requireSessionManager();
    const discovery = this.requireDiscovery();
    const descriptor = parseAdapterDescriptor(startParams.descriptor);
    const adapter = await this.startAdapter(descriptor, discovery.logDir);
    const { config, initialBreakpoints } = extractDapCliStartConfig(startParams.config);
    // Plan 05-21 (gap H-5): for js-debug, inject `trace.logFile` into the
    // launch/attach config so its DAP/CDP wire trace lands in a discoverable
    // sibling file under the controller's log directory. The descriptor lives
    // upstream of launch args, so the merge happens here at the point where
    // both descriptor identity and the resolved logDir are known.
    const preparedConfig = descriptor.id === 'js-debug'
      ? applyJsDebugTraceDefaults(config, discovery.logDir)
      : config;
    const createOptions = {
      name: startParams.name,
      adapter: descriptor.id,
      lifecycle: 'adapterStarting',
      makeActive: startParams.use,
      ownedAdapter: getOwnedAdapter(adapter),
    } as const;
    const session = await manager.create(startParams.compound === undefined ? createOptions : { ...createOptions, compound: startParams.compound });
    const client = new DapClient(adapter.transport, { requestTimeoutMs: controllerDapRequestTimeoutMs });
    const lifecycle = new DapLifecycleController(client, { handshakeTimeoutMs: controllerDapRequestTimeoutMs });
    // Plan 05-18 (gap H-2): two-ring cache so js-debug `loadedSource` spam
    // (93/100 in a single hello-world, see 05-UAT.md) cannot evict critical
    // events like `stopped`. 200 high-priority + 50 low-priority = 250 total.
    const eventCache = new DapEventCache({ highPriorityCapacity: 200, lowPriorityCapacity: 50 });

    client.onEvent(event => {
      eventCache.append(session.id, event);
      if (event.event === 'stopped') {
        void manager.updateLifecycle(session.id, 'stopped').catch(() => undefined);
        void manager.updatePausedState(session.id, derivePausedStateFromStopped(event.body)).catch(() => undefined);
      } else if (event.event === 'continued') {
        void manager.updateLifecycle(session.id, 'running').catch(() => undefined);
        void manager.updatePausedState(session.id, { paused: false }).catch(() => undefined);
      } else if (event.event === 'terminated') {
        void manager.updateLifecycle(session.id, 'terminated').catch(() => undefined);
        void manager.updatePausedState(session.id, { paused: false }).catch(() => undefined);
      }
    });

    // Phase 10 plan 03 (DIAG-01): helper-process detector. Only js-debug
    // attach sessions can produce the helper-process false-positive cascade
    // documented in analysis.md, so the detector is gated to that case.
    if (descriptor.id === 'js-debug' && startParams.mode === 'attach') {
      const adapterPid = getOwnedAdapter(adapter).pid;
      const detectorOptions: Parameters<typeof createHelperProcessDetector>[0] = {
        sessionId: session.id,
        adapterId: descriptor.id,
        adapterPid,
        mode: startParams.mode,
        eventCache,
      };
      if (this.helperProcessLookupPpid !== undefined) {
        const stub = this.helperProcessLookupPpid;
        const pinnedAdapterPid = adapterPid;
        if (pinnedAdapterPid !== undefined) {
          detectorOptions.lookupPpid = (helperPid: number) => stub(helperPid, pinnedAdapterPid);
        }
      }
      const detector = createHelperProcessDetector(detectorOptions);
      client.onEvent(event => detector.handleEvent(event));
    }

    let children: ChildSessionCoordinator | undefined;
    const adapterOpenChildTransport = 'openChildTransport' in adapter && typeof adapter.openChildTransport === 'function'
      ? adapter.openChildTransport.bind(adapter)
      : undefined;
    if (adapterOpenChildTransport !== undefined) {
      children = new ChildSessionCoordinator({
        parentSessionId: session.id,
        parentName: session.name,
        parentClient: client,
        adapterId: descriptor.id,
        ownedAdapter: getOwnedAdapter(adapter) as OwnedAdapterMetadata,
        sessionManager: manager,
        parentEventCache: eventCache,
        openChildTransport: adapterOpenChildTransport,
      });
      children.attach();
    }

    const runtime: DapSessionRuntime = children === undefined
      ? { sessionId: session.id, name: session.name, adapterId: descriptor.id, client, lifecycle, eventCache, adapter, capabilities: {} }
      : { sessionId: session.id, name: session.name, adapterId: descriptor.id, client, lifecycle, eventCache, adapter, capabilities: {}, children };
    this.runtimes.set(session.id, runtime);
    let startResult: Awaited<ReturnType<DapLifecycleController['start']>>;
    try {
      const beforeConfigurationDone = createBeforeConfigurationDoneHook(client, initialBreakpoints, children);
      if (startParams.mode === 'launch') {
        startResult = await lifecycle.start(beforeConfigurationDone === undefined
          ? { mode: 'launch', initializeArgs: createInitializeArgs(descriptor.id), launchArgs: preparedConfig }
          : { mode: 'launch', initializeArgs: createInitializeArgs(descriptor.id), launchArgs: preparedConfig, beforeConfigurationDone });
      } else {
        startResult = await lifecycle.start(beforeConfigurationDone === undefined
          ? { mode: 'attach', initializeArgs: createInitializeArgs(descriptor.id), attachArgs: preparedConfig }
          : { mode: 'attach', initializeArgs: createInitializeArgs(descriptor.id), attachArgs: preparedConfig, beforeConfigurationDone });
      }
    } catch (error) {
      await manager.updateLifecycle(session.id, 'failed').catch(() => undefined);
      if (children !== undefined) {
        await children.dispose().catch(() => undefined);
      }
      await client.close().catch(() => undefined);
      await adapter.close().catch(() => undefined);
      this.runtimes.delete(session.id);
      throw toDapCliError(error, createDapErrorContext({
        sessionId: session.id,
        adapter: getAdapterContext(descriptor.id, adapter),
        request: client.lastRequest,
      }));
    }
    runtime.capabilities = startResult.capabilities;
    await manager.updateLifecycle(session.id, lifecycle.state.lifecycle === 'stopped' ? 'stopped' : 'running');
    const snapshot = eventCache.recent();

    return {
      sessionId: session.id,
      name: session.name,
      lifecycle: lifecycle.state.lifecycle,
      capabilities: startResult.capabilities,
      eventCursor: snapshot.cursor,
    };
  }

  private async routeDapRequest(params: unknown): Promise<unknown> {
    const requestParams = parseDapRequestParams(params);
    const runtime = this.resolveRuntime(requestParams.name);
    this.assertSupportedDapRequest(runtime, requestParams.command);
    this.assertThreadPausedIfRequired(runtime, requestParams.command);
    const evaluateRewrite = maybePythonEvaluateRewrite(runtime.adapterId, requestParams);
    const forwardArgs = evaluateRewrite?.forwardArgs ?? requestParams.args;
    const wrapDapError = (error: unknown): never => {
      // Phase 16-01 (PYEVAL-01): a debugpy `evaluate` that comes back with a
      // SyntaxError shape is upgraded to a structured `evaluate_requires_exec`
      // envelope carrying the exact `exec(...)` recipe so callers can retry
      // verbatim instead of guessing the wrap.
      if (
        evaluateRewrite !== undefined
        && error instanceof DapResponseError
        && /syntaxerror|invalid syntax/i.test(error.message)
      ) {
        const execForm = wrapForExec(evaluateRewrite.originalExpression);
        throw dapError('`evaluate` requires `exec(...)` for Python statements (debugpy is expression-only).', {
          code: 'evaluate_requires_exec',
          diagnostics: [
            `Re-send with \`args.expression\` wrapped as: ${execForm}`,
            'Or set `args.context = \'no-auto-wrap\'` to bypass auto-wrap if you intentionally want the raw expression.',
          ],
          data: { exec_form: execForm, original_expression: evaluateRewrite.originalExpression },
          sessionId: runtime.sessionId,
          request: { command: 'evaluate' },
          adapter: getAdapterContext(runtime.adapterId, runtime.adapter),
        });
      }
      let staleStatus: string | undefined;
      try {
        staleStatus = this.requireSessionManager().status(requestParams.name).status;
      } catch {
        staleStatus = undefined;
      }
      throw toDapCliError(error, {
        sessionId: runtime.sessionId,
        adapter: getAdapterContext(runtime.adapterId, runtime.adapter),
        request: runtime.client.lastRequest ?? { command: requestParams.command },
        staleSession: { sessionRef: runtime.sessionId, ...(staleStatus !== undefined ? { status: staleStatus } : {}) },
      });
    };
    let responseBody: unknown;
    let intercepted = false;
    if (runtime.children !== undefined) {
      let childResult;
      try {
        childResult = await runtime.children.maybeIntercept(requestParams.command, forwardArgs);
      } catch (error) {
        wrapDapError(error);
      }
      if (childResult !== undefined) {
        responseBody = childResult.value;
        intercepted = true;
      }
    }
    if (!intercepted) {
      try {
        responseBody = await runtime.client.request(requestParams.command, forwardArgs);
      } catch (error) {
        wrapDapError(error);
      }
    }
    this.maybeTrackBreakpoints(runtime, requestParams, responseBody);
    responseBody = await this.maybeAttachPauseWarning(runtime, requestParams.command, responseBody);
    return responseBody;
  }

  /**
   * Phase 17 S-08 Bug 2: a `pause` request can be acknowledged by the
   * adapter (`success: true`) without the targeted thread actually halting
   * — observed against a js-debug attach where `Debugger.pause` was sent
   * to the bootloader root with no CDP `sessionId`, so it landed on a
   * target with no user-pauseable code and never produced a `stopped`
   * event. The CLI then sat at "pause returned ok" while every follow-up
   * (`stack`, `vars`) failed with `thread_not_paused`.
   *
   * This post-success hook waits up to 2_000ms for `manager.status(...).
   * paused === true` (which captures both parent and child stopped events
   * via {@link ChildSessionCoordinator.recomputeParentPausedState}). If
   * the deadline elapses, we surface a `pause_no_stopped_event` warning
   * on the response so the caller sees a diagnostic instead of an opaque
   * silent success. The DAP `pause` response body is normally `{}`, so
   * adding a `warnings` field is purely additive.
   *
   * Kept under the 5s controller IPC budget; in the happy case the wait
   * resolves in ~50–500ms (one poll tick after the stopped event lands).
   */
  private async maybeAttachPauseWarning(runtime: DapSessionRuntime, command: string, responseBody: unknown): Promise<unknown> {
    if (command !== 'pause') {
      return responseBody;
    }
    const manager = this.requireSessionManager();
    const sessionId = runtime.sessionId;
    const timeoutMs = this.options.pauseStoppedWaitTimeoutMs ?? 2_000;
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      let paused: boolean | undefined;
      try {
        paused = manager.status(sessionId).paused;
      } catch {
        return responseBody;
      }
      if (paused === true) {
        return responseBody;
      }
      await new Promise<void>(resolve => { setTimeout(resolve, 75).unref?.(); });
    }
    const warning = {
      message: 'pause_no_stopped_event',
      diagnostics: [
        'pause was acknowledged but no `stopped` event arrived within 2s.',
        'The targeted thread may belong to a parent (e.g. js-debug bootloader root) that has no user-pauseable code, or to a worker without an active CDP session.',
        'Run `dap-cli sessions --json` to find the user-code child session and target it explicitly with `--name <child>`.',
      ],
    };
    if (isRecord(responseBody)) {
      return { ...responseBody, warnings: [warning] };
    }
    return { warnings: [warning] };
  }

  /**
   * Phase 12 plan 01 (BPCMD-01/02): post-success hook on routeDapRequest.
   * Best-effort — any tracking failure is swallowed so the user's primary
   * request is never poisoned by bookkeeping. Empty `args.breakpoints`
   * deletes the tracked entry (DAP setBreakpoints "clear" semantics).
   */
  private maybeTrackBreakpoints(runtime: DapSessionRuntime, requestParams: { command: string; args?: unknown }, responseBody: unknown): void {
    if (requestParams.command !== 'setBreakpoints') {
      return;
    }
    try {
      if (!isRecord(requestParams.args)) {
        return;
      }
      const sourceArg = requestParams.args.source;
      if (!isRecord(sourceArg) || typeof sourceArg.path !== 'string') {
        return;
      }
      const sourcePath = sourceArg.path;
      const requested = Array.isArray(requestParams.args.breakpoints) ? requestParams.args.breakpoints as readonly unknown[] : [];
      if (requested.length === 0) {
        runtime.breakpoints?.delete(sourcePath);
        return;
      }
      const responseBreakpoints = isRecord(responseBody) && Array.isArray(responseBody.breakpoints)
        ? responseBody.breakpoints as readonly unknown[]
        : [];
      const map = runtime.breakpoints ?? new Map<string, TrackedBreakpointSource>();
      map.set(sourcePath, { source: sourceArg as { path: string; [key: string]: unknown }, requested, response: responseBreakpoints });
      runtime.breakpoints = map;
    } catch {
      // best-effort tracking
    }
  }

  private handleListBreakpoints(params: unknown): { sources: Array<{ source: unknown; breakpoints: readonly unknown[]; requested: readonly unknown[] }> } {
    const target = getOptionalStringParam(params, 'name');
    const source = getOptionalStringParam(params, 'source');
    const runtime = this.resolveRuntime(target);
    const map = runtime.breakpoints;
    if (map === undefined) {
      return { sources: [] };
    }
    if (source !== undefined) {
      const entry = map.get(path.resolve(source));
      return entry === undefined
        ? { sources: [] }
        : { sources: [{ source: entry.source, breakpoints: entry.response, requested: entry.requested }] };
    }
    return {
      sources: Array.from(map.values(), entry => ({ source: entry.source, breakpoints: entry.response, requested: entry.requested })),
    };
  }

  private async handleClearBreakpoints(params: unknown): Promise<{ cleared: Array<{ source: unknown; requested: number }> }> {
    const target = getOptionalStringParam(params, 'name');
    const source = getOptionalStringParam(params, 'source');
    const runtime = this.resolveRuntime(target);
    this.assertSupportedDapRequest(runtime, 'setBreakpoints');
    const map = runtime.breakpoints;
    if (map === undefined || map.size === 0) {
      return { cleared: [] };
    }
    const wrapDapError = (error: unknown): never => {
      throw toDapCliError(error, {
        sessionId: runtime.sessionId,
        adapter: getAdapterContext(runtime.adapterId, runtime.adapter),
        request: runtime.client.lastRequest ?? { command: 'setBreakpoints' },
      });
    };
    const cleared: Array<{ source: unknown; requested: number }> = [];
    if (source !== undefined) {
      const key = path.resolve(source);
      const entry = map.get(key);
      if (entry === undefined) {
        return { cleared: [] };
      }
      try {
        await runtime.client.request('setBreakpoints', { source: entry.source, breakpoints: [], lines: [] });
      } catch (error) {
        wrapDapError(error);
      }
      map.delete(key);
      cleared.push({ source: entry.source, requested: 0 });
      return { cleared };
    }
    const keys = Array.from(map.keys());
    for (const key of keys) {
      const entry = map.get(key);
      if (entry === undefined) {
        continue;
      }
      try {
        await runtime.client.request('setBreakpoints', { source: entry.source, breakpoints: [], lines: [] });
      } catch (error) {
        wrapDapError(error);
      }
      map.delete(key);
      cleared.push({ source: entry.source, requested: 0 });
    }
    return { cleared };
  }

  private reportDapCapabilities(params: unknown): DapCapabilitiesResult {
    const runtime = this.resolveRuntime(getOptionalStringParam(params, 'name'));
    return {
      sessionId: runtime.sessionId,
      name: runtime.name,
      adapterId: runtime.adapterId,
      capabilities: runtime.capabilities,
    };
  }

  private assertSupportedDapRequest(runtime: DapSessionRuntime, command: string): void {
    const metadata = getDapGeneratedCommand(command);
    if (metadata?.capability === undefined || hasTruthyCapability(runtime.capabilities, metadata.capability)) {
      return;
    }

    throw dapError(`DAP request '${command}' requires unsupported adapter capability '${metadata.capability}'.`, {
      code: 'dap_request_unsupported',
      diagnostics: [`Adapter '${runtime.adapterId}' did not report capability '${metadata.capability}' required by request '${command}'.`],
      sessionId: runtime.sessionId,
      request: { command },
      adapter: getAdapterContext(runtime.adapterId, runtime.adapter),
    });
  }

  /**
   * Plan 05-20 (gap H-7): paused-state-required DAP requests (stackTrace,
   * scopes, variables) must NOT be forwarded to the adapter when we know
   * the thread isn't paused. Without this gate, the adapter typically
   * returns a generic failure that surfaces as `controller_unavailable:
   * Run dap-cli start` — the wrong recovery hint.
   *
   * The gate consults the H-1 paused projection (`session.paused`):
   *   - `paused === false`: known not paused → throw `thread_not_paused`.
   *   - `paused === true`:  known paused → forward to adapter.
   *   - `paused === undefined`: unknown (no stopped/continued event observed
   *     yet) → forward to adapter (do not regress legitimate paused
   *     requests on a stale projection — see threat T-05-20-02).
   */
  private assertThreadPausedIfRequired(runtime: DapSessionRuntime, command: string): void {
    if (!PAUSED_REQUIRED_DAP_COMMANDS.has(command)) {
      return;
    }
    let paused: boolean | undefined;
    try {
      paused = this.requireSessionManager().status(runtime.sessionId).paused;
    } catch {
      // If status lookup fails for any reason, fall through to the adapter
      // — do not synthesize a paused-state error from a missing projection.
      return;
    }
    if (paused === false) {
      throw threadNotPaused({ sessionId: runtime.sessionId, sessionName: runtime.name, command });
    }
  }

  private recentEvents(params: unknown): EventsRecentResult {
    const eventParams = parseEventsRecentParams(params);
    const runtime = this.resolveRuntime(eventParams.name);
    const snapshot = runtime.eventCache.recent(eventParams.options);
    const result: EventsRecentResult = {
      sessionId: runtime.sessionId,
      name: runtime.name,
      events: snapshot.events,
      cursor: snapshot.cursor,
      dropped: snapshot.droppedBeforeCursor ?? 0,
      // Plan 05-18 (gap H-2): expose capacity to the CLI so it can produce
      // honest `limit_exceeded_capacity` warnings client-side.
      capacity: snapshot.capacity,
      capacityByPriority: snapshot.capacityByPriority,
    };
    if (snapshot.truncatedToCapacity !== undefined) {
      result.truncatedToCapacity = snapshot.truncatedToCapacity;
    }
    return result;
  }

  private async startAdapter(descriptor: AdapterDescriptor, logDir: string): Promise<AdapterRuntime> {
    if (descriptor.transport.kind === 'stdio') {
      return startProcessAdapter({ descriptor: descriptor.transport, adapterId: descriptor.id, logDir });
    }
    if (descriptor.transport.kind === 'server') {
      return startServerSocketAdapter(descriptor.id, descriptor.transport, logDir);
    }

    return connectSocketAdapter(descriptor.id, descriptor.transport);
  }

  private resolveRuntime(target: string | undefined): DapSessionRuntime {
    const status = this.requireSessionManager().status(target);
    this.assertNotChildSession(status, target);
    const runtime = this.runtimes.get(status.id);
    if (runtime === undefined) {
      throw sessionError(`No DAP runtime is attached to session ${status.id}.`, {
        code: 'session_unavailable',
        sessionId: status.id,
        diagnostics: createMissingRuntimeDiagnostics(status),
      });
    }

    return runtime;
  }

  /**
   * Plan 05-19 (gap H-3): reject any public-CLI targeting of a child session
   * BEFORE attempting runtime lookup. The parent owns the bp registry,
   * threads, and event stream in js-debug pwa-chrome (verified by direct DAP
   * trace; see /memories/repo/dap-cli.md). Returning the misleading
   * `session_unavailable: No DAP runtime is attached` was the original H-3
   * symptom — this gate replaces it with an actionable error code and a
   * machine-readable `data` payload pointing at the parent.
   */
  private assertNotChildSession(status: SessionStatus, providedTarget: string | undefined): void {
    if (status.parent_session_id === undefined) {
      return;
    }
    const parent = this.requireSessionManager()
      .list({ includeChildren: true })
      .find(record => record.id === status.parent_session_id);
    const parentName = parent?.name;
    const parentRef = parentName ?? status.parent_session_id;
    const targetLabel = providedTarget ?? status.id;
    throw sessionError(`Child session ${targetLabel} cannot be targeted directly.`, {
      code: 'child_session_not_targetable',
      sessionId: status.id,
      diagnostics: [
        `Child sessions are owned by their parent. Re-run the command with \`--name ${parentRef}\` — the parent owns threads, breakpoints, and the event stream for js-debug pwa-chrome (see dev/smoke/hand-driven-smoke.md).`,
      ],
      data: {
        childSessionId: status.id,
        parentSessionId: status.parent_session_id,
        ...(parentName !== undefined ? { parentName } : {}),
      },
    });
  }

  private async disconnectRuntimeForTarget(target: string | undefined, opts: { terminateDebuggee: boolean }): Promise<void> {
    let status: SessionStatus;
    try {
      status = this.requireSessionManager().status(target);
    } catch {
      return;
    }

    const runtime = this.runtimes.get(status.id);
    if (runtime === undefined) {
      return;
    }

    if (runtime.children !== undefined) {
      await runtime.children.dispose().catch(() => undefined);
    }
    await runtime.lifecycle.disconnect({ terminateDebuggee: opts.terminateDebuggee }).catch(() => undefined);
    await runtime.client.close().catch(() => undefined);
    await runtime.adapter.close().catch(() => undefined);
    this.runtimes.delete(status.id);
  }

  private requireSessionManager(): SessionManager {
    const manager = this.sessionManager;
    if (manager === undefined) {
      throw new Error('Session manager has not started.');
    }

    return manager;
  }

  private requireDiscovery(): ControllerDiscovery {
    if (this.discovery === undefined) {
      throw new Error('Controller server has not started.');
    }

    return this.discovery;
  }

  /**
   * Plan 05-23 (gap H-8): single teardown path shared by `sessions.close`,
   * `sessions.cleanup --purge`, and `ControllerServer.stop`. Steps:
   *
   *   1. Dispose any child-session coordinator.
  *   2. Send DAP `disconnect` (with `terminateDebuggee` per opts), but do not
  *      let a missing adapter response consume the full DAP request timeout.
   *   3. Wait up to 5s for the owned-adapter pid to exit naturally.
   *   4. If still alive, signal the adapter's process group (POSIX) or pid
   *      (Windows) with SIGTERM, wait 200ms, escalate to SIGKILL, wait 200ms.
   *   5. Close the DAP client + adapter wrappers.
   *   6. Probe liveness one final time. PIDs that survive are returned in
   *      `orphanPids` with a parallel `warnings` entry so callers can surface
   *      them honestly to the user.
   *
   * The signal helper and liveness probe are injected via constructor options
   * so tests can simulate "signal failed; pid stays alive" without spawning
   * unkillable processes.
   */
  private async terminateRuntime(runtime: DapSessionRuntime, opts: { terminateDebuggee: boolean }): Promise<{ orphanPids: number[]; warnings: string[] }> {
    if (runtime.children !== undefined) {
      await runtime.children.dispose().catch(() => undefined);
    }

    // Plan 05-23 race note: the user's hand-driven trace caught a
    // `TypeError: Cannot read properties of undefined (reading 'terminateDebuggee')`
    // inside js-debug's bundled `dapDebugServer.js` when disconnect raced
    // with the adapter's session wiring. We always forward the disconnect
    // (the adapter logs the error and exits, which is exactly what we want
    // on close) and follow up with explicit signaling so a crashed disconnect
    // never leaves the debuggee alive.
    const disconnect = runtime.lifecycle.disconnect({ terminateDebuggee: opts.terminateDebuggee });
    disconnect.catch(() => undefined);
    await this.waitForDisconnect(disconnect, controllerDisconnectTimeoutMs);

    const adapterPid = getAdapterPid(runtime.adapter);
    const groupTarget = getGroupSignalTarget(runtime.adapter, adapterPid);

    if (adapterPid !== undefined) {
      // Plan 05-23 deviation note: plan called for "up to 5s" wait for
      // natural exit, but the CLI controller client has a 5s default
      // timeout (src/controller/client.ts:25). We use 1s here so a stuck
      // teardown still surfaces orphanPids before the IPC client gives up.
      // Real adapters exit in milliseconds after disconnect; 1s is a safe
      // ceiling.
      await this.waitForPidExit(adapterPid, 1_000);

      if (groupTarget !== undefined && this.isProcessAlive(adapterPid)) {
        try {
          this.signalProcess(groupTarget, 'SIGTERM');
        } catch {
          // Best-effort: ignore ESRCH and similar; we re-check liveness next.
        }
        await this.waitForPidExit(adapterPid, 200);
      }
      if (groupTarget !== undefined && this.isProcessAlive(adapterPid)) {
        try {
          this.signalProcess(groupTarget, 'SIGKILL');
        } catch {
          // Best-effort: ignore.
        }
        await this.waitForPidExit(adapterPid, 200);
      }
    }

    await runtime.client.close().catch(() => undefined);
    await runtime.adapter.close().catch(() => undefined);

    if (adapterPid !== undefined && this.isProcessAlive(adapterPid)) {
      return {
        orphanPids: [adapterPid],
        warnings: [`orphan_processes_remain: ${adapterPid}`],
      };
    }
    return { orphanPids: [], warnings: [] };
  }

  private async waitForPidExit(pid: number, timeoutMs: number): Promise<void> {
    const intervalMs = 50;
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (!this.isProcessAlive(pid)) {
        return;
      }
      await new Promise<void>(resolve => setTimeout(resolve, intervalMs));
    }
  }

  private async waitForDisconnect(disconnect: Promise<void>, timeoutMs: number): Promise<void> {
    let timer: NodeJS.Timeout | undefined;
    try {
      await Promise.race([
        disconnect.catch(() => undefined),
        new Promise<void>(resolve => {
          timer = setTimeout(resolve, timeoutMs);
        }),
      ]);
    } finally {
      if (timer !== undefined) {
        clearTimeout(timer);
      }
    }
  }
}

function defaultIsProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    // ESRCH: no such process. Any other error (EPERM) means the pid exists
    // but we can't signal it \u2014 still report alive so the caller surfaces it
    // as orphan rather than silently dropping it.
    if (error instanceof Error && 'code' in error && (error as NodeJS.ErrnoException).code === 'ESRCH') {
      return false;
    }
    return true;
  }
}

function getAdapterPid(adapter: AdapterRuntime): number | undefined {
  if ('ownedAdapter' in adapter && typeof adapter.ownedAdapter.pid === 'number') {
    return adapter.ownedAdapter.pid;
  }
  return undefined;
}

function getGroupSignalTarget(adapter: AdapterRuntime, adapterPid: number | undefined): number | undefined {
  if (adapterPid === undefined) {
    return undefined;
  }
  if ('processGroupId' in adapter && typeof adapter.processGroupId === 'number') {
    // Negative target signals the process group whose pgid is |target|
    // (Node/POSIX `process.kill(-pgid, signal)` convention). Cascades to
    // adapter children (e.g. Chromium spawned by js-debug pwa-chrome).
    return -adapter.processGroupId;
  }
  return adapterPid;
}

/**
 * Plan 05-20 (gap H-7): DAP requests that semantically require a paused
 * thread. When the controller can prove the thread is running (via the H-1
 * paused projection), these get a structured `thread_not_paused` error
 * instead of a generic adapter failure.
 */
const PAUSED_REQUIRED_DAP_COMMANDS: ReadonlySet<string> = new Set([
  'stackTrace',
  'scopes',
  'variables',
]);

const controllerDapRequestTimeoutMs = 30_000;
const controllerDisconnectTimeoutMs = 1_000;

function createInitializeArgs(adapterId: string): Record<string, unknown> {  return {
    adapterID: adapterId,
    clientID: 'dap-cli',
    clientName: 'dap-cli',
    columnsStartAt1: true,
    linesStartAt1: true,
    pathFormat: 'path',
  };
}

type AdapterRuntime = (StartedProcessAdapter | ConnectedSocketAdapter | StartedServerSocketAdapter) & { transport: DapTransport };

interface TrackedBreakpointSource {
  source: { path: string; [key: string]: unknown };
  requested: readonly unknown[];
  response: readonly unknown[];
}

interface DapSessionRuntime {
  sessionId: string;
  name: string;
  adapterId: string;
  client: DapClient;
  lifecycle: DapLifecycleController;
  eventCache: DapEventCache;
  adapter: AdapterRuntime;
  capabilities: unknown;
  children?: ChildSessionCoordinator;
  // Phase 12 plan 01 (BPCMD-01/02): in-memory tracking of every successful
  // setBreakpoints the controller has observed for this session, keyed by
  // resolved source.path. Lazy-initialized on first successful set.
  // Initial breakpoints sent during dap.start handshake are NOT tracked
  // here — only requests routed through routeDapRequest are observed.
  breakpoints?: Map<string, TrackedBreakpointSource>;
}

interface DapStartResult {
  sessionId: string;
  name: string;
  lifecycle: string;
  capabilities: unknown;
  eventCursor: number;
}

interface DapStartCompoundResult {
  compoundId: string;
  name: string;
  stopAll: boolean;
  members: readonly DapStartResult[];
}

interface DapStartSessionParams {
  mode: 'launch' | 'attach';
  name: string;
  use: boolean;
  descriptor: unknown;
  config?: unknown;
  compound?: CompoundSessionMetadata;
}

interface DapStartCompoundMemberParams {
  memberName: string;
  mode: 'launch' | 'attach';
  descriptor: unknown;
  config?: unknown;
}

interface DapStartCompoundParams {
  name: string;
  stopAll: boolean;
  use: boolean;
  members: readonly DapStartCompoundMemberParams[];
}

interface EventsRecentResult {
  sessionId: string;
  name: string;
  events: unknown;
  cursor: number;
  dropped: number;
  capacity: number;
  capacityByPriority: { high: number; low: number };
  truncatedToCapacity?: number;
}

interface DapCapabilitiesResult {
  sessionId: string;
  name: string;
  adapterId: string;
  capabilities: unknown;
}

function parseDapStartParams(params: unknown): DapStartSessionParams {
  if (!isRecord(params)) {
    throw usageError('Missing DAP start parameters.', { code: 'missing_parameter' });
  }

  const mode = params.mode;
  const name = params.name;
  const parsed: DapStartSessionParams = {
    mode: mode === 'attach' ? 'attach' : 'launch',
    name: typeof name === 'string' && name.length > 0 ? name : 'default',
    use: params.use !== false,
    descriptor: params.descriptor,
  };
  if ('config' in params) {
    parsed.config = params.config;
  }

  return parsed;
}

function parseDapStartCompoundParams(params: unknown): DapStartCompoundParams {
  if (!isRecord(params)) {
    throw usageError('Missing compound start parameters.', { code: 'missing_parameter' });
  }

  const name = typeof params.name === 'string' && params.name.length > 0 ? params.name : undefined;
  if (name === undefined) {
    throw usageError('Missing compound name.', { code: 'missing_parameter' });
  }
  if (!Array.isArray(params.members) || params.members.length === 0) {
    throw usageError('Compound launch requires at least one member.', { code: 'missing_parameter' });
  }

  return {
    name,
    stopAll: params.stopAll !== false,
    use: params.use !== false,
    members: params.members.map(parseDapStartCompoundMemberParams),
  };
}

function parseDapStartCompoundMemberParams(value: unknown): DapStartCompoundMemberParams {
  if (!isRecord(value)) {
    throw usageError('Invalid compound member.', { code: 'missing_parameter' });
  }
  const memberName = typeof value.memberName === 'string' && value.memberName.length > 0 ? value.memberName : undefined;
  if (memberName === undefined) {
    throw usageError('Compound member is missing memberName.', { code: 'missing_parameter' });
  }
  const mode = value.mode === 'attach' ? 'attach' : 'launch';
  const parsed: DapStartCompoundMemberParams = {
    memberName,
    mode,
    descriptor: value.descriptor,
  };
  if ('config' in value) {
    parsed.config = value.config;
  }
  return parsed;
}

function createCompoundId(): string {
  return `compound_${randomBytes(12).toString('base64url')}`;
}

function findFailedCompoundMemberName(error: unknown, members: readonly DapStartCompoundMemberParams[], startedMemberNames: readonly string[]): string | undefined {
  const failed = members.find(member => !startedMemberNames.includes(member.memberName));
  if (failed !== undefined) {
    return failed.memberName;
  }
  if (error instanceof CliError && error.data !== undefined && typeof error.data.memberName === 'string') {
    return error.data.memberName;
  }
  return undefined;
}

function createCompoundFailureDiagnostics(compoundName: string, memberName: string | undefined, error: unknown): readonly string[] {
  const diagnostics = [`Compound '${compoundName}' failed while starting member '${memberName ?? 'unknown'}'.`];
  if (error instanceof CliError) {
    diagnostics.push(...error.diagnostics);
  } else if (error instanceof Error) {
    diagnostics.push(error.message);
  }
  return diagnostics;
}

interface DapCliStartConfig {
  config: unknown;
  initialBreakpoints: readonly unknown[];
}

function extractDapCliStartConfig(config: unknown): DapCliStartConfig {
  if (!isRecord(config)) {
    return { config, initialBreakpoints: [] };
  }

  const initialBreakpoints = Array.isArray(config.__dapCliInitialBreakpoints) ? config.__dapCliInitialBreakpoints : [];
  const sanitizedConfig: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(config)) {
    if (key !== '__dapCliInitialBreakpoints') {
      sanitizedConfig[key] = value;
    }
  }

  return { config: sanitizedConfig, initialBreakpoints };
}

function createBeforeConfigurationDoneHook(client: DapClient, initialBreakpoints: readonly unknown[], children?: ChildSessionCoordinator): (() => Promise<void>) | undefined {
  if (initialBreakpoints.length === 0) {
    return undefined;
  }

  return async () => {
    for (const breakpointArgs of initialBreakpoints) {
      await client.request('setBreakpoints', breakpointArgs);
    }
    // Children may not exist yet at hook time (the parent has not yet sent
    // configurationDone), but if they do — or once they do — they need the
    // same initial breakpoints. Hand them to the coordinator which replays
    // them to existing children and remembers them for future ones.
    if (children !== undefined) {
      children.registerInitialBreakpoints(initialBreakpoints);
    }
  };
}

function parseDapRequestParams(params: unknown): { name?: string; command: string; args?: unknown } {
  if (!isRecord(params) || typeof params.command !== 'string') {
    throw usageError('Missing DAP request command.', { code: 'missing_parameter' });
  }

  const requestParams: { name?: string; command: string; args?: unknown } = {
    command: params.command,
  };
  if (typeof params.name === 'string') {
    requestParams.name = params.name;
  }
  if ('args' in params) {
    requestParams.args = params.args;
  }

  return requestParams;
}

function parseEventsRecentParams(params: unknown): { name?: string; options: { afterCursor?: number; limit?: number } } {
  if (!isRecord(params)) {
    return { options: {} };
  }

  const eventParams: { name?: string; options: { afterCursor?: number; limit?: number } } = { options: {} };
  if (typeof params.name === 'string') {
    eventParams.name = params.name;
  }
  if (typeof params.afterCursor === 'number') {
    eventParams.options.afterCursor = params.afterCursor;
  }
  if (typeof params.limit === 'number') {
    eventParams.options.limit = params.limit;
  }

  return eventParams;
}

function getOwnedAdapter(adapter: AdapterRuntime): Partial<OwnedAdapterMetadata> {
  return 'ownedAdapter' in adapter ? adapter.ownedAdapter : { startedByDapCli: false, stderrTail: [] };
}

function getAdapterContext(descriptorId: string, adapter: AdapterRuntime): CliErrorAdapterContext {
  const context: CliErrorAdapterContext = { descriptorId };
  if ('ownedAdapter' in adapter) {
    if (adapter.ownedAdapter.pid !== undefined) {
      context.pid = adapter.ownedAdapter.pid;
    }
    if (adapter.ownedAdapter.stderrTail.length > 0) {
      context.stderrTail = adapter.ownedAdapter.stderrTail;
    }
    if (adapter.ownedAdapter.logPath !== undefined) {
      context.logPath = adapter.ownedAdapter.logPath;
    }
  }

  return context;
}

function toDapCliError(error: unknown, context: { sessionId: string; adapter: CliErrorAdapterContext; request?: CliErrorRequestContext; staleSession?: { sessionRef: string; status?: string } }): CliError {
  if (error instanceof DapLifecycleHandshakeTimeoutError) {
    return adapterError(error.message, withDapContext({
      code: 'lifecycle_handshake_timeout',
      diagnostics: [
        `Adapter did not respond to ${error.stage} within ${error.timeoutMs}ms.`,
        'The session was abandoned and the controller remains running.',
        'Inspect adapter stderr or log path for clues.',
      ],
    }, context));
  }

  if (error instanceof DapResponseError) {
    if (error.message.includes('timed out')) {
      return timeoutError(error.message, {
        code: 'dap_request_timeout',
        diagnostics: [`DAP request timed out: ${error.command}. Check adapter health and retry.`],
        sessionId: context.sessionId,
        request: { command: error.command, seq: error.requestSeq },
        adapter: context.adapter,
      });
    }

    // Round 3 follow-up (gap H-7b): the controller's own paused-state gate
    // (`assertThreadPausedIfRequired`) only fires when we have proof the
    // thread is running (`paused === false`). When the projection is
    // `undefined` (no stopped event observed yet) the request is forwarded
    // and the adapter typically rejects it with a "Thread … not paused"
    // string. Surface that as the structured `thread_not_paused` error so
    // the recovery hint points users at `events --include stopped` instead
    // of the generic `dap_request_failed` envelope.
    if (PAUSED_REQUIRED_DAP_COMMANDS.has(error.command) && /not paused/i.test(error.message)) {
      return threadNotPaused({
        sessionId: context.sessionId,
        ...(context.staleSession?.sessionRef !== undefined ? { sessionName: context.staleSession.sessionRef } : {}),
        command: error.command,
      });
    }

    return dapError(error.message, {
      code: 'dap_request_failed',
      diagnostics: createDapResponseDiagnostics(error),
      sessionId: context.sessionId,
      request: { command: error.command, seq: error.requestSeq },
      adapter: context.adapter,
    });
  }

  if (error instanceof DapTransportClosedError) {
    const stale = context.staleSession;
    const diagnostics: string[] = [
      'The adapter transport closed before dap-cli received the expected DAP response.',
      `Session ${context.sessionId} may be stale or the debuggee may have exited.`,
    ];
    if (stale?.status !== undefined) {
      diagnostics.push(`Last-known session status: ${stale.status}.`);
    }
    if (context.adapter.logPath !== undefined) {
      diagnostics.push(`Adapter log: ${context.adapter.logPath}.`);
    }
    diagnostics.push(`Run \`dap-cli close ${stale?.sessionRef ?? context.sessionId}\` and relaunch the session.`);
    return adapterError(error.message, withDapContext({
      code: 'adapter_transport_closed',
      diagnostics,
    }, context));
  }

  if (error instanceof CliError) {
    return error;
  }

  return adapterError(error instanceof Error ? error.message : 'Adapter request failed.', withDapContext({
    code: 'adapter_request_failed',
    diagnostics: ['The adapter failed while processing the DAP request. Check adapter stderr and log path.'],
  }, context));
}

function createDapResponseDiagnostics(error: DapResponseError): string[] {
  const diagnostics = [`DAP request failed: ${error.command}. Inspect adapter diagnostics and session state.`];
  const responseDetail = extractDapResponseDetail(error.responseBody);
  if (responseDetail !== undefined && responseDetail !== error.message) {
    diagnostics.push(`Adapter detail: ${responseDetail}`);
  }
  return diagnostics;
}

function extractDapResponseDetail(body: unknown): string | undefined {
  if (!isRecord(body)) {
    return undefined;
  }

  if (typeof body.message === 'string' && body.message.trim().length > 0) {
    return body.message.trim();
  }

  const error = body.error;
  if (!isRecord(error)) {
    return undefined;
  }
  if (typeof error.format === 'string' && error.format.trim().length > 0) {
    return error.format.trim();
  }
  if (typeof error.message === 'string' && error.message.trim().length > 0) {
    return error.message.trim();
  }
  return undefined;
}

function toControllerErrorPayload(error: CliError): ControllerFailureResponse['error'] {
  const payload: ControllerFailureResponse['error'] = {
    code: error.code,
    message: error.message,
    category: error.category,
    exitCode: error.exitCode,
    diagnostics: error.diagnostics,
  };
  if (error.sessionId !== undefined) {
    payload.sessionId = error.sessionId;
  }
  if (error.request !== undefined) {
    payload.request = error.request;
  }
  if (error.adapter !== undefined) {
    payload.adapter = error.adapter;
  }
  if (error.data !== undefined) {
    payload.data = error.data;
  }

  return payload;
}

function createMissingRuntimeDiagnostics(status: SessionStatus): readonly string[] {
  const diagnostics = [
    `Session ${status.id} (${status.name}) is recorded as ${status.status}, but this controller has no attached DAP runtime for it.`,
    'Run `dap-cli cleanup --purge` to remove stale session state, or relaunch the debug session and retry with the new session ID.',
  ];
  if (status.logPath !== undefined) {
    diagnostics.push(`Adapter log: ${status.logPath}`);
  }
  if (status.stderrTail.length > 0) {
    diagnostics.push(`Adapter stderr tail: ${status.stderrTail.join('\n')}`);
  }

  return diagnostics;
}

function createDapErrorContext(context: { sessionId: string; adapter: CliErrorAdapterContext; request?: CliErrorRequestContext | undefined }): { sessionId: string; adapter: CliErrorAdapterContext; request?: CliErrorRequestContext } {
  const normalized: { sessionId: string; adapter: CliErrorAdapterContext; request?: CliErrorRequestContext } = {
    sessionId: context.sessionId,
    adapter: context.adapter,
  };
  if (context.request !== undefined) {
    normalized.request = context.request;
  }

  return normalized;
}

function withDapContext(options: CliErrorOptions, context: { sessionId: string; adapter: CliErrorAdapterContext; request?: CliErrorRequestContext }): CliErrorOptions {
  const enriched: CliErrorOptions = {
    ...options,
    sessionId: context.sessionId,
    adapter: context.adapter,
  };
  if (context.request !== undefined) {
    enriched.request = context.request;
  }

  return enriched;
}

function getOptionalStringParam(params: unknown, key: string): string | undefined {
  if (!isRecord(params) || !(key in params)) {
    return undefined;
  }

  const value = params[key];
  return typeof value === 'string' ? value : undefined;
}

function getRequiredStringParam(params: unknown, key: string): string {
  const value = getOptionalStringParam(params, key);
  if (value === undefined) {
    throw usageError(`Missing required parameter: ${key}`, { code: 'missing_parameter' });
  }

  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/**
 * Phase 16-01 (PYEVAL-01): on a debugpy `evaluate`, detect statement-shaped
 * Python and rewrite `args.expression` to `exec("…")` so the call doesn't
 * trip debugpy's expression-only `evaluate` rule. Honors a request-level
 * opt-out via `args.context === 'no-auto-wrap'` (the token is stripped
 * from the forwarded args so debugpy doesn't reject an unknown context).
 *
 * Returns `undefined` for any non-debugpy / non-evaluate / malformed-args
 * path so the caller falls through to the original args. When this returns
 * a value, `originalExpression` is the caller's untouched expression so
 * the SyntaxError-fallback path can recover the recipe regardless of
 * whether we wrapped.
 */
function maybePythonEvaluateRewrite(
  adapterId: string,
  requestParams: { command: string; args?: unknown },
): { forwardArgs: Record<string, unknown>; originalExpression: string } | undefined {
  if (requestParams.command !== 'evaluate' || adapterId !== 'debugpy') {
    return undefined;
  }
  if (!isRecord(requestParams.args)) {
    return undefined;
  }
  const expression = requestParams.args.expression;
  if (typeof expression !== 'string' || expression.length === 0) {
    return undefined;
  }
  const forwardArgs: Record<string, unknown> = { ...requestParams.args };
  if (requestParams.args.context === 'no-auto-wrap') {
    forwardArgs.context = undefined;
    return { forwardArgs, originalExpression: expression };
  }
  if (looksLikePythonStatement(expression)) {
    forwardArgs.expression = wrapForExec(expression);
  }
  return { forwardArgs, originalExpression: expression };
}

function hasTruthyCapability(capabilities: unknown, capability: string): boolean {
  return isRecord(capabilities) && Boolean(capabilities[capability]);
}

function isImplementedDapRequestMethod(method: string): boolean {
  return method === 'dap.start' || method === 'dap.startCompound' || method === 'dap.request' || method === 'dap.capabilities' || method === 'events.recent' || method === 'events.list' || method === 'sessions.breakpoints.list' || method === 'sessions.breakpoints.clear';
}

export async function startControllerServer(options: StartControllerServerOptions = {}): Promise<ControllerServer> {
  const server = new ControllerServer(options);
  await server.start();
  return server;
}

function writeResponse(socket: net.Socket, response: ControllerResponse<unknown> | ControllerFailureResponse): void {
  socket.write(`${JSON.stringify(response)}\n`);
}

function malformedResponse(id: string, message: string): ControllerFailureResponse {
  return {
    id,
    ok: false,
    error: {
      code: 'malformed_request',
      message,
    },
  };
}

function extractRequestId(value: unknown): string {
  if (typeof value === 'object' && value !== null && 'id' in value && typeof value.id === 'string') {
    return value.id;
  }

  return 'unknown';
}
