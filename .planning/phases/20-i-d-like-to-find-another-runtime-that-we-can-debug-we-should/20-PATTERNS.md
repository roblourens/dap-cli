# Phase 20: Go/Delve Runtime Debug-Adapter Integration - Pattern Map

**Mapped:** 2026-05-16  
**Inputs:** `20-RESEARCH.md`, `20-VALIDATION.md`; no `CONTEXT.md` exists for this phase.  
**Files analyzed:** 22 likely new or modified deliverables  
**Analogs found:** 22 / 22 at the role level; Delve release provisioning and Go-specific fixtures still need runtime-specific implementation decisions.

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
| --- | --- | --- | --- | --- |
| `src/adapters/builtins/delve.ts` | provider | request-response | `src/adapters/builtins/jsDebug.ts`, `src/adapters/builtins/debugpy.ts` | exact composition |
| `src/adapters/registry.ts` | provider | request-response | existing default built-in registration in same file | exact |
| `scripts/setup-adapters.ts` | utility | file-I/O / batch | `setupJsDebug`, `setupDebugpy` in same file | exact composition |
| `src/config/launchConfig.ts` | config | transform | current js-debug/debugpy type and flag mapping | exact |
| `src/config/programInference.ts` | config | transform | current extension/default-type tables | exact |
| `src/cli/commands/dapCore.ts` | controller | request-response / transform | current adapter-specific flag/config dispatch | role-match |
| `tests/integration/delveAdapter.test.ts` | test | request-response / event-driven | `tests/integration/debugpyAdapter.test.ts`, `tests/integration/jsDebugAdapter.test.ts` | exact composition |
| `tests/fixtures/simple-go-app/**` | test | request-response | `tests/fixtures/simple-python-app/main.py`, `tests/fixtures/simple-node-app/index.js` | exact role-match |
| `tests/fixtures/simple-go-test/**` or equivalent package/test fixture | test | request-response | fixture shape above plus research validation requirements | role-match |
| attach or exec helper fixture under `tests/fixtures/` | test | event-driven | debugpy's generated attach target, node fixture families | role-match |
| `tests/config/programInference.test.ts` | test | transform | existing inference table coverage | exact |
| `tests/config/launchConfig.test.ts` | test | transform | existing type-map and adapter-native flag tests | exact |
| `tests/adapters/registry.test.ts` | test | request-response | existing built-in adapter tests | exact |
| `tests/integration/docsValidation.test.ts` | test | file-I/O / validation | existing docs command validator plus phase-specific docs sections | exact |
| `docs/adapter-setup.md` | docs | transform / reference | existing js-debug and debugpy setup sections | exact |
| `dap-cli/skills/dap-cli/SKILL.md` if the public skill index gains Go guidance | docs | transform / reference | existing phase-hardened skill guidance referenced by Phase 17 | role-match |
| `dap-cli/skills/dap-cli/references/agent-workflows.md` or a new Go reference chosen during planning | docs | transform / reference | Phase 16/18 docs validations and Phase 17 skill usage | role-match |
| `.planning/phases/20-.../20-EXTERNAL-PROJECT-CANDIDATES.md` | artifact | batch / file-I/O | Phase 7 and Phase 8 external project candidate ledgers | exact |
| `.planning/phases/20-.../20-SCENARIOS.md` | artifact | batch | Phase 17 scenario matrix | exact |
| `.planning/phases/20-.../20-RESULTS.md` | artifact | batch | Phase 17 scenario results ledger | exact |
| `.planning/phases/20-.../20-UAT.md` later verify-work capture | artifact | batch / file-I/O | repo GSD smoke policy and prior UAT usage | role-match |
| docs-validation additions that assert Go/Delve public examples | test | file-I/O / validation | `tests/integration/docsValidation.test.ts` Phase 16/18 blocks | exact |

## Pattern Assignments

### `src/adapters/builtins/delve.ts` (provider, request-response)

