---
phase: 05-stabilize-real-chrome-js-debug-playwright-same-browser-hando
plan: 15
subsystem: controller
tags: [gap-closure, child-sessions, pwa-chrome, set-breakpoints, handoff-smoke, js-debug]

requires:
  - phase: 05-09
    provides: warnings-array shape on setBreakpoints fan-out responses; awaitChildrenReady() readiness gating
  - phase: 05-13
    provides: webRoot on chrome-smoke launchArgs (untouched here)
  - phase: 05-14
    provides: recursive installStartDebuggingHandler on every child (untouched here); fan-out preference for non-empty breakpoints arrays
provides:
  - Adapter-aware setBreakpoints routing in ChildSessionCoordinator: js-debug routes through parent (with verification wait) AND fans out to children for verification info; non-js-debug adapters keep using fanOutSetBreakpoints unchanged
  - Closure of gap #11 (handoff-smoke half) — strict same-browser Playwright handoff smoke is green end-to-end
  - Test seam: setBreakpointsVerificationTimeoutMs option on ChildSessionCoordinatorOptions
affects: [future js-debug pwa-chrome work, future setBreakpoints contract changes, gap-closure docs]

tech-stack:
  added: []
  patterns:
    - "Adapter-aware DAP request routing inside the coordinator (branching on adapterId for setBreakpoints)"
    - "Index-based response merging for setBreakpoints (DAP guarantees response.breakpoints[i] corresponds to args.breakpoints[i] — robust when adapters omit fields like `line`)"
    - "Event-cache seeding + live event subscription for verification waits (covers events arriving before AND after the request)"

key-files:
  created: []
  modified:
    - "src/controller/childSessions.ts — routeSetBreakpointsThroughParent + branch in maybeIntercept; runChildLifecycle no longer replays setBreakpoints to children; futureChildBreakpoints array and replayInitialBreakpointsToFutureChildren removed; registerInitialBreakpoints reduced to a no-op (caller compat)"
    - "tests/controller/sessionManager.test.ts — existing fan-out tests now use adapterId='fake-multi-process'; replay-to-future-children test rewritten to assert NEW behavior (children must NOT receive setBreakpoints from runChildLifecycle for js-debug); two new tests cover the parent-routing + verification-timeout branches"
    - "tests/integration/playwrightInterop.test.ts — corrected wrong frameId>0 assertion (js-debug uses 0-based frame ids per DAP spec)"

key-decisions:
  - "Route setBreakpoints to the parent for js-debug AND fan-out to children — deviation from plan's strict 'do NOT iterate children' (Rule 1: required for closure proof; documented below)"
  - "Verification timeout default 3500ms — kept under the 5s controller IPC client timeout in controller/client.ts; original plan said 5s but that collides with the IPC envelope"
  - "Match parent provisional bps to verifying responses by INDEX first — DAP guarantees positional correspondence; the parent's provisional response often omits `line`, so id/line matching alone is insufficient"
  - "registerInitialBreakpoints reduced to a no-op rather than removed — keeps the controller/server.ts call site compiling; the parent's before-configurationDone hook already issues setBreakpoints to the parent client, which is sufficient"

patterns-established:
  - "Adapter-aware coordinator branching: maybeIntercept routes by adapterId for command-specific quirks (e.g. js-debug pwa-chrome's parent-owned bp registry) without scattering adapter checks across the codebase"
  - "Verification window pattern: subscribe-before-request + seed-from-cache + index-based merge + warnings-on-timeout"

requirements-completed: [TEST-07]

duration: ~75min
completed: 2026-05-04
---

# Phase 05 Plan 15: route setBreakpoints to parent for js-debug — handoff smoke green

**Closes the handoff-smoke half of gap #11: setBreakpoints now routes through the js-debug parent (which owns the provisional bp registry) AND harvests verification info from the page-level child, making the strict Playwright same-browser handoff smoke pass end-to-end.**

## Performance

- **Duration:** ~75 min (including diagnosis + two implementation iterations)
- **Started:** 2026-05-04T15:14Z
- **Completed:** 2026-05-04T15:36Z
- **Tasks:** 2/2
- **Files modified:** 3

## Accomplishments

- Strict same-browser Playwright handoff smoke is **green end-to-end** with the original assertions from plan 05-05 — verified breakpoint at `app.js:2`, stopped event observed, locals `left=7` / `right=8` visible, post-continue `#result` text === `'15'`. Gap #11 (handoff-smoke half) is closed.
- ChildSessionCoordinator now correctly models the pwa-chrome session topology: parent owns the provisional bp registry; children are queried for verification info; runChildLifecycle no longer makes the wrong DAP-spec-violating call to set bps on children that own no source.
- New test coverage for the js-debug parent-routing branch and the verification-timeout path (2 new unit tests in `tests/controller/sessionManager.test.ts`); existing fan-out tests retargeted to a non-js-debug adapter id so they still cover that branch.
- Plan 05-09 invariants preserved (`awaitChildrenReady` still public, `warnings` array shape unchanged); plan 05-13 invariant preserved (`webRoot` on chrome-smoke); plan 05-14 invariant preserved (`installStartDebuggingHandler` on every child).

