# Phase 21: Integrate C#/.NET debugging through NetCoreDbg as a built-in runtime - Research

**Researched:** 2026-05-23  
**Domain:** dap-cli built-in C#/.NET debugging via NetCoreDbg  
**Confidence:** HIGH for NetCoreDbg release/protocol basics and dap-cli integration surfaces; MEDIUM for macOS/Windows runtime behavior not locally executable because `dotnet` and `netcoredbg` are absent.

## User Constraints

Copied from `21-CONTEXT.md`.

### Implementation Decisions

- [locked] Implement C#/.NET support using NetCoreDbg.
- [locked] Use dap-cli adapter id `netcoredbg`.
- [locked] Use VS Code launch config type `coreclr` as the primary mapped type.
- [locked] Do not bundle or redistribute Microsoft `vsdbg`.
- [locked] Add a built-in descriptor under `src/adapters/builtins/netCoreDbg.ts`.
- [locked] The built-in descriptor launches a dap-cli-owned stdio adapter process.
- [locked] NetCoreDbg adapter command resolves to a usable NetCoreDbg executable.
- [locked] NetCoreDbg adapter args are `--interpreter=vscode`.
- [locked] Optional NetCoreDbg socket/server mode is not the built-in happy path unless implementation proves stdio cannot satisfy dap-cli's DAP transport needs.
- [locked] The adapter must support built .NET DLL/executable launch with fields such as `program`, `cwd`, `args`, `env`, and `stopAtEntry`.
- [locked] The adapter must support same-machine attach to a user/test-owned process id.
- [locked] Keep core protocol DAP-first; do not add C# semantics to protocol core beyond adapter descriptor, config mapping, inference, and diagnostics.
- [locked] `npm run setup-adapters` must recognize a usable `netcoredbg` on `PATH`.
- [locked] If PATH lookup fails, setup provisions a pinned NetCoreDbg GitHub release asset into `DAP_CLI_HOME/adapters/netcoredbg/`.
- [locked] Initial target pin is `3.1.3-1062` unless research identifies a safer current pin before planning is finalized.
- [locked] Downloaded NetCoreDbg assets must be verified using release metadata digest before extraction.
- [locked] Setup must select platform/architecture assets explicitly.
- [locked] Setup must run a readiness proof such as `netcoredbg --version` or `netcoredbg --help`.
- [locked] Missing adapter, unsupported platform/architecture, failed digest verification, failed extraction, and unusable executable must produce typed actionable diagnostics.
- [locked] Map `type: "coreclr"` to adapter id `netcoredbg`.
- [locked] Decide explicitly whether `type: "clr"` maps or remains unsupported; default bias is unsupported unless NetCoreDbg proves suitable for that flow.
- [locked] Keep launch.json variable resolution, platform overlays, and VS Code-only key stripping consistent with existing dap-cli behavior.
- [locked] Treat `${command:*}` and `${input:*}` variables as unsupported.
- [locked] Prefer build-first / launch-output-DLL workflows unless `.csproj` launch/build inference can be deterministic and safe.
- [locked] Add `.dll` inference to `netcoredbg`/`coreclr` if tests show it is safe and useful.
- [locked] Do not silently execute project build scripts from launch config.
- [locked] Public repos are untrusted input and must be screened before execution.
- [locked] Public-project clones live under `tmp/phase-21-external-csharp/`.
- [locked] External attempts must isolate `DAP_CLI_HOME`, `DOTNET_CLI_HOME`, and `NUGET_PACKAGES`.
- [locked] Separate dependency fetch (`dotnet restore`) from debug execution.
- [locked] Fresh-agent verification results require JSONL transcript audit before claiming pass.
- [locked] `/gsd-verify-work 21` must include orchestrator-run hand-driven smoke Sequence A and Sequence B output in `21-UAT.md`.

### the agent's Discretion

- Decide exact NetCoreDbg version pin if research finds a better stable version than `3.1.3-1062`.
- Decide how much Windows support can be implemented and verified in this phase versus documented as bounded support.
- Decide whether `.csproj` convenience is safe enough for this phase or should remain a documented non-goal.
- Decide which public C# repositories are safe, maintained, and diverse enough for validation.
- Decide how many plan files are needed to keep execution atomic and auditable.

### Deferred Ideas

- Full Visual Studio C# extension parity.
- Bundling or redistributing Microsoft `vsdbg`.
- Desktop .NET Framework `clr` support unless NetCoreDbg suitability is proven within this phase.
- Automatic project build orchestration that runs arbitrary MSBuild/project scripts.
- Remote/container attach as a built-in happy path.
- Symbol server, Source Link, ASP.NET browser launch, and Dev Kit `type: "dotnet"` parity unless discovered to be necessary for core dap-cli success.

## Project Constraints

