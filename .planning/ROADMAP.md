# Roadmap: dap-cli

## Overview

v1 builds dap-cli from a clean TypeScript/Node foundation into a professional agent-facing Debug Adapter Protocol CLI. The work starts with a persistent controller and vanilla, language-neutral DAP core, expands into a generated typed command surface for the full protocol, adds built-in and custom adapter support through external-service boundaries, and finishes with agent workflow documentation, examples, self-hosting, smoke coverage, and exploratory verification.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [x] **Phase 1: Project Foundation, Controller, and DAP Core** - Establish the modular CLI architecture, persistent controller, language-neutral DAP client, polling state, diagnostics, and deterministic fake-adapter tests.
- [x] **Phase 2: Complete Typed DAP Command Surface** - Generate and verify typed CLI commands for every DAP request, with ergonomic debugging operations and scripted command coverage.
- [ ] **Phase 3: Built-in and Custom Adapter Support** - Add JavaScript, Python, and user-defined adapter flows through descriptor/config/process/transport boundaries, including JS source maps and E2E smoke tests.
- [ ] **Phase 4: Agent Workflow, Documentation, and Self-Hosting Verification** - Polish the agent experience with README/user docs, Playwright interop examples, self-hosting, smoke verification, and agentic exploratory tests.

## Phase Details

### Phase 1: Project Foundation, Controller, and DAP Core
**Goal**: Agents can operate a persistent dap-cli controller backed by a clean modular architecture and a vanilla, language-neutral DAP core.
**Depends on**: Nothing (first phase)
**Requirements**: SESS-01, SESS-04, SESS-05, DAP-01, DAP-02, DBG-05, DBG-06, AGNT-01, AGNT-02, AGNT-03, TEST-01, TEST-03
**Success Criteria** (what must be TRUE):
  1. Agent can start, list, target, stop, detach, close, and clean up persistent sessions across separate CLI invocations without stale controller state or orphaned adapter processes.
  2. The DAP core communicates with adapters over stdio and socket-style transports, models initialize/launch-or-attach/configurationDone/stopped/termination lifecycle states, and contains no JavaScript or Python special cases.
  3. Agent can poll session status and inspect bounded recent event history as stable JSON, with structured nonzero failures that include session IDs, request names, adapter stderr summaries, log paths, and actionable diagnostics.
  4. CLI, controller/session store, protocol transport/client, adapter descriptor, config, and testing modules are separated by explicit internal boundaries suitable for a professional modular TypeScript project.
  5. Deterministic fake-adapter tests verify protocol framing, request sequencing, lifecycle transitions, event caching, session state, CLI parsing, JSON output, and representative failure contracts.
**Plans**: 8 plans

Plans:
**Wave 1**
- [x] 01-01: Scaffold package tooling, CLI entrypoint, and architecture boundary tests

**Wave 2** *(blocked on Wave 1 completion)*
- [x] 01-02: Implement CLI command shell, JSON envelopes, exit codes, and path contracts
- [x] 01-05: Implement DAP message framing and bounded event cache primitives

**Wave 3** *(blocked on Wave 2 completion)*
- [x] 01-03: Implement controller discovery, local IPC, client/server lifecycle, and controller commands
- [x] 01-06: Implement stdio/socket transports, DAP client sequencing, and lifecycle state machine

**Wave 4** *(blocked on Wave 3 controller completion)*
- [x] 01-04: Implement session manager, store, active targeting, status projection, and cleanup lifecycle

**Wave 5** *(blocked on Wave 4 and Wave 3 protocol completion)*
- [x] 01-07: Integrate generic adapter descriptors, fake adapter harness, and controller DAP routes

**Wave 6** *(blocked on Wave 5 completion)*
- [x] 01-08: Harden diagnostics, error contracts, deterministic integration tests, and final scope gates

Cross-cutting constraints:
- No exact `must_haves.truths` entries appear in two or more Phase 1 plans.

### Phase 2: Complete Typed DAP Command Surface
**Goal**: Agents can discover and invoke every DAP request through generated typed CLI commands while using ergonomic aliases for common debugging workflows.
**Depends on**: Phase 1
**Requirements**: DAP-03, DAP-04, DAP-05, DBG-01, DBG-02, DBG-03, DBG-04, TEST-02, TEST-05
**Success Criteria** (what must be TRUE):
  1. Agent can invoke every DAP request through a generated typed CLI command derived from official protocol metadata, and coverage tests fail when protocol requests are missing.
  2. Agent can use raw JSON DAP request passthrough for escape-hatch protocol access while receiving clear capability and unsupported-request reporting from adapters.
  3. Agent can set, replace, and inspect verified breakpoints; inspect threads, stack traces, scopes, variables, source context, and evaluations; and continue, pause, step over, step in, or step out when supported.
  4. Generated protocol commands and hand-written ergonomic aliases share the same validation, routing, JSON output, error, and capability contracts without duplicating protocol logic.
  5. Deterministic scripted tests exercise every implemented feature and supported command path, including generated command inventory, representative success cases, unsupported capabilities, and paused/unpaused edge cases.
