#!/usr/bin/env node
import { createWriteStream } from 'node:fs';
import { promises as fs } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import { finished } from 'node:stream/promises';
import { spawnSync, type SpawnSyncReturns } from 'node:child_process';

const jsDebugVersion = '1.117.0';
const debugpyVersion = '1.8.20';
const delveVersion = 'v1.26.3';
const appDirectoryName = '.dap-cli';
const jsDebugPackageBoundary = '{"type":"commonjs"}\n';

interface DelveAsset {
  archiveName: string;
  executableName: string;
  archiveKind: 'tar.gz' | 'zip';
}

interface SetupOptions {
  dryRun: boolean;
  help: boolean;
}

async function main(args: readonly string[]): Promise<number> {
  const options = parseArgs(args);
  if (options.help) {
    printHelp();
    return 0;
  }

  const dapCliHome = getDapCliHome();
  const adaptersDir = getDapCliAdaptersDir();
  const venvPython = getDapCliVenvPythonPath();

  console.log(`dap-cli home: ${dapCliHome}`);
  console.log(`adapter cache: ${adaptersDir}`);

  await setupJsDebug({ adaptersDir, dryRun: options.dryRun });
  await setupDebugpy({ dapCliHome, venvPython, dryRun: options.dryRun });
  await setupDelve({ adaptersDir, dryRun: options.dryRun });

  console.log('Adapter setup complete.');
  return 0;
}

function parseArgs(args: readonly string[]): SetupOptions {
  return {
    dryRun: args.includes('--dry-run'),
    help: args.includes('--help') || args.includes('-h'),
  };
}

function printHelp(): void {
  console.log(`Usage: npm run setup-adapters -- [--dry-run]\n\nProvisions dap-cli built-in adapters into DAP_CLI_HOME.\n\nOptions:\n  --dry-run  Report actions without downloading or installing\n  --help     Show this help`);
}

async function setupJsDebug(options: { adaptersDir: string; dryRun: boolean }): Promise<void> {
  const jsDebugDir = path.join(options.adaptersDir, 'js-debug');
  const entrypoint = path.join(jsDebugDir, 'src', 'dapDebugServer.js');
  const bootloader = path.join(jsDebugDir, 'src', 'bootloader.js');

  if (await pathExists(entrypoint) && await pathExists(bootloader)) {
    if (!options.dryRun) {
      await writeJsDebugPackageBoundary(jsDebugDir);
    }
    console.log(`js-debug already available at ${jsDebugDir}`);
    return;
  }

  const assetName = `js-debug-dap-v${jsDebugVersion}.tar.gz`;
  const downloadUrl = `https://github.com/microsoft/vscode-js-debug/releases/download/v${jsDebugVersion}/${assetName}`;
  console.log(`js-debug missing; will provision v${jsDebugVersion} from ${downloadUrl}`);

  if (options.dryRun) {
    return;
  }

  await fs.mkdir(options.adaptersDir, { recursive: true });
  const archivePath = path.join(tmpdir(), assetName);
  await downloadFile('js-debug', downloadUrl, archivePath, `Run manually: curl -L ${downloadUrl} | tar xzf - -C ${getDapCliAdaptersDir()}`);
  await fs.rm(jsDebugDir, { recursive: true, force: true });
  await fs.mkdir(options.adaptersDir, { recursive: true });

  const tarResult = spawnSync('tar', ['xzf', archivePath, '-C', options.adaptersDir], { encoding: 'utf8' });
  if (tarResult.status !== 0) {
    throw new Error(`Could not extract js-debug archive. ${spawnFailureDetail(tarResult)}`);
  }

  if (!await pathExists(entrypoint)) {
    throw new Error(`js-debug extraction completed but ${entrypoint} was not found.`);
  }
  if (!await pathExists(bootloader)) {
    throw new Error(`js-debug extraction completed but ${bootloader} was not found.`);
  }
  await writeJsDebugPackageBoundary(jsDebugDir);

  console.log(`js-debug v${jsDebugVersion} provisioned to ${jsDebugDir}`);
}

async function writeJsDebugPackageBoundary(jsDebugDir: string): Promise<void> {
  await fs.writeFile(path.join(jsDebugDir, 'package.json'), jsDebugPackageBoundary, 'utf8');
}

async function setupDebugpy(options: { dapCliHome: string; venvPython: string; dryRun: boolean }): Promise<void> {
  if (pythonHasDebugpy('python3')) {
    console.log('debugpy already available in system Python.');
    return;
  }

  console.log(`debugpy missing from system Python; will provision v${debugpyVersion} to ${path.join(options.dapCliHome, 'venv')}`);
  if (options.dryRun) {
    return;
  }

  const venvDir = path.dirname(path.dirname(options.venvPython));
  const pipPath = getVenvPipPath(venvDir);
  const venvReady = await pathExists(options.venvPython) && await pathExists(pipPath);
  if (!venvReady) {
    await fs.rm(venvDir, { recursive: true, force: true });
    const venvResult = spawnSync('python3', ['-m', 'venv', venvDir], { encoding: 'utf8' });
    if (venvResult.status !== 0) {
      throw new Error(`Python 3 required for debugpy setup. Install Python 3 and retry. ${spawnFailureDetail(venvResult)}`);
    }
  }

  const pipResult = spawnSync(pipPath, ['install', `debugpy==${debugpyVersion}`], { encoding: 'utf8' });
  if (pipResult.status !== 0) {
    throw new Error(`Could not install debugpy. ${spawnFailureDetail(pipResult)}`);
  }

  if (!pythonHasDebugpy(options.venvPython)) {
    throw new Error(`debugpy install completed but ${options.venvPython} cannot import debugpy.`);
  }

  console.log(`debugpy v${debugpyVersion} provisioned to ${venvDir}`);
}

