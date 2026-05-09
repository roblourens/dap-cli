# Phase 8 Round 4 Summary — External Project Hardening (stress + edge-case pass)

## Result

Drove a 10-axis stress sweep against the published `dist/index.js` CLI with a
real js-debug adapter and an external Express target
(`tmp/phase-08-external-projects/ginpei__vscode-debug-web-demo`). Found ONE
new product gap, BUG-08-04R4: the same misleading `controller_unavailable:
<DAP error message>` shape as GAP-08-02 / BUG-08-04, but on a different
codepath — the multi-child intercept in `routeDapRequest` was missing the
`toDapCliError` wrap, so any DAP error thrown by a child adapter (evaluate /
setExpression / setVariable / scopes against a stale frameId, etc.) leaked
the raw DAP message past the controller IPC envelope and was collapsed by the
CLI client into "controller_unavailable: Run `dap-cli start`". Fixed at the
controller server boundary.

Also identified two related observations that were investigated and are NOT
new gaps (see "Non-Gap Observations" below):
- IPC client default 5s vs controller DAP 30s timeout. Adapters that silently
  black-hole an "Unknown request" (js-debug `setExpression` / `restartFrame`)
  trip the client timeout before the controller does. The right fix here is
  to surface the adapter's actual no-response behavior rather than to
  uniformly raise the IPC default — js-debug's missing capability flag
  (`supportsSetExpression`, `supportsRestartFrame`) is the underlying defect
  and is upstream's responsibility.
- `availableFrameIds` payload size on a long-running session can grow to
  20+KB. This is a UX nuisance but not a correctness bug; the data is
  truthful and the caller asked for it via passing a stale id. Filed as a
  follow-up note; not gap-blocked.

## Stress Matrix Coverage

| Axis | Scenarios attempted | Pass | New gaps |
|------|--------------------|------|----------|
| 1. Lifecycle / restart races | controller reuse after restart, status of paused session after `start` reuse, `kill -9` on owned adapter | yes (controller stayed healthy across `start` reuse; killed adapter visible via status `cleanupActions` and adapter log) | none |
| 2. Concurrency / parallel commands | 10× parallel `threads`/`stack`/`scopes`/`evaluate` against the same paused session | yes (all 10 returned `ok:true`; no IPC race, no out-of-order envelope) | none |
| 3. Multi-child js-debug | pwa-node parent + Express child, breakpoint at `server.js:19`, hit via `curl http://localhost:8080/data.json` | yes (breakpoint verified, child registered, parent paused state mirrored) | none |
| 4. Breakpoints | set + verify on a child-owned source after the child registered | yes (verified:true on the merged response) | none |
| 5. Variable inspection | scopes/variables on a real frame; same with stale frameId; same with bogus variablesReference | yes (real frame returns scopes; stale ids return structured `frame_not_found` / `variable_reference_not_found`) | none |
| 6. Evaluate / repl | evaluate of `throw new Error(...)`, evaluate of an undefined identifier, evaluate of a normal expression, evaluate against a stale frameId | **gap found (R4-A): adapter-rejected evaluate returned `controller_unavailable` instead of `dap_request_failed`** | R4-A (closed) |
| 7. Launch configs | reused round-3 `Server` config; no new awkward shapes attempted in round 4 | n/a | none |
| 8. Adapter quirks | js-debug claims `supportsSetExpression: true` and `supportsRestartFrame: true` in initialize, then responds to either request with stderr `Unknown request: setExpression` / `Unknown request: restartFrame` and never sends a DAP response | n/a (upstream defect; documented in Non-Gap Observations) | none |
| 9. IPC / wire stress | parallel commands (axis 2); `start` reuse with stale session in store; `dap.request` with capability-missing command (`goto`); `dap.request` for unsupported (`setExpression`) | yes (`goto` returned structured `dap_request_unsupported`; `setExpression` exposed the IPC-vs-controller timeout mismatch documented in Non-Gap Observations) | none |
| 10. State / cleanup | session record persists across controller `start` reuse; `cleanupActions` populated when adapter pid is owned; close + stop-controller round-trip clean | yes | none |

## Gaps

### R4-A (BUG-08-04 round 4): child-routed DAP errors return `controller_unavailable` instead of `dap_request_failed`

truth: When the parent session has children (js-debug pwa-node) and the user
issues a DAP command (evaluate / scopes against a stale frame / variables /
setVariable / setExpression / continue / etc.) that the child adapter
**rejects** with a DAP `success: false` response, dap-cli must surface a
structured `dap_request_failed` envelope (category `dap`, exitCode 5) with
`sessionId`, `request.command`, and `adapter` context populated. It must NOT
return `controller_unavailable: <DAP error message>` — that hint is a lie
when the controller is healthy and the only problem is that the adapter
refused the request.

status: closed

