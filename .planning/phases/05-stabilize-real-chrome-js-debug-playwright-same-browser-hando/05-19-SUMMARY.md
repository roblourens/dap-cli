---
phase: 05-stabilize-real-chrome-js-debug-playwright-same-browser-hando
plan: 19
subsystem: src/sessions + src/controller + src/cli
tags: [gap-closure, hand-driven, child-sessions, listing-ux, H-3]
gap_closure: true
requires: []
provides:
  - sessions-list-include-children-flag
  - session-summary-targetable-projection
  - child-session-not-targetable-error
affects:
  - src/sessions/sessionManager.ts
  - src/sessions/session.ts
  - src/sessions/sessionStore.ts
  - src/controller/server.ts
  - src/controller/client.ts
  - src/controller/requests.ts
  - src/cli/commands/sessions.ts
  - src/cli/errors.ts
  - src/cli/output.ts
  - tests/controller/sessionManager.test.ts
  - tests/cli/sessionCommands.test.ts
  - tests/integration/jsDebugAdapter.test.ts
tech_stack_added: []
patterns:
  - "`SessionManager.list({ includeChildren?: boolean })` filters child sessions (records with non-undefined `parent_session_id`) by default. Children stay first-class for diagnostics but are not surfaced in the user-facing listing."
  - "`projectSessionSummary` sets `targetable: false` on child summaries; absence === targetable. Lets JSON consumers render the distinction without re-deriving from `parent_session_id`."
  - "Child-session targeting is gated at the **controller request boundary**, not inside `resolveTargetSession`. This preserves the internal management/lifecycle paths (`ChildSessionCoordinator.updateLifecycle`, `manager.closeSession` cascade) that legitimately operate on child ids."
  - "`CliError` carries an optional `data?: Readonly<Record<string, unknown>>` for machine-readable recovery info, alongside the human-readable `diagnostics`. Wired end-to-end through controller schema → server payload → JSON envelope → client deserialization."
key_files:
  created:
    - .planning/phases/05-stabilize-real-chrome-js-debug-playwright-same-browser-hando/05-19-SUMMARY.md
  modified:
    - src/sessions/sessionManager.ts
    - src/sessions/session.ts
    - src/sessions/sessionStore.ts
    - src/controller/server.ts
    - src/controller/client.ts
    - src/controller/requests.ts
    - src/cli/commands/sessions.ts
    - src/cli/errors.ts
    - src/cli/output.ts
    - tests/controller/sessionManager.test.ts
    - tests/cli/sessionCommands.test.ts
    - tests/integration/jsDebugAdapter.test.ts
decisions:
  - "Gate child targeting at the controller route level (`ControllerServer.assertNotChildSession`), not inside `resolveTargetSession`. Putting it in `resolveTargetSession` would have broken `ChildSessionCoordinator.updateLifecycle(childId, …)` and the cascade-close path in `SessionManager.closeSession`, both of which legitimately resolve children by id internally. The plan's `<must_haves>` explicitly allowed either location (`resolveTargetSession (or its caller in the controller's request routing path)`)."
  - "Apply the gate to `sessions.status`, `sessions.target`/`sessions.use`, and `resolveRuntime` (which fronts `dap.request`, `dap.capabilities`, `events.recent`, `events.list`). Do NOT apply it to `sessions.close`, `sessions.cleanup`, `sessions.stop`, `sessions.detach` — those are management surfaces; closing or cleaning up a child by id may be a legitimate recovery action."
  - "Add `parent_session_id`, `paused`, `stoppedReason`, `stoppedThreadIds` to `sessionStore`'s zod schema. They were silently stripped on read (Zod's default for `z.object`), which meant `SessionManager.list()` after a controller restart never saw a child as a child — the H-3 gate would have failed silently in production. Caught by the gap-H-3 unit test that targets a child by name (independent controller process)."
  - "Use `--show-children` as the canonical flag with `--all` as an alias. `--show-children` is more self-documenting; `--all` matches operator muscle-memory from `ps`/`ls` and is what the plan called out as acceptable."
  - "`CliError.data` is typed as `Readonly<Record<string, unknown>>`. Each error site documents its own shape (here: `{ childSessionId, parentSessionId, parentName? }`)."
metrics:
  duration_minutes: ~25
  tasks_completed: 3
  files_changed: 12
  completed_at: 2026-05-04
threat_model_status:
  - "T-05-19-01 (Information disclosure via --show-children) — accepted per plan; child IDs already in the persisted store and observable to other CLI invocations."
  - "T-05-19-02 (Behavior change in `sessions list`) — mitigated: documented here and in the new --show-children CLI help text. No external consumers in this repo today."
---

# Phase 5 Plan 19: Hide non-targetable child sessions + structured child-target error Summary

Closes hand-driven gap H-3 from [05-UAT.md](.planning/phases/05-stabilize-real-chrome-js-debug-playwright-same-browser-hando/05-UAT.md): `dap-cli sessions` previously showed every child session with `lifecycle: running`, but every routable command against a child returned the misleading `session_unavailable: No DAP runtime is attached`. After this plan: children are hidden from `sessions` by default; opting back in via `--show-children` exposes them with `targetable: false`; targeting one returns the actionable `child_session_not_targetable` error with `data: { childSessionId, parentSessionId, parentName }` so JSON consumers can route the same call through the parent.

