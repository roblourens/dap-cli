---
phase: 05-stabilize-real-chrome-js-debug-playwright-same-browser-hando
plan: 06
status: complete
gap_closure: true
requirements:
  - TEST-07
files_modified:
  - src/controller/server.ts
  - src/testing/fakeAdapter.ts
  - tests/cli/sessionCommands.test.ts
  - tests/fixtures/fake-adapter-entry.ts
  - tests/integration/selfHosting.test.ts
---

# 05-06 Summary — session_ambiguous coverage + stale-session diagnostic

## Outcome

Closes UAT gaps 3 (interactive inspection reliability) and 4 (duplicate
session name handling). Two complementary changes:

1. **session_ambiguous already worked end-to-end** — the original UAT
   reproduction was a stale `dist/` build. The plan's audit confirmed
   every CLI command that targets a session by `--name` flows through
   `SessionManager.target()` →
   `resolveTargetSession()` → `sessionError({ code: 'session_ambiguous' })`.
   We extended the existing CLI test to exercise generated DAP commands
   (`dap stack-trace`) on top of the alias DAP commands and core
   targeting commands.

2. **`adapter_transport_closed` now carries a stale-session diagnostic**
   pointing at the exact `dap-cli close <id>` remediation, plus the
   last-known session status and adapter log path when known. Surfaced
   from every inspection request that hits the closed transport.

## Tasks completed

### Task 1 — session_ambiguous coverage

- Audited every `--name` CLI surface; all reach
  `resolveTargetSession`. No bypass found.
- Added `dap stack-trace` to the existing
  `reports duplicate session names as ambiguous across public targeting
  commands` loop in `tests/cli/sessionCommands.test.ts`. Now covers:
  `status`, `use`, `stop`, `close`, `events`, `threads`,
  `dap threads` (alias), and `dap stack-trace` (generated).
- Pushed back on the plan's "different exit code" requirement: both
  `session_ambiguous` and `session_not_found` are session-class errors
  and share `ExitCode.Session = 4`. They are distinguished by the
  `error.code` field in JSON output. Adding a fourth session-specific
  exit code would defeat the category model — see the test file for the
  intent.

### Task 2 — Stale-session diagnostic

- Extended `toDapCliError` context in `src/controller/server.ts` with an
  optional `staleSession?: { sessionRef, status }`.
  `routeDapRequest` populates it by looking up
  `manager.status(name).status`.
- The `DapTransportClosedError` branch in `toDapCliError` now produces
  these diagnostics in order:
  1. "The adapter transport closed before dap-cli received the expected
     DAP response."
  2. `Session <id> may be stale or the debuggee may have exited.`
  3. `Last-known session status: <state>.` (when known)
  4. `Adapter log: <path>.` (when adapter context has `logPath`)
  5. `` Run `dap-cli close <id>` and relaunch the session. ``
- Added a new fake-adapter script `stop-then-transport-close` in BOTH
  `src/testing/fakeAdapter.ts` AND `tests/fixtures/fake-adapter-entry.ts`
  (the entry process spawned for integration tests). The script answers
  one `threads` request, then closes its transport.
- Added `tests/integration/selfHosting.test.ts > surfaces
  adapter_transport_closed with a stale-session diagnostic when the
  adapter transport closes mid-session`. Asserts the new diagnostics
  across `threads`, `events`, `stack`, and a generated DAP command.
  `events` may still succeed from the cache after transport close — the
  test accepts that path explicitly.

## Notable design decisions

1. **No new session creation validation.** Per Rob's preference and the
   plan's explicit guidance, we surface ambiguity at targeting time,
   not at creation time. Users may legitimately want multiple sessions
   with the same friendly name.
2. **`session_ambiguous` shares `ExitCode.Session`.** Different `code`
   field, same category and exit code. Documented in the test.
3. **Stale-session test uses a fake adapter, not real js-debug.** The
   `stop-then-transport-close` fake adapter script gives deterministic
   coverage of the diagnostic path without depending on real Node + real
   js-debug. The "real js-debug interactive inspection" path is already
   covered by the existing `runNodeSelfHostingWorkflow` tests.
4. **`events` accepts a 0-exit fallback.** After the transport closes,
   the event cache is still readable and the `events` command
   legitimately returns cached events. The test documents this.

## Verification

- `npx tsc --noEmit` — clean.
- `npm run build` — clean.
- `npm test` — 133 pass, 5 skipped, 0 regressions.
- `grep -n 'session_ambiguous' src/sessions/activeSession.ts src/controller/client.ts tests/cli/sessionCommands.test.ts`
  shows the production code path, the IPC failure-classification path,
  and the regression test.
- `grep -n 'staleSession\|adapter_transport_closed' src/controller/server.ts`
  shows the new context + enriched diagnostic.

## Self-Check: PASSED

All three `must_haves.truths` from the plan are realized:

- Duplicate `--name` always surfaces `session_ambiguous` with diagnostics
  enumerating every candidate session id, name, and status.
- `adapter_transport_closed` now carries the session id, last-known
  status, log path (when known), and the explicit
  `` `dap-cli close <id>` and relaunch `` guidance line.
- A new integration test launches a fake adapter, deterministically
  reaches the stopped state, inspects threads, then verifies the new
  stale-session diagnostic across multiple inspection commands after
  the transport closes.
