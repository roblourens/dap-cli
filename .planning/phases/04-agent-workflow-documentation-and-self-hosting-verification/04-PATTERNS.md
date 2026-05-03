# Phase 4: Agent Workflow, Documentation, and Self-Hosting Verification - Pattern Map

**Mapped:** 2026-05-03
**Files analyzed:** 20 likely new/modified files
**Analogs found:** 17 / 20

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `README.md` | documentation | request-response workflow | `docs/ADAPTER-SETUP.md` | partial-match |
| `docs/ADAPTER-SETUP.md` | documentation | file-I/O/setup | `docs/ADAPTER-SETUP.md` | exact |
| `docs/AGENT-WORKFLOWS.md` | documentation | request-response workflow | `tests/integration/fakeAdapterCli.test.ts` | role-match |
| `docs/PLAYWRIGHT-INTEROP.md` | documentation | event-driven/request-response | `tests/integration/jsDebugAdapter.test.ts` + `tests/fixtures/simple-chrome-page/app.js` | partial-match |
| `docs/VERIFICATION.md` | documentation | batch verification | `.planning/phases/03-built-in-and-custom-adapter-support/03-04-SUMMARY.md` | role-match |
| `.planning/BACKLOG.md` or phase-local follow-up artifact | planning documentation | batch/discovery | `.planning/STATE.md` | role-match |
| `package.json` | config | batch scripts/package metadata | `package.json` | exact |
| `scripts/*` readiness/provisioning entrypoint | utility | file-I/O/process | `src/adapters/builtins/jsDebug.ts` + `src/config/paths.ts` | partial-match |
| `src/cli/program.ts` | controller/router | request-response | `src/cli/program.ts` | exact |
| `src/cli/commands/doctor.ts` or readiness command | controller | request-response/file-I/O | `src/cli/commands/controller.ts` + `src/cli/commands/sessions.ts` | role-match |
| `src/cli/commands/*.ts` help polish | controller | request-response | `src/cli/commands/dapCore.ts` + `src/cli/commands/dapAliases.ts` | exact |
| `src/adapters/builtins/jsDebug.ts` | service/config | file-I/O/process | `src/adapters/builtins/jsDebug.ts` | exact |
| `src/adapters/builtins/debugpy.ts` | service/config | process | `src/adapters/builtins/debugpy.ts` | exact |
| `src/adapters/registry.ts` | service/registry | request-response/config | `src/adapters/registry.ts` | exact |
| `src/config/paths.ts` | utility/config | file-I/O | `src/config/paths.ts` | exact |
| `tests/integration/jsDebugAdapter.test.ts` | test | event-driven/request-response | `tests/integration/jsDebugAdapter.test.ts` | exact |
| `tests/integration/debugpyAdapter.test.ts` | test | event-driven/request-response | `tests/integration/debugpyAdapter.test.ts` | exact |
| `tests/integration/selfHosting*.test.ts` | test | request-response/batch | `tests/integration/fakeAdapterCli.test.ts` | role-match |
| `tests/integration/playwrightInterop*.test.ts` | test | event-driven/request-response | `tests/integration/jsDebugAdapter.test.ts` | partial-match |
| `tests/fixtures/*` browser/CLI targets | fixture | file-I/O/process | `tests/fixtures/simple-node-app/index.js`, `tests/fixtures/simple-python-app/main.py`, `tests/fixtures/simple-chrome-page/app.js` | exact |

## Pattern Assignments

### `README.md` (documentation, request-response workflow)

**Analog:** `docs/ADAPTER-SETUP.md`

**Docs structure pattern** (lines 1-35):

```markdown
# Adapter Setup

## Overview

dap-cli launches debug adapters as external DAP services. Built-in adapter IDs provide the descriptor shape, but the adapter binaries still need to be available on the machine running dap-cli.

## JavaScript (js-debug)

### Method 1: GitHub Release Tarball

```bash
mkdir -p ~/.dap-cli/adapters
curl -L https://github.com/microsoft/vscode-js-debug/releases/download/v1.117.0/js-debug-dap-v1.117.0.tar.gz | tar xzf - -C ~/.dap-cli/adapters/
```
```

