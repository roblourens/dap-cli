import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, symlink } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { createCliTestEnv, runCli, type CliTestEnv } from '../helpers/runCli.js';
import { startControllerServer, type ControllerServer } from '../../src/controller/server.js';

interface JsonEnvelope<T> {
  ok: true;
  data: T;
  meta: { command: string; timestamp: string };
}

interface ThreadData {
  threads: Array<{ id: number; name: string }>;
}

interface StackData {
  stackFrames: Array<{ id: number; name: string; source?: { path?: string } }>;
}

interface ScopeData {
  scopes: Array<{ name: string; variablesReference: number }>;
}

let testEnv: CliTestEnv;
let server: ControllerServer | undefined;

beforeEach(async () => {
  testEnv = await createCliTestEnv('dap-cli-self-hosting-');
  await linkProvisionedJsDebug(testEnv.dapCliHome);
  server = await startControllerServer({ dapCliHome: testEnv.dapCliHome });
});

afterEach(async () => {
  await runCli(['cleanup'], { env: testEnv.env }).catch(() => undefined);
  cleanupSelfHostingDebuggees();
  if (server !== undefined) {
    await server.stop();
    server = undefined;
  }
  await testEnv.cleanup();
});

describe('self-hosting integration', () => {
  test('dap-cli debugs simple-node-app fixture with stop-on-entry inspection', async () => {
    const fixture = path.join(process.cwd(), 'tests', 'fixtures', 'simple-node-app', 'index.js');
    await runNodeSelfHostingWorkflow({
      name: 'simple-node-self-host',
      program: fixture,
      programArgs: ['run'],
      expectedSourcePathSuffix: path.join('simple-node-app', 'index.js'),
    });
  });

  test('dap-cli debugs dap-cli-target fixture with stop-on-entry inspection', async () => {
    const fixture = path.join(process.cwd(), 'tests', 'fixtures', 'dap-cli-target', 'index.js');
    await runNodeSelfHostingWorkflow({
      name: 'dap-cli-target-self-host',
      program: fixture,
      programArgs: ['phase-4'],
      expectedSourcePathSuffix: path.join('dap-cli-target', 'index.js'),
    });
  });

  test.skipIf(!existsSync(path.join(process.cwd(), 'dist', 'index.js')))('dap-cli debugs its own CLI execution capstone', async () => {
    await runNodeSelfHostingWorkflow({
      name: 'dap-cli-capstone',
      program: path.join(process.cwd(), 'dist', 'index.js'),
      programArgs: ['--version'],
      expectedSourcePathSuffix: path.join('dist', 'index.js'),
    });
  });
});

async function runNodeSelfHostingWorkflow(options: { name: string; program: string; programArgs: readonly string[]; expectedSourcePathSuffix: string }): Promise<void> {
  const launchConfig = {
    type: 'pwa-node',
    request: 'launch',
    name: options.name,
    program: options.program,
    args: options.programArgs,
    console: 'internalConsole',
    stopOnEntry: true,
  };

  const launch = await runCli(['launch', '--adapter', 'js-debug', '--name', options.name, '--json', JSON.stringify(launchConfig)], { env: testEnv.env });
  expect(launch.exitCode, JSON.stringify(launch)).toBe(0);

  const status = await runCli(['status', '--name', options.name], { env: testEnv.env });
  expect(status.exitCode, JSON.stringify(status)).toBe(0);
  const lifecycleStatus = readStringField(status.envelope, 'status');
  expect(['running', 'stopped', 'terminated']).toContain(lifecycleStatus);

  const events = await runCli(['events', '--name', options.name, '--after-cursor', '0', '--limit', '10'], { env: testEnv.env });
  expect(events.exitCode, JSON.stringify(events)).toBe(0);
  expect(JSON.stringify(readEnvelopeData(events.envelope))).toMatch(/initialized|stopped|terminated|output/);

  if (lifecycleStatus !== 'stopped') {
    const stop = await runCli(['stop', '--name', options.name], { env: testEnv.env });
    expect(stop.exitCode, JSON.stringify(stop)).toBe(0);
    const cleanup = await runCli(['cleanup'], { env: testEnv.env });
    expect(cleanup.exitCode, JSON.stringify(cleanup)).toBe(0);
    return;
  }

  const threads = await runCli(['threads', '--name', options.name], { env: testEnv.env });
  expect(threads.exitCode, JSON.stringify(threads)).toBe(0);
  const threadId = readFirstThreadId(threads.envelope);

  const stack = await runCli(['stack', '--thread-id', String(threadId), '--name', options.name], { env: testEnv.env });
  expect(stack.exitCode, JSON.stringify(stack)).toBe(0);
  const frame = readFirstStackFrame(stack.envelope);
  expect(normalizePath(frame.source?.path ?? '')).toContain(normalizePath(options.expectedSourcePathSuffix));

  const scopes = await runCli(['scopes', '--frame-id', String(frame.id), '--name', options.name], { env: testEnv.env });
  expect(scopes.exitCode, JSON.stringify(scopes)).toBe(0);
  const scope = readFirstScope(scopes.envelope);

  if (scope.variablesReference !== 0) {
    const variables = await runCli(['variables', '--variables-reference', String(scope.variablesReference), '--name', options.name], { env: testEnv.env });
    expect(variables.exitCode, JSON.stringify(variables)).toBe(0);
  }

  const continued = await runCli(['continue', '--thread-id', String(threadId), '--name', options.name], { env: testEnv.env });
  expect(continued.exitCode, JSON.stringify(continued)).toBe(0);

  const cleanup = await runCli(['cleanup'], { env: testEnv.env });
  expect(cleanup.exitCode, JSON.stringify(cleanup)).toBe(0);
}

