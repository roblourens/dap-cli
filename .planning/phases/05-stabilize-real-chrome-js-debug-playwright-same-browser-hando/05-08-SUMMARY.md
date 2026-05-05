---
phase: 05
plan: 08
subsystem: testing
tags: [test-infra, gap-closure, chrome, js-debug]
gap_closure: true
requires:
  - User has run `npm run setup-adapters` (or has js-debug present in DAP_CLI_HOME).
provides:
  - "src/testing/tempEnv.ts: `provisionAdapterIntoTempEnv(target, adapterId, options?)` — mirrors a built-in adapter into a tmp DAP_CLI_HOME (symlink, copy fallback). Also mirrors config/adapters.json when present."
affects:
  - Future smoke/integration tests that need a real adapter inside a self-contained tmp env (chrome-children-smoke, the strict Playwright handoff smoke planned in 05-09, etc.)
tech-stack:
  added: []
  patterns:
    - "Test fixtures are responsible for staging external assets into the tmp DAP_CLI_HOME — never reach into the host's `~/.dap-cli` from runCli-driven tests."
key-files:
  created:
    - src/testing/tempEnv.ts (helper expanded)
    - tests/testing/tempEnv.test.ts
  modified:
    - tests/integration/jsDebugAdapter.test.ts
decisions:
  - "Symlink-first, copy-fallback: keeps the helper instant on Unix while remaining safe in restricted environments. Tracked via the returned `mode` field for diagnostics."
  - "Mirror `config/adapters.json` opportunistically — the registry merges built-ins with this file, so a tmp env without it can quietly diverge from what the user actually exercises."
  - "Missing source = clear error pointing at `npm run setup-adapters`. Replaces the opaque `js_debug_not_found` that bubbled out of the registry mid-test."
  - "When the helper throws, the consuming test calls `ctx.skip(...)` rather than failing — matches the existing convention that gated smokes are opt-in and require local prerequisites."
  - "Out-of-scope test (`launches Chrome in headless mode`) was left alone per plan instruction; its pre-existing flakiness is unrelated to gap #10."
metrics:
  duration: ~10 min
  completed: 2026-05-03
requirements_satisfied:
  - TEST-07
---

# Phase 05 Plan 08: Provision js-debug into chrome-children-smoke tmp env — Summary

One-liner: Added `provisionAdapterIntoTempEnv` that mirrors a user-installed built-in adapter (with `config/adapters.json`) into a tmp DAP_CLI_HOME, and wired it into the `chrome-children-smoke` test that was failing with `js_debug_not_found` since plan 05-04 because the gated smoke had never actually been run.

## What changed

### `src/testing/tempEnv.ts` — helper added

Exported async function:

```ts
export async function provisionAdapterIntoTempEnv(
  target: TempDapCliEnv,
  adapterId: string,
  options?: { sourceDapCliHome?: string },
): Promise<{ source: string; destination: string; mode: 'symlink' | 'copy'; copiedAdapterConfig: boolean }>;
```

Behavior:
- Default `sourceDapCliHome` = `process.env.DAP_CLI_HOME ?? ~/.dap-cli`.
- Throws an actionable error if `<sourceHome>/adapters/<adapterId>` doesn't exist (with the exact `npm run setup-adapters` hint).
- Idempotent: removes any prior destination before linking/copying.
- Symlink-first (`fs.symlink(..., 'dir')`); copy fallback via `fs.cp(..., { recursive, dereference })`.
- Also mirrors `<sourceHome>/config/adapters.json` to the tmp env when present (correct path per `src/adapters/config.ts`, not the plan-text path of `<home>/adapters.json` — see Deviations).

### `tests/testing/tempEnv.test.ts` — new

5 tests, all green:
- mirrors source adapter directory (symlink or copy mode)
- idempotent re-provisioning
- throws clear error when source missing (regex-checked message)
- mirrors `config/adapters.json` when present
- skips config copy when source has none

### `tests/integration/jsDebugAdapter.test.ts` — chrome-children-smoke wired

Added a `provisionAdapterIntoTempEnv(testEnv, 'js-debug')` call at the top of the gated smoke. On failure (no `setup-adapters`), the test calls vitest's `ctx.skip(...)` with the helper's error message instead of bombing out later with a deep `js_debug_not_found`.

