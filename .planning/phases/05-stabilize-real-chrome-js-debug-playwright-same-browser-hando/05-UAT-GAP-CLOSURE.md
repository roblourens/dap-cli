---
status: complete
phase: 05-stabilize-real-chrome-js-debug-playwright-same-browser-hando
scope: Verify gap-closure plans 05-03 through 05-06 (parent/child sessions, pwa-chrome multiplexing, strict Playwright handoff, session_ambiguous + stale-session diagnostics) plus the post-discovery launch/configurationDone fix.
source:
  - .planning/phases/05-stabilize-real-chrome-js-debug-playwright-same-browser-hando/05-03-SUMMARY.md
  - .planning/phases/05-stabilize-real-chrome-js-debug-playwright-same-browser-hando/05-04-SUMMARY.md
  - .planning/phases/05-stabilize-real-chrome-js-debug-playwright-same-browser-hando/05-05-SUMMARY.md
  - .planning/phases/05-stabilize-real-chrome-js-debug-playwright-same-browser-hando/05-06-SUMMARY.md
closure_plans:
  - 05-07-SUMMARY.md (gap #14, shipped)
  - 05-08-SUMMARY.md (gap #10, shipped)
  - 05-09-SUMMARY.md (gap #11 part 1: warnings + readiness gate, shipped)
  - 05-10-SUMMARY.md (gaps #6 + #9, shipped)
  - 05-11-SUMMARY.md (gap #2, shipped)
  - 05-12-SUMMARY.md (gap #13, shipped)
  - 05-13-SUMMARY.md (gap #11 part 2: chrome-smoke webRoot, shipped)
  - 05-14-SUMMARY.md (gap #11 part 3: recursive startDebugging handler, shipped)
  - 05-15-SUMMARY.md (gap #11 part 4: route setBreakpoints to parent for js-debug, smoke green)
  - 05-16-SUMMARY.md (gap #11 part 5: chrome-smoke startDebugging handler, smoke green)
started: 2026-05-03T20:50:00Z
updated: 2026-05-04T08:42:00Z
mode: agent-driven
runner: GitHub Copilot drove all CLI commands directly; no human-in-the-loop confirmations.
closure_status: 7 of 7 gaps closed. Both gated smokes pass independently. UAT complete.
---

## Current Test

[testing + closure complete — all 7 gaps closed; both gated smokes green]

## Tests

### 1. Cold-start smoke (controller restart)
expected: After killing the controller and removing sessions.json + controller.sock, `dap-cli start` reports `started: true` with a fresh PID, and `dap-cli sessions` returns an empty list.
result: pass
evidence: `bash /tmp/dap-restart.sh` → `started: true`, `pid: 30587`, sessions: `[]`.

### 2. Node session full lifecycle
expected: Launch simple-node-app, set a breakpoint, see `stopped` event, inspect threads → stack → scopes → variables (find expected locals), continue, see `terminated`, cleanup.
result: issue
reported: "Fixture exits in ~50ms (no `stopOnEntry`), so by the time the user runs `breakpoints set` the program has already terminated. Breakpoint comes back `verified: false / Unbound breakpoint`. README quick-start has the same problem — copy-pasting it never hits the breakpoint."
severity: major

### 3. Python session full lifecycle (debugpy)
expected: Same flow with simple-python-app via the debugpy adapter.
result: skipped
reason: "Out of scope for gap-closure verification (no changes touched debugpy in plans 03-06). Pre-existing tests already cover the path."

### 4. pwa-chrome end-to-end (post-fix)
expected: Launch pwa-chrome against a local HTTP-served fixture; child session(s) reach lifecycle `running`; `dap-cli threads --name <parent>` returns aggregated non-empty thread list.
result: pass
evidence: After the post-discovery fix in commit 925c9f7 (wait for child `initialized` before `configurationDone`), child reaches `running` and `threads` returns `[{ id: 1, name: "sess_jbKXe1B6TyzzwQse: 127.0.0.1:5174" }]`. setBreakpoints on app.js:2 returns `verified: true`.

### 5. Parent/child session model in `sessions` listing
expected: During (4), `dap-cli sessions` shows the parent + at least one child row with `parent_session_id` populated and pointing to the parent's id.
result: pass
evidence: `sessions` returned 2 rows, child had `parent_session_id: sess_N8bpXOtgmUsfpZpQ` matching parent.

### 6. Cascade close
expected: `dap-cli close <parent-id>` removes both the parent record and all child records from `dap-cli sessions` in one call.
result: issue
reported: "The diagnostic emitted by `adapter_transport_closed` says ``Run `dap-cli close <id>` and relaunch the session.``, but `close` does not accept a positional argument — it requires `--name <id>`. Following the diagnostic verbatim returns `error: too many arguments for 'close'`. Cascade-close itself works once the correct syntax is used."
severity: major

### 7. session_ambiguous on duplicate `--name`
expected: With two sessions sharing a name, every targeted command (`status`, `events`, `threads`, `dap stack-trace --json ...`) returns `code: session_ambiguous`, `category: session`, `exitCode: 4`, with diagnostics enumerating both candidate IDs and statuses.
result: pass
evidence: Verified end-to-end: `status`, `events`, `threads`, AND `dap stack-trace` all returned `session_ambiguous` with diagnostics listing both candidate session IDs and their `stopped` status.

### 8. Stale-session diagnostic (adapter_transport_closed)
expected: When the adapter dies mid-session, the next targeted command returns `code: adapter_transport_closed` with diagnostics that include the last-known status, an adapter log path (when available), and a `dap-cli close <id>` recovery hint.
result: pass
evidence: After SIGTERM-ing the fake adapter PID, `threads --name killable` returned: `Last-known session status: stopped.`, `Adapter log: /Users/roblou/.dap-cli/logs/fake-69703.log.`, `Run \`dap-cli close sess_QKN63OUfrJwFud6r\` and relaunch the session.` (See test 6 for the close-syntax bug embedded in this diagnostic.)

### 9. cleanup behavior
expected: `dap-cli cleanup` should leave `dap-cli sessions` empty (or at minimum: stop adapters AND remove their records).
result: issue
reported: "`dap-cli cleanup` reports `cleaned: [<sessionId>]` but the same session still appears in `dap-cli sessions` afterward with unchanged lifecycle. The implementation only sends SIGTERM; it never removes records. Result: stale records accumulate forever and the very next status/threads call hits the `adapter_transport_closed` path. There is also no `--force` or `--purge` flag (despite the option being declared)."
severity: major

### 10. Gated browser smoke (DAP_CLI_RUN_BROWSER_SMOKES=1)
expected: `npm run test:smoke:chrome` passes — exercises real Chromium child-session aggregation through the controller.
result: issue
reported: "`pwa-chrome attach surfaces ≥1 child session and non-empty threads through the controller` test fails because the test creates a fresh tmp `DAP_CLI_HOME` via `createCliTestEnv`, but never provisions js-debug into it. The CLI invocation under test then fails with `js_debug_not_found`. The test was added in plan 05-04 but was never actually exercised — only its env-gated `skipIf` ran in CI, so the failure was hidden. The other smoke test in the same file (`launches Chrome in headless mode`) only passed because it bypasses `runCli` and reaches into internal APIs that resolve adapters from the user's `~/.dap-cli/adapters`."
severity: blocker

### 11. Gated Playwright handoff smoke (DAP_CLI_RUN_CHROME_PLAYWRIGHT_HANDOFF=1)
expected: `npm run test:smoke:handoff` passes — strict assertions on breakpoint verified, stopped on app.js line 2, locals `left=7`/`right=8`, post-continue text === '15'.
result: issue
reported: "Test fails at `expected ≥1 breakpoint in setBreakpoints response`. The `fanOutSetBreakpoints` aggregation in `ChildSessionCoordinator` swallows per-child errors with `try/catch returning undefined`, then returns `{ breakpoints: [] }` whenever every child failed. The test sees no breakpoints at all and gives up. Two underlying problems: (a) silent error swallowing hides why setBreakpoints failed; (b) the test's earlier poll waited for non-empty `threads`, but a child can be in `threads` and still not be ready for `setBreakpoints` if its `configurationDone` hasn't completed yet. Plan 05-05 was committed without ever running this opt-in suite end-to-end."
partially_closed_by: 05-09 (error-surface + readiness gate), 05-14 (recursive coordinator + non-empty preference in fan-out)
status: still red — recursive coordinator landed in 05-14 but pwa-chrome did NOT emit a nested startDebugging in this scenario (see deferred-items.md "From plan 05-14"); active root cause now believed to be Hypothesis 2 (webRoot/file:// path mapping inside the page child) or Hypothesis 3 (script-load timing). Single follow-up plan recommended.
severity: blocker

### 12. Add npm scripts for gated smokes
expected: `npm run test:smoke:chrome`, `npm run test:smoke:handoff`, `npm run test:smoke` exist and run the corresponding gated tests.
result: pass
evidence: Added to `package.json` in this verification pass; both invoked successfully (failures in tests 10/11 are real test/code bugs, not script invocation bugs).

### 13. CLI exploration: help, sessions, use, status, events pagination
expected: `dap-cli --help`, `dap-cli sessions`, `dap-cli use`, `dap-cli status`, `dap-cli events --after-cursor N --limit M` all behave sanely with informative output.
result: issue
reported: "`dap-cli events --limit 500` silently returns at most 100 events. The event cache has a hardcoded `defaultEventCacheCapacity = 100` with no override path; nothing in the response indicates the limit was clipped. Also: orphaned `serve-controller` processes accumulate (saw a 5h35m-old controller still running today's CLI requests against yesterday's code), and `start` happily reuses any controller bound to the socket without a build/version handshake. Resulting symptom: silent stale behavior across CLI restarts."
severity: minor

## Bonus Finding (not in original test plan)

### 14. Controller crash on mismatched fake-adapter script
expected: `dap-cli launch --adapter fake --script attach-stopped --name x` (attach-mode script with launch command) should return a structured error fast — never hang or crash the controller.
result: issue
reported: "Issuing `launch` with an attach-only fake script causes `controller_request_timeout` after a 10s+ hang AND leaves the controller process gone (`lsof -t controller.sock` returns nothing afterward). Subsequent commands return `controller_unavailable`. A single bad request from a single client kills the daemon for everyone."
severity: blocker

## Summary

total: 14
passed: 6
issues: 7
pending: 0
skipped: 1

## Gaps

- truth: "After `dap-cli launch ... simple-node-app/index.js`, a follow-up `dap-cli breakpoints set` should be able to bind a breakpoint before the program exits."
  status: failed
  reason: "Auto-driven verification: fixture exits in ~50ms; CLI quick-start in README never hits a breakpoint."
  severity: major
  test: 2
  artifacts:
    - path: "tests/fixtures/simple-node-app/index.js"
      issue: "Runs greet+calculate at top level and exits immediately."
    - path: "README.md"
      issue: "Quick-start describes setting a breakpoint after launch but doesn't pass any stop-on-entry flag."
  missing:
    - "Add a `--stop-on-entry` flag (or wire the existing js-debug `stopOnEntry: true` through the `dap-cli launch` command surface)."
    - "Update README quick-start to actually hit the breakpoint OR use a long-running fixture."
    - "Optionally add a long-running variant fixture for documentation/manual exploration."

- truth: "The recovery hint inside the adapter_transport_closed diagnostic must be a runnable command."
  status: failed
  reason: "Auto-driven verification: diagnostic says `dap-cli close <id>` but `close` rejects positional args, requiring `--name <id>`."
  severity: major
  test: 6
  artifacts:
    - path: "src/controller/server.ts:705"
      issue: "Builds diagnostic string `Run \\`dap-cli close ${id}\\` and relaunch the session.` — wrong syntax for CLI."
    - path: "src/cli/commands/sessions.ts (close command)"
      issue: "`close` command takes only --name option; rejects positional argument with `usage_error`."
  missing:
    - "Either: (a) update the diagnostic to `dap-cli close --name <id>`, OR (b) make the close command accept an optional positional id (preferred — symmetric with `use <name>` ergonomics)."
    - "Add a unit/integration test that copy-pastes the recovery hint from the diagnostic and asserts it succeeds."

- truth: "`dap-cli cleanup` should leave `dap-cli sessions` empty when it succeeds (or at minimum remove records for sessions it terminated)."
  status: failed
  reason: "Auto-driven verification: cleanup terminates adapters but leaves all session records in sessions.json; no `--purge` exists despite a placeholder option."
  severity: major
  test: 9
  artifacts:
    - path: "src/sessions/sessionManager.ts:cleanupSessions"
      issue: "Iterates owned adapters and signals SIGTERM; never mutates `data.sessions` or persists removal."
    - path: "src/cli/commands/sessions.ts (cleanup command)"
      issue: "Declares `--force` flag but it is unused."
  missing:
    - "After SIGTERM (and post-exit confirmation), remove the session record from `data.sessions` and persist."
    - "Add a `--purge` flag (or wire `--force`) to also remove records for terminated/failed sessions whose adapters are no longer owned."
    - "Add an integration test for `cleanup` that asserts `sessions` returns `[]` after successful cleanup."

- truth: "A single malformed `launch` request must not hang or kill the controller."
  status: failed
  reason: "Auto-driven verification: launching with a wrong-mode fake script caused `controller_request_timeout` and left the controller dead."
  severity: blocker
  test: 14
  artifacts:
    - path: "src/testing/fakeAdapter.ts"
      issue: "Fake adapter doesn't validate that the chosen script matches the requested mode (launch vs attach); when no response is sent for the unexpected request, the controller hangs."
    - path: "src/protocol/lifecycle.ts (DapLifecycleController.start)"
      issue: "No timeout on initialize/launch/configurationDone; a non-responding adapter blocks the controller event loop indefinitely."
  missing:
    - "Validate fake adapter script ↔ mode at launch and emit a structured error before the handshake hangs."
    - "Add a hard timeout to the lifecycle handshake (initialize/launch/configurationDone) that fails the session and keeps the controller alive."
    - "Add a regression test: bad fake script + launch → structured error within < 5s, controller still alive (assert via subsequent `sessions` call)."

- truth: "Gated browser smoke (`npm run test:smoke:chrome`) must run end-to-end without manual setup beyond `npm run setup-adapters`."
  status: failed
  reason: "Auto-driven verification: `pwa-chrome attach surfaces ≥1 child session and non-empty threads through the controller` fails immediately with `js_debug_not_found` because the test's tmp DAP_CLI_HOME has no js-debug provisioned."
  severity: blocker
  test: 10
  artifacts:
    - path: "tests/integration/jsDebugAdapter.test.ts (chrome-children-smoke test)"
      issue: "Uses `createCliTestEnv` (fresh tmp DAP_CLI_HOME) but never copies/symlinks the user's installed js-debug adapter into it. The test was added in plan 05-04 but was never actually run with `DAP_CLI_RUN_BROWSER_SMOKES=1`."
    - path: "src/testing/tempEnv.ts"
      issue: "createTempDapCliEnv has no helper to provision adapters into the tmp dir."
  missing:
    - "Helper that symlinks (or copies) the user's `~/.dap-cli/adapters/js-debug` into the tmp `DAP_CLI_HOME` so smoke tests are self-contained."
    - "Update the chrome-children-smoke test to use the helper. Likely needed for the handoff smoke too (issue 11)."
    - "Document `npm run setup-adapters` as a required prereq for the gated smokes (or fail with a clearer message that points at it)."

- truth: "Gated Playwright handoff smoke (`npm run test:smoke:handoff`) must pass once threads are visible — verified breakpoint, correct locals, correct post-continue result."
  status: failed
  reason: "Auto-driven verification: test fails at `expected ≥1 breakpoint in setBreakpoints response` because `fanOutSetBreakpoints` returns `{ breakpoints: [] }` when all children fail; per-child errors are swallowed."
  severity: blocker
  test: 11
  artifacts:
    - path: "src/controller/childSessions.ts:fanOutSetBreakpoints"
      issue: "Per-child request errors are caught and replaced with `undefined`; aggregation can't distinguish 'no children' from 'all children errored'. No diagnostics surfaced."
    - path: "tests/integration/playwrightInterop.test.ts (handoff test)"
      issue: "Polls until threads is non-empty, but a child can be in the threads list before its `configurationDone` completes, so a setBreakpoints sent at that moment can be lost or rejected."
    - path: "src/controller/childSessions.ts (lifecycle/threads coordination)"
      issue: "No public 'await ready' API; `awaitPendingChildren` is internal/dispose-only."
  missing:
    - "Surface per-child setBreakpoints errors in the aggregated response (e.g. as a warnings array) instead of silently dropping them."
    - "Either: (a) make threads aggregation skip children that aren't yet past `configurationDone`, OR (b) expose a public `awaitChildrenReady()` method, OR (c) gate `maybeIntercept` on child readiness and queue requests."
    - "Once stable, run `npm run test:smoke:handoff` and `npm run test:smoke:chrome` end-to-end and capture the output as evidence in the SUMMARY."

- truth: "`dap-cli events --limit N` should return up to N events; if the cache is bounded smaller than N, the response should signal that data was clipped. Multiple controller instances should not silently coexist."
  status: failed
  reason: "Auto-driven verification: asked for `--limit 500`, got 100; orphaned controllers from prior days still running and silently serving today's CLI."
  severity: minor
  test: 13
  artifacts:
    - path: "src/protocol/eventCache.ts"
      issue: "`defaultEventCacheCapacity = 100` is hardcoded, no override; `--limit > capacity` is silently clipped."
    - path: "src/controller/server.ts (start handler)"
      issue: "`start` returns `started: false` when a controller socket exists, but performs no version/build handshake to detect a stale process."
  missing:
    - "Document the cache capacity in the `--limit` help text OR raise capacity OR include a `truncated`/`droppedCount` field in the events response."
    - "Add a build-id (e.g. dist/index.js mtime or a generated constant) and refuse to reuse a controller whose build-id mismatches the CLI's; log a clear message."
    - "Add `dap-cli stop-controller` (or similar) for explicit shutdown."

## Process Findings (Meta)

These are not feature bugs but meta-observations about how this phase was verified:

- **Gated smokes were written but never run.** Plans 05-04 and 05-05 each added an opt-in test (`DAP_CLI_RUN_BROWSER_SMOKES`, `DAP_CLI_RUN_CHROME_PLAYWRIGHT_HANDOFF`). Both failed on the first actual invocation (issues 10, 11). The phase summaries claimed PASSED but only ever ran `npm test` (which skips them). Action: gated smokes must be run at least once before a SUMMARY is written claiming completion.
- **FakeAdapterEndpoint was too forgiving.** It auto-responded to every request without modeling DAP handshake timing. The launch/configurationDone deadlock (commit 925c9f7) was invisible to unit tests for that reason. Fixed in 925c9f7 — but the broader pattern of fakes silently masking real-protocol constraints is worth a review.
- **Diagnostics referencing CLI commands aren't tested as runnable.** Issue 6 caught one example; almost certainly others exist. A test that grep-extracts `dap-cli ...` strings from diagnostics and asserts each parses with commander would catch this whole class.

## Diagnosis Evidence

- `bash /tmp/dap-restart.sh && bash /tmp/dap-test-ambiguous.sh` — session_ambiguous verified across status, events, threads, and `dap stack-trace`.
- `bash /tmp/dap-test-stale.sh` — adapter_transport_closed diagnostic content verified; recovery-hint syntax bug surfaced.
- Controller crash: `npx dap-cli launch --adapter fake --script attach-stopped --name badscript --no-use` → controller_request_timeout, controller process gone (`lsof -t controller.sock` → empty).
- Cleanup: launch fake → cleanup → `cleaned: [id]` → sessions still lists the same id with same lifecycle.
- `npm run test:smoke:chrome` — 1 of 2 runBrowserSmokes tests fails: js_debug_not_found from tmp env.
- `npm run test:smoke:handoff` — handoff test fails: setBreakpoints fanOut returns empty.
- `git log --oneline -10` shows commit 925c9f7 (post-discovery launch/configurationDone fix) on `main` after the original gap-closure plans 03-06.

## Ready Fix Direction

Severity-ordered:

1. **Blocker — controller crashes on bad fake script** (issue 14). Add a hard timeout to the lifecycle handshake; never let a single bad request kill the controller. Quickest impactful fix.
2. **Blocker — gated smokes don't run end-to-end** (issues 10, 11). Without these, every future phase that touches the parent/child machinery will regress invisibly. Fix the test infra (auto-provision adapters into tmp env) and the silent-error swallowing in `fanOutSetBreakpoints`.
3. **Major — `cleanup` doesn't remove records** (issue 9). One-line fix in `cleanupSessions` plus a regression test.
4. **Major — recovery-hint diagnostic uses wrong syntax** (issue 6). Either fix the diagnostic or accept positional in `close`. Add a meta-test that runs every CLI suggestion in error diagnostics through commander to validate.
5. **Major — Node fixture exits before bp can be set** (issue 2). Wire `--stop-on-entry` through the `launch` command; update README quick-start.
6. **Minor — events --limit cap, stale-controller reuse** (issue 13). Surface the cap, add a build-id check on controller reuse, ship `dap-cli stop-controller`.
