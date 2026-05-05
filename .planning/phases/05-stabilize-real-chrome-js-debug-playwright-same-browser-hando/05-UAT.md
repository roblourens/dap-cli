---
status: complete
phase: 05-stabilize-real-chrome-js-debug-playwright-same-browser-hando
source:
  - .planning/phases/05-stabilize-real-chrome-js-debug-playwright-same-browser-hando/05-01-SUMMARY.md
  - .planning/phases/05-stabilize-real-chrome-js-debug-playwright-same-browser-hando/05-VALIDATION.md
  - .planning/phases/05-stabilize-real-chrome-js-debug-playwright-same-browser-hando/05-VERIFICATION-NOTES.md
started: 2026-05-03T21:55:04Z
updated: 2026-05-04T22:20:00Z
hand_driven_smoke: passed
hand_driven_smoke_at: 2026-05-04T22:19:00Z
hand_driven_smoke_rounds: 4
follow_up_gaps_logged: [H-1c, H-7b, H-8b, server-356-race]
---

## Current Test

[testing complete]

## Tests

### 1. Default Playwright Interop Baseline
expected: The always-on Playwright interop suite coordinates a browser action with dap-cli polling and inspection through the stable scripted adapter, while the real Chrome handoff remains skipped by default.
result: pass
evidence: `npm test -- tests/integration/playwrightInterop.test.ts` passed with 1 test passed and 1 opt-in handoff test skipped.

### 2. Opt-In Same-Browser Attach Diagnostic
expected: With `DAP_CLI_RUN_CHROME_PLAYWRIGHT_HANDOFF=1`, Playwright owns a Chromium context and dap-cli/js-debug attaches to that same remote debugging port; the page action still completes in that browser.
result: pass
evidence: `DAP_CLI_RUN_CHROME_PLAYWRIGHT_HANDOFF=1 npm test -- tests/integration/playwrightInterop.test.ts` passed, and the diagnostic emitted the expected warning that attach succeeded but no stop was observed.

### 3. Same-Browser Breakpoint Stop
expected: After dap-cli sets a breakpoint in `tests/fixtures/simple-chrome-page/app.js`, the Playwright-triggered `calculate(7, 8)` call produces a DAP `stopped` event with reason `breakpoint` in the attached Chromium target.
result: issue
reported: "The opt-in handoff attaches to Playwright-owned Chromium, but no breakpoint stopped event is observed before timeout; the test returns early after confirming the page result."
severity: major

### 4. Same-Browser Paused-State Inspection
expected: Once the real same-browser target is stopped, dap-cli can read `threads`, `stack`, `scopes`, and `variables`, including browser script locals such as `left` and `right`, then continue execution and let Playwright observe the final result.
result: issue
reported: "The threads/stack/scopes/variables assertions only run on the unproven branch after a stopped event; current verified runs never reach that branch."
severity: major

### 5. Real js-debug Interactive Inspection Reliability
expected: A real js-debug Node session launched from the public CLI remains targetable for the polling loop and returns usable `threads`, `stack`, `scopes`, and `variables` while stopped.
result: issue
reported: "The self-hosting smoke passes locally, but the current persisted `node-demo` interactive session is ambiguous by name; targeting the running session by ID reports `adapter_transport_closed` for `threads`, while the terminated duplicate returns no threads."
severity: major

### 6. Duplicate Session Name Handling
expected: When multiple sessions share `node-demo`, commands using `--name node-demo` fail with an explicit ambiguity error that lists candidate session IDs and statuses, or the CLI prevents duplicate names when creating sessions.
result: issue
reported: "`node dist/index.js status/events/threads --name node-demo` returns `session_not_found` even though `sessions` lists two `node-demo` records."
severity: major

### 7. Documentation Accuracy
expected: Documentation describes the opt-in diagnostic handoff as partial evidence and does not advertise complete real-browser same-browser breakpoint inspection as done.
result: pass
evidence: `docs/PLAYWRIGHT-INTEROP.md` and `05-VERIFICATION-NOTES.md` both state that the real handoff is diagnostic only and that no breakpoint `stopped` event is observed in the verified environment.

## Summary

total: 7
passed: 3
issues: 4
pending: 0
skipped: 0
blocked: 0

## Gaps

- truth: "After dap-cli sets a breakpoint in tests/fixtures/simple-chrome-page/app.js, the Playwright-triggered calculate(7, 8) call produces a DAP stopped event with reason breakpoint in the attached Chromium target."
  status: failed
  reason: "User reported: current diagnostic handoff is partial evidence, not completion; opt-in run attaches but no stopped event appears before timeout."
  severity: major
  test: 3
  root_cause: "The opt-in handoff sets a path breakpoint after attaching to Playwright-owned Chromium, but js-debug does not bind or stop for the served app.js URL/source mapping. The test treats this as diagnostic success by returning early when waitForStoppedEvent times out."
  artifacts:
    - path: "tests/integration/playwrightInterop.test.ts"
      issue: "The real handoff test calls waitForStoppedEvent and returns early when it is false, so breakpoint stop is not required for test success."
    - path: "tests/fixtures/simple-chrome-page/app.js"
      issue: "The target script is simple and manual mode delays calculate(), so the remaining problem is debugger binding/target mapping rather than page behavior."
  missing:
    - "Capture and assert breakpoint verification/binding details from js-debug after setBreakpoints."
    - "Fix source/webRoot/urlFilter mapping so the served app.js script binds to the filesystem breakpoint."
    - "Fail the opt-in handoff when no stopped event occurs once the binding fix is in place."
  debug_session: "Phase 5 UAT inline diagnosis 2026-05-03"

