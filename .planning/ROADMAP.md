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
- [x] **Phase 3: Built-in and Custom Adapter Support** - Add JavaScript, Python, and user-defined adapter flows through descriptor/config/process/transport boundaries, including JS source maps and E2E smoke tests.
- [x] **Phase 4: Agent Workflow, Documentation, and Self-Hosting Verification** - Polish the agent experience with README/user docs, Playwright interop examples, self-hosting, smoke verification, and agentic exploratory tests.
- [x] **Phase 5: Stabilize real Chrome/js-debug Playwright same-browser handoff** - Prove or explicitly gate a same-browser Playwright plus real Chrome/js-debug handoff where dap-cli inspects the browser target Playwright controls.
- [x] **Phase 5.1: A mode for the CLI where it produces human-readable nicely formatted output instead of JSON.** *(INSERTED)* - Urgent work to add a non-JSON, human-readable output mode to the CLI.
- [x] **Phase 5.2: Execute VS Code launch.json configurations and compounds** *(INSERTED)* - Faithfully resolve a `.vscode/launch.json` configuration (variable substitution, platform overrides, full field passthrough) and execute compound configurations as a single coordinated multi-session debug run; preLaunchTask explicitly out of scope.
- [x] **Phase 6: Add conditional breakpoint Playwright interop coverage** (completed 2010-05-06)
- [x] **Phase 7: Hardening bug discovery and exploratory smoke testing** - Run a broad post-feature hardening campaign that hammers published dap-cli workflows across adapters, output modes, launch.json, lifecycle, error, cleanup, and Playwright interop scenarios; file every discovered bug as GSD UAT gaps before planning fixes. (completed 2010-05-08)
- [x] **Phase 8: External project hardening expansion** - Expanded external launch.json hardening with a larger real-repo sample; screened at least 10 candidates, attempted at least 5 new repos, and closed the discovered dap-cli gaps. (completed 2010-05-08)
- [x] **Phase 9: Infer adapter/type from --program file extension** - Make `--type` and `--adapter` optional on session-start commands by inferring from `--program` extension or from each other.
- [x] **Phase 10: Auto-route launch/attach by --config request field, add --json-overrides and --resolve-source-maps** - Stop silent verb/config mismatches and add config-merge escape hatches (analysis.md).
- [x] **Phase 11: Paused-state ergonomics — status reflects stopped/continued events, evaluate auto-uses topmost paused frame** - Make polling and inspection work without manual frame plumbing (analysis.md).
- [x] **Phase 12: Breakpoint command surface — add breakpoints list, breakpoints clear, and richer verification diagnostics** - Close obvious gaps in the breakpoint surface and surface loaded-sources hints on verification failure (analysis.md).
- [x] **Phase 13: Auto-emit JSON when stdout is not a TTY regardless of DAP_CLI_HUMAN** - Drop the `--no-human` workaround for agent pipelines (analysis.md).
- [x] **Phase 14: Update agent workflow docs and dap-cli usage skill with lessons from external usage analysis** - Capture launch-vs-attach rule, wrong-process smoke test, didn't-bind recipe, and stop-detection guidance (analysis.md).

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
**Wave 1** *(parallel)*
- [x] 04-01-PLAN.md — README-first docs, agent workflows, Playwright interop examples, docs validation (AGNT-04, AGNT-05)
- [x] 04-02-PLAN.md — Command help polish, adapter provisioning, package readiness (D-04, D-08 support)

**Wave 2** *(blocked on Wave 1 adapter provisioning)*
- [x] 04-03-PLAN.md — Real adapter smokes default-runnable, self-hosting workflows (TEST-06)

**Wave 3** *(blocked on Wave 2 stable smokes)*
- [x] 04-04-PLAN.md — Playwright interop automation, exploratory verification, v1 readiness notes (AGNT-04, TEST-07)

## Progress

