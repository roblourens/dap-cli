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

export interface RunCliHumanResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

export type CliTestEnv = TempDapCliEnv;

export interface RunCliOptions {
  env?: NodeJS.ProcessEnv;
}

class MemoryStream {
  public output = '';
  public readonly isTTY: boolean;

  public constructor(options: { isTTY?: boolean } = {}) {
    this.isTTY = options.isTTY ?? false;
  }

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
  const previousDapCliHuman = process.env.DAP_CLI_HUMAN;
  const previousDapCliCompoundFixture = process.env.DAP_CLI_COMPOUND_FIXTURE;
  const env = options.env ?? process.env;
  setOptionalEnv('DAP_CLI_HOME', env.DAP_CLI_HOME);
  setOptionalEnv('DAP_CLI_ENTRYPOINT', env.DAP_CLI_ENTRYPOINT);
  setOptionalEnv('DAP_CLI_HUMAN', env.DAP_CLI_HUMAN);
  setOptionalEnv('DAP_CLI_COMPOUND_FIXTURE', env.DAP_CLI_COMPOUND_FIXTURE);

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
    setOptionalEnv('DAP_CLI_HUMAN', previousDapCliHuman);
    setOptionalEnv('DAP_CLI_COMPOUND_FIXTURE', previousDapCliCompoundFixture);
  }
}

export async function runCliHuman(args: readonly string[], options: RunCliOptions = {}): Promise<RunCliHumanResult> {
  const previousDapCliHome = process.env.DAP_CLI_HOME;
  const previousDapCliEntrypoint = process.env.DAP_CLI_ENTRYPOINT;
  const previousDapCliHuman = process.env.DAP_CLI_HUMAN;
  const previousDapCliCompoundFixture = process.env.DAP_CLI_COMPOUND_FIXTURE;
  const env = options.env ?? process.env;
  setOptionalEnv('DAP_CLI_HOME', env.DAP_CLI_HOME);
  setOptionalEnv('DAP_CLI_ENTRYPOINT', env.DAP_CLI_ENTRYPOINT);
  setOptionalEnv('DAP_CLI_HUMAN', env.DAP_CLI_HUMAN);
  setOptionalEnv('DAP_CLI_COMPOUND_FIXTURE', env.DAP_CLI_COMPOUND_FIXTURE);

  const stdout = new MemoryStream({ isTTY: true });
  const stderr = new MemoryStream({ isTTY: true });

  try {
    const exitCode = await main(args, undefined, { stdout, stderr });
    return {
      exitCode,
      stdout: stdout.output,
      stderr: stderr.output,
    };
  } finally {
    setOptionalEnv('DAP_CLI_HOME', previousDapCliHome);
    setOptionalEnv('DAP_CLI_ENTRYPOINT', previousDapCliEntrypoint);
    setOptionalEnv('DAP_CLI_HUMAN', previousDapCliHuman);
    setOptionalEnv('DAP_CLI_COMPOUND_FIXTURE', previousDapCliCompoundFixture);
  }
}

export async function runCliPiped(args: readonly string[], options: RunCliOptions = {}): Promise<RunCliHumanResult> {
  const previousDapCliHome = process.env.DAP_CLI_HOME;
  const previousDapCliEntrypoint = process.env.DAP_CLI_ENTRYPOINT;
  const previousDapCliHuman = process.env.DAP_CLI_HUMAN;
  const previousDapCliCompoundFixture = process.env.DAP_CLI_COMPOUND_FIXTURE;
  const env = options.env ?? process.env;
  setOptionalEnv('DAP_CLI_HOME', env.DAP_CLI_HOME);
  setOptionalEnv('DAP_CLI_ENTRYPOINT', env.DAP_CLI_ENTRYPOINT);
  setOptionalEnv('DAP_CLI_HUMAN', env.DAP_CLI_HUMAN);
  setOptionalEnv('DAP_CLI_COMPOUND_FIXTURE', env.DAP_CLI_COMPOUND_FIXTURE);

  const stdout = new MemoryStream({ isTTY: false });
  const stderr = new MemoryStream({ isTTY: false });

  try {
    const exitCode = await main(args, undefined, { stdout, stderr });
    return {
      exitCode,
      stdout: stdout.output,
      stderr: stderr.output,
    };
  } finally {
    setOptionalEnv('DAP_CLI_HOME', previousDapCliHome);
    setOptionalEnv('DAP_CLI_ENTRYPOINT', previousDapCliEntrypoint);
    setOptionalEnv('DAP_CLI_HUMAN', previousDapCliHuman);
    setOptionalEnv('DAP_CLI_COMPOUND_FIXTURE', previousDapCliCompoundFixture);
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

function setOptionalEnv(key: 'DAP_CLI_HOME' | 'DAP_CLI_ENTRYPOINT' | 'DAP_CLI_HUMAN' | 'DAP_CLI_COMPOUND_FIXTURE', value: string | undefined): void {
  if (value === undefined) {
    delete process.env[key];
    return;
  }

  process.env[key] = value;
}
