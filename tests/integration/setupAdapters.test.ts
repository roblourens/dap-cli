import { execFile } from 'node:child_process';
import { chmod, mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { afterEach, describe, expect, test } from 'vitest';
import {
  assertArchiveSha256,
  assertNetCoreDbgExecutablePresent,
  assertNetCoreDbgReady,
  resolveNetCoreDbgAsset,
} from '../../scripts/setup-adapters.js';

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
    await writeExecutable(path.join(fakeBin, 'netcoredbg'), nodeScript('process.exit(0);'));
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
    await writeExecutable(path.join(fakeBin, 'netcoredbg'), nodeScript('process.exit(0);'));

    const result = await execFileAsync(process.execPath, ['--experimental-strip-types', 'scripts/setup-adapters.ts', '--dry-run'], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        NODE_ENV: 'test',
        DAP_CLI_TEST_ARCH: 'x64',
        DAP_CLI_TEST_PLATFORM: 'linux',
        DAP_CLI_HOME: dapCliHome,
        PATH: fakeBin,
      },
    });

    expect(result.stdout).toContain('Delve missing from PATH; will provision v1.26.3');
    expect(result.stdout).not.toContain(`Delve already available at ${cachedDelve}`);
  });

  test('short-circuits NetCoreDbg setup when a usable PATH executable exists', async () => {
    const testRoot = await mkdtemp(path.join(tmpdir(), 'dap-cli-setup-adapters-netcoredbg-path-'));
    tempDirs.push(testRoot);

    const dapCliHome = path.join(testRoot, '.dap-cli');
    const fakeBin = path.join(testRoot, 'bin');
    await mkdir(path.join(dapCliHome, 'adapters', 'js-debug', 'src'), { recursive: true });
    await mkdir(fakeBin, { recursive: true });
    await writeFile(path.join(dapCliHome, 'adapters', 'js-debug', 'src', 'dapDebugServer.js'), '', 'utf8');
    await writeFile(path.join(dapCliHome, 'adapters', 'js-debug', 'src', 'bootloader.js'), '', 'utf8');
    await writeExecutable(path.join(fakeBin, 'dlv'), '#!/usr/bin/env node\nprocess.exit(0);\n');
    await writeExecutable(path.join(fakeBin, 'netcoredbg'), nodeScript('process.stdout.write("NetCoreDbg 3.1.3-1062\\n");'));
    await writeExecutable(path.join(fakeBin, 'python3'), '#!/usr/bin/env node\nprocess.exit(0);\n');

    const result = await execFileAsync(process.execPath, ['--experimental-strip-types', 'scripts/setup-adapters.ts', '--dry-run'], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        DAP_CLI_HOME: dapCliHome,
        PATH: `${fakeBin}${path.delimiter}${process.env.PATH ?? ''}`,
      },
    });

    expect(result.stdout).toContain('NetCoreDbg already available as usable PATH netcoredbg.');
    expect(result.stdout).not.toContain('NetCoreDbg missing from PATH; will provision');
  });

  test('dry-run reports the pinned NetCoreDbg provisioning source', async () => {
    const testRoot = await mkdtemp(path.join(tmpdir(), 'dap-cli-setup-adapters-netcoredbg-dry-run-'));
    tempDirs.push(testRoot);

    const dapCliHome = path.join(testRoot, '.dap-cli');
    const fakeBin = path.join(testRoot, 'bin');
    await mkdir(path.join(dapCliHome, 'adapters', 'js-debug', 'src'), { recursive: true });
    await mkdir(fakeBin, { recursive: true });
    await writeFile(path.join(dapCliHome, 'adapters', 'js-debug', 'src', 'dapDebugServer.js'), '', 'utf8');
    await writeFile(path.join(dapCliHome, 'adapters', 'js-debug', 'src', 'bootloader.js'), '', 'utf8');
    await writeExecutable(path.join(fakeBin, 'dlv'), '#!/usr/bin/env node\nprocess.exit(0);\n');
    await writeExecutable(path.join(fakeBin, 'python3'), '#!/usr/bin/env node\nprocess.exit(0);\n');

    const result = await execFileAsync(process.execPath, ['--experimental-strip-types', 'scripts/setup-adapters.ts', '--dry-run'], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        NODE_ENV: 'test',
        DAP_CLI_TEST_ARCH: 'x64',
        DAP_CLI_TEST_PLATFORM: 'linux',
        DAP_CLI_HOME: dapCliHome,
        PATH: fakeBin,
      },
    });

    expect(result.stdout).toContain('NetCoreDbg missing from PATH; will provision 3.1.3-1062');
    expect(result.stdout).toContain('netcoredbg-linux-amd64.tar.gz');
    expect(result.stdout).toContain('3814341c028c81ff7eea03ac316ad92e9ad7d705d2a00e3e3df269cdc241c763');
  });

  test('reports unsupported NetCoreDbg platforms with a typed diagnostic', () => {
    expect(() => resolveNetCoreDbgAsset('darwin', 'arm64')).toThrow(/netcoredbg_unsupported_platform/);
  });

  test('reports NetCoreDbg digest mismatch with a typed diagnostic', async () => {
    expect(() => assertArchiveSha256('NetCoreDbg', Buffer.from('not the release'), '3814341c028c81ff7eea03ac316ad92e9ad7d705d2a00e3e3df269cdc241c763')).toThrow(/netcoredbg_digest_mismatch/);
  });

  test('reports a missing NetCoreDbg executable after extraction with a typed diagnostic', async () => {
    const testRoot = await mkdtemp(path.join(tmpdir(), 'dap-cli-setup-adapters-netcoredbg-missing-'));
    tempDirs.push(testRoot);

    await expect(assertNetCoreDbgExecutablePresent(testRoot, { executableName: 'netcoredbg' })).rejects.toThrow(/netcoredbg_extraction_failed/);
  });

  test('reports an unusable NetCoreDbg executable with a typed diagnostic', async () => {
    const testRoot = await mkdtemp(path.join(tmpdir(), 'dap-cli-setup-adapters-netcoredbg-unusable-'));
    tempDirs.push(testRoot);
    const executable = path.join(testRoot, 'netcoredbg');
    await writeExecutable(executable, nodeScript('process.exit(1);'));

    expect(() => assertNetCoreDbgReady(executable)).toThrow(/netcoredbg_unusable/);
  });

  test('NetCoreDbg setup implementation writes archives under a private temp directory', async () => {
    const source = await readFile(path.join(process.cwd(), 'scripts', 'setup-adapters.ts'), 'utf8');
    const setupNetCoreDbg = source.slice(source.indexOf('async function setupNetCoreDbg'), source.indexOf('function pythonHasDebugpy'));
    expect(setupNetCoreDbg).toContain("fs.mkdtemp(path.join(tmpdir(), 'dap-cli-netcoredbg-'))");
    expect(setupNetCoreDbg).toContain("fs.writeFile(archivePath, archiveBytes, { flag: 'wx' })");
    expect(setupNetCoreDbg).not.toContain('path.join(tmpdir(), asset.archiveName)');
  });

  test('NetCoreDbg zip extraction does not depend on unzip on Windows', async () => {
    const source = await readFile(path.join(process.cwd(), 'scripts', 'setup-adapters.ts'), 'utf8');
    expect(source).toContain('powershell.exe');
    expect(source).toContain('Expand-Archive');
    expect(source).toContain('System.IO.Compression.ZipFile');
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

function nodeScript(body: string): string {
  return `#!${process.execPath}\n${body}\n`;
}
