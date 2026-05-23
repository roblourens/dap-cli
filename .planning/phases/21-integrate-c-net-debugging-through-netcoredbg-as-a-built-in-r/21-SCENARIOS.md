---
phase: 21
status: ready
scenario_count: 10
scratch_root: tmp/phase-21-fresh-agent-runs
---

# Phase 21 Fresh-Agent C# / .NET NetCoreDbg Scenario Matrix

## How To Use

Plan 21-06 runs one fresh subagent per scenario prompt below. Every subagent works in the repository checkout, uses repo-local scratch under `tmp/phase-21-fresh-agent-runs/`, reads the stated skill/docs before acting, and returns the fixed report contract without smoothing over failures.

Required report contract for every run:

```text
result: pass|fail|blocked
what_worked: ...
what_didnt: ...
agent_confusion: ...
dap_cli_ergonomic_issues: ...
evidence: ...
cleanup_verified: true|false
```

Standing invariants:

- Read `dap-cli/skills/dap-cli/SKILL.md` and `dap-cli/skills/dap-cli/references/csharp-netcoredbg.md` before commands unless the scenario is explicitly docs-only.
- Use an isolated `DAP_CLI_HOME` under `tmp/phase-21-fresh-agent-runs/<scenario>/.dap-cli-home` for every real debug session.
- For external C# repos, also use isolated `DOTNET_CLI_HOME` and `NUGET_PACKAGES`; separate restore, build, and debug execution.
- Treat public C# repos as untrusted input and use only candidates already screened in `21-EXTERNAL-PROJECT-CANDIDATES.md`.
- Prefer the proven x64 Rosetta NetCoreDbg path on this darwin/arm64 host only when an explicit compatible x64 path exists; do not weaken setup defaults or silently provision x64.
- Clean up only phase-owned sessions/processes/files. Do not kill unrelated `dotnet` or `netcoredbg` processes.
- Capture typed diagnostics and blocked safety constraints honestly.

## Scenario Matrix

### C-01 - Install and readiness

- **focus:** Prove a fresh agent can reach a usable NetCoreDbg setup/readiness conclusion.
- **prerequisites:** Built repo checkout; isolated `DAP_CLI_HOME`; no assumption that NetCoreDbg already exists in that home.
- **exact skill/docs to read:** `dap-cli/skills/dap-cli/SKILL.md`, `dap-cli/skills/dap-cli/references/csharp-netcoredbg.md`, `docs/adapter-setup.md` C# / NetCoreDbg section.
- **target source/project:** Adapter setup path only; no debuggee launch required.
- **required outcome:** Identify whether `netcoredbg` is on `PATH`, whether `npm run setup-adapters` can provision this platform, and whether any darwin/arm64 Rosetta override is explicit and compatible.
- **cleanup:** Stop any controller accidentally started; leave only scenario scratch caches.
- **subagent_prompt:**
  ```text
  Read the dap-cli skill, C# NetCoreDbg reference, and adapter setup C# section before commands.
  Scenario C-01: in this repo, use isolated DAP_CLI_HOME tmp/phase-21-fresh-agent-runs/C-01/.dap-cli-home and determine the supported readiness path for C#/.NET NetCoreDbg debugging. Do not launch a debuggee. Show whether NetCoreDbg is already usable or becomes usable through the documented setup flow, and preserve the actionable diagnostic if setup cannot complete.
  Report exactly: result / what_worked / what_didnt / agent_confusion / dap_cli_ergonomic_issues / evidence / cleanup_verified: true|false.
  ```

### C-02 - Fixture DLL launch debug

