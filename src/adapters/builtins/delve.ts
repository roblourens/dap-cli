import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import type { AdapterDescriptor } from '../descriptor.js';
import { usageError } from '../../cli/errors.js';
import { getDapCliAdaptersDir } from '../../config/paths.js';

export function createDelveDescriptor(delvePath?: string): AdapterDescriptor {
  const resolvedDelvePath = delvePath ?? resolveDefaultDelvePath();

  return {
    id: 'delve',
    label: 'Go Debug Adapter (Delve)',
    transport: {
      kind: 'server',
      command: resolvedDelvePath,
      args: ['dap', '--listen=127.0.0.1:${port}'],
      host: '127.0.0.1',
    },
  };
}

function resolveDefaultDelvePath(): string {
  const provisionedDelve = getProvisionedDelvePath();
  const candidates = [provisionedDelve, 'PATH dlv'];

  if (existsSync(provisionedDelve)) {
    return provisionedDelve;
  }

  if (pathDelveIsUsable()) {
    return 'dlv';
  }

  throw usageError('Delve adapter is not installed.', {
    code: 'delve_not_found',
    diagnostics: [
      'Run npm run setup-adapters to provision Delve, or install a usable dlv on PATH.',
      `Checked: ${candidates.join(', ')}`,
    ],
  });
}

function getProvisionedDelvePath(): string {
  return path.join(getDapCliAdaptersDir(), 'delve', process.platform === 'win32' ? 'dlv.exe' : 'dlv');
}

function pathDelveIsUsable(): boolean {
  const result = spawnSync('dlv', ['version'], { encoding: 'utf8' });
  return result.status === 0;
}