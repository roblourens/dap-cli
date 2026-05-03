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
  | { mode: 'launch'; initializeArgs?: unknown; launchArgs?: unknown }
  | { mode: 'attach'; initializeArgs?: unknown; attachArgs?: unknown };

export interface DapLifecycleStartResult {
  capabilities: unknown;
}

export class DapLifecycleController {
  private initializedSeen = false;
  private initializedResolver: (() => void) | undefined;
  public readonly state: DapLifecycleState = { lifecycle: 'created', stoppedEpoch: 0 };

  public constructor(private readonly client: DapLifecycleClient) {
    client.onEvent(event => this.handleEvent(event));
  }

  public async start(options: DapLifecycleStartOptions): Promise<DapLifecycleStartResult> {
    this.setRunningState('initializing');
    const capabilities = await this.client.request('initialize', options.initializeArgs);
    this.setRunningState('initialized');

    let startRequest: Promise<unknown>;
    if (options.mode === 'launch') {
      this.setRunningState('launching');
      startRequest = this.client.request('launch', options.launchArgs);
    } else {
      this.setRunningState('attaching');
      startRequest = this.client.request('attach', options.attachArgs);
    }

    await this.waitForInitializedEvent();
    await this.client.request('configurationDone');
    await startRequest;
    await new Promise(resolve => setImmediate(resolve));
    if (this.state.lifecycle !== 'stopped' && this.state.lifecycle !== 'terminated') {
      this.setRunningState('running');
    }
    return { capabilities };
  }

  public async disconnect(args?: unknown): Promise<void> {
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
