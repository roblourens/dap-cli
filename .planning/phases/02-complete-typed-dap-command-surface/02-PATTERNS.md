# Phase 2: Complete Typed DAP Command Surface - Pattern Map

**Mapped:** 2026-05-02
**Files analyzed:** 13 likely new/modified files
**Analogs found:** 10 / 13

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `src/generator/dapCommandRegistryGenerator.ts` | utility/build generator | file-I/O + transform | `tests/architecture/moduleBoundaries.test.ts` | partial |
| `src/generated/dapCommandRegistry.ts` | generated model/registry | transform | none | no-analog |
| `src/cli/commands/dapGenerated.ts` | command module | request-response | `src/cli/commands/dapCore.ts` | role + flow exact |
| `src/cli/commands/dapAliases.ts` | command module | request-response | `src/cli/commands/sessions.ts` + `src/cli/commands/dapCore.ts` | role-match |
| `src/cli/program.ts` | CLI config | registration | `src/cli/program.ts` | exact modify |
| `src/controller/requests.ts` | IPC schema/model | request-response validation | `src/controller/requests.ts` | exact modify |
| `src/controller/server.ts` | controller service | request-response + event-driven | `src/controller/server.ts` | exact modify |
| `src/testing/fakeAdapter.ts` | test harness utility | scripted request-response | `src/testing/fakeAdapter.ts` | exact modify |
| `tests/fixtures/fake-adapter-entry.ts` | test fixture executable | scripted request-response | `tests/fixtures/fake-adapter-entry.ts` | exact modify |
| `tests/cli/dapGeneratedCommands.test.ts` | CLI unit/integration test | request-response | `tests/cli/jsonOutput.test.ts` | role-match |
| `tests/integration/fakeAdapterCli.test.ts` | integration test | request-response + fake adapter | `tests/integration/fakeAdapterCli.test.ts` | exact modify |
| `tests/architecture/moduleBoundaries.test.ts` | architecture test | file-I/O scan | `tests/architecture/moduleBoundaries.test.ts` | exact modify |
| `package.json` | config | script wiring | `package.json` | exact modify |

## Pattern Assignments

### `src/cli/commands/dapGenerated.ts` (command module, request-response)

**Analog:** `src/cli/commands/dapCore.ts`

**Imports pattern** (lines 1-6):
```typescript
import path from 'node:path';
import type { Command } from 'commander';
import { usageError } from '../errors.js';
import { createControllerClient } from '../../controller/client.js';
import type { AdapterDescriptor } from '../../adapters/descriptor.js';
import { type JsonWritable, writeJsonSuccess } from '../output.js';
```

Use `type { Command }`, `JsonWritable`, `writeJsonSuccess`, `usageError`, and `createControllerClient`. Do not import protocol or adapter internals into CLI command files.

**Raw DAP request routing pattern** (lines 50-60):
```typescript
program
  .command('request')
  .argument('<command>', 'DAP request command')
  .option('--json <json>', 'request arguments as JSON', '{}')
  .option('--name <name>', 'session name or id')
  .description('Send an internal Phase 1 DAP request to a fake/custom session')
  .action(async (command: string, options: DapRequestCommandOptions) => {
    await withController(stdout, 'request', async client => client.request('dap.request', {
      command,
      args: parseJsonOption(options.json ?? '{}'),
      name: options.name,
```

Generated typed commands should call the same controller method, changing only the user-facing command metadata and normalized `command`/`args` payload.

**Controller wrapper pattern** (lines 90-97):
```typescript
async function withController<T>(stdout: JsonWritable, command: string, callback: (client: Awaited<ReturnType<typeof createControllerClient>>) => Promise<T>): Promise<void> {
  const client = await createControllerClient({ dapCliHome: process.env.DAP_CLI_HOME });
  try {
    writeJsonSuccess(await callback(client), { command }, stdout);
  } finally {
    await client.close();
  }
}
```

Copy this shape or extract one shared helper; preserve the single stdout JSON success envelope.

