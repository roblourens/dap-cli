---
quick_id: 260504-rp5
slug: reverse-duplicate-name-session-disambigu
created: 2026-05-05
completed: 2026-05-05
status: complete
---

# Summary: Reverse duplicate-name session disambiguation

## What changed

Duplicate `--name` collisions are now rejected at session create time instead of being
disambiguated downstream.

- `SessionManager.create` (in [src/sessions/sessionManager.ts](../../../src/sessions/sessionManager.ts))
  rejects the second `create` with `sessionError({ code: 'session_name_in_use' })` when an
  existing non-child session shares the name and is not in a removable lifecycle
  (`terminated`/`disconnected`/`failed`). Children registered via `registerChild` are
  exempt — their `parent#cdp-target-id` naming isn't user-facing.
- `REMOVABLE_LIFECYCLES` was promoted from `sessionManager.ts` to `session.ts` so the
  resolver can share it without a circular import.
- `resolveTargetSession` (in [src/sessions/activeSession.ts](../../../src/sessions/activeSession.ts))
  now prefers live records over terminated ones when matching by name. This lets a
  re-launched same-named session shadow its terminated predecessor while still allowing
  `dap-cli close <name>` against a terminated record when it is the only match.
- The `session_ambiguous` branch is kept as a defensive guard with a softened diagnostic
  ("Use one of these session IDs with --name." — no longer suggests "close stale duplicate
  sessions"). It should not be reachable through the public CLI in normal operation.
- `controller/client.ts` `isSessionError` includes `session_name_in_use`.

## Tests

- `tests/controller/sessionManager.test.ts`: replaced "reports duplicate session names as
  ambiguous" with two tests — one asserting the second `create` is rejected, one asserting
  reuse after `terminated` succeeds and resolves by name.
- `tests/cli/sessionCommands.test.ts`: replaced the public-targeting ambiguity loop with
  the same two assertions; dropped the unused `assertSessionAmbiguous` helper; trimmed the
  "every diagnostic parses through commander" test to drop the now-impossible
  `session_ambiguous` trigger (it still covers `no_active_session`, `session_not_found`,
  and `session_unavailable`, satisfying the `>=3` assertion).
- `tests/cli/errorContracts.test.ts`: untouched. It tests the `writeJsonFailure` envelope
  shape with a hand-constructed `sessionError`, not the manager.

## Verification

- `npm test`: 226 passed | 6 skipped | 0 failed
- `npm run lint`: clean

## Decision trail

Captured in `.planning/PROJECT.md` Key Decisions ("Reject duplicate `--name` at session
create time instead of disambiguating downstream"). Phase 5 artifacts that referenced the
disambiguation behavior were intentionally not modified — GSD convention treats phase
docs as immutable history.

## Files modified

- src/sessions/sessionManager.ts
- src/sessions/session.ts
- src/sessions/activeSession.ts
- src/controller/client.ts
- tests/controller/sessionManager.test.ts
- tests/cli/sessionCommands.test.ts
- .planning/PROJECT.md
