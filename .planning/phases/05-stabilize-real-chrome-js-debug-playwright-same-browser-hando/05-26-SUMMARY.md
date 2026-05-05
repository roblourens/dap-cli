---
phase: 05-stabilize-real-chrome-js-debug-playwright-same-browser-hando
plan: 26
subsystem: controller/child-sessions
tags: [gap-closure, hand-driven, thread-routing, child-sessions, regression, H-3a]
gap_closure: true
status: pending-hand-verify
requires: [05-19, 05-25]
provides:
  - parent-name-thread-routing
  - thread_id_required-error-code
  - thread_not_owned-error-code
  - real-id-thread-aggregation
  - sessionName-on-aggregated-threads
  - goto-routable
  - setVariable-routable
affects:
  - src/controller/childSessions.ts
  - tests/controller/childSessions.test.ts
  - tests/controller/sessionManager.test.ts
  - tests/integration/jsDebugAdapter.test.ts
  - tests/cli/sessionCommands.test.ts
tech-stack:
  added: []
  patterns:
    - real-id thread routing (no parent-visible counter remap)
    - cache + live-refresh fan-out for cold-path lookups
    - structured CliError with data.availableThreads payload
key-files:
  modified:
    - src/controller/childSessions.ts
    - tests/controller/childSessions.test.ts
    - tests/controller/sessionManager.test.ts
    - tests/integration/jsDebugAdapter.test.ts
    - tests/cli/sessionCommands.test.ts
  created: []
decisions:
  - Drive-by extension to routeByVariableReference: 'evaluate' with no frameId/variablesReference falls back to the first child with non-empty knownThreadIds. Without this, the canonical hand-driven 'evaluate --expression' against the parent name failed with the same H-3a symptom on a different code path.
  - Task 3 items (a)/(b) covered at the coordinator layer (childSessions.test.ts) instead of the CLI surface (sessionCommands.test.ts). Justified inline at the task-3 commit.
metrics:
  duration: see-commits
  completed: 2026-05-04
---

# Phase 05 Plan 26: Real-id Thread Routing for Parent-Name DAP Commands (H-3a)

Closes hand-driven gap **H-3a** from 05-UAT.md: thread-scoped DAP commands
(`threads`/`stack`/`evaluate`/`continue`, plus newly-routable
`goto`/`setVariable`) routed transparently from a js-debug pwa-node parent
session name to the owning child, using REAL child thread ids
end-to-end. Hand-driven users never need to type `smoke-node#<hex>`,
`--show-children`, or call `threads` first to populate any internal remap
state.

## What Changed

**`src/controller/childSessions.ts`:**

- `ROUTABLE_COMMANDS` extended with `goto` and `setVariable`. Wiring in
  `maybeIntercept` routes `goto` via `routeByThreadId` and `setVariable`
  via the existing `routeByVariableReference`.
- `aggregateThreads()` now returns `{ id, name, sessionName }` per
  thread — child's REAL id preserved unchanged; new `sessionName` field
  carries the child's SessionRecord name (e.g. `pwa-parent#tgt-0`) so
  users disambiguate when two children legitimately share an id.
- New `ChildRuntime.knownThreadIds: Set<number>` populated from:
  - every `threads` response (aggregateThreads + cold-path live refresh),
  - DAP `thread` events (`reason: 'started'` adds, `reason: 'exited'`
    removes),
  - `stopped` event `threadId` (additive — paused threads must be
    discoverable even before the first `threads` request).
- New `findChildOwningThread(threadId)`: fast-path cache hit O(children),
  cold-path parallel `Promise.allSettled` `threads` fan-out across every
  live child (worker spawned mid-session is observed because iteration
  is live, not snapshotted).
- `routeByThreadId` rewritten to use real ids. Throws structured
  `CliError`s instead of bare `Error`s:
  - `thread_id_required` when `--thread-id` is omitted (data:
    `{ availableThreads: [{ sessionName, sessionId, threadId, name? }, ...] }`).
  - `thread_not_owned` when no child claims the id (same data shape +
    `requestedThreadId`).
