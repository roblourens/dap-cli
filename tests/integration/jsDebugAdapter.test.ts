import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import ts from 'typescript';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import type { DebugProtocol } from '@vscode/debugprotocol';
import { AdapterRegistry } from '../../src/adapters/registry.js';
import { startProcessAdapter } from '../../src/adapters/processAdapter.js';
import { DapClient } from '../../src/protocol/dapClient.js';
import type { DapEventMessage } from '../../src/protocol/dapMessages.js';
import { createCliTestEnv, type CliTestEnv } from '../helpers/runCli.js';
import { startControllerServer, type ControllerServer } from '../../src/controller/server.js';

const jsDebugPath = path.join(process.env.DAP_CLI_HOME ?? '', 'adapters', 'js-debug', 'src', 'dapDebugServer.js');
const localJsDebugPath = path.join(process.cwd(), 'node_modules', 'vscode-js-debug', 'src', 'dapDebugServer.js');
const hasJsDebug = existsSync(jsDebugPath) || existsSync(localJsDebugPath);
const chromePath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const hasChrome = existsSync(chromePath);
const electronPath = path.join(process.cwd(), 'node_modules', '.bin', 'electron');
const hasElectron = existsSync(electronPath);

let testEnv: CliTestEnv;
let server: ControllerServer | undefined;

beforeEach(async () => {
  testEnv = await createCliTestEnv('dap-cli-js-debug-');
  server = await startControllerServer({ dapCliHome: testEnv.dapCliHome });
});

afterEach(async () => {
  if (server !== undefined) {
    await server.stop();
    server = undefined;
  }
  await testEnv.cleanup();
});

describe('js-debug adapter integration', () => {
  test('reports actionable setup diagnostics when js-debug is missing', () => {
    if (hasJsDebug) {
      expect(new AdapterRegistry().listAll()).toContainEqual({ id: 'js-debug', label: 'JavaScript Debug Adapter (Node, Chrome, Electron)', source: 'built-in' });
      return;
    }

    expect(catchErrorCode(() => new AdapterRegistry().resolve('js-debug'))).toBe('js_debug_not_found');
  });

  test.skipIf(!hasJsDebug)('launches Node.js app with js-debug and verifies breakpoint inspection', async () => {
    const fixture = path.join(process.cwd(), 'tests', 'fixtures', 'simple-node-app', 'index.js');
    await runJsDebugBreakpointSmoke({
      launchArgs: {
        type: 'node',
        request: 'launch',
        name: 'node-smoke',
        program: fixture,
        args: ['run'],
        console: 'internalConsole',
      },
      sourcePath: fixture,
      breakpointLine: 7,
      expectedSourcePathSuffix: path.join('simple-node-app', 'index.js'),
      expectedLocalNames: ['left', 'right'],
    });
  });

  test.skipIf(!hasJsDebug)('launches TypeScript output and verifies source-map breakpoint inspection', async () => {
    const fixture = await createTypeScriptFixture();
    await runJsDebugBreakpointSmoke({
      launchArgs: {
        type: 'node',
        request: 'launch',
        name: 'ts-smoke',
        program: fixture.programPath,
        cwd: fixture.workspaceDir,
        args: ['run'],
        console: 'internalConsole',
        sourceMaps: true,
        outFiles: [path.join(fixture.workspaceDir, 'dist', '*.js')],
      },
      sourcePath: fixture.sourcePath,
      breakpointLine: 12,
      expectedSourcePathSuffix: path.join('ts-smoke', 'index.ts'),
      expectedLocalNames: ['left', 'right'],
    });
  });

  test.skipIf(!hasJsDebug || !hasChrome)('launches Chrome in headless mode and verifies breakpoint inspection', async () => {
    const page = path.join(process.cwd(), 'tests', 'fixtures', 'simple-chrome-page', 'index.html');
    const sourcePath = path.join(process.cwd(), 'tests', 'fixtures', 'simple-chrome-page', 'app.js');
    await runJsDebugBreakpointSmoke({
      launchArgs: {
        type: 'chrome',
        request: 'launch',
        name: 'chrome-smoke',
        url: `file://${page}`,
        runtimeExecutable: chromePath,
        runtimeArgs: ['--headless=new', '--disable-gpu', '--no-first-run', `--user-data-dir=${path.join(testEnv.dapCliHome, 'chrome-profile')}`],
      },
      sourcePath,
      breakpointLine: 2,
      expectedSourcePathSuffix: path.join('simple-chrome-page', 'app.js'),
      expectedLocalNames: ['left', 'right'],
    });
  });

  test.skipIf(!hasJsDebug || !hasElectron)('launches Electron main process and verifies breakpoint inspection', async () => {
    const fixture = path.join(process.cwd(), 'tests', 'fixtures', 'simple-electron-app', 'main.js');
    await runJsDebugBreakpointSmoke({
      launchArgs: {
        type: 'node',
        request: 'launch',
        name: 'electron-smoke',
        runtimeExecutable: electronPath,
        program: fixture,
        console: 'internalConsole',
      },
      sourcePath: fixture,
      breakpointLine: 4,
      expectedSourcePathSuffix: path.join('simple-electron-app', 'main.js'),
      expectedLocalNames: [],
    });
  });
});

