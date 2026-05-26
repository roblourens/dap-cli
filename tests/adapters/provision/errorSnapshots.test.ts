import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { Readable } from 'node:stream';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import * as tar from 'tar';

import { confirm } from '../../../src/cli/confirm.js';
import { downloadToFile } from '../../../src/adapters/provision/http.js';
import { atomicInstall } from '../../../src/adapters/provision/atomicInstall.js';
import { withAdapterLock } from '../../../src/adapters/provision/lock.js';
import { provisionDelve } from '../../../src/adapters/provision/delve.js';
import { provisionDebugpy } from '../../../src/adapters/provision/debugpy.js';
import {
  DELVE_CHECKSUMS,
  DELVE_VERSION,
  type DelvePlatformKey,
} from '../../../src/adapters/provision/checksums.js';
import { CliError } from '../../../src/cli/errors.js';
import {
  startFakeReleaseServer,
  serveStatus,
  serveBuffer,
  type FakeReleaseServer,
} from '../../helpers/fakeReleaseServer.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Pick the (code, diagnostics, data) triplet from a CliError for snapshotting. */
function pickEnvelope(
  err: unknown,
  scrub: Array<[RegExp, string]> = [],
): {
  code: string | undefined;
  diagnostics: readonly string[];
  data: Record<string, unknown> | undefined;
} {
  if (!(err instanceof CliError)) {
    throw new Error(`Expected CliError, got: ${String(err)}`);
  }
  const apply = (s: string): string => scrub.reduce((acc, [re, rep]) => acc.replace(re, rep), s);
  const data = err.data === undefined
    ? undefined
    : Object.fromEntries(
        Object.entries(err.data).map(([k, v]) => [k, typeof v === 'string' ? apply(v) : v]),
      );
  return {
    code: err.code,
    diagnostics: err.diagnostics.map(apply),
    data,
  };
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

const PLATFORM_KEY: DelvePlatformKey = 'darwin_arm64';
const BARE_VERSION = DELVE_VERSION.startsWith('v') ? DELVE_VERSION.slice(1) : DELVE_VERSION;
const RELEASE_PATH = `/go-delve/delve/releases/download/${DELVE_VERSION}/dlv_${BARE_VERSION}_${PLATFORM_KEY}.tar.gz`;

async function buildDelveTarball(workDir: string): Promise<{ body: Buffer; sha256: string }> {
  const src = path.join(workDir, 'tar-src');
  await fs.mkdir(src, { recursive: true });
  await fs.writeFile(path.join(src, 'dlv'), '#!/bin/sh\necho fake-dlv\n');
  const archivePath = path.join(workDir, 'dlv.tar.gz');
  await tar.c({ gzip: true, cwd: src, file: archivePath }, ['dlv']);
  const body = await fs.readFile(archivePath);
  return { body, sha256: createHash('sha256').update(body).digest('hex') };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('provision error envelope snapshots', () => {
  let workDir: string;
  let adaptersDir: string;
  let server: FakeReleaseServer | undefined;
  let originalDelveSha: string | undefined;

  beforeEach(async () => {
    workDir = await fs.mkdtemp(path.join(os.tmpdir(), 'dap-cli-prov-snap-'));
    adaptersDir = path.join(workDir, 'adapters');
    await fs.mkdir(adaptersDir, { recursive: true });
    originalDelveSha = DELVE_CHECKSUMS[DELVE_VERSION]?.[PLATFORM_KEY];
  });

  afterEach(async () => {
    if (originalDelveSha !== undefined && DELVE_CHECKSUMS[DELVE_VERSION] !== undefined) {
      DELVE_CHECKSUMS[DELVE_VERSION][PLATFORM_KEY] = originalDelveSha;
    }
    if (server !== undefined) {
      await server.close();
      server = undefined;
    }
    // Restore mode in case a cache_unwritable test left it locked down.
    await fs.chmod(adaptersDir, 0o755).catch(() => undefined);
    await fs.rm(workDir, { recursive: true, force: true });
  });

  test('provision_consent_required', async () => {
    const error = await confirm({
      question: 'Install foo 1.0 into /tmp/foo/?',
      assumeYes: false,
      stdin: createNonTtyStdin(),
    }).catch((err: unknown) => err);

    expect(pickEnvelope(error)).toMatchInlineSnapshot(`
      {
        "code": "provision_consent_required",
        "data": {
          "question": "Install foo 1.0 into /tmp/foo/?",
        },
        "diagnostics": [
          "Install foo 1.0 into /tmp/foo/?",
          "Re-run with \`--yes\` / \`-y\` or set \`DAP_CLI_ASSUME_YES=1\` to pre-consent.",
        ],
      }
    `);
  });

  test('provision_consent_declined', async () => {
    const error = await confirm({
      question: 'Install foo 1.0 into /tmp/foo/?',
      assumeYes: false,
      stdin: createTtyStdin('\n'),
      stderr: createSinkStderr(),
    }).catch((err: unknown) => err);

    expect(pickEnvelope(error)).toMatchInlineSnapshot(`
      {
        "code": "provision_consent_declined",
        "data": {
          "question": "Install foo 1.0 into /tmp/foo/?",
        },
        "diagnostics": [
          "Re-run with \`--yes\` to pre-consent.",
        ],
      }
    `);
  });

  test('provision_network_error (HTTP 500)', async () => {
    server = await startFakeReleaseServer([
      { match: () => true, respond: serveStatus(500) },
    ]);
    const dest = path.join(workDir, 'fail.bin');
    const url = `${server.url}/asset.bin`;
    const error = await downloadToFile({ url, destPath: dest, env: {} }).catch((err: unknown) => err);

    const scrub: Array<[RegExp, string]> = [
      [new RegExp(server.url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), 'http://127.0.0.1:<PORT>'],
    ];
    expect(pickEnvelope(error, scrub)).toMatchInlineSnapshot(`
      {
        "code": "provision_network_error",
        "data": {
          "status": 500,
          "statusText": "Internal Server Error",
          "url": "http://127.0.0.1:<PORT>/asset.bin",
        },
        "diagnostics": [
          "URL: http://127.0.0.1:<PORT>/asset.bin",
          "HTTP 500 Internal Server Error",
        ],
      }
    `);
  });

  test('provision_proxy_error (unreachable proxy with credentials)', async () => {
    const dest = path.join(workDir, 'prox.bin');
    const error = await downloadToFile({
      url: 'https://dap-cli-test-no-such-host.invalid/asset.bin?token=secret',
      destPath: dest,
      env: { HTTPS_PROXY: 'http://user:pass@127.0.0.1:1' },
    }).catch((err: unknown) => err);

    expect(error).toBeInstanceOf(CliError);
    expect((error as CliError).code).toBe('provision_proxy_error');
    const env = pickEnvelope(error);

    // Critical security check: credentials and query strings MUST NOT leak.
    const allText = [
      ...env.diagnostics,
      ...Object.values(env.data ?? {}).filter((v): v is string => typeof v === 'string'),
    ].join('\n');
    expect(allText).not.toContain('user:pass');
    expect(allText).not.toContain('secret');
    expect(allText).not.toContain('token');

    // URL is sanitized to credential-free, query-free form.
    expect(env.data?.url).toBe('https://dap-cli-test-no-such-host.invalid/asset.bin');
    expect(env.data?.proxyUrl).toBe('http://127.0.0.1:1/');
    expect(env.diagnostics).toContain('URL: https://dap-cli-test-no-such-host.invalid/asset.bin');
    expect(env.diagnostics).toContain('Proxy: http://127.0.0.1:1/');
    expect(env.diagnostics).toContain('Verify `HTTPS_PROXY` is correct or set `NO_PROXY=github.com` to bypass.');
  });

  test('provision_rate_limited', async () => {
    server = await startFakeReleaseServer([
      {
        match: () => true,
        respond: serveStatus(403, {
          'X-RateLimit-Remaining': '0',
          'X-RateLimit-Reset': '1700000000',
        }),
      },
    ]);
    const url = `${server.url}/asset.bin`;
    const error = await downloadToFile({
      url,
      destPath: path.join(workDir, 'rl.bin'),
      env: {},
    }).catch((err: unknown) => err);

    const scrub: Array<[RegExp, string]> = [
      [new RegExp(server.url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), 'http://127.0.0.1:<PORT>'],
    ];
    expect(pickEnvelope(error, scrub)).toMatchInlineSnapshot(`
      {
        "code": "provision_rate_limited",
        "data": {
          "retryAfter": "1700000000",
          "status": 403,
          "url": "http://127.0.0.1:<PORT>/asset.bin",
        },
        "diagnostics": [
          "URL: http://127.0.0.1:<PORT>/asset.bin",
          "Retry after epoch 1700000000.",
          "Set \`GITHUB_TOKEN\` to raise the GitHub API rate limit.",
        ],
      }
    `);
  });

  test('provision_checksum_mismatch', async () => {
    const tarball = await buildDelveTarball(workDir);
    DELVE_CHECKSUMS[DELVE_VERSION][PLATFORM_KEY] = 'f'.repeat(64);
    server = await startFakeReleaseServer([
      { match: req => req.url === RELEASE_PATH, respond: serveBuffer(tarball.body) },
    ]);
    const error = await provisionDelve({
      env: {
        DAP_CLI_PROVISION_RELEASE_BASE_URL: server.url,
        DAP_CLI_PROVISION_DELVE_PLATFORM_OVERRIDE: PLATFORM_KEY,
      },
      assumeYes: true,
      adaptersDir,
    }).catch((err: unknown) => err);

    const env = pickEnvelope(error);
    expect(env.code).toBe('provision_checksum_mismatch');
    expect(env.diagnostics.some(d => d.startsWith('Expected:'))).toBe(true);
    expect(env.diagnostics.some(d => d.startsWith('Actual:'))).toBe(true);
    expect(env.diagnostics).toContain('Re-run setup or report at https://github.com/roblourens/dap-cli/issues if persistent.');
    expect(env.data?.adapterId).toBe('delve');
    expect(env.data?.version).toBe(DELVE_VERSION);
    expect(env.data?.expectedSha).toBe('f'.repeat(64));
    expect(typeof env.data?.actualSha).toBe('string');
    expect(typeof env.data?.url).toBe('string');
  });

  test('provision_arch_unsupported', async () => {
    const error = await provisionDelve({
      env: { DAP_CLI_PROVISION_DELVE_PLATFORM_OVERRIDE: 'solaris_sparc' },
      assumeYes: true,
      adaptersDir,
    }).catch((err: unknown) => err);

    expect(pickEnvelope(error)).toMatchInlineSnapshot(`
      {
        "code": "provision_arch_unsupported",
        "data": {
          "adapterId": "delve",
          "detected": "solaris_sparc",
          "supported": [
            "darwin_arm64",
            "darwin_x64",
            "linux_x64",
            "linux_arm64",
            "win32_x64",
          ],
        },
        "diagnostics": [
          "Detected platform: solaris_sparc",
          "Supported platforms: darwin_arm64, darwin_x64, linux_x64, linux_arm64, win32_x64.",
          "Install \`dlv\` manually on PATH or provision a compatible binary.",
        ],
      }
    `);
  });

  test('provision_python3_missing', async () => {
    const error = await provisionDebugpy({
      env: { DAP_CLI_PROVISION_PYTHON3: '/nonexistent/python3-does-not-exist' },
      assumeYes: true,
      adaptersDir,
    }).catch((err: unknown) => err);

    const env = pickEnvelope(error);
    expect(env.code).toBe('provision_python3_missing');
    expect(env.data?.python3).toBe('/nonexistent/python3-does-not-exist');
    expect(env.diagnostics[0]).toBe('Install Python 3.8+ and ensure `python3` is on PATH.');
    expect(env.diagnostics).toContain('macOS: `brew install python`');
    expect(env.diagnostics).toContain('Ubuntu/Debian: `apt install python3 python3-venv`');
  });

  test.skipIf(process.platform === 'win32')(
    'provision_python3_venv_unavailable',
    async () => {
      // A fake python3 that succeeds on --version but fails on `-m venv`.
      const fakePy = path.join(workDir, 'python3');
      await fs.writeFile(
        fakePy,
        '#!/bin/sh\nif [ "$1" = "--version" ]; then echo "Python 3.11.0"; exit 0; fi\n'
          + 'if [ "$1" = "-m" ] && [ "$2" = "venv" ]; then\n'
          + '  echo "Error: Command \'pyvenv\' is not available" >&2; exit 1\n'
          + 'fi\nexit 1\n',
        { mode: 0o755 },
      );

      const error = await provisionDebugpy({
        env: { DAP_CLI_PROVISION_PYTHON3: fakePy },
        assumeYes: true,
        adaptersDir,
      }).catch((err: unknown) => err);

      const env = pickEnvelope(error, [[/Python 3\.\d+\.\d+/, 'Python 3.X.Y']]);
      expect(env.code).toBe('provision_python3_venv_unavailable');
      expect(env.data?.python3).toBe(fakePy);
      expect(env.diagnostics).toContain('The `python3 -m venv` command failed. On Debian/Ubuntu install `python3-venv`:');
      expect(env.diagnostics).toContain('  sudo apt install python3-venv');
      expect(env.diagnostics.some(d => d.startsWith('stderr tail:'))).toBe(true);
    },
  );

  test.skipIf(process.platform === 'win32')(
    'provision_pip_install_failed',
    async () => {
      // A fake python3 that succeeds on --version and creates a fake venv with a pip that fails.
      const fakePy = path.join(workDir, 'python3');
      const stagingPathFile = path.join(workDir, 'staging-path.txt');
      await fs.writeFile(
        fakePy,
        '#!/bin/sh\n'
          + 'if [ "$1" = "--version" ]; then echo "Python 3.11.0"; exit 0; fi\n'
          + 'if [ "$1" = "-m" ] && [ "$2" = "venv" ]; then\n'
          + '  VENV_DIR="$3"\n'
          + `  echo "$VENV_DIR" > "${stagingPathFile}"\n`
          + '  mkdir -p "$VENV_DIR/bin"\n'
          + '  cat > "$VENV_DIR/bin/pip" <<\'PIP\'\n'
          + '#!/bin/sh\n'
          + 'echo "ERROR: Could not find a version that satisfies the requirement debugpy==X.Y" >&2\n'
          + 'exit 1\n'
          + 'PIP\n'
          + '  chmod +x "$VENV_DIR/bin/pip"\n'
          + '  exit 0\n'
          + 'fi\n'
          + 'exit 1\n',
        { mode: 0o755 },
      );

      const error = await provisionDebugpy({
        env: { DAP_CLI_PROVISION_PYTHON3: fakePy },
        assumeYes: true,
        adaptersDir,
      }).catch((err: unknown) => err);

      const env = pickEnvelope(error);
      expect(env.code).toBe('provision_pip_install_failed');
      expect(env.diagnostics).toContain('pip install failed. Common causes: no network access, restricted PyPI mirror, missing build tools.');
      expect(env.diagnostics).toContain('Workaround: set `PIP_INDEX_URL` to your mirror, or pre-install debugpy into the venv and re-run.');
      expect(env.diagnostics.some(d => d.startsWith('Underlying pip command:'))).toBe(true);
      expect(env.diagnostics.some(d => d.startsWith('stderr tail:'))).toBe(true);
      expect(typeof env.data?.pipPath).toBe('string');
      expect(typeof env.data?.version).toBe('string');
    },
  );

  test.skipIf(process.platform === 'win32' || (process.getuid?.() === 0))(
    'provision_cache_unwritable',
    async () => {
      // Lock down the adapters directory so mkdir of a sibling staging path fails.
      const lockedAdapters = path.join(workDir, 'locked');
      await fs.mkdir(lockedAdapters, { recursive: true });
      await fs.chmod(lockedAdapters, 0o500);
      try {
        const error = await atomicInstall({
          adaptersDir: path.join(lockedAdapters, 'nested'),
          adapterId: 'js-debug',
          expectedEntrypoints: ['x'],
          populate: async () => undefined,
        }).catch((err: unknown) => err);

        const env = pickEnvelope(error, [[lockedAdapters, '<LOCKED>']]);
        expect(env.code).toBe('provision_cache_unwritable');
        expect(env.diagnostics).toContain('Override with `DAP_CLI_ADAPTERS_DIR=<writable-path>`.');
        expect(env.data?.adapterId).toBe('js-debug');
        expect(env.data?.adaptersDir).toBe('<LOCKED>/nested');
        expect(typeof env.data?.errnoCode).toBe('string');
      } finally {
        await fs.chmod(lockedAdapters, 0o755).catch(() => undefined);
      }
    },
  );

  test('provision_lock_timeout', async () => {
    const veryFast = { retryOverride: { retries: 1, minTimeout: 5, maxTimeout: 10, factor: 1 } };

    let released: (() => void) | undefined;
    const holder = withAdapterLock(
      adaptersDir,
      'busy',
      async () => {
        await new Promise<void>(resolve => {
          released = resolve;
        });
      },
      veryFast,
    );

    await new Promise(resolve => setTimeout(resolve, 30));

    const error = await withAdapterLock(adaptersDir, 'busy', async () => 'never', veryFast)
      .catch((err: unknown) => err);

    const env = pickEnvelope(error, [[adaptersDir, '<ADAPTERS>']]);
    expect(env.code).toBe('provision_lock_timeout');
    expect(env.data?.adapterId).toBe('busy');
    expect(env.data?.sentinel).toBe('<ADAPTERS>/.busy.lock-target');
    expect(env.diagnostics).toContain('Adapter: busy');
    expect(env.diagnostics).toContain('Lock sentinel: <ADAPTERS>/.busy.lock-target');
    expect(env.diagnostics.some(d => d.includes('Another dap-cli process may be installing'))).toBe(true);

    released?.();
    await holder;
  });

  test('provision_extract_failed', async () => {
    const error = await atomicInstall({
      adaptersDir,
      adapterId: 'js-debug',
      expectedEntrypoints: ['missing.js'],
      populate: async stagingDir => {
        await fs.writeFile(path.join(stagingDir, 'present.js'), 'x');
      },
    }).catch((err: unknown) => err);

    const env = pickEnvelope(error, [
      [/\.js-debug\.tmp\.\d+\.[0-9a-f]+/g, '.js-debug.tmp.<PID>.<RAND>'],
      [adaptersDir, '<ADAPTERS>'],
    ]);
    expect(env.code).toBe('provision_extract_failed');
    expect(env.data?.entrypoint).toBe('missing.js');
    expect(env.data?.stagingDir).toBe('<ADAPTERS>/.js-debug.tmp.<PID>.<RAND>');
    expect(env.diagnostics).toContain('Missing entry point: missing.js');
    expect(env.diagnostics).toContain('Staging directory: <ADAPTERS>/.js-debug.tmp.<PID>.<RAND>');
  });
});