async function linkProvisionedJsDebug(dapCliHome: string): Promise<void> {
  const provisionedJsDebug = path.join(homedir(), '.dap-cli', 'adapters', 'js-debug');
  const entrypoint = path.join(provisionedJsDebug, 'src', 'bootloader.js');
  expect(existsSync(entrypoint), 'js-debug not provisioned - run npm run setup-adapters').toBe(true);

  const adaptersDir = path.join(dapCliHome, 'adapters');
  await mkdir(adaptersDir, { recursive: true });
  await symlink(provisionedJsDebug, path.join(adaptersDir, 'js-debug'), 'dir');
}

function cleanupSelfHostingDebuggees(): void {
  const patterns = [
    'tests/fixtures/simple-node-app/index.js run',
    'tests/fixtures/dap-cli-target/index.js phase-4',
    'dist/index.js --version',
  ];

  for (const pattern of patterns) {
    spawnSync('pkill', ['-f', pattern], { stdio: 'ignore' });
  }
}

function readEnvelopeData(envelope: unknown): unknown {
  if (!isSuccessEnvelope(envelope)) {
    throw new Error(`Expected successful JSON envelope: ${JSON.stringify(envelope)}`);
  }

  return envelope.data;
}

function readStringField(envelope: unknown, field: string): string {
  const data = readEnvelopeData(envelope);
  if (!isRecord(data)) {
    throw new Error(`Expected object data: ${JSON.stringify(data)}`);
  }

  const value = data[field];
  if (typeof value !== 'string') {
    throw new Error(`Expected string field '${field}': ${JSON.stringify(data)}`);
  }

  return value;
}

function readFirstThreadId(envelope: unknown): number {
  const data = readEnvelopeData(envelope) as ThreadData;
  const thread = data.threads[0];
  if (thread === undefined) {
    throw new Error(`Expected at least one thread: ${JSON.stringify(data)}`);
  }

  return thread.id;
}

function readFirstStackFrame(envelope: unknown): StackData['stackFrames'][number] {
  const data = readEnvelopeData(envelope) as StackData;
  const frame = data.stackFrames[0];
  if (frame === undefined) {
    throw new Error(`Expected at least one stack frame: ${JSON.stringify(data)}`);
  }

  return frame;
}

function readFirstScope(envelope: unknown): ScopeData['scopes'][number] {
  const data = readEnvelopeData(envelope) as ScopeData;
  const scope = data.scopes[0];
  if (scope === undefined) {
    throw new Error(`Expected at least one scope: ${JSON.stringify(data)}`);
  }

  return scope;
}

function isSuccessEnvelope(value: unknown): value is JsonEnvelope<unknown> {
  return isRecord(value) && value.ok === true && 'data' in value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function normalizePath(value: string): string {
  return value.split(path.sep).join('/');
}