function catchErrorCode(callback: () => unknown): string | undefined {
  try {
    callback();
  } catch (error: unknown) {
    return error instanceof Error && 'code' in error && typeof error.code === 'string' ? error.code : undefined;
  }

  return undefined;
}

interface BreakpointSmokeOptions {
  launchArgs: Record<string, unknown>;
  sourcePath: string;
  breakpointLine: number;
  expectedSourcePathSuffix: string;
  expectedLocalNames: readonly string[];
}

interface TypeScriptFixture {
  workspaceDir: string;
  sourcePath: string;
  programPath: string;
}

async function runJsDebugBreakpointSmoke(options: BreakpointSmokeOptions): Promise<void> {
  const descriptor = new AdapterRegistry().resolve('js-debug');
  if (descriptor.transport.kind !== 'stdio') {
    throw new Error('Expected js-debug to use stdio transport.');
  }

  const logDir = path.join(testEnv.dapCliHome, 'logs');
  await mkdir(logDir, { recursive: true });
  const adapter = startProcessAdapter({ descriptor: descriptor.transport, adapterId: descriptor.id, logDir });
  const client = new DapClient(adapter.transport, { requestTimeoutMs: 10_000 });

  try {
    const initialized = waitForEvent(client, 'initialized');
    await client.request('initialize', {
      adapterID: 'js-debug',
      clientID: 'dap-cli-tests',
      clientName: 'dap-cli tests',
      columnsStartAt1: true,
      linesStartAt1: true,
      pathFormat: 'path',
    });
    await client.request('launch', options.launchArgs);
    await initialized;

    const breakpoints = await client.request<DebugProtocol.SetBreakpointsResponse['body']>('setBreakpoints', {
      source: { path: options.sourcePath },
      breakpoints: [{ line: options.breakpointLine }],
    });
    expect(breakpoints.breakpoints[0]?.verified).toBe(true);

    const stopped = waitForEvent(client, 'stopped');
    await client.request('configurationDone');
    const stoppedEvent = await stopped;
    const threadId = await resolveStoppedThreadId(client, stoppedEvent);
    const frame = await firstStackFrame(client, threadId);
    expect(normalizePath(frame.source?.path ?? '')).toContain(normalizePath(options.expectedSourcePathSuffix));

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

async function createTypeScriptFixture(): Promise<TypeScriptFixture> {
  const workspaceDir = path.join(testEnv.dapCliHome, 'ts-smoke');
  const distDir = path.join(workspaceDir, 'dist');
  const sourcePath = path.join(workspaceDir, 'index.ts');
  const programPath = path.join(distDir, 'index.js');
  const source = `interface Greeting {\n  name: string;\n  message: string;\n}\n\nfunction createGreeting(name: string): Greeting {\n  const message = \`Hello, ${'${name}'}!\`;\n  return { name, message };\n}\n\nfunction sum(left: number, right: number): number {\n  const result = left + right;\n  return result;\n}\n\nif (process.argv[2] === 'run') {\n  createGreeting('TypeScript');\n  sum(4, 5);\n}\n`;
  const transpiled = ts.transpileModule(source, {
    fileName: 'index.ts',
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      sourceMap: true,
      target: ts.ScriptTarget.ES2020,
    },
  });

  await mkdir(distDir, { recursive: true });
  await writeFile(sourcePath, source, 'utf8');
  await writeFile(programPath, transpiled.outputText, 'utf8');
  await writeFile(path.join(distDir, 'index.js.map'), transpiled.sourceMapText ?? '', 'utf8');

  return { workspaceDir, sourcePath, programPath };
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