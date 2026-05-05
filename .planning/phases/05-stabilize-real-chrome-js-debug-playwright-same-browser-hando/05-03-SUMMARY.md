---
phase: 05-stabilize-real-chrome-js-debug-playwright-same-browser-hando
plan: 03
status: complete
gap_closure: true
requirements:
  - TEST-07
files_modified:
  - src/protocol/dapClient.ts
  - src/sessions/session.ts
  - src/sessions/sessionManager.ts
  - tests/protocol/dapClient.test.ts
  - tests/controller/sessionManager.test.ts
---

# 05-03 Summary — DapClient reverse-request dispatch + parent/child session model

## Outcome

Opens the protocol- and session-model seam that plan 05-04 will use to bring up
js-debug child sessions for pwa-chrome's parent/child multiplexing. **No
controller behavior changes yet** — this plan only adds capability.

## Tasks completed

### Task 1 — Generalised DapClient reverse-request dispatch

- Added `DapClient.onReverseRequest(handler)` returning a disposer.
  - Single-handler model; later subscription replaces earlier (documented).
  - Disposer only clears the handler if it is still the registered one.
- Refactored `handleAdapterRequest` so that, per request:
  1. If a handler is registered, dispatch `{ command, arguments, seq }` to it.
  2. Handler may resolve to `{ success, body?, message? }` (used verbatim) or
     `undefined` (delegate to default handling).
  3. Default handling preserves built-in `runInTerminal` and the legacy
     `Unsupported adapter request: <command>` failure for everything else.
  4. Synchronous throws and rejected promises are translated to
     `{ success: false, message: <error.message> }` and never crash the parser.

### Task 2 — Parent/child linkage in the session model

- `SessionRecord` and `SessionSummary` gained an optional `parent_session_id`.
  `projectSessionSummary` only emits the field when defined, so wire output for
  non-child sessions is byte-identical to before.
- `SessionManager.registerChild({ parent_session_id, ...CreateSessionOptions })`:
  - Validates the parent exists; throws `parent_not_found` (sessionError) when
    not.
  - Persists the child through the same store path as `create()`.
  - Never steals active focus from the parent.
- `SessionManager.listChildren(parentId)` returns child summaries in insertion
  order; `[]` when none.
- `SessionManager.closeSession(parent)` now cascades — every session whose
  `parent_session_id` matches the closed session is removed atomically and the
  active session pointer is cleared if any of them held it.

## Verification

- `npm run build` — clean.
- `npm test` — 120 pass, 4 skipped (unchanged), 0 regressions.
- `npm test -- tests/protocol/dapClient.test.ts` — 12/12.
- `npm test -- tests/controller/sessionManager.test.ts` — 12/12.

## Self-Check: PASSED

- `grep -n parent_session_id src/sessions/session.ts src/sessions/sessionManager.ts` — present.
- `grep -n onReverseRequest src/protocol/dapClient.ts` — present.
- All `must_haves.truths` from PLAN.md frontmatter satisfied.

## Next

Plan 05-04 wires `controller/server.ts` to register an `onReverseRequest`
handler that opens a new DAP transport to the same adapter endpoint and runs
the `initialize → attach/launch → configurationDone` lifecycle as a
`registerChild`-tracked session, then routes `threads`/`stack`/`scopes`/
`variables` against the parent's children.
