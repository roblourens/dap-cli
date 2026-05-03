---
phase: 01-project-foundation-controller-and-dap-core
plan: 05
subsystem: protocol-core
tags: [dap, protocol, framing, event-cache, polling]
requires:
  - 01-01
provides:
  - Language-neutral DAP request, response, and event message types
  - DAP Content-Length encoder and arbitrary-chunk parser
  - Typed DAP frame errors
  - Bounded cursor-based recent event cache for polling
affects: [phase-1, protocol, controller, testing]
tech-stack:
  added: []
  patterns:
    - Byte-accurate DAP framing with Buffer.byteLength
    - Parser accumulates arbitrary Buffer chunks and emits complete messages
    - Event cache returns immediate snapshots with cursor, capacity, and dropped counts
key-files:
  created:
    - src/protocol/dapMessages.ts
    - src/protocol/framing.ts
    - src/protocol/eventCache.ts
    - tests/protocol/framing.test.ts
    - tests/protocol/eventCache.test.ts
  modified: []
key-decisions:
  - "Protocol primitives are kept language-neutral and contain no adapter-specific cases."
  - "The parser throws DapFrameError for invalid frames instead of silently dropping malformed input."
  - "The event cache defaults to capacity 100 per the plan contract and never waits for future events."
patterns-established:
  - "DAP parser tests cover split headers, split bodies, multiple frames, invalid Content-Length, and UTF-8 byte lengths."
  - "Event cache tests cover monotonic cursors, eviction, dropped counts, afterCursor, limit, metadata, and summaries."
requirements-completed:
  - DAP-01
  - DBG-06
  - TEST-01
duration: 0 min
completed: 2026-05-02
---

# Phase 1 Plan 05: DAP Protocol Primitives Summary

**Language-neutral DAP message discriminants, Content-Length framing, and bounded polling event cache**

## Performance

- **Duration:** 0 min
- **Started:** 2026-05-02T00:00:00Z
- **Completed:** 2026-05-02T00:00:00Z
- **Tasks:** 2 completed
- **Files modified:** 5 created

## Accomplishments

- Added DAP request, response, and event interfaces plus type guards.
- Added `DapMessageParser` for arbitrary stream chunks, split headers, split bodies, multiple messages per chunk, UTF-8 JSON parsing, and typed frame failures.
- Added `encodeDapMessage()` with `Buffer.byteLength(json, 'utf8')` for correct non-ASCII payload lengths.
- Added `DapEventCache` with default capacity `100`, monotonic cursors, eviction, dropped-count reporting, `afterCursor`, `limit`, timestamps, session IDs, DAP seq values, event names, optional body, and summaries.
- Added deterministic protocol tests for framing and polling cache behavior.

## Task Commits

Implementation will be committed with this summary as a single Plan 01-05 commit.

## Files Created/Modified

- `src/protocol/dapMessages.ts` - DAP message interfaces and discriminant guards.
- `src/protocol/framing.ts` - Content-Length encoder/parser and `DapFrameError`.
- `src/protocol/eventCache.ts` - bounded cursor-based event cache for polling.
- `tests/protocol/framing.test.ts` - DAP framing coverage.
- `tests/protocol/eventCache.test.ts` - event cache coverage.

## Decisions Made

- Used immediate snapshots for `recent()`; no subscription, watch, wait, or streaming behavior was added.
- Returned the newest events when `limit` is provided, which matches a recent-event polling model.
- Kept protocol code free of adapter and language strings so JavaScript/Python support can layer on later.

## Deviations from Plan

None - plan executed within the protocol primitive scope.

---

**Total deviations:** 0 auto-fixed.  
**Impact on plan:** No scope change.

## Issues Encountered

- TypeScript required explicit cursor narrowing before filtering events by `afterCursor`; fixed by storing the narrowed value in a local constant.
- ESLint flagged an unused `catch` binding in frame parsing; fixed by using a binding-free `catch` block.

## Verification

- `npm test -- tests/protocol/framing.test.ts tests/protocol/eventCache.test.ts -- --run` passed.
- `grep -R "javascript\|python\|js-debug\|debugpy\|Playwright" src/protocol && exit 1 || exit 0` passed.
- `npm run typecheck` passed.
- `npm run check` passed: typecheck, lint, tests, and build.

## User Setup Required

None.

## Next Phase Readiness

Ready for Wave 3. Plan 01-03 can build controller IPC/discovery on the CLI/path contracts, and Plan 01-06 can build DAP client sequencing and transport lifecycle on the protocol primitives.

---
*Phase: 01-project-foundation-controller-and-dap-core*  
*Completed: 2026-05-02*