**Apply carefully:** The README should copy the direct heading + fenced command style, but not the current manual built-in setup framing. Phase 4 decisions require built-in js-debug/debugpy to be first-party/readiness-managed for the intended v1 path.

**Command example source:** Use real CLI command names from `src/cli/commands/dapCore.ts` and `src/cli/commands/dapAliases.ts`, especially `launch`, `status`, `events`, `threads`, `stack`, `scopes`, `variables`, `evaluate`, `continue`, and `cleanup`.

---

### `docs/ADAPTER-SETUP.md` (documentation, file-I/O/setup)

**Analog:** `docs/ADAPTER-SETUP.md`

**Current troubleshooting pattern** (lines 25-53):

```markdown
## Troubleshooting

- `js_debug_not_found`: install the js-debug DAP tarball into `DAP_CLI_HOME/adapters/js-debug`.
- Chrome headless failures: verify `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome` exists on macOS or configure Chrome through adapter-native js-debug options.
- Electron failures: install Electron in the project that owns the target app, then set `--runtime-executable electron` or the full Electron binary path.

## Python (debugpy)

Install debugpy into the Python environment that dap-cli will use:
```

**Required phase adjustment:** Keep this doc as the advanced/custom adapter and troubleshooting guide. Move manual js-debug/debugpy provisioning out of the built-in happy path and replace it with the chosen first-party readiness/provisioning flow.

---

### `docs/AGENT-WORKFLOWS.md` (documentation, request-response workflow)

**Analog:** `tests/integration/fakeAdapterCli.test.ts`

**Polling + inspection workflow pattern** (lines 39-101):

```typescript
const launch = await runCli(['launch', '--adapter', 'fake', '--script', 'stopped-on-entry', '--name', 'demo'], { env: testEnv.env });
expect(launch.exitCode, JSON.stringify(launch)).toBe(0);

const status = await runCli(['status', '--name', 'demo'], { env: testEnv.env });
const statusEnvelope = parseEnvelope<{ name: string; status: string; logPath?: string; stderrTail: string[] }>(status.stdout);
expect(statusEnvelope.data.status).toBe('stopped');

const events = await runCli(['events', '--name', 'demo', '--limit', '5'], { env: testEnv.env });
const eventsEnvelope = parseEnvelope<{ sessionId: string; name: string; events: Array<{ event: string }>; cursor: number; dropped: number }>(events.stdout);
expect(eventsEnvelope.data.events.map(event => event.event)).toContain('stopped');

const request = await runCli(['request', 'threads', '--name', 'demo', '--json', '{}'], { env: testEnv.env });
expect(parseEnvelope<{ threads: Array<{ id: number; name: string }> }>(request.stdout).data.threads).toEqual([{ id: 1, name: 'main' }]);
```

**Alias inspection pattern** (lines 246-277):

```typescript
const breakpoints = await runCli(['breakpoints', 'set', '--source', 'app.ts', '--line', '5', '--name', 'inspect'], { env: testEnv.env });
expect(parseEnvelope<{ breakpoints: Array<{ verified: boolean; line: number }> }>(breakpoints.stdout).data.breakpoints).toEqual([{ id: 1, verified: true, line: 5 }]);

const stack = await runCli(['stack', '--thread-id', '1', '--name', 'inspect'], { env: testEnv.env });
expect(parseEnvelope<{ stackFrames: Array<{ id: number; name: string }> }>(stack.stdout).data.stackFrames).toEqual([expect.objectContaining({ id: 10, name: 'main' })]);

const variables = await runCli(['variables', '--variables-reference', '100', '--name', 'inspect'], { env: testEnv.env });
expect(parseEnvelope<{ variables: Array<{ name: string; value: string }> }>(variables.stdout).data.variables).toEqual([{ name: 'value', value: '1', variablesReference: 0 }]);
```

**Apply to docs:** Convert test arrays to shell examples and preserve the sequence: launch/attach -> poll `status`/`events` -> inspect `threads`/`stack`/`scopes`/`variables` -> act with `evaluate`/`continue` -> `cleanup`.