- **focus:** Debug repo-owned `tests/fixtures/simple-csharp-app` through a built Debug DLL.
- **prerequisites:** Setup/readiness complete inside this scenario's isolated home; compatible `dotnet` SDK/runtime.
- **exact skill/docs to read:** skill + C# NetCoreDbg reference.
- **target source/project:** `tests/fixtures/simple-csharp-app`.
- **required outcome:** `dotnet restore`, `dotnet build -c Debug --no-restore`, launch the output `.dll` with `coreclr`, hit a source breakpoint, inspect stack, scopes, variables, evaluate or fallback, continue, close.
- **cleanup:** Close session, cleanup phase-owned session state, stop controller.
- **subagent_prompt:**
  ```text
  Read the dap-cli skill and C# NetCoreDbg reference first. Scenario C-02: use isolated DAP_CLI_HOME tmp/phase-21-fresh-agent-runs/C-02/.dap-cli-home, build tests/fixtures/simple-csharp-app in Debug mode, launch the built DLL with dap-cli + netcoredbg/coreclr, hit a real Program.cs breakpoint, inspect stack/scopes/variables plus evaluate-or-fallback, continue, and clean up.
  Report exactly: result / what_worked / what_didnt / agent_confusion / dap_cli_ergonomic_issues / evidence / cleanup_verified: true|false.
  ```

### C-03 - Short-lived fixture stop-at-entry

- **focus:** Prove agents avoid missing short-lived console apps.
- **prerequisites:** Isolated home and compatible C# runtime.
- **exact skill/docs to read:** skill + C# NetCoreDbg reference.
- **target source/project:** `tests/fixtures/simple-csharp-short-lived`.
- **required outcome:** Build first, launch the output DLL with `stopAtEntry`/`--stop-on-entry`, then set or verify a real breakpoint before the app exits.
- **cleanup:** Close/cleanup/stop controller.
- **subagent_prompt:**
  ```text
  Read the dap-cli skill and C# NetCoreDbg reference first. Scenario C-03: use isolated DAP_CLI_HOME tmp/phase-21-fresh-agent-runs/C-03/.dap-cli-home. Build tests/fixtures/simple-csharp-short-lived, launch the DLL with stopAtEntry so it cannot exit before inspection, prove a breakpoint or entry stop, inspect paused state, continue, and clean up.
  Report exactly: result / what_worked / what_didnt / agent_confusion / dap_cli_ergonomic_issues / evidence / cleanup_verified: true|false.
  ```

### C-04 - Executable/DLL-only conclusion

- **focus:** Validate that agents use built artifacts and do not invent `.csproj` auto-build support.
- **prerequisites:** Isolated home.
- **exact skill/docs to read:** skill + C# NetCoreDbg reference + adapter setup inference table.
- **target source/project:** `tests/fixtures/simple-csharp-app`.
- **required outcome:** Explain and demonstrate that `.dll` launch/inference is supported after build, while `.csproj` as `program` is unsupported and should remain a diagnostic, not a workaround.
- **cleanup:** Close any created session; cleanup controller.
- **subagent_prompt:**
  ```text
  Read the dap-cli skill, C# NetCoreDbg reference, and adapter setup inference table first. Scenario C-04: use isolated DAP_CLI_HOME tmp/phase-21-fresh-agent-runs/C-04/.dap-cli-home. Build the simple C# fixture, launch the built DLL successfully, then safely show that a .csproj program shape is not the supported path. Do not execute MSBuild tasks implicitly through dap-cli.
  Report exactly: result / what_worked / what_didnt / agent_confusion / dap_cli_ergonomic_issues / evidence / cleanup_verified: true|false.
  ```

### C-05 - Safe local attach

- **focus:** Exercise same-machine PID attach without killing the debuggee on disconnect.
- **prerequisites:** Target process must be built and started only from `tests/fixtures/simple-csharp-attach`.
- **exact skill/docs to read:** skill + C# NetCoreDbg reference attach section.
- **target source/project:** `tests/fixtures/simple-csharp-attach`.
- **required outcome:** Start the owned fixture target, attach by PID, hit or pause to an inspectable stop, disconnect with `terminateDebuggee:false`, prove the target survived, then terminate only that owned child process.
- **cleanup:** Close/cleanup controller and terminate only the scenario-owned child process.
- **subagent_prompt:**
  ```text
  Read the dap-cli skill and C# NetCoreDbg reference first. Scenario C-05: use isolated DAP_CLI_HOME tmp/phase-21-fresh-agent-runs/C-05/.dap-cli-home. Build and start only tests/fixtures/simple-csharp-attach, capture its PID, attach through netcoredbg/coreclr, demonstrate a meaningful paused inspection if possible, disconnect with terminateDebuggee:false, prove the owned target survived, then stop only that target during cleanup.
  Report exactly: result / what_worked / what_didnt / agent_confusion / dap_cli_ergonomic_issues / evidence / cleanup_verified: true|false.
  ```

