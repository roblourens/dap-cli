---
phase: 05-stabilize-real-chrome-js-debug-playwright-same-browser-hando
plan: 10
subsystem: sessions, cli, controller
tags: [stability, cleanup, cli-ergonomics, gap-closure, uat-6, uat-9, meta-test]
gap_closure: true
requirements: [TEST-07]
key-files:
  modified:
    - src/sessions/sessionManager.ts
    - src/sessions/activeSession.ts
    - src/cli/commands/sessions.ts
    - src/controller/server.ts
    - src/controller/diagnostics.ts
    - tests/cli/sessionCommands.test.ts
    - tests/integration/selfHosting.test.ts
decisions:
  - "Backtick-wrap every `dap-cli ...` suggestion in error diagnostics so a single regex (/`dap-cli ([^`]+)`/g) reliably extracts the runnable form — avoids brittle stop-word heuristics for bare prose like 'Run dap-cli cleanup to remove ...'."
  - "Keep `--name` on `close` for backward compatibility while adding optional positional `[name]` (symmetric with `dap-cli use <name>`); reject mismatched dual-spec with a usage error rather than silently preferring one."
  - "Add `--purge` flag (with `--force` as legacy alias) for the cleanup-foreign-records branch, so the safe default keeps records the manager doesn't own and only an explicit opt-in clears them."
metrics:
  duration: ~20 minutes
  completed: 2026-05-03
---

# Phase 05 Plan 10: cleanup record removal + runnable recovery hints Summary

Closes UAT gap 9 (`dap-cli cleanup` only signalled SIGTERM and never removed records, so terminated sessions accumulated forever) and UAT gap 6 (the `adapter_transport_closed` recovery hint suggested `dap-cli close <id>` but commander rejected the positional argument).

## What was built

**Task 1 — cleanup removes records; --purge clears stuck.** [src/sessions/sessionManager.ts](src/sessions/sessionManager.ts) `cleanupSessions(options?: { purge?: boolean })` now removes records after a successful `SIGTERM` (and after `ESRCH`/already-dead). On a non-`ESRCH` signal failure the record stays in place and surfaces via `failed`. The new `--purge` flag (with `--force` as a legacy alias) additionally removes records the manager doesn't actively own (`startedByDapCli !== true` or no pid) — those can never be `SIGTERM`'d. The active session id is cleared if its record is removed; persistence runs exactly once at the end of the loop. [src/cli/commands/sessions.ts](src/cli/commands/sessions.ts) wires `--purge` / `--force` through `sessions.cleanup`, and the controller server in [src/controller/server.ts](src/controller/server.ts) threads the `purge` arg through the IPC handler.

**Task 2 — `close <id>` positional + meta-test for CLI suggestion shapes.** [src/cli/commands/sessions.ts](src/cli/commands/sessions.ts) `close` now accepts an optional positional `[name]` while keeping `--name <name>` for backward compat (mismatched dual-spec → `usageError`). All `dap-cli ...` suggestions baked into structured error diagnostics are now backtick-wrapped so they're machine-extractable. Touched: [src/sessions/activeSession.ts](src/sessions/activeSession.ts) (`no_active_session`, `session_not_found`), [src/sessions/sessionManager.ts](src/sessions/sessionManager.ts) (cleanup-failure action), [src/controller/server.ts](src/controller/server.ts) (`session_unavailable` hint), [src/controller/diagnostics.ts](src/controller/diagnostics.ts) (`controller-unavailable` / stale-discovery hints).

## Tests added

- [tests/cli/sessionCommands.test.ts](tests/cli/sessionCommands.test.ts): six new tests.
  - `cleanup leaves sessions empty after terminating an owned adapter` — seeds a record with a bogus pid (forces `ESRCH`), runs `dap-cli cleanup`, asserts `dap-cli sessions` returns `[]`.
  - `cleanup --purge removes records the manager does not own` — seeds an unowned record, asserts it disappears under `--purge`.
  - `cleanup without --purge leaves records the manager does not own` — same seed, asserts safe default keeps the record.
  - `close accepts a positional session id` — runs `dap-cli close <id>` without `--name`, asserts session is removed.
  - `close rejects mismatched positional id and --name` — asserts exit code 2 (usage) when both differ.
  - `every dap-cli suggestion in error diagnostics parses through commander` — the meta-test. Triggers `no_active_session`, `session_not_found`, `session_ambiguous`, and `session_unavailable` via `runCli`; regex-extracts every backtick-wrapped `` `dap-cli ...` `` substring (3 unique suggestions today: `use <name>`, `sessions`, `cleanup`); asserts each parses through a fresh `createProgram()` with `exitOverride()` and action handlers stripped (so no IPC/network during parse-validation). This is the long-term defense against the gap-6 class of bug.
