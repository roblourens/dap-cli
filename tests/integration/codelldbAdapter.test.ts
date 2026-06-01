import { spawn, spawnSync, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import type { DebugProtocol } from '@vscode/debugprotocol';
import { AdapterRegistry } from '../../src/adapters/registry.js';
import { startServerSocketAdapter } from '../../src/adapters/socketAdapter.js';
import { DapClient } from '../../src/protocol/dapClient.js';
import type { DapEventMessage } from '../../src/protocol/dapMessages.js';
import { loadVSCodeLaunchJson, resolveAdapterIdFromType, resolveLaunchConfigEntry, resolveLaunchConfigurationConfig } from '../../src/config/launchConfig.js';
import { createCliTestEnv, type CliTestEnv } from '../helpers/runCli.js';
import { provisionAdapterIntoTempEnv } from '../../src/testing/tempEnv.js';

let testEnv: CliTestEnv;
let previousDapCliHome: string | undefined;
const runCodeLldbAttachSmoke = process.env.DAP_CLI_RUN_CODELLDB_ATTACH_SMOKE === '1';

beforeEach(async ctx => {
  testEnv = await createCliTestEnv('dap-cli-codelldb-');
  try {
    await provisionAdapterIntoTempEnv(testEnv, 'codelldb');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    ctx.skip(`codelldb not provisioned in user DAP_CLI_HOME - ${message}`);
    return;
  }
  previousDapCliHome = process.env.DAP_CLI_HOME;
  process.env.DAP_CLI_HOME = testEnv.dapCliHome;
});

afterEach(async () => {
  if (previousDapCliHome === undefined) {
    delete process.env.DAP_CLI_HOME;
  } else {
    process.env.DAP_CLI_HOME = previousDapCliHome;
  }
  previousDapCliHome = undefined;
  await testEnv.cleanup();
});

describe('CodeLLDB adapter integration', () => {
  test('launches an owned Rust executable and inspects breakpoint state', async () => {
    const target = buildRustFixture('simple-rust-app');
    await runCodeLldbBreakpointSmoke({
      startRequest: 'launch',
      startArgs: {
        type: 'lldb',
        request: 'launch',
        name: 'rust-launch-smoke',
        program: target.binaryPath,
        cwd: target.fixtureDir,
        sourceLanguages: ['rust'],
      },
      sourcePath: target.sourcePath,
      breakpointLine: 9,
      expectedVariable: 'answer',
      expectedEvaluateResult: '42',
    });
  }, 90_000);

  test('launches the owned Rust executable resolved from a named lldb configuration', async () => {
    const target = buildRustFixture('simple-rust-app');
    const workspace = path.join(testEnv.dapCliHome, 'named-config-workspace');
    await mkdir(path.join(workspace, '.vscode'), { recursive: true });
    await writeFile(path.join(workspace, '.vscode', 'launch.json'), JSON.stringify({
      configurations: [{
        type: 'lldb',
        name: 'Rust named launch',
        request: 'launch',
        program: target.binaryPath,
        cwd: target.fixtureDir,
        sourceLanguages: ['rust'],
      }],
    }), 'utf8');
    const document = await loadVSCodeLaunchJson(workspace);
    const entry = resolveLaunchConfigEntry(document, 'Rust named launch');
    if (entry.kind !== 'configuration') {
      throw new Error('Expected the Rust named launch configuration.');
    }
    const config = resolveLaunchConfigurationConfig(entry.configuration, { workspaceFolder: workspace });
    expect(resolveAdapterIdFromType(String(config.type))).toBe('codelldb');

    await runCodeLldbBreakpointSmoke({
      startRequest: 'launch',
      startArgs: config,
      sourcePath: target.sourcePath,
      breakpointLine: 9,
      expectedVariable: 'answer',
      expectedEvaluateResult: '42',
    });
  }, 90_000);

  test.skipIf(!runCodeLldbAttachSmoke)('attaches only to an owned Rust PID without terminating it on disconnect', async () => {
    const target = await startAttachTarget();
    try {
      await runCodeLldbBreakpointSmoke({
        startRequest: 'attach',
        startArgs: { type: 'lldb', request: 'attach', name: 'rust-attach-smoke', pid: target.process.pid },
        sourcePath: target.sourcePath,
        breakpointLine: 10,
        expectedVariable: 'answer',
        expectedEvaluateResult: '15',
        allowInitiallyPendingBreakpoint: true,
        terminateDebuggeeOnDisconnect: false,
      });
      expect(target.process.exitCode).toBeNull();
    } finally {
      await terminateOwnedProcess(target.process);
    }
  }, 90_000);
});

interface RustFixture {
  fixtureDir: string;
  sourcePath: string;
  binaryPath: string;
}

interface BreakpointSmokeOptions {
  startRequest: 'launch' | 'attach';
  startArgs: Record<string, unknown>;
  sourcePath: string;
  breakpointLine: number;
  expectedVariable: string;
  expectedEvaluateResult: string;
  allowInitiallyPendingBreakpoint?: boolean;
  terminateDebuggeeOnDisconnect?: boolean;
}

interface AttachTarget {
  process: ChildProcessWithoutNullStreams;
  sourcePath: string;
}

function buildRustFixture(name: string): RustFixture {
  const fixtureDir = path.join(process.cwd(), 'tests', 'fixtures', name);
  const targetDir = path.join(testEnv.dapCliHome, `${name}-target`);
  const binaryName = name;
  const binaryPath = path.join(targetDir, 'debug', binaryName);
  const build = spawnSync('cargo', ['build', '--manifest-path', path.join(fixtureDir, 'Cargo.toml'), '--target-dir', targetDir], { encoding: 'utf8' });
  expect(build.status, `${build.stdout}\n${build.stderr}`).toBe(0);
  return { fixtureDir, binaryPath, sourcePath: path.join(fixtureDir, 'src', 'main.rs') };
}

async function runCodeLldbBreakpointSmoke(options: BreakpointSmokeOptions): Promise<void> {
  const descriptor = await new AdapterRegistry().resolve('codelldb');
  if (descriptor.transport.kind !== 'server') {
    throw new Error('Expected CodeLLDB to use server transport.');
  }
  const logDir = path.join(testEnv.dapCliHome, 'logs');
  await mkdir(logDir, { recursive: true });
  const adapter = await startServerSocketAdapter(descriptor.id, descriptor.transport, logDir);
  const client = new DapClient(adapter.transport, { requestTimeoutMs: 60_000 });
  try {
    const initialized = waitForEvent(client, 'initialized');
    await client.request('initialize', {
      adapterID: 'lldb',
      clientID: 'dap-cli-tests',
      clientName: 'dap-cli tests',
      columnsStartAt1: true,
      linesStartAt1: true,
      pathFormat: 'path',
    });
    const start = client.request(options.startRequest, options.startArgs);
    await Promise.race([initialized, start]);
    await initialized;
    const breakpoints = await client.request<DebugProtocol.SetBreakpointsResponse['body']>('setBreakpoints', {
      source: { path: options.sourcePath },
      breakpoints: [{ line: options.breakpointLine }],
    });
    if (options.allowInitiallyPendingBreakpoint !== true) {
      expect(breakpoints.breakpoints[0]?.verified, JSON.stringify(breakpoints.breakpoints[0])).toBe(true);
    }
    const stopped = waitForEvent(client, 'stopped');
    await client.request('configurationDone');
    const stoppedEvent = await stopped;
    const threadId = await resolveStoppedThreadId(client, stoppedEvent);
    const frame = await firstStackFrame(client, threadId);
    expect(normalizePath(frame.source?.path ?? '')).toContain(normalizePath(path.basename(options.sourcePath)));
    const variables = await localVariables(client, frame.id);
    expect(variables.map(variable => variable.name)).toContain(options.expectedVariable);
    const evaluated = await client.request<DebugProtocol.EvaluateResponse['body']>('evaluate', {
      expression: options.expectedVariable,
      frameId: frame.id,
      context: 'watch',
    });
    expect(evaluated.result).toContain(options.expectedEvaluateResult);
    await client.request('continue', { threadId });
    await start;
    await client.request('disconnect', { terminateDebuggee: options.terminateDebuggeeOnDisconnect ?? true });
  } finally {
    await client.close().catch(() => undefined);
    await adapter.close().catch(() => undefined);
  }
}

async function startAttachTarget(): Promise<AttachTarget> {
  const fixture = buildRustFixture('simple-rust-attach');
  const process = spawn(fixture.binaryPath, [], { cwd: fixture.fixtureDir, stdio: ['pipe', 'pipe', 'pipe'] });
  await waitForProcessOutput(process, 'simple-rust-attach ready');
  return { process, sourcePath: fixture.sourcePath };
}

async function terminateOwnedProcess(child: ChildProcessWithoutNullStreams): Promise<void> {
  if (child.exitCode !== null) {
    return;
  }
  const exited = new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Timed out cleaning up owned Rust attach fixture.')), 10_000);
    child.once('exit', () => {
      clearTimeout(timeout);
      resolve();
    });
  });
  child.kill('SIGTERM');
  await exited;
}

