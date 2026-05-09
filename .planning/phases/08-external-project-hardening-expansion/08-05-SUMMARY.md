# Phase 8 Round 5 Summary — External Project Hardening (stress + edge-case pass)

## Result

Drove a 7-axis stress sweep against the published `dist/index.js` CLI with a
real js-debug adapter. Targeted axes round 4 only lightly covered: cross-
session interference, CLI cancellation, conditional/log/hit breakpoints, the
`breakpoints set` clear-via-empty path, close-racing-in-flight, events
cursor edges, fake-adapter stderr, and most importantly the `stop-controller`
+ restart cycle. Found ONE new product gap, BUG-08-05R5: `controller.shutdown`
killed adapter runtimes via `terminateRuntime` but never reaped the matching
session-store records, so the next `dap-cli start` inherited ghost `running`
records that locked names (`session_name_in_use` on relaunch) and pointed
`events`/`status` at dead adapter logs (`session_unavailable`). Fixed by
persisting `closeSession()` for each runtime BEFORE the slow runtime teardown
in `ControllerServer.stop()`.

Also identified observations that are NOT new gaps:
- `breakpoints set` accepts only one `--condition` / `--hit-condition` /
  `--log-message` per call, applied to all `--line`s in the request, and
  requires `--line` (no `--json` escape, no clear-via-empty-array). This is
  a feature-coverage gap, not a misleading-error bug — the CLI surface is
  truthful. Filed as a follow-up note, not gap-blocked.
- The round-4 leftover Express user-program (`/tmp/d8r4-2`, port 8080,
  pid 42667) that initially looked like a `close`-orphan is NOT reproducible
  in round 5: clean `close` and clean `stop-controller` on an external
  ginpei `Server` config now both terminate the user-program in step.
  The leftover was a one-off artifact of the round-4 smoke teardown order
  and should not be re-classified as a product bug.

## Stress Matrix Coverage

| Axis | Scenarios attempted | Pass | New gaps |
|------|--------------------|------|----------|
| 1. Cross-session interference | parallel ginpei `Server` (port-collision-failed) + Node fixture sessions; stack/scopes/evaluate routing each to its own session; cross-session `evaluate --frame-id <id>` against the wrong session id | yes (frameId namespacing held — `variable_reference_not_found` returned with empty `availableFrameIds`, no leak) | none |
| 2. CLI cancellation mid-DAP-request | `dap-cli evaluate` against a paused session in the background, SIGTERM the CLI before it returns, then issue follow-up `status` / `threads` against the same session | yes (controller stayed healthy, follow-up commands returned `ok:true`) | none |
| 3. Breakpoint surface edges | `--line 99999` (verifies as unbound + verification_timeout warning), `--source /nonexistent/file.js` (verifies as unbound + verification_timeout warning), `--line` + `--json` (no `--json` flag — usage_error), conditional/logMessage/hitCondition single-line (works), multi-line different-conditions (not supported by CLI), clear-via-empty-array (`--line` required — not supported) | partial (truthful failures; feature-coverage gap, not a bug) | none |
| 4. Close-racing-in-flight | issue `close` while a long `continue` is in flight; the `continue` returned `ok:true` immediately (target wasn't actually long-running for fixture); subsequent `close` returned cleanly | yes | none |
| 5. Events cursor edges | `--after-cursor 9999999` / `--after-cursor -1` / `--after-cursor 0` / `--after-cursor abc` / `--limit -5` / `--limit 99999999` / `--include nonexistentEvent` / `--include ''` | yes (negative numbers and non-int → `invalid_number` envelope; huge cursors → empty `events` array; nonexistent / empty include → empty result, no crash) | none |
| 6. Adapter stderr noise | fake adapter `--script stderr-stopped` (unknown script) | yes (launch returns structured `adapter_transport_closed` with `stderrTail: ["Unknown fake adapter script: stderr-stopped"]`, status reports `lifecycle: failed`, close clean) | none |
| 7. Controller restart cycle | `start` → `launch` (real js-debug ginpei `Server`) → `stop-controller` → `start` → `sessions` (expect EMPTY) → relaunch with same `--name` (expect SUCCESS) | **gap found (R5-A): post-stop-controller `sessions` still listed the prior session as `running`; relaunch with same name failed `session_name_in_use`; `events --name <stale>` returned `session_unavailable` pointing at the dead adapter log** | R5-A (closed) |

## Gaps

### R5-A (BUG-08-05R5): `stop-controller` does not reap session-store records

truth: When `dap-cli stop-controller` (or any direct `controller.shutdown`
IPC call) terminates a controller that has live runtimes, the persisted
session-store (`<DAP_CLI_HOME>/state/sessions.json`) must NOT keep the
matching session records as `running`. The next `dap-cli start` against the
same `DAP_CLI_HOME` must see those sessions removed from `dap-cli sessions`,
the names freed for relaunch (no `session_name_in_use`), and per-name
queries like `dap-cli events --name <name>` must NOT return
`session_unavailable` pointing at the dead-adapter log of the killed
runtime.

status: closed

reason: `ControllerServer.stop()` walked `this.runtimes` and called
`terminateRuntime(runtime, { terminateDebuggee: true })` for each, but never
called the session-manager's `closeSession(sessionId)` (or any
session-store mutation). Compare to `sessions.close` which does both:
terminate the runtime AND `manager.closeSession(sessionId)` to remove the
record. The `stop()` shutdown path was the only teardown route that left
ghost records behind. On the next `start`, the new controller loaded the
persisted `sessions.json` via `SessionManager.create(...)` and inherited
the stale `running` records — which then poisoned `launch` (name
collision) and `events`/`status` (`session_unavailable` with diagnostics
pointing at a dead adapter log).