---

### `docs/PLAYWRIGHT-INTEROP.md` (documentation, event-driven/request-response)

**Analog:** `tests/integration/jsDebugAdapter.test.ts` and `tests/fixtures/simple-chrome-page/app.js`

**Browser fixture pattern** (`tests/fixtures/simple-chrome-page/app.js`, lines 1-10):

```javascript
function calculate(left, right) {
  const result = left + right;
  document.getElementById('result').textContent = String(result);
  return result;
}

function run() {
  return calculate(2, 3);
}

run();
```

**Chrome smoke launch pattern** (`tests/integration/jsDebugAdapter.test.ts`, lines 74-90):

```typescript
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
```

**Apply to docs/tests:** Start dap-cli/js-debug and configure breakpoints before Playwright drives UI actions. The docs must teach polling through `events --after-cursor` and state inspection rather than a streaming wait.

---

### `docs/VERIFICATION.md` (documentation, batch verification)

**Analog:** `.planning/phases/03-built-in-and-custom-adapter-support/03-04-SUMMARY.md`

**Verification summary pattern** (lines 24-35):

```markdown
## Verification

- `npm test -- tests/integration/fakeAdapterCli.test.ts tests/adapters/registry.test.ts tests/config/launchConfig.test.ts tests/integration/jsDebugAdapter.test.ts tests/integration/debugpyAdapter.test.ts` passed: 32 tests passed, 6 skipped.
- `npm run typecheck` passed.
- `npm run lint` passed.
- `npm run check` passed: typecheck, lint, tests, and build. Full suite: 18 files passed, 91 tests passed, 6 skipped.

## Phase 3 Coverage Notes

- Tested directly: fake/custom adapter launch and attach, config precedence, named launch config mapping, adapter defaults, registry resolution, js-debug and debugpy descriptors, setup diagnostics, process cleanup, and full project checks.
```

**Apply to docs:** Record final v1 evidence as command + result + coverage note. For Phase 4, skipped real adapter smokes should be treated as a gap until the readiness/provisioning lane closes them.

---

### `.planning/BACKLOG.md` or phase-local follow-up artifact (planning documentation, batch/discovery)

**Analog:** `.planning/STATE.md`

**Planning status pattern** (lines 21-38):

```markdown
## Current Position

Phase: 4 of 4 (Agent Workflow, Documentation, and Self-Hosting Verification)
Plan: 0 of 4 complete in current phase
Status: Phase 3 verified complete; ready to start Phase 4
Last activity: 2026-05-03 - Verified Phase 3 built-in/custom adapter support and updated requirement traceability.

## Pending Todos

- Start Phase 4 agent workflow, documentation, and self-hosting verification.

## Blockers/Concerns

None yet.
```

**Apply to backlog:** Keep discoveries durable and terse. Use a simple table with source workflow, issue, severity, owner/status, and follow-up requirement/plan. Do not file external GitHub issues unless explicitly asked.

---

### `package.json` (config, batch scripts/package metadata)

**Analog:** `package.json`

**Script and dependency pattern** (lines 1-30):

```json
{
  "name": "dap-cli",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "description": "Agent-facing Debug Adapter Protocol CLI.",
  "bin": {
    "dap-cli": "dist/index.js"
  },
  "engines": {
    "node": ">=22"
  },
  "scripts": {
    "build": "tsup",
    "generate:dap-commands": "node --experimental-strip-types src/generator/dapCommandRegistryGenerator.ts",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "lint": "eslint src tests *.config.ts",
    "check": "npm run typecheck && npm run lint && npm test && npm run build"
  }
}
```

**Apply to readiness:** Add scripts only when they become part of the verified default flow. Keep `check` as the final aggregate gate; add narrower scripts for adapter setup/smokes/Playwright only if the implementation needs discoverable commands.

---

### `scripts/*` readiness/provisioning entrypoint (utility, file-I/O/process)

**Analog:** `src/adapters/builtins/jsDebug.ts` and `src/config/paths.ts`

**DAP_CLI_HOME path pattern** (`src/config/paths.ts`, lines 1-18):

