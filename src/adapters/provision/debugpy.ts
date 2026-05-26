import path from 'node:path';
import { promises as fs } from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { usageError } from '../../cli/errors.js';
import { confirm } from '../../cli/confirm.js';
import { atomicInstall } from './atomicInstall.js';
import { withAdapterLock } from './lock.js';
import { hasConsentMarker, writeConsentMarker } from './consent.js';
import { DEBUGPY_VERSION } from './checksums.js';
import type { ProvisionContext, ProvisionResult } from './types.js';

const execFileAsync = promisify(execFile);

function venvPythonRel(): string {
  return process.platform === 'win32'
    ? path.join('venv', 'Scripts', 'python.exe')
    : path.join('venv', 'bin', 'python');
}

function venvPipRel(): string {
  return process.platform === 'win32'
    ? path.join('venv', 'Scripts', 'pip.exe')
    : path.join('venv', 'bin', 'pip');
}

function tail(text: string, max = 2048): string {
  if (text.length <= max) {
    return text;
  }
  return `...${text.slice(text.length - max)}`;
}

async function exists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

export async function provisionDebugpy(ctx: ProvisionContext): Promise<ProvisionResult> {
  const { env, assumeYes, adaptersDir, stdin, stderr } = ctx;
  const installRoot = path.join(adaptersDir, 'debugpy');
  const entrypoint = path.join(installRoot, venvPythonRel());

  if ((await hasConsentMarker(adaptersDir, 'debugpy', DEBUGPY_VERSION)) && (await exists(entrypoint))) {
    return {
      adapterId: 'debugpy',
      version: DEBUGPY_VERSION,
      installRoot,
      entrypoint,
      fromCache: true,
    };
  }

  await confirm({
    assumeYes,
    question: `Install debugpy ${DEBUGPY_VERSION} into a venv at ${installRoot}/ (~6MB)?`,
    details: [
      'Requires python3 (>=3.8) on PATH.',
      'Creates an isolated venv and pip-installs debugpy. The venv python becomes the adapter command.',
    ],
    stdin,
    stderr,
  });

  await withAdapterLock(adaptersDir, 'debugpy', async () => {
    if ((await hasConsentMarker(adaptersDir, 'debugpy', DEBUGPY_VERSION)) && (await exists(entrypoint))) {
      return;
    }

    const python3 = env.DAP_CLI_PROVISION_PYTHON3 ?? 'python3';

    try {
      await execFileAsync(python3, ['--version']);
    } catch (error) {
      const message = (error as { stderr?: string; message?: string }).stderr
        ?? (error as Error).message
        ?? 'unknown error';
      throw usageError('python3 is not available on PATH.', {
        code: 'provision_python3_missing',
        diagnostics: [
          'Install Python 3.8+ and ensure `python3` is on PATH.',
          'macOS: `brew install python`',
          'Ubuntu/Debian: `apt install python3 python3-venv`',
          'Windows: install from python.org and check "Add to PATH".',
          `Underlying error: ${tail(message, 512)}`,
        ],
        data: { python3 },
        cause: error,
      });
    }

    await atomicInstall({
      adaptersDir,
      adapterId: 'debugpy',
      expectedEntrypoints: [venvPythonRel()],
      populate: async (stagingDir) => {
        const venvDir = path.join(stagingDir, 'venv');

        try {
          await execFileAsync(python3, ['-m', 'venv', venvDir]);
        } catch (error) {
          const stderrText = (error as { stderr?: string }).stderr ?? '';
          throw usageError('Failed to create Python virtual environment.', {
            code: 'provision_python3_venv_unavailable',
            diagnostics: [
              'The `python3 -m venv` command failed. On Debian/Ubuntu install `python3-venv`:',
              '  sudo apt install python3-venv',
              'On other distros ensure the standard library `venv` and `ensurepip` modules are present.',
              `stderr tail: ${tail(stderrText)}`,
            ],
            data: { python3 },
            cause: error,
          });
        }

        const pipPath = path.join(stagingDir, venvPipRel());
        try {
          await execFileAsync(pipPath, [
            'install',
            '--no-warn-script-location',
            '--disable-pip-version-check',
            `debugpy==${DEBUGPY_VERSION}`,
          ]);
        } catch (error) {
          const stderrText = (error as { stderr?: string }).stderr ?? '';
          throw usageError(`Failed to install debugpy==${DEBUGPY_VERSION} via pip.`, {
            code: 'provision_pip_install_failed',
            diagnostics: [
              'pip install failed. Common causes: no network access, restricted PyPI mirror, missing build tools.',
              'Workaround: set `PIP_INDEX_URL` to your mirror, or pre-install debugpy into the venv and re-run.',
              `Underlying pip command: ${pipPath} install debugpy==${DEBUGPY_VERSION}`,
              `stderr tail: ${tail(stderrText)}`,
            ],
            data: { pipPath, version: DEBUGPY_VERSION },
            cause: error,
          });
        }
      },
    });

    await writeConsentMarker(adaptersDir, 'debugpy', DEBUGPY_VERSION);
  });

  return {
    adapterId: 'debugpy',
    version: DEBUGPY_VERSION,
    installRoot,
    entrypoint,
    fromCache: false,
  };
}
