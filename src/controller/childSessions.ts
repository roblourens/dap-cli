import type { DapEventCache } from '../protocol/eventCache.js';
import { breakpointBindingGuidance, threadNotPaused } from './diagnostics.js';
import type { DapEventMessage } from '../protocol/dapMessages.js';
import type { DapTransport } from '../protocol/transport.js';
import { DapClient, type ReverseRequestResult } from '../protocol/dapClient.js';
import { sessionError } from '../cli/errors.js';
import type { OwnedAdapterMetadata, SessionId } from '../sessions/session.js';
import type { SessionManager } from '../sessions/sessionManager.js';
import { derivePausedStateFromStopped } from './pausedState.js';

export type OpenChildTransport = (name: string) => Promise<DapTransport>;
export type CreateChildClient = (transport: DapTransport) => DapClient;

export interface ChildSessionCoordinatorOptions {
  parentSessionId: SessionId;
  parentName: string;
  parentClient: DapClient;
  adapterId: string;
  ownedAdapter: OwnedAdapterMetadata;
  sessionManager: SessionManager;
  parentEventCache: DapEventCache;
  openChildTransport: OpenChildTransport;
  /** Test seam — defaults to `transport => new DapClient(transport, { requestTimeoutMs: 30_000 })`. */
  createChildClient?: CreateChildClient;
  /**
   * Override the verification timeout for js-debug `setBreakpoints`. Defaults
   * to 5_000ms. Tests use a small value so the verification-timeout path runs
   * fast. See {@link ChildSessionCoordinator.routeSetBreakpointsThroughParent}.
   */
  setBreakpointsVerificationTimeoutMs?: number;
}

interface ChildRuntime {
  sessionId: SessionId;
  /** Registered SessionRecord name (e.g. `smoke-node#abc123`). User-visible. */
  sessionName: string;
  childIndex: number;
  client: DapClient;
  /**
   * Real thread ids known to live on this child. Populated from
   * (a) every `threads` response, (b) DAP `thread` events
   * (`reason: 'started'` adds, `reason: 'exited'` removes), and
   * (c) `stopped` event `threadId` (additive — paused threads must be
   * discoverable). Used by {@link ChildSessionCoordinator.findChildOwningThread}
   * to route thread-scoped commands by REAL child thread id (no remap).
   */
  knownThreadIds: Set<number>;
  /** Most recently observed `name` per thread id (filled from `threads` responses). */
  threadNames: Map<number, string>;
  /** frameIds that came from this child (so stack/scopes/variables route back here). */
  frameIds: Set<number>;
  /** variablesReferences that came from this child. */
  variableReferences: Set<number>;
  /** sourceReferences that came from this child. */
  sourceReferences: Set<number>;
  pendingSetBreakpoints: unknown[];
  /** Resolves once the child adapter emits `initialized`. */
  initializedPromise: Promise<void>;
  initializedSeen: boolean;
  /**
   * Resolves once the child has completed its full handshake (initialize →
   * initialized → setBreakpoints replay → configurationDone → launch/attach
   * response → lifecycle 'running'). Rejects if the child fails before
   * reaching that state. Used by {@link ChildSessionCoordinator.awaitChildrenReady}
   * to gate fan-out commands like `setBreakpoints` on per-child readiness.
   */
  readyPromise: Promise<void>;
  readySeen: boolean;
  resolveReady: () => void;
  rejectReady: (error: unknown) => void;
}

const pausedRequiredRoutedCommands: ReadonlySet<string> = new Set([
  'stackTrace',
  'scopes',
  'variables',
]);

interface InterceptedRequest {
  value: unknown;
}

const ROUTABLE_COMMANDS = new Set([
  'threads',
  'stackTrace',
  'scopes',
  'variables',
  'continue',
  'next',
  'stepIn',
  'stepOut',
  'pause',
  'evaluate',
  'setBreakpoints',
  'source',
  // Plan 05-26 (gap H-3a): goto is threadId-scoped; setVariable is
  // variablesReference-scoped. Both flow through the parent-name routing
  // layer so users never have to type a child name.
  'goto',
  'setVariable',
]);

export class ChildSessionCoordinator {
  private readonly children = new Map<SessionId, ChildRuntime>();
  private childCounter = 0;
  private readonly detachHandlers = new Set<() => void>();
  private readonly bringUps: Promise<unknown>[] = [];
  private readonly activeHandlers: Promise<unknown>[] = [];
  private disposed = false;

  public constructor(private readonly options: ChildSessionCoordinatorOptions) {}

  public attach(): void {
    this.installStartDebuggingHandler(this.options.parentClient);
  }

