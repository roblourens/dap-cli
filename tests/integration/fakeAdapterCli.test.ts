import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import type { AdapterDescriptor } from '../../src/adapters/descriptor.js';
import { createControllerClient } from '../../src/controller/client.js';
import { startControllerServer, type ControllerServer } from '../../src/controller/server.js';
import { createFakeAdapterScript, startFakeSocketAdapter } from '../../src/testing/fakeAdapter.js';
import { createCliTestEnv, runCli, type CliTestEnv } from '../helpers/runCli.js';

interface JsonEnvelope<T> {
  ok: true;
  data: T;
  meta: { command: string; timestamp: string };
}

interface JsonFailureEnvelope {
  ok: false;
  error: {
    code: string;
    category: string;
    exitCode: number;
    diagnostics: string[];
    sessionId?: string;
    request?: { command: string; seq?: number };
    adapter?: { descriptorId?: string; pid?: number; stderrTail?: string[]; logPath?: string };
  };
  meta: { command: string; timestamp: string };
}

let testEnv: CliTestEnv;
let server: ControllerServer | undefined;

beforeEach(async () => {
  testEnv = await createCliTestEnv('dap-cli-fake-adapter-');
  server = await startControllerServer({ dapCliHome: testEnv.dapCliHome });
});

afterEach(async () => {
  if (server !== undefined) {
    await server.stop();
    server = undefined;
  }
  await testEnv.cleanup();
});

