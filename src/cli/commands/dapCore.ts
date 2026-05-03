import path from 'node:path';
import type { Command } from 'commander';
import { usageError } from '../errors.js';
import { createControllerClient } from '../../controller/client.js';
import type { AdapterDescriptor } from '../../adapters/descriptor.js';
import { type JsonWritable, writeJsonSuccess } from '../output.js';

interface DapStartCommandOptions {
  adapter?: string;
  script?: string;
  name?: string;
  use?: boolean;
}

interface DapRequestCommandOptions {
  json?: string;
  name?: string;
}

interface DapEventsCommandOptions {
  name?: string;
  afterCursor?: string;
  limit?: string;
}

export function registerDapCoreCommands(program: Command, stdout: JsonWritable): void {
  program
    .command('launch')
    .description('Start an experimental generic fake-adapter launch session')
    .option('--adapter <adapter>', 'adapter id', 'fake')
    .option('--script <script>', 'fake adapter script', 'stopped-on-entry')
    .option('--name <name>', 'session name', 'default')
    .option('--no-use', 'do not make the new session active')
    .action(async (options: DapStartCommandOptions) => {
      await startDap(stdout, 'launch', options);
    });

  program
    .command('attach')
    .description('Start an experimental generic fake-adapter attach session')
    .option('--adapter <adapter>', 'adapter id', 'fake')
    .option('--script <script>', 'fake adapter script', 'attach-stopped')
    .option('--name <name>', 'session name', 'default')
    .option('--no-use', 'do not make the new session active')
    .action(async (options: DapStartCommandOptions) => {
      await startDap(stdout, 'attach', options);
    });

  program
    .command('request')
    .argument('<command>', 'DAP request command')
    .option('--json <json>', 'request arguments as JSON', '{}')
    .option('--name <name>', 'session name or id')
    .description('Send an internal Phase 1 DAP request to a fake/custom session')
    .action(async (command: string, options: DapRequestCommandOptions) => {
      await withController(stdout, 'request', async client => client.request('dap.request', {
        command,
        args: parseJsonOption(options.json ?? '{}'),
        name: options.name,
      }));
    });

  program
    .command('events')
    .option('--name <name>', 'session name or id')
    .option('--after-cursor <cursor>', 'return events after cursor')
    .option('--limit <count>', 'maximum events to return')
    .description('List cached events for a fake/custom session')
    .action(async (options: DapEventsCommandOptions) => {
      await withController(stdout, 'events', async client => client.request('events.recent', {
        name: options.name,
        afterCursor: parseOptionalInteger(options.afterCursor, 'after-cursor'),
        limit: parseOptionalInteger(options.limit, 'limit'),
      }));
    });
}

async function startDap(stdout: JsonWritable, mode: 'launch' | 'attach', options: DapStartCommandOptions): Promise<void> {
  if (options.adapter !== undefined && options.adapter !== 'fake') {
    throw usageError('Only the generic fake adapter is available in Phase 1.', { code: 'unsupported_adapter' });
  }

  await withController(stdout, mode, async client => client.request('dap.start', {
    mode,
    name: options.name ?? 'default',
    use: options.use !== false,
    descriptor: createFakeDescriptor(options.script ?? (mode === 'attach' ? 'attach-stopped' : 'stopped-on-entry')),
  }));
}

async function withController<T>(stdout: JsonWritable, command: string, callback: (client: Awaited<ReturnType<typeof createControllerClient>>) => Promise<T>): Promise<void> {
  const client = await createControllerClient({ dapCliHome: process.env.DAP_CLI_HOME });
  try {
    writeJsonSuccess(await callback(client), { command }, stdout);
  } finally {
    await client.close();
  }
}

function createFakeDescriptor(script: string): AdapterDescriptor {
  return {
    id: 'fake',
    label: 'Generic fake adapter',
    transport: {
      kind: 'stdio',
      command: process.execPath,
      args: ['--experimental-strip-types', path.join(process.cwd(), 'tests', 'fixtures', 'fake-adapter-entry.ts'), '--script', script],
    },
  };
}

function parseJsonOption(value: string): unknown {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    throw usageError('Invalid JSON argument.', { code: 'invalid_json' });
  }
}

function parseOptionalInteger(value: string | undefined, optionName: string): number | undefined {
  if (value === undefined) {
    return undefined;
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw usageError(`Invalid --${optionName} value.`, { code: 'invalid_number' });
  }

  return parsed;
}