- [tests/integration/selfHosting.test.ts](tests/integration/selfHosting.test.ts): new `recovery hint from adapter_transport_closed is a runnable CLI command` test. Reproduces the gap-6 scenario end-to-end: launch a `stop-then-transport-close` fake-adapter session, trigger the closed transport, assert the diagnostic contains a backtick-wrapped `dap-cli close <id>` recovery hint, then actually copy-paste-execute that command and verify the session is gone.

## Verification

- `npm run typecheck` — clean.
- `npx vitest run tests/cli/sessionCommands.test.ts` — 9/9 pass.
- `npx vitest run tests/integration/selfHosting.test.ts` — 6/6 pass (5 skipped as before — environment-gated).
- `npm test` — full suite **154 passed, 5 skipped (159)**.
- `npm run lint` — 2 pre-existing errors unchanged from plan 05-07 (`childSessions.ts:243` prefer-const introduced by parallel wave; `server.ts:318` unbound-method); no new lint errors introduced by this plan.

## Meta-test outcome

The meta-test extracted 3 distinct `dap-cli ...` suggestions from runtime diagnostics and validated each through commander:

| Suggestion         | Source diagnostic           | Code                |
| ------------------ | --------------------------- | ------------------- |
| `use <name>`       | `no_active_session`         | activeSession.ts:18 |
| `sessions`         | `session_not_found`         | activeSession.ts:23 |
| `cleanup`          | `session_unavailable`       | server.ts:757       |

`close <id>` is also tested end-to-end by the new self-hosting integration test; it's emitted by `adapter_transport_closed` (server.ts:716), which requires a real adapter transport-close to fire and is therefore exercised in the integration suite rather than the unit meta-test.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 — Correctness] Backtick-wrapped previously-bare CLI suggestions in diagnostics**
- **Found during:** Task 2 design.
- **Issue:** The plan's meta-test needs to regex-extract `dap-cli ...` substrings from prose like `Run dap-cli cleanup to remove stale state, or relaunch ...`. Bare prose extraction requires brittle stop-word heuristics (`to`, `or`, `and`) that would either over-capture (`dap-cli cleanup to remove`) or miss valid commands.
- **Fix:** Wrapped every `dap-cli ...` substring in CLI-suggestion diagnostics with backticks (the recovery hint at server.ts:716 already used this convention). Affects 5 diagnostic strings across 4 files. Behavior-preserving: backticks are harmless in JSON envelopes and improve human readability too.
- **Files modified:** activeSession.ts, sessionManager.ts (cleanup-failure action), server.ts, controller/diagnostics.ts.
- **Commit:** `a19d973`.

### Intentionally not done

- The meta-test does not trigger `adapter_transport_closed` — that diagnostic requires a real transport-close (fake-adapter `stop-then-transport-close` script) which is the right test scope for the integration suite, not a unit test. The new selfHosting test `recovery hint from adapter_transport_closed is a runnable CLI command` covers it end-to-end (launch → close transport → extract hint → execute hint → verify session gone).

## Commits

- `996cdc9` — feat(05-10): cleanup removes session records and supports --purge
- `a19d973` — feat(05-10): close accepts positional id; meta-test guards CLI suggestion shapes

## Handoff to plan 05-12

- The meta-test currently observes 3 `dap-cli ...` suggestions; if 05-12 adds new diagnostic categories (or surfaces new recovery hints from upcoming gaps), backtick-wrap them and the meta-test will validate them automatically.
- `cleanup --purge` semantics: removes records where `startedByDapCli !== true` OR `pid === undefined`. If 05-12 introduces a new `ownedAdapter` shape, revisit the purge condition in `cleanupSessions`.
- The `close [name]` positional now collides minimally with `--name`; if any future command surfaces `close foo --name foo` (same id), it succeeds. Different ids → usage error.

## Self-Check: PASSED

- All listed source files exist on disk and contain the described changes.
- Both commit hashes resolve in `git log` on `main` (verified via `git log --oneline | grep`).
- New tests pass; full vitest suite green (154 passed, 5 skipped); no new lint errors.
