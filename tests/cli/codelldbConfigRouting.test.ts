import { promises as fs } from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { createCliTestEnv, runCli, type CliTestEnv } from '../helpers/runCli.js';

let testEnv: CliTestEnv;
let workspace: string;

beforeEach(async () => {
  testEnv = await createCliTestEnv('dap-cli-codelldb-config-');
  workspace = path.join(testEnv.dapCliHome, 'workspace');
  await fs.mkdir(path.join(workspace, '.vscode'), { recursive: true });
  await fs.writeFile(path.join(workspace, '.vscode', 'launch.json'), JSON.stringify({
    configurations: [
      { name: 'Cargo Only', type: 'lldb', request: 'launch', cargo: { args: ['build'] } },
      { name: 'Cargo Plus Program', type: 'lldb', request: 'launch', cargo: { args: ['build'] }, program: '${workspaceFolder}/target/debug/demo' },
    ],
  }), 'utf8');
});

afterEach(async () => {
  await testEnv.cleanup();
});

describe('CodeLLDB native configuration routing', () => {
  for (const name of ['Cargo Only', 'Cargo Plus Program']) {
    test(`rejects ${name} before provisioning or controller startup`, async () => {
      const result = await runCli(['launch', '--workspace', workspace, '--config', name], { env: testEnv.env });

      expect(result.exitCode).toBe(2);
      expect(result.envelope).toMatchObject({
        ok: false,
        error: {
          code: 'codelldb_cargo_config_unsupported',
          category: 'usage',
          data: { adapterId: 'codelldb', unsupportedField: 'cargo', requiredField: 'program' },
        },
      });
      if (!result.envelope.ok) {
        expect(result.envelope.error.diagnostics.join('\n')).toContain('explicitly built Rust binary');
        expect(result.envelope.error.code).not.toBe('provision_consent_required');
        expect(result.envelope.error.code).not.toBe('controller_unavailable');
      }
    });
  }
});