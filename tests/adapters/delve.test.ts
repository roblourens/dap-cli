import { describe, expect, test } from 'vitest';
import { createDelveDescriptor } from '../../src/adapters/builtins/delve.js';

describe('createDelveDescriptor', () => {
  test('creates a localhost-only Delve DAP server descriptor', () => {
    const descriptor = createDelveDescriptor('/tmp/dlv');

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
  });

  test('reports actionable delve_not_found diagnostics when Delve is unavailable', () => {
    const previousHome = process.env.DAP_CLI_HOME;
    const previousPath = process.env.PATH;
    process.env.DAP_CLI_HOME = '/definitely-missing-dap-cli-home';
    process.env.PATH = '';

    try {
      const error = catchError(() => createDelveDescriptor());
      expect(error?.code).toBe('delve_not_found');
      expect(error?.diagnostics.join('\n')).toContain('npm run setup-adapters');
      expect(error?.diagnostics.join('\n')).toContain('PATH dlv');
    } finally {
      restoreEnv('DAP_CLI_HOME', previousHome);
      restoreEnv('PATH', previousPath);
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

function restoreEnv(key: 'DAP_CLI_HOME' | 'PATH', value: string | undefined): void {
  if (value === undefined) {
    delete process.env[key];
    return;
  }

  process.env[key] = value;
}