---
phase: 12-breakpoint-command-surface-add-breakpoints-list-breakpoints-
plan: 01
subsystem: controller, cli
tags: [breakpoints, controller-tracking, cli-surface]
requires: [phase 11 controller request infrastructure]
provides: [sessions.breakpoints.list, sessions.breakpoints.clear, in-memory bp tracking]
affects: [DapSessionRuntime, routeDapRequest, breakpoints command group]
tech-stack:
  added: []
  patterns: [post-success request hook, lazy-initialized tracking map, controller-method dispatch via handleDapRequest]
key-files:
  created:
    - tests/controller/breakpointsTracking.test.ts
    - tests/integration/breakpointsListClear.test.ts
  modified:
    - src/controller/requests.ts
    - src/controller/server.ts
    - src/cli/commands/dapAliases.ts
    - tests/fixtures/fake-adapter-entry.ts
    - README.md
    - docs/AGENT-WORKFLOWS.md
decisions:
  - name: best-effort tracking hook
    rationale: tracking failures must NEVER poison the user's primary setBreakpoints response, so the hook is wrapped in try/catch and lazily initializes the map
  - name: tracking key is resolved source.path
    rationale: matches what `breakpoints set` already stores (calls path.resolve before send) so list/clear filter strings match
  - name: initial breakpoints intentionally NOT tracked
    rationale: the createBeforeConfigurationDoneHook path runs before runtime is fully wired into routeDapRequest; out of scope per CONTEXT.md
metrics:
  duration: ~30 minutes
  completed: 2026-05-09
---

# Phase 12 Plan 01: Breakpoints list/clear + controller-side tracking

## One-liner
Adds controller-side in-memory breakpoint tracking and two new CLI subcommands (`breakpoints list`, `breakpoints clear`) so agents no longer have to track breakpoint state out-of-band or reach for raw `dap.request setBreakpoints { breakpoints: [] }`. Closes BPCMD-01 and BPCMD-02 from analysis.md §3.

## What changed

- **Controller:** new `TrackedBreakpointSource` shape on `DapSessionRuntime`; `routeDapRequest` refactored to capture a single `responseBody` local across both the parent-route and child-coordinator-intercepted branches, then post-success hook (`maybeTrackBreakpoints`) updates the tracked map. Two new dispatcher branches handle list/clear; the dispatcher's `isImplementedDapRequestMethod` allow-list is extended to admit them.
- **CLI:** two new subcommands under the existing `breakpoints` command group. Both `path.resolve(--source)` before sending so they match the tracking key.
- **Tests:** controller-level test covers failed-setBreakpoints (preserves prior entry) and direct dap.request empty-list (deletes entry); integration test covers the full set/list/filter/clear/list-after matrix end-to-end via the CLI.
- **Docs:** README quick-start note plus a new "Inspecting and clearing breakpoints" subsection in docs/AGENT-WORKFLOWS.md with a JSON envelope example.

## Deviations from Plan

**[Rule 3 - Blocking issue] Added `sessions.breakpoints.{list,clear}` to `isImplementedDapRequestMethod` allow-list.**
- **Found during:** Task 1 verify
- **Issue:** First test run failed with `controller_unavailable: sessions.breakpoints.list is not implemented by the controller yet.` even though the dispatcher branch was added.
- **Fix:** Discovered `handleClientRequest` gates `handleDapRequest` behind a separate `isImplementedDapRequestMethod` allow-list at server.ts:1378. Added the two new method names to it.
- **Files modified:** `src/controller/server.ts`
- **Commit:** 36e07be

No other deviations — plan executed as written. No authentication gates encountered.

## Verification

- `npx vitest run tests/integration/breakpointsListClear.test.ts tests/controller/breakpointsTracking.test.ts`: 4 passed.
- `npx vitest run` (full suite): 375 passed, 7 skipped — no regression.
- `npm run build`: exit 0.

Hand-driven smoke: deferred per user instruction.

## Self-Check: PASSED
- src/controller/requests.ts: FOUND (added 2 method literals)
- src/controller/server.ts: FOUND (TrackedBreakpointSource + handlers + maybeTrackBreakpoints)
- src/cli/commands/dapAliases.ts: FOUND (2 new subcommands)
- tests/controller/breakpointsTracking.test.ts: FOUND
- tests/integration/breakpointsListClear.test.ts: FOUND
- tests/fixtures/fake-adapter-entry.ts: FOUND (3 new scripts: bp-list-clear, bp-tracking-failure, bp-tracking-empty)
- README.md, docs/AGENT-WORKFLOWS.md: FOUND
- Commit 36e07be: FOUND
