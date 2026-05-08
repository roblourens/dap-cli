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
      // Browser smokes spawn Chrome with --user-data-dir under dapCliHome.
      // Chrome's profile-dir flush can still be in flight when the test ends,
      // racing with `fs.rm` and producing ENOTEMPTY on subdirs like
      // `Default/Service Worker/Database`. Node's built-in retry handles
      // ENOTEMPTY/EBUSY/EPERM, which covers the observed race without us
      // having to add a sleep.
      await fs.rm(dapCliHome, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
    },
  };
}

export interface ProvisionAdapterOptions {
  sourceDapCliHome?: string;
}

export interface ProvisionAdapterResult {
  source: string;
  destination: string;
  mode: 'symlink' | 'copy';
  copiedAdapterConfig: boolean;
}

const jsDebugPackageBoundary = '{"type":"commonjs"}\n';

/**
 * Mirrors a built-in adapter that the user has installed via `npm run setup-adapters`
 * into a temporary DAP_CLI_HOME used by self-contained tests. Prefers a directory
 * symlink for speed; falls back to a deep copy when symlinks aren't permitted.
 *
 * Throws a clear, actionable error when the source adapter is missing — that's how
 * we surface "you forgot to run setup-adapters" instead of the deeper, opaque
 * `js_debug_not_found` failure that bubbles out of the registry mid-test.
 */
export async function provisionAdapterIntoTempEnv(
  target: TempDapCliEnv,
  adapterId: string,
  options: ProvisionAdapterOptions = {},
): Promise<ProvisionAdapterResult> {
  const sourceHome = options.sourceDapCliHome ?? process.env.DAP_CLI_HOME ?? path.join(os.homedir(), '.dap-cli');
  const source = path.join(sourceHome, 'adapters', adapterId);
  const destination = path.join(target.dapCliHome, 'adapters', adapterId);

  try {
    await fs.stat(source);
  } catch (error) {
    if (isNodeError(error) && error.code === 'ENOENT') {
      throw new Error(
        `Adapter "${adapterId}" is not installed at ${source}. Run \`npm run setup-adapters\` first.`,
      );
    }
    throw error;
  }

  await fs.mkdir(path.dirname(destination), { recursive: true });
  // Re-provisioning is idempotent: clear any prior link/copy first so we always
  // produce the requested mode.
  await fs.rm(destination, { recursive: true, force: true });

  let mode: 'symlink' | 'copy';
  try {
    await fs.symlink(source, destination, 'dir');
    mode = 'symlink';
  } catch {
    await fs.cp(source, destination, { recursive: true, dereference: true });
    mode = 'copy';
  }

  if (adapterId === 'js-debug') {
    await fs.writeFile(path.join(destination, 'package.json'), jsDebugPackageBoundary, 'utf8');
  }

  // Mirror config/adapters.json when the user has one — the registry merges built-ins
  // with this file, and silently missing it is the same class of "tmp env is incomplete"
  // bug we're closing.
  const sourceAdapterConfig = path.join(sourceHome, 'config', 'adapters.json');
  const destAdapterConfig = path.join(target.dapCliHome, 'config', 'adapters.json');
  let copiedAdapterConfig = false;
  try {
    await fs.stat(sourceAdapterConfig);
    await fs.mkdir(path.dirname(destAdapterConfig), { recursive: true });
    await fs.copyFile(sourceAdapterConfig, destAdapterConfig);
    copiedAdapterConfig = true;
  } catch (error) {
    if (!isNodeError(error) || error.code !== 'ENOENT') {
      throw error;
    }
  }

  return { source, destination, mode, copiedAdapterConfig };
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error;
}
