---
phase: 11-paused-state-ergonomics-status-reflects-stopped-continued-ev
plan: 02
subsystem: cli
tags: [evaluate, auto-frame, ergonomics]
requirements: [PAUSED-02]
key-files:
  modified:
    - src/cli/commands/dapAliases.ts
    - src/cli/outputWriter.ts
    - src/cli/program.ts
    - src/cli/main.ts
    - src/testing/fakeAdapter.ts
    - tests/fixtures/fake-adapter-entry.ts
    - docs/AGENT-WORKFLOWS.md
    - README.md
  created:
    - tests/integration/evaluateAutoFrame.test.ts
decisions:
  - "Threaded a real `errorStream` through `OutputWriter` (new `warn(message)` method) instead of writing hints to `process.stderr` directly. Direct writes bypass the `MemoryStream` that `runCli` uses to capture stderr in tests, which would have left the auto-frame hints unobservable from integration tests."
  - "Skipped the multi-thread (`stoppedThreadIds.length > 1`) integration matrix row. `derivePausedStateFromStopped` only ever produces `[singleId]` or `[]` from real adapter input, so no fake-adapter-driven CLI scenario can populate >1 entry. The production code still handles the branch defensively (with the documented stderr hint) for any future change to the coercion contract."
metrics:
  tasks-completed: 3
  files-modified: 8
  files-created: 1
  tests-added: 5
---

# Phase 11 Plan 02: evaluate auto-resolves --frame-id from session status Summary

`dap-cli evaluate --expression '...' --name <session>` now works without `--frame-id` whenever the session is paused. The handler reads `sessions.status`, picks the topmost frame of the most-recently-stopped thread (or falls back through `threads → stackTrace`), and dispatches the DAP `evaluate` with the resolved `frameId`. Explicit `--frame-id` is unchanged.

## Result

- New private `resolveAutoFrameId(output, name)` helper in `src/cli/commands/dapAliases.ts` opens one controller client, reads status, and either: returns `stoppedThreadIds[0]`'s top frame id; falls back to `threads → stackTrace[0]` for `allThreadsStopped`; or returns `undefined` and emits a stderr hint on any failure or non-paused session.
- `OutputWriter` gained a `warn(message)` method backed by a new `errorStream` option (defaulting to `process.stderr`). `main.ts` and `program.ts` thread the stderr stream through so test harnesses (`runCli`'s `MemoryStream`) capture hints.
- Five new fake-adapter scripts (`evaluate-auto-frame`, `-explicit`, `-all-threads`, `-empty-threads`, `-not-paused`) added to BOTH `src/testing/fakeAdapter.ts` and the spawned `tests/fixtures/fake-adapter-entry.ts`. The spawned entry is what `--adapter fake` actually launches via `dapCore.ts:412`, so both registries must stay in sync.

## Tasks

| # | Description | Status |
|---|-------------|--------|
| 1 | Auto-resolve `frameId` in the `evaluate` handler when omitted on a paused session | done |
| 2 | Integration tests covering the auto-frame matrix via the fake adapter | done |
| 3 | Document the auto-frame behavior in AGENT-WORKFLOWS and README | done |

## Tests

`tests/integration/evaluateAutoFrame.test.ts` covers 5 of the 6 matrix rows (see Deviations):

1. paused with single stopped thread, no `--frame-id` → resolves frameId from stackTrace
2. explicit `--frame-id` is verbatim — no auto-resolution, no hints
3. paused with `allThreadsStopped` (empty `stoppedThreadIds`) → falls back to `threads → stackTrace`
4. not paused (no stopped event) → sends evaluate with no frameId, emits "session not paused" hint
5. auto-resolve failure (paused but `threads` returns `[]`) → falls back, emits "auto-frame failed" hint

Full suite: 371 tests passed, 7 skipped (pre-existing skips). No regressions in `tests/integration/fakeAdapterCli.test.ts` (existing `evaluate --frame-id 10` path).

## Verification

- `npx vitest run tests/integration/evaluateAutoFrame.test.ts` → 5/5 passing.
- `npx vitest run` (full suite) → 371 passed.
- `npm run build` → success.
- `grep -nE "auto-resolve|auto-selected|topmost frame|topmost paused frame" docs/AGENT-WORKFLOWS.md README.md` returns matches in both files.
- `npx tsc --noEmit` reports 3 pre-existing errors in `tests/cli/jsonOverrides.test.ts` (verified via `git stash` against the pre-plan baseline) — unrelated to this plan.

## Deviations from Plan

**1. [Rule 3 — auto-fix blocking issue] Threaded `errorStream` through OutputWriter / createProgram / main.**
Plan said hints could go to `process.stderr` directly OR via `output.warn(...)`. Direct writes bypass the test harness's `MemoryStream` so integration tests couldn't observe hints. Added `OutputWriter.warn(message)` and an `errorStream?` option on `createOutputWriter` and `createProgram`. `main.ts` now passes `streams.stderr` into `createProgram`. Three small files modified (`outputWriter.ts`, `program.ts`, `main.ts`) — touches the OutputWriter shape but only adds an optional method/option, no breaking change.

**2. [Scope cut] Dropped multi-thread `stoppedThreadIds: [1, 2]` integration test (plan matrix row 4).**
`derivePausedStateFromStopped` only emits `[singleId]` (single threadId) or `[]` (allThreadsStopped) — multi-thread accumulation is not currently a path through the system, so no CLI-driven fake-adapter scenario can populate `stoppedThreadIds.length > 1`. The production `resolveAutoFrameId` still implements the `> 1` branch with the documented `auto-selected frame from thread ${threadId}; ${N} threads paused — pass --thread-id or --frame-id to disambiguate` hint, so the behavior is correct if a future plan changes the coercion to accumulate. A unit-level test for the helper itself could lock this in but is out of scope for this plan.

## Self-Check: PASSED

- `src/cli/commands/dapAliases.ts` — added `resolveAutoFrameId`, modified `evaluate` action.
- `src/cli/outputWriter.ts`, `src/cli/program.ts`, `src/cli/main.ts` — added `warn` + threaded `errorStream`.
- `src/testing/fakeAdapter.ts` and `tests/fixtures/fake-adapter-entry.ts` — added 5 new scripts each.
- `tests/integration/evaluateAutoFrame.test.ts` — created with 5 cases.
- `docs/AGENT-WORKFLOWS.md`, `README.md` — contain sentinel phrases.
- All matrix tests pass; full suite green.
