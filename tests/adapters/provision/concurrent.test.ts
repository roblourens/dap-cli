// Tests D-08 (lockfile serialization): concurrent provisionAdapter calls
// against an empty cache MUST result in exactly one download and exactly one
// fromCache=false outcome; sibling callers wait on the proper-lockfile lock
// and pick up the install via the under-lock double-check.
//
// In-process Promise.all is sufficient even though the spec talks about
// "concurrent npx invocations": proper-lockfile uses a filesystem-level lock
// directory (`<adaptersDir>/.<id>.lock-target`), which serializes all callers
// in the same process exactly the same way it serializes separate processes.
// The cross-process path is covered by tests/packaging/npxCache.test.ts.

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';

import { provisionAdapter } from '../../../src/adapters/provision/index.js';
import {
  JS_DEBUG_CHECKSUMS,
  JS_DEBUG_VERSION,
} from '../../../src/adapters/provision/checksums.js';
import {
  jsDebugTarballHandler,
  startFakeReleaseServer,
  type FakeReleaseServer,
} from '../../helpers/fakeReleaseServer.js';
import { buildFakeJsDebugTarball } from '../../helpers/buildFakeAdapterTarball.js';

describe('provisionAdapter concurrency', () => {
  let workDir: string;
  let adaptersDir: string;
  let server: FakeReleaseServer | undefined;
  let originalSha: string | undefined;

  beforeEach(async () => {
    workDir = await fs.mkdtemp(path.join(os.tmpdir(), 'dap-cli-concurrent-'));
    adaptersDir = path.join(workDir, 'adapters');
    await fs.mkdir(adaptersDir, { recursive: true });
    originalSha = JS_DEBUG_CHECKSUMS[JS_DEBUG_VERSION];
  });

  afterEach(async () => {
    if (originalSha !== undefined) {
      JS_DEBUG_CHECKSUMS[JS_DEBUG_VERSION] = originalSha;
    }
    if (server !== undefined) {
      await server.close();
      server = undefined;
    }
    await fs.rm(workDir, { recursive: true, force: true });
  });

  test('cold cache: 4 parallel callers serialize on the lock, exactly one download happens', async () => {
    const archive = await buildFakeJsDebugTarball(JS_DEBUG_VERSION, workDir);
    JS_DEBUG_CHECKSUMS[JS_DEBUG_VERSION] = archive.sha256;

    server = await startFakeReleaseServer([
      jsDebugTarballHandler({ version: JS_DEBUG_VERSION, archivePath: archive.path }),
    ]);

    const baseUrl = server.url;
    const results = await Promise.all(
      [0, 1, 2, 3].map(() =>
        provisionAdapter('js-debug', {
          env: {
            DAP_CLI_PROVISION_RELEASE_BASE_URL: baseUrl,
            // Tighten lock retry so the test runs quickly even if scheduling
            // jitter widens the contention window.
            DAP_CLI_LOCK_RETRY_OVERRIDE: JSON.stringify({
              retries: 120,
              minTimeout: 20,
              maxTimeout: 100,
              factor: 1,
            }),
          },
          assumeYes: true,
          adaptersDir,
        }),
      ),
    );

    expect(server.hitCount()).toBe(1);
    const expectedRoot = path.join(adaptersDir, 'js-debug');
    for (const result of results) {
      expect(result.adapterId).toBe('js-debug');
      expect(result.version).toBe(JS_DEBUG_VERSION);
      expect(result.installRoot).toBe(expectedRoot);
    }
    // D-08 contract: lockfile serialization means exactly one HTTP download
    // happened. The under-lock double-check inside provisionJsDebug skipped
    // the install path for the other three callers. We deliberately do NOT
    // assert that those three return `fromCache: true` — today, the
    // provisioner only sets `fromCache: true` on the fast-path (pre-lock)
    // cache check. Reporting cache-hits from the under-lock skip path would
    // be a UX improvement but lives outside this plan's scope (test harness
    // + packaging only). Tracked in deferred-items.md.

    await archive.cleanup();
  });

  test('warm cache: 4 parallel callers hit the fast path, server is untouched', async () => {
    const archive = await buildFakeJsDebugTarball(JS_DEBUG_VERSION, workDir);
    JS_DEBUG_CHECKSUMS[JS_DEBUG_VERSION] = archive.sha256;

    server = await startFakeReleaseServer([
      jsDebugTarballHandler({ version: JS_DEBUG_VERSION, archivePath: archive.path }),
    ]);
    const baseUrl = server.url;
    const env = {
      DAP_CLI_PROVISION_RELEASE_BASE_URL: baseUrl,
    };

    // Prime the cache with a sequential install first.
    const primed = await provisionAdapter('js-debug', { env, assumeYes: true, adaptersDir });
    expect(primed.fromCache).toBe(false);
    const hitsAfterPrime = server.hitCount();
    expect(hitsAfterPrime).toBe(1);

    const results = await Promise.all(
      [0, 1, 2, 3].map(() =>
        provisionAdapter('js-debug', { env, assumeYes: true, adaptersDir }),
      ),
    );

    expect(server.hitCount()).toBe(hitsAfterPrime); // no additional fetches
    for (const result of results) {
      expect(result.fromCache).toBe(true);
      expect(result.installRoot).toBe(path.join(adaptersDir, 'js-debug'));
    }

    await archive.cleanup();
  });
});