```typescript
const appDirectoryName = '.dap-cli';

export function getDapCliHome(env: NodeJS.ProcessEnv = process.env): string {
  const configuredHome = env.DAP_CLI_HOME;

  if (configuredHome !== undefined && configuredHome.trim().length > 0) {
    return path.resolve(configuredHome);
  }

  return getDefaultDapCliHome();
}
```

**Adapter resolver diagnostics pattern** (`src/adapters/builtins/jsDebug.ts`, lines 16-35):

```typescript
function resolveDefaultJsDebugPath(): string {
  const candidates = [
    path.join(getDapCliHome(), 'adapters', 'js-debug', 'src', 'dapDebugServer.js'),
    path.join(process.cwd(), 'node_modules', 'vscode-js-debug', 'src', 'dapDebugServer.js'),
  ];

  const found = candidates.find(candidate => existsSync(candidate));
  if (found !== undefined) {
    return found;
  }

  throw usageError('js-debug adapter is not installed.', {
    code: 'js_debug_not_found',
    diagnostics: [
      'Install js-debug from the GitHub release tarball into DAP_CLI_HOME/adapters/js-debug, or see docs/ADAPTER-SETUP.md.',
      `Checked: ${candidates.join(', ')}`,
    ],
  });
}
```

**Apply to scripts:** Reuse `DAP_CLI_HOME` semantics. If a script provisions files, it should land under the same adapter cache shape the resolver checks, and diagnostics should print the checked paths/version.

---

### `src/cli/program.ts` (controller/router, request-response)

**Analog:** `src/cli/program.ts`

**Program registration pattern** (lines 1-24):

```typescript
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
  registerGeneratedDapCommands(program, stdout);
  registerDapAliasCommands(program, stdout);

  return program;
}
```

**Apply to new commands:** New readiness/doctor command modules should be registered here with the same `stdout` injection pattern. Keep program creation side-effect-light for tests.

---

### `src/cli/commands/doctor.ts` or readiness command (controller, request-response/file-I/O)

**Analog:** `src/cli/commands/controller.ts` and `src/cli/commands/sessions.ts`

**Command action + JSON output pattern** (`src/cli/commands/controller.ts`, lines 25-63):

```typescript
program
  .command('status')
  .option('--name <name>', 'session name or id')
  .description('Inspect local controller or session status')
  .action(async (options: { name?: string }) => {
    const client = await createControllerClient({ dapCliHome: process.env.DAP_CLI_HOME });
    try {
      const status = await requestSessionOrControllerStatus(client, options.name);
      writeJsonSuccess(status, { command: 'status' }, stdout);
    } finally {
      await client.close();
    }
  });
```

**No-controller helper pattern** (`src/cli/commands/sessions.ts`, lines 31-39):

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

**Apply to doctor:** If it checks local files/processes and does not need the controller, still use `writeJsonSuccess` and `usageError`/`adapterError` for failures. If it queries controller state, use the `try/finally client.close()` pattern.

---

### `src/cli/commands/*.ts` help polish (controller, request-response)

**Analog:** `src/cli/commands/dapCore.ts` and `src/cli/commands/dapAliases.ts`

**Core launch help pattern** (`src/cli/commands/dapCore.ts`, lines 26-57):

```typescript
program
  .command('launch')
  .description('Start a DAP launch session using an adapter id, named launch config, or fake adapter')
  .option('--adapter <adapter>', 'adapter id')
  .option('--config <name>', 'named .vscode/launch.json configuration')
  .option('--json <json>', 'raw adapter-native launch configuration JSON', '{}')
  .option('--script <script>', 'fake adapter script', 'stopped-on-entry')
  .option('--name <name>', 'session name', 'default')
  .option('--program <path>', 'program path override')
  .option('--cwd <path>', 'working directory override')
```

**Alias command pattern** (`src/cli/commands/dapAliases.ts`, lines 28-43):

