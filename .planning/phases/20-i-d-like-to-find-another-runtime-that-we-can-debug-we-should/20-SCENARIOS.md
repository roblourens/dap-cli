---
phase: 20
status: ready
scenario_count: 10
scratch_root: tmp/phase-20-fresh-agent-runs
---

# Phase 20 Fresh-Agent Go / Delve Scenario Matrix

## How To Use

Plan 20-06 runs one fresh subagent per scenario prompt below. Every subagent works only in `/Users/roblou/code/dap-cli`, uses repo-local scratch under `tmp/phase-20-fresh-agent-runs/`, reads the stated skill/docs before acting, and returns the fixed report contract without smoothing over failures. The prompt describes the task and the success bar; the fresh agent must derive the dap-cli sequence from the skill and Go/Delve reference.

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

- Read `dap-cli/skills/dap-cli/SKILL.md` and `dap-cli/skills/dap-cli/references/go-delve.md` before commands unless the scenario intentionally says docs-only novice flow.
- Use an isolated `DAP_CLI_HOME` under `tmp/phase-20-fresh-agent-runs/<scenario>/.dap-cli-home` for real debug sessions.
- Use `GOTOOLCHAIN=go1.24.0` for Delve-backed Go builds/debuggee launches where Delve's supported-toolchain requirement matters.
- Clean up only phase-owned sessions/processes/files. Do not kill unrelated Go processes.
- Capture failures as failures. A typed diagnostic or blocked safety constraint is valid evidence.

## Scenario Matrix

### G-01 - Install and readiness

- **focus:** Prove a fresh agent can reach a usable Delve setup/readiness conclusion.
- **prerequisites:** Built repo checkout; isolated `DAP_CLI_HOME`; no assumption that Delve already exists in that home.
- **exact skill/docs to read:** `dap-cli/skills/dap-cli/SKILL.md`, `dap-cli/skills/dap-cli/references/go-delve.md`, `docs/adapter-setup.md` Go / Delve section.
- **target source/project:** Adapter setup path only; no debuggee launch required.
- **required outcome:** Identify the supported readiness path, run the necessary setup/readiness checks, and report whether pinned Delve becomes available or why it cannot.
- **cleanup:** Stop any controller accidentally started; leave only scenario scratch caches.
- **subagent_prompt:**
  ```text
  Read the dap-cli skill, Go/Delve reference, and adapter setup Go section before commands.
  Scenario G-01: in /Users/roblou/code/dap-cli, use an isolated DAP_CLI_HOME under tmp/phase-20-fresh-agent-runs/G-01/.dap-cli-home and determine the supported readiness path for Go/Delve debugging. Do not launch a debuggee. Show whether Delve is already usable or becomes usable through the documented setup flow, and preserve the actionable diagnostic if setup cannot complete.
  Cleanup only controllers you started.
  Report exactly: result / what_worked / what_didnt / agent_confusion / dap_cli_ergonomic_issues / evidence / cleanup_verified: true|false.
  ```

### G-02 - Fixture launch debug

- **focus:** Debug a repo-owned Go application fixture in Delve `mode: "debug"`.
- **prerequisites:** Setup/readiness complete inside this scenario's isolated home.
- **exact skill/docs to read:** skill + Go/Delve reference.
- **target source/project:** `tests/fixtures/simple-go-app`.
- **required outcome:** Launch paused or stop predictably, set a real breakpoint in fixture source, stop on it, inspect stack plus a local/evaluation, continue, and close cleanly.
- **cleanup:** Close session, cleanup phase-owned session state, stop controller.
- **subagent_prompt:**
  ```text
  Read the dap-cli skill and Go/Delve reference first. Scenario G-02: in /Users/roblou/code/dap-cli, use isolated DAP_CLI_HOME tmp/phase-20-fresh-agent-runs/G-02/.dap-cli-home and GOTOOLCHAIN=go1.24.0. Debug tests/fixtures/simple-go-app as a Go package with dap-cli + Delve. Set a real source breakpoint in the fixture's app code, stop on it, show the top stack frame, inspect one meaningful value by evaluate or scopes/variables, resume, and clean up.
  Report exactly: result / what_worked / what_didnt / agent_confusion / dap_cli_ergonomic_issues / evidence / cleanup_verified: true|false.
  ```

