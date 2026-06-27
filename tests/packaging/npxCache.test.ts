// Pre-publish gate: asserts that the published dap-cli bin, installed from
// the actual npm tarball into a clean prefix and invoked as a child
// process, hits the on-disk adapter cache exactly the way an `npx
// dap-cli` second-invocation would in the wild.
//
// Why pre-populate the cache instead of doing a true cold install:
// JS_DEBUG_CHECKSUMS in src/adapters/provision/checksums.ts pins
// SHA-256 hashes at build time and exposes no env override (per phase
// 21 design — see decision log entry on bundled checksums). We cannot
// fake a tarball whose SHA matches the burned-in value at runtime.
// Instead we prove the *cache-hit* path is what `npx dap-cli ...`
// exercises across processes: pre-seed the cache, point the bin at a
// FakeReleaseServer that 404s on every request, run setup-adapters
// twice via spawn, assert exit 0 + server.hitCount === 0.
//
// Gated behind DAP_CLI_RUN_PACKAGING=1 so this only runs under
// `npm run check:pack` / `prepublishOnly`.

import { execFile, spawnSync } from 'node:child_process';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';

import { CODELLDB_VERSION, JS_DEBUG_VERSION } from '../../src/adapters/provision/checksums.js';
import { startFakeReleaseServer, type FakeReleaseServer } from '../helpers/fakeReleaseServer.js';
import { FAKE_CODELLDB_RUNTIME_PATHS } from '../helpers/buildFakeAdapterTarball.js';

const execFileAsync = promisify(execFile);
const RUN = process.env.DAP_CLI_RUN_PACKAGING === '1';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..', '..');

describe.skipIf(!RUN)('published bin cache behavior across processes', () => {
  let workDir: string;
  let installPrefix: string;
  let cacheRoot: string;
  let dapCliBin: string;
  let server: FakeReleaseServer | undefined;

  beforeAll(async () => {
    workDir = await fs.mkdtemp(path.join(os.tmpdir(), 'dap-cli-npx-'));
    installPrefix = path.join(workDir, 'install');
    cacheRoot = path.join(workDir, 'cache');
    await fs.mkdir(installPrefix, { recursive: true });
    await fs.mkdir(cacheRoot, { recursive: true });

    // 1. Build + pack the current tree, install into an isolated prefix.
    await execFileAsync('npm', ['run', 'build'], { cwd: repoRoot, maxBuffer: 64 * 1024 * 1024 });
    const packResult = await execFileAsync(
      'npm',
      ['pack', '--pack-destination', workDir, '--json'],
      { cwd: repoRoot, maxBuffer: 64 * 1024 * 1024 },
    );
    const packParsed = JSON.parse(packResult.stdout) as readonly { filename: string }[];
    const tarballPath = path.join(workDir, packParsed[0]!.filename);

    // Write a stub package.json so npm install has a project root to drop
    // node_modules into. Without it npm walks up the tree and contaminates
    // the dap-cli repo's own deps.
    await fs.writeFile(
      path.join(installPrefix, 'package.json'),
      JSON.stringify({ name: 'dap-cli-npx-harness', version: '0.0.0', private: true }),
    );
    await execFileAsync(
      'npm',
      ['install', '--no-save', '--no-audit', '--no-fund', '--prefer-offline', tarballPath],
      { cwd: installPrefix, maxBuffer: 64 * 1024 * 1024 },
    );

    dapCliBin = path.join(installPrefix, 'node_modules', '.bin', 'dap-cli');
    await fs.access(dapCliBin);

    // 2. Pre-seed cache — equivalent to what the provisioner would have
    //    written on a successful prior `npx dap-cli setup-adapters` run.
    //    The fast path requires: marker + both entrypoints + a package.json
    //    so node can resolve the dapDebugServer module type.
    const jsDebugRoot = path.join(cacheRoot, 'js-debug');
    const jsDebugSrc = path.join(jsDebugRoot, 'src');
    await fs.mkdir(jsDebugSrc, { recursive: true });
    await fs.writeFile(
      path.join(jsDebugRoot, 'package.json'),
      JSON.stringify({ name: 'js-debug-fake', version: JS_DEBUG_VERSION, type: 'commonjs' }),
    );
    await fs.writeFile(path.join(jsDebugSrc, 'dapDebugServer.js'), '// fake dapDebugServer\n');
    await fs.writeFile(path.join(jsDebugSrc, 'bootloader.js'), '// fake bootloader\n');
    await fs.writeFile(
      path.join(jsDebugRoot, `.consent-${JS_DEBUG_VERSION}`),
      `${new Date().toISOString()}\n`,
    );

    const codeLldbRoot = path.join(cacheRoot, 'codelldb');
    for (const relativePath of FAKE_CODELLDB_RUNTIME_PATHS) {
      const filePath = path.join(codeLldbRoot, relativePath);
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      await fs.writeFile(filePath, `fake codelldb runtime: ${relativePath}\n`);
    }
    await fs.writeFile(
      path.join(codeLldbRoot, `.consent-${CODELLDB_VERSION}`),
      `${new Date().toISOString()}\n`,
    );

    // 3. Server that fails on any request. Cache hits = zero requests =
    //    zero failures. Any miss would route through this server and
    //    produce a provision_* error.
    server = await startFakeReleaseServer([]);
  }, 240_000);

  afterAll(async () => {
    if (server !== undefined) {
      await server.close();
    }
    await fs.rm(workDir, { recursive: true, force: true });
  });

  function runDapCliSetup(adapter: 'js-debug' | 'codelldb' = 'js-debug'): { status: number | null; stdout: string; stderr: string } {
    const result = spawnSync(
      process.execPath,
      [dapCliBin, 'setup-adapters', '--adapter', adapter],
      {
        cwd: installPrefix,
        env: {
          // Inherit only what's needed; do NOT inherit HOME pointing at the
          // real user's ~/.dap-cli/adapters (would mask cache wiring bugs).
          PATH: process.env.PATH ?? '',
          HOME: workDir,
          USERPROFILE: workDir,
          DAP_CLI_HOME: path.join(workDir, 'home'),
          DAP_CLI_ADAPTERS_DIR: cacheRoot,
          DAP_CLI_PROVISION_RELEASE_BASE_URL: server!.url,
          DAP_CLI_ASSUME_YES: '1',
          ...(adapter === 'codelldb' ? { DAP_CLI_PROVISION_CODELLDB_PLATFORM_OVERRIDE: 'darwin_arm64' } : {}),
        },
        encoding: 'utf8',
        timeout: 30_000,
      },
    );
    return {
      status: result.status,
      stdout: result.stdout ?? '',
      stderr: result.stderr ?? '',
    };
  }

  test('two sequential setup-adapters invocations both short-circuit on cache; no network requests', () => {
    const first = runDapCliSetup();
    expect(first.status, `first invocation failed:\nstdout:\n${first.stdout}\nstderr:\n${first.stderr}`).toBe(0);

    const second = runDapCliSetup();
    expect(second.status, `second invocation failed:\nstdout:\n${second.stdout}\nstderr:\n${second.stderr}`).toBe(0);

    expect(server!.hitCount(), 'cache hits should not contact the release server').toBe(0);
  }, 60_000);

  test('published bin accepts a complete pre-staged CodeLLDB cache without network requests', () => {
    const result = runDapCliSetup('codelldb');
    expect(result.status, `CodeLLDB cache invocation failed:\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`).toBe(0);
    expect(server!.hitCount(), 'CodeLLDB cache hit should not contact the release server').toBe(0);
  }, 60_000);
});
