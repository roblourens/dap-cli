import type net from 'node:net';
import { parseAdapterDescriptor, type AdapterDescriptor } from '../adapters/descriptor.js';
import { startProcessAdapter, type StartedProcessAdapter } from '../adapters/processAdapter.js';
import { connectSocketAdapter, type ConnectedSocketAdapter } from '../adapters/socketAdapter.js';
import { adapterError, CliError, dapError, timeoutError, usageError, type CliErrorAdapterContext, type CliErrorOptions, type CliErrorRequestContext } from '../cli/errors.js';
import { DapClient, DapResponseError, DapTransportClosedError } from '../protocol/dapClient.js';
import { DapEventCache } from '../protocol/eventCache.js';
import { DapLifecycleController } from '../protocol/lifecycle.js';
import type { DapTransport } from '../protocol/transport.js';
import { SessionManager } from '../sessions/sessionManager.js';
import type { OwnedAdapterMetadata, SessionStatus } from '../sessions/session.js';
import { controllerRequestSchema, type ControllerFailureResponse, type ControllerRequest, type ControllerResponse } from './requests.js';
import { createControllerServerSocket, removeControllerDiscovery, writeControllerDiscovery, type ControllerDiscovery, type ControllerEndpoint } from './ipc.js';

export interface StartControllerServerOptions {
  dapCliHome?: string | undefined;
}

export interface ControllerStatus {
  pid: number;
  endpoint: ControllerEndpoint;
  stateDir: string;
  logDir: string;
  uptimeMs: number;
  sessionCount: number;
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

  public constructor(private readonly options: StartControllerServerOptions = {}) {
    this.closedPromise = new Promise(resolve => {
      this.resolveClosed = resolve;
    });
  }

  public get closed(): Promise<void> {
    return this.closedPromise;
  }

