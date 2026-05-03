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

function getDefaultDapCliHome(): string {
  return path.join(homedir(), appDirectoryName);
}
