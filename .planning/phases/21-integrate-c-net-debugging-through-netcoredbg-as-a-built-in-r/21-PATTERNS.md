# Phase 21: Integrate C#/.NET debugging through NetCoreDbg as a built-in runtime - Pattern Map

**Mapped:** 2026-05-23  
**Files analyzed:** 22  
**Analogs found:** 22 / 22

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `src/adapters/builtins/netCoreDbg.ts` | adapter descriptor | process-spawn/request-response | `src/adapters/builtins/debugpy.ts` + `src/adapters/builtins/delve.ts` | exact composite |
| `src/adapters/registry.ts` | registry/config | request-response | existing built-in entries in same file | exact |
| `src/config/launchConfig.ts` | config transformer | transform/request-response | existing `go`/`debugpy` type map + VS Code stripping | exact |
| `src/config/programInference.ts` | inference utility | transform | existing extension table/default type logic | exact |
| `scripts/setup-adapters.ts` | setup script/service | batch/file-I/O/network | Delve provisioning in same file | role-match |
| `tests/integration/netCoreDbgAdapter.test.ts` | integration test | DAP request-response/process-spawn | `tests/integration/debugpyAdapter.test.ts` + `delveAdapter.test.ts` | exact composite |
| `tests/integration/setupAdapters.test.ts` | integration test | batch/file-I/O | existing setup-adapters tests | exact |
| `tests/integration/launchInference.test.ts` | integration test | transform/request-response | existing inference tests | exact |
| `tests/integration/docsValidation.test.ts` | docs test | file-I/O/validation | existing docs validation tests | exact |
| `tests/fixtures/simple-csharp-app/` | fixture | file-I/O/process launch | `tests/fixtures/simple-go-app/` | role-match |
| `tests/fixtures/simple-csharp-short-lived/` | fixture | process launch | `tests/fixtures/simple-go-app/` | role-match |
| `tests/fixtures/simple-csharp-test/` | fixture | process launch/test-like | `tests/fixtures/simple-go-test/` | role-match |
| `tests/fixtures/simple-csharp-attach/` | fixture | process attach/event-loop | `tests/fixtures/simple-go-attach/` | role-match |
| `docs/adapter-setup.md` | docs | static/reference | Go / Delve section | exact |
| `dap-cli/skills/dap-cli/SKILL.md` | skill index | static/reference | existing reference links | exact |
| `dap-cli/skills/dap-cli/references/csharp-netcoredbg.md` | skill reference | static/workflow | `go-delve.md` | exact |
| `21-SCENARIOS.md` | planning artifact | batch/audit | `20-SCENARIOS.md` | exact |
| `21-EXTERNAL-PROJECT-CANDIDATES.md` | planning artifact | batch/safety audit | `20-EXTERNAL-PROJECT-CANDIDATES.md` | exact |
| `21-EXTERNAL-PROJECT-RESULTS.md` | planning artifact | batch/audit | `20-EXTERNAL-PROJECT-RESULTS.md` | exact |
| `21-RESULTS.md` | planning artifact | event-driven/audit | `20-RESULTS.md` | exact |
| `21-HARDENING-GAPS.md` | planning artifact | issue ledger | `20-HARDENING-GAPS.md` | exact |
| `21-UAT.md` | planning artifact | verification/audit | `20-UAT.md` | exact |

## Pattern Assignments

### `src/adapters/builtins/netCoreDbg.ts`

**Analogs:** `src/adapters/builtins/debugpy.ts`, `src/adapters/builtins/delve.ts`

**Imports pattern** (`debugpy.ts` lines 1-5, `delve.ts` lines 1-6):
```ts
import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import type { AdapterDescriptor } from '../descriptor.js';
import { usageError } from '../../cli/errors.js';
import { getDapCliAdaptersDir } from '../../config/paths.js';
```

**Stdio descriptor pattern** (`debugpy.ts` lines 7-18):
```ts
export function createDebugpyDescriptor(pythonPath?: string): AdapterDescriptor {
  const resolvedPythonPath = pythonPath ?? resolveDefaultDebugpyPythonPath();

  return {
    id: 'debugpy',
    label: 'Python Debug Adapter (debugpy)',
    transport: {
      kind: 'stdio',
      command: resolvedPythonPath,
      args: ['-m', 'debugpy.adapter'],
    },
  };
}
```