```typescript
const breakpoints = program.command('breakpoints').description('Manage source breakpoints');
breakpoints
  .command('set')
  .requiredOption('--source <path>', 'source path')
  .requiredOption('--line <number...>', 'breakpoint line')
  .option('--name <name>', 'session name or id')
  .description('Replace breakpoints for a source')
  .action(async (options: BreakpointsSetOptions) => {
    const lines = parseIntegerValues(options.line, 'line');
    await sendAliasRequest(stdout, 'setBreakpoints', {
      source: { path: options.source },
      breakpoints: lines.map(line => ({ line })),
      lines,
    }, options.name, 'breakpoints set');
  });
```

**Apply to help:** Prefer short, agent-readable descriptions. Keep option names stable and aligned with README/docs snippets.

---

### `src/adapters/builtins/jsDebug.ts` (service/config, file-I/O/process)

**Analog:** `src/adapters/builtins/jsDebug.ts`

**Descriptor pattern** (lines 1-14):

```typescript
export function createJsDebugDescriptor(jsDebugPath?: string): AdapterDescriptor {
  const dapServerPath = jsDebugPath ?? resolveDefaultJsDebugPath();
  return {
    id: 'js-debug',
    label: 'JavaScript Debug Adapter (Node, Chrome, Electron)',
    transport: {
      kind: 'stdio',
      command: process.execPath,
      args: [dapServerPath],
    },
  };
}
```

**Apply to provisioning:** Keep the descriptor pure: resolve path -> return external adapter process descriptor. Do not move JavaScript debugging behavior into `protocol/`.

---

### `src/adapters/builtins/debugpy.ts` (service/config, process)

**Analog:** `src/adapters/builtins/debugpy.ts`

**Descriptor pattern** (lines 1-11):

```typescript
export function createDebugpyDescriptor(pythonPath = 'python3'): AdapterDescriptor {
  return {
    id: 'debugpy',
    label: 'Python Debug Adapter (debugpy)',
    transport: {
      kind: 'stdio',
      command: pythonPath,
      args: ['-m', 'debugpy.adapter'],
    },
  };
}
```

**Apply to readiness:** If adding a managed Python path, preserve the descriptor boundary by parameterizing command/args or resolving a configured Python path before returning the `AdapterDescriptor`.

---

### `src/adapters/registry.ts` (service/registry, request-response/config)

**Analog:** `src/adapters/registry.ts`

**Built-in + custom registry pattern** (lines 24-76):

```typescript
export class AdapterRegistry {
  private readonly builtInAdapters = new Map<string, BuiltInAdapterFactory>();
  private readonly customAdapters = new Map<string, AdapterDescriptor>();

  public constructor(options: AdapterRegistryOptions = {}) {
    if (options.includeDefaultBuiltIns !== false) {
      this.builtInAdapters.set('js-debug', {
        id: 'js-debug',
        label: 'JavaScript Debug Adapter (Node, Chrome, Electron)',
        create: () => createJsDebugDescriptor(),
      });
      this.builtInAdapters.set('debugpy', {
        id: 'debugpy',
        label: 'Python Debug Adapter (debugpy)',
        create: () => createDebugpyDescriptor(),
      });
    }

    for (const descriptor of Object.values(options.config?.adapters ?? {})) {
      this.customAdapters.set(descriptor.id, descriptor);
    }
  }
}
```

**Apply to new readiness surfaces:** Use `listAll()` for reporting available adapter IDs. Do not eagerly instantiate built-ins in list operations if that would turn listing into provisioning/failure behavior.

---

### `src/config/paths.ts` (utility/config, file-I/O)

**Analog:** `src/config/paths.ts`

**State/log path pattern** (lines 5-18):

```typescript
export function getDapCliHome(env: NodeJS.ProcessEnv = process.env): string {
  const configuredHome = env.DAP_CLI_HOME;

  if (configuredHome !== undefined && configuredHome.trim().length > 0) {
    return path.resolve(configuredHome);
  }

  return getDefaultDapCliHome();
}

export function getDapCliStateDir(env: NodeJS.ProcessEnv = process.env): string {
  return path.join(getDapCliHome(env), 'state');
}
```

**Apply to adapter cache paths:** Add new cache/config path helpers here only if multiple modules need them. Keep environment override support testable by accepting `env` where appropriate.

