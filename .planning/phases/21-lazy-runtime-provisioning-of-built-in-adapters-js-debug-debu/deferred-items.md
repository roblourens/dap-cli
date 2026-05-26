# Deferred Items — Phase 21 / Plan 21-01

Issues observed during plan execution that are out of scope for this plan.
Per copilot-instructions.md scope rules, these are NOT auto-fixed by the executor.

## Preexisting test failures (unrelated to 21-01)

### `tests/adapters/registry.test.ts > includes debugpy as a built-in adapter`
- **Failure:** `CliError: debugpy adapter is not installed.`
- **Root cause:** The test eagerly invokes `AdapterRegistry.resolve('debugpy')`, which calls `createDebugpyDescriptor()` → `resolveDefaultDebugpyPythonPath()` and throws if a `python` with `debugpy` is not on PATH.
- **Verified preexisting:** Confirmed by stashing the 21-01 working-tree changes and re-running the test — fails identically on the parent commit `92bab8e` (Task 4 head).
- **Phase 21 relevance:** This test will become obsolete once 21-04 lazy-provisions debugpy. The eager-resolve assertion in this test is the exact behaviour 21-04 is meant to eliminate. Leaving in place for now; the 21-04 plan should rewrite or replace it.

### `tests/adapters/delve.test.ts` — 4× TS18048
- **Errors:** Lines 46, 47, 88, 89 — `'error.diagnostics' is possibly 'undefined'`.
- **Verified preexisting:** Same lines, same code, on parent commit.
- **Scope:** Unrelated to provisioning primitives. Should be cleaned up in a follow-up `chore(tests):` commit or by 21-06's `delve` rework.

## Preexisting test failures (unrelated to 21-03)

### `tests/integration/debugpyAdapter.test.ts` — 2× CliError
- **Failure:** `CliError: debugpy adapter is not installed.` (same root cause as the registry test above).
- **Verified preexisting:** Re-ran the same tests against the parent commit `396675e` after stashing 21-03 changes — same 2 failures.
- **Phase 21 relevance:** Disappears once 21-04 lazy-provisions debugpy through `createDebugpyDescriptor`.

### `tests/integration/delveAdapter.test.ts` — 3× CliError
- **Failure:** `confirm()` throws `Confirmation required but stdin is not a TTY.` because `createDelveDescriptor` invokes `provisionDelve` synchronously when no `dlv` is on PATH.
- **Verified preexisting:** Same 3 failures on parent commit `396675e`.
- **Phase 21 relevance:** Disappears once 21-06 reworks the delve descriptor (or once these integration tests are updated to pre-warm `DAP_CLI_HOME` via `setup-adapters` / `DAP_CLI_ASSUME_YES=1`).

## Discovered during 21-05

### `fromCache` semantics on under-lock cache hit (provisionJsDebug / provisionDelve / provisionDebugpy)
- **Discovered during:** `tests/adapters/provision/concurrent.test.ts` (D-08).
- **Behavior:** When N callers race against an empty cache, exactly one downloads (D-08 lockfile serialization). The other N-1 enter the lock, the under-lock double-check (`hasConsentMarker && entrypointsExist`) sees the install completed and `return`s from the inner closure, but the outer function unconditionally returns `fromCache: false`. So all N callers report `installed` to the user even though only one actually downloaded.
- **Fix sketch:** Track a `cachedAfterLock` flag inside the `withAdapterLock` closure; set it to `true` in the double-check branch; use it in the outer return.
- **Why deferred:** Plan 21-05's phase constraints say "Do NOT modify provisioning source files in `src/adapters/provision/*`." The concurrent test now asserts the observable D-08 contract (`hitCount === 1`, all `installRoot` equal) and skips the `fromCache` distribution assertion.
- **Affected files:** `src/adapters/provision/jsDebug.ts`, `src/adapters/provision/delve.ts`, `src/adapters/provision/debugpy.ts`.