function waitForProcessOutput(child: ChildProcessWithoutNullStreams, expectedText: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error(`Timed out waiting for process output '${expectedText}'.`));
    }, 10_000);
    const onData = (chunk: Buffer): void => {
      if (chunk.toString('utf8').includes(expectedText)) {
        cleanup();
        resolve();
      }
    };
    const onExit = (): void => {
      cleanup();
      reject(new Error('Attach fixture exited before reporting readiness.'));
    };
    const cleanup = (): void => {
      clearTimeout(timeout);
      child.stdout.off('data', onData);
      child.off('exit', onExit);
    };
    child.stdout.on('data', onData);
    child.once('exit', onExit);
  });
}

function waitForEvent(client: DapClient, eventName: string): Promise<DapEventMessage> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      dispose();
      reject(new Error(`Timed out waiting for DAP event '${eventName}'.`));
    }, 30_000);
    const dispose = client.onEvent(event => {
      if (event.event === eventName) {
        clearTimeout(timeout);
        dispose();
        resolve(event);
      }
    });
  });
}

async function resolveStoppedThreadId(client: DapClient, event: DapEventMessage): Promise<number> {
  const body = isRecord(event.body) ? event.body : undefined;
  if (typeof body?.threadId === 'number') {
    return body.threadId;
  }
  const threads = await client.request<DebugProtocol.ThreadsResponse['body']>('threads');
  const threadId = threads.threads[0]?.id;
  if (threadId === undefined) {
    throw new Error('CodeLLDB stopped without reporting any threads.');
  }
  return threadId;
}

async function firstStackFrame(client: DapClient, threadId: number): Promise<DebugProtocol.StackFrame> {
  const stack = await client.request<DebugProtocol.StackTraceResponse['body']>('stackTrace', { threadId, startFrame: 0, levels: 5 });
  const frame = stack.stackFrames[0];
  if (frame === undefined) {
    throw new Error('CodeLLDB stopped without reporting a stack frame.');
  }
  return frame;
}

async function localVariables(client: DapClient, frameId: number): Promise<DebugProtocol.Variable[]> {
  const scopes = await client.request<DebugProtocol.ScopesResponse['body']>('scopes', { frameId });
  const localScope = scopes.scopes.find(scope => scope.name.toLowerCase().includes('local')) ?? scopes.scopes[0];
  if (localScope === undefined || localScope.variablesReference === 0) {
    return [];
  }
  const variables = await client.request<DebugProtocol.VariablesResponse['body']>('variables', { variablesReference: localScope.variablesReference });
  return variables.variables;
}

function normalizePath(value: string): string {
  return value.split(path.sep).join('/');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}