  /**
   * Install a `startDebugging` reverse-request handler on the given DAP
   * client and remember its detach function so {@link dispose} can clean up.
   *
   * Installed on the **parent** during {@link attach}, AND on every child as
   * it is brought up in {@link handleStartDebugging}. pwa-chrome's session
   * model nests parent → browser-level wrapper → page-level session — without
   * installing the handler on each child, grandchild page sessions are never
   * observed by the controller and `setBreakpoints` fan-out misses the
   * session that actually owns the parsed scripts (returning the
   * DAP-spec-violating `{ breakpoints: [] }` from the wrapper instead).
   *
   * Each client gets its OWN serialization chain so registration order in
   * `this.children` is deterministic per source client. All handler promises
   * are pushed onto `this.activeHandlers` so `awaitPendingChildren()` still
   * observes them regardless of which client originated the request.
   */
  private installStartDebuggingHandler(client: DapClient): () => void {
    let chain: Promise<unknown> = Promise.resolve();
    const detach = client.onReverseRequest(request => {
      if (request.command !== 'startDebugging') {
        return undefined;
      }
      const promise = chain.then(
        () => this.handleStartDebugging(request.arguments),
        () => this.handleStartDebugging(request.arguments),
      );
      chain = promise.then(() => undefined, () => undefined);
      this.activeHandlers.push(promise.then(() => undefined, () => undefined));
      return promise;
    });
    this.detachHandlers.add(detach);
    return detach;
  }

  public hasChildren(): boolean {
    return this.children.size > 0;
  }

  public listChildSessionIds(): readonly SessionId[] {
    return [...this.children.keys()];
  }

  /**
   * Wait for any in-flight child bring-ups initiated via reverse requests.
   * Used by tests to deterministically observe child registration. We yield
   * first so reverse-request messages parsed on the next stream tick get a
   * chance to register their handler promises.
   */
  public async awaitPendingChildren(): Promise<void> {
    await new Promise<void>(resolve => setImmediate(resolve));
    while (this.activeHandlers.length > 0 || this.bringUps.length > 0) {
      const handlers = this.activeHandlers.splice(0, this.activeHandlers.length);
      const ups = this.bringUps.splice(0, this.bringUps.length);
      await Promise.allSettled([...handlers, ...ups]);
      await new Promise<void>(resolve => setImmediate(resolve));
    }
  }

  /**
   * Wait for every currently-known child to finish its handshake (or fail).
   * Uses {@link Promise.allSettled} — "wait for them to settle one way or the
   * other," not "fail if any failed." Callers that need to fan a request out
   * to children (notably `setBreakpoints`) should call this first so children
   * still mid-`configurationDone` are not raced.
   */
  public async awaitChildrenReady(): Promise<void> {
    await this.awaitPendingChildren();
    await Promise.allSettled([...this.children.values()].map(child => child.readyPromise));
  }

  /**
   * Optionally intercept a parent-targeted DAP request when children exist.
   * Returns `undefined` for non-routable commands or when there are no children.
   */
  public async maybeIntercept(command: string, args: unknown): Promise<InterceptedRequest | undefined> {
    if (this.children.size === 0 || !ROUTABLE_COMMANDS.has(command)) {
      return undefined;
    }

    if (command === 'threads') {
      return { value: await this.aggregateThreads() };
    }

    if (command === 'setBreakpoints') {
      // js-debug pwa-chrome: parent owns the provisional bp registry and
      // propagates to children internally. Sending setBreakpoints to a child
      // returns `{breakpoints: []}` (a DAP-spec violation, but observed —
      // direct DAP trace evidence in 05/deferred-items.md). Route to parent
      // and wait for the verifying `breakpoint` event. See 05-15-PLAN.md.
      if (this.options.adapterId === 'js-debug') {
        return { value: await this.routeSetBreakpointsThroughParent(args) };
      }
      return { value: await this.fanOutSetBreakpoints(args) };
    }

    if (command === 'stackTrace') {
      return { value: await this.routeByThreadId('stackTrace', args, /* recordFrames */ true) };
    }

    if (command === 'continue' || command === 'next' || command === 'stepIn' || command === 'stepOut' || command === 'pause' || command === 'goto') {
      return { value: await this.routeByThreadId(command, args, /* recordFrames */ false) };
    }

    if (command === 'scopes') {
      return { value: await this.routeByFrameId(command, args) };
    }

    if (command === 'variables' || command === 'evaluate' || command === 'setVariable') {
      return { value: await this.routeByVariableReference(command, args) };
    }

    if (command === 'source') {
      return { value: await this.routeBySourceReference(command, args) };
    }

    return undefined;
  }

  public async dispose(): Promise<void> {
    this.disposed = true;
    for (const detach of this.detachHandlers) {
      try { detach(); } catch { /* ignore */ }
    }
    this.detachHandlers.clear();
    // Wait for any in-flight reverse-request handlers and child bring-ups so
    // pending session-store persists complete before callers tear down state.
    await this.awaitPendingChildren();
    const closes = [...this.children.values()].map(child => child.client.close().catch(() => undefined));
    this.children.clear();
    await Promise.all(closes);
  }

  /**
   * Historically replayed initial setBreakpoints to every child as it came
   * up. That model is wrong for js-debug pwa-chrome — the parent owns the
   * provisional bp registry and propagates to children internally; sending
   * setBreakpoints to a child returns `{breakpoints: []}`. The parent's
   * before-configurationDone hook in `controller/server.ts` already issues
   * `setBreakpoints` to the parent client, which is sufficient. This method
   * is kept as a no-op so existing callers compile. See 05-15-PLAN.md.
   */
  public registerInitialBreakpoints(_payloads: readonly unknown[]): void {
    // intentional no-op — see method docs.
  }

