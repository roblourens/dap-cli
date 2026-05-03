import { promises as fs } from 'node:fs';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { loadAdapterConfig, saveAdapterConfig } from '../../src/adapters/config.js';

let tempDir: string;

beforeEach(async () => {
  tempDir = await mkdtemp(path.join(tmpdir(), 'dap-cli-adapter-config-'));
});

afterEach(async () => {
  await fs.rm(tempDir, { recursive: true, force: true });
});

describe('adapter config persistence', () => {
  test('returns empty config when adapters.json is missing', async () => {
    await expect(loadAdapterConfig(tempDir)).resolves.toEqual({});
  });

  test('saves and loads validated adapter config', async () => {
    await saveAdapterConfig({
      adapters: {
        custom: {
          id: 'custom',
          label: 'Custom adapter',
          transport: { kind: 'stdio', command: 'custom-debug', args: ['--stdio'] },
          launchDefaults: { request: 'launch' },
        },
      },
      launchConfigTypeMap: { customType: 'custom' },
    }, tempDir);

    await expect(loadAdapterConfig(tempDir)).resolves.toEqual({
      adapters: {
        custom: {
          id: 'custom',
          label: 'Custom adapter',
          transport: { kind: 'stdio', command: 'custom-debug', args: ['--stdio'] },
          launchDefaults: { request: 'launch' },
        },
      },
      launchConfigTypeMap: { customType: 'custom' },
    });
  });

  test('reports invalid_config for invalid JSON', async () => {
    await fs.mkdir(path.join(tempDir, 'config'), { recursive: true });
    await fs.writeFile(path.join(tempDir, 'config', 'adapters.json'), '{', 'utf8');

    await expect(loadAdapterConfig(tempDir)).rejects.toMatchObject({ code: 'invalid_config' });
  });

  test('rejects adapter IDs that are unsafe as filenames', async () => {
    await fs.mkdir(path.join(tempDir, 'config'), { recursive: true });
    await fs.writeFile(path.join(tempDir, 'config', 'adapters.json'), JSON.stringify({
      adapters: {
        '../outside': {
          id: '../outside',
          label: 'Unsafe adapter',
          transport: { kind: 'stdio', command: 'debug-adapter', args: [] },
        },
      },
    }), 'utf8');

    await expect(loadAdapterConfig(tempDir)).rejects.toMatchObject({ code: 'invalid_config' });
  });
});