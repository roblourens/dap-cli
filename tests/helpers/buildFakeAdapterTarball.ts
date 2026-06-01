// In-process builders for synthetic adapter release archives used by the
// provisioner test harness. D-11 forbids shelling out to system tar/unzip, so
// tar.gz uses the existing `tar` runtime dep and zip is hand-built in
// stored mode (same approach as tests/adapters/provision/extract.test.ts).

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { crc32 } from 'node:zlib';
import * as tar from 'tar';

export interface BuiltArchive {
  readonly path: string;
  readonly sha256: string;
  cleanup(): Promise<void>;
}

async function hashFile(filePath: string): Promise<string> {
  const buf = await fs.readFile(filePath);
  return createHash('sha256').update(buf).digest('hex');
}

/**
 * Build a synthetic js-debug tar.gz. Layout mirrors the upstream release:
 *   js-debug/package.json
 *   js-debug/src/dapDebugServer.js
 *   js-debug/src/bootloader.js
 *
 * The provisioner uses `extractTarGz(strip: 1)` so the leading `js-debug/`
 * component is dropped at install time, but the archive itself must still
 * carry it.
 */
export async function buildFakeJsDebugTarball(version: string, destDir: string): Promise<BuiltArchive> {
  const srcRoot = await fs.mkdtemp(path.join(destDir, `js-debug-src-${version}-`));
  const inner = path.join(srcRoot, 'js-debug');
  const innerSrc = path.join(inner, 'src');
  await fs.mkdir(innerSrc, { recursive: true });
  await fs.writeFile(path.join(innerSrc, 'dapDebugServer.js'), `// synthetic dapDebugServer for ${version}\n`);
  await fs.writeFile(path.join(innerSrc, 'bootloader.js'), `// synthetic bootloader for ${version}\n`);
  await fs.writeFile(path.join(inner, 'package.json'), `{"name":"vscode-js-debug","version":"${version}"}\n`);

  const archivePath = path.join(destDir, `js-debug-dap-v${version}.tar.gz`);
  await tar.c({ gzip: true, cwd: srcRoot, file: archivePath }, ['js-debug']);
  const sha256 = await hashFile(archivePath);
  return {
    path: archivePath,
    sha256,
    cleanup: async () => {
      await fs.rm(srcRoot, { recursive: true, force: true });
      await fs.rm(archivePath, { force: true });
    },
  };
}

/**
 * Build a synthetic delve tar.gz. The official delve release is flat — `dlv`
 * sits at the archive root with no parent directory.
 */
export async function buildFakeDelveTarGz(platformKey: string, destDir: string): Promise<BuiltArchive> {
  const srcRoot = await fs.mkdtemp(path.join(destDir, `delve-src-${platformKey}-`));
  await fs.writeFile(path.join(srcRoot, 'dlv'), `#!/bin/sh\necho synthetic dlv for ${platformKey}\n`);
  const archivePath = path.join(destDir, `dlv_${platformKey}.tar.gz`);
  await tar.c({ gzip: true, cwd: srcRoot, file: archivePath }, ['dlv']);
  const sha256 = await hashFile(archivePath);
  return {
    path: archivePath,
    sha256,
    cleanup: async () => {
      await fs.rm(srcRoot, { recursive: true, force: true });
      await fs.rm(archivePath, { force: true });
    },
  };
}

interface ZipEntry {
  name: string;
  data: Buffer;
  unixMode?: number;
}

