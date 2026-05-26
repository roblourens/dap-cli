import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { withAdapterLock } from '../../../src/adapters/provision/lock.js';
import { CliError } from '../../../src/cli/errors.js';

describe('withAdapterLock', () => {
  let workDir: string;

  beforeEach(async () => {
    workDir = await fs.mkdtemp(path.join(os.tmpdir(), 'dap-cli-lock-'));
  });

  afterEach(async () => {
    await fs.rm(workDir, { recursive: true, force: true });
  });

  test('serializes overlapping calls for the same adapter id', async () => {
    const events: string[] = [];
    const fast = { retryOverride: { retries: 40, minTimeout: 10, maxTimeout: 50, factor: 1 } };

    const first = withAdapterLock(workDir, 'js-debug', async () => {
      events.push('A:start');
      await new Promise(resolve => setTimeout(resolve, 100));
      events.push('A:end');
      return 'A';
    }, fast);

    // Briefly yield so the first call grabs the lock.
    await new Promise(resolve => setTimeout(resolve, 10));

    const second = withAdapterLock(workDir, 'js-debug', async () => {
      events.push('B:start');
      events.push('B:end');
      return 'B';
    }, fast);

    await Promise.all([first, second]);
    expect(events).toEqual(['A:start', 'A:end', 'B:start', 'B:end']);
  });

  test('different adapter ids do not block each other', async () => {
    const fast = { retryOverride: { retries: 5, minTimeout: 5, maxTimeout: 10, factor: 1 } };
    let aStarted = false;
    let bStarted = false;

    const a = withAdapterLock(workDir, 'js-debug', async () => {
      aStarted = true;
      // Wait until b has had a chance to start.
      while (!bStarted) {
        await new Promise(resolve => setTimeout(resolve, 5));
      }
    }, fast);

    const b = withAdapterLock(workDir, 'debugpy', async () => {
      bStarted = true;
    }, fast);

    await Promise.all([a, b]);
    expect(aStarted).toBe(true);
    expect(bStarted).toBe(true);
  });

  test('throws provision_lock_timeout when contention exceeds retries', async () => {
    const veryFast = { retryOverride: { retries: 2, minTimeout: 5, maxTimeout: 10, factor: 1 } };

    let released: (() => void) | undefined;
    const holder = withAdapterLock(workDir, 'busy', async () => {
      await new Promise<void>(resolve => {
        released = resolve;
      });
    }, veryFast);

    // Yield until holder owns the lock.
    await new Promise(resolve => setTimeout(resolve, 30));

    const error = await withAdapterLock(workDir, 'busy', async () => 'never', veryFast).catch((err: unknown) => err);
    expect(error).toBeInstanceOf(CliError);
    expect((error as CliError).code).toBe('provision_lock_timeout');
    expect((error as CliError).diagnostics.join('\n')).toContain('busy');

    released?.();
    await holder;
  });
});