  private async handleStartDebugging(args: unknown): Promise<ReverseRequestResult> {
    if (!isRecord(args)) {
      return { success: false, message: 'startDebugging arguments must be an object.' };
    }

    const requestMode = args.request === 'launch' ? 'launch' : 'attach';
    const configuration = isRecord(args.configuration) ? args.configuration : {};
    const targetIdSuffix = typeof configuration.__pendingTargetId === 'string'
      ? configuration.__pendingTargetId
      : undefined;
    this.childCounter += 1;
    const childIndex = this.childCounter;
    const childName = targetIdSuffix === undefined
      ? `${this.options.parentName}#${childIndex}`
      : `${this.options.parentName}#${targetIdSuffix}`;

    let transport: DapTransport;
    try {
      transport = await this.options.openChildTransport(childName);
    } catch (error) {
      return { success: false, message: error instanceof Error ? error.message : 'failed to open child transport' };
    }

    const factory = this.options.createChildClient ?? defaultCreateChildClient;
    const client = factory(transport);
    // Install the same startDebugging handler on this new child so any nested
    // startDebugging requests it issues (e.g. pwa-chrome's page-level
    // grandchildren under a browser-level wrapper) bring up further children
    // flat under the same parent. See {@link installStartDebuggingHandler}.
    this.installStartDebuggingHandler(client);

    let registered;
    try {
      registered = await this.options.sessionManager.registerChild({
        parent_session_id: this.options.parentSessionId,
        name: childName,
        adapter: this.options.adapterId,
        lifecycle: 'initializing',
        ownedAdapter: this.options.ownedAdapter,
        makeActive: false,
      });
    } catch (error) {
      await client.close().catch(() => undefined);
      return { success: false, message: error instanceof Error ? error.message : 'registerChild failed' };
    }

    const childId = registered.id;
    let resolveInitialized!: () => void;
    const initializedPromise = new Promise<void>(resolve => { resolveInitialized = resolve; });
    let resolveReady!: () => void;
    let rejectReady!: (error: unknown) => void;
    const readyPromise = new Promise<void>((resolve, reject) => {
      resolveReady = resolve;
      rejectReady = reject;
    });
    // Avoid unhandled-rejection warnings if no caller has awaited
    // `awaitChildrenReady()` before a child fails.
    readyPromise.catch(() => undefined);
    const runtime: ChildRuntime = {
      sessionId: childId,
      sessionName: childName,
      childIndex,
      client,
      knownThreadIds: new Set(),
      threadNames: new Map(),
      frameIds: new Set(),
      variableReferences: new Set(),
      sourceReferences: new Set(),
      pendingSetBreakpoints: [],
      initializedPromise,
      initializedSeen: false,
      readyPromise,
      readySeen: false,
      resolveReady,
      rejectReady,
    };
    this.children.set(childId, runtime);

    // Install initialized-event watcher BEFORE initialize so we never miss the
    // event regardless of when the adapter chooses to emit it.
    client.onEvent(event => {
      if (event.event === 'initialized' && !runtime.initializedSeen) {
        runtime.initializedSeen = true;
        resolveInitialized();
      }
    });
    client.onEvent(event => this.mirrorChildEvent(childId, event));
    // Plan 05-26 (gap H-3a): keep `knownThreadIds` live by observing child
    // `thread` and `stopped` events. The router falls back to a live
    // `threads` request only when no child cache claims the id, so keeping
    // the cache fresh from events keeps the routing fast path snappy.
    client.onEvent(event => {
      if (event.event === 'thread') {
        const body = (event as { body?: { reason?: unknown; threadId?: unknown } }).body;
        const threadId = typeof body?.threadId === 'number' ? body.threadId : undefined;
        if (threadId === undefined) {
          return;
        }
        if (body?.reason === 'exited') {
          runtime.knownThreadIds.delete(threadId);
          runtime.threadNames.delete(threadId);
        } else {
          runtime.knownThreadIds.add(threadId);
        }
      } else if (event.event === 'stopped') {
        const body = (event as { body?: { threadId?: unknown } }).body;
        if (typeof body?.threadId === 'number') {
          runtime.knownThreadIds.add(body.threadId);
        }
      }
    });
    // Plan 05-25 (H-1a/H-1b): mirror child paused-state onto the PARENT
    // record. In js-debug pwa-node/pwa-chrome, `stopped`/`continued`/
    // `terminated` events arrive on the child runtime, but the user's only
    // visible handle is the parent name (children are hidden by default per
    // plan 05-19). Without this mirror, `dap-cli status --name <parent>`
    // never observes paused-state. Fire-and-forget: a torn-down parent
    // surfaces as a swallowed `session_not_found` rather than crashing the
    // child event loop.
    client.onEvent(event => {
      if (event.event === 'stopped') {
        void this.options.sessionManager
          .updatePausedState(this.options.parentSessionId, derivePausedStateFromStopped(event.body))
          .catch(() => undefined);
      } else if (event.event === 'continued' || event.event === 'terminated') {
        void this.options.sessionManager
          .updatePausedState(this.options.parentSessionId, { paused: false })
          .catch(() => undefined);
      }
    });

    try {
      await client.request('initialize', createInitializeArgs(this.options.adapterId));
    } catch (error) {
      await this.markChildFailed(childId, error);
      return { success: false, message: error instanceof Error ? error.message : 'child initialize failed' };
    }

    // Send attach/launch synchronously up to the request being dispatched, but
    // do NOT await its response here — js-debug deadlocks if we keep the
    // reverse request open while the child handshake completes. The remainder
    // of the lifecycle runs in the background; failures surface as a `failed`
    // child SessionRecord plus an `output` event mirrored into the parent's
    // event cache.
    const command = requestMode;
    const config = configuration;
    const lifecyclePromise = this.runChildLifecycle(childId, runtime, command, config);
    this.bringUps.push(lifecyclePromise.catch(() => undefined));

    return { success: true };
  }