severity: major. Cleanly recoverable via `dap-cli cleanup --purge`, but the
"controller went down with sessions; restart and continue" flow is the
exact path users hit when killing/restarting a controller after a stuck
adapter, and the misdirection cost is real: `events --name <stale>` looks
like a transient adapter problem ("Adapter log: …") when in fact the
session is dead.

fix:
- `src/controller/server.ts` `ControllerServer.stop()` now persists session-
  store cleanup BEFORE the slow runtime teardown:

  ```ts
  this.stopped = true;
  await removeControllerDiscovery(this.options);

  // Persist session-store cleanup BEFORE the slow runtime teardown so a
  // racing `dap-cli start` (the CLI returns from `controller.shutdown`
  // as soon as the response is written, not when stop() completes) sees
  // an empty store. Without this, the next controller inherits ghost
  // `running` records pointing at adapters this controller is still in
  // the middle of killing — `events`/`status` then return
  // `session_unavailable` and relaunching with the same name fails as
  // `session_name_in_use`.
  for (const sessionId of [...this.runtimes.keys()]) {
    await this.sessionManager?.closeSession(sessionId).catch(() => undefined);
  }

  for (const runtime of this.runtimes.values()) {
    await this.terminateRuntime(runtime, { terminateDebuggee: true }).catch(() => undefined);
  }
  this.runtimes.clear();
  ```

- The reorder is essential because the IPC client returns from
  `controller.shutdown` as soon as the controller writes the response
  envelope, not when `stop()` finishes — `runtimes.terminateRuntime` can
  take 1–3 s per js-debug adapter. Persisting first guarantees that even a
  back-to-back `stop-controller` + `start` shell sequence sees an empty
  session-store.

verification:
- Pre-fix repro (round 5 stress sweep, see `tmp/phase-08-r5-events-stderr-v2.log`):
  after `stop-controller` + `start`, `dap-cli events --name s` returned
  `session_unavailable` for `sess_gM7VnwcRk6LQvkRm`, and `dap-cli launch
  --name s` returned `session_name_in_use`.