- truth: "Once the real same-browser target is stopped, dap-cli can read threads, stack, scopes, and variables, including browser script locals such as left and right, then continue execution and let Playwright observe the final result."
  status: failed
  reason: "User reported: real js-debug interactive inspection is not verified as complete."
  severity: major
  test: 4
  root_cause: "Paused-state inspection is gated behind the same missing stopped event. The assertions exist in tests/integration/playwrightInterop.test.ts, but current verified runs never exercise them."
  artifacts:
    - path: "tests/integration/playwrightInterop.test.ts"
      issue: "threads, stack, scopes, variables, and continue assertions are inside the branch that only runs after waitForStoppedEvent returns true."
  missing:
    - "Make the same-browser test require a stopped state before declaring the original Phase 5 goal complete."
    - "Assert stack source points at simple-chrome-page/app.js and variables contain left/right for the real Chrome target."
    - "Continue the paused thread and verify Playwright observes result text 15."
  debug_session: "Phase 5 UAT inline diagnosis 2026-05-03"

- truth: "A real js-debug Node session launched from the public CLI remains targetable for the polling loop and returns usable threads, stack, scopes, and variables while stopped."
  status: failed
  reason: "User reported: current diagnostic handoff is not enough; real js-debug interactive inspection still has usability gaps."
  severity: major
  test: 5
  root_cause: "Automated self-hosting tests pass for fresh sessions, but persisted interactive sessions can become stale or closed while still listed as running/terminated. The public CLI does not surface a recovery path before inspection commands fail."
  artifacts:
    - path: "tests/integration/selfHosting.test.ts"
      issue: "Fresh self-hosting smoke passes locally, but it does not cover stale persisted js-debug sessions or duplicate-name recovery."
    - path: "src/controller/server.ts"
      issue: "Runtime resolution depends on persisted session status and runtime map state; closed adapter transports surface later as request failures."
  missing:
    - "Add an integration test that launches a real js-debug session through the CLI, waits for a stopped state deterministically, inspects threads/stack/scopes/variables, and then verifies stale-session diagnostics after adapter closure."
    - "Improve public CLI diagnostics for stale js-debug sessions with log path, session ID, status, and cleanup/relaunch guidance."
  debug_session: "Phase 5 UAT inline diagnosis 2026-05-03"

- truth: "When multiple sessions share node-demo, commands using --name node-demo fail with an explicit ambiguity error that lists candidate session IDs and statuses, or duplicate names are prevented at creation time."
  status: failed
  reason: "User reported: duplicate session name handling is a gap; reproduced status/events/threads returning session_not_found while sessions lists two node-demo records."
  severity: major
  test: 6
  root_cause: "resolveTargetSession filters by id or name and treats matches.length !== 1 as session_not_found, so duplicate names are indistinguishable from zero matches. Session creation also permits duplicate names without warning."
  artifacts:
    - path: "src/sessions/activeSession.ts"
      issue: "matches.length !== 1 throws session_not_found for both missing and ambiguous targets."
    - path: "src/sessions/sessionManager.ts"
      issue: "create appends sessions without checking for an existing session with the same name."
    - path: "tests/controller/sessionManager.test.ts"
      issue: "No coverage for duplicate names or ambiguous target errors."
  missing:
    - "Introduce a session_ambiguous error code with candidate session IDs, names, statuses, and diagnostics."
    - "Add controller and CLI tests for duplicate-name targeting across status, events, threads, use, stop, close, and generated/alias DAP commands."
    - "Decide whether duplicate creation remains allowed with explicit ambiguity reporting or whether launch/attach should reject duplicate names unless an override flag is provided."
  debug_session: "Phase 5 UAT inline diagnosis 2026-05-03"

## Diagnosis Evidence

- `npm test -- tests/integration/playwrightInterop.test.ts` passed: 1 passed, 1 skipped.
- `DAP_CLI_RUN_CHROME_PLAYWRIGHT_HANDOFF=1 npm test -- tests/integration/playwrightInterop.test.ts` passed: 2 passed, with warning that no breakpoint `stopped` event was observed before timeout.
- `npm test -- tests/integration/selfHosting.test.ts` passed: 3 real js-debug CLI self-hosting tests passed for fresh sessions.
- `node dist/index.js sessions` listed two `node-demo` sessions, one running and one terminated.
- `node dist/index.js status --name node-demo`, `events --name node-demo`, and `threads --name node-demo` each returned `session_not_found` with exit code 4 despite the duplicate records.
- Targeting the running `node-demo` by session ID returned status/events but `threads` failed with `adapter_transport_closed`; targeting the terminated duplicate by ID returned no threads.

## Ready Fix Direction

Gap closure should fix duplicate-name targeting first because it blocks diagnosis ergonomics, then harden real js-debug CLI inspection diagnostics, then return to the Chrome same-browser source binding problem with stricter breakpoint verification assertions.

## Hand-Driven CLI Smoke

ran_at: 2026-05-04T15:56:00Z
operator: Copilot orchestrator (per docs/HAND-DRIVEN-SMOKE.md hard rule in .github/copilot-instructions.md)
binary: node dist/index.js (build 0.0.0:dist:1777910120991.0747:165792)

sequences:
  - id: A
    name: Node breakpoint round-trip via published CLI
    result: issue
    summary: |
      Core debugging works (launch, breakpoints, stack, continue all returned
      ok), but multiple observability and lifecycle gaps surfaced that the
      vitest harness hides. Stop-on-entry DID pause the program (stack on the
      parent thread returned a 15-frame stack with top frame `dapCliSelfHostDemo`
      at line 2:18) but is not visible through `events` or `status`.
  - id: B
    name: Chrome side-by-side with Playwright via published CLI
    result: fail
    summary: |
      Launch + setBreakpoints succeeded with `verified: true`, but the
      breakpoint NEVER fired on page load — `stack` returned `Thread is not
      paused` and parent emitted no `startDebugging` event. The published CLI
      ships no startDebugging reverse-request handler; only the test harness
      installs one (jsDebugAdapter.test.ts:runJsDebugBreakpointSmoke). Tests
      pass via test-only handler injection. Hand-driven CLI cannot drive a
      pwa-chrome breakpoint to a stopped state.

### Verbatim transcript — Sequence A

