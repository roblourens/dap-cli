# Phase 3: Built-in and Custom Adapter Support - Pattern Map

**Mapped:** 2026-05-02
**Files analyzed:** 10 new/modified files
**Analogs found:** 6 / 10

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `src/adapters/registry.ts` | service/registry | lookup | `src/sessions/sessionManager.ts` | role-match |
| `src/adapters/config.ts` | config/schema | validation | `src/adapters/descriptor.ts` + `src/config/schema.ts` | role-match |
| `src/config/launchConfig.ts` | config/parser | file-I/O + transform | `src/config/paths.ts` | role-match |
| `src/cli/commands/dapCore.ts` | controller | request-response | `src/cli/commands/sessions.ts` | exact |
| `tests/integration/jsDebugAdapter.test.ts` | test | lifecycle | `tests/integration/fakeAdapterCli.test.ts` | exact |
| `tests/integration/debugpyAdapter.test.ts` | test | lifecycle | `tests/integration/fakeAdapterCli.test.ts` | exact |
| `tests/fixtures/simple-node-app/` | fixture | static | `tests/fixtures/fake-adapter-entry.ts` | partial |
| `tests/fixtures/simple-ts-app/` | fixture | static | `tests/fixtures/fake-adapter-entry.ts` | partial |
| `tests/fixtures/simple-chrome-page/` | fixture | static | `tests/fixtures/fake-adapter-entry.ts` | partial |
| `tests/fixtures/simple-python-app/` | fixture | static | `tests/fixtures/fake-adapter-entry.ts` | partial |

## Pattern Assignments

### `src/adapters/registry.ts` (service/registry, lookup)

**Analog:** `src/sessions/sessionManager.ts`

**Imports pattern** (lines 1-3):
```typescript
import { resolveTargetSession } from './activeSession.js';
import { createSessionId, projectSessionStatus, projectSessionSummary, type OwnedAdapterMetadata, type SessionLifecycle, type SessionRecord, type SessionStatus, type SessionSummary } from './session.js';
import { SessionStore, type SessionStoreData } from './sessionStore.js';
```

**Registry shape pattern** (lines 10-20):
```typescript
export interface SessionManagerOptions {
  dapCliHome?: string | undefined;
  signalProcess?: (pid: number, signal: NodeJS.Signals) => void;
}

export class SessionManager {
  private data: SessionStoreData = { sessions: [] };

  private constructor(private readonly store: SessionStore, private readonly signalProcess: (pid: number, signal: NodeJS.Signals) => void) {}

  public static async create(options: SessionManagerOptions = {}): Promise<SessionManager> {
    const manager = new SessionManager(new SessionStore({ dapCliHome: options.dapCliHome }), options.signalProcess ?? ((pid, signal) => process.kill(pid, signal)));
    manager.data = await manager.store.read();
    return manager;
  }
```

**Lookup pattern** (lines 42-44):
```typescript
  public list(): readonly SessionSummary[] {
    return this.data.sessions.map(projectSessionSummary);
  }
```

**Resolution pattern** (lines 46-48):
```typescript
  public status(target?: string): SessionStatus {
    return projectSessionStatus(this.target(target, false));
  }
```

---

### `src/adapters/config.ts` (config/schema, validation)

**Analog:** `src/adapters/descriptor.ts`

**Schema definition pattern** (lines 1-23):
```typescript
import { z } from 'zod';

export interface AdapterDescriptor {
  id: string;
  label: string;
  transport:
    | { kind: 'stdio'; command: string; args: string[]; cwd?: string | undefined; env?: Record<string, string> | undefined }
    | { kind: 'socket'; host: '127.0.0.1'; port: number };
}

export const adapterDescriptorSchema: z.ZodType<AdapterDescriptor> = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  transport: z.discriminatedUnion('kind', [
    z.object({
      kind: z.literal('stdio'),
      command: z.string().min(1),
      args: z.array(z.string()),
      cwd: z.string().min(1).optional(),
      env: z.record(z.string(), z.string()).optional(),
    }),
    z.object({
      kind: z.literal('socket'),
      host: z.literal('127.0.0.1'),
      port: z.number().int().positive(),
    }),
  ]),
});
```

**Validation pattern** (lines 25-27):
```typescript
export function parseAdapterDescriptor(value: unknown): AdapterDescriptor {
  return adapterDescriptorSchema.parse(value);
}
```

---

### `src/config/launchConfig.ts` (config/parser, file-I/O + transform)

**Analog:** `src/config/paths.ts`

**Imports pattern** (lines 1-2):
```typescript
import { homedir } from 'node:os';
import path from 'node:path';
```

**Environment-aware resolution pattern** (lines 6-15):
```typescript
export function getDapCliHome(env: NodeJS.ProcessEnv = process.env): string {
  const configuredHome = env.DAP_CLI_HOME;

  if (configuredHome !== undefined && configuredHome.trim().length > 0) {
    return path.resolve(configuredHome);
  }

  return getDefaultDapCliHome();
}
```