**JSON option validation pattern** (lines 112-118):
```typescript
function parseJsonOption(value: string): unknown {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    throw usageError('Invalid JSON argument.', { code: 'invalid_json' });
  }
}
```

Generated command `--json` parsing should throw `usageError`, not raw `SyntaxError` or Commander output.

### `src/cli/commands/dapAliases.ts` (command module, request-response)

**Analogs:** `src/cli/commands/sessions.ts`, `src/cli/commands/dapCore.ts`

**Thin command pattern** (`src/cli/commands/sessions.ts` lines 5-31):
```typescript
export function registerSessionCommands(program: Command, stdout: JsonWritable): void {
  program
    .command('sessions')
    .description('List known debug sessions')
    .action(async () => {
      await withController(stdout, 'sessions', async client => client.request('sessions.list'));
    });

  program
    .command('use')
    .argument('<name>', 'session name or id')
    .description('Set the active debug session')
    .action(async (name: string) => {
      await withController(stdout, 'use', async client => client.request('sessions.target', { name }));
    });
```

Aliases should be thin wrappers: parse friendly flags, normalize to registry metadata, then call the same generated-command executor. Avoid duplicating DAP request semantics.

**Name parameter helper pattern** (`src/cli/commands/sessions.ts` lines 53-55):
```typescript
function createNameParams(name: string | undefined): { name?: string } {
  return name === undefined ? {} : { name };
}
```

Reuse this optional-object shape for `--name`, especially for aliases like `stack`, `scopes`, `variables`, `continue`, and stepping commands.

### `src/cli/program.ts` (CLI config, registration)

**Analog:** `src/cli/program.ts`

**Registration pattern** (lines 1-18):
```typescript
import { Command } from 'commander';
import type { JsonWritable } from './output.js';
import { registerControllerCommands } from './commands/controller.js';
import { registerDapCoreCommands } from './commands/dapCore.js';
import { registerSessionCommands } from './commands/sessions.js';

export function createProgram(options: ProgramOptions = {}): Command {
  const program = new Command();
  const stdout = options.stdout ?? process.stdout;

  program
    .name('dap-cli')
    .description('Agent-facing Debug Adapter Protocol CLI')
    .showHelpAfterError()
    .exitOverride();

  registerControllerCommands(program, stdout);
  registerSessionCommands(program, stdout);
  registerDapCoreCommands(program, stdout);
```

Add generated/alias registration here after the core session/controller commands. Keep `exitOverride()` and stdout injection intact.

### `src/controller/requests.ts` (IPC schema/model, request-response validation)

**Analog:** `src/controller/requests.ts`

**Method inventory pattern** (lines 1-31):
```typescript
import { z } from 'zod';

export const controllerRequestMethods = [
  'controller.start',
  'controller.status',
  'controller.shutdown',
  'controller.cleanup',
  'sessions.launch',
  'sessions.attach',
  'sessions.list',
  'sessions.target',
  'sessions.use',
  'sessions.status',
  'sessions.stop',
  'sessions.detach',
  'sessions.close',
  'sessions.cleanup',
  'dap.start',
  'dap.request',
  'dap.continue',
  'dap.stackTrace',
  'dap.scopes',
  'dap.variables',
  'dap.setBreakpoints',
  'events.list',
  'events.recent',
] as const;

export type ControllerRequestMethod = (typeof controllerRequestMethods)[number];

export const controllerRequestMethodSchema = z.enum(controllerRequestMethods);
```

Prefer adding a small capability method such as `dap.capabilities`; do not add one IPC method per generated DAP request. Existing placeholder typed DAP methods are not implemented by the server.

**Failure payload shape** (lines 43-55):
```typescript
export interface ControllerFailureResponse {
  id: string;
  ok: false;
  error: {
    code: string;
    message: string;
    category?: string;
    exitCode?: number;
    diagnostics?: readonly string[];
    sessionId?: string;
    request?: { command: string; seq?: number };
    adapter?: { descriptorId?: string; pid?: number; stderrTail?: readonly string[]; logPath?: string };
  };
}
```

Capability unsupported failures should preserve this shape and include `sessionId`, `request.command`, and adapter diagnostics when available.

