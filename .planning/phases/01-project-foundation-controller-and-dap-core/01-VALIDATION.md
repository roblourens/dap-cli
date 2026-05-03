---
phase: 1
slug: project-foundation-controller-and-dap-core
status: verified
nyquist_compliant: true
wave_0_complete: true
created: 2026-05-02
updated: 2026-05-02
---

# Phase 1 Validation Strategy

Per-phase validation contract for feedback sampling during execution.

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest |
| **Config file** | `vitest.config.ts` |
| **Quick run command** | `npm test -- --run` |
| **Full suite command** | `npm run check` |
| **Estimated runtime** | ~2 seconds |

## Sampling Rate

- **After every task commit:** Run `npm test -- --run` or the task's targeted Vitest files.
- **After every plan wave:** Run `npm run check`.
- **Before `/gsd-verify-work`:** Full suite must be green.
- **Max feedback latency:** ~2 seconds for the current full suite.

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 01-01 | 01 | 1 | TEST-03 | T-01-01-01, T-01-01-02, T-01-01-03 | CLI boundaries and script contracts are enforced before later code expands. | architecture/unit | `npm run check` | yes | green |
| 01-02 | 02 | 2 | AGNT-01, AGNT-02, AGNT-03, TEST-03 | T-01-02-01, T-01-02-02, T-01-02-03, T-01-02-04 | Handled success/failure output is one structured stdout JSON envelope with safe diagnostics. | unit | `npm test -- tests/cli/jsonOutput.test.ts tests/cli/errorContracts.test.ts -- --run` | yes | green |
| 01-03 | 03 | 3 | SESS-01, AGNT-02, TEST-03 | T-01-03-01, T-01-03-02, T-01-03-03, T-01-03-04 | Controller discovery and IPC survive separate CLI invocations with structured failures. | controller/cli | `npm test -- tests/controller/controllerIpc.test.ts tests/cli/jsonOutput.test.ts -- --run` | yes | green |
| 01-04 | 04 | 4 | SESS-04, SESS-05, DBG-05, AGNT-03, TEST-03 | T-01-04-01, T-01-04-02, T-01-04-03, T-01-04-04 | Session state is persisted, targeted, cleaned, and projected without unsafe process signaling. | controller/cli | `npm test -- tests/controller/sessionManager.test.ts tests/cli/sessionCommands.test.ts -- --run` | yes | green |
| 01-05 | 05 | 2 | DAP-01, DBG-06, TEST-01 | T-01-05-01, T-01-05-02, T-01-05-03 | DAP frames are parsed safely and event history remains bounded. | protocol | `npm test -- tests/protocol/framing.test.ts tests/protocol/eventCache.test.ts -- --run` | yes | green |
| 01-06 | 06 | 3 | DAP-01, DAP-02, TEST-01 | T-01-06-01, T-01-06-02, T-01-06-03, T-01-06-04 | DAP requests match responses by `request_seq`, time out, reject on close, and preserve request diagnostics. | protocol | `npm test -- tests/protocol/dapClient.test.ts tests/protocol/lifecycle.test.ts -- --run` | yes | green |
| 01-07 | 07 | 5 | SESS-01, SESS-05, DAP-01, DAP-02, DBG-05, DBG-06, TEST-01 | T-01-07-01, T-01-07-02, T-01-07-03, T-01-07-04 | Generic adapter descriptors, fake adapter runtimes, DAP routes, and event polling work end to end. | integration/protocol | `npm test -- tests/protocol/fakeAdapter.test.ts tests/integration/fakeAdapterCli.test.ts -- --run` | yes | green |
| 01-08 | 08 | 6 | SESS-04, SESS-05, DBG-05, DBG-06, AGNT-01, AGNT-02, AGNT-03, TEST-01, TEST-03 | T-01-08-01, T-01-08-02, T-01-08-03, T-01-08-04 | Final diagnostics, polling-only event scope, and isolated integration cleanup are enforced. | cli/integration/architecture | `npm test -- tests/cli/errorContracts.test.ts tests/architecture/moduleBoundaries.test.ts tests/integration/fakeAdapterCli.test.ts -- --run` | yes | green |

## Requirement Coverage

| Requirement | Coverage | Primary Tests | Status |
|-------------|----------|---------------|--------|
| SESS-01 | Persistent controller and cross-invocation session behavior | `tests/controller/controllerIpc.test.ts`, `tests/integration/fakeAdapterCli.test.ts` | green |
| SESS-04 | List/status/use active targeting | `tests/controller/sessionManager.test.ts`, `tests/cli/sessionCommands.test.ts`, `tests/integration/fakeAdapterCli.test.ts` | green |
| SESS-05 | Stop/detach/close/cleanup without stale state or unsafe process signaling | `tests/controller/sessionManager.test.ts`, `tests/integration/fakeAdapterCli.test.ts` | green |
| DAP-01 | stdio/socket DAP transport communication | `tests/protocol/framing.test.ts`, `tests/protocol/dapClient.test.ts`, `tests/protocol/fakeAdapter.test.ts`, `tests/integration/fakeAdapterCli.test.ts` | green |
| DAP-02 | initialize/launch/attach/configurationDone/stopped/termination lifecycle | `tests/protocol/lifecycle.test.ts`, `tests/protocol/fakeAdapter.test.ts`, `tests/integration/fakeAdapterCli.test.ts` | green |
| DBG-05 | Poll current session status | `tests/cli/sessionCommands.test.ts`, `tests/integration/fakeAdapterCli.test.ts` | green |
| DBG-06 | Inspect bounded recent event history | `tests/protocol/eventCache.test.ts`, `tests/integration/fakeAdapterCli.test.ts` | green |
| AGNT-01 | Machine-readable JSON output | `tests/cli/jsonOutput.test.ts`, `tests/helpers/runCli.ts` callers | green |
| AGNT-02 | Stable nonzero exit codes and structured failures | `tests/cli/errorContracts.test.ts`, `tests/integration/fakeAdapterCli.test.ts` | green |
| AGNT-03 | Adapter stderr/log/request/session diagnostics | `tests/cli/errorContracts.test.ts`, `tests/integration/fakeAdapterCli.test.ts` | green |
| TEST-01 | Protocol framing, sequencing, event caching, session state with fake adapter | `tests/protocol/*.test.ts`, `tests/integration/fakeAdapterCli.test.ts` | green |
| TEST-03 | CLI parsing and JSON contracts | `tests/cli/jsonOutput.test.ts`, `tests/cli/errorContracts.test.ts`, `tests/cli/sessionCommands.test.ts` | green |

## Wave 0 Requirements

Existing infrastructure covers all phase requirements.

## Manual-Only Verifications

All Phase 1 behaviors have automated verification, plus `01-UAT.md` records automated UAT evidence for the user-facing contract.

## Validation Audit 2026-05-02

| Metric | Count |
|--------|-------|
| Requirements audited | 12 |
| Automated coverage | 12 |
| Missing coverage | 0 |
| Manual-only items | 0 |

## Validation Sign-Off

- [x] All tasks have automated verification or existing infrastructure coverage
- [x] Sampling continuity: no 3 consecutive tasks without automated verification
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 2 seconds
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-05-02