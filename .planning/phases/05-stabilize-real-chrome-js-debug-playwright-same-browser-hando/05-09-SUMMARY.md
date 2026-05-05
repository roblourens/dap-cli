---
phase: 05
plan: 09
subsystem: controller
tags: [gap-closure, child-sessions, pwa-chrome, handoff-smoke]
gap_closure: true
requires:
  - "Plan 05-08 helper provisionAdapterIntoTempEnv (commit 50c4843)."
provides:
  - "src/controller/childSessions.ts: ChildSessionCoordinator.awaitChildrenReady() public; fanOutSetBreakpoints surfaces per-child errors as a `warnings: Array<{sessionId,message}>` field on the response and gates on per-child readiness."
  - "tests/integration/playwrightInterop.test.ts: strict handoff smoke now uses provisionAdapterIntoTempEnv and dumps warnings on failure."
affects:
  - "Any caller that consumed `setBreakpoints` responses through the controller's child fan-out — the response shape gains an optional `warnings` field. Existing DAP `SetBreakpointsResponse` shape is unchanged at the breakpoints level."
tech-stack:
  added: []
  patterns:
    - "Per-child readiness promise: ChildRuntime.readyPromise resolves at lifecycle 'running' (full handshake done), rejects on markChildFailed. Wrapped immediately in a swallow .catch to avoid unhandled-rejection warnings before any awaitChildrenReady() consumer attaches."
    - "Fan-out aggregator surfaces per-child failures as structured warnings instead of silently dropping to an empty success."
key-files:
  created:
    - .planning/phases/05-stabilize-real-chrome-js-debug-playwright-same-browser-hando/deferred-items.md
  modified:
    - src/controller/childSessions.ts
    - tests/controller/sessionManager.test.ts
    - tests/integration/playwrightInterop.test.ts
decisions:
  - "Use Promise.allSettled (not Promise.all) inside awaitChildrenReady so a single failed child does not block fan-out to the surviving children — failures show up as warnings on the response instead."
  - "Wrap readyPromise with .catch(() => undefined) at construction. Without an early consumer, a child failure (rejection) would otherwise be an unhandled-rejection warning before fanOutSetBreakpoints attaches its allSettled."
  - "Keep the strict handoff smoke as the plan specified — a single setBreakpoints call that fails fast with warnings dumped — instead of building in retry/poll. The remaining failure mode is not a per-call timing race; see deferred-items.md."
metrics:
  duration: ~30 min
  completed: 2026-05-03
requirements_satisfied:
  - TEST-07 (partial — error-surface + readiness fixes shipped; strict smoke pass deferred)
---

# Phase 05 Plan 09: surface fan-out setBreakpoints errors and gate child readiness — Summary

One-liner: `ChildSessionCoordinator` now surfaces per-child `setBreakpoints` failures as a `warnings` array and waits for each child's full handshake (`configurationDone` done → lifecycle `running`) before fanning out. The `{ breakpoints: [] }` silent-success regression that masked gap #11 is fixed; the strict handoff smoke gets a clean diagnostic surface but does not yet pass end-to-end (deeper pwa-chrome script-load issue, see Deferred Issues).

## What changed

### `src/controller/childSessions.ts`

- **`ChildRuntime`** gained `readyPromise: Promise<void>` + `readySeen: boolean` + captured `resolveReady` / `rejectReady`. `readyPromise` is created with an attached swallow-`.catch` so a child failure cannot become an unhandled rejection before `awaitChildrenReady()` is observed.
- **`runChildLifecycle`** now resolves `readyPromise` after the lifecycle transition to `'running'` completes (i.e. after `configurationDone` and the original `launch`/`attach` response have both returned).
- **`markChildFailed`** rejects `readyPromise` with the underlying error so callers awaiting readiness see the cause.
- **New public `awaitChildrenReady()`** method: `await awaitPendingChildren()` then `Promise.allSettled` every known child's `readyPromise`. "Wait for them to settle one way or the other," not "fail if any failed."
- **`fanOutSetBreakpoints`** now:
  - Awaits `awaitChildrenReady()` first (closes the race where a child appears in `threads` but has not yet processed `configurationDone`).
  - Tracks per-child outcomes as a discriminated `ChildResult` union — successes carry the response, failures carry the error message.
  - Aggregates `warnings: Array<{ sessionId, message }>` from every failed child and attaches them to the response (still backward-compatible with DAP `SetBreakpointsResponse` because `warnings` is an optional additional field).
  - When every child errored or returned no `breakpoints` field, returns `{ breakpoints: [], warnings }` instead of silently dropping to `{ breakpoints: [] }`.

### `tests/controller/sessionManager.test.ts`

Two new tests in the existing `ChildSessionCoordinator` describe block:

- `setBreakpoints surfaces per-child errors as warnings instead of swallowing them` — two synthetic children, one `success`, one `success: false, message: 'boom'`. Asserts the aggregated response has at least one verified breakpoint AND `warnings.length === 1` with the failed child's `sessionId` and the error message.
- `awaitChildrenReady waits for handshake to finish before resolving` — verifies the child reaches lifecycle `'running'` synchronously after `awaitChildrenReady()` returns.

### `tests/integration/playwrightInterop.test.ts`

- Switched from the local `linkProvisionedJsDebug` helper to the shared `provisionAdapterIntoTempEnv(testEnv, 'js-debug')` from plan 05-08, in both `beforeAll` (best-effort) and inside the gated handoff test (with a `ctx.skip(...)` fallback when js-debug is not provisioned). The `linkProvisionedJsDebug` helper and its `mkdir`/`symlink`/`homedir` imports are removed.
- Extended the `breakpointsSetDataSchema` with the new optional `warnings` array.
- Failure messages on the strict `breakpoints set` assertion now interpolate the warnings JSON, so a future investigator sees per-child failures instead of `expected undefined to be defined`.

