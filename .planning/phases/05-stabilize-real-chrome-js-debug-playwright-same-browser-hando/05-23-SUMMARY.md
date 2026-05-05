---
phase: 05
plan: 23
subsystem: controller, adapters, protocol
tags: [gap-closure, hand-driven, terminate-debuggee, orphans, H-8]
gap_closure: true
requires: [19, 20, 22]
provides:
  - terminate_runtime_helper
  - disconnect_terminate_debuggee_arg
  - process_group_cascade
  - orphan_pid_disclosure
affects:
  - controller.sessions_close_response_shape
  - controller.sessions_cleanup_response_shape
  - controller.shutdown_path
  - adapters.process_group_leadership
tech-stack:
  added: []
  patterns:
    - process-group-cascade
    - honest-orphan-disclosure
    - injected-signal-helpers-for-test
key-files:
  created:
    - .planning/phases/05-stabilize-real-chrome-js-debug-playwright-same-browser-hando/05-23-SUMMARY.md
  modified:
    - src/protocol/lifecycle.ts
    - src/adapters/processAdapter.ts
    - src/controller/server.ts
    - tests/protocol/lifecycle.test.ts
    - tests/controller/sessionManager.test.ts
    - tests/cli/sessionCommands.test.ts
    - tests/integration/jsDebugAdapter.test.ts
decisions:
  - "Single teardown path: ControllerServer.terminateRuntime is the only code path that disconnects + signals + reaps an owned-adapter runtime. close, cleanup --purge, and ControllerServer.stop all converge on it (eliminates the previous three-place divergence)."
  - "DAP disconnect carries terminateDebuggee:true on every controller-initiated teardown. Adapter-side errors during disconnect are caught and ignored — the followup explicit signal cascade is the safety net (this addresses the user-reported 'TypeError: Cannot read properties of undefined (reading terminateDebuggee)' adapter race; we no longer rely on the adapter shutting itself down)."
  - "POSIX adapters spawn with detached:true so each adapter is the leader of its own process group. terminateRuntime signals the negative pgid (process.kill(-pgid, SIGKILL)) which cascades through subprocesses (e.g. browser children spawned by the adapter) — this is the core of the H-8 cascade fix."
  - "Honest orphan disclosure: when the liveness probe still reports the PID alive after SIGTERM+SIGKILL, the close/cleanup response carries data.orphanPids and data.warnings: ['orphan_processes_remain: <pid>'] so the user can recover via kill -9. Silent orphans are explicitly disallowed by the success criteria."
  - "Signal helpers (signalProcess, isProcessAlive) are injected via StartControllerServerOptions defaults so tests can simulate 'process refuses to die' without leaving real processes behind."
  - "Plan deviation: natural-exit wait reduced from plan-literal 5s to 1s. Reason: the IPC client default timeout is 5s (src/controller/client.ts:25); a 5s controller-side wait could not surface orphanPids before the IPC client gave up. 1s is a safe upper bound — real adapters exit in milliseconds after disconnect."
  - "Plan deviation: src/cli/commands/sessions.ts unchanged. The plan called for a human-readable orphan PIDs message, but the codebase is JSON-only (writeJsonSuccess in src/cli/output.ts) and the orphanPids/warnings fields already surface in data via withController's transparent passthrough."
metrics:
  duration_minutes: ~30
  completed_date: 2026-05-04
---

# Phase 05 Plan 23: H-8 close + terminateDebuggee + process-group cascade Summary

Closes hand-driven gap H-8 from `05-UAT.md`: `dap-cli close <session>`
reported success but left 8 orphan Chromium processes after Sequence B
teardown; the user had to `pkill -f 'remote-debugging-pipe'` manually.
After this plan, close sends DAP `disconnect` with `terminateDebuggee:true`,
cascades SIGKILL through the adapter's process group on POSIX, and surfaces
any surviving PIDs honestly under `data.orphanPids` + `data.warnings`.

## What changed

**Task 1 — `terminateDebuggee` on disconnect + centralized `terminateRuntime`**

- `DapLifecycleController.disconnect(opts?)` now accepts an
  `{ terminateDebuggee?: boolean }` argument and forwards it as the DAP
  `disconnect` request body. Zero-arg callers are unchanged.
