import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import type { AdapterDescriptor } from '../descriptor.js';
import { usageError } from '../../cli/errors.js';
import { getDapCliVenvPythonPath } from '../../config/paths.js';

export function createDebugpyDescriptor(pythonPath?: string): AdapterDescriptor {
  const resolvedPythonPath = pythonPath ?? resolveDefaultDebugpyPythonPath();

  return {
    id: 'debugpy',
    label: 'Python Debug Adapter (debugpy)',
    transport: {
      kind: 'stdio',
      command: resolvedPythonPath,
      args: ['-m', 'debugpy.adapter'],
    },
  };
}

function resolveDefaultDebugpyPythonPath(): string {
  const provisionedPython = getDapCliVenvPythonPath();
  const candidates = [provisionedPython, 'python3'];

  if (existsSync(provisionedPython) && pythonHasDebugpy(provisionedPython)) {
    return provisionedPython;
  }

  if (pythonHasDebugpy('python3')) {
    return 'python3';
  }

  throw usageError('debugpy adapter is not installed.', {
    code: 'debugpy_not_found',
    diagnostics: [
      'Run npm run setup-adapters to provision debugpy, or see docs/ADAPTER-SETUP.md for advanced manual provisioning.',
      `Checked: ${candidates.join(', ')}`,
    ],
  });
}

function pythonHasDebugpy(pythonPath: string): boolean {
  const result = spawnSync(pythonPath, ['-c', 'import debugpy'], { encoding: 'utf8' });
  return result.status === 0;
}