**Primary analogs:** `src/adapters/builtins/jsDebug.ts` lines 7-18 and 60-77; `src/adapters/builtins/debugpy.ts` lines 7-18 and 21-39.

**Descriptor pattern to copy from js-debug** (lines 7-18):

```typescript
export function createJsDebugDescriptor(jsDebugPath?: string): AdapterDescriptor {
  const dapServerPath = jsDebugPath ?? resolveDefaultJsDebugPath();
  return {
    id: 'js-debug',
    label: 'JavaScript Debug Adapter (Node, Chrome, Electron)',
    transport: {
      kind: 'server',
      command: process.execPath,
      args: [dapServerPath, '${port}', '127.0.0.1'],
      host: '127.0.0.1',
    },
  };
}
```

Delve should use this same descriptor ownership model, but with `command` pointing at `dlv` and arguments shaped for `dlv dap --listen=127.0.0.1:${port}`. Keep the host locked to `127.0.0.1`; custom remote/headless Delve can remain an advanced socket-adapter path.

**Not-found diagnostic pattern to copy from both built-ins** (js-debug lines 60-77, debugpy lines 21-39):

```typescript
throw usageError('debugpy adapter is not installed.', {
  code: 'debugpy_not_found',
  diagnostics: [
    'Run npm run setup-adapters to provision debugpy, or see docs/ADAPTER-SETUP.md for advanced manual provisioning.',
    `Checked: ${candidates.join(', ')}`,
  ],
});
```

Phase 20 should add an equivalent typed `delve_not_found` error that names the actual candidate paths or commands checked. The existing diagnostic text still says `docs/ADAPTER-SETUP.md` while the live repo file is `docs/adapter-setup.md`; Delve work should not copy that casing drift into new text.

**Delve-specific traps:**

- Use js-debug's `server` transport shape, not debugpy's `stdio` transport.
- Use debugpy's "resolve usable local tool, then fail with an actionable setup error" idea, but do not run a synchronous version probe in hot paths unless the plan explicitly accepts that startup cost.
- Decide and test path precedence early: provisioned binary under `DAP_CLI_HOME`, PATH `dlv`, or the research-recommended usable-PATH-else-pinned-provisioned hybrid.

### `src/adapters/registry.ts` (provider, request-response)

**Analog:** default registration block in `src/adapters/registry.ts` lines 37-46.

```typescript
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
```

Add Delve as another lazy built-in factory, then mirror existing registry tests. Preserve the lazy factory behavior: `listAll()` must work without resolving an unavailable adapter executable.

### `scripts/setup-adapters.ts` (utility, file-I/O / batch)

**Primary analogs:** `setupJsDebug` lines 52-97, `setupDebugpy` lines 99-130, `downloadFile` lines 161-169.

**Release-asset provisioning pattern** (lines 52-97):

```typescript
const assetName = `js-debug-dap-v${jsDebugVersion}.tar.gz`;
const downloadUrl = `https://github.com/microsoft/vscode-js-debug/releases/download/v${jsDebugVersion}/${assetName}`;
console.log(`js-debug missing; will provision v${jsDebugVersion} from ${downloadUrl}`);

if (options.dryRun) {
  return;
}

await fs.mkdir(options.adaptersDir, { recursive: true });
const archivePath = path.join(tmpdir(), assetName);
await downloadFile(downloadUrl, archivePath);
```

**System-first setup pattern** (lines 99-130):

```typescript
if (pythonHasDebugpy('python3')) {
  console.log('debugpy already available in system Python.');
  return;
}

