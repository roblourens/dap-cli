import { promises as fs } from 'node:fs';
import path from 'node:path';
import { parse, type ParseError } from 'jsonc-parser';
import { z } from 'zod';
import { usageError } from '../cli/errors.js';

export interface LaunchConfiguration extends Record<string, unknown> {
  type: string;
  name: string;
}

export interface LaunchConfigSources {
  namedConfig?: Record<string, unknown> | undefined;
  jsonConfig?: Record<string, unknown> | undefined;
  flags?: Record<string, unknown> | undefined;
}

export const launchConfigTypeMap: Record<string, string> = {
  node: 'js-debug',
  'pwa-node': 'js-debug',
  chrome: 'js-debug',
  'pwa-chrome': 'js-debug',
  python: 'debugpy',
};

const maxLaunchJsonBytes = 256 * 1024;
const launchJsonSchema = z.object({
  configurations: z.array(z.object({
    type: z.string().min(1),
    name: z.string().min(1),
  }).catchall(z.unknown())).max(100).optional(),
}).catchall(z.unknown());

export function resolveLaunchConfig(sources: LaunchConfigSources): Record<string, unknown> {
  return {
    ...sources.namedConfig,
    ...sources.jsonConfig,
    ...sources.flags,
  };
}

export async function loadVSCodeLaunchConfig(cwd: string): Promise<LaunchConfiguration[]> {
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
    return parsed.configurations ?? [];
  } catch (error) {
    if (isNodeError(error) && error.code === 'ENOENT') {
      return [];
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
  const mapped: Record<string, unknown> = {};
  copyDefined(mapped, flags, 'program');
  copyDefined(mapped, flags, 'cwd');
  copyDefined(mapped, flags, 'type');
  copyDefined(mapped, flags, 'runtimeExecutable');
  copyDefined(mapped, flags, 'runtimeArgs');
  copyDefined(mapped, flags, 'url');
  copyDefined(mapped, flags, 'port');
  copyDefined(mapped, flags, 'args');
  copyDefined(mapped, flags, 'env');
  copyDefined(mapped, flags, 'sourceMaps');
  copyDefined(mapped, flags, 'outFiles');

  if (flags.runtimeExecutable === 'electron') {
    mapped.type = 'node';
  }

  return mapped;
}

export function mapDebugpyFlags(flags: Record<string, unknown>): Record<string, unknown> {
  const mapped: Record<string, unknown> = {};
  copyDefined(mapped, flags, 'program');
  copyDefined(mapped, flags, 'cwd');
  copyDefined(mapped, flags, 'type');
  copyDefined(mapped, flags, 'args');
  copyDefined(mapped, flags, 'env');
  copyDefined(mapped, flags, 'python');
  if (typeof flags.port === 'number') {
    mapped.connect = { host: '127.0.0.1', port: flags.port };
  }

  return mapped;
}

function copyDefined(target: Record<string, unknown>, source: Record<string, unknown>, key: string): void {
  if (source[key] !== undefined) {
    target[key] = source[key];
  }
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error;
}