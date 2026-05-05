---
phase: 05-stabilize-real-chrome-js-debug-playwright-same-browser-hando
plan: 25
subsystem: controller
tags: [gap-closure, hand-driven, status, paused-state, H-1a, H-1b]
dependency-graph:
  requires: [17, 19]
  provides:
    - "Shared derivePausedStateFromStopped helper for both parent-direct (server.ts) and child-mirrored (childSessions.ts) stopped-event handling."
    - "Parent SessionRecord.paused projection now reflects child-emitted stopped/continued/terminated events for js-debug pwa-node / pwa-chrome."
  affects:
    - "dap-cli status --name <parent>"
tech-stack:
  added: []
  patterns:
    - "Fire-and-forget mirror with .catch(() => undefined) to swallow torn-down-parent races without crashing the child event loop."
key-files:
  created:
    - src/controller/pausedState.ts
    - tests/controller/childSessions.test.ts
  modified:
    - src/controller/server.ts
    - src/controller/childSessions.ts
decisions:
  - "Parent-mirror at event-arrival time (single write), NOT walk-children-at-status-time (would race with manager.target() resolution and add per-`status` cost)."
  - "stoppedThreadIds carry child-native thread ids verbatim (no remap through parentVisibleThreadCounter) — hand-driven users pass them straight to `stack --thread-id <n>` against the child."
  - "terminated event treated identically to continued (clears paused) — parent lifecycle is owned by the parent-side listener in server.ts, not duplicated here."
metrics:
  duration: ~25m
  completed: 2026-05-04
---

# Phase 05 Plan 25: H-1a/H-1b paused-state child→parent mirror Summary

Wires child-runtime `stopped`/`continued`/`terminated` events through to the parent `SessionRecord` so `dap-cli status --name <parent>` reports paused-state for js-debug `pwa-node` (and `pwa-chrome`).

## One-liner
Mirror child paused-state onto the parent record via a shared `derivePausedStateFromStopped` helper, closing hand-driven gaps H-1a (keys absent from `status` envelope) and H-1b (`updatePausedState` never invoked for parent).

## Tasks Completed

| # | Task | Commit |
|---|------|--------|
| 1 | Extract `derivePausedStateFromStopped` into `src/controller/pausedState.ts`; `server.ts` imports the helper; new `tests/controller/childSessions.test.ts` covers coercion contract. | `7f8318e` |
| 2 | Install paused-state mirror listener in `ChildSessionCoordinator.handleStartDebugging` for `stopped`/`continued`/`terminated` child events; three new `ChildSessionCoordinator paused-state mirroring` tests prove parent projection. | `e3fd44a` |

## Test Results

- `npm test` (full suite): **185 passed | 5 skipped | 0 failed** (190 total).
- `npm run typecheck`: clean except for the pre-existing `src/sessions/sessionStore.ts:63` error (documented in `deferred-items.md`, untouched).
- `npm run build`: success (`dist/index.js` 169.34 KB).
- New tests: 7 in `tests/controller/childSessions.test.ts` (4 helper coercion + 3 wiring).
- No regressions in `tests/integration/jsDebugAdapter.test.ts` (which exercises the existing parent + child wiring).

## Deviations from Plan

None — plan executed exactly as written.

One small additive: `afterEach` in `tests/controller/childSessions.test.ts` uses `fs.rm({ maxRetries: 5, retryDelay: 20 })`. The mirror listener fires `void this.options.sessionManager.updatePausedState(...).catch(...)` (per the plan's fire-and-forget contract), so a `terminated` event scheduled in the same tick as test teardown could race the `rmdir` against an in-flight `sessionStore.write` (which writes a `.tmp` file then renames). The retry option is the standard `fs.rm` API for exactly this teardown-race shape and does not change the production code behavior the test exercises. Documented in the test file with a comment.

## Threat Flags

None — the new code path inherits the existing T-05-17-01 mitigation transitively via the shared `derivePausedStateFromStopped` helper. No new trust boundaries.

## Self-Check: PASSED

- `src/controller/pausedState.ts` — exists.
- `src/controller/server.ts` — imports from `./pausedState.js`, local declaration removed.
- `src/controller/childSessions.ts` — imports `derivePausedStateFromStopped`, mirror listener in `handleStartDebugging` writes to `this.options.parentSessionId`.
- `tests/controller/childSessions.test.ts` — exists with 7 passing tests.
- Commits `7f8318e`, `e3fd44a` present on `main`.

## Hand-Driven Verification Status

**PENDING: hand-driven verification by orchestrator.**

Per the executor instructions and `.github/copilot-instructions.md` hard rule, the executor STOPPED at the `checkpoint:human-verify` task and did NOT run Sequence A Steps 1–7 itself. The orchestrator (the agent that spawned this executor) must:

1. Run `npm run build`.
2. Pre-clean (`sessions`, `cleanup --purge`).
3. Drive Sequence A Step 1+2 (`launch --stop-on-entry` + `status`) — expect `paused: true`, `stoppedReason: "entry"` (or similar verbatim string), `stoppedThreadIds: [<n>]`.
4. Drive Sequence A Step 7 (`continue` + `status`) — expect `paused: false` and the supporting fields omitted.
5. Append a new `## Hand-Driven CLI Smoke (Wave 1.5 H-1 re-verify)` section to `.planning/phases/05-stabilize-real-chrome-js-debug-playwright-same-browser-hando/05-UAT.md` with verbatim transcripts and `result: pass` for both H-1a and H-1b.
6. Commit the UAT update as `docs(05-25): record Wave 1.5 H-1 hand-driven re-verify (pass)`.
7. Mark the plan complete in STATE.md / ROADMAP.md only after the UAT entries land with `result: pass`.

If either observation fails, file as sub-gap H-1a-1 / H-1b-1 and do not auto-rerun the planner.

## Commits (in order)

1. `7f8318e` — feat(05-25): extract derivePausedStateFromStopped to shared pausedState module
2. `e3fd44a` — feat(05-25): mirror child stopped/continued events onto parent paused state