### C-06 - Launch config `coreclr`

- **focus:** Exercise VS Code-style `coreclr` launch-config discovery/use.
- **prerequisites:** Scenario may create a temporary `.vscode/launch.json` only inside scenario scratch.
- **exact skill/docs to read:** skill + C# NetCoreDbg reference + adapter setup launch config section.
- **target source/project:** Scratch workspace pointing at the built `simple-csharp-app` DLL.
- **required outcome:** Create/use a safe `type: "coreclr"` config with explicit DLL, list/select it via dap-cli, launch successfully, hit a breakpoint, and clean up.
- **cleanup:** Close session/controller; leave only scenario scratch.
- **subagent_prompt:**
  ```text
  Read the dap-cli skill and C# NetCoreDbg reference first. Scenario C-06: use isolated DAP_CLI_HOME tmp/phase-21-fresh-agent-runs/C-06/.dap-cli-home. Create a scratch workspace with a safe .vscode/launch.json using type "coreclr" and an explicit built DLL from tests/fixtures/simple-csharp-app. Use dap-cli launch-config discovery/selection, launch through the named config, hit a real breakpoint, inspect state, and clean up.
  Report exactly: result / what_worked / what_didnt / agent_confusion / dap_cli_ergonomic_issues / evidence / cleanup_verified: true|false.
  ```

### C-07 - Negative diagnostics

- **focus:** Validate agent interpretation of typed failure/recovery guidance.
- **prerequisites:** Isolated empty `DAP_CLI_HOME`; do not force unsafe workarounds.
- **exact skill/docs to read:** skill + C# NetCoreDbg reference troubleshooting section.
- **target source/project:** `tests/fixtures/simple-csharp-app` only as a bounded failed launch/readiness target.
- **required outcome:** Trigger at least one meaningful documented C# failure such as missing NetCoreDbg, unsupported platform, missing build output, `.csproj` launch shape, `clr` launch type, or unsupported launch variable; identify the correct recovery.
- **cleanup:** Stop any controller/session created.
- **subagent_prompt:**
  ```text
  Read the dap-cli skill and C# NetCoreDbg troubleshooting guidance first. Scenario C-07: use fresh isolated DAP_CLI_HOME tmp/phase-21-fresh-agent-runs/C-07/.dap-cli-home. Safely exercise a documented negative C# path and preserve the exact typed diagnostic plus the documented recovery. Do not use unsupported flags or unsafe workarounds to turn the negative case green.
  Report exactly: result / what_worked / what_didnt / agent_confusion / dap_cli_ergonomic_issues / evidence / cleanup_verified: true|false.
  ```

### C-08 - Screened external console/library repo