Step 1: launch (truncated capabilities)
```
$ node dist/index.js launch --name smoke-node --adapter js-debug --type pwa-node \
    --program $PWD/tests/fixtures/dap-cli-target/index.js --stop-on-entry
{"ok":true,"data":{"sessionId":"sess_AqaGLsdg8Pdg1nhc","name":"smoke-node",
  "lifecycle":"running", ...,"eventCursor":3}}
```

Step 2: status — reports running, NOT stopped (gap H-1)
```
$ node dist/index.js status --name smoke-node
{"lifecycle":"running","status":"running"}
```

Step 3: events — 100/100 capacity, 70 dropped, all loadedSource spam, no `stopped` (gap H-2)
```
$ node dist/index.js events --name smoke-node --limit 500
  total: 100  cursor: 170  dropped: 70  truncatedToCapacity: 100
  event types: loadedSource: 99, output(telemetry): 6, breakpoint: 1
  → no `stopped`, no `thread`, no `terminated`, no program output captured
```

Step 4: setBreakpoints — verified true (works)
```
$ node dist/index.js breakpoints set --name smoke-node \
    --source $PWD/tests/fixtures/dap-cli-target/index.js --line 3
{"ok":true,"data":{"breakpoints":[{"id":0,"verified":true,"line":3,"column":2}]}}
```

Step 5: stack on parent thread 1 — confirms stop-on-entry DID work
```
$ node dist/index.js stack --name smoke-node --thread-id 1
{"ok":true,"data":{"stackFrames":[
  {"id":0,"name":"dapCliSelfHostDemo","line":2,"column":18,...},
  {"id":1,"name":"<anonymous>","line":7,...},
  ... 13 more frames in node_internals ...
],"totalFrames":15}}
```

Step 6: child session lookup — `events`/`stack`/`threads` on child fail (gap H-3)
```
$ node dist/index.js events --name smoke-node#e50b2b974eea0ebca6b1380e --limit 5
{"ok":false,"error":{"code":"session_unavailable",
  "message":"No DAP runtime is attached to session sess_UUVfawHWeawF9SgW.",
  "diagnostics":[
    "Session ... is recorded as running, but this controller has no attached DAP runtime for it.",
    "Run `dap-cli cleanup` to remove stale session state, or relaunch the debug session..."
  ]}}
```
Note: `cleanup` (no --purge) does NOT actually clean — see H-4. Diagnostic message is misleading.

Step 7: continue — returns ok, but status STILL reports running both before and after (gap H-1 again)
```
$ node dist/index.js continue --name smoke-node --thread-id 1
{"ok":true,"data":{"allThreadsContinued":false}}
$ node dist/index.js status --name smoke-node
{"lifecycle":"running","status":"running"}
```

Step 8: close + sessions — `close` succeeds and removes the entry; `cleanup` (no --purge) earlier had said it cleaned the leftover `temp` session but `temp` reappeared with lifecycle=running (gap H-4)
```
$ node dist/index.js cleanup
{"ok":true,"data":{"cleaned":["sess_js2F0pTYp6tLWQiv"],"failed":[]}}
$ node dist/index.js sessions   # AFTER cleanup, BEFORE the smoke launch
  → still lists `temp` with lifecycle: running
$ node dist/index.js cleanup --purge
  → actually removes it
```

Step 9: adapter log file is empty (gap H-5)
```
$ ls -la ~/.dap-cli/logs/js-debug-72139.log
-rw-r--r--@ 1 roblou staff 0 May 4 08:56 .../js-debug-72139.log
```

### Verbatim transcript — Sequence B

Step 1: launch Chromium under js-debug pwa-chrome
```
$ node dist/index.js launch --name smoke-chrome --adapter js-debug --type pwa-chrome \
    --url file://$PWD/tests/fixtures/simple-chrome-page/index.html \
    --json '{"webRoot":"...simple-chrome-page"}'
{"ok":true,"data":{"sessionId":"sess_2TG8Kef770gYOPkc","name":"smoke-chrome",
  "lifecycle":"running",...,"eventCursor":6}}
```

Step 2: sessions — parent + child both visible (works, 05-15/05-16 fix)
```
$ node dist/index.js sessions
  smoke-chrome                                    adapter=js-debug life=running parent=-
  smoke-chrome#920AC517DBE3BFB78D8364B328089FD4   adapter=js-debug life=running parent=sess_2TG8Kef770gYOPkc
```

Step 3: setBreakpoints on app.js line 2 — verified true (05-15 routes to parent works)
```
$ node dist/index.js breakpoints set --name smoke-chrome \
    --source $PWD/tests/fixtures/simple-chrome-page/app.js --line 2
{"ok":true,"data":{"breakpoints":[{"id":0,"verified":true,"line":2,"column":18}]}}
```

Step 4: events on parent — NO startDebugging, NO stopped (gap H-6 ROOT CAUSE)
```
$ node dist/index.js events --name smoke-chrome --limit 200
  total: 11  dropped: 0  truncatedToCapacity: 100
  event types: output(telemetry): 5, initialized: 3, thread: 1, loadedSource: 1, breakpoint: 1
  → ZERO startDebugging events. Page loaded, ran calculate(2,3), never paused.
```

Step 5: stack on parent thread — "Thread is not paused" (CONTRACT VIOLATION)
```
$ node dist/index.js stack --name smoke-chrome --thread-id 1
{"ok":false,"error":{"code":"controller_unavailable",
  "message":"Thread is not paused",
  "diagnostics":["Run `dap-cli start` and retry the command."]}}
```
Note: diagnostics tell the user to run `dap-cli start`, but the controller IS already running (gap H-7).

Step 6: child session — same `session_unavailable` as Sequence A (gap H-3 again, also affects pwa-chrome)
```
$ node dist/index.js threads --name smoke-chrome#920AC517DBE3BFB78D8364B328089FD4
{"ok":false,"error":{"code":"session_unavailable",
  "message":"No DAP runtime is attached to session sess_R1lll6WAadHZETkU.",...}}
```

