import { promises as fs } from 'node:fs';
import path from 'node:path';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import {
  launchConfigTypeMap,
  loadVSCodeLaunchConfig,
  mapDebugpyFlags,
  mapJsDebugFlags,
  resolveAdapterIdFromType,
  resolveLaunchConfig,
} from '../../src/config/launchConfig.js';

let tempDir: string;

beforeEach(async () => {
  tempDir = await mkdtemp(path.join(tmpdir(), 'dap-cli-launch-config-'));
});

afterEach(async () => {
  await fs.rm(tempDir, { recursive: true, force: true });
});

describe('launch config resolution', () => {
  test('merges named config, JSON, and flags by precedence', () => {
    expect(resolveLaunchConfig({
      namedConfig: { program: 'named.js', cwd: 'named', request: 'launch' },
      jsonConfig: { program: 'json.js', env: { A: '1' } },
      flags: { program: 'flags.js' },
    })).toEqual({ program: 'flags.js', cwd: 'named', request: 'launch', env: { A: '1' } });
  });

  test('maps VS Code launch types to adapter ids', () => {
    expect(launchConfigTypeMap.node).toBe('js-debug');
    expect(resolveAdapterIdFromType('pwa-chrome')).toBe('js-debug');
    expect(resolveAdapterIdFromType('python')).toBe('debugpy');
    expect(resolveAdapterIdFromType('go', { go: 'delve' })).toBe('delve');
  });

  test('reports unknown launch types', () => {
    expect(catchErrorCode(() => resolveAdapterIdFromType('unknown'))).toBe('unknown_launch_type');
  });

  test('loads .vscode launch configurations and returns empty for missing files', async () => {
    expect(await loadVSCodeLaunchConfig(tempDir)).toEqual([]);

    await fs.mkdir(path.join(tempDir, '.vscode'));
    await fs.writeFile(path.join(tempDir, '.vscode', 'launch.json'), JSON.stringify({
      configurations: [{ type: 'node', name: 'Run app', program: 'app.js' }],
    }), 'utf8');

    expect(await loadVSCodeLaunchConfig(tempDir)).toEqual([{ type: 'node', name: 'Run app', program: 'app.js' }]);
  });

  test('loads VS Code JSONC launch configurations with comments and trailing commas', async () => {
    await fs.mkdir(path.join(tempDir, '.vscode'));
    await fs.writeFile(path.join(tempDir, '.vscode', 'launch.json'), `{
      // VS Code launch files are JSONC.
      "configurations": [
        { "type": "node", "name": "Run app", "program": "app.js", },
      ],
    }`, 'utf8');

    expect(await loadVSCodeLaunchConfig(tempDir)).toEqual([{ type: 'node', name: 'Run app', program: 'app.js' }]);
  });

  test('reports invalid launch JSON', async () => {
    await fs.mkdir(path.join(tempDir, '.vscode'));
    await fs.writeFile(path.join(tempDir, '.vscode', 'launch.json'), '{', 'utf8');

    await expect(loadVSCodeLaunchConfig(tempDir)).rejects.toMatchObject({ code: 'invalid_launch_json' });
  });

  test('maps js-debug flags to native config fields', () => {
    expect(mapJsDebugFlags({ type: 'node', program: 'app.ts', cwd: '/repo', runtimeExecutable: 'node', url: 'http://localhost:3000', port: 9229 })).toEqual({
      type: 'node',
      program: 'app.ts',
      cwd: '/repo',
      runtimeExecutable: 'node',
      url: 'http://localhost:3000',
      port: 9229,
    });
  });

  test('maps debugpy flags to native config fields', () => {
    expect(mapDebugpyFlags({ program: 'main.py', cwd: '/repo', python: '.venv/bin/python', port: 5678 })).toEqual({
      program: 'main.py',
      cwd: '/repo',
      python: '.venv/bin/python',
      connect: { host: '127.0.0.1', port: 5678 },
    });
  });

  test('maps electron runtime flag to node type for js-debug', () => {
    expect(mapJsDebugFlags({ runtimeExecutable: 'electron' })).toEqual({ runtimeExecutable: 'electron', type: 'node' });
  });
});

function catchErrorCode(callback: () => unknown): string | undefined {
  try {
    callback();
  } catch (error: unknown) {
    return error instanceof Error && 'code' in error && typeof error.code === 'string' ? error.code : undefined;
  }

  return undefined;
}