Mirror for NetCoreDbg:
- `id: 'netcoredbg'`
- `label: 'C#/.NET Debug Adapter (NetCoreDbg)'`
- `transport.kind: 'stdio'`
- `args: ['--interpreter=vscode']`

**PATH-first + provisioned fallback pattern** (`delve.ts` lines 31-49):
```ts
function resolveDefaultDelvePath(): string {
  const provisionedDelve = getProvisionedDelvePath();
  const candidates = [provisionedDelve, 'PATH dlv'];

  if (delveIsUsable('dlv')) {
    return 'dlv';
  }

  if (existsSync(provisionedDelve) && delveIsUsable(provisionedDelve)) {
    return provisionedDelve;
  }

  throw usageError('Delve adapter is not installed.', {
    code: 'delve_not_found',
    diagnostics: [
      'Run npm run setup-adapters to provision Delve, or install a usable dlv on PATH.',
      `Checked: ${candidates.join(', ')}`,
    ],
  });
}
```

Use same shape with:
- `netcoredbg`
- provisioned path: `path.join(getDapCliAdaptersDir(), 'netcoredbg', process.platform === 'win32' ? 'netcoredbg.exe' : 'netcoredbg')`
- readiness args: `['--version']` or fallback `['--help']`
- error code: `netcoredbg_not_found`

---

### `src/adapters/registry.ts`

**Analog:** existing built-in registry entries in same file.

**Import pattern** (lines 3-5):
```ts
import { createDebugpyDescriptor } from './builtins/debugpy.js';
import { createDelveDescriptor } from './builtins/delve.js';
import { createJsDebugDescriptor } from './builtins/jsDebug.js';
```

Add:
```ts
import { createNetCoreDbgDescriptor } from './builtins/netCoreDbg.js';
```

**Built-in entry pattern** (lines 37-52):
```ts
this.builtInAdapters.set('debugpy', {
  id: 'debugpy',
  label: 'Python Debug Adapter (debugpy)',
  create: () => createDebugpyDescriptor(),
});
this.builtInAdapters.set('delve', {
  id: 'delve',
  label: 'Go Debug Adapter (Delve)',
  create: () => createDelveDescriptor(),
});
```

Add:
```ts
this.builtInAdapters.set('netcoredbg', {
  id: 'netcoredbg',
  label: 'C#/.NET Debug Adapter (NetCoreDbg)',
  create: () => createNetCoreDbgDescriptor(),
});
```

---

### `src/config/launchConfig.ts`

**Analog:** existing type map and launch normalization.

**Type map pattern** (lines 51-59):
```ts
export const launchConfigTypeMap: Record<string, string> = {
  node: 'js-debug',
  'pwa-node': 'js-debug',
  chrome: 'js-debug',
  'pwa-chrome': 'js-debug',
  python: 'debugpy',
  debugpy: 'debugpy',
  go: 'delve',
};
```

Add:
```ts
coreclr: 'netcoredbg',
```

Do **not** add `clr` unless implementation proves support.

**VS Code-only key stripping** (lines 62-64, 109-114):
```ts
const vscodeOnlyLaunchConfigKeys = new Set(['presentation', 'internalConsoleOptions', 'serverReadyAction', 'preLaunchTask', 'postDebugTask']);
```

```ts
for (const key of vscodeOnlyLaunchConfigKeys) {
  delete resolved[key];
}
```

Keep this behavior for C# launch configs; do not execute `preLaunchTask` / `postDebugTask`.

**Unsupported variable diagnostics** (lines 390-395):
```ts
if (variableName.startsWith('input:') || variableName.startsWith('command:')) {
  throw usageError(`Launch variable '${token}' is not supported.`, {
    code: 'unsupported_launch_variable',
    diagnostics: [`${jsonPath}: '${token}' requires VS Code interaction and is not supported by dap-cli.`],
    data: { token, path: jsonPath },
  });
}
```

---

### `src/config/programInference.ts`

**Analog:** existing extension table/default type logic.

**Extension table pattern** (lines 18-29):
```ts
const extensionTable: Record<string, { adapterId: string; type: string }> = {
  '.py': { adapterId: 'debugpy', type: 'python' },
  '.go': { adapterId: 'delve', type: 'go' },
  '.js': { adapterId: 'js-debug', type: 'pwa-node' },
  // ...
};
```

Add only after real fixture proof:
```ts
'.dll': { adapterId: 'netcoredbg', type: 'coreclr' },
```

