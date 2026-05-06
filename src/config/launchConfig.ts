import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parse, type ParseError } from 'jsonc-parser';
import { z } from 'zod';
import { usageError } from '../cli/errors.js';

export interface LaunchConfiguration extends Record<string, unknown> {
  type: string;
  name: string;
  request?: string | undefined;
}

export interface LaunchCompound extends Record<string, unknown> {
  name: string;
  configurations: string[];
  stopAll?: boolean | undefined;
}

export interface LaunchJsonDocument {
  workspaceFolder: string;
  configurations: LaunchConfiguration[];
  compounds: LaunchCompound[];
}

export type LaunchConfigEntry =
  | { kind: 'configuration'; name: string; type: string; request?: string | undefined }
  | { kind: 'compound'; name: string; configurations: string[]; stopAll?: boolean | undefined };

export type ResolvedLaunchConfigEntry =
  | { kind: 'configuration'; configuration: LaunchConfiguration }
  | { kind: 'compound'; compound: LaunchCompound };

export interface LaunchConfigSources {
  namedConfig?: Record<string, unknown> | undefined;
  jsonConfig?: Record<string, unknown> | undefined;
  flags?: Record<string, unknown> | undefined;
}

export interface ResolveLaunchConfigurationOptions {
  workspaceFolder: string;
  platform?: NodeJS.Platform | undefined;
  env?: NodeJS.ProcessEnv | Record<string, string | undefined> | undefined;
  execPath?: string | undefined;
  userHome?: string | undefined;
}

export const launchConfigTypeMap: Record<string, string> = {
  node: 'js-debug',
  'pwa-node': 'js-debug',
  chrome: 'js-debug',
  'pwa-chrome': 'js-debug',
  python: 'debugpy',
};

const maxLaunchJsonBytes = 256 * 1024;
const platformKeys = new Set(['osx', 'mac', 'linux', 'windows']);
const vscodeOnlyLaunchConfigKeys = new Set(['presentation', 'internalConsoleOptions', 'serverReadyAction', 'preLaunchTask', 'postDebugTask']);
const launchVariablePattern = /\$\{([^}]+)\}/g;
const launchJsonSchema = z.object({
  configurations: z.array(z.object({
    type: z.string().min(1),
    name: z.string().min(1),
    request: z.string().min(1).optional(),
  }).catchall(z.unknown())).max(100).optional(),
  compounds: z.array(z.object({
    name: z.string().min(1),
    configurations: z.array(z.string().min(1)).min(1),
    stopAll: z.boolean().optional(),
  }).catchall(z.unknown())).max(100).optional(),
}).catchall(z.unknown());

export function resolveLaunchConfig(sources: LaunchConfigSources): Record<string, unknown> {
  return {
    ...sources.namedConfig,
    ...sources.jsonConfig,
    ...sources.flags,
  };
}

export function resolveLaunchConfigurationConfig(
  config: Record<string, unknown>,
  options: ResolveLaunchConfigurationOptions,
): Record<string, unknown> {
  const workspaceFolder = path.resolve(options.workspaceFolder);
  const platform = options.platform ?? process.platform;
  const merged = applyPlatformOverlay(config, platform);
  const context = {
    workspaceFolder,
    workspaceFolderBasename: path.basename(workspaceFolder),
    userHome: options.userHome ?? os.homedir(),
    execPath: options.execPath ?? process.execPath,
    env: options.env ?? process.env,
  };
  const resolved = resolveLaunchValue(merged, '$', context);
  if (!isPlainRecord(resolved)) {
    throw usageError('Invalid launch configuration.', {
      code: 'invalid_launch_config',
      diagnostics: ['Resolved launch configuration is not an object.'],
    });
  }

  for (const key of vscodeOnlyLaunchConfigKeys) {
    delete resolved[key];
  }

  return resolved;
}

export async function loadVSCodeLaunchConfig(cwd: string): Promise<LaunchConfiguration[]> {
  return (await loadVSCodeLaunchJson(cwd)).configurations;
}

