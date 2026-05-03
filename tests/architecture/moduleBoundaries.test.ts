import { promises as fs } from 'node:fs';
import path from 'node:path';
import { describe, expect, test } from 'vitest';

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
});