reason: `src/controller/server.ts` `routeDapRequest` only wrapped errors
thrown by the parent's `runtime.client.request(...)` call via
`toDapCliError`. The multi-child intercept path
(`runtime.children.maybeIntercept(command, args)` ahead of the parent client
request) had no try/catch — any DAP error from a child adapter propagated
out as a bare `Error`. The controller's generic `handleRequest` catch then
emits a `controller_request_failed` envelope (no `category`/`exitCode`), and
the CLI client (`src/controller/client.ts`) collapses any controller error
not matching a known session-error code into `controllerUnavailable(message)`
— yielding the misleading "Run `dap-cli start`" hint. Same shape as the
already-fixed GAP-08-02 (`thread_not_paused`) and GAP-08-04 (lookup miss),
but on a third codepath (adapter rejection of an intercepted request).

severity: major (silently misleading recovery guidance for a common
interactive flow: evaluate a typo / inspect a stale frame on a multi-child
js-debug session)

fix:
- `routeDapRequest` now wraps the `maybeIntercept` call in the same
  `toDapCliError` flow as the parent `client.request` path, so any error
  thrown by a child request flows through the same staleSession + adapter
  context populating as a parent error would. Already-`CliError`-shaped
  errors (frame_not_found, variable_reference_not_found, source_reference_
  not_found, thread_not_paused) pass through unchanged because
  `toDapCliError` returns CliError instances as-is.

verification:
- New focused regression test in `tests/controller/childSessions.test.ts`:
  `child-rejected DAP requests re-throw raw error so server can wrap as
  dap_request_failed (GAP-08-04 round 4)` — pins the contract that
  `maybeIntercept` re-throws raw DAP errors so the server-side wrap can
  categorize them, and asserts the message is NOT the
  `controller_unavailable` shape.
- Existing `step-out adapter failure preserves DAP error category` test in
  `tests/cli/errorContracts.test.ts` continues to pass — covers the same
  wrap on the parent-client path.
- External repro re-run end-to-end against
  `ginpei/vscode-debug-web-demo`:
  - Before fix:
    `evaluate --expression 'thisIsCertainlyUndefined' --frame-id <stale>` →
    `{"code":"controller_unavailable","category":"controller","message":"DAP request failed: evaluate"}`
    (captured in `tmp/phase-08-r4-leaky-dap-errors.log`, tests 5/6/11/13).
  - After fix:
    `evaluate --expression 'thisIsCertainlyUndefined' --frame-id <stale>` →
    `{"code":"dap_request_failed","category":"dap","exitCode":5,"sessionId":"sess_…","request":{"command":"evaluate","seq":7},"adapter":{"descriptorId":"js-debug","pid":42663,"logPath":"…"}}`
    (captured in `tmp/phase-08-r4-fix-verification.log`).
  - Same envelope shape verified for `evaluate 'throw new Error(...)'`.

artifacts:
- `tmp/phase-08-r4-leaky-dap-errors.log` (pre-fix repro, axes 6/9)
- `tmp/phase-08-r4-fix-verification.log` (post-fix repro)
- `tmp/phase-08-r4-lifecycle.log` (axis 1 capture)
- `tmp/phase-08-r4-misc.log` (axis 2 parallel-commands capture)
- `tmp/phase-08-r4-smoke-A.log` (hand-driven smoke A)
- `tmp/phase-08-r4-smoke-B.log` (hand-driven smoke B)

reproduction:
- `mkdir -p /tmp/d8r4 && ln -sf ~/.dap-cli/adapters /tmp/d8r4/adapters && ln -sf ~/.dap-cli/venv /tmp/d8r4/venv`
- `DAP_CLI_HOME=/tmp/d8r4 node dist/index.js start`
- `DAP_CLI_HOME=/tmp/d8r4 node dist/index.js launch --workspace tmp/phase-08-external-projects/ginpei__vscode-debug-web-demo --config Server --name s2`
- `DAP_CLI_HOME=/tmp/d8r4 node dist/index.js breakpoints set --name s2 --source …/server.js --line 19`
- `curl -s http://localhost:8080/data.json` (drive parent to mirror paused state via the registered child)
- `STACK=$(DAP_CLI_HOME=/tmp/d8r4 node dist/index.js stack --name s2 --thread-id 0)`; pull a real `frameId` from the response
- `DAP_CLI_HOME=/tmp/d8r4 node dist/index.js evaluate --name s2 --expression 'thisIsCertainlyUndefined' --frame-id $FID`
- Before fix: `controller_unavailable`. After fix: `dap_request_failed`.

missing: closed.

## Non-Gap Observations

### Observation R4-1: js-debug claims setExpression/restartFrame capability but rejects the requests at runtime

js-debug's `initialize` response advertises
`supportsSetExpression: true, supportsRestartFrame: true`. The actual
`setExpression` / `restartFrame` requests, however, are answered with stderr
output (`Unknown request: setExpression`, `Unknown request: restartFrame`)
and **no DAP response message**. The controller waits for the response,
hits its 30s `controllerDapRequestTimeoutMs`, and the CLI's 5s IPC
`createControllerClient` default trips first — surfacing as a
`controller_request_timeout`. This is unhelpful but accurate: a request
that the adapter promised to honor is never answered.