export async function loadVSCodeLaunchJson(cwd: string): Promise<LaunchJsonDocument> {
  const workspaceFolder = path.resolve(cwd);
  const launchJsonPath = path.join(cwd, '.vscode', 'launch.json');

  try {
    const stat = await fs.stat(launchJsonPath);
    if (stat.size > maxLaunchJsonBytes) {
      throw usageError('Invalid launch.json.', {
        code: 'invalid_launch_json',
        diagnostics: ['.vscode/launch.json is larger than 256KB.'],
      });
    }

    const raw = await fs.readFile(launchJsonPath, 'utf8');
    const parsed = launchJsonSchema.parse(parseJsonc(raw));
    return {
      workspaceFolder,
      configurations: parsed.configurations ?? [],
      compounds: parsed.compounds ?? [],
    };
  } catch (error) {
    if (isNodeError(error) && error.code === 'ENOENT') {
      return { workspaceFolder, configurations: [], compounds: [] };
    }

    if (error instanceof SyntaxError || error instanceof z.ZodError) {
      throw usageError('Invalid launch.json.', {
        code: 'invalid_launch_json',
        diagnostics: error instanceof z.ZodError ? error.issues.map(issue => issue.message) : [error.message],
      });
    }

    throw error;
  }
}

export function listLaunchConfigEntries(document: LaunchJsonDocument): LaunchConfigEntry[] {
  return [
    ...document.configurations.map(configuration => ({
      kind: 'configuration' as const,
      name: configuration.name,
      type: configuration.type,
      request: configuration.request,
    })),
    ...document.compounds.map(compound => ({
      kind: 'compound' as const,
      name: compound.name,
      configurations: compound.configurations,
      stopAll: compound.stopAll,
    })),
  ];
}

export function resolveLaunchConfigEntry(document: LaunchJsonDocument, name: string): ResolvedLaunchConfigEntry {
  const configuration = document.configurations.find(entry => entry.name === name);
  const compound = document.compounds.find(entry => entry.name === name);

  if (configuration !== undefined && compound !== undefined) {
    const matches: LaunchConfigEntry[] = [
      { kind: 'configuration', name: configuration.name, type: configuration.type, request: configuration.request },
      { kind: 'compound', name: compound.name, configurations: compound.configurations, stopAll: compound.stopAll },
    ];
    throw usageError(`Launch configuration '${name}' is ambiguous.`, {
      code: 'launch_config_ambiguous',
      diagnostics: [`Workspace '${document.workspaceFolder}' contains both a configuration and compound named '${name}'.`],
      data: { workspaceFolder: document.workspaceFolder, name, matches },
    });
  }

  if (configuration !== undefined) {
    return { kind: 'configuration', configuration };
  }

  if (compound !== undefined) {
    return { kind: 'compound', compound };
  }

  throw usageError(`Launch configuration '${name}' was not found.`, {
    code: 'launch_config_not_found',
    diagnostics: [`Workspace '${document.workspaceFolder}' has no configuration or compound named '${name}'.`],
    data: { workspaceFolder: document.workspaceFolder, name },
  });
}

function parseJsonc(raw: string): unknown {
  const errors: ParseError[] = [];
  const parsed = parse(raw, errors, { allowTrailingComma: true, disallowComments: false }) as unknown;
  if (errors.length > 0) {
    throw new SyntaxError(`Invalid JSONC at offset ${errors[0]?.offset ?? 0}.`);
  }

  return parsed;
}

export function resolveAdapterIdFromType(type: string, customTypeMap: Record<string, string> = {}): string {
  const adapterId = customTypeMap[type] ?? launchConfigTypeMap[type];
  if (adapterId === undefined) {
    throw usageError(`Unknown launch configuration type '${type}'.`, {
      code: 'unknown_launch_type',
      diagnostics: [`No adapter mapping is configured for launch type '${type}'.`],
    });
  }

  return adapterId;
}

export function mapJsDebugFlags(flags: Record<string, unknown>): Record<string, unknown> {
  const mapped = copyDefinedEntries(flags);

  if (flags.type === 'node') {
    mapped.type = 'pwa-node';
  }
  if (flags.type === 'chrome') {
    mapped.type = 'pwa-chrome';
  }
  if (flags.runtimeExecutable === 'electron') {
    mapped.type = 'pwa-node';
  }

  return mapped;
}

