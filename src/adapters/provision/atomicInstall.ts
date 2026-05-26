import path from 'node:path';
import { promises as fs } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { usageError, CliError } from '../../cli/errors.js';

const CACHE_UNWRITABLE_CODES = new Set(['EACCES', 'EROFS', 'ENOSPC', 'EPERM']);

function isCacheUnwritableError(error: unknown): error is NodeJS.ErrnoException {
  if (!(error instanceof Error) || !('code' in error)) {
    return false;
  }
  const code = (error as NodeJS.ErrnoException).code;
  return typeof code === 'string' && CACHE_UNWRITABLE_CODES.has(code);
}

function cacheUnwritableError(adaptersDir: string, errnoCode: string, adapterId: string): CliError {
  return usageError('Adapter cache directory is not writable.', {
    code: 'provision_cache_unwritable',
    diagnostics: [
      `Adapter cache: ${adaptersDir}`,
      `Filesystem error: ${errnoCode}`,
      'Override with `DAP_CLI_ADAPTERS_DIR=<writable-path>`.',
    ],
    data: { adaptersDir, errnoCode, adapterId },
  });
}

export interface AtomicInstallOptions {
  readonly adaptersDir: string;
  readonly adapterId: string;
  /** Populate the staging directory with the adapter payload. */
  readonly populate: (stagingDir: string) => Promise<void>;
  /**
   * Entry-point paths relative to the staging directory that MUST exist after
   * populate() completes. Verified before the staging directory is promoted to
   * the canonical location.
   */
  readonly expectedEntrypoints: readonly string[];
}

function stagingName(adapterId: string): string {
  return `.${adapterId}.tmp.${process.pid}.${randomBytes(4).toString('hex')}`;
}

async function verifyEntrypoints(stagingDir: string, entrypoints: readonly string[]): Promise<void> {
  for (const rel of entrypoints) {
    const target = path.join(stagingDir, rel);
    try {
      await fs.stat(target);
    } catch (cause) {
      throw usageError('Adapter install completed but the expected entry point is missing.', {
        code: 'provision_extract_failed',
        diagnostics: [`Missing entry point: ${rel}`, `Staging directory: ${stagingDir}`],
        data: { entrypoint: rel, stagingDir },
        cause,
      });
    }
  }
}

/**
 * Stage adapter contents into a sibling .tmp directory, verify entry points,
 * then atomically replace the canonical adapter directory via rename. Caller is
 * responsible for holding the adapter install lock before invoking this.
 */
export async function atomicInstall(options: AtomicInstallOptions): Promise<string> {
  const { adaptersDir, adapterId, populate, expectedEntrypoints } = options;
  try {
    await fs.mkdir(adaptersDir, { recursive: true });
  } catch (error) {
    if (isCacheUnwritableError(error)) {
      throw cacheUnwritableError(adaptersDir, error.code ?? 'unknown', adapterId);
    }
    throw error;
  }
  const canonical = path.join(adaptersDir, adapterId);
  const staging = path.join(adaptersDir, stagingName(adapterId));

  try {
    await fs.mkdir(staging, { recursive: true });
  } catch (error) {
    if (isCacheUnwritableError(error)) {
      throw cacheUnwritableError(adaptersDir, error.code ?? 'unknown', adapterId);
    }
    throw error;
  }

  try {
    await populate(staging);
    await verifyEntrypoints(staging, expectedEntrypoints);
    await fs.rm(canonical, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    await fs.rename(staging, canonical);
    return canonical;
  } catch (error) {
    await fs.rm(staging, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }).catch(() => undefined);
    if (!(error instanceof CliError) && isCacheUnwritableError(error)) {
      throw cacheUnwritableError(adaptersDir, error.code ?? 'unknown', adapterId);
    }
    throw error;
  }
}
