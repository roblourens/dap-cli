import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { downloadToFile } from '../../../src/adapters/provision/http.js';
import { CliError } from '../../../src/cli/errors.js';
import { startFakeReleaseServer, serveBuffer, serveStatus, type FakeReleaseServer } from '../../helpers/fakeReleaseServer.js';

describe('downloadToFile', () => {
  let workDir: string;
  let servers: FakeReleaseServer[] = [];

  beforeEach(async () => {
    workDir = await fs.mkdtemp(path.join(os.tmpdir(), 'dap-cli-http-'));
    servers = [];
  });

  afterEach(async () => {
    for (const server of servers) {
      await server.close();
    }
    servers = [];
    await fs.rm(workDir, { recursive: true, force: true });
  });

  async function spawnServer(handlers: Parameters<typeof startFakeReleaseServer>[0]): Promise<FakeReleaseServer> {
    const server = await startFakeReleaseServer(handlers);
    servers.push(server);
    return server;
  }

  test('streams a 200 response body to destPath', async () => {
    const body = Buffer.from('hello world payload');
    const server = await spawnServer([
      { match: req => req.url === '/asset.bin', respond: serveBuffer(body) },
    ]);
    const dest = path.join(workDir, 'out.bin');
    await downloadToFile({ url: `${server.url}/asset.bin`, destPath: dest, env: {} });
    const written = await fs.readFile(dest);
    expect(written.equals(body)).toBe(true);
    expect(server.hitCount()).toBe(1);
  });

  test('reports progress when onProgress is provided', async () => {
    const body = Buffer.from('A'.repeat(2048));
    const server = await spawnServer([
      { match: () => true, respond: serveBuffer(body) },
    ]);
    const dest = path.join(workDir, 'progress.bin');
    const progressTotals: Array<number | undefined> = [];
    let lastBytes = 0;
    await downloadToFile({
      url: `${server.url}/asset.bin`,
      destPath: dest,
      env: {},
      onProgress: (bytes, total) => {
        progressTotals.push(total);
        lastBytes = bytes;
      },
    });
    expect(lastBytes).toBe(body.length);
    expect(progressTotals.length).toBeGreaterThan(0);
    expect(progressTotals.at(-1)).toBe(body.length);
  });

  test('500 response throws provision_network_error', async () => {
    const server = await spawnServer([
      { match: () => true, respond: serveStatus(500) },
    ]);
    const dest = path.join(workDir, 'fail.bin');
    const error = await downloadToFile({ url: `${server.url}/asset.bin`, destPath: dest, env: {} }).catch((err: unknown) => err);
    expect(error).toBeInstanceOf(CliError);
    expect((error as CliError).code).toBe('provision_network_error');
    expect((error as CliError).diagnostics.join('\n')).toContain('500');
    expect((error as CliError).diagnostics.join('\n')).toContain(`${server.url}/asset.bin`);
  });

  test('403 with X-RateLimit-Remaining:0 throws provision_rate_limited naming GITHUB_TOKEN', async () => {
    const server = await spawnServer([
      {
        match: () => true,
        respond: serveStatus(403, {
          'X-RateLimit-Remaining': '0',
          'X-RateLimit-Reset': '1700000000',
        }),
      },
    ]);
    const dest = path.join(workDir, 'rl.bin');
    const error = await downloadToFile({ url: `${server.url}/asset.bin`, destPath: dest, env: {} }).catch((err: unknown) => err);
    expect(error).toBeInstanceOf(CliError);
    expect((error as CliError).code).toBe('provision_rate_limited');
    const diagnostics = (error as CliError).diagnostics.join('\n');
    expect(diagnostics).toContain('GITHUB_TOKEN');
    expect(diagnostics).toContain('1700000000');
  });

  test('non-https URLs are rejected (except local hosts)', async () => {
    const dest = path.join(workDir, 'bad.bin');
    const error = await downloadToFile({
      url: 'http://example.com/asset.bin',
      destPath: dest,
      env: {},
    }).catch((err: unknown) => err);
    expect(error).toBeInstanceOf(CliError);
    expect((error as CliError).code).toBe('provision_network_error');
    expect((error as CliError).diagnostics.join('\n')).toContain('https://');
  });

  test('DNS failure throws provision_network_error with cause code', async () => {
    const dest = path.join(workDir, 'dns.bin');
    const error = await downloadToFile({
      url: 'https://dap-cli-test-no-such-host.invalid/asset.bin',
      destPath: dest,
      env: {},
    }).catch((err: unknown) => err);
    expect(error).toBeInstanceOf(CliError);
    expect((error as CliError).code).toBe('provision_network_error');
    const diagnostics = (error as CliError).diagnostics.join('\n');
    expect(diagnostics).toMatch(/ENOTFOUND|EAI_AGAIN|getaddrinfo|UND_ERR/i);
  });

  test('HTTPS_PROXY set + unreachable proxy throws provision_proxy_error naming the proxy', async () => {
    const dest = path.join(workDir, 'prox.bin');
    const error = await downloadToFile({
      url: 'https://dap-cli-test-no-such-host.invalid/asset.bin',
      destPath: dest,
      env: { HTTPS_PROXY: 'http://127.0.0.1:1' },
    }).catch((err: unknown) => err);
    expect(error).toBeInstanceOf(CliError);
    expect((error as CliError).code).toBe('provision_proxy_error');
    expect((error as CliError).diagnostics.join('\n')).toContain('http://127.0.0.1:1');
  });

  test('NO_PROXY match bypasses proxy and lets the request through', async () => {
    const body = Buffer.from('via direct');
    const server = await spawnServer([
      { match: () => true, respond: serveBuffer(body) },
    ]);
    const dest = path.join(workDir, 'np.bin');
    await downloadToFile({
      url: `${server.url}/asset.bin`,
      destPath: dest,
      env: {
        HTTP_PROXY: 'http://127.0.0.1:1',
        NO_PROXY: '127.0.0.1',
      },
    });
    const written = await fs.readFile(dest);
    expect(written.equals(body)).toBe(true);
  });
});