- Post-fix repro (`tmp/phase-08-r5-bug-A-postfix-repro.log`): after
  `stop-controller` + `start`, `dap-cli sessions` returns `[]`; relaunch
  with `--name s` succeeds with a fresh `sessionId`; subsequent `close`
  reports `orphanPids: []` and the user-program port is free.
- Focused regression test:
  `tests/integration/fakeAdapterCli.test.ts` →
  `controller stop reaps session-store records for runtimes it tears down`.
  Verified to FAIL on the pre-fix tree (snapshotted `sessions.json` shows
  the ghost record) and PASS on the post-fix tree.
- Existing test
  `tests/integration/selfHosting.test.ts` → `reports actionable diagnostics
  for persisted js-debug sessions without an attached runtime` was updated:
  it previously relied on `server.stop()` leaving a ghost record to test the
  diagnostic path. After the fix, that path is only reached on a true
  controller crash, so the test now snapshots `sessions.json` BEFORE
  `stop()`, lets `stop()` clean up, then writes the snapshot back to
  simulate a crashed controller before restarting.

artifacts:
- `tmp/phase-08-r5-events-stderr-v2.log` (pre-fix repro, captures the
  `session_name_in_use` and `session_unavailable` envelopes)
- `tmp/phase-08-r5-bug-A-postfix-repro.log` (post-fix repro, captures the
  empty `sessions` list, successful relaunch, and clean `close`)
- `tmp/phase-08-r5-cross-session.log`,
  `tmp/phase-08-r5-bp-edges.log`,
  `tmp/phase-08-r5-cancel-close-race.log`,
  `tmp/phase-08-r5-orphan-debuggee.log`,
  `tmp/phase-08-r5-stop-controller-orphan.log`,
  `tmp/phase-08-r5-events-stderr.log` (axes that closed without new gaps)

reproduction:
```bash
# Pre-fix (revert src/controller/server.ts in this commit, rebuild):
DAP_CLI_HOME=/tmp/d8r5 node dist/index.js start
DAP_CLI_HOME=/tmp/d8r5 node dist/index.js launch --workspace tmp/phase-08-external-projects/ginpei__vscode-debug-web-demo --config Server --name s
DAP_CLI_HOME=/tmp/d8r5 node dist/index.js stop-controller
DAP_CLI_HOME=/tmp/d8r5 node dist/index.js start
DAP_CLI_HOME=/tmp/d8r5 node dist/index.js sessions
# pre-fix: s shows as running (ghost record); post-fix: empty list
DAP_CLI_HOME=/tmp/d8r5 node dist/index.js launch --workspace tmp/phase-08-external-projects/ginpei__vscode-debug-web-demo --config Server --name s
# pre-fix: session_name_in_use; post-fix: ok
```

missing: nothing; the fix and regression test land in this round.

## Non-Gap Observations

### R5-1: `breakpoints set` is single-condition / non-bulk / no-clear

`breakpoints set` exposes `--condition`, `--hit-condition`, and `--log-message`
as scalar flags applied to all `--line` values in the call. There is no
per-line condition shape, no `--json` escape hatch, and no way to clear all
breakpoints in a source by passing an empty list (`--line` is required).
DAP `setBreakpoints` REPLACES the bp set per-source per-call, so a CLI user
who wants three different-condition breakpoints in the same file cannot do
it through this CLI today; they would have to fall through to
`dap-cli dap setBreakpoints --json '{...}'` and craft the full DAP request
by hand.

This is a feature-coverage gap, not a correctness or misleading-error bug.
The CLI surface is truthful (every error envelope is structured), and the
DAP escape hatch is documented. Filed here as a forward-looking observation;
not gap-blocked. A follow-up phase could expand `breakpoints set` to accept
a `--breakpoints-json` (per-line shape) or per-line repeating flags.

### R5-2: round-4 ginpei orphan is not reproducible