console.log(`debugpy missing from system Python; will provision v${debugpyVersion} to ${path.join(options.dapCliHome, 'venv')}`);
```

Delve should deliberately compose these two patterns: report whether PATH already has a usable `dlv`, otherwise provision a pinned official release asset to the adapter cache if that is the chosen product rule. Keep `--dry-run` useful and keep final setup logs deterministic enough for docs and tests.

**Delve-specific traps:**

- Platform asset naming matters for `darwin_arm64`, `darwin_amd64`, Linux, and Windows. Do not assume a tarball layout copied from js-debug.
- Research calls out checksum artifacts. Planning should decide whether checksum verification is required for the implementation slice or tracked as a deliberate follow-up.
- `downloadFile()` currently emits a js-debug-specific manual recovery string. Do not reuse that helper unchanged for Delve errors without making the message adapter-aware.
- Setup should not become a second adapter registry. It provisions tools; descriptor resolution remains in `builtins/delve.ts`.

### `src/config/launchConfig.ts`, `src/config/programInference.ts`, and `src/cli/commands/dapCore.ts` (config/controller, transform)

**Type-map analog:** `src/config/launchConfig.ts` lines 46-53 and 230-240.

```typescript
export const launchConfigTypeMap: Record<string, string> = {
  node: 'js-debug',
  'pwa-node': 'js-debug',
  chrome: 'js-debug',
  'pwa-chrome': 'js-debug',
  python: 'debugpy',
  debugpy: 'debugpy',
};
```

Phase 20 should extend this with `go: 'delve'`, because named VS Code Go launch configs use `type: "go"`.

**Adapter-native mapper analog:** `src/config/launchConfig.ts` lines 283-291.

```typescript
export function mapDebugpyFlags(flags: Record<string, unknown>): Record<string, unknown> {
  const mapped = copyDefinedEntries(flags);
  if (typeof flags.port === 'number') {
    mapped.connect = { host: '127.0.0.1', port: flags.port };
    delete mapped.port;
  }

  return mapped;
}
```

Only add `mapDelveFlags` if Go needs friendly CLI fields that differ from Delve's native JSON. Research identifies likely candidates (`mode`, `processId`, possibly `buildFlags`), but the safe default is JSON-first pass-through unless a stable flag already fits the command parser.

**Inference analog:** `src/config/programInference.ts` lines 18-29 and 67-79.

```typescript
const extensionTable: Record<string, { adapterId: string; type: string }> = {
  '.py': { adapterId: 'debugpy', type: 'python' },
  '.js': { adapterId: 'js-debug', type: 'pwa-node' },
  '.html': { adapterId: 'js-debug', type: 'pwa-chrome' },
};
```

Add `.go -> { adapterId: 'delve', type: 'go' }` and a default `adapterId === 'delve'` return of `go`. Keep existing explicit-flag precedence unchanged.

**CLI handoff analog:** `src/cli/commands/dapCore.ts` lines 346-388.

```typescript
function mapFlagsForAdapter(adapterId: string, flags: Record<string, unknown>): Record<string, unknown> {
  if (adapterId === 'js-debug') {
    return mapJsDebugFlags(flags);
  }
  if (adapterId === 'debugpy') {
    return mapDebugpyFlags(flags);
  }

  return flags;
}
```

If the plan adds `mapDelveFlags`, wire it through both `mapFlagsForAdapter` and `mapConfigForAdapter`; otherwise Delve should intentionally stay on the final `return flags/config` pass-through.

**Delve-specific traps:**

- Decide whether relative Go `program` values are normalized before DAP launch or whether the server descriptor gets a deliberate `cwd`; research flags this as an early correctness choice.
- Do not overload js-debug's `--port` attach behavior onto Delve without an explicit design. Local Delve attach is `mode: "local"` plus `processId`, not debugpy's TCP attach mapping.
- Preserve unsupported launch-variable and named-config error behavior; Go support should only extend the accepted type map, not bypass launch-json validation.

### `tests/config/*.test.ts` and `tests/adapters/registry.test.ts` (tests, transform/request-response)

**Launch type test analog:** `tests/config/launchConfig.test.ts` lines 39-46 already demonstrates custom Go mapping without making it a built-in default:

```typescript
expect(resolveAdapterIdFromType('go', { go: 'delve' })).toBe('delve');
```

Phase 20 should convert this into first-party default coverage and add Delve-specific mapper coverage only if product code adds a mapper.

**Inference test analog:** `tests/config/programInference.test.ts` lines 81-117 cover program-extension families and inferred metadata. Add `.go` next to `.py`, not as a one-off assertion elsewhere.

**Registry test analog:** `tests/adapters/registry.test.ts` lines 53-73 show the expected built-in registration style. Delve should get list coverage and descriptor resolution coverage, with assertions appropriate to `server` transport rather than debugpy's `stdio` transport.

### `tests/integration/delveAdapter.test.ts` (test, request-response / event-driven)

**Primary launch/attach analog:** `tests/integration/debugpyAdapter.test.ts` lines 44-87, 102-160, and 163-176.

```typescript
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
```

Copy the shape, not the Python transport: initialize, start launch or attach, set breakpoints, wait for `stopped`, resolve thread/frame/scopes/variables, continue, disconnect, and close in `finally`.

**Server transport analog:** `tests/integration/jsDebugAdapter.test.ts` lines 567 onward and `src/adapters/socketAdapter.ts` lines 37-104.

```typescript
const adapter = descriptor.transport.kind === 'stdio'
  ? startProcessAdapter({ descriptor: descriptor.transport, adapterId: descriptor.id, logDir })
  : descriptor.transport.kind === 'server'
    ? await startServerSocketAdapter(descriptor.id, descriptor.transport, logDir)
    : await connectSocketAdapter(descriptor.id, descriptor.transport);
```

Delve should land in the `server` branch, using the existing port allocation, subprocess stderr logging, readiness retry, and child termination logic in `startServerSocketAdapter` rather than a test-local process runner.

**Attach gate analog:** debugpy's `DAP_CLI_RUN_DEBUGPY_ATTACH_SMOKE` at lines 16 and 63-87. Validation already proposes `DAP_CLI_RUN_DELVE_ATTACH_SMOKE=1`; reuse this skip-if-gated style for PID attach if it remains environment-sensitive.

**Delve-specific traps:**

- Build a real matrix rather than one launch smoke: validation requires launch, test, exec, and local attach coverage.
- Attach/disconnect semantics are a contract. Record whether the target is expected to survive or terminate, and assert the chosen behavior.
- `dlv dap` is single-use. Do not lift js-debug's child-session or multi-connection assumptions into Delve tests.

### `tests/fixtures/simple-go-*` (tests, request-response/event-driven)

**Fixture analogs:** `tests/fixtures/simple-python-app/main.py` lines 1-16 and `tests/fixtures/simple-node-app/index.js` lines 1-17.

```python
def calculate(left, right):
    result = left + right
    print(f"Result: {result}")
    return result
```

```javascript
function calculate(left, right) {
  const result = left + right;
  console.log(`Result: ${result}`);
  return result;
}
```

Go fixtures should preserve this debugger-friendly shape: a small pure-ish function with stable `left`, `right`, and `result` locals, one deterministic invocation, and no network or timing dependencies. Add only the extra Go shapes validation actually needs: package/test fixture, debug-symbol-friendly exec fixture, and a deliberately long-lived attach target.

### `docs/adapter-setup.md` and `tests/integration/docsValidation.test.ts` (docs/test, file-I/O validation)

**Public setup analog:** `docs/adapter-setup.md` lines 10-32, 115-131, 232-263.

```markdown
- `js-debug` for Node.js, Chrome, Electron, and JavaScript/TypeScript debugging.
- `debugpy` for Python debugging.
```

The Go section should mirror this tiering:

1. Built-in adapter list and one launch verification command.
2. Inference/default-type tables updated for `.go` and `delve`.
3. Advanced manual provisioning fallback for pinned/offline Delve install.
4. Troubleshooting entry for `delve_not_found`, symbol/debug-build issues, and the `dlv dap` versus advanced remote/headless distinction.

**Docs validation analog:** `tests/integration/docsValidation.test.ts` lines 8-29 and phase-specific blocks at lines 32-69.

```typescript
const docsToValidate = [
  'README.md',
  'dap-cli/skills/dap-cli/references/agent-workflows.md',
  'docs/playwright-interop.md',
  'docs/adapter-setup.md',
];
```

Add Phase 20 assertions in this existing file for exact Delve setup/debug terms that must not drift. Reuse the broad shell-fence command extraction instead of inventing a second parser.

**Delve-specific traps:**

- Docs examples must reflect the final CLI shape, especially whether Go fields are first-class flags or JSON payload fields.
- If a new Go skill reference is introduced, include it in docs validation only if it contains public `dap-cli` commands or must carry stable wording.

### `20-EXTERNAL-PROJECT-CANDIDATES.md` (artifact, batch/file-I-O)

**Primary analogs:** Phase 7 external candidates lines 7-106; Phase 8 external candidates lines 7-35.

Phase 7 is the fuller pattern to copy:

```markdown
## Safety Rules

- Treat cloned repositories as untrusted input.
- Clone into ignored scratch space only.
- Use a fresh `DAP_CLI_HOME` per candidate.
- Before running setup/build/run commands, inspect project scripts and launch configs.
```

It also ends with a concrete result ledger:

```markdown
| Candidate | Screened | Cloned | Setup | Build/run | Debug configs | Breakpoints | Result | Evidence |
```

Phase 8 shows how to compact that into a broader screen ledger once the safety rules are established:

```markdown
| Candidate | Launch config path | Screen result | Selected for full attempt | Notes |
```

Phase 20 should use the full Phase 7 style unless the plan creates separate screen and execution files. Required Delve-specific columns should include Go shape (`cli`, `test`, `service`, `launch.json`, or `exec`), commit SHA, debug config mode, breakpoint location, cleanup, and result classification.

### `20-SCENARIOS.md` and `20-RESULTS.md` (artifacts, batch)

**Scenario analog:** Phase 17 `17-SCENARIOS.md` lines 9-35, 70-113.

The important reusable decisions are:

- one fresh agent per scenario;
- the scenario states a task and success criteria, not an exact dap-cli command recipe;
- skills/docs to read are declared before execution;
- cleanup is mandatory;
- the report shape is fixed.

```text
result: pass|fail|blocked
what_worked: ...
what_didnt: ...
agent_confusion: <none | brief description>
dap_cli_ergonomic_issues: <none | bullet list>
evidence: <terminal log path or inline transcript>
```

Research adds `cleanup_verified: true|false`; include it directly in Phase 20's scenario/report contract instead of leaving cleanup only in prose.

**Results analog:** Phase 17 `17-RESULTS.md` lines 7-43 and repeated `cleanup_verified` entries throughout the ledger. The result file should capture reruns after fixes, not overwrite the original failed/confused attempt.

**Delve-specific traps:**

- Keep exact evidence for install/readiness, launch debug, test mode, exec mode, local attach, launch-config interop, real external repos, negative diagnostics, and docs-only novice pass, matching research task families G-01 through G-10.
- Classify non-passes as product bug, docs/skill gap, candidate/project issue, unsafe/block, or environment dependency so follow-up tasks stay actionable.
- External Go repos are untrusted inputs. Scenario text must not encourage agents to execute unchecked install hooks or arbitrary scripts.

## Shared Patterns

### Spawned TCP Adapter Lifecycle

**Source:** `src/adapters/socketAdapter.ts` lines 37-104.  
**Apply to:** Delve descriptor, integration tests, cleanup validation.

`startServerSocketAdapter` already owns free-port allocation, `${port}` substitution, spawned child stderr capture, connection retry, local log file creation, and termination on close/failure. Delve integration should feed this transport, not duplicate it.

### Typed Usage Errors and Readiness Diagnostics

**Sources:** `src/adapters/builtins/jsDebug.ts` lines 60-77; `src/adapters/builtins/debugpy.ts` lines 21-39; `src/adapters/registry.ts` lines 63-68.  
**Apply to:** Missing Delve, unknown adapter, unknown `type: "go"` only before map update.

Adapters fail with `usageError(...)`, stable `code`, concise diagnostics, and concrete "Checked:" details. Delve should follow this exactly.

### Config Extension Without Weakening Existing Validation

**Sources:** `src/config/launchConfig.ts` lines 46-53, 230-291; `src/config/programInference.ts` lines 18-79; `tests/config/launchConfig.test.ts` lines 39-46 and 282-289.  
**Apply to:** `type: "go"`, `.go` inference, default type, and only intentional Go flag adapters.

### Real Adapter E2E Shape

**Sources:** `tests/integration/debugpyAdapter.test.ts` lines 44-176; `tests/integration/jsDebugAdapter.test.ts` lines 567 onward.  
**Apply to:** `tests/integration/delveAdapter.test.ts`.

Use real protocol requests, stable fixtures, event waits, breakpoint verification, stack/scopes/variables checks, and aggressive `finally` cleanup. Phase 20 must keep the same depth rather than settling for descriptor unit tests.

### Docs and Planning Artifacts Stay Testable

**Sources:** `tests/integration/docsValidation.test.ts` lines 8-69; Phase 7 and 8 candidate ledgers; Phase 17 scenarios/results.  
**Apply to:** public docs, external repo evidence, agent hardening loop.

## No Analog Found

| File or Concern | Role | Data Flow | Reason |
| --- | --- | --- | --- |
| Delve release asset platform/checksum matrix inside `scripts/setup-adapters.ts` | utility | file-I/O / batch | The repo has js-debug archive download and debugpy package install precedents, but no existing multi-platform Go release binary selector or checksum verifier. |
| Go `mode: "test"`, `mode: "exec"`, and local PID attach fixtures | test | request-response / event-driven | Existing fixtures prove debugger-local inspection shape, but the exact Delve modes are new runtime semantics. |
| Product choice for Delve path/cwd normalization | config/provider | transform | Research identifies the decision, but no current adapter needs this same Go module path behavior. |

## Metadata

**Analog search scope:** `src/adapters`, `src/config`, `src/cli/commands`, `scripts`, `tests/config`, `tests/adapters`, `tests/integration`, `tests/fixtures`, `docs`, and prior Phase 7/8/17 planning artifacts.  
**Files scanned closely:** 22 source/test/doc/artifact inputs plus Phase 20 research and validation.  
**Pattern extraction date:** 2026-05-16.

## PATTERN MAPPING COMPLETE

**Phase:** 20 - Go/Delve runtime debug-adapter integration  
**Files classified:** 22  
**Analogs found:** 22 / 22 role-level assignments, with 3 Delve-specific no-direct-analog concerns called out.

### Coverage

- Files with exact analog: 13
- Files with role-match or exact-composition analog: 9
- Files with no role-level analog: 0
- Runtime decisions with no direct copy target: 3

### Key Patterns Identified

- Delve should combine js-debug's spawned localhost server descriptor with debugpy's actionable setup/readiness diagnostics.
- Config support belongs in the existing type map, program inference table, and adapter dispatch seam; it should stay JSON-first unless Go-specific flag translation clearly earns its keep.
- Real-adapter tests should mirror debugpy/js-debug inspection depth, while external-repo and subagent hardening artifacts should reuse Phase 7/8/17 ledger formats verbatim enough to stay auditable.

### File Created

`.planning/phases/20-i-d-like-to-find-another-runtime-that-we-can-debug-we-should/20-PATTERNS.md`

### Ready for Planning

Pattern mapping complete. The planner can now split Phase 20 into provisioning, descriptor/config, fixture/E2E, docs validation, external-project evidence, and agent-hardening plan slices with concrete copy targets.