### `src/controller/server.ts` (controller service, request-response + event-driven)

**Analog:** `src/controller/server.ts`

**DAP method dispatch pattern** (lines 265-276):
```typescript
private async handleDapRequest(request: ControllerRequest): Promise<unknown> {
  if (request.method === 'dap.start') {
    return this.startDapSession(request.params);
  }
  if (request.method === 'dap.request') {
    return this.routeDapRequest(request.params);
  }
  if (request.method === 'events.recent' || request.method === 'events.list') {
    return this.recentEvents(request.params);
  }

  return undefined;
}
```

Add capability reporting here as another small branch. Keep generated command execution flowing through `dap.request`.

**Capability source and runtime creation pattern** (lines 301-328, 403-411):
```typescript
startResult = await lifecycle.start({ mode: startParams.mode });
// ...
return {
  sessionId: session.id,
  name: session.name,
  lifecycle: lifecycle.state.lifecycle,
  capabilities: startResult.capabilities,
  eventCursor: snapshot.cursor,
};
```

```typescript
interface DapSessionRuntime {
  sessionId: string;
  name: string;
  adapterId: string;
  client: DapClient;
  lifecycle: DapLifecycleController;
  eventCache: DapEventCache;
  adapter: AdapterRuntime;
}
```

Persist `startResult.capabilities` on `DapSessionRuntime` so later `dap.capabilities` and preflight checks can read it.

**DAP request routing pattern** (lines 331-341):
```typescript
private async routeDapRequest(params: unknown): Promise<unknown> {
  const requestParams = parseDapRequestParams(params);
  const runtime = this.resolveRuntime(requestParams.name);
  try {
    return await runtime.client.request(requestParams.command, requestParams.args);
  } catch (error) {
    throw toDapCliError(error, {
      sessionId: runtime.sessionId,
      adapter: getAdapterContext(runtime.adapterId, runtime.adapter),
      request: runtime.client.lastRequest ?? { command: requestParams.command },
    });
```

Capability preflight should happen after `resolveRuntime` and before `runtime.client.request`, so unsupported requests return a handled `CliError` with the same contextual metadata.

**Request parameter boundary** (lines 459-476):
```typescript
function parseDapRequestParams(params: unknown): { name?: string; command: string; args?: unknown } {
  if (!isRecord(params) || typeof params.command !== 'string') {
    throw usageError('Missing DAP request command.', { code: 'missing_parameter' });
  }

  const requestParams: { name?: string; command: string; args?: unknown } = {
    command: params.command,
  };
  if (typeof params.name === 'string') {
    requestParams.name = params.name;
  }
  if ('args' in params) {
    requestParams.args = params.args;
  }

  return requestParams;
}
```

Keep controller validation simple and defensive; CLI/generator metadata should normalize request arguments before this boundary.

**DAP error mapping pattern** (lines 513-555):
```typescript
function toDapCliError(error: unknown, context: { sessionId: string; adapter: CliErrorAdapterContext; request?: CliErrorRequestContext }): CliError {
  if (error instanceof DapResponseError) {
    if (error.message.includes('timed out')) {
      return timeoutError(error.message, {
        code: 'dap_request_timeout',
        diagnostics: [`DAP request timed out: ${error.command}. Check adapter health and retry.`],
        sessionId: context.sessionId,
        request: { command: error.command, seq: error.requestSeq },
        adapter: context.adapter,
      });
    }
```

Use `dapError` or `usageError` with this same context style for unsupported capability preflight. Do not leak raw adapter errors.

### `src/generator/dapCommandRegistryGenerator.ts` (utility/build generator, file-I/O + transform)

**Analog:** `tests/architecture/moduleBoundaries.test.ts`; no existing generator directory.

**Async filesystem recursion pattern** (lines 1-28):
```typescript
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { describe, expect, test } from 'vitest';

async function findTypeScriptFiles(directory: string): Promise<string[]> {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      files.push(...await findTypeScriptFiles(entryPath));
      continue;
    }
```

