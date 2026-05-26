import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { Readable } from 'node:stream';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import * as tar from 'tar';

import { provisionJsDebug } from '../../../src/adapters/provision/jsDebug.js';
import {
  JS_DEBUG_CHECKSUMS,
  JS_DEBUG_VERSION,
} from '../../../src/adapters/provision/checksums.js';
import { CliError } from '../../../src/cli/errors.js';
import {
  startFakeReleaseServer,
  type FakeReleaseServer,
} from '../../helpers/fakeReleaseServer.js';

const RELEASE_PATH = `/microsoft/vscode-js-debug/releases/download/v${JS_DEBUG_VERSION}/js-debug-dap-v${JS_DEBUG_VERSION}.tar.gz`;

async function buildJsDebugTarball(workDir: string): Promise<{ archivePath: string; body: Buffer; sha256: string }> {
  const src = path.join(workDir, 'tar-src');
  const inner = path.join(src, 'js-debug', 'src');
  await fs.mkdir(inner, { recursive: true });
  await fs.writeFile(path.join(inner, 'dapDebugServer.js'), '// fake dapDebugServer\n');
  await fs.writeFile(path.join(inner, 'bootloader.js'), '// fake bootloader\n');
  const archivePath = path.join(workDir, 'js-debug.tar.gz');
  await tar.c({ gzip: true, cwd: src, file: archivePath }, ['js-debug']);
  const body = await fs.readFile(archivePath);
  return { archivePath, body, sha256: createHash('sha256').update(body).digest('hex') };
}

function createTtyStdin(input: string): NodeJS.ReadStream {
  const stream = Readable.from([input]) as unknown as NodeJS.ReadStream;
  (stream as { isTTY?: boolean }).isTTY = true;
  return stream;
}

function createNonTtyStdin(): NodeJS.ReadStream {
  const stream = Readable.from(['']) as unknown as NodeJS.ReadStream;
  (stream as { isTTY?: boolean }).isTTY = false;
  return stream;
}

function createSinkStderr(): NodeJS.WriteStream {
  const out = { write: (_chunk: unknown): boolean => true };
  return out as unknown as NodeJS.WriteStream;
}

describe('provisionJsDebug', () => {
  let workDir: string;
  let adaptersDir: string;
  let server: FakeReleaseServer | undefined;
  let originalSha: string | undefined;

  beforeEach(async () => {
    workDir = await fs.mkdtemp(path.join(os.tmpdir(), 'dap-cli-prov-js-'));
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

  test('cold cache installs, verifies SHA-256, writes consent marker, fromCache=false', async () => {
    const tarball = await buildJsDebugTarball(workDir);
    JS_DEBUG_CHECKSUMS[JS_DEBUG_VERSION] = tarball.sha256;

    server = await startFakeReleaseServer([
      {
        match: req => req.url === RELEASE_PATH,
        respond: (_req, res) => {
          res.statusCode = 200;
          res.setHeader('Content-Length', String(tarball.body.length));
          res.end(tarball.body);
        },
      },
    ]);

    const result = await provisionJsDebug({
      env: { DAP_CLI_PROVISION_RELEASE_BASE_URL: server.url },
      assumeYes: true,
      adaptersDir,
    });

    expect(result.adapterId).toBe('js-debug');
    expect(result.version).toBe(JS_DEBUG_VERSION);
    expect(result.fromCache).toBe(false);
    expect(result.installRoot).toBe(path.join(adaptersDir, 'js-debug'));
    expect(result.entrypoint).toBe(path.join(adaptersDir, 'js-debug', 'src', 'dapDebugServer.js'));

    expect(await fs.readFile(result.entrypoint, 'utf8')).toContain('fake dapDebugServer');
    expect(await fs.readFile(path.join(adaptersDir, 'js-debug', 'src', 'bootloader.js'), 'utf8'))
      .toContain('fake bootloader');
    expect(await fs.readFile(path.join(adaptersDir, 'js-debug', 'package.json'), 'utf8'))
      .toBe('{"type":"commonjs"}\n');
    await fs.access(path.join(adaptersDir, 'js-debug', `.consent-${JS_DEBUG_VERSION}`));
    expect(server.hitCount()).toBe(1);
  });

  test('warm cache returns fromCache=true without any network call', async () => {
    const tarball = await buildJsDebugTarball(workDir);
    JS_DEBUG_CHECKSUMS[JS_DEBUG_VERSION] = tarball.sha256;

    server = await startFakeReleaseServer([
      {
        match: () => true,
        respond: (_req, res) => {
          res.statusCode = 200;
          res.setHeader('Content-Length', String(tarball.body.length));
          res.end(tarball.body);
        },
      },
    ]);

    await provisionJsDebug({
      env: { DAP_CLI_PROVISION_RELEASE_BASE_URL: server.url },
      assumeYes: true,
      adaptersDir,
    });
    const baselineHits = server.hitCount();

    const result = await provisionJsDebug({
      env: { DAP_CLI_PROVISION_RELEASE_BASE_URL: server.url },
      assumeYes: true,
      adaptersDir,
    });

    expect(result.fromCache).toBe(true);
    expect(server.hitCount()).toBe(baselineHits);
  });

  test('checksum mismatch throws provision_checksum_mismatch with no canonical install', async () => {
    const tarball = await buildJsDebugTarball(workDir);
    // Force a wrong expected hash to simulate a tampered or stale upstream.
    JS_DEBUG_CHECKSUMS[JS_DEBUG_VERSION] = 'f'.repeat(64);

    server = await startFakeReleaseServer([
      {
        match: () => true,
        respond: (_req, res) => {
          res.statusCode = 200;
          res.setHeader('Content-Length', String(tarball.body.length));
          res.end(tarball.body);
        },
      },
    ]);

    const error = await provisionJsDebug({
      env: { DAP_CLI_PROVISION_RELEASE_BASE_URL: server.url },
      assumeYes: true,
      adaptersDir,
    }).catch((err: unknown) => err);

    expect(error).toBeInstanceOf(CliError);
    expect((error as CliError).code).toBe('provision_checksum_mismatch');
    await expect(fs.access(path.join(adaptersDir, 'js-debug'))).rejects.toThrow();
  });

  test('consent decline throws provision_consent_declined with no download', async () => {
    server = await startFakeReleaseServer([
      { match: () => true, respond: (_req, res) => { res.statusCode = 500; res.end(); } },
    ]);

    const error = await provisionJsDebug({
      env: { DAP_CLI_PROVISION_RELEASE_BASE_URL: server.url },
      assumeYes: false,
      adaptersDir,
      stdin: createTtyStdin('\n'),
      stderr: createSinkStderr(),
    }).catch((err: unknown) => err);

    expect(error).toBeInstanceOf(CliError);
    expect((error as CliError).code).toBe('provision_consent_declined');
    expect(server.hitCount()).toBe(0);
  });

  test('non-TTY + assumeYes=false throws provision_consent_required with no download', async () => {
    server = await startFakeReleaseServer([
      { match: () => true, respond: (_req, res) => { res.statusCode = 500; res.end(); } },
    ]);

    const error = await provisionJsDebug({
      env: { DAP_CLI_PROVISION_RELEASE_BASE_URL: server.url },
      assumeYes: false,
      adaptersDir,
      stdin: createNonTtyStdin(),
    }).catch((err: unknown) => err);

    expect(error).toBeInstanceOf(CliError);
    expect((error as CliError).code).toBe('provision_consent_required');
    expect(server.hitCount()).toBe(0);
  });
});
