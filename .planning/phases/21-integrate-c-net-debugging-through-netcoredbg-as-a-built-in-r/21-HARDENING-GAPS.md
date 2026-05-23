# Phase 21 C# / NetCoreDbg Hardening Gaps

hardening_status: closed

## Gap Ledger

### GAP-21-06-01 - C-03 fresh-agent stall

truth: "Short-lived C# stop-at-entry must have fresh-agent evidence before it can be claimed pass."
severity: major
classification: validation gap
source_scenarios: C-03
root_cause: "The non-interactive Copilot fresh-agent process stalled after reading docs and locating the fixture, before running build/launch commands or returning the report contract."
artifacts:
  - `/Users/roblou/.copilot/session-state/9a0a5508-bf66-4602-a12e-1eea79bfb357/events.jsonl`
missing_evidence:
  - `dotnet build tests/fixtures/simple-csharp-short-lived -c Debug`
  - `dap-cli launch` with `stopAtEntry`
  - entry/breakpoint stop, stack, and cleanup transcript
fix: "Reran C-03 with a focused prompt, explicit JSON `stopAtEntry:true`, local built CLI, and x64 Rosetta proof path."
rerun_scenario: C-03
status: closed
rerun_evidence: "`tmp/phase-21-fresh-agent-runs/C-03-rerun/logs/debug-stopatentry.log` records entry stop, verified line-12 breakpoint, `Program.Calculate()` stack, locals `left=8`, `right=13`, `result=0`, evaluate result `21`, termination, close, cleanup, and stop-controller."

### GAP-21-06-02 - C-06 launch-config flow blocked by environment/tooling detours

truth: "Coreclr launch-config discovery and named-config launch need a completed fresh-agent transcript before pass."
severity: major
classification: validation/product ergonomics gap
source_scenarios: C-06
root_cause: "The fresh agent hit multiple environment/tooling issues: long worktree Unix socket paths, older global `dap-cli` lacking Phase 21 `coreclr` mapping, stale same-scenario processes, and an eventual runner stall."
artifacts:
  - `/Users/roblou/.copilot/session-state/5c14c19f-a175-4d39-9a94-1ff06a478eb7/events.jsonl`
missing_evidence:
  - successful `launch --workspace ... --config ...`
  - breakpoint stop and stack/scopes/variables through the named config
  - clean teardown after named-config launch
fix: "Added controller TCP fallback for long Unix socket paths, then reran C-06 using local `node dist/index.js` and an absolute scratch `DAP_CLI_HOME`."
rerun_scenario: C-06
status: closed
rerun_evidence: "`tmp/phase-21-fresh-agent-runs/C-06-rerun/logs/final/transcript.log` records `launch --list-configs`, named `coreclr` config launch, verified breakpoint line 17, `Program.Calculate()` stack, locals `left=2`, `right=3`, `result=0`, evaluate `left + right` => `5`, and final termination."

### GAP-21-06-03 - External fresh-agent scenarios not executed

truth: "C-08 and C-09 cannot inherit pass from Plan 21-05 external validation; they need their own fresh-agent JSONL transcripts."
severity: major
classification: validation gap
source_scenarios: C-08, C-09
root_cause: "Earlier fresh-agent stalls consumed the execution budget, so C-08/C-09 were not started."
artifacts:
  - `.planning/phases/21-integrate-c-net-debugging-through-netcoredbg-as-a-built-in-r/21-RESULTS.md`
missing_evidence:
  - C-08 fresh-agent transcript against screened `dotnet/samples`
  - C-09 external/scratch `coreclr` launch-config transcript
fix: "Reran C-08 and C-09 as explicit fresh-agent scenarios against the already-screened `dotnet/samples` clone."
rerun_scenario: C-08, C-09
status: closed
rerun_evidence: "C-08 fresh-agent rerun produced `tmp/phase-21-fresh-agent-runs/C-08-rerun/logs/*` artifacts with screened public DLL launch, breakpoint/stack/scopes/variables/evaluate fallback/continue/cleanup. C-09 rerun produced `tmp/phase-21-fresh-agent-runs/C-09-rerun/evidence.log` with scratch `coreclr` launch.json, config launch, breakpoint/stack/scopes/variables/evaluate fallback/stdout/exit/cleanup."

### GAP-21-06-04 - Diagnostics for unsupported `.csproj` launch can mislead