## What changed

### Task 1 — Filter children + targetable projection (commit `f526a4a`)

[src/sessions/sessionManager.ts](src/sessions/sessionManager.ts):
- `list({ includeChildren?: boolean } = {})` filters out records where `parent_session_id !== undefined` by default. Existing zero-arg `list()` callers automatically get the new filtered behavior — verified that the only in-tree call sites either don't involve children at all or were updated explicitly (Task 1.5).

[src/sessions/session.ts](src/sessions/session.ts):
- `SessionSummary` (and by extension `SessionStatus`) gained optional `targetable?: boolean`. `projectSessionSummary` sets `targetable: false` for any record carrying `parent_session_id`; absence === targetable, so existing root-session consumers see no shape change.

[tests/controller/sessionManager.test.ts](tests/controller/sessionManager.test.ts) — 3 new unit tests:
- Default `list()` hides children; `list({ includeChildren: true })` includes them with `targetable: false`.
- `list({ includeChildren: false })` is equivalent to no-arg.
- `status(childId).targetable === false` and roots have no `targetable` key.

### Task 1.5 — Test audit for child-id targeting (commit `0d3e413`)

Audit per `/memories/repo/dap-cli.md` (js-debug pwa-chrome's parent owns the bp registry, threads, and event stream):

- `grep -rn "parent_session_id" tests/` — only one **listing assumption** outside the unit tests: [tests/integration/jsDebugAdapter.test.ts](tests/integration/jsDebugAdapter.test.ts) at the `pwa-chrome attach surfaces ≥1 child session` test. Updated `runCli(['sessions'])` → `runCli(['sessions', '--show-children'])` so it can still observe child registration. The follow-up `request threads --name chrome-children-smoke` already targets the parent name and remains correct.
- `grep -rn "runCli\(\[.sessions" tests/` — every other call site (`tests/cli/sessionCommands.test.ts`, `tests/integration/{selfHosting,fakeAdapterCli,playwrightInterop}.test.ts`) does not register children, so default-hidden behavior is a no-op.
- [tests/integration/playwrightInterop.test.ts](tests/integration/playwrightInterop.test.ts) — verified all 12 `runCli(... '--name', X, ...)` call sites target either `web-demo` (fake adapter) or `chrome-playwright-handoff` (parent name). Zero child-id targeting.

No production-source escape hatch was added; the gate is unconditional from the public CLI per plan.

### Task 2 — `child_session_not_targetable` error + `--show-children` flag (commit `f507777`)

[src/controller/server.ts](src/controller/server.ts) — `ControllerServer.assertNotChildSession(status, providedTarget)`:
- Throws `sessionError` with `code: 'child_session_not_targetable'`, diagnostics pointing the user at `--name <parent_name>`, and `data: { childSessionId, parentSessionId, parentName? }`.
- Looks up the parent name via `manager.list({ includeChildren: true })` so the diagnostic message names the actual parent (not the opaque session id) when available.
- Wired into:
  - `sessions.status` (after `manager.status(target)`)
  - `sessions.target` / `sessions.use` (after a pre-resolution `manager.status(target)`, before `manager.targetSession(target)` mutates active focus)
  - `resolveRuntime` (which fronts `dap.request`, `dap.capabilities`, `events.recent`, `events.list`)
- Deliberately NOT wired into `sessions.close`, `sessions.cleanup`, `sessions.stop`, `sessions.detach`, or any internal `ChildSessionCoordinator` lifecycle/paused-state update.

[src/cli/errors.ts](src/cli/errors.ts) + [src/cli/output.ts](src/cli/output.ts) + [src/controller/requests.ts](src/controller/requests.ts) + [src/controller/client.ts](src/controller/client.ts) + [src/controller/server.ts](src/controller/server.ts):
- `CliError` and `CliErrorOptions` gained `data?: Readonly<Record<string, unknown>>`.
- Controller failure response schema gained `data: z.record(z.string(), z.unknown()).optional()` and `ControllerFailureResponse['error']` mirrors it.
- `toControllerErrorPayload` (server) and the JSON client deserializer both forward `data` when present.
- `JsonErrorPayload` exposes `data` so it survives the public JSON envelope.

[src/cli/commands/sessions.ts](src/cli/commands/sessions.ts):
- `dap-cli sessions` accepts `--show-children` (and `--all` as alias). The flag is forwarded to the controller as `sessions.list { includeChildren: boolean }`.
- Default behavior changed: `dap-cli sessions` (no flag) now omits child sessions. Documented in the command description and in the `Threat Flags`/decisions blocks of this SUMMARY.

[src/sessions/sessionStore.ts](src/sessions/sessionStore.ts):
- Added `parent_session_id`, `paused`, `stoppedReason`, `stoppedThreadIds` to `sessionRecordSchema`. Zod's default for `z.object` strips unknown keys, so before this fix, child sessions registered by the in-process manager were re-read by the controller (after a fresh `start`) without their `parent_session_id`, defeating the H-3 gate. Caught by the new gap-H-3 CLI test that drives the controller as a separate process.

[tests/cli/sessionCommands.test.ts](tests/cli/sessionCommands.test.ts) — 6 new CLI tests under `child session listing + targeting (gap H-3)`:
- `dap-cli sessions` (default) hides children; root summary has no `targetable: false`.
- `dap-cli sessions --show-children` includes children with `targetable: false`.
- `dap-cli sessions --all` is alias.
- Targeting a child by id returns `child_session_not_targetable` with diagnostics naming the parent and `data: { childSessionId, parentSessionId, parentName }`.
- Targeting a child by `parent#hex` name returns the same code (not `session_unavailable`).
- Targeting a non-existent name still returns `session_not_found` (precedence).
- `dap-cli use <child-id>` also returns `child_session_not_targetable`.

## Verification

```
npm run typecheck        → clean
npm test                 → 178 passed | 5 skipped (no failures, no regressions)
```

Per the executor protocol and the plan's `checkpoint:human-verify` (Task 3), the hand-driven Sequence A/B re-run against `node dist/index.js launch … && node dist/index.js sessions [--show-children] && node dist/index.js events --name <child-id>` is the orchestrator's responsibility — its verbatim transcript will be appended to [05-UAT.md](.planning/phases/05-stabilize-real-chrome-js-debug-playwright-same-browser-hando/05-UAT.md) under `## Hand-Driven CLI Smoke (gap H-3 closure)`. This SUMMARY closes the implementation half only.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `sessionStore` schema silently dropped `parent_session_id`, `paused`, `stoppedReason`, `stoppedThreadIds`**

- **Found during:** Task 2 verification — the new "targeting a child by parent#hex name returns child_session_not_targetable" test was getting `exitCode: 0` with a successful status response that had no `parent_session_id` field, even though `manager.registerChild` had stamped it on the in-process record.
- **Issue:** [src/sessions/sessionStore.ts](src/sessions/sessionStore.ts)'s `sessionRecordSchema` only declared `id, name, adapter, lifecycle, createdAt, updatedAt, ownedAdapter`. Zod's default behavior strips unknown keys on `.parse()`, so any `SessionRecord` field added later (`parent_session_id` from plan 05-04, `paused`/`stoppedReason`/`stoppedThreadIds` from plan 05-17) survived in the in-memory manager but vanished on persist→read roundtrip. Production controllers are separate processes that always read from disk, so the H-3 gate would have failed silently — exactly the kind of "tests pass, hand-driven smoke fails" gap the executor protocol calls out.
- **Fix:** Added the four optional fields to the zod schema. No data migration needed because the fields are optional and existing on-disk records simply omit them.
- **Files modified:** `src/sessions/sessionStore.ts`
- **Commit:** `f507777` (rolled into Task 2)
- **Side benefit:** This also retroactively fixes the persistence half of plan 05-17's paused projection — without this commit, the `paused`/`stoppedReason`/`stoppedThreadIds` fields would have been dropped on every `replaceSession`→`persist`→re-read cycle.

No other auto-fixes, no architectural deviations, no auth gates.

## Threat Flags

None — this plan tightens existing CLI surface (rejects child targeting) and adds an opt-in flag. No new endpoints or trust boundaries.

## Self-Check: PASSED

- Created files exist:
  - `.planning/phases/05-.../05-19-SUMMARY.md` — FOUND (this file).
- Modified files exist and contain the new symbols:
  - [src/sessions/sessionManager.ts](src/sessions/sessionManager.ts) — `list(opts: { includeChildren?: boolean } = {})` present.
  - [src/sessions/session.ts](src/sessions/session.ts) — `targetable?: boolean` on `SessionSummary`; `projectSessionSummary` sets it for children.
  - [src/sessions/sessionStore.ts](src/sessions/sessionStore.ts) — `parent_session_id`, `paused`, `stoppedReason`, `stoppedThreadIds` declared in `sessionRecordSchema`.
  - [src/controller/server.ts](src/controller/server.ts) — `assertNotChildSession` present and called from `sessions.status`, `sessions.target`/`use`, `resolveRuntime`.
  - [src/controller/requests.ts](src/controller/requests.ts) — `data` declared on failure response schema and type.
  - [src/controller/client.ts](src/controller/client.ts) — `data` forwarded into `CliErrorOptions`.
  - [src/cli/errors.ts](src/cli/errors.ts) — `CliError.data` field present.
  - [src/cli/output.ts](src/cli/output.ts) — `JsonErrorPayload.data` present and serialized.
  - [src/cli/commands/sessions.ts](src/cli/commands/sessions.ts) — `--show-children` and `--all` options registered; `includeChildren` forwarded.
- Commits exist on `main`:
  - `f526a4a` — feat(05-19): hide child sessions from list by default + targetable projection
  - `0d3e413` — test(05-19): pass --show-children to child-listing assertion
  - `f507777` — feat(05-19): child_session_not_targetable error + --show-children CLI flag
