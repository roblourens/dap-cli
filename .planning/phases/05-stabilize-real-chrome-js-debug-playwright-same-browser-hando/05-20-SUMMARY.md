---
phase: 05
plan: 20
subsystem: controller, sessions, cli
tags: [gap-closure, hand-driven, cleanup, diagnostics, H-4, H-7]
gap_closure: true
requires: [17, 19]
provides:
  - cleanup_envelope_v2
  - thread_not_paused_error
  - cleanup_recovery_audit
affects:
  - controller.cleanup_response_shape
  - controller.routeDapRequest
tech-stack:
  added: []
  patterns:
    - structured-recovery-data
key-files:
  created:
    - .planning/phases/05-stabilize-real-chrome-js-debug-playwright-same-browser-hando/05-20-SUMMARY.md
  modified:
    - src/sessions/sessionManager.ts
    - src/controller/diagnostics.ts
    - src/controller/server.ts
    - tests/controller/sessionManager.test.ts
    - tests/cli/errorContracts.test.ts
    - tests/integration/fakeAdapterCli.test.ts
decisions:
  - "Replace cleanup `{ cleaned, failed }` envelope with `{ signaledAdapter, removedRecords, keptRunning, failed }` (drop `cleaned` entirely; pre-release breaking change per threat T-05-20-01)."
  - "Plain cleanup never silently kills running adapters — owned-but-running sessions go to keptRunning so the user must opt into --purge for a hard reset."
  - "thread_not_paused gate consults the H-1 paused projection: only fires when paused === false. paused === undefined falls through to the adapter so we don't regress legitimate paused requests (T-05-20-02)."
  - "Stale controller discovery diagnostic now points at `dap-cli stop-controller` rather than `dap-cli cleanup --purge` — `cleanup` (any flag) doesn't touch the discovery file; stop-controller does. Audit-test compatible because the literal `dap-cli cleanup` no longer appears."
metrics:
  duration_minutes: ~15
  completed_date: 2026-05-04
---

# Phase 05 Plan 20: H-4 cleanup honesty + H-7 thread_not_paused Summary

Closes hand-driven gaps H-4 (`cleanup` was dishonest about what it did) and
H-7 (`controller_unavailable: Run dap-cli start` was the wrong recovery hint
for unpaused stack/scopes/variables). Both shipped together because they
share diagnostic-message surface in `controller/diagnostics.ts`,
`sessions/sessionManager.ts`, and the error contract tests.

## What changed

**Task 1 — Honest cleanup envelope (H-4)**

`SessionManager.cleanupSessions({ purge })` returns a new structured envelope:

```ts
{
  signaledAdapter: string[],   // we sent SIGTERM (success or ESRCH)
  removedRecords:  string[],   // we deleted the persisted record
  keptRunning:     { sessionId, reason: 'adapter_alive' | 'lifecycle_running' | 'lifecycle_attaching' }[],
  failed:          SessionCleanupFailure[],
}
```

The misleading `cleaned` field is gone. Behaviour:

- **Plain `cleanup`** removes records ONLY when (a) the session is dap-cli-owned
  and SIGTERM succeeds/ESRCHes, OR (b) lifecycle is in
  terminated/disconnected/failed. Anything else lands in `keptRunning` with a
  structured reason so the caller can opt into `--purge`.
- **`cleanup --purge`** is a hard reset — signal owned adapters and remove
  every record. Signal failures still land in `failed` (no removal) so the
  user can investigate.
- `failed` and `keptRunning` are mutually exclusive — failures go to one
  place only.

**Task 2 — `thread_not_paused` + diagnostics audit (H-7)**

- New `threadNotPaused()` factory in `controller/diagnostics.ts` produces a
  DAP `CliError` with code `thread_not_paused`, message `Thread is not paused.`,
  and a recovery diagnostic that points at
  `dap-cli events --name <name> --include stopped` plus `--stop-on-entry`. It
  NEVER suggests `dap-cli start`.
- `assertThreadPausedIfRequired()` wired into `routeDapRequest`. Gate fires
  for `stackTrace`/`scopes`/`variables` when `session.paused === false` (the
  H-1 paused projection from plan 05-17). `paused === undefined` falls through
  so we don't synthesize errors from a stale projection (T-05-20-02).
- Audited and fixed the controller's `dap-cli cleanup` recovery hints:
  - `createMissingRuntimeDiagnostics` (server.ts:843): `cleanup` →
    `cleanup --purge` (the missing-runtime case fires while the session
    record is still `running`, which plain cleanup would not remove).
  - `staleControllerDiscovery` (diagnostics.ts:13): `cleanup` →
    `stop-controller`. Plain cleanup never touches the controller discovery
    file; `stop-controller` is the actual right action.