- `routeByVariableReference`: `evaluate` with neither `frameId` nor
  `variablesReference` falls back to the first child with non-empty
  `knownThreadIds`. Documented inline as the H-3a closure for the
  canonical top-level-expression hand-driven pattern.
- New `listAvailableThreads()` snapshot helper for error payloads (no
  live refresh — error path must be snappy).
- **Cleanup (atomic with the routing rewrite):**
  - Removed `parentVisibleThreadCounter` field (was a class-level
    monotonic counter for synthetic parent-visible thread ids).
  - Removed `ChildRuntime.threadMap: Map<number, number>` field +
    initialization in `handleStartDebugging`.
  - Removed `findChildByParentVisibleThreadId` helper (sole caller was
    `routeByThreadId`, switched to `findChildOwningThread`).

**Tests:**

- `tests/controller/childSessions.test.ts`: 8 new tests in describe
  block `ChildSessionCoordinator parent-name thread routing (H-3a)`.
  Multi-child harness (`createMultiChildHarness`) seeds deterministic
  per-child `threads` responses via the new
  `FakeAdapterEndpoint.responders` map.
  - `aggregateThreads returns real child ids with sessionName`
  - `routeByThreadId with undefined threadId throws thread_id_required
    with availableThreads`
  - `routeByThreadId forwards continue to the owning child unchanged
    (real id)`
  - `routeByThreadId resolves an unknown id via live `threads` refresh`
  - `routeByThreadId throws thread_not_owned with availableThreads when
    no child claims the id`
  - `goto is in ROUTABLE_COMMANDS and routes via routeByThreadId`
  - `setVariable is in ROUTABLE_COMMANDS and routes via
    routeByVariableReference`
  - `thread exited event removes the id from knownThreadIds`
- `tests/integration/jsDebugAdapter.test.ts`: new test
  `pwa-node parent-name routing: thread-scoped commands resolve to
  owning child without --show-children`. End-to-end CLI mirror of
  hand-driven Sequence A Steps 4–6 against a real js-debug pwa-node
  parent (gated on `provisionAdapterIntoTempEnv`; skipped if js-debug
  not provisioned).
- `tests/cli/sessionCommands.test.ts`: new test
  `thread-scoped commands against a child name return
  child_session_not_targetable (H-3a regression guard)` covering both
  the `stack` alias and the `dap continue` generated DAP command.
- `tests/controller/sessionManager.test.ts`: updated two pre-existing
  ChildSessionCoordinator tests that asserted the now-removed
  parent-visible counter contract:
  - `threads command aggregates across children with namespaced parent
    ids` → asserts both children's id:1 returned unchanged with
    distinct `sessionName`.
  - `stackTrace routes to the originating child using the namespaced
    thread id` → renamed to `...using real child thread ids`; each
    child reports a UNIQUE real id (11, 22) and `stackTrace` is
    asserted to forward `threadId` UNCHANGED.

## Composition with Plan 05-25