**Adapter-only default pattern** (lines 68-84):
```ts
function defaultTypeForAdapter(adapterId: string, program: string | undefined): string | undefined {
  if (adapterId === 'debugpy') {
    return 'python';
  }
  if (adapterId === 'delve') {
    return 'go';
  }
  return undefined;
}
```

Add:
```ts
if (adapterId === 'netcoredbg') {
  return 'coreclr';
}
```

---

### `scripts/setup-adapters.ts`

**Analog:** Delve setup in same file.

**Version constants pattern** (lines 10-14):
```ts
const jsDebugVersion = '1.117.0';
const debugpyVersion = '1.8.20';
const delveVersion = 'v1.26.3';
const appDirectoryName = '.dap-cli';
```

Add:
```ts
const netCoreDbgVersion = '3.1.3-1062';
```

**Main setup call pattern** (lines 34-44):
```ts
const dapCliHome = getDapCliHome();
const adaptersDir = getDapCliAdaptersDir();

await setupJsDebug({ adaptersDir, dryRun: options.dryRun });
await setupDebugpy({ dapCliHome, venvPython, dryRun: options.dryRun });
await setupDelve({ adaptersDir, dryRun: options.dryRun });
```

Add:
```ts
await setupNetCoreDbg({ adaptersDir, dryRun: options.dryRun });
```

**Asset resolver pattern** (`resolveDelveAsset`, lines 184-204):
```ts
function resolveDelveAsset(platform: NodeJS.Platform, architecture: string): DelveAsset {
  const platformAssets: Partial<Record<NodeJS.Platform, Partial<Record<string, DelveAsset>>>> = {
    darwin: {
      arm64: { archiveName: `dlv_1.26.3_darwin_arm64.tar.gz`, executableName: 'dlv', archiveKind: 'tar.gz' },
      x64: { archiveName: `dlv_1.26.3_darwin_amd64.tar.gz`, executableName: 'dlv', archiveKind: 'tar.gz' },
    },
    linux: {
      arm64: { archiveName: `dlv_1.26.3_linux_arm64.tar.gz`, executableName: 'dlv', archiveKind: 'tar.gz' },
      x64: { archiveName: `dlv_1.26.3_linux_amd64.tar.gz`, executableName: 'dlv', archiveKind: 'tar.gz' },
    },
    win32: {
      x64: { archiveName: `dlv_1.26.3_windows_amd64.zip`, executableName: 'dlv.exe', archiveKind: 'zip' },
    },
  };
  const asset = platformAssets[platform]?.[architecture];
  if (asset === undefined) {
    throw new Error(`Delve setup does not support ${platform}/${architecture}. Install dlv on PATH or provision a compatible binary manually.`);
  }

  return asset;
}
```

NetCoreDbg asset table from research:
- Linux x64: `netcoredbg-linux-amd64.tar.gz`, sha256 `3814341c028c81ff7eea03ac316ad92e9ad7d705d2a00e3e3df269cdc241c763`
- Linux arm64: `netcoredbg-linux-arm64.tar.gz`, sha256 `fc9efb691a53932a7fac4b9f67af68ad0c2a4cbe59cb2c1a3c44c64959df2ba4`
- macOS x64: `netcoredbg-osx-amd64.tar.gz`, sha256 `49459b066836b6a452f418501d7ecab57bcd7e60d8464faac21ff70b496b8634`
- Windows x64: `netcoredbg-win64.zip`, sha256 `c67ae052e0bcb9ce37000f261e2d397a0d5b6615cafe30c868239a78598dfb37`

**Extraction/readiness pattern** (lines 162-177):
```ts
await fs.mkdir(delveDir, { recursive: true });
const archivePath = path.join(tmpdir(), asset.archiveName);
await downloadFile('Delve', downloadUrl, archivePath, `Download ${downloadUrl}, extract it into ${delveDir}, and retry.`);
await fs.rm(delveDir, { recursive: true, force: true });
await fs.mkdir(delveDir, { recursive: true });
extractDelveArchive(asset, archivePath, delveDir);

if (!await pathExists(delveBinary)) {
  throw new Error(`Delve extraction completed but ${delveBinary} was not found.`);
}

if (process.platform !== 'win32') {
  await fs.chmod(delveBinary, 0o755);
}
```

Add SHA-256 verification before extraction using Node `crypto.createHash('sha256')`.

---