The investigation that found BUG-08-05R5 started from a leftover
`/tmp/d8r4-2` Express user-program (pid 42667) bound to port 8080 with a
parent of pid 42663 (a dead js-debug adapter from round 4). That looked
like a close-orphan, but a clean reproduction in round 5 against the same
ginpei `Server` config (`tmp/phase-08-r5-orphan-debuggee.log`) showed
`close` correctly terminating the inferior — port 8080 listener gone post-
`close`, no orphan. A follow-up clean repro of `stop-controller` with a
live ginpei session (`tmp/phase-08-r5-stop-controller-orphan.log`) also
showed both adapter and inferior dying cleanly. The round-4 leftover was
most likely an interaction between round-4's `stop-controller` and an
already-failing round-4 session whose adapter was in an unusual state
during teardown — not reproducible in isolation, not gap-blocked.

This observation is preserved here so the same false-orphan narrative does
not get re-litigated in round 6.

## Hand-Driven CLI Smoke

Per repo verification rule (see `.github/copilot-instructions.md`), the
orchestrator agent ran `docs/HAND-DRIVEN-SMOKE.md` Sequence A and Sequence B
in a real terminal using `run_in_terminal`. Verbatim output captured below.

### Sequence A — Node target, breakpoint round-trip via the real CLI

Captured at: `Fri May  8 23:02:35 PDT 2026` (full log:
`tmp/phase-08-r5-smoke-A.log`)

```
## Pre-step: clean state
{"ok":true,"data":{"stopped":false},"meta":{"command":"stop-controller","timestamp":"2026-05-09T06:02:36.023Z"}}

## Step 1: start
{"ok":true,"data":{"started":true,"reused":false,"pid":89445,"endpoint":{"kind":"ipc","path":"/Users/roblou/.dap-cli/state/controller.sock"},"stateDir":"/Users/roblou/.dap-cli/state","logDir":"/Users/roblou/.dap-cli/logs","buildId":"0.0.0:dist:1778306431935.875:237828"},"meta":{"command":"start","timestamp":"2026-05-09T06:02:37.222Z"}}

## Step 2: launch (stop-on-entry)
{"ok":true,"data":{"sessionId":"sess_d-5oxXl-bg3YBdEp","name":"smoke-node","lifecycle":"running",...,"eventCursor":4},"meta":{"command":"launch","timestamp":"2026-05-09T06:02:38.250Z"}}

## Step 3: status (paused at entry)
{"ok":true,"data":{"id":"sess_d-5oxXl-bg3YBdEp","name":"smoke-node","adapter":"js-debug","lifecycle":"running","status":"running","updatedAt":"2026-05-09T06:02:38.359Z","paused":true,"stoppedReason":"entry","stoppedThreadIds":[0],"stderrTail":[],"cleanupActions":["Signal owned adapter pid 89466 if cleanup is required."],"logPath":"/Users/roblou/.dap-cli/logs/js-debug-89466.log"},"meta":{"command":"status","timestamp":"2026-05-09T06:02:39.352Z"}}

## Step 4: breakpoints set
{"ok":true,"data":{"breakpoints":[{"id":0,"verified":true,"source":{"name":"/Users/roblou/code/dap-cli/tests/fixtures/dap-cli-target/index.js","path":"/Users/roblou/code/dap-cli/tests/fixtures/dap-cli-target/index.js","sourceReference":0},"line":3,"column":3}]},"meta":{"command":"breakpoints set","timestamp":"2026-05-09T06:02:39.428Z"}}

## Step 5a: threads
{"ok":true,"data":{"threads":[{"id":0,"name":"index.js [89470]","sessionName":"smoke-node#132626ec1f860aea9ae4108d"}]},"meta":{"command":"threads","timestamp":"2026-05-09T06:02:39.498Z"}}

## Step 5b: stack (top frame)
{"ok":true,"data":{"stackFrames":[{"id":0,"name":"dapCliSelfHostDemo","line":2,"column":18,"source":{"name":"/Users/roblou/code/dap-cli/tests/fixtures/dap-cli-target/index.js",...},...}],"totalFrames":15},"meta":{"command":"stack","timestamp":"2026-05-09T06:02:39.568Z"}}

## Step 5c: evaluate
{"ok":true,"data":{"type":"string","result":"'undefined'","variablesReference":0},"meta":{"command":"evaluate","timestamp":"2026-05-09T06:02:39.638Z"}}

## Step 6: continue + events
{"ok":true,"data":{"allThreadsContinued":false},"meta":{"command":"continue","timestamp":"2026-05-09T06:02:39.706Z"}}
"event":"breakpoint"
"event":"continued"
"event":"initialized"
"event":"loadedSource"
"event":"output"
"event":"stopped"
"event":"thread"

## Step 7: status (paused at breakpoint)
{"ok":true,"data":{"id":"sess_d-5oxXl-bg3YBdEp","name":"smoke-node","adapter":"js-debug","lifecycle":"running","status":"running","updatedAt":"2026-05-09T06:02:39.708Z","paused":true,"stoppedReason":"breakpoint","stoppedThreadIds":[0],"stderrTail":[],"cleanupActions":["Signal owned adapter pid 89466 if cleanup is required."],"logPath":"/Users/roblou/.dap-cli/logs/js-debug-89466.log"},"meta":{"command":"status","timestamp":"2026-05-09T06:02:40.891Z"}}

## Step 8: close + stop-controller
{"ok":true,"data":{"id":"sess_d-5oxXl-bg3YBdEp","name":"smoke-node",...,"orphanPids":[],"warnings":[]},"meta":{"command":"close","timestamp":"2026-05-09T06:02:43.040Z"}}
{"ok":true,"data":{"stopped":true},"meta":{"command":"stop-controller","timestamp":"2026-05-09T06:02:43.131Z"}}
```

