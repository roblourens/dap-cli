import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { main } from '../../src/cli/main.js';
import { getDapCliHome, getDapCliLogDir, getDapCliStateDir } from '../../src/config/paths.js';
import { toJsonString, writeJsonFailure, writeJsonSuccess } from '../../src/cli/output.js';
import { usageError } from '../../src/cli/errors.js';
import { startControllerServer, type ControllerServer } from '../../src/controller/server.js';
import { createCliTestEnv, runCli, runCliHuman, runCliPiped, type CliTestEnv } from '../helpers/runCli.js';

class MemoryStream {
  public readonly chunks: string[] = [];

  public write(chunk: string): boolean {
    this.chunks.push(chunk);
    return true;
  }

  public get output(): string {
    return this.chunks.join('');
  }
}

describe('JSON output contract', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  test('success envelopes contain data and command metadata', () => {
    const stream = new MemoryStream();

    writeJsonSuccess({ pid: 123 }, { command: 'status' }, stream);

    expect(stream.output.endsWith('\n')).toBe(true);
    expect(stream.output.trim().split('\n')).toHaveLength(1);

    const envelope = JSON.parse(stream.output) as {
      ok: true;
      data: { pid: number };
      meta: { command: string; timestamp: string };
    };

    expect(envelope.ok).toBe(true);
    expect(envelope.data).toEqual({ pid: 123 });
    expect(envelope.meta.command).toBe('status');
    expect(envelope.meta.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  test('handled failures write one JSON object to stdout-shaped streams', () => {
    const stream = new MemoryStream();
    const error = usageError('Invalid arguments');

    writeJsonFailure(error, { command: 'launch' }, stream);

    expect(stream.output.endsWith('\n')).toBe(true);
    expect(stream.output.trim().split('\n')).toHaveLength(1);

    const envelope = JSON.parse(stream.output) as {
      ok: false;
      error: { code: string; category: string; exitCode: number; diagnostics: string[] };
      meta: { command: string; timestamp: string };
    };

    expect(envelope.ok).toBe(false);
    expect(envelope.error.code).toBe('usage_error');
    expect(envelope.error.category).toBe('usage');
    expect(envelope.error.exitCode).toBe(2);
    expect(envelope.error.diagnostics.length).toBeGreaterThan(0);
    expect(envelope.meta.command).toBe('launch');
  });

  test('toJsonString returns a single newline-terminated JSON object', () => {
    const json = toJsonString({ ok: true, data: { ready: true }, meta: { command: 'start', timestamp: '2026-05-02T00:00:00.000Z' } });

    expect(json).toBe('{"ok":true,"data":{"ready":true},"meta":{"command":"start","timestamp":"2026-05-02T00:00:00.000Z"}}\n');
  });

  test('main maps handled command failures to stdout JSON and empty stderr', async () => {
    vi.stubEnv('DAP_CLI_HOME', path.join(tmpdir(), `dap-cli-json-output-${Date.now()}`));
    const stdout = new MemoryStream();
    const stderr = new MemoryStream();

    const exitCode = await main(['status'], undefined, { stdout, stderr });

    expect(exitCode).toBe(3);
    expect(stderr.output).toBe('');

    const envelope = JSON.parse(stdout.output) as {
      ok: false;
      error: { code: string; category: string; exitCode: number; diagnostics: string[] };
      meta: { command: string };
    };

    expect(envelope.ok).toBe(false);
    expect(envelope.error.code).toBe('controller_unavailable');
    expect(envelope.error.category).toBe('controller');
    expect(envelope.error.exitCode).toBe(3);
    expect(envelope.error.diagnostics.length).toBeGreaterThan(0);
    expect(envelope.meta.command).toBe('status');
  });

  test('DAP_CLI_HOME controls state and log directories', () => {
    vi.stubEnv('DAP_CLI_HOME', '/tmp/dap-cli-test-home');

    expect(getDapCliHome()).toBe('/tmp/dap-cli-test-home');
    expect(getDapCliStateDir()).toBe('/tmp/dap-cli-test-home/state');
    expect(getDapCliLogDir()).toBe('/tmp/dap-cli-test-home/logs');
  });

  test('default state and log directories live under ~/.dap-cli', () => {
    expect(getDapCliHome({})).toMatch(/[/\\]\.dap-cli$/);
    expect(getDapCliStateDir({})).toMatch(/[/\\]\.dap-cli[/\\]state$/);
    expect(getDapCliLogDir({})).toMatch(/[/\\]\.dap-cli[/\\]logs$/);
  });

  test('root help documents human output options', async () => {
    const result = await runCliHuman(['--help']);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('--human');
    expect(result.stdout).toContain('--no-human');
  });

  test('default success output remains one JSON envelope', async () => {
    const result = await runCli(['stop-controller']);

    expect(result.exitCode, JSON.stringify(result)).toBe(0);
    expect(result.stderr).toBe('');
    expect(result.envelope).toMatchObject({ ok: true });
    expect(typeof (result.envelope as { data: { stopped: unknown } }).data.stopped).toBe('boolean');
  });

  test('--human success output is human text', async () => {
    const result = await runCliHuman(['--human', 'stop-controller'], {
      env: { ...process.env, DAP_CLI_HOME: path.join(tmpdir(), `dap-cli-human-output-${Date.now()}`) },
    });

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe('');
    expect(result.stdout).toContain('Data:');
    expect(result.stdout).toContain('stopped: false');
    expect(result.stdout).not.toContain('Command:');
    expect(result.stdout).not.toContain('Timestamp:');
    expect(result.stdout).not.toContain('{"ok":true');
  });

  test('DAP_CLI_HUMAN selects human output and --no-human restores JSON', async () => {
    const humanEnv = { ...process.env, DAP_CLI_HUMAN: '1' };

    const human = await runCliHuman(['stop-controller'], { env: humanEnv });
    expect(human.exitCode).toBe(0);
    expect(human.stdout).toContain('Data:');
    expect(human.stdout).not.toContain('{"ok":true');
    expect(human.stdout).not.toContain('Command:');

    const json = await runCli(['--no-human', 'stop-controller'], { env: humanEnv });
    expect(json.exitCode, JSON.stringify(json)).toBe(0);
    expect(json.envelope).toMatchObject({ ok: true, data: { stopped: false } });
  });

  test('invalid DAP_CLI_HUMAN is a handled JSON failure on a TTY unless explicitly overridden', async () => {
    const invalidEnv = { ...process.env, DAP_CLI_HUMAN: 'maybe' };

    // runCliHuman simulates a TTY stdout, so env parsing runs and surfaces the env error.
    const invalid = await runCliHuman(['status'], { env: invalidEnv });
    expect(invalid.exitCode).toBe(2);
    expect(invalid.stderr).toBe('');
    const invalidEnvelope = JSON.parse(invalid.stdout) as { ok: false; error: { code: string } };
    expect(invalidEnvelope).toMatchObject({ ok: false, error: { code: 'invalid_output_mode_env' } });

    const overridden = await runCliHuman(['--human', 'status'], { env: invalidEnv });
    expect(overridden.exitCode).toBe(3);
    expect(overridden.stderr).toBe('');
    expect(overridden.stdout).toContain('Error: dap-cli controller is unavailable.');
    expect(overridden.stdout).toContain('Code: controller_unavailable');
    expect(overridden.stdout).not.toContain('invalid_output_mode_env');
  });

  test('non-TTY stdout emits JSON even when DAP_CLI_HUMAN=1 is inherited (Phase 13 headline)', async () => {
    const result = await runCliPiped(['stop-controller'], {
      env: { ...process.env, DAP_CLI_HUMAN: '1', DAP_CLI_HOME: path.join(tmpdir(), `dap-cli-piped-human-${Date.now()}`) },
    });

    expect(result.exitCode, result.stdout).toBe(0);
    expect(result.stderr).toBe('');
    expect(result.stdout).not.toContain('Data:');
    expect(result.stdout).not.toContain('stopped: false');
    const envelope = JSON.parse(result.stdout) as { ok: true; data: { stopped: unknown } };
    expect(envelope).toMatchObject({ ok: true });
    expect(typeof envelope.data.stopped).toBe('boolean');
  });

  test('--human over a piped stdout still produces human output (explicit override)', async () => {
    const result = await runCliPiped(['--human', 'stop-controller'], {
      env: { ...process.env, DAP_CLI_HOME: path.join(tmpdir(), `dap-cli-piped-explicit-human-${Date.now()}`) },
    });

    expect(result.exitCode, result.stdout).toBe(0);
    expect(result.stderr).toBe('');
    expect(result.stdout).toContain('Data:');
    expect(result.stdout).not.toContain('{"ok":true');
  });

  test('non-TTY stdout ignores invalid DAP_CLI_HUMAN values (agent-pipeline safety net)', async () => {
    const result = await runCliPiped(['status'], {
      env: { ...process.env, DAP_CLI_HUMAN: 'maybe', DAP_CLI_HOME: path.join(tmpdir(), `dap-cli-piped-invalid-env-${Date.now()}`) },
    });

    expect(result.exitCode).toBe(3);
    expect(result.stderr).toBe('');
    const envelope = JSON.parse(result.stdout) as { ok: false; error: { code: string } };
    expect(envelope).toMatchObject({ ok: false, error: { code: 'controller_unavailable' } });
    expect(envelope.error.code).not.toBe('invalid_output_mode_env');
  });

  test('launch --json remains a payload parser, not an output-mode flag', async () => {
    const result = await runCli(['launch', '--json', '{not-json']);

    expect(result.exitCode).toBe(2);
    expect(result.stderr).toBe('');
    expect(result.envelope).toMatchObject({ ok: false, error: { code: 'invalid_json' } });
    expect(result.envelope.meta.command).toBe('launch');
  });
});

describe('status JSON envelope reports paused state (gap H-1)', () => {
  let testEnv: CliTestEnv;
  let server: ControllerServer | undefined;

  afterEach(async () => {
    if (server !== undefined) {
      await server.stop();
      server = undefined;
    }
    if (testEnv !== undefined) {
      await testEnv.cleanup();
    }
  });

  test('status data includes paused/stoppedReason/stoppedThreadIds across stopped→continued cycle', async () => {
    testEnv = await createCliTestEnv('dap-cli-paused-projection-');
    server = await startControllerServer({ dapCliHome: testEnv.dapCliHome });

    const launch = await runCli(
      ['launch', '--adapter', 'fake', '--script', 'paused-then-continued', '--name', 'paused-demo'],
      { env: testEnv.env },
    );
    expect(launch.exitCode, JSON.stringify(launch)).toBe(0);

    const stoppedStatus = await runCli(['status', '--name', 'paused-demo'], { env: testEnv.env });
    expect(stoppedStatus.exitCode, JSON.stringify(stoppedStatus)).toBe(0);
    const stoppedEnvelope = stoppedStatus.envelope as {
      ok: true;
      data: { name: string; paused?: boolean; stoppedReason?: string; stoppedThreadIds?: number[] };
    };
    expect(stoppedEnvelope.ok).toBe(true);
    expect(stoppedEnvelope.data.name).toBe('paused-demo');
    expect(stoppedEnvelope.data.paused).toBe(true);
    expect(stoppedEnvelope.data.stoppedReason).toBe('entry');
    expect(stoppedEnvelope.data.stoppedThreadIds).toEqual([1]);

    const cont = await runCli(
      ['request', 'continue', '--name', 'paused-demo', '--json', '{"threadId":1}'],
      { env: testEnv.env },
    );
    expect(cont.exitCode, JSON.stringify(cont)).toBe(0);

    // Allow the asynchronous `continued` event handler to settle before re-reading status.
    await new Promise<void>(resolve => setImmediate(resolve));
    await new Promise<void>(resolve => setImmediate(resolve));

    const runningStatus = await runCli(['status', '--name', 'paused-demo'], { env: testEnv.env });
    expect(runningStatus.exitCode, JSON.stringify(runningStatus)).toBe(0);
    const runningEnvelope = runningStatus.envelope as {
      ok: true;
      data: { paused?: boolean; stoppedReason?: string; stoppedThreadIds?: number[] };
    };
    expect(runningEnvelope.ok).toBe(true);
    expect(runningEnvelope.data.paused).toBe(false);
    expect(runningEnvelope.data.stoppedReason).toBeUndefined();
    expect(runningEnvelope.data.stoppedThreadIds).toBeUndefined();
  });
});

// Plan 05-18 (gap H-2): --include / --exclude event-name filters and an
// honest `warnings: ['limit_exceeded_capacity: ...']` when --limit > capacity.
describe('events JSON envelope filters and warnings (gap H-2)', () => {
  let testEnv: CliTestEnv;
  let server: ControllerServer | undefined;

  afterEach(async () => {
    if (server !== undefined) {
      await server.stop();
      server = undefined;
    }
    if (testEnv !== undefined) {
      await testEnv.cleanup();
    }
  });

  interface EventsEnvelopeData {
    sessionId: string;
    name: string;
    events: Array<{ event: string; cursor: number }>;
    cursor: number;
    dropped: number;
    truncatedToCapacity?: number;
    warnings?: string[];
    capacityByPriority?: { high: number; low: number };
  }

  async function setupSession(): Promise<void> {
    testEnv = await createCliTestEnv('dap-cli-events-filter-');
    server = await startControllerServer({ dapCliHome: testEnv.dapCliHome });

    const launch = await runCli(
      ['launch', '--adapter', 'fake', '--script', 'paused-then-continued', '--name', 'evt-demo'],
      { env: testEnv.env },
    );
    expect(launch.exitCode, JSON.stringify(launch)).toBe(0);
  }

  test('--include returns only the named event types', async () => {
    await setupSession();

    const result = await runCli(['events', '--name', 'evt-demo', '--include', 'stopped'], { env: testEnv.env });
    expect(result.exitCode, JSON.stringify(result)).toBe(0);
    const envelope = result.envelope as { ok: true; data: EventsEnvelopeData };
    expect(envelope.ok).toBe(true);
    expect(envelope.data.events.every(e => e.event === 'stopped')).toBe(true);
    expect(envelope.data.events.length).toBeGreaterThanOrEqual(1);
  });

  test('--exclude strips the named event types', async () => {
    await setupSession();

    const result = await runCli(['events', '--name', 'evt-demo', '--exclude', 'stopped'], { env: testEnv.env });
    expect(result.exitCode, JSON.stringify(result)).toBe(0);
    const envelope = result.envelope as { ok: true; data: EventsEnvelopeData };
    expect(envelope.ok).toBe(true);
    expect(envelope.data.events.every(e => e.event !== 'stopped')).toBe(true);
    // initialized still present
    expect(envelope.data.events.some(e => e.event === 'initialized')).toBe(true);
  });

  test('--include and --exclude combine: include first, then exclude', async () => {
    await setupSession();

    const result = await runCli(['events', '--name', 'evt-demo', '--include', 'stopped,initialized', '--exclude', 'stopped'], { env: testEnv.env });
    expect(result.exitCode, JSON.stringify(result)).toBe(0);
    const envelope = result.envelope as { ok: true; data: EventsEnvelopeData };
    expect(envelope.ok).toBe(true);
    expect(envelope.data.events.every(e => e.event === 'initialized')).toBe(true);
    expect(envelope.data.events.length).toBeGreaterThanOrEqual(1);
  });

  test('--limit exceeding capacity surfaces a warnings array', async () => {
    await setupSession();

    const result = await runCli(['events', '--name', 'evt-demo', '--limit', '9999'], { env: testEnv.env });
    expect(result.exitCode, JSON.stringify(result)).toBe(0);
    const envelope = result.envelope as { ok: true; data: EventsEnvelopeData };
    expect(envelope.ok).toBe(true);
    expect(envelope.data.warnings).toBeDefined();
    expect(envelope.data.warnings?.some(w => w.startsWith('limit_exceeded_capacity:'))).toBe(true);
    expect(envelope.data.truncatedToCapacity).toBeDefined();
  });

  test('--limit within capacity does NOT add warnings', async () => {
    await setupSession();

    const result = await runCli(['events', '--name', 'evt-demo', '--limit', '10'], { env: testEnv.env });
    expect(result.exitCode, JSON.stringify(result)).toBe(0);
    const envelope = result.envelope as { ok: true; data: EventsEnvelopeData };
    expect(envelope.ok).toBe(true);
    expect(envelope.data.warnings).toBeUndefined();
  });

  test('--limit 0 with filters returns no events', async () => {
    await setupSession();

    const result = await runCli(['events', '--name', 'evt-demo', '--include', 'stopped,initialized', '--limit', '0'], { env: testEnv.env });
    expect(result.exitCode, JSON.stringify(result)).toBe(0);
    const envelope = result.envelope as { ok: true; data: EventsEnvelopeData };
    expect(envelope.ok).toBe(true);
    expect(envelope.data.events).toHaveLength(0);
  });
});