### `tests/integration/netCoreDbgAdapter.test.ts`

**Analogs:** `debugpyAdapter.test.ts` for stdio and `delveAdapter.test.ts` for launch/test/attach coverage.

**Stdio descriptor test pattern** (`debugpyAdapter.test.ts` lines 31-42):
```ts
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
```

Mirror with:
```ts
expect(descriptor.id).toBe('netcoredbg');
expect(descriptor.label).toBe('C#/.NET Debug Adapter (NetCoreDbg)');
expect(descriptor.transport.kind).toBe('stdio');
expect(descriptor.transport).toEqual({
  kind: 'stdio',
  command: descriptor.transport.command,
  args: ['--interpreter=vscode'],
});
```

**DAP handshake/breakpoint inspection pattern** (`debugpyAdapter.test.ts` lines 108-156):
```ts
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
  // setBreakpoints, configurationDone, stopped, stack, variables...
} finally {
  await client.close().catch(() => undefined);
  await adapter.close().catch(() => undefined);
}
```

Use `adapterID: 'netcoredbg'`; launch args:
```ts
{
  type: 'coreclr',
  request: 'launch',
  name: 'csharp-smoke',
  program: '<fixture>/bin/Debug/net8.0/simple-csharp-app.dll',
  cwd: '<fixture>',
  args: ['run'],
  stopAtEntry: true
}
```

**Attach pattern** (`delveAdapter.test.ts` lines 91-114):
```ts
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
      terminateDebuggeeOnDisconnect: false,
    });
    expect(target.process.exitCode).toBeNull();
  } finally {
    target.process.kill('SIGTERM');
  }
}, 60_000);
```

For NetCoreDbg:
- gate with `DAP_CLI_RUN_NETCOREDBG_ATTACH_SMOKE=1`
- `type: 'coreclr'`
- `request: 'attach'`
- `processId: target.process.pid`
- disconnect with `terminateDebuggee:false`
- kill only fixture-owned process after test.

---

### `tests/integration/setupAdapters.test.ts`

**Analog:** existing setup-adapters tests.

**Temp env + fake bin pattern** (lines 17-39):
```ts
const testRoot = await mkdtemp(path.join(tmpdir(), 'dap-cli-setup-adapters-'));
tempDirs.push(testRoot);

const dapCliHome = path.join(testRoot, '.dap-cli');
const fakeBin = path.join(testRoot, 'bin');
await mkdir(fakeBin, { recursive: true });

const result = await execFileAsync(process.execPath, ['--experimental-strip-types', 'scripts/setup-adapters.ts'], {
  cwd: process.cwd(),
  env: {
    ...process.env,
    DAP_CLI_HOME: dapCliHome,
    PATH: `${fakeBin}${path.delimiter}${process.env.PATH ?? ''}`,
  },
});
```

Add NetCoreDbg cases:
- PATH `netcoredbg --version` short-circuits setup.
- dry-run unsupported platform/arch reports actionable message.
- fake archive/digest mismatch surfaces `netcoredbg_digest_mismatch` or equivalent chosen code/message.
- extracted cached binary must be checked with `--version`/`--help`.

---

### `tests/integration/launchInference.test.ts`

**Analog:** same file.

**Inference failure pattern** (lines 95-110):
```ts
test('unsupported program extension fails with adapter_inference_failed', async () => {
  const start = await runCli(['start'], { env: testEnv.env });
  expect(start.exitCode).toBe(0);

  const launch = await runCli([
    'launch',
    '--program', '/tmp/foo.unknown',
    '--name', 'infer-fail',
  ], { env: testEnv.env });

  expect(launch.exitCode).toBe(2);
  const failure = launch.envelope as unknown as JsonFailureEnvelope;
  expect(failure.ok).toBe(false);
  expect(failure.error.code).toBe('adapter_inference_failed');
  expect(failure.error.data?.extension).toBe('.unknown');
});
```

Add:
- `--type coreclr` resolves adapter `netcoredbg`.
- `--program /tmp/app.dll` infers adapter `netcoredbg`, type `coreclr`.
- `--type clr` remains `unknown_launch_type` unless deliberately supported.

---

### `tests/integration/docsValidation.test.ts`

**Analog:** existing docs validation.

**Docs list pattern** (lines 6-12):
```ts
const docsToValidate = [
  'README.md',
  'dap-cli/skills/dap-cli/references/agent-workflows.md',
  'dap-cli/skills/dap-cli/references/go-delve.md',
  'docs/playwright-interop.md',
  'docs/adapter-setup.md',
];
```

