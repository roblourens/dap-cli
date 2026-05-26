import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { atomicInstall } from '../../../src/adapters/provision/atomicInstall.js';
import { CliError } from '../../../src/cli/errors.js';

describe('atomicInstall', () => {
  let workDir: string;

  beforeEach(async () => {
    workDir = await fs.mkdtemp(path.join(os.tmpdir(), 'dap-cli-atomic-'));
  });

  afterEach(async () => {
    await fs.rm(workDir, { recursive: true, force: true });
  });

  test('promotes staging to canonical after entry points verify', async () => {
    const result = await atomicInstall({
      adaptersDir: workDir,
      adapterId: 'js-debug',
      expectedEntrypoints: ['src/dapDebugServer.js'],
      populate: async stagingDir => {
        await fs.mkdir(path.join(stagingDir, 'src'), { recursive: true });
        await fs.writeFile(path.join(stagingDir, 'src', 'dapDebugServer.js'), '// entry');
      },
    });
    expect(result).toBe(path.join(workDir, 'js-debug'));
    expect(await fs.readFile(path.join(result, 'src', 'dapDebugServer.js'), 'utf8')).toBe('// entry');
    const entries = await fs.readdir(workDir);
    // Only canonical directory should remain (no staging dirs).
    expect(entries.filter(name => name.startsWith('.js-debug.tmp.'))).toHaveLength(0);
  });

  test('replaces a pre-existing canonical directory', async () => {
    const existing = path.join(workDir, 'js-debug');
    await fs.mkdir(existing, { recursive: true });
    await fs.writeFile(path.join(existing, 'old.txt'), 'old');

    await atomicInstall({
      adaptersDir: workDir,
      adapterId: 'js-debug',
      expectedEntrypoints: ['new.txt'],
      populate: async stagingDir => {
        await fs.writeFile(path.join(stagingDir, 'new.txt'), 'new');
      },
    });

    await expect(fs.access(path.join(existing, 'old.txt'))).rejects.toThrow();
    expect(await fs.readFile(path.join(existing, 'new.txt'), 'utf8')).toBe('new');
  });

  test('missing expected entry point fails install and cleans staging', async () => {
    const error = await atomicInstall({
      adaptersDir: workDir,
      adapterId: 'js-debug',
      expectedEntrypoints: ['missing.js'],
      populate: async stagingDir => {
        await fs.writeFile(path.join(stagingDir, 'present.js'), 'x');
      },
    }).catch((err: unknown) => err);

    expect(error).toBeInstanceOf(CliError);
    expect((error as CliError).code).toBe('provision_extract_failed');
    expect((error as CliError).diagnostics.join('\n')).toContain('missing.js');
    await expect(fs.access(path.join(workDir, 'js-debug'))).rejects.toThrow();
    const entries = await fs.readdir(workDir);
    expect(entries.filter(name => name.startsWith('.js-debug.tmp.'))).toHaveLength(0);
  });

  test('populate throwing cleans staging and leaves canonical untouched', async () => {
    const existing = path.join(workDir, 'js-debug');
    await fs.mkdir(existing, { recursive: true });
    await fs.writeFile(path.join(existing, 'survives.txt'), 'kept');

    const error = await atomicInstall({
      adaptersDir: workDir,
      adapterId: 'js-debug',
      expectedEntrypoints: ['x'],
      populate: async () => {
        throw new Error('boom');
      },
    }).catch((err: unknown) => err);

    expect((error as Error).message).toBe('boom');
    expect(await fs.readFile(path.join(existing, 'survives.txt'), 'utf8')).toBe('kept');
    const entries = await fs.readdir(workDir);
    expect(entries.filter(name => name.startsWith('.js-debug.tmp.'))).toHaveLength(0);
  });
});