The sibling `launches Chrome in headless mode` test (which bypasses `runCli` and reaches into the user's real `~/.dap-cli` via `AdapterRegistry`) was left alone per plan instruction. It still fails today for an unrelated reason (10s timeout waiting for `stopped`/`terminated`); that's outside the scope of this gap-closure.

## Verification evidence

### Unit tests (`tests/testing/tempEnv.test.ts`)

```
 ✓ tests/testing/tempEnv.test.ts (5 tests) 14ms
 Test Files  1 passed (1)
      Tests  5 passed (5)
```

### `npm run test:smoke:chrome` (DAP_CLI_RUN_BROWSER_SMOKES=1)

```
 ❯ tests/integration/jsDebugAdapter.test.ts (6 tests | 1 failed | 1 skipped) 21158ms
   ✓ js-debug adapter integration > resolves js-debug as a provisioned built-in adapter descriptor 14ms
   ✓ js-debug adapter integration > launches Node.js app with js-debug and verifies breakpoint inspection 191ms
   ✓ js-debug adapter integration > launches TypeScript output and verifies source-map breakpoint inspection  10167ms
   × js-debug adapter integration > launches Chrome in headless mode and verifies breakpoint inspection 10128ms   <-- pre-existing, OUT OF SCOPE for plan 05-08
   ✓ js-debug adapter integration > pwa-chrome attach surfaces ≥1 child session and non-empty threads through the controller  658ms   <-- target test, now GREEN end-to-end
   ↓ js-debug adapter integration > launches Electron main process and verifies breakpoint inspection
```

Target test passes in 658ms — confirms `provisionAdapterIntoTempEnv` correctly stages js-debug into the tmp env, the controller launches the real headless Chromium pwa-chrome session, child SessionRecord(s) appear under the parent, and `request threads` returns ≥1 thread aggregated through the ChildSessionCoordinator.

### Default suite (no smoke env)

```
 ✓ tests/testing/tempEnv.test.ts (5 tests) 14ms
 ✓ tests/integration/jsDebugAdapter.test.ts (6 tests | 3 skipped) 433ms
 Test Files  2 passed (2)
      Tests  8 passed | 3 skipped (11)
```

Gated tests still skip by default; nothing in the default suite was destabilized.

### Typecheck

`npx tsc --noEmit` → exit 0.

## Deviations from Plan

### [Rule 1 — Bug] adapters.json source path is `<home>/config/adapters.json`, not `<home>/adapters.json`

- **Found during:** Task 1 implementation
- **Issue:** Plan said to mirror `<sourceHome>/adapters.json`, but `src/adapters/config.ts:51` resolves the path as `path.join(home, 'config', 'adapters.json')`. Mirroring the plan-text path would have copied a file that never exists and silently never copied the real one.
- **Fix:** Helper reads from `<sourceHome>/config/adapters.json` and writes to `<targetHome>/config/adapters.json`. Same intent, correct path.
- **Files modified:** `src/testing/tempEnv.ts`
- **Commit:** `50c4843`

### Test API: `ctx.skip(reason)` instead of module-level flag

- **Found during:** Task 2 implementation
- **Issue:** Plan suggested either `return ctx.skip()` or a `beforeAll`-set module-level flag. vitest 3.x's task context exposes `ctx.skip(reason?)` directly inside the test body.
- **Fix:** Used `(ctx) => { ... ctx.skip(message); return; }` inline. Cleaner than a module-level flag and propagates the helper's error message into the skip reason for actionable diagnostics.
- **Commit:** `a106e6b`

## Out of Scope (explicitly per plan)

- The sibling test `launches Chrome in headless mode and verifies breakpoint inspection` still uses `AdapterRegistry().resolve('js-debug')` directly + `startServerSocketAdapter` against the user's `~/.dap-cli`. The plan says "leave it alone — fixing it is out of scope for this gap-closure plan." Today it times out at 10s waiting for `stopped or terminated`. This is a pre-existing failure unrelated to gap #10 / plan 05-08, and a candidate for a follow-up plan.

## Handoff Notes for Plan 05-09

- The Playwright handoff smoke (gap #11) is the next consumer of `provisionAdapterIntoTempEnv`. Wire it the same way at the top of the gated test:

  ```ts
  try {
    await provisionAdapterIntoTempEnv(testEnv, 'js-debug');
  } catch (error) {
    ctx.skip(`js-debug not provisioned — ${(error as Error).message}`);
    return;
  }
  ```

- The helper is symlink-first; if 05-09 runs Playwright with a fresh Chromium profile inside the tmp env, the symlinked `js-debug` directory is read-only from the perspective of test cleanup (only the symlink, not the source, is removed). Safe.

- If 05-09 needs additional adapters (e.g. `debugpy`), the same helper works — call it with `'debugpy'` as the adapter ID. No changes needed.

## Self-Check: PASSED

- `src/testing/tempEnv.ts` exists ✓ (helper + types exported)
- `tests/testing/tempEnv.test.ts` exists ✓ (5 tests pass)
- `tests/integration/jsDebugAdapter.test.ts` modified ✓ (provisioning wired into chrome-children-smoke)
- Commit `50c4843` exists ✓ (`feat(05-08): add provisionAdapterIntoTempEnv helper`)
- Commit `a106e6b` exists ✓ (`test(05-08): provision js-debug into chrome-children-smoke tmp env`)
- `npm run test:smoke:chrome` chrome-children-smoke target test green ✓
