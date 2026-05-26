import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { Readable } from 'node:stream';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';

import { provisionDebugpy } from '../../../src/adapters/provision/debugpy.js';
import { DEBUGPY_VERSION } from '../../../src/adapters/provision/checksums.js';
import { CliError } from '../../../src/cli/errors.js';

const execFileAsync = promisify(execFile);

async function hasPython3(): Promise<boolean> {
  try {
    await execFileAsync('python3', ['--version']);
    return true;
  } catch {
    return false;
  }
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

const python3Available = await hasPython3();

describe('provisionDebugpy', () => {
  let workDir: string;
  let adaptersDir: string;

  beforeEach(async () => {
    workDir = await fs.mkdtemp(path.join(os.tmpdir(), 'dap-cli-prov-debugpy-'));
    adaptersDir = path.join(workDir, 'adapters');
    await fs.mkdir(adaptersDir, { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(workDir, { recursive: true, force: true });
  });

  test.skipIf(!python3Available)(
    'cold cache creates venv, pip-installs debugpy, writes consent marker',
    async () => {
      const result = await provisionDebugpy({
        env: process.env,
        assumeYes: true,
        adaptersDir,
      });

      expect(result.adapterId).toBe('debugpy');
      expect(result.version).toBe(DEBUGPY_VERSION);
      expect(result.fromCache).toBe(false);
      expect(result.installRoot).toBe(path.join(adaptersDir, 'debugpy'));
      const expectedRel = process.platform === 'win32'
        ? path.join('venv', 'Scripts', 'python.exe')
        : path.join('venv', 'bin', 'python');
      expect(result.entrypoint).toBe(path.join(adaptersDir, 'debugpy', expectedRel));

      // Verify debugpy is importable from the provisioned venv.
      await execFileAsync(result.entrypoint, ['-c', 'import debugpy; print(debugpy.__version__)']);

      // Consent marker present.
      await fs.access(path.join(adaptersDir, 'debugpy', `.consent-${DEBUGPY_VERSION}`));
    },
    180_000,
  );

  test.skipIf(!python3Available)(
    'warm cache returns fromCache=true without re-running pip',
    async () => {
      const first = await provisionDebugpy({
        env: process.env,
        assumeYes: true,
        adaptersDir,
      });
      expect(first.fromCache).toBe(false);

      const venvPythonMtimeBefore = (await fs.stat(first.entrypoint)).mtimeMs;

      const second = await provisionDebugpy({
        env: process.env,
        assumeYes: true,
        adaptersDir,
      });

      expect(second.fromCache).toBe(true);
      expect(second.entrypoint).toBe(first.entrypoint);
      // Warm cache must NOT re-create the venv.
      const venvPythonMtimeAfter = (await fs.stat(first.entrypoint)).mtimeMs;
      expect(venvPythonMtimeAfter).toBe(venvPythonMtimeBefore);
    },
    180_000,
  );

  test('missing python3 throws provision_python3_missing', async () => {
    // Point DAP_CLI_PROVISION_PYTHON3 at a non-existent binary so we don't depend on $PATH.
    const error = await provisionDebugpy({
      env: { ...process.env, DAP_CLI_PROVISION_PYTHON3: '/nonexistent/python3-does-not-exist' },
      assumeYes: true,
      adaptersDir,
    }).catch((err: unknown) => err);

    expect(error).toBeInstanceOf(CliError);
    expect((error as CliError).code).toBe('provision_python3_missing');
    // No canonical install on failure.
    await expect(fs.access(path.join(adaptersDir, 'debugpy'))).rejects.toThrow();
  });

  test('consent decline throws provision_consent_declined without spawning python', async () => {
    const error = await provisionDebugpy({
      env: { ...process.env, DAP_CLI_PROVISION_PYTHON3: '/nonexistent/python3-does-not-exist' },
      assumeYes: false,
      adaptersDir,
      stdin: createTtyStdin('\n'),
      stderr: createSinkStderr(),
    }).catch((err: unknown) => err);

    expect(error).toBeInstanceOf(CliError);
    expect((error as CliError).code).toBe('provision_consent_declined');
    // Critical: we declined consent, so the bogus python3 must never have been touched.
    await expect(fs.access(path.join(adaptersDir, 'debugpy'))).rejects.toThrow();
  });

  test('non-TTY + assumeYes=false throws provision_consent_required without spawning python', async () => {
    const error = await provisionDebugpy({
      env: { ...process.env, DAP_CLI_PROVISION_PYTHON3: '/nonexistent/python3-does-not-exist' },
      assumeYes: false,
      adaptersDir,
      stdin: createNonTtyStdin(),
    }).catch((err: unknown) => err);

    expect(error).toBeInstanceOf(CliError);
    expect((error as CliError).code).toBe('provision_consent_required');
    await expect(fs.access(path.join(adaptersDir, 'debugpy'))).rejects.toThrow();
  });
});
