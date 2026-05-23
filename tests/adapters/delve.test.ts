import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, test } from 'vitest';
import { createDelveDescriptor } from '../../src/adapters/builtins/delve.js';

describe('createDelveDescriptor', () => {
  test('creates a localhost-only Delve DAP server descriptor', () => {
    const previousGoToolchain = process.env.GOTOOLCHAIN;
    delete process.env.GOTOOLCHAIN;
    const descriptor = createDelveDescriptor('/tmp/dlv');

    try {
      expect(descriptor).toEqual({
        id: 'delve',
        label: 'Go Debug Adapter (Delve)',
        transport: {
          kind: 'server',
          command: '/tmp/dlv',
          args: ['dap', '--listen=127.0.0.1:${port}'],
          host: '127.0.0.1',
        },
      });
    } finally {
      restoreEnv('GOTOOLCHAIN', previousGoToolchain);
    }
  });

  test('passes the launch Go toolchain override to the Delve adapter process', () => {
    const previousGoToolchain = process.env.GOTOOLCHAIN;
    process.env.GOTOOLCHAIN = 'go1.24.0';

    try {
      expect(createDelveDescriptor('/tmp/dlv').transport).toMatchObject({
        kind: 'server',
        env: { GOTOOLCHAIN: 'go1.24.0' },
      });
    } finally {
      restoreEnv('GOTOOLCHAIN', previousGoToolchain);
    }
  });

  test('reports actionable delve_not_found diagnostics when Delve is unavailable', () => {
    const previousHome = process.env.DAP_CLI_HOME;
    const previousPath = process.env.PATH;
    process.env.DAP_CLI_HOME = '/definitely-missing-dap-cli-home';
    process.env.PATH = '';

    try {
      const error = catchError(() => createDelveDescriptor());
      expect(error?.code).toBe('delve_not_found');
      expect(error?.diagnostics?.join('\n')).toContain('npm run setup-adapters');
      expect(error?.diagnostics?.join('\n')).toContain('PATH dlv');
    } finally {
      restoreEnv('DAP_CLI_HOME', previousHome);
      restoreEnv('PATH', previousPath);
    }
  });

  test.skipIf(process.platform === 'win32')('prefers a usable PATH Delve over an unusable cached adapter binary', () => {
    const tempDir = mkdtempSync(path.join(os.tmpdir(), 'dap-cli-delve-path-first-'));
    const fakeBin = path.join(tempDir, 'bin');
    const cachedDelveDir = path.join(tempDir, 'adapters', 'delve');
    const previousHome = process.env.DAP_CLI_HOME;
    const previousPath = process.env.PATH;
    mkdirSync(fakeBin, { recursive: true });
    mkdirSync(cachedDelveDir, { recursive: true });
    writeExecutable(path.join(cachedDelveDir, 'dlv'), 'process.exit(1);');
    writeExecutable(path.join(fakeBin, 'dlv'), 'process.stdout.write("Delve Debugger\\nVersion: 1.25.0\\n");');
    process.env.DAP_CLI_HOME = tempDir;
    process.env.PATH = previousPath === undefined ? fakeBin : `${fakeBin}${path.delimiter}${previousPath}`;

    try {
      expect(createDelveDescriptor().transport).toMatchObject({ command: 'dlv' });
    } finally {
      restoreEnv('DAP_CLI_HOME', previousHome);
      restoreEnv('PATH', previousPath);
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test.skipIf(process.platform === 'win32')('rejects Delve 1.26.3 with Go older than 1.24 before launch', () => {
    const tempDir = mkdtempSync(path.join(os.tmpdir(), 'dap-cli-delve-version-'));
    const fakeDelve = path.join(tempDir, 'dlv');
    const fakeGo = path.join(tempDir, 'go');
    const previousPath = process.env.PATH;
    writeExecutable(fakeDelve, 'process.stdout.write("Delve Debugger\\nVersion: 1.26.3\\n")');
    writeExecutable(fakeGo, 'process.stdout.write("go version go1.23.5 darwin/arm64\\n")');
    process.env.PATH = previousPath === undefined ? tempDir : `${tempDir}${path.delimiter}${previousPath}`;

    try {
      const error = catchError(() => createDelveDescriptor(fakeDelve));
      expect(error?.code).toBe('delve_go_version_incompatible');
      expect(error?.diagnostics?.join('\n')).toContain('Delve 1.26.3 requires Go 1.24+');
      expect(error?.diagnostics?.join('\n')).toContain('GOTOOLCHAIN=go1.24.0');
    } finally {
      restoreEnv('PATH', previousPath);
      rmSync(tempDir, { recursive: true, force: true });
    }
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

function restoreEnv(key: 'DAP_CLI_HOME' | 'GOTOOLCHAIN' | 'PATH', value: string | undefined): void {
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
