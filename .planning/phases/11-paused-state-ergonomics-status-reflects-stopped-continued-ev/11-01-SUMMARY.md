---
phase: 11-paused-state-ergonomics-status-reflects-stopped-continued-ev
plan: 01
subsystem: sessions
tags: [paused-state, status-projection, js-debug-parent]
requirements: [PAUSED-01]
key-files:
  modified:
    - src/sessions/session.ts
    - tests/controller/sessionManager.test.ts
    - docs/AGENT-WORKFLOWS.md
    - README.md
decisions:
  - "Picked Option B (post-process via new `projectSummaryStatus` helper) over editing `projectStatusState` signature: minimal diff, leaves the lifecycle-only helper intact for any future callers."
metrics:
  tasks-completed: 2
  files-modified: 4
  tests-added: 5
---

# Phase 11 Plan 01: Status reflects mirrored paused from child events Summary

`projectSessionSummary` now consults `session.paused` so js-debug parent sessions whose `stopped` events arrive on a child runtime project `status: 'stopped'` instead of the misleading `'running'`.

## Result

- New `projectSummaryStatus(session)` wraps `projectStatusState(lifecycle)`: terminal lifecycles (`failed` / `terminated` / `disconnected`) win; otherwise `paused === true` projects to `'stopped'`; otherwise the lifecycle-derived state is returned. Runs in the same call site as before — `projectSessionSummary`'s `status` field — so list and status views both pick it up.
- `SessionRecord.paused` and `SessionStatus.paused` shapes are unchanged; only the projected `status` field changes for `paused === true` records.

## Tasks

| # | Description | Status |
|---|-------------|--------|
| 1 | Make `projectStatusState` (and callers) consult `session.paused` | done |
| 2 | Update AGENT-WORKFLOWS and README to reflect the new status semantics | done |

## Tests

Added five cases in `tests/controller/sessionManager.test.ts` under a new `describe('paused-state status projection (Phase 11)')`:

- A: paused-from-child-mirror flips status to `'stopped'` without bumping lifecycle
- B: continued event clears status back to `'running'`
- C: terminal lifecycle wins over a stale `paused: true`
- D: undefined paused leaves lifecycle-derived status untouched
- E: list projection reflects paused too

All 52 tests in `sessionManager.test.ts` pass.

## Verification

- `npx vitest run tests/controller/sessionManager.test.ts` → 52/52 passing.
- `grep -n "source of truth\|incorporates the most recent" docs/AGENT-WORKFLOWS.md README.md` returns matches in both files.

## Deviations from Plan

None — plan executed as written.

## Self-Check: PASSED

- src/sessions/session.ts: edited `projectSessionSummary` and added `projectSummaryStatus`.
- tests/controller/sessionManager.test.ts: added 5 cases under `paused-state status projection (Phase 11)`.
- docs/AGENT-WORKFLOWS.md and README.md: contain the sentinel phrases.
