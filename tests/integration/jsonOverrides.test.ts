import { promises as fs } from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { startControllerServer, type ControllerServer } from '../../src/controller/server.js';
import { createCliTestEnv, runCli, type CliTestEnv } from '../helpers/runCli.js';

let testEnv: CliTestEnv;
let server: ControllerServer | undefined;
let workspace: string;

beforeEach(async () => {
  testEnv = await createCliTestEnv('dap-cli-json-overrides-int-');
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

describe('--json-overrides / --resolve-source-maps end-to-end (Phase 10 plan 02)', () => {
  test('end-to-end: --config + --json-overrides reaches adapter with merged config', async () => {
    process.env.DAP_CLI_FAKE_EXPECT_ARGS = JSON.stringify({
      customField: 'fromConfig',
      resolveSourceMapLocations: ['**', '!**/node_modules/**'],
      sourceMaps: true,
    });
    const result = await runCli([
      'launch', '--workspace', workspace, '--adapter', 'fake', '--script', 'assert-launch-args',
      '--config', 'LaunchWithCustom',
      '--json-overrides', '{"resolveSourceMapLocations":["**","!**/node_modules/**"],"sourceMaps":true}',
      '--name', 'e2e-overrides',
    ], { env: testEnv.env });
    expect(result.exitCode, JSON.stringify(result)).toBe(0);
  });

  test('end-to-end: --resolve-source-maps reaches adapter as string array', async () => {
    process.env.DAP_CLI_FAKE_EXPECT_ARGS = JSON.stringify({
      customField: 'fromConfig',
      resolveSourceMapLocations: ['**', '!**/node_modules/**'],
    });
    const result = await runCli([
      'launch', '--workspace', workspace, '--adapter', 'fake', '--script', 'assert-launch-args',
      '--config', 'LaunchWithCustom',
      '--resolve-source-maps', '**', '!**/node_modules/**',
      '--name', 'e2e-resolve-source-maps',
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
      { name: 'LaunchWithCustom', type: 'fake', request: 'launch', customField: 'fromConfig' },
    ],
  };
  await fs.writeFile(path.join(ws, '.vscode', 'launch.json'), `${JSON.stringify(launchJson, null, 2)}\n`, 'utf8');
  return ws;
}