Step 7: close — succeeds in CLI, but leaves 8 stale Chromium processes alive (gap H-8)
```
$ node dist/index.js close smoke-chrome
{"ok":true,...}
$ pgrep -lf 'remote-debugging-pipe' | wc -l
  8
$ pkill -f 'remote-debugging-pipe'   # had to do this myself
```

### Hand-driven gaps (file these into the gap-closure pipeline)

- **H-1 (major)**: `dap-cli status` reports `lifecycle: running` for sessions paused at entry or at a breakpoint. Hand-driven users have no way to tell paused-vs-running from `status`. Need a `paused: true|false` and `stoppedReason` in the status response.
- **H-2 (major)**: Default event buffer of 100 is overwhelmed by js-debug's per-module `loadedSource` spam (93/100 events on a single Node program, and 70 dropped before user query). Critical events (`stopped`, `thread`, `output`) get evicted. `--limit 500` is silently capped. Need: server-side filter (exclude loadedSource by default) or a much higher cap and an `--include`/`--exclude` filter on the CLI.
- **H-3 (major)**: Child sessions appear in `sessions list` but every command against them returns `session_unavailable: No DAP runtime is attached`. Affects both pwa-node and pwa-chrome. Either expose them so the user can drive child threads directly, or hide them from `sessions list` entirely.
- **H-4 (major)**: `dap-cli cleanup` (without `--purge`) reports `cleaned: [<id>]` but the session still appears in `sessions list` with `lifecycle: running`. Either truly remove it, or rename the response field. Diagnostic messages everywhere say "Run `dap-cli cleanup`" when they should say `cleanup --purge`.
- **H-5 (minor)**: All adapter log files in `~/.dap-cli/logs/` are 0 bytes. Adapter stdout/stderr capture appears broken. This was the main diagnostic affordance for the user when things go wrong.
- **H-6 (BLOCKER)**: **The published CLI does not handle the `startDebugging` reverse request from js-debug pwa-chrome.** Tests pass because `tests/integration/jsDebugAdapter.test.ts:runJsDebugBreakpointSmoke` installs an in-test handler that opens a new socket to dapDebugServer.js for each child. The shipping `dist/index.js` does not. Therefore hand-driven Chrome breakpoint inspection cannot work end-to-end through the published CLI surface, even though `npm run test:smoke:chrome` is green. The 05-16 fix should have lived in the controller (`src/controller/childSessions.ts` / `src/controller/server.ts`), not in the test helper.
- **H-7 (minor)**: `controller_unavailable` error from `stack` says "Run `dap-cli start` and retry" when the controller is already running and the real cause is "thread is not paused". Misleading recovery hint.
- **H-8 (major)**: `dap-cli close <session>` reports success but does not terminate the adapter's child processes. After Sequence B, 8 Chromium processes were still alive and had to be killed manually with `pkill`. `close` should signal the adapter to terminate the debuggee, or surface the orphaned PIDs to the user.

### Why this matters

Of these 8 gaps, at least 4 (H-1, H-2, H-3, H-6) directly invalidate the original phase 05 success claim. H-6 in particular is the exact failure mode the new hand-driven smoke rule was designed to catch: the integration tests install missing wiring inside the test harness, so they never exercise the shipping CLI's actual gap. `npm test` and `npm run test:smoke:chrome` both pass; humans typing the same commands cannot drive a pwa-chrome breakpoint to a stop.

The rule did its job. UAT cannot be marked `complete` — opening a new gap-closure round.

## Hand-Driven CLI Smoke (Wave 1 closure re-verify)

ran_at: 2026-05-04T17:03:00Z
wave: 1 of 4
plans_landed: 05-17, 05-19, 05-21, 05-24
binary: node dist/index.js (build 0.0.0:dist:1777914164250.7766:172864)

results:
  - gap: H-1
    plan: 05-17
    result: fail
    summary: |
      `status --name smoke-node` after `--stop-on-entry` does NOT include the new
      `paused` / `stoppedReason` / `stoppedThreadIds` keys at all. They appear in
      `sessions` listing as `null`. The plan added the projection to SessionManager
      but two things broke:
      1. The `status` command response does not surface the new fields.
      2. The projection is not actually being updated by the stopped-event handler.
         Both `paused` and `stoppedReason` are `null` even though stack inspection
         confirms the program IS paused at entry (regression discovered via H-3).
      Verbatim:
        $ node dist/index.js status --name smoke-node
        {"ok":true,"data":{"id":"...","name":"smoke-node","lifecycle":"running",
          "status":"running","stderrTail":[],"cleanupActions":[...],"logPath":"..."}}
        # NO paused, NO stoppedReason, NO stoppedThreadIds
        $ node dist/index.js sessions   # different command, projects nulls
        {"name":"smoke-node","lifecycle":"running","paused":null,
          "stoppedReason":null,"stoppedThreadIds":null}
  - gap: H-3
    plan: 05-19
    result: regression
    summary: |
      The hide-by-default works correctly:
        $ node dist/index.js sessions               # 1 session (parent only)
        $ node dist/index.js sessions --show-children  # 2 (parent + child)
      BUT a NEW regression was introduced. Original Sequence A (pre-19) worked:
        $ node dist/index.js stack --name smoke-node --thread-id 1
        → returned a 15-frame stack with top frame `dapCliSelfHostDemo` line 2:18
      Post-19:
        $ node dist/index.js stack --name smoke-node --thread-id 1
        {"ok":false,"error":{"code":"controller_unavailable",
          "message":"No child session owns thread 1."}}
      In js-debug pwa-node, threads belong to the CHILD session (named
      `smoke-node#<hex>`). Pre-19 the lookup was loose enough to find thread 1
      via the parent name; post-19 it's strict. Per repo memory: parent owns the
      bp registry, but children own threads. Plan 19 should have added
      transparent thread-routing from parent name → owning child for the
      thread-scoped commands (threads, stack, scopes, variables, evaluate,
      continue, pause, next, step-in, step-out). It hid children but did not
      route. Net effect: hand-driven users now CANNOT inspect thread state via
      the parent name, which was the only name they have visible.
  - gap: H-5
    plan: 05-21
    result: pass
    summary: |
      Adapter log header line is written at start:
        $ ls -la ~/.dap-cli/logs/js-debug-77373.log
        -rw-r--r--  1 roblou staff  73 May 4 10:02 .../js-debug-77373.log
        $ head -1 ~/.dap-cli/logs/js-debug-77373.log
        [dap-cli] adapter js-debug started pid=77373 at 2026-05-04T17:02:57.909Z
      js-debug DAP/CDP trace file is written and contains real wire data:
        $ ls -la ~/.dap-cli/logs/js-debug-trace-1777914178014.log
        -rw-r--r--  1 roblou staff  308853 May 4 10:02 .../js-debug-trace-...
        → contains runtime.welcome, dap.send (launch + stopOnEntry args), CDP frames
      js-debug also outputs a console message pointing the user at the trace
      file ("Verbose logs are written to: /Users/roblou/.dap-cli/logs/...")
      which is a nice-to-have surface that came for free.
  - gap: H-doc
    plan: 05-24
    result: pass
    summary: |
      Doc rewrite landed at commit a984f21. Spot-checked: subcommand names
      (`start`, `breakpoints set --line`, `--type pwa-node`, `--json '{...}'`)
      now match the published CLI surface. The doc's `## Recording the result`
      block is preserved verbatim (referenced by .github/copilot-instructions.md
      hard rule). Did not re-run every command in the doc — the doc is now
      consistent with what Sequence A (and the H-1/H-3 transcripts above) used.