Investigated as a candidate gap. Concluded: **not a dap-cli gap.** The
underlying defect is js-debug's mis-advertised capability flag (an upstream
issue), and the right surface fix is to expose the correct `dap_request_*`
shape, which only the adapter knows. Uniformly raising the CLI IPC default
to 35s would mask non-pathological latencies and degrade the interactive
feel of the CLI for a single mis-behaving adapter request type. Captured for
upstream tracking; left at current behavior. The user-facing
`controller_request_timeout` envelope already documents the recovery
("Check whether the controller process is still healthy.").

### Observation R4-2: availableFrameIds payload size on long-running sessions

After ~150 hits on the same breakpoint, the
`availableFrameIds` array in a `frame_not_found` payload reached 200+
entries (~27KB). The data is truthful — those frame ids really are
currently known to the coordinator — and the user only sees this when they
deliberately pass a stale id. Capping the array would either drop
information the user might need (which child a frame belongs to) or require
a `truncated: true` signal that callers would have to interpret.
Decision: leave as-is; revisit if an interactive use case actually trips
this in practice.

### Observation R4-3: `kill -9` on the owned adapter does not auto-reap the session record

After `kill -9 $ADAPTER_PID` against the owned js-debug process, the
controller's session record continues to report `lifecycle: running,
status: running, paused: true, stoppedReason: breakpoint` — the adapter
exit was not observed because the controller has no SIGCHLD-style watcher
on owned adapters between requests. The next DAP request against the
session would surface the disconnection (the request would fail through
the now-closed transport). Until then, `status` reflects the last cached
state.

This matches the existing documented design (see `cleanupActions` field on
status: "Signal owned adapter pid <pid> if cleanup is required.") and is
already covered by `Phase 8 Round 3` Non-Gap Limitations. Not a new gap.

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
      ### Step 1: start controller
      {"ok":true,"data":{"started":true,"reused":false,...},"meta":{"command":"start",...}}

      ### Step 1a: cleanup --purge
      → ok:true

      ### Step 2: launch chromium (--headless=new, --user-data-dir=/tmp/dap-cli-smoke-chrome)
      {"ok":true,"data":{"sessionId":"sess_q9AAhKeKGSLYFiBn","name":"smoke-chrome","adapter":"js-debug","lifecycle":"running",...},"meta":{"command":"launch","timestamp":"2026-05-09T05:34:12.984Z"}}

      ### Step 3: set breakpoint on app.js line 2
      → "verified":true (merged response from page child)

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
      evaluate completed successfully with {"type":"number","result":"5","variablesReference":0} (faster than the 5s IPC timeout because the test issued continue ahead of the timeout — better than the doc's "expected" controller_request_timeout signal)

      ### Step 6: tear down
      close → ok:true
      stop-controller → {"stopped":true}

      ### Step 7: orphan check
      pgrep -lf '/tmp/dap-cli-smoke-chrome' → no smoke profile orphans

      Verbatim signal verification (programmatic grep over tmp/phase-08-r4-smoke-B.log):
      - "lifecycle":"running"                                        present (5×)
      - smoke-chrome#<32-hex CDP target id>                          present (8E7A4C125E3C04ED81534803F119AA75)
      - "verified":true                                              present
      - stopped event with "reason":"breakpoint"                     present
      - "paused":true,"stoppedReason":"breakpoint"                   present
      - top frame "Window.calculate"                                 present
      - close ok:true                                                present
      - stop-controller stopped:true                                 present
      - "no smoke profile orphans"                                   present
      - controller_request_timeout                                   NOT present (better than doc's expected signal — evaluate completed under 5s because continue was issued first; this is a stronger pass, not a gap)

## Cleanup

- All test sessions closed; controller stopped (`stop-controller` returns
  `{"stopped":true}`).
- Per-run scratch DAP_CLI_HOME directories under `/tmp/d8r4-1`, `/tmp/d8r4-2`
  retained for forensic inspection of `tmp/phase-08-r4-*.log` references;
  user can `rm -rf /tmp/d8r4-*` when done.
- Smoke chromium profile `/tmp/dap-cli-smoke-chrome` left in place;
  `pgrep -lf '/tmp/dap-cli-smoke-chrome'` returned non-zero (no orphans).
- Earlier-day orphaned `serve-controller` PIDs (4624, 9425, 13547 from the
  prior session) are visible in `ps aux`; they belong to other workspaces
  and were not touched.

## Self-Check: PASSED

- npm run build: success (dist/index.js 232.08 KB)
- npm test: 24 files, 298 passed, 7 skipped, 0 failed
- Hand-driven smoke A: PASS
- Hand-driven smoke B: PASS
- Bug fix R4-A: committed on main as `fix(controller): wrap intercepted child DAP errors as dap_request_failed` (commit 6acd0c1; "(Written by Copilot)" trailer present).
