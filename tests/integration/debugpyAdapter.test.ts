import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import net from 'node:net';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import type { DebugProtocol } from '@vscode/debugprotocol';
import { AdapterRegistry } from '../../src/adapters/registry.js';
import { startProcessAdapter } from '../../src/adapters/processAdapter.js';
import { DapClient } from '../../src/protocol/dapClient.js';
import type { DapEventMessage } from '../../src/protocol/dapMessages.js';
import { createCliTestEnv, type CliTestEnv } from '../helpers/runCli.js';
import { startControllerServer, type ControllerServer } from '../../src/controller/server.js';

let testEnv: CliTestEnv;
let server: ControllerServer | undefined;
const runDebugpyAttachSmoke = process.env.DAP_CLI_RUN_DEBUGPY_ATTACH_SMOKE === '1';

beforeEach(async () => {
  testEnv = await createCliTestEnv('dap-cli-debugpy-');
  server = await startControllerServer({ dapCliHome: testEnv.dapCliHome });
});

afterEach(async () => {
  if (server !== undefined) {
    await server.stop();
    server = undefined;
  }
  await testEnv.cleanup();
});

describe('debugpy adapter integration', () => {
  test('resolves debugpy as a built-in adapter descriptor', () => {
    const descriptor = resolveDebugpyDescriptor();

    expect(descriptor.id).toBe('debugpy');
    expect(descriptor.label).toBe('Python Debug Adapter (debugpy)');
    expect(descriptor.transport.kind).toBe('stdio');
    if (descriptor.transport.kind !== 'stdio') {
      throw new Error('Expected debugpy to use stdio transport.');
    }
    expect(descriptor.transport).toEqual({ kind: 'stdio', command: descriptor.transport.command, args: ['-m', 'debugpy.adapter'] });
  }, 30_000);

  test('launches Python script with debugpy and verifies breakpoint inspection', async () => {
    const fixture = path.join(process.cwd(), 'tests', 'fixtures', 'simple-python-app', 'main.py');
    await runDebugpyBreakpointSmoke({
      startRequest: 'launch',
      startArgs: {
        type: 'python',
        request: 'launch',
        name: 'python-smoke',
        program: fixture,
        args: ['run'],
        console: 'internalConsole',
      },
      sourcePath: fixture,
      breakpointLine: 8,
      expectedLocalNames: ['left', 'right'],
    });
  }, 30_000);

  test.skipIf(!runDebugpyAttachSmoke)('attaches to debugpy and verifies breakpoint inspection', async () => {
    const descriptor = resolveDebugpyDescriptor();
    if (descriptor.transport.kind !== 'stdio') {
      throw new Error('Expected debugpy to use stdio transport.');
    }

    const target = await startAttachTarget(descriptor.transport.command);
    try {
      await runDebugpyBreakpointSmoke({
        startRequest: 'attach',
        startArgs: {
          type: 'python',
          request: 'attach',
          name: 'python-attach-smoke',
          connect: { host: '127.0.0.1', port: target.port },
        },
        sourcePath: target.scriptPath,
        breakpointLine: 4,
        expectedLocalNames: ['left', 'right'],
      });
    } finally {
      target.process.kill('SIGTERM');
    }
  }, 30_000);
});

interface BreakpointSmokeOptions {
  startRequest: 'launch' | 'attach';
  startArgs: Record<string, unknown>;
  sourcePath: string;
  breakpointLine: number;
  expectedLocalNames: readonly string[];
}

interface AttachTarget {
  port: number;
  scriptPath: string;
  process: ChildProcessWithoutNullStreams;
}

async function runDebugpyBreakpointSmoke(options: BreakpointSmokeOptions): Promise<void> {
  const descriptor = resolveDebugpyDescriptor();
  if (descriptor.transport.kind !== 'stdio') {
    throw new Error('Expected debugpy to use stdio transport.');
  }

  const logDir = path.join(testEnv.dapCliHome, 'logs');
  await mkdir(logDir, { recursive: true });
  const adapter = startProcessAdapter({ descriptor: descriptor.transport, adapterId: descriptor.id, logDir });
  const client = new DapClient(adapter.transport, { requestTimeoutMs: 30_000 });

  try {
    const initialized = options.startRequest === 'launch' ? waitForEvent(client, 'initialized') : undefined;
    await client.request('initialize', {
      adapterID: 'debugpy',
      clientID: 'dap-cli-tests',
      clientName: 'dap-cli tests',
      columnsStartAt1: true,
      linesStartAt1: true,
      pathFormat: 'path',
    });
    const start = client.request(options.startRequest, options.startArgs);
    if (initialized !== undefined) {
      await initialized;
    }

    const breakpoints = await client.request<DebugProtocol.SetBreakpointsResponse['body']>('setBreakpoints', {
      source: { path: options.sourcePath },
      breakpoints: [{ line: options.breakpointLine }],
    });
    expect(breakpoints.breakpoints[0]?.verified).toBe(true);

    const stopped = waitForEvent(client, 'stopped');
    await client.request('configurationDone');
    if (options.startRequest === 'launch') {
      await start;
    } else {
      void start.catch(() => undefined);
    }
    const stoppedEvent = await stopped;
    const threadId = await resolveStoppedThreadId(client, stoppedEvent);
    const frame = await firstStackFrame(client, threadId);
    expect(normalizePath(frame.source?.path ?? '')).toContain(normalizePath(path.basename(options.sourcePath)));

    const variables = await localVariables(client, frame.id);
    for (const expectedName of options.expectedLocalNames) {
      expect(variables.map(variable => variable.name)).toContain(expectedName);
    }

    await client.request('continue', { threadId });
    await client.request('disconnect', { terminateDebuggee: true });
  } finally {
    await client.close().catch(() => undefined);
    await adapter.close().catch(() => undefined);
  }
}

function resolveDebugpyDescriptor() {
  return new AdapterRegistry().resolve('debugpy');
}

async function startAttachTarget(pythonPath: string): Promise<AttachTarget> {
  const port = await getFreePort();
  const scriptDir = path.join(testEnv.dapCliHome, 'debugpy-attach-target');
  const scriptPath = path.join(scriptDir, 'target.py');
  await mkdir(scriptDir, { recursive: true });
  await writeFile(scriptPath, `import debugpy\n\ndef calculate(left, right):\n    result = left + right\n    return result\n\ndebugpy.listen(('127.0.0.1', ${port}))\nprint('ready', flush=True)\ndebugpy.wait_for_client()\ncalculate(2, 3)\n`, 'utf8');

  const child = spawn(pythonPath, [scriptPath], { stdio: ['pipe', 'pipe', 'pipe'] });
  await waitForProcessOutput(child, 'ready');
  return { port, scriptPath, process: child };
}

function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      server.close(() => {
        if (typeof address === 'object' && address !== null) {
          resolve(address.port);
          return;
        }

        reject(new Error('Failed to allocate a local port.'));
      });
    });
  });
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
      reject(new Error('Process exited before reporting readiness.'));
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
    }, 10_000);
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
    throw new Error('Adapter stopped without reporting any threads.');
  }

  return threadId;
}

async function firstStackFrame(client: DapClient, threadId: number): Promise<DebugProtocol.StackFrame> {
  const stack = await client.request<DebugProtocol.StackTraceResponse['body']>('stackTrace', { threadId, startFrame: 0, levels: 5 });
  const frame = stack.stackFrames[0];
  if (frame === undefined) {
    throw new Error('Adapter stopped without reporting a stack frame.');
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