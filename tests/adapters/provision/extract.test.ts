import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { crc32 } from 'node:zlib';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import * as tar from 'tar';
import { extractTarGz } from '../../../src/adapters/provision/extractTarGz.js';
import { extractZip } from '../../../src/adapters/provision/extractZip.js';
import { CliError } from '../../../src/cli/errors.js';

interface ZipEntry {
  name: string;
  data: Buffer;
  /** Upper 16 bits of external attributes = POSIX mode. */
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

async function listTree(dir: string): Promise<string[]> {
  const out: string[] = [];
  async function walk(current: string, rel: string): Promise<void> {
    const entries = await fs.readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      const relPath = rel === '' ? entry.name : `${rel}/${entry.name}`;
      if (entry.isDirectory()) {
        await walk(path.join(current, entry.name), relPath);
      } else {
        out.push(relPath);
      }
    }
  }
  await walk(dir, '');
  return out.sort();
}

describe('extractTarGz', () => {
  let workDir: string;

  beforeEach(async () => {
    workDir = await fs.mkdtemp(path.join(os.tmpdir(), 'dap-cli-extract-tar-'));
  });

  afterEach(async () => {
    await fs.rm(workDir, { recursive: true, force: true });
  });

  test('extracts a multi-file tar.gz preserving layout', async () => {
    const sourceDir = path.join(workDir, 'src');
    await fs.mkdir(path.join(sourceDir, 'nested'), { recursive: true });
    await fs.writeFile(path.join(sourceDir, 'root.txt'), 'root');
    await fs.writeFile(path.join(sourceDir, 'nested', 'inner.txt'), 'inner');

    const archive = path.join(workDir, 'a.tar.gz');
    await tar.c({ gzip: true, cwd: sourceDir, file: archive }, ['.']);

    const dest = path.join(workDir, 'dest');
    await fs.mkdir(dest);
    await extractTarGz(archive, dest);

    expect(await listTree(dest)).toEqual(['nested/inner.txt', 'root.txt']);
    expect(await fs.readFile(path.join(dest, 'nested', 'inner.txt'), 'utf8')).toBe('inner');
  });

  test('strip: 1 drops the leading path component', async () => {
    const sourceParent = path.join(workDir, 'parent');
    const topLevel = path.join(sourceParent, 'js-debug');
    await fs.mkdir(topLevel, { recursive: true });
    await fs.writeFile(path.join(topLevel, 'a.js'), 'a');
    await fs.mkdir(path.join(topLevel, 'src'), { recursive: true });
    await fs.writeFile(path.join(topLevel, 'src', 'b.js'), 'b');

    const archive = path.join(workDir, 'p.tar.gz');
    await tar.c({ gzip: true, cwd: sourceParent, file: archive }, ['js-debug']);

    const dest = path.join(workDir, 'dest');
    await fs.mkdir(dest);
    await extractTarGz(archive, dest, { strip: 1 });

    expect(await listTree(dest)).toEqual(['a.js', 'src/b.js']);
  });

  test('rejects truncated archive', async () => {
    const sourceDir = path.join(workDir, 'src');
    await fs.mkdir(sourceDir);
    await fs.writeFile(path.join(sourceDir, 'x.txt'), 'x'.repeat(1024));

    const archive = path.join(workDir, 't.tar.gz');
    await tar.c({ gzip: true, cwd: sourceDir, file: archive }, ['.']);

    const full = await fs.readFile(archive);
    await fs.writeFile(archive, full.subarray(0, Math.max(10, full.length - 20)));

    const dest = path.join(workDir, 'dest');
    await fs.mkdir(dest);
    await expect(extractTarGz(archive, dest)).rejects.toMatchObject({
      code: 'provision_extract_failed',
    });
  });
});

describe('extractZip', () => {
  let workDir: string;

  beforeEach(async () => {
    workDir = await fs.mkdtemp(path.join(os.tmpdir(), 'dap-cli-extract-zip-'));
  });

  afterEach(async () => {
    await fs.rm(workDir, { recursive: true, force: true });
  });

  test('extracts a multi-file zip with directories', async () => {
    const buf = buildStoredZip([
      { name: 'top.txt', data: Buffer.from('top') },
      { name: 'sub/', data: Buffer.alloc(0) },
      { name: 'sub/inner.txt', data: Buffer.from('inner') },
    ]);
    const archive = path.join(workDir, 'ok.zip');
    await fs.writeFile(archive, buf);

    const dest = path.join(workDir, 'dest');
    await extractZip(archive, dest);

    expect(await listTree(dest)).toEqual(['sub/inner.txt', 'top.txt']);
    expect(await fs.readFile(path.join(dest, 'sub', 'inner.txt'), 'utf8')).toBe('inner');
  });

  test('rejects zip-slip ../etc entries', async () => {
    const buf = buildStoredZip([
      { name: '../etc/passwd', data: Buffer.from('evil') },
    ]);
    const archive = path.join(workDir, 'evil.zip');
    await fs.writeFile(archive, buf);

    const dest = path.join(workDir, 'dest');
    const error = await extractZip(archive, dest).catch((err: unknown) => err);
    expect(error).toBeInstanceOf(CliError);
    expect((error as CliError).code).toBe('provision_extract_failed');
    expect((error as CliError).diagnostics.join('\n')).toContain('../etc/passwd');

    // Confirm no escape happened.
    await expect(fs.access(path.join(workDir, 'etc', 'passwd'))).rejects.toThrow();
  });

  test('rejects absolute-path entries', async () => {
    const buf = buildStoredZip([
      { name: '/etc/passwd', data: Buffer.from('evil') },
    ]);
    const archive = path.join(workDir, 'abs.zip');
    await fs.writeFile(archive, buf);

    const dest = path.join(workDir, 'dest');
    const error = await extractZip(archive, dest).catch((err: unknown) => err);
    expect(error).toBeInstanceOf(CliError);
    expect((error as CliError).code).toBe('provision_extract_failed');
  });

  test('rejects Windows drive-letter absolute paths', async () => {
    const buf = buildStoredZip([
      { name: 'C:\\Windows\\System32\\evil.dll', data: Buffer.from('evil') },
    ]);
    const archive = path.join(workDir, 'drive.zip');
    await fs.writeFile(archive, buf);

    const dest = path.join(workDir, 'dest');
    await expect(extractZip(archive, dest)).rejects.toMatchObject({
      code: 'provision_extract_failed',
    });
  });

  test('rejects symlink entries (POSIX mode 0o120000 in external attrs)', async () => {
    const buf = buildStoredZip([
      { name: 'link', data: Buffer.from('../target'), unixMode: 0o120777 },
    ]);
    const archive = path.join(workDir, 'sym.zip');
    await fs.writeFile(archive, buf);

    const dest = path.join(workDir, 'dest');
    await expect(extractZip(archive, dest)).rejects.toMatchObject({
      code: 'provision_extract_failed',
    });
  });

  test('rejects corrupt zip', async () => {
    const archive = path.join(workDir, 'junk.zip');
    await fs.writeFile(archive, Buffer.from('not a zip'));

    const dest = path.join(workDir, 'dest');
    await expect(extractZip(archive, dest)).rejects.toMatchObject({
      code: 'provision_extract_failed',
    });
  });
});
