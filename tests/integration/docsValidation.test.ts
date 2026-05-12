import { promises as fs } from 'node:fs';
import path from 'node:path';
import { describe, expect, test } from 'vitest';
import { createProgram } from '../../src/cli/program.js';

const docsToValidate = [
  'README.md',
  'dap-cli/skills/dap-cli/references/agent-workflows.md',
  'docs/playwright-interop.md',
  'docs/adapter-setup.md',
];

interface CommandExample {
  file: string;
  line: number;
  commandPath: string;
  source: string;
}

describe('documentation command examples', () => {
  test('use registered dap-cli command names', async () => {
    const commandPaths = collectCommandPaths();
    const examples = await collectDapCliExamples(docsToValidate);

    const invalidExamples = examples.filter(example => !commandPaths.has(example.commandPath));

    expect(invalidExamples, formatInvalidExamples(invalidExamples, commandPaths)).toEqual([]);
    expect(examples.length).toBeGreaterThan(0);
  });
});

describe('Phase 16 docs (PYEVAL-02 / VERB-DOC-01 / PWDOC-01)', () => {
  test('agent-workflows.md documents Python evaluate auto-wrap', async () => {
    const content = await fs.readFile(path.join(process.cwd(), 'dap-cli/skills/dap-cli/references/agent-workflows.md'), 'utf8');
    expect(content).toContain('evaluate_requires_exec');
    expect(content).toContain('exec(');
    expect(content).toContain('debugpy');
  });

  test('agent-workflows.md documents launch-vs-attach verb selection', async () => {
    const content = await fs.readFile(path.join(process.cwd(), 'dap-cli/skills/dap-cli/references/agent-workflows.md'), 'utf8');
    expect(content).toContain('dap-cli launch');
    expect(content).toContain('dap-cli attach');
    expect(content).toMatch(/no .{0,15}--request.{0,15}flag/i);
  });

  test('playwright-interop.md documents daemon-died recovery', async () => {
    const content = await fs.readFile(path.join(process.cwd(), 'docs/playwright-interop.md'), 'utf8');
    expect(content).toContain('not open, please run open first');
    expect(content).toMatch(/pkill|kill .*playwright|killing/i);
  });
});

describe('Phase 18 docs (PAUSED-DOC-01)', () => {
  const phase18Files = [
    'dap-cli/skills/dap-cli/references/agent-workflows.md',
    'dap-cli/skills/dap-cli/SKILL.md',
    'dap-cli/skills/dap-cli/references/javascript-typescript.md',
  ];

  for (const file of phase18Files) {
    test(`${file} documents per-child paused-state union and paused-first routing`, async () => {
      const content = await fs.readFile(path.join(process.cwd(), file), 'utf8');
      expect(content).toMatch(/paused child/i);
    });
  }
});

function collectCommandPaths(): Set<string> {
  const program = createProgram();
  const paths = new Set<string>();

  for (const command of program.commands) {
    const topLevelName = command.name();
    paths.add(topLevelName);

    for (const subcommand of command.commands) {
      paths.add(`${topLevelName} ${subcommand.name()}`);
    }
  }

  return paths;
}

async function collectDapCliExamples(files: readonly string[]): Promise<CommandExample[]> {
  const examples: CommandExample[] = [];

  for (const file of files) {
    const absolutePath = path.join(process.cwd(), file);
    const content = await readOptionalFile(absolutePath);
    if (content === undefined) {
      continue;
    }

    examples.push(...extractDapCliExamples(file, content));
  }

  return examples;
}

function extractDapCliExamples(file: string, content: string): CommandExample[] {
  const examples: CommandExample[] = [];
  const lines = content.split('\n');
  let inFence = false;
  let fenceLanguage = '';
  let pendingCommand = '';
  let pendingLine = 0;

  for (const [index, line] of lines.entries()) {
    const lineNumber = index + 1;
    const fenceMatch = line.match(/^```(\S*)/);
    if (fenceMatch !== null) {
      inFence = !inFence;
      fenceLanguage = inFence ? fenceMatch[1] ?? '' : '';
      pendingCommand = '';
      pendingLine = 0;
      continue;
    }

    if (!inFence || !isShellFence(fenceLanguage)) {
      continue;
    }

    const rawLine = stripShellPrompt(line).trim();
    if (rawLine.length === 0 || rawLine.startsWith('#')) {
      continue;
    }

    const commandLine = pendingCommand.length === 0 ? rawLine : `${pendingCommand} ${rawLine}`;
    if (pendingCommand.length === 0) {
      pendingLine = lineNumber;
    }

    if (commandLine.endsWith('\\')) {
      pendingCommand = commandLine.slice(0, -1).trim();
      continue;
    }

    pendingCommand = '';
    const normalized = commandLine.replace(/\s+#.*$/, '').trim();
    const commandPath = parseDapCliCommandPath(normalized);
    if (commandPath === undefined) {
      continue;
    }

    examples.push({ file, line: pendingLine, commandPath, source: normalized });
  }

  return examples;
}

function isShellFence(language: string): boolean {
  return language === '' || language === 'bash' || language === 'sh' || language === 'shell' || language === 'console';
}

function stripShellPrompt(line: string): string {
  return line.replace(/^\s*[$>]\s+/, '');
}

function parseDapCliCommandPath(line: string): string | undefined {
  const tokens = line.split(/\s+/);
  const dapCliIndex = tokens.findIndex(token => token === 'dap-cli');
  if (dapCliIndex === -1) {
    return undefined;
  }

  const command = tokens[dapCliIndex + 1];
  if (command === undefined || command.startsWith('-')) {
    return undefined;
  }

  const maybeSubcommand = tokens[dapCliIndex + 2];
  if (command === 'breakpoints' && maybeSubcommand !== undefined && !maybeSubcommand.startsWith('-')) {
    return `${command} ${maybeSubcommand}`;
  }

  return command;
}

async function readOptionalFile(filePath: string): Promise<string | undefined> {
  try {
    return await fs.readFile(filePath, 'utf8');
  } catch (error) {
    if (isNodeError(error) && error.code === 'ENOENT') {
      return undefined;
    }

    throw error;
  }
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return typeof error === 'object' && error !== null && 'code' in error;
}

function formatInvalidExamples(invalidExamples: readonly CommandExample[], commandPaths: ReadonlySet<string>): string {
  if (invalidExamples.length === 0) {
    return '';
  }

  const knownCommands = [...commandPaths].sort().join(', ');
  const invalidLines = invalidExamples
    .map(example => `${example.file}:${example.line} uses '${example.commandPath}' in: ${example.source}`)
    .join('\n');

  return `Invalid dap-cli command examples:\n${invalidLines}\n\nKnown commands: ${knownCommands}`;
}
