import { existsSync } from 'node:fs';
import path from 'node:path';
import type { AdapterDescriptor } from '../descriptor.js';
import { getDapCliAdaptersDir } from '../../config/paths.js';
import { usageError } from '../../cli/errors.js';

export function createJsDebugDescriptor(jsDebugPath?: string): AdapterDescriptor {
  const dapServerPath = jsDebugPath ?? resolveDefaultJsDebugPath();
  return {
    id: 'js-debug',
    label: 'JavaScript Debug Adapter (Node, Chrome, Electron)',
    transport: {
      kind: 'server',
      command: process.execPath,
      args: [dapServerPath, '${port}', '127.0.0.1'],
      host: '127.0.0.1',
    },
  };
}

function resolveDefaultJsDebugPath(): string {
  const candidates = [
    path.join(getDapCliAdaptersDir(), 'js-debug', 'src', 'dapDebugServer.js'),
    path.join(process.cwd(), 'node_modules', 'vscode-js-debug', 'src', 'dapDebugServer.js'),
  ];

  const found = candidates.find(candidate => existsSync(candidate));
  if (found !== undefined) {
    return found;
  }

  throw usageError('js-debug adapter is not installed.', {
    code: 'js_debug_not_found',
    diagnostics: [
      'Run npm run setup-adapters to provision js-debug, or see docs/ADAPTER-SETUP.md for advanced manual provisioning.',
      `Checked: ${candidates.join(', ')}`,
    ],
  });
}