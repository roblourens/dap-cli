import { promises as fs } from 'node:fs';
import path from 'node:path';
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

    const capabilities = await runCli(['capabilities', '--name', 'demo'], { env: testEnv.env });
    const capabilitiesEnvelope = parseEnvelope<{ sessionId: string; name: string; adapterId: string; capabilities: { supportsConfigurationDoneRequest?: boolean } }>(capabilities.stdout);
    expect(capabilitiesEnvelope.data.sessionId).toBe(launchEnvelope.data.sessionId);
    expect(capabilitiesEnvelope.data.name).toBe('demo');
    expect(capabilitiesEnvelope.data.adapterId).toBe('fake');
    expect(capabilitiesEnvelope.data.capabilities.supportsConfigurationDoneRequest).toBe(true);

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

  test('launches with explicit fake adapter through registry-aware command path', async () => {
    const launch = await runCli(['launch', '--adapter', 'fake', '--json', '{"program":"json.js"}', '--program', 'flag.js', '--name', 'registry-fake'], { env: testEnv.env });

    expect(launch.exitCode, JSON.stringify(launch)).toBe(0);
    const launchEnvelope = parseEnvelope<{ sessionId: string; name: string; lifecycle: string }>(launch.stdout);
    expect(launchEnvelope.data.sessionId).toMatch(/^sess_/);
    expect(launchEnvelope.data.name).toBe('registry-fake');
    expect(launchEnvelope.data.lifecycle).toBe('stopped');
  });

  test('CLI flags override JSON config and reach launch arguments', async () => {
    const launch = await runCli([
      'launch',
      '--adapter', 'fake',
      '--script', 'expect-launch-overrides',
      '--json', '{"program":"json.js","cwd":"json-cwd"}',
      '--program', 'flag.js',
      '--cwd', 'flag-cwd',
      '--name', 'precedence-test',
    ], { env: testEnv.env });

    expect(launch.exitCode, JSON.stringify(launch)).toBe(0);
  });

  test('attach passes adapter-native config to the DAP attach request', async () => {
    const attach = await runCli([
      'attach',
      '--adapter', 'fake',
      '--script', 'expect-attach-overrides',
      '--json', '{"port":1234}',
      '--port', '4711',
      '--name', 'attach-precedence-test',
    ], { env: testEnv.env });

    expect(attach.exitCode, JSON.stringify(attach)).toBe(0);
  });

  test('rejects malformed numeric CLI override values', async () => {
    const attach = await runCli(['attach', '--adapter', 'fake', '--port', '4711abc'], { env: testEnv.env });
    const failure = attach.envelope as unknown as JsonFailureEnvelope;

    expect(attach.exitCode).toBe(2);
    expect(attach.stderr).toBe('');
    expect(failure.ok).toBe(false);
    expect(failure.error.code).toBe('invalid_number');
  });

  test('custom adapters resolve from persistent config with launch defaults', async () => {
    await writeAdapterConfig(testEnv.dapCliHome, {
      adapters: {
        'custom-fake': createCustomFakeDescriptor('custom-fake', 'expect-launch-overrides', { launchDefaults: { program: 'default.js', cwd: 'default-cwd' } }),
      },
    });

    const launch = await runCli([
      'launch',
      '--adapter', 'custom-fake',
      '--json', '{"program":"json.js","cwd":"json-cwd"}',
      '--program', 'flag.js',
      '--cwd', 'flag-cwd',
      '--name', 'custom-adapter-test',
    ], { env: testEnv.env });

    expect(launch.exitCode, JSON.stringify(launch)).toBe(0);
  });

  test('named .vscode launch config maps through custom type map and merges flags', async () => {
    await writeAdapterConfig(testEnv.dapCliHome, {
      adapters: {
        'named-fake': createCustomFakeDescriptor('named-fake', 'expect-launch-overrides'),
      },
      launchConfigTypeMap: { fakeType: 'named-fake' },
    });
    const launchJsonPath = path.join(process.cwd(), '.vscode', 'launch.json');
    const previousLaunchJson = await readOptionalFile(launchJsonPath);
    await fs.mkdir(path.dirname(launchJsonPath), { recursive: true });
    await fs.writeFile(launchJsonPath, JSON.stringify({
      configurations: [{ type: 'fakeType', name: 'Named Fake', program: 'json.js', cwd: 'json-cwd' }],
    }), 'utf8');

    try {
      const launch = await runCli([
        'launch',
        '--config', 'Named Fake',
        '--program', 'flag.js',
        '--cwd', 'flag-cwd',
        '--name', 'named-config-test',
      ], { env: testEnv.env });

      expect(launch.exitCode, JSON.stringify(launch)).toBe(0);
    } finally {
      if (previousLaunchJson === undefined) {
        await fs.rm(launchJsonPath, { force: true });
      } else {
        await fs.writeFile(launchJsonPath, previousLaunchJson, 'utf8');
      }
    }
  });

  test('reports unknown adapter ids before controller start request', async () => {
    const launch = await runCli(['launch', '--adapter', 'missing-adapter'], { env: testEnv.env });
    const failure = launch.envelope as unknown as JsonFailureEnvelope;

    expect(launch.exitCode).toBe(2);
    expect(launch.stderr).toBe('');
    expect(failure.ok).toBe(false);
    expect(failure.error.code).toBe('adapter_not_found');
    expect(failure.error.category).toBe('usage');
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

  test('preflights unsupported adapter capabilities as handled JSON failures', async () => {
    const launch = await runCli(['launch', '--adapter', 'fake', '--script', 'stopped-on-entry', '--name', 'unsupported'], { env: testEnv.env });
    expect(launch.exitCode).toBe(0);
    const sessionId = (launch.envelope as JsonEnvelope<{ sessionId: string }>).data.sessionId;

    const request = await runCli(['request', 'setVariable', '--name', 'unsupported', '--json', '{"variablesReference":1,"name":"value","value":"2"}'], { env: testEnv.env });
    const failure = request.envelope as unknown as JsonFailureEnvelope;

    expect(request.exitCode).toBe(5);
    expect(request.stderr).toBe('');
    expect(request.stdout.split('\n').filter(line => line.length > 0)).toHaveLength(1);
    expect(failure.ok).toBe(false);
    expect(failure.error.code).toBe('dap_request_unsupported');
    expect(failure.error.category).toBe('dap');
    expect(failure.error.sessionId).toBe(sessionId);
    expect(failure.error.request?.command).toBe('setVariable');
    expect(failure.error.adapter?.descriptorId).toBe('fake');
    expect(failure.error.diagnostics).toContain("Adapter 'fake' did not report capability 'supportsSetVariable' required by request 'setVariable'.");
  });

  test('reports invalid raw request JSON as one handled stdout envelope', async () => {
    const request = await runCli(['request', 'threads', '--json', '{'], { env: testEnv.env });
    const failure = request.envelope as unknown as JsonFailureEnvelope;

    expect(request.exitCode).toBe(2);
    expect(request.stderr).toBe('');
    expect(request.stdout.split('\n').filter(line => line.length > 0)).toHaveLength(1);
    expect(failure.ok).toBe(false);
    expect(failure.error.code).toBe('invalid_json');
    expect(failure.error.category).toBe('usage');
    expect(failure.error.diagnostics).toContain('Invalid JSON argument.');
  });

  test('runs generated DAP commands and inspection aliases through the fake adapter', async () => {
    const launch = await runCli(['launch', '--adapter', 'fake', '--script', 'alias-inspection', '--name', 'inspect'], { env: testEnv.env });
    expect(launch.exitCode).toBe(0);

    const generatedThreads = await runCli(['dap', 'threads', '--name', 'inspect', '--json', '{}'], { env: testEnv.env });
    expect(parseEnvelope<{ threads: Array<{ id: number; name: string }> }>(generatedThreads.stdout).data.threads).toEqual([{ id: 1, name: 'main' }]);

    const breakpoints = await runCli(['breakpoints', 'set', '--source', 'app.ts', '--line', '5', '--name', 'inspect'], { env: testEnv.env });
    expect(parseEnvelope<{ breakpoints: Array<{ verified: boolean; line: number }> }>(breakpoints.stdout).data.breakpoints).toEqual([{ id: 1, verified: true, line: 5 }]);

    const threads = await runCli(['threads', '--name', 'inspect'], { env: testEnv.env });
    expect(parseEnvelope<{ threads: Array<{ id: number; name: string }> }>(threads.stdout).data.threads).toEqual([{ id: 1, name: 'main' }]);

    const stack = await runCli(['stack', '--thread-id', '1', '--name', 'inspect'], { env: testEnv.env });
    expect(parseEnvelope<{ stackFrames: Array<{ id: number; name: string }> }>(stack.stdout).data.stackFrames).toEqual([expect.objectContaining({ id: 10, name: 'main' })]);

    const scopes = await runCli(['scopes', '--frame-id', '10', '--name', 'inspect'], { env: testEnv.env });
    expect(parseEnvelope<{ scopes: Array<{ name: string; variablesReference: number }> }>(scopes.stdout).data.scopes).toEqual([{ name: 'Local', variablesReference: 100, expensive: false }]);

    const variables = await runCli(['variables', '--variables-reference', '100', '--name', 'inspect'], { env: testEnv.env });
    expect(parseEnvelope<{ variables: Array<{ name: string; value: string }> }>(variables.stdout).data.variables).toEqual([{ name: 'value', value: '1', variablesReference: 0 }]);

    const source = await runCli(['source', '--source-reference', '1', '--path', 'app.ts', '--name', 'inspect'], { env: testEnv.env });
    expect(parseEnvelope<{ content: string }>(source.stdout).data.content).toContain('const value = 1;');

    const evaluate = await runCli(['evaluate', '--expression', 'value + 1', '--frame-id', '10', '--context', 'repl', '--name', 'inspect'], { env: testEnv.env });
    expect(parseEnvelope<{ result: string; variablesReference: number }>(evaluate.stdout).data).toEqual({ result: '2', variablesReference: 0 });
  });

  test('runs execution-control aliases through dap.request', async () => {
    const launch = await runCli(['launch', '--adapter', 'fake', '--script', 'execution-control', '--name', 'control'], { env: testEnv.env });
    expect(launch.exitCode).toBe(0);

    const continued = await runCli(['continue', '--thread-id', '1', '--single-thread', '--name', 'control'], { env: testEnv.env });
    expect(parseEnvelope<{ allThreadsContinued: boolean }>(continued.stdout).data.allThreadsContinued).toBe(true);

    const paused = await runCli(['pause', '--thread-id', '1', '--name', 'control'], { env: testEnv.env });
    expect(paused.exitCode).toBe(0);

    const next = await runCli(['next', '--thread-id', '1', '--name', 'control'], { env: testEnv.env });
    expect(next.exitCode).toBe(0);

    const stepIn = await runCli(['step-in', '--thread-id', '1', '--target-id', '2', '--name', 'control'], { env: testEnv.env });
    expect(stepIn.exitCode).toBe(0);

    const stepOut = await runCli(['step-out', '--thread-id', '1', '--name', 'control'], { env: testEnv.env });
    expect(stepOut.exitCode).toBe(0);
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

function createCustomFakeDescriptor(id: string, script: string, defaults: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id,
    label: id,
    transport: {
      kind: 'stdio',
      command: process.execPath,
      args: ['--experimental-strip-types', path.join(process.cwd(), 'tests', 'fixtures', 'fake-adapter-entry.ts'), '--script', script],
    },
    ...defaults,
  };
}

async function writeAdapterConfig(dapCliHome: string, config: Record<string, unknown>): Promise<void> {
  const configDir = path.join(dapCliHome, 'config');
  await fs.mkdir(configDir, { recursive: true });
  await fs.writeFile(path.join(configDir, 'adapters.json'), `${JSON.stringify(config, null, 2)}\n`, 'utf8');
}

async function readOptionalFile(filePath: string): Promise<string | undefined> {
  try {
    return await fs.readFile(filePath, 'utf8');
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      return undefined;
    }
    throw error;
  }
}