**Plans**: 4 plans

Plans:
**Wave 1**
- [x] 02-01: Build protocol metadata generator and typed command registry

**Wave 2** *(blocked on Wave 1 completion)*
- [x] 02-02: Implement raw request passthrough, capability reporting, and unsupported-request diagnostics

**Wave 3** *(blocked on Wave 2 completion)*
- [x] 02-03: Add ergonomic breakpoint, inspection, evaluation, and execution-control commands

**Wave 4** *(blocked on Wave 3 completion)*
- [x] 02-04: Add generated command coverage tests and deterministic scripted feature coverage

Cross-cutting constraints:
- Generated commands and ergonomic aliases must converge on generated registry metadata and the existing controller `dap.request` route.
- Raw `request <command> --json '{}'` passthrough must remain available beside typed commands.
- Capability reporting and unsupported-request failures must preserve the existing JSON envelope, handled `CliError`, session targeting, and controller IPC contracts.

### Phase 3: Built-in and Custom Adapter Support
**Goal**: Agents can launch, attach, and debug JavaScript, Python, and configured custom adapters through external-service descriptors and transport boundaries.
**Depends on**: Phase 2
**Requirements**: SESS-02, SESS-03, ADPT-01, ADPT-02, ADPT-03, ADPT-04, ADPT-05, ADPT-06, TEST-04
**Success Criteria** (what must be TRUE):
  1. Agent can launch JavaScript and Python debug targets through built-in adapter descriptors and receive stable session IDs, or attach/open sessions when the selected adapter supports it.
  2. JavaScript debugging supports source maps sufficiently for TypeScript or bundled JavaScript workflows, with verified breakpoint, pause, stack, and source behavior.
  3. User can define custom adapters in persistent config with command, args, cwd, env, transport, and launch/attach defaults, while agents can override adapter selection and debug config from CLI arguments.
  4. Adapter integration is expressed through descriptor, config, process, and transport boundaries so debug adapters remain external services and the DAP core remains vanilla and language-neutral.
  5. JavaScript and Python E2E smoke tests validate real launch, breakpoint, pause, inspect, continue, and cleanup behavior without manual user validation.
**Plans**: 4 plans

Plans:
**Wave 1**
- [x] 03-01: Implement adapter registry, persistent config, launch config resolution, and CLI overrides

**Wave 2** *(blocked on Wave 1 completion)*
- [x] 03-02: Add built-in JavaScript adapter support with Node, Chrome, Electron, and source-map smoke coverage
- [x] 03-03: Add built-in Python adapter support with debugpy launch and attach coverage

**Wave 3** *(blocked on Wave 2 completion)*
- [x] 03-04: Harden launch/attach flows, process cleanup, diagnostics, custom adapter overrides, and final E2E verification

### Phase 4: Agent Workflow, Documentation, and Self-Hosting Verification
**Goal**: Agents and users can confidently use, verify, and extend dap-cli through polished docs, examples, self-hosting workflows, and exploratory dynamic validation.
**Depends on**: Phase 3
**Requirements**: AGNT-04, AGNT-05, TEST-06, TEST-07
**Success Criteria** (what must be TRUE):
  1. README and user docs explain installation, controller/session workflows, polling-only v1 semantics, JSON/error contracts, cleanup, custom adapters, and JavaScript/Python examples.
  2. Documentation includes agent-oriented Playwright interop examples that sequence dap-cli commands with Playwright CLI actions using polling status, stack, variables, evaluation, continue, and cleanup commands.
  3. Smoke and self-hosting workflows use dap-cli to debug dap-cli or its fixtures once minimally usable, proving the tool can support its own development loops.
  4. Agentic exploratory verification combines dap-cli with dynamic application interaction and turns successful scenarios into reproducible scripts, examples, or documented playbooks.
  5. Professional project polish is present: generated help is coherent, command examples are discoverable, packaging/readiness checks pass, and final v1 docs match implemented behavior.
**Plans**: 4 plans

Plans:
- [ ] 04-01: Write README, user docs, agent workflow guide, and Playwright interop examples
- [ ] 04-02: Polish command help, examples, packaging, and project readiness checks
- [ ] 04-03: Add smoke and self-hosting verification workflows for dap-cli and fixtures
- [ ] 04-04: Run agentic exploratory dynamic debugging scenarios and finalize v1 verification notes

## Progress

**Execution Order:**
Phases execute in numeric order: 1 -> 2 -> 3 -> 4

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Project Foundation, Controller, and DAP Core | 8/8 | Complete | 2026-05-02 |
| 2. Complete Typed DAP Command Surface | 4/4 | Complete | 2026-05-03 |
| 3. Built-in and Custom Adapter Support | 4/4 | Complete | 2026-05-03 |
| 4. Agent Workflow, Documentation, and Self-Hosting Verification | 0/4 | Not started | - |
