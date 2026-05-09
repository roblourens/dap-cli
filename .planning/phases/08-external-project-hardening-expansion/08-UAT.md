---
status: complete
phase: 08-external-project-hardening-expansion
source:
  - .planning/phases/08-external-project-hardening-expansion/08-01-PLAN.md
started: 2026-05-09T02:18:30Z
updated: 2026-05-08T23:59:00Z
---

# Phase 8 UAT: External Project Hardening Expansion

## Current Test

number: 1
name: Broader external repo sample
expected: At least 10 public launch-config candidates are screened and at least 5 new safe candidates are fully attempted through dap-cli.
result: pass

## Result Ledger

| Candidate | Screened | Cloned | Setup/build | dap-cli list configs | dap-cli launch/debug | Result | Evidence |
|-----------|----------|--------|-------------|----------------------|----------------------|--------|----------|
| `ginpei/vscode-debug-web-demo` | yes | yes | `npm install --ignore-scripts` passed | pass: `Server`, `Client` | `Server` launched; server breakpoints stayed unbound; `stack` on running thread returned misleading controller error | product-gap | `tmp/phase-08-ginpei-rerun.log` |
| `jobscale/zipcode-jp` | yes | yes | `npm install --ignore-scripts` passed | pass: `Chrome`, `Program` | `Program` launched; breakpoints stayed unbound; session terminated quickly after curl | product-gap/inconclusive | `tmp/phase-08-jobscale.log` |
| `ahpalmer/Katas` | yes | yes | no install required | pass: `Python Debugger: Current File` | original config rejected `${file}`; adapted scratch `type: python` config verified breakpoints, stack, continue, stopped events | pass-with-limitation | `tmp/phase-08-katas.log`, `tmp/phase-08-katas-rerun.log` |
| `github/codespaces-models` | yes | yes | skipped; model samples require env/secrets | pass: JS/Python current-file configs | both configs rejected `${file}`; `dap-cli start` timed out once in isolated home | project-blocked/inconclusive | `tmp/phase-08-codespaces-models.log` |
| `satanon2k1/debug-in-docker` | yes | yes | skipped; attach-only sample expects remote inspector | pass: `Attach to Remote` | attach failed because no target existed; adapter stderr/log diagnostics were surfaced | environment-blocked | `tmp/phase-08-debug-in-docker.log` |
| `kettleofketchup/pikvm-auto` | yes | yes | skipped; configs enough to classify | pass: four debugpy configs | `${file}`, `${command:pickArgs}`, and `${input:tests_selection}` rejected with structured usage diagnostics | project-blocked | `tmp/phase-08-python-config-blockers.log` |
| `tregermanhagai/Playwright_Pytest_Demo` | yes | yes | skipped; full run requires Playwright/browser/env setup | pass: `Debug Pytest` | launch failed with `unknown_launch_type` for `type: debugpy` | product-gap | `tmp/phase-08-python-config-blockers.log` |
| `cortesben/deno-test` | yes | yes | skipped | config inspected | Deno runtime not installed locally | environment-blocked | `tmp/phase-08-clone-screen.log` |
| `microsoft/adaptive-testing` | yes | no | deferred | deferred | setup-heavy fallback candidate | deferred | `08-EXTERNAL-PROJECT-CANDIDATES.md` |
| `sgeraldes/hidock-next` | yes | yes | deferred | deferred | very large checkout; smaller candidates covered same config surfaces | deferred | `tmp/phase-08-clone-screen.log` |
| `github/vscode-codeql` | yes | no | deferred | deferred | large/heavy high-signal candidate | deferred | GitHub code search output |
| `ankitects/anki` | yes | no | deferred | deferred | large/heavy high-signal candidate | deferred | GitHub code search output |

## Gaps

### GAP-08-01: `type: debugpy` launch configs list but cannot launch