Add:
```ts
'dap-cli/skills/dap-cli/references/csharp-netcoredbg.md',
```

**Skill reference retention pattern** (lines 78-83):
```ts
test('skill entry points retain the Go Delve reference', async () => {
  const skill = await fs.readFile(path.join(process.cwd(), 'dap-cli/skills/dap-cli/SKILL.md'), 'utf8');
  const workflows = await fs.readFile(path.join(process.cwd(), 'dap-cli/skills/dap-cli/references/agent-workflows.md'), 'utf8');
  expect(skill).toContain('go-delve.md');
  expect(workflows).toContain('go-delve.md');
});
```

Add a Phase 21 equivalent:
```ts
expect(skill).toContain('csharp-netcoredbg.md');
```

---

### `tests/fixtures/simple-csharp-*`

**Analogs:** Go fixtures.

**Simple app shape** (`simple-go-app/main.go` lines 5-13):
```go
func calculate(left, right int) int {
	result := left + right
	fmt.Printf("Result: %d\n", result)
	return result
}

func main() {
	calculate(2, 3)
}
```

C# fixture should mirror:
- deterministic `Calculate(int left, int right)`
- locals named `left`, `right`, `result`
- console output
- Debug build output DLL under `bin/Debug/net8.0/`

**Attach fixture loop** (`simple-go-attach/main.go` lines 14-19):
```go
func main() {
	fmt.Println("simple-go-attach ready")
	for {
		calculate(7, 8)
		time.Sleep(250 * time.Millisecond)
	}
}
```

C# attach fixture should:
- print `simple-csharp-attach ready`
- loop/sleep
- repeatedly call a method with inspectable locals
- be started by test as `dotnet <dll>`
- be killed only by owned child PID cleanup.

---

### `docs/adapter-setup.md`

**Analog:** Go / Delve section.

**Built-in adapter list pattern** (lines 11-16):
```md
Built-in adapter IDs:

- `js-debug` for Node.js, Chrome, Electron, and JavaScript/TypeScript debugging.
- `debugpy` for Python debugging.
- `delve` for Go debugging through Delve's local `dlv dap` server.
```

Add:
```md
- `netcoredbg` for C#/.NET debugging through NetCoreDbg's VS Code protocol stdio mode.
```

**Adapter section pattern** (`docs/adapter-setup.md` lines 265-310):
```md
## Go / Delve

`npm run setup-adapters` prefers an already-usable `dlv` on `PATH`. If none is available, it provisions the pinned official Delve `v1.26.3` release into `DAP_CLI_HOME/adapters/delve`...

The built-in adapter starts a localhost-only DAP server equivalent to:

```bash
dlv dap --listen=127.0.0.1:<port>
```

Attach only to a same-machine process you own and intend to debug:

```bash
dap-cli attach --adapter delve --type go --name go-attach \
	--json '{"mode":"local","processId":12345}'
```
```

Create analogous `## C# / .NET / NetCoreDbg` section:
- PATH-first, then provision pinned `3.1.3-1062`
- command: `netcoredbg --interpreter=vscode`
- launch built DLL:
```bash
dap-cli launch --adapter netcoredbg --type coreclr --name csharp-debug \
  --json '{"program":"/workspace/app/bin/Debug/net8.0/app.dll","cwd":"/workspace/app","args":[],"stopAtEntry":true}'
```
- attach:
```bash
dap-cli attach --adapter netcoredbg --type coreclr --name csharp-attach \
  --json '{"processId":12345}'
```
- explicitly: build first; no `.csproj` auto-build.

---

### `dap-cli/skills/dap-cli/SKILL.md`

**Analog:** existing reference links.

**Reference index pattern** (lines 293-299):
```md
## Going deeper

- General agent workflows (adapter inference, Python evaluate auto-wrap, child sessions, output contract) → [references/agent-workflows.md](./references/agent-workflows.md)
- JS / TS / browser → [references/javascript-typescript.md](./references/javascript-typescript.md)
- Python → [references/python.md](./references/python.md)
- Go / Delve → [references/go-delve.md](./references/go-delve.md)
```

Add:
```md
- C# / .NET / NetCoreDbg → [references/csharp-netcoredbg.md](./references/csharp-netcoredbg.md)
```

---

