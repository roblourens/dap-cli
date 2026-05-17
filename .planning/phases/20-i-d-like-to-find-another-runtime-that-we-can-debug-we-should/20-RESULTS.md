# Phase 20 Fresh-Agent Go / Delve Results

## Initial Results

### G-01 - Install and readiness

initial_result: G-01 pass
result: pass
what_worked: Fresh agent followed the readiness docs, proved the isolated home was initially missing Delve on PATH, ran setup, found `adapters/delve/dlv`, and verified Delve `Version: 1.26.3`.
what_didnt: Terminal output was noisy during concurrent runs, so the agent relied on scenario-specific scratch inspection and direct version output.
agent_confusion: The adapter-wide setup command makes a Go-only readiness check slightly indirect.
dap_cli_ergonomic_issues: A dedicated Delve readiness/status command would be clearer than inferring success from setup artifacts.
evidence: G-01 reported `DELVE_NOT_ON_PATH`, then isolated-home `adapters/delve/dlv version` returned `Delve Debugger`, `Version: 1.26.3`.
cleanup_verified: true

### G-02 - Fixture launch debug

initial_result: G-02 pass
result: pass
what_worked: Debug-mode launch of `tests/fixtures/simple-go-app` hit verified breakpoint `main.go:6`, showed top frame `main.calculate`, and evaluated `left + right` as `5`.
what_didnt: A launch without `--stop-on-entry` exited before a breakpoint could be installed. Stack/resume later needed explicit thread `1` once Delve exposed multiple goroutines.
agent_confusion: The original Go reference did not say clearly enough that short-lived Go targets should be launched stopped when follow-up breakpoint commands are needed.
dap_cli_ergonomic_issues: Delve thread auto-selection is recoverable but uneven once several Go threads are visible.
evidence: Session `sess_NkVeOB7yIFt4qfUi`; verified `main.go:6`; status `stoppedReason:"breakpoint"`; stack `main.calculate`; evaluate result `5`; final status `terminated`.
cleanup_verified: true

### G-03 - Fixture test mode

initial_result: G-03 pass
result: pass
what_worked: Test-mode flow reached verified `calculate.go:4`, stopped inside `simple-go-test.calculate`, and exposed locals `left=4`, `right=6`.
what_didnt: Isolated setup failed once with `TypeError: Cannot read properties of undefined (reading 'trim')` during debugpy provisioning. A no-stop-on-entry launch also raced normal test exit. Stack needed explicit stopped thread `34`.
agent_confusion: The short-test race and setup failure were the main detours.
dap_cli_ergonomic_issues: Setup failure for an unrelated adapter interrupts a Go-only flow; stopped-thread recovery required an extra `threads` read.
evidence: Breakpoint `calculate.go:4` verified; status `breakpoint`; thread `34` marked `simple-go-test.calculate`; variables included `left=4`, `right=6`; cleanup emptied sessions and stopped the controller.
cleanup_verified: true

### G-04 - Fixture exec mode

initial_result: G-04 pass
result: pass
what_worked: Agent built a debug-symbol fixture binary, exec-launched it, hit verified `main.go:7`, evaluated `result` as `5`, and inspected `main.calculate`/`main.main` stack frames.
what_didnt: Setup initially failed with the same debugpy `.trim()` crash. The tiny binary exited too fast without `--stop-on-entry`.
agent_confusion: The original exec guidance did not connect short-lived binaries to `--stop-on-entry`.
dap_cli_ergonomic_issues: Thread selection diagnostics are good but add repeated retry steps for Go exec sessions.
evidence: Mach-O debug binary in scratch; PATH Delve `1.26.3`; breakpoint id `1` at `main.go:7`; evaluate result `5`; final session `terminated`.
cleanup_verified: true

### G-05 - Safe local attach

initial_result: G-05 pass
result: pass
what_worked: Owned `simple-go-attach` process PID `41566` attached through Delve local mode, hit `main.go:9`, showed locals/evaluate result `15`, disconnected with `terminateDebuggee:false`, proved the target survived, then terminated only that target.
what_didnt: Setup encountered the same debugpy `.trim()` crash. The first `stop-controller` success response was followed by one lingering scenario-owned controller PID, which the agent explicitly cleaned by exact PID.
agent_confusion: Attach repeated once with `session_name_in_use`, confirming the first attach had already succeeded despite noisy output.
dap_cli_ergonomic_issues: Go-only setup should not be obscured by unrelated debugpy virtualenv failure; controller stop lifecycle deserves a focused follow-up check.
evidence: Breakpoint `main.go:9` verified; top stack `main.calculate`; evaluate `left + right` => `15`; `G05_TARGET_ALIVE_AFTER_DISCONNECT=true`; final PID checks absent.
cleanup_verified: true

### G-06 - Launch config use

initial_result: G-06 pass
result: pass
what_worked: Scratch `type:"go"` config was discovered as `G-06 Go fixture launch`, launched through named config, hit `main.go:6`, showed `main.calculate`, and evaluated `left + right` as `5`.
what_didnt: First stack request required explicit thread id after status reported the breakpoint stop.
agent_confusion: Shared terminal cwd/output contamination required absolute paths and sentinel markers; scenario itself remained coherent.
dap_cli_ergonomic_issues: `stoppedThreadIds` was empty even though `threads` clearly exposed the stopped Go thread.
evidence: Config discovery returned the named Go launch configuration; launch stopped; breakpoint verified line `6`; status `paused:true`; stack/evaluate succeeded; cleanup returned sessions `[]`.
cleanup_verified: true

