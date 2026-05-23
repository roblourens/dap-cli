import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import type { AdapterDescriptor } from '../descriptor.js';
import { usageError } from '../../cli/errors.js';
import { getDapCliAdaptersDir } from '../../config/paths.js';

export function createNetCoreDbgDescriptor(netCoreDbgPath?: string): AdapterDescriptor {
  const resolvedNetCoreDbgPath = netCoreDbgPath ?? resolveDefaultNetCoreDbgPath();

  return {
    id: 'netcoredbg',
    label: 'C#/.NET Debug Adapter (NetCoreDbg)',
    transport: {
      kind: 'stdio',
      command: resolvedNetCoreDbgPath,
      args: ['--interpreter=vscode'],
    },
  };
}

function resolveDefaultNetCoreDbgPath(): string {
  const provisionedNetCoreDbg = getProvisionedNetCoreDbgPath();
  const candidates = ['PATH netcoredbg', provisionedNetCoreDbg];

  if (netCoreDbgIsUsable('netcoredbg')) {
    return 'netcoredbg';
  }

  if (existsSync(provisionedNetCoreDbg) && netCoreDbgIsUsable(provisionedNetCoreDbg)) {
    return provisionedNetCoreDbg;
  }

  throw usageError('NetCoreDbg adapter is not installed.', {
    code: 'netcoredbg_not_found',
    diagnostics: [
      'Run npm run setup-adapters to provision NetCoreDbg, or install a usable netcoredbg on PATH.',
      `Checked: ${candidates.join(', ')}`,
    ],
  });
}

function getProvisionedNetCoreDbgPath(): string {
  return path.join(getDapCliAdaptersDir(), 'netcoredbg', process.platform === 'win32' ? 'netcoredbg.exe' : 'netcoredbg');
}

function netCoreDbgIsUsable(command: string): boolean {
  return commandSucceeds(command, ['--version']) || commandSucceeds(command, ['--help']);
}

function commandSucceeds(command: string, args: readonly string[]): boolean {
  const result = spawnSync(command, [...args], { encoding: 'utf8' });
  return result.status === 0;
}
