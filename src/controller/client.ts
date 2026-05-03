import type net from 'node:net';
import { CliError, sessionError, type CliErrorAdapterContext, type CliErrorCategory, type CliErrorOptions, type CliErrorRequestContext } from '../cli/errors.js';
import { controllerResponseSchema, type ControllerRequestMethod } from './requests.js';
import { controllerRequestTimeout, controllerUnavailable } from './diagnostics.js';
import { connectControllerEndpoint, isControllerAlive, readControllerDiscovery, type ControllerDiscovery } from './ipc.js';

export interface ControllerClient {
  request<TResponse>(method: ControllerRequestMethod, params?: unknown): Promise<TResponse>;
  close(): Promise<void>;
}

export interface ControllerClientOptions {
  discovery?: ControllerDiscovery;
  dapCliHome?: string | undefined;
  timeoutMs?: number;
}

export async function createControllerClient(options: ControllerClientOptions = {}): Promise<ControllerClient> {
  const discovery = options.discovery ?? await readControllerDiscovery({ dapCliHome: options.dapCliHome });

  if (discovery === undefined || !await isControllerAlive(discovery)) {
    throw controllerUnavailable();
  }

  return new JsonControllerClient(discovery, options.timeoutMs ?? 5_000);
}

class JsonControllerClient implements ControllerClient {
  private nextRequestId = 1;

  public constructor(private readonly discovery: ControllerDiscovery, private readonly timeoutMs: number) {}

  public async request<TResponse>(method: ControllerRequestMethod, params?: unknown): Promise<TResponse> {
    const id = String(this.nextRequestId);
    this.nextRequestId += 1;
    const socket = await connectControllerEndpoint(this.discovery.endpoint, this.timeoutMs);

    try {
      const rawResponse = await this.sendRequest(socket, id, method, params);
      const response = controllerResponseSchema.parse(JSON.parse(rawResponse));

      if (!response.ok) {
        if (response.error.category !== undefined && response.error.exitCode !== undefined) {
          const options: CliErrorOptions = {
            code: response.error.code,
          };
          if (response.error.diagnostics !== undefined) {
            options.diagnostics = response.error.diagnostics;
          }
          if (response.error.sessionId !== undefined) {
            options.sessionId = response.error.sessionId;
          }
          if (response.error.request !== undefined) {
            options.request = toRequestContext(response.error.request);
          }
          if (response.error.adapter !== undefined) {
            options.adapter = toAdapterContext(response.error.adapter);
          }

          throw new CliError(response.error.message, toCliErrorCategory(response.error.category), response.error.exitCode, options);
        }

        if (isSessionErrorCode(response.error.code)) {
          throw sessionError(response.error.message, { code: response.error.code, diagnostics: [response.error.message] });
        }

        throw controllerUnavailable(response.error.message);
      }

      return response.result as TResponse;
    } finally {
      socket.destroy();
    }
  }

  public async close(): Promise<void> {
    return Promise.resolve();
  }

  private async sendRequest(socket: net.Socket, id: string, method: ControllerRequestMethod, params: unknown): Promise<string> {
    return new Promise((resolve, reject) => {
      let buffer = '';
      const timeout = setTimeout(() => {
        cleanup();
        reject(controllerRequestTimeout());
      }, this.timeoutMs);
      const cleanup = (): void => {
        clearTimeout(timeout);
        socket.off('data', onData);
        socket.off('error', onError);
      };
      const onData = (chunk: Buffer): void => {
        buffer += chunk.toString('utf8');
        const newlineIndex = buffer.indexOf('\n');
        if (newlineIndex === -1) {
          return;
        }

        cleanup();
        resolve(buffer.slice(0, newlineIndex));
      };
      const onError = (error: Error): void => {
        cleanup();
        reject(error);
      };

      socket.on('data', onData);
      socket.on('error', onError);
      socket.write(`${JSON.stringify({ id, method, params })}\n`);
    });
  }
}

function toCliErrorCategory(value: string): CliErrorCategory {
  if (value === 'usage' || value === 'controller' || value === 'session' || value === 'dap' || value === 'adapter' || value === 'timeout' || value === 'internal') {
    return value;
  }

  return 'controller';
}

function toRequestContext(value: { command: string; seq?: number | undefined }): CliErrorRequestContext {
  const context: CliErrorRequestContext = { command: value.command };
  if (value.seq !== undefined) {
    context.seq = value.seq;
  }

  return context;
}

function toAdapterContext(value: { descriptorId?: string | undefined; pid?: number | undefined; stderrTail?: string[] | undefined; logPath?: string | undefined }): CliErrorAdapterContext {
  const context: CliErrorAdapterContext = {};
  if (value.descriptorId !== undefined) {
    context.descriptorId = value.descriptorId;
  }
  if (value.pid !== undefined) {
    context.pid = value.pid;
  }
  if (value.stderrTail !== undefined) {
    context.stderrTail = value.stderrTail;
  }
  if (value.logPath !== undefined) {
    context.logPath = value.logPath;
  }

  return context;
}

function isSessionErrorCode(code: string): boolean {
  return code === 'no_sessions' || code === 'no_active_session' || code === 'session_not_found' || code === 'session_unavailable';
}
