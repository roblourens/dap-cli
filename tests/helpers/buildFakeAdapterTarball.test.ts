import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import {
  buildFakeDelveTarGz,
  buildFakeDelveZip,
  buildFakeJsDebugTarball,
} from './buildFakeAdapterTarball.js';
import { extractTarGz } from '../../src/adapters/provision/extractTarGz.js';
import { extractZip } from '../../src/adapters/provision/extractZip.js';

describe('buildFakeAdapterTarball', () => {
  let workDir: string;

  beforeEach(async () => {
    workDir = await fs.mkdtemp(path.join(os.tmpdir(), 'fake-adapter-archives-'));
  });

  afterEach(async () => {
    await fs.rm(workDir, { recursive: true, force: true });
  });

  test('js-debug tarball extracts via project extractTarGz (strip:1)', async () => {
    const archive = await buildFakeJsDebugTarball('1.117.0', workDir);
    try {
      const dest = path.join(workDir, 'extracted-js-debug');
      await fs.mkdir(dest, { recursive: true });
      await extractTarGz(archive.path, dest, { strip: 1 });

      const dapServer = await fs.readFile(path.join(dest, 'src', 'dapDebugServer.js'), 'utf8');
      expect(dapServer).toContain('synthetic dapDebugServer');
      const bootloader = await fs.readFile(path.join(dest, 'src', 'bootloader.js'), 'utf8');
      expect(bootloader).toContain('synthetic bootloader');
      const pkg = await fs.readFile(path.join(dest, 'package.json'), 'utf8');
      expect(pkg).toContain('"vscode-js-debug"');
      expect(archive.sha256).toMatch(/^[0-9a-f]{64}$/);
    } finally {
      await archive.cleanup();
    }
  });

  test('delve tar.gz extracts a flat dlv binary', async () => {
    const archive = await buildFakeDelveTarGz('darwin_arm64', workDir);
    try {
      const dest = path.join(workDir, 'extracted-delve');
      await fs.mkdir(dest, { recursive: true });
      await extractTarGz(archive.path, dest);

      const dlv = await fs.readFile(path.join(dest, 'dlv'), 'utf8');
      expect(dlv).toContain('synthetic dlv for darwin_arm64');
      expect(archive.sha256).toMatch(/^[0-9a-f]{64}$/);
    } finally {
      await archive.cleanup();
    }
  });

  test('delve zip extracts a flat dlv.exe binary', async () => {
    const archive = await buildFakeDelveZip('windows_amd64', workDir);
    try {
      const dest = path.join(workDir, 'extracted-delve-win');
      await fs.mkdir(dest, { recursive: true });
      await extractZip(archive.path, dest);

      const dlv = await fs.readFile(path.join(dest, 'dlv.exe'), 'utf8');
      expect(dlv).toContain('synthetic dlv.exe for windows_amd64');
      expect(archive.sha256).toMatch(/^[0-9a-f]{64}$/);
    } finally {
      await archive.cleanup();
    }
  });
});
