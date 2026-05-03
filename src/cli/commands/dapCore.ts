import path from 'node:path';
import type { Command } from 'commander';
import { usageError } from '../errors.js';
import { createControllerClient } from '../../controller/client.js';
import type { AdapterDescriptor } from '../../adapters/descriptor.js';
import { loadAdapterConfig } from '../../adapters/config.js';
import { AdapterRegistry } from '../../adapters/registry.js';
import { loadVSCodeLaunchConfig, mapDebugpyFlags, mapJsDebugFlags, resolveAdapterIdFromType, resolveLaunchConfig } from '../../config/launchConfig.js';
import { type JsonWritable, writeJsonSuccess } from '../output.js';

interface DapStartCommandOptions {
  adapter?: string;
  config?: string;
  json?: string;
  script?: string;
  name?: string;
  use?: boolean;
  program?: string;
  cwd?: string;
  runtimeExecutable?: string;
  runtimeArgs?: string[];
  url?: string;
  port?: string;
  python?: string;
  type?: string;
  args?: string[];
  sourceMaps?: string;
  outFiles?: string[];
}

interface DapRequestCommandOptions {
  json?: string;
  name?: string;
}

interface DapCapabilitiesCommandOptions {
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
    .description('Start a DAP launch session using an adapter id, named launch config, or fake adapter')
    .option('--adapter <adapter>', 'adapter id')
    .option('--config <name>', 'named .vscode/launch.json configuration')
    .option('--json <json>', 'raw adapter-native launch configuration JSON', '{}')
    .option('--script <script>', 'fake adapter script', 'stopped-on-entry')
    .option('--name <name>', 'session name', 'default')
    .option('--program <path>', 'program path override')
    .option('--cwd <path>', 'working directory override')
    .option('--runtime-executable <path>', 'runtime executable override')
    .option('--runtime-args <arg...>', 'runtime argument overrides')
    .option('--url <url>', 'URL override for browser adapters')
    .option('--port <port>', 'debug port override')
    .option('--python <path>', 'Python executable override')
    .option('--type <type>', 'adapter-native debug type override')
    .option('--args <arg...>', 'program argument overrides')
    .option('--source-maps <boolean>', 'source map enablement override')
    .option('--out-files <pattern...>', 'source map output file patterns')
    .option('--no-use', 'do not make the new session active')
    .action(async (options: DapStartCommandOptions) => {
      await startDap(stdout, 'launch', options);
    });