- New regex audit test asserts no file under `src/controller/` or
  `src/sessions/` contains the literal `dap-cli cleanup` without the
  ` --purge` suffix.

## Commits

| # | Hash | Type | Description |
|---|------|------|-------------|
| 1 | `225c346` | feat | Honest cleanup envelope (signaledAdapter/removedRecords/keptRunning) |
| 2 | `c3151cf` | feat | thread_not_paused error + cleanup recovery hint audit |

## Test counts

- `tests/controller/sessionManager.test.ts`: 41 passed (5 new for cleanup envelope)
- `tests/cli/errorContracts.test.ts`: 10 passed (4 new for thread_not_paused + audit)
- `tests/cli/sessionCommands.test.ts`: 17 passed (existing, no regressions)
- Full suite: **215 passed | 5 skipped | 1 failed (pre-existing, see Deviations)**.
  Baseline was 195 passed | 5 skipped — uplift comes from in-flight plans
  05-17/05-18/05-19/05-25/05-26 plus my 9 new cases.

## Deviations from Plan

### Out-of-scope failures (not introduced by this plan)

**1. [Out of scope] `tests/architecture/moduleBoundaries.test.ts > protocol modules remain language-neutral`**

- **Found during:** post-implementation `npm test`.
- **Cause:** `src/protocol/eventCache.ts` (touched by plan 05-18 commit `53de4aa`)
  contains the literal `js-debug` in its source. Architecture test forbids
  language-specific terms in `src/protocol/`.
- **Resolution:** Logged as a regression introduced by plan 05-18 (which is
  in flight per the orchestrator note). NOT fixed here — outside the H-4/H-7
  scope and would be a churn collision with the parallel agent. Filed for
  05-18 follow-up.

**2. [Pre-existing] `src/sessions/sessionStore.ts:63` TS error**

- Listed in `deferred-items.md`. Not regressed by this plan.

### Auto-fixed adjustments

**1. [Rule 2 - critical functionality] `staleControllerDiscovery` recovery hint**

- The plan literally said replace `cleanup` → `cleanup --purge`. But the
  staleControllerDiscovery hint fires for a stale **controller discovery file**
  (not a session record), and `cleanup --purge` doesn't touch that file —
  `dap-cli stop-controller` does.
- **Fix:** Pointed the diagnostic at `stop-controller` instead. Still
  satisfies the audit regex (no `dap-cli cleanup` literal remains).
- **Files modified:** `src/controller/diagnostics.ts`.
- **Commit:** `c3151cf`.

**2. [Rule 2] Failed-vs-keptRunning are mutually exclusive**

- Plan was silent on whether a session whose SIGTERM throws (non-ESRCH) should
  also appear in `keptRunning` with `adapter_alive` reason.
- **Decision:** No — `failed` is the single source of truth for signaling
  failures. Surfacing the same id in two arrays would force callers to
  de-dupe and risk double-action. Documented in the type comment.

### Hint field deferred (not implemented)

The plan mentioned a "human-readable rendering" telling the user to retry
with `--purge` when keptRunning is non-empty. The CLI is JSON-only (no
human renderer exists), and the structured `keptRunning` array with reasons
already conveys the full information. No `hint` field added — callers can
read `keptRunning.length > 0` themselves. Documented as a deliberate
omission rather than a regression.

## Authentication Gates

None.

## Known Stubs

None.

## Threat Flags

None — no new external surface introduced.

## Self-Check: PASSED

- ✅ `225c346` exists in git log
- ✅ `c3151cf` exists in git log
- ✅ `src/sessions/sessionManager.ts` modified (CleanupResult shape changed)
- ✅ `src/controller/diagnostics.ts` modified (threadNotPaused added,
  staleControllerDiscovery hint updated)
- ✅ `src/controller/server.ts` modified (assertThreadPausedIfRequired wired)
- ✅ Audit regex test passes (no `dap-cli cleanup` without ` --purge` in
  controller/ or sessions/)
- ✅ Build succeeds

## Hand-Driven CLI Smoke

NOT YET RUN — the plan's terminal task is `type="checkpoint:human-verify"`,
which the executor stops at without executing per the orchestrator contract.
The orchestrator (or a verification agent) must run the steps in the
checkpoint task and append results to `05-UAT.md` under the
`## Hand-Driven CLI Smoke (gaps H-4 + H-7 closure)` heading.
