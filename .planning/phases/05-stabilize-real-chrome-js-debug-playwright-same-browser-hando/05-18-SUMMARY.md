---
phase: 05-stabilize-real-chrome-js-debug-playwright-same-browser-hando
plan: 18
subsystem: protocol/event-cache + cli/events
tags: [gap-closure, hand-driven, event-cache, observability, H-2]
requires: [17]
provides:
  - two-ring-event-cache
  - events-include-exclude-filters
  - limit_exceeded_capacity-warning
affects:
  - src/protocol/eventCache.ts
  - src/cli/commands/dapCore.ts
  - src/controller/server.ts (already wired in commit 53de4aa)
tech-stack:
  added: []
  patterns:
    - priority-segregated bounded ring buffers (high/low) with merged cursor snapshot
    - client-side post-snapshot CLI filtering applied before --limit
key-files:
  created: []
  modified:
    - src/protocol/eventCache.ts
    - src/cli/commands/dapCore.ts
    - tests/protocol/eventCache.test.ts
    - tests/cli/jsonOutput.test.ts
decisions:
  - droppedBeforeCursor uses MAX of both rings, not MIN as plan worded — MIN collapses to 0 whenever either ring is untouched (the common case under loadedSource-heavy traffic), which would silently hide all eviction from pollers. MAX is the only value that lets callers detect that any data is missing.
  - Architecture-test resolution (gap discovered post-Task-1): keep the language-neutral architecture rule in tests/architecture/moduleBoundaries.test.ts and remove the two `js-debug` references from JSDoc comments in src/protocol/eventCache.ts. The literal `loadedSource` stays — it is a standard DAP event name, not js-debug-specific, and the architecture test does not flag it. Rationale and adapter-specific motivation belong in the plan/SUMMARY (which can freely reference js-debug), not in src/protocol/* code.
  - --include and --exclude filter values are case-sensitive (DAP spec is camelCase). Each list capped at 50 entries (T-05-18-02).
  - When a filter is active, the CLI fetches the full snapshot WITHOUT --limit, applies the filter, then slices the last N. This guarantees `--limit 10 --exclude loadedSource` returns 10 non-loadedSource events.
metrics:
  duration: ~resumed-mid-flight
  completed: 2026-05-04
status: tasks-complete-pending-human-verify
---

# Phase 05 Plan 18: H-2 Event Cache Two-Ring + CLI Filters Summary

Two-ring `DapEventCache` (priority-segregated bounded rings) so frequent low-priority events such as `loadedSource` can no longer evict critical state-change events (`stopped`, `thread`, `output`, `terminated`, `breakpoint`, `startDebugging`); CLI gains `--include` / `--exclude` event-name filters and an honest `warnings: ['limit_exceeded_capacity: …']` envelope field when `--limit` exceeds merged capacity.

## Tasks Completed

| Task | Description                                                                            | Commit    |
| ---- | -------------------------------------------------------------------------------------- | --------- |
| 1    | Two-ring DapEventCache with priority segregation (high 200 / low 50, defaults)         | `53de4aa` |
| 2    | CLI `--include` / `--exclude` filters + `limit_exceeded_capacity` warning              | `8913754` |
| —    | Architecture-test fix: remove `js-debug` from `src/protocol/eventCache.ts` comments    | `4bd90db` |

Task 3 is `checkpoint:human-verify` — execution stops here. Hand-driven Sequence A re-run is the orchestrator/user's responsibility.

## Resumed Mid-Flight

This plan was resumed by a continuation executor:
- Task 1 was already committed at `53de4aa` by the previous session.
- Uncommitted WIP existed in `src/cli/commands/dapCore.ts` and `tests/cli/jsonOutput.test.ts` implementing Task 2.
- WIP disposition: **KEEP**. Inspection showed the WIP correctly implemented every behavior bullet of Task 2 (filter parsing with 50-entry cap, post-snapshot client-side application before `--limit`, honest warning when `--limit > capacity`, `--include` then `--exclude` ordering). All 12 jsonOutput tests passed unmodified, including the 5 new tests. Committed as `8913754`.
- `src/controller/server.ts` already constructs `new DapEventCache({ highPriorityCapacity: 200, lowPriorityCapacity: 50 })` (line 348) — landed in `53de4aa`. No further server change needed.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 — Bug] Architecture test regression introduced by Task 1**
- **Found during:** Task 2 verification (`npm test`). Baseline was 215 passed | 5 skipped | 1 failed; the 1 failure was `tests/architecture/moduleBoundaries.test.ts > protocol modules remain language-neutral`, caused by `js-debug` references in JSDoc comments that landed in commit `53de4aa`.
- **Issue:** `src/protocol/*` must not contain language-specific tokens (`javascript`, `python`, `js-debug`, `debugpy`, `Playwright`). The `loadedSource` literal is fine (standard DAP event), but two JSDoc comments mentioned `js-debug`.
- **Choice:** Move the `js-debug` literal **out** of `src/protocol/eventCache.ts` (preferred over weakening the architecture rule — the rule is correct: protocol code is neutral DAP plumbing; adapter-specific motivation belongs in the plan / SUMMARY).
- **Fix:** Rewrote both comments to describe the behavior generically ("some adapters emit very frequent `loadedSource` events"; "loadedSource-heavy sessions"). The `loadedSource` set literal is unchanged — it is a standard DAP event name and the architecture test does not flag it.
- **Files modified:** `src/protocol/eventCache.ts`
- **Commit:** `4bd90db`

### Spec Deviations Documented in Code

**1. `droppedBeforeCursor` uses MAX, not MIN, of the two rings.** The plan said MIN; the implementer (Task 1) chose MAX with a comment block explaining that MIN collapses to 0 whenever either ring is untouched, which would silently hide eviction from pollers in the most common scenario (loadedSource flood with high-ring untouched). MAX preserves the field's contract: "earliest cursor at or below which data may be missing somewhere." Documented inline in `eventCache.ts` `recent()`.

## Threat Model Outcome

| Threat ID    | Mitigation Status |
| ------------ | ----------------- |
| T-05-18-01 (D — high-priority ring abuse) | Accepted as documented; high cap of 200 is large enough that a normal stop cycle (≤20 events) is never evicted in practice. Follow-up not needed yet. |
| T-05-18-02 (T — filter list parsing)      | Mitigated: `parseEventNameList` trims whitespace, drops empty entries, throws `usageError` if list exceeds `eventFilterMaxEntries` (50). |
| T-05-18-03 (I — adapter event bodies)     | Accepted: bodies stored as-is (unchanged from prior behavior). |

## Test Results

```
npm test
Test Files  23 passed (23)
Tests       216 passed | 5 skipped (221)
```

(Baseline before resume: 215 passed | 5 skipped | 1 failed. Net delta: +1 passing, -1 failing — the architecture test now passes.)

The `vitest` run reports 2 unhandled stderr "Errors" originating from `tests/integration/jsDebugAdapter.test.ts` (`pwa-node parent-name routing` test). These are async-after-completion errors from background DAP listeners and do **not** count as test failures (counters: 0 failed). They appear unrelated to plan 05-18 changes (eventCache and dapCore CLI filters); I leave them untouched per scope-boundary rule. If they need triage, file a separate gap.

Per-file results relevant to this plan:
- `tests/protocol/eventCache.test.ts` — all pass (Task 1 already verified; spot-checked again).
- `tests/cli/jsonOutput.test.ts` — 12/12 pass (5 new tests for `--include` / `--exclude` / warnings).
- `tests/architecture/moduleBoundaries.test.ts` — pass (was the 1 baseline failure; now green).

## Self-Check

- [x] `src/protocol/eventCache.ts` exists and contains the two-ring split (`highRing`, `lowRing`, `lowPriorityEventNames.has`).
- [x] `src/cli/commands/dapCore.ts` exposes `--include` and `--exclude` options with comma-parsed lists capped at 50.
- [x] `src/controller/server.ts:348` constructs `new DapEventCache({ highPriorityCapacity: 200, lowPriorityCapacity: 50 })`.
- [x] Commits exist: `53de4aa` (Task 1), `8913754` (Task 2), `4bd90db` (architecture-test fix).
- [x] No `js-debug`, `javascript`, `python`, `debugpy`, or `playwright` references remain in `src/protocol/*`.
- [x] Test suite: 216 passed, 0 failed.

## Self-Check: PASSED

## Next Step

Hand-driven Sequence A re-run (Task 3 checkpoint:human-verify) — see plan `<how-to-verify>` block. After human verification, append verbatim CLI output to `05-UAT.md` under `## Hand-Driven CLI Smoke (gap H-2 closure)` with `result: pass` and run `/gsd-progress` to advance.