  private async runChildLifecycle(childId: SessionId, runtime: ChildRuntime, command: 'attach' | 'launch', config: Record<string, unknown>): Promise<void> {
    const client = runtime.client;
    try {
      await this.options.sessionManager.updateLifecycle(childId, command === 'launch' ? 'launching' : 'attaching').catch(() => undefined);
      // Issue launch/attach but DO NOT await the response here — js-debug (and
      // most DAP servers) hold the launch/attach response until
      // configurationDone is received. We must send configurationDone first.
      const requestPromise = client.request(command, config);
      // Suppress unhandled-rejection in the microtask window before we await.
      requestPromise.catch(() => undefined);
      // Wait for the child's `initialized` event before configurationDone.
      await runtime.initializedPromise;
      // Initial breakpoints land on the parent (which owns pwa-chrome's
      // provisional bp registry); js-debug propagates them to children
      // internally. We do NOT replay setBreakpoints to children — doing so
      // returns `{breakpoints: []}` from the wrong session. See 05-15-PLAN.md.
      await client.request('configurationDone');
      await requestPromise;
      await this.options.sessionManager.updateLifecycle(childId, 'running').catch(() => undefined);
      if (!runtime.readySeen) {
        runtime.readySeen = true;
        runtime.resolveReady();
      }
    } catch (error) {
      await this.markChildFailed(childId, error);
    }
  }

  private async markChildFailed(childId: SessionId, error: unknown): Promise<void> {
    await this.options.sessionManager.updateLifecycle(childId, 'failed').catch(() => undefined);
    const runtime = this.children.get(childId);
    if (runtime !== undefined && !runtime.readySeen) {
      runtime.readySeen = true;
      runtime.rejectReady(error instanceof Error ? error : new Error(String(error)));
    }
    const message = error instanceof Error ? error.message : String(error);
    const synthetic: DapEventMessage = {
      seq: 0,
      type: 'event',
      event: 'output',
      body: {
        category: 'stderr',
        output: `child session ${childId} failed: ${message}\n`,
        child_session_id: childId,
      },
    };
    this.options.parentEventCache.append(this.options.parentSessionId, synthetic);
  }

  private mirrorChildEvent(childId: SessionId, event: DapEventMessage): void {
    const annotated: DapEventMessage = {
      ...event,
      body: { ...((event as { body?: Record<string, unknown> }).body ?? {}), child_session_id: childId },
    };
    this.options.parentEventCache.append(this.options.parentSessionId, annotated);
  }

  private async aggregateThreads(): Promise<{ threads: Array<{ id: number; name: string; sessionName: string }> }> {
    const result: Array<{ id: number; name: string; sessionName: string }> = [];
    for (const child of this.children.values()) {
      let response: { threads?: Array<{ id: number; name: string }> } | undefined;
      try {
        response = await child.client.request<{ threads?: Array<{ id: number; name: string }> }>('threads');
      } catch {
        continue;
      }
      for (const thread of response?.threads ?? []) {
        // Real child thread id preserved end-to-end. `sessionName` (the child
        // SessionRecord name, e.g. `smoke-node#abc123`) disambiguates when
        // two children legitimately own the same id.
        child.knownThreadIds.add(thread.id);
        if (typeof thread.name === 'string') {
          child.threadNames.set(thread.id, thread.name);
        }
        result.push({ id: thread.id, name: thread.name, sessionName: child.sessionName });
      }
    }
    return { threads: result };
  }

