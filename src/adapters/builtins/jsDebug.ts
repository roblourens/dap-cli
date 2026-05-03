import { existsSync } from 'node:fs';
import path from 'node:path';
import type { AdapterDescriptor } from '../descriptor.js';
import { getDapCliHome } from '../../config/paths.js';
import { usageError } from '../../cli/errors.js';

export function createJsDebugDescriptor(jsDebugPath?: string): AdapterDescriptor {
  const dapServerPath = jsDebugPath ?? resolveDefaultJsDebugPath();
  return {
    id: 'js-debug',
    label: 'JavaScript Debug Adapter (Node, Chrome, Electron)',
    transport: {
      kind: 'stdio',
      command: process.execPath,
      args: [dapServerPath],
    },
  };
}

function resolveDefaultJsDebugPath(): string {
  const candidates = [
    path.join(getDapCliHome(), 'adapters', 'js-debug', 'src', 'dapDebugServer.js'),
    path.join(process.cwd(), 'node_modules', 'vscode-js-debug', 'src', 'dapDebugServer.js'),
  ];

  const found = candidates.find(candidate => existsSync(candidate));
  if (found !== undefined) {
    return found;
  }

  throw usageError('js-debug adapter is not installed.', {
    code: 'js_debug_not_found',
    diagnostics: [
      'Install js-debug from the GitHub release tarball into DAP_CLI_HOME/adapters/js-debug, or see docs/ADAPTER-SETUP.md.',
      `Checked: ${candidates.join(', ')}`,
    ],
  });
}