## Task Commits

1. **Task 1: Route setBreakpoints to parent for js-debug; remove per-child replay** — `9840782` (feat)
2. **Task 2 (iterated): Also fan out for verification + correct frameId assertion** — `966ff20` (fix)

_Note: Task 2 is a single commit because the iteration on the implementation (parent-only → fan-out + parent → with cache seed → with index-based matching) was driven by direct evidence from the smoke test and is most coherent as one commit._

## Files Created/Modified

- `src/controller/childSessions.ts` — adapter-aware setBreakpoints routing for js-debug (`routeSetBreakpointsThroughParent`); removed `futureChildBreakpoints`, `replayInitialBreakpointsToFutureChildren`, and per-child setBreakpoints replay in `runChildLifecycle`; reduced `registerInitialBreakpoints` to a no-op; added `setBreakpointsVerificationTimeoutMs` test seam to `ChildSessionCoordinatorOptions`.
- `tests/controller/sessionManager.test.ts` — retargeted two existing fan-out tests to `adapterId='fake-multi-process'`; rewrote the replay-to-future-children test to assert the NEW behavior (children must NOT receive setBreakpoints from `runChildLifecycle` for js-debug); added two new tests covering js-debug parent routing (with synthetic verifying breakpoint event) and verification-timeout path.
- `tests/integration/playwrightInterop.test.ts` — corrected wrong `frameId>0` assertion to `frameId` is `'number'` (js-debug uses 0-based frame ids per DAP spec; the `> 0` constraint is an incorrect adapter assumption).

## Decisions Made

- **Index-based response merging.** The parent's provisional response often omits `line` (only id+verified+message), so id/line matching alone fails. DAP guarantees `response.breakpoints[i]` corresponds to `args.breakpoints[i]`, so index matching is the contract we lean on; id/line are tried as fallbacks for the parent breakpoint event match.
- **Verification timeout 3500ms (default).** Plan said 5000ms, but the existing controller IPC client timeout is 5000ms — collisions cause `controller_request_timeout` instead of returning a structured response. 3500ms preserves a real verification window while staying inside the IPC envelope. Made overridable via `setBreakpointsVerificationTimeoutMs` for tests (which use 50ms to keep the timeout-path test fast).
- **Seed verification map from `parentEventCache.recent()`.** js-debug emits the verifying `breakpoint` event when the script is parsed, which can happen BEFORE this `setBreakpoints` call (e.g. when the `__dapCliInitialBreakpoints` hook fired during attach, the script loaded shortly after, and the test calls `breakpoints set` again later). Without seeding from the cache we'd miss those events.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 — Bug] Plan-prescribed parent-only routing did not pass the closure proof; added child fan-out as secondary verification source.**

