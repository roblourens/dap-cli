import path from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { createControllerClient, type ControllerClient } from '../../src/controller/client.js';
import { startControllerServer, type ControllerServer } from '../../src/controller/server.js';
import { createTempDapCliEnv, type TempDapCliEnv } from '../../src/testing/tempEnv.js';

interface BreakpointsListResult {
  sources: Array<{ source: { path: string }; breakpoints: ReadonlyArray<{ id?: number; verified: boolean; line?: number }>; requested: readonly unknown[] }>;
}

let tempEnv: TempDapCliEnv;
let server: ControllerServer | undefined;
let client: ControllerClient | undefined;
let sessionName: string;

async function launchTrackingSession(name: string, scriptName: string): Promise<void> {
  await client!.request('dap.start', {
    mode: 'launch',
    name,
    descriptor: {
      id: 'fake',
      label: 'Fake adapter (tracking test)',
      transport: {
        kind: 'stdio',
        command: process.execPath,
        args: ['--experimental-strip-types', path.join(process.cwd(), 'tests', 'fixtures', 'fake-adapter-entry.ts'), '--script', scriptName, '--mode', 'launch'],
      },
    },
  });
}

beforeEach(async () => {
  tempEnv = await createTempDapCliEnv('dap-cli-bp-tracking-');
  server = await startControllerServer({ dapCliHome: tempEnv.dapCliHome });
  client = await createControllerClient({ dapCliHome: tempEnv.dapCliHome });
  sessionName = 'bp-tracking';
});

afterEach(async () => {
  if (client !== undefined) {
    await client.close();
    client = undefined;
  }
  if (server !== undefined) {
    await server.stop();
    server = undefined;
  }
  await tempEnv.cleanup();
});

// Phase 12 plan 01 (BPCMD-01/02): controller-side tracking unit coverage.
// Uses the bp-tracking-failure script which scripts setBreakpoints once
// successfully then once with success: false. Asserts the failed call does
// not overwrite the prior tracked entry.
describe('controller breakpoint tracking (Phase 12 plan 01)', () => {
  test('failed setBreakpoints leaves prior tracked entry intact', async () => {
    await launchTrackingSession(sessionName, 'bp-tracking-failure');
    const sourcePath = path.resolve('tmp/bp-tracking-A.js');

    // First setBreakpoints succeeds and is tracked.
    await client!.request('dap.request', {
      command: 'setBreakpoints',
      args: { source: { path: sourcePath }, breakpoints: [{ line: 10 }], lines: [10] },
      name: sessionName,
    });

    const listAfterFirst = await client!.request<BreakpointsListResult>('sessions.breakpoints.list', { name: sessionName });
    expect(listAfterFirst.sources).toHaveLength(1);
    expect(listAfterFirst.sources[0]?.breakpoints).toEqual([{ id: 1, verified: true, line: 10 }]);

    // Second setBreakpoints fails (script returns success: false). Tracking
    // hook is post-success so it must NOT mutate the existing entry.
    await expect(client!.request('dap.request', {
      command: 'setBreakpoints',
      args: { source: { path: sourcePath }, breakpoints: [{ line: 99 }], lines: [99] },
      name: sessionName,
    })).rejects.toMatchObject({ category: 'dap' });

    const listAfterFail = await client!.request<BreakpointsListResult>('sessions.breakpoints.list', { name: sessionName });
    expect(listAfterFail.sources).toHaveLength(1);
    // Original entry must still be present unchanged.
    expect(listAfterFail.sources[0]?.breakpoints).toEqual([{ id: 1, verified: true, line: 10 }]);
  });

  test('dap.request setBreakpoints with empty array deletes the tracked entry', async () => {
    await launchTrackingSession(sessionName, 'bp-tracking-empty');
    const sourcePath = path.resolve('tmp/bp-tracking-B.js');

    await client!.request('dap.request', {
      command: 'setBreakpoints',
      args: { source: { path: sourcePath }, breakpoints: [{ line: 5 }], lines: [5] },
      name: sessionName,
    });
    expect((await client!.request<BreakpointsListResult>('sessions.breakpoints.list', { name: sessionName })).sources).toHaveLength(1);

    await client!.request('dap.request', {
      command: 'setBreakpoints',
      args: { source: { path: sourcePath }, breakpoints: [], lines: [] },
      name: sessionName,
    });
    expect((await client!.request<BreakpointsListResult>('sessions.breakpoints.list', { name: sessionName })).sources).toEqual([]);
  });
});