### `dap-cli/skills/dap-cli/references/csharp-netcoredbg.md`

**Analog:** `go-delve.md`.

**Opening pattern** (`go-delve.md` lines 1-4):
```md
# dap-cli - Go (Delve)

Notes specific to the built-in `delve` adapter. Read this when debugging Go. The general loop in [SKILL.md](../SKILL.md) still applies.
```

Use:
```md
# dap-cli - C# / .NET (NetCoreDbg)

Notes specific to the built-in `netcoredbg` adapter. Read this when debugging C#/.NET. The general loop in [SKILL.md](../SKILL.md) still applies.
```

**Readiness pattern** (`go-delve.md` lines 5-16):
```md
## Readiness and compatibility

Run setup before a real Delve session:

```bash
npm run setup-adapters
```

The built-in adapter prefers a usable `dlv` on `PATH`; otherwise setup provisions pinned Delve...
```

Adapt:
- setup provisions/recognizes NetCoreDbg
- macOS arm64 caveat if unsupported
- `dotnet` SDK/runtime required for DLL launch.

**Safe attach lifecycle pattern** (`go-delve.md` lines 80-93):
```md
Attach only to a same-machine process you own and intend to debug:

```bash
dap-cli attach --adapter delve --type go --name go-attach \
  --json '{"mode":"local","processId":12345}'
```

```bash
dap-cli request disconnect --name go-attach --json '{"terminateDebuggee":false}'
```
```

Use same lifecycle with `netcoredbg` and `coreclr`.

---

## Shared Patterns

### Typed CLI diagnostics

**Source:** `src/cli/errors.ts` lines 54-56 and `delve.ts` lines 43-49.

```ts
export function usageError(message: string, options?: CliErrorOptions): CliError {
  return new CliError(message, 'usage', ExitCode.Usage, options);
}
```

```ts
throw usageError('Delve adapter is not installed.', {
  code: 'delve_not_found',
  diagnostics: [
    'Run npm run setup-adapters to provision Delve, or install a usable dlv on PATH.',
    `Checked: ${candidates.join(', ')}`,
  ],
});
```

Apply to NetCoreDbg descriptor and config failures:
- `netcoredbg_not_found`
- `netcoredbg_unsupported_platform`
- `netcoredbg_unusable`
- `unsupported_launch_variable`
- existing `unknown_launch_type` for `clr`.

### Stdio adapter lifecycle

**Source:** `src/adapters/processAdapter.ts` lines 33-45.

```ts
const child = spawn(options.descriptor.command, options.descriptor.args, {
  cwd: options.descriptor.cwd,
  env: options.descriptor.env === undefined ? process.env : { ...process.env, ...options.descriptor.env },
  stdio: ['pipe', 'pipe', 'pipe'],
  shell: false,
  detached,
});
```

NetCoreDbg descriptor should rely on this existing stdio process owner; do not add C#-specific protocol core.

### Launch config safety

**Source:** `src/config/launchConfig.ts` lines 109-114 and 390-395.

Apply unchanged:
- strip VS Code-only task/UI keys
- reject `${command:*}` / `${input:*}`
- no automatic `.csproj` build.

### Fresh-agent/report artifact pattern

**Source:** `20-SCENARIOS.md` lines 14-24.

```text
result: pass|fail|blocked
what_worked: ...
what_didnt: ...
agent_confusion: ...
dap_cli_ergonomic_issues: ...
evidence: ...
cleanup_verified: true|false
```

Use this exact report contract for `21-SCENARIOS.md`.

### External repo safety ledger

**Source:** `20-EXTERNAL-PROJECT-CANDIDATES.md` lines 7-13 and 21-30.

Keep Phase 21 C# ledger fields:
- repo URL
- shallow clone path under `tmp/phase-21-external-csharp/`
- commit SHA
- screen notes
- status
- scenario class
- diversification rationale.

## No Analog Found

None. Every required Phase 21 file/artifact has at least a role-match analog. C# fixture contents are new language content, but fixture layout and debugger-test flow should mirror existing Go/Python patterns.

## Metadata

**Analog search scope:** `src/adapters/builtins`, `src/adapters`, `src/config`, `scripts`, `tests/integration`, `tests/fixtures`, `docs`, `dap-cli/skills/dap-cli`, `.planning/phases/20-*`  
**Files scanned/read:** 31  
**Pattern extraction date:** 2026-05-23