**Path construction pattern** (lines 17-19):
```typescript
export function getDapCliStateDir(env: NodeJS.ProcessEnv = process.env): string {
  return path.join(getDapCliHome(env), 'state');
}
```

**Default home resolution pattern** (lines 25-27):
```typescript
function getDefaultDapCliHome(): string {
  return path.join(homedir(), '.dap-cli');
}
```

---

### `src/cli/commands/dapCore.ts` (controller, request-response)

**Analog:** `src/cli/commands/sessions.ts`

**Imports pattern** (lines 1-3):
```typescript
import type { Command } from 'commander';
import { createControllerClient } from '../../controller/client.js';
import { type JsonWritable, writeJsonSuccess } from '../output.js';
```

**Command registration pattern** (lines 6-18):
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

**Controller client wrapper pattern** (lines 43-49):
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

**Optional params helper pattern** (lines 51-53):
```typescript
function createNameParams(name: string | undefined): { name?: string } {
  return name === undefined ? {} : { name };
}
```

**Existing dapCore.ts patterns to preserve** (dapCore.ts lines 91-97):
```typescript
function createFakeDescriptor(script: string): AdapterDescriptor {
  return {
    id: 'fake',
    label: 'Generic fake adapter',
    transport: {
      kind: 'stdio',
      command: process.execPath,
      args: ['--experimental-strip-types', path.join(process.cwd(), 'tests', 'fixtures', 'fake-adapter-entry.ts'), '--script', script],
    },
  };
}
```

**JSON parsing with error handling** (dapCore.ts lines 99-106):
```typescript
function parseJsonOption(value: string): unknown {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    throw usageError('Invalid JSON argument.', { code: 'invalid_json' });
  }
}
```

---

### `tests/integration/jsDebugAdapter.test.ts` (test, lifecycle)

**Analog:** `tests/integration/fakeAdapterCli.test.ts`

**Imports pattern** (lines 1-7):
```typescript
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import type { AdapterDescriptor } from '../../src/adapters/descriptor.js';
import { createControllerClient } from '../../src/controller/client.js';
import { startControllerServer, type ControllerServer } from '../../src/controller/server.js';
import { createFakeAdapterScript, startFakeSocketAdapter } from '../../src/testing/fakeAdapter.js';
import { createCliTestEnv, runCli, type CliTestEnv } from '../helpers/runCli.js';
```