truth: Modern Python VS Code launch configs commonly use `type: "debugpy"`; dap-cli should either map that type to the built-in debugpy adapter or provide a deliberate compatibility diagnostic.
status: closed
reason: dap-cli `--list-configs` reports debugpy configurations, but launching them fails with `unknown_launch_type` / `No adapter mapping is configured for launch type 'debugpy'`.
severity: major
test: Phase 8 external Python configs
fix: `src/config/launchConfig.ts` now maps `type: "debugpy"` to the built-in debugpy adapter, matching modern Python launch.json files.
verification: `tests/config/launchConfig.test.ts` covers `resolveAdapterIdFromType('debugpy')`.
artifacts:
  - `tmp/phase-08-katas.log`
  - `tmp/phase-08-python-config-blockers.log`
reproduction:
  - `DAP_CLI_HOME=tmp/phase-08-external-projects/.dap-cli-home/tregermanhagai__Playwright_Pytest_Demo node dist/index.js launch --workspace tmp/phase-08-external-projects/tregermanhagai__Playwright_Pytest_Demo --list-configs`
  - `DAP_CLI_HOME=tmp/phase-08-external-projects/.dap-cli-home/tregermanhagai__Playwright_Pytest_Demo node dist/index.js launch --workspace tmp/phase-08-external-projects/tregermanhagai__Playwright_Pytest_Demo --config "Debug Pytest" --name phase8-pytest`
missing:
  - closed: launch config type mapping for `debugpy`.

### GAP-08-02: Running-thread inspection reports controller_unavailable

truth: When the controller is running but the selected thread is not paused, inspection commands should report a stopped-state/thread-state error, not `controller_unavailable` with `Run dap-cli start` guidance.
status: closed
reason: In the `ginpei/vscode-debug-web-demo` attempt, `stack --thread-id 0` against a running thread returned `code: controller_unavailable`, `message: Thread is not paused`, and diagnostics telling the user to run `dap-cli start`, even though the controller and session were running.
severity: major
test: Phase 8 `ginpei/vscode-debug-web-demo` Node server attempt
fix: `src/controller/childSessions.ts` now maps child-routed paused-only `stackTrace`/`scopes`/`variables` adapter failures containing "not paused" to the shared `thread_not_paused` diagnostic contract.
verification: `tests/controller/childSessions.test.ts` asserts child `stackTrace` not-paused failures surface `thread_not_paused` and event polling guidance.
artifacts:
  - `tmp/phase-08-ginpei-rerun.log`
reproduction:
  - Launch a long-running Node server config without stopping.
  - Run `dap-cli threads --name <session>`.
  - Run `dap-cli stack --name <session> --thread-id <running-thread-id>`.
missing:
  - closed: non-controller error category/code and diagnostics that explain the target must be paused before stack/scopes/variables inspection.

### GAP-08-03: Real JS pwa-node launch configs leave breakpoints unbound with little guidance

truth: For plain JavaScript pwa-node launch configs where the target process is running and source paths are known, dap-cli should either bind requested source breakpoints or explain why binding failed in actionable terms.
status: closed
reason: Both `ginpei/vscode-debug-web-demo` and `jobscale/zipcode-jp` launched pwa-node configs successfully, but breakpoints set in plain JavaScript source paths stayed unbound. The returned breakpoint payload only said `Unbound breakpoint`, without source-path or timing guidance.
severity: major
test: Phase 8 Node pwa-node external attempts
fix: `src/controller/diagnostics.ts` now adds JavaScript-specific breakpoint timeout diagnostics covering source-path comparison against stopped stack frames and timing guidance for quick-exit/lazy-loaded programs. Follow-up root-cause fix: breakpoint source paths are normalized to absolute paths, js-debug `setBreakpoints` requests are intercepted even before child sessions exist, pending payloads replay to newly-created children before `configurationDone`, and child breakpoint events now satisfy the parent provisional response.
verification: `tests/controller/sessionManager.test.ts` asserts the JS diagnostics are present on verification timeouts. `tests/controller/childSessions.test.ts` covers `setBreakpoints` before child registration. `tmp/phase-08-ginpei-rootcause-verified.log` captures the external ginpei pwa-node repro returning verified breakpoints, a stopped event, and a stack frame at `server.js` line 9.
artifacts:
  - `tmp/phase-08-ginpei-rerun.log`
  - `tmp/phase-08-jobscale.log`
  - `tmp/phase-08-ginpei-rootcause-verified.log`