  program
    .command('attach')
    .description('Start a DAP attach session using an adapter id, named launch config, or fake adapter')
    .option('--adapter <adapter>', 'adapter id')
    .option('--config <name>', 'named .vscode/launch.json configuration')
    .option('--json <json>', 'raw adapter-native attach configuration JSON', '{}')
    .option('--script <script>', 'fake adapter script', 'attach-stopped')
    .option('--name <name>', 'session name', 'default')
    .option('--program <path>', 'program path override')
    .option('--cwd <path>', 'working directory override')
    .option('--runtime-executable <path>', 'runtime executable override')
    .option('--runtime-args <arg...>', 'runtime argument overrides')
    .option('--url <url>', 'URL override for browser adapters')
    .option('--port <port>', 'debug port override')
    .option('--python <path>', 'Python executable override')
    .option('--type <type>', 'adapter-native debug type override')
    .option('--args <arg...>', 'program argument overrides')
    .option('--source-maps <boolean>', 'source map enablement override')
    .option('--out-files <pattern...>', 'source map output file patterns')
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
    .command('capabilities')
    .option('--name <name>', 'session name or id')
    .description('Return adapter capabilities for a fake/custom session')
    .action(async (options: DapCapabilitiesCommandOptions) => {
      await withController(stdout, 'capabilities', async client => client.request('dap.capabilities', createNameParams(options.name)));
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

function createNameParams(name: string | undefined): { name?: string } {
  return name === undefined ? {} : { name };
}

async function startDap(stdout: JsonWritable, mode: 'launch' | 'attach', options: DapStartCommandOptions): Promise<void> {
  const namedConfig = await resolveNamedConfig(options.config);
  const jsonConfig = parseJsonRecordOption(options.json ?? '{}');
  const adapterConfig = await loadAdapterConfig(process.env.DAP_CLI_HOME);
  const adapterId = resolveAdapterId(options.adapter, namedConfig, adapterConfig.launchConfigTypeMap);
  const adapterFlags = mapFlagsForAdapter(adapterId, collectFlagOverrides(options));
  const adapterDefaults = getAdapterDefaults(adapterConfig, adapterId, mode);
  const config = {
    ...resolveLaunchConfig({ namedConfig: { ...adapterDefaults, ...namedConfig }, jsonConfig, flags: adapterFlags }),
    request: mode,
  };
  const descriptor = adapterId === 'fake'
    ? createFakeDescriptor(options.script ?? (mode === 'attach' ? 'attach-stopped' : 'stopped-on-entry'))
    : new AdapterRegistry({ config: adapterConfig }).resolve(adapterId);

  await withController(stdout, mode, async client => client.request('dap.start', {
    mode,
    name: options.name ?? 'default',
    use: options.use !== false,
    descriptor,
    config,
  }));
}

function getAdapterDefaults(adapterConfig: Awaited<ReturnType<typeof loadAdapterConfig>>, adapterId: string, mode: 'launch' | 'attach'): Record<string, unknown> {
  const configuredAdapter = adapterConfig.adapters?.[adapterId];
  const defaults = mode === 'launch' ? configuredAdapter?.launchDefaults : configuredAdapter?.attachDefaults;
  return defaults ?? {};
}

async function resolveNamedConfig(name: string | undefined): Promise<Record<string, unknown> | undefined> {
  if (name === undefined) {
    return undefined;
  }

  const configurations = await loadVSCodeLaunchConfig(process.cwd());
  const config = configurations.find(candidate => candidate.name === name);
  if (config === undefined) {
    throw usageError(`Launch configuration '${name}' was not found.`, {
      code: 'launch_config_not_found',
      diagnostics: [`No .vscode/launch.json configuration named '${name}' was found in ${process.cwd()}.`],
    });
  }

  return config;
}

function resolveAdapterId(adapter: string | undefined, namedConfig: Record<string, unknown> | undefined, customTypeMap: Record<string, string> | undefined): string {
  if (adapter !== undefined) {
    return adapter;
  }

  if (namedConfig !== undefined) {
    const type = namedConfig.type;
    if (typeof type !== 'string') {
      throw usageError('Named launch configuration is missing a string type.', { code: 'unknown_launch_type' });
    }

    return resolveAdapterIdFromType(type, customTypeMap);
  }

  return 'fake';
}

function collectFlagOverrides(options: DapStartCommandOptions): Record<string, unknown> {
  const flags: Record<string, unknown> = {};
  setIfDefined(flags, 'program', options.program);
  setIfDefined(flags, 'cwd', options.cwd);
  setIfDefined(flags, 'runtimeExecutable', options.runtimeExecutable);
  setIfDefined(flags, 'runtimeArgs', options.runtimeArgs);
  setIfDefined(flags, 'url', options.url);
  setIfDefined(flags, 'python', options.python);
  setIfDefined(flags, 'type', options.type);
  setIfDefined(flags, 'args', options.args);
  setIfDefined(flags, 'outFiles', options.outFiles);
  if (options.sourceMaps !== undefined) {
    flags.sourceMaps = parseBooleanOption(options.sourceMaps, 'source-maps');
  }
  if (options.port !== undefined) {
    flags.port = parseOptionalInteger(options.port, 'port');
  }

  return flags;
}

function mapFlagsForAdapter(adapterId: string, flags: Record<string, unknown>): Record<string, unknown> {
  if (adapterId === 'js-debug') {
    return mapJsDebugFlags(flags);
  }
  if (adapterId === 'debugpy') {
    return mapDebugpyFlags(flags);
  }

  return flags;
}

function setIfDefined(target: Record<string, unknown>, key: string, value: unknown): void {
  if (value !== undefined) {
    target[key] = value;
  }
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

function parseJsonRecordOption(value: string): Record<string, unknown> {
  const parsed = parseJsonOption(value);
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw usageError('JSON argument must be an object.', { code: 'invalid_json' });
  }

  return parsed as Record<string, unknown>;
}

function parseOptionalInteger(value: string | undefined, optionName: string): number | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (!/^\d+$/.test(value)) {
    throw usageError(`Invalid --${optionName} value.`, { code: 'invalid_number' });
  }

  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) {
    throw usageError(`Invalid --${optionName} value.`, { code: 'invalid_number' });
  }

  return parsed;
}

function parseBooleanOption(value: string, optionName: string): boolean {
  if (value === 'true') {
    return true;
  }
  if (value === 'false') {
    return false;
  }

  throw usageError(`Invalid --${optionName} value.`, { code: 'invalid_boolean' });
}
