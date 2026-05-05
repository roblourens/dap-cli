---
phase: 05-stabilize-real-chrome-js-debug-playwright-same-browser-hando
plan: 17
subsystem: src/sessions + src/controller
tags: [gap-closure, hand-driven, status, paused-state, H-1]
gap_closure: true
requires: []
provides:
  - status-paused-projection
  - sessionmanager-update-paused-state
affects:
  - src/sessions/session.ts
  - src/sessions/sessionManager.ts
  - src/controller/server.ts
  - src/testing/fakeAdapter.ts
  - tests/fixtures/fake-adapter-entry.ts
  - tests/controller/sessionManager.test.ts
  - tests/cli/jsonOutput.test.ts
tech_stack_added: []
patterns:
  - "Mirror DAP `stopped`/`continued`/`terminated` events into the persisted SessionRecord so `dap-cli status` reports paused state without polling events."
  - "`paused === undefined` means 'unknown'; explicit `paused: false` means 'observed not paused' (continued/terminated). The projection respects this tri-state."
  - "Coerce untrusted DAP event body fields (`reason`, `threadId`, `allThreadsStopped`) before persisting them — `derivePausedStateFromStopped` enforces typed shape (T-05-17-01)."
  - "Fire-and-forget (`void manager.update*`) inside the existing `client.onEvent` handler — matches the existing `updateLifecycle` non-blocking pattern."
key_files:
  created:
    - .planning/phases/05-stabilize-real-chrome-js-debug-playwright-same-browser-hando/05-17-SUMMARY.md
  modified:
    - src/sessions/session.ts
    - src/sessions/sessionManager.ts
    - src/controller/server.ts
    - src/testing/fakeAdapter.ts
    - tests/fixtures/fake-adapter-entry.ts
    - tests/controller/sessionManager.test.ts
    - tests/cli/jsonOutput.test.ts
decisions:
  - "Store paused state on the persisted SessionRecord rather than computing it from the runtime in `controller/server.ts`. Per the plan: `sessionManager.status(target)` must read the correct value even from another process — the runtime map (`this.runtimes`) is process-local."
  - "Tri-state semantics: `paused === undefined` for never-stopped sessions, `paused: true` while stopped, explicit `paused: false` once a `continued`/`terminated` event has been observed. `projectSessionStatus` omits the field entirely in the `undefined` case so existing consumers see no change for sessions whose adapters never stop."
  - "`updatePausedState({paused: false})` clears `stoppedReason` and `stoppedThreadIds` to undefined — stale reason/threadIds after resume would mislead hand-driven users."
  - "Used the `void manager.updatePausedState(...)` (fire-and-forget) call shape, mirroring the existing `void manager.updateLifecycle(...)` pattern in the same `client.onEvent` block. The event handler must remain non-blocking."
  - "`derivePausedStateFromStopped` always emits `stoppedReason: 'unknown'` if the adapter sent a non-string reason rather than dropping the field — keeps the DAP-level shape stable for downstream consumers."
metrics:
  duration_minutes: ~15
  tasks_completed: 2
  files_changed: 7
  completed_at: 2026-05-04
---

# Phase 5 Plan 17: Status reports paused state for stopped sessions Summary

Closes hand-driven gap H-1 from [05-UAT.md](.planning/phases/05-stabilize-real-chrome-js-debug-playwright-same-browser-hando/05-UAT.md): `dap-cli status` previously reported `lifecycle: running` for sessions paused at entry or at a breakpoint, leaving hand-driven users with no way to tell paused-vs-running without digging through `events`. Status now exposes `paused`, `stoppedReason`, and `stoppedThreadIds` fields, kept in sync by the same controller event handler that already maintains lifecycle.

## What changed

### Persisted projection (Task 1)

[src/sessions/session.ts](src/sessions/session.ts):
- `SessionRecord` and `SessionStatus` gained optional `paused?: boolean`, `stoppedReason?: string`, `stoppedThreadIds?: readonly number[]` fields.
- `projectSessionStatus` includes them only when defined on the record. Critically, when `paused === false` (we observed continued/terminated), the field IS emitted — consumers can distinguish "we know this isn't paused" from "we don't know yet".