reproduction:
  - `DAP_CLI_HOME=... node dist/index.js launch --workspace tmp/phase-08-external-projects/ginpei__vscode-debug-web-demo --config Server --name phase8-ginpei-server`
  - `DAP_CLI_HOME=... node dist/index.js breakpoints set --name phase8-ginpei-server --source tmp/phase-08-external-projects/ginpei__vscode-debug-web-demo/server.js --line 9 --line 15`
missing:
  - closed: better breakpoint-binding diagnostics for real JS pwa-node configs, including source-path comparison and pending/timing guidance.
  - closed: root-cause binding path for early pwa-node breakpoints in `ginpei/vscode-debug-web-demo`.

## Gap Closure Verification

- `npm test -- tests/config/launchConfig.test.ts tests/controller/childSessions.test.ts tests/controller/sessionManager.test.ts` passed: 85 tests.
- `npm test` passed: 24 files, 292 tests passed, 7 skipped.

## Non-Gap Limitations

- `${file}`, `${fileDirname}`, `${command:...}`, and `${input:...}` remain unsupported VS Code interaction/current-file variables. Phase 8 observed these in multiple real configs; current diagnostics are structured and explicit.
- Attach-only configs that depend on a remote inspector are environment-blocked when no target is listening. The `debug-in-docker` attempt surfaced adapter stderr and log path correctly.
- Deno configs were not launched because Deno is not installed locally.

## Cleanup

All Phase 8 dap-cli homes used `cleanup --purge` and `stop-controller` where a controller started successfully. Scratch clones remain under ignored `tmp/phase-08-external-projects/` for review.

## Round 3 Follow-Up (2026-05-09)

A second external-repo hardening round drove four new scenarios end-to-end and surfaced one new product gap.

### Scenarios

| # | Scenario | Workspace | Config | Result | Log |
|---|----------|-----------|--------|--------|-----|
| A | pwa-node, breakpoint set AFTER child registration + curl trigger | `ginpei__vscode-debug-web-demo` | `Server` | pass + product-gap (BUG-08-04) | `tmp/phase-08-scenario-a-ginpei-late-bp.log` |
| B | pwa-chrome with breakpoint on docs/js/index.js (static `python3 -m http.server 3000` backing the URL) | `jobscale__zipcode-jp` | `Chrome` | pass-with-limitation (bp verified, two child targets listed; Chrome user-gesture trigger out of CLI scope) | `tmp/phase-08-scenario-b-jobscale-chrome.log` |
| C | debugpy `module:` launch with `args`, `env`, `cwd`, `stopOnEntry`, breakpoint on `greet()` | `tmp/.../scenario-c-pymodule` (built fresh) | `PyModule` | pass | `tmp/phase-08-scenario-c-pymodule.log` |
| D | pwa-node with `${execPath}`, `${workspaceFolder}`, `${workspaceFolderBasename}`, `${userHome}`, `${env:HOME}`, `${env:USER}`, `envFile`, multi-var concat in `env`; plus a `MissingEnv` config referencing an undefined var | `tmp/.../scenario-d-vars` (built fresh) | `TrickyVars` + `MissingEnv` | pass | `tmp/phase-08-scenario-d-vars.log` |

### GAP-08-04: child-routed scopes/variables/source returned `controller_unavailable` for unknown frameId / variablesReference / sourceReference

