import { PassThrough } from 'node:stream';
import { describe, expect, test } from 'vitest';
import { DapClient, DapResponseError } from '../../src/protocol/dapClient.js';
import { DapMessageParser, encodeDapMessage } from '../../src/protocol/framing.js';
import type { DapProtocolMessage, DapRequestMessage, DapResponseMessage } from '../../src/protocol/dapMessages.js';
import type { DapTransport } from '../../src/protocol/transport.js';

class FakeTransport implements DapTransport {
  public readonly name = 'fake';
  public readonly readable = new PassThrough();
  public readonly writable = new PassThrough();
  public readonly written: DapRequestMessage[] = [];
  public readonly responses: DapResponseMessage[] = [];
  private readonly parser = new DapMessageParser();

  public constructor() {
    this.writable.on('data', (chunk: Buffer) => {
      for (const message of this.parser.push(chunk)) {
        if (message.type === 'request') {
          this.written.push(message);
        } else if (message.type === 'response') {
          this.responses.push(message);
        }
      }
    });
  }

  public emitMessage(message: DapProtocolMessage): void {
    this.readable.write(encodeDapMessage(message));
  }

  public close(): Promise<void> {
    this.readable.emit('close');
    return Promise.resolve();
  }
}

describe('DapClient', () => {
  test('matches out-of-order responses by request_seq', async () => {
    const transport = new FakeTransport();
    const client = new DapClient(transport);

    const first = client.request<{ one: true }>('first');
    const second = client.request<{ two: true }>('second');

    expect(transport.written.map(request => request.command)).toEqual(['first', 'second']);
    transport.emitMessage({ seq: 100, type: 'response', request_seq: 2, success: true, command: 'second', body: { two: true } });
    transport.emitMessage({ seq: 101, type: 'response', request_seq: 1, success: true, command: 'first', body: { one: true } });

    await expect(first).resolves.toEqual({ one: true });
    await expect(second).resolves.toEqual({ two: true });
  });

  test('dispatches events while requests are pending', async () => {
    const transport = new FakeTransport();
    const client = new DapClient(transport);
    const events: string[] = [];
    client.onEvent(event => events.push(event.event));

    const pending = client.request('threads');
    transport.emitMessage({ seq: 50, type: 'event', event: 'stopped', body: { reason: 'pause' } });
    transport.emitMessage({ seq: 51, type: 'response', request_seq: 1, success: true, command: 'threads', body: { threads: [] } });

    expect(events).toEqual(['stopped']);
    await expect(pending).resolves.toEqual({ threads: [] });
  });

  test('rejects unsuccessful responses with request diagnostics', async () => {
    const transport = new FakeTransport();
    const client = new DapClient(transport);

    const pending = client.request('stackTrace');
    transport.emitMessage({ seq: 8, type: 'response', request_seq: 1, success: false, command: 'stackTrace', message: 'no stack' });

    await expect(pending).rejects.toMatchObject({
      command: 'stackTrace',
      requestSeq: 1,
      message: 'no stack',
    });
    await expect(pending).rejects.toBeInstanceOf(DapResponseError);
  });

  test('rejects pending requests when the transport closes', async () => {
    const transport = new FakeTransport();
    const client = new DapClient(transport);

    const pending = client.request('threads');
    await client.close();

    await expect(pending).rejects.toThrow('DAP transport closed.');
  });

  test('records last request metadata', () => {
    const transport = new FakeTransport();
    const client = new DapClient(transport);

    void client.request('threads');

    expect(client.lastRequest).toMatchObject({ command: 'threads', seq: 1 });
    expect(client.lastRequest?.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});

describe('DapClient adapter reverse requests', () => {
  test('falls back to built-in runInTerminal handler when no onReverseRequest handler is registered', async () => {
    const transport = new FakeTransport();
    const client = new DapClient(transport);

    transport.emitMessage({
      seq: 200,
      type: 'request',
      command: 'runInTerminal',
      arguments: { args: [process.execPath, '-e', 'process.exit(0)'] },
    });

    await waitFor(() => transport.responses.length >= 1);
    const response = transport.responses[0];
    expect(response).toBeDefined();
    expect(response?.command).toBe('runInTerminal');
    expect(response?.request_seq).toBe(200);
    expect(response?.success).toBe(true);

    await client.close();
  });

  test('dispatches reverse requests to the registered onReverseRequest handler', async () => {
    const transport = new FakeTransport();
    const client = new DapClient(transport);
    const received: Array<{ command: string; arguments: unknown; seq: number }> = [];

    client.onReverseRequest(request => {
      received.push(request);
      return Promise.resolve({ success: true, body: { __pendingTargetId: 'TARGET-1' } });
    });

    transport.emitMessage({
      seq: 42,
      type: 'request',
      command: 'startDebugging',
      arguments: { configuration: { type: 'pwa-chrome' }, request: 'attach' },
    });

    await waitFor(() => transport.responses.length >= 1);
    const response = transport.responses[0];
    expect(response).toBeDefined();
    expect(response?.command).toBe('startDebugging');
    expect(response?.request_seq).toBe(42);
    expect(response?.success).toBe(true);
    expect(response?.body).toEqual({ __pendingTargetId: 'TARGET-1' });
    expect(received).toEqual([{
      command: 'startDebugging',
      arguments: { configuration: { type: 'pwa-chrome' }, request: 'attach' },
      seq: 42,
    }]);

    await client.close();
  });

  test('propagates handler-rejected reverse requests as failure responses', async () => {
    const transport = new FakeTransport();
    const client = new DapClient(transport);

    client.onReverseRequest(() => Promise.resolve({ success: false, message: 'no child support' }));

    transport.emitMessage({ seq: 5, type: 'request', command: 'startDebugging', arguments: {} });

    await waitFor(() => transport.responses.length >= 1);
    const response = transport.responses[0];
    expect(response).toBeDefined();
    expect(response?.success).toBe(false);
    expect(response?.message).toBe('no child support');
    expect(response?.command).toBe('startDebugging');
    expect(response?.request_seq).toBe(5);

    await client.close();
  });

  test('returns the legacy "Unsupported adapter request" failure when no handler is registered', async () => {
    const transport = new FakeTransport();
    const client = new DapClient(transport);

    transport.emitMessage({ seq: 7, type: 'request', command: 'startDebugging', arguments: {} });

    await waitFor(() => transport.responses.length >= 1);
    const response = transport.responses[0];
    expect(response).toBeDefined();
    expect(response?.success).toBe(false);
    expect(response?.message).toBe('Unsupported adapter request: startDebugging');
    expect(response?.command).toBe('startDebugging');
    expect(response?.request_seq).toBe(7);

    await client.close();
  });

  test('translates handler errors into failure responses without crashing', async () => {
    const transport = new FakeTransport();
    const client = new DapClient(transport);

    client.onReverseRequest(() => {
      throw new Error('boom');
    });

    transport.emitMessage({ seq: 11, type: 'request', command: 'startDebugging', arguments: {} });

    await waitFor(() => transport.responses.length >= 1);
    const sync = transport.responses[0];
    expect(sync).toBeDefined();
    expect(sync?.success).toBe(false);
    expect(sync?.message).toBe('boom');

    client.onReverseRequest(() => Promise.reject(new Error('async boom')));
    transport.emitMessage({ seq: 12, type: 'request', command: 'startDebugging', arguments: {} });

    await waitFor(() => transport.responses.length >= 2);
    const async = transport.responses[1];
    expect(async).toBeDefined();
    expect(async?.success).toBe(false);
    expect(async?.message).toBe('async boom');

    // Subsequent valid requests still resolve normally — the client survived both errors.
    client.onReverseRequest(() => Promise.resolve({ success: true }));
    transport.emitMessage({ seq: 13, type: 'request', command: 'startDebugging', arguments: {} });
    await waitFor(() => transport.responses.length >= 3);
    expect(transport.responses[2]?.success).toBe(true);

    await client.close();
  });

  test('falls back to default handling when the handler returns undefined', async () => {
    const transport = new FakeTransport();
    const client = new DapClient(transport);

    client.onReverseRequest(() => undefined);

    transport.emitMessage({ seq: 21, type: 'request', command: 'startDebugging', arguments: {} });
    await waitFor(() => transport.responses.length >= 1);
    expect(transport.responses[0]?.success).toBe(false);
    expect(transport.responses[0]?.message).toBe('Unsupported adapter request: startDebugging');

    await client.close();
  });

  test('disposer clears only the currently-registered handler', async () => {
    const transport = new FakeTransport();
    const client = new DapClient(transport);

    const disposeFirst = client.onReverseRequest(() => Promise.resolve({ success: true, body: { from: 'first' } }));
    client.onReverseRequest(() => Promise.resolve({ success: true, body: { from: 'second' } }));

    // Disposing the first handler must NOT remove the active (second) one.
    disposeFirst();

    transport.emitMessage({ seq: 31, type: 'request', command: 'startDebugging', arguments: {} });
    await waitFor(() => transport.responses.length >= 1);
    expect(transport.responses[0]?.success).toBe(true);
    expect(transport.responses[0]?.body).toEqual({ from: 'second' });

    await client.close();
  });
});

async function waitFor(predicate: () => boolean, timeoutMs = 1000): Promise<void> {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > timeoutMs) {
      throw new Error('waitFor timed out');
    }
    await new Promise<void>(resolve => setImmediate(resolve));
  }
}
