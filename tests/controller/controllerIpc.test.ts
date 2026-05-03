import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { createControllerClient } from '../../src/controller/client.js';
import { connectControllerEndpoint, createControllerServerSocket, isControllerAlive, readControllerDiscovery, resolveControllerDiscoveryPath, writeControllerDiscovery, type ControllerDiscovery } from '../../src/controller/ipc.js';
import { startControllerServer, type ControllerStatus } from '../../src/controller/server.js';

let dapCliHome: string;

beforeEach(async () => {
  dapCliHome = await fs.mkdtemp(path.join(os.tmpdir(), 'dap-cli-controller-'));
});

afterEach(async () => {
  await fs.rm(dapCliHome, { recursive: true, force: true });
});

describe('controller discovery and IPC', () => {
  test('creates and reads discovery files under DAP_CLI_HOME state', async () => {
    const discovery = createDiscovery({ dapCliHome, endpointPath: path.join(dapCliHome, 'state', 'controller.sock') });

    await writeControllerDiscovery(discovery, { dapCliHome });

    expect(resolveControllerDiscoveryPath({ dapCliHome })).toBe(path.join(dapCliHome, 'state', 'controller.json'));
    await expect(readControllerDiscovery({ dapCliHome })).resolves.toEqual(discovery);
  });

  test('detects stale discovery when the pid is gone', async () => {
    const discovery = createDiscovery({ dapCliHome, pid: 999_999_999, endpointPath: path.join(dapCliHome, 'missing.sock') });

    await expect(isControllerAlive(discovery)).resolves.toBe(false);
  });

  test('malformed JSON requests receive structured controller errors', async () => {
    const server = await startControllerServer({ dapCliHome });
    const discovery = await readControllerDiscovery({ dapCliHome });
    expect(discovery).toBeDefined();
    const clientSocket = await connectControllerEndpoint(discovery?.endpoint ?? { kind: 'ipc', path: '' });

    const response = await new Promise<string>((resolve, reject) => {
      clientSocket.once('data', chunk => resolve(chunk.toString('utf8')));
      clientSocket.once('error', reject);
      clientSocket.write('not json\n');
    });

    expect(JSON.parse(response)).toEqual({
      id: 'unknown',
      ok: false,
      error: {
        code: 'malformed_request',
        message: 'Malformed JSON request.',
      },
    });

    clientSocket.destroy();
    await server.stop();
  });

  test('controller client times out when an endpoint accepts but never responds', async () => {
    const socket = await createControllerServerSocket(() => undefined, { dapCliHome });
    const discovery = createDiscovery({ dapCliHome, endpointPath: socket.endpoint.kind === 'ipc' ? socket.endpoint.path : '' });
    const client = await createControllerClient({ discovery, timeoutMs: 25 });

    await expect(client.request('controller.status')).rejects.toMatchObject({ code: 'controller_request_timeout' });

    socket.server.close();
  });

  test('server status and shutdown work across separate controller clients', async () => {
    const server = await startControllerServer({ dapCliHome });
    const firstClient = await createControllerClient({ dapCliHome });
    const secondClient = await createControllerClient({ dapCliHome });

    const status = await firstClient.request<ControllerStatus>('controller.status');
    expect(status.pid).toBe(process.pid);
    expect(status.stateDir).toBe(path.join(dapCliHome, 'state'));
    expect(status.logDir).toBe(path.join(dapCliHome, 'logs'));
    expect(status.sessionCount).toBe(0);

    await expect(secondClient.request<{ stopped: boolean }>('controller.shutdown')).resolves.toEqual({ stopped: true });
    await server.closed;

    await expect(readControllerDiscovery({ dapCliHome })).resolves.toBeUndefined();
  });
});

function createDiscovery(options: { dapCliHome: string; endpointPath: string; pid?: number }): ControllerDiscovery {
  const now = '2026-05-02T00:00:00.000Z';
  return {
    version: 1,
    pid: options.pid ?? process.pid,
    endpoint: { kind: 'ipc', path: options.endpointPath },
    stateDir: path.join(options.dapCliHome, 'state'),
    logDir: path.join(options.dapCliHome, 'logs'),
    startedAt: now,
    lastHeartbeatAt: now,
  };
}
