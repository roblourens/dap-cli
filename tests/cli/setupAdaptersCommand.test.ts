import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { Readable } from 'node:stream';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import * as tar from 'tar';

import { runSetupAdaptersAction } from '../../src/cli/commands/setupAdapters.js';
import {
  JS_DEBUG_CHECKSUMS,
  JS_DEBUG_VERSION,
  DELVE_CHECKSUMS,
  DELVE_VERSION,
  type DelvePlatformKey,
} from '../../src/adapters/provision/checksums.js';
import { CliError } from '../../src/cli/errors.js';
import {
  startFakeReleaseServer,
  type FakeReleaseServer,
} from '../helpers/fakeReleaseServer.js';

const execFileAsync = promisify(execFile);

async function detectPython3(): Promise<boolean> {
  try {
    await execFileAsync('python3', ['--version']);
    return true;
  } catch {
    return false;
  }
}

const python3Available = await detectPython3();
const skipDebugpy = process.env.DAP_CLI_TEST_SKIP_DEBUGPY === '1' || !python3Available;

const DELVE_PLATFORM: DelvePlatformKey = 'darwin_arm64';
const BARE_DELVE_VERSION = DELVE_VERSION.startsWith('v') ? DELVE_VERSION.slice(1) : DELVE_VERSION;
const JS_DEBUG_PATH = `/microsoft/vscode-js-debug/releases/download/v${JS_DEBUG_VERSION}/js-debug-dap-v${JS_DEBUG_VERSION}.tar.gz`;
const DELVE_PATH = `/go-delve/delve/releases/download/${DELVE_VERSION}/dlv_${BARE_DELVE_VERSION}_${DELVE_PLATFORM}.tar.gz`;

async function buildJsDebugTarball(workDir: string): Promise<{ body: Buffer; sha256: string }> {
  const src = path.join(workDir, 'js-tar-src');
  const inner = path.join(src, 'js-debug', 'src');
  await fs.mkdir(inner, { recursive: true });
  await fs.writeFile(path.join(inner, 'dapDebugServer.js'), '// fake dapDebugServer\n');
  await fs.writeFile(path.join(inner, 'bootloader.js'), '// fake bootloader\n');
  const archivePath = path.join(workDir, 'js-debug.tar.gz');
  await tar.c({ gzip: true, cwd: src, file: archivePath }, ['js-debug']);
  const body = await fs.readFile(archivePath);
  return { body, sha256: createHash('sha256').update(body).digest('hex') };
}

async function buildDelveTarball(workDir: string): Promise<{ body: Buffer; sha256: string }> {
  const src = path.join(workDir, 'delve-tar-src');
  await fs.mkdir(src, { recursive: true });
  await fs.writeFile(path.join(src, 'dlv'), '#!/bin/sh\necho fake-dlv\n');
  const archivePath = path.join(workDir, 'dlv.tar.gz');
  await tar.c({ gzip: true, cwd: src, file: archivePath }, ['dlv']);
  const body = await fs.readFile(archivePath);
  return { body, sha256: createHash('sha256').update(body).digest('hex') };
}

function createNonTtyStdin(): NodeJS.ReadStream {
  const stream = Readable.from(['']) as unknown as NodeJS.ReadStream;
  (stream as { isTTY?: boolean }).isTTY = false;
  return stream;
}

function createSinkStderr(): NodeJS.WriteStream {
  return { write: (_chunk: unknown): boolean => true } as unknown as NodeJS.WriteStream;
}

function setDelveSha(platform: DelvePlatformKey, sha: string): void {
  const bucket = DELVE_CHECKSUMS[DELVE_VERSION];
  if (bucket === undefined) {
    throw new Error(`DELVE_CHECKSUMS missing bucket for ${DELVE_VERSION}`);
  }
  bucket[platform] = sha;
}

