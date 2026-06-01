import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';

import { provisionCodeLldb } from '../../../src/adapters/provision/codelldb.js';
import {
  CODELLDB_CHECKSUMS,
  CODELLDB_VERSION,
  type CodeLldbPlatformKey,
} from '../../../src/adapters/provision/checksums.js';
import { CliError } from '../../../src/cli/errors.js';
import { buildFakeCodeLldbVsix, FAKE_CODELLDB_RUNTIME_PATHS } from '../../helpers/buildFakeAdapterTarball.js';
import { serveBuffer, startFakeReleaseServer, type FakeReleaseServer } from '../../helpers/fakeReleaseServer.js';

const PLATFORM_KEY: CodeLldbPlatformKey = 'darwin_arm64';
const RELEASE_PATH = `/vadimcn/codelldb/releases/download/${CODELLDB_VERSION}/codelldb-darwin-arm64.vsix`;

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
  return { write: (_chunk: unknown): boolean => true } as unknown as NodeJS.WriteStream;
}

describe('provisionCodeLldb', () => {
  let workDir: string;
  let adaptersDir: string;
  let server: FakeReleaseServer | undefined;
  let originalSha: string | undefined;

  beforeEach(async () => {
    workDir = await fs.mkdtemp(path.join(os.tmpdir(), 'dap-cli-prov-codelldb-'));
    adaptersDir = path.join(workDir, 'adapters');
    await fs.mkdir(adaptersDir, { recursive: true });
    originalSha = CODELLDB_CHECKSUMS[CODELLDB_VERSION]?.[PLATFORM_KEY];
  });

  afterEach(async () => {
    if (originalSha !== undefined && CODELLDB_CHECKSUMS[CODELLDB_VERSION] !== undefined) {
      CODELLDB_CHECKSUMS[CODELLDB_VERSION][PLATFORM_KEY] = originalSha;
    }
    await server?.close();
    server = undefined;
    await fs.rm(workDir, { recursive: true, force: true });
  });

  function setCodeLldbSha(sha: string): void {
    const bucket = CODELLDB_CHECKSUMS[CODELLDB_VERSION];
    if (bucket === undefined) {
      throw new Error(`CODELLDB_CHECKSUMS missing bucket for ${CODELLDB_VERSION}`);
    }
    bucket[PLATFORM_KEY] = sha;
  }

  async function serveVsix(omit?: string): Promise<Awaited<ReturnType<typeof buildFakeCodeLldbVsix>>> {
    const archive = await buildFakeCodeLldbVsix(CODELLDB_VERSION, workDir, omit === undefined ? {} : { omit });
    const body = await fs.readFile(archive.path);
    setCodeLldbSha(archive.sha256);
    server = await startFakeReleaseServer([{ match: request => request.url === RELEASE_PATH, respond: serveBuffer(body) }]);
    return archive;
  }

  function context(platform: string = PLATFORM_KEY) {
    return {
      env: {
        DAP_CLI_PROVISION_RELEASE_BASE_URL: server?.url,
        DAP_CLI_PROVISION_CODELLDB_PLATFORM_OVERRIDE: platform,
      },
      assumeYes: true,
      adaptersDir,
    };
  }

  test('cold cache preserves the complete approved VSIX runtime tree and consent marker', async () => {
    await serveVsix();
    const result = await provisionCodeLldb(context());

    expect(result.adapterId).toBe('codelldb');
    expect(result.version).toBe(CODELLDB_VERSION);
    expect(result.fromCache).toBe(false);
    expect(result.entrypoint).toBe(path.join(adaptersDir, 'codelldb', 'extension/adapter/codelldb'));
    for (const runtimePath of FAKE_CODELLDB_RUNTIME_PATHS) {
      await fs.access(path.join(result.installRoot, runtimePath));
    }
    await fs.access(path.join(result.installRoot, `.consent-${CODELLDB_VERSION}`));
    expect(server?.hitCount()).toBe(1);
  });

  test('warm complete cache is used without a second network call', async () => {
    await serveVsix();
    await provisionCodeLldb(context());
    const hitsAfterInstall = server?.hitCount();

    const result = await provisionCodeLldb(context());

    expect(result.fromCache).toBe(true);
    expect(server?.hitCount()).toBe(hitsAfterInstall);
  });

  test('digest mismatch leaves no canonical CodeLLDB installation', async () => {
    await serveVsix();
    setCodeLldbSha('f'.repeat(64));

    const error = await provisionCodeLldb(context()).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(CliError);
    expect((error as CliError).code).toBe('provision_checksum_mismatch');
    await expect(fs.access(path.join(adaptersDir, 'codelldb'))).rejects.toThrow();
  });

  test('VSIX missing a required bundled runtime entry fails without a partial canonical install', async () => {
    await serveVsix('extension/lldb/lib/liblldb.dylib');

    const error = await provisionCodeLldb(context()).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(CliError);
    expect((error as CliError).code).toBe('provision_extract_failed');
    await expect(fs.access(path.join(adaptersDir, 'codelldb'))).rejects.toThrow();
  });

  test('unsupported platform is rejected before attempting a download', async () => {
    await serveVsix();
    const error = await provisionCodeLldb(context('linux_x64')).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(CliError);
    expect((error as CliError).code).toBe('provision_arch_unsupported');
    expect(server?.hitCount()).toBe(0);
  });

  test('declined consent makes no download', async () => {
    await serveVsix();
    const error = await provisionCodeLldb({ ...context(), assumeYes: false, stdin: createTtyStdin('\n'), stderr: createSinkStderr() }).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(CliError);
    expect((error as CliError).code).toBe('provision_consent_declined');
    expect(server?.hitCount()).toBe(0);
  });

  test('non-TTY without pre-consent makes no download', async () => {
    await serveVsix();
    const error = await provisionCodeLldb({ ...context(), assumeYes: false, stdin: createNonTtyStdin() }).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(CliError);
    expect((error as CliError).code).toBe('provision_consent_required');
    expect(server?.hitCount()).toBe(0);
  });
});