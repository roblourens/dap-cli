---
phase: 1
slug: project-foundation-controller-and-dap-core
status: verified
threats_open: 0
asvs_level: 1
created: 2026-05-02
updated: 2026-05-02
---

# Phase 1 Security

Per-phase security contract: threat register, accepted risks, and audit trail.

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| shell argv -> CLI parser | Untrusted agent/user input enters command parsing. | Command names, options, JSON arguments |
| CLI parser -> stdout JSON | Handled command outcomes become machine-readable agent output. | Success and failure envelopes |
| environment -> path helper | `DAP_CLI_HOME` controls state and log roots. | Local filesystem paths |
| CLI process -> controller IPC | Local clients send JSON requests to the controller. | Newline-delimited controller requests/responses |
| discovery file -> controller client | Clients trust endpoint and pid data from local state. | Controller discovery metadata |
| controller -> session store | Session summaries and active target state are persisted locally. | Session records and active ID |
| cleanup -> OS processes | Cleanup can signal adapter processes only with ownership proof. | Process IDs and signals |
| adapter byte stream -> protocol parser | External adapters send framed JSON bytes. | DAP protocol messages |
| DAP event stream -> event cache | Adapter events become bounded status data for agents. | Recent DAP events |
| protocol client -> adapter transport | dap-cli writes DAP requests to external adapters. | DAP request frames |
| controller -> adapter process | dap-cli starts external adapter-like processes through descriptors. | Process command, args, cwd, env |
| adapter stderr -> diagnostics | External process stderr becomes bounded diagnostic data. | Stderr tail and log path |
| CLI DAP commands -> controller DAP routes | Agent-supplied DAP command/args cross into an active session. | DAP command name and request args |
| test subprocesses -> local machine | Integration tests spawn and stop controller/fake-adapter processes. | Test-owned process and temp state |

## Threat Register

| Threat ID | Category | Component | Disposition | Mitigation | Status |
|-----------|----------|-----------|-------------|------------|--------|
| T-01-01-01 | Tampering | build/test scripts | mitigate | `package.json` keeps explicit scripts and `check` runs typecheck, lint, test, and build. | closed |
| T-01-01-02 | Elevation of Privilege | CLI imports | mitigate | `tests/architecture/moduleBoundaries.test.ts` blocks CLI imports from protocol and adapter process internals. | closed |
| T-01-01-03 | Repudiation | process exit behavior | mitigate | `src/cli/exitCodes.ts` centralizes stable exit codes. | closed |
| T-01-02-01 | Tampering | stdout JSON contract | mitigate | `src/cli/output.ts` centralizes JSON writes; CLI JSON tests enforce one newline-terminated stdout object. | closed |
| T-01-02-02 | Information Disclosure | error mapping | mitigate | `src/cli/main.ts` maps unexpected errors to generic internal JSON; error contract tests assert stacks are not serialized. | closed |
| T-01-02-03 | Spoofing | `DAP_CLI_HOME` | mitigate | `src/config/paths.ts` resolves configured homes to absolute paths and tests isolate `DAP_CLI_HOME`. | closed |
| T-01-02-04 | Repudiation | JSON metadata | mitigate | `src/cli/output.ts` includes command and timestamp metadata on every envelope. | closed |
| T-01-03-01 | Spoofing | controller discovery | mitigate | `src/controller/ipc.ts` validates discovery with zod, pins version `1`, and checks pid/endpoint health before reuse. | closed |
| T-01-03-02 | Denial of Service | controller IPC | mitigate | Controller IPC rejects malformed JSON/schema failures and controller clients use bounded request/connect timeouts. | closed |
| T-01-03-03 | Tampering | discovery file | mitigate | Discovery is written under the resolved state root and stale discovery is removed by controller lifecycle/health paths. | closed |
| T-01-03-04 | Repudiation | controller diagnostics | mitigate | JSON envelopes include command/timestamp and controller/DAP failures preserve structured diagnostics. | closed |
| T-01-04-01 | Tampering | session store | mitigate | `src/sessions/sessionStore.ts` validates persisted records with zod and surfaces structured read/write failures. | closed |
| T-01-04-02 | Information Disclosure | persisted session state | mitigate | Session records persist summaries and bounded stderr tails, not raw launch environment or full adapter stderr. | closed |
| T-01-04-03 | Elevation of Privilege | cleanup process signaling | mitigate | `SessionManager.cleanupSessions` signals only adapters with `startedByDapCli === true`; tests cover unowned pids. | closed |
| T-01-04-04 | Spoofing | session target selection | mitigate | `resolveTargetSession` requires exact id/name matching with structured missing/unavailable errors. | closed |
| T-01-05-01 | Tampering | DAP frame parser | mitigate | `src/protocol/framing.ts` validates header separator, content length, JSON body, and message discriminants. | closed |
| T-01-05-02 | Denial of Service | event cache | mitigate | `DapEventCache` uses fixed capacity with dropped cursor accounting instead of unbounded storage. | closed |
| T-01-05-03 | Information Disclosure | event payload summaries | mitigate | Event history is bounded and adapter diagnostics are exposed through structured log path/stderr tail fields. | closed |
| T-01-06-01 | Tampering | DAP response matching | mitigate | `DapClient` resolves pending requests by `request_seq` and ignores unmatched responses safely. | closed |
| T-01-06-02 | Denial of Service | pending requests | mitigate | `DapClient` applies request timeouts and rejects all pending requests on transport close. | closed |
| T-01-06-03 | Repudiation | request diagnostics | mitigate | `DapClient.lastRequest` records command, seq, and timestamp for structured diagnostics. | closed |
| T-01-06-04 | Spoofing | socket transport host | mitigate | Socket transport and descriptor types restrict Phase 1 connects to `127.0.0.1`. | closed |
| T-01-07-01 | Elevation of Privilege | process adapter spawn | mitigate | `startProcessAdapter` uses `spawn` with an args array and `shell: false`; descriptor shapes are zod-validated. | closed |
| T-01-07-02 | Information Disclosure | adapter stderr/logs | mitigate | Process adapter diagnostics keep a 100-line stderr tail and expose log paths structurally. | closed |
| T-01-07-03 | Spoofing | socket descriptor | mitigate | `AdapterDescriptor` only accepts socket host `127.0.0.1`. | closed |
| T-01-07-04 | Tampering | internal `dap.request` payload | mitigate | Controller route parsing validates command/name/options and routes only to explicit or active controller-owned sessions. | closed |
| T-01-08-01 | Information Disclosure | structured errors | mitigate | Error-contract and integration tests assert bounded stderr/log paths and no raw stacks, full env, or full logs in handled JSON. | closed |
| T-01-08-02 | Tampering | stdout contract | mitigate | JSON output and CLI helper tests enforce exactly one newline-terminated JSON object on stdout. | closed |
| T-01-08-03 | Denial of Service | integration subprocesses | mitigate | `tests/helpers/runCli.ts` uses isolated `DAP_CLI_HOME`, stops test-owned controllers, and removes only test-owned temp roots. | closed |
| T-01-08-04 | Spoofing | event semantics | mitigate | Architecture tests block wait/watch/stream/subscribe event commands from Phase 1. | closed |

## Accepted Risks Log

No accepted risks.

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-05-02 | 30 | 30 | 0 | GitHub Copilot |

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-05-02