  /**
   * Fan a `setBreakpoints` request out to every child. Awaits per-child
   * readiness first ({@link awaitChildrenReady}) so children that are still
   * mid-handshake have a chance to finish before we issue the request — this
   * closes a race where a child appears in `threads` but has not yet processed
   * its own `configurationDone`.
   *
   * Per-child failures are NOT silently swallowed. Each rejected child is
   * reported as a `{ sessionId, message }` entry on a `warnings` array attached
   * to the response. The response shape stays compatible with the DAP
   * `SetBreakpointsResponse` because `warnings` is an additional optional field.
   * If every child failed, we still surface the warnings instead of returning
   * `{ breakpoints: [] }` with no diagnostic.
   */
  private async fanOutSetBreakpoints(args: unknown): Promise<unknown> {
    await this.awaitChildrenReady();
    type ChildBreakpointResponse = { breakpoints?: Array<{ verified?: boolean; id?: number; line?: number }> };
    type ChildResult = { sessionId: SessionId; ok: true; response: ChildBreakpointResponse } | { sessionId: SessionId; ok: false; error: unknown };
    const results: ChildResult[] = await Promise.all(
      [...this.children.values()].map(async (child): Promise<ChildResult> => {
        try {
          const response = await child.client.request<ChildBreakpointResponse>('setBreakpoints', args);
          return { sessionId: child.sessionId, ok: true, response };
        } catch (error) {
          return { sessionId: child.sessionId, ok: false, error };
        }
      }),
    );

    const warnings = results
      .filter((result): result is Extract<ChildResult, { ok: false }> => !result.ok)
      .map(result => ({
        sessionId: result.sessionId,
        message: result.error instanceof Error ? result.error.message : String(result.error),
      }));

    if (results.length === 0) {
      return { breakpoints: [] };
    }

    const successes = results.filter((result): result is Extract<ChildResult, { ok: true }> => result.ok);
    const responsesWithBody = successes.map(result => result.response);
    // Prefer a response whose breakpoints array is non-empty over one that
    // returned `breakpoints: []`. With recursive child registration (plan
    // 05-14) intermediate pwa-chrome wrappers come up as siblings of the
    // page-level session that owns the parsed scripts; the wrapper
    // legitimately returns `[]` because the source isn't loaded there, while
    // the page child returns the real verified array. Picking the first
    // *defined* response would surface the empty wrapper response and mask
    // the page child's result.
    const firstWithBreakpoints = responsesWithBody.find(response => response.breakpoints !== undefined && response.breakpoints.length > 0)
      ?? responsesWithBody.find(response => response.breakpoints !== undefined);

    if (firstWithBreakpoints === undefined) {
      // Every child either failed or returned no `breakpoints` field. Surface
      // warnings (if any) so the caller sees what went wrong instead of an
      // empty success.
      return warnings.length > 0 ? { breakpoints: [], warnings } : { breakpoints: [] };
    }

    const breakpoints = (firstWithBreakpoints.breakpoints ?? []).map((bp, index) => {
      const anyVerified = responsesWithBody.some(response => response.breakpoints?.[index]?.verified === true);
      return { ...bp, verified: anyVerified || bp.verified === true };
    });
    return warnings.length > 0 ? { breakpoints, warnings } : { breakpoints };
  }

