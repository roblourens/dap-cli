---
status: complete
phase: 20-i-d-like-to-find-another-runtime-that-we-can-debug-we-should
source:
  - 20-01-SUMMARY.md
  - 20-02-SUMMARY.md
  - 20-03-SUMMARY.md
  - 20-04-SUMMARY.md
  - 20-05-SUMMARY.md
  - 20-06-SUMMARY.md
started: 2026-05-17T18:12:46Z
updated: 2026-05-17T20:05:51Z
---

## Current Test

[complete - conversational checkpoints and mandatory hand-driven smoke re-verification passed]

## Tests

### 1. Delve setup is visible and bounded
expected: Running the adapter setup dry-run describes Delve v1.26.3 provisioning from the official release path, and a missing Delve binary surfaces the typed `delve_not_found` guidance instead of an opaque launch failure.
result: pass

### 2. Go launch selection feels native
expected: A Go target can be selected through `type: "go"`, `.go` inference, or `--adapter delve`, while relative package programs resolve from the effective Go working directory instead of surprising the user.
result: pass

### 3. Go debug and test sessions reach inspectable stops
expected: Package debug and package test sessions launched through Delve can set verified breakpoints, stop, expose threads and stacks, and inspect runtime values through normal paused-state commands.
result: pass

### 4. Go exec and local attach stay practical
expected: A symbol-friendly Go executable can be debugged in exec mode, and same-machine PID attach can disconnect with `terminateDebuggee:false` without killing the target process.
result: pass

### 5. Go guidance is enough for a fresh agent
expected: The public adapter docs and Go/Delve skill reference explain Go 1.24+, `cwd` versus `dlvCwd`, short-lived target handling, attach lifecycle, and evaluate-to-locals fallback without requiring code archaeology.
result: pass

### 6. Public-project validation stays auditable
expected: Phase 20's public Go validation ledger names screened repos, records SHA-pinned debug attempts, preserves safety constraints, and leaves cleanup evidence rather than only summarizing success.
result: pass

### 7. Hand-Driven CLI Smoke Sequence A
expected: The real CLI Node round-trip follows `dev/smoke/hand-driven-smoke.md` Sequence A verbatim, including an entry-paused status after the documented short async settle delay, breakpoint stop visibility, and clean teardown.
result: pass
verified_by: "The orchestrator reran the published CLI sequence after clarifying the smoke contract for js-debug's asynchronous entry-stop projection. `status --name smoke-node` reported `paused:true` / `stoppedReason:entry`, the line-3 breakpoint verified, stack top was `dapCliSelfHostDemo`, post-continue status reported `stoppedReason:breakpoint`, and close/controller teardown returned cleanly."

### 8. Hand-Driven CLI Smoke Sequence B
expected: The real CLI Chromium/js-debug handoff follows `dev/smoke/hand-driven-smoke.md` Sequence B verbatim, including page-child visibility, breakpoint pause mirroring, `Window.calculate` stack inspection, a valid background evaluate outcome, clean close, and no smoke-owned Chromium orphans.
result: pass
verified_by: "The orchestrator reran the published CLI browser sequence after correcting the smoke contract to accept either valid evaluate race outcome. This replay exercised the timeout branch: `evaluate` exited with `controller_request_timeout`, `events --include stopped` showed `reason:breakpoint`, status reported paused breakpoint state, stack top was `Window.calculate` at app.js line 2, close returned no orphan PIDs, and `pgrep` printed `no smoke profile orphans`."

### 9. Go failure and recovery diagnostics stay actionable
expected: A Delve 1.26.3 launch under active Go 1.23.5 fails before adapter startup with `delve_go_version_incompatible`; `GOTOOLCHAIN=go1.24.0` reaches the controller-spawned Delve adapter and launches the checked-in Go fixture; failed DAP responses preserve adapter-provided detail in CLI diagnostics.
result: pass
verified_by: "The orchestrator reproduced the local Go 1.23.5 plus Delve 1.26.3 pairing, rebuilt `dist/`, observed the early `delve_go_version_incompatible` envelope with the supported `GOTOOLCHAIN=go1.24.0` guidance, then started a real controller and launched `tests/fixtures/simple-go-app` with the override until Delve reported a stopped-on-entry session. Focused protocol/CLI tests also verified `Adapter detail:` propagation for failed DAP response bodies."

