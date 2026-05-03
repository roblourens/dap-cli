import { promises as fs } from 'node:fs';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { z } from 'zod';
import { adapterDescriptorSchema } from './descriptor.js';
import { getDapCliHome } from '../config/paths.js';
import { usageError } from '../cli/errors.js';

const configuredAdapterDescriptorSchema = adapterDescriptorSchema.and(z.object({
  launchDefaults: z.record(z.string(), z.unknown()).optional(),
  attachDefaults: z.record(z.string(), z.unknown()).optional(),
}));

export const adapterConfigSchema = z.object({
  adapters: z.record(z.string(), configuredAdapterDescriptorSchema).optional(),
  launchConfigTypeMap: z.record(z.string(), z.string()).optional(),
});

export type AdapterConfig = z.infer<typeof adapterConfigSchema>;

export async function loadAdapterConfig(dapCliHome?: string): Promise<AdapterConfig> {
  const configPath = getAdapterConfigPath(dapCliHome);

  try {
    const raw = await fs.readFile(configPath, 'utf8');
    return parseAdapterConfig(raw);
  } catch (error) {
    if (isNodeError(error) && error.code === 'ENOENT') {
      return {};
    }

    if (error instanceof SyntaxError || error instanceof z.ZodError) {
      throw invalidConfigError(error);
    }

    throw error;
  }
}

export async function saveAdapterConfig(config: AdapterConfig, dapCliHome?: string): Promise<void> {
  const configPath = getAdapterConfigPath(dapCliHome);
  const validated = adapterConfigSchema.parse(config);
  await fs.mkdir(path.dirname(configPath), { recursive: true });
  const tempPath = `${configPath}.${process.pid}.${randomUUID()}.tmp`;
  await fs.writeFile(tempPath, `${JSON.stringify(validated, null, 2)}\n`, 'utf8');
  await fs.rename(tempPath, configPath);
}

function getAdapterConfigPath(dapCliHome: string | undefined): string {
  const home = dapCliHome === undefined ? getDapCliHome() : getDapCliHome({ ...process.env, DAP_CLI_HOME: dapCliHome });
  return path.join(home, 'config', 'adapters.json');
}

function parseAdapterConfig(raw: string): AdapterConfig {
  return adapterConfigSchema.parse(JSON.parse(raw));
}

function invalidConfigError(error: SyntaxError | z.ZodError): Error {
  return usageError('Invalid adapter config.', {
    code: 'invalid_config',
    diagnostics: error instanceof z.ZodError ? error.issues.map(issue => issue.message) : [error.message],
  });
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error;
}