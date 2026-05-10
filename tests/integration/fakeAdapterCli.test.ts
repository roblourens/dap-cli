import { promises as fs } from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import type { AdapterDescriptor } from '../../src/adapters/descriptor.js';
import { createControllerClient } from '../../src/controller/client.js';
import { startControllerServer, type ControllerServer } from '../../src/controller/server.js';
import { createFakeAdapterScript, startFakeSocketAdapter } from '../../src/testing/fakeAdapter.js';
import { startMultiChildFakeSocketAdapter, type ConnectionScript } from '../../src/testing/multiChildFakeAdapter.js';
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
    data?: Record<string, unknown>;
  };
  meta: { command: string; timestamp: string };
}

interface CompoundStartResult {
  compoundId: string;
  name: string;
  stopAll: boolean;
  members: Array<{ sessionId: string; name: string; lifecycle: string; capabilities: unknown; eventCursor: number }>;
}

type LaunchConfigEntryOutput =
  | { kind: 'configuration'; name: string; type: string; request?: string }
  | { kind: 'compound'; name: string; configurations: string[]; stopAll?: boolean };

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
    // Plan 05-20 (gap H-4): cleanup envelope is now
    // { signaledAdapter, removedRecords, keptRunning, failed } — the old
    // misleading `cleaned` field is gone.
    expect(parseEnvelope<{ signaledAdapter: string[]; removedRecords: string[]; keptRunning: unknown[]; failed: unknown[] }>(cleanup.stdout).data.failed).toEqual([]);
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

  test('--stop-on-entry forwards stopOnEntry: true into the launch arguments', async () => {
    const launch = await runCli([
      'launch',
      '--adapter', 'fake',
      '--script', 'expect-stop-on-entry',
      '--stop-on-entry',
      '--name', 'soe-test',
    ], { env: testEnv.env });

    expect(launch.exitCode, JSON.stringify(launch)).toBe(0);
    const launchEnvelope = parseEnvelope<{ sessionId: string; lifecycle: string }>(launch.stdout);
    expect(launchEnvelope.data.sessionId).toMatch(/^sess_/);
    expect(launchEnvelope.data.lifecycle).toBe('stopped');
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

  test('launch --workspace resolves named launch configs and lets flags override JSON and named config', async () => {
    const workspace = await createLaunchWorkspace('workspace-launch', {
      configurations: [{ type: 'fakeType', name: 'Named Fake', request: 'launch', program: '${workspaceFolder}/app.js', cwd: '${workspaceFolder}' }],
    });
    await writeAdapterConfig(testEnv.dapCliHome, {
      adapters: {
        'named-fake': createCustomFakeDescriptor('named-fake', 'expect-workspace-launch'),
      },
      launchConfigTypeMap: { fakeType: 'named-fake' },
    });

    const launch = await runCli([
      'launch',
      '--workspace', workspace,
      '--config', 'Named Fake',
      '--json', '{"customField":"json"}',
      '--program', path.join(workspace, 'from-flag.js'),
      '--name', 'workspace-config-test',
    ], {
      env: {
        ...testEnv.env,
        DAP_CLI_EXPECT_PROGRAM: path.join(workspace, 'from-flag.js'),
        DAP_CLI_EXPECT_CWD: workspace,
      },
    });

    expect(launch.exitCode, JSON.stringify(launch)).toBe(0);
  });

  test('attach --workspace resolves named attach configs through attach adapters', async () => {
    const workspace = await createLaunchWorkspace('workspace-attach', {
      configurations: [{ type: 'fakeType', name: 'Attach Fake', request: 'attach', program: '${workspaceFolder}/worker.js', cwd: '${workspaceFolder}' }],
    });
    await writeAdapterConfig(testEnv.dapCliHome, {
      adapters: {
        'named-fake': createCustomFakeDescriptor('named-fake', 'expect-workspace-attach'),
      },
      launchConfigTypeMap: { fakeType: 'named-fake' },
    });

    const attach = await runCli([
      'attach',
      '--workspace', workspace,
      '--config', 'Attach Fake',
      '--name', 'workspace-attach-test',
    ], {
      env: {
        ...testEnv.env,
        DAP_CLI_EXPECT_PROGRAM: path.join(workspace, 'worker.js'),
        DAP_CLI_EXPECT_CWD: workspace,
      },
    });

    expect(attach.exitCode, JSON.stringify(attach)).toBe(0);
  });

  test('launch --workspace --config starts every compound member with derived names', async () => {
    const workspace = await createLaunchWorkspace('workspace-compound-launch', {
      configurations: [
        { type: 'fakeType', name: 'Server', request: 'launch', program: '${workspaceFolder}/server.js' },
        { type: 'fakeType', name: 'Client', request: 'launch', program: '${workspaceFolder}/client.js' },
      ],
      compounds: [{ name: 'Compound Fake', configurations: ['Server', 'Client'] }],
    });
    await writeAdapterConfig(testEnv.dapCliHome, {
      adapters: {
        'named-fake': createCustomFakeDescriptor('named-fake', 'stopped-on-entry'),
      },
      launchConfigTypeMap: { fakeType: 'named-fake' },
    });

    const launch = await runCli(['launch', '--workspace', workspace, '--config', 'Compound Fake', '--name', 'ignored'], { env: testEnv.env });
    const envelope = launch.envelope as JsonEnvelope<CompoundStartResult>;

    expect(launch.exitCode, JSON.stringify(launch)).toBe(0);
    expect(envelope.data.name).toBe('Compound Fake');
    expect(envelope.data.stopAll).toBe(true);
    expect(envelope.data.members.map(member => member.name)).toEqual(['Compound Fake/Server', 'Compound Fake/Client']);

    const sessions = await runCli(['sessions'], { env: testEnv.env });
    const sessionsEnvelope = sessions.envelope as JsonEnvelope<Array<{ name: string; compound?: { name: string; stopAll: boolean } }>>;
    expect(sessionsEnvelope.data).toEqual([
      expect.objectContaining({ name: 'Compound Fake/Server', compound: expect.objectContaining({ name: 'Compound Fake', stopAll: true }) }),
      expect.objectContaining({ name: 'Compound Fake/Client', compound: expect.objectContaining({ name: 'Compound Fake', stopAll: true }) }),
    ]);
  });

  test('launch --workspace --config preflights missing compound members before controller IPC', async () => {
    await server?.stop();
    server = undefined;
    const workspace = await createLaunchWorkspace('workspace-compound-missing-member', {
      configurations: [{ type: 'fakeType', name: 'Server', request: 'launch', program: 'server.js' }],
      compounds: [{ name: 'Broken Compound', configurations: ['Server', 'Missing'] }],
    });

    const launch = await runCli(['launch', '--workspace', workspace, '--config', 'Broken Compound'], { env: testEnv.env });
    const failure = launch.envelope as unknown as JsonFailureEnvelope;

    expect(launch.exitCode).toBe(2);
    expect(failure.error.code).toBe('compound_member_not_found');
    expect(failure.error.data).toEqual({ workspaceFolder: workspace, compoundName: 'Broken Compound', memberName: 'Missing' });
  });

  test('close cascades to compound peers when stopAll is true', async () => {
    const workspace = await createLaunchWorkspace('workspace-compound-stop-all', {
      configurations: [
        { type: 'fakeType', name: 'Server', request: 'launch', program: 'server.js' },
        { type: 'fakeType', name: 'Client', request: 'launch', program: 'client.js' },
      ],
      compounds: [{ name: 'Stop All Compound', configurations: ['Server', 'Client'] }],
    });
    await writeAdapterConfig(testEnv.dapCliHome, {
      adapters: {
        'named-fake': createCustomFakeDescriptor('named-fake', 'stopped-on-entry'),
      },
      launchConfigTypeMap: { fakeType: 'named-fake' },
    });

    const launch = await runCli(['launch', '--workspace', workspace, '--config', 'Stop All Compound'], { env: testEnv.env });
    expect(launch.exitCode, JSON.stringify(launch)).toBe(0);

    const close = await runCli(['close', 'Stop All Compound/Server'], { env: testEnv.env });
    expect(close.exitCode, JSON.stringify(close)).toBe(0);

    const sessions = await runCli(['sessions'], { env: testEnv.env });
    expect((sessions.envelope as JsonEnvelope<unknown[]>).data).toEqual([]);
  });

  test('close leaves compound peers when stopAll is false', async () => {
    const workspace = await createLaunchWorkspace('workspace-compound-no-stop-all', {
      configurations: [
        { type: 'fakeType', name: 'Server', request: 'launch', program: 'server.js' },
        { type: 'fakeType', name: 'Client', request: 'launch', program: 'client.js' },
      ],
      compounds: [{ name: 'Independent Compound', configurations: ['Server', 'Client'], stopAll: false }],
    });
    await writeAdapterConfig(testEnv.dapCliHome, {
      adapters: {
        'named-fake': createCustomFakeDescriptor('named-fake', 'stopped-on-entry'),
      },
      launchConfigTypeMap: { fakeType: 'named-fake' },
    });

    const launch = await runCli(['launch', '--workspace', workspace, '--config', 'Independent Compound'], { env: testEnv.env });
    expect(launch.exitCode, JSON.stringify(launch)).toBe(0);

    const close = await runCli(['close', 'Independent Compound/Server'], { env: testEnv.env });
    expect(close.exitCode, JSON.stringify(close)).toBe(0);

    const sessions = await runCli(['sessions'], { env: testEnv.env });
    const sessionsEnvelope = sessions.envelope as JsonEnvelope<Array<{ name: string }>>;
    expect(sessionsEnvelope.data).toEqual([expect.objectContaining({ name: 'Independent Compound/Client' })]);
  });

  test('controller stop reaps session-store records for runtimes it tears down', async () => {
    // Round 5 stress regression: before the fix, controller.shutdown
    // killed adapter pids in `terminateRuntime` but never removed the
    // matching session-store records. The next `dap-cli start` then
    // inherited ghost `running` records, blocking same-name relaunches
    // with `session_name_in_use` and surfacing dead adapter logs via
    // `events`/`status` / `session_unavailable`. The fix persists
    // closeSession() calls BEFORE the slow runtime teardown so a racing
    // CLI restart sees an empty store.
    const launch = await runCli(['launch', '--adapter', 'fake', '--script', 'stopped-on-entry', '--name', 'reap-demo'], { env: testEnv.env });
    expect(launch.exitCode, JSON.stringify(launch)).toBe(0);

    const beforeSessions = await runCli(['sessions'], { env: testEnv.env });
    expect((beforeSessions.envelope as JsonEnvelope<Array<{ name: string }>>).data)
      .toContainEqual(expect.objectContaining({ name: 'reap-demo' }));

    // Call server.stop() directly so we deterministically exercise the
    // shutdown path without racing the IPC client.
    await server?.stop();
    server = undefined;

    const sessionStorePath = path.join(testEnv.dapCliHome, 'state', 'sessions.json');
    const persisted = JSON.parse(await fs.readFile(sessionStorePath, 'utf8')) as { sessions: unknown[] };
    expect(persisted.sessions).toEqual([]);

    server = await startControllerServer({ dapCliHome: testEnv.dapCliHome });
    const afterSessions = await runCli(['sessions'], { env: testEnv.env });
    expect((afterSessions.envelope as JsonEnvelope<unknown[]>).data).toEqual([]);

    const relaunch = await runCli(['launch', '--adapter', 'fake', '--script', 'stopped-on-entry', '--name', 'reap-demo'], { env: testEnv.env });
    expect(relaunch.exitCode, JSON.stringify(relaunch)).toBe(0);
  });

  test('launch --workspace --list-configs lists configurations and compounds without controller IPC', async () => {
    await server?.stop();
    server = undefined;
    const workspace = await createLaunchWorkspace('workspace-list-launch', {
      configurations: [{ type: 'fakeType', name: 'Named Fake', request: 'launch', program: 'app.js' }],
      compounds: [{ name: 'Compound Fake', configurations: ['Named Fake'], stopAll: false }],
    });

    const result = await runCli(['launch', '--workspace', workspace, '--list-configs'], { env: testEnv.env });
    const envelope = result.envelope as JsonEnvelope<LaunchConfigEntryOutput[]>;

    expect(result.exitCode, JSON.stringify(result)).toBe(0);
    expect(envelope.meta.command).toBe('launch configs');
    expect(envelope.data).toEqual([
      { kind: 'configuration', name: 'Named Fake', type: 'fakeType', request: 'launch' },
      { kind: 'compound', name: 'Compound Fake', configurations: ['Named Fake'], stopAll: false },
    ]);
  });

  test('attach --workspace --list-configs uses the same discovery data without requiring --config', async () => {
    await server?.stop();
    server = undefined;
    const workspace = await createLaunchWorkspace('workspace-list-attach', {
      configurations: [{ type: 'fakeType', name: 'Attach Fake', request: 'attach', program: 'worker.js' }],
      compounds: [{ name: 'Attach Compound', configurations: ['Attach Fake'] }],
    });

    const result = await runCli(['attach', '--workspace', workspace, '--list-configs'], { env: testEnv.env });
    const envelope = result.envelope as JsonEnvelope<LaunchConfigEntryOutput[]>;

    expect(result.exitCode, JSON.stringify(result)).toBe(0);
    expect(envelope.meta.command).toBe('launch configs');
    expect(envelope.data).toEqual([
      { kind: 'configuration', name: 'Attach Fake', type: 'fakeType', request: 'attach' },
      { kind: 'compound', name: 'Attach Compound', configurations: ['Attach Fake'] },
    ]);
  });

  test('launch.json compound fixture lists configurations and compounds', async () => {
    await server?.stop();
    server = undefined;

    const result = await runCli(['launch', '--workspace', fixtureWorkspacePath(), '--list-configs'], { env: fixtureEnv() });
    const envelope = result.envelope as JsonEnvelope<LaunchConfigEntryOutput[]>;

    expect(result.exitCode, JSON.stringify(result)).toBe(0);
    expect(envelope.data).toEqual([
      { kind: 'configuration', name: 'Fixture Single', type: 'fakeFixtureLaunchA', request: 'launch' },
      { kind: 'configuration', name: 'Fixture Launch A', type: 'fakeFixtureLaunchA', request: 'launch' },
      { kind: 'configuration', name: 'Fixture Attach B', type: 'fakeFixtureAttachB', request: 'attach' },
      { kind: 'configuration', name: 'Fixture Broken B', type: 'fakeFixtureBrokenB', request: 'launch' },
      { kind: 'compound', name: 'Fixture Compound', configurations: ['Fixture Launch A', 'Fixture Attach B'] },
      { kind: 'compound', name: 'Fixture Independent Compound', configurations: ['Fixture Launch A', 'Fixture Attach B'], stopAll: false },
      { kind: 'compound', name: 'Fixture Broken Compound', configurations: ['Fixture Launch A', 'Fixture Broken B'] },
    ]);
  });

  test('launch.json compound fixture starts targetable members and routes DAP requests', async () => {
    await writeFixtureAdapterConfig();

    const launch = await runCli(['launch', '--workspace', fixtureWorkspacePath(), '--config', 'Fixture Compound'], { env: fixtureEnv() });
    const launchEnvelope = launch.envelope as JsonEnvelope<CompoundStartResult>;

    expect(launch.exitCode, JSON.stringify(launch)).toBe(0);
    expect(launchEnvelope.data.name).toBe('Fixture Compound');
    expect(launchEnvelope.data.stopAll).toBe(true);
    expect(launchEnvelope.data.members.map(member => member.name)).toEqual(['Fixture Compound/Fixture Launch A', 'Fixture Compound/Fixture Attach B']);

    const sessions = await runCli(['sessions'], { env: fixtureEnv() });
    const sessionsEnvelope = sessions.envelope as JsonEnvelope<Array<{ name: string; targetable?: boolean; compound?: { name: string; memberName: string; stopAll: boolean } }>>;
    expect(sessionsEnvelope.data).toEqual([
      expect.objectContaining({ name: 'Fixture Compound/Fixture Launch A', compound: expect.objectContaining({ name: 'Fixture Compound', memberName: 'Fixture Launch A', stopAll: true }) }),
      expect.objectContaining({ name: 'Fixture Compound/Fixture Attach B', compound: expect.objectContaining({ name: 'Fixture Compound', memberName: 'Fixture Attach B', stopAll: true }) }),
    ]);
    expect(sessionsEnvelope.data.every(session => session.targetable !== false)).toBe(true);

    const launchThreads = await runCli(['request', 'threads', '--name', 'Fixture Compound/Fixture Launch A', '--json', '{}'], { env: fixtureEnv() });
    expect(parseEnvelope<{ threads: Array<{ id: number; name: string }> }>(launchThreads.stdout).data.threads).toEqual([{ id: 1, name: 'main' }]);

    const attachThreads = await runCli(['request', 'threads', '--name', 'Fixture Compound/Fixture Attach B', '--json', '{}'], { env: fixtureEnv() });
    expect(parseEnvelope<{ threads: Array<{ id: number; name: string }> }>(attachThreads.stdout).data.threads).toEqual([{ id: 1, name: 'main' }]);

    const close = await runCli(['close', 'Fixture Compound/Fixture Launch A'], { env: fixtureEnv() });
    expect(close.exitCode, JSON.stringify(close)).toBe(0);
    const afterClose = await runCli(['sessions'], { env: fixtureEnv() });
    expect((afterClose.envelope as JsonEnvelope<unknown[]>).data).toEqual([]);
  });

  test('launch.json compound fixture honors stopAll false on close', async () => {
    await writeFixtureAdapterConfig();

    const launch = await runCli(['launch', '--workspace', fixtureWorkspacePath(), '--config', 'Fixture Independent Compound'], { env: fixtureEnv() });
    expect(launch.exitCode, JSON.stringify(launch)).toBe(0);

    const close = await runCli(['close', 'Fixture Independent Compound/Fixture Launch A'], { env: fixtureEnv() });
    expect(close.exitCode, JSON.stringify(close)).toBe(0);

    const sessions = await runCli(['sessions'], { env: fixtureEnv() });
    const sessionsEnvelope = sessions.envelope as JsonEnvelope<Array<{ name: string; compound?: { stopAll: boolean } }>>;
    expect(sessionsEnvelope.data).toEqual([expect.objectContaining({ name: 'Fixture Independent Compound/Fixture Attach B', compound: expect.objectContaining({ stopAll: false }) })]);
  });

  test('launch.json compound fixture cleans up partial startup failures', async () => {
    await writeFixtureAdapterConfig();

    const launch = await runCli(['launch', '--workspace', fixtureWorkspacePath(), '--config', 'Fixture Broken Compound'], { env: fixtureEnv() });
    const failure = launch.envelope as unknown as JsonFailureEnvelope;

    expect(launch.exitCode).toBe(5);
    expect(failure.error.code).toBe('compound_member_start_failed');
    expect(failure.error.data).toEqual({ compoundName: 'Fixture Broken Compound', memberName: 'Fixture Broken B', startedMembers: ['Fixture Launch A'] });

    const sessions = await runCli(['sessions'], { env: fixtureEnv() });
    expect((sessions.envelope as JsonEnvelope<unknown[]>).data).toEqual([]);
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

  test('breakpoints set forwards conditional breakpoint metadata to DAP', async () => {
    const launch = await runCli(['launch', '--adapter', 'fake', '--script', 'expect-conditional-breakpoints', '--name', 'conditional-alias'], { env: testEnv.env });
    expect(launch.exitCode, JSON.stringify(launch)).toBe(0);

    const breakpoints = await runCli([
      'breakpoints', 'set',
      '--name', 'conditional-alias',
      '--source', 'app.js',
      '--line', '5', '9',
      '--condition', 'left > 3',
      '--hit-condition', '2',
      '--log-message', 'left={left}',
    ], { env: testEnv.env });
    expect(breakpoints.exitCode, JSON.stringify(breakpoints)).toBe(0);

    const stop = await runCli(['stop', '--name', 'conditional-alias'], { env: testEnv.env });
    expect(stop.exitCode, JSON.stringify(stop)).toBe(0);
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

  test('auto-resolves --thread-id to the unique stopped thread for stack and continue', async () => {
    const launch = await runCli(['launch', '--adapter', 'fake', '--script', 'auto-thread-resolve', '--name', 'auto-tid'], { env: testEnv.env });
    expect(launch.exitCode, JSON.stringify(launch)).toBe(0);

    const stack = await runCli(['stack', '--name', 'auto-tid', '--levels', '1'], { env: testEnv.env });
    expect(stack.exitCode, JSON.stringify(stack)).toBe(0);
    expect(parseEnvelope<{ stackFrames: Array<{ id: number }> }>(stack.stdout).data.stackFrames).toEqual([expect.objectContaining({ id: 10 })]);
    expect(stack.stderr).toContain('--thread-id not provided');

    const continued = await runCli(['continue', '--name', 'auto-tid'], { env: testEnv.env });
    expect(continued.exitCode, JSON.stringify(continued)).toBe(0);
    expect(parseEnvelope<{ allThreadsContinued: boolean }>(continued.stdout).data.allThreadsContinued).toBe(true);
    expect(continued.stderr).toContain('--thread-id not provided');
  });

  test('parent status reflects multi-child stop and survives a sibling terminated; --thread-id auto-resolves to the paused child (PAUSED-UNION-01 / PAUSED-ROUTE-01)', async () => {
    // Phase 18 S-02 regression test driven through the real CLI / controller
    // / ChildSessionCoordinator stack via a multi-child fake socket adapter.
    //
    // Shape of the repro (see CONTEXT.md):
    //   - parent connects, emits two startDebugging reverse-requests
    //   - child 0 (bootloader analog) initializes, then later emits
    //     `terminated` AFTER child 1 emits `stopped`
    //   - child 1 (the real target) emits `stopped { reason: 'breakpoint',
    //     threadId: 0 }`, answers stackTrace / evaluate / continue
    //
    // Pre-Phase-18 mirror behaviour: child 0's `terminated` clobbered the
    // parent's paused-state set by child 1's `stopped`. Phase 18 fix:
    // per-child paused-state union + paused-first routing.

    let resolveChildOneStopped!: () => void;
    const childOneStopped = new Promise<void>(resolve => { resolveChildOneStopped = resolve; });

    const parent: ConnectionScript = {
      dispatch(req, ctx) {
        if (req.command === 'initialize') {
          ctx.emitEvent('initialized');
          return { ok: true, body: { supportsConfigurationDoneRequest: true } };
        }
        if (req.command === 'attach') {
          ctx.emitReverseRequest('startDebugging', {
            request: 'attach',
            configuration: { type: 'fake', name: 'child-0', __pendingTargetId: 'tgt-0' },
          });
          ctx.emitReverseRequest('startDebugging', {
            request: 'attach',
            configuration: { type: 'fake', name: 'child-1', __pendingTargetId: 'tgt-1' },
          });
          return { ok: true };
        }
        if (req.command === 'threads') {
          return { ok: true, body: { threads: [] } };
        }
        return { ok: true };
      },
    };

    const childZero: ConnectionScript = {
      async dispatch(req, ctx) {
        if (req.command === 'initialize') {
          ctx.emitEvent('initialized');
          return { ok: true, body: { supportsConfigurationDoneRequest: true } };
        }
        if (req.command === 'configurationDone') {
          // Schedule terminated AFTER child 1 has emitted stopped — this is
          // the S-02 ordering that exposed the bug.
          void childOneStopped.then(() => {
            setTimeout(() => ctx.emitEvent('terminated'), 50);
          });
          return { ok: true };
        }
        if (req.command === 'threads') {
          return { ok: true, body: { threads: [{ id: 0, name: 'bootloader' }] } };
        }
        return { ok: true };
      },
    };

    const childOne: ConnectionScript = {
      dispatch(req, ctx) {
        if (req.command === 'initialize') {
          ctx.emitEvent('initialized');
          return { ok: true, body: { supportsConfigurationDoneRequest: true } };
        }
        if (req.command === 'configurationDone') {
          // Stop AFTER configurationDone so the controller has finished the
          // child handshake by the time the parent observes paused state.
          setImmediate(() => {
            ctx.emitEvent('stopped', { reason: 'breakpoint', threadId: 0, allThreadsStopped: false });
            resolveChildOneStopped();
          });
          return { ok: true };
        }
        if (req.command === 'threads') {
          return { ok: true, body: { threads: [{ id: 0, name: 'main' }] } };
        }
        if (req.command === 'stackTrace') {
          return {
            ok: true,
            body: {
              stackFrames: [{ id: 200, name: 'someFn', line: 42, column: 1, source: { path: '/tmp/fake-multi.js', name: 'fake-multi.js' } }],
              totalFrames: 1,
            },
          };
        }
        if (req.command === 'evaluate') {
          return { ok: true, body: { result: 'ok', variablesReference: 0 } };
        }
        if (req.command === 'continue') {
          setImmediate(() => {
            ctx.emitEvent('continued', { threadId: 0, allThreadsContinued: true });
            ctx.emitEvent('terminated');
          });
          return { ok: true, body: { allThreadsContinued: true } };
        }
        return { ok: true };
      },
    };

    const adapter = await startMultiChildFakeSocketAdapter({ parent, children: [childZero, childOne] });
    const client = await createControllerClient({ dapCliHome: testEnv.dapCliHome });

    try {
      const descriptor: AdapterDescriptor = {
        id: 'fake-multi-socket',
        label: 'Phase 18 multi-child fake socket adapter',
        transport: { kind: 'socket', host: '127.0.0.1', port: adapter.port },
      };
      const started = await client.request<{ sessionId: string; lifecycle: string }>('dap.start', {
        mode: 'attach',
        name: 'multi',
        descriptor,
      });
      expect(started.sessionId).toMatch(/^sess_/);

      // Poll status until paused appears on the parent. With Phase 17 / 18
      // the parent's paused-state mirror reflects the child's stopped.
      const pollPaused = async (): Promise<{ status: string; paused: boolean; stoppedThreadIds?: readonly number[] }> => {
        const deadline = Date.now() + 5_000;
        while (Date.now() < deadline) {
          const status = await runCli(['status', '--name', 'multi'], { env: testEnv.env });
          if (status.exitCode === 0) {
            const data = parseEnvelope<{ status: string; paused?: boolean; stoppedThreadIds?: readonly number[] }>(status.stdout).data;
            if (data.paused === true) {
              return { status: data.status, paused: true, ...(data.stoppedThreadIds !== undefined ? { stoppedThreadIds: data.stoppedThreadIds } : {}) };
            }
          }
          await new Promise<void>(resolve => setTimeout(resolve, 50));
        }
        const stderr = await runCli(['status', '--name', 'multi'], { env: testEnv.env });
        throw new Error(`parent never reached paused=true within 5s. last status: ${stderr.stdout} stderr: ${stderr.stderr}`);
      };
      const initialPaused = await pollPaused();
      expect(initialPaused.paused).toBe(true);
      expect(initialPaused.stoppedThreadIds).toEqual([0]);

      // S-02 regression: wait long enough for child 0's terminated event to
      // have arrived, then re-poll. Pre-Phase-18 this would have flipped
      // parent.paused back to false.
      await new Promise<void>(resolve => setTimeout(resolve, 200));
      const status2 = await runCli(['status', '--name', 'multi'], { env: testEnv.env });
      const status2Data = parseEnvelope<{ paused?: boolean; stoppedThreadIds?: readonly number[] }>(status2.stdout).data;
      expect(status2Data.paused, `parent flipped to paused=false after sibling terminated — S-02 regression`).toBe(true);
      expect(status2Data.stoppedThreadIds).toEqual([0]);

      // stack auto-resolves --thread-id to the paused child's thread (0).
      const stack = await runCli(['stack', '--name', 'multi', '--levels', '1'], { env: testEnv.env });
      expect(stack.exitCode, JSON.stringify(stack)).toBe(0);
      const frames = parseEnvelope<{ stackFrames: Array<{ id: number; name: string }> }>(stack.stdout).data.stackFrames;
      expect(frames).toHaveLength(1);
      expect(frames[0]!.id).toBe(200);
      expect(stack.stderr).toContain('--thread-id not provided');

      const evaluate = await runCli(['evaluate', '--name', 'multi', '--expression', 'x', '--frame-id', '200'], { env: testEnv.env });
      expect(evaluate.exitCode, JSON.stringify(evaluate)).toBe(0);
      expect(parseEnvelope<{ result: string }>(evaluate.stdout).data.result).toBe('ok');

      const continued = await runCli(['continue', '--name', 'multi'], { env: testEnv.env });
      expect(continued.exitCode, JSON.stringify(continued)).toBe(0);
      expect(parseEnvelope<{ allThreadsContinued: boolean }>(continued.stdout).data.allThreadsContinued).toBe(true);
    } finally {
      await client.close();
      await adapter.close();
    }
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

  test('dap.startCompound starts fake members with derived names and compound metadata', async () => {
    const client = await createControllerClient({ dapCliHome: testEnv.dapCliHome });

    try {
      const result = await client.request<CompoundStartResult>('dap.startCompound', {
        name: 'Compound Fake',
        stopAll: true,
        use: true,
        members: [
          { memberName: 'Server', mode: 'launch', descriptor: createCustomFakeDescriptor('fake', 'stopped-on-entry'), config: { request: 'launch', program: 'server.js' } },
          { memberName: 'Client', mode: 'launch', descriptor: createCustomFakeDescriptor('fake', 'stopped-on-entry'), config: { request: 'launch', program: 'client.js' } },
        ],
      });

      expect(result.name).toBe('Compound Fake');
      expect(result.compoundId).toMatch(/^compound_/);
      expect(result.stopAll).toBe(true);
      expect(result.members.map(member => member.name)).toEqual(['Compound Fake/Server', 'Compound Fake/Client']);
      expect(result.members.every(member => member.lifecycle === 'stopped')).toBe(true);

      const sessions = await client.request<Array<{ id: string; name: string; compound?: { id: string; name: string; memberName: string; stopAll: boolean; members: string[] } }>>('sessions.list');
      expect(sessions).toEqual([
        expect.objectContaining({
          id: result.members[0]?.sessionId,
          name: 'Compound Fake/Server',
          compound: { id: result.compoundId, name: 'Compound Fake', memberName: 'Server', stopAll: true, members: ['Server', 'Client'] },
        }),
        expect.objectContaining({
          id: result.members[1]?.sessionId,
          name: 'Compound Fake/Client',
          compound: { id: result.compoundId, name: 'Compound Fake', memberName: 'Client', stopAll: true, members: ['Server', 'Client'] },
        }),
      ]);
    } finally {
      await client.close();
    }
  });

  test('dap.startCompound cleans up started members when a later member fails', async () => {
    const client = await createControllerClient({ dapCliHome: testEnv.dapCliHome });

    try {
      await expect(client.request('dap.startCompound', {
        name: 'Broken Compound',
        stopAll: true,
        use: true,
        members: [
          { memberName: 'Good', mode: 'launch', descriptor: createCustomFakeDescriptor('fake', 'stopped-on-entry'), config: { request: 'launch', program: 'good.js' } },
          { memberName: 'Bad', mode: 'launch', descriptor: createCustomFakeDescriptor('fake', 'attach-stopped'), config: { request: 'launch', program: 'bad.js' } },
        ],
      })).rejects.toMatchObject({
        code: 'compound_member_start_failed',
        category: 'dap',
        data: {
          compoundName: 'Broken Compound',
          memberName: 'Bad',
          startedMembers: ['Good'],
        },
      });

      await expect(client.request('sessions.list')).resolves.toEqual([]);
    } finally {
      await client.close();
    }
  });

  test('launch with attach-only script returns structured error within 5s and leaves the controller alive', async () => {
    // Plan 05-07 / UAT gap 14 — a bad fake-adapter script must not hang or kill the controller.
    const startedAt = Date.now();
    const launch = await runCli(['launch', '--adapter', 'fake', '--script', 'attach-stopped', '--name', 'badscript', '--no-use'], { env: testEnv.env });
    const elapsedMs = Date.now() - startedAt;

    expect(elapsedMs, `launch took ${elapsedMs}ms — exceeded 5s budget`).toBeLessThan(5_000);
    const failure = launch.envelope as unknown as JsonFailureEnvelope;
    expect(failure.ok).toBe(false);
    expect(['lifecycle_handshake_timeout', 'adapter_transport_closed', 'fake_script_mode_mismatch']).toContain(failure.error.code);

    // Controller must still answer subsequent requests.
    const sessions = await runCli(['sessions'], { env: testEnv.env });
    expect(sessions.exitCode).toBe(0);
    const sessionsEnvelope = sessions.envelope as JsonEnvelope<unknown>;
    expect(sessionsEnvelope.ok).toBe(true);
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

async function createLaunchWorkspace(name: string, launchJson: Record<string, unknown>): Promise<string> {
  const workspace = path.join(testEnv.dapCliHome, name);
  await fs.mkdir(path.join(workspace, '.vscode'), { recursive: true });
  await fs.writeFile(path.join(workspace, '.vscode', 'launch.json'), `${JSON.stringify(launchJson, null, 2)}\n`, 'utf8');
  return workspace;
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

function fixtureWorkspacePath(): string {
  return path.join(process.cwd(), 'tests', 'fixtures', 'dap-cli-target');
}

function fixtureEnv(): NodeJS.ProcessEnv {
  return { ...testEnv.env, DAP_CLI_COMPOUND_FIXTURE: 'fixture-env' };
}

async function writeFixtureAdapterConfig(): Promise<void> {
  await writeAdapterConfig(testEnv.dapCliHome, {
    adapters: {
      'fixture-launch-a': createCustomFakeDescriptor('fixture-launch-a', 'expect-compound-launch-member-a', {
        transport: {
          kind: 'stdio',
          command: process.execPath,
          args: ['--experimental-strip-types', path.join(process.cwd(), 'tests', 'fixtures', 'fake-adapter-entry.ts'), '--script', 'expect-compound-launch-member-a'],
          env: { DAP_CLI_COMPOUND_FIXTURE: 'fixture-env' },
        },
      }),
      'fixture-attach-b': createCustomFakeDescriptor('fixture-attach-b', 'expect-compound-attach-member-b', {
        transport: {
          kind: 'stdio',
          command: process.execPath,
          args: ['--experimental-strip-types', path.join(process.cwd(), 'tests', 'fixtures', 'fake-adapter-entry.ts'), '--script', 'expect-compound-attach-member-b'],
          env: { DAP_CLI_COMPOUND_FIXTURE: 'fixture-env' },
        },
      }),
      'fixture-broken-b': createCustomFakeDescriptor('fixture-broken-b', 'compound-startup-fails-after-initialize', {
        transport: {
          kind: 'stdio',
          command: process.execPath,
          args: ['--experimental-strip-types', path.join(process.cwd(), 'tests', 'fixtures', 'fake-adapter-entry.ts'), '--script', 'compound-startup-fails-after-initialize'],
          env: { DAP_CLI_COMPOUND_FIXTURE: 'fixture-env' },
        },
      }),
    },
    launchConfigTypeMap: {
      fakeFixtureLaunchA: 'fixture-launch-a',
      fakeFixtureAttachB: 'fixture-attach-b',
      fakeFixtureBrokenB: 'fixture-broken-b',
    },
  });
}
