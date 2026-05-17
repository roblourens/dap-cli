import { spawn, spawnSync, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import type { DebugProtocol } from '@vscode/debugprotocol';
import { AdapterRegistry } from '../../src/adapters/registry.js';
import { startServerSocketAdapter } from '../../src/adapters/socketAdapter.js';
import { DapClient } from '../../src/protocol/dapClient.js';
import type { DapEventMessage } from '../../src/protocol/dapMessages.js';
import { createCliTestEnv, type CliTestEnv } from '../helpers/runCli.js';

let testEnv: CliTestEnv;
const runDelveAttachSmoke = process.env.DAP_CLI_RUN_DELVE_ATTACH_SMOKE === '1';

beforeEach(async () => {
  testEnv = await createCliTestEnv('dap-cli-delve-');
});

afterEach(async () => {
  await testEnv.cleanup();
});

describe('Delve adapter integration', () => {
  test('launches a Go package and inspects breakpoint state', async () => {
    const fixtureDir = fixturePath('simple-go-app');
    await runDelveBreakpointSmoke({
      startRequest: 'launch',
      startArgs: {
        type: 'go',
        request: 'launch',
        name: 'go-launch-smoke',
        mode: 'debug',
        program: fixtureDir,
        cwd: fixtureDir,
        dlvCwd: fixtureDir,
      },
      sourcePath: path.join(fixtureDir, 'main.go'),
      breakpointLine: 6,
      expectedLocalNames: ['left', 'right'],
      evaluateExpression: 'left + right',
      expectedEvaluateResult: '5',
    });
  }, 60_000);

  test('debugs a Go package test and inspects locals', async () => {
    const fixtureDir = fixturePath('simple-go-test');
    await runDelveBreakpointSmoke({
      startRequest: 'launch',
      startArgs: {
        type: 'go',
        request: 'launch',
        name: 'go-test-smoke',
        mode: 'test',
        program: fixtureDir,
        cwd: fixtureDir,
        dlvCwd: fixtureDir,
      },
      sourcePath: path.join(fixtureDir, 'calculate.go'),
      breakpointLine: 4,
      expectedLocalNames: ['left', 'right'],
      evaluateExpression: 'left + right',
      expectedEvaluateResult: '10',
    });
  }, 60_000);

  test('debugs a symbol-friendly Go executable and inspects locals', async () => {
    const fixtureDir = fixturePath('simple-go-app');
    const binaryPath = path.join(testEnv.dapCliHome, process.platform === 'win32' ? 'simple-go-app.exe' : 'simple-go-app');
    const build = spawnSync('go', ['build', '-gcflags=all=-N -l', '-o', binaryPath, '.'], { cwd: fixtureDir, encoding: 'utf8' });
    expect(build.status, build.stderr).toBe(0);

    await runDelveBreakpointSmoke({
      startRequest: 'launch',
      startArgs: {
        type: 'go',
        request: 'launch',
        name: 'go-exec-smoke',
        mode: 'exec',
        program: binaryPath,
        cwd: fixtureDir,
        dlvCwd: fixtureDir,
      },
      sourcePath: path.join(fixtureDir, 'main.go'),
      breakpointLine: 6,
      expectedLocalNames: ['left', 'right'],
      evaluateExpression: 'left + right',
      expectedEvaluateResult: '5',
    });
  }, 60_000);

  test.skipIf(!runDelveAttachSmoke)('attaches to a local Go PID without terminating the target on disconnect', async () => {
    const target = await startAttachTarget();
    try {
      await runDelveBreakpointSmoke({
        startRequest: 'attach',
        startArgs: {
          type: 'go',
          request: 'attach',
          name: 'go-attach-smoke',
          mode: 'local',
          processId: target.process.pid,
        },
        sourcePath: target.sourcePath,
        breakpointLine: 9,
        expectedLocalNames: ['left', 'right'],
        evaluateExpression: 'left + right',
        expectedEvaluateResult: '15',
        terminateDebuggeeOnDisconnect: false,
      });
      expect(target.process.exitCode).toBeNull();
    } finally {
      target.process.kill('SIGTERM');
    }
  }, 60_000);
});

interface BreakpointSmokeOptions {
  startRequest: 'launch' | 'attach';
  startArgs: Record<string, unknown>;
  sourcePath: string;
  breakpointLine: number;
  expectedLocalNames: readonly string[];
  evaluateExpression: string;
  expectedEvaluateResult: string;
  terminateDebuggeeOnDisconnect?: boolean;
}

interface AttachTarget {
  process: ChildProcessWithoutNullStreams;
  sourcePath: string;
}

async function runDelveBreakpointSmoke(options: BreakpointSmokeOptions): Promise<void> {
  const descriptor = new AdapterRegistry().resolve('delve');
  if (descriptor.transport.kind !== 'server') {
    throw new Error('Expected Delve to use server transport.');
  }

  const logDir = path.join(testEnv.dapCliHome, 'logs');
  await mkdir(logDir, { recursive: true });
  const adapter = await startServerSocketAdapter(descriptor.id, descriptor.transport, logDir);
  const client = new DapClient(adapter.transport, { requestTimeoutMs: 60_000 });
  const outputMessages: string[] = [];
  const disposeOutputListener = client.onEvent(event => {
    if (event.event !== 'output' || !isRecord(event.body) || typeof event.body.output !== 'string') {
      return;
    }

    outputMessages.push(event.body.output.trim());
  });

  try {
    const initialized = waitForEvent(client, 'initialized');
    await client.request('initialize', {
      adapterID: 'go',
      clientID: 'dap-cli-tests',
      clientName: 'dap-cli tests',
      columnsStartAt1: true,
      linesStartAt1: true,
      pathFormat: 'path',
    });
    const start = client.request(options.startRequest, options.startArgs);
    await Promise.race([initialized, start]).catch(error => {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(outputMessages.length === 0 ? message : `${message}: ${outputMessages.join(' ')}`);
    });
    await initialized;

    const breakpoints = await client.request<DebugProtocol.SetBreakpointsResponse['body']>('setBreakpoints', {
      source: { path: options.sourcePath },
      breakpoints: [{ line: options.breakpointLine }],
    });
    expect(breakpoints.breakpoints[0]?.verified).toBe(true);

    const stopped = waitForEvent(client, 'stopped');
    await client.request('configurationDone');
    await start;
    const stoppedEvent = await stopped;
    const threadId = await resolveStoppedThreadId(client, stoppedEvent);
    const frame = await firstStackFrame(client, threadId);
    expect(normalizePath(frame.source?.path ?? '')).toContain(normalizePath(path.basename(options.sourcePath)));

    const variables = await localVariables(client, frame.id);
    for (const expectedName of options.expectedLocalNames) {
      expect(variables.map(variable => variable.name)).toContain(expectedName);
    }

    const evaluated = await client.request<DebugProtocol.EvaluateResponse['body']>('evaluate', {
      expression: options.evaluateExpression,
      frameId: frame.id,
      context: 'watch',
    });
    expect(evaluated.result).toContain(options.expectedEvaluateResult);

    await client.request('continue', { threadId });
    await client.request('disconnect', { terminateDebuggee: options.terminateDebuggeeOnDisconnect ?? true });
  } finally {
    disposeOutputListener();
    await client.close().catch(() => undefined);
    await adapter.close().catch(() => undefined);
  }
}

function fixturePath(name: string): string {
  return path.join(process.cwd(), 'tests', 'fixtures', name);
}

async function startAttachTarget(): Promise<AttachTarget> {
  const fixtureDir = fixturePath('simple-go-attach');
  const binaryPath = path.join(testEnv.dapCliHome, process.platform === 'win32' ? 'simple-go-attach.exe' : 'simple-go-attach');
  const build = spawnSync('go', ['build', '-gcflags=all=-N -l', '-o', binaryPath, '.'], { cwd: fixtureDir, encoding: 'utf8' });
  expect(build.status, build.stderr).toBe(0);

  const child = spawn(binaryPath, [], { cwd: fixtureDir, stdio: ['pipe', 'pipe', 'pipe'] });
  await waitForProcessOutput(child, 'simple-go-attach ready');
  return { process: child, sourcePath: path.join(fixtureDir, 'main.go') };
}

function waitForProcessOutput(child: ChildProcessWithoutNullStreams, expectedText: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error(`Timed out waiting for process output '${expectedText}'.`));
    }, 10_000);
    const onData = (chunk: Buffer): void => {
      if (!chunk.toString('utf8').includes(expectedText)) {
        return;
      }

      cleanup();
      resolve();
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
      if (event.event !== eventName) {
        return;
      }

      clearTimeout(timeout);
      dispose();
      resolve(event);
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
    throw new Error('Delve stopped without reporting any threads.');
  }

  return threadId;
}

async function firstStackFrame(client: DapClient, threadId: number): Promise<DebugProtocol.StackFrame> {
  const stack = await client.request<DebugProtocol.StackTraceResponse['body']>('stackTrace', { threadId, startFrame: 0, levels: 5 });
  const frame = stack.stackFrames[0];
  if (frame === undefined) {
    throw new Error('Delve stopped without reporting a stack frame.');
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