- GSD phase work must stay on branch `phase-21-*`; current branch is `phase-21-csharp-netcoredbg`. [VERIFIED: `git branch --show-current`]
- `/gsd-verify-work` must include real hand-driven smoke Sequence A and B output in phase UAT; tests alone are insufficient. [VERIFIED: `.github/copilot-instructions.md`]
- Project stack is Node.js + TypeScript with Node `>=22`. [VERIFIED: `package.json`]
- Core must remain DAP-first and language-neutral; adapter behavior belongs behind descriptors/config/inference/diagnostics. [VERIFIED: `.planning/PROJECT.md`, `21-CONTEXT.md`]
- Existing built-ins are `js-debug`, `debugpy`, and `delve`; Phase 21 adds `netcoredbg`. [VERIFIED: `src/adapters/registry.ts`, `docs/adapter-setup.md`]

## Summary

Phase 21 should implement NetCoreDbg as a stdio built-in adapter, not a localhost server, using `netcoredbg --interpreter=vscode`. NetCoreDbg’s upstream VS Code protocol handler accepts launch fields `program`, `args`, `cwd`, `env`, `stopAtEntry`, `justMyCode`, and `enableStepFiltering`; `.dll` programs are launched by inserting the DLL path as the first arg to `dotnet`, while non-DLL programs are treated as executables. [CITED: `https://github.com/Samsung/netcoredbg/blob/master/src/protocols/vscodeprotocol.cpp`]

The recommended version pin remains `3.1.3-1062`. GitHub reports this as latest, published `2025-12-12T11:33:53Z`, with release asset digests available through the GitHub release API. [VERIFIED: GitHub API `repos/Samsung/netcoredbg/releases/tags/3.1.3-1062`] This satisfies the phase requirement to verify downloads by release metadata digest. macOS arm64 is the largest provisioning caveat: the latest release has Linux amd64/arm64, macOS amd64, and Windows x64 assets, but no macOS arm64 asset; upstream README also says macOS arm64/M1 builds are community-supported and may not work as expected. [CITED: NetCoreDbg README]

Primary recommendation: implement macOS/Linux/Windows x64/arm64 asset selection exactly from upstream asset names, but document macOS arm64 as “PATH/user-provided Rosetta x64 or unsupported by built-in setup until upstream publishes an arm64 release asset.” [VERIFIED: GitHub API release assets] [ASSUMED: Rosetta fallback feasibility needs executor validation]

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|---|---|---|---|
| NetCoreDbg process launch | Adapter descriptor | Controller process adapter | Descriptor owns command/args; existing `startProcessAdapter` owns stdio process lifecycle. [VERIFIED: `src/adapters/builtins/debugpy.ts`, `tests/integration/debugpyAdapter.test.ts`] |
| Adapter provisioning | Setup script | Descriptor readiness diagnostics | `scripts/setup-adapters.ts` provisions built-ins; descriptor reports typed “not found/unusable” errors at runtime. [VERIFIED: `scripts/setup-adapters.ts`, `src/adapters/builtins/delve.ts`] |
| Launch config mapping | Config layer | CLI launch/attach verbs | `launchConfigTypeMap` maps VS Code `type` to adapter id; auto-route honors `request`. [VERIFIED: `src/config/launchConfig.ts`, `tests/integration/launchAttachAutoRoute.test.ts`] |
| `.dll` inference | Program inference layer | Launch config docs/tests | Existing extension inference lives in `src/config/programInference.ts`; `.dll` should add `netcoredbg`/`coreclr` only after fixture proof. [VERIFIED: `src/config/programInference.ts`] |
| C# fixture build/debug | Test fixtures | Integration tests | Fixtures should build Debug DLLs before DAP launch; dap-cli should not run arbitrary project build scripts implicitly. [VERIFIED: `21-CONTEXT.md`] |
| Public repo validation | Planning artifacts / UAT | Container/host environment | Phase precedent records screened candidates/results separately before execution. [VERIFIED: Phase 20 `20-EXTERNAL-PROJECT-CANDIDATES.md`, `20-EXTERNAL-PROJECT-RESULTS.md`] |

## NetCoreDbg Adapter Contract

### Process/transport

Use:

```bash
netcoredbg --interpreter=vscode
```

NetCoreDbg help documents `--interpreter=vscode` as “VS Code Debugger mode” and `--server[=port_num]` as an optional TCP mode; built-in dap-cli should use stdio unless implementation proves otherwise. [CITED: NetCoreDbg README]

Descriptor shape:

```ts
{
  id: 'netcoredbg',
  label: 'C#/.NET Debug Adapter (NetCoreDbg)',
  transport: {
    kind: 'stdio',
    command: resolvedNetCoreDbgPath,
    args: ['--interpreter=vscode'],
  },
}
```

Mirror `debugpy` for stdio descriptor and readiness resolution. [VERIFIED: `src/adapters/builtins/debugpy.ts`]

### Supported launch payload

NetCoreDbg upstream VS Code handler reads these launch fields:

```jsonc
{
  "type": "coreclr",
  "request": "launch",
  "program": "/abs/path/bin/Debug/net8.0/MyApp.dll",
  "cwd": "/abs/path",
  "args": ["arg1"],
  "env": { "KEY": "VALUE" },
  "stopAtEntry": true,
  "justMyCode": true,
  "enableStepFiltering": true
}
```

Facts:
- `cwd` is optional; absent defaults to empty string passed to debugger. [CITED: NetCoreDbg `vscodeprotocol.cpp`]
- `env` is parsed as a string map; malformed/absent env is cleared. [CITED: NetCoreDbg `vscodeprotocol.cpp`]
- `justMyCode` defaults to `true`, matching vsdbg behavior per upstream comment. [CITED: NetCoreDbg `vscodeprotocol.cpp`]
- `enableStepFiltering` defaults to `true`. [CITED: NetCoreDbg `vscodeprotocol.cpp`]
- `program` ending in `.dll` is launched via `dotnet <program> ...args`; otherwise `program` is launched as an executable. [CITED: NetCoreDbg `vscodeprotocol.cpp`]

Recommended dap-cli pass-through:
- Pass `program`, `cwd`, `args`, `env`, `stopAtEntry`, `justMyCode`, `enableStepFiltering`. [CITED: NetCoreDbg source]
- Strip existing VS Code-only keys: `presentation`, `internalConsoleOptions`, `serverReadyAction`, `preLaunchTask`, `postDebugTask`. [VERIFIED: `src/config/launchConfig.ts`]
- Do not implement `console` behavior now; upstream test type includes `console`, but source handling does not show it affecting launch. [CITED: `VSCodeProtocolRequest.cs`; MEDIUM confidence]

### Supported attach payload

Use same-machine process id:

```json
{
  "type": "coreclr",
  "request": "attach",
  "processId": 12345
}
```

NetCoreDbg accepts `processId` as either number or numeric string. [CITED: NetCoreDbg `vscodeprotocol.cpp`] dap-cli should preserve numeric `processId` and may allow string if launch config parsing naturally passes it through. [CITED: NetCoreDbg source]

### DAP behavior to plan tests around

- `initialize` advertises `supportsConfigurationDoneRequest`, `supportsFunctionBreakpoints`, `supportsConditionalBreakpoints`, `supportTerminateDebuggee`, `supportsSetVariable`, `supportsSetExpression`, `supportsTerminateRequest`, `supportsCancelRequest`, `supportsExceptionInfoRequest`, and `supportsExceptionFilterOptions`. [CITED: NetCoreDbg `vscodeprotocol.cpp`]
- Breakpoints use `setBreakpoints` with `source.path` and line breakpoints; conditions are read from each breakpoint. [CITED: NetCoreDbg `vscodeprotocol.cpp`]
- Stack/scopes/variables are implemented through `stackTrace`, `scopes`, and `variables` handlers. [CITED: NetCoreDbg `vscodeprotocol.cpp`]
- `evaluate` can omit `frameId`; NetCoreDbg falls back to last stopped thread top frame. dap-cli still should use current auto-frame ergonomics and test explicit frame IDs. [CITED: NetCoreDbg `vscodeprotocol.cpp`]
- `disconnect` honors `terminateDebuggee`: absent = default, `true` = terminate, `false` = detach. [CITED: NetCoreDbg `vscodeprotocol.cpp`]
- NetCoreDbg emits `output` events with categories `console`, `stdout`, and `stderr`. [CITED: NetCoreDbg `vscodeprotocol.cpp`]

### Quirks vs vsdbg

- NetCoreDbg mimics some vsdbg defaults (`justMyCode`, `enableStepFiltering`) but is not Microsoft `vsdbg` and must not be described as such. [CITED: NetCoreDbg source; VERIFIED: `21-CONTEXT.md`]
- `type: "coreclr"` should map to NetCoreDbg; `type: "clr"` should remain unsupported unless executor proves desktop .NET Framework support. Recommendation: do **not** map `clr` in Phase 21. [VERIFIED: `21-CONTEXT.md`; ASSUMED: NetCoreDbg focus is .NET Core/.NET based on README wording]
- `type: "dotnet"` from newer C# Dev Kit flows should remain unsupported/non-goal. [VERIFIED: `21-LANGUAGE-ONBOARDING-PRD.md`]

## Provisioning Research

### Recommended pin

Use `3.1.3-1062`. It is the latest GitHub release observed during research, published `2025-12-12T11:33:53Z`. [VERIFIED: GitHub API]

### Release assets and digests

