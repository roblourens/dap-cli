import { spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { z } from 'zod';
import { DapFrameError, DapMessageParser, encodeDapMessage } from './framing.js';
import type { DapEventMessage, DapProtocolMessage, DapRequestMessage, DapResponseMessage } from './dapMessages.js';
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

const runInTerminalArgumentsSchema = z.object({
  args: z.array(z.string()).min(1),
  cwd: z.string().optional(),
  env: z.record(z.string(), z.string()).optional(),
});

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
  private readonly childProcesses = new Set<ChildProcess>();
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
    await this.terminateChildProcesses();
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
      return;
    }

    this.handleAdapterRequest(message);
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

  private handleAdapterRequest(request: DapRequestMessage): void {
    if (request.command !== 'runInTerminal') {
      this.writeAdapterResponse(request, false, undefined, `Unsupported adapter request: ${request.command}`);
      return;
    }

    try {
      const body = this.handleRunInTerminal(request.arguments);
      this.writeAdapterResponse(request, true, body);
    } catch (error) {
      this.writeAdapterResponse(request, false, undefined, error instanceof Error ? error.message : 'runInTerminal failed.');
    }
  }

  private writeAdapterResponse(request: DapRequestMessage, success: boolean, body?: unknown, message?: string): void {
    const response: DapResponseMessage = {
      seq: this.nextSeq,
      type: 'response',
      request_seq: request.seq,
      success,
      command: request.command,
    };
    this.nextSeq += 1;
    if (body !== undefined) {
      response.body = body;
    }
    if (message !== undefined) {
      response.message = message;
    }

    this.transport.writable.write(encodeDapMessage(response));
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

  private handleRunInTerminal(argumentsValue: unknown): { processId?: number } {
    const parsed = runInTerminalArgumentsSchema.safeParse(argumentsValue);
    if (!parsed.success) {
      throw new Error('Invalid runInTerminal request arguments.');
    }

    const command = parsed.data.args[0];
    const args = parsed.data.args.slice(1);
    const env = parsed.data.env === undefined ? process.env : { ...process.env, ...parsed.data.env };
    if (command === undefined) {
      throw new Error('Invalid runInTerminal command.');
    }

    const child = spawn(command, args, { cwd: parsed.data.cwd, env, stdio: 'ignore', shell: false });
    this.childProcesses.add(child);
    child.once('exit', () => this.childProcesses.delete(child));

    return child.pid === undefined ? {} : { processId: child.pid };
  }

  private async terminateChildProcesses(): Promise<void> {
    for (const child of this.childProcesses) {
      if (child.exitCode === null && child.signalCode === null) {
        child.kill('SIGTERM');
        if (!await waitForExit(child, 100)) {
          child.kill('SIGKILL');
          await waitForExit(child, 100);
        }
      }
    }
    this.childProcesses.clear();
  }
}

function waitForExit(child: ChildProcess, timeoutMs: number): Promise<boolean> {
  if (child.exitCode !== null || child.signalCode !== null) {
    return Promise.resolve(true);
  }

  return new Promise(resolve => {
    const timer = setTimeout(() => {
      child.off('exit', onExit);
      resolve(false);
    }, timeoutMs);
    const onExit = (): void => {
      clearTimeout(timer);
      resolve(true);
    };
    child.once('exit', onExit);
  });
}

