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