### G-07 - Screened external repo CLI

initial_result: G-07 pass
result: pass
what_worked: Screened `rakyll/hey` SHA matched the ledger, agent rebuilt a symbol-friendly scratch binary, exec-debugged with no benchmark URL, hit `hey.go:114`, and inspected locals.
what_didnt: Setup failed with the debugpy `.trim()` crash, so the agent used documented PATH Delve fallback. Final continue needed explicit thread `1`.
agent_confusion: Docs/ledger were sufficient; concurrent output was the only execution noise.
dap_cli_ergonomic_issues: Adapter setup remained coarse-grained for a Go-only workflow.
evidence: SHA `5626f79b8698df6daf9b25799c9805c6acc96740`; events breakpoint thread `1`; stack `main.main` at `hey.go:114`; locals `hs`; final usage output proves no HTTP benchmark target was contacted.
cleanup_verified: true

### G-08 - Screened external repo tests

initial_result: G-08 pass
result: pass
what_worked: Existing `tidwall/gjson` screened clone debugged in test mode; breakpoint `gjson.go:2131` hit; stack and locals exposed `gjson.Get`, `path:"zzzz"`, and input JSON.
what_didnt: Direct `evaluate --expression path` failed with `dap_request_failed`.
agent_confusion: Existing docs presented scopes/variables but did not explicitly say to use them as the recovery path when real Delve evaluation is rejected.
dap_cli_ergonomic_issues: Evaluator failure diagnostics did not suggest the available locals fallback.
evidence: SHA `7d8b3821e9d2acf35e8a226b63fcf801078e9b96`; stopped event breakpoint thread `34`; stack `gjson.Get`; scopes `Locals`; variables include `path:"zzzz"`.
cleanup_verified: true

### G-09 - Negative diagnostics

initial_result: G-09 pass
result: pass
what_worked: Agent safely produced typed `delve_not_found` for a simple-Go launch and identified the documented recovery.
what_didnt: Empty `DAP_CLI_HOME` alone did not force the negative case because this machine also had usable PATH Delve; the agent bounded PATH visibility to reach the diagnostic.
agent_confusion: Reproducing Delve absence requires controlling both isolated home and PATH fallback.
dap_cli_ergonomic_issues: The error envelope itself is good; only deterministic reproduction needs care.
evidence: Error code `delve_not_found`, category `usage`, exit code `2`, diagnostics naming setup and PATH; post-failure sessions empty and controller stopped.
cleanup_verified: true

### G-10 - Docs-only novice pass

initial_result: G-10 pass
result: pass
what_worked: Docs-only agent correctly explained debug/test/exec/local attach flows, `cwd`, `dlvCwd`, `processId`, setup/toolchain, cleanup policy, and ref reacquisition.
what_didnt: Initial docs explained attach lifecycle conceptually but did not show the exact `disconnect` request payload with `terminateDebuggee:false`.
agent_confusion: Low; attach close/disconnect distinction was the only likely novice ambiguity.
dap_cli_ergonomic_issues: Safe attach cleanup relied on DAP terminology instead of a demonstrated command.
evidence: Agent cited the skill/reference sections for all four modes and called out the missing exact attach disconnect command.
cleanup_verified: true

## Reruns After Hardening

### Rerun G-02 - Short-lived debug guidance

rerun_of: G-02
same_prompt: true
result: pass
rerun_evidence: Fresh agent used the updated guidance successfully: isolated setup completed, short-lived fixture debug reached verified `main.go:6`, stack `main.calculate`, locals `left=2`, `right=3`, and cleanup removed controller/adapter scratch. Direct evaluate of `result` still failed, but the new scopes/variables fallback enabled completion.
cleanup_verified: true

### Rerun G-03 - Test setup and short-lived guidance

rerun_of: G-03
same_prompt: true
result: pass
rerun_evidence: Fresh test-mode agent completed setup after removing only an already-partial scenario-local venv, launched `simple-go-test`, hit verified `calculate.go:4`, inspected locals, and cleaned controller/adapter scratch. It still noted `stoppedThreadIds: []` versus `threads` showing the starred thread.
cleanup_verified: true

### Rerun G-08 - Evaluate fallback guidance

rerun_of: G-08
same_prompt: true
result: pass
rerun_evidence: Fresh external-repo agent explicitly said the Go/Delve reference now makes evaluator recovery clear; after `evaluate path` failed, it retained the stop and read scopes/variables for `path:"zzzz"` successfully.
cleanup_verified: true

### Rerun G-10 - Attach disconnect docs

rerun_of: G-10
same_prompt: true
result: pass
rerun_evidence: Docs-only fresh agent now found the exact attach disconnect request with `terminateDebuggee:false`, plus setup, stop-on-entry advice, `cwd`/`dlvCwd`, and ref reacquisition.
cleanup_verified: true

### Rerun G-08 - Partial debugpy virtualenv recovery

rerun_of: G-08
same_prompt: true
result: pass
rerun_evidence: After the partial-venv repair landed, a fresh G-08 attempt reached the same screened gjson breakpoint path without reporting setup failure, then reproduced the documented evaluate-to-locals recovery and clean teardown. Separate orchestrator verification deleted `venv/bin/pip` in scratch and confirmed a second `npm run setup-adapters` rebuilt the venv successfully.
cleanup_verified: true