  /**
   * js-debug pwa-chrome routing for setBreakpoints. The parent owns the
   * provisional bp registry and propagates internally to children — sending
   * setBreakpoints ONLY to children misses the registry update and races
   * with future child bring-ups (direct DAP trace evidence in
   * `.planning/phases/05-.../deferred-items.md`). We therefore:
   *
   *   1. Subscribe to parent `breakpoint` events BEFORE issuing the request
   *      so we never miss the verifying event.
   *   2. Issue `setBreakpoints` to the parent (primary, per plan 05-15) so
   *      its registry is updated and propagates to current and future
   *      children. The provisional response shape is
   *      `{breakpoints:[{verified:false, message, line, id}]}`.
   *   3. In parallel, fan out to children so we can harvest verification
   *      state directly from any child whose script is already parsed —
   *      this is a deviation from plan 05-15 (which assumed all children
   *      return `[]`), but in practice the page-level child for the
   *      matching script returns `verified:true` synchronously. Children
   *      that legitimately have nothing for this source return `[]` and we
   *      skip them. Per-child failures surface as `warnings` on the
   *      response (Plan 05-09 invariant preserved).
   *   4. For any provisional bps still unverified after the response +
   *      child fan-out, wait up to {@link
   *      ChildSessionCoordinatorOptions.setBreakpointsVerificationTimeoutMs}
   *      (default 3_500ms — kept under the 5s controller IPC timeout in
   *      `controller/client.ts`) for a parent `breakpoint` event with
   *      `verified: true` that matches by id OR by source.path + line.
   *   5. On timeout, return the merged response with
   *      `warnings: [{sessionId, message: 'verification_timeout'}]` so
   *      callers see a diagnostic instead of an opaque false-positive.
   *
   * See 05-15-PLAN.md (and the SUMMARY for the documented deviation).
   */
  private async routeSetBreakpointsThroughParent(args: unknown): Promise<unknown> {
    type Bp = { id?: number; verified?: boolean; line?: number; message?: string; [key: string]: unknown };
    type Response = { breakpoints?: Bp[]; [key: string]: unknown };
    type ChildResult =
      | { sessionId: SessionId; ok: true; response: Response | undefined }
      | { sessionId: SessionId; ok: false; error: unknown };

    const sourcePath = isRecord(args) && isRecord(args.source) && typeof args.source.path === 'string'
      ? args.source.path
      : undefined;

    const verifiedById = new Map<number, Bp>();
    const verifiedByLine = new Map<number, Bp>();
    type Waiter = { resolve: () => void };
    const waiters = new Set<Waiter>();
    const notifyWaiters = (): void => {
      for (const waiter of waiters) {
        waiter.resolve();
      }
      waiters.clear();
    };

    const recordVerifiedEvent = (bp: Record<string, unknown>): void => {
      if (bp.verified !== true) {
        return;
      }
      const eventSource = isRecord(bp.source) && typeof bp.source.path === 'string' ? bp.source.path : undefined;
      const lineMatches = sourcePath === undefined || eventSource === undefined || sourceMatches(eventSource, sourcePath);
      if (typeof bp.id === 'number') {
        verifiedById.set(bp.id, bp);
      }
      if (typeof bp.line === 'number' && lineMatches) {
        verifiedByLine.set(bp.line, bp);
      }
    };

    // Seed from the parent event cache so prior verifying events don't
    // get missed (e.g. the script was parsed before this call).
    const recentEvents = this.options.parentEventCache.recent().events;
    for (const cached of recentEvents) {
      if (cached.event !== 'breakpoint') {
        continue;
      }
      const body = (cached as { body?: { breakpoint?: unknown } }).body;
      const bp = body?.breakpoint;
      if (isRecord(bp)) {
        recordVerifiedEvent(bp);
      }
    }

    const detach = this.options.parentClient.onEvent(event => {
      if (event.event !== 'breakpoint') {
        return;
      }
      const body = (event as { body?: { breakpoint?: unknown } }).body;
      const bp = body?.breakpoint;
      if (isRecord(bp)) {
        recordVerifiedEvent(bp);
        notifyWaiters();
      }
    });

    let timer: NodeJS.Timeout | undefined;
    try {
      // Issue parent setBreakpoints to update its provisional bp registry.
      // Per direct DAP trace evidence, the parent must be told even though
      // its response is provisional — it owns propagation to current and
      // future children.
      const parentRequest = this.options.parentClient.request<Response>('setBreakpoints', args);
      parentRequest.catch(() => undefined);

      // Also fan out to existing children for verification info — the
      // page-level child whose script is parsed returns a real verified
      // response synchronously, which is the most reliable signal we have.
      // This is a deviation from plan 05-15 (which assumed children always
      // return `[]`); in practice the page child returns the real array.
      // Per-child failures surface as warnings.
      let childResults: ChildResult[] = [];
      if (this.children.size > 0) {
        await this.awaitChildrenReady();
        childResults = await Promise.all(
          [...this.children.values()].map(async (child): Promise<ChildResult> => {
            try {
              const response = await child.client.request<Response>('setBreakpoints', args);
              return { sessionId: child.sessionId, ok: true, response };
            } catch (error) {
              return { sessionId: child.sessionId, ok: false, error };
            }
          }),
        );
      }

      const parentResponse = await parentRequest;
      const parentBps: Bp[] = parentResponse?.breakpoints ?? [];

      type BreakpointWarning = { sessionId: SessionId; message: string; diagnostics?: string[] };
      const childWarnings: BreakpointWarning[] = childResults
        .filter((result): result is Extract<ChildResult, { ok: false }> => !result.ok)
        .map(result => ({
          sessionId: result.sessionId,
          message: result.error instanceof Error ? result.error.message : String(result.error),
        }));

      // Index-based child verification: response.breakpoints[i] corresponds
      // to args.breakpoints[i]. The parent's provisional response often
      // omits `line` (only id+verified+message), so id/line matching fails
      // — index is the contract DAP guarantees.
      const childVerifiedByIndex = new Map<number, Bp>();
      for (const result of childResults) {
        if (!result.ok) {
          continue;
        }
        const bps = result.response?.breakpoints ?? [];
        bps.forEach((bp, index) => {
          if (bp.verified === true && !childVerifiedByIndex.has(index)) {
            childVerifiedByIndex.set(index, bp);
          }
        });
      }

      const provisional: { index: number; bp: Bp }[] = [];
      parentBps.forEach((bp, index) => {
        if (bp.verified !== true) {
          provisional.push({ index, bp });
        }
      });

      const timeoutMs = this.options.setBreakpointsVerificationTimeoutMs ?? 3_500;
      const matchProvisional = (bp: Bp, index: number): Bp | undefined => {
        if (childVerifiedByIndex.has(index)) {
          return childVerifiedByIndex.get(index);
        }
        if (typeof bp.id === 'number' && verifiedById.has(bp.id)) {
          return verifiedById.get(bp.id);
        }
        if (typeof bp.line === 'number' && verifiedByLine.has(bp.line)) {
          return verifiedByLine.get(bp.line);
        }
        return undefined;
      };

      const allMatched = (): boolean => provisional.every(({ bp, index }) => matchProvisional(bp, index) !== undefined);

      if (!allMatched()) {
        const timeoutPromise = new Promise<'timeout'>(resolve => {
          timer = setTimeout(() => resolve('timeout'), timeoutMs);
        });
        while (!allMatched()) {
          const wakePromise = new Promise<'wake'>(resolve => {
            waiters.add({ resolve: () => resolve('wake') });
          });
          const winner = await Promise.race([timeoutPromise, wakePromise]);
          if (winner === 'timeout') {
            break;
          }
        }
      }

      const merged: Bp[] = parentBps.map((bp, index) => {
        const match = matchProvisional(bp, index);
        if (match === undefined) {
          return bp;
        }
        const { message: _provisionalMessage, ...rest } = bp;
        void _provisionalMessage;
        return { ...rest, ...match, verified: true };
      });

      const allVerified = merged.every(bp => bp.verified === true);
      const warnings = [...childWarnings];
      if (!allVerified) {
        warnings.push({
          sessionId: this.options.parentSessionId,
          message: 'verification_timeout',
          diagnostics: breakpointBindingGuidance({ sourcePath, adapterId: this.options.adapterId }),
        });
      }

      const result: Record<string, unknown> = { ...(parentResponse ?? {}), breakpoints: merged };
      if (warnings.length > 0) {
        result.warnings = warnings;
      }
      return result;
    } finally {
      if (timer !== undefined) {
        clearTimeout(timer);
      }
      detach();
    }
  }

