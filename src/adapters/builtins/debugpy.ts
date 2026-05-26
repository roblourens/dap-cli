import { promises as fs } from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { AdapterDescriptor } from '../descriptor.js';
import { getDapCliAdaptersDir, getDapCliVenvPythonPath } from '../../config/paths.js';
import { resolveAssumeYes } from '../../cli/confirm.js';
import { provisionAdapter } from '../provision/index.js';

const execFileAsync = promisify(execFile);

export async function createDebugpyDescriptor(pythonPath?: string): Promise<AdapterDescriptor> {
  const resolvedPythonPath = pythonPath ?? (await resolveDefaultDebugpyPythonPath());

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

async function pathExists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

async function pythonHasDebugpy(pythonPath: string): Promise<boolean> {
  try {
    await execFileAsync(pythonPath, ['-c', 'import debugpy']);
    return true;
  } catch {
    return false;
  }
}

async function resolveDefaultDebugpyPythonPath(env: NodeJS.ProcessEnv = process.env): Promise<string> {
  // 1. Legacy provisioned venv at $DAP_CLI_HOME/venv/bin/python (set up by scripts/setup-adapters.ts).
  const legacyVenvPython = getDapCliVenvPythonPath(env);
  if ((await pathExists(legacyVenvPython)) && (await pythonHasDebugpy(legacyVenvPython))) {
    return legacyVenvPython;
  }

  // 2. System python3 that already has debugpy importable.
  if (await pythonHasDebugpy('python3')) {
    return 'python3';
  }

  // 3. Trigger lazy provisioning into ~/.dap-cli/adapters/debugpy/venv.
  const adaptersDir = getDapCliAdaptersDir(env);
  const result = await provisionAdapter('debugpy', {
    env,
    assumeYes: resolveAssumeYes(undefined, env),
    adaptersDir,
  });
  return result.entrypoint;
}