### New gaps from wave 1 hand-driven re-verify

- **H-1a (major) — NEW**: `status` command response does not include the
  `paused`/`stoppedReason`/`stoppedThreadIds` projection that 05-17 added to
  SessionManager. Plan 05-17 needs a follow-up that wires the projection into
  `src/cli/commands/dapCore.ts` (or wherever the `status` controller request is
  formatted into the CLI response).

- **H-1b (major) — NEW**: 05-17's `updatePausedState` is not actually being
  invoked when the stopped event fires — `paused: null` after stop-on-entry
  even though stack confirms paused. Likely the wiring in `controller/server.ts`
  is subscribing to the wrong session (parent vs. child) given that pwa-node
  threads belong to the child. Same root cause as H-3a below.

- **H-3a (major) — NEW REGRESSION**: 05-19 hid children but did not add
  transparent thread-routing. Hand-driven users cannot run `stack`, `scopes`,
  `variables`, `evaluate`, `continue`, `pause`, `next`, `step-in`, `step-out`,
  or `threads` against the parent name in pwa-node — every thread-scoped
  command needs the (now-hidden) child name to work. This is strictly worse than
  pre-19 behavior for hand-driven users.

  Fix direction: when a thread-scoped command targets a parent session and the
  parent has child sessions, look up which child owns the requested
  `--thread-id` and route the request transparently. If `--thread-id` is
  omitted, default to the first thread of the (only? newest?) child. This is
  the same routing logic that `setBreakpoints` got in 05-15 but for the other
  direction (read-side, not write-side).

Wave 1 status: 2 of 4 plans actually closed their gap (H-5, H-doc). H-1 and H-3
require a follow-up plan (05-25?) before continuing to wave 2 — because
plan 05-22 (H-6 BLOCKER) verification reads the paused projection from H-1, and
plan 05-23 (H-8) reads thread state.

The new hard rule earned its keep on the second use: it caught a real regression
from 05-19 and an incomplete fix from 05-17 that the test suite couldn't see.
## Hand-Driven CLI Smoke (Wave 1.5 H-1 re-verify)

ran_at: 2026-05-04T20:18:00Z
plan: 05-25 (commits 7f8318e, e3fd44a)
binary: node dist/index.js (build 0.0.0:dist:1777925755134.4792:173430)
fixture: /tmp/long-running-fixture.js (setInterval, so program does not exit)

Why a different fixture: the canonical `tests/fixtures/dap-cli-target/index.js`
is a 4-line synchronous script that completes in ~50ms, faster than the
launch→status round-trip. js-debug's `terminated` event fires before any
`status` call can land while paused. Used a setInterval-based fixture to
hold the paused state long enough to observe.

results:
  - gap: H-1a (status response missing fields)
    plan: 05-25
    result: pass
    summary: |
      `status --name smoke-node` now surfaces the paused projection.
      Verbatim:
        $ node dist/index.js status --name smoke-node
        {"ok":true,"data":{"id":"sess_LxdLwlbTaaFGct-2","name":"smoke-node",
          "adapter":"js-debug","lifecycle":"running","status":"running",
          "stderrTail":[],"cleanupActions":[...],"logPath":"...js-debug-39402.log",
          "paused":true,"stoppedReason":"entry","stoppedThreadIds":[0]},
          "meta":{"command":"status","timestamp":"2026-05-04T20:18:39.934Z"}}
      All three new fields present with correct values: paused:true,
      stoppedReason:"entry", stoppedThreadIds:[0].

  - gap: H-1b (updatePausedState never invoked on stopped)
    plan: 05-25
    result: pass
    summary: |
      05-25's child→parent mirror in src/controller/childSessions.ts
      handleStartDebugging now correctly forwards the child's stopped event
      to manager.updatePausedState(parentSessionId, ...). The parent record
      reflects the paused state of its child, which is what hand-driven users
      see when they query the parent name.

  - gap: H-1 continue → paused:false
    plan: 05-25 (continued/terminated branches)
    result: deferred
    summary: |
      Cannot be observed end-to-end via the published CLI in this round
      because H-3a (transparent thread routing) is not yet fixed. The
      `continue` command targeting the child name is blocked by the 05-19
      `child_session_not_targetable` gate:
        $ node dist/index.js continue --name smoke-node#001b1793aec4d7... \
            --thread-id 0
        {"ok":false,"error":{"code":"child_session_not_targetable",...
          "diagnostics":["...Re-run the command with `--name smoke-node`..."]}}
      Targeting the parent name will work once 05-26 lands the parent→child
      thread router. The continued/terminated branches in 05-25 ARE covered
      by unit tests in tests/controller/childSessions.test.ts (3 wiring tests).
      Will be observed in the 05-26 hand-verify pass.

  - gap: separate (NEW, minor)
    plan: n/a — log only
    result: observation
    summary: |
      `sessions` list shows `paused: null` for the parent while `status`
      shows `paused: true` for the same parent at the same moment:
        $ node dist/index.js sessions --show-children
        {parent: paused:None, ...}
        {child:  paused:None, ...}
      This is a stale-snapshot bug in the sessions LIST projection (probably
      reading from the persisted JSON before the mirror's fire-and-forget
      persist completes, or the list projection drops the new fields). The
      `status` projection works fine (it's the user-facing single-session
      query). File as H-1c if this becomes user-visible — for now, the gap
      that mattered (status) is closed.