truth: For multi-child sessions (js-debug pwa-node / pwa-chrome), passing a stale or unknown frameId/variablesReference/sourceReference must return a structured session-state error pointing the user at `dap-cli stack`/`dap-cli scopes` to discover current ids — never `controller_unavailable: Run dap-cli start`.
status: closed
reason: `routeByFrameId`/`routeByVariableReference`/`routeBySourceReference` in `src/controller/childSessions.ts` threw plain `Error` instances. Plain errors travel through the controller IPC envelope without `category`/`exitCode`, so the controller wraps them as `controller_request_failed` and the CLI client collapses anything not matching a known session-error code into `controllerUnavailable(message)` — yielding the misleading "Run dap-cli start" diagnostic. Same shape as previously-fixed GAP-08-02, but for the frame/variables/source routing paths.
severity: major
test: Phase 8 round 3 Scenario A (`ginpei/vscode-debug-web-demo` `Server` paused at `server.js:19`).
fix:
- `routeByFrameId` now throws `sessionError` with `code: frame_not_found` (or `code: frame_id_required`), category `session`, exitCode 4, and `data.availableFrameIds`.
- `routeByVariableReference` now throws `sessionError` with `code: variable_reference_not_found`, plus `data.availableVariableReferences` + `data.availableFrameIds`.
- `routeBySourceReference` now throws `sessionError` with `code: source_reference_not_found` (or `code: source_reference_required`), plus `data.availableSourceReferences`.
verification:
- `tests/controller/childSessions.test.ts` adds three focused tests asserting the structured error code, category, and `data` payload for each routing path.
- External re-run: `tmp/phase-08-scenario-a-fix-verification.log` shows `scopes --frame-id 0` (stale id) returning `code: frame_not_found, category: session, exitCode: 4` with `availableFrameIds: []`, then after `stack --thread-id 0` seeded ids, `scopes --frame-id 999` returns `frame_not_found` with a populated `availableFrameIds` (frames 39…200+); positive control `scopes --frame-id 39` returns a normal scopes response.
artifacts:
- `tmp/phase-08-scenario-a-ginpei-late-bp.log` (pre-fix repro)
- `tmp/phase-08-scenario-a-fix-verification.log` (post-fix verification)
reproduction:
- `DAP_CLI_HOME=/tmp/d8a node dist/index.js launch --workspace tmp/phase-08-external-projects/ginpei__vscode-debug-web-demo --config Server --name scenA-ginpei`
- `node dist/index.js breakpoints set --name scenA-ginpei --source …/server.js --line 19`
- `curl -s http://localhost:8080/data.json`
- `node dist/index.js scopes --name scenA-ginpei --frame-id 0`
- Before fix: `controller_unavailable: Run dap-cli start`. After fix: `frame_not_found` with `data.availableFrameIds`.
missing: closed.

### Round 3 Non-Gap Limitations

- pwa-chrome breakpoint *hit* verification needs a separate browser driver to trigger a user gesture; dap-cli itself has no in-process way to click on the debugged page. Documented, not treated as a gap.
- `stoppedThreadIds: []` when the adapter sets `allThreadsStopped: true` is documented behavior in `src/controller/pausedState.ts` (covered by an existing test). For debugpy this means `status` always reports `[]` while paused; the user has to run `threads` separately. Flagged for a future UX pass.

## Round 4 Follow-Up (2026-05-09)

A "deliberately mean" stress + edge-case sweep against the published `dist/index.js` CLI with a real js-debug adapter and an external Express target (`tmp/phase-08-external-projects/ginpei__vscode-debug-web-demo`). Surfaced one new product gap on a third codepath of the same misleading `controller_unavailable` shape that round 3 closed for lookup-misses (GAP-08-04) and that earlier rounds closed for `thread_not_paused` (GAP-08-02).

Full write-up in `.planning/phases/08-external-project-hardening-expansion/08-04-SUMMARY.md`.

### Stress Matrix

| Axis | Pass | New gaps |
|------|------|----------|
| 1. Lifecycle / restart races | yes | none |
| 2. Concurrency (10× parallel commands) | yes | none |
| 3. Multi-child js-debug | yes | none |
| 4. Breakpoints (verify on child source) | yes | none |
| 5. Variable inspection (real + stale ids) | yes | none |
| 6. Evaluate / repl (adapter-rejected) | **gap (R4-A, closed)** | R4-A |
| 7. Launch configs | n/a (round 3 covered) | none |
| 8. Adapter quirks (js-debug Unknown request) | n/a (upstream defect) | none (Observation R4-1) |
| 9. IPC / wire stress | yes | none |
| 10. State / cleanup | yes | none (Observation R4-3) |

### GAP-08-04 (round 4): child-routed DAP errors return `controller_unavailable` instead of `dap_request_failed`

