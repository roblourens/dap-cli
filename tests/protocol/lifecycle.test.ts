import { describe, expect, test, vi } from 'vitest';
import type { DapEventMessage } from '../../src/protocol/dapMessages.js';
import { DapLifecycleController, DapLifecycleHandshakeTimeoutError, type DapLifecycleClient } from '../../src/protocol/lifecycle.js';

class FakeLifecycleClient implements DapLifecycleClient {
  public readonly requests: string[] = [];
  public readonly requestArgs: Array<{ command: string; args: unknown }> = [];
  private listener: ((event: DapEventMessage) => void) | undefined;

  public onEvent(listener: (event: DapEventMessage) => void): () => void {
    this.listener = listener;
    return () => {
      this.listener = undefined;
    };
  }

  public request<TResponse>(command: string, args?: unknown): Promise<TResponse> {
    this.requests.push(command);
    this.requestArgs.push({ command, args });
    return Promise.resolve({} as TResponse);
  }

  public emit(event: DapEventMessage): void {
    this.listener?.(event);
  }
}

async function flushMicrotasks(): Promise<void> {
  for (let i = 0; i < 5; i += 1) {
    await Promise.resolve();
  }
}

describe('DapLifecycleController', () => {
  test('sends initialize before launch and waits for initialized before configurationDone', async () => {
    const client = new FakeLifecycleClient();
    const lifecycle = new DapLifecycleController(client);
    const started = lifecycle.start({ mode: 'launch' });

    await flushMicrotasks();
    expect(client.requests).toEqual(['initialize', 'launch']);

    client.emit({ seq: 10, type: 'event', event: 'initialized' });
    await started;

    expect(client.requests).toEqual(['initialize', 'launch', 'configurationDone']);
    expect(lifecycle.state.lifecycle).toBe('running');
  });

  test('runs setup hook after initialized and before configurationDone', async () => {
    const client = new FakeLifecycleClient();
    const lifecycle = new DapLifecycleController(client);
    const started = lifecycle.start({
      mode: 'launch',
      beforeConfigurationDone: () => {
        client.requests.push('setBreakpoints');
        return Promise.resolve();
      },
    });

    await flushMicrotasks();
    expect(client.requests).toEqual(['initialize', 'launch']);

    client.emit({ seq: 10, type: 'event', event: 'initialized' });
    await started;

    expect(client.requests).toEqual(['initialize', 'launch', 'setBreakpoints', 'configurationDone']);
  });

  test('supports attach path', async () => {
    const client = new FakeLifecycleClient();
    const lifecycle = new DapLifecycleController(client);
    const started = lifecycle.start({ mode: 'attach' });

    await flushMicrotasks();
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

  // Plan 05-23 (gap H-8): `disconnect({ terminateDebuggee: true })` must
  // forward the option as the DAP request body so the adapter terminates
  // the debuggee process tree on close.
  test('disconnect forwards terminateDebuggee:true as the DAP request body', async () => {
    const client = new FakeLifecycleClient();
    const lifecycle = new DapLifecycleController(client);

    await lifecycle.disconnect({ terminateDebuggee: true });

    expect(client.requestArgs).toEqual([{ command: 'disconnect', args: { terminateDebuggee: true } }]);
  });

  test('zero-arg disconnect sends no body (backwards compatible)', async () => {
    const client = new FakeLifecycleClient();
    const lifecycle = new DapLifecycleController(client);

    await lifecycle.disconnect();

    expect(client.requestArgs).toEqual([{ command: 'disconnect', args: undefined }]);
  });

  test('fails the session when initialize never responds', async () => {
    vi.useFakeTimers();
    try {
      const client: DapLifecycleClient = {
        request: () => new Promise<never>(() => undefined),
        onEvent: () => () => undefined,
      };
      const lifecycle = new DapLifecycleController(client, { handshakeTimeoutMs: 50 });
      const started = lifecycle.start({ mode: 'launch' });
      const settled = started.then(() => 'resolved').catch((error: unknown) => error);

      await vi.advanceTimersByTimeAsync(60);
      const result = await settled;

      expect(result).toBeInstanceOf(DapLifecycleHandshakeTimeoutError);
      expect((result as DapLifecycleHandshakeTimeoutError).stage).toBe('initialize');
      expect((result as DapLifecycleHandshakeTimeoutError).timeoutMs).toBe(50);
      expect(lifecycle.state.lifecycle).toBe('failed');
    } finally {
      vi.useRealTimers();
    }
  });

  test('fails the session when configurationDone never responds', async () => {
    vi.useFakeTimers();
    try {
      let listener: ((event: DapEventMessage) => void) | undefined;
      const client: DapLifecycleClient = {
        onEvent: handler => {
          listener = handler;
          return () => {
            listener = undefined;
          };
        },
        request: <TResponse>(command: string): Promise<TResponse> => {
          if (command === 'initialize' || command === 'launch') {
            return Promise.resolve({} as TResponse);
          }
          return new Promise<never>(() => undefined);
        },
      };
      const lifecycle = new DapLifecycleController(client, { handshakeTimeoutMs: 50 });
      const started = lifecycle.start({ mode: 'launch' });
      const settled = started.then(() => 'resolved').catch((error: unknown) => error);

      // Let initialize and launch resolve first.
      await Promise.resolve();
      await Promise.resolve();
      listener?.({ seq: 1, type: 'event', event: 'initialized' });

      await vi.advanceTimersByTimeAsync(60);
      const result = await settled;

      expect(result).toBeInstanceOf(DapLifecycleHandshakeTimeoutError);
      expect((result as DapLifecycleHandshakeTimeoutError).stage).toBe('configurationDone');
      expect(lifecycle.state.lifecycle).toBe('failed');
    } finally {
      vi.useRealTimers();
    }
  });

  test('happy path still works with timeout configured', async () => {
    const client = new FakeLifecycleClient();
    const lifecycle = new DapLifecycleController(client, { handshakeTimeoutMs: 5_000 });
    const started = lifecycle.start({ mode: 'launch' });

    await flushMicrotasks();
    client.emit({ seq: 10, type: 'event', event: 'initialized' });
    await started;

    expect(client.requests).toEqual(['initialize', 'launch', 'configurationDone']);
    expect(lifecycle.state.lifecycle).toBe('running');
  });
});