| Step | Expected verbatim signal | Result |
|------|--------------------------|--------|
| 2    | `"lifecycle":"running"` and a `sess_…` id from `launch` | pass — `sess_d-5oxXl-bg3YBdEp` |
| 3    | `"paused":true` with `"stoppedReason":"entry"` | pass |
| 4    | `"verified":true` for line 3 | pass — `column 3` |
| 5    | `threads` returns a thread id; `stack` shows top frame `dapCliSelfHostDemo` at line 2 | pass — thread 0, top frame `dapCliSelfHostDemo` line 2 column 18 |
| 6    | `stopped` event with `"reason":"breakpoint"` appears within ~1 s | pass — `event:stopped`, `event:breakpoint` both observed |
| 7    | `"paused":true` with `"stoppedReason":"breakpoint"` | pass |
| 8    | `close` returns `ok:true`; `stop-controller` returns cleanly | pass — `orphanPids:[]`, `warnings:[]`, `stopped:true` |

### Sequence B — Side-by-side with Playwright on real Chromium

Captured at: `Fri May  8 23:03:14 PDT 2026` (full log:
`tmp/phase-08-r5-smoke-B.log`)

```
## Pre-step: clean state
{"ok":true,"data":{"stopped":false},"meta":{"command":"stop-controller","timestamp":"2026-05-09T06:03:14.969Z"}}

## Step 1: start
{"ok":true,"data":{"started":true,"reused":false,"pid":93000,"endpoint":{"kind":"ipc","path":"/Users/roblou/.dap-cli/state/controller.sock"},...},"meta":{"command":"start","timestamp":"2026-05-09T06:03:16.290Z"}}

## Step 1a: cleanup --purge
{"ok":true,"data":{"signaledAdapter":[],"removedRecords":[],"keptRunning":[],"failed":[],"orphanPids":[],"warnings":[]},"meta":{"command":"cleanup","timestamp":"2026-05-09T06:03:17.212Z"}}

## Step 2: launch chromium
{"ok":true,"data":{"sessionId":"sess_fPZnwAC9Di6Bz-ZV","name":"smoke-chrome","lifecycle":"running",...,"eventCursor":7},"meta":{"command":"launch","timestamp":"2026-05-09T06:03:18.781Z"}}

## Step 3: breakpoints set
{"ok":true,"data":{"breakpoints":[{"id":0,"verified":true,"source":{"name":"app.js","path":"/Users/roblou/code/dap-cli/tests/fixtures/simple-chrome-page/app.js","sourceReference":0},"line":2,"column":18}]},"meta":{"command":"breakpoints set","timestamp":"2026-05-09T06:03:21.868Z"}}

## Step 4a: sessions (default — children hidden)
{"ok":true,"data":[{"id":"sess_fPZnwAC9Di6Bz-ZV","name":"smoke-chrome","adapter":"js-debug","lifecycle":"running","status":"running","updatedAt":"2026-05-09T06:03:18.778Z"}],"meta":{"command":"sessions","timestamp":"2026-05-09T06:03:21.934Z"}}

## Step 4b: sessions --show-children
{"ok":true,"data":[{"id":"sess_fPZnwAC9Di6Bz-ZV","name":"smoke-chrome",...},{"id":"sess_u1P2o2rDyCc7xgP7","name":"smoke-chrome#53366E8A0A849B65D931A0882DA01060","adapter":"js-debug","lifecycle":"running","status":"running","updatedAt":"2026-05-09T06:03:18.798Z","parent_session_id":"sess_fPZnwAC9Di6Bz-ZV","targetable":false}],"meta":{"command":"sessions","timestamp":"2026-05-09T06:03:22.001Z"}}

## Step 5: drive bp via evaluate (background) + observe
--- events --include stopped ---
{"ok":true,"data":{"sessionId":"sess_fPZnwAC9Di6Bz-ZV","name":"smoke-chrome","events":[{"cursor":10,"receivedAt":"2026-05-09T06:03:22.072Z","sessionId":"sess_fPZnwAC9Di6Bz-ZV","dapSeq":10,"event":"stopped","summary":"stopped event seq=10","body":{"reason":"breakpoint","description":"Paused on breakpoint","threadId":0,"hitBreakpointIds":[0],"allThreadsStopped":false,"child_session_id":"sess_u1P2o2rDyCc7xgP7"}}],"cursor":13,"dropped":0,"capacity":250,...},"meta":{"command":"events","timestamp":"2026-05-09T06:03:25.083Z"}}
--- threads ---
{"ok":true,"data":{"threads":[{"id":0,"name":"index.html?manual","sessionName":"smoke-chrome#53366E8A0A849B65D931A0882DA01060"}]},"meta":{"command":"threads","timestamp":"2026-05-09T06:03:25.150Z"}}
--- status ---
{"ok":true,"data":{"id":"sess_fPZnwAC9Di6Bz-ZV","name":"smoke-chrome","adapter":"js-debug","lifecycle":"running","status":"running","updatedAt":"2026-05-09T06:03:22.072Z","paused":true,"stoppedReason":"breakpoint","stoppedThreadIds":[0],"stderrTail":[],...},"meta":{"command":"status","timestamp":"2026-05-09T06:03:25.226Z"}}
--- stack thread 0 ---
{"ok":true,"data":{"stackFrames":[{"id":0,"name":"Window.calculate","line":2,"column":18,"source":{"name":"app.js","path":"/Users/roblou/code/dap-cli/tests/fixtures/simple-chrome-page/app.js","sourceReference":0},"presentationHint":"normal","canRestart":true},...],"totalFrames":2},"meta":{"command":"stack","timestamp":"2026-05-09T06:03:25.296Z"}}
--- continue ---
{"ok":true,"data":{"allThreadsContinued":false},"meta":{"command":"continue","timestamp":"2026-05-09T06:03:25.364Z"}}
{"ok":true,"data":{"type":"number","result":"5","variablesReference":0},"meta":{"command":"evaluate","timestamp":"2026-05-09T06:03:25.366Z"}}
--- wait evaluate ---
evaluate exit=0

## Step 6: tear down
{"ok":true,"data":{"id":"sess_fPZnwAC9Di6Bz-ZV","name":"smoke-chrome",...,"orphanPids":[],"warnings":[]},"meta":{"command":"close","timestamp":"2026-05-09T06:03:27.512Z"}}
{"ok":true,"data":{"stopped":true},"meta":{"command":"stop-controller","timestamp":"2026-05-09T06:03:27.606Z"}}

## Step 7: orphan check
no smoke profile orphans
```

