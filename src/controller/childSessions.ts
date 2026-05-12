import type { DapEventCache } from '../protocol/eventCache.js';
import { breakpointBindingGuidance, threadNotPaused } from './diagnostics.js';
import type { DapEventMessage } from '../protocol/dapMessages.js';
import type { DapTransport } from '../protocol/transport.js';
import { DapClient, type ReverseRequestResult } from '../protocol/dapClient.js';
import { sessionError } from '../cli/errors.js';
import type { OwnedAdapterMetadata, SessionId } from '../sessions/session.js';
import type { SessionManager } from '../sessions/sessionManager.js';
import { combineChildPausedStates } from './pausedState.js';

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
  /**
   * Override the per-child readiness wait used by setBreakpoints fan-out.
   * Defaults to 3_000ms — kept under the 5s controller IPC budget so a child
   * stuck mid-handshake (e.g. a js-debug attach to an Electron utility
   * process whose user-code target never completes `configurationDone`) does
   * not hang the whole request to `controller_request_timeout`. On timeout,
   * still-pending children surface as `child_readiness_timeout` warnings on
   * the response. See Phase 17 S-08 findings (17-S08-FINDINGS.md, Bug 1).
   */
  awaitChildrenReadyTimeoutMs?: number;
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
  /**
   * Per-child paused-thread set. Populated from this child's own `stopped`
   * (additive) and `continued` (removes) events. Combined across all
   * non-{@link lifecycleEnded} children by
   * {@link ChildSessionCoordinator.recomputeParentPausedState} into the
   * parent SessionRecord's paused state — replaces the pre-Phase-18
   * "last child event wins" mirror that let a sibling's `terminated`
   * clobber a real `stopped` (S-02 root cause).
   */
  stoppedThreadIds: Set<number>;
  /** True after `stopped { allThreadsStopped: true }`; cleared on a matching all-threads continue, threadless continued, or terminated. */
  allThreadsStopped: boolean;
  /** True after `terminated` or `exited` — child's threads are excluded from paused-state union and routing. */
  lifecycleEnded: boolean;
  /** Most recently observed `stopped.reason` for this child (used to pick the parent-level `stoppedReason`). */
  lastStoppedReason: string | undefined;
  /** frameIds that came from this child (so stack/scopes/variables route back here). */
  frameIds: Set<number>;
  /** variablesReferences that came from this child. */
  variableReferences: Set<number>;
  /** sourceReferences that came from this child. */
  sourceReferences: Set<number>;
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
  private readonly pendingSetBreakpoints: unknown[] = [];
  private readonly breakpointEventSinks = new Set<(event: DapEventMessage) => void>();
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
   * Bounded variant of {@link awaitChildrenReady}. Waits up to
   * `awaitChildrenReadyTimeoutMs` (default 3_000ms) for every currently-known
   * child to settle, then returns the list of child session ids whose
   * `readyPromise` had not yet settled at the deadline. Phase 17 S-08
   * findings (Bug 1): a js-debug attach to an Electron utility process whose
   * user-code target never completes `configurationDone` left
   * `Promise.allSettled` hanging forever, blowing the 5s controller IPC
   * budget and surfacing as `controller_request_timeout` to the agent. Bounding
   * the wait lets the request complete and surface a `child_readiness_timeout`
   * warning per stuck child.
   */
  public async awaitChildrenReadyBounded(): Promise<{ pendingChildSessionIds: SessionId[] }> {
    // Drain reverse-request handlers (which register children into
    // `this.children`) but do NOT await `bringUps` — those are exactly
    // the lifecycle promises we want to bound. A stuck handshake would
    // otherwise leave `awaitPendingChildren` hanging forever, defeating
    // the timeout below.
    await new Promise<void>(resolve => setImmediate(resolve));
    while (this.activeHandlers.length > 0) {
      const handlers = this.activeHandlers.splice(0, this.activeHandlers.length);
      await Promise.allSettled(handlers);
      await new Promise<void>(resolve => setImmediate(resolve));
    }
    const children = [...this.children.values()];
    if (children.length === 0) {
      return { pendingChildSessionIds: [] };
    }
    const timeoutMs = this.options.awaitChildrenReadyTimeoutMs ?? 3_000;
    const settled = new Set<SessionId>();
    await Promise.race([
      Promise.allSettled(children.map(child => child.readyPromise.then(
        () => settled.add(child.sessionId),
        () => settled.add(child.sessionId),
      ))),
      new Promise<void>(resolve => { setTimeout(resolve, timeoutMs).unref?.(); }),
    ]);
    return {
      pendingChildSessionIds: children
        .filter(child => !settled.has(child.sessionId))
        .map(child => child.sessionId),
    };
  }

  /**
   * Optionally intercept a parent-targeted DAP request when children exist.
   * Returns `undefined` for non-routable commands or when there are no children.
   */
  public async maybeIntercept(command: string, args: unknown): Promise<InterceptedRequest | undefined> {
    if (!ROUTABLE_COMMANDS.has(command)) {
      return undefined;
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
      if (this.children.size === 0) {
        return undefined;
      }
      return { value: await this.fanOutSetBreakpoints(args) };
    }

    if (this.children.size === 0) {
      return undefined;
    }

    if (command === 'threads') {
      return { value: await this.aggregateThreads() };
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
   * Remember initial setBreakpoints payloads that were issued before js-debug
   * created child sessions. The parent response is only provisional for real
   * pwa-node targets; child replay is what lets early source breakpoints bind
   * once the concrete target appears.
   */
  public registerInitialBreakpoints(payloads: readonly unknown[]): void {
    for (const payload of payloads) {
      this.rememberPendingSetBreakpoints(payload);
    }
  }

  private rememberPendingSetBreakpoints(args: unknown): void {
    const key = breakpointPayloadSourceKey(args);
    if (key === undefined) {
      this.pendingSetBreakpoints.push(args);
      return;
    }

    const existingIndex = this.pendingSetBreakpoints.findIndex(payload => breakpointPayloadSourceKey(payload) === key);
    if (existingIndex === -1) {
      this.pendingSetBreakpoints.push(args);
      return;
    }

    this.pendingSetBreakpoints[existingIndex] = args;
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
      stoppedThreadIds: new Set(),
      allThreadsStopped: false,
      lifecycleEnded: false,
      lastStoppedReason: undefined,
      frameIds: new Set(),
      variableReferences: new Set(),
      sourceReferences: new Set(),
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
    // Plan 05-25 (H-1a/H-1b) + Phase 18: mirror child paused-state onto the
    // PARENT record. The pre-Phase-18 implementation called
    // `updatePausedState` directly per child event, which let a sibling's
    // `terminated` clobber a real `stopped` from another child (the S-02
    // root cause: bootloader child terminates after the ext-host child
    // stops, parent flips back to paused=false). Phase 18 keeps per-child
    // bookkeeping on the {@link ChildRuntime} and lets
    // {@link recomputeParentPausedState} compose the union across
    // non-terminated children. A torn-down parent surfaces inside the
    // recompute as a swallowed `session_not_found` rather than crashing
    // the child event loop.
    client.onEvent(event => {
      if (event.event === 'stopped') {
        const body = (event as { body?: { reason?: unknown; threadId?: unknown; allThreadsStopped?: unknown } }).body;
        // A child resurrecting after `terminated` (re-emitting `stopped`)
        // is a state-correctness path, not a security boundary — just
        // clear the lifecycle flag so the recompute counts it again.
        if (runtime.lifecycleEnded) {
          runtime.lifecycleEnded = false;
        }
        if (body?.allThreadsStopped === true) {
          runtime.allThreadsStopped = true;
          for (const id of runtime.knownThreadIds) {
            runtime.stoppedThreadIds.add(id);
          }
        } else if (typeof body?.threadId === 'number') {
          runtime.stoppedThreadIds.add(body.threadId);
        }
        if (typeof body?.reason === 'string') {
          runtime.lastStoppedReason = body.reason;
        }
        this.recomputeParentPausedState();
      } else if (event.event === 'continued') {
        const body = (event as { body?: { threadId?: unknown; allThreadsContinued?: unknown } }).body;
        if (body?.allThreadsContinued === true || typeof body?.threadId !== 'number') {
          runtime.stoppedThreadIds.clear();
          runtime.allThreadsStopped = false;
        } else {
          runtime.stoppedThreadIds.delete(body.threadId);
          // Single-thread continue does NOT clear `allThreadsStopped`;
          // other threads in the child may still be paused.
        }
        this.recomputeParentPausedState();
      } else if (event.event === 'terminated' || event.event === 'exited') {
        runtime.lifecycleEnded = true;
        runtime.stoppedThreadIds.clear();
        runtime.allThreadsStopped = false;
        this.recomputeParentPausedState();
      } else if (event.event === 'thread') {
        // The separate `thread` handler above maintains `knownThreadIds`;
        // here we only need to drop a thread from the per-child paused
        // set when it exits (so `recomputeParentPausedState` no longer
        // counts it).
        const body = (event as { body?: { reason?: unknown; threadId?: unknown } }).body;
        if (body?.reason === 'exited' && typeof body.threadId === 'number') {
          runtime.stoppedThreadIds.delete(body.threadId);
          this.recomputeParentPausedState();
        }
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
      for (const breakpointArgs of this.pendingSetBreakpoints) {
        await client.request('setBreakpoints', breakpointArgs);
      }
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
    if (event.event === 'breakpoint') {
      for (const sink of this.breakpointEventSinks) {
        sink(annotated);
      }
    }
  }

  /**
   * Compose the parent SessionRecord's paused-state from the union of
   * non-terminated children. Called from the per-child `stopped` /
   * `continued` / `thread` (exited) / `terminated` / `exited` handlers
   * installed in {@link handleStartDebugging}. Fire-and-forget on the
   * SessionManager write — a torn-down parent surfaces as a swallowed
   * `session_not_found`.
   */
  private recomputeParentPausedState(): void {
    const snapshots = [...this.children.values()].map(child => ({
      stoppedThreadIds: child.stoppedThreadIds as ReadonlySet<number>,
      allThreadsStopped: child.allThreadsStopped,
      knownThreadIds: child.knownThreadIds as ReadonlySet<number>,
      lifecycleEnded: child.lifecycleEnded,
      lastStoppedReason: child.lastStoppedReason,
    }));
    const next = combineChildPausedStates(snapshots);
    void this.options.sessionManager
      .updatePausedState(this.options.parentSessionId, next)
      .catch(() => undefined);
  }

  private async aggregateThreads(): Promise<{ threads: Array<{ id: number; name: string; sessionName: string }> }> {
    const result: Array<{ id: number; name: string; sessionName: string }> = [];
    for (const child of this.children.values()) {
      if (child.lifecycleEnded) {
        continue;
      }
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
    const { pendingChildSessionIds } = await this.awaitChildrenReadyBounded();
    type ChildBreakpointResponse = { breakpoints?: Array<{ verified?: boolean; id?: number; line?: number }> };
    type ChildResult = { sessionId: SessionId; ok: true; response: ChildBreakpointResponse } | { sessionId: SessionId; ok: false; error: unknown };
    // Phase 17 S-08 Bug 1: only fan out to children whose readyPromise has
    // settled — a still-pending child surfaces as a `child_readiness_timeout`
    // warning instead of letting its un-acked request hang the parent
    // request to controller_request_timeout.
    const pendingSet = new Set(pendingChildSessionIds);
    const readyChildren = [...this.children.values()].filter(child => !pendingSet.has(child.sessionId));
    const results: ChildResult[] = await Promise.all(
      readyChildren.map(async (child): Promise<ChildResult> => {
        try {
          const response = await child.client.request<ChildBreakpointResponse>('setBreakpoints', args);
          return { sessionId: child.sessionId, ok: true, response };
        } catch (error) {
          return { sessionId: child.sessionId, ok: false, error };
        }
      }),
    );

    const warnings: Array<{ sessionId: SessionId; message: string }> = results
      .filter((result): result is Extract<ChildResult, { ok: false }> => !result.ok)
      .map(result => ({
        sessionId: result.sessionId,
        message: result.error instanceof Error ? result.error.message : String(result.error),
      }));
    for (const sessionId of pendingChildSessionIds) {
      warnings.push({ sessionId, message: 'child_readiness_timeout' });
    }

    if (results.length === 0) {
      return warnings.length > 0 ? { breakpoints: [], warnings } : { breakpoints: [] };
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

    const childBreakpointSink = (event: DapEventMessage): void => {
      const body = (event as { body?: { breakpoint?: unknown } }).body;
      const bp = body?.breakpoint;
      if (isRecord(bp)) {
        recordVerifiedEvent(bp);
        notifyWaiters();
      }
    };
    this.breakpointEventSinks.add(childBreakpointSink);

    let timer: NodeJS.Timeout | undefined;
    try {
      this.rememberPendingSetBreakpoints(args);
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
      const { pendingChildSessionIds } = await this.awaitChildrenReadyBounded();
      let childResults: ChildResult[] = [];
      // Phase 17 S-08 Bug 1: only query children whose readyPromise has
      // settled. A still-pending child (utility-process attach where
      // `configurationDone` never returns) would otherwise hang this
      // request past the 5s controller IPC budget and the agent sees a
      // misleading `controller_request_timeout`. Pending sessionIds are
      // surfaced as `child_readiness_timeout` warnings below.
      const pendingSet = new Set(pendingChildSessionIds);
      const readyChildren = [...this.children.values()].filter(child => !pendingSet.has(child.sessionId));
      if (readyChildren.length > 0) {
        childResults = await Promise.all(
          readyChildren.map(async (child): Promise<ChildResult> => {
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
      for (const sessionId of pendingChildSessionIds) {
        childWarnings.push({ sessionId, message: 'child_readiness_timeout' });
      }

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
      this.breakpointEventSinks.delete(childBreakpointSink);
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
      // Phase 8 round 3: structured error so the CLI does not surface
      // `controller_unavailable: Run dap-cli start` for a missing frameId.
      throw sessionError(`'${command}' requires frameId.`, {
        code: 'frame_id_required',
        diagnostics: [
          `'${command}' requires --frame-id when the named session has children.`,
          'Run `dap-cli stack --name <parent> --thread-id <id>` to list available frame ids.',
        ],
        data: { availableFrameIds: this.listAvailableFrameIds() },
      });
    }
    const child = this.findChildByFrameId(frameId);
    if (child === undefined) {
      // Phase 8 round 3: same — surface a session-state error, not a
      // bogus controller-unavailable hint.
      throw sessionError(`No child session owns frame ${frameId}.`, {
        code: 'frame_not_found',
        diagnostics: [
          `Frame ${frameId} is not known to any child of this parent session.`,
          'Run `dap-cli stack --name <parent> --thread-id <id>` to list current frame ids; frame ids change after each stop.',
        ],
        data: { requestedFrameId: frameId, availableFrameIds: this.listAvailableFrameIds() },
      });
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
      // Phase 8 round 3: structured error so the CLI does not surface
      // `controller_unavailable: Run dap-cli start` for an unknown
      // variablesReference / frameId.
      throw sessionError(`No child session owns ${command} target.`, {
        code: 'variable_reference_not_found',
        diagnostics: [
          `'${command}' requires --variables-reference (or --frame-id) pointing at a value owned by a paused child of this parent session.`,
          'Run `dap-cli scopes --name <parent> --frame-id <id>` to list current variablesReferences; references change after each stop.',
        ],
        data: {
          ...(isRecord(args) && typeof args.variablesReference === 'number' ? { requestedVariablesReference: args.variablesReference } : {}),
          ...(isRecord(args) && typeof args.frameId === 'number' ? { requestedFrameId: args.frameId } : {}),
          availableFrameIds: this.listAvailableFrameIds(),
          availableVariableReferences: this.listAvailableVariableReferences(),
        },
      });
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
      throw sessionError(`'${command}' requires source.sourceReference.`, {
        code: 'source_reference_required',
        diagnostics: [
          `'${command}' requires a source.sourceReference pointing at a virtual source owned by a child of this parent session.`,
        ],
        data: { availableSourceReferences: this.listAvailableSourceReferences() },
      });
    }
    const child = this.findChildBySourceReference(reference);
    if (child === undefined) {
      throw sessionError(`No child session owns source reference ${reference}.`, {
        code: 'source_reference_not_found',
        diagnostics: [
          `Source reference ${reference} is not known to any child of this parent session.`,
          'Run `dap-cli stack --name <parent> --thread-id <id>` to discover current sourceReferences; references change after each stop.',
        ],
        data: { requestedSourceReference: reference, availableSourceReferences: this.listAvailableSourceReferences() },
      });
    }
    return child.client.request<unknown>(command, args);
  }

  /**
   * Find the child whose REAL thread id list contains `threadId`. Three-pass
   * lookup, all passes restricted to non-{@link ChildRuntime.lifecycleEnded}
   * children:
   *
   *   1. Prefer a child that is actually stopped on this thread
   *      (`stoppedThreadIds.has(threadId)` OR `allThreadsStopped &&
   *      knownThreadIds.has(threadId)`). This is the Phase 18 fix for the
   *      pre-existing "first cache hit wins" routing that sent
   *      thread-bearing commands to a dead bootloader child whose cache
   *      still claimed the id (S-02 routing failure).
   *   2. Fall back to any non-terminated child that knows the thread.
   *   3. Cold path — live `threads` fan-out across non-terminated
   *      children, then re-run passes 1–2 against the refreshed cache.
   *
   * Iterates `this.children` LIVE so a worker registered between command
   * parse and lookup is observed. When two paused children legitimately own
   * the same id, Map iteration order (= insertion order) breaks the tie
   * and the user can disambiguate via the `sessionName` surfaced by
   * {@link aggregateThreads}.
   */
  private async findChildOwningThread(threadId: number): Promise<ChildRuntime | undefined> {
    // Pass 1: prefer the child actually stopped on this thread.
    for (const child of this.children.values()) {
      if (child.lifecycleEnded) {
        continue;
      }
      if (child.stoppedThreadIds.has(threadId)) {
        return child;
      }
      if (child.allThreadsStopped && child.knownThreadIds.has(threadId)) {
        return child;
      }
    }
    // Pass 2: any non-terminated child that knows the thread.
    for (const child of this.children.values()) {
      if (child.lifecycleEnded) {
        continue;
      }
      if (child.knownThreadIds.has(threadId)) {
        return child;
      }
    }
    // Pass 3: cold path — live `threads` fan-out, only against
    // non-terminated children. Bounded by live child count and the
    // per-request timeout configured on each child's DapClient.
    const live = [...this.children.values()].filter(child => !child.lifecycleEnded);
    const refreshes = live.map(async child => {
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
    for (const child of live) {
      if (child.stoppedThreadIds.has(threadId)) {
        return child;
      }
      if (child.allThreadsStopped && child.knownThreadIds.has(threadId)) {
        return child;
      }
    }
    for (const child of live) {
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
      if (child.lifecycleEnded) {
        continue;
      }
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

  private listAvailableFrameIds(): Array<{ sessionName: string; sessionId: SessionId; frameId: number }> {
    const result: Array<{ sessionName: string; sessionId: SessionId; frameId: number }> = [];
    for (const child of this.children.values()) {
      for (const frameId of child.frameIds) {
        result.push({ sessionName: child.sessionName, sessionId: child.sessionId, frameId });
      }
    }
    return result;
  }

  private listAvailableVariableReferences(): Array<{ sessionName: string; sessionId: SessionId; variablesReference: number }> {
    const result: Array<{ sessionName: string; sessionId: SessionId; variablesReference: number }> = [];
    for (const child of this.children.values()) {
      for (const reference of child.variableReferences) {
        result.push({ sessionName: child.sessionName, sessionId: child.sessionId, variablesReference: reference });
      }
    }
    return result;
  }

  private listAvailableSourceReferences(): Array<{ sessionName: string; sessionId: SessionId; sourceReference: number }> {
    const result: Array<{ sessionName: string; sessionId: SessionId; sourceReference: number }> = [];
    for (const child of this.children.values()) {
      for (const reference of child.sourceReferences) {
        result.push({ sessionName: child.sessionName, sessionId: child.sessionId, sourceReference: reference });
      }
    }
    return result;
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

function breakpointPayloadSourceKey(payload: unknown): string | undefined {
  if (!isRecord(payload) || !isRecord(payload.source)) {
    return undefined;
  }
  const source = payload.source;
  if (typeof source.path === 'string') {
    return `path:${source.path}`;
  }
  if (typeof source.sourceReference === 'number') {
    return `sourceReference:${source.sourceReference}`;
  }
  if (typeof source.name === 'string') {
    return `name:${source.name}`;
  }
  return undefined;
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
