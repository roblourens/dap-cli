import { DapFrameError, DapMessageParser, encodeDapMessage } from './framing.js';
import type { DapEventMessage, DapProtocolMessage, DapResponseMessage } from './dapMessages.js';
import type { DapTransport } from './transport.js';

export interface LastDapRequest {
  seq: number;
  command: string;
  timestamp: string;
}

export interface DapClientOptions {
  requestTimeoutMs?: number;
}

export class DapResponseError extends Error {
  public constructor(public readonly command: string, public readonly requestSeq: number, message: string) {
    super(message);
    this.name = 'DapResponseError';
  }
}

export class DapTransportClosedError extends Error {
  public constructor(message = 'DAP transport closed.') {
    super(message);
    this.name = 'DapTransportClosedError';
  }
}

type EventListener = (event: DapEventMessage) => void;

interface PendingRequest {
  command: string;
  resolve(value: unknown): void;
  reject(error: Error): void;
  timeout: NodeJS.Timeout | undefined;
}

export class DapClient {
  private readonly parser = new DapMessageParser();
  private readonly pending = new Map<number, PendingRequest>();
  private readonly eventListeners = new Set<EventListener>();
  private nextSeq = 1;
  private closed = false;
  public lastRequest: LastDapRequest | undefined;

  public constructor(private readonly transport: DapTransport, private readonly options: DapClientOptions = {}) {
    transport.readable.on('data', this.handleData);
    transport.readable.on('close', this.handleClosed);
    transport.readable.on('end', this.handleClosed);
    transport.readable.on('error', this.handleTransportError);
  }

  public request<TResponse = unknown>(command: string, args?: unknown): Promise<TResponse> {
    if (this.closed) {
      return Promise.reject(new DapTransportClosedError());
    }

    const seq = this.nextSeq;
    this.nextSeq += 1;
    const request = args === undefined
      ? { seq, type: 'request' as const, command }
      : { seq, type: 'request' as const, command, arguments: args };
    this.lastRequest = { seq, command, timestamp: new Date().toISOString() };

    return new Promise<TResponse>((resolve, reject) => {
      const timeout = this.options.requestTimeoutMs === undefined
        ? undefined
        : setTimeout(() => {
          this.pending.delete(seq);
          reject(new DapResponseError(command, seq, `DAP request timed out: ${command}`));
        }, this.options.requestTimeoutMs);

      this.pending.set(seq, {
        command,
        resolve: value => resolve(value as TResponse),
        reject,
        timeout,
      });
      this.transport.writable.write(encodeDapMessage(request));
    });
  }

  public onEvent(listener: EventListener): () => void {
    this.eventListeners.add(listener);
    return () => {
      this.eventListeners.delete(listener);
    };
  }

  public async close(): Promise<void> {
    this.handleClosed();
    this.detachTransportHandlers();
    await this.transport.close();
  }

  private readonly handleData = (chunk: Buffer): void => {
    try {
      for (const message of this.parser.push(chunk)) {
        this.handleMessage(message);
      }
    } catch (error) {
      const message = error instanceof DapFrameError ? error.message : 'Failed to parse DAP message.';
      this.rejectPending(new DapTransportClosedError(message));
    }
  };

  private readonly handleClosed = (): void => {
    if (this.closed) {
      return;
    }

    this.closed = true;
    this.rejectPending(new DapTransportClosedError());
  };

  private readonly handleTransportError = (error: Error): void => {
    this.rejectPending(error);
  };

  private handleMessage(message: DapProtocolMessage): void {
    if (message.type === 'event') {
      this.emitEvent(message);
      return;
    }

    if (message.type === 'response') {
      this.handleResponse(message);
    }
  }

  private handleResponse(response: DapResponseMessage): void {
    const pending = this.pending.get(response.request_seq);
    if (pending === undefined) {
      return;
    }

    this.pending.delete(response.request_seq);
    if (pending.timeout !== undefined) {
      clearTimeout(pending.timeout);
    }

    if (!response.success) {
      pending.reject(new DapResponseError(response.command, response.request_seq, response.message ?? `DAP request failed: ${response.command}`));
      return;
    }

    pending.resolve(response.body);
  }

  private emitEvent(event: DapEventMessage): void {
    for (const listener of this.eventListeners) {
      listener(event);
    }
  }

  private rejectPending(error: Error): void {
    for (const pending of this.pending.values()) {
      if (pending.timeout !== undefined) {
        clearTimeout(pending.timeout);
      }
      pending.reject(error);
    }
    this.pending.clear();
  }

  private detachTransportHandlers(): void {
    this.transport.readable.removeListener('data', this.handleData);
    this.transport.readable.removeListener('close', this.handleClosed);
    this.transport.readable.removeListener('end', this.handleClosed);
    this.transport.readable.removeListener('error', this.handleTransportError);
  }
}
