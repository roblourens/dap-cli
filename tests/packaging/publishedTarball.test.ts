// Pre-publish gate: asserts that the npm tarball we are about to publish
// actually carries the lazy-provisioning runtime, and ONLY the runtime —
// no source tree, no tests, no .planning artifacts.
//
// Gated behind DAP_CLI_RUN_PACKAGING=1 so it only runs under `npm run
// check:pack` / `prepublishOnly`. A full `npm run build` happens in
// beforeAll so the dist/ checked into the repo cannot mask drift.

import { execFile } from 'node:child_process';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';

const execFileAsync = promisify(execFile);
const RUN = process.env.DAP_CLI_RUN_PACKAGING === '1';

interface NpmPackEntry {
  readonly path: string;
  readonly size: number;
}

interface NpmPackJsonEntry {
  readonly filename: string;
  readonly files: readonly NpmPackEntry[];
}

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..', '..');

describe.skipIf(!RUN)('npm pack output', () => {
  let dryRunFiles: readonly string[];
  let packedTarball: string | undefined;
  let extractDir: string | undefined;

  beforeAll(async () => {
    // Build fresh — never trust whatever dist/ happens to be on disk.
    await execFileAsync('npm', ['run', 'build'], { cwd: repoRoot, maxBuffer: 64 * 1024 * 1024 });

    const dryRun = await execFileAsync('npm', ['pack', '--dry-run', '--json'], {
      cwd: repoRoot,
      maxBuffer: 64 * 1024 * 1024,
    });
    const parsed = JSON.parse(dryRun.stdout) as readonly NpmPackJsonEntry[];
    expect(parsed.length).toBeGreaterThan(0);
    dryRunFiles = parsed[0]!.files.map(f => f.path.replace(/\\/g, '/'));
  }, 120_000);

  afterAll(async () => {
    if (packedTarball !== undefined) {
      await fs.rm(packedTarball, { force: true });
    }
    if (extractDir !== undefined) {
      await fs.rm(extractDir, { recursive: true, force: true });
    }
  });

  test('includes the published bin entry and metadata', () => {
    expect(dryRunFiles).toContain('dist/index.js');
    expect(dryRunFiles).toContain('README.md');
    expect(dryRunFiles).toContain('LICENSE');
    expect(dryRunFiles).toContain('package.json');
  });

  test('excludes source, tests, scripts, planning artifacts, and dev configs', () => {
    const forbiddenPrefixes = ['src/', 'tests/', 'scripts/', '.planning/', 'dev/', 'docs/', 'tmp/'];
    const forbiddenExact = [
      'tsup.config.ts',
      'vitest.config.ts',
      'eslint.config.js',
      'tsconfig.json',
      'marketplace.json',
    ];
    for (const file of dryRunFiles) {
      for (const prefix of forbiddenPrefixes) {
        expect(file.startsWith(prefix), `forbidden prefix '${prefix}' in tarball entry: ${file}`).toBe(false);
      }
      expect(forbiddenExact, `forbidden file in tarball: ${file}`).not.toContain(file);
      expect(file.endsWith('.test.ts'), `test file in tarball: ${file}`).toBe(false);
      expect(file.endsWith('.spec.ts'), `spec file in tarball: ${file}`).toBe(false);
    }
  });

  test('packed tarball contains a provisioner-carrying bin entry', async () => {
    // Actual `npm pack` (no --dry-run) so we can inspect the file bodies.
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'dap-cli-pack-'));
    const packResult = await execFileAsync('npm', ['pack', '--pack-destination', tmpDir, '--json'], {
      cwd: repoRoot,
      maxBuffer: 64 * 1024 * 1024,
    });
    const packParsed = JSON.parse(packResult.stdout) as readonly { filename: string }[];
    packedTarball = path.join(tmpDir, packParsed[0]!.filename);

    extractDir = await fs.mkdtemp(path.join(os.tmpdir(), 'dap-cli-pack-extract-'));
    await execFileAsync('tar', ['-xzf', packedTarball, '-C', extractDir]);

    // npm pack roots the archive at 'package/'.
    const pkgDir = path.join(extractDir, 'package');
    const binJs = path.join(pkgDir, 'dist', 'index.js');
    const body = await fs.readFile(binJs, 'utf8');
    expect(body.startsWith('#!/usr/bin/env node'), 'dist/index.js missing shebang').toBe(true);
    expect(body).toContain('provisionAdapter');
    expect(body).toContain('withAdapterLock');
    expect(body).toContain('codelldb-darwin-arm64.vsix');
    expect(body).toContain('Only the official CodeLLDB darwin-arm64 artifact has passed verification.');

    // Walk the extracted tree and assert no .test.ts/.spec.ts survived.
    const walk = async (dir: string): Promise<string[]> => {
      const out: string[] = [];
      for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          out.push(...await walk(full));
        } else {
          out.push(full);
        }
      }
      return out;
    };
    const allFiles = await walk(pkgDir);
    for (const f of allFiles) {
      expect(f.endsWith('.test.ts'), `unexpected test file in extracted tarball: ${f}`).toBe(false);
      expect(f.endsWith('.spec.ts'), `unexpected spec file in extracted tarball: ${f}`).toBe(false);
    }
  }, 120_000);
});