---

### `tests/integration/jsDebugAdapter.test.ts` (test, event-driven/request-response)

**Analog:** `tests/integration/jsDebugAdapter.test.ts`

**Availability gate pattern to replace for v1 default smokes** (lines 1-18):

```typescript
const jsDebugPath = path.join(process.env.DAP_CLI_HOME ?? '', 'adapters', 'js-debug', 'src', 'dapDebugServer.js');
const localJsDebugPath = path.join(process.cwd(), 'node_modules', 'vscode-js-debug', 'src', 'dapDebugServer.js');
const hasJsDebug = existsSync(jsDebugPath) || existsSync(localJsDebugPath);
const chromePath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const hasChrome = existsSync(chromePath);
```

**DAP smoke waterfall pattern** (lines 128-180):

```typescript
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
```

**Apply to Phase 4:** Keep the request/event waterfall. After provisioning is implemented, remove or narrow `skipIf(!hasJsDebug)` so default checks prove built-in adapter availability.

---

### `tests/integration/debugpyAdapter.test.ts` (test, event-driven/request-response)

**Analog:** `tests/integration/debugpyAdapter.test.ts`

**Debugpy availability pattern to replace for v1 default smokes** (lines 1-15):

```typescript
const debugpyProbe = spawnSync('python3', ['-c', 'import debugpy'], { stdio: 'ignore' });
const hasDebugpy = debugpyProbe.status === 0;
```

**Attach target pattern** (lines 131-143):

```typescript
async function startAttachTarget(): Promise<AttachTarget> {
  const port = await getFreePort();
  const scriptDir = path.join(testEnv.dapCliHome, 'debugpy-attach-target');
  const scriptPath = path.join(scriptDir, 'target.py');
  await mkdir(scriptDir, { recursive: true });
  await writeFile(scriptPath, `import debugpy\n\ndef calculate(left, right):\n    result = left + right\n    return result\n\ndebugpy.listen(('127.0.0.1', ${port}))\nprint('ready', flush=True)\ndebugpy.wait_for_client()\ncalculate(2, 3)\n`, 'utf8');

  const child = spawn('python3', [scriptPath], { stdio: ['pipe', 'pipe', 'pipe'] });
  await waitForProcessOutput(child, 'ready');
  return { port, scriptPath, process: child };
}
```

**Apply to Phase 4:** Reuse localhost-only attach patterns. If managed debugpy changes the Python executable, route tests through the same descriptor/readiness path rather than hard-coded `python3` where possible.

---

### `tests/integration/selfHosting*.test.ts` (test, request-response/batch)

**Analog:** `tests/integration/fakeAdapterCli.test.ts` and `tests/helpers/runCli.ts`

**Isolated CLI environment pattern** (`tests/helpers/runCli.ts`, lines 17-58):

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