### G-03 - Fixture test mode

- **focus:** Debug Go tests with Delve `mode: "test"`.
- **prerequisites:** Isolated home and supported Go toolchain.
- **exact skill/docs to read:** skill + Go/Delve reference.
- **target source/project:** `tests/fixtures/simple-go-test`.
- **required outcome:** Launch test mode, bind and hit a breakpoint in tested/test code, inspect paused stack and locals, continue/close cleanly.
- **cleanup:** Close session, cleanup, stop controller.
- **subagent_prompt:**
  ```text
  Read the dap-cli skill and Go/Delve reference first. Scenario G-03: in /Users/roblou/code/dap-cli, use isolated DAP_CLI_HOME tmp/phase-20-fresh-agent-runs/G-03/.dap-cli-home and GOTOOLCHAIN=go1.24.0. Debug tests/fixtures/simple-go-test in Delve test mode. Hit one real source breakpoint, inspect the paused stack and locals, then resume and clean up.
  Report exactly: result / what_worked / what_didnt / agent_confusion / dap_cli_ergonomic_issues / evidence / cleanup_verified: true|false.
  ```

### G-04 - Fixture exec mode

- **focus:** Debug a symbol-friendly prebuilt Go fixture binary in Delve `mode: "exec"`.
- **prerequisites:** Isolated home, supported Go toolchain, binary built only in scenario scratch.
- **exact skill/docs to read:** skill + Go/Delve reference.
- **target source/project:** `tests/fixtures/simple-go-app` plus a scratch binary.
- **required outcome:** Build with debug symbols, exec-launch the binary, hit a real source breakpoint, inspect stack and one value, close cleanly.
- **cleanup:** Close session/controller and leave only scenario scratch artifacts.
- **subagent_prompt:**
  ```text
  Read the dap-cli skill and Go/Delve reference first. Scenario G-04: in /Users/roblou/code/dap-cli, use isolated DAP_CLI_HOME tmp/phase-20-fresh-agent-runs/G-04/.dap-cli-home and GOTOOLCHAIN=go1.24.0. Build a symbol-friendly scratch binary from tests/fixtures/simple-go-app and debug that binary through Delve exec mode. Hit a real app source breakpoint, inspect paused stack plus one useful value, resume, and clean up.
  Report exactly: result / what_worked / what_didnt / agent_confusion / dap_cli_ergonomic_issues / evidence / cleanup_verified: true|false.
  ```

### G-05 - Safe local attach

- **focus:** Exercise same-machine local PID attach without killing the debuggee on disconnect.
- **prerequisites:** Isolated home; target process must be built and started only from `tests/fixtures/simple-go-attach`.
- **exact skill/docs to read:** skill + Go/Delve reference.
- **target source/project:** `tests/fixtures/simple-go-attach`.
- **required outcome:** Start the owned fixture target, attach with its PID, hit/inspect a real paused stop if reachable, disconnect with the documented lifecycle contract, prove the process survived disconnect, then terminate only that owned process.
- **cleanup:** Close/cleanup controller and terminate only the scenario-owned child process.
- **subagent_prompt:**
  ```text
  Read the dap-cli skill and Go/Delve reference first. Scenario G-05: in /Users/roblou/code/dap-cli, use isolated DAP_CLI_HOME tmp/phase-20-fresh-agent-runs/G-05/.dap-cli-home and GOTOOLCHAIN=go1.24.0. Build and start only the repo-owned tests/fixtures/simple-go-attach target, capture its PID, attach through Delve local PID mode, demonstrate a meaningful paused inspection if possible, then disconnect using the documented non-terminating attach lifecycle. Prove the owned target survived the debugger disconnect, and finally stop only that target during cleanup.
  Report exactly: result / what_worked / what_didnt / agent_confusion / dap_cli_ergonomic_issues / evidence / cleanup_verified: true|false.
  ```

