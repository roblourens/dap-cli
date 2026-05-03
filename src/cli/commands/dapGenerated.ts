import type { Command } from 'commander';
import { usageError } from '../errors.js';
import { type JsonWritable, writeJsonSuccess } from '../output.js';
import { createControllerClient } from '../../controller/client.js';
import { dapGeneratedCommands, type DapGeneratedArgumentType, type DapGeneratedArgumentValidation, type DapGeneratedCommandMetadata } from '../../generated/dapCommandRegistry.js';

export interface GeneratedDapCommandOptions {
  json?: string;
  name?: string;
}

export function registerGeneratedDapCommands(program: Command, stdout: JsonWritable): void {
  const dap = program
    .command('dap')
    .description('Send generated DAP requests by protocol command name');

  for (const metadata of dapGeneratedCommands) {
    if (metadata.direction !== 'clientToAdapter') {
      continue;
    }

    dap
      .command(metadata.cliName)
      .description(`Send DAP ${metadata.command} request`)
      .option('--json <json>', 'request arguments as JSON', '{}')
      .option('--name <name>', 'session name or id')
      .action(async (options: GeneratedDapCommandOptions) => {
        await sendGeneratedDapRequest(stdout, metadata, parseJsonOption(options.json ?? '{}'), options.name, `dap ${metadata.cliName}`);
      });
  }
}

export async function sendGeneratedDapRequest(stdout: JsonWritable, metadata: DapGeneratedCommandMetadata, args: unknown, name: string | undefined, commandLabel: string): Promise<void> {
  validateGeneratedDapArguments(metadata.validation, args, metadata.command);
  const client = await createControllerClient({ dapCliHome: process.env.DAP_CLI_HOME });
  try {
    writeJsonSuccess(await client.request('dap.request', createDapRequestParams(metadata.command, args, name)), { command: commandLabel }, stdout);
  } finally {
    await client.close();
  }
}

export function validateGeneratedDapArguments(validation: DapGeneratedArgumentValidation, args: unknown, command: string): void {
  if (!validation.argsRequired && args === undefined) {
    return;
  }

  if (!isRecord(args)) {
    throw invalidDapArguments(command, 'DAP request arguments must be a JSON object.');
  }

  for (const property of validation.requiredProperties) {
    if (!(property in args)) {
      throw invalidDapArguments(command, `Missing required DAP argument: ${property}.`);
    }
  }

  for (const property of validation.propertyTypes) {
    if (property.name in args && !isGeneratedArgumentType(args[property.name], property.type)) {
      throw invalidDapArguments(command, `Invalid DAP argument '${property.name}': expected ${property.type}.`);
    }
  }
}

export function parseJsonOption(value: string): unknown {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    throw usageError('Invalid JSON argument.', { code: 'invalid_json' });
  }
}

function createDapRequestParams(command: string, args: unknown, name: string | undefined): { command: string; args: unknown; name?: string } {
  const params: { command: string; args: unknown; name?: string } = { command, args };
  if (name !== undefined) {
    params.name = name;
  }

  return params;
}

function invalidDapArguments(command: string, message: string): Error {
  return usageError(message, {
    code: 'invalid_dap_arguments',
    diagnostics: [`Invalid arguments for DAP request '${command}': ${message}`],
  });
}

function isGeneratedArgumentType(value: unknown, type: DapGeneratedArgumentType): boolean {
  switch (type) {
    case 'array':
      return Array.isArray(value);
    case 'boolean':
      return typeof value === 'boolean';
    case 'integer':
      return Number.isInteger(value);
    case 'number':
      return typeof value === 'number' && Number.isFinite(value);
    case 'object':
      return isRecord(value) && !Array.isArray(value);
    case 'string':
      return typeof value === 'string';
    case 'unknown':
      return true;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function requireGeneratedCommand(command: string): DapGeneratedCommandMetadata {
  const metadata = dapGeneratedCommands.find(entry => entry.command === command);
  if (metadata === undefined || metadata.direction !== 'clientToAdapter') {
    throw usageError(`DAP request command '${command}' is not available as a client command.`, { code: 'unknown_dap_command' });
  }

  return metadata;
}

export function parseIntegerOption(value: string | undefined, optionName: string): number | undefined {
  if (value === undefined) {
    return undefined;
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isSafeInteger(parsed)) {
    throw usageError(`Invalid --${optionName} value.`, { code: 'invalid_number' });
  }

  return parsed;
}

export function parseRequiredIntegerOption(value: string | undefined, optionName: string): number {
  const parsed = parseIntegerOption(value, optionName);
  if (parsed === undefined) {
    throw usageError(`Missing required option: --${optionName}.`, { code: 'missing_parameter' });
  }

  return parsed;
}

export function parseIntegerValues(values: readonly string[] | undefined, optionName: string): number[] {
  if (values === undefined || values.length === 0) {
    throw usageError(`Missing required option: --${optionName}.`, { code: 'missing_parameter' });
  }

  return values.map(value => parseRequiredIntegerOption(value, optionName));
}
