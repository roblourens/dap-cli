import path from 'node:path';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { startControllerServer, type ControllerServer } from '../../src/controller/server.js';
import { createControllerClient, type ControllerClient } from '../../src/controller/client.js';
import { createCliTestEnv, type CliTestEnv } from '../helpers/runCli.js';
import { helperProcessWarningEventName } from '../../src/sessions/helperProcessDetection.js';

interface CachedEvent {
  event: string;
  body?: unknown;
}

interface EventsRecentResult {
  events: CachedEvent[];
}

let testEnv: CliTestEnv;
let server: ControllerServer | undefined;
let client: ControllerClient | undefined;

beforeEach(async () => {
  testEnv = await createCliTestEnv('dap-cli-helper-detect-');
  server = await startControllerServer({ dapCliHome: testEnv.dapCliHome });
});

afterEach(async () => {
  if (client !== undefined) {
    await client.close().catch(() => undefined);
    client = undefined;
  }
  if (server !== undefined) {
    await server.stop();
    server = undefined;
  }
  await testEnv.cleanup();
});

describe('helper-process detector wiring (integration; Phase 10 plan 03)', () => {
  test('js-debug attach + ppid matches adapter pid: warning event lands in event cache', async () => {
    const observed: Array<{ helperPid: number; adapterPid: number }> = [];
    server!.setHelperProcessLookupPpid(async (helperPid, adapterPid) => {
      observed.push({ helperPid, adapterPid });
      return adapterPid; // force a match
    });

    client = await createControllerClient({ dapCliHome: testEnv.dapCliHome, timeoutMs: 10_000 });
    await client.request('dap.start', {
      mode: 'attach',
      name: 's-pos',
      use: false,
      descriptor: namedFakeDescriptor('js-debug', 'attach-with-process-event', 'attach'),
      config: { request: 'attach' },
    });
    await flushMicrotasks();

    expect(observed).toHaveLength(1);
    expect(observed[0]?.helperPid).toBe(99999);

    const events = await client.request<EventsRecentResult>('events.recent', { name: 's-pos' });
    const warnings = events.events.filter(e => e.event === helperProcessWarningEventName);
    expect(warnings, JSON.stringify(events)).toHaveLength(1);
    const body = warnings[0]?.body as { code?: string; helperPid?: number; adapterPid?: number };
    expect(body.code).toBe('helper_process_detected');
    expect(body.helperPid).toBe(99999);
    expect(body.adapterPid).toBe(observed[0]?.adapterPid);
  });

  test('js-debug attach + ppid mismatches: no warning event', async () => {
    server!.setHelperProcessLookupPpid(async (_helperPid, adapterPid) => adapterPid + 1);

    client = await createControllerClient({ dapCliHome: testEnv.dapCliHome, timeoutMs: 10_000 });
    await client.request('dap.start', {
      mode: 'attach',
      name: 's-miss',
      use: false,
      descriptor: namedFakeDescriptor('js-debug', 'attach-with-process-event', 'attach'),
      config: { request: 'attach' },
    });
    await flushMicrotasks();

    const events = await client.request<EventsRecentResult>('events.recent', { name: 's-miss' });
    const warnings = events.events.filter(e => e.event === helperProcessWarningEventName);
    expect(warnings).toHaveLength(0);
  });

  test('launch-mode session: detector is NOT instantiated (no lookupPpid call)', async () => {
    const lookupPpid = vi.fn(async () => 4242);
    server!.setHelperProcessLookupPpid(lookupPpid);

    client = await createControllerClient({ dapCliHome: testEnv.dapCliHome, timeoutMs: 10_000 });
    await client.request('dap.start', {
      mode: 'launch',
      name: 's-launch',
      use: false,
      descriptor: namedFakeDescriptor('js-debug', 'stopped-on-entry', 'launch'),
      config: { request: 'launch' },
    });
    await flushMicrotasks();

    expect(lookupPpid).not.toHaveBeenCalled();
  });

  test('non-js-debug attach session: detector is NOT instantiated', async () => {
    const lookupPpid = vi.fn(async () => 4242);
    server!.setHelperProcessLookupPpid(lookupPpid);

    client = await createControllerClient({ dapCliHome: testEnv.dapCliHome, timeoutMs: 10_000 });
    await client.request('dap.start', {
      mode: 'attach',
      name: 's-other',
      use: false,
      descriptor: namedFakeDescriptor('not-js-debug', 'attach-with-process-event', 'attach'),
      config: { request: 'attach' },
    });
    await flushMicrotasks();

    expect(lookupPpid).not.toHaveBeenCalled();
  });
});

async function flushMicrotasks(): Promise<void> {
  for (let i = 0; i < 10; i += 1) {
    await Promise.resolve();
  }
}

function namedFakeDescriptor(id: string, script: string, mode: 'launch' | 'attach'): Record<string, unknown> {
  return {
    id,
    label: id,
    transport: {
      kind: 'stdio',
      command: process.execPath,
      args: ['--experimental-strip-types', path.join(process.cwd(), 'tests', 'fixtures', 'fake-adapter-entry.ts'), '--script', script, '--mode', mode],
    },
  };
}
