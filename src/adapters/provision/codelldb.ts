import path from 'node:path';
import { promises as fs } from 'node:fs';
import { createHash, randomBytes } from 'node:crypto';
import { usageError } from '../../cli/errors.js';
import { confirm } from '../../cli/confirm.js';
import { atomicInstall } from './atomicInstall.js';
import { withAdapterLock } from './lock.js';
import { hasConsentMarker, writeConsentMarker } from './consent.js';
import { downloadToFile } from './http.js';
import { extractZip } from './extractZip.js';
import {
  CODELLDB_CHECKSUMS,
  CODELLDB_VERSION,
  type CodeLldbPlatformKey,
} from './checksums.js';
import type { ProvisionContext, ProvisionResult } from './types.js';

const ADAPTER_ID = 'codelldb';
const DEFAULT_RELEASE_BASE_URL = 'https://github.com';
const ENTRYPOINT = 'extension/adapter/codelldb';
const REQUIRED_RUNTIME_PATHS = [
  ENTRYPOINT,
  'extension/adapter/scripts/codelldb/__init__.py',
  'extension/lldb/bin/lldb',
  'extension/lldb/bin/lldb-argdumper',
  'extension/lldb/bin/lldb-server',
  'extension/lldb/lib/liblldb.dylib',
  'extension/lldb/lib/libpython312.dylib',
  'extension/lldb/lib/python3.12/os.py',
  'extension/lang_support/rust.py',
  'extension/package.json',
] as const;
const EXECUTABLE_PATHS = [
  ENTRYPOINT,
  'extension/lldb/bin/lldb',
  'extension/lldb/bin/lldb-argdumper',
  'extension/lldb/bin/lldb-server',
] as const;

interface CodeLldbAsset {
  readonly platformKey: CodeLldbPlatformKey;
  readonly archiveName: string;
}

function resolveCodeLldbAsset(env: NodeJS.ProcessEnv): CodeLldbAsset {
  const override = env.DAP_CLI_PROVISION_CODELLDB_PLATFORM_OVERRIDE;
  const detected = override !== undefined && override.length > 0
    ? override
    : `${process.platform}_${process.arch}`;
  if (detected !== 'darwin_arm64') {
    throw usageError(`CodeLLDB provisioning does not support platform '${detected}'.`, {
      code: 'provision_arch_unsupported',
      diagnostics: [
        `Detected platform: ${detected}`,
        'Supported platforms: darwin_arm64.',
        'Only the official CodeLLDB darwin-arm64 artifact has passed verification.',
      ],
      data: {
        adapterId: ADAPTER_ID,
        detected,
        supported: ['darwin_arm64'],
      },
    });
  }
  return {
    platformKey: 'darwin_arm64',
    archiveName: 'codelldb-darwin-arm64.vsix',
  };
}

export async function isCodeLldbRuntimeReady(installRoot: string): Promise<boolean> {
  for (const relativePath of REQUIRED_RUNTIME_PATHS) {
    try {
      await fs.access(path.join(installRoot, relativePath));
    } catch {
      return false;
    }
  }
  return true;
}

async function computeSha256(filePath: string): Promise<string> {
  const buffer = await fs.readFile(filePath);
  return createHash('sha256').update(buffer).digest('hex');
}

export async function provisionCodeLldb(ctx: ProvisionContext): Promise<ProvisionResult> {
  const asset = resolveCodeLldbAsset(ctx.env);
  const installRoot = path.join(ctx.adaptersDir, ADAPTER_ID);
  const entrypoint = path.join(installRoot, ENTRYPOINT);
  const expectedSha = CODELLDB_CHECKSUMS[CODELLDB_VERSION]?.[asset.platformKey];
  if (expectedSha === undefined) {
    throw usageError(`No pinned SHA-256 for CodeLLDB ${CODELLDB_VERSION} on ${asset.platformKey}.`, {
      code: 'provision_checksum_mismatch',
      diagnostics: [
        `Adapter: ${ADAPTER_ID} ${CODELLDB_VERSION} (${asset.platformKey})`,
        'src/adapters/provision/checksums.ts must list a verified checksum for every supported platform.',
        'Re-run setup or report at https://github.com/roblourens/dap-cli/issues if persistent.',
      ],
      data: { adapterId: ADAPTER_ID, version: CODELLDB_VERSION, platform: asset.platformKey },
    });
  }

  if ((await hasConsentMarker(ctx.adaptersDir, ADAPTER_ID, CODELLDB_VERSION)) && (await isCodeLldbRuntimeReady(installRoot))) {
    return { adapterId: ADAPTER_ID, version: CODELLDB_VERSION, installRoot, entrypoint, fromCache: true };
  }

  await confirm({
    assumeYes: ctx.assumeYes,
    question: `Install CodeLLDB ${CODELLDB_VERSION} into ${installRoot}/ (~44MB download)?`,
    details: [
      `Downloads the official release asset ${asset.archiveName} from github.com/vadimcn/codelldb.`,
      'The full VSIX runtime tree is cached locally after SHA-256 verification.',
    ],
    ...(ctx.stdin === undefined ? {} : { stdin: ctx.stdin }),
    ...(ctx.stderr === undefined ? {} : { stderr: ctx.stderr }),
  });

  await withAdapterLock(ctx.adaptersDir, ADAPTER_ID, async () => {
    if ((await hasConsentMarker(ctx.adaptersDir, ADAPTER_ID, CODELLDB_VERSION)) && (await isCodeLldbRuntimeReady(installRoot))) {
      return;
    }
    const releaseBase = ctx.env.DAP_CLI_PROVISION_RELEASE_BASE_URL ?? DEFAULT_RELEASE_BASE_URL;
    const url = `${releaseBase}/vadimcn/codelldb/releases/download/${CODELLDB_VERSION}/${asset.archiveName}`;
    const archivePath = path.join(ctx.adaptersDir, `.${ADAPTER_ID}.archive.${process.pid}.${randomBytes(4).toString('hex')}.vsix`);
    try {
      await fs.mkdir(ctx.adaptersDir, { recursive: true });
      await downloadToFile({ url, destPath: archivePath, env: ctx.env });
      const actualSha = await computeSha256(archivePath);
      if (actualSha !== expectedSha) {
        throw usageError('CodeLLDB archive failed SHA-256 verification.', {
          code: 'provision_checksum_mismatch',
          diagnostics: [
            `URL: ${url}`,
            `Expected: ${expectedSha}`,
            `Actual:   ${actualSha}`,
            'Re-run setup or report at https://github.com/roblourens/dap-cli/issues if persistent.',
          ],
          data: { adapterId: ADAPTER_ID, version: CODELLDB_VERSION, url, expectedSha, actualSha },
        });
      }
      await atomicInstall({
        adaptersDir: ctx.adaptersDir,
        adapterId: ADAPTER_ID,
        expectedEntrypoints: REQUIRED_RUNTIME_PATHS,
        populate: async stagingDir => {
          await extractZip(archivePath, stagingDir);
          for (const executablePath of EXECUTABLE_PATHS) {
            await fs.chmod(path.join(stagingDir, executablePath), 0o755);
          }
        },
      });
      await writeConsentMarker(ctx.adaptersDir, ADAPTER_ID, CODELLDB_VERSION);
    } finally {
      await fs.rm(archivePath, { force: true }).catch(() => undefined);
    }
  });

  return { adapterId: ADAPTER_ID, version: CODELLDB_VERSION, installRoot, entrypoint, fromCache: false };
}