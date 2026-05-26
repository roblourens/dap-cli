import { homedir } from 'node:os';
import path from 'node:path';

const appDirectoryName = '.dap-cli';

export function getDapCliHome(env: NodeJS.ProcessEnv = process.env): string {
  const configuredHome = env.DAP_CLI_HOME;

  if (configuredHome !== undefined && configuredHome.trim().length > 0) {
    return path.resolve(configuredHome);
  }

  return getDefaultDapCliHome();
}

export function getDapCliStateDir(env: NodeJS.ProcessEnv = process.env): string {
  return path.join(getDapCliHome(env), 'state');
}

export function getDapCliLogDir(env: NodeJS.ProcessEnv = process.env): string {
  return path.join(getDapCliHome(env), 'logs');
}

export function getDapCliAdaptersDir(env: NodeJS.ProcessEnv = process.env): string {
  // D-12: DAP_CLI_ADAPTERS_DIR lets users (and the npx-cache test harness)
  // relocate just the adapter cache root without touching the rest of the
  // ~/.dap-cli layout. The error-recovery hints in lock.ts / atomicInstall.ts
  // both advertise this override.
  const configured = env.DAP_CLI_ADAPTERS_DIR;
  if (configured !== undefined && configured.trim().length > 0) {
    return path.resolve(configured);
  }
  return path.join(getDapCliHome(env), 'adapters');
}

export function getDapCliVenvPythonPath(env: NodeJS.ProcessEnv = process.env): string {
  const venvDirectory = path.join(getDapCliHome(env), 'venv');
  if (process.platform === 'win32') {
    return path.join(venvDirectory, 'Scripts', 'python.exe');
  }

  return path.join(venvDirectory, 'bin', 'python3');
}

function getDefaultDapCliHome(): string {
  return path.join(homedir(), appDirectoryName);
}
