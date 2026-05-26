// Tests D-12 (DAP_CLI_ADAPTERS_DIR cache-root override) at the provisioner
// layer. The same env var is exercised across child processes via
// tests/packaging/npxCache.test.ts; this test pins down the in-process
// helper contract so both paths stay in sync.

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';

import { provisionAdapter } from '../../../src/adapters/provision/index.js';
import {
  JS_DEBUG_CHECKSUMS,
  JS_DEBUG_VERSION,
} from '../../../src/adapters/provision/checksums.js';
import { getDapCliAdaptersDir, getDapCliHome } from '../../../src/config/paths.js';
import {
  jsDebugTarballHandler,
  startFakeReleaseServer,
  type FakeReleaseServer,
} from '../../helpers/fakeReleaseServer.js';
import { buildFakeJsDebugTarball } from '../../helpers/buildFakeAdapterTarball.js';

describe('DAP_CLI_ADAPTERS_DIR override (D-12)', () => {
  let workDir: string;
  let server: FakeReleaseServer | undefined;
  let originalSha: string | undefined;

  beforeEach(async () => {
    workDir = await fs.mkdtemp(path.join(os.tmpdir(), 'dap-cli-cacheroot-'));
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

  test('getDapCliAdaptersDir honors DAP_CLI_ADAPTERS_DIR over DAP_CLI_HOME', () => {
    const override = path.join(workDir, 'custom-cache');
    const home = path.join(workDir, 'home');
    expect(getDapCliAdaptersDir({ DAP_CLI_HOME: home, DAP_CLI_ADAPTERS_DIR: override }))
      .toBe(path.resolve(override));
    // Default fallback when override is absent.
    expect(getDapCliAdaptersDir({ DAP_CLI_HOME: home }))
      .toBe(path.join(home, 'adapters'));
    // Whitespace-only override is treated as unset.
    expect(getDapCliAdaptersDir({ DAP_CLI_HOME: home, DAP_CLI_ADAPTERS_DIR: '   ' }))
      .toBe(path.join(home, 'adapters'));
  });

  test('provisionAdapter installs under the DAP_CLI_ADAPTERS_DIR root, leaving DAP_CLI_HOME/adapters empty', async () => {
    const archive = await buildFakeJsDebugTarball(JS_DEBUG_VERSION, workDir);
    JS_DEBUG_CHECKSUMS[JS_DEBUG_VERSION] = archive.sha256;

    server = await startFakeReleaseServer([
      jsDebugTarballHandler({ version: JS_DEBUG_VERSION, archivePath: archive.path }),
    ]);

    const overrideRoot = path.join(workDir, 'custom-cache');
    const dapCliHome = path.join(workDir, 'home');
    await fs.mkdir(dapCliHome, { recursive: true });

    const env: NodeJS.ProcessEnv = {
      DAP_CLI_HOME: dapCliHome,
      DAP_CLI_ADAPTERS_DIR: overrideRoot,
      DAP_CLI_PROVISION_RELEASE_BASE_URL: server.url,
    };

    // Compute adaptersDir via the public helper — this is the wiring that
    // the setup-adapters CLI uses, so testing through it catches drift.
    const adaptersDir = getDapCliAdaptersDir(env);
    expect(adaptersDir).toBe(path.resolve(overrideRoot));

    const result = await provisionAdapter('js-debug', {
      env,
      assumeYes: true,
      adaptersDir,
    });

    expect(result.installRoot).toBe(path.join(path.resolve(overrideRoot), 'js-debug'));
    await fs.access(path.join(path.resolve(overrideRoot), 'js-debug', 'src', 'dapDebugServer.js'));

    // The DAP_CLI_HOME-derived adapters dir should NOT have been touched.
    const defaultAdaptersDir = path.join(getDapCliHome({ DAP_CLI_HOME: dapCliHome }), 'adapters');
    const homeContents = await fs
      .readdir(defaultAdaptersDir)
      .catch((err: NodeJS.ErrnoException) => {
        if (err.code === 'ENOENT') {
          return [] as string[];
        }
        throw err;
      });
    expect(homeContents).toEqual([]);

    await archive.cleanup();
  });
});