truth: Adapter-rejected DAP requests (evaluate / setExpression / setVariable / scopes-against-stale-frame / etc.) on multi-child js-debug sessions must surface as structured `dap_request_failed` (category `dap`, exitCode 5) with `sessionId` / `request.command` / `adapter` populated — never as `controller_unavailable: <DAP error message>`.
status: closed
reason: `routeDapRequest` in `src/controller/server.ts` only wrapped errors thrown by the parent's `runtime.client.request(...)` call via `toDapCliError`. The multi-child intercept path (`runtime.children.maybeIntercept(command, args)` ahead of the parent client request) had no try/catch — any DAP error thrown by a child adapter propagated as a bare `Error`, was emitted by the controller as `controller_request_failed`, then collapsed by the CLI client into `controllerUnavailable(message)`. Same shape as GAP-08-02 (`thread_not_paused`) and GAP-08-04 (round 3, lookup miss), but on a third codepath (adapter rejection of an intercepted request).
severity: major
test: Phase 8 round 4 stress axes 6 and 9 (`ginpei/vscode-debug-web-demo` `Server` paused at `server.js:19`).
fix: `routeDapRequest` now wraps the `maybeIntercept` call in the same `toDapCliError` flow as the parent `client.request` path, so any error thrown by a child request flows through the same staleSession + adapter-context populating as a parent error would. Already-`CliError`-shaped errors (frame_not_found, variable_reference_not_found, source_reference_not_found, thread_not_paused) pass through unchanged because `toDapCliError` returns CliError instances as-is.
verification:
- New regression test in `tests/controller/childSessions.test.ts`: `child-rejected DAP requests re-throw raw error so server can wrap as dap_request_failed (GAP-08-04 round 4)` — pins the contract that `maybeIntercept` re-throws raw DAP errors so the server-side wrap can categorize them, and asserts the message is NOT the `controller_unavailable` shape.
- Existing `step-out adapter failure preserves DAP error category` test in `tests/cli/errorContracts.test.ts` continues to cover the same wrap on the parent-client path.
- External re-run against `ginpei/vscode-debug-web-demo`:
  - Before fix (`tmp/phase-08-r4-leaky-dap-errors.log`): `evaluate --expression 'thisIsCertainlyUndefined' --frame-id <stale>` returned `{"code":"controller_unavailable","category":"controller","message":"DAP request failed: evaluate"}`.
  - After fix (`tmp/phase-08-r4-fix-verification.log`): same call returned `{"code":"dap_request_failed","category":"dap","exitCode":5,"sessionId":"sess_…","request":{"command":"evaluate","seq":7},"adapter":{"descriptorId":"js-debug","pid":42663,"logPath":"…"}}`.
  - Same envelope shape verified for `evaluate 'throw new Error(...)'`.
- Commit: `fix(controller): wrap intercepted child DAP errors as dap_request_failed` (commit 6acd0c1, on main, "(Written by Copilot)" trailer present).
artifacts:
- `tmp/phase-08-r4-leaky-dap-errors.log`
- `tmp/phase-08-r4-fix-verification.log`
- `tmp/phase-08-r4-lifecycle.log`
- `tmp/phase-08-r4-misc.log`
- `tmp/phase-08-r4-smoke-A.log`
- `tmp/phase-08-r4-smoke-B.log`
reproduction: see `08-04-SUMMARY.md` reproduction block.
missing: closed.

### Round 4 Non-Gap Observations

- **R4-1** (js-debug `setExpression` / `restartFrame`): js-debug claims `supportsSetExpression: true` and `supportsRestartFrame: true` in initialize but answers neither request — only writes `Unknown request: <name>` to stderr. The CLI surfaces `controller_request_timeout`. Investigated; concluded this is an upstream js-debug capability-flag defect, not a dap-cli gap. Uniformly raising the CLI IPC default would mask non-pathological latencies. Captured for upstream tracking.
- **R4-2** (`availableFrameIds` payload size): on long-running sessions the payload reached ~27KB (200+ entries). Truthful data; surfaces only when the user passes a stale id. No correctness bug. Left as-is; may revisit if interactive use trips it.
- **R4-3** (`kill -9` on owned adapter): controller does not auto-reap session record between requests. Matches existing documented design (`cleanupActions: Signal owned adapter pid <pid>…`). Not a new gap.

## Hand-Driven CLI Smoke

