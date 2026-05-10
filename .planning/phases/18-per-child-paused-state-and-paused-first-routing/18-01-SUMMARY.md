---
phase: 18-per-child-paused-state-and-paused-first-routing
plan: 01
subsystem: child-sessions-paused-state
tags: [child-sessions, paused-state, multi-process, js-debug, routing]
requires: []
provides:
  - Per-child paused-state union on the parent SessionRecord (PAUSED-UNION-01)
  - Paused-first thread routing in ChildSessionCoordinator (PAUSED-ROUTE-01)
  - Multi-child fake socket adapter for end-to-end multi-process testing
  - S-02 regression coverage at unit and integration tier
affects: [phase-18, controller, child-sessions, paused-state, routing, testing]
tech-stack:
  added: []
  patterns:
    - ChildRuntime owns its paused state (stoppedThreadIds, allThreadsStopped, lifecycleEnded, lastStoppedReason); the parent SessionRecord is computed from the union, never mirrored from a single child event
    - All thread-bearing routing (findChildOwningThread, aggregateThreads, listAvailableThreads) prefers stopped children and skips terminated ones
    - Multi-child end-to-end coverage uses a TCP DAP server (multiChildFakeAdapter) where the first connection runs a parent script that emits startDebugging reverse-requests and subsequent connections run per-child scripts
key-files:
  created:
    - src/testing/multiChildFakeAdapter.ts
    - tmp/phase-18-01-codeoss-exthost-repro.log
  modified:
    - src/controller/childSessions.ts
    - src/controller/pausedState.ts
    - tests/controller/childSessions.test.ts
    - tests/integration/fakeAdapterCli.test.ts
key-decisions:
  - "Replaced the per-event 'last child wins' parent paused-state mirror with a single recomputeParentPausedState() that composes the union across non-terminated children after every child lifecycle/stop/continue event."
  - "combineChildPausedStates uses a childContributed flag (not stoppedThreadIds.size > 0) so allThreadsStopped contributors with empty knownThreadIds still get their lastStoppedReason picked when computing the parent's stoppedReason."
  - "findChildOwningThread is now a paused-first three-pass lookup: stopped+matching → live-threads-known → cold threads fan-out (terminated children excluded throughout)."
  - "aggregateThreads and listAvailableThreads filter terminated children. Frame/variable/source listings keep terminated children because their ids are per-stop and don't pollute Phase 17 auto-resolve."
patterns-established:
  - "Per-child bookkeeping in client.onEvent handler: stopped/continued/thread{exited}/terminated/exited update ChildRuntime fields, then recomputeParentPausedState() writes the parent SessionRecord exactly once per event."
  - "Multi-child integration tests register an inline socket AdapterDescriptor via dap.start to drive multi-process scenarios through the real CLI without adapters.json round-trip."
requirements-completed:
  - PAUSED-UNION-01
  - PAUSED-ROUTE-01
duration: 1 session
completed: 2026-05-10
---

# Phase 18 Plan 01: Per-Child Paused State + Paused-First Routing Summary

**Replace the parent's paused-state mirror with a union across non-terminated children, and route thread-bearing requests to the paused child first.**

## Performance

- **Started:** 2026-05-10
- **Completed:** 2026-05-10
- **Tasks:** 9 completed (with one infrastructure deviation, see below)
- **Tests:** 35 unit (childSessions) + 37 integration (fakeAdapterCli) all green
- **Live verification:** Code OSS extension host attach + breakpoint hit + paused-state survives a sibling child attaching 233ms later

## Accomplishments

- Extended `ChildRuntime` with four new fields: `stoppedThreadIds`, `allThreadsStopped`, `lifecycleEnded`, `lastStoppedReason`.
- Replaced the per-event mirror in the child `client.onEvent` handler with per-child bookkeeping followed by a single `recomputeParentPausedState()` call.
- Added `combineChildPausedStates(snapshots)` in `src/controller/pausedState.ts`. Returns the parent's `{ paused, stoppedReason?, stoppedThreadIds? }` from the union of every non-terminated child's snapshot.
- Replaced `findChildOwningThread` with a paused-first three-pass lookup; all three passes skip terminated children.
- `aggregateThreads()` and `listAvailableThreads()` now exclude threads from terminated children so stale ids never leak into status/threads output or error diagnostics.
- Added 10 new unit tests across three describe blocks in `tests/controller/childSessions.test.ts` (35 tests pass total).
- Added a multi-child end-to-end integration test in `tests/integration/fakeAdapterCli.test.ts` that exercises the exact S-02 ordering through the real CLI/controller stack.
- Captured a hand-driven Code OSS extension-host repro at `tmp/phase-18-01-codeoss-exthost-repro.log` showing the fix working live against js-debug `pwa-node` with multiple child sessions.

