import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, test } from 'vitest';
import { createNetCoreDbgDescriptor } from '../../src/adapters/builtins/netCoreDbg.js';
import { AdapterRegistry } from '../../src/adapters/registry.js';

describe('createNetCoreDbgDescriptor', () => {
  test('creates a NetCoreDbg stdio descriptor with the VS Code interpreter argument', () => {
    const descriptor = createNetCoreDbgDescriptor('/tmp/netcoredbg');

    expect(descriptor).toEqual({
      id: 'netcoredbg',
      label: 'C#/.NET Debug Adapter (NetCoreDbg)',
      transport: {
        kind: 'stdio',
        command: '/tmp/netcoredbg',
        args: ['--interpreter=vscode'],
      },
    });
  });

  test.skipIf(process.platform === 'win32')('prefers a usable PATH NetCoreDbg over an unusable cached adapter binary', () => {
    const tempDir = mkdtempSync(path.join(os.tmpdir(), 'dap-cli-netcoredbg-path-first-'));
    const fakeBin = path.join(tempDir, 'bin');
    const cachedNetCoreDbgDir = path.join(tempDir, 'adapters', 'netcoredbg');
    const previousHome = process.env.DAP_CLI_HOME;
    const previousPath = process.env.PATH;
    mkdirSync(fakeBin, { recursive: true });
    mkdirSync(cachedNetCoreDbgDir, { recursive: true });
    writeExecutable(path.join(cachedNetCoreDbgDir, 'netcoredbg'), 'process.exit(1);');
    writeExecutable(path.join(fakeBin, 'netcoredbg'), 'process.stdout.write("NetCoreDbg 3.1.3-1062\\n");');
    process.env.DAP_CLI_HOME = tempDir;
    process.env.PATH = previousPath === undefined ? fakeBin : `${fakeBin}${path.delimiter}${previousPath}`;

    try {
      expect(createNetCoreDbgDescriptor().transport).toMatchObject({ command: 'netcoredbg' });
    } finally {
      restoreEnv('DAP_CLI_HOME', previousHome);
      restoreEnv('PATH', previousPath);
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test('reports actionable netcoredbg_not_found diagnostics when NetCoreDbg is unavailable', () => {
    const previousHome = process.env.DAP_CLI_HOME;
    const previousPath = process.env.PATH;
    process.env.DAP_CLI_HOME = '/definitely-missing-dap-cli-home';
    process.env.PATH = '';

    try {
      const error = catchError(() => createNetCoreDbgDescriptor());
      expect(error?.code).toBe('netcoredbg_not_found');
      expect(error?.diagnostics?.join('\n')).toContain('npm run setup-adapters');
      expect(error?.diagnostics?.join('\n')).toContain('PATH netcoredbg');
    } finally {
      restoreEnv('DAP_CLI_HOME', previousHome);
      restoreEnv('PATH', previousPath);
    }
  });
});

describe('AdapterRegistry NetCoreDbg registration', () => {
  test('lists NetCoreDbg as a default built-in adapter', () => {
    const registry = new AdapterRegistry();

    expect(registry.listAll()).toContainEqual({
      id: 'netcoredbg',
      label: 'C#/.NET Debug Adapter (NetCoreDbg)',
      source: 'built-in',
    });
  });
});

interface CapturedCliError extends Error {
  code?: string;
  diagnostics?: readonly string[];
}

function catchError(callback: () => unknown): CapturedCliError | undefined {
  try {
    callback();
  } catch (error: unknown) {
    return error instanceof Error ? error : undefined;
  }

  return undefined;
}

function restoreEnv(key: 'DAP_CLI_HOME' | 'PATH', value: string | undefined): void {
  if (value === undefined) {
    delete process.env[key];
    return;
  }

  process.env[key] = value;
}

function writeExecutable(filePath: string, body: string): void {
  writeFileSync(filePath, `#!/usr/bin/env node\n${body}\n`, 'utf8');
  chmodSync(filePath, 0o755);
}
