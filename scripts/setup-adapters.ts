#!/usr/bin/env node
import { createWriteStream } from 'node:fs';
import { promises as fs } from 'node:fs';
import { createHash } from 'node:crypto';
import { homedir, tmpdir } from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import { finished } from 'node:stream/promises';
import { spawnSync, type SpawnSyncReturns } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const jsDebugVersion = '1.117.0';
const debugpyVersion = '1.8.20';
const delveVersion = 'v1.26.3';
const netCoreDbgVersion = '3.1.3-1062';
const appDirectoryName = '.dap-cli';
const jsDebugPackageBoundary = '{"type":"commonjs"}\n';

interface DelveAsset {
  archiveName: string;
  executableName: string;
  archiveKind: 'tar.gz' | 'zip';
}

interface NetCoreDbgAsset extends DelveAsset {
  sha256: string;
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
  await setupNetCoreDbg({ adaptersDir, dryRun: options.dryRun });

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
  if (await pathExists(delveBinary) && commandSucceeds(delveBinary, ['version'])) {
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

async function setupNetCoreDbg(options: { adaptersDir: string; dryRun: boolean }): Promise<void> {
  if (netCoreDbgIsUsable('netcoredbg')) {
    console.log('NetCoreDbg already available as usable PATH netcoredbg.');
    return;
  }

  const asset = resolveNetCoreDbgAsset(getCurrentPlatform(), getCurrentArchitecture());
  const netCoreDbgDir = path.join(options.adaptersDir, 'netcoredbg');
  const netCoreDbgBinary = path.join(netCoreDbgDir, asset.executableName);
  if (await pathExists(netCoreDbgBinary) && netCoreDbgIsUsable(netCoreDbgBinary)) {
    console.log(`NetCoreDbg already available at ${netCoreDbgBinary}`);
    return;
  }

  const downloadUrl = `https://github.com/Samsung/netcoredbg/releases/download/${netCoreDbgVersion}/${asset.archiveName}`;
  console.log(`NetCoreDbg missing from PATH; will provision ${netCoreDbgVersion} from ${downloadUrl} to ${netCoreDbgDir}`);
  console.log(`NetCoreDbg release trust: pinned sha256 ${asset.sha256}`);
  if (options.dryRun) {
    return;
  }

  const archiveBytes = await downloadBytes('NetCoreDbg', downloadUrl, `Download ${downloadUrl}, verify sha256 ${asset.sha256}, extract it into ${netCoreDbgDir}, and retry.`);
  assertArchiveSha256('NetCoreDbg', archiveBytes, asset.sha256);
  const tempDir = await fs.mkdtemp(path.join(tmpdir(), 'dap-cli-netcoredbg-'));
  try {
    const archivePath = path.join(tempDir, asset.archiveName);
    await fs.writeFile(archivePath, archiveBytes, { flag: 'wx' });
    await fs.rm(netCoreDbgDir, { recursive: true, force: true });
    await fs.mkdir(netCoreDbgDir, { recursive: true });
    extractNetCoreDbgArchive(asset, archivePath, netCoreDbgDir);
    await flattenNetCoreDbgArchiveRoot(netCoreDbgDir, asset);
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }

  const executable = await assertNetCoreDbgExecutablePresent(netCoreDbgDir, asset);
  if (process.platform !== 'win32') {
    await fs.chmod(executable, 0o755);
  }
  assertNetCoreDbgReady(executable);

  console.log(`NetCoreDbg ${netCoreDbgVersion} provisioned to ${netCoreDbgDir}`);
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

export function resolveNetCoreDbgAsset(platform: string, architecture: string): NetCoreDbgAsset {
  const platformAssets: Partial<Record<NodeJS.Platform, Partial<Record<string, NetCoreDbgAsset>>>> = {
    darwin: {
      x64: {
        archiveName: 'netcoredbg-osx-amd64.tar.gz',
        executableName: 'netcoredbg',
        archiveKind: 'tar.gz',
        sha256: '49459b066836b6a452f418501d7ecab57bcd7e60d8464faac21ff70b496b8634',
      },
    },
    linux: {
      arm64: {
        archiveName: 'netcoredbg-linux-arm64.tar.gz',
        executableName: 'netcoredbg',
        archiveKind: 'tar.gz',
        sha256: 'fc9efb691a53932a7fac4b9f67af68ad0c2a4cbe59cb2c1a3c44c64959df2ba4',
      },
      x64: {
        archiveName: 'netcoredbg-linux-amd64.tar.gz',
        executableName: 'netcoredbg',
        archiveKind: 'tar.gz',
        sha256: '3814341c028c81ff7eea03ac316ad92e9ad7d705d2a00e3e3df269cdc241c763',
      },
    },
    win32: {
      x64: {
        archiveName: 'netcoredbg-win64.zip',
        executableName: 'netcoredbg.exe',
        archiveKind: 'zip',
        sha256: 'c67ae052e0bcb9ce37000f261e2d397a0d5b6615cafe30c868239a78598dfb37',
      },
    },
  };
  const asset = platformAssets[platform as NodeJS.Platform]?.[architecture];
  if (asset === undefined) {
    throw new Error(`netcoredbg_unsupported_platform: NetCoreDbg setup does not support ${platform}/${architecture}. Install netcoredbg on PATH or provision a compatible binary manually.`);
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

function extractNetCoreDbgArchive(asset: NetCoreDbgAsset, archivePath: string, netCoreDbgDir: string): void {
  validateArchiveEntriesStayWithinTarget(asset, archivePath, netCoreDbgDir);
  const extraction = extractArchive(asset, archivePath, netCoreDbgDir);
  if (extraction.status !== 0) {
    throw new Error(`netcoredbg_extraction_failed: Could not extract NetCoreDbg archive. ${spawnFailureDetail(extraction)}`);
  }
}

function validateArchiveEntriesStayWithinTarget(asset: NetCoreDbgAsset, archivePath: string, targetDir: string): void {
  const listing = listArchiveEntries(asset, archivePath);
  if (listing.status !== 0) {
    throw new Error(`netcoredbg_extraction_failed: Could not inspect NetCoreDbg archive. ${spawnFailureDetail(listing)}`);
  }

  for (const entry of listing.stdout.split(/\r?\n/).filter(Boolean)) {
    const normalizedEntry = entry.replace(/\\/g, '/');
    const resolved = path.resolve(targetDir, normalizedEntry);
    if (!isPathWithin(resolved, targetDir)) {
      throw new Error(`netcoredbg_extraction_failed: NetCoreDbg archive entry escapes target directory: ${entry}`);
    }
  }
}

function extractArchive(asset: NetCoreDbgAsset, archivePath: string, targetDir: string): SpawnSyncReturns<string> {
  if (asset.archiveKind === 'zip' && process.platform === 'win32') {
    return spawnSync('powershell.exe', [
      '-NoProfile',
      '-NonInteractive',
      '-Command',
      `Expand-Archive -LiteralPath ${quotePowerShellString(archivePath)} -DestinationPath ${quotePowerShellString(targetDir)} -Force`,
    ], { encoding: 'utf8' });
  }

  return asset.archiveKind === 'zip'
    ? spawnSync('unzip', ['-q', archivePath, '-d', targetDir], { encoding: 'utf8' })
    : spawnSync('tar', ['xzf', archivePath, '-C', targetDir], { encoding: 'utf8' });
}

function listArchiveEntries(asset: NetCoreDbgAsset, archivePath: string): SpawnSyncReturns<string> {
  if (asset.archiveKind === 'zip' && process.platform === 'win32') {
    return spawnSync('powershell.exe', [
      '-NoProfile',
      '-NonInteractive',
      '-Command',
      [
        'Add-Type -AssemblyName System.IO.Compression.FileSystem',
        `$archive = [System.IO.Compression.ZipFile]::OpenRead(${quotePowerShellString(archivePath)})`,
        'try { $archive.Entries | ForEach-Object { $_.FullName } } finally { $archive.Dispose() }',
      ].join('; '),
    ], { encoding: 'utf8' });
  }

  return asset.archiveKind === 'zip'
    ? spawnSync('unzip', ['-Z1', archivePath], { encoding: 'utf8' })
    : spawnSync('tar', ['tzf', archivePath], { encoding: 'utf8' });
}

function quotePowerShellString(value: string): string {
  return `'${value.replace(/'/g, '\'\'')}'`;
}

function isPathWithin(candidate: string, parent: string): boolean {
  const resolvedParent = path.resolve(parent);
  return candidate === resolvedParent || candidate.startsWith(`${resolvedParent}${path.sep}`);
}

export function assertArchiveSha256(adapterLabel: string, archiveBytes: Buffer, expectedSha256: string): void {
  const actualSha256 = createHash('sha256').update(archiveBytes).digest('hex');
  if (actualSha256 !== expectedSha256) {
    throw new Error(`netcoredbg_digest_mismatch: ${adapterLabel} archive sha256 mismatch. Expected ${expectedSha256}; got ${actualSha256}.`);
  }
}

export async function assertNetCoreDbgExecutablePresent(netCoreDbgDir: string, asset: Pick<NetCoreDbgAsset, 'executableName'>): Promise<string> {
  const executable = path.join(netCoreDbgDir, asset.executableName);
  if (!await pathExists(executable)) {
    throw new Error(`netcoredbg_extraction_failed: NetCoreDbg extraction completed but ${executable} was not found.`);
  }

  return executable;
}

async function flattenNetCoreDbgArchiveRoot(netCoreDbgDir: string, asset: Pick<NetCoreDbgAsset, 'executableName'>): Promise<void> {
  const rootExecutable = path.join(netCoreDbgDir, asset.executableName);
  if (await pathExists(rootExecutable)) {
    return;
  }

  const nestedDir = path.join(netCoreDbgDir, 'netcoredbg');
  const nestedExecutable = path.join(nestedDir, asset.executableName);
  if (!await pathExists(nestedExecutable)) {
    return;
  }

  for (const entry of await fs.readdir(nestedDir)) {
    await fs.rename(path.join(nestedDir, entry), path.join(netCoreDbgDir, entry));
  }
  await fs.rmdir(nestedDir);
}

export function assertNetCoreDbgReady(executable: string): void {
  if (!netCoreDbgIsUsable(executable)) {
    throw new Error(`netcoredbg_unusable: NetCoreDbg executable is not usable at ${executable}. Expected --version or --help to exit successfully.`);
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

function netCoreDbgIsUsable(command: string): boolean {
  return commandSucceeds(command, ['--version']) || commandSucceeds(command, ['--help']);
}

function getCurrentPlatform(): NodeJS.Platform {
  if (process.env.NODE_ENV === 'test' && process.env.DAP_CLI_TEST_PLATFORM !== undefined) {
    return process.env.DAP_CLI_TEST_PLATFORM as NodeJS.Platform;
  }

  return process.platform;
}

function getCurrentArchitecture(): string {
  if (process.env.NODE_ENV === 'test' && process.env.DAP_CLI_TEST_ARCH !== undefined) {
    return process.env.DAP_CLI_TEST_ARCH;
  }

  return process.arch;
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

async function downloadBytes(adapterLabel: string, url: string, manualRecovery: string): Promise<Buffer> {
  const response = await fetch(url);
  if (!response.ok || response.body === null) {
    throw new Error(`Could not download ${adapterLabel}. ${manualRecovery}`);
  }

  return Buffer.from(await response.arrayBuffer());
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

if (process.argv[1] !== undefined && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = await main(process.argv.slice(2));
}