truth: "A `.csproj` program shape should steer C# users to build-first DLL launch, not generic adapter/type flag recovery."
severity: minor
classification: product/docs gap
source_scenarios: C-04
root_cause: "The generic `adapter_inference_failed` diagnostic says to pass `--adapter` or `--type`; in the C# case the safer recovery is to build first and launch the DLL."
artifacts:
  - `src/config/programInference.ts`
  - `dap-cli/skills/dap-cli/references/csharp-netcoredbg.md`
missing_evidence:
  - targeted product diagnostic update and C-04 rerun
fix: "Updated `src/config/programInference.ts` and tests so `.csproj` inference failure explains that dap-cli does not build/launch `.csproj` files automatically and tells users to build first then launch the output DLL."
rerun_scenario: C-04
status: closed
rerun_evidence: "`npx vitest run tests/config/programInference.test.ts tests/integration/launchInference.test.ts` passed with `.csproj` build-first DLL recovery assertions."

### GAP-21-06-05 - Controller socket path failures are opaque

truth: "Long `DAP_CLI_HOME`/worktree paths should fail with actionable diagnostics or be avoided by the scenario harness."
severity: major
classification: product ergonomics gap
source_scenarios: C-05, C-06
root_cause: "macOS Unix socket path limits caused `serve-controller`/`start` failures that surfaced as `internal_error` or `controller_unavailable`; the C-05 agent worked around it with a short workdir."
artifacts:
  - `src/controller/ipc.ts`
  - `src/cli/commands/controller.ts`
missing_evidence:
  - product diagnostic patch and C-05/C-06 rerun under a long worktree path
fix: "Updated `src/controller/ipc.ts` to fall back to localhost TCP when a Unix controller socket path would exceed the safe path length; added controller IPC regression coverage."
rerun_scenario: C-05, C-06
status: closed
rerun_evidence: "`npx vitest run tests/controller/controllerIpc.test.ts` passed; C-03/C-06 rerun logs show controller endpoints using `kind:\"tcp\"` with localhost ports under long phase scratch paths."

### GAP-21-06-06 - C-10 initial cleanup flag error

truth: "Docs-only scenarios that create no runtime resources should report `cleanup_verified:true`."
severity: minor
classification: validation report gap
source_scenarios: C-10
root_cause: "First C-10 prompt omitted the explicit docs-only cleanup expectation in the runner invocation."
artifacts:
  - `/Users/roblou/.copilot/session-state/cc058b5a-e54b-4653-9fa4-8dad-3ca6c38e2bec/events.jsonl`
  - `/Users/roblou/.copilot/session-state/727466d7-4519-4541-9bb5-8d678581297b/events.jsonl`
missing_evidence: []
fix: "Reran C-10 with the exact cleanup expectation; passing transcript reports `cleanup_verified:true`."
rerun_scenario: C-10
status: closed
rerun_evidence: "`21-RESULTS.md` records the passing C-10 rerun transcript and does not count the initial wrong cleanup flag as pass."

### GAP-21-06-07 - Full `npm run check` blocked by unrelated self-hosting timeout

truth: "Phase 21 ledger-only changes should not claim a green full suite when `npm run check` times out in an unrelated self-hosting js-debug test."
severity: major
classification: verification environment gap
source_scenarios: Task 21-06-02 verification
root_cause: "Full-suite verification repeatedly timed out in `tests/integration/selfHosting.test.ts` 5-second js-debug self-hosting tests. The first run also needed the known Phase 20 `GOTOOLCHAIN=go1.24.0` override for Delve compatibility; after exact stale debug/controller PID cleanup, focused self-hosting rerun passed once, but full-suite reruns still hit a different 5-second self-hosting timeout. Phase 21-focused NetCoreDbg/docs tests passed."
artifacts:
  - `tests/integration/selfHosting.test.ts`
  - `vitest.config.ts`
missing_evidence:
  - green unmodified `npm run check`
fix: "Reran focused self-hosting successfully once; full `GOTOOLCHAIN=go1.24.0 npm run check` still failed once in self-hosting and requires final verify-work rerun before phase completion."
rerun_scenario: full-suite verification
status: closed
rerun_evidence: "`GOTOOLCHAIN=go1.24.0 npm run check` passed during `/gsd-verify-work 21`: 45 test files passed, 536 tests passed, 11 skipped; build succeeded."

## Exit State

- Closed gaps: GAP-21-06-01 through GAP-21-06-06.
- Closed during verify-work: GAP-21-06-07.
- No blocked scenario is marked pass without rerun evidence in `21-RESULTS.md`.
- Product fixes landed for `.csproj` diagnostics and long controller socket path fallback.