Use async `fs.promises` for generator I/O. Keep generation deterministic: stable sort request commands, stable object key order, and write one committed TypeScript artifact.

**Package script pattern** (`package.json` lines 10-18):
```json
"scripts": {
  "build": "tsup",
  "typecheck": "tsc --noEmit",
  "test": "vitest run",
  "lint": "eslint src tests *.config.ts",
  "check": "npm run typecheck && npm run lint && npm test && npm run build"
}
```

If a generator command is added, wire it as an npm script and include deterministic coverage in tests. Do not require runtime network access for normal CLI execution.

### `src/generated/dapCommandRegistry.ts` (generated model/registry, transform)

**Analog:** no local generated-code analog.

Follow the research contract: generated metadata, not behavior. Keep this artifact side-effect free and easy to diff. Suggested shape from `02-RESEARCH.md` lines 152-166:
```typescript
export interface DapCommandMetadata {
  readonly command: string;
  readonly cliName: string;
  readonly requestType: string;
  readonly capability?: keyof DebugProtocol.Capabilities;
}
```

Planner should make the generated file export readonly data plus narrow types. CLI command registration should import and consume it; generated code should not import controller/client/output modules.

### `src/testing/fakeAdapter.ts` and `tests/fixtures/fake-adapter-entry.ts` (test harness/fixture, scripted request-response)

**Analogs:** same files.

**Named script selection pattern** (`src/testing/fakeAdapter.ts` lines 8-34):
```typescript
export function createFakeAdapterScript(name: string): FakeAdapterScript {
  if (name === 'attach-stopped') {
    return createLifecycleScript(name, 'attach');
  }

  if (name === 'stderr-stopped') {
    return {
      name,
      steps: [
        { kind: 'writeStderr', text: 'fake adapter diagnostic' },
        ...createLifecycleScript(name, 'launch').steps,
      ],
    };
  }
```

Add representative Phase 2 scripts by name, such as typed stack/scope/variables success, unsupported capability, continued/unpaused failure, and alias success.

**Expected request matching pattern** (`src/testing/fakeAdapter.ts` lines 79-98):
```typescript
const step = remainingSteps.shift();
if (step?.kind !== 'expectRequest' || step.command !== message.command) {
  writeMessage(output, createResponse(message, false, `Unexpected request: ${message.command}`));
  continue;
}

writeResponseAndImmediateSteps(output, stderr, { ...step.respond, request_seq: message.seq }, consumeLeadingNonRequestSteps(remainingSteps));
```

This is ideal for proving aliases produce the exact expected DAP command string.

**Lifecycle baseline** (`tests/fixtures/fake-adapter-entry.ts` lines 57-67):
```typescript
function createLifecycleScript(startCommand: 'launch' | 'attach'): FakeStep[] {
  return [
    { command: 'initialize', body: { capabilities: { supportsConfigurationDoneRequest: true } } },
    { command: startCommand },
    { event: 'initialized' },
    { command: 'configurationDone' },
    { event: 'stopped', body: { reason: 'entry', threadId: 1, allThreadsStopped: true } },
    { command: 'threads', body: { threads: [{ id: 1, name: 'main' }] } },
    { command: 'disconnect' },
```

Extend capability bodies here to test supported and unsupported generated commands.

### `tests/integration/fakeAdapterCli.test.ts` (integration test, request-response + fake adapter)

**Analog:** `tests/integration/fakeAdapterCli.test.ts`

**Shared setup/cleanup pattern** (lines 34-46):
```typescript
let testEnv: CliTestEnv;
let server: ControllerServer | undefined;

beforeEach(async () => {
  testEnv = await createCliTestEnv('dap-cli-fake-adapter-');
  server = await startControllerServer({ dapCliHome: testEnv.dapCliHome });
});

afterEach(async () => {
  if (server !== undefined) {
    await server.stop();
```

Use this for all CLI integration tests that need a persistent controller.

**Representative raw request success pattern** (lines 91-93):
```typescript
const request = await runCli(['request', 'threads', '--name', 'demo', '--json', '{}'], { env: testEnv.env });
expect(parseEnvelope<{ threads: Array<{ id: number; name: string }> }>(request.stdout).data.threads).toEqual([{ id: 1, name: 'main' }]);
```

