import path from 'node:path';
import { promises as fs } from 'node:fs';
import * as lockfile from 'proper-lockfile';
import { usageError, CliError } from '../../cli/errors.js';

export interface LockOptions {
  /** Override retry settings for tests. */
  readonly retryOverride?: {
    readonly retries: number;
    readonly minTimeout: number;
    readonly maxTimeout: number;
    readonly factor: number;
  };
}

interface RetryConfig {
  readonly retries: number;
  readonly minTimeout: number;
  readonly maxTimeout: number;
  readonly factor: number;
}

const PRODUCTION_RETRY: RetryConfig = {
  retries: 60,
  minTimeout: 500,
  maxTimeout: 2000,
  factor: 1,
};

const STALE_MS = 5 * 60 * 1000;

const CACHE_UNWRITABLE_CODES = new Set(['EACCES', 'EROFS', 'ENOSPC', 'EPERM']);

function getErrnoCode(error: unknown): string | undefined {
  if (error instanceof Error && 'code' in error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (typeof code === 'string') {
      return code;
    }
  }
  return undefined;
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

function resolveRetry(options: LockOptions | undefined): RetryConfig {
  if (options?.retryOverride !== undefined) {
    return options.retryOverride;
  }
  const env = process.env.DAP_CLI_LOCK_RETRY_OVERRIDE;
  if (env !== undefined && env.length > 0) {
    try {
      const parsed: unknown = JSON.parse(env);
      if (parsed !== null && typeof parsed === 'object') {
        const candidate = parsed as Record<string, unknown>;
        const retries = candidate.retries;
        const minTimeout = candidate.minTimeout;
        const maxTimeout = candidate.maxTimeout;
        const factor = candidate.factor;
        if (
          typeof retries === 'number' &&
          typeof minTimeout === 'number' &&
          typeof maxTimeout === 'number' &&
          typeof factor === 'number'
        ) {
          return { retries, minTimeout, maxTimeout, factor };
        }
      }
    } catch {
      // fall through to production retry
    }
  }
  return PRODUCTION_RETRY;
}

function lockTimeoutError(adapterId: string, sentinel: string): CliError {
  return usageError('Timed out waiting for adapter install lock.', {
    code: 'provision_lock_timeout',
    diagnostics: [
      `Adapter: ${adapterId}`,
      `Lock sentinel: ${sentinel}`,
      `Another dap-cli process may be installing; if none, delete ${sentinel} and retry.`,
    ],
    data: { adapterId, sentinel },
  });
}

export async function withAdapterLock<T>(
  adaptersDir: string,
  adapterId: string,
  fn: () => Promise<T>,
  options?: LockOptions,
): Promise<T> {
  try {
    await fs.mkdir(adaptersDir, { recursive: true });
  } catch (error) {
    const errnoCode = getErrnoCode(error);
    if (errnoCode !== undefined && CACHE_UNWRITABLE_CODES.has(errnoCode)) {
      throw cacheUnwritableError(adaptersDir, errnoCode, adapterId);
    }
    throw error;
  }

  const sentinel = path.join(adaptersDir, `.${adapterId}.lock-target`);
  try {
    await fs.writeFile(sentinel, '', { flag: 'a' });
  } catch (error) {
    const errnoCode = getErrnoCode(error);
    if (errnoCode !== undefined && CACHE_UNWRITABLE_CODES.has(errnoCode)) {
      throw cacheUnwritableError(adaptersDir, errnoCode, adapterId);
    }
    throw error;
  }

  const retry = resolveRetry(options);
  let release: (() => Promise<void>) | undefined;
  try {
    release = await lockfile.lock(sentinel, {
      stale: STALE_MS,
      realpath: false,
      retries: { ...retry },
    });
  } catch (error) {
    const errnoCode = getErrnoCode(error);
    if (errnoCode === 'ELOCKED' || errnoCode === 'EEXIST') {
      throw lockTimeoutError(adapterId, sentinel);
    }
    if (errnoCode !== undefined && CACHE_UNWRITABLE_CODES.has(errnoCode)) {
      throw cacheUnwritableError(adaptersDir, errnoCode, adapterId);
    }
    throw error;
  }

  try {
    return await fn();
  } finally {
    if (release !== undefined) {
      await release().catch(() => undefined);
    }
  }
}