describe('fake adapter controller integration', () => {
  test('launches a fake adapter over stdio and polls status, events, request, stop, and cleanup', async () => {
    const start = await runCli(['start'], { env: testEnv.env });
    expect(start.exitCode).toBe(0);
    const startEnvelope = start.envelope as JsonEnvelope<{ pid: number }>;

    const launch = await runCli(['launch', '--adapter', 'fake', '--script', 'stopped-on-entry', '--name', 'demo'], { env: testEnv.env });
    expect(launch.exitCode, JSON.stringify(launch)).toBe(0);
    const launchEnvelope = parseEnvelope<{ sessionId: string; name: string; lifecycle: string; eventCursor: number }>(launch.stdout);
    expect(launchEnvelope.data.sessionId).toMatch(/^sess_/);
    expect(launchEnvelope.data.name).toBe('demo');
    expect(launchEnvelope.data.lifecycle).toBe('stopped');

    const controllerStatus = await runCli(['status'], { env: testEnv.env });
    const controllerStatusEnvelope = controllerStatus.envelope as JsonEnvelope<{ id: string; name: string; status: string }>;
    expect(controllerStatusEnvelope.data.id).toBe(launchEnvelope.data.sessionId);

    const status = await runCli(['status', '--name', 'demo'], { env: testEnv.env });
    const statusEnvelope = parseEnvelope<{ name: string; status: string; logPath?: string; stderrTail: string[] }>(status.stdout);
    expect(statusEnvelope.data.name).toBe('demo');
    expect(statusEnvelope.data.status).toBe('stopped');
    expect(statusEnvelope.data.logPath).toContain('fake');
    expect(statusEnvelope.data.stderrTail).toEqual([]);

    const sessions = await runCli(['sessions'], { env: testEnv.env });
    const sessionsEnvelope = sessions.envelope as JsonEnvelope<Array<{ id: string; name: string }>>;
    expect(sessionsEnvelope.data).toContainEqual(expect.objectContaining({ id: launchEnvelope.data.sessionId, name: 'demo' }));

    const events = await runCli(['events', '--name', 'demo', '--limit', '5'], { env: testEnv.env });
    const eventsEnvelope = parseEnvelope<{ sessionId: string; name: string; events: Array<{ event: string }>; cursor: number; dropped: number }>(events.stdout);
    expect(eventsEnvelope.data.name).toBe('demo');
    expect(eventsEnvelope.data.events.map(event => event.event)).toContain('stopped');
    expect(eventsEnvelope.data.dropped).toBe(0);

    const cursorPoll = await runCli(['events', '--name', 'demo', '--after-cursor', '0', '--limit', '1'], { env: testEnv.env });
    const cursorPollEnvelope = cursorPoll.envelope as JsonEnvelope<{ events: Array<{ event: string }>; cursor: number; dropped: number }>;
    expect(cursorPollEnvelope.data.events).toHaveLength(1);
    expect(cursorPollEnvelope.data.cursor).toBeGreaterThanOrEqual(launchEnvelope.data.eventCursor);
    expect(cursorPollEnvelope.data.dropped).toBe(0);

    const request = await runCli(['request', 'threads', '--name', 'demo', '--json', '{}'], { env: testEnv.env });
    expect(parseEnvelope<{ threads: Array<{ id: number; name: string }> }>(request.stdout).data.threads).toEqual([{ id: 1, name: 'main' }]);

    const use = await runCli(['use', 'demo'], { env: testEnv.env });
    expect(use.exitCode).toBe(0);

    const stop = await runCli(['stop', '--name', 'demo'], { env: testEnv.env });
    expect(parseEnvelope<{ name: string; status: string }>(stop.stdout).data.status).toBe('terminated');

    const cleanup = await runCli(['cleanup'], { env: testEnv.env });
    expect(parseEnvelope<{ cleaned: string[]; failed: unknown[] }>(cleanup.stdout).data.failed).toEqual([]);
    expect(startEnvelope.data.pid).toBeGreaterThan(0);
  });

  test('attaches a fake adapter and detaches by active session', async () => {
    const attach = await runCli(['attach', '--adapter', 'fake', '--script', 'attach-stopped', '--name', 'worker'], { env: testEnv.env });
    expect(attach.exitCode, JSON.stringify(attach)).toBe(0);
    const attachEnvelope = parseEnvelope<{ sessionId: string; name: string; lifecycle: string }>(attach.stdout);
    expect(attachEnvelope.data.sessionId).toMatch(/^sess_/);
    expect(attachEnvelope.data.name).toBe('worker');
    expect(attachEnvelope.data.lifecycle).toBe('stopped');

    const detach = await runCli(['detach'], { env: testEnv.env });
    expect(parseEnvelope<{ name: string; status: string }>(detach.stdout).data.status).toBe('terminated');
  });

  test('stops the controller when no active session exists', async () => {
    const stop = await runCli(['stop'], { env: testEnv.env });
    expect(stop.exitCode).toBe(0);
    expect((stop.envelope as JsonEnvelope<{ stopped: boolean }>).data.stopped).toBe(true);
    await server?.closed;
    server = undefined;
  });

  test('reports DAP unsuccessful responses with request and session context', async () => {
    const launch = await runCli(['launch', '--adapter', 'fake', '--script', 'failed-threads', '--name', 'broken'], { env: testEnv.env });
    expect(launch.exitCode).toBe(0);
    const sessionId = (launch.envelope as JsonEnvelope<{ sessionId: string }>).data.sessionId;

    const request = await runCli(['request', 'threads', '--name', 'broken', '--json', '{}'], { env: testEnv.env });
    const failure = request.envelope as unknown as JsonFailureEnvelope;

    expect(request.exitCode).toBe(5);
    expect(request.stderr).toBe('');
    expect(failure.ok).toBe(false);
    expect(failure.error.category).toBe('dap');
    expect(failure.error.exitCode).toBe(5);
    expect(failure.error.sessionId).toBe(sessionId);
    expect(failure.error.request?.command).toBe('threads');
    expect(failure.error.diagnostics.length).toBeGreaterThan(0);
  });

  test('reports adapter startup failures with stderr tail and log path diagnostics', async () => {
    const launch = await runCli(['launch', '--adapter', 'fake', '--script', 'stderr-close', '--name', 'bad-adapter'], { env: testEnv.env });
    const failure = launch.envelope as unknown as JsonFailureEnvelope;

    expect(launch.exitCode).toBe(6);
    expect(launch.stderr).toBe('');
    expect(failure.ok).toBe(false);
    expect(failure.error.category).toBe('adapter');
    expect(failure.error.exitCode).toBe(6);
    expect(failure.error.sessionId).toMatch(/^sess_/);
    expect(failure.error.adapter?.descriptorId).toBe('fake');
    expect(failure.error.adapter?.stderrTail).toContain('fake adapter startup failure');
    expect(failure.error.adapter?.logPath).toContain('fake');
    expect(failure.error.diagnostics.length).toBeGreaterThan(0);
  });

  test('starts a fake adapter over socket transport through the controller route', async () => {
    const fakeSocket = await startFakeSocketAdapter(createFakeAdapterScript('stopped-on-entry'));
    const client = await createControllerClient({ dapCliHome: testEnv.dapCliHome });
    const descriptor: AdapterDescriptor = {
      id: 'fake-socket',
      label: 'Generic fake socket adapter',
      transport: { kind: 'socket', host: '127.0.0.1', port: fakeSocket.port },
    };

    try {
      const started = await client.request<{ sessionId: string; lifecycle: string }>('dap.start', {
        mode: 'launch',
        name: 'socket-demo',
        descriptor,
      });
      expect(started.sessionId).toMatch(/^sess_/);
      expect(started.lifecycle).toBe('stopped');

      const events = await client.request<{ name: string; events: Array<{ event: string }>; dropped: number }>('events.recent', { name: 'socket-demo' });
      expect(events.name).toBe('socket-demo');
      expect(events.events.map(event => event.event)).toContain('stopped');
      expect(events.dropped).toBe(0);
      await client.request('sessions.detach', { name: 'socket-demo' });
    } finally {
      await client.close();
      await fakeSocket.close();
    }
  });
});

function parseEnvelope<T>(text: string): JsonEnvelope<T> {
  return JSON.parse(text) as JsonEnvelope<T>;
}