### G-06 - Launch config use

- **focus:** Exercise VS Code-style Go launch-config discovery/use.
- **prerequisites:** Scenario may create a temporary `.vscode/launch.json` only inside `tmp/phase-20-fresh-agent-runs/G-06/workspace`.
- **exact skill/docs to read:** skill + Go/Delve reference + adapter setup mention of launch config behavior if needed.
- **target source/project:** Scratch workspace pointing at `tests/fixtures/simple-go-app` by absolute path or copied minimal fixture only if the agent explains why.
- **required outcome:** Create/use a safe `type: "go"` launch config, list or select it via dap-cli, launch successfully, hit a breakpoint, and clean up.
- **cleanup:** Close session/controller; leave only scenario scratch.
- **subagent_prompt:**
  ```text
  Read the dap-cli skill and Go/Delve reference first. Scenario G-06: in /Users/roblou/code/dap-cli, use isolated DAP_CLI_HOME tmp/phase-20-fresh-agent-runs/G-06/.dap-cli-home and GOTOOLCHAIN=go1.24.0. Create a temporary scratch workspace under tmp/phase-20-fresh-agent-runs/G-06/workspace with a safe VS Code launch config using type "go" that targets the repo-owned simple Go app fixture. Use dap-cli launch-config discovery/selection, launch through the named config, hit a real breakpoint, inspect enough state to prove the config was honored, and clean up.
  Report exactly: result / what_worked / what_didnt / agent_confusion / dap_cli_ergonomic_issues / evidence / cleanup_verified: true|false.
  ```

### G-07 - Screened external repo CLI

- **focus:** Reproduce a screened public Go CLI flow from the Phase 20 external ledger.
- **prerequisites:** Use only the already-screened clone and SHA in `tmp/phase-20-external-go-projects/rakyll-hey`; no new network target.
- **exact skill/docs to read:** skill + Go/Delve reference + `20-EXTERNAL-PROJECT-RESULTS.md` Attempt GO-EXT-04.
- **target source/project:** `tmp/phase-20-external-go-projects/rakyll-hey`.
- **required outcome:** Recreate the safe exec/prebuilt or equivalent CLI breakpoint flow without sending benchmark traffic, record whether agent guidance is sufficient, and clean up.
- **cleanup:** Close controller/session; stop only phase-owned processes.
- **subagent_prompt:**
  ```text
  Read the dap-cli skill, Go/Delve reference, and Phase 20 external results Attempt GO-EXT-04 first. Scenario G-07: in /Users/roblou/code/dap-cli, use isolated DAP_CLI_HOME tmp/phase-20-fresh-agent-runs/G-07/.dap-cli-home and GOTOOLCHAIN=go1.24.0. Reproduce a safe real-repo CLI Delve flow against the existing screened shallow clone tmp/phase-20-external-go-projects/rakyll-hey at its recorded SHA. Do not send HTTP benchmark traffic. Reach a real breakpoint and inspect paused state, or report exactly what blocks that result.
  Report exactly: result / what_worked / what_didnt / agent_confusion / dap_cli_ergonomic_issues / evidence / cleanup_verified: true|false.
  ```

### G-08 - Screened external repo tests or service

