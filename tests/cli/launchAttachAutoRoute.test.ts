import { promises as fs } from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { startControllerServer, type ControllerServer } from '../../src/controller/server.js';
import { createCliTestEnv, runCli, type CliTestEnv } from '../helpers/runCli.js';

interface AutoRoutedField {
  code: string;
  from: 'launch' | 'attach';
  to: 'launch' | 'attach';
  configName: string | null;
}

interface DapStartData {
  sessionId: string;
  name: string;
  lifecycle: string;
  warnings?: string[];
  autoRouted?: AutoRoutedField;
}

interface JsonEnvelope<T> {
  ok: true;
  data: T;
  meta: { command: string; timestamp: string };
}

let testEnv: CliTestEnv;
let server: ControllerServer | undefined;
let workspace: string;

beforeEach(async () => {
  testEnv = await createCliTestEnv('dap-cli-auto-route-');
  server = await startControllerServer({ dapCliHome: testEnv.dapCliHome });
  workspace = await createWorkspaceWithLaunchJson(testEnv.dapCliHome);
});

afterEach(async () => {
  if (server !== undefined) {
    await server.stop();
    server = undefined;
  }
  await testEnv.cleanup();
});

describe('--config auto-route by request field (Phase 10 plan 01)', () => {
  test('launch verb + attach-shaped config routes to attach with warning', async () => {
    const result = await runCli([
      'launch',
      '--workspace', workspace,
      '--adapter', 'fake',
      '--config', 'AttachShaped',
      '--name', 's1',
    ], { env: testEnv.env });

    expect(result.exitCode, JSON.stringify(result)).toBe(0);
    const envelope = result.envelope as JsonEnvelope<DapStartData>;
    expect(envelope.ok).toBe(true);
    expect(envelope.meta.command).toBe('attach');
    expect(envelope.data.autoRouted).toEqual({
      code: 'auto_routed_to',
      from: 'launch',
      to: 'attach',
      configName: 'AttachShaped',
    });
    expect(envelope.data.warnings).toHaveLength(1);
    expect(envelope.data.warnings?.[0]).toContain('auto_routed_to');
  });

  test('attach verb + launch-shaped config routes to launch with warning', async () => {
    const result = await runCli([
      'attach',
      '--workspace', workspace,
      '--adapter', 'fake',
      '--config', 'LaunchShaped',
      '--name', 's2',
    ], { env: testEnv.env });

    expect(result.exitCode, JSON.stringify(result)).toBe(0);
    const envelope = result.envelope as JsonEnvelope<DapStartData>;
    expect(envelope.meta.command).toBe('launch');
    expect(envelope.data.autoRouted).toEqual({
      code: 'auto_routed_to',
      from: 'attach',
      to: 'launch',
      configName: 'LaunchShaped',
    });
    expect(envelope.data.warnings).toHaveLength(1);
  });

  test('launch verb + launch-shaped config is silent (no warning)', async () => {
    const result = await runCli([
      'launch',
      '--workspace', workspace,
      '--adapter', 'fake',
      '--config', 'LaunchShaped',
      '--name', 's3',
    ], { env: testEnv.env });

    expect(result.exitCode, JSON.stringify(result)).toBe(0);
    const envelope = result.envelope as JsonEnvelope<DapStartData>;
    expect(envelope.meta.command).toBe('launch');
    expect(envelope.data.autoRouted).toBeUndefined();
    expect(envelope.data.warnings).toBeUndefined();
  });

  test('attach verb + attach-shaped config is silent (no warning)', async () => {
    const result = await runCli([
      'attach',
      '--workspace', workspace,
      '--adapter', 'fake',
      '--config', 'AttachShaped',
      '--name', 's4',
    ], { env: testEnv.env });

    expect(result.exitCode, JSON.stringify(result)).toBe(0);
    const envelope = result.envelope as JsonEnvelope<DapStartData>;
    expect(envelope.meta.command).toBe('attach');
    expect(envelope.data.autoRouted).toBeUndefined();
    expect(envelope.data.warnings).toBeUndefined();
  });

  test('launch verb + config without request field uses verb (back-compat)', async () => {
    const result = await runCli([
      'launch',
      '--workspace', workspace,
      '--adapter', 'fake',
      '--config', 'NoRequest',
      '--name', 's5',
    ], { env: testEnv.env });

    expect(result.exitCode, JSON.stringify(result)).toBe(0);
    const envelope = result.envelope as JsonEnvelope<DapStartData>;
    expect(envelope.meta.command).toBe('launch');
    expect(envelope.data.autoRouted).toBeUndefined();
    expect(envelope.data.warnings).toBeUndefined();
  });

  test('launch verb without --config is unchanged (auto-route is --config-only)', async () => {
    const result = await runCli([
      'launch',
      '--adapter', 'fake',
      '--name', 's6',
    ], { env: testEnv.env });

    expect(result.exitCode, JSON.stringify(result)).toBe(0);
    const envelope = result.envelope as JsonEnvelope<DapStartData>;
    expect(envelope.meta.command).toBe('launch');
    expect(envelope.data.autoRouted).toBeUndefined();
    expect(envelope.data.warnings).toBeUndefined();
  });
});

async function createWorkspaceWithLaunchJson(parentDir: string): Promise<string> {
  const ws = path.join(parentDir, 'workspace');
  await fs.mkdir(path.join(ws, '.vscode'), { recursive: true });
  const launchJson = {
    version: '0.2.0',
    configurations: [
      { name: 'AttachShaped', type: 'fake', request: 'attach' },
      { name: 'LaunchShaped', type: 'fake', request: 'launch' },
      { name: 'NoRequest', type: 'fake' },
    ],
  };
  await fs.writeFile(path.join(ws, '.vscode', 'launch.json'), `${JSON.stringify(launchJson, null, 2)}\n`, 'utf8');
  return ws;
}
