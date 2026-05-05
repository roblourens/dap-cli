---
quick_id: 260504-rp5
slug: reverse-duplicate-name-session-disambigu
created: 2026-05-05
status: in-progress
---

# Reverse duplicate-name session disambiguation

## Description

A previous fix (the `session_ambiguous` error code path in `SessionManager.target` /
`resolveTargetSession`) supported the idea that two persisted sessions could legitimately
share the same `--name`. That was based on a misread of intent. The product behavior we
actually want is simpler: **starting a new session with the same `--name` as an existing
non-terminated session is an error.** Disambiguation logic downstream becomes dead code in
normal use.

## Approach

1. Reject name collisions at create time.
   - `SessionManager.create` throws `sessionError({ code: 'session_name_in_use', ... })`
     when an existing non-child session with the same `name` has a lifecycle that is NOT
     in `REMOVABLE_LIFECYCLES` (i.e. not `terminated`/`disconnected`/`failed`).
   - Reuse against terminated/failed records is allowed — closed sessions should not block
     a new launch with the same name.
   - Children (`registerChild`) are not constrained — they have their own
     `parent#cdp-target-id` naming and aren't user-targetable.
2. Keep the `session_ambiguous` branch in `resolveTargetSession` as a defensive guard but
   soften its diagnostic (no more "close stale duplicate sessions" — duplicates can no
   longer arise via the public CLI).
3. Add `session_name_in_use` to `controller/client.ts` `isSessionError` so the CLI maps it
   to the session error category and exit code.
4. Update tests:
   - `tests/controller/sessionManager.test.ts`: replace the "reports duplicate session
     names as ambiguous" test with one asserting the second `create` is rejected, and add
     a positive test that creating after the first is in `terminated` lifecycle succeeds.
   - `tests/cli/sessionCommands.test.ts`:
     - Replace the public-targeting ambiguity test with one that asserts
       `session_name_in_use` is the error returned when collision occurs.
     - Adjust the "every diagnostic parses" test to drop the now-impossible
       `session_ambiguous` trigger.
   - `tests/cli/errorContracts.test.ts`: keep the `session_ambiguous` envelope-shape test
     (it tests `writeJsonFailure`, not the manager).
5. Capture the reversal in `.planning/PROJECT.md` Key Decisions so the trail is preserved
   without rewriting phase artifacts.

## Files

- `src/sessions/sessionManager.ts`
- `src/sessions/activeSession.ts`
- `src/controller/client.ts`
- `tests/controller/sessionManager.test.ts`
- `tests/cli/sessionCommands.test.ts`
- `.planning/PROJECT.md`

## Verification

- `npm test` passes.
- `npm run lint` clean.
- Hand check: `npx dap-cli launch --name foo …` then a second `launch --name foo …`
  returns `session_name_in_use`.

## Notes

This intentionally reverses a small piece of earlier work. Phase artifacts that referenced
the disambiguation behavior are immutable history per GSD convention; the PROJECT.md Key
Decisions row is the canonical pointer for future readers.
