import path from 'node:path';
import { promises as fs } from 'node:fs';
import { createHash } from 'node:crypto';
import { randomBytes } from 'node:crypto';
import { usageError } from '../../cli/errors.js';
import { confirm } from '../../cli/confirm.js';
import { atomicInstall } from './atomicInstall.js';
import { withAdapterLock } from './lock.js';
import { hasConsentMarker, writeConsentMarker } from './consent.js';
import { downloadToFile } from './http.js';
import { extractTarGz } from './extractTarGz.js';
import { extractZip } from './extractZip.js';
import {
  DELVE_CHECKSUMS,
  DELVE_VERSION,
  type DelvePlatformKey,
} from './checksums.js';
import type { ProvisionContext, ProvisionResult } from './types.js';

const DEFAULT_RELEASE_BASE_URL = 'https://github.com';

interface DelveAsset {
  readonly platformKey: DelvePlatformKey;
  readonly archiveName: string;
  readonly archiveKind: 'tar.gz' | 'zip';
  readonly executableName: string;
}

function bareVersion(): string {
  // DELVE_VERSION is 'v1.26.3'; release archive names use the bare '1.26.3'.
  return DELVE_VERSION.startsWith('v') ? DELVE_VERSION.slice(1) : DELVE_VERSION;
}

function resolveDelveAsset(env: NodeJS.ProcessEnv): DelveAsset {
  const override = env.DAP_CLI_PROVISION_DELVE_PLATFORM_OVERRIDE;
  const key = override !== undefined && override.length > 0
    ? override
    : `${process.platform}_${process.arch}`;

  const matrix: Partial<Record<string, DelvePlatformKey>> = {
    'darwin_arm64': 'darwin_arm64',
    'darwin_x64': 'darwin_amd64',
    'linux_x64': 'linux_amd64',
    'linux_arm64': 'linux_arm64',
    'win32_x64': 'windows_amd64',
  };
  const platformKey = matrix[key];
  if (platformKey === undefined) {
    throw usageError(`Delve provisioning does not support platform '${key}'.`, {
      code: 'provision_arch_unsupported',
      diagnostics: [
        `Detected platform: ${key}`,
        'Supported platforms: darwin_arm64, darwin_x64, linux_x64, linux_arm64, win32_x64.',
        'Install `dlv` manually on PATH or provision a compatible binary.',
      ],
      data: {
        adapterId: 'delve',
        detected: key,
        supported: ['darwin_arm64', 'darwin_x64', 'linux_x64', 'linux_arm64', 'win32_x64'],
      },
    });
  }

  const archiveKind: 'tar.gz' | 'zip' = platformKey === 'windows_amd64' ? 'zip' : 'tar.gz';
  const ext = archiveKind === 'zip' ? 'zip' : 'tar.gz';
  const archiveName = `dlv_${bareVersion()}_${platformKey}.${ext}`;
  const executableName = platformKey === 'windows_amd64' ? 'dlv.exe' : 'dlv';
  return { platformKey, archiveName, archiveKind, executableName };
}

async function exists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

async function computeSha256(filePath: string): Promise<string> {
  const buffer = await fs.readFile(filePath);
  return createHash('sha256').update(buffer).digest('hex');
}

export async function provisionDelve(ctx: ProvisionContext): Promise<ProvisionResult> {
  const { env, assumeYes, adaptersDir, stdin, stderr } = ctx;
  const asset = resolveDelveAsset(env);
  const installRoot = path.join(adaptersDir, 'delve');
  const entrypoint = path.join(installRoot, asset.executableName);

  const expectedSha = DELVE_CHECKSUMS[DELVE_VERSION]?.[asset.platformKey];
  if (expectedSha === undefined) {
    throw usageError(`No pinned SHA-256 for delve ${DELVE_VERSION} on ${asset.platformKey}.`, {
      code: 'provision_checksum_mismatch',
      diagnostics: [
        `Adapter: delve ${DELVE_VERSION} (${asset.platformKey})`,
        'src/adapters/provision/checksums.ts must list a checksum for every supported platform.',
        'Re-run setup or report at https://github.com/roblourens/dap-cli/issues if persistent.',
      ],
      data: {
        adapterId: 'delve',
        version: DELVE_VERSION,
        platform: asset.platformKey,
      },
    });
  }

  if ((await hasConsentMarker(adaptersDir, 'delve', DELVE_VERSION)) && (await exists(entrypoint))) {
    return {
      adapterId: 'delve',
      version: DELVE_VERSION,
      installRoot,
      entrypoint,
      fromCache: true,
    };
  }

  await confirm({
    assumeYes,
    question: `Install delve ${DELVE_VERSION} into ${installRoot}/ (~10MB)?`,
    details: [
      `Downloads the official release asset ${asset.archiveName} from github.com/go-delve/delve.`,
      'The archive SHA-256 is verified against an embedded checksum before installation.',
    ],
    ...(stdin === undefined ? {} : { stdin }),
    ...(stderr === undefined ? {} : { stderr }),
  });

  await withAdapterLock(adaptersDir, 'delve', async () => {
    if ((await hasConsentMarker(adaptersDir, 'delve', DELVE_VERSION)) && (await exists(entrypoint))) {
      return;
    }

    const releaseBase = env.DAP_CLI_PROVISION_RELEASE_BASE_URL ?? DEFAULT_RELEASE_BASE_URL;
    const url = `${releaseBase}/go-delve/delve/releases/download/${DELVE_VERSION}/${asset.archiveName}`;
    const archivePath = path.join(
      adaptersDir,
      `.delve.archive.${process.pid}.${randomBytes(4).toString('hex')}.${asset.archiveKind === 'zip' ? 'zip' : 'tar.gz'}`,
    );

    try {
      await fs.mkdir(adaptersDir, { recursive: true });
      await downloadToFile({ url, destPath: archivePath, env });

      const actualSha = await computeSha256(archivePath);
      if (actualSha !== expectedSha) {
        throw usageError('Delve archive failed SHA-256 verification.', {
          code: 'provision_checksum_mismatch',
          diagnostics: [
            `URL: ${url}`,
            `Expected: ${expectedSha}`,
            `Actual:   ${actualSha}`,
            'Re-run setup or report at https://github.com/roblourens/dap-cli/issues if persistent.',
          ],
          data: {
            adapterId: 'delve',
            version: DELVE_VERSION,
            url,
            expectedSha,
            actualSha,
          },
        });
      }

      await atomicInstall({
        adaptersDir,
        adapterId: 'delve',
        expectedEntrypoints: [asset.executableName],
        populate: async (stagingDir) => {
          if (asset.archiveKind === 'zip') {
            await extractZip(archivePath, stagingDir);
          } else {
            await extractTarGz(archivePath, stagingDir);
          }
          if (process.platform !== 'win32') {
            await fs.chmod(path.join(stagingDir, asset.executableName), 0o755);
          }
        },
      });

      await writeConsentMarker(adaptersDir, 'delve', DELVE_VERSION);
    } finally {
      await fs.rm(archivePath, { force: true }).catch(() => undefined);
    }
  });

  return {
    adapterId: 'delve',
    version: DELVE_VERSION,
    installRoot,
    entrypoint,
    fromCache: false,
  };
}