ran_at: 2026-05-09T05:32-05:34Z
sequences:
  - id: A
    result: pass
    captured_output: |
      ### Step 1: start controller
      {"ok":true,"data":{"started":true,"reused":false,"pid":75002,"endpoint":{"kind":"ipc","path":"/Users/roblou/.dap-cli/state/controller.sock"},"stateDir":"/Users/roblou/.dap-cli/state","logDir":"/Users/roblou/.dap-cli/logs","buildId":"0.0.0:dist:1778304779421.587:237907"},"meta":{"command":"start","timestamp":"2026-05-09T05:32:53.516Z"}}

      ### Step 2: launch node fixture (stop-on-entry)
      {"ok":true,"data":{"sessionId":"sess_0tTEVLQmhjPZNQLQ","name":"smoke-node","adapter":"js-debug","lifecycle":"running","status":"running","capabilities":{...},"eventCursor":4},"meta":{"command":"launch","timestamp":"2026-05-09T05:32:55.918Z"}}

      ### Step 3: status while paused at entry
      {"ok":true,"data":{"id":"sess_0tTEVLQmhjPZNQLQ","name":"smoke-node","adapter":"js-debug","lifecycle":"running","status":"running","paused":true,"stoppedReason":"entry","stoppedThreadIds":[0],"stderrTail":[],"cleanupActions":["Signal owned adapter pid 74822 if cleanup is required."],"logPath":"/Users/roblou/.dap-cli/logs/js-debug-74822.log"},"meta":{"command":"status","timestamp":"2026-05-09T05:32:56.963Z"}}

      ### Step 4: set bp on line 3
      {"ok":true,"data":{"breakpoints":[{"id":1,"verified":true,"source":{"path":"…/tests/fixtures/dap-cli-target/index.js","sourceReference":0},"line":3,"column":4}]},"meta":{"command":"breakpoints set","timestamp":"…"}}

      ### Step 5: threads / stack / evaluate
      threads: returns id 0 "main"
      stack: top frame {"id":0,"name":"dapCliSelfHostDemo","line":2,...}
      evaluate typeof dapCliSelfHostDemo: {"type":"string","result":"\"function\"","variablesReference":0}

      ### Step 6: continue then events
      continue → ok
      events filter "stopped|terminated":
        stopped reason=entry, stopped reason=breakpoint, terminated event seen

      ### Step 7: status at breakpoint
      {"paused":true,"stoppedReason":"breakpoint","stoppedThreadIds":[0]}

      ### Step 8: tear down
      close → ok:true
      stop-controller → {"stopped":true}

      Verbatim signal verification (programmatic grep over tmp/phase-08-r4-smoke-A.log):
      - "lifecycle":"running"                         present
      - "paused":true,"stoppedReason":"entry"         present
      - "verified":true                               present
      - "name":"dapCliSelfHostDemo"                   present
      - "event":"stopped" with "reason":"breakpoint"  present
      - "paused":true,"stoppedReason":"breakpoint"    present
      - close ok:true                                 present
      - stop-controller stopped:true                  present

  - id: B
    result: pass
    captured_output: |
      ### Step 1: start controller → started:true
      ### Step 1a: cleanup --purge → ok:true

      ### Step 2: launch chromium (--headless=new, --user-data-dir=/tmp/dap-cli-smoke-chrome)
      {"ok":true,"data":{"sessionId":"sess_q9AAhKeKGSLYFiBn","name":"smoke-chrome","adapter":"js-debug","lifecycle":"running",...},"meta":{"command":"launch","timestamp":"2026-05-09T05:34:12.984Z"}}

      ### Step 3: set breakpoint on app.js line 2
      → "verified":true (merged from page child)

      ### Step 4: sessions list
      sessions (default): one row, parent smoke-chrome
      sessions --show-children: parent + child smoke-chrome#8E7A4C125E3C04ED81534803F119AA75 with parent_session_id and targetable:false

      ### Step 5: drive bp via evaluate (background)
      events --include stopped:
        {"event":"stopped","body":{"reason":"breakpoint","description":"Paused on breakpoint","threadId":0,"hitBreakpointIds":[0],"allThreadsStopped":false,"child_session_id":"sess_U60Zl0WTXwu2cal5"}}
      threads: returns thread 0
      status: {"paused":true,"stoppedReason":"breakpoint","stoppedThreadIds":[0]}
      stack --thread-id 0: top frame {"name":"Window.calculate","line":2,"source":{...,"path":"…/simple-chrome-page/app.js"}}
      continue → ok
      evaluate completed successfully with {"type":"number","result":"5","variablesReference":0} — faster than the doc's "expected" controller_request_timeout signal because `continue` was issued ahead of the IPC default; this is a stronger pass, not a gap.

      ### Step 6: tear down → close ok:true; stop-controller stopped:true
      ### Step 7: orphan check → no smoke profile orphans

      Verbatim signal verification (programmatic grep over tmp/phase-08-r4-smoke-B.log):
      - "lifecycle":"running"                                        present
      - smoke-chrome#<32-hex CDP target id>                          present (8E7A4C125E3C04ED81534803F119AA75)
      - "verified":true                                              present
      - stopped event with "reason":"breakpoint"                     present
      - "paused":true,"stoppedReason":"breakpoint"                   present
      - top frame "Window.calculate"                                 present
      - close ok:true                                                present
      - stop-controller stopped:true                                 present
      - "no smoke profile orphans"                                   present