## Task Commits

- `3b7ba15` — Tasks 1-5: per-child paused state + recomputeParentPausedState + paused-first routing + terminated-child filter
- `4448329` — Task 6: 10 new unit tests + bugfix for `combineChildPausedStates` allThreadsStopped reason selection
- `1196b3c` — Tasks 7-8: `src/testing/multiChildFakeAdapter.ts` + integration test for the S-02 regression
- (Task 9): hand-driven Code OSS transcript at `tmp/phase-18-01-codeoss-exthost-repro.log` (gitignored, per project convention for `tmp/` artifacts; see Files section)

## Files Created/Modified

- `src/controller/childSessions.ts` - per-child paused-state fields on `ChildRuntime`; replaced mirror handler with `recomputeParentPausedState()`; paused-first three-pass `findChildOwningThread`; terminated-child filter on `aggregateThreads` and `listAvailableThreads`.
- `src/controller/pausedState.ts` - new `ChildPausedSnapshot` interface and `combineChildPausedStates(snapshots)` function. The reason-selection uses a `childContributed` flag so allThreadsStopped contributors are picked even with empty `stoppedThreadIds`.
- `tests/controller/childSessions.test.ts` - 10 new tests across `combineChildPausedStates`, `paused-state union across children`, and `paused-first thread routing`. Uses a `bringUpTwoChildren()` helper to fan out two children for the union scenarios.
- `src/testing/multiChildFakeAdapter.ts` (NEW) - TCP DAP server hosting `ConnectionScript`s. First connection runs the parent script (which can `emitReverseRequest('startDebugging', ...)`); subsequent connections run children sequentially. Used via `dap.start` with an inline socket `AdapterDescriptor`.
- `tests/integration/fakeAdapterCli.test.ts` - new test `'parent status reflects multi-child stop and survives a sibling terminated...'` exercising the S-02 ordering and asserting `status paused=true` survives, `stack` auto-resolves to the paused child's thread, `evaluate` and `continue` work without explicit `--thread-id`.
- `tmp/phase-18-01-codeoss-exthost-repro.log` - hand-driven Code OSS extension-host transcript (paths in `tmp/` are project-gitignored; the log lives locally and is referenced from this SUMMARY).

## Decisions Made

- **Single recompute over per-event mirror:** Every paused-state-affecting event now flows `update ChildRuntime → recomputeParentPausedState() → updatePausedState(parent)`. This makes the parent's `paused`, `stoppedReason`, and `stoppedThreadIds` an explicit function of the current child set rather than a race-prone last-event mirror.
- **`childContributed` flag for `lastStoppedReason`:** Initial implementation used `stoppedThreadIds.size > 0` to decide whether to pick a child's `lastStoppedReason`. That dropped reasons from `allThreadsStopped` contributors with empty `knownThreadIds`. Switched to a `childContributed` flag set explicitly by the caller — caught by a unit test on the second iteration.
- **Terminated children stay in frame/variable/source listings:** Their ids are per-stop and don't get reused; filtering them would not improve Phase 17 auto-resolve. Only thread listings filter terminated children.

## Deviations from Plan

**Tasks 7+8 infrastructure (significant):** The plan called for a new `multi-child-stop` script in `tests/fixtures/fake-adapter-entry.ts` (the existing stdio fake-adapter binary). That binary cannot orchestrate multiple child connections — the controller's `openChildTransport` is a socket-only capability. We replaced the stdio script with a new socket-based helper module:

