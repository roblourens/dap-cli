// Tests D-09 (HTTPS_PROXY / NO_PROXY support) at the downloadToFile layer.
//
// All scenarios use either a closed local port for "refused proxy" or the
// FakeReleaseServer for "successful download" — no real internet traffic.
// We hand a closed port to undici as the proxy; the dial fails with
// ECONNREFUSED before any TLS handshake, so the URL hostname never has to
// resolve.

import { promises as fs } from 'node:fs';
import * as http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';

import { downloadToFile } from '../../../src/adapters/provision/http.js';
import { CliError } from '../../../src/cli/errors.js';
import {
  serveBuffer,
  startFakeReleaseServer,
  type FakeReleaseServer,
} from '../../helpers/fakeReleaseServer.js';

async function reservePort(): Promise<number> {
  const server = http.createServer();
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      server.off('error', reject);
      resolve();
    });
  });
  const address = server.address();
  if (address === null || typeof address === 'string') {
    throw new Error('Could not bind probe socket');
  }
  const port = address.port;
  await new Promise<void>(resolve => server.close(() => { resolve(); }));
  return port;
}

describe('downloadToFile proxy / NO_PROXY handling', () => {
  let workDir: string;
  let dest: string;
  let server: FakeReleaseServer | undefined;
  let refusedProxy: string;

  beforeEach(async () => {
    workDir = await fs.mkdtemp(path.join(os.tmpdir(), 'dap-cli-proxy-'));
    dest = path.join(workDir, 'download.bin');
    const refusedPort = await reservePort();
    refusedProxy = `http://127.0.0.1:${refusedPort}`;
  });

  afterEach(async () => {
    if (server !== undefined) {
      await server.close();
      server = undefined;
    }
    await fs.rm(workDir, { recursive: true, force: true });
  });

  test('HTTPS_PROXY refused on an https URL surfaces provision_proxy_error', async () => {
    const error = await downloadToFile({
      url: 'https://example.invalid/asset.bin',
      destPath: dest,
      env: { HTTPS_PROXY: refusedProxy },
    }).catch((err: unknown) => err);

    expect(error).toBeInstanceOf(CliError);
    const cliError = error as CliError;
    expect(cliError.code).toBe('provision_proxy_error');
    // sanitizeUrl normalises the trailing slash; compare via URL parse.
    const data = cliError.data as { proxyUrl?: string };
    expect(data.proxyUrl !== undefined && new URL(data.proxyUrl).origin).toBe(refusedProxy);
    // The error envelope should not list any real credentials and should
    // mention NO_PROXY as a bypass.
    expect(cliError.diagnostics.some(d => d.includes('NO_PROXY'))).toBe(true);
  });

  test('NO_PROXY=127.0.0.1 bypasses HTTP_PROXY for a local FakeReleaseServer', async () => {
    const body = Buffer.from('proxy-bypassed payload');
    server = await startFakeReleaseServer([
      {
        match: req => req.url === '/asset.bin',
        respond: serveBuffer(body),
      },
    ]);

    await downloadToFile({
      url: `${server.url}/asset.bin`,
      destPath: dest,
      env: {
        // HTTP_PROXY *would* apply to this http:// URL, but NO_PROXY=127.0.0.1
        // tells the proxy resolver to bypass it.
        HTTP_PROXY: refusedProxy,
        NO_PROXY: '127.0.0.1',
      },
    });

    const written = await fs.readFile(dest);
    expect(written.equals(body)).toBe(true);
    expect(server.hitCount()).toBe(1);
  });

  test('NO_PROXY suffix matching bypasses the proxy for subdomains', async () => {
    // Proxy is refused; if NO_PROXY suffix-match works the request bypasses
    // the proxy entirely and we hit a DNS-resolution failure on the target
    // hostname (provision_network_error, not provision_proxy_error). That
    // is exactly the asymmetry that proves the bypass fired.
    const error = await downloadToFile({
      url: 'https://api.fakedomain-does-not-resolve.invalid/asset.bin',
      destPath: dest,
      env: {
        HTTPS_PROXY: refusedProxy,
        NO_PROXY: '.fakedomain-does-not-resolve.invalid',
      },
    }).catch((err: unknown) => err);

    expect(error).toBeInstanceOf(CliError);
    const cliError = error as CliError;
    expect(cliError.code).toBe('provision_network_error');
    expect(cliError.data).not.toHaveProperty('proxyUrl');
  });

  test('HTTPS_PROXY does not apply to http:// URLs', async () => {
    const body = Buffer.from('http-not-proxied payload');
    server = await startFakeReleaseServer([
      {
        match: req => req.url === '/asset.bin',
        respond: serveBuffer(body),
      },
    ]);

    // HTTPS_PROXY only governs https:// requests. An http:// request must
    // ignore HTTPS_PROXY (and there is no HTTP_PROXY set) — the FakeReleaseServer
    // should be reached directly.
    await downloadToFile({
      url: `${server.url}/asset.bin`,
      destPath: dest,
      env: { HTTPS_PROXY: refusedProxy },
    });

    const written = await fs.readFile(dest);
    expect(written.equals(body)).toBe(true);
    expect(server.hitCount()).toBe(1);
  });
});