| Platform | Node platform/arch | Asset | Digest |
|---|---:|---|---|
| Linux x64 | `linux` / `x64` | `netcoredbg-linux-amd64.tar.gz` | `sha256:3814341c028c81ff7eea03ac316ad92e9ad7d705d2a00e3e3df269cdc241c763` |
| Linux arm64 | `linux` / `arm64` | `netcoredbg-linux-arm64.tar.gz` | `sha256:fc9efb691a53932a7fac4b9f67af68ad0c2a4cbe59cb2c1a3c44c64959df2ba4` |
| macOS x64 | `darwin` / `x64` | `netcoredbg-osx-amd64.tar.gz` | `sha256:49459b066836b6a452f418501d7ecab57bcd7e60d8464faac21ff70b496b8634` |
| Windows x64 | `win32` / `x64` | `netcoredbg-win64.zip` | `sha256:c67ae052e0bcb9ce37000f261e2d397a0d5b6615cafe30c868239a78598dfb37` |

[VERIFIED: GitHub API `repos/Samsung/netcoredbg/releases/tags/3.1.3-1062`]

No macOS arm64 asset exists in this release. [VERIFIED: GitHub API]

### Extraction layout and executable path

Expected cache root:

```text
$DAP_CLI_HOME/adapters/netcoredbg/
```

Expected executable:
- Unix: `$DAP_CLI_HOME/adapters/netcoredbg/netcoredbg`
- Windows: `$DAP_CLI_HOME/adapters/netcoredbg/netcoredbg.exe`

This exact layout must be verified during implementation by extracting an asset in a controlled test; upstream asset listing alone does not prove archive root structure. [ASSUMED: executable sits at archive root based on release naming and common packaging; risk if wrong is broken descriptor path]

### Readiness command

Prefer:

```bash
netcoredbg --version
```

Fallback:

```bash
netcoredbg --help
```

`--version` and `--help` are documented in NetCoreDbg help output. [CITED: NetCoreDbg README]

### Setup implementation notes

- Add `netCoreDbgVersion = '3.1.3-1062'` to `scripts/setup-adapters.ts`. [VERIFIED: existing setup version pattern]
- Add a `NetCoreDbgAsset` resolver mirroring `resolveDelveAsset`. [VERIFIED: `scripts/setup-adapters.ts`]
- Use GitHub API release metadata or pinned digest table. The phase contract says digest from release metadata; implementation should either fetch the release JSON at setup time or encode the official digest table and document its provenance. [VERIFIED: `21-CONTEXT.md`; VERIFIED: GitHub API has `digest` fields]
- Use `crypto.createHash('sha256')` to validate archive bytes before extraction. [ASSUMED: Node crypto standard library is available]
- Re-run readiness after extraction and chmod Unix executable to `0o755`. [VERIFIED: Delve setup pattern in `scripts/setup-adapters.ts`]
- Emit typed diagnostics:
  - `netcoredbg_not_found`
  - `netcoredbg_unsupported_platform`
  - `netcoredbg_digest_mismatch`
  - `netcoredbg_extraction_failed`
  - `netcoredbg_unusable`
  - `dotnet_not_found` / `netcoredbg_dotnet_not_found` for `.dll` launch preflight if added. [ASSUMED: exact error code names are planner choice; risk is inconsistent CLI contracts]

## Existing dap-cli Patterns to Reuse

| Need | Reuse | Source |
|---|---|---|
| Stdio descriptor | `debugpy` descriptor | `src/adapters/builtins/debugpy.ts` |
| PATH-first + cache fallback readiness | `delve` descriptor | `src/adapters/builtins/delve.ts` |
| Registry built-in entry | `AdapterRegistry` factory map | `src/adapters/registry.ts` |
| Type mapping | `launchConfigTypeMap` | `src/config/launchConfig.ts` |
| Extension inference | `extensionTable` and `defaultTypeForAdapter` | `src/config/programInference.ts` |
| Setup dry-run and asset resolver | Delve setup implementation | `scripts/setup-adapters.ts` |
| Real adapter tests | `debugpyAdapter.test.ts` for stdio; `delveAdapter.test.ts` for launch/test/attach pattern | `tests/integration/` |
| Docs validation | `docsValidation.test.ts` | `tests/integration/docsValidation.test.ts` |
| Fresh-agent scenario loop | Phase 20 scenario/result/gap artifacts | `.planning/phases/20-*` |

Concrete files to create/update:
- `src/adapters/builtins/netCoreDbg.ts`
- `src/adapters/registry.ts`
- `src/config/launchConfig.ts`
- `src/config/programInference.ts`
- `scripts/setup-adapters.ts`
- `docs/adapter-setup.md`
- `dap-cli/skills/dap-cli/SKILL.md`
- `dap-cli/skills/dap-cli/references/csharp-netcoredbg.md`
- `tests/fixtures/simple-csharp-app/`
- `tests/fixtures/simple-csharp-short-lived/`
- `tests/fixtures/simple-csharp-test/`
- `tests/fixtures/simple-csharp-attach/`
- `tests/integration/netCoreDbgAdapter.test.ts`
- `tests/integration/setupAdapters.test.ts`
- `tests/integration/launchInference.test.ts`
- `tests/integration/docsValidation.test.ts`

## Launch Config and Inference Research

### `coreclr`

Add:

```ts
coreclr: 'netcoredbg'
```