  private async routeByThreadId(command: string, args: unknown, recordFrames: boolean): Promise<unknown> {
    const threadId = isRecord(args) && typeof args.threadId === 'number' ? args.threadId : undefined;
    if (threadId === undefined) {
      // Plan 05-26 (gap H-3a): structured `thread_id_required` error so JSON
      // consumers can list every thread known across children without
      // re-querying. The error code string is intentional contract; do not
      // rename without updating consumers in tests/cli/sessionCommands.test.ts.
      throw sessionError(`A thread id is required for '${command}'.`, {
        code: 'thread_id_required',
        diagnostics: [
          `'${command}' requires --thread-id when the named session has children.`,
          'Run `dap-cli threads --name <parent>` to list available thread ids.',
        ],
        data: { availableThreads: this.listAvailableThreads() },
      });
    }
    const child = await this.findChildOwningThread(threadId);
    if (child === undefined) {
      throw sessionError(`No child session owns thread ${threadId}.`, {
        code: 'thread_not_owned',
        diagnostics: [
          `Thread ${threadId} is not known to any child of this parent session.`,
          'Run `dap-cli threads --name <parent>` to list available thread ids.',
        ],
        data: { requestedThreadId: threadId, availableThreads: this.listAvailableThreads() },
      });
    }
    // Real child thread id forwarded unchanged — no remap.
    let response: unknown;
    try {
      response = await child.client.request<unknown>(command, args);
    } catch (error) {
      this.normalizeChildRequestError(command, error);
    }
    if (recordFrames && isRecord(response)) {
      const frames = Array.isArray(response.stackFrames) ? response.stackFrames : [];
      for (const frame of frames) {
        if (isRecord(frame) && typeof frame.id === 'number') {
          child.frameIds.add(frame.id);
        }
        if (isRecord(frame) && isRecord(frame.source) && typeof frame.source.sourceReference === 'number' && frame.source.sourceReference > 0) {
          child.sourceReferences.add(frame.source.sourceReference);
        }
      }
    }
    return response;
  }

  private async routeByFrameId(command: string, args: unknown): Promise<unknown> {
    const frameId = isRecord(args) && typeof args.frameId === 'number' ? args.frameId : undefined;
    if (frameId === undefined) {
      throw new Error(`${command} requires frameId.`);
    }
    const child = this.findChildByFrameId(frameId);
    if (child === undefined) {
      throw new Error(`No child session owns frame ${frameId}.`);
    }
    let response: unknown;
    try {
      response = await child.client.request<unknown>(command, args);
    } catch (error) {
      this.normalizeChildRequestError(command, error);
    }
    if (isRecord(response)) {
      const scopes = Array.isArray(response.scopes) ? response.scopes : [];
      for (const scope of scopes) {
        if (isRecord(scope) && typeof scope.variablesReference === 'number' && scope.variablesReference > 0) {
          child.variableReferences.add(scope.variablesReference);
        }
      }
    }
    return response;
  }

  private async routeByVariableReference(command: string, args: unknown): Promise<unknown> {
    const reference = isRecord(args) && typeof args.variablesReference === 'number'
      ? args.variablesReference
      : isRecord(args) && typeof args.frameId === 'number'
        ? undefined // evaluate may use frameId
        : undefined;
    let child: ChildRuntime | undefined;
    if (reference !== undefined) {
      child = this.findChildByVariableReference(reference);
    } else if (isRecord(args) && typeof args.frameId === 'number') {
      child = this.findChildByFrameId(args.frameId);
    } else if (command === 'evaluate') {
      // Plan 05-26 (gap H-3a): top-level `evaluate` (no frameId, no
      // variablesReference) is the hand-driven user pattern — they want to
      // evaluate against the currently-paused child without first calling
      // `threads`/`stack` to obtain a frame. Fall back to the first child
      // that has any known thread (i.e., is currently active). For
      // pwa-node single-child this is unambiguous; for pwa-chrome
      // multi-child the deterministic Map iteration order picks the first
      // registered child. Users who need an explicit frame can still pass
      // `--frame-id`.
      for (const candidate of this.children.values()) {
        if (candidate.knownThreadIds.size > 0) {
          child = candidate;
          break;
        }
      }
    }
    if (child === undefined) {
      throw new Error(`No child session owns ${command} target.`);
    }
    let response: unknown;
    try {
      response = await child.client.request<unknown>(command, args);
    } catch (error) {
      this.normalizeChildRequestError(command, error);
    }
    if (isRecord(response)) {
      const variables = Array.isArray(response.variables) ? response.variables : [];
      for (const variable of variables) {
        if (isRecord(variable) && typeof variable.variablesReference === 'number' && variable.variablesReference > 0) {
          child.variableReferences.add(variable.variablesReference);
        }
      }
    }
    return response;
  }

