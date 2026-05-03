import { describe, expect, test } from 'vitest';
import { DapFrameError, DapMessageParser, encodeDapMessage } from '../../src/protocol/framing.js';
import { isDapEventMessage, isDapRequestMessage, isDapResponseMessage } from '../../src/protocol/dapMessages.js';

describe('DAP Content-Length framing', () => {
  test('parses a message split across header chunks', () => {
    const parser = new DapMessageParser();
    const frame = encodeDapMessage({ seq: 1, type: 'request', command: 'initialize' });
    const splitAt = 'Content-Length:'.length;

    expect(parser.push(frame.subarray(0, splitAt))).toEqual([]);
    const messages = parser.push(frame.subarray(splitAt));

    expect(messages).toHaveLength(1);
    expect(isDapRequestMessage(messages[0])).toBe(true);
    expect(messages[0]).toMatchObject({ seq: 1, type: 'request', command: 'initialize' });
  });

  test('parses a message split across body chunks', () => {
    const parser = new DapMessageParser();
    const frame = encodeDapMessage({ seq: 2, type: 'event', event: 'stopped', body: { reason: 'breakpoint' } });
    const bodyStart = frame.indexOf('\r\n\r\n') + Buffer.byteLength('\r\n\r\n', 'utf8');

    expect(parser.push(frame.subarray(0, bodyStart + 5))).toEqual([]);
    const messages = parser.push(frame.subarray(bodyStart + 5));

    expect(messages).toHaveLength(1);
    expect(isDapEventMessage(messages[0])).toBe(true);
    expect(messages[0]).toMatchObject({ seq: 2, type: 'event', event: 'stopped' });
  });

  test('parses multiple messages from one chunk', () => {
    const parser = new DapMessageParser();
    const chunk = Buffer.concat([
      encodeDapMessage({ seq: 3, type: 'request', command: 'threads' }),
      encodeDapMessage({ seq: 4, type: 'response', request_seq: 3, success: true, command: 'threads', body: { threads: [] } }),
    ]);

    const messages = parser.push(chunk);

    expect(messages).toHaveLength(2);
    expect(isDapRequestMessage(messages[0])).toBe(true);
    expect(isDapResponseMessage(messages[1])).toBe(true);
    expect(messages[1]).toMatchObject({ seq: 4, type: 'response', request_seq: 3, success: true });
  });

  test('throws typed errors for invalid content length headers', () => {
    const parser = new DapMessageParser();
    const frame = Buffer.from('Content-Length: nope\r\n\r\n{}', 'utf8');

    expect(() => parser.push(frame)).toThrow(DapFrameError);
  });

  test('encodes non-ASCII payloads using UTF-8 byte length', () => {
    const parser = new DapMessageParser();
    const message = { seq: 5, type: 'event', event: 'output', body: { output: 'snowman: ☃' } } as const;
    const frame = encodeDapMessage(message);
    const [header, body] = frame.toString('utf8').split('\r\n\r\n');

    expect(header).toContain(`Content-Length: ${Buffer.byteLength(body ?? '', 'utf8')}`);
    expect(parser.push(frame)).toEqual([message]);
  });
});
