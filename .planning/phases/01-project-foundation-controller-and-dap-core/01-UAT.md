---
status: complete
phase: 01-project-foundation-controller-and-dap-core
source:
  - 01-01-SUMMARY.md
  - 01-02-SUMMARY.md
  - 01-03-SUMMARY.md
  - 01-04-SUMMARY.md
  - 01-05-SUMMARY.md
  - 01-06-SUMMARY.md
  - 01-07-SUMMARY.md
  - 01-08-SUMMARY.md
started: 2026-05-02T00:00:00Z
updated: 2026-05-02T21:22:33Z
---

## Current Test

[testing complete]

## Tests

### 1. Controller Lifecycle JSON Contract
expected: Running `dap-cli start`, `dap-cli status`, and `dap-cli stop` against an isolated `DAP_CLI_HOME` should produce exactly one newline-terminated JSON object on stdout for each command. The controller pid should be stable between start/status, stop should shut the controller down cleanly, and handled failures should leave stderr empty.
result: pass
verified_by: Built CLI smoke using isolated `.build/uat-controller-smoke`; start/status shared pid 16205, stop returned `stopped: true`, post-stop status returned `controller_unavailable`, and stderr files were empty.

### 2. Session State and Active Targeting
expected: A session can be created, listed, targeted by `use`, inspected with `status`, stopped, detached, closed, and cleaned up across separate CLI invocations without losing the active `sess_...` identity.
result: pass
verified_by: `npm run check` passed; covered by `tests/cli/sessionCommands.test.ts`, `tests/controller/sessionManager.test.ts`, and `tests/integration/fakeAdapterCli.test.ts`.

### 3. Fake Adapter Launch Lifecycle
expected: `launch --adapter fake --script stopped-on-entry --name demo` should initialize a generic fake adapter over stdio, return a `sess_...` session ID, report lifecycle `stopped`, expose log path/stderr tail structurally, route `request threads --json '{}'`, and clean up without orphaned adapter state.
result: pass
verified_by: `npm run check` passed; covered by `tests/integration/fakeAdapterCli.test.ts` and `tests/protocol/fakeAdapter.test.ts`.

### 4. Fake Adapter Attach and Detach
expected: `attach --adapter fake --script attach-stopped --name worker` should create an active stopped session, and `detach` should terminate the session state without requiring a repeated session ID.
result: pass
verified_by: `npm run check` passed; covered by `tests/integration/fakeAdapterCli.test.ts`.

### 5. Recent Events Polling
expected: `events --name demo --after-cursor N --limit M` should return immediately from the bounded event cache with `cursor`, `dropped`, and DAP event names. It should not wait, watch, stream, subscribe, or block for future events.
result: pass
verified_by: `npm run check` passed; covered by `tests/integration/fakeAdapterCli.test.ts`, `tests/protocol/eventCache.test.ts`, and `tests/architecture/moduleBoundaries.test.ts`.

### 6. DAP Failure Diagnostics
expected: When the fake adapter returns an unsuccessful DAP response, the CLI should exit with code 5 and emit one stdout JSON failure containing `error.category: "dap"`, `error.request.command`, `error.sessionId`, non-empty diagnostics, and empty stderr.
result: pass
verified_by: `npm run check` passed; covered by `tests/integration/fakeAdapterCli.test.ts` and `tests/cli/errorContracts.test.ts`.

### 7. Adapter Startup Diagnostics
expected: When the fake adapter writes startup stderr and closes transport, the CLI should exit with code 6 and emit one stdout JSON failure containing `error.category: "adapter"`, `error.adapter.descriptorId`, bounded `stderrTail`, `logPath`, `sessionId`, actionable diagnostics, and empty stderr.
result: pass
verified_by: `npm run check` passed; covered by `tests/integration/fakeAdapterCli.test.ts` and `tests/cli/errorContracts.test.ts`.

### 8. Scope and Boundary Gates
expected: The automated suite should fail if protocol modules contain language-specific adapter terms, if Phase 1 event commands add wait/watch/stream/subscribe behavior, if CLI modules import protocol or adapter process internals, or if Phase 2 preview commands disappear from the CLI examples.
result: pass
verified_by: `npm run check` passed; covered by `tests/architecture/moduleBoundaries.test.ts`.

## Summary

total: 8
passed: 8
issues: 0
pending: 0
skipped: 0
blocked: 0

## Gaps

[none yet]
