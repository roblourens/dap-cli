import { isDapProtocolMessage, type DapProtocolMessage } from './dapMessages.js';

const headerSeparator = '\r\n\r\n';
const headerSeparatorBytes = Buffer.byteLength(headerSeparator, 'utf8');

export class DapFrameError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'DapFrameError';
  }
}

export class DapMessageParser {
  private buffer = Buffer.alloc(0);

  public push(chunk: Buffer): DapProtocolMessage[] {
    this.buffer = Buffer.concat([this.buffer, chunk]);
    const messages: DapProtocolMessage[] = [];

    while (true) {
      const separatorIndex = this.buffer.indexOf(headerSeparator);
      if (separatorIndex === -1) {
        return messages;
      }

      const contentLength = parseContentLength(this.buffer.subarray(0, separatorIndex).toString('ascii'));
      const bodyStart = separatorIndex + headerSeparatorBytes;
      const bodyEnd = bodyStart + contentLength;

      if (this.buffer.length < bodyEnd) {
        return messages;
      }

      const bodyBuffer = this.buffer.subarray(bodyStart, bodyEnd);
      const parsedMessage = parseBody(bodyBuffer);
      messages.push(parsedMessage);
      this.buffer = this.buffer.subarray(bodyEnd);
    }
  }
}

export function encodeDapMessage(message: DapProtocolMessage): Buffer {
  const body = JSON.stringify(message);
  const contentLength = Buffer.byteLength(body, 'utf8');

  return Buffer.from(`Content-Length: ${contentLength}${headerSeparator}${body}`, 'utf8');
}

function parseContentLength(header: string): number {
  const contentLengthLine = header
    .split('\r\n')
    .find(line => line.toLowerCase().startsWith('content-length:'));

  if (contentLengthLine === undefined) {
    throw new DapFrameError('Missing Content-Length header.');
  }

  const rawLength = contentLengthLine.slice('content-length:'.length).trim();

  if (!/^\d+$/.test(rawLength)) {
    throw new DapFrameError('Invalid Content-Length header.');
  }

  const contentLength = Number.parseInt(rawLength, 10);

  if (!Number.isSafeInteger(contentLength)) {
    throw new DapFrameError('Content-Length header is too large.');
  }

  return contentLength;
}

function parseBody(body: Buffer): DapProtocolMessage {
  let parsed: unknown;

  try {
    parsed = JSON.parse(body.toString('utf8'));
  } catch {
    throw new DapFrameError('Invalid DAP JSON body.');
  }

  if (!isDapProtocolMessage(parsed)) {
    throw new DapFrameError('Invalid DAP message shape.');
  }

  return parsed;
}