to `launchConfigTypeMap`. [VERIFIED: `src/config/launchConfig.ts` pattern]

### `clr`

Recommendation: keep unsupported in Phase 21. The PRD default bias is unsupported unless proven; NetCoreDbg README describes debugging .NET apps under the .NET Core runtime, not desktop .NET Framework. [VERIFIED: `21-LANGUAGE-ONBOARDING-PRD.md`; CITED: NetCoreDbg README]

Expected diagnostic if used:

```text
Unknown launch configuration type 'clr'.
No adapter mapping is configured for launch type 'clr'.
```

Existing `resolveAdapterIdFromType` already emits `unknown_launch_type`. [VERIFIED: `src/config/launchConfig.ts`]

### `.dll` inference

Add:

```ts
'.dll': { adapterId: 'netcoredbg', type: 'coreclr' }
```

only after a real fixture test confirms NetCoreDbg launches built DLLs correctly. [CITED: NetCoreDbg source shows `.dll` launch path; VERIFIED: inference location in `src/config/programInference.ts`]

### `.csproj` inference

Recommendation: do **not** infer `.csproj` in Phase 21. Reason: building a project can execute MSBuild targets and restore packages; phase constraints forbid silently executing project build scripts. [VERIFIED: `21-CONTEXT.md`] Provide diagnostics/docs: “build first, launch the output DLL.”

### Safe launch config keys

Pass through:
- `program`
- `cwd`
- `args`
- `env`
- `stopAtEntry`
- `justMyCode`
- `enableStepFiltering`
- `request`
- `type`
- `name`

Strip/reject:
- Strip existing VS Code-only keys: `presentation`, `internalConsoleOptions`, `serverReadyAction`, `preLaunchTask`, `postDebugTask`. [VERIFIED: `src/config/launchConfig.ts`]
- Reject `${command:*}` and `${input:*}` through existing resolver. [VERIFIED: `src/config/launchConfig.ts`]
- Do not execute `preLaunchTask`/`postDebugTask`; existing stripping supports this. [VERIFIED: `src/config/launchConfig.ts`]

## Fixture and Integration Test Strategy

### Fixture design

1. `tests/fixtures/simple-csharp-app`
   - Minimal console app.
   - `Program.cs` has `Calculate(int left, int right)` with locals `left`, `right`, `result`.
   - Build command:
     ```bash
     dotnet build -c Debug
     ```
   - Launch:
     ```json
     {
       "type": "coreclr",
       "request": "launch",
       "program": "<fixture>/bin/Debug/net8.0/simple-csharp-app.dll",
       "cwd": "<fixture>",
       "args": ["run"],
       "stopAtEntry": true
     }
     ```
   - Evidence: verified source breakpoint, stopped event, stack contains `Calculate`, locals include `left/right/result`, evaluate `left + right` returns expected value. [ASSUMED: `net8.0` is acceptable fixture TFM; risk if local SDK differs]

2. `tests/fixtures/simple-csharp-short-lived`
   - Exits quickly.
   - Purpose: prove `--stop-on-entry` guidance prevents breakpoint race.
   - Evidence: launch stopped on entry, then set breakpoint and continue.

3. `tests/fixtures/simple-csharp-test`
   - Small class library + test project is useful but risky because test frameworks add NuGet restore.
   - Safer Phase 21 alternative: console “test-like” app that invokes library code without external packages.
   - If using real `dotnet test`, isolate `NUGET_PACKAGES` and record restore/build as separate step. [ASSUMED: external package restore risk applies to xUnit/NUnit/MSTest]

4. `tests/fixtures/simple-csharp-attach`
   - Long-running console app prints `simple-csharp-attach ready`, then loops/sleeps.
   - Include callable method hit by timer/loop.
   - Test starts process with `dotnet <dll>`, attaches by PID, sets breakpoint, hits/inspects, disconnects with `terminateDebuggee:false`, verifies process survives, then terminates only owned process.

### Integration tests

Create `tests/integration/netCoreDbgAdapter.test.ts` modeled on `debugpyAdapter.test.ts` because NetCoreDbg is stdio. [VERIFIED: `tests/integration/debugpyAdapter.test.ts`]

Test cases:
- Descriptor resolves as built-in:
  - id `netcoredbg`
  - label `C#/.NET Debug Adapter (NetCoreDbg)`
  - transport `stdio`
  - args `['--interpreter=vscode']`
- Launch Debug DLL and inspect breakpoint state.
- Short-lived launch with stop-on-entry.
- Attach smoke gated by env, e.g. `DAP_CLI_RUN_NETCOREDBG_ATTACH_SMOKE=1`.
- Launch config `type: "coreclr"` maps to `netcoredbg`.
- `.dll` inference maps to `netcoredbg`/`coreclr`.
- Negative missing adapter with PATH/cache hidden returns `netcoredbg_not_found`.
- Negative missing DLL/build output returns actionable diagnostic or adapter detail.

Suggested commands:

```bash
npx vitest run tests/integration/netCoreDbgAdapter.test.ts
DAP_CLI_RUN_NETCOREDBG_ATTACH_SMOKE=1 npx vitest run tests/integration/netCoreDbgAdapter.test.ts
npx vitest run tests/integration/setupAdapters.test.ts
npx vitest run tests/integration/launchInference.test.ts
npx vitest run tests/integration/launchAttachAutoRoute.test.ts
npx vitest run tests/integration/docsValidation.test.ts
npm run check
```

## Public Repo Validation Research

### Repo shapes to search later

Search criteria:
- Small console apps with `.sln`/`.csproj`.
- Libraries with simple examples and no external services.
- Repos with `.vscode/launch.json` containing `"type": "coreclr"`.
- Avoid ASP.NET/cloud/database until console/library flows pass.

Suggested search terms:
- `"type": "coreclr" "program": "${workspaceFolder}/bin/Debug"`
- `"stopAtEntry" "coreclr" ".csproj"`
- `"TargetFramework" "net8.0" "Console"`
- `"dotnet build" "bin/Debug/net8.0"`

### Screening checklist

Before running commands:
- Inspect README, `.sln`, `.csproj`, `.props`, `.targets`, `Directory.Build.*`, `.vscode/launch.json`, `NuGet.config`, Makefiles/task files/scripts/devcontainer files. [VERIFIED: `21-LANGUAGE-ONBOARDING-PRD.md`]
- Reject credentials, private feeds, cloud accounts, databases, Docker daemon dependencies, native installers, opaque scripts, code generators with unclear effects, non-localhost traffic, or `curl | sh`. [VERIFIED: PRD]
- Separate:
  ```bash
  dotnet restore
  dotnet build -c Debug --no-restore
  ```
  from debug execution. [VERIFIED: PRD]

### Scratch layout

```text
tmp/phase-21-external-csharp/
├── <repo-slug>/
├── homes/
│   ├── <attempt>/.dap-cli-home
│   ├── <attempt>/.dotnet-home
│   └── <attempt>/.nuget-packages
```

Environment per attempt:

```bash
export DAP_CLI_HOME="$PWD/tmp/phase-21-external-csharp/homes/ATTEMPT/.dap-cli-home"
export DOTNET_CLI_HOME="$PWD/tmp/phase-21-external-csharp/homes/ATTEMPT/.dotnet-home"
export NUGET_PACKAGES="$PWD/tmp/phase-21-external-csharp/homes/ATTEMPT/.nuget-packages"
```

## Container/Sandbox Plan

Docker is available and daemon responds locally (`27.3.1`). [VERIFIED: environment audit] Use containers for public repo validation when feasible, but still screen repos because Docker is containment, not a complete sandbox. [VERIFIED: `21-LANGUAGE-ONBOARDING-PRD.md`]

Preferred posture:
- `mcr.microsoft.com/dotnet/sdk:8.0` or `9.0` container. [ASSUMED: image tags exist; verify before execution]
- Run dap-cli, NetCoreDbg, SDK, and debuggee inside same container so PID attach and source paths are local. [VERIFIED: `21-ADAPTER-SELECTION.md`]
- No host home mount.
- No Docker socket.
- No credentials.
- Non-root user where practical.
- Phase-owned scratch mount only.
- Network only for restore; debug execution should run without network unless localhost-only scenario.

Host fallback:
- Use repo-owned scratch, isolated homes, no credentials, no unreviewed scripts.
- Because local `dotnet` is missing, host fixture/external validation is blocked until SDK installation or container execution. [VERIFIED: environment audit]

## Fresh-Agent Scenario Recommendations

Model after Phase 20’s 10-scenario matrix. [VERIFIED: `20-SCENARIOS.md`]

Recommended Phase 21 scenarios:

1. **C-01 Install and readiness**
   - Read skill + C# reference + adapter setup.
   - Run setup/readiness in isolated `DAP_CLI_HOME`.
   - Evidence: selected NetCoreDbg path/version/help or typed blocker.

2. **C-02 Fixture DLL launch**
   - Build repo-owned console fixture.
   - Launch DLL with `--adapter netcoredbg --type coreclr --stop-on-entry`.
   - Hit breakpoint, stack, scopes/variables, evaluate.

3. **C-03 Short-lived fixture**
   - Prove `--stop-on-entry` prevents exit-before-breakpoint race.

4. **C-04 Prebuilt executable if relevant**
   - If fixture can publish executable safely, test non-`.dll` `program` behavior; otherwise document DLL-only for Phase 21.

5. **C-05 Safe local attach**
   - Start owned long-running fixture process, attach by PID, inspect stop, disconnect with `terminateDebuggee:false`, prove target survives, terminate only owned process.

6. **C-06 Launch config**
   - Scratch `.vscode/launch.json` with `type: "coreclr"`, named config, `${workspaceFolder}` variable, explicit built DLL.
   - Use `--config`, prove mapping and auto-route if request differs.