Add generated command and alias assertions beside this, and compare their envelopes against the same fake adapter response shape.

**Handled failure contract pattern** (lines 116-132):
```typescript
const request = await runCli(['request', 'threads', '--name', 'broken', '--json', '{}'], { env: testEnv.env });
const failure = request.envelope as unknown as JsonFailureEnvelope;

expect(request.exitCode).toBe(5);
expect(request.stderr).toBe('');
expect(failure.ok).toBe(false);
expect(failure.error.category).toBe('dap');
expect(failure.error.exitCode).toBe(5);
expect(failure.error.sessionId).toBe(sessionId);
expect(failure.error.request?.command).toBe('threads');
expect(failure.error.diagnostics.length).toBeGreaterThan(0);
```

Unsupported capability tests should assert the same stdout-only failure contract and request/session context.

### `tests/helpers/runCli.ts` (test helper, command execution)

**Analog:** `tests/helpers/runCli.ts`

**One-envelope runner pattern** (lines 29-51):
```typescript
export async function runCli(args: readonly string[], options: RunCliOptions = {}): Promise<RunCliResult> {
  const previousDapCliHome = process.env.DAP_CLI_HOME;
  const previousDapCliEntrypoint = process.env.DAP_CLI_ENTRYPOINT;
  const env = options.env ?? process.env;
  setOptionalEnv('DAP_CLI_HOME', env.DAP_CLI_HOME);
  setOptionalEnv('DAP_CLI_ENTRYPOINT', env.DAP_CLI_ENTRYPOINT);

  const stdout = new MemoryStream();
  const stderr = new MemoryStream();
```

Do not spawn a real process for normal CLI tests; call `main` through this helper so stdout/stderr contracts are strict and fast.

**Envelope parser guard** (lines 53-64):
```typescript
function parseOneJsonEnvelope(stdout: string): JsonSuccess<unknown> | JsonFailure {
  if (!stdout.endsWith('\n')) {
    throw new Error('CLI stdout was not newline terminated.');
  }

  const lines = stdout.trimEnd().split('\n');
  if (lines.length !== 1) {
    throw new Error(`CLI stdout contained ${lines.length} JSON lines.`);
  }
```

New tests should rely on `result.envelope` when possible and keep stderr empty for handled errors.

### `tests/cli/dapGeneratedCommands.test.ts` and `tests/architecture/moduleBoundaries.test.ts` (tests, transform/file-I/O)

**Analogs:** `tests/cli/jsonOutput.test.ts`, `tests/architecture/moduleBoundaries.test.ts`

**JSON contract assertions** (`tests/cli/jsonOutput.test.ts` lines 20-39):
```typescript
test('success envelopes contain data and command metadata', () => {
  const stream = new MemoryStream();

  writeJsonSuccess({ pid: 123 }, { command: 'status' }, stream);

  expect(stream.output.endsWith('\n')).toBe(true);
  expect(stream.output.trim().split('\n')).toHaveLength(1);
```

Use this style for generated command parser failures and `--json` validation.

**Boundary scan pattern** (`tests/architecture/moduleBoundaries.test.ts` lines 31-58):
```typescript
describe('module boundaries', () => {
  test('CLI modules do not import protocol or adapter process internals', async () => {
    const cliDirectory = path.join(process.cwd(), 'src', 'cli');
    const cliFiles = await findTypeScriptFiles(cliDirectory);

    expect(cliFiles.length).toBeGreaterThan(0);

    for (const filePath of cliFiles) {
      const source = await fs.readFile(filePath, 'utf8');
      const matchingPattern = forbiddenImportPatterns.find(pattern => source.includes(pattern));

      expect(matchingPattern, `${filePath} imports forbidden boundary ${matchingPattern}`).toBeUndefined();
    }
  });
```

Add generated-boundary checks here: generated registry should not import controller/client/output, CLI should not import protocol internals, and protocol stays language-neutral.