- **Found during:** Task 2 (running the strict handoff smoke after Task 1's parent-only implementation).
- **Issue:** With parent-only routing per plan, the parent's response was provisional (`{id:1, verified:false, message:"Unbound breakpoint"}`) and NO follow-up `breakpoint` event arrived within 5s — neither for fresh requests nor (after correcting message-string check) for the second `setBreakpoints` call when the script was already parsed. The closure proof failed with `verification_timeout` warnings.
- **Diagnosis:** Direct evidence from temporary diagnostics surfaced via the response's `warnings` field showed:
  - parent: `{breakpoints:[{id:1, verified:false, message:"Unbound breakpoint"}]}` (no `line` field)
  - page-level child: `{breakpoints:[{id:0, verified:true, source:{path:".../app.js"}, line:2}]}`
- **Fix:** `routeSetBreakpointsThroughParent` now ALSO fans out to existing children (after `awaitChildrenReady`) and harvests verification info from any child whose response has `verified:true` at the matching index. The parent is still primary (it owns the provisional bp registry and propagates to current/future children), but children supply the actual verification when js-debug doesn't emit a `breakpoint` event for already-parsed scripts.
- **Files modified:** `src/controller/childSessions.ts`
- **Verification:** Strict handoff smoke now passes end-to-end (run twice in succession; both green); 29/29 sessionManager unit tests pass; full `npm test` 163 passed | 5 skipped.
- **Committed in:** `966ff20`

**2. [Rule 1 — Bug] Wrong assertion in tests/integration/playwrightInterop.test.ts: `expect(frameId).toBeGreaterThan(0)`.**

- **Found during:** Task 2 (after fixing the verification path; the test now reached this line for the first time ever).
- **Issue:** js-debug uses 0-based stack frame ids (the topmost frame is `id: 0`). The DAP spec only requires a numeric id, not a positive one. The `> 0` constraint is an incorrect adapter assumption baked in when the test was first written in plan 05-05 — but because earlier strict assertions were always failing first, this never surfaced.
- **Fix:** Changed to `expect(frameId).toBeTypeOf('number')`. This is a CORRECTION of a wrong assertion, NOT a weakening: the locals (left=7, right=8), continue, and post-continue text === '15' assertions are all still in force and now actually run end-to-end for the first time.
- **Files modified:** `tests/integration/playwrightInterop.test.ts` (one line; out of plan's `files_modified` scope but unavoidable for the closure proof — see scope deviation below).
- **Verification:** Strict handoff smoke green; assertion runs and the actual debugger-state assertions that follow now also run and pass.
- **Committed in:** `966ff20`

**3. [Scope deviation] Modified a file outside plan's `files_modified` list (`tests/integration/playwrightInterop.test.ts`).**

- **Found during:** Task 2.
- **Why:** The plan's closure proof requires the strict handoff smoke to pass; that requires fixing assertion #2 above. The test file was not in the plan's `files_modified` list because the plan author assumed the test was correct as-written. Modifying it was unavoidable.
- **Mitigation:** Single-line correction with a comment pointing back to this SUMMARY. No assertion weakened; the actual debugger-state assertions are intact.

---

**Total deviations:** 3 (1 implementation deviation, 1 test correction, 1 scope deviation — all driven by direct evidence and required for the closure proof).
**Impact on plan:** All deviations necessary for closure. The plan's core insight (parent owns the bp registry; route setBreakpoints to parent) is preserved and reflected in the new code path. The deviation (also fan-out for verification) is additive — it doesn't undo the parent-routing.

## Issues Encountered

- **Plan's prescribed approach (parent-only routing) didn't match adapter reality.** The plan was based on direct DAP trace evidence that showed parent-owned bp registry with `breakpoint.provisionalBreakpoint` message and follow-up verifying events. In practice the message is `"Unbound breakpoint"` (already accounted for) AND the verifying event isn't always emitted (especially for re-issued setBreakpoints calls). Resolved by deviation #1 (child fan-out for verification info).
- **Verification timeout collided with controller IPC timeout.** Plan said 5000ms; existing IPC client timeout is also 5000ms. Resolved by lowering default to 3500ms with a test seam.
- **The wrong `frameId>0` assertion masked itself for ages.** Because the verified-bp assertion was failing first since plan 05-05, this incorrect intermediate assertion never had a chance to surface. Fixed in deviation #2.

## Closure Proof

```
$ DAP_CLI_RUN_CHROME_PLAYWRIGHT_HANDOFF=1 npx vitest run \
    tests/integration/playwrightInterop.test.ts \
    -t "coordinates Playwright with the same Chromium target attached by js-debug"

 RUN  v3.2.4 /Users/roblou/code/dap-cli

 ✓ tests/integration/playwrightInterop.test.ts (2 tests | 1 skipped) 969ms
   ✓ Playwright interop > coordinates Playwright with the same Chromium target attached by js-debug  557ms

 Test Files  1 passed (1)
      Tests  1 passed | 1 skipped (2)
   Duration  1.62s
```

Re-run twice in succession; both green. Exit code 0.

Strict assertions verified end-to-end:
- ✓ verified breakpoint at `app.js:2` (`firstBp.verified === true`)
- ✓ stopped event observed (`reason === 'breakpoint'`)
- ✓ locals visible: `left=7`, `right=8`
- ✓ post-continue `#result.textContent === '15'`

Full test suite (`npm test`): **163 passed | 5 skipped (168 total).** No regressions. The chrome-smoke that 05-16 owns is also green in the gated run (verified in the parallel 05-16 plan that completed alongside this one).

## Self-Check: PASSED

- ✓ `src/controller/childSessions.ts` modified (commits `9840782` + `966ff20`)
- ✓ `tests/controller/sessionManager.test.ts` modified (commits `9840782` + `966ff20`)
- ✓ `tests/integration/playwrightInterop.test.ts` modified (commit `966ff20`)
- ✓ Both Task commits exist in `git log --oneline -5`
- ✓ Strict handoff smoke green end-to-end
- ✓ Plan 05-09, 05-13, 05-14 invariants preserved

## Deferred Follow-ups

- `registerInitialBreakpoints` is now a no-op kept only for caller compatibility. A future cleanup pass could remove it and its `controller/server.ts` call site entirely (the parent-side hook is sufficient). Not done here to keep this plan's blast radius small.
- The verification timeout (3500ms default) is a heuristic; a future plan could replace it with a more precise readiness signal (e.g. "after the page child has parsed the source") if flakiness emerges in CI.
- The deviation to ALSO fan out to children for verification means the page child receives a duplicate `setBreakpoints` request. Empirically this works fine, but a future audit could confirm there's no edge case where the duplicate causes the page child to clear and re-add the bp during execution.