[src/sessions/sessionManager.ts](src/sessions/sessionManager.ts):
- New `updatePausedState(target, { paused, stoppedReason?, stoppedThreadIds? })` mirrors `updateLifecycle` exactly: same `target(target, false)` resolution, same `replaceSession + persist()` flow, same error semantics (throws `session_not_found` on missing target).
- Setting `paused: false` clears `stoppedReason` and `stoppedThreadIds` to undefined so stale reason/threadIds never leak into a resumed session's status.

### Controller event wiring (Task 2)

[src/controller/server.ts](src/controller/server.ts) `startDapSession`:
- Inside the existing `client.onEvent(...)` block, alongside each `updateLifecycle` call, `void manager.updatePausedState(session.id, ...)` is fire-and-forget invoked for `stopped`, `continued`, and `terminated` events.
- `derivePausedStateFromStopped(event.body)` (new helper) coerces the untrusted DAP event body: `reason` becomes a string (`'unknown'` if missing or non-string), `threadId` is honored only when it's an integer, and `allThreadsStopped: true` collapses `stoppedThreadIds` to `[]` (T-05-17-01 mitigation).

### Test coverage

[tests/controller/sessionManager.test.ts](tests/controller/sessionManager.test.ts) — 4 new unit tests under `updatePausedState (H-1: paused projection)`:
- Round-trip: `paused: true / stoppedReason: 'entry' / stoppedThreadIds: [1]` flows through `projectSessionStatus` and re-fetches correctly.
- Clear-on-resume: `paused: false` clears `stoppedReason` and `stoppedThreadIds` (asserted via `Object.prototype.hasOwnProperty` so we catch leftover undefined keys too); `paused` itself is still emitted.
- Missing-target: rejects with `session_not_found` like `updateLifecycle`.
- Never-stopped: `status()` for a freshly-created session omits `paused`, `stoppedReason`, `stoppedThreadIds` entirely.

[tests/cli/jsonOutput.test.ts](tests/cli/jsonOutput.test.ts) — new end-to-end test under `status JSON envelope reports paused state (gap H-1)`:
- Drives a stopped→continued cycle through the published CLI envelope using a new `paused-then-continued` fake adapter script (added in both [src/testing/fakeAdapter.ts](src/testing/fakeAdapter.ts) and the spawned [tests/fixtures/fake-adapter-entry.ts](tests/fixtures/fake-adapter-entry.ts)).
- After launch: `status --name paused-demo` envelope `data` contains `paused: true, stoppedReason: 'entry', stoppedThreadIds: [1]`.
- After `request continue`: `data.paused === false`, `data.stoppedReason === undefined`, `data.stoppedThreadIds === undefined`.

## Verification

```
npm run typecheck        → clean
npm test                 → 168 passed | 5 skipped (no failures, no regressions)
```

Per the executor protocol and plan task 3 (`checkpoint:human-verify`), the hand-driven Sequence A re-run against `node dist/index.js launch --stop-on-entry … && node dist/index.js status --name smoke-node` is the orchestrator's responsibility — its verbatim transcript will be appended to [05-UAT.md](.planning/phases/05-stabilize-real-chrome-js-debug-playwright-same-browser-hando/05-UAT.md) under `## Hand-Driven CLI Smoke (gap H-1 closure)`. This SUMMARY closes the implementation half only.

## Deviations from Plan

None — both tasks landed as written. No auto-fixes, no auth gates, no architectural changes.

The plan's Task 2 mentions an OPTIONAL `thread { reason: 'exited' }` clear path. I did NOT implement it: the `continued` and `terminated` handlers already cover every observed transition cleanly, and the plan explicitly tagged the thread-exited path as "only do this if it falls out cheaply".

## Self-Check: PASSED

- Created files exist:
  - `.planning/phases/05-.../05-17-SUMMARY.md` — FOUND (this file).
- Modified files exist and contain the new symbols:
  - [src/sessions/session.ts](src/sessions/session.ts) — `paused?: boolean` present on `SessionRecord` and `SessionStatus`.
  - [src/sessions/sessionManager.ts](src/sessions/sessionManager.ts) — `public async updatePausedState` present.
  - [src/controller/server.ts](src/controller/server.ts) — `derivePausedStateFromStopped` and `updatePausedState` call sites present.
- Commits exist on `main`:
  - `d9a2415` — feat(05-17): add paused projection and updatePausedState to SessionManager
  - `c560ca1` — feat(05-17): wire paused-state updates into controller event handler
