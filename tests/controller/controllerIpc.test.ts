import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { createControllerClient } from '../../src/controller/client.js';
import { connectControllerEndpoint, createControllerServerSocket, isControllerAlive, readControllerDiscovery, resolveControllerDiscoveryPath, writeControllerDiscovery, type ControllerDiscovery } from '../../src/controller/ipc.js';
import { startControllerServer, type ControllerHelloResult, type ControllerStatus } from '../../src/controller/server.js';
import { resetCachedBuildIdForTesting } from '../../src/controller/buildId.js';
import { runCli } from '../helpers/runCli.js';
import type { JsonFailure } from '../../src/cli/output.js';

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

  // Round 6 R6-A regression: when the controller half-closes the connection
  // mid-request without sending a payload, the client used to wait for the
  // per-request timeout (up to 60s for `launch`). With the close/end
  // listeners wired in sendRequest, it must reject promptly with a
  // structured controller-disconnected envelope.
  test('controller client rejects promptly when controller closes connection without responding', async () => {
    const socket = await createControllerServerSocket(clientSocket => {
      // Close the connection immediately, simulating a stop-controller race
      // where the controller tears down while the client request is in flight.
      clientSocket.end();
    }, { dapCliHome });
    const discovery = createDiscovery({ dapCliHome, endpointPath: socket.endpoint.kind === 'ipc' ? socket.endpoint.path : '' });
    // Use a long timeout so the test fails fast (rejecting in <100ms) only
    // when the close/end listeners actually wire up the rejection path.
    const client = await createControllerClient({ discovery, timeoutMs: 30_000 });

    const start = Date.now();
    await expect(client.request('controller.status')).rejects.toMatchObject({ code: 'controller_unavailable' });
    expect(Date.now() - start).toBeLessThan(2_000);

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

  test('controller.hello returns a non-empty buildId and the controller pid', async () => {
    const server = await startControllerServer({ dapCliHome });
    const client = await createControllerClient({ dapCliHome });

    const hello = await client.request<ControllerHelloResult>('controller.hello');
    expect(hello.pid).toBe(process.pid);
    expect(typeof hello.buildId).toBe('string');
    expect(hello.buildId.length).toBeGreaterThan(0);

    const status = await client.request<ControllerStatus>('controller.status');
    expect(status.buildId).toBe(hello.buildId);

    await client.request<{ stopped: boolean }>('controller.shutdown');
    await server.closed;
  });

  test('controller.shutdown leaves subsequent connect attempts unable to handshake', async () => {
    const server = await startControllerServer({ dapCliHome });
    const discovery = await readControllerDiscovery({ dapCliHome });
    expect(discovery).toBeDefined();
    const client = await createControllerClient({ dapCliHome });
    await client.request<{ stopped: boolean }>('controller.shutdown');
    await server.closed;

    // Discovery file is removed by stop().
    await expect(readControllerDiscovery({ dapCliHome })).resolves.toBeUndefined();

    // A fresh discovery pointing at the now-dead endpoint should fail isControllerAlive.
    if (discovery !== undefined) {
      await expect(isControllerAlive(discovery)).resolves.toBe(false);
    }
  });

  test('dap-cli stop-controller shuts down a running controller', async () => {
    process.env.DAP_CLI_HOME = dapCliHome;
    try {
      const server = await startControllerServer({ dapCliHome });
      const result = await runCli(['stop-controller'], { env: { ...process.env, DAP_CLI_HOME: dapCliHome } });
      expect(result.exitCode).toBe(0);
      expect(result.envelope.ok).toBe(true);
      await server.closed;
      await expect(readControllerDiscovery({ dapCliHome })).resolves.toBeUndefined();
    } finally {
      delete process.env.DAP_CLI_HOME;
    }
  });

  test('dap-cli start refuses reuse when controller build id mismatches', async () => {
    process.env.DAP_CLI_HOME = dapCliHome;
    process.env.DAP_CLI_BUILD_ID = 'test-build-controller';
    resetCachedBuildIdForTesting();
    const server = await startControllerServer({ dapCliHome });
    try {
      process.env.DAP_CLI_BUILD_ID = 'test-build-cli';
      resetCachedBuildIdForTesting();
      const result = await runCli(['start'], { env: { ...process.env, DAP_CLI_HOME: dapCliHome } });
      expect(result.envelope.ok).toBe(false);
      const failure = result.envelope as JsonFailure;
      expect(failure.error.code).toBe('controller_build_mismatch');
      expect(failure.error.diagnostics.some(d => d.includes('test-build-controller'))).toBe(true);
      expect(failure.error.diagnostics.some(d => d.includes('test-build-cli'))).toBe(true);
      expect(failure.error.diagnostics.some(d => d.includes('`dap-cli stop-controller`'))).toBe(true);
    } finally {
      delete process.env.DAP_CLI_BUILD_ID;
      delete process.env.DAP_CLI_HOME;
      resetCachedBuildIdForTesting();
      await server.stop().catch(() => undefined);
    }
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