function buildStoredZip(entries: readonly ZipEntry[]): Buffer {
  const localChunks: Buffer[] = [];
  const centralChunks: Buffer[] = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBytes = Buffer.from(entry.name, 'utf8');
    const dataCrc = crc32(entry.data);

    const lfh = Buffer.alloc(30);
    lfh.writeUInt32LE(0x04034b50, 0);
    lfh.writeUInt16LE(20, 4);
    lfh.writeUInt16LE(0, 6);
    lfh.writeUInt16LE(0, 8);
    lfh.writeUInt16LE(0, 10);
    lfh.writeUInt16LE(0x21, 12);
    lfh.writeUInt32LE(dataCrc, 14);
    lfh.writeUInt32LE(entry.data.length, 18);
    lfh.writeUInt32LE(entry.data.length, 22);
    lfh.writeUInt16LE(nameBytes.length, 26);
    lfh.writeUInt16LE(0, 28);

    const localOffset = offset;
    localChunks.push(lfh, nameBytes, entry.data);
    offset += 30 + nameBytes.length + entry.data.length;

    const cdh = Buffer.alloc(46);
    cdh.writeUInt32LE(0x02014b50, 0);
    cdh.writeUInt16LE(0x031e, 4);
    cdh.writeUInt16LE(20, 6);
    cdh.writeUInt16LE(0, 8);
    cdh.writeUInt16LE(0, 10);
    cdh.writeUInt16LE(0, 12);
    cdh.writeUInt16LE(0x21, 14);
    cdh.writeUInt32LE(dataCrc, 16);
    cdh.writeUInt32LE(entry.data.length, 20);
    cdh.writeUInt32LE(entry.data.length, 24);
    cdh.writeUInt16LE(nameBytes.length, 28);
    cdh.writeUInt16LE(0, 30);
    cdh.writeUInt16LE(0, 32);
    cdh.writeUInt16LE(0, 34);
    cdh.writeUInt16LE(0, 36);
    const unixMode = entry.unixMode ?? 0o100644;
    cdh.writeUInt32LE((unixMode << 16) >>> 0, 38);
    cdh.writeUInt32LE(localOffset, 42);

    centralChunks.push(cdh, nameBytes);
  }

  const central = Buffer.concat(centralChunks);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(central.length, 12);
  eocd.writeUInt32LE(offset, 16);
  eocd.writeUInt16LE(0, 20);

  return Buffer.concat([...localChunks, central, eocd]);
}

/**
 * Build a synthetic delve Windows zip. Stored-mode (no deflate) so the
 * implementation is fully in-process without adding a zip-encoder dep.
 */
export async function buildFakeDelveZip(platformKey: string, destDir: string): Promise<BuiltArchive> {
  const archivePath = path.join(destDir, `dlv_${platformKey}.zip`);
  const buf = buildStoredZip([
    {
      name: 'dlv.exe',
      data: Buffer.from(`synthetic dlv.exe for ${platformKey}\n`, 'utf8'),
      unixMode: 0o100755,
    },
  ]);
  await fs.writeFile(archivePath, buf);
  const sha256 = await hashFile(archivePath);
  return {
    path: archivePath,
    sha256,
    cleanup: async () => {
      await fs.rm(archivePath, { force: true });
    },
  };
}

export const FAKE_CODELLDB_RUNTIME_PATHS = [
  'extension/adapter/codelldb',
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

export interface FakeCodeLldbVsixOptions {
  readonly omit?: string;
}

/** Build a synthetic macOS arm64 CodeLLDB VSIX with the gate-approved retained tree. */
export async function buildFakeCodeLldbVsix(
  version: string,
  destDir: string,
  options: FakeCodeLldbVsixOptions = {},
): Promise<BuiltArchive> {
  const contents: Readonly<Record<(typeof FAKE_CODELLDB_RUNTIME_PATHS)[number], string>> = {
    'extension/adapter/codelldb': '#!/bin/sh\necho synthetic codelldb\n',
    'extension/adapter/scripts/codelldb/__init__.py': '# synthetic adapter script\n',
    'extension/lldb/bin/lldb': '#!/bin/sh\necho synthetic lldb\n',
    'extension/lldb/bin/lldb-argdumper': '#!/bin/sh\necho synthetic lldb-argdumper\n',
    'extension/lldb/bin/lldb-server': '#!/bin/sh\necho synthetic lldb-server\n',
    'extension/lldb/lib/liblldb.dylib': 'synthetic liblldb\n',
    'extension/lldb/lib/libpython312.dylib': 'synthetic libpython\n',
    'extension/lldb/lib/python3.12/os.py': '# synthetic bundled python\n',
    'extension/lang_support/rust.py': '# synthetic rust formatter\n',
    'extension/package.json': `{"name":"vscode-lldb","version":"${version}"}\n`,
  };
  const entries = FAKE_CODELLDB_RUNTIME_PATHS
    .filter(runtimePath => runtimePath !== options.omit)
    .map(runtimePath => ({
      name: runtimePath,
      data: Buffer.from(contents[runtimePath], 'utf8'),
      unixMode: runtimePath === 'extension/adapter/codelldb' || runtimePath.startsWith('extension/lldb/bin/')
        ? 0o100755
        : 0o100644,
    }));
  const archivePath = path.join(destDir, 'codelldb-darwin-arm64.vsix');
  await fs.writeFile(archivePath, buildStoredZip(entries));
  const sha256 = await hashFile(archivePath);
  return {
    path: archivePath,
    sha256,
    cleanup: async () => {
      await fs.rm(archivePath, { force: true });
    },
  };
}