## Summary

total: 9
passed: 9
issues: 0
pending: 0
skipped: 0
blocked: 0

## Gaps

- truth: "Sequence A reports `paused:true` with `stoppedReason:entry` at the documented post-launch status step after the asynchronous js-debug child stop has a short settle window."
  status: closed
  reason: "The original smoke text over-specified the timing of a child-session stopped event. `launch` can return before js-debug's entry stop mirrors onto the parent record; the product behavior was already correct and the hand smoke now waits one second before the assertion. Fresh orchestrator replay passed."
  severity: major
  test: 7
  root_cause: "stale hand-smoke timing contract for asynchronous entry-stop projection"
  artifacts:
    - dev/smoke/hand-driven-smoke.md
  missing: []
  debug_session: ""
- truth: "Sequence B's background evaluate either times out while the breakpoint stays paused or completes with result `5` once `continue` releases it; stopped-event, status, and stack evidence are the required pause contract."
  status: closed
  reason: "Prior Phase 8 and Phase 15 UAT already accepted both evaluate race outcomes, while the live hand-smoke doc had drifted back to timeout-only wording. The contract and integration-test comments were aligned, and the fresh orchestrator replay passed with the timeout branch."
  severity: major
  test: 8
  root_cause: "stale hand-smoke wording treated one valid timing-dependent outcome as mandatory"
  artifacts:
    - dev/smoke/hand-driven-smoke.md
    - tests/integration/jsDebugAdapter.test.ts
  missing: []
  debug_session: ""
- truth: "Delve/Go compatibility failures and adapter-originated DAP failures explain themselves before a fresh agent has to reverse-engineer logs or controller environment inheritance."
  status: closed
  reason: "Post-UAT Go feedback exposed two actionable rough edges: Delve 1.26.3 paired with active Go 1.23.5 failed too late, and response-body detail from failed DAP responses did not reach the CLI envelope. dap-cli now emits `delve_go_version_incompatible` before launch, forwards a launch-scoped `GOTOOLCHAIN` override into controller-spawned Delve, and includes structured adapter detail in DAP request failure diagnostics."
  severity: major
  test: 9
  root_cause: "compatibility preflight and descriptor environment propagation stopped at the launch/controller boundary; failed DAP response bodies were not retained through CLI error shaping"
  artifacts:
    - src/adapters/builtins/delve.ts
    - src/protocol/dapClient.ts
    - src/controller/server.ts
    - dap-cli/skills/dap-cli/references/go-delve.md
    - tests/adapters/delve.test.ts
    - tests/protocol/dapClient.test.ts
    - tests/integration/fakeAdapterCli.test.ts
  missing: []
  debug_session: ""

## Hand-Driven CLI Smoke

