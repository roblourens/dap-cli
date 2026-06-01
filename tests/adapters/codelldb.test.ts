import { describe, expect, test } from 'vitest';
import { createCodeLldbDescriptor } from '../../src/adapters/builtins/codelldb.js';

describe('createCodeLldbDescriptor', () => {
  test('creates the R-01-proved localhost-only CodeLLDB server descriptor', async () => {
    const descriptor = await createCodeLldbDescriptor('/tmp/codelldb/extension/adapter/codelldb');

    expect(descriptor).toEqual({
      id: 'codelldb',
      label: 'Rust Debug Adapter (CodeLLDB)',
      transport: {
        kind: 'server',
        command: '/tmp/codelldb/extension/adapter/codelldb',
        args: [
          '--liblldb',
          '/tmp/codelldb/extension/lldb/lib/liblldb.dylib',
          '--port',
          '${port}',
        ],
        host: '127.0.0.1',
      },
    });
  });

  test('falls back to consent-gated lazy provisioning when no explicit path is supplied', async () => {
    const previousAdaptersDir = process.env.DAP_CLI_ADAPTERS_DIR;
    const previousAssumeYes = process.env.DAP_CLI_ASSUME_YES;
    const previousPlatform = process.env.DAP_CLI_PROVISION_CODELLDB_PLATFORM_OVERRIDE;
    process.env.DAP_CLI_ADAPTERS_DIR = '/definitely-missing-codelldb-cache';
    process.env.DAP_CLI_PROVISION_CODELLDB_PLATFORM_OVERRIDE = 'darwin_arm64';
    delete process.env.DAP_CLI_ASSUME_YES;

    try {
      await expect(createCodeLldbDescriptor()).rejects.toMatchObject({ code: 'provision_consent_required' });
    } finally {
      restoreEnv('DAP_CLI_ADAPTERS_DIR', previousAdaptersDir);
      restoreEnv('DAP_CLI_ASSUME_YES', previousAssumeYes);
      restoreEnv('DAP_CLI_PROVISION_CODELLDB_PLATFORM_OVERRIDE', previousPlatform);
    }
  });
});

function restoreEnv(key: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[key];
  } else {
    process.env[key] = value;
  }
}