  public async start(): Promise<ControllerDiscovery> {
    const socket = await createControllerServerSocket(clientSocket => this.handleConnection(clientSocket), this.options);
    this.server = socket.server;
    this.sessionManager = await SessionManager.create({ dapCliHome: this.options.dapCliHome });
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

    for (const runtime of this.runtimes.values()) {
      await runtime.lifecycle.disconnect().catch(() => undefined);
      await runtime.client.close().catch(() => undefined);
      await runtime.adapter.close().catch(() => undefined);
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

    if (request.method === 'controller.shutdown') {
      return {
        id: request.id,
        ok: true,
        result: { stopped: true },
      };
    }

    try {
      const dapResult = await this.handleDapRequest(request);
      if (dapResult !== undefined) {
        return {
          id: request.id,
          ok: true,
          result: dapResult,
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
    };
  }

  private async handleSessionRequest(request: ControllerRequest): Promise<unknown> {
    const manager = this.sessionManager;
    if (manager === undefined) {
      throw new Error('Session manager has not started.');
    }

    if (request.method === 'sessions.list') {
      return manager.list();
    }
    if (request.method === 'sessions.status') {
      return manager.status(getOptionalStringParam(request.params, 'name'));
    }
    if (request.method === 'sessions.target' || request.method === 'sessions.use') {
      return manager.targetSession(getRequiredStringParam(request.params, 'name'));
    }
    if (request.method === 'sessions.stop') {
      const target = getOptionalStringParam(request.params, 'name');
      await this.disconnectRuntimeForTarget(target);
      return manager.stopSession(target);
    }
    if (request.method === 'sessions.detach') {
      const target = getOptionalStringParam(request.params, 'name');
      await this.disconnectRuntimeForTarget(target);
      return manager.detachSession(target);
    }
    if (request.method === 'sessions.close') {
      return manager.closeSession(getOptionalStringParam(request.params, 'name'));
    }
    if (request.method === 'sessions.cleanup') {
      return manager.cleanupSessions();
    }

    return undefined;
  }

  private async handleDapRequest(request: ControllerRequest): Promise<unknown> {
    if (request.method === 'dap.start') {
      return this.startDapSession(request.params);
    }
    if (request.method === 'dap.request') {
      return this.routeDapRequest(request.params);
    }
    if (request.method === 'events.recent' || request.method === 'events.list') {
      return this.recentEvents(request.params);
    }

    return undefined;
  }

  private async startDapSession(params: unknown): Promise<DapStartResult> {
    const manager = this.requireSessionManager();
    const discovery = this.requireDiscovery();
    const startParams = parseDapStartParams(params);
    const descriptor = parseAdapterDescriptor(startParams.descriptor);
    const adapter = await this.startAdapter(descriptor, discovery.logDir);
    const session = await manager.create({
      name: startParams.name,
      adapter: descriptor.id,
      lifecycle: 'adapterStarting',
      makeActive: startParams.use,
      ownedAdapter: getOwnedAdapter(adapter),
    });
    const client = new DapClient(adapter.transport, { requestTimeoutMs: 5_000 });
    const lifecycle = new DapLifecycleController(client);
    const eventCache = new DapEventCache();

    client.onEvent(event => {
      eventCache.append(session.id, event);
      if (event.event === 'stopped') {
        void manager.updateLifecycle(session.id, 'stopped');
      } else if (event.event === 'continued') {
        void manager.updateLifecycle(session.id, 'running');
      } else if (event.event === 'terminated') {
        void manager.updateLifecycle(session.id, 'terminated');
      }
    });

    this.runtimes.set(session.id, { sessionId: session.id, name: session.name, adapterId: descriptor.id, client, lifecycle, eventCache, adapter });
    let startResult: Awaited<ReturnType<DapLifecycleController['start']>>;
    try {
      startResult = await lifecycle.start({ mode: startParams.mode });
    } catch (error) {
      await manager.updateLifecycle(session.id, 'failed').catch(() => undefined);
      await client.close().catch(() => undefined);
      await adapter.close().catch(() => undefined);
      this.runtimes.delete(session.id);
      throw toDapCliError(error, createDapErrorContext({
        sessionId: session.id,
        adapter: getAdapterContext(descriptor.id, adapter),
        request: client.lastRequest,
      }));
    }
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
    try {
      return await runtime.client.request(requestParams.command, requestParams.args);
    } catch (error) {
      throw toDapCliError(error, {
        sessionId: runtime.sessionId,
        adapter: getAdapterContext(runtime.adapterId, runtime.adapter),
        request: runtime.client.lastRequest ?? { command: requestParams.command },
      });
    }
  }

  private recentEvents(params: unknown): EventsRecentResult {
    const eventParams = parseEventsRecentParams(params);
    const runtime = this.resolveRuntime(eventParams.name);
    const snapshot = runtime.eventCache.recent(eventParams.options);
    return {
      sessionId: runtime.sessionId,
      name: runtime.name,
      events: snapshot.events,
      cursor: snapshot.cursor,
      dropped: snapshot.droppedBeforeCursor ?? 0,
    };
  }

  private async startAdapter(descriptor: AdapterDescriptor, logDir: string): Promise<AdapterRuntime> {
    if (descriptor.transport.kind === 'stdio') {
      return startProcessAdapter({ descriptor: descriptor.transport, adapterId: descriptor.id, logDir });
    }

    return connectSocketAdapter(descriptor.id, descriptor.transport);
  }

  private resolveRuntime(target: string | undefined): DapSessionRuntime {
    const status = this.requireSessionManager().status(target);
    const runtime = this.runtimes.get(status.id);
    if (runtime === undefined) {
      throw usageError(`No DAP runtime is attached to session ${status.id}.`, { code: 'session_unavailable' });
    }

    return runtime;
  }

  private async disconnectRuntimeForTarget(target: string | undefined): Promise<void> {
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

    await runtime.lifecycle.disconnect().catch(() => undefined);
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
}

type AdapterRuntime = (StartedProcessAdapter | ConnectedSocketAdapter) & { transport: DapTransport };

interface DapSessionRuntime {
  sessionId: string;
  name: string;
  adapterId: string;
  client: DapClient;
  lifecycle: DapLifecycleController;
  eventCache: DapEventCache;
  adapter: AdapterRuntime;
}

interface DapStartResult {
  sessionId: string;
  name: string;
  lifecycle: string;
  capabilities: unknown;
  eventCursor: number;
}

interface EventsRecentResult {
  sessionId: string;
  name: string;
  events: unknown;
  cursor: number;
  dropped: number;
}

function parseDapStartParams(params: unknown): { mode: 'launch' | 'attach'; name: string; use: boolean; descriptor: unknown } {
  if (!isRecord(params)) {
    throw usageError('Missing DAP start parameters.', { code: 'missing_parameter' });
  }

  const mode = params.mode;
  const name = params.name;
  return {
    mode: mode === 'attach' ? 'attach' : 'launch',
    name: typeof name === 'string' && name.length > 0 ? name : 'default',
    use: params.use !== false,
    descriptor: params.descriptor,
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

function toDapCliError(error: unknown, context: { sessionId: string; adapter: CliErrorAdapterContext; request?: CliErrorRequestContext }): CliError {
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

    return dapError(error.message, {
      code: 'dap_request_failed',
      diagnostics: [`DAP request failed: ${error.command}. Inspect adapter diagnostics and session state.`],
      sessionId: context.sessionId,
      request: { command: error.command, seq: error.requestSeq },
      adapter: context.adapter,
    });
  }

  if (error instanceof DapTransportClosedError) {
    return adapterError(error.message, withDapContext({
      code: 'adapter_transport_closed',
      diagnostics: ['The adapter transport closed before dap-cli received the expected DAP response. Check adapter stderr and log path.'],
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

  return payload;
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
