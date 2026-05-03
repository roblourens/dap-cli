---
phase: 01-project-foundation-controller-and-dap-core
plan: 06
subsystem: protocol-client
tags: [dap, transport, client, lifecycle, sequencing]
requires:
  - 01-05
provides:
  - Shared DapTransport abstraction
  - Stdio and socket transport wrappers
  - DAP client request sequencing, response matching, event dispatch, timeouts, and close handling
  - DAP lifecycle controller for initialize/launch/attach/configurationDone/stopped/continued/terminated/disconnect
  - Fake adapter script type contracts for later deterministic integration
affects: [phase-1, protocol, testing]
tech-stack:
  added: []
  patterns:
    - Pending DAP requests keyed by request seq and resolved by response request_seq
    - Events dispatched independently from pending requests
    - Lifecycle state model with stoppedEpoch invalidation
key-files:
  created:
    - src/protocol/transport.ts
    - src/protocol/stdioTransport.ts
    - src/protocol/socketTransport.ts
    - src/protocol/dapClient.ts
    - src/protocol/lifecycle.ts
    - src/testing/dapScript.ts
    - tests/protocol/dapClient.test.ts
    - tests/protocol/lifecycle.test.ts
  modified: []
key-decisions:
  - "DAP client is transport-neutral and consumes the shared Content-Length parser/encoder."
  - "Unsuccessful DAP responses reject with DapResponseError containing command and requestSeq."
  - "Lifecycle waits for initialized before configurationDone and clears stopped data on running transitions."
patterns-established:
  - "Fake transports use the real DAP frame parser/encoder in tests."
  - "Lifecycle tests use a minimal DapLifecycleClient interface to verify ordering without transport noise."
requirements-completed:
  - DAP-01
  - DAP-02
  - TEST-01
duration: 0 min
completed: 2026-05-02
---

# Phase 1 Plan 06: DAP Client and Lifecycle Summary

**Transport abstraction, stdio/socket wrappers, sequenced DAP client, lifecycle controller, and deterministic protocol tests**

## Performance

- **Duration:** 0 min
- **Started:** 2026-05-02T00:00:00Z
- **Completed:** 2026-05-02T00:00:00Z
- **Tasks:** 2 completed
- **Files modified:** 8 created

## Accomplishments

- Added the shared `DapTransport` interface required by the plan.
- Added stdio and socket transport wrappers, including a socket connect helper restricted to `127.0.0.1`.
- Added `DapClient` with monotonically increasing request seq values, pending request map keyed by seq, response matching by `request_seq`, event listeners, last-request metadata, request timeouts, failed-response errors, and pending rejection on transport close.
- Added `DapLifecycleController` with initialize-first ordering, launch and attach paths, initialized-event gating for `configurationDone`, running/stopped/terminated/disconnected states, stopped data, and `stoppedEpoch` increments.
- Added fake adapter script type contracts for later fake-adapter integration without real adapter behavior.
- Added deterministic tests for request sequencing, out-of-order responses, independent event dispatch, close rejection, lifecycle ordering, stopped invalidation, and disconnect behavior.

## Task Commits

Implementation will be committed with this summary as a single Plan 01-06 commit.

## Files Created/Modified

- `src/protocol/transport.ts` - shared DAP transport interface.
- `src/protocol/stdioTransport.ts` - child stdio transport wrapper.
- `src/protocol/socketTransport.ts` - socket transport wrapper and connect helper.
- `src/protocol/dapClient.ts` - request/response/event DAP client.
- `src/protocol/lifecycle.ts` - lifecycle controller and state types.
- `src/testing/dapScript.ts` - fake adapter script type contracts.
- `tests/protocol/dapClient.test.ts` - DAP client sequencing and event coverage.
- `tests/protocol/lifecycle.test.ts` - lifecycle ordering and state coverage.

## Decisions Made

- Kept transport ownership narrow: stdio transport closes stdin but does not own child kill policy.
- Kept lifecycle generic: launch/attach args are passed through as unknown DAP arguments and no adapter-specific assumptions were added.
- Used a minimal lifecycle client interface so lifecycle state can be tested independently from stream framing.

## Deviations from Plan

None - plan executed within the protocol transport/client/lifecycle scope.

---

**Total deviations:** 0 auto-fixed.  
**Impact on plan:** No scope change.

## Issues Encountered

- The shell variable name `status` is read-only in zsh; verification reran with a different local variable name.
- Lint required promise-returning close/request helpers to return `Promise.resolve()` directly instead of being marked `async` without `await`.
- `exactOptionalPropertyTypes` required lifecycle stopped data to be cleared with `delete` rather than assigning `undefined`.

## Verification

- `npm test -- tests/protocol/dapClient.test.ts tests/protocol/lifecycle.test.ts -- --run` passed.
- `rg -n "javascript|python|Playwright|js-debug|debugpy" src/protocol` found no matches.
- `npm run check` passed: typecheck, lint, tests, and build.
- Full suite result: 8 test files passed, 33 tests passed.

## User Setup Required

None.

## Next Phase Readiness

Ready for Plan 01-04: session manager, store, active targeting, status projection, and cleanup can build on controller IPC plus DAP lifecycle state.

---
*Phase: 01-project-foundation-controller-and-dap-core*  
*Completed: 2026-05-02*