7. **C-07 Negative diagnostics**
   - Missing adapter or unsupported platform/arch.
   - Missing build output DLL.
   - Unsupported `${command:*}`/`${input:*}`.
   - `clr` unsupported diagnostic.

8. **C-08 Screened external console/library repo**
   - Use existing screened clone only; no new network in fresh-agent run.

9. **C-09 External launch.json/coreclr flow**
   - Reproduce a screened `.vscode/launch.json` if found; otherwise report absence honestly.

10. **C-10 Docs-only novice**
   - No commands.
   - Explain setup, build-first DLL launch, `coreclr`, attach lifecycle, ref reacquisition, and why `.csproj` auto-build is not supported.

Each report must include:

```text
result: pass|fail|blocked
what_worked: ...
what_didnt: ...
agent_confusion: ...
dap_cli_ergonomic_issues: ...
evidence: ...
cleanup_verified: true|false
```

Transcript audit is mandatory before claiming pass. [VERIFIED: `21-LANGUAGE-ONBOARDING-PRD.md`]

## Validation Architecture

Nyquist validation is enabled. [VERIFIED: `.planning/config.json`]

| Property | Value |
|---|---|
| Framework | Vitest `3.2.4` in repo, latest registry `4.1.7`; keep repo-pinned version unless dependency update is explicitly planned. [VERIFIED: `package.json`; VERIFIED: npm registry] |
| Config file | `vitest.config.ts` |
| Quick command | `npx vitest run tests/integration/netCoreDbgAdapter.test.ts` |
| Full suite | `npm run check` |

### Phase behavior → tests

| Behavior | Test type | Command | File exists? |
|---|---|---|---|
| Registry lists `netcoredbg` | unit/integration | `npx vitest run tests/integration/netCoreDbgAdapter.test.ts` | ❌ Wave 0 |
| Setup PATH/cache/digest/readiness | integration/unit with fake assets + optional network gate | `npx vitest run tests/integration/setupAdapters.test.ts` | ✅ update |
| `coreclr` maps to `netcoredbg` | integration | `npx vitest run tests/integration/launchInference.test.ts` | ✅ update |
| `.dll` inference | integration | `npx vitest run tests/integration/launchInference.test.ts` | ✅ update |
| Real DLL launch breakpoint inspect | real adapter integration | `npx vitest run tests/integration/netCoreDbgAdapter.test.ts` | ❌ Wave 0 |
| Real attach | gated real adapter integration | `DAP_CLI_RUN_NETCOREDBG_ATTACH_SMOKE=1 npx vitest run tests/integration/netCoreDbgAdapter.test.ts` | ❌ Wave 0 |
| Docs/skill examples valid | docs integration | `npx vitest run tests/integration/docsValidation.test.ts` | ✅ update |
| Existing JS/Python/Go regressions | regression suite | `npm run check` plus focused existing tests | ✅ |

### Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|---|---|---:|---|---|
| Node.js | build/tests/setup | ✓ | `v22.22.1` | — |
| npm | package scripts | ✓ | `10.9.4` | — |
| dotnet SDK | C# build/debug fixtures | ✗ | — | Use Docker SDK container or install SDK |
| netcoredbg | real adapter smoke | ✗ | — | Phase setup should provision |
| Docker | container validation | ✓ | `27.3.1`, daemon available | Host fallback if SDK installed |
| tar | `.tar.gz` extraction | ✓ | bsdtar `3.5.3` | Node extraction lib if needed |
| unzip | Windows zip test/extraction on Unix | ✓ | Info-ZIP `6.00` | Node extraction lib if needed |
| shasum | digest audit/manual verification | ✓ | `6.02` | Node crypto |

Missing with no direct host fallback:
- `.NET SDK` blocks host fixture builds until installed or containerized. [VERIFIED: environment audit]

Missing with fallback:
- `netcoredbg` missing; setup is expected to provision. [VERIFIED: environment audit]

## Risks, Open Questions, and Planning Implications

### Risks

1. **macOS arm64 unsupported by upstream prebuilt asset**
   - Impact: current machine is Darwin and may be arm64; setup may need typed unsupported diagnostic or Rosetta x64 path.
   - Plan implication: first plan should verify platform/arch and decide exact bounded support.
   - Confidence: HIGH asset absence; MEDIUM fallback behavior. [VERIFIED: GitHub API; ASSUMED: Rosetta fallback]

2. **Archive extraction layout unknown until tested**
   - Impact: descriptor path may be wrong.
   - Plan implication: Wave 0 should include extraction-layout test or manual proof before descriptor depends on it.
   - Confidence: MEDIUM. [ASSUMED]

3. **`.csproj` inference/build automation safety**
   - Impact: arbitrary MSBuild target execution.
   - Plan implication: keep build-first DLL workflow; no `.csproj` inference.
   - Confidence: HIGH. [VERIFIED: PRD safety constraints]