- New private `ControllerServer.terminateRuntime(runtime, { terminateDebuggee })`
  method does the full teardown:
  1. Dispose the child-session coordinator if any.
  2. Send DAP `disconnect` (with `terminateDebuggee` per opts), tolerate
     adapter-side failures.
  3. Wait up to **1s** (deviation from plan's 5s — see decisions) for the
     owned-adapter PID to exit naturally.
  4. If still alive: signal the adapter group with SIGTERM (200ms wait),
     then SIGKILL (200ms wait).
  5. Close the DAP client + adapter wrappers.
  6. Final liveness probe — return `{ orphanPids: [pid], warnings: ['orphan_processes_remain: <pid>'] }`
     when the PID survives, otherwise `{ orphanPids: [], warnings: [] }`.
- `sessions.close`, `sessions.cleanup --purge`, and `ControllerServer.stop`
  all delegate to `terminateRuntime` — three callers, one teardown contract.
- `StartControllerServerOptions` gained `signalProcess` + `isProcessAlive`
  injection points. Defaults use `process.kill(target, signal)` and
  `process.kill(pid, 0)` (with ESRCH-meaning-dead semantics). Tests inject
  mocks to simulate "process won't die".

**Task 1.5 — POSIX process-group cascade**

- `startProcessAdapter` now spawns the child with `detached: true` on POSIX
  (no-op on Windows). The child becomes the leader of a new process group
  whose pgid equals its pid. `child.unref()` is **not** called — adapter
  exit must remain observable to the parent for accounting.
- `StartedProcessAdapter` exposes `processGroupId?: number` (the pgid on
  POSIX; undefined on Windows or if `detached:true` failed).
- `terminateRuntime` checks `processGroupId` and signals the **negative**
  pgid (`process.kill(-pgid, signal)`) so SIGKILL cascades through
  subprocesses (e.g. browser children spawned by the adapter under its own
  group). On Windows it falls back to per-PID signaling.

**Task 2 — CLI close JSON envelope + integration assertion**

- The CLI close envelope was already auto-passing the controller response
  through `writeJsonSuccess` in `withController`, so `data.orphanPids` and
  `data.warnings` surface without changes to `src/cli/commands/sessions.ts`.
  This is documented as a plan deviation.
- New CLI tests in `tests/cli/sessionCommands.test.ts` (`close JSON envelope
  (gap H-8)` describe) assert: (a) clean teardown returns `orphanPids: []`
  and no warnings; (b) mocked-orphan teardown surfaces the PID and a parallel
  `warnings` entry of `orphan_processes_remain: <pid>`.
- New integration test in `tests/integration/jsDebugAdapter.test.ts`
  (`dap-cli close terminates the js-debug adapter PID (gap H-8)`) drives
  pwa-node end-to-end via `runCli`, captures the adapter PID from the
  status response's logPath (format `<adapterId>-<pid>.log`), runs `close`,
  and polls `process.kill(pid, 0)` for up to 2s — the adapter PID **must**
  return ESRCH within 2s of close.

## Verification

```bash
npm test
# Test Files  23 passed (23)
#      Tests  224 passed | 6 skipped (230)
```

Up from baseline 216 passed | 5 skipped: +8 new tests (2 lifecycle args, 2
controller terminateRuntime, 2 CLI close envelope, 1 integration PID-dies,
1 inherited from parallel 05-22 commit) and +1 skipped (parallel 05-22
chrome smoke gated on `DAP_CLI_RUN_BROWSER_SMOKES=1`).

## Deviations from Plan

### 1. [Rule 1 - Bug fix as part of Task 1] Architecture invariant repair

- **Found during:** Task 2 (initial test run discovered architecture test
  forbids `js-debug` literal in `src/protocol/`).
- **Issue:** The first iteration of `src/protocol/lifecycle.ts`'s disconnect
  doc-comment referenced "js-debug pwa-chrome" — violates
  `tests/architecture/moduleBoundaries.test.ts` rule
  "protocol modules remain language-neutral" (forbidden terms: javascript,
  python, js-debug, debugpy, Playwright).
- **Fix:** Rewrote the comment to refer to "stdio adapters that delegate
  teardown to the debuggee" — no adapter-name leakage.
- **Files modified:** `src/protocol/lifecycle.ts`.
- **Commit:** `a8b9ef1` (test(05-23): close JSON envelope surfaces orphanPids
  + reduce natural-exit wait).

### 2. [Plan deviation] Natural-exit wait reduced from 5s to 1s

- **Found during:** Task 2 (CLI test ran into IPC client timeout).
- **Issue:** Plan called for "Wait up to 5s for runtime.adapter.close() to
  complete OR the owned-adapter PID to exit". But
  `src/controller/client.ts:25` sets the IPC client default timeout to 5s.
  When `isProcessAlive` is mocked to always-true (the orphan disclosure
  failure mode), the 5s controller-side wait causes the IPC client to
  give up before terminateRuntime returns, surfacing as
  `controller_request_timeout` instead of the honest `orphanPids` payload.
- **Fix:** Reduced the natural-exit ceiling to 1s. Real adapters exit in
  milliseconds after disconnect; 1s is a safe upper bound that fits inside
  the IPC timeout.
- **Files modified:** `src/controller/server.ts`.
- **Commit:** `a8b9ef1`.

### 3. [Plan deviation] `src/cli/commands/sessions.ts` unchanged

- **Found during:** Task 2 review.
- **Issue:** Plan called for human-readable
  `Closed session ... K orphan PIDs remain (kill -9 ...)` text output.
- **Fix not needed:** The codebase is JSON-only — `writeJsonSuccess` in
  `src/cli/output.ts` is the only output path; `withController` passes the
  controller response through verbatim. `data.orphanPids` and
  `data.warnings` already surface in the JSON envelope without code
  changes.
- **Documented:** in the Task 2 commit message and this SUMMARY.

### 4. [Concurrency artifact] Cross-plan commit attribution

- **Found during:** Task 2 build/test cycle.
- **Issue:** Plan 05-22 was being executed in parallel by another agent.
  After I edited `tests/integration/jsDebugAdapter.test.ts` (adding the H-8
  PID-liveness integration test) but before I staged it, the parallel
  agent's commit `aaa645f5` (`test(05-22): controller-driven pwa-chrome H-6
  regression guard`) swept my unstaged H-8 test addition into their commit.
- **Fix:** None needed at the code level — the test content is correct and
  passing. Documented in the Task 2 commit message and here for audit
  trail. The H-8 test is logically owned by plan 05-23 even though it
  landed under a 05-22 commit message.

## Hand-Driven CLI Smoke

Pending — to be filled by the orchestrator's verifier round per the
checkpoint task at the end of `05-23-PLAN.md`. The plan's
`checkpoint:human-verify` step is intentionally not executed by this
auto-mode pass; control returns to the orchestrator for hand-driven
Sequence B reproduction.

## Self-Check

- [x] `src/protocol/lifecycle.ts` modified (disconnect args).
- [x] `src/adapters/processAdapter.ts` modified (detached spawn + processGroupId).
- [x] `src/controller/server.ts` modified (terminateRuntime + signal/liveness injection).
- [x] `tests/protocol/lifecycle.test.ts` modified (disconnect args tests).
- [x] `tests/controller/sessionManager.test.ts` modified (controller-level H-8 tests).
- [x] `tests/cli/sessionCommands.test.ts` modified (CLI close envelope tests).
- [x] `tests/integration/jsDebugAdapter.test.ts` modified (PID-liveness integration test, committed under 05-22).
- [x] `npm test` reports 224 passed | 6 skipped (up from baseline 216 | 5).
- [x] `npm run build` succeeds.
- [x] No new TS errors (pre-existing `sessionStore.ts:63` left alone per repo conventions).

## Self-Check: PASSED

## Commit log

- `c5c57cf` — feat(05-23): terminateRuntime + process-group cascade for H-8 close (Task 1 + Task 1.5)
- `a8b9ef1` — test(05-23): close JSON envelope surfaces orphanPids + reduce natural-exit wait (Task 2)
- `aaa645f5` (parallel 05-22) — accidentally carried the H-8 PID-liveness integration test
