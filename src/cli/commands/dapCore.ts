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
  stopOnEntry?: boolean;
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
  include?: string;
  exclude?: string;
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
    .option('--stop-on-entry', 'halt at the first program statement (adapter must support stopOnEntry)')
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
    .option('--stop-on-entry', 'halt at the first program statement (adapter must support stopOnEntry)')
    .option('--no-use', 'do not make the new session active')
    .action(async (options: DapStartCommandOptions) => {
      await startDap(stdout, 'attach', options);
    });

  program
    .command('request')
    .argument('<command>', 'DAP request command')
    .option('--json <json>', 'request arguments as JSON', '{}')
    .option('--name <name>', 'session name or id')
    .description('Send raw DAP request with JSON arguments (escape hatch)')
    .addHelpText('after', `

Examples:
  $ dap-cli request threads
  $ dap-cli request stackTrace --json '{"threadId":1}'
`)
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
    .option('--include <names>', 'comma-separated event names to include (applied before --limit)')
    .option('--exclude <names>', 'comma-separated event names to exclude (applied before --limit)')
    .description('Poll recent DAP events with cursor-based pagination')
    .addHelpText('after', `

Examples:
  $ dap-cli events
  $ dap-cli events --after-cursor 12 --limit 25
  $ dap-cli events --limit 50 --exclude loadedSource
  $ dap-cli events --include stopped,thread,output
`)
    .action(async (options: DapEventsCommandOptions) => {
      await runEventsCommand(stdout, options);
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
    ? createFakeDescriptor(options.script ?? (mode === 'attach' ? 'attach-stopped' : 'stopped-on-entry'), mode)
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
  setIfDefined(flags, 'stopOnEntry', options.stopOnEntry);
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

function createFakeDescriptor(script: string, mode: 'launch' | 'attach'): AdapterDescriptor {
  return {
    id: 'fake',
    label: 'Generic fake adapter',
    transport: {
      kind: 'stdio',
      command: process.execPath,
      args: ['--experimental-strip-types', path.join(process.cwd(), 'tests', 'fixtures', 'fake-adapter-entry.ts'), '--script', script, '--mode', mode],
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

// Plan 05-18 (gap H-2): cap each filter list to prevent unbounded set growth
// from a malicious or accidental command line (T-05-18-02).
const eventFilterMaxEntries = 50;

interface EventsRecentResponse {
  sessionId: string;
  name: string;
  events: Array<Record<string, unknown> & { event: string }>;
  cursor: number;
  dropped: number;
  capacity?: number;
  capacityByPriority?: { high: number; low: number };
  truncatedToCapacity?: number;
}

interface EventsCommandData extends EventsRecentResponse {
  warnings?: string[];
}

function parseEventNameList(raw: string | undefined, optionName: string): ReadonlySet<string> | undefined {
  if (raw === undefined) {
    return undefined;
  }
  const names = raw.split(',').map(name => name.trim()).filter(name => name.length > 0);
  if (names.length === 0) {
    return undefined;
  }
  if (names.length > eventFilterMaxEntries) {
    throw usageError(`Too many entries in --${optionName} (max ${eventFilterMaxEntries}).`, { code: 'invalid_filter' });
  }
  return new Set(names);
}

async function runEventsCommand(stdout: JsonWritable, options: DapEventsCommandOptions): Promise<void> {
  const include = parseEventNameList(options.include, 'include');
  const exclude = parseEventNameList(options.exclude, 'exclude');
  const hasFilter = include !== undefined || exclude !== undefined;
  const limit = parseOptionalInteger(options.limit, 'limit');
  const afterCursor = parseOptionalInteger(options.afterCursor, 'after-cursor');

  // Plan 05-18 (gap H-2): if a filter is active, fetch the full snapshot so
  // the filter is applied BEFORE the limit. Otherwise pass --limit through to
  // the cache so it can compute `truncatedToCapacity` itself.
  const requestParams: { name?: string; afterCursor?: number; limit?: number } = {};
  if (options.name !== undefined) {
    requestParams.name = options.name;
  }
  if (afterCursor !== undefined) {
    requestParams.afterCursor = afterCursor;
  }
  if (limit !== undefined && !hasFilter) {
    requestParams.limit = limit;
  }

  await withController(stdout, 'events', async client => {
    const response = await client.request<EventsRecentResponse>('events.recent', requestParams);
    let events = response.events;
    if (include !== undefined) {
      events = events.filter(e => include.has(e.event));
    }
    if (exclude !== undefined) {
      events = events.filter(e => !exclude.has(e.event));
    }
    if (limit !== undefined && hasFilter) {
      events = events.slice(-limit);
    }

    const data: EventsCommandData = { ...response, events };

    // Plan 05-18 (gap H-2): honest warning when the user's --limit exceeds
    // what the cache can hold. Surfaces alongside `truncatedToCapacity`.
    if (limit !== undefined && response.capacity !== undefined && limit > response.capacity) {
      data.warnings = [`limit_exceeded_capacity: ${limit} requested, ${response.capacity} available`];
      // When --include/--exclude is active we did NOT pass `limit` to the
      // server, so the server didn't set truncatedToCapacity. Set it here so
      // the field is consistent with the warning.
      if (data.truncatedToCapacity === undefined) {
        data.truncatedToCapacity = response.capacity;
      }
    }

    return data;
  });
}
