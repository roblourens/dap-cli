---
quick_id: 260516-lmy
slug: here-s-an-error-that-was-reported-by-an-
status: complete
subsystem: controller
tags: [dap, disconnect, js-debug, sessions]
key-files:
  created: []
  modified:
    - src/controller/server.ts
    - src/testing/fakeAdapter.ts
    - tests/controller/sessionManager.test.ts
    - tests/integration/fakeAdapterCli.test.ts
duration: 3min
completed: 2026-05-16
---

# Quick Task 260516-lmy Summary

**Stop and detach now send explicit DAP `disconnect` payloads, preventing js-debug from receiving undefined disconnect arguments on ordinary session shutdown.**

## Performance

- **Duration:** 3 min
- **Started:** 2026-05-16T22:36:22Z
- **Completed:** 2026-05-16T22:38:54Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments

- Added controller regression coverage that directly records outbound disconnect bodies for both `sessions.stop` and `sessions.detach`.
- Added CLI coverage that directly confirms `stop --name` and `detach --name` send the expected disconnect bodies.
- Extended the shared fake socket adapter to expose received DAP requests so payload assertions stay direct and reusable.
- Threaded route intent into `disconnectRuntimeForTarget`, keeping close/purge/controller-shutdown teardown logic unchanged.

## Task Commits

1. **Task 1: Lock the stop/detach disconnect contract with focused tests** - `cf15f7b` (test)
2. **Task 2: Send explicit disconnect args from the shared stop/detach runtime helper** - `0f7f352` (fix)
3. **Review follow-up: Assert disconnect payloads through shared fake sockets** - `0dad1bd` (test)

## Files Created/Modified

- `src/controller/server.ts` - Sends `{ terminateDebuggee: true }` for stop and `{ terminateDebuggee: false }` for detach.
- `src/testing/fakeAdapter.ts` - Captures received socket-adapter requests for direct test assertions.
- `tests/controller/sessionManager.test.ts` - Records controller-emitted disconnect payloads and distinguishes stop from detach semantics.
- `tests/integration/fakeAdapterCli.test.ts` - Verifies CLI stop and detach commands transmit shaped disconnect payloads.

## Decisions Made

- `sessions.stop` preserves termination intent with `terminateDebuggee: true`.
- `sessions.detach` remains non-terminating with `terminateDebuggee: false`.
- Existing close, purge, and controller-shutdown teardown behavior remains on the separate `terminateRuntime` path.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- The first fake-adapter matcher returned a failed DAP response that the stop route intentionally swallowed during disconnect cleanup, so follow-up coverage records outbound requests directly and checks both CLI stop and detach payloads.

## Verification

- `npx vitest run tests/controller/sessionManager.test.ts tests/integration/fakeAdapterCli.test.ts` - passed, 94 tests.
- `npm run typecheck` - passed.

## User Setup Required

None.

## Next Step Readiness

- The reported js-debug undefined-disconnect-args path is covered at controller and CLI levels.
- No known stubs or new threat surface were found in the touched files.

## Self-Check: PASSED

- Summary file exists at the requested quick-task path.
- Task commits `cf15f7b`, `0f7f352`, and `0dad1bd` are present in git history.
- Only `.planning/STATE.md` and this summary remain uncommitted for the orchestrator docs commit.

---
*Quick task: 260516-lmy*
*Completed: 2026-05-16*