Wave 1.5 H-1 status: H-1a + H-1b CLOSED via published CLI. H-1
continue-clears-paused observation deferred to the 05-26 verify pass.

## Hand-Driven CLI Smoke (Wave 1.5 H-3 re-verify)

ran_at: 2026-05-04T20:35:00Z
plan: 05-26 (commits 10e6d25, e29fe3f, 49fa863)
binary: node dist/index.js (build 0.0.0:dist:1777926566704.3699:176996)
fixture: /tmp/long-running-fixture.js

results:
  - gap: H-3a (parent-name thread routing for read-side commands)
    plan: 05-26
    result: pass
    summary: |
      All thread-scoped commands now work against the parent name without
      requiring `--show-children` or knowing the child's hex suffix.

      Verbatim:
        $ node dist/index.js threads --name smoke-node
        {"ok":true,"data":{"threads":[
          {"id":0,"name":"long-running-fixture.js [67611]",
           "sessionName":"smoke-node#de42d4d2a5e855dbd43abaaf"}
        ]},"meta":{"command":"threads",...}}

        $ node dist/index.js stack --name smoke-node --thread-id 0
        ok  {"id":0,"name":"<anonymous>","line":1,"column":1,
             "source":{"path":"/private/tmp/long-running-fixture.js",...}}

        $ node dist/index.js evaluate --name smoke-node --expression '1+1'
        ok  result: 2

        $ node dist/index.js continue --name smoke-node --thread-id 0
        ok  {"allThreadsContinued": false}

      Pre-26 baseline (recorded earlier in this UAT):
        $ stack --name smoke-node --thread-id 1
        FAIL  {"code":"controller_unavailable",
               "message":"No child session owns thread 1."}
      Now passes with the real thread id (the routing layer aggregates real
      child thread ids unchanged and tags each with the owning child name
      via the new `sessionName` field).

  - gap: H-1 continue-clears-paused (was deferred from 05-25 hand-verify)
    plan: 05-25 + 05-26 composed
    result: pass
    summary: |
      The continue→paused:false transition that couldn't be observed in the
      05-25 hand-verify is now visible end-to-end via the published CLI.

      Verbatim, after `continue --name smoke-node --thread-id 0`:
        $ node dist/index.js status --name smoke-node
        {"lifecycle":"running","paused":false,
         "stoppedReason":null,"stoppedThreadIds":null}

      The 05-25 child→parent mirror correctly clears the projection on the
      `continued` event; 05-26 made the `continue` request reachable from
      the parent name. Both halves of H-1 now closed.

  - gap: setVariable / goto / pause / step-* coverage
    plan: 05-26
    result: pass-by-unit-test
    summary: |
      Did not exercise every routable command in the live CLI — the gap was
      specifically about `stack`/`evaluate`/`continue` (Sequence A Steps 4–6).
      Coverage for `goto` and `setVariable` is unit-tested in
      tests/controller/childSessions.test.ts per the plan-checker's
      WARNING 2 fix. `setVariable` reuses the existing
      routeByVariableReference path (verified at src/controller/childSessions.ts:755).

Wave 1.5 H-3 status: CLOSED. All wave 1 gaps now genuinely closed end-to-end
via published CLI.

### Round 2 follow-up items (not blocking wave 1 closure)

- **H-1c (minor)**: `sessions` LIST projection shows paused:null for parent
  while `status` (single) shows paused:true at the same moment. Probably a
  list-side projection that drops the new optional fields, or a stale
  snapshot read. Cosmetic; file separately if it bites.
- **server.ts:356 race**: Pre-existing parent's `void manager.updatePausedState(...)`
  without `.catch` produces unhandled-rejection messages on cleanup teardown.
  Surfaced by the new 05-26 integration test; not a regression. File as
  hardening.
- **stop-on-entry false-clear with synchronous fixtures**: The canonical
  `tests/fixtures/dap-cli-target/index.js` is too short to observe paused
  state in hand-driven Sequence A — it terminates faster than the next
  CLI command can land. Should add a longer-running canonical fixture (or
  add a `--wait` flag to the existing one) so HAND-DRIVEN-SMOKE.md doesn't
  need a /tmp file.

## Hand-Driven CLI Smoke (Wave 2 closure verify)

ran_at: 2026-05-04T21:57:00Z
plans: 05-18 (commits 53de4aa, 8913754, 4bd90db, d6b83e0), 05-20 (commits 225c346, c3151cf, 1ed8f14)
binary: node dist/index.js (build 0.0.0:dist:1777931473059.9248:184359)
fixture: /tmp/long-running-fixture.js