  private normalizeChildRequestError(command: string, error: unknown): never {
    if (pausedRequiredRoutedCommands.has(command) && error instanceof Error && /not paused/i.test(error.message)) {
      throw threadNotPaused({ sessionId: this.options.parentSessionId, sessionName: this.options.parentName, command });
    }
    throw error;
  }

  private async routeBySourceReference(command: string, args: unknown): Promise<unknown> {
    const reference = isRecord(args) && isRecord(args.source) && typeof args.source.sourceReference === 'number'
      ? args.source.sourceReference
      : undefined;
    if (reference === undefined) {
      throw new Error('source requires source.sourceReference.');
    }
    const child = this.findChildBySourceReference(reference);
    if (child === undefined) {
      throw new Error(`No child session owns source reference ${reference}.`);
    }
    return child.client.request<unknown>(command, args);
  }

  /**
   * Find the child whose REAL thread id list contains `threadId`. Two-stage
   * lookup so the fast path is O(children) cache hits and the cold path
   * (worker spawned mid-session, before any `threads` request observed it)
   * still resolves via a parallel live `threads` fan-out. Iterates
   * `this.children` LIVE so a worker registered between command parse and
   * lookup is observed.
   *
   * Deterministic: returns the FIRST child whose cache claims the id
   * (Map iteration order = insertion order). When two children legitimately
   * own the same id, the user can disambiguate via the `sessionName`
   * surfaced by {@link aggregateThreads}.
   */
  private async findChildOwningThread(threadId: number): Promise<ChildRuntime | undefined> {
    for (const child of this.children.values()) {
      if (child.knownThreadIds.has(threadId)) {
        return child;
      }
    }
    // Cold path: cache miss. Fan out live `threads` requests to refresh
    // every child cache, then re-check. Bounded by live child count (1 for
    // pwa-node, 1–3 for pwa-chrome) and the per-request timeout configured
    // on each child's DapClient (30s, see defaultCreateChildClient).
    const refreshes = [...this.children.values()].map(async child => {
      try {
        const response = await child.client.request<{ threads?: Array<{ id: number; name: string }> }>('threads');
        for (const thread of response?.threads ?? []) {
          child.knownThreadIds.add(thread.id);
          if (typeof thread.name === 'string') {
            child.threadNames.set(thread.id, thread.name);
          }
        }
      } catch {
        // Per-child failure ignored — the next child may still claim the id.
      }
    });
    await Promise.allSettled(refreshes);
    for (const child of this.children.values()) {
      if (child.knownThreadIds.has(threadId)) {
        return child;
      }
    }
    return undefined;
  }

  /**
   * Snapshot of every cached child thread id, used by error payloads to
   * tell the user where to look. Does NOT trigger a live refresh — the
   * error path must be snappy.
   */
  private listAvailableThreads(): Array<{ sessionName: string; sessionId: SessionId; threadId: number; name?: string }> {
    const result: Array<{ sessionName: string; sessionId: SessionId; threadId: number; name?: string }> = [];
    for (const child of this.children.values()) {
      for (const threadId of child.knownThreadIds) {
        const name = child.threadNames.get(threadId);
        result.push({
          sessionName: child.sessionName,
          sessionId: child.sessionId,
          threadId,
          ...(name !== undefined ? { name } : {}),
        });
      }
    }
    return result;
  }

  private findChildByFrameId(frameId: number): ChildRuntime | undefined {
    for (const child of this.children.values()) {
      if (child.frameIds.has(frameId)) {
        return child;
      }
    }
    return undefined;
  }

  private findChildByVariableReference(reference: number): ChildRuntime | undefined {
    for (const child of this.children.values()) {
      if (child.variableReferences.has(reference)) {
        return child;
      }
    }
    return undefined;
  }

  private findChildBySourceReference(reference: number): ChildRuntime | undefined {
    for (const child of this.children.values()) {
      if (child.sourceReferences.has(reference)) {
        return child;
      }
    }
    return undefined;
  }
}

function defaultCreateChildClient(transport: DapTransport): DapClient {
  return new DapClient(transport, { requestTimeoutMs: 30_000 });
}

function createInitializeArgs(adapterId: string): Record<string, unknown> {
  return {
    adapterID: adapterId,
    clientID: 'dap-cli',
    clientName: 'dap-cli',
    columnsStartAt1: true,
    linesStartAt1: true,
    pathFormat: 'path',
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/**
 * Robust source-path comparison that tolerates the file://-vs-absolute-path
 * differences js-debug introduces between request args and breakpoint events.
 */
function sourceMatches(eventPath: string, requestPath: string): boolean {
  if (eventPath === requestPath) {
    return true;
  }
  const normalize = (path: string): string => path.replace(/^file:\/\//, '').replace(/\\/g, '/');
  return normalize(eventPath) === normalize(requestPath);
}