4. **Evaluate may differ across optimized/release builds**
   - Impact: locals/evaluate evidence may be poor if PDBs missing/optimized.
   - Plan implication: fixture/external builds must use Debug configuration; docs should recommend Debug DLLs and PDBs.
   - Confidence: MEDIUM. [CITED: NetCoreDbg CLI docs mention PDB/source needs]

5. **Windows support not locally verifiable**
   - Impact: bugs may remain in `win64.zip` extraction/path handling.
   - Plan implication: implement deterministic mapping but mark verification bounded unless a Windows runner is available.
   - Confidence: HIGH. [VERIFIED: environment is Darwin]

### Open Questions (RESOLVED)

1. Does `netcoredbg-osx-amd64.tar.gz` run acceptably on Apple Silicon under Rosetta for dap-cli’s built-in path?
   - RESOLVED: do not assume. Plan 21-01 requires typed unsupported `darwin/arm64` behavior unless execution proves a Rosetta/user-provided fallback.

2. Should setup fetch GitHub API release metadata live or use a pinned digest table?
   - RESOLVED: use the pinned digest table from release metadata in `scripts/setup-adapters.ts` for deterministic setup, with provenance comments. Live API validation can be a future maintenance enhancement.

3. Should C# test fixture use real test framework?
   - RESOLVED: start with no-NuGet console fixtures in Plan 21-03. Real `dotnet test` remains deferred unless execution later proves restore isolation and environment support are stable.

4. Which public repos?
   - RESOLVED: Plan 21-05 discovers and screens candidates into `21-EXTERNAL-PROJECT-CANDIDATES.md`, then requires at least one passing screened public debug attempt or explicit phase escalation if all safe candidates are blocked.

## Security Domain

| ASVS Category | Applies | Standard Control |
|---|---:|---|
| V2 Authentication | no | No auth surface in this phase. [VERIFIED: phase scope] |
| V3 Session Management | no | Existing dap-cli controller/session behavior only. [VERIFIED: phase scope] |
| V4 Access Control | yes | Attach only to user/test-owned same-machine PID; no broad process cleanup. [VERIFIED: PRD] |
| V5 Input Validation | yes | Validate platform/arch, archive digest, launch config variables, program path existence, `processId`. [VERIFIED: PRD and code patterns] |
| V6 Cryptography | yes | Use SHA-256 digest verification via standard crypto; do not hand-roll hashing. [VERIFIED: GitHub asset digest availability; ASSUMED: Node crypto use] |

Threat patterns:
- Supply-chain tampering of adapter archive → SHA-256 digest verification before extraction.
- Zip/tar path traversal → extraction should reject entries outside target dir or use trusted tool carefully. [ASSUMED: current setup uses `tar`/`unzip`; planner should add safe extraction checks]
- Untrusted repo build execution → screen MSBuild/project files, isolate NuGet/DOTNET homes, separate restore/build/debug.
- Wrong PID attach → docs/tests must attach only owned fixture PID and cleanup only that process.

## Assumptions Log

| # | Claim | Risk if wrong |
|---|---|---|
| A1 | NetCoreDbg archive extracts executable at cache root. | Descriptor path/setup validation fails. |
| A2 | Rosetta x64 NetCoreDbg may be a feasible macOS arm64 fallback. | Unsupported platform messaging/docs become misleading. |
| A3 | Node `crypto` should be used for digest verification. | Implementation might need a different hash utility. |
| A4 | `net8.0` fixture target is appropriate. | Local/container SDK mismatch; use installed SDK or multi-target. |
| A5 | New error code names are planner/implementation choices. | Tests/docs must align on final exact codes. |

## Sources

### Primary

- NetCoreDbg README: `https://raw.githubusercontent.com/Samsung/netcoredbg/master/README.md`
- NetCoreDbg VS Code protocol source: `https://raw.githubusercontent.com/Samsung/netcoredbg/master/src/protocols/vscodeprotocol.cpp`
- NetCoreDbg request test types: `https://raw.githubusercontent.com/Samsung/netcoredbg/master/test-suite/NetcoreDbgTest/VSCode/VSCodeProtocolRequest.cs`
- GitHub release API: `https://api.github.com/repos/Samsung/netcoredbg/releases/tags/3.1.3-1062`
- dap-cli project files listed in objective/context.

### Registry/version checks

- TypeScript latest `6.0.3`; repo uses `^5.9.3`. [VERIFIED: npm registry; `package.json`]
- Vitest latest `4.1.7`; repo uses `^3.2.4`. [VERIFIED: npm registry; `package.json`]
- tsup latest `8.5.1`; repo uses `^8.5.0`. [VERIFIED: npm registry; `package.json`]
- zod latest `4.4.3`; repo uses `^4.1.12`. [VERIFIED: npm registry; `package.json`]
- jsonc-parser latest `3.3.1`; repo uses `^3.3.1`. [VERIFIED: npm registry; `package.json`]
