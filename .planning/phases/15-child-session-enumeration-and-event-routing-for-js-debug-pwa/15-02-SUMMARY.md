---
phase: 15-child-session-enumeration-and-event-routing-for-js-debug-pwa
plan: 02
status: complete
requirements: [CHILD-ERR-01]
files_modified:
  - tests/cli/sessionCommands.test.ts
---

# Plan 15-02 — events `--name <child>` regression guard

## Result

Added three regression tests inside the existing `child session listing +
targeting (gap H-3)` describe block in `tests/cli/sessionCommands.test.ts`:

1. `events --name <child-id> returns child_session_not_targetable` — direct
   id form.
2. `events --name <parent#hex> for events also returns
   child_session_not_targetable` — alias / hash-form name.
3. `events --name <unknown> still returns session_not_found` — negative
   guard so the gate does not over-fire on missing sessions.

All three pass against current `main` without any production fix:

- `npx vitest run tests/cli/sessionCommands.test.ts` → **28 passed**
  (25 existing + 3 new).
- `npx vitest run tests/controller` → **87 passed** (no regression).

## Why no controller fix shipped

The plan anticipated either confirmation or a fix. Code audit and the
test result confirm the events surface already routes through the gate:

```
ControllerServer.recentEvents
  → resolveRuntime(eventParams.name)
    → assertNotChildSession(status, target)   // throws child_session_not_targetable
```

Both `events.recent` and `events.list` dispatch entries hit `recentEvents`
(server.ts line 417), and `recentEvents` calls `resolveRuntime` BEFORE
returning a snapshot. `resolveRuntime` calls `assertNotChildSession` BEFORE
any runtime lookup, so a child name (id form OR `parent#hex` form) raises
the structured error before any path could surface `total: 0`.

The CLI side (`src/cli/commands/dapCore.ts` `runEventsCommand`) also passes
the `--name` value through verbatim to the controller — no client-side
rewrite that could silently re-target the parent.

The `total: 0` symptom in analysis2.md was therefore against either a
pre-05-19 build, a stale binary, or a parent name that legitimately had
no events in its cache (none of which the current code path can reproduce).

## Behavior pinned

- `events --name <child-id>` → `child_session_not_targetable` with
  `category: 'session'`, `data.childSessionId`, `data.parentSessionId`,
  `data.parentName`.
- `events --name <parent#hex>` → same error with same data shape.
- `events --name <unknown>` → `session_not_found` (gate does NOT over-fire).

## Files changed

- `tests/cli/sessionCommands.test.ts` (+~70 lines, 3 new tests in the
  existing H-3 describe block).

No production code changed.

## Threats addressed

- **T-15-03** (Spoofing / Information Disclosure on events.recent): pinned —
  callers passing a child name receive a structured error pointing at the
  parent, never a misleading empty `total: 0`.
- **T-15-04** (error envelope shape): unchanged; envelope contract is the
  same one Phase 5/8 tests already pin.

## Out of scope confirmations

- `assertNotChildSession`'s contract was not modified.
- The `events.recent` success-path envelope was not modified.
- The `session_not_found` negative-guard branch was not loosened.