**Execution Order:**
Phases execute in numeric order: 1 -> 2 -> 3 -> 4 -> 5 -> 5.1 -> 5.2 -> 6 -> 7 -> 8

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Project Foundation, Controller, and DAP Core | 8/8 | Complete | 2010-05-02 |
| 2. Complete Typed DAP Command Surface | 4/4 | Complete | 2010-05-03 |
| 3. Built-in and Custom Adapter Support | 4/4 | Complete | 2010-05-03 |
| 4. Agent Workflow, Documentation, and Self-Hosting Verification | 4/4 | Complete | 2010-05-03 |
| 5. Stabilize real Chrome/js-debug Playwright same-browser handoff | 26/26 | Complete | 2010-05-04 |
| 5.1. A mode for the CLI where it produces human-readable nicely formatted output instead of JSON. *(INSERTED)* | 6/6 | Complete | 2010-05-05 |
| 5.2. Execute VS Code launch.json configurations and compounds *(INSERTED)* | 0/0 | Not started | - |
| 6. Add conditional breakpoint Playwright interop coverage | 3/3 | Complete   | 2010-05-06 |
| 7. Hardening bug discovery and exploratory smoke testing | 4/4 | Complete | 2010-05-08 |
| 8. External project hardening expansion | 2/2 | Complete | 2010-05-08 |

### Phase 5: Stabilize real Chrome/js-debug Playwright same-browser handoff

**Goal:** Prove or explicitly gate a same-browser Playwright plus real Chrome/js-debug handoff where dap-cli inspects the browser target Playwright controls.
**Requirements**: TEST-07
**Depends on:** Phase 4
**Plans:** 16 shipped + 8 hand-driven gap-closure plans (05-17..05-24)