**Test lifecycle setup pattern** (lines 22-31):
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
    server = undefined;
  }
  await testEnv.cleanup();
});
```

**Launch + capabilities + status flow pattern** (lines 36-61):
```typescript
describe('fake adapter controller integration', () => {
  test('launches a fake adapter over stdio and polls status, events, request, stop, and cleanup', async () => {
    const start = await runCli(['start'], { env: testEnv.env });
    expect(start.exitCode).toBe(0);
    const startEnvelope = start.envelope as JsonEnvelope<{ pid: number }>;

    const launch = await runCli(['launch', '--adapter', 'fake', '--script', 'stopped-on-entry', '--name', 'demo'], { env: testEnv.env });
    expect(launch.exitCode, JSON.stringify(launch)).toBe(0);
    const launchEnvelope = parseEnvelope<{ sessionId: string; name: string; lifecycle: string; eventCursor: number }>(launch.stdout);
    expect(launchEnvelope.data.sessionId).toMatch(/^sess_/);
    expect(launchEnvelope.data.name).toBe('demo');
    expect(launchEnvelope.data.lifecycle).toBe('stopped');

    const capabilities = await runCli(['capabilities', '--name', 'demo'], { env: testEnv.env });
    const capabilitiesEnvelope = parseEnvelope<{ sessionId: string; name: string; adapterId: string; capabilities: { supportsConfigurationDoneRequest?: boolean } }>(capabilities.stdout);
    expect(capabilitiesEnvelope.data.sessionId).toBe(launchEnvelope.data.sessionId);
    expect(capabilitiesEnvelope.data.name).toBe('demo');
    expect(capabilitiesEnvelope.data.adapterId).toBe('fake');
    expect(capabilitiesEnvelope.data.capabilities.supportsConfigurationDoneRequest).toBe(true);

    const controllerStatus = await runCli(['status'], { env: testEnv.env });
    const controllerStatusEnvelope = controllerStatus.envelope as JsonEnvelope<{ id: string; name: string; status: string }>;
    expect(controllerStatusEnvelope.data.id).toBe(launchEnvelope.data.sessionId);
```

**Events polling pattern** (lines 70-76):
```typescript
    const events = await runCli(['events', '--name', 'demo', '--limit', '5'], { env: testEnv.env });
    const eventsEnvelope = parseEnvelope<{ sessionId: string; name: string; events: Array<{ event: string }>; cursor: number; dropped: number }>(events.stdout);
    expect(eventsEnvelope.data.name).toBe('demo');
    expect(eventsEnvelope.data.events.map(event => event.event)).toContain('stopped');
    expect(eventsEnvelope.data.dropped).toBe(0);

    const cursorPoll = await runCli(['events', '--name', 'demo', '--after-cursor', '0', '--limit', '1'], { env: testEnv.env });
```

**Stop + cleanup pattern** (lines 85-88):
```typescript
    const stop = await runCli(['stop', '--name', 'demo'], { env: testEnv.env });
    expect(parseEnvelope<{ name: string; status: string }>(stop.stdout).data.status).toBe('terminated');

    const cleanup = await runCli(['cleanup'], { env: testEnv.env });
```

---

### `tests/integration/debugpyAdapter.test.ts` (test, lifecycle)

**Analog:** `tests/integration/fakeAdapterCli.test.ts` (same as above)

Use identical test structure pattern, but with debugpy-specific:
- Adapter descriptor for debugpy (stdio with `python -m debugpy.adapter`)
- Python fixture launch config
- Python-specific breakpoint paths

---

### Test Helper Pattern from `tests/helpers/runCli.ts`

**Isolated test env creation** (lines 24-30):
```typescript
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
```

**CLI invocation with env override** (lines 32-50):
```typescript
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
```

---

### Temp Environment Pattern from `src/testing/tempEnv.ts`

**Temp directory creation** (lines 1-18):
```typescript
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export interface TempDapCliEnv {
  dapCliHome: string;
  env: NodeJS.ProcessEnv;
  cleanup(): Promise<void>;
}

export async function createTempDapCliEnv(prefix = 'dap-cli-'): Promise<TempDapCliEnv> {
  const dapCliHome = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  return {
    dapCliHome,
    env: { ...process.env, DAP_CLI_HOME: dapCliHome },
    async cleanup(): Promise<void> {
      await fs.rm(dapCliHome, { recursive: true, force: true });
    },
  };
}
```

---

## Shared Patterns

### Error Handling

**Source:** `src/cli/errors.ts`
**Apply to:** All CLI commands and config parsing

```typescript
export function usageError(message: string, options?: CliErrorOptions): CliError {
  return new CliError(message, 'usage', ExitCode.Usage, options);
}

export function adapterError(message: string, options?: CliErrorOptions): CliError {
  return new CliError(message, 'adapter', ExitCode.Adapter, options);
}
```

### JSON Output Envelope

**Source:** `src/cli/output.ts`
**Apply to:** All CLI command responses

```typescript
export function writeJsonSuccess<T>(data: T, meta: JsonMetaInput, stream: JsonWritable = process.stdout): void {
  stream.write(toJsonString({ ok: true, data, meta: createMeta(meta) }));
}

export function writeJsonFailure(error: CliError, meta: JsonMetaInput, stream: JsonWritable = process.stdout): void {
  stream.write(toJsonString({ ok: false, error: toJsonErrorPayload(error), meta: createMeta(meta) }));
}
```

### Adapter Process Lifecycle

**Source:** `src/adapters/processAdapter.ts`
**Apply to:** Built-in adapter registry

**Process spawn pattern** (lines 16-30):
```typescript
export function startProcessAdapter(options: StartProcessAdapterOptions): StartedProcessAdapter {
  const child = spawn(options.descriptor.command, options.descriptor.args, {
    cwd: options.descriptor.cwd,
    env: options.descriptor.env === undefined ? process.env : { ...process.env, ...options.descriptor.env },
    stdio: ['pipe', 'pipe', 'pipe'],
    shell: false,
  });
  const stderrTail: string[] = [];
  const logPath = path.join(options.logDir, `${options.adapterId}-${child.pid ?? process.pid}.log`);
  const logStream = createWriteStream(logPath, { flags: 'a' });

  child.stderr.on('data', (chunk: Buffer) => {
    const text = chunk.toString('utf8');
    logStream.write(text);
    appendStderrTail(stderrTail, text);
  });
```

**Close pattern** (lines 38-45):
```typescript
    close(): Promise<void> {
      child.stdin.end();
      child.kill('SIGTERM');
      return new Promise(resolve => {
        logStream.end(() => resolve());
      });
    },
```

### Socket Transport

**Source:** `src/adapters/socketAdapter.ts`
**Apply to:** Adapter registry socket mode

```typescript
export async function connectSocketAdapter(adapterId: string, descriptor: Extract<AdapterDescriptor['transport'], { kind: 'socket' }>): Promise<ConnectedSocketAdapter> {
  const transport = await connectSocketTransport({ name: adapterId, host: descriptor.host, port: descriptor.port });
  return {
    transport,
    close: () => transport.close(),
  };
}
```

## No Analog Found

Files with no close match in the codebase (planner should use RESEARCH.md patterns instead):

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| (none) | — | — | All files have role-match or exact analogs |

## Metadata

**Analog search scope:** src/, tests/, .planning/phases/03-*
**Files scanned:** 15
**Pattern extraction date:** 2026-05-02