export async function runCli(args: readonly string[], options: RunCliOptions = {}): Promise<RunCliResult> {
  const previousDapCliHome = process.env.DAP_CLI_HOME;
  const previousDapCliEntrypoint = process.env.DAP_CLI_ENTRYPOINT;
  const env = options.env ?? process.env;
  setOptionalEnv('DAP_CLI_HOME', env.DAP_CLI_HOME);
  setOptionalEnv('DAP_CLI_ENTRYPOINT', env.DAP_CLI_ENTRYPOINT);
```

**End-to-end CLI workflow pattern** (`tests/integration/fakeAdapterCli.test.ts`, lines 36-115):

```typescript
const start = await runCli(['start'], { env: testEnv.env });
expect(start.exitCode).toBe(0);

const launch = await runCli(['launch', '--adapter', 'fake', '--script', 'stopped-on-entry', '--name', 'demo'], { env: testEnv.env });
expect(launch.exitCode, JSON.stringify(launch)).toBe(0);

const events = await runCli(['events', '--name', 'demo', '--limit', '5'], { env: testEnv.env });
const eventsEnvelope = parseEnvelope<{ sessionId: string; name: string; events: Array<{ event: string }>; cursor: number; dropped: number }>(events.stdout);
expect(eventsEnvelope.data.events.map(event => event.event)).toContain('stopped');

const cleanup = await runCli(['cleanup'], { env: testEnv.env });
expect(parseEnvelope<{ cleaned: string[]; failed: unknown[] }>(cleanup.stdout).data.failed).toEqual([]);
```

**Apply to self-hosting:** Start with fixture-backed CLI workflows through `runCli`, then add one capstone where the target program is dap-cli or a dap-cli command path. Always isolate `DAP_CLI_HOME` and clean up the controller.

---

### `tests/integration/playwrightInterop*.test.ts` (test, event-driven/request-response)

**Analog:** `tests/integration/jsDebugAdapter.test.ts`

**Event wait helper pattern** (lines 210-225):

```typescript
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
```

**Inspection helper pattern** (lines 227-254):

```typescript
async function firstStackFrame(client: DapClient, threadId: number): Promise<DebugProtocol.StackFrame> {
  const stack = await client.request<DebugProtocol.StackTraceResponse['body']>('stackTrace', { threadId, startFrame: 0, levels: 5 });
  const frame = stack.stackFrames[0];
  if (frame === undefined) {
    throw new Error('Adapter stopped without reporting a stack frame.');
  }

  return frame;
}
```

**Apply to Playwright:** Use js-debug’s DAP setup/inspection helpers for debugger assertions and Playwright only for UI actions. Avoid arbitrary delays; establish debugger readiness before browser interaction.

---

### `tests/fixtures/*` browser/CLI targets (fixture, file-I/O/process)

**Analog:** existing simple fixtures

**Node fixture pattern** (`tests/fixtures/simple-node-app/index.js`, lines 1-15):

```javascript
function calculate(left, right) {
  const result = left + right;
  console.log(`Result: ${result}`);
  return result;
}

if (process.argv[2] === 'run') {
  greet('World');
  calculate(2, 3);
}

module.exports = { greet, calculate };
```

**Python fixture pattern** (`tests/fixtures/simple-python-app/main.py`, lines 1-17):

```python
def calculate(left, right):
    result = left + right
    print(f"Result: {result}")
    return result


if __name__ == "__main__":
    import sys

    if len(sys.argv) > 1 and sys.argv[1] == "run":
        greet("World")
        calculate(2, 3)
```

**Apply to new fixtures:** Keep fixtures tiny, deterministic, breakpoint-friendly, and explicit about the `run` trigger so tests and docs can point at stable lines.

## Shared Patterns

### Commander Command Registration

**Source:** `src/cli/program.ts`, `src/cli/commands/*.ts`
**Apply to:** CLI help polish, readiness/doctor command, any new command module

```typescript
program
  .command('status')
  .option('--name <name>', 'session name or id')
  .description('Inspect local controller or session status')
  .action(async (options: { name?: string }) => {
    const client = await createControllerClient({ dapCliHome: process.env.DAP_CLI_HOME });
    try {
      const status = await requestSessionOrControllerStatus(client, options.name);
      writeJsonSuccess(status, { command: 'status' }, stdout);
    } finally {
      await client.close();
    }
  });
```

### JSON Envelope Contract

**Source:** `src/cli/output.ts`
**Apply to:** all CLI commands, docs examples, tests

```typescript
export function writeJsonSuccess<T>(data: T, meta: JsonMetaInput, stream: JsonWritable = process.stdout): void {
  stream.write(toJsonString({ ok: true, data, meta: createMeta(meta) }));
}

export function writeJsonFailure(error: CliError, meta: JsonMetaInput, stream: JsonWritable = process.stdout): void {
  stream.write(toJsonString({ ok: false, error: toJsonErrorPayload(error), meta: createMeta(meta) }));
}
```

### Structured Error Contract

**Source:** `src/cli/errors.ts`
**Apply to:** readiness/provisioning failures, adapter diagnostics, docs troubleshooting

```typescript
export function usageError(message: string, options?: CliErrorOptions): CliError {
  return new CliError(message, 'usage', ExitCode.Usage, options);
}

export function adapterError(message: string, options?: CliErrorOptions): CliError {
  return new CliError(message, 'adapter', ExitCode.Adapter, options);
}
```

### Adapter Boundary

**Source:** `src/adapters/builtins/jsDebug.ts`, `src/adapters/builtins/debugpy.ts`, `src/adapters/registry.ts`
**Apply to:** built-in provisioning, readiness checks, docs claims

```typescript
return {
  id: 'debugpy',
  label: 'Python Debug Adapter (debugpy)',
  transport: {
    kind: 'stdio',
    command: pythonPath,
    args: ['-m', 'debugpy.adapter'],
  },
};
```

Keep js-debug/debugpy special handling in adapter/config/readiness layers. Do not add language-specific behavior to `src/protocol/`.

### Test Isolation and Cleanup

**Source:** `tests/helpers/runCli.ts`, `src/testing/tempEnv.ts`
**Apply to:** self-hosting tests, Playwright interop tests, readiness tests

```typescript
const tempEnv = await createTempDapCliEnv(prefix);
return {
  ...tempEnv,
  async cleanup(): Promise<void> {
    await stopController(tempEnv.dapCliHome);
    await tempEnv.cleanup();
  },
};
```

### DAP Lifecycle Smoke Waterfall

**Source:** `tests/integration/jsDebugAdapter.test.ts`, `tests/integration/debugpyAdapter.test.ts`
**Apply to:** real adapter smokes, Playwright interop, self-hosting capstone

```typescript
await client.request('initialize', { adapterID: 'js-debug', clientID: 'dap-cli-tests', clientName: 'dap-cli tests', columnsStartAt1: true, linesStartAt1: true, pathFormat: 'path' });
await client.request('launch', options.launchArgs);
await initialized;
await client.request('setBreakpoints', { source: { path: options.sourcePath }, breakpoints: [{ line: options.breakpointLine }] });
const stopped = waitForEvent(client, 'stopped');
await client.request('configurationDone');
const stoppedEvent = await stopped;
```

### Polling-Only Agent Workflow

**Source:** `tests/integration/fakeAdapterCli.test.ts`, `src/cli/commands/dapAliases.ts`
**Apply to:** README, `docs/AGENT-WORKFLOWS.md`, `docs/PLAYWRIGHT-INTEROP.md`

```bash
dap-cli status --name demo
dap-cli events --name demo --after-cursor 0 --limit 20
dap-cli threads --name demo
dap-cli stack --thread-id 1 --name demo
dap-cli scopes --frame-id 10 --name demo
dap-cli variables --variables-reference 100 --name demo
dap-cli continue --thread-id 1 --name demo
```

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `README.md` | documentation | request-response workflow | No README currently exists; use `docs/ADAPTER-SETUP.md` for style and command/test files for truthful examples. |
| `tests/integration/playwrightInterop*.test.ts` | test | event-driven/request-response | No Playwright dependency or test exists yet; use js-debug Chrome smoke plus browser fixture as the closest debugger-side analog. |
| `scripts/*` readiness/provisioning entrypoint | utility | file-I/O/process | No `scripts/` directory exists; use adapter resolver/path helpers and `package.json` script style as boundaries. |

## Metadata

**Analog search scope:** `docs/`, `src/cli/`, `src/adapters/`, `src/config/`, `src/testing/`, `tests/helpers/`, `tests/integration/`, `tests/fixtures/`, `.planning/`
**Files scanned:** 25
**Pattern extraction date:** 2026-05-03
**Primary analogs:** `docs/ADAPTER-SETUP.md`, `package.json`, `src/cli/program.ts`, `src/cli/commands/controller.ts`, `src/cli/commands/dapCore.ts`, `src/cli/commands/dapAliases.ts`, `src/adapters/builtins/jsDebug.ts`, `src/adapters/builtins/debugpy.ts`, `src/adapters/registry.ts`, `src/config/paths.ts`, `tests/helpers/runCli.ts`, `tests/integration/fakeAdapterCli.test.ts`, `tests/integration/jsDebugAdapter.test.ts`, `tests/integration/debugpyAdapter.test.ts`