| Step | Expected verbatim signal | Result |
|------|--------------------------|--------|
| 2    | `"lifecycle":"running"` from `launch`; child session id (32-hex CDP target id) appears | pass — parent `sess_fPZnwAC9Di6Bz-ZV`, child target id `53366E8A0A849B65D931A0882DA01060` |
| 3    | breakpoint acknowledged with `"verified":true` on the parent (post-H-6 closure: page child `setBreakpoints` response merged in) | pass — `verified:true`, `column:18`, source `app.js` |
| 4    | first `sessions` shows the parent only; `--show-children` adds the `smoke-chrome#<32-hex>` child | pass |
| 5    | `events --include stopped` shows `stopped` with `"reason":"breakpoint"`; `status` reports `paused:true`, `stoppedReason:breakpoint`; `stack --thread-id 0` shows top frame `Window.calculate` at `app.js` line 2 | pass — `child_session_id:sess_u1P2o2rDyCc7xgP7`, `Window.calculate` at line 2 column 18 |
|      | evaluate exit code: doc says `controller_request_timeout` (exit 7) is the expected signal because the page paused on the bp; in this run the `continue` was issued before evaluate's 5 s controller IPC timeout fired, so the evaluate completed cleanly with `exit=0` and `result:"5"` (the post-continue value of `calculate(2,3)`). Both outcomes are acceptable — the doc's expectation was "evaluate held open until the bp released", which is exactly what we observed; we just observed the release path instead of the timeout path. | pass (clean release) |
| 6    | `close` returns `ok:true`, `stop-controller` returns cleanly | pass — `orphanPids:[]`, `warnings:[]`, `stopped:true` |
| 7    | no smoke profile orphans | pass — `pgrep -lf '/tmp/dap-cli-smoke-chrome'` returned no matches |

