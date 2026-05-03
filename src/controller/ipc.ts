import { promises as fs } from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { z } from 'zod';
import { getDapCliLogDir, getDapCliStateDir } from '../config/paths.js';

export type ControllerEndpoint = { kind: 'ipc'; path: string } | { kind: 'tcp'; host: '127.0.0.1'; port: number };

export interface ControllerDiscovery {
  version: 1;
  pid: number;
  endpoint: ControllerEndpoint;
  stateDir: string;
  logDir: string;
  activeSessionId?: string | undefined;
  startedAt: string;
  lastHeartbeatAt: string;
}

export interface ControllerPathOptions {
  dapCliHome?: string | undefined;
  platform?: NodeJS.Platform;
}

export interface ControllerServerSocket {
  server: net.Server;
  endpoint: ControllerEndpoint;
  stateDir: string;
  logDir: string;
}

const controllerEndpointSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('ipc'), path: z.string().min(1) }),
  z.object({ kind: z.literal('tcp'), host: z.literal('127.0.0.1'), port: z.number().int().positive() }),
]);

const controllerDiscoverySchema = z.object({
  version: z.literal(1),
  pid: z.number().int().positive(),
  endpoint: controllerEndpointSchema,
  stateDir: z.string().min(1),
  logDir: z.string().min(1),
  activeSessionId: z.string().min(1).optional(),
  startedAt: z.string().min(1),
  lastHeartbeatAt: z.string().min(1),
});

export function resolveControllerDiscoveryPath(options: ControllerPathOptions = {}): string {
  return path.join(resolveStateDir(options), 'controller.json');
}

export async function readControllerDiscovery(options: ControllerPathOptions = {}): Promise<ControllerDiscovery | undefined> {
  const discoveryPath = resolveControllerDiscoveryPath(options);

  try {
    const raw = await fs.readFile(discoveryPath, 'utf8');
    return controllerDiscoverySchema.parse(JSON.parse(raw));
  } catch (error) {
    if (isNodeError(error) && error.code === 'ENOENT') {
      return undefined;
    }

    throw error;
  }
}

export async function writeControllerDiscovery(discovery: ControllerDiscovery, options: ControllerPathOptions = {}): Promise<void> {
  const discoveryPath = resolveControllerDiscoveryPath(options);
  await fs.mkdir(path.dirname(discoveryPath), { recursive: true });
  await fs.writeFile(discoveryPath, `${JSON.stringify(controllerDiscoverySchema.parse(discovery), null, 2)}\n`, 'utf8');
}

export async function removeControllerDiscovery(options: ControllerPathOptions = {}): Promise<void> {
  const discoveryPath = resolveControllerDiscoveryPath(options);
  await fs.rm(discoveryPath, { force: true });
}

export async function isControllerAlive(discovery: ControllerDiscovery, timeoutMs = 250): Promise<boolean> {
  if (!isPidAlive(discovery.pid)) {
    return false;
  }

  const socket = await connectControllerEndpoint(discovery.endpoint, timeoutMs).catch(() => undefined);
  if (socket === undefined) {
    return false;
  }

  socket.destroy();
  return true;
}

export async function createControllerServerSocket(
  onConnection: (socket: net.Socket) => void,
  options: ControllerPathOptions = {},
): Promise<ControllerServerSocket> {
  const stateDir = resolveStateDir(options);
  const logDir = resolveLogDir(options);
  await fs.mkdir(stateDir, { recursive: true });
  await fs.mkdir(logDir, { recursive: true });

  const endpoint = createControllerEndpoint(stateDir, options.platform ?? process.platform);

  if (endpoint.kind === 'ipc' && process.platform !== 'win32') {
    await fs.rm(endpoint.path, { force: true });
  }

  const server = net.createServer(onConnection);

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    const onListening = (): void => {
      server.off('error', reject);
      resolve();
    };

    if (endpoint.kind === 'ipc') {
      server.listen(endpoint.path, onListening);
      return;
    }

    server.listen(endpoint.port, endpoint.host, onListening);
  });

  return { server, endpoint, stateDir, logDir };
}

export async function connectControllerEndpoint(endpoint: ControllerEndpoint, timeoutMs = 5_000): Promise<net.Socket> {
  return new Promise((resolve, reject) => {
    const socket = endpoint.kind === 'ipc'
      ? net.createConnection(endpoint.path)
      : net.createConnection({ host: endpoint.host, port: endpoint.port });
    const timeout = setTimeout(() => {
      socket.destroy();
      reject(new Error('Timed out connecting to controller.'));
    }, timeoutMs);

    socket.once('connect', () => {
      clearTimeout(timeout);
      resolve(socket);
    });
    socket.once('error', error => {
      clearTimeout(timeout);
      reject(error);
    });
  });
}

function createControllerEndpoint(stateDir: string, platform: NodeJS.Platform): ControllerEndpoint {
  if (platform === 'win32') {
    return { kind: 'ipc', path: `\\\\.\\pipe\\dap-cli-${Buffer.from(stateDir).toString('hex').slice(0, 24)}` };
  }

  return { kind: 'ipc', path: path.join(stateDir, 'controller.sock') };
}

function resolveStateDir(options: ControllerPathOptions): string {
  return getDapCliStateDir(createEnv(options));
}

function resolveLogDir(options: ControllerPathOptions): string {
  return getDapCliLogDir(createEnv(options));
}

function createEnv(options: ControllerPathOptions): NodeJS.ProcessEnv {
  return options.dapCliHome === undefined ? process.env : { ...process.env, DAP_CLI_HOME: options.dapCliHome };
}

function isPidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return isNodeError(error) && error.code === 'EPERM';
  }
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error;
}