Plans:
- [x] 05-01-PLAN.md — Same-browser Playwright/js-debug handoff spike, smoke, docs, and verification notes
- [x] 05-02-PLAN.md — Initial gap-closure round (strict gate, duplicate-name diagnostics, before-configurationDone hook)
- [x] 05-03-PLAN.md — DapClient reverse-request dispatch + parent/child session model plumbing
- [x] 05-04-PLAN.md — Controller wires js-debug startDebugging child sessions + threads/breakpoints routing
- [x] 05-05-PLAN.md — Strict same-browser handoff test re-enablement (closes UAT gaps 1 + 2)
- [x] 05-06-PLAN.md — session_ambiguous coverage + stale js-debug diagnostics (closes UAT gaps 3 + 4)
- [x] 05-07-PLAN.md — Lifecycle handshake timeout + fake-script ↔ mode validation (closes UAT-GAP gap 14)
- [x] 05-08-PLAN.md — Tempenv adapter provisioning + chrome-children-smoke green (closes UAT-GAP gap 10)
- [x] 05-09-PLAN.md — fanOutSetBreakpoints error surfacing + child readiness + handoff smoke green (partial; closes UAT-GAP gap 11 error-surface + readiness halves)
- [x] 05-10-PLAN.md — cleanup record removal + close positional + recovery-hint meta-test (closes UAT-GAP gaps 6 + 9)
- [x] 05-11-PLAN.md — `--stop-on-entry` flag + long-running fixture + README quick-start (closes UAT-GAP gap 2)
- [x] 05-12-PLAN.md — events --limit truncation surfacing + controller build-id handshake + stop-controller (closes UAT-GAP gap 13)
- [x] 05-13-PLAN.md — Add `webRoot` to chrome-smoke launch config (partial; webRoot edit shipped, but hypothesis falsified — chrome-smoke also blocked on 05-14's recursive coordinator; see 05-13-SUMMARY)
- [x] 05-14-PLAN.md — Recursive child coordinator for nested pwa-chrome startDebugging (partial; recursive coordinator + unit test shipped, but handoff-smoke remains red — pwa-chrome doesn't emit nested startDebugging in the `__pendingTargetId`+automatic flow; see 05-14-SUMMARY)
- [x] 05-15-PLAN.md — Route setBreakpoints to parent for js-debug; remove per-child replay (handoff-smoke half of gap #11)
- [x] 05-16-PLAN.md — Install startDebugging handler in runJsDebugBreakpointSmoke (chrome-smoke half of gap #11)
- [x] 05-17-PLAN.md — Hand-driven gap H-1: status reports paused/stoppedReason for stopped sessions
- [x] 05-18-PLAN.md — Hand-driven gap H-2: two-ring event cache + CLI --include/--exclude filters + honest limit warning
- [x] 05-19-PLAN.md — Hand-driven gap H-3: hide child sessions by default + child_session_not_targetable error
- [x] 05-20-PLAN.md — Hand-driven gaps H-4 + H-7: honest cleanup response + thread_not_paused error + cleanup-vs-cleanup-purge audit
- [x] 05-21-PLAN.md — Hand-driven gap H-5: adapter log header line + js-debug trace.logFile injection
- [x] 05-22-PLAN.md — Hand-driven gap H-6 (BLOCKER): production controller fix for pwa-chrome breakpoint stop + controller-driven integration test
- [x] 05-23-PLAN.md — Hand-driven gap H-8: close sends terminateDebuggee + surfaces orphan PIDs
- [x] 05-24-PLAN.md — Hand-driven gap H-doc: correct subcommand names in docs/HAND-DRIVEN-SMOKE.md
- [x] 05-25-PLAN.md — Round 2 follow-up: H-1a/H-1b paused-state edges (parent + thread filter)
- [x] 05-26-PLAN.md — Round 2 follow-up: H-3a child-session targeting refinement

### Phase 5.1: A mode for the CLI where it produces human-readable nicely formatted output instead of JSON. (INSERTED)

**Goal:** dap-cli keeps JSON as the default machine-readable contract while adding an opt-in `--human` / `DAP_CLI_HUMAN` mode that renders existing command results and handled failures as safe, readable terminal text.
**Requirements**: TBD
**Depends on:** Phase 05
**Plans:** 6/6 plans complete

Plans:
**Wave 1**
- [x] 05.1-01-PLAN.md — Output-mode resolver, writer foundation, sanitized human fallback, and human test helper

**Wave 2** *(blocked on Wave 1 completion)*
- [x] 05.1-02-PLAN.md — Root `--human` / `--no-human` wiring, handled failures, and controller/session/core DAP output integration

**Wave 3** *(blocked on Wave 2 completion)*
- [x] 05.1-03-PLAN.md — Generated/alias command integration, curated human renderers, and `--json` payload collision regressions

**Wave 4** *(blocked on Wave 3 completion)*
- [x] 05.1-04-PLAN.md — README/agent docs, final output-contract regressions, docs validation, and repo check

**Wave 5** *(blocked on Wave 4 UAT gaps)*
- [x] 05.1-05-PLAN.md — Hand-driven smoke doc corrections, clean-state UAT rerun, and docs validation

**Wave 6** *(user feedback polish)*
- [x] 05.1-06-PLAN.md — Human output presentation polish: remove noisy metadata, add bordered tables, and add terminal-aware semantic styling

### Phase 5.2: Execute VS Code launch.json configurations and compounds (full fidelity, no preLaunchTask) (INSERTED)

**Goal:** `npx dap-cli launch --config "<name>" [--workspace <path>]` faithfully executes any `.vscode/launch.json` configuration that VS Code would run — including compounds that bring up multiple coordinated sessions in one command — against `js-debug` and `debugpy`. The motivating target is the `VS Code` compound in [/Users/roblou/code/vscode/.vscode/launch.json](../../../vscode/.vscode/launch.json), which would launch Code OSS plus four process attaches in one shot.

**Why now:** While documenting [VSCODE-CHAT-SMOKE.md](../../docs/VSCODE-CHAT-SMOKE.md) we discovered that even though dap-cli already reads `.vscode/launch.json` and supports `--config <name>`, the resolver is too lossy to drive real-world configs: `mapJsDebugFlags` is a tight whitelist that drops `userDataDir`, `webRoot`, platform-key overrides (`osx`/`windows`/`linux`), `${workspaceFolder}` / `${userHome}` / `${env:FOO}` substitution, `cleanUp`, `pauseForSourceMap`, etc. Compounds are not parsed at all. Closing this gap turns dap-cli from "toy launch.json reader" into "agent-runnable F5" — the core value prop for AI workflows that target real codebases.

**Scope (in):**
- **Variable substitution:** `${workspaceFolder}`, `${workspaceFolderBasename}`, `${userHome}`, `${env:NAME}`, `${execPath}` (best-effort: error if unresolvable). Recursively expand inside strings, arrays, and nested objects.
- **Platform key resolution:** merge `osx` / `windows` / `linux` / `mac` overlays into the base config per VS Code's spec, on the matching platform only.
- **Field passthrough:** flip `mapJsDebugFlags` / `mapDebugpyFlags` from whitelist to denylist (or full passthrough with a small known-bad denylist). Stop dropping fields js-debug understands but dap-cli has never seen.
- **Workspace targeting:** `--workspace <path>` flag (default: `process.cwd()`). Affects both launch.json discovery and `${workspaceFolder}` value.
- **Discovery:** `--list-configs` to enumerate available `configurations[]` and `compounds[]` names without launching anything.
- **Compound execution:** parse `compounds[]`. `--config "<compound name>"` brings up every member configuration as a peer session under a shared compound group label. `stopAll: true` (default per VS Code) means closing one member terminates the rest. `cascadeTerminateToConfigurations` from individual configs is honored.
- **Naming:** compound members get derived names like `<compound>/<member>` so they remain individually targetable by existing `--name` flows.
- **Diagnostics:** clear errors for missing config name, unresolved variable, unsupported field (e.g. `${input:...}`), missing `runtimeExecutable` after platform merge, broken compound member reference.

**Scope (explicitly out):**
- `preLaunchTask` and `postDebugTask` — surface a structured diagnostic (`unsupported_pre_launch_task`) and bail. Task running pulls in the entire `tasks.json` model and is its own phase.
- `${input:...}` interactive variables — same: structured diagnostic, no prompt.
- `${command:...}` extension-host commands — not applicable outside VS Code.
- New adapters — stay on `js-debug` and `debugpy`.
- VS Code's launch UI semantics like `presentation.hidden`, `internalConsoleOptions`, `serverReadyAction` — ignore silently.

**Verification target:** `cd /Users/roblou/code/vscode && npx dap-cli launch --config "VS Code"` brings up renderer + main process + extension host + shared process + agent host as 5 coordinated dap-cli sessions; `dap-cli sessions` shows the compound group; setting a breakpoint in `chatWidget.ts` and submitting a chat in the running window pauses the renderer member; closing one terminates all per `stopAll`. End-to-end smoke captured into a UAT doc by hand-driving (per repo Hard Rule).

**Depends on:** Phase 5
**Requirements:** CONF-01, SESS-02, SESS-03, SESS-04, SESS-05, AGNT-01, AGNT-02, AGNT-03, AGNT-04, AGNT-05, TEST-04, TEST-05, TEST-06, TEST-07
**Plans:** 6/6 plans complete

Plans:
**Wave 1**
- [x] 05.2-01-PLAN.md — Launch.json document loading, variable/platform resolution, passthrough, and diagnostics

**Wave 2** *(blocked on Wave 1 resolver foundation)*
- [x] 05.2-02-PLAN.md — Workspace-aware CLI launch/list-configs and single configuration routing

**Wave 3** *(blocked on Wave 2 CLI output ownership)*
- [x] 05.2-03-PLAN.md — Persisted compound session metadata and session/status projection

**Wave 4** *(blocked on Wave 3 CLI/session foundations)*
- [x] 05.2-04-PLAN.md — Compound controller orchestration, failure cleanup, and stopAll close cascade

**Wave 5** *(blocked on Wave 4 compound orchestration)*
- [x] 05.2-05-PLAN.md — In-repo launch.json compound fixture and published CLI integration tests

**Wave 6** *(blocked on Wave 5 fixture confidence)*
- [x] 05.2-06-PLAN.md — Docs, automated verification record, and real VS Code compound UAT

### Phase 6: Add conditional breakpoint Playwright interop coverage

**Goal:** Agents can set DAP conditional breakpoint metadata through the friendly `breakpoints set` alias, trigger browser behavior through Playwright, and verify conditional pause behavior through the existing polling workflow.
**Requirements**: DBG-01, AGNT-04, AGNT-05, TEST-04, TEST-05, TEST-07
**Depends on:** Phase 5
**Plans:** 3/3 plans complete

Plans:
**Wave 1**
- [x] 06-01-PLAN.md - Alias flags, DAP payload construction, and fake-adapter coverage

**Wave 2** *(blocked on Wave 1 completion)*
- [x] 06-02-PLAN.md - Child-session metadata preservation through breakpoint routing

**Wave 3** *(blocked on Wave 2 completion)*
- [x] 06-03-PLAN.md - Playwright/js-debug conditional smoke, docs, and UAT record

### Phase 7: Hardening bug discovery and exploratory smoke testing

**Goal:** Agents can run dap-cli through a broad, adversarial post-feature hardening sweep against the published CLI, exercising successful and failing workflows across adapters, output modes, launch.json, compounds, session lifecycle, cleanup, child sessions, and Playwright-driven browser interaction, with every discovered bug captured as a structured GSD UAT gap before fixes are planned.
**Requirements**: SESS-02, SESS-03, SESS-04, SESS-05, DBG-01, DBG-02, DBG-03, DBG-04, DBG-05, DBG-06, ADPT-01, ADPT-02, ADPT-03, ADPT-04, ADPT-05, ADPT-06, AGNT-01, AGNT-02, AGNT-03, AGNT-04, AGNT-05, TEST-04, TEST-05, TEST-06, TEST-07, CONF-01
**Depends on:** Phase 6
**Plans:** 1 plan

Plans:
**Wave 1**
- [ ] 07-01-PLAN.md — Hardening scenario matrix, published CLI smoke sweep, and UAT bug ledger

### Phase 8: External project hardening expansion

**Goal:** Expand external launch.json hardening beyond Phase 7's two full external attempts with a broader real-repo sample across Node, Python/debugpy, browser, attach, and current-file launch shapes.
**Requirements**: AGNT-02, AGNT-03, TEST-05, TEST-07
**Depends on:** Phase 7
**Plans:** 2 plans

Plans:
- [x] 08-01-PLAN.md — External project hardening expansion sample, UAT ledger, and gap filing
- [x] 08-02-PLAN.md — Gap closure for debugpy launch type, running-thread diagnostics, and JS breakpoint guidance

### Phase 9: Infer adapter/type from --program file extension

**Goal:** Make `--type` and `--adapter` optional on session-start commands. When `--program` is supplied, infer the adapter (and DAP `type`) from the file extension where unambiguous (e.g. `.py` → debugpy, `.js`/`.mjs`/`.cjs`/`.ts` → js-debug node, etc.). When only `--type` is given, derive `--adapter` from the registry; when only `--adapter` is given, derive a sensible default `type`. Keep explicit flags as override and preserve current error behavior when inference is ambiguous or the file type is unsupported.
**Requirements**: [INFER-01]
**Depends on:** Phase 8
**Plans:** 1 plan

Plans:
- [x] 09-01-PLAN.md — Pure inference module + dapCore wiring + README/ADAPTER-SETUP docs

### Phase 10: Auto-route launch/attach by --config request field, add --json-overrides and --resolve-source-maps

**Goal:** Stop silent verb/config mismatches between `dap-cli launch`/`attach` and the resolved launch.json `request:` field, add `--json-overrides` and `--resolve-source-maps` so users can layer extra fields onto a `--config`-resolved configuration without abandoning `--config`, and warn when js-debug attaches to an adapter-spawned helper process — closing the four rough edges captured in `analysis.md`.
**Requirements**: AUTOROUTE-01, OVRD-01, OVRD-02, DIAG-01
**Depends on:** Phase 9
**Plans:** 3 plans

Plans:
**Wave 1**
- [ ] 10-01-PLAN.md — Auto-route launch/attach by --config request field with structured warning
- [ ] 10-03-PLAN.md — Helper-process detection warning for js-debug attach sessions

**Wave 2** *(blocked on 10-01 — same file scope in dapCore.ts)*
- [ ] 10-02-PLAN.md — --json-overrides and --resolve-source-maps flags + 5-layer precedence stack

### Phase 11: Paused-state ergonomics — status reflects stopped/continued events, evaluate auto-uses topmost paused frame

**Goal:** Make polling and inspection work without manual frame plumbing — `dap-cli status` reflects the most recent `stopped`/`continued` event for both single-process and multi-process (js-debug pwa-node/pwa-chrome) adapters, and `dap-cli evaluate` auto-resolves `--frame-id` to the topmost frame of the most-recently-stopped thread when omitted on a paused session.
**Requirements**: PAUSED-01, PAUSED-02
**Depends on:** Phase 10
**Plans:** 2 plans

Plans:
**Wave 1** *(parallel — disjoint files)*
- [ ] 11-01-PLAN.md — `status` projection honors mirrored `paused` from child events (PAUSED-01)
- [ ] 11-02-PLAN.md — `evaluate` auto-resolves `--frame-id` from session status when omitted on paused sessions (PAUSED-02)

### Phase 12: Breakpoint command surface — add breakpoints list, breakpoints clear, and richer verification diagnostics

**Goal:** Close the obvious gaps in the `dap-cli breakpoints` surface called out in analysis.md §3: add `breakpoints list` and `breakpoints clear` (with controller-side tracking of the current breakpoints-per-source state, since DAP has no `getBreakpoints`), and replace the misleading generic "verification timed out / check source maps" diagnostic with a structured `verificationDiagnostic` object that automatically follows up `setBreakpoints` with `loadedSources` and surfaces a precise hint (wrong process / source maps / line numbers) plus the literal recipe an agent should run next.
**Requirements**: BPCMD-01, BPCMD-02, BPCMD-03
**Depends on:** Phase 11
**Plans:** 2 plans

Plans:
**Wave 1**
- [ ] 12-01-PLAN.md — Controller-side breakpoint tracking + `breakpoints list` and `breakpoints clear` CLI subcommands (BPCMD-01, BPCMD-02)

**Wave 2** *(depends on 12-01 — shared dapAliases.ts)*
- [ ] 12-02-PLAN.md — Richer verification diagnostics in `breakpoints set` (auto loadedSources follow-up + structured `verificationDiagnostic` payload) (BPCMD-03)

### Phase 13: Auto-emit JSON when stdout is not a TTY regardless of DAP_CLI_HUMAN

**Goal:** Piped/non-TTY `dap-cli` invocations always emit JSON regardless of `DAP_CLI_HUMAN`, so agents can drop the `--no-human` defensive workaround. Explicit `--human` / `--no-human` flags continue to override.
**Requirements**: TTY-01
**Depends on:** Phase 12
**Plans:** 1 plan

Plans:
- [ ] 13-01-PLAN.md — Gate env-derived human output on `process.stdout.isTTY` in `resolveOutputMode` and wire both CLI bootstraps (TTY-01)

### Phase 14: Update agent workflow docs and dap-cli usage skill with lessons from external usage analysis

**Goal:** Agents reading the in-repo docs (`docs/AGENT-WORKFLOWS.md`, `README.md`) and the user-level `~/.copilot/skills/dap-cli/` skill from a cold start avoid the analysis.md footguns: they pick the right verb (or trust `--config` auto-route) for attach-shaped launch.json configs, run a wrong-process smoke check after attach, read `verificationDiagnostic` for unbound breakpoints, treat `status` as the source of truth for stop detection, know child sessions are not targetable, and stop threading `--no-human` through every command now that Phase 13 ships TTY auto-detection.
**Requirements**: AGNT-04, AGNT-05
**Depends on:** Phase 13
**Plans:** 1 plan

Plans:
- [ ] 14-01-PLAN.md — Update `docs/AGENT-WORKFLOWS.md` + `README.md` and mirror into the user-level `~/.copilot/skills/dap-cli/` skill (AGNT-04, AGNT-05)

### Phase 15: Verify and document existing child-session event mirroring for js-debug pwa-chrome

**Goal:** Close the analysis2.md §2 gap *without* contradicting the 05-19 / H-3 design decision that child sessions are intentionally not directly targetable. The plumbing already exists: `dap-cli sessions --show-children` enumerates children, and `ChildSessionCoordinator.mirrorChildEvent` annotates every child event with `child_session_id` into the parent's event cache. Three concrete deliverables: (a) end-to-end repro against a pwa-chrome renderer that proves `console`-category `output` events from a verified logpoint reach the parent's event stream tagged with the renderer's `child_session_id` — and fix the mirror path if they don't; (b) verify `events --name <child_session_id>` returns the structured "target the parent" error we designed in 05-19, not the misleading `total: 0` the analysis reported (fix to throw the structured error if confirmed); (c) doc/skill update with the canonical pwa-chrome workflow ("`sessions --show-children` to discover, then filter parent's events by `child_session_id`"). Source: analysis2.md §2 — re-scoped down after code audit showed enumeration + mirroring already ship.
**Requirements**: CHILD-VERIFY-01, CHILD-ERR-01, CHILD-DOC-01
**Depends on:** Phase 14
**Plans:** 3/3 plans complete

Plans:
**Wave 1** *(parallel — no file overlap)*
- [x] 15-01-PLAN.md — Verify (and fix if needed) renderer logpoint `output` events reach the parent's event stream tagged with `child_session_id`; ship a unit test + hand-driven repro (CHILD-VERIFY-01)
- [x] 15-02-PLAN.md — Verify (and fix if needed) `events --name <child>` returns the structured `child_session_not_targetable` error instead of the misleading `total: 0`; lock with regression tests (CHILD-ERR-01)

**Wave 2** *(blocked on Wave 1 — docs describe verified behavior)*
- [x] 15-03-PLAN.md — Document the canonical pwa-chrome workflow (`sessions --show-children` → `events --name <parent>` → filter by `body.child_session_id`) in `docs/AGENT-WORKFLOWS.md`, `README.md`, and the user-level `~/.copilot/skills/dap-cli/` pair (CHILD-DOC-01)

### Phase 16: Python evaluate ergonomics + verb-selection docs — auto-wrap statements and clarify launch vs attach

**Goal:** Stop forcing agents to know debugpy's `evaluate`-is-an-expression rule. Detect statement-shaped Python input (e.g. `import`, assignment, multi-statement separated by `;` or newlines) on `dap-cli evaluate` against a `debugpy` session and either auto-wrap with `exec("...")` (preferred, behind detection) or surface a structured `evaluate_requires_exec` diagnostic naming the exact `exec()` form to retry — instead of returning the raw `SyntaxError` from debugpy. Mirror the rule into `docs/AGENT-WORKFLOWS.md`, `README.md`, and the user-level `~/.copilot/skills/dap-cli/` `evaluate` examples. In the same docs/skill pass, add a short "use the right verb" note covering the analysis2.md §1 confusion: `dap-cli launch` and `dap-cli attach` are separate commands and select the DAP `request:` field; agents should not look for a `--request` flag (Phase 10 already auto-routes when a `--config` JSON disagrees with the verb). Also add a one-paragraph note to `docs/PLAYWRIGHT-INTEROP.md` covering the playwright-cli daemon-died / `not open, please run open first` failure mode and the kill-and-reattach recovery. Sources: analysis2.md §Python, §1, §3.
**Requirements**: PYEVAL-01, PYEVAL-02, VERB-DOC-01, PWDOC-01
**Depends on:** Phase 15
**Plans:** 2/2 plans complete

Plans:

**Wave 1**
- [x] 16-01-PLAN.md — Heuristic Python statement detector + controller-side auto-wrap on debugpy `evaluate` + structured `evaluate_requires_exec` fallback envelope when detection misses (PYEVAL-01)

**Wave 2** *(blocked on Wave 1 — docs describe verified behavior)*
- [x] 16-02-PLAN.md — Mirror the auto-wrap rule, the launch-vs-attach verb-selection note, and the playwright-cli daemon-died recovery recipe across `docs/AGENT-WORKFLOWS.md`, `README.md`, `docs/PLAYWRIGHT-INTEROP.md`, and the user-level `~/.copilot/skills/dap-cli/` pair, with new `docsValidation.test.ts` grep gates pinning all three (PYEVAL-02, VERB-DOC-01, PWDOC-01)

### Phase 17: Code OSS smoke scenario hardening — 20 attach scenarios driven by subagents

**Goal:** Drive 20 distinct Code-OSS-only attach scenarios — one fresh subagent per scenario — to surface dap-cli bugs, dap-cli ergonomic papercuts, and dap-cli/launch-skill documentation gaps that only appear when an LLM agent is the user. Output is a structured 17-UAT.md classifying findings (bugs vs doc gaps vs papercuts) with one explicit recommended next step.
**Requirements**: [DBG-01, DBG-02, DBG-03, DBG-04, DBG-05, DBG-06, AGNT-01, AGNT-02, AGNT-03, AGNT-05, TEST-04, TEST-06, TEST-07]
**Depends on:** Phase 16
**Plans:** 2 plans

Plans:
- [ ] 17-01-PLAN.md — Build the 20-scenario Code OSS attach matrix (17-SCENARIOS.md) with self-contained per-scenario subagent prompts that explicitly require the dap-cli skill + VS Code launch skill
- [ ] 17-02-PLAN.md — Execute the 20 scenarios one fresh subagent at a time, record per-scenario results in 17-RESULTS.md (commit-per-row), then synthesize 17-UAT.md (bugs / doc gaps / papercuts / recommended next step)

### Phase 18: Per-child paused-state tracking + paused-first routing

**Goal:** Fix two narrow bugs in the existing multi-child mirror that caused Phase 17 / S-02 to fail. (a) `ChildSessionCoordinator`'s parent paused-state is "last child event wins" — a bootloader child's `terminated` clobbers the real child's `stopped`, so `dap-cli status --name <parent>` reports `paused: false` even though a child is paused on a breakpoint. (b) `findChildOwningThread` picks the first child whose thread cache claims an id, regardless of whether that child is currently paused, so `stack --thread-id 0` routes to a stale bootloader and returns `thread_not_paused`. Fix (a) by giving each `ChildRuntime` its own `stoppedThreadIds` / `allThreadsStopped` / `lifecycleEnded` fields and recomputing the parent's paused state as the union across non-terminated children. Fix (b) by making `findChildOwningThread` prefer children that are actually stopped on the requested id, with the existing live-`threads` fan-out as a final fallback. `aggregateThreads` and error-payload `availableThreads` filter out terminated children so Phase 17's `--thread-id` auto-resolve sees a clean candidate list. No new flags, no virtual thread ids, no new CLI surface — the model dap-cli already implements (per Phase 15-01 mirroring + Phase 15-02 child_session_not_targetable contract) becomes accurate. Unblocks Phase 17 S-02..S-20.
**Requirements**: PAUSED-UNION-01, PAUSED-ROUTE-01, PAUSED-DOC-01
**Depends on:** Phase 17 (partial — S-02 surfaced the gap)
**Plans:** 2 plans

Plans:

**Wave 1**
- [ ] 18-01-PLAN.md — Controller: per-child stoppedThreadIds / allThreadsStopped / lifecycleEnded bookkeeping on stopped/continued/thread/terminated/exited events; new `combineChildPausedStates` helper in pausedState.ts; recompute parent paused state as union; paused-first three-pass `findChildOwningThread`; terminated-filter on `aggregateThreads` + `listAvailableThreads`; unit tests for union + terminated-survives-stop regression + paused-first routing; new fake-adapter `multi-child-stop` script + end-to-end integration test reproducing the S-02 shape; Code OSS extension-host hand-driven repro (PAUSED-UNION-01, PAUSED-ROUTE-01)

**Wave 2** *(blocked on Wave 1 — docs describe verified behavior)*
- [ ] 18-02-PLAN.md — Update `docs/AGENT-WORKFLOWS.md`, in-repo `skills/dap-cli/SKILL.md`, `skills/dap-cli/references/javascript-typescript.md` (and README.md if it carries the old recipe) to present "parent rolls up child paused state, dap-cli routes to the paused child" as a guarantee; remove prior hedge language; preserve Phase 15-02's `child_session_not_targetable` contract for direct child addressing; pin with new `docsValidation.test.ts` grep gate on the literal phrase "paused child" (PAUSED-DOC-01)

### Phase 19: Cleanup help command output, drill-down for subcommands, categorized command grouping

**Goal:** Three concrete papercut fixes on `dap-cli help`. (1) Stop emitting a bogus `{"ok":false,...,"message":"(outputHelp)"}` envelope at the bottom of every help invocation — root cause is `isCommanderHelp()` only matching `commander.helpDisplayed`, while commander v14's `help` subcommand throws with `commander.help`/`exitCode 0`. (2) Make `dap-cli help <cmd> <subcmd>` (e.g. `dap-cli help breakpoints set`) drill into the subcommand tree instead of printing the parent's help; today only `<cmd> <subcmd> -h` works. (3) Group the long flat top-level command list into seven readable categories using commander v14's `helpGroup()`: Controller lifecycle, Sessions, Launch & attach, Breakpoints, Paused-state inspection, Execution control, DAP protocol escape hatches. No new commands, no behavioral changes to debug functionality.
**Requirements**: HELP-01, HELP-02, HELP-03
**Depends on:** Phase 18
**Plans:** 1/2 plans executed

Plans:

**Wave 1**
- [x] 19-01-PLAN.md — Fix `isCommanderHelp` to recognize `commander.help` (kill the spurious envelope, HELP-01); register a custom variadic `help [command...]` walker in `program.ts` so drill-down works (HELP-02); add `tests/cli/helpCommand.test.ts` with 5 tests covering both fixes plus a `--help` regression check.

**Wave 2** *(blocked on Wave 1 — drill-down regression test relies on plan 01's harness)*
- [ ] 19-02-PLAN.md — Apply commander v14 `helpGroup()` to every public top-level command across `controller.ts`, `sessions.ts`, `dapCore.ts`, `dapAliases.ts`, `dapGenerated.ts` per the locked D-03 mapping; extend `tests/cli/helpCommand.test.ts` with category-membership and hidden-command regression tests (HELP-03).