describe.skipIf(process.platform === 'win32')('runSetupAdaptersAction', () => {
  let workDir: string;
  let server: FakeReleaseServer | undefined;
  let originalJsSha: string | undefined;
  let originalDelveSha: string | undefined;

  beforeEach(async () => {
    workDir = await fs.mkdtemp(path.join(os.tmpdir(), 'dap-cli-setup-cmd-'));
    originalJsSha = JS_DEBUG_CHECKSUMS[JS_DEBUG_VERSION];
    originalDelveSha = DELVE_CHECKSUMS[DELVE_VERSION]?.[DELVE_PLATFORM];
  });

  afterEach(async () => {
    if (originalJsSha !== undefined) {
      JS_DEBUG_CHECKSUMS[JS_DEBUG_VERSION] = originalJsSha;
    }
    if (originalDelveSha !== undefined && DELVE_CHECKSUMS[DELVE_VERSION] !== undefined) {
      DELVE_CHECKSUMS[DELVE_VERSION][DELVE_PLATFORM] = originalDelveSha;
    }
    if (server !== undefined) {
      await server.close();
      server = undefined;
    }
    await fs.rm(workDir, { recursive: true, force: true });
  });

  test('--adapter js-debug installs only js-debug (single FakeReleaseServer hit)', async () => {
    const jsTarball = await buildJsDebugTarball(workDir);
    JS_DEBUG_CHECKSUMS[JS_DEBUG_VERSION] = jsTarball.sha256;

    server = await startFakeReleaseServer([
      {
        match: req => req.url === JS_DEBUG_PATH,
        respond: (_req, res) => {
          res.statusCode = 200;
          res.setHeader('Content-Length', String(jsTarball.body.length));
          res.end(jsTarball.body);
        },
      },
    ]);

    const result = await runSetupAdaptersAction({
      adapter: 'js-debug',
      assumeYes: true,
      env: {
        DAP_CLI_HOME: workDir,
        DAP_CLI_PROVISION_RELEASE_BASE_URL: server.url,
      },
    });

    expect(result.adapters).toHaveLength(1);
    expect(result.adapters[0]).toMatchObject({
      id: 'js-debug',
      version: JS_DEBUG_VERSION,
      status: 'installed',
      installRoot: path.join(workDir, 'adapters', 'js-debug'),
    });
    expect(server.hitCount()).toBe(1);
  });

  test('warm cache returns status: cached without re-hitting the release server', async () => {
    const jsTarball = await buildJsDebugTarball(workDir);
    JS_DEBUG_CHECKSUMS[JS_DEBUG_VERSION] = jsTarball.sha256;

    server = await startFakeReleaseServer([
      {
        match: req => req.url === JS_DEBUG_PATH,
        respond: (_req, res) => {
          res.statusCode = 200;
          res.setHeader('Content-Length', String(jsTarball.body.length));
          res.end(jsTarball.body);
        },
      },
    ]);

    const env = {
      DAP_CLI_HOME: workDir,
      DAP_CLI_PROVISION_RELEASE_BASE_URL: server.url,
    };

    const first = await runSetupAdaptersAction({ adapter: 'js-debug', assumeYes: true, env });
    expect(first.adapters[0]?.status).toBe('installed');
    expect(server.hitCount()).toBe(1);

    const second = await runSetupAdaptersAction({ adapter: 'js-debug', assumeYes: true, env });
    expect(second.adapters[0]?.status).toBe('cached');
    expect(server.hitCount()).toBe(1);
  });

  test('partial failure: bad js-debug checksum surfaces as failed alongside successful delve', async () => {
    const jsTarball = await buildJsDebugTarball(workDir);
    const delveTarball = await buildDelveTarball(workDir);
    // Mutate the expected js-debug SHA to an invalid value so verification fails.
    JS_DEBUG_CHECKSUMS[JS_DEBUG_VERSION] = '0'.repeat(64);
    setDelveSha(DELVE_PLATFORM, delveTarball.sha256);

    server = await startFakeReleaseServer([
      {
        match: req => req.url === JS_DEBUG_PATH,
        respond: (_req, res) => {
          res.statusCode = 200;
          res.setHeader('Content-Length', String(jsTarball.body.length));
          res.end(jsTarball.body);
        },
      },
      {
        match: req => req.url === DELVE_PATH,
        respond: (_req, res) => {
          res.statusCode = 200;
          res.setHeader('Content-Length', String(delveTarball.body.length));
          res.end(delveTarball.body);
        },
      },
    ]);

    // Pre-warm the debugpy install layout so the action's iteration over all three
    // adapters short-circuits debugpy via fromCache=true (avoids a real pip install).
    const adaptersDir = path.join(workDir, 'adapters');
    const debugpyDir = path.join(adaptersDir, 'debugpy');
    await fs.mkdir(path.join(debugpyDir, 'venv', 'bin'), { recursive: true });
    await fs.writeFile(path.join(debugpyDir, 'venv', 'bin', 'python'), '#!/bin/sh\nexit 0\n');
    const { DEBUGPY_VERSION } = await import('../../src/adapters/provision/checksums.js');
    await fs.writeFile(path.join(debugpyDir, `.consent-${DEBUGPY_VERSION}`), '');

    const result = await runSetupAdaptersAction({
      assumeYes: true,
      env: {
        DAP_CLI_HOME: workDir,
        DAP_CLI_PROVISION_RELEASE_BASE_URL: server.url,
        DAP_CLI_PROVISION_DELVE_PLATFORM_OVERRIDE: DELVE_PLATFORM,
      },
    });

    expect(result.adapters).toHaveLength(3);
    const byId = Object.fromEntries(result.adapters.map(a => [a.id, a]));
    expect(byId['js-debug']?.status).toBe('failed');
    expect(byId['js-debug']?.error?.code).toBeTruthy();
    expect(byId['delve']?.status).toBe('installed');
    expect(byId['debugpy']?.status).toBe('cached');
  });

  test('non-TTY without --yes throws provision_consent_required once naming every pending adapter', async () => {
    // No server: confirm() must throw before any provisionAdapter call.
    let caught: unknown;
    try {
      await runSetupAdaptersAction({
        assumeYes: false,
        env: { DAP_CLI_HOME: workDir },
        stdin: createNonTtyStdin(),
        stderr: createSinkStderr(),
      });
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(CliError);
    const cliError = caught as CliError;
    expect(cliError.code).toBe('provision_consent_required');
    // The consolidated D-14 prompt names every pending adapter in one question.
    const blob = [cliError.message, ...cliError.diagnostics].join('\n');
    expect(blob).toContain('js-debug');
    expect(blob).toContain('debugpy');
    expect(blob).toContain('delve');
    // The server never opened: no provision attempt should have happened.
    expect(server).toBeUndefined();
  });

  test.skipIf(skipDebugpy)(
    'default invocation installs all three adapters (skipped when python3 unavailable)',
    async () => {
      const jsTarball = await buildJsDebugTarball(workDir);
      const delveTarball = await buildDelveTarball(workDir);
      JS_DEBUG_CHECKSUMS[JS_DEBUG_VERSION] = jsTarball.sha256;
      setDelveSha(DELVE_PLATFORM, delveTarball.sha256);

      server = await startFakeReleaseServer([
        {
          match: req => req.url === JS_DEBUG_PATH,
          respond: (_req, res) => {
            res.statusCode = 200;
            res.setHeader('Content-Length', String(jsTarball.body.length));
            res.end(jsTarball.body);
          },
        },
        {
          match: req => req.url === DELVE_PATH,
          respond: (_req, res) => {
            res.statusCode = 200;
            res.setHeader('Content-Length', String(delveTarball.body.length));
            res.end(delveTarball.body);
          },
        },
      ]);

      const result = await runSetupAdaptersAction({
        assumeYes: true,
        env: {
          ...process.env,
          DAP_CLI_HOME: workDir,
          DAP_CLI_PROVISION_RELEASE_BASE_URL: server.url,
          DAP_CLI_PROVISION_DELVE_PLATFORM_OVERRIDE: DELVE_PLATFORM,
        },
      });

      expect(result.adapters).toHaveLength(3);
      const statuses = Object.fromEntries(result.adapters.map(a => [a.id, a.status]));
      expect(statuses['js-debug']).toBe('installed');
      expect(statuses['debugpy']).toBe('installed');
      expect(statuses['delve']).toBe('installed');
      // debugpy provisions via pip, not via the FakeReleaseServer: server saw only 2 hits.
      expect(server.hitCount()).toBe(2);
    },
    180_000,
  );
});