## Round 5 Follow-Up (2026-05-09)

A separate "deliberately mean stress + edge-case pass" was run on top of the
round 4 fix. See `08-05-SUMMARY.md` for the full matrix and gap block.

### Stress Matrix Result

| Axis | Result | New gap |
|------|--------|---------|
| 1. Cross-session interference | clean (frameId namespacing held) | none |
| 2. CLI cancellation mid-DAP-request | clean (controller stayed healthy) | none |
| 3. Breakpoint surface edges | truthful failures; multi-condition coverage gap noted as observation | none |
| 4. Close-racing-in-flight | clean | none |
| 5. Events cursor edges | structured `invalid_number` for negatives/non-int; empty result for huge or unmatched filters | none |
| 6. Adapter stderr noise (fake) | clean (`adapter_transport_closed` envelope, `stderrTail` populated) | none |
| 7. Controller restart cycle | **gap (R5-A, closed)** — see below | R5-A |

### GAP-08-05R5 (round 5): `stop-controller` does not reap session-store records

status: closed
fix: `src/controller/server.ts` `ControllerServer.stop()` now persists
`closeSession(sessionId)` for each runtime BEFORE the slow runtime teardown
so a racing `dap-cli start` (the CLI returns from `controller.shutdown` as
soon as the response is written) sees an empty store.
test: Phase 8 round 5 stress axis 7 (real js-debug + ginpei `Server`).

verification:
- New regression test in `tests/integration/fakeAdapterCli.test.ts`:
  `controller stop reaps session-store records for runtimes it tears down`
  — pins the contract that `server.stop()` clears persisted session records
  for any runtime it tears down. Verified to FAIL on the pre-fix tree
  (snapshotted `sessions.json` shows the ghost record) and PASS on the
  post-fix tree.
- Existing test
  `tests/integration/selfHosting.test.ts` →
  `reports actionable diagnostics for persisted js-debug sessions without
  an attached runtime` updated: previously relied on the buggy ghost-record
  path; now snapshots `sessions.json` before `stop()`, lets `stop()` clean
  up, then writes the snapshot back to simulate a crashed (not cleanly-
  stopped) controller before restarting. Same diagnostic signal
  (`session_unavailable`), correct semantic path.
