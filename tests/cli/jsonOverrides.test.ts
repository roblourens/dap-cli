import { promises as fs } from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { startControllerServer, type ControllerServer } from '../../src/controller/server.js';
import { createCliTestEnv, runCli, type CliTestEnv } from '../helpers/runCli.js';

interface JsonFailure {
  ok: false;
  error: { code: string; message: string; diagnostics?: string[] };
  meta: { command: string; timestamp: string };
}

let testEnv: CliTestEnv;
let server: ControllerServer | undefined;
let workspace: string;

beforeEach(async () => {
  testEnv = await createCliTestEnv('dap-cli-json-overrides-');
  server = await startControllerServer({ dapCliHome: testEnv.dapCliHome });
  workspace = await createWorkspaceWithLaunchJson(testEnv.dapCliHome);
});

afterEach(async () => {
  delete process.env.DAP_CLI_FAKE_EXPECT_ARGS;
  if (server !== undefined) {
    await server.stop();
    server = undefined;
  }
  await testEnv.cleanup();
});

describe('--json-overrides and --resolve-source-maps (Phase 10 plan 02)', () => {
  test('--json-overrides rejects non-JSON', async () => {
    const result = await runCli([
      'launch', '--adapter', 'fake', '--script', 'stopped-on-entry',
      '--json-overrides', 'not-json',
    ], { env: testEnv.env });
    expect(result.exitCode).not.toBe(0);
    const env = result.envelope as unknown as JsonFailure;
    expect(env.error.code).toBe('invalid_json');
  });

  test('--json-overrides rejects a JSON string (not an object)', async () => {
    const result = await runCli([
      'launch', '--adapter', 'fake', '--script', 'stopped-on-entry',
      '--json-overrides', '"a-string"',
    ], { env: testEnv.env });
    expect(result.exitCode).not.toBe(0);
    expect((result.envelope as unknown as JsonFailure).error.code).toBe('invalid_json');
  });

  test('--json-overrides rejects a JSON array', async () => {
    const result = await runCli([
      'launch', '--adapter', 'fake', '--script', 'stopped-on-entry',
      '--json-overrides', '[1,2]',
    ], { env: testEnv.env });
    expect(result.exitCode).not.toBe(0);
    expect((result.envelope as unknown as JsonFailure).error.code).toBe('invalid_json');
  });

  test('--json-overrides without --config layers fields onto the launch payload', async () => {
    process.env.DAP_CLI_FAKE_EXPECT_ARGS = JSON.stringify({ resolveSourceMapLocations: ['**', '!**/node_modules/**'] });
    const result = await runCli([
      'launch', '--adapter', 'fake', '--script', 'assert-launch-args',
      '--json-overrides', '{"resolveSourceMapLocations":["**","!**/node_modules/**"]}',
      '--name', 's1',
    ], { env: testEnv.env });
    expect(result.exitCode, JSON.stringify(result)).toBe(0);
  });

  test('--config + --json-overrides: result has BOTH named-config fields AND override fields', async () => {
    process.env.DAP_CLI_FAKE_EXPECT_ARGS = JSON.stringify({
      customField: 'fromConfig',
      resolveSourceMapLocations: ['**', '!**/node_modules/**'],
    });
    const result = await runCli([
      'launch', '--workspace', workspace, '--adapter', 'fake', '--script', 'assert-launch-args',
      '--config', 'LaunchWithCustom',
      '--json-overrides', '{"resolveSourceMapLocations":["**","!**/node_modules/**"]}',
      '--name', 's2',
    ], { env: testEnv.env });
    expect(result.exitCode, JSON.stringify(result)).toBe(0);
  });

  test('--json wins over --json-overrides (precedence: jsonConfig > jsonOverrides)', async () => {
    process.env.DAP_CLI_FAKE_EXPECT_ARGS = JSON.stringify({ x: 'fromJson' });
    const result = await runCli([
      'launch', '--adapter', 'fake', '--script', 'assert-launch-args',
      '--json', '{"x":"fromJson"}',
      '--json-overrides', '{"x":"fromOverride"}',
      '--name', 's3',
    ], { env: testEnv.env });
    expect(result.exitCode, JSON.stringify(result)).toBe(0);
  });

  test('--resolve-source-maps writes resolveSourceMapLocations as a string array', async () => {
    process.env.DAP_CLI_FAKE_EXPECT_ARGS = JSON.stringify({ resolveSourceMapLocations: ['**', '!**/node_modules/**'] });
    const result = await runCli([
      'launch', '--adapter', 'fake', '--script', 'assert-launch-args',
      '--resolve-source-maps', '**', '!**/node_modules/**',
      '--name', 's4',
    ], { env: testEnv.env });
    expect(result.exitCode, JSON.stringify(result)).toBe(0);
  });

  test('--resolve-source-maps wins over --json-overrides.resolveSourceMapLocations (flag layer is highest)', async () => {
    process.env.DAP_CLI_FAKE_EXPECT_ARGS = JSON.stringify({ resolveSourceMapLocations: ['**'] });
    const result = await runCli([
      'launch', '--adapter', 'fake', '--script', 'assert-launch-args',
      '--resolve-source-maps', '**',
      '--json-overrides', '{"resolveSourceMapLocations":["from-overrides"]}',
      '--name', 's5',
    ], { env: testEnv.env });
    expect(result.exitCode, JSON.stringify(result)).toBe(0);
  });

  test('--json-overrides cannot bypass auto-route (request: locked at config tail)', async () => {
    // attach verb + attach-shaped config + override claiming request:'launch'
    // → effective DAP request remains 'attach'. The fake adapter's mode
    // validator rejects mismatched commands, so if the override leaked into
    // the payload, the script would fail with the wrong command.
    process.env.DAP_CLI_FAKE_EXPECT_ARGS = JSON.stringify({ request: 'attach' });
    const result = await runCli([
      'attach', '--workspace', workspace, '--adapter', 'fake', '--script', 'assert-attach-args',
      '--config', 'AttachShaped',
      '--json-overrides', '{"request":"launch"}',
      '--name', 's6',
    ], { env: testEnv.env });
    expect(result.exitCode, JSON.stringify(result)).toBe(0);
  });
});

async function createWorkspaceWithLaunchJson(parentDir: string): Promise<string> {
  const ws = path.join(parentDir, 'workspace');
  await fs.mkdir(path.join(ws, '.vscode'), { recursive: true });
  const launchJson = {
    version: '0.2.0',
    configurations: [
      { name: 'AttachShaped', type: 'fake', request: 'attach' },
      { name: 'LaunchWithCustom', type: 'fake', request: 'launch', customField: 'fromConfig' },
    ],
  };
  await fs.writeFile(path.join(ws, '.vscode', 'launch.json'), `${JSON.stringify(launchJson, null, 2)}\n`, 'utf8');
  return ws;
}
