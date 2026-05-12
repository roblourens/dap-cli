import type { DapEventMessage } from './dapMessages.js';

export type DapLifecycleStateName = 'created' | 'initializing' | 'initialized' | 'launching' | 'attaching' | 'running' | 'stopped' | 'terminated' | 'disconnected' | 'failed';

export interface DapStoppedState {
  reason: string;
  threadId?: number;
}

export interface DapLifecycleState {
  lifecycle: DapLifecycleStateName;
  stoppedEpoch: number;
  stopped?: DapStoppedState;
}

export interface DapLifecycleClient {
  request<TResponse = unknown>(command: string, args?: unknown): Promise<TResponse>;
  onEvent(listener: (event: DapEventMessage) => void): () => void;
}

export type DapLifecycleStartOptions =
  | { mode: 'launch'; initializeArgs?: unknown; launchArgs?: unknown; beforeConfigurationDone?: () => Promise<void> }
  | { mode: 'attach'; initializeArgs?: unknown; attachArgs?: unknown; beforeConfigurationDone?: () => Promise<void> };

export interface DapLifecycleStartResult {
  capabilities: unknown;
}

export interface DapLifecycleControllerOptions {
  /** Per-stage timeout for initialize, launch/attach, the `initialized` event wait, and configurationDone. Defaults to 10_000ms. */
  handshakeTimeoutMs?: number;
}

export type DapLifecycleHandshakeStage = 'initialize' | 'launch' | 'attach' | 'initialized-event' | 'configurationDone';

export class DapLifecycleHandshakeTimeoutError extends Error {
  public readonly stage: DapLifecycleHandshakeStage;
  public readonly timeoutMs: number;

  public constructor(stage: DapLifecycleHandshakeStage, timeoutMs: number) {
    super(`DAP lifecycle handshake stage '${stage}' did not complete within ${timeoutMs}ms.`);
    this.name = 'DapLifecycleHandshakeTimeoutError';
    this.stage = stage;
    this.timeoutMs = timeoutMs;
  }
}

const DEFAULT_HANDSHAKE_TIMEOUT_MS = 10_000;

export class DapLifecycleController {
  private initializedSeen = false;
  private initializedResolver: (() => void) | undefined;
  private readonly handshakeTimeoutMs: number;
  public readonly state: DapLifecycleState = { lifecycle: 'created', stoppedEpoch: 0 };

  public constructor(private readonly client: DapLifecycleClient, options: DapLifecycleControllerOptions = {}) {
    this.handshakeTimeoutMs = options.handshakeTimeoutMs ?? DEFAULT_HANDSHAKE_TIMEOUT_MS;
    client.onEvent(event => this.handleEvent(event));
  }

  public async start(options: DapLifecycleStartOptions): Promise<DapLifecycleStartResult> {
    try {
      this.setRunningState('initializing');
      const capabilities = await this.withTimeout('initialize', this.client.request('initialize', options.initializeArgs));
      this.setRunningState('initialized');

      let startRequest: Promise<unknown>;
      if (options.mode === 'launch') {
        this.setRunningState('launching');
        startRequest = this.client.request('launch', options.launchArgs);
      } else {
        this.setRunningState('attaching');
        startRequest = this.client.request('attach', options.attachArgs);
      }

      await this.withTimeout('initialized-event', Promise.race([this.waitForInitializedEvent(), rejectWhenStartRequestFails(startRequest)]));
      await options.beforeConfigurationDone?.();
      await this.withTimeout('configurationDone', this.client.request('configurationDone'));
      // The launch/attach request is awaited last; give it its own fresh timeout window.
      // Tracking budget from issuance would be more precise but this is simpler and acceptable for handshake bounds.
      await this.withTimeout(options.mode === 'launch' ? 'launch' : 'attach', startRequest);
      await new Promise(resolve => setImmediate(resolve));
      if (this.state.lifecycle !== 'stopped' && this.state.lifecycle !== 'terminated') {
        this.setRunningState('running');
      }
      return { capabilities };
    } catch (error) {
      if (error instanceof DapLifecycleHandshakeTimeoutError) {
        this.state.lifecycle = 'failed';
        delete this.state.stopped;
      }
      throw error;
    }
  }

  private withTimeout<T>(stage: DapLifecycleHandshakeStage, work: Promise<T>): Promise<T> {
    let timer: NodeJS.Timeout | undefined;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        reject(new DapLifecycleHandshakeTimeoutError(stage, this.handshakeTimeoutMs));
      }, this.handshakeTimeoutMs);
    });
    return Promise.race([work, timeoutPromise]).finally(() => {
      if (timer !== undefined) {
        clearTimeout(timer);
      }
    });
  }

  /**
   * Plan 05-23 (gap H-8): callers can ask the adapter to terminate the
   * debuggee process tree (DAP `disconnect` body `{ terminateDebuggee: true }`).
   * Without this, `dap-cli close` left orphan browser processes from
   * stdio adapters that delegate teardown to the debuggee — see
   * `.planning/phases/05-.../05-UAT.md` H-8.
   *
   * Backwards-compatible: zero-arg call sites continue to send no body, and
   * unknown-shape callers (e.g. tests passing raw args) still flow through.
   */
  public async disconnect(opts?: unknown): Promise<void> {
    const args = normalizeDisconnectArgs(opts);
    await this.client.request('disconnect', args);
    this.setRunningState('disconnected');
  }

  private handleEvent(event: DapEventMessage): void {
    if (event.event === 'initialized') {
      this.initializedSeen = true;
      this.initializedResolver?.();
      this.initializedResolver = undefined;
      return;
    }

    if (event.event === 'stopped') {
      this.state.lifecycle = 'stopped';
      this.state.stoppedEpoch += 1;
      this.state.stopped = parseStoppedState(event.body);
      return;
    }

    if (event.event === 'continued') {
      this.setRunningState('running');
      return;
    }

    if (event.event === 'terminated') {
      this.setRunningState('terminated');
    }
  }

  private async waitForInitializedEvent(): Promise<void> {
    if (this.initializedSeen) {
      return;
    }

    await new Promise<void>(resolve => {
      this.initializedResolver = resolve;
    });
  }

  private setRunningState(lifecycle: DapLifecycleStateName): void {
    this.state.lifecycle = lifecycle;
    delete this.state.stopped;
  }
}

function parseStoppedState(body: unknown): DapStoppedState {
  if (typeof body !== 'object' || body === null) {
    return { reason: 'unknown' };
  }

  const reason = 'reason' in body && typeof body.reason === 'string' ? body.reason : 'unknown';
  const threadId = 'threadId' in body && typeof body.threadId === 'number' ? body.threadId : undefined;

  return threadId === undefined ? { reason } : { reason, threadId };
}

function rejectWhenStartRequestFails(startRequest: Promise<unknown>): Promise<never> {
  return startRequest.then(
    () => new Promise<never>(() => undefined),
    (error: unknown) => Promise.reject(error instanceof Error ? error : new Error(typeof error === 'string' ? error : JSON.stringify(error))),
  );
}

function normalizeDisconnectArgs(opts: unknown): unknown {
  if (opts === undefined) {
    return undefined;
  }
  if (typeof opts !== 'object' || opts === null) {
    return opts;
  }
  const record = opts as Record<string, unknown>;
  if ('terminateDebuggee' in record) {
    // Forward the documented option as the DAP request body. Other keys are
    // preserved verbatim so adapter-specific extensions still pass through.
    return record;
  }
  return opts;
}