- Hand-driven A + B (full transcript in `08-05-SUMMARY.md`):
    - sequence A: `node dist/index.js start` → `launch smoke-node` paused at
      entry → `breakpoints set` line 3 verified:true → `threads`/`stack`/
      `evaluate` clean → `continue` → `events` shows `stopped` event →
      `status` reports `paused:true,"stoppedReason":"breakpoint"` →
      `close` `ok:true` → `stop-controller` `stopped:true`
    - sequence B: launch chromium pwa-chrome → `breakpoints set` app.js:2
      verified:true (column 18) → sessions hide/show child correctly →
      background `evaluate calculate(2,3)` triggered the bp →
      `events --include stopped` showed `reason:"breakpoint"`,
      `child_session_id:sess_u1P2o2rDyCc7xgP7` → `status paused:true` →
      `stack --thread-id 0` top frame `Window.calculate` at app.js:2 →
      `continue` released the bp; evaluate returned `result:"5"` cleanly
      (faster than the doc's "controller_request_timeout" expected signal)
      → `close orphanPids:[]` → `stop-controller stopped:true` → orphan
      check returned "no smoke profile orphans"

### Non-Gap Observations

- R5-1 (single-condition `breakpoints set`): scalar `--condition` /
  `--hit-condition` / `--log-message` flags applied to all `--line`s; no
  per-line shape, no `--json`, no clear-via-empty-array. Feature-coverage
  gap, not a misleading-error bug.
- R5-2 (round-4 ginpei orphan not reproducible): a clean repro of `close`
  and `stop-controller` against the same ginpei `Server` config in round 5
  showed correct termination of the inferior; the round-4 leftover was a
  one-off, not gap-blocked.

## Round 6 Follow-Up — 2026-05-09

Six-axis stress sweep run via parallel subagents
(`tmp/phase-08-r6-axis{1..6}.log`). See
[08-06-SUMMARY.md](08-06-SUMMARY.md) for the full report. This entry is
the UAT-side closure record.

### Status

- BLOCKER **R6-A** (client RPC hang on socket close mid-request): **fixed**
  in `src/controller/client.ts`; regression test in
  `tests/controller/controllerIpc.test.ts`.
- HIGH **R6-H** (`--workspace <regular file>` → `internal_error`): **fixed**
  in `src/config/launchConfig.ts`; regression test in
  `tests/config/launchConfig.test.ts`.
- HIGH **R6-I** (UTF-8 BOM in `launch.json` rejected): **fixed** in
  `src/config/launchConfig.ts`; regression test in
  `tests/config/launchConfig.test.ts`.
- MEDIUM **R6-F** (corrupt `sessions.json` opaque crash): **fixed** in
  `src/sessions/sessionStore.ts`; new regression test file
  `tests/sessions/sessionStore.test.ts`.
- HIGH **R6-B** (socket-file unlink race on multi-session hot restart):
  **deferred to Round 7** — needs pid-ownership check at unlink site or
  removal of the unlink from the new-controller bind path. Reproducer in
  axis 2 transcript.
- HIGH **R6-C** (mid-stream disconnect collapsed under
  `controller_unavailable`): **deferred to Round 7** — needs a distinct
  `controller_request_aborted` / `controller_disconnected` code path with
  different recovery diagnostics.
- HIGH **R6-D** (`status` reports `paused:true` after adapter death):
  **deferred to Round 7** — needs runtime-liveness consultation in the
  status projection.
- MEDIUM **R6-E** (failure-envelope `request.command` mis-attribution
  under fan-out): **deferred to Round 7** — cosmetic but misleading.
- MEDIUM **R6-G** (orphan `serve-controller` accumulation): **deferred to
  Round 7** — needs opportunistic stale-controller sweep on `start`.
- LOW notes: catalogued in 08-06-SUMMARY.md "LOW notes"; defer all to
  Round 7 unless one becomes user-visible.

### Hand-Driven CLI Smoke (Round 6)

ran_at: 2026-05-09T07:42Z
sequences:
  - id: A
    result: pass
    captured_log: /tmp/dap-r6-smokeA.log
    summary:
      lifecycle_running_envelopes: 4
      paused_true_envelopes: 2
      verified_true_envelopes: 2
      stopped_events: 1
      ok_false_envelopes: 0
      sequence_complete_marker: true
  - id: B
    result: pass
    captured_log: /tmp/dap-r6-smokeB.log
    summary:
      lifecycle_running_envelopes: 5
      verified_true_envelopes: 1
      stopped_events: 1
      paused_true_envelopes: 1
      stopped_reason_breakpoint_envelopes: 1
      orphan_check_result: "no smoke profile orphans"
      sequence_complete_marker: true

Both Round 6 smoke sequences passed; full transcripts captured in
`/tmp/dap-r6-smoke{A,B}.log`. Phase 8 Round 6 is eligible for
`status: complete` once the four Round 6 commits land on `main`.