- **focus:** Reproduce a screened public Go test flow and observe real-project agent confusion.
- **prerequisites:** Use existing screened clones; no cloud/Docker/API subtrees.
- **exact skill/docs to read:** skill + Go/Delve reference + `20-EXTERNAL-PROJECT-RESULTS.md` GO-EXT-02 or GO-EXT-03.
- **target source/project:** Prefer `tmp/phase-20-external-go-projects/tidwall-gjson`; `google-go-cmp` is acceptable if justified.
- **required outcome:** Launch tests in Delve, hit a recorded or equivalent real breakpoint, inspect stack plus locals, and note whether evaluator fallback is obvious from current docs.
- **cleanup:** Close/cleanup/stop controller.
- **subagent_prompt:**
  ```text
  Read the dap-cli skill, Go/Delve reference, and the Phase 20 external results for GO-EXT-02 and GO-EXT-03 first. Scenario G-08: in /Users/roblou/code/dap-cli, use isolated DAP_CLI_HOME tmp/phase-20-fresh-agent-runs/G-08/.dap-cli-home and GOTOOLCHAIN=go1.24.0. Reproduce one safe screened public-repo test-mode flow using the existing shallow clone of tidwall/gjson if possible, or google/go-cmp if you explain the choice. Hit a real breakpoint, inspect stack plus locals, and pay attention to whether the docs make recovery obvious if direct evaluate is rejected.
  Report exactly: result / what_worked / what_didnt / agent_confusion / dap_cli_ergonomic_issues / evidence / cleanup_verified: true|false.
  ```

### G-09 - Negative diagnostics

- **focus:** Validate agent interpretation of typed failure/recovery guidance.
- **prerequisites:** Isolated empty `DAP_CLI_HOME`; do not force unsafe workarounds.
- **exact skill/docs to read:** skill + Go/Delve reference negative diagnostics.
- **target source/project:** `tests/fixtures/simple-go-app` only as a failed launch/readiness target.
- **required outcome:** Trigger at least one meaningful documented Go/Delve negative diagnostic safely, identify the correct recovery from docs, and stop without papering over it if executing the recovery would collapse the negative case.
- **cleanup:** Stop any controller/session created.
- **subagent_prompt:**
  ```text
  Read the dap-cli skill and Go/Delve negative diagnostics section first. Scenario G-09: in /Users/roblou/code/dap-cli, use a fresh isolated DAP_CLI_HOME tmp/phase-20-fresh-agent-runs/G-09/.dap-cli-home. Safely exercise a documented Go/Delve failure path such as launching before Delve is provisioned or another bounded typed diagnostic involving the simple Go app fixture. Identify the exact diagnostic and the documented recovery. Do not use unsupported flags or unsafe workarounds just to turn the negative case green.
  Report exactly: result / what_worked / what_didnt / agent_confusion / dap_cli_ergonomic_issues / evidence / cleanup_verified: true|false.
  ```

### G-10 - Docs-only novice pass

- **focus:** See whether a novice fresh agent can produce a correct Go/Delve plan from docs without running commands.
- **prerequisites:** Read-only reasoning only; no terminal/project commands except file reads if needed.
- **exact skill/docs to read:** `dap-cli/skills/dap-cli/SKILL.md`, `dap-cli/skills/dap-cli/references/go-delve.md`.
- **target source/project:** Hypothetical `/workspace/my-go-module` package and attach process PID `12345` examples from docs.
- **required outcome:** Explain which modes/fields/cleanup belong to debug, test, exec, and local attach; mention `cwd`, `dlvCwd`, Delve setup/toolchain, and why refs are reacquired after resume.
- **cleanup:** None; report `cleanup_verified: true` because no runtime resources were created.
- **subagent_prompt:**
  ```text
  Scenario G-10 is docs-only. Read dap-cli/skills/dap-cli/SKILL.md and dap-cli/skills/dap-cli/references/go-delve.md, but do not run terminal/project commands. As a novice-facing check, explain the supported dap-cli + Delve sequence for (a) package debug, (b) package tests, (c) symbol-friendly exec binary, and (d) safe same-machine local PID attach. Include which fields matter (`cwd`, `dlvCwd`, processId), setup/toolchain prerequisites, cleanup shape, and why paused-state references must be reacquired after resume. If the docs leave you guessing, say so explicitly.
  Report exactly: result / what_worked / what_didnt / agent_confusion / dap_cli_ergonomic_issues / evidence / cleanup_verified: true|false.
  ```