async function setupDelve(options: { adaptersDir: string; dryRun: boolean }): Promise<void> {
  if (commandSucceeds('dlv', ['version'])) {
    console.log('Delve already available as usable PATH dlv.');
    return;
  }

  const asset = resolveDelveAsset(process.platform, process.arch);
  const delveDir = path.join(options.adaptersDir, 'delve');
  const delveBinary = path.join(delveDir, asset.executableName);
  if (await pathExists(delveBinary)) {
    console.log(`Delve already available at ${delveBinary}`);
    return;
  }

  const downloadUrl = `https://github.com/go-delve/delve/releases/download/${delveVersion}/${asset.archiveName}`;
  console.log(`Delve missing from PATH; will provision ${delveVersion} from ${downloadUrl} to ${delveDir}`);
  console.log('Delve release trust: official pinned GitHub release asset; checksum verification is not automated by setup-adapters.');
  if (options.dryRun) {
    return;
  }

  await fs.mkdir(delveDir, { recursive: true });
  const archivePath = path.join(tmpdir(), asset.archiveName);
  await downloadFile('Delve', downloadUrl, archivePath, `Download ${downloadUrl}, extract it into ${delveDir}, and retry.`);
  await fs.rm(delveDir, { recursive: true, force: true });
  await fs.mkdir(delveDir, { recursive: true });
  extractDelveArchive(asset, archivePath, delveDir);

  if (!await pathExists(delveBinary)) {
    throw new Error(`Delve extraction completed but ${delveBinary} was not found.`);
  }

  if (process.platform !== 'win32') {
    await fs.chmod(delveBinary, 0o755);
  }

  console.log(`Delve ${delveVersion} provisioned to ${delveDir}`);
}

function pythonHasDebugpy(pythonPath: string): boolean {
  return commandSucceeds(pythonPath, ['-c', 'import debugpy; print(debugpy.__version__)']);
}

function resolveDelveAsset(platform: NodeJS.Platform, architecture: string): DelveAsset {
  const platformAssets: Partial<Record<NodeJS.Platform, Partial<Record<string, DelveAsset>>>> = {
    darwin: {
      arm64: { archiveName: `dlv_1.26.3_darwin_arm64.tar.gz`, executableName: 'dlv', archiveKind: 'tar.gz' },
      x64: { archiveName: `dlv_1.26.3_darwin_amd64.tar.gz`, executableName: 'dlv', archiveKind: 'tar.gz' },
    },
    linux: {
      arm64: { archiveName: `dlv_1.26.3_linux_arm64.tar.gz`, executableName: 'dlv', archiveKind: 'tar.gz' },
      x64: { archiveName: `dlv_1.26.3_linux_amd64.tar.gz`, executableName: 'dlv', archiveKind: 'tar.gz' },
    },
    win32: {
      x64: { archiveName: `dlv_1.26.3_windows_amd64.zip`, executableName: 'dlv.exe', archiveKind: 'zip' },
    },
  };
  const asset = platformAssets[platform]?.[architecture];
  if (asset === undefined) {
    throw new Error(`Delve setup does not support ${platform}/${architecture}. Install dlv on PATH or provision a compatible binary manually.`);
  }

  return asset;
}

function extractDelveArchive(asset: DelveAsset, archivePath: string, delveDir: string): void {
  const extraction = asset.archiveKind === 'zip'
    ? spawnSync('unzip', ['-q', archivePath, '-d', delveDir], { encoding: 'utf8' })
    : spawnSync('tar', ['xzf', archivePath, '-C', delveDir], { encoding: 'utf8' });
  if (extraction.status !== 0) {
    throw new Error(`Could not extract Delve archive. ${spawnFailureDetail(extraction)}`);
  }
}

function spawnFailureDetail(result: SpawnSyncReturns<string>): string {
  const stderr = result.stderr?.trim();
  if (stderr) {
    return stderr;
  }

  return result.error?.message ?? 'No stderr output.';
}

function commandSucceeds(command: string, args: readonly string[]): boolean {
  const result = spawnSync(command, [...args], { encoding: 'utf8' });
  return result.status === 0;
}

function getVenvPipPath(venvDir: string): string {
  if (process.platform === 'win32') {
    return path.join(venvDir, 'Scripts', 'pip.exe');
  }

  return path.join(venvDir, 'bin', 'pip');
}

function getDapCliHome(env: NodeJS.ProcessEnv = process.env): string {
  return env.DAP_CLI_HOME ?? path.join(homedir(), appDirectoryName);
}

function getDapCliAdaptersDir(env: NodeJS.ProcessEnv = process.env): string {
  return path.join(getDapCliHome(env), 'adapters');
}

function getDapCliVenvPythonPath(env: NodeJS.ProcessEnv = process.env): string {
  const venvDirectory = path.join(getDapCliHome(env), 'venv');
  if (process.platform === 'win32') {
    return path.join(venvDirectory, 'Scripts', 'python.exe');
  }

  return path.join(venvDirectory, 'bin', 'python3');
}

async function downloadFile(adapterLabel: string, url: string, destination: string, manualRecovery: string): Promise<void> {
  const response = await fetch(url);
  if (!response.ok || response.body === null) {
    throw new Error(`Could not download ${adapterLabel}. ${manualRecovery}`);
  }

  const output = createWriteStream(destination);
  await finished(Readable.fromWeb(response.body).pipe(output));
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch (error) {
    if (isNodeError(error) && error.code === 'ENOENT') {
      return false;
    }

    throw error;
  }
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return typeof error === 'object' && error !== null && 'code' in error;
}

process.exitCode = await main(process.argv.slice(2));
