import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { startControllerServer, type ControllerServer } from '../../src/controller/server.js';
import { createCliTestEnv, runCli, type CliTestEnv } from '../helpers/runCli.js';

interface JsonEnvelope<T> {
  ok: true;
  data: T;
  meta: { command: string; timestamp: string; warnings?: readonly string[] };
}

let testEnv: CliTestEnv;
let server: ControllerServer | undefined;

beforeEach(async () => {
  testEnv = await createCliTestEnv('dap-cli-evaluate-auto-frame-');
  server = await startControllerServer({ dapCliHome: testEnv.dapCliHome });
});

afterEach(async () => {
  if (server !== undefined) {
    await server.stop();
    server = undefined;
  }
  await testEnv.cleanup();
});

// Phase 11 plan 02 (PAUSED-02): evaluate auto-resolves --frame-id from session
// status when omitted on a paused session. Each test uses a dedicated fake
// adapter script that asserts the inbound `evaluate` carries the expected
// frameId (or no frameId on fallback).
describe('evaluate auto-frame (Phase 11 plan 02)', () => {
  test('1: paused with single stopped thread, no --frame-id → resolves frameId from stackTrace', async () => {
    const launch = await runCli(['launch', '--adapter', 'fake', '--script', 'evaluate-auto-frame', '--name', 'auto1'], { env: testEnv.env });
    expect(launch.exitCode, JSON.stringify(launch)).toBe(0);
    expect(parseEnvelope<{ lifecycle: string }>(launch.stdout).data.lifecycle).toBe('stopped');

    const status = await runCli(['status', '--name', 'auto1'], { env: testEnv.env });
    expect(parseEnvelope<{ paused?: boolean; stoppedThreadIds?: number[] }>(status.stdout).data.paused).toBe(true);

    const evaluate = await runCli(['evaluate', '--expression', 'x', '--name', 'auto1'], { env: testEnv.env });
    expect(evaluate.exitCode, JSON.stringify(evaluate)).toBe(0);
    expect(parseEnvelope<{ result: string }>(evaluate.stdout).data.result).toBe('auto');
    // No hint on the single-stopped-thread happy path.
    expect(evaluate.stderr).toBe('');
  });

  test('2: explicit --frame-id is verbatim — no auto-resolution, no hints', async () => {
    const launch = await runCli(['launch', '--adapter', 'fake', '--script', 'evaluate-auto-frame-explicit', '--name', 'auto2'], { env: testEnv.env });
    expect(launch.exitCode, JSON.stringify(launch)).toBe(0);

    const evaluate = await runCli(['evaluate', '--expression', 'x', '--frame-id', '9999', '--name', 'auto2'], { env: testEnv.env });
    expect(evaluate.exitCode, JSON.stringify(evaluate)).toBe(0);
    expect(parseEnvelope<{ result: string }>(evaluate.stdout).data.result).toBe('explicit');
    expect(evaluate.stderr).toBe('');
  });

  test('3: paused with allThreadsStopped (empty stoppedThreadIds) → falls back to threads → stackTrace', async () => {
    const launch = await runCli(['launch', '--adapter', 'fake', '--script', 'evaluate-auto-frame-all-threads', '--name', 'auto3'], { env: testEnv.env });
    expect(launch.exitCode, JSON.stringify(launch)).toBe(0);

    const status = await runCli(['status', '--name', 'auto3'], { env: testEnv.env });
    const statusData = parseEnvelope<{ paused?: boolean; stoppedThreadIds?: number[] }>(status.stdout).data;
    expect(statusData.paused).toBe(true);
    expect(statusData.stoppedThreadIds ?? []).toEqual([]);

    const evaluate = await runCli(['evaluate', '--expression', 'x', '--name', 'auto3'], { env: testEnv.env });
    expect(evaluate.exitCode, JSON.stringify(evaluate)).toBe(0);
    expect(parseEnvelope<{ result: string }>(evaluate.stdout).data.result).toBe('all-threads');
    expect(evaluate.stderr).toBe('');
  });

  test('4: not paused (no stopped event) → sends evaluate with no frameId, emits "session not paused" hint', async () => {
    const launch = await runCli(['launch', '--adapter', 'fake', '--script', 'evaluate-auto-frame-not-paused', '--name', 'auto4'], { env: testEnv.env });
    expect(launch.exitCode, JSON.stringify(launch)).toBe(0);

    const evaluate = await runCli(['evaluate', '--expression', 'x', '--name', 'auto4'], { env: testEnv.env });
    expect(evaluate.exitCode, JSON.stringify(evaluate)).toBe(0);
    const auto4Envelope = parseEnvelope<{ result: string }>(evaluate.stdout);
    expect(auto4Envelope.data.result).toBe('no-frame');
    expect(auto4Envelope.meta.warnings?.some(w => w.includes('session not paused'))).toBe(true);
    expect(evaluate.stderr).toBe('');
  });

  test('5: auto-resolve failure (paused but threads returns []) → falls back, emits "auto-frame failed" hint', async () => {
    const launch = await runCli(['launch', '--adapter', 'fake', '--script', 'evaluate-auto-frame-empty-threads', '--name', 'auto5'], { env: testEnv.env });
    expect(launch.exitCode, JSON.stringify(launch)).toBe(0);

    const evaluate = await runCli(['evaluate', '--expression', 'x', '--name', 'auto5'], { env: testEnv.env });
    expect(evaluate.exitCode, JSON.stringify(evaluate)).toBe(0);
    const auto5Envelope = parseEnvelope<{ result: string }>(evaluate.stdout);
    expect(auto5Envelope.data.result).toBe('no-frame');
    expect(auto5Envelope.meta.warnings?.some(w => w.includes('auto-frame failed'))).toBe(true);
    expect(evaluate.stderr).toBe('');
  });
});

function parseEnvelope<T>(text: string): JsonEnvelope<T> {
  return JSON.parse(text) as JsonEnvelope<T>;
}
