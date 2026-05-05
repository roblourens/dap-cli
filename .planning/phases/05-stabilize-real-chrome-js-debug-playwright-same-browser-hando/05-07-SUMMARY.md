---
phase: 05-stabilize-real-chrome-js-debug-playwright-same-browser-hando
plan: 07
subsystem: protocol/lifecycle, testing/fakeAdapter
tags: [stability, lifecycle, fake-adapter, gap-closure, uat-14]
gap_closure: true
requirements: [TEST-07]
key-files:
  modified:
    - src/protocol/lifecycle.ts
    - src/controller/server.ts
    - src/cli/commands/dapCore.ts
    - src/testing/fakeAdapter.ts
    - tests/fixtures/fake-adapter-entry.ts
    - tests/protocol/lifecycle.test.ts
    - tests/integration/fakeAdapterCli.test.ts
decisions:
  - "Per-stage handshake timeout uses a fresh budget per Promise.race rather than tracking total elapsed handshake time — simpler and sufficient for bounding adapter unresponsiveness."
  - "Fake adapter entry script signals validation failure by emitting framed `output` + `terminated` events and ending stdout, so the existing DapTransportClosedError path surfaces it as a structured CLI error without needing a brand new error code."
metrics:
  duration: ~25 minutes
  completed: 2026-05-03
---

# Phase 05 Plan 07: Bound lifecycle handshake + fake-adapter mode validation Summary

Closes UAT gap 14: a malformed `launch` request against an attach-only fake script no longer hangs the controller — it returns a structured failure in tens of milliseconds and the controller continues serving subsequent requests.

## What was built

**Task 1 — Bounded DAP lifecycle handshake.** `DapLifecycleController` now accepts `DapLifecycleControllerOptions { handshakeTimeoutMs }` (default 10s) and races each of `initialize`, `launch`/`attach`, the `initialized` event wait, and `configurationDone` against a per-stage timeout. On timeout, the controller marks `state.lifecycle = 'failed'` and throws a new exported `DapLifecycleHandshakeTimeoutError` carrying `{ stage, timeoutMs }`. The controller error funnel in [src/controller/server.ts](src/controller/server.ts) maps this to a CLI error with `code: 'lifecycle_handshake_timeout'` and category `adapter`, with diagnostics describing which stage stalled.

**Task 2 — Fake adapter script ↔ mode validation.** [src/testing/fakeAdapter.ts](src/testing/fakeAdapter.ts) now exports `validateScriptForMode(script, mode)` and accepts an optional `mode` argument on `createFakeAdapterTransport` and `startFakeSocketAdapter` so callers can fail fast before opening any DAP transport. The CLI's spawned fake adapter entry process [tests/fixtures/fake-adapter-entry.ts](tests/fixtures/fake-adapter-entry.ts) accepts a new `--mode <launch|attach>` flag and on mismatch writes a stderr message, emits framed `output` + `terminated` events, and ends stdout with exit code 2 — so the controller's pending `initialize` request resolves via the existing `DapTransportClosedError` path. `createFakeDescriptor` in [src/cli/commands/dapCore.ts](src/cli/commands/dapCore.ts) threads the request mode through both the `launch` and `attach` command paths.

## Tests added

- [tests/protocol/lifecycle.test.ts](tests/protocol/lifecycle.test.ts): three new tests — initialize-timeout, configurationDone-timeout, and a happy-path-with-timeout test — using `vi.useFakeTimers()` and `vi.advanceTimersByTimeAsync`. Existing tests updated to flush a few microtasks (the new `Promise.race(...).finally(...)` wrapper adds microtask hops before subsequent DAP requests are dispatched).
- [tests/integration/fakeAdapterCli.test.ts](tests/integration/fakeAdapterCli.test.ts): new `launch with attach-only script returns structured error within 5s and leaves the controller alive` test. Times the failed launch (`Date.now()` deltas), asserts the error code is one of `lifecycle_handshake_timeout` / `adapter_transport_closed` / `fake_script_mode_mismatch`, then runs `sessions` and asserts `exitCode === 0` to prove the controller survived. Observed runtime: ~67ms.

## Verification

- `npm run typecheck` — clean.
- `npx vitest run tests/protocol/lifecycle.test.ts` — 8/8 pass.
- `npx vitest run tests/integration/fakeAdapterCli.test.ts` — 18/18 pass.
- `npm test` — full suite 142 passed, 5 skipped (skipped are environment-gated browser/python smokes).
- `npm run lint` — 2 pre-existing errors unrelated to this plan (`childSessions.ts:220` prefer-const; `server.ts:317` unbound-method); no new lint errors introduced.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 — Lint] Removed an unnecessary `as Promise<T>` assertion in `withTimeout`**
- **Found during:** Task 1 lint pass.
- **Issue:** `Promise.race(...).finally(...) as Promise<T>` triggered `@typescript-eslint/no-unnecessary-type-assertion`.
- **Fix:** Dropped the assertion; the inferred type is already `Promise<T>`.
- **Files modified:** [src/protocol/lifecycle.ts](src/protocol/lifecycle.ts)
- **Commit:** `6c346b6`

**2. [Rule 1 — Test compatibility] Existing lifecycle tests needed extra microtask flushes**
- **Found during:** Task 1 verify.
- **Issue:** Wrapping each handshake call in `Promise.race(...).finally(...)` adds extra microtask hops, so the existing tests that did `await Promise.resolve()` once and asserted `['initialize', 'launch']` were flaky/failing.
- **Fix:** Added a small `flushMicrotasks()` helper (5 microtask awaits) and used it in the three pre-existing tests that asserted intermediate request order.
- **Files modified:** [tests/protocol/lifecycle.test.ts](tests/protocol/lifecycle.test.ts)
- **Commit:** `290a859`

### Intentionally not done

- No new `fake_script_mode_mismatch` error code was introduced. The validation failure in the fake entry process surfaces through the existing `adapter_transport_closed` CLI error, which already carries adapter stderr/log diagnostics. The integration test accepts any of the three plausible error codes per the plan.
- Pre-existing unrelated lint errors in `src/controller/childSessions.ts` and `src/controller/server.ts` were left in place per scope boundary.

## Commits

- `290a859` — feat(05-07): bound DAP lifecycle handshake with timeout
- `6c346b6` — feat(05-07): validate fake adapter script matches lifecycle mode

## Self-Check: PASSED

- All listed source files exist and contain the described changes.
- Both commit hashes resolve in `git log` on `main`.
- New tests pass; full vitest suite green; no new lint errors.
