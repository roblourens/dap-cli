import { promises as fs } from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { startControllerServer, type ControllerServer } from '../../src/controller/server.js';
import { createCliTestEnv, runCli, type CliTestEnv } from '../helpers/runCli.js';

interface JsonEnvelope<T> {
  ok: true;
  data: T;
  meta: { command: string; timestamp: string };
}

interface DapStartData {
  sessionId: string;
  name: string;
  lifecycle: string;
  warnings?: string[];
  autoRouted?: { code: string; from: string; to: string; configName: string | null };
}

let testEnv: CliTestEnv;
let server: ControllerServer | undefined;

beforeEach(async () => {
  testEnv = await createCliTestEnv('dap-cli-auto-route-int-');
  server = await startControllerServer({ dapCliHome: testEnv.dapCliHome });
});

afterEach(async () => {
  if (server !== undefined) {
    await server.stop();
    server = undefined;
  }
  await testEnv.cleanup();
});

describe('--config auto-route (integration; Phase 10 plan 01)', () => {
  test('launch --config <attach-shaped> sends DAP attach to the fake adapter', async () => {
    // The fake adapter validates the requested mode against the script's
    // expected `attach` step. If the auto-route did NOT fire, the fake
    // adapter would receive `--mode launch` while the `attach-stopped`
    // script expects an `attach` step, and the lifecycle would fail with a
    // transport-closed error. A clean exitCode 0 + autoRouted.to='attach'
    // proves the on-the-wire DAP request was actually `attach`.
    const workspace = await createWorkspace(testEnv.dapCliHome, 'attach-only', [
      { name: 'AttachShaped', type: 'fake', request: 'attach' },
    ]);

    const launch = await runCli([
      'launch',
      '--workspace', workspace,
      '--adapter', 'fake',
      '--config', 'AttachShaped',
      '--name', 'auto-route-int',
    ], { env: testEnv.env });

    expect(launch.exitCode, JSON.stringify(launch)).toBe(0);
    const envelope = launch.envelope as JsonEnvelope<DapStartData>;
    expect(envelope.meta.command).toBe('attach');
    expect(envelope.data.lifecycle).toBe('stopped');
    expect(envelope.data.autoRouted?.to).toBe('attach');
    expect(envelope.data.autoRouted?.from).toBe('launch');
    expect(envelope.data.autoRouted?.configName).toBe('AttachShaped');
  });
});

async function createWorkspace(parentDir: string, name: string, configurations: Array<Record<string, unknown>>): Promise<string> {
  const ws = path.join(parentDir, name);
  await fs.mkdir(path.join(ws, '.vscode'), { recursive: true });
  await fs.writeFile(
    path.join(ws, '.vscode', 'launch.json'),
    `${JSON.stringify({ version: '0.2.0', configurations }, null, 2)}\n`,
    'utf8',
  );
  return ws;
}