export function mapDebugpyFlags(flags: Record<string, unknown>): Record<string, unknown> {
  const mapped = copyDefinedEntries(flags);
  if (typeof flags.port === 'number') {
    mapped.connect = { host: '127.0.0.1', port: flags.port };
    delete mapped.port;
  }

  return mapped;
}

function applyPlatformOverlay(config: Record<string, unknown>, platform: NodeJS.Platform): Record<string, unknown> {
  const base: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(config)) {
    if (!platformKeys.has(key)) {
      base[key] = cloneLaunchValue(value);
    }
  }

  const overlayNames = platform === 'darwin' ? ['osx', 'mac'] : platform === 'win32' ? ['windows'] : platform === 'linux' ? ['linux'] : [];
  for (const overlayName of overlayNames) {
    const overlay = config[overlayName];
    if (isPlainRecord(overlay)) {
      mergeRecordInto(base, overlay);
    }
  }

  return base;
}

function mergeRecordInto(target: Record<string, unknown>, source: Record<string, unknown>): void {
  for (const [key, value] of Object.entries(source)) {
    const current = target[key];
    if (isPlainRecord(current) && isPlainRecord(value)) {
      mergeRecordInto(current, value);
    } else {
      target[key] = cloneLaunchValue(value);
    }
  }
}

function resolveLaunchValue(value: unknown, jsonPath: string, context: Required<ResolveLaunchContext>): unknown {
  if (typeof value === 'string') {
    return resolveLaunchString(value, jsonPath, context);
  }

  if (Array.isArray(value)) {
    return value.map((item, index) => resolveLaunchValue(item, `${jsonPath}[${index}]`, context));
  }

  if (isPlainRecord(value)) {
    const resolved: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value)) {
      resolved[key] = resolveLaunchValue(entry, `${jsonPath}.${key}`, context);
    }
    return resolved;
  }

  return value;
}

interface ResolveLaunchContext {
  workspaceFolder: string;
  workspaceFolderBasename: string;
  userHome: string;
  execPath: string;
  env: NodeJS.ProcessEnv | Record<string, string | undefined>;
}

function resolveLaunchString(value: string, jsonPath: string, context: Required<ResolveLaunchContext>): string {
  return value.replace(launchVariablePattern, (token: string, variableName: string): string => {
    if (variableName === 'workspaceFolder') {
      return context.workspaceFolder;
    }
    if (variableName === 'workspaceFolderBasename') {
      return context.workspaceFolderBasename;
    }
    if (variableName === 'userHome') {
      return context.userHome;
    }
    if (variableName === 'execPath') {
      return context.execPath;
    }
    if (variableName.startsWith('env:')) {
      const envName = variableName.slice('env:'.length);
      const envValue = context.env[envName];
      if (envValue === undefined) {
        throw usageError(`Launch variable '${token}' could not be resolved.`, {
          code: 'unresolved_launch_variable',
          diagnostics: [`${jsonPath}: environment variable '${envName}' is not set.`],
          data: { token, path: jsonPath, variable: envName },
        });
      }
      return envValue;
    }
    if (variableName.startsWith('input:') || variableName.startsWith('command:')) {
      throw usageError(`Launch variable '${token}' is not supported.`, {
        code: 'unsupported_launch_variable',
        diagnostics: [`${jsonPath}: '${token}' requires VS Code interaction and is not supported by dap-cli.`],
        data: { token, path: jsonPath },
      });
    }

    throw usageError(`Launch variable '${token}' could not be resolved.`, {
      code: 'unresolved_launch_variable',
      diagnostics: [`${jsonPath}: '${token}' is not a supported launch variable.`],
      data: { token, path: jsonPath },
    });
  });
}

function cloneLaunchValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(item => cloneLaunchValue(item));
  }

  if (isPlainRecord(value)) {
    const cloned: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value)) {
      cloned[key] = cloneLaunchValue(entry);
    }
    return cloned;
  }

  return value;
}

function copyDefinedEntries(source: Record<string, unknown>): Record<string, unknown> {
  const target: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(source)) {
    if (value !== undefined) {
      target[key] = cloneLaunchValue(value);
    }
  }
  return target;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error;
}