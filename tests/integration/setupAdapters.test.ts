import { execFile } from 'node:child_process';
import { chmod, mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { afterEach, describe, expect, test } from 'vitest';

const execFileAsync = promisify(execFile);
const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map(tempDir => rm(tempDir, { recursive: true, force: true })));
});

describe.skipIf(process.platform === 'win32')('setup-adapters', () => {
  test('recreates a partial debugpy venv before installing debugpy', async () => {
    const testRoot = await mkdtemp(path.join(tmpdir(), 'dap-cli-setup-adapters-'));
    tempDirs.push(testRoot);

    const dapCliHome = path.join(testRoot, '.dap-cli');
    const fakeBin = path.join(testRoot, 'bin');
    const venvBin = path.join(dapCliHome, 'venv', 'bin');
    await mkdir(path.join(dapCliHome, 'adapters', 'js-debug', 'src'), { recursive: true });
    await mkdir(fakeBin, { recursive: true });
    await mkdir(venvBin, { recursive: true });
    await writeFile(path.join(dapCliHome, 'adapters', 'js-debug', 'src', 'dapDebugServer.js'), '', 'utf8');
    await writeFile(path.join(dapCliHome, 'adapters', 'js-debug', 'src', 'bootloader.js'), '', 'utf8');
    await writeExecutable(path.join(venvBin, 'python3'), '#!/usr/bin/env node\nprocess.exit(0);\n');
    await writeExecutable(path.join(fakeBin, 'dlv'), '#!/usr/bin/env node\nprocess.exit(0);\n');
    await writeExecutable(path.join(fakeBin, 'python3'), fakePythonScript());

    const result = await execFileAsync(process.execPath, ['--experimental-strip-types', 'scripts/setup-adapters.ts'], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        DAP_CLI_HOME: dapCliHome,
        PATH: `${fakeBin}${path.delimiter}${process.env.PATH ?? ''}`,
      },
    });

    expect(result.stdout).toContain(`debugpy v1.8.20 provisioned to ${path.join(dapCliHome, 'venv')}`);
    expect(await readFile(path.join(venvBin, 'python3'), 'utf8')).toContain('debugpy-ready');
    expect(await readFile(path.join(venvBin, 'pip'), 'utf8')).toContain('pip-ready');
  });

  test('dry-run reprovisions an unusable cached Delve when PATH has no working dlv', async () => {
    const testRoot = await mkdtemp(path.join(tmpdir(), 'dap-cli-setup-adapters-delve-'));
    tempDirs.push(testRoot);

    const dapCliHome = path.join(testRoot, '.dap-cli');
    const fakeBin = path.join(testRoot, 'bin');
    const cachedDelveDir = path.join(dapCliHome, 'adapters', 'delve');
    const cachedDelve = path.join(cachedDelveDir, 'dlv');
    await mkdir(fakeBin, { recursive: true });
    await mkdir(cachedDelveDir, { recursive: true });
    await writeExecutable(cachedDelve, '#!/usr/bin/env node\nprocess.exit(1);\n');

    const result = await execFileAsync(process.execPath, ['--experimental-strip-types', 'scripts/setup-adapters.ts', '--dry-run'], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        DAP_CLI_HOME: dapCliHome,
        PATH: fakeBin,
      },
    });

    expect(result.stdout).toContain('Delve missing from PATH; will provision v1.26.3');
    expect(result.stdout).not.toContain(`Delve already available at ${cachedDelve}`);
  });
});

async function writeExecutable(filePath: string, content: string): Promise<void> {
  await writeFile(filePath, content, 'utf8');
  await chmod(filePath, 0o755);
}

function fakePythonScript(): string {
  return `#!/usr/bin/env node
import { mkdirSync, writeFileSync, chmodSync } from 'node:fs';
import path from 'node:path';

if (process.argv[2] !== '-m' || process.argv[3] !== 'venv') {
  process.exit(1);
}

const venvDir = process.argv[4];
const binDir = path.join(venvDir, 'bin');
mkdirSync(binDir, { recursive: true });
const python = path.join(binDir, 'python3');
const pip = path.join(binDir, 'pip');
writeFileSync(python, '#!/usr/bin/env node\\n// debugpy-ready\\nprocess.exit(0);\\n', 'utf8');
writeFileSync(pip, '#!/usr/bin/env node\\n// pip-ready\\nprocess.exit(0);\\n', 'utf8');
chmodSync(python, 0o755);
chmodSync(pip, 0o755);
`;
}