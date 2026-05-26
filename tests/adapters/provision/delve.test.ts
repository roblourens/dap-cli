import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { Readable } from 'node:stream';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import * as tar from 'tar';

import { provisionDelve } from '../../../src/adapters/provision/delve.js';
import {
  DELVE_CHECKSUMS,
  DELVE_VERSION,
  type DelvePlatformKey,
} from '../../../src/adapters/provision/checksums.js';
import { CliError } from '../../../src/cli/errors.js';
import {
  startFakeReleaseServer,
  type FakeReleaseServer,
} from '../../helpers/fakeReleaseServer.js';

// Force a deterministic platform for the provisioner so tests are platform-agnostic.
const PLATFORM_KEY: DelvePlatformKey = 'darwin_arm64';
const BARE_VERSION = DELVE_VERSION.startsWith('v') ? DELVE_VERSION.slice(1) : DELVE_VERSION;
const RELEASE_PATH = `/go-delve/delve/releases/download/${DELVE_VERSION}/dlv_${BARE_VERSION}_${PLATFORM_KEY}.tar.gz`;

async function buildDelveTarball(workDir: string): Promise<{ body: Buffer; sha256: string }> {
  const src = path.join(workDir, 'tar-src');
  await fs.mkdir(src, { recursive: true });
  // The official delve archive is flat — `dlv` sits at the archive root.
  await fs.writeFile(path.join(src, 'dlv'), '#!/bin/sh\necho fake-dlv\n');
  const archivePath = path.join(workDir, 'dlv.tar.gz');
  await tar.c({ gzip: true, cwd: src, file: archivePath }, ['dlv']);
  const body = await fs.readFile(archivePath);
  return { body, sha256: createHash('sha256').update(body).digest('hex') };
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

describe('provisionDelve', () => {
  let workDir: string;
  let adaptersDir: string;
  let server: FakeReleaseServer | undefined;
  let originalSha: string | undefined;

  beforeEach(async () => {
    workDir = await fs.mkdtemp(path.join(os.tmpdir(), 'dap-cli-prov-delve-'));
    adaptersDir = path.join(workDir, 'adapters');
    await fs.mkdir(adaptersDir, { recursive: true });
    originalSha = DELVE_CHECKSUMS[DELVE_VERSION]?.[PLATFORM_KEY];
  });

  afterEach(async () => {
    if (originalSha !== undefined && DELVE_CHECKSUMS[DELVE_VERSION] !== undefined) {
      DELVE_CHECKSUMS[DELVE_VERSION][PLATFORM_KEY] = originalSha;
    }
    if (server !== undefined) {
      await server.close();
      server = undefined;
    }
    await fs.rm(workDir, { recursive: true, force: true });
  });

  test('cold cache installs, verifies SHA-256, chmods executable, writes consent marker, fromCache=false', async () => {
    const tarball = await buildDelveTarball(workDir);
    DELVE_CHECKSUMS[DELVE_VERSION][PLATFORM_KEY] = tarball.sha256;

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

    const result = await provisionDelve({
      env: {
        DAP_CLI_PROVISION_RELEASE_BASE_URL: server.url,
        DAP_CLI_PROVISION_DELVE_PLATFORM_OVERRIDE: PLATFORM_KEY,
      },
      assumeYes: true,
      adaptersDir,
    });

    expect(result.adapterId).toBe('delve');
    expect(result.version).toBe(DELVE_VERSION);
    expect(result.fromCache).toBe(false);
    expect(result.installRoot).toBe(path.join(adaptersDir, 'delve'));
    expect(result.entrypoint).toBe(path.join(adaptersDir, 'delve', 'dlv'));

    expect(await fs.readFile(result.entrypoint, 'utf8')).toContain('fake-dlv');
    const stat = await fs.stat(result.entrypoint);
    // Verify owner-execute bit (and the broader executable bits for safety).
    expect(stat.mode & 0o111).toBe(0o111);
    await fs.access(path.join(adaptersDir, 'delve', `.consent-${DELVE_VERSION}`));
    expect(server.hitCount()).toBe(1);
  });

  test('warm cache returns fromCache=true without any network call', async () => {
    const tarball = await buildDelveTarball(workDir);
    DELVE_CHECKSUMS[DELVE_VERSION][PLATFORM_KEY] = tarball.sha256;

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

    await provisionDelve({
      env: {
        DAP_CLI_PROVISION_RELEASE_BASE_URL: server.url,
        DAP_CLI_PROVISION_DELVE_PLATFORM_OVERRIDE: PLATFORM_KEY,
      },
      assumeYes: true,
      adaptersDir,
    });
    const baselineHits = server.hitCount();

    const result = await provisionDelve({
      env: {
        DAP_CLI_PROVISION_RELEASE_BASE_URL: server.url,
        DAP_CLI_PROVISION_DELVE_PLATFORM_OVERRIDE: PLATFORM_KEY,
      },
      assumeYes: true,
      adaptersDir,
    });

    expect(result.fromCache).toBe(true);
    expect(server.hitCount()).toBe(baselineHits);
  });

  test('checksum mismatch throws provision_checksum_mismatch with no canonical install', async () => {
    const tarball = await buildDelveTarball(workDir);
    DELVE_CHECKSUMS[DELVE_VERSION][PLATFORM_KEY] = 'f'.repeat(64);

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

    const error = await provisionDelve({
      env: {
        DAP_CLI_PROVISION_RELEASE_BASE_URL: server.url,
        DAP_CLI_PROVISION_DELVE_PLATFORM_OVERRIDE: PLATFORM_KEY,
      },
      assumeYes: true,
      adaptersDir,
    }).catch((err: unknown) => err);

    expect(error).toBeInstanceOf(CliError);
    expect((error as CliError).code).toBe('provision_checksum_mismatch');
    await expect(fs.access(path.join(adaptersDir, 'delve'))).rejects.toThrow();
  });

  test('consent decline throws provision_consent_declined with no download', async () => {
    server = await startFakeReleaseServer([
      { match: () => true, respond: (_req, res) => { res.statusCode = 500; res.end(); } },
    ]);

    const error = await provisionDelve({
      env: {
        DAP_CLI_PROVISION_RELEASE_BASE_URL: server.url,
        DAP_CLI_PROVISION_DELVE_PLATFORM_OVERRIDE: PLATFORM_KEY,
      },
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

    const error = await provisionDelve({
      env: {
        DAP_CLI_PROVISION_RELEASE_BASE_URL: server.url,
        DAP_CLI_PROVISION_DELVE_PLATFORM_OVERRIDE: PLATFORM_KEY,
      },
      assumeYes: false,
      adaptersDir,
      stdin: createNonTtyStdin(),
    }).catch((err: unknown) => err);

    expect(error).toBeInstanceOf(CliError);
    expect((error as CliError).code).toBe('provision_consent_required');
    expect(server.hitCount()).toBe(0);
  });
});