ran_at: 2026-05-17T18:12:46Z
sequences:
  - id: A
    result: issue
    captured_output: |
      {"ok":true,"data":{"stopped":false},"meta":{"command":"stop-controller","timestamp":"2026-05-17T18:12:25.628Z"}}
      {"ok":true,"data":{"started":true,"reused":false,"pid":38652,"endpoint":{"kind":"ipc","path":"/Users/roblou/.dap-cli/state/controller.sock"},"stateDir":"/Users/roblou/.dap-cli/state","logDir":"/Users/roblou/.dap-cli/logs","buildId":"0.1.0:dist:1779041401791.586:286350"},"meta":{"command":"start","timestamp":"2026-05-17T18:12:25.805Z"}}
      {"ok":true,"data":{"sessionId":"sess_oO1hTJbbuHGhlPzu","name":"smoke-node","lifecycle":"running","capabilities":{"supportsConfigurationDoneRequest":true,"supportsFunctionBreakpoints":false,"supportsConditionalBreakpoints":true,"supportsHitConditionalBreakpoints":true,"supportsEvaluateForHovers":true,"supportsReadMemoryRequest":true,"supportsWriteMemoryRequest":true,"exceptionBreakpointFilters":[{"filter":"all","label":"Caught Exceptions","default":false,"supportsCondition":true,"description":"Breaks on all throw errors, even if they're caught later.","conditionDescription":"error.name == \"MyError\""},{"filter":"uncaught","label":"Uncaught Exceptions","default":false,"supportsCondition":true,"description":"Breaks only on errors or promise rejections that are not handled.","conditionDescription":"error.name == \"MyError\""}],"supportsStepBack":false,"supportsSetVariable":true,"supportsRestartFrame":true,"supportsGotoTargetsRequest":false,"supportsStepInTargetsRequest":true,"supportsCompletionsRequest":true,"supportsModulesRequest":false,"additionalModuleColumns":[],"supportedChecksumAlgorithms":[],"supportsRestartRequest":true,"supportsExceptionOptions":false,"supportsValueFormattingOptions":true,"supportsExceptionInfoRequest":true,"supportTerminateDebuggee":true,"supportsDelayedStackTraceLoading":true,"supportsLoadedSourcesRequest":true,"supportsLogPoints":true,"supportsTerminateThreadsRequest":false,"supportsSetExpression":true,"supportsTerminateRequest":false,"completionTriggerCharacters":[".","[","\"","'"],"supportsBreakpointLocationsRequest":true,"supportsClipboardContext":true,"supportsExceptionFilterOptions":true,"supportsEvaluationOptions":false,"supportsDebuggerProperties":false,"supportsSetSymbolOptions":false,"supportsANSIStyling":true},"eventCursor":4},"meta":{"command":"launch","timestamp":"2026-05-17T18:12:26.018Z"}}
      {"ok":true,"data":{"id":"sess_oO1hTJbbuHGhlPzu","name":"smoke-node","adapter":"js-debug","lifecycle":"running","status":"running","updatedAt":"2026-05-17T18:12:26.016Z","stderrTail":[],"cleanupActions":["Signal owned adapter pid 38654 if cleanup is required."],"logPath":"/Users/roblou/.dap-cli/logs/js-debug-38654.log"},"meta":{"command":"status","timestamp":"2026-05-17T18:12:26.090Z"}}
      {"ok":true,"data":{"breakpoints":[{"id":0,"verified":true,"source":{"name":"/Users/roblou/code/dap-cli/tests/fixtures/dap-cli-target/index.js","path":"/Users/roblou/code/dap-cli/tests/fixtures/dap-cli-target/index.js","sourceReference":0},"line":3,"column":3}]},"meta":{"command":"breakpoints set","timestamp":"2026-05-17T18:12:26.168Z"}}
      {"ok":true,"data":{"threads":[{"id":0,"name":"index.js [38666]","sessionName":"smoke-node#0013dfaf4274392e26939899"}]},"meta":{"command":"threads","timestamp":"2026-05-17T18:12:26.240Z"}}
      {"ok":true,"data":{"id":"sess_oO1hTJbbuHGhlPzu","name":"smoke-node","adapter":"js-debug","lifecycle":"running","status":"stopped","updatedAt":"2026-05-17T18:12:26.133Z","paused":true,"stoppedReason":"entry","stoppedThreadIds":[0],"stderrTail":[],"cleanupActions":["Signal owned adapter pid 38654 if cleanup is required."],"logPath":"/Users/roblou/.dap-cli/logs/js-debug-38654.log"},"meta":{"command":"status","timestamp":"2026-05-17T18:12:29.843Z"}}
      {"ok":true,"data":{"stackFrames":[{"id":0,"name":"dapCliSelfHostDemo","line":2,"column":18,"source":{"name":"/Users/roblou/code/dap-cli/tests/fixtures/dap-cli-target/index.js","path":"/Users/roblou/code/dap-cli/tests/fixtures/dap-cli-target/index.js","sourceReference":0},"presentationHint":"normal","canRestart":true},{"id":1,"name":"<anonymous>","line":7,"column":1,"source":{"name":"/Users/roblou/code/dap-cli/tests/fixtures/dap-cli-target/index.js","path":"/Users/roblou/code/dap-cli/tests/fixtures/dap-cli-target/index.js","sourceReference":0},"presentationHint":"normal","canRestart":false}],"totalFrames":15},"meta":{"command":"stack","timestamp":"2026-05-17T18:12:29.923Z"}}
      {"ok":true,"data":{"allThreadsContinued":false},"meta":{"command":"continue","timestamp":"2026-05-17T18:12:29.996Z"}}
      {"ok":true,"data":{"sessionId":"sess_oO1hTJbbuHGhlPzu","name":"smoke-node","events":[{"cursor":8,"receivedAt":"2026-05-17T18:12:26.133Z","sessionId":"sess_oO1hTJbbuHGhlPzu","dapSeq":7,"event":"stopped","summary":"stopped event seq=7","body":{"reason":"entry","description":"Paused on breakpoint","threadId":0,"hitBreakpointIds":[],"allThreadsStopped":false,"child_session_id":"sess_nblXOd-89D3HfKvj"}},{"cursor":167,"receivedAt":"2026-05-17T18:12:29.998Z","sessionId":"sess_oO1hTJbbuHGhlPzu","dapSeq":170,"event":"stopped","summary":"stopped event seq=170","body":{"reason":"breakpoint","description":"Paused on breakpoint","threadId":0,"hitBreakpointIds":[0],"allThreadsStopped":false,"child_session_id":"sess_nblXOd-89D3HfKvj"}}],"cursor":167,"dropped":114,"capacity":250,"capacityByPriority":{"high":200,"low":50}},"meta":{"command":"events","timestamp":"2026-05-17T18:12:30.078Z"}}
      {"ok":true,"data":{"id":"sess_oO1hTJbbuHGhlPzu","name":"smoke-node","adapter":"js-debug","lifecycle":"running","status":"stopped","updatedAt":"2026-05-17T18:12:29.998Z","paused":true,"stoppedReason":"breakpoint","stoppedThreadIds":[0],"stderrTail":[],"cleanupActions":["Signal owned adapter pid 38654 if cleanup is required."],"logPath":"/Users/roblou/.dap-cli/logs/js-debug-38654.log"},"meta":{"command":"status","timestamp":"2026-05-17T18:12:30.151Z"}}
      {"ok":true,"data":{"id":"sess_oO1hTJbbuHGhlPzu","name":"smoke-node","adapter":"js-debug","lifecycle":"running","status":"stopped","updatedAt":"2026-05-17T18:12:29.998Z","paused":true,"stoppedReason":"breakpoint","stoppedThreadIds":[0],"stderrTail":[],"cleanupActions":["Signal owned adapter pid 38654 if cleanup is required."],"logPath":"/Users/roblou/.dap-cli/logs/js-debug-38654.log","orphanPids":[],"warnings":[]},"meta":{"command":"close","timestamp":"2026-05-17T18:12:32.301Z"}}
      {"ok":true,"data":{"stopped":true},"meta":{"command":"stop-controller","timestamp":"2026-05-17T18:12:32.375Z"}}
  - id: B
    result: issue
    captured_output: |
      {"ok":true,"data":{"stopped":false},"meta":{"command":"stop-controller","timestamp":"2026-05-17T18:11:31.306Z"}}
      {"ok":true,"data":{"started":true,"reused":false,"pid":33674,"endpoint":{"kind":"ipc","path":"/Users/roblou/.dap-cli/state/controller.sock"},"stateDir":"/Users/roblou/.dap-cli/state","logDir":"/Users/roblou/.dap-cli/logs","buildId":"0.1.0:dist:1779041401791.586:286350"},"meta":{"command":"start","timestamp":"2026-05-17T18:11:31.502Z"}}
      {"ok":true,"data":{"signaledAdapter":["sess_61_PGTTJMtlqWnOx","sess_yd14KjCAm4wUDWY-"],"removedRecords":["sess_61_PGTTJMtlqWnOx","sess_yd14KjCAm4wUDWY-"],"keptRunning":[],"failed":[],"orphanPids":[],"warnings":[]},"meta":{"command":"cleanup","timestamp":"2026-05-17T18:11:31.588Z"}}
      {"ok":true,"data":{"sessionId":"sess_ggqB3JCHmAwcG1hR","name":"smoke-chrome","lifecycle":"running","capabilities":{"supportsConfigurationDoneRequest":true,"supportsFunctionBreakpoints":false,"supportsConditionalBreakpoints":true,"supportsHitConditionalBreakpoints":true,"supportsEvaluateForHovers":true,"supportsReadMemoryRequest":true,"supportsWriteMemoryRequest":true,"exceptionBreakpointFilters":[{"filter":"all","label":"Caught Exceptions","default":false,"supportsCondition":true,"description":"Breaks on all throw errors, even if they're caught later.","conditionDescription":"error.name == \"MyError\""},{"filter":"uncaught","label":"Uncaught Exceptions","default":false,"supportsCondition":true,"description":"Breaks only on errors or promise rejections that are not handled.","conditionDescription":"error.name == \"MyError\""}],"supportsStepBack":false,"supportsSetVariable":true,"supportsRestartFrame":true,"supportsGotoTargetsRequest":false,"supportsStepInTargetsRequest":true,"supportsCompletionsRequest":true,"supportsModulesRequest":false,"additionalModuleColumns":[],"supportedChecksumAlgorithms":[],"supportsRestartRequest":true,"supportsExceptionOptions":false,"supportsValueFormattingOptions":true,"supportsExceptionInfoRequest":true,"supportTerminateDebuggee":true,"supportsDelayedStackTraceLoading":true,"supportsLoadedSourcesRequest":true,"supportsLogPoints":true,"supportsTerminateThreadsRequest":false,"supportsSetExpression":true,"supportsTerminateRequest":false,"completionTriggerCharacters":[".","[","\"","'"],"supportsBreakpointLocationsRequest":true,"supportsClipboardContext":true,"supportsExceptionFilterOptions":true,"supportsEvaluationOptions":false,"supportsDebuggerProperties":false,"supportsSetSymbolOptions":false,"supportsANSIStyling":true},"eventCursor":7},"meta":{"command":"launch","timestamp":"2026-05-17T18:11:34.998Z"}}
      {"ok":true,"data":{"breakpoints":[{"id":0,"verified":true,"source":{"name":"app.js","path":"/Users/roblou/code/dap-cli/tests/fixtures/simple-chrome-page/app.js","sourceReference":0},"line":2,"column":18}]},"meta":{"command":"breakpoints set","timestamp":"2026-05-17T18:11:35.092Z"}}
      {"ok":true,"data":[{"id":"sess_ggqB3JCHmAwcG1hR","name":"smoke-chrome","adapter":"js-debug","lifecycle":"running","status":"running","updatedAt":"2026-05-17T18:11:34.995Z"}],"meta":{"command":"sessions","timestamp":"2026-05-17T18:11:38.812Z"}}
      {"ok":true,"data":[{"id":"sess_ggqB3JCHmAwcG1hR","name":"smoke-chrome","adapter":"js-debug","lifecycle":"running","status":"running","updatedAt":"2026-05-17T18:11:34.995Z"},{"id":"sess_H0hRVg9Gvzg2fE-i","name":"smoke-chrome#9748807B8C0596309B7F21A7EA90AFA2","adapter":"js-debug","lifecycle":"running","status":"running","updatedAt":"2026-05-17T18:11:35.009Z","parent_session_id":"sess_ggqB3JCHmAwcG1hR","targetable":false}],"meta":{"command":"sessions","timestamp":"2026-05-17T18:11:38.895Z"}}
      {"ok":true,"data":{"sessionId":"sess_ggqB3JCHmAwcG1hR","name":"smoke-chrome","events":[{"cursor":5,"receivedAt":"2026-05-17T18:11:34.948Z","sessionId":"sess_ggqB3JCHmAwcG1hR","dapSeq":2,"event":"initialized","summary":"initialized event seq=2","body":{"child_session_id":"sess_H0hRVg9Gvzg2fE-i"}},{"cursor":7,"receivedAt":"2026-05-17T18:11:34.960Z","sessionId":"sess_ggqB3JCHmAwcG1hR","dapSeq":5,"event":"thread","summary":"thread event seq=5","body":{"reason":"started","threadId":0,"child_session_id":"sess_H0hRVg9Gvzg2fE-i"}},{"cursor":9,"receivedAt":"2026-05-17T18:11:35.092Z","sessionId":"sess_ggqB3JCHmAwcG1hR","dapSeq":9,"event":"breakpoint","summary":"breakpoint event seq=9","body":{"reason":"changed","breakpoint":{"id":0,"verified":true,"source":{"name":"app.js","path":"/Users/roblou/code/dap-cli/tests/fixtures/simple-chrome-page/app.js","sourceReference":0},"line":2,"column":18},"child_session_id":"sess_H0hRVg9Gvzg2fE-i"}}],"cursor":9,"dropped":0,"capacity":250,"capacityByPriority":{"high":200,"low":50}},"meta":{"command":"events","timestamp":"2026-05-17T18:11:38.976Z"}}
      {"ok":true,"data":{"sessionId":"sess_ggqB3JCHmAwcG1hR","name":"smoke-chrome","events":[{"cursor":13,"receivedAt":"2026-05-17T18:11:44.624Z","sessionId":"sess_ggqB3JCHmAwcG1hR","dapSeq":11,"event":"stopped","summary":"stopped event seq=11","body":{"reason":"breakpoint","description":"Paused on breakpoint","threadId":0,"hitBreakpointIds":[0],"allThreadsStopped":false,"child_session_id":"sess_H0hRVg9Gvzg2fE-i"}}],"cursor":13,"dropped":0,"capacity":250,"capacityByPriority":{"high":200,"low":50}},"meta":{"command":"events","timestamp":"2026-05-17T18:11:49.016Z"}}
      {"ok":true,"data":{"threads":[{"id":0,"name":"index.html?manual","sessionName":"smoke-chrome#9748807B8C0596309B7F21A7EA90AFA2"}]},"meta":{"command":"threads","timestamp":"2026-05-17T18:11:49.095Z"}}
      {"ok":true,"data":{"id":"sess_ggqB3JCHmAwcG1hR","name":"smoke-chrome","adapter":"js-debug","lifecycle":"running","status":"stopped","updatedAt":"2026-05-17T18:11:44.624Z","paused":true,"stoppedReason":"breakpoint","stoppedThreadIds":[0],"stderrTail":[],"cleanupActions":["Signal owned adapter pid 33678 if cleanup is required."],"logPath":"/Users/roblou/.dap-cli/logs/js-debug-33678.log"},"meta":{"command":"status","timestamp":"2026-05-17T18:11:49.174Z"}}
      {"ok":true,"data":{"stackFrames":[{"id":0,"name":"Window.calculate","line":2,"column":18,"source":{"name":"app.js","path":"/Users/roblou/code/dap-cli/tests/fixtures/simple-chrome-page/app.js","sourceReference":0},"presentationHint":"normal","canRestart":true},{"id":1,"name":"<anonymous>","line":1,"column":1,"source":{"name":"<eval>/VM46947590","path":"<eval>/VM46947590","sourceReference":46947590},"presentationHint":"normal","canRestart":true}],"totalFrames":2},"meta":{"command":"stack","timestamp":"2026-05-17T18:11:49.254Z"}}
      {"ok":true,"data":{"allThreadsContinued":false},"meta":{"command":"continue","timestamp":"2026-05-17T18:11:49.344Z"}}
      {"ok":true,"data":{"type":"number","result":"5","variablesReference":0},"meta":{"command":"evaluate","timestamp":"2026-05-17T18:11:49.345Z","warnings":["evaluate: session not paused; sending evaluate without --frame-id (uses adapter REPL context)"]}}
      {"ok":true,"data":{"id":"sess_ggqB3JCHmAwcG1hR","name":"smoke-chrome","adapter":"js-debug","lifecycle":"running","status":"running","updatedAt":"2026-05-17T18:11:49.344Z","paused":false,"stderrTail":[],"cleanupActions":["Signal owned adapter pid 33678 if cleanup is required."],"logPath":"/Users/roblou/.dap-cli/logs/js-debug-33678.log","orphanPids":[],"warnings":[]},"meta":{"command":"close","timestamp":"2026-05-17T18:11:57.556Z"}}
      {"ok":true,"data":{"stopped":true},"meta":{"command":"stop-controller","timestamp":"2026-05-17T18:11:57.704Z"}}
      no smoke profile orphans

