import { describe, expect, test } from 'vitest';
import type { DapEventMessage } from '../../src/protocol/dapMessages.js';
import { DapLifecycleController, type DapLifecycleClient } from '../../src/protocol/lifecycle.js';

class FakeLifecycleClient implements DapLifecycleClient {
  public readonly requests: string[] = [];
  private listener: ((event: DapEventMessage) => void) | undefined;

  public onEvent(listener: (event: DapEventMessage) => void): () => void {
    this.listener = listener;
    return () => {
      this.listener = undefined;
    };
  }

  public request<TResponse>(command: string): Promise<TResponse> {
    this.requests.push(command);
    return Promise.resolve({} as TResponse);
  }

  public emit(event: DapEventMessage): void {
    this.listener?.(event);
  }
}

describe('DapLifecycleController', () => {
  test('sends initialize before launch and waits for initialized before configurationDone', async () => {
    const client = new FakeLifecycleClient();
    const lifecycle = new DapLifecycleController(client);
    const started = lifecycle.start({ mode: 'launch' });

    await Promise.resolve();
    expect(client.requests).toEqual(['initialize', 'launch']);

    client.emit({ seq: 10, type: 'event', event: 'initialized' });
    await started;

    expect(client.requests).toEqual(['initialize', 'launch', 'configurationDone']);
    expect(lifecycle.state.lifecycle).toBe('running');
  });

  test('supports attach path', async () => {
    const client = new FakeLifecycleClient();
    const lifecycle = new DapLifecycleController(client);
    const started = lifecycle.start({ mode: 'attach' });

    await Promise.resolve();
    client.emit({ seq: 11, type: 'event', event: 'initialized' });
    await started;

    expect(client.requests).toEqual(['initialize', 'attach', 'configurationDone']);
  });

  test('tracks stopped epoch and clears stale stopped data on continued', () => {
    const client = new FakeLifecycleClient();
    const lifecycle = new DapLifecycleController(client);

    client.emit({ seq: 1, type: 'event', event: 'stopped', body: { reason: 'breakpoint', threadId: 7 } });
    expect(lifecycle.state.lifecycle).toBe('stopped');
    expect(lifecycle.state.stoppedEpoch).toBe(1);
    expect(lifecycle.state.stopped).toEqual({ reason: 'breakpoint', threadId: 7 });

    client.emit({ seq: 2, type: 'event', event: 'continued' });
    expect(lifecycle.state.lifecycle).toBe('running');
    expect(lifecycle.state.stopped).toBeUndefined();

    client.emit({ seq: 3, type: 'event', event: 'stopped', body: { reason: 'step' } });
    expect(lifecycle.state.stoppedEpoch).toBe(2);
  });

  test('marks terminated and disconnected states', async () => {
    const client = new FakeLifecycleClient();
    const lifecycle = new DapLifecycleController(client);

    client.emit({ seq: 4, type: 'event', event: 'terminated' });
    expect(lifecycle.state.lifecycle).toBe('terminated');

    await lifecycle.disconnect();
    expect(client.requests).toEqual(['disconnect']);
    expect(lifecycle.state.lifecycle).toBe('disconnected');
  });
});