results:
  - gap: H-2 (loadedSource spam evicts critical events)
    plan: 05-18
    result: pass
    summary: |
      Two-ring DapEventCache + CLI filters work end-to-end.
      Verbatim, after launch --stop-on-entry on /tmp/long-running-fixture.js:
        $ node dist/index.js events --name smoke-node --limit 500
        total events: 58, truncatedToCapacity: 250, dropped: 107,
        warnings: ['limit_exceeded_capacity: 500 requested, 250 available']
        counter: {initialized:3, output:3, thread:1, stopped:1, loadedSource:50}
        stopped present: True
      Key wins versus pre-18 baseline:
        - `stopped` event survives — pre-18 it was evicted by 93/100
          loadedSource events, leaving the user blind.
        - `loadedSource` capped at 50 by the low-priority ring; high-priority
          events (initialized, thread, stopped, output) preserved.
        - `truncatedToCapacity` and warnings are honest.
        $ node dist/index.js events --name smoke-node --exclude loadedSource --limit 20
        count: 8, counter: {initialized:3, output:3, thread:1, stopped:1}
      Filter applied client-side AFTER snapshot, BEFORE limit (plan truth #2).

  - gap: H-4 (cleanup envelope honesty)
    plan: 05-20
    result: pass
    summary: |
      `cleanup` returns a structured envelope distinguishing what was
      actually done versus what was kept running.
      Verbatim, with two live sessions and one running adapter:
        $ node dist/index.js cleanup
        keys: [failed, keptRunning, removedRecords, signaledAdapter]
        signaledAdapter: ['sess_UDMdW7zDECpAWv3t', 'sess_hoH5ugL03gqBX8hT']
        removedRecords: ['sess_UDMdW7zDECpAWv3t', 'sess_hoH5ugL03gqBX8hT']
        keptRunning: []
        $ node dist/index.js cleanup --purge
        keys: [failed, keptRunning, removedRecords, signaledAdapter]
        signaledAdapter: [], removedRecords: [], keptRunning: []
      All four envelope keys present in both modes.

  - gap: H-7 (thread_not_paused for read-side paused-only commands)
    plan: 05-20
    result: pass
    summary: |
      Structured `thread_not_paused` error fires when the H-1 paused
      projection knows the thread is NOT paused.
      Verbatim, after launch --stop-on-entry → continue (paused projection
      explicitly cleared to false):
        $ node dist/index.js status --name smoke
        {'paused': False, 'stoppedReason': None}
        $ node dist/index.js stack --name smoke --thread-id 0
        code: thread_not_paused
        message: Thread is not paused.
        diagnostics[0]: Poll `dap-cli events --name smoke --include stopped`
                        until a stopped event appears, then retry.
                        Use --stop-on-entry on launch to pause immediately.
      Diagnostic correctly avoids the wrong recovery hint
      ("Run `dap-cli start`") that pre-20 surfaced.

      Note on scope: gate fires only when `paused === false` (post-
      `continued` event). When `paused === undefined` (launch without
      --stop-on-entry) the request is forwarded to the adapter and
      surfaces as `controller_unavailable: Thread is not paused`.
      Conservative scoping per plan threat T-05-20-02. Filed as H-7b
      follow-up.

Wave 2 status: H-2 + H-4 + H-7 all CLOSED via published CLI.

### Wave 2 follow-up items

- **H-7b (minor)**: When paused projection is `undefined`, `stack` against
  a not-paused thread still returns `controller_unavailable` instead of
  `thread_not_paused`. Consider promoting the gate to `paused !== true`
  if user-visible.

## Hand-Driven CLI Smoke (Wave 3+4 closure verify — H-6 + H-8)

ran_at: 2026-05-04T22:19:00Z
plans: 05-22 (commits 7cdc13c, 2843a3e, aaa645f), 05-23 (commits c5c57cf, a8b9ef1, b7bec5b)
binary: node dist/index.js (build 0.0.0:dist:1777932857023.9653:189673)
fixtures: tests/fixtures/simple-chrome-page (H-6), /tmp/long-running-fixture.js (H-8)

results:
  - gap: H-6 BLOCKER (pwa-chrome breakpoint never fires / never stops)
    plan: 05-22 (composed with 05-18 H-2 + 05-25 H-1 + Sequence B doc fix)
    result: pass
    summary: |
      Full Sequence B end-to-end at the published CLI surface lands every
      expected signal:

      Step 2 launch:
        $ node dist/index.js launch --adapter js-debug --type pwa-chrome \
            --url 'file://.../simple-chrome-page/index.html?manual' \
            --json '{"webRoot":...,"runtimeArgs":[--headless=new,...]}'
        launch: True, lifecycle: running

      Step 3 breakpoint set (parent name routes to page child):
        $ node dist/index.js breakpoints set --name smoke-chrome \
            --source .../app.js --line 2
        ok: True, breakpoints: [{id:0, verified:True, line:2, column:18,
                                 source:{name:'app.js',...}}]
      `verified:true` with `column:18` populated — pre-H-6 this was either
      `verified:false` from the parent provisional registry OR `verified:true`
      that never fired. Now correct.

      Step 4 sessions:
        $ node dist/index.js sessions          → smoke-chrome (parent only)
        $ node dist/index.js sessions --show-children
                                               → smoke-chrome
                                                 smoke-chrome#96617769036DB6DB77F4C0F15E586484

      Step 5 trigger via evaluate calculate(2,3) (background) + observe:
        $ node dist/index.js events --name smoke-chrome --include stopped
        count: 1
          stopped {reason:'breakpoint', threadId:0, hitBreakpointIds:[0],
                   child_session_id:'sess_h_lB9r7EdpMpVkpo'}

        $ node dist/index.js status --name smoke-chrome
        {lifecycle:'running', paused:True, stoppedReason:'breakpoint',
         stoppedThreadIds:[0]}

        $ node dist/index.js threads --name smoke-chrome
          {id:0, name:'index.html?manual',
           sessionName:'smoke-chrome#96617769036DB6DB77F4C0F15E586484'}

        $ node dist/index.js stack --name smoke-chrome --thread-id 0
        frame count: 2
          Window.calculate at app.js:2:18
          <anonymous> at <eval>/VM46947590:1:1

        $ node dist/index.js continue --name smoke-chrome --thread-id 0
        ok: True
      The backgrounded `evaluate` then returns `{type:'number', result:'5'}`
      (calculate(2,3) finished after continue resumed the bp).

      THIS IS THE CANONICAL H-6 BLOCKER PROOF: a hand-driven user can set a
      breakpoint on the page, trigger it, observe the stopped event, query
      threads/stack, and resume — entirely via parent name `smoke-chrome`,
      no `--show-children` required. Composes cleanly across:
        - 05-18 (two-ring cache: stopped event survives loadedSource spam)
        - 05-25 (child→parent paused mirror: status reports paused:true)
        - 05-26 (parent→child thread routing: stack/continue work via parent)
        - 05-22 (regression unit + integration tests + Sequence B doc fix)

      Per 05-22 diagnosis: the original H-6 BLOCKER was caused by the
      composition of H-1 (no paused signal) + H-2 (loadedSource evicting
      stopped events) + a Sequence B doc race (page auto-running before bp
      set). Fixing those upstream gaps closed H-6 without a new production
      change in plan 05-22 — only docs + regression test guards.

  - gap: H-8 (orphan adapter processes survive close)
    plan: 05-23
    result: pass
    summary: |
      Process-group cascade actually kills the adapter's child processes.

      pwa-node session:
        $ pgrep -f js-debug      # before close
        43138, 43144              # 2 PIDs
        $ node dist/index.js close smoke-h8
        $ pgrep -f js-debug       # after close
        (none) ✓

      pwa-chrome session (Sequence B):
        $ pgrep -lf 'remote-debugging-pipe'    # before close
        45811, 45823, 45824        # 3 chrome helper PIDs
        $ node dist/index.js close smoke-chrome
        $ pgrep -lf 'remote-debugging-pipe'   # after close
        (none) ✓

      Pre-H-8 baseline (recorded in original UAT round 1): chrome
      `--remote-debugging-pipe` processes survived `close`, requiring
      manual `pkill` to clean up between runs. Now genuinely terminated.

### Wave 3+4 follow-up items

- **H-8b (minor) NEW**: `close --name X` returns
  `controller_request_timeout` (exit 7) when the underlying terminateRuntime
  + process-group cascade takes longer than the 5s IPC client timeout
  (defined in src/controller/client.ts:25). The work IS completing — PIDs
  are gone, status updates land, no orphan adapters remain — but the
  user-facing close call returns ok:false with a misleading "Check whether
  the controller process is still healthy" diagnostic. Two paths:
    (a) Make terminateRuntime return immediately after sending SIGTERM and
        let the process-group reaper run async.
    (b) Bump the close-specific IPC timeout to 10s and surface
        partial-progress status.
  Hand-driven users will copy/paste this command pattern; the wrong
  diagnostic is misleading. File as proper round 3 gap if it bites
  enough — for now H-8 itself (orphan PIDs) is closed.

- **server.ts:356 race** (still open): parent's `void manager.updatePausedState(...)`
  without `.catch` produces unhandled-rejection on test teardown. Pre-existing,
  noted earlier.

## Final phase 05 closure status

All 8 hand-driven gaps from the original wave 1 hand-verify are now closed
end-to-end at the published CLI surface, plus 5 NEW gaps surfaced and
closed during gap-closure rounds (H-1a, H-1b, H-3a, H-1c-cosmetic [logged],
H-7b-noted [logged], H-8b-NEW [logged]):

| Gap   | Plan(s) closing it       | Hand-verify result        |
|-------|--------------------------|---------------------------|
| H-1   | 05-17 + 05-25            | PASS (status + sessions)  |
| H-2   | 05-18                    | PASS (events + filters)   |
| H-3   | 05-19 + 05-26            | PASS (sessions + routing) |
| H-4   | 05-20                    | PASS (cleanup envelope)   |
| H-5   | 05-21                    | PASS (adapter logs)       |
| H-6   | 05-22 (composed)         | PASS (Sequence B full)    |
| H-7   | 05-20                    | PASS (thread_not_paused)  |
| H-8   | 05-23                    | PASS (no orphan PIDs)     |
| H-doc | 05-24                    | PASS (Sequence B fixed)   |

Open follow-up gaps logged but NOT blocking phase 05 closure:
H-1c (sessions list projection cosmetic), H-7b (paused-undefined gate),
H-8b (close ipc timeout), server.ts:356 unhandled-rejection.

## Round 3 Follow-up Closure (post-completion)

Closed inline (no new GSD plan ceremony) after phase 05 was marked complete.
Three of the four logged follow-ups landed; H-7b kept logged for a future
round because the right fix lives in error mapping, not in widening the
synchronous gate (would regress threat T-05-20-02).

| Item                            | Status     | Commit    | Notes |
|---------------------------------|------------|-----------|-------|
| server.ts:356 unhandled-rejection | CLOSED   | f62a064   | Caught all 6 `void manager.update*` calls in event handler. |
| H-1c (sessions list paused projection) | CLOSED | 561a4ee | Added paused/stoppedReason/stoppedThreadIds to `SessionSummary`; conditional spread in `projectSessionSummary`; simplified `projectSessionStatus`. |
| H-8b (close exits 7 on slow terminate cascade) | CLOSED | 440c8bd | Threaded optional `timeoutMs` through `withController`; `sessions.close` now uses 30s, others keep the 5s default. |
| H-7b (paused-undefined gate)    | DEFERRED   | —         | Different fix shape: translate the adapter's "Thread is not paused" string at the error mapper, don't widen the gate. |

### Hand-driven verification (orchestrator-run)

```text
$ node dist/index.js sessions
{"ok":true,"data":[{"id":"sess_r-jCY3oFs2niJUav","name":"h1c","adapter":"js-debug","lifecycle":"terminated","status":"terminated","updatedAt":"2026-05-04T22:45:37.980Z","paused":false}],...}

$ node dist/index.js status --name h1c
{"ok":true,"data":{...,"paused":false,...}}

$ node dist/index.js close --name h1c
{"ok":true,"data":{...,"orphanPids":[],"warnings":[]},...}
```

`paused` now appears in the `sessions` list (matching `status`), and `close`
returns the success envelope instead of `controller_request_timeout` exit 7.

Test suite: 224 passed | 6 skipped | 0 failed.