### Re-Verify After Smoke Contract Diagnosis

ran_at: 2026-05-17T20:04:05Z
sequences:
  - id: A
    result: pass
    captured_output: |
      {"ok":true,"data":{"stopped":false},"meta":{"command":"stop-controller","timestamp":"2026-05-17T20:04:05.981Z"}}
      {"ok":true,"data":{"started":true,"reused":false,"pid":97899,"endpoint":{"kind":"ipc","path":"/Users/roblou/.dap-cli/state/controller.sock"},"stateDir":"/Users/roblou/.dap-cli/state","logDir":"/Users/roblou/.dap-cli/logs","buildId":"0.1.0:dist:1779048237800.6138:286350"},"meta":{"command":"start","timestamp":"2026-05-17T20:04:09.009Z"}}
      {"ok":true,"data":{"sessionId":"sess_cZC00I45U7zPpo-9","name":"smoke-node","lifecycle":"running","eventCursor":4},"meta":{"command":"launch","timestamp":"2026-05-17T20:04:12.284Z"}}
      {"ok":true,"data":{"id":"sess_cZC00I45U7zPpo-9","name":"smoke-node","adapter":"js-debug","lifecycle":"running","status":"stopped","updatedAt":"2026-05-17T20:04:12.402Z","paused":true,"stoppedReason":"entry","stoppedThreadIds":[0]},"meta":{"command":"status","timestamp":"2026-05-17T20:04:15.074Z"}}
      {"ok":true,"data":{"breakpoints":[{"id":0,"verified":true,"source":{"path":"/Users/roblou/code/dap-cli/tests/fixtures/dap-cli-target/index.js"},"line":3,"column":3}]},"meta":{"command":"breakpoints set","timestamp":"2026-05-17T20:04:18.857Z"}}
      {"ok":true,"data":{"threads":[{"id":0,"name":"index.js [98147]","sessionName":"smoke-node#060ea044af73a9f2a60f1d8a"}]},"meta":{"command":"threads","timestamp":"2026-05-17T20:04:21.817Z"}}
      {"ok":true,"data":{"stackFrames":[{"id":0,"name":"dapCliSelfHostDemo","line":2,"column":18,"source":{"path":"/Users/roblou/code/dap-cli/tests/fixtures/dap-cli-target/index.js"}}],"totalFrames":15},"meta":{"command":"stack","timestamp":"2026-05-17T20:04:24.590Z"}}
      {"ok":true,"data":{"allThreadsContinued":false},"meta":{"command":"continue","timestamp":"2026-05-17T20:04:27.378Z"}}
      events replay included `stopped` events for `reason":"entry"` at `2026-05-17T20:04:12.402Z` and `reason":"breakpoint"` after continue; the terminal capture was the direct output of `node dist/index.js events --name smoke-node --limit 500 | rg '"event":"(stopped|terminated)"'`.
      {"ok":true,"data":{"id":"sess_cZC00I45U7zPpo-9","name":"smoke-node","adapter":"js-debug","lifecycle":"running","status":"stopped","updatedAt":"2026-05-17T20:04:27.381Z","paused":true,"stoppedReason":"breakpoint","stoppedThreadIds":[0]},"meta":{"command":"status","timestamp":"2026-05-17T20:04:37.499Z"}}
      {"ok":true,"data":{"id":"sess_cZC00I45U7zPpo-9","name":"smoke-node","adapter":"js-debug","lifecycle":"running","status":"stopped","paused":true,"stoppedReason":"breakpoint","stoppedThreadIds":[0],"orphanPids":[],"warnings":[]},"meta":{"command":"close","timestamp":"2026-05-17T20:04:43.157Z"}}
      {"ok":true,"data":{"stopped":true},"meta":{"command":"stop-controller","timestamp":"2026-05-17T20:04:48.497Z"}}
  - id: B
    result: pass
    captured_output: |
      {"ok":true,"data":{"started":true,"reused":false,"pid":99962,"endpoint":{"kind":"ipc","path":"/Users/roblou/.dap-cli/state/controller.sock"},"stateDir":"/Users/roblou/.dap-cli/state","logDir":"/Users/roblou/.dap-cli/logs","buildId":"0.1.0:dist:1779048237800.6138:286350"},"meta":{"command":"start","timestamp":"2026-05-17T20:04:55.693Z"}}
      {"ok":true,"data":{"signaledAdapter":[],"removedRecords":[],"keptRunning":[],"failed":[],"orphanPids":[],"warnings":[]},"meta":{"command":"cleanup","timestamp":"2026-05-17T20:05:00.340Z"}}
      {"ok":true,"data":{"sessionId":"sess_DubT6L3GMKG5SL-6","name":"smoke-chrome","lifecycle":"running","eventCursor":11},"meta":{"command":"launch","timestamp":"2026-05-17T20:05:09.501Z"}}
      {"ok":true,"data":{"breakpoints":[{"id":0,"verified":true,"source":{"name":"app.js","path":"/Users/roblou/code/dap-cli/tests/fixtures/simple-chrome-page/app.js"},"line":2,"column":18}]},"meta":{"command":"breakpoints set","timestamp":"2026-05-17T20:05:12.666Z"}}
      {"ok":true,"data":[{"id":"sess_DubT6L3GMKG5SL-6","name":"smoke-chrome","adapter":"js-debug","lifecycle":"running","status":"running"}],"meta":{"command":"sessions","timestamp":"2026-05-17T20:05:15.893Z"}}
      {"ok":true,"data":[{"id":"sess_DubT6L3GMKG5SL-6","name":"smoke-chrome","adapter":"js-debug","lifecycle":"running","status":"running"},{"id":"sess_SOFrpRaAwDSInEfo","name":"smoke-chrome#71DBE5C654035457466F16BC4C103800","adapter":"js-debug","parent_session_id":"sess_DubT6L3GMKG5SL-6","targetable":false}],"meta":{"command":"sessions","timestamp":"2026-05-17T20:05:17.120Z"}}
      {"ok":true,"data":{"sessionId":"sess_DubT6L3GMKG5SL-6","name":"smoke-chrome","events":[{"cursor":18,"receivedAt":"2026-05-17T20:05:22.230Z","event":"stopped","body":{"reason":"breakpoint","threadId":0,"hitBreakpointIds":[0],"child_session_id":"sess_SOFrpRaAwDSInEfo"}}]},"meta":{"command":"events","timestamp":"2026-05-17T20:05:25.914Z"}}
      {"ok":true,"data":{"threads":[{"id":0,"name":"index.html?manual","sessionName":"smoke-chrome#71DBE5C654035457466F16BC4C103800"}]},"meta":{"command":"threads","timestamp":"2026-05-17T20:05:27.191Z"}}
      {"ok":false,"error":{"code":"controller_request_timeout","category":"timeout","message":"Timed out waiting for dap-cli controller response.","exitCode":7},"meta":{"command":"evaluate smoke-chrome","timestamp":"2026-05-17T20:05:27.223Z"}}
      {"ok":true,"data":{"id":"sess_DubT6L3GMKG5SL-6","name":"smoke-chrome","adapter":"js-debug","lifecycle":"running","status":"stopped","updatedAt":"2026-05-17T20:05:22.231Z","paused":true,"stoppedReason":"breakpoint","stoppedThreadIds":[0]},"meta":{"command":"status","timestamp":"2026-05-17T20:05:28.501Z"}}
      {"ok":true,"data":{"stackFrames":[{"id":0,"name":"Window.calculate","line":2,"column":18,"source":{"name":"app.js","path":"/Users/roblou/code/dap-cli/tests/fixtures/simple-chrome-page/app.js"}}],"totalFrames":2},"meta":{"command":"stack","timestamp":"2026-05-17T20:05:32.935Z"}}
      {"ok":true,"data":{"allThreadsContinued":false},"meta":{"command":"continue","timestamp":"2026-05-17T20:05:35.869Z"}}
      {"ok":true,"data":{"id":"sess_DubT6L3GMKG5SL-6","name":"smoke-chrome","adapter":"js-debug","lifecycle":"running","status":"running","paused":false,"orphanPids":[],"warnings":[]},"meta":{"command":"close","timestamp":"2026-05-17T20:05:40.603Z"}}
      {"ok":true,"data":{"stopped":true},"meta":{"command":"stop-controller","timestamp":"2026-05-17T20:05:44.083Z"}}
      no smoke profile orphans