Plan 05-25 added a child→parent stopped/continued/terminated mirror in
`handleStartDebugging` (write-side: events flow up from child to the
parent's paused state). This plan adds parent→child routing in
`maybeIntercept` (read-side: commands flow down from the parent name to
the owning child). Both subscribe via independent `client.onEvent(...)`
calls in `handleStartDebugging` and coexist cleanly. No conflicts.

## Commits

| Task | Commit  | Description                                                         |
| ---- | ------- | ------------------------------------------------------------------- |
| 1    | 10e6d25 | feat(05-26): real-id thread routing for parent-name DAP commands (H-3a) |
| 2    | e29fe3f | test(05-26): integration test for pwa-node parent-name routing (H-3a) |
| 3    | 49fa863 | test(05-26): CLI regression guard + update obsolete remap tests (H-3a) |

## Test Results

```
Test Files  23 passed (23)
     Tests  195 passed | 5 skipped (200)
```

Baseline before plan: 185 passed | 5 skipped | 0 failed.
After plan: 195 passed | 5 skipped | 0 failed (+10 new tests, all
passing).

**Two unhandled-rejection "Errors" reported by vitest** (test files
still reported `passed`): originate from a pre-existing race in
`src/controller/server.ts:356` — the parent's own `client.onEvent`
handler issues `void manager.updatePausedState(...)` without a `.catch`
clause. The new pwa-node integration test exercises a `cleanup --purge`
teardown while the worker is still terminating, surfacing late
`stopped`/`continued`/`terminated` events whose paused-state update
fires `no_sessions` after the SessionRecord is gone. NOT a regression
introduced by this plan; should be filed as a separate hardening item
(`server.ts:356` should add `.catch(() => undefined)` matching the
plan-05-25 child mirror's swallow pattern).

## Deviations from Plan

### Drive-by Fix (Rule 2: missing critical functionality)

**`evaluate` top-level fallback in `routeByVariableReference`** — Found
during Task 2 integration. The plan's must_haves truth #1 explicitly
includes `evaluate --expression "typeof dapCliSelfHostDemo"` against
the parent in the canonical hand-driven flow, but neither the plan
behavior block nor the existing routing covered the case where
`evaluate` arrives with neither `--frame-id` nor
`--variables-reference` (the user types only `--expression`). Without
the fallback, the integration test failed with
`controller_unavailable: No child session owns evaluate target.` —
which is the same H-3a class symptom on a different code path.
Fix: when `command === 'evaluate'` and no reference/frameId is
present, route to the first child with non-empty `knownThreadIds`
(deterministic Map iteration order). Documented inline at the call
site. Filed under commit `e29fe3f` (task 2) since it surfaced there.

### Task 3 Scope Adjustment

**Items (a) parent-name `threads` aggregation and (b)
`thread_id_required` error shape live in
`tests/controller/childSessions.test.ts`, not
`tests/cli/sessionCommands.test.ts`.** The existing CLI harness in
`sessionCommands.test.ts` registers child SessionRecords via
`SessionManager.registerChild` only — it does NOT wire up an actual
`DapSessionRuntime` + `ChildSessionCoordinator` into the controller's
private `runtimes` Map. So a CLI `threads --name <parent>` against
that setup would fail with `session_unavailable` (no runtime attached)
before any routing/aggregation runs. Extending the CLI harness to
inject a runtime would require a non-trivial fakeAdapter feature
(openChildTransport + reverse-request reply) substantially exceeding
the plan's scope. The coordinator-layer coverage in
`childSessions.test.ts` (8 new tests in task 1) plus the real-adapter
end-to-end coverage in `jsDebugAdapter.test.ts` (task 2) collectively
cover the same surface — the controller's `routeDapRequest` is a
straight passthrough to `maybeIntercept`. Documented at the task-3
commit.

## Known Stubs

None.

## Threat Flags

None — the threat register in 05-26-PLAN.md
(`T-05-26-01`/`02`/`03`) accepted/mitigated all identified threats.
The drive-by `evaluate` fallback uses deterministic Map iteration
order (T-05-26-02 mitigation pattern); no new trust boundaries.

## Self-Check

- [x] `src/controller/childSessions.ts` modified — `parentVisibleThreadCounter` / `threadMap` / `findChildByParentVisibleThreadId` removed; `findChildOwningThread` / `listAvailableThreads` added; `goto` + `setVariable` in `ROUTABLE_COMMANDS`.
- [x] All commits exist:
  - `10e6d25` (task 1, feat)
  - `e29fe3f` (task 2, test)
  - `49fa863` (task 3, test)
- [x] `npm run typecheck` clean (only pre-existing `src/sessions/sessionStore.ts:63` deferred error remains — documented in `deferred-items.md`).
- [x] `npm test`: 195 passed | 5 skipped | 0 failed.

## Self-Check: PASSED

## Status

**PENDING: hand-driven verification by orchestrator** — Task 4
(`checkpoint:human-verify`) was NOT executed by the executor agent.
Per `.github/copilot-instructions.md` "Repo verification rules" the
orchestrator MUST perform Sequence A Steps 4–6 against the parent
name in a real terminal via `run_in_terminal` and append the verbatim
transcript to `05-UAT.md` under
`## Hand-Driven CLI Smoke (Wave 1.5 H-3 re-verify)` before this plan
is eligible to be marked `status: complete`.