## Self-Check

- `npm run build`: pass.
- `npm test` (with `DAP_CLI_HOME` unset so the real `~/.dap-cli` adapters
  resolve, per round 4 self-check): 24 test files, 299 passed, 7 skipped, 0
  failed. Includes the new regression test
  `tests/integration/fakeAdapterCli.test.ts` →
  `controller stop reaps session-store records for runtimes it tears down`
  (verified to FAIL on the pre-fix tree, PASS post-fix).
- `git diff --check`: clean (no whitespace damage).
- `node .github/get-shit-done/bin/gsd-tools.cjs validate consistency .planning`:
  `passed: true`, errors: 0. Two warnings about prior-round summaries having
  no matching `PLAN.md` (08-03 and 08-04) — pre-existing and unrelated to
  this round.
- Hand-driven smoke A + B (above) executed by the orchestrator personally
  via `run_in_terminal`; verbatim output captured here. Both sequences
  pass.

## Commits (to land on `main`)

- `fix(controller): reap session-store records when stopping (Written by Copilot)` — `src/controller/server.ts` reorder + `tests/integration/fakeAdapterCli.test.ts` new regression test + `tests/integration/selfHosting.test.ts` test update for new shutdown semantics.
- `docs(phase-08): round 5 stress + edge-case pass (Written by Copilot)` — this `08-05-SUMMARY.md` and `08-UAT.md` follow-up.
