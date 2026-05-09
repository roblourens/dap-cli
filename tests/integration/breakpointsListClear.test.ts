import path from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { startControllerServer, type ControllerServer } from '../../src/controller/server.js';
import { createCliTestEnv, runCli, type CliTestEnv } from '../helpers/runCli.js';

interface JsonEnvelope<T> {
  ok: true;
  data: T;
  meta: { command: string; timestamp: string };
}

interface JsonFailureEnvelope {
  ok: false;
  error: { code: string; category: string; exitCode: number; diagnostics: string[] };
  meta: { command: string; timestamp: string };
}

interface BreakpointsSetData {
  breakpoints: Array<{ id?: number; verified: boolean; line?: number }>;
}

interface BreakpointsListData {
  sources: Array<{
    source: { path: string };
    breakpoints: Array<{ id?: number; verified: boolean; line?: number }>;
    requested: unknown[];
  }>;
}

interface BreakpointsClearData {
  cleared: Array<{ source: { path: string }; requested: number }>;
}

let testEnv: CliTestEnv;
let server: ControllerServer | undefined;

beforeEach(async () => {
  testEnv = await createCliTestEnv('dap-cli-bp-list-clear-');
  server = await startControllerServer({ dapCliHome: testEnv.dapCliHome });
});

afterEach(async () => {
  if (server !== undefined) {
    await server.stop();
    server = undefined;
  }
  await testEnv.cleanup();
});

// Phase 12 plan 01 (BPCMD-01/02): controller-side breakpoint tracking +
// CLI subcommands `breakpoints list` and `breakpoints clear`.
describe('breakpoints list and clear (Phase 12 plan 01)', () => {
  test('tracks setBreakpoints across two sources, list returns both', async () => {
    const launch = await runCli(['launch', '--adapter', 'fake', '--script', 'bp-list-clear', '--name', 'bp1'], { env: testEnv.env });
    expect(launch.exitCode, JSON.stringify(launch)).toBe(0);

    const sourceA = path.resolve('tmp/bp-list-clear-A.js');
    const sourceB = path.resolve('tmp/bp-list-clear-B.js');

    const setA = await runCli(['breakpoints', 'set', '--name', 'bp1', '--source', sourceA, '--line', '10', '20'], { env: testEnv.env });
    expect(setA.exitCode, JSON.stringify(setA)).toBe(0);
    expect(parseEnvelope<BreakpointsSetData>(setA.stdout).data.breakpoints).toHaveLength(2);

    const setB = await runCli(['breakpoints', 'set', '--name', 'bp1', '--source', sourceB, '--line', '30'], { env: testEnv.env });
    expect(setB.exitCode, JSON.stringify(setB)).toBe(0);

    const listAll = await runCli(['breakpoints', 'list', '--name', 'bp1'], { env: testEnv.env });
    expect(listAll.exitCode, JSON.stringify(listAll)).toBe(0);
    const listAllData = parseEnvelope<BreakpointsListData>(listAll.stdout).data;
    expect(listAllData.sources).toHaveLength(2);
    const paths = listAllData.sources.map(s => s.source.path);
    expect(paths).toContain(sourceA);
    expect(paths).toContain(sourceB);
    const aEntry = listAllData.sources.find(s => s.source.path === sourceA);
    expect(aEntry?.breakpoints).toEqual([
      { id: 1, verified: true, line: 10 },
      { id: 2, verified: true, line: 20 },
    ]);

    const listFiltered = await runCli(['breakpoints', 'list', '--name', 'bp1', '--source', sourceA], { env: testEnv.env });
    const listFilteredData = parseEnvelope<BreakpointsListData>(listFiltered.stdout).data;
    expect(listFilteredData.sources).toHaveLength(1);
    expect(listFilteredData.sources[0]?.source.path).toBe(sourceA);

    const listUnknown = await runCli(['breakpoints', 'list', '--name', 'bp1', '--source', '/nonexistent/path.js'], { env: testEnv.env });
    expect(listUnknown.exitCode).toBe(0);
    expect(parseEnvelope<BreakpointsListData>(listUnknown.stdout).data.sources).toEqual([]);

    const clearA = await runCli(['breakpoints', 'clear', '--name', 'bp1', '--source', sourceA], { env: testEnv.env });
    expect(clearA.exitCode, JSON.stringify(clearA)).toBe(0);
    const clearAData = parseEnvelope<BreakpointsClearData>(clearA.stdout).data;
    expect(clearAData.cleared).toHaveLength(1);
    expect(clearAData.cleared[0]?.source.path).toBe(sourceA);

    const listAfterClearA = await runCli(['breakpoints', 'list', '--name', 'bp1'], { env: testEnv.env });
    const listAfterClearAData = parseEnvelope<BreakpointsListData>(listAfterClearA.stdout).data;
    expect(listAfterClearAData.sources.map(s => s.source.path)).toEqual([sourceB]);

    const clearAll = await runCli(['breakpoints', 'clear', '--name', 'bp1'], { env: testEnv.env });
    expect(clearAll.exitCode, JSON.stringify(clearAll)).toBe(0);
    const clearAllData = parseEnvelope<BreakpointsClearData>(clearAll.stdout).data;
    expect(clearAllData.cleared.map(c => c.source.path)).toEqual([sourceB]);

    const listAfterClearAll = await runCli(['breakpoints', 'list', '--name', 'bp1'], { env: testEnv.env });
    expect(parseEnvelope<BreakpointsListData>(listAfterClearAll.stdout).data.sources).toEqual([]);

    // Idempotent clear of unknown source returns success with empty cleared array.
    const clearUnknown = await runCli(['breakpoints', 'clear', '--name', 'bp1', '--source', '/nonexistent/path.js'], { env: testEnv.env });
    expect(clearUnknown.exitCode).toBe(0);
    expect(parseEnvelope<BreakpointsClearData>(clearUnknown.stdout).data.cleared).toEqual([]);
  });

  test('list against unknown session returns session_not_found', async () => {
    const launch = await runCli(['launch', '--adapter', 'fake', '--script', 'stopped-on-entry', '--name', 'bp-other'], { env: testEnv.env });
    expect(launch.exitCode, JSON.stringify(launch)).toBe(0);

    const list = await runCli(['breakpoints', 'list', '--name', 'doesNotExist'], { env: testEnv.env });
    expect(list.exitCode).not.toBe(0);
    const failure = list.envelope as unknown as JsonFailureEnvelope;
    expect(failure.ok).toBe(false);
    expect(failure.error.code).toBe('session_not_found');
  });
});

function parseEnvelope<T>(text: string): JsonEnvelope<T> {
  return JSON.parse(text) as JsonEnvelope<T>;
}
