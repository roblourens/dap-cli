import { homedir } from 'node:os';
import path from 'node:path';

const appDirectoryName = 'dap-cli';

export function getDapCliHome(env: NodeJS.ProcessEnv = process.env, platform: NodeJS.Platform = process.platform): string {
  const configuredHome = env.DAP_CLI_HOME;

  if (configuredHome !== undefined && configuredHome.trim().length > 0) {
    return path.resolve(configuredHome);
  }

  return getDefaultDapCliHome(env, platform);
}

export function getDapCliStateDir(env: NodeJS.ProcessEnv = process.env, platform: NodeJS.Platform = process.platform): string {
  return path.join(getDapCliHome(env, platform), 'state');
}

export function getDapCliLogDir(env: NodeJS.ProcessEnv = process.env, platform: NodeJS.Platform = process.platform): string {
  return path.join(getDapCliHome(env, platform), 'logs');
}

function getDefaultDapCliHome(env: NodeJS.ProcessEnv, platform: NodeJS.Platform): string {
  if (platform === 'darwin') {
    return path.join(homedir(), 'Library', 'Application Support', appDirectoryName);
  }

  if (platform === 'win32') {
    const localAppData = env.LOCALAPPDATA;
    return path.join(localAppData !== undefined && localAppData.length > 0 ? localAppData : homedir(), appDirectoryName);
  }

  const xdgStateHome = env.XDG_STATE_HOME;
  return path.join(xdgStateHome !== undefined && xdgStateHome.length > 0 ? xdgStateHome : path.join(homedir(), '.local', 'state'), appDirectoryName);
}
