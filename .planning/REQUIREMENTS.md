# Requirements: dap-cli

**Defined:** 2026-05-02
**Core Value:** Agents can reliably control a DAP debug session from repeatable CLI commands and inspect paused application state without needing language-specific debugger knowledge.

## v1 Requirements

Requirements for the initial release. Each maps to roadmap phases.

### Sessions

- [x] **SESS-01**: Agent can start a persistent dap-cli controller that preserves debugger sessions across separate CLI invocations.
- [x] **SESS-02**: Agent can launch a debug target through a configured adapter and receive a stable session ID.
- [x] **SESS-03**: Agent can attach or open a session against an existing adapter or debug target when the adapter supports it.
- [x] **SESS-04**: Agent can list sessions, inspect session status, and target a default active session without repeating the session ID on every command.
- [x] **SESS-05**: Agent can stop, detach, close, and clean up sessions without leaving stale controller state or orphaned adapter processes.

### Protocol

- [x] **DAP-01**: dap-cli can communicate with debug adapters over DAP using stdio and socket-style transports.
- [x] **DAP-02**: dap-cli models the DAP lifecycle explicitly, including initialize, launch or attach, initialized, breakpoint setup, configurationDone, stopped events, and termination.
- [x] **DAP-03**: Agent can invoke every DAP request through a generated typed CLI command derived from official protocol metadata.
- [x] **DAP-04**: Agent can use a raw JSON DAP request passthrough as an escape hatch for protocol features not yet covered by ergonomic command UX.
- [x] **DAP-05**: dap-cli reports adapter capabilities and unsupported requests clearly before or after command execution.

### Debugging Operations

- [x] **DBG-01**: Agent can set, replace, and inspect breakpoints, including verified breakpoint results from the adapter.
- [x] **DBG-02**: Agent can inspect threads, stack traces, scopes, and variables for a paused session.
- [x] **DBG-03**: Agent can continue, pause, step over, step in, and step out of execution when the adapter supports those requests.
- [x] **DBG-04**: Agent can evaluate expressions and inspect source context through CLI commands when the adapter supports those requests.
- [x] **DBG-05**: Agent can poll current session status to determine whether execution is running, paused, terminated, or unavailable.
- [x] **DBG-06**: Agent can inspect a bounded recent event history for a session to understand how the current state was reached.

### Adapters

- [x] **ADPT-01**: dap-cli includes built-in JavaScript debugging support using js-debug or a compatible configured JS DAP server.
- [x] **ADPT-02**: JavaScript debugging supports source maps sufficiently for TypeScript or bundled JavaScript workflows.
- [x] **ADPT-03**: dap-cli includes built-in Python debugging support using debugpy or a compatible configured Python DAP server.
- [x] **ADPT-04**: User can define custom adapters in persistent config with command, args, cwd, env, transport, and launch or attach defaults.
- [x] **ADPT-05**: Agent can override adapter selection and launch or attach configuration from command-line arguments.
- [x] **ADPT-06**: Built-in JavaScript and Python adapter flows have automated smoke tests that validate real launch, breakpoint, pause, inspect, continue, and cleanup behavior.

### Agent Workflow