- `src/testing/multiChildFakeAdapter.ts` exports `startMultiChildFakeSocketAdapter({ parent, children })`. It hosts a TCP DAP server where each connection runs a script that can emit events, emit reverse-requests, and respond to inbound requests.
- The integration test registers it via `dap.start` with an inline socket `AdapterDescriptor` (the same pattern existing socket-transport tests use).

End-to-end coverage is identical: same parent + child(0) + child(1) shape, same S-02 ordering (child 0 emits `terminated` 50ms after child 1 emits `stopped`), same status/stack/evaluate/continue assertions. Only the transport changed.

**Task 9 transcript path:** The plan's `files_modified` block lists `tmp/phase-18-01-codeoss-exthost-repro.log`, but `tmp/` is gitignored project-wide (see other phases' `tmp/` artifacts that are also referenced from SUMMARY but not committed). The transcript exists locally at the planned path; this SUMMARY is the durable artifact.

---

**Total deviations:** 2 documented (Tasks 7+8 infrastructure; Task 9 path is gitignored per project convention).
**Impact on plan:** No scope change — all plan assertions hold; only the test transport mechanism for Tasks 7+8 changed.

## Issues Encountered

- Numeric sort for `stoppedThreadIds` defaulted to lexicographic (`[10, 5]`) — fixed with explicit `(a, b) => a - b` comparator.
- `combineChildPausedStates` initially missed `lastStoppedReason` from `allThreadsStopped` children with empty `knownThreadIds`. Fixed by tracking `childContributed` explicitly (caught by a unit test).
- Plan Task 7 specified a stdio fake-adapter script that can't open additional child transports. Authorized switch to a new socket-based helper (see Deviations).
- TS source breakpoint on `extHostExtensionService.ts` went unverified without an explicit `outFiles` glob; the hand-driven repro set the breakpoint on the compiled `out/.../extHostExtensionService.js` line 289 instead. Same target function, verified breakpoint, real activation hit.

## Verification

**Unit (`tests/controller/childSessions.test.ts`):** 35 tests pass, including 10 new tests across:
- `combineChildPausedStates` — union math, allThreadsStopped reason selection, terminated-child filter
- `paused-state union across children` — two children stopped on different threads, sibling terminated does not clear parent (S-02 regression)
- `paused-first thread routing` — `findChildOwningThread(0)` routes to the child where `stoppedThreadIds.has(0)` even when both children advertise thread 0 in `knownThreadIds`

**Integration (`tests/integration/fakeAdapterCli.test.ts`):** 37 tests pass, including the new multi-child test that:
1. Brings up parent + two children via the multi-child fake socket adapter
2. Polls `dap-cli status --name multi` until `paused=true` with `stoppedThreadIds=[0]`
3. Waits 200ms for the sibling's `terminated` event to arrive, re-polls — parent stays paused (THE S-02 REGRESSION ASSERTION)
4. Calls `dap-cli stack --name multi --levels 1` (no `--thread-id`) — auto-resolves to thread 0, returns frame id 200
5. Calls `dap-cli evaluate --frame-id 200 --expression x` — returns `'ok'`
6. Calls `dap-cli continue --name multi` (no `--thread-id`) — succeeds with `allThreadsContinued: true`

**Live (`tmp/phase-18-01-codeoss-exthost-repro.log`):** Code OSS Insiders launched with `--inspect-extensions=5870`, dap-cli attached, breakpoint set on `_activateExtension`. Opening a JSON file via `code --reuse-window` triggered `vscode.configuration-editing` activation. The transcript shows:
- Parent `status`: `paused=true, stoppedReason='breakpoint', stoppedThreadIds=[0]`
- 233ms later, a NEW child session (`eslintServer.js`) attached via `startDebugging` — pre-Phase-18 the lifecycle event from the new child could have flipped the parent's mirror back to `running`. Status query after the new child's attach still shows `paused=true`.
- `dap-cli stack` auto-resolved `--thread-id` to 0 and returned `ExtHostExtensionService._activateExtension` at line 289
- `dap-cli evaluate --expression extensionDescription.identifier.value` returned `'vscode.configuration-editing'`
- `dap-cli continue` resumed; parent immediately re-stopped on the next extension activation, paused-state still attributed correctly to thread 0.