## Shared Patterns

### JSON Success/Failure Envelope

**Source:** `src/cli/output.ts` lines 48-52 and 60-82.  
**Apply to:** all CLI command modules and CLI tests.

```typescript
export function writeJsonSuccess<T>(data: T, meta: JsonMetaInput, stream: JsonWritable = process.stdout): void {
  stream.write(toJsonString({ ok: true, data, meta: createMeta(meta) }));
}

export function writeJsonFailure(error: CliError, meta: JsonMetaInput, stream: JsonWritable = process.stdout): void {
  stream.write(toJsonString({ ok: false, error: toJsonErrorPayload(error), meta: createMeta(meta) }));
}
```

### Handled CLI Errors

**Source:** `src/cli/errors.ts` lines 1-56.  
**Apply to:** JSON parsing, invalid generated metadata usage, unsupported capability preflight, controller failure mapping.

```typescript
export type CliErrorCategory = 'usage' | 'controller' | 'session' | 'dap' | 'adapter' | 'timeout' | 'internal';

export function usageError(message: string, options?: CliErrorOptions): CliError {
  return new CliError(message, 'usage', ExitCode.Usage, options);
}

export function dapError(message: string, options?: CliErrorOptions): CliError {
  return new CliError(message, 'dap', ExitCode.Dap, options);
}
```

### Controller IPC Client Pattern

**Source:** `src/controller/client.ts` lines 31-75.  
**Apply to:** generated command executor and alias executor.

```typescript
public async request<TResponse>(method: ControllerRequestMethod, params?: unknown): Promise<TResponse> {
  const id = String(this.nextRequestId);
  this.nextRequestId += 1;
  const socket = await connectControllerEndpoint(this.discovery.endpoint, this.timeoutMs);

  try {
    const rawResponse = await this.sendRequest(socket, id, method, params);
    const response = controllerResponseSchema.parse(JSON.parse(rawResponse));

    if (!response.ok) {
```

### DAP Client Sequencing

**Source:** `src/protocol/dapClient.ts` lines 50-81 and 136-145.  
**Apply to:** controller only; CLI must not bypass it.

```typescript
public request<TResponse = unknown>(command: string, args?: unknown): Promise<TResponse> {
  if (this.closed) {
    return Promise.reject(new DapTransportClosedError());
  }

  const seq = this.nextSeq;
  this.nextSeq += 1;
```

```typescript
if (!response.success) {
  pending.reject(new DapResponseError(response.command, response.request_seq, response.message ?? `DAP request failed: ${response.command}`));
  return;
}
```

### Lifecycle Capabilities

**Source:** `src/protocol/lifecycle.ts` lines 29-51.  
**Apply to:** controller capability storage/reporting.

```typescript
public async start(options: DapLifecycleStartOptions): Promise<DapLifecycleStartResult> {
  this.setRunningState('initializing');
  const capabilities = await this.client.request('initialize', options.initializeArgs);
  this.setRunningState('initialized');
```

The initialize response is already returned to `ControllerServer`; Phase 2 should store it on the runtime rather than re-requesting initialize.

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `src/generated/dapCommandRegistry.ts` | generated model/registry | transform | No generated-code directory or artifact exists yet. Use research metadata shape and keep it side-effect free. |
| `src/generator/dapCommandRegistryGenerator.ts` | utility/build generator | file-I/O + transform | No generator exists yet. Use async fs patterns from architecture tests and deterministic script wiring from `package.json`. |
| Official DAP schema snapshot, if added | data fixture | file-I/O | No local protocol schema snapshot exists. Add only if planner requires networkless regeneration. |

## Metadata

**Analog search scope:** `src/cli`, `src/controller`, `src/protocol`, `src/testing`, `tests/cli`, `tests/integration`, `tests/architecture`, `tests/fixtures`, `package.json`  
**Project skills checked:** `.github/skills/` exists; `.agents/skills/` does not exist in this repo. No skill-specific rule files were needed for this read-only pattern map.  
**Files scanned/read:** 23  
**Pattern extraction date:** 2026-05-02
