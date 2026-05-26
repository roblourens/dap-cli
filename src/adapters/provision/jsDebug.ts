import path from 'node:path';
import { createHash, randomBytes } from 'node:crypto';
import { promises as fs, createReadStream } from 'node:fs';
import { confirm } from '../../cli/confirm.js';
import { usageError } from '../../cli/errors.js';
import { atomicInstall } from './atomicInstall.js';
import { downloadToFile } from './http.js';
import { extractTarGz } from './extractTarGz.js';
import { withAdapterLock } from './lock.js';
import { hasConsentMarker, writeConsentMarker } from './consent.js';
import { JS_DEBUG_CHECKSUMS, JS_DEBUG_VERSION } from './checksums.js';
import type { ProvisionContext, ProvisionResult } from './types.js';

const ADAPTER_ID = 'js-debug';
const ENTRYPOINTS = ['src/dapDebugServer.js', 'src/bootloader.js'] as const;
// Tells Node to treat the bundled .js files as CommonJS regardless of any
// ancestor "type": "module" package.json. Mirrors writeJsDebugPackageBoundary
// in scripts/setup-adapters.ts.
const PACKAGE_BOUNDARY = '{"type":"commonjs"}\n';

function resolveBaseUrl(env: NodeJS.ProcessEnv): string {
  const override = env.DAP_CLI_PROVISION_RELEASE_BASE_URL;
  return override !== undefined && override.length > 0 ? override : 'https://github.com';
}

function downloadUrl(env: NodeJS.ProcessEnv): string {
  return `${resolveBaseUrl(env)}/microsoft/vscode-js-debug/releases/download/v${JS_DEBUG_VERSION}/js-debug-dap-v${JS_DEBUG_VERSION}.tar.gz`;
}

async function fileSha256(filePath: string): Promise<string> {
  return await new Promise<string>((resolve, reject) => {
    const hash = createHash('sha256');
    const stream = createReadStream(filePath);
    stream.on('error', reject);
    stream.on('data', chunk => hash.update(chunk as Buffer));
    stream.on('end', () => resolve(hash.digest('hex')));
  });
}

async function entrypointsExist(installRoot: string): Promise<boolean> {
  for (const rel of ENTRYPOINTS) {
    try {
      await fs.access(path.join(installRoot, rel));
    } catch {
      return false;
    }
  }
  return true;
}

export async function provisionJsDebug(ctx: ProvisionContext): Promise<ProvisionResult> {
  const installRoot = path.join(ctx.adaptersDir, ADAPTER_ID);
  const entrypoint = path.join(installRoot, 'src', 'dapDebugServer.js');

  if (
    (await hasConsentMarker(ctx.adaptersDir, ADAPTER_ID, JS_DEBUG_VERSION)) &&
    (await entrypointsExist(installRoot))
  ) {
    return {
      adapterId: 'js-debug',
      version: JS_DEBUG_VERSION,
      installRoot,
      entrypoint,
      fromCache: true,
    };
  }

  const url = downloadUrl(ctx.env);
  const expectedSha = JS_DEBUG_CHECKSUMS[JS_DEBUG_VERSION];
  if (expectedSha === undefined) {
    throw usageError(`No SHA-256 checksum recorded for js-debug v${JS_DEBUG_VERSION}.`, {
      code: 'provision_checksum_mismatch',
      diagnostics: [
        `Adapter: js-debug ${JS_DEBUG_VERSION}`,
        'Edit src/adapters/provision/checksums.ts and add the hash for this version.',
        'Re-run setup or report at https://github.com/roblourens/dap-cli/issues if persistent.',
      ],
      data: {
        adapterId: 'js-debug',
        version: JS_DEBUG_VERSION,
      },
    });
  }

  await confirm({
    assumeYes: ctx.assumeYes,
    question: `Install vscode-js-debug ${JS_DEBUG_VERSION} into ${installRoot} (~10MB)?`,
    details: [`Source: ${url}`],
    ...(ctx.stdin === undefined ? {} : { stdin: ctx.stdin }),
    ...(ctx.stderr === undefined ? {} : { stderr: ctx.stderr }),
  });

  await withAdapterLock(ctx.adaptersDir, ADAPTER_ID, async () => {
    // Double-checked locking — another process may have installed while we waited.
    if (
      (await hasConsentMarker(ctx.adaptersDir, ADAPTER_ID, JS_DEBUG_VERSION)) &&
      (await entrypointsExist(installRoot))
    ) {
      return;
    }

    await atomicInstall({
      adaptersDir: ctx.adaptersDir,
      adapterId: ADAPTER_ID,
      expectedEntrypoints: ENTRYPOINTS,
      populate: async stagingDir => {
        const archivePath = path.join(
          ctx.adaptersDir,
          `.${ADAPTER_ID}.archive.${process.pid}.${randomBytes(4).toString('hex')}.tar.gz`,
        );
        try {
          await downloadToFile({ url, destPath: archivePath, env: ctx.env });
          const actualSha = await fileSha256(archivePath);
          if (actualSha !== expectedSha) {
            throw usageError('Adapter download failed SHA-256 verification.', {
              code: 'provision_checksum_mismatch',
              diagnostics: [
                `URL: ${url}`,
                `Expected: ${expectedSha}`,
                `Actual:   ${actualSha}`,
                'Re-run setup or report at https://github.com/roblourens/dap-cli/issues if persistent.',
              ],
              data: {
                adapterId: 'js-debug',
                version: JS_DEBUG_VERSION,
                url,
                expectedSha,
                actualSha,
              },
            });
          }
          // strip:1 drops the leading `js-debug/` directory inside the archive
          // so the staging dir IS the install root.
          await extractTarGz(archivePath, stagingDir, { strip: 1 });
          await fs.writeFile(
            path.join(stagingDir, 'package.json'),
            PACKAGE_BOUNDARY,
            'utf8',
          );
        } finally {
          await fs.rm(archivePath, { force: true }).catch(() => undefined);
        }
      },
    });

    await writeConsentMarker(ctx.adaptersDir, ADAPTER_ID, JS_DEBUG_VERSION);
  });

  return {
    adapterId: 'js-debug',
    version: JS_DEBUG_VERSION,
    installRoot,
    entrypoint,
    fromCache: false,
  };
}