## Verification evidence

### `npx tsc --noEmit`

Exit 0. Clean.

### `npx vitest run tests/controller`

```
 Test Files  2 passed (2)
      Tests  31 passed (31)
   Duration  399ms
```

Includes both new `setBreakpoints surfaces per-child errors as warnings...` and `awaitChildrenReady waits for handshake to finish...` tests.

### `npm test` (default suite, no smoke env vars)

```
 Test Files  22 passed (22)
      Tests  154 passed | 5 skipped (159)
   Duration  ~4.05s
```

Gated tests still skip by default; nothing in the default suite was destabilized.

### `npm run test:smoke:handoff`

```
 ❯ tests/integration/playwrightInterop.test.ts (2 tests | 1 failed)
   ✓ coordinates Playwright browser action with dap-cli polling and inspection
   ✗ coordinates Playwright with the same Chromium target attached by js-debug
     → expected ≥1 breakpoint in setBreakpoints response; warnings=[]
```

Failure is now diagnostic-quality (`warnings=[]` printed in the message) rather than `expected undefined to be defined`. The non-handoff Playwright test still passes. **The strict assertion does NOT pass end-to-end** — see Deferred Issues below.

## Deviations from Plan

### [Rule 1 — Bug] Plan diagnosis incomplete

- **Found during:** Task 2 verification.
- **Issue:** Plan 05-09 diagnosed gap #11 as "fanOutSetBreakpoints swallows per-child errors and returns empty," and asserted the strict handoff smoke would pass once errors were surfaced and per-child readiness was gated.
- **Reality:** With both fixes applied (and even a 10 s polling retry attempted during diagnosis), the single js-debug pwa-chrome child responds to `setBreakpoints` with `{ breakpoints: [] }` (success, no error to surface as a warning). The plan-level fix is correct and necessary, but it is not sufficient on its own to make the strict handoff smoke pass.
- **Action:** Shipped the plan-level fix exactly as specified (Task 1 fully delivered, Task 2 wiring delivered). Logged the residual failure with full diagnostic evidence to `deferred-items.md` for a follow-up plan.
- **Out-of-scope reason:** The remaining failure is in either nested startDebugging coordination, webRoot/`file://` source-path mapping inside js-debug pwa-chrome, or post-`Debugger.enable` script-parsed timing inside the wrapper child. None of those are in plan 05-09's scope (single-file `src/controller/childSessions.ts` + the gated test) and all of them appear to share root cause with the sibling `launches Chrome in headless mode` test that 05-08 also flagged as failing.

### [Rule 2 — Critical functionality] Avoid unhandled rejection on readyPromise

- **Found during:** Task 1 implementation.
- **Issue:** A new `readyPromise` that rejects when a child fails would generate an unhandled-rejection warning before any caller attached `awaitChildrenReady()`. In the existing `attach failure marks child failed` test path, `markChildFailed` would reject before any consumer was wired up.
- **Fix:** Attach a `readyPromise.catch(() => undefined)` swallow handler at construction (right after the `new Promise(...)` call). The `awaitChildrenReady()` consumer uses `Promise.allSettled` so it sees the rejection regardless.
- **Files modified:** `src/controller/childSessions.ts`.
- **Commit:** `428635a`.

## Deferred Issues

The strict handoff smoke (`npm run test:smoke:handoff`) does not pass end-to-end after this plan. Full diagnosis with debug-log evidence is in `.planning/phases/05-stabilize-real-chrome-js-debug-playwright-same-browser-hando/deferred-items.md`. Summary:

- The single observed child returns `{ breakpoints: [] }` (no warnings, success) for `setBreakpoints` against `file://...simple-chrome-page/app.js`. Polling for 10 s does not change the response.
- Likely root causes (need follow-up plan): nested startDebugging not coordinated past one level; webRoot/`file://` source-path mapping in pwa-chrome; or post-`Debugger.enable` script-parsed timing in the wrapper-child case.
- Sibling test `launches Chrome in headless mode and verifies breakpoint inspection` (in `tests/integration/jsDebugAdapter.test.ts`) shows the same class of failure (10 s timeout waiting for stopped). The two should be fixed together.

## Out of Scope (explicitly per plan)

- Pre-existing lint warnings in `src/controller/childSessions.ts:243` (`prefer-const` on `client`) and `src/controller/server.ts:317` (`@typescript-eslint/unbound-method`) were present on `main` before this plan and are not introduced by 05-09's edits. Verified via `git stash && npm run lint` baseline check.

## Self-Check: PASSED

- `src/controller/childSessions.ts` modified — `awaitChildrenReady` is public, `fanOutSetBreakpoints` returns warnings: confirmed via grep.
- `tests/controller/sessionManager.test.ts` modified — two new tests for warnings + readiness: confirmed (31 tests, 2 added).
- `tests/integration/playwrightInterop.test.ts` modified — `provisionAdapterIntoTempEnv` import + use, warnings in schema: confirmed.
- Commits exist:
  - `428635a feat(05-09): surface fan-out setBreakpoints errors and gate on child readiness`
  - `9f9bb8e test(05-09): provision js-debug into handoff smoke; surface fan-out warnings`
- Default `npm test` and `npx tsc --noEmit` are green.
- Strict handoff smoke does NOT pass; documented in Deferred Issues.

## TDD Gate Compliance

Plan type was `execute` (not `tdd`). RED/GREEN/REFACTOR gate sequence not required. New unit tests in Task 1 were added in the same commit as the production code, which is acceptable for a non-TDD plan.
