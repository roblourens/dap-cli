import { promises as fs } from 'node:fs';
import path from 'node:path';
import { describe, expect, test } from 'vitest';
import {
  DELVE_CHECKSUMS,
  JS_DEBUG_CHECKSUMS,
} from '../../src/adapters/provision/checksums.js';

const forbiddenImportPatterns = [
  '../protocol',
  '../../protocol',
  'src/protocol',
  'protocol/dapClient',
  'adapters/processAdapter',
  'adapters/socketAdapter',
] as const;

async function findTypeScriptFiles(directory: string): Promise<string[]> {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      files.push(...await findTypeScriptFiles(entryPath));
      continue;
    }

    if (entry.isFile() && entry.name.endsWith('.ts')) {
      files.push(entryPath);
    }
  }

  return files;
}

describe('module boundaries', () => {
  test('CLI modules do not import protocol or adapter process internals', async () => {
    const cliDirectory = path.join(process.cwd(), 'src', 'cli');
    const cliFiles = await findTypeScriptFiles(cliDirectory);

    expect(cliFiles.length).toBeGreaterThan(0);

    for (const filePath of cliFiles) {
      const source = await fs.readFile(filePath, 'utf8');
      const matchingPattern = forbiddenImportPatterns.find(pattern => source.includes(pattern));

      expect(matchingPattern, `${filePath} imports forbidden boundary ${matchingPattern}`).toBeUndefined();
    }
  });

  test('protocol modules remain language-neutral', async () => {
    const protocolDirectory = path.join(process.cwd(), 'src', 'protocol');
    const protocolFiles = await findTypeScriptFiles(protocolDirectory);
    const forbiddenTerms = ['javascript', 'python', 'js-debug', 'debugpy', 'Playwright'] as const;

    for (const filePath of protocolFiles) {
      const source = await fs.readFile(filePath, 'utf8');
      const sourceLower = source.toLowerCase();
      const matchingTerm = forbiddenTerms.find(term => sourceLower.includes(term.toLowerCase()));

      expect(matchingTerm, `${filePath} contains language-specific term ${matchingTerm}`).toBeUndefined();
    }
  });

  test('Phase 1 command registration exposes polling events but no streaming event commands', async () => {
    const commandSource = await fs.readFile(path.join(process.cwd(), 'src', 'cli', 'commands', 'dapCore.ts'), 'utf8');
    const forbiddenEventCommands = ['wait', 'watch', 'stream', 'subscribe'] as const;
    const matchingCommand = forbiddenEventCommands.find(command => commandSource.includes(`.command('${command}`) || commandSource.includes(`.command("${command}`));

    expect(matchingCommand).toBeUndefined();
  });

  test('Phase 1 examples preserve Phase 2 debugging command preview', async () => {
    const examples = await fs.readFile(path.join(process.cwd(), '.planning', 'phases', '01-project-foundation-controller-and-dap-core', '01-CLI-EXAMPLES.md'), 'utf8');

    expect(examples).toContain('breakpoints add');
    expect(examples).toContain('stack');
    expect(examples).toContain('scopes');
    expect(examples).toContain('variables');
  });

  test('generated DAP registry remains metadata-only', async () => {
    const generatedSource = await fs.readFile(path.join(process.cwd(), 'src', 'generated', 'dapCommandRegistry.ts'), 'utf8');
    const forbiddenGeneratedImports = [
      '../cli',
      '../controller',
      '../protocol',
      '../adapters',
      '../sessions',
      '../../cli',
      '../../controller',
      '../../protocol',
      '../../adapters',
      '../../sessions',
    ] as const;
    const matchingImport = forbiddenGeneratedImports.find(pattern => generatedSource.includes(pattern));

    expect(generatedSource).toContain('dapGeneratedCommands');
    expect(generatedSource).toContain('DapGeneratedArgumentValidation');
    expect(generatedSource).not.toContain('createControllerClient');
    expect(generatedSource).not.toContain('validateGeneratedDapArguments');
    expect(generatedSource).not.toContain('usageError');
    expect(matchingImport, `generated registry imports runtime boundary ${matchingImport}`).toBeUndefined();
  });

  test('generated DAP command behavior lives in CLI command modules', async () => {
    const generatedCommandSource = await fs.readFile(path.join(process.cwd(), 'src', 'cli', 'commands', 'dapGenerated.ts'), 'utf8');

    expect(generatedCommandSource).toContain('registerGeneratedDapCommands');
    expect(generatedCommandSource).toContain('validateGeneratedDapArguments');
    expect(generatedCommandSource).toContain("client.request('dap.request'");
  });

  test('DAP command generator uses official protocol schema metadata', async () => {
    const generatorSource = await fs.readFile(path.join(process.cwd(), 'src', 'generator', 'dapCommandRegistryGenerator.ts'), 'utf8');

    expect(generatorSource).toContain('https://microsoft.github.io/debug-adapter-protocol/debugAdapterProtocol.json');
    expect(generatorSource).toContain('extractCommands');
  });

  // -------------------------------------------------------------------------
  // Phase 21-04: lock in D-10, D-11, D-15, D-21.
  // These tests are the contract that future maintainers cannot accidentally
  // regress the failure surface of adapter provisioning.
  // -------------------------------------------------------------------------

  test('D-10: provisioning module lives under src/adapters/provision/ (not scripts/)', async () => {
    const provisionDir = path.join(process.cwd(), 'src', 'adapters', 'provision');
    // Must exist.
    const stat = await fs.stat(provisionDir);
    expect(stat.isDirectory()).toBe(true);

    // Required modules must be present.
    for (const required of ['atomicInstall.ts', 'http.ts', 'lock.ts', 'checksums.ts']) {
      await fs.access(path.join(provisionDir, required));
    }

    // scripts/ must NOT re-implement the provisioning surface.
    // Setup scripts may import these from src/adapters/provision/, but they
    // must not declare their own copies (this catches accidental forks).
    const scriptFiles = await findTypeScriptFiles(path.join(process.cwd(), 'scripts'));
    const forbiddenDeclarations = [
      /\bexport\s+(?:async\s+)?function\s+atomicInstall\b/,
      /\bexport\s+(?:async\s+)?function\s+downloadToFile\b/,
      /\bexport\s+(?:async\s+)?function\s+withAdapterLock\b/,
      /\bexport\s+(?:async\s+)?function\s+extractTarGz\b/,
      /\bexport\s+(?:async\s+)?function\s+extractZip\b/,
    ];
    for (const file of scriptFiles) {
      const source = await fs.readFile(file, 'utf8');
      for (const pattern of forbiddenDeclarations) {
        expect(
          pattern.test(source),
          `${file} re-declares a provisioning function — provisioning must live only in src/adapters/provision/`,
        ).toBe(false);
      }
    }
  });

  test('D-11: no shell-out to tar/unzip/gzip in src/ or scripts/', async () => {
    // Pinned JS libraries (tar@7, yauzl@3) handle extraction in-process so the
    // sandbox doesn't depend on a host `tar` or `unzip`. Spawning those tools
    // would silently change the trust surface (system tar versions vary widely)
    // and break Windows where they aren't always present.
    const shellOutPattern =
      /\b(?:spawn|spawnSync|exec|execSync|execFile|execFileSync)\s*\(\s*['"`](?:tar|unzip|gzip|gunzip)['"`]/;

    const dirs = [
      path.join(process.cwd(), 'src'),
      path.join(process.cwd(), 'scripts'),
    ];
    for (const dir of dirs) {
      const files = await findTypeScriptFiles(dir);
      for (const file of files) {
        // Skip test fixtures and the architecture test itself (which contains
        // the regex literal for documentation purposes).
        if (file.endsWith('.test.ts')) {
          continue;
        }
        const source = await fs.readFile(file, 'utf8');
        const match = shellOutPattern.exec(source);
        expect(
          match,
          `${file} shells out to ${match?.[0]} — D-11 forbids spawning host tar/unzip/gzip.`,
        ).toBeNull();
      }
    }
  });

  test('D-15: every error code thrown from src/adapters/provision/ is provision_-prefixed', async () => {
    const provisionFiles = await findTypeScriptFiles(path.join(process.cwd(), 'src', 'adapters', 'provision'));
    expect(provisionFiles.length).toBeGreaterThan(0);

    const codePattern = /code:\s*['"`]([A-Za-z0-9_]+)['"`]/g;

    for (const file of provisionFiles) {
      const source = await fs.readFile(file, 'utf8');
      // Strip line and block comments so a doc reference to a non-provision_
      // code doesn't trip the gate.
      const sourceNoComments = source
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/(^|[^:])\/\/[^\n]*/g, '$1');
      for (const match of sourceNoComments.matchAll(codePattern)) {
        const code = match[1];
        if (code === undefined) {
          continue;
        }
        expect(
          code.startsWith('provision_'),
          `${file} uses non-provision_ code "${code}" — D-15 requires every error in src/adapters/provision/ to be provision_*`,
        ).toBe(true);
      }
    }
  });

  test('D-21: every embedded SHA-256 checksum is a real 64-char lowercase hex digest', async () => {
    const hex64 = /^[a-f0-9]{64}$/;
    const placeholderPattern = /^(?:0+|f+)$/i;

    const allChecksums: Array<{ where: string; value: string }> = [];
    for (const [version, value] of Object.entries(JS_DEBUG_CHECKSUMS)) {
      allChecksums.push({ where: `js-debug ${version}`, value });
    }
    for (const [version, platforms] of Object.entries(DELVE_CHECKSUMS)) {
      for (const [platform, value] of Object.entries(platforms)) {
        allChecksums.push({ where: `delve ${version} ${platform}`, value });
      }
    }

    expect(allChecksums.length).toBeGreaterThan(0);

    for (const { where, value } of allChecksums) {
      expect(
        hex64.test(value),
        `${where}: "${value}" is not a 64-char lowercase hex SHA-256 — D-21 forbids placeholders.`,
      ).toBe(true);
      // Defense in depth: even if a placeholder happens to be 64 chars,
      // reject obvious patterns like all-zeros or all-f's.
      expect(
        placeholderPattern.test(value),
        `${where}: "${value}" looks like a placeholder (all 0s or all fs) — D-21 requires real digests.`,
      ).toBe(false);
    }
  });
});
