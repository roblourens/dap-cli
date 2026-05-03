import { main } from '../../src/cli/main.js';
import type { JsonFailure, JsonSuccess } from '../../src/cli/output.js';
import { createControllerClient } from '../../src/controller/client.js';
import { createTempDapCliEnv, type TempDapCliEnv } from '../../src/testing/tempEnv.js';

export interface RunCliResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  envelope: JsonSuccess<unknown> | JsonFailure;
}

export type CliTestEnv = TempDapCliEnv;

export interface RunCliOptions {
  env?: NodeJS.ProcessEnv;
}

class MemoryStream {
  public output = '';

  public write(chunk: string): boolean {
    this.output += chunk;
    return true;
  }
}

export async function createCliTestEnv(prefix = 'dap-cli-test-'): Promise<CliTestEnv> {
  const tempEnv = await createTempDapCliEnv(prefix);
  return {
    ...tempEnv,
    async cleanup(): Promise<void> {
      await stopController(tempEnv.dapCliHome);
      await tempEnv.cleanup();
    },
  };
}

export async function runCli(args: readonly string[], options: RunCliOptions = {}): Promise<RunCliResult> {
  const previousDapCliHome = process.env.DAP_CLI_HOME;
  const previousDapCliEntrypoint = process.env.DAP_CLI_ENTRYPOINT;
  const env = options.env ?? process.env;
  setOptionalEnv('DAP_CLI_HOME', env.DAP_CLI_HOME);
  setOptionalEnv('DAP_CLI_ENTRYPOINT', env.DAP_CLI_ENTRYPOINT);

  const stdout = new MemoryStream();
  const stderr = new MemoryStream();

  try {
    const exitCode = await main(args, undefined, { stdout, stderr });
    return {
      exitCode,
      stdout: stdout.output,
      stderr: stderr.output,
      envelope: parseOneJsonEnvelope(stdout.output),
    };
  } finally {
    setOptionalEnv('DAP_CLI_HOME', previousDapCliHome);
    setOptionalEnv('DAP_CLI_ENTRYPOINT', previousDapCliEntrypoint);
  }
}

function parseOneJsonEnvelope(stdout: string): JsonSuccess<unknown> | JsonFailure {
  if (!stdout.endsWith('\n')) {
    throw new Error('CLI stdout was not newline terminated.');
  }

  const lines = stdout.trimEnd().split('\n');
  if (lines.length !== 1) {
    throw new Error(`CLI stdout contained ${lines.length} JSON lines.`);
  }

  return JSON.parse(lines[0] ?? '') as JsonSuccess<unknown> | JsonFailure;
}

async function stopController(dapCliHome: string): Promise<void> {
  try {
    const client = await createControllerClient({ dapCliHome, timeoutMs: 250 });
    try {
      await client.request('controller.shutdown');
    } finally {
      await client.close();
    }
  } catch {
    // No controller is fine during test cleanup.
  }
}

function setOptionalEnv(key: 'DAP_CLI_HOME' | 'DAP_CLI_ENTRYPOINT', value: string | undefined): void {
  if (value === undefined) {
    delete process.env[key];
    return;
  }

  process.env[key] = value;
}
