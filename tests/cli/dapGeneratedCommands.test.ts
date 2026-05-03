import { describe, expect, test } from 'vitest';
import { dapGeneratedCommands } from '../../src/generated/dapCommandRegistry.js';
import { main } from '../../src/cli/main.js';

const schemaUrl = 'https://microsoft.github.io/debug-adapter-protocol/debugAdapterProtocol.json';

type JsonRecord = Record<string, unknown>;

class MemoryStream {
  public output = '';

  public write(chunk: string): boolean {
    this.output += chunk;
    return true;
  }
}

describe('generated DAP commands', () => {
  test('registry contains every official DAP request command exactly once', async () => {
    const officialCommands = await fetchOfficialRequestCommands();
    const generatedCommands = dapGeneratedCommands.map(entry => entry.command);
    const officialCommandSet = new Set<string>(officialCommands);
    const generatedCommandSet = new Set<string>(generatedCommands);
    const missing = officialCommands.filter(command => !generatedCommandSet.has(command));
    const extra = generatedCommands.filter(command => !officialCommandSet.has(command));
    const duplicates = generatedCommands.filter((command, index) => generatedCommands.indexOf(command) !== index);

    expect(officialCommands.length).toBeGreaterThan(40);
    expect(missing).toEqual([]);
    expect(extra).toEqual([]);
    expect(duplicates).toEqual([]);
  });

  test('generated command names are unique and registry order is stable', () => {
    const cliNames = dapGeneratedCommands.map(entry => entry.cliName);
    const sortedCommands = [...dapGeneratedCommands.map(entry => entry.command)].sort((left: string, right: string) => left.localeCompare(right));

    expect(new Set(cliNames).size).toBe(cliNames.length);
    expect(dapGeneratedCommands.map(entry => entry.command)).toEqual(sortedCommands);
  });

  test('registry includes representative request metadata and reverse request direction', () => {
    const representativeCommands = ['initialize', 'setBreakpoints', 'threads', 'stackTrace', 'scopes', 'variables', 'evaluate', 'source', 'continue', 'pause', 'next', 'stepIn', 'stepOut'] as const;

    for (const command of representativeCommands) {
      expect(dapGeneratedCommands.find(entry => entry.command === command), command).toBeDefined();
    }

    const stackTraceValidation = dapGeneratedCommands.find(entry => entry.command === 'stackTrace')?.validation;
    expect(stackTraceValidation?.argsRequired).toBe(true);
    expect(stackTraceValidation?.requiredProperties).toEqual(['threadId']);
    expect(stackTraceValidation?.propertyTypes).toContainEqual({ name: 'threadId', type: 'integer', required: true });
    expect(dapGeneratedCommands.find(entry => entry.command === 'runInTerminal')?.direction).toBe('adapterToClient');
    expect(dapGeneratedCommands.find(entry => entry.command === 'startDebugging')?.direction).toBe('adapterToClient');
  });

  test('validate required generated arguments before controller IPC', async () => {
    const stdout = new MemoryStream();
    const stderr = new MemoryStream();

    const exitCode = await main(['dap', 'stack-trace', '--json', '{}'], undefined, { stdout, stderr });
    const envelope = JSON.parse(stdout.output) as { ok: false; error: { code: string; category: string; exitCode: number; diagnostics: string[] } };

    expect(exitCode).toBe(2);
    expect(stderr.output).toBe('');
    expect(envelope.ok).toBe(false);
    expect(envelope.error.code).toBe('invalid_dap_arguments');
    expect(envelope.error.category).toBe('usage');
    expect(envelope.error.exitCode).toBe(2);
    expect(envelope.error.diagnostics[0]).toContain("stackTrace");
  });

  test('reject invalid generated argument primitive shapes before controller IPC', async () => {
    const stdout = new MemoryStream();
    const stderr = new MemoryStream();

    const exitCode = await main(['dap', 'continue', '--json', '{"threadId":"1"}'], undefined, { stdout, stderr });
    const envelope = JSON.parse(stdout.output) as { ok: false; error: { code: string; diagnostics: string[] } };

    expect(exitCode).toBe(2);
    expect(stderr.output).toBe('');
    expect(envelope.error.code).toBe('invalid_dap_arguments');
    expect(envelope.error.diagnostics[0]).toContain('threadId');
  });
});

async function fetchOfficialRequestCommands(): Promise<string[]> {
  const response = await fetch(schemaUrl);
  if (!response.ok) {
    throw new Error(`Failed to fetch DAP schema: ${response.status}`);
  }

  const schema = await response.json();
  if (!isRecord(schema) || !isRecord(schema.definitions)) {
    throw new Error('DAP schema definitions are missing.');
  }

  const commands: string[] = [];
  for (const [definitionName, definition] of Object.entries(schema.definitions)) {
    if (!definitionName.endsWith('Request') || !isRecord(definition)) {
      continue;
    }

    const requestBody = findRequestObjectBody(definition);
    const properties = requestBody?.properties;
    if (!isRecord(properties)) {
      continue;
    }

    const commandEnum = getUnknownArray(isRecord(properties.command) ? properties.command.enum : undefined);
    if (commandEnum === undefined) {
      continue;
    }

    const command = commandEnum[0];
    if (typeof command === 'string') {
      commands.push(command);
    }
  }

  return [...commands].sort((left: string, right: string) => left.localeCompare(right));
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null;
}

function getUnknownArray(value: unknown): unknown[] | undefined {
  return Array.isArray(value) ? value : undefined;
}

function findRequestObjectBody(definition: JsonRecord): JsonRecord | undefined {
  if (!Array.isArray(definition.allOf)) {
    return undefined;
  }

  for (const part of definition.allOf) {
    if (isRecord(part) && isRecord(part.properties)) {
      return part;
    }
  }

  return undefined;
}
