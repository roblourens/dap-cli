import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export interface TempDapCliEnv {
  dapCliHome: string;
  env: NodeJS.ProcessEnv;
  cleanup(): Promise<void>;
}

export async function createTempDapCliEnv(prefix = 'dap-cli-'): Promise<TempDapCliEnv> {
  const dapCliHome = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  return {
    dapCliHome,
    env: { ...process.env, DAP_CLI_HOME: dapCliHome },
    async cleanup(): Promise<void> {
      await fs.rm(dapCliHome, { recursive: true, force: true });
    },
  };
}
