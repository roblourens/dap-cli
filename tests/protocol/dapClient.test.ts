import { PassThrough } from 'node:stream';
import { describe, expect, test } from 'vitest';
import { DapClient, DapResponseError } from '../../src/protocol/dapClient.js';
import { DapMessageParser, encodeDapMessage } from '../../src/protocol/framing.js';
import type { DapProtocolMessage, DapRequestMessage } from '../../src/protocol/dapMessages.js';
import type { DapTransport } from '../../src/protocol/transport.js';

class FakeTransport implements DapTransport {
  public readonly name = 'fake';
  public readonly readable = new PassThrough();
  public readonly writable = new PassThrough();
  public readonly written: DapRequestMessage[] = [];
  private readonly parser = new DapMessageParser();

  public constructor() {
    this.writable.on('data', (chunk: Buffer) => {
      for (const message of this.parser.push(chunk)) {
        if (message.type === 'request') {
          this.written.push(message);
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
