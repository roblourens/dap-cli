import path from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { startControllerServer, type ControllerServer } from '../../src/controller/server.js';
import { createCliTestEnv, runCli, type CliTestEnv } from '../helpers/runCli.js';

interface JsonEnvelope<T> {
  ok: true;
  data: T;
  meta: { command: string; timestamp: string };
}

interface VerificationDiagnostic {
  unverifiedCount: number;
  totalCount: number;
  loadedSourcesCount: number;
  matchingLoadedSources: Array<{ path: string; name?: string }>;
  hint: string;
  recipe: string;
}

interface BreakpointsSetData {
  breakpoints: Array<{ id?: number; verified: boolean; line?: number }>;
  verificationDiagnostic?: VerificationDiagnostic;
}

let testEnv: CliTestEnv;
let server: ControllerServer | undefined;

beforeEach(async () => {
  testEnv = await createCliTestEnv('dap-cli-bp-verify-');
  server = await startControllerServer({ dapCliHome: testEnv.dapCliHome });
});

afterEach(async () => {
  if (server !== undefined) {
    await server.stop();
    server = undefined;
  }
  await testEnv.cleanup();
});

// Phase 12 plan 02 (BPCMD-03): when `breakpoints set` returns any unverified
// breakpoint, the CLI follows up with a loadedSources probe and attaches a
// structured `verificationDiagnostic` to the success payload. The matrix:
//   (a) all-verified → no diagnostic
//   (b) unverified + 0 loaded sources → wrong-process hint
//   (c) unverified + loaded but no match → source-maps hint
//   (d) unverified + matching loaded source → line-numbers hint
//   (e) unverified + adapter without supportsLoadedSourcesRequest → degraded diagnostic
describe('breakpoints set verification diagnostic (Phase 12 plan 02)', () => {
  test('a: all verified — no diagnostic attached', async () => {
    const launch = await runCli(['launch', '--adapter', 'fake', '--script', 'bp-verify-all', '--name', 'verifyA'], { env: testEnv.env });
    expect(launch.exitCode, JSON.stringify(launch)).toBe(0);

    const set = await runCli(['breakpoints', 'set', '--name', 'verifyA', '--source', path.resolve('tmp/bp-verify-source.js'), '--line', '10'], { env: testEnv.env });
    expect(set.exitCode, JSON.stringify(set)).toBe(0);
    const data = parseEnvelope<BreakpointsSetData>(set.stdout).data;
    expect(data.breakpoints).toEqual([{ id: 1, verified: true, line: 10 }]);
    expect('verificationDiagnostic' in data).toBe(false);
    expect(set.stderr).toBe('');
  });

  test('b: unverified + 0 loaded sources → wrong-process hint', async () => {
    const launch = await runCli(['launch', '--adapter', 'fake', '--script', 'bp-verify-unverified-zero-sources', '--name', 'verifyB'], { env: testEnv.env });
    expect(launch.exitCode, JSON.stringify(launch)).toBe(0);

    const set = await runCli(['breakpoints', 'set', '--name', 'verifyB', '--source', path.resolve('tmp/bp-verify-source.js'), '--line', '10'], { env: testEnv.env });
    expect(set.exitCode, JSON.stringify(set)).toBe(0);
    const diag = parseEnvelope<BreakpointsSetData>(set.stdout).data.verificationDiagnostic;
    expect(diag).toBeDefined();
    expect(diag!.loadedSourcesCount).toBe(0);
    expect(diag!.matchingLoadedSources).toEqual([]);
    expect(diag!.hint).toMatch(/wrong process/);
    expect(diag!.recipe).toBe('dap-cli dap loaded-sources --name verifyB');
    expect(set.stderr).toContain(diag!.hint);
  });

  test('c: unverified + loaded sources but no match → source-maps hint', async () => {
    const launch = await runCli(['launch', '--adapter', 'fake', '--script', 'bp-verify-unverified-no-match', '--name', 'verifyC'], { env: testEnv.env });
    expect(launch.exitCode, JSON.stringify(launch)).toBe(0);

    const set = await runCli(['breakpoints', 'set', '--name', 'verifyC', '--source', path.resolve('tmp/bp-verify-source.js'), '--line', '10'], { env: testEnv.env });
    expect(set.exitCode, JSON.stringify(set)).toBe(0);
    const diag = parseEnvelope<BreakpointsSetData>(set.stdout).data.verificationDiagnostic;
    expect(diag).toBeDefined();
    expect(diag!.loadedSourcesCount).toBe(1);
    expect(diag!.matchingLoadedSources).toEqual([]);
    expect(diag!.hint).toMatch(/none match/);
    expect(diag!.hint).toMatch(/source maps/);
    expect(set.stderr).toContain(diag!.hint);
  });

  test('d: unverified + matching loaded source → line-numbers hint', async () => {
    const launch = await runCli(['launch', '--adapter', 'fake', '--script', 'bp-verify-unverified-match', '--name', 'verifyD'], { env: testEnv.env });
    expect(launch.exitCode, JSON.stringify(launch)).toBe(0);

    // The fake adapter scenario reports a loaded source named bp-verify-source.js,
    // so the CLI must pass --source with that basename to trigger a basename match.
    const set = await runCli(['breakpoints', 'set', '--name', 'verifyD', '--source', path.resolve('tmp/bp-verify-source.js'), '--line', '10'], { env: testEnv.env });
    expect(set.exitCode, JSON.stringify(set)).toBe(0);
    const diag = parseEnvelope<BreakpointsSetData>(set.stdout).data.verificationDiagnostic;
    expect(diag).toBeDefined();
    expect(diag!.loadedSourcesCount).toBe(1);
    expect(diag!.matchingLoadedSources).toHaveLength(1);
    expect(diag!.hint).toMatch(/Check breakpoint line numbers/);
    expect(set.stderr).toContain(diag!.hint);
  });

  test('e: unverified + adapter without supportsLoadedSourcesRequest → degraded diagnostic', async () => {
    const launch = await runCli(['launch', '--adapter', 'fake', '--script', 'bp-verify-no-loaded-sources-cap', '--name', 'verifyE'], { env: testEnv.env });
    expect(launch.exitCode, JSON.stringify(launch)).toBe(0);

    const set = await runCli(['breakpoints', 'set', '--name', 'verifyE', '--source', path.resolve('tmp/bp-verify-source.js'), '--line', '10'], { env: testEnv.env });
    expect(set.exitCode, JSON.stringify(set)).toBe(0);
    const diag = parseEnvelope<BreakpointsSetData>(set.stdout).data.verificationDiagnostic;
    expect(diag).toBeDefined();
    expect(diag!.loadedSourcesCount).toBe(-1);
    expect(diag!.matchingLoadedSources).toEqual([]);
    expect(diag!.hint).toMatch(/does not support loadedSources/);
    expect(set.stderr).toContain(diag!.hint);
  });
});

function parseEnvelope<T>(text: string): JsonEnvelope<T> {
  return JSON.parse(text) as JsonEnvelope<T>;
}