- [x] **AGNT-01**: dap-cli commands return machine-readable JSON output suitable for agent parsing.
- [x] **AGNT-02**: dap-cli uses stable nonzero exit codes and structured error payloads for failed commands.
- [x] **AGNT-03**: dap-cli surfaces adapter stderr, log paths, request names, session IDs, and actionable diagnostics when a command fails.
- [x] **AGNT-04**: Documentation includes agent-oriented workflows that interleave dap-cli commands with `playwright-cli` ([`@playwright/cli`](https://www.npmjs.com/package/@playwright/cli)) commands. ([`@playwright/test`](https://www.npmjs.com/package/@playwright/test) is also covered as an alternative driver.)
- [x] **AGNT-05**: Documentation includes examples for polling session status instead of relying on event streaming in v1.

### Help / CLI Discoverability

- [ ] **HELP-01**: `dap-cli help` and `dap-cli help <path...>` exit 0 and emit no JSON envelope on either stream (the spurious `(outputHelp)` `usage_error` payload is gone).
- [ ] **HELP-02**: `dap-cli help <cmd> <subcmd>` drills into the subcommand tree and prints the deepest match's help (e.g. `dap-cli help breakpoints set` prints the help for `breakpoints set`, not `breakpoints`); unknown drill-down paths produce a clean `usage_error` envelope.
- [ ] **HELP-03**: `dap-cli help` groups top-level commands under category headings (Controller lifecycle / Sessions / Launch & attach / Breakpoints / Paused-state inspection / Execution control / DAP protocol escape hatches) instead of one flat list.

### Verification

- [x] **TEST-01**: Protocol framing, request sequencing, event caching, and session state are covered by deterministic fake-adapter tests.
- [x] **TEST-02**: Generated typed DAP command coverage is tested against the selected official DAP protocol metadata so missing requests are detected automatically.
- [x] **TEST-03**: CLI parsing and JSON output contracts are covered by automated tests for representative commands and failure cases.
- [x] **TEST-04**: JavaScript and Python built-in adapters have end-to-end smoke tests that agents can run without relying on manual user validation.
- [x] **TEST-05**: The repository includes a deterministic scripted test suite that exercises every implemented feature and supported command path.
- [x] **TEST-06**: Once dap-cli reaches a minimally usable form, development and validation include self-hosting workflows that use dap-cli to debug dap-cli or its fixtures.
- [x] **TEST-07**: The verification strategy includes agentic exploratory debugging scenarios that combine dap-cli with dynamic application interaction, such as Playwright-driven UI actions.

## v2 Requirements

Deferred to future release. Tracked but not in current roadmap.

### Events

- **EVNT-01**: Agent can run a blocking wait command such as `wait-for-stopped --timeout` after v1 polling semantics are proven.
- **EVNT-02**: Agent can subscribe to or stream DAP events from a running session.

### Configuration

- **CONF-01**: User can import useful parts of VS Code `launch.json` files.
- **CONF-02**: User can export dap-cli adapter/session configuration examples for sharing.

### Adapters

- **ADPT-07**: dap-cli bundles additional common adapters beyond JavaScript and Python when packaging and licensing are understood.

### Interfaces

- **UI-01**: dap-cli provides a watch mode or TUI for humans monitoring agent-driven debugging.

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| Event streaming in v1 | Polling is the chosen v1 model; streaming needs a separate event subscription design. |
| Blocking wait commands in v1 | Useful later, but v1 should first prove polling and session state. |
| Bundling adapters beyond JavaScript and Python | JS and Python are the requested built-ins; more adapters add packaging complexity. |
| Full VS Code `launch.json` compatibility in v1 | DAP config compatibility is required, but VS Code-specific behavior can be deferred. |
| Graphical debugger UI | The product is a CLI for agents. |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| SESS-01 | Phase 1 | Complete |
| SESS-02 | Phase 3 | Complete |
| SESS-03 | Phase 3 | Complete |
| SESS-04 | Phase 1 | Complete |
| SESS-05 | Phase 1 | Complete |
| DAP-01 | Phase 1 | Complete |
| DAP-02 | Phase 1 | Complete |
| DAP-03 | Phase 2 | Complete |
| DAP-04 | Phase 2 | Complete |
| DAP-05 | Phase 2 | Complete |
| DBG-01 | Phase 2 | Complete |
| DBG-02 | Phase 2 | Complete |
| DBG-03 | Phase 2 | Complete |
| DBG-04 | Phase 2 | Complete |
| DBG-05 | Phase 1 | Complete |
| DBG-06 | Phase 1 | Complete |
| ADPT-01 | Phase 3 | Complete |
| ADPT-02 | Phase 3 | Complete |
| ADPT-03 | Phase 3 | Complete |
| ADPT-04 | Phase 3 | Complete |
| ADPT-05 | Phase 3 | Complete |
| ADPT-06 | Phase 3 | Complete |
| AGNT-01 | Phase 1 | Complete |
| AGNT-02 | Phase 1 | Complete |
| AGNT-03 | Phase 1 | Complete |
| AGNT-04 | Phase 4 | Complete |
| AGNT-05 | Phase 4 | Complete |
| TEST-01 | Phase 1 | Complete |
| TEST-02 | Phase 2 | Complete |
| TEST-03 | Phase 1 | Complete |
| TEST-04 | Phase 3 | Complete |
| TEST-05 | Phase 2 | Complete |
| TEST-06 | Phase 4 | Complete |
| TEST-07 | Phase 4 | Complete |

**Coverage:**
- v1 requirements: 34 total
- Mapped to phases: 34
- Unmapped: 0

---
*Requirements defined: 2026-05-02*
*Last updated: 2026-05-03 after Phase 3 verification*