- **focus:** Reproduce a screened public C# debug flow from `21-EXTERNAL-PROJECT-RESULTS.md`.
- **prerequisites:** Use only the already-screened clone and SHA under `tmp/phase-21-external-csharp/`; no new network target except documented restore.
- **exact skill/docs to read:** skill + C# NetCoreDbg reference + `21-EXTERNAL-PROJECT-CANDIDATES.md` + `21-EXTERNAL-PROJECT-RESULTS.md`.
- **target source/project:** Prefer `tmp/phase-21-external-csharp/dotnet-samples/core/getting-started/golden/app`.
- **required outcome:** Separate restore/build/debug with isolated `DAP_CLI_HOME`, `DOTNET_CLI_HOME`, `NUGET_PACKAGES`; hit a public-repo breakpoint; inspect stack/scopes/variables/evaluate-or-fallback; continue/close.
- **cleanup:** Close controller/session; stop only phase-owned processes.
- **subagent_prompt:**
  ```text
  Read the dap-cli skill, C# NetCoreDbg reference, Phase 21 external candidate ledger, and Phase 21 external results first. Scenario C-08: use isolated homes under tmp/phase-21-fresh-agent-runs/C-08 and reproduce one already-screened public C# repo flow at its recorded SHA. Separate dotnet restore, dotnet build -c Debug --no-restore, and dap-cli debug execution. Reach a real breakpoint and inspect paused state, or report exactly what blocks it.
  Report exactly: result / what_worked / what_didnt / agent_confusion / dap_cli_ergonomic_issues / evidence / cleanup_verified: true|false.
  ```

### C-09 - External `coreclr` launch.json flow if found

- **focus:** Prove named-config use against a screened external repo when a safe config exists, or honestly report absence.
- **prerequisites:** Use only screened public repo clones; do not execute `preLaunchTask`/`postDebugTask`.
- **exact skill/docs to read:** skill + C# NetCoreDbg reference + candidate ledger.
- **target source/project:** Any selected external repo with a safe `.vscode/launch.json`; otherwise scratch a config that points to an already-screened built DLL and document that no native public config was found.
- **required outcome:** Use `launch --list-configs` and `launch --config`; prove `coreclr` mapping and breakpoint/state evidence, or report blocked because no safe external launch config exists.
- **cleanup:** Close/cleanup/stop controller.
- **subagent_prompt:**
  ```text
  Read the dap-cli skill, C# NetCoreDbg reference, and Phase 21 candidate ledger first. Scenario C-09: use isolated DAP_CLI_HOME tmp/phase-21-fresh-agent-runs/C-09/.dap-cli-home. Look only at already-screened external clones. If a safe coreclr launch.json exists, use dap-cli launch-config discovery/selection and prove breakpoint/state evidence. If none exists, create a scratch config pointing at a previously built safe external DLL and clearly report the absence of a native safe external launch config.
  Report exactly: result / what_worked / what_didnt / agent_confusion / dap_cli_ergonomic_issues / evidence / cleanup_verified: true|false.
  ```

### C-10 - Docs-only novice pass

- **focus:** See whether a novice fresh agent can produce a correct C#/.NET plan from docs without running commands.
- **prerequisites:** Read-only reasoning only; no terminal/project commands except file reads if needed.
- **exact skill/docs to read:** `dap-cli/skills/dap-cli/SKILL.md`, `dap-cli/skills/dap-cli/references/csharp-netcoredbg.md`, `docs/adapter-setup.md`.
- **target source/project:** Hypothetical `/workspace/my-csharp-app` and attach process PID `12345`.
- **required outcome:** Explain build-first DLL launch, `coreclr`, setup/readiness, `.csproj` non-goal, safe attach cleanup, public-repo screening, and why refs are reacquired after resume.
- **cleanup:** None; report `cleanup_verified: true` because no runtime resources were created.
- **subagent_prompt:**
  ```text
  Scenario C-10 is docs-only. Read dap-cli/skills/dap-cli/SKILL.md, dap-cli/skills/dap-cli/references/csharp-netcoredbg.md, and docs/adapter-setup.md, but do not run terminal/project commands. As a novice-facing check, explain the supported dap-cli + NetCoreDbg sequence for (a) build-first DLL launch, (b) launch.json coreclr use, (c) short-lived apps, (d) safe local PID attach, and (e) screened public repo validation. Include setup compatibility, .csproj non-goal, evaluate fallback, cleanup shape, and why paused-state references must be reacquired after resume.
  Report exactly: result / what_worked / what_didnt / agent_confusion / dap_cli_ergonomic_issues / evidence / cleanup_verified: true|false.
  ```
