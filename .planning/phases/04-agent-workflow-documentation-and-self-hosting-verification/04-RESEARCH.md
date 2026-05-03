# Phase 4: Agent Workflow, Documentation, and Self-Hosting Verification - Research

**Researched:** 2026-05-03  
**Domain:** CLI documentation, adapter packaging readiness, self-hosting verification, Playwright interop  
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
## Implementation Decisions

### Documentation Shape
- **D-01:** Prefer a README-first documentation model. The README should be quick-start heavy and get an agent or user from install to a first useful debug loop quickly.
- **D-02:** Keep detailed command examples out of the README unless they are essential to the happy path. Put deeper agent workflows and command sequences in focused docs, especially an agent workflow guide.
- **D-03:** Keep documentation for custom adapter setup under `docs/`, but do not frame manual js-debug/debugpy provisioning as the normal built-in adapter experience.
- **D-04:** Built-in js-debug and debugpy support should not require manual user setup for the intended v1 usage path. Planning should account for packaging, installation, dependency, or setup changes needed to make that true.

### Self-Hosting Verification
- **D-05:** Self-hosting should be layered: first prove dap-cli against stable fixtures, then include at least one capstone workflow where dap-cli is used to debug dap-cli or its own CLI execution path.
- **D-06:** Self-hosting is not just a checked artifact. It should become a core development workflow: when tests fail or behavior is unclear, agents should eagerly use dap-cli itself as a debugger.
- **D-07:** Issues discovered organically during self-hosting should be recorded in the planning backlog or equivalent GSD-tracked follow-up, not lost in transient notes.
- **D-08:** Real built-in adapter smoke coverage should run by default for v1, consistent with the requirement that built-in js-debug/debugpy should not require manual user setup.
- **D-09:** Playwright interop needs both automated test coverage and docs/playbooks that show how Playwright-driven UI actions and dap-cli polling/inspection work together.

### the agent's Discretion
- Choose the smallest docs structure that keeps the README fast to read while making deeper agent workflows discoverable.
- Choose the exact mechanism for no-manual-setup built-in adapters, but do not leave docs as the only fix if the implementation path still requires manual setup.
- Choose which self-hosting scenarios are stable enough for automated tests versus documented playbooks, while preserving the decisions above.

### Deferred Ideas (OUT OF SCOPE)
## Deferred Ideas

None - discussion stayed within phase scope.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| AGNT-04 | Documentation includes agent-oriented workflows that interleave dap-cli commands with Playwright CLI commands. | Use a focused `docs/AGENT-WORKFLOWS.md` or equivalent playbook showing `dap-cli` polling/inspection around Playwright actions; Playwright CLI supports `npx playwright test`, file filters, `--project`, `--workers=1`, `--debug`, and browser install commands. [VERIFIED: CONTEXT.md + CITED: playwright.dev/docs/test-cli] |
| AGNT-05 | Documentation includes examples for polling session status instead of relying on event streaming in v1. | Existing commands expose `status`, `events --after-cursor`, `threads`, `stack`, `scopes`, `variables`, `evaluate`, and `continue`; DAP object references are valid only for the current suspended state, so docs must show poll-then-inspect loops and reacquiring references after resume. [VERIFIED: codebase read + CITED: microsoft.github.io/debug-adapter-protocol/overview] |
| TEST-06 | Development and validation include self-hosting workflows that use dap-cli to debug dap-cli or its fixtures. | Existing fake-adapter integration tests already provide deterministic fixture-backed CLI workflows; Phase 4 should add layered workflows: stable fixtures first, then one dap-cli-debugs-dap-cli capstone. [VERIFIED: tests/integration/fakeAdapterCli.test.ts + CONTEXT.md] |
| TEST-07 | Verification includes agentic exploratory debugging scenarios combining dap-cli with dynamic application interaction such as Playwright-driven UI actions. | Existing browser fixture `tests/fixtures/simple-chrome-page/` and js-debug Chrome smoke body can seed a Playwright-plus-dap-cli scenario, but no Playwright dependency or tests exist yet. [VERIFIED: codebase search + tests/integration/jsDebugAdapter.test.ts] |
</phase_requirements>

## Summary

Phase 4 is not a pure documentation phase. The current repository has no README, one adapter setup doc that says built-in adapter binaries must be manually available, and real adapter smoke tests that skip when js-debug/debugpy are missing. [VERIFIED: file search + docs/ADAPTER-SETUP.md + 03-04-SUMMARY.md] That conflicts with the locked v1 decision that built-in JavaScript and Python debugging should not require manual setup and that real built-in adapter smoke coverage should run by default. [VERIFIED: 04-CONTEXT.md]

The planner should divide work into four clear lanes: README-first docs, command/help/package polish, default-runnable smoke/self-hosting workflows, and exploratory Playwright-driven verification converted into reproducible artifacts. [VERIFIED: ROADMAP.md + CONTEXT.md] The largest technical risk is adapter provisioning: js-debug is distributed through GitHub release assets rather than an npm package visible through `npm view`, while debugpy is a Python package and is absent from the current environment. [VERIFIED: npm view + gh release view + python import probe]

**Primary recommendation:** Treat Phase 4 as a release-readiness phase: add a small documentation set, add explicit built-in adapter setup/provisioning commands or install-time/dev-time dependencies, make real adapter smokes default-runnable, and preserve custom adapter setup as an advanced `docs/` topic. [VERIFIED: CONTEXT.md + codebase read]

## Project Constraints (from copilot-instructions.md)

- Keep dap-cli as a Node.js/TypeScript CLI and preserve the vanilla DAP protocol boundary. [VERIFIED: copilot-instructions.md]
- CLI invocations must share debugger state across commands through the persistent controller. [VERIFIED: copilot-instructions.md]
- v1 remains polling-only; do not add event streaming, subscriptions, watch mode, or blocking wait commands in Phase 4. [VERIFIED: copilot-instructions.md + REQUIREMENTS.md]
- Keep module boundaries: `cli/` owns parsing/help/output, `controller/` owns session routing, `protocol/` stays language-neutral, `adapters/` owns descriptor/config/process/transport boundaries, and `testing/` owns fixtures/smokes/self-hosting. [VERIFIED: copilot-instructions.md]
- Use existing helpers before adding new utilities; `tests/helpers/runCli.ts` already provides isolated `DAP_CLI_HOME`, one-envelope parsing, and cleanup. [VERIFIED: copilot-instructions.md + codebase read]
- Direct edits outside a GSD workflow are normally discouraged, but this task explicitly asks for a research artifact write. [VERIFIED: copilot-instructions.md + user request]

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|--------------|----------------|-----------|
| README quick start and user docs | Docs | CLI | Docs should describe existing command contracts and drive users through real commands without changing protocol behavior. [VERIFIED: CONTEXT.md + codebase read] |
| Command help polish | CLI | Docs | Commander command descriptions/options live under `src/cli/commands/` and should align with README examples. [VERIFIED: src/cli/program.ts + command modules] |
| Built-in adapter no-manual-setup | Packaging/adapters | Tests | Adapter resolution currently checks `DAP_CLI_HOME/adapters/js-debug/...`, project `node_modules/vscode-js-debug/...`, and `python3 -m debugpy.adapter`; Phase 4 must make those paths available automatically or via a first-party readiness/setup command. [VERIFIED: src/adapters/builtins/jsDebug.ts + src/adapters/builtins/debugpy.ts] |
| Custom adapter setup | Docs/config | Adapters | Custom adapter descriptor shape is existing product behavior; keep it documented under `docs/` without making it the built-in happy path. [VERIFIED: docs/ADAPTER-SETUP.md + CONTEXT.md] |
| Stable smoke workflows | Tests/testing | Adapters | Current fake adapter and real adapter tests are the right layer for automated smoke workflows. [VERIFIED: tests/integration/fakeAdapterCli.test.ts + jsDebugAdapter.test.ts + debugpyAdapter.test.ts] |
| Self-hosting capstone | Tests/testing | CLI/controller/adapters | A dap-cli-debugs-dap-cli workflow should launch a Node process for the CLI or fixture path and inspect pause state through normal CLI commands. [VERIFIED: ROADMAP.md + CONTEXT.md] |
| Playwright interop | Tests/docs | Browser/js-debug | Playwright drives browser UI, while dap-cli polls/inspects debugger state through js-debug; this should be both an automated core test and a documented playbook. [VERIFIED: CONTEXT.md + CITED: playwright.dev/docs/test-cli] |
| Discovery/backlog tracking | Planning docs | Verification notes | The repo has no existing planning backlog file, so Phase 4 should create or use a GSD-tracked follow-up location during exploratory verification. [VERIFIED: file search + CONTEXT.md] |

## Recommended Plan Boundaries

| Plan | Boundary | Should Include | Should Avoid |
|------|----------|----------------|--------------|
| 04-01 Docs | README-first user experience and focused guides | Create `README.md`; update `docs/ADAPTER-SETUP.md`; add focused agent workflow and Playwright interop docs; include polling examples and JSON/error contract examples. [VERIFIED: ROADMAP.md + CONTEXT.md] | Do not claim built-ins work without setup until 04-02/04-03 makes that true. [VERIFIED: CONTEXT.md] |
| 04-02 Help/Packaging | CLI help, examples, package readiness, built-in adapter availability | Improve Commander descriptions/examples where needed; add readiness/setup flow or packaging dependency strategy for js-debug/debugpy; update `package.json` scripts if needed. [VERIFIED: src/cli/program.ts + docs/ADAPTER-SETUP.md] | Do not put JS/Python special cases into `protocol/`. [VERIFIED: copilot-instructions.md] |
| 04-03 Smoke/Self-hosting | Automated stable workflows | Convert/gate real adapter smokes so default checks validate built-ins; add fixture-based self-hosting scripts/tests; add one capstone dap-cli-debugs-dap-cli workflow. [VERIFIED: 03-04-SUMMARY.md + CONTEXT.md] | Do not rely on manual user validation for built-ins. [VERIFIED: REQUIREMENTS.md + CONTEXT.md] |
| 04-04 Exploratory Verification | Dynamic agentic scenarios and final notes | Run Playwright/dap-cli exploratory scenarios; convert stable flows into tests/docs; create v1 verification notes; record unrelated discoveries in GSD-tracked backlog/follow-up. [VERIFIED: ROADMAP.md + CONTEXT.md] | Do not file external GitHub issues automatically. [VERIFIED: user instructions + CONTEXT.md] |

## Standard Stack

### Core

| Library / Tool | Version | Purpose | Why Standard |
|----------------|---------|---------|--------------|
| Node.js | v22.22.1 available; package requires `>=22` | CLI runtime and smoke target runtime | Existing repo baseline and package engine. [VERIFIED: package.json + node --version] |
| TypeScript | 5.9.3 installed; latest package research in prior stack notes cited 6.0.3 | Implementation language | Existing codebase and tests are TypeScript. [VERIFIED: package.json] |
| Commander | 14.0.3 current; repo pins `^14.0.1` | CLI command/help surface | Existing command registration uses Commander. [VERIFIED: npm view + src/cli/program.ts] |
| Vitest | 4.1.5 current; repo pins `^3.2.4` | Unit/integration tests | Existing suite uses Vitest; planner can either keep current major or schedule a separate upgrade only if needed. [VERIFIED: npm view + package.json] |
| tsup | 8.5.1 current; repo pins `^8.5.0` | Build/bundle | Existing `npm run build` uses tsup. [VERIFIED: npm view + package.json] |
| zod | 4.4.2 current; repo pins `^4.1.12` | Runtime validation | Existing dependency; useful if adding readiness/config validation. [VERIFIED: npm view + package.json] |
| @vscode/debugprotocol | 1.68.0 current | DAP TypeScript declarations | Existing dependency and test code uses `DebugProtocol` types. [VERIFIED: npm view + package.json + tests] |

### Supporting

| Library / Tool | Version | Purpose | When to Use |
|----------------|---------|---------|-------------|
| vscode-js-debug standalone DAP server | v1.117.0 latest GitHub release; asset `js-debug-dap-v1.117.0.tar.gz` exists | Built-in JavaScript adapter implementation | Use for default JS smoke/self-hosting once provisioned into a dap-cli-managed adapter cache or package-controlled setup path. [VERIFIED: gh release view + CITED: github.com/microsoft/vscode-js-debug] |
| debugpy | 1.8.20 latest via pip index | Built-in Python adapter implementation | Use through `python3 -m debugpy.adapter` or a managed Python environment; current local Python lacks debugpy. [VERIFIED: pip index + python import probe + CITED: github.com/microsoft/debugpy] |
| @playwright/test | 1.59.1 current | Automated Playwright interop tests | Add if Phase 4 implements browser-driven interop automation. [VERIFIED: npm view + CITED: playwright.dev/docs/test-cli] |
| playwright | 1.59.1 current | Playwright CLI/browser install commands | Use if playbooks need direct `npx playwright` commands or browser installation. [VERIFIED: npm view + CITED: playwright.dev/docs/test-cli] |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Managed js-debug release asset | Require users to install js-debug manually | Manual setup contradicts D-04 and D-08 for the intended v1 path. [VERIFIED: CONTEXT.md] |
| Managed debugpy environment/check | Require users to run `pip install debugpy` manually | Manual setup contradicts D-04 for the built-in Python path; an explicit first-party setup/readiness command may be acceptable if it is part of the normal install/setup flow. [VERIFIED: CONTEXT.md] |
| Playwright automated core + docs | Docs-only Playwright playbook | Docs-only does not satisfy D-09/TEST-07 because automated coverage is required. [VERIFIED: CONTEXT.md + REQUIREMENTS.md] |
| Vitest-based Playwright orchestration | Separate Playwright test runner suite | Vitest keeps existing test conventions; Playwright Test gives native browser fixtures, reporters, traces, and CLI. Pick the smaller path that gives stable automation. [VERIFIED: current test stack + CITED: playwright.dev/docs/test-cli] |

**Installation / setup candidates:**

```bash
npm install --save-dev @playwright/test
python3 -m pip install debugpy==1.8.20
# js-debug should be fetched from GitHub release asset js-debug-dap-v1.117.0.tar.gz or otherwise provisioned by a first-party setup/readiness flow.
```

**Version verification:** Commander 14.0.3, Vitest 4.1.5, tsup 8.5.1, zod 4.4.2, @vscode/debugprotocol 1.68.0, @playwright/test 1.59.1, Playwright 1.59.1, js-debug v1.117.0 release asset, and debugpy 1.8.20 were checked on 2026-05-03. [VERIFIED: npm view + gh release view + pip index]

## Architecture Patterns

### System Architecture Diagram

```text
Agent / User
  |
  | install / setup / quick start
  v
README.md -----------------------> docs/AGENT-WORKFLOWS.md
  |                                      |
  | happy path commands                  | deeper sequences, Playwright interop
  v                                      v
dap-cli Commander commands ------> persistent controller ------> DAP session runtime
  |                                      |                         |
  | JSON envelopes                       | session state/events      | initialize/launch/attach/configurationDone
  v                                      v                         v
agent parser / shell loop         DAP_CLI_HOME state/logs         adapter process/socket
                                                               /          \
                                                              v            v
                                                    js-debug/debugpy     custom adapters
                                                              |
                                                              v
                                                Node/Python/browser fixtures
                                                              |
                                                              v
                                      smoke tests + self-hosting + exploratory verification
```

[VERIFIED: codebase architecture + CONTEXT.md]

### Recommended Project Structure

```text
README.md                                      # quick start, install, first debug loop, polling model
scripts/                                       # optional adapter/readiness/setup/self-hosting entrypoints if chosen
docs/
  ADAPTER-SETUP.md                            # custom adapters and advanced adapter troubleshooting
  AGENT-WORKFLOWS.md                          # deeper command sequences and polling loops
  PLAYWRIGHT-INTEROP.md                       # Playwright plus dap-cli playbooks
  VERIFICATION.md                             # v1 verification matrix and self-hosting practice
src/
  cli/commands/                               # help/example polish and readiness commands if needed
  adapters/builtins/                          # built-in adapter resolution/provisioning boundaries
tests/
  integration/                                # real adapter, Playwright interop, and self-hosting tests
  fixtures/                                   # stable Node/Python/browser/CLI targets
```

[VERIFIED: current repo structure + CONTEXT.md]

### Pattern 1: README-First, Docs-Second

**What:** README should get a user from install to a useful loop quickly, then link to focused docs for deeper command sequences. [VERIFIED: CONTEXT.md]

**When to use:** Use README for installation, one JS quick start, one Python quick start, controller/session basics, JSON envelope shape, polling-only semantics, cleanup, and links. [VERIFIED: REQUIREMENTS.md + CONTEXT.md]

**Example:**

```bash
npm install
npm run build
dap-cli start
dap-cli launch --adapter js-debug --type node --program tests/fixtures/simple-node-app/index.js --args run --name node-demo
dap-cli status --name node-demo
dap-cli events --name node-demo --limit 10
dap-cli threads --name node-demo
dap-cli cleanup
```

[VERIFIED: package.json + command modules]

### Pattern 2: Poll-Then-Inspect Loop

**What:** Agent workflows should poll `status` and `events`, then inspect paused state through `threads -> stack -> scopes -> variables`; references should be reacquired after continue/resume. [VERIFIED: src/cli/commands + CITED: microsoft.github.io/debug-adapter-protocol/overview]

**When to use:** Use this in README happy path, agent workflow guide, and Playwright interop playbooks. [VERIFIED: CONTEXT.md]

**Example:**

```bash
dap-cli status --name web-demo
dap-cli events --name web-demo --after-cursor 0 --limit 20
dap-cli threads --name web-demo
dap-cli stack --thread-id 1 --name web-demo
dap-cli scopes --frame-id 10 --name web-demo
dap-cli variables --variables-reference 100 --name web-demo
dap-cli continue --thread-id 1 --name web-demo
```

[VERIFIED: src/cli/commands/dapCore.ts + src/cli/commands/dapAliases.ts]

### Pattern 3: Layered Self-Hosting

**What:** Start with deterministic fake/fixture workflows, then add real built-in adapter workflows, then one capstone where dap-cli debugs dap-cli or its own CLI execution path. [VERIFIED: CONTEXT.md]

**When to use:** Use for 04-03 and 04-04 so exploratory failures do not destabilize default checks before stable coverage exists. [VERIFIED: ROADMAP.md]

**Example test progression:**

```text
fake adapter CLI workflow -> js-debug Node fixture -> debugpy Python fixture -> Chrome/Playwright interop -> dap-cli debugging dap-cli capstone
```

[VERIFIED: tests/integration/fakeAdapterCli.test.ts + jsDebugAdapter.test.ts + debugpyAdapter.test.ts + CONTEXT.md]

### Pattern 4: First-Party Readiness Checks

**What:** Add an explicit way to verify or provision built-in adapter readiness before claiming v1 readiness. [VERIFIED: CONTEXT.md + current adapter resolver]

**When to use:** Use if packaging cannot embed both js-debug and debugpy directly in the npm package. [VERIFIED: js-debug release distribution + debugpy pip distribution]

**Example behavior:**

```text
dap-cli doctor
  - reports Node/npm/package version
  - reports js-debug DAP server path/version
  - reports Python/debugpy importability/version
  - reports Playwright/browser availability if interop tests are enabled
```

[ASSUMED]

### Anti-Patterns to Avoid

- **Docs-only built-in fix:** Updating README to say built-ins are easy while the resolver still fails without manual js-debug/debugpy setup would violate D-04. [VERIFIED: CONTEXT.md + codebase read]
- **Availability-gated default smokes for built-ins:** Keeping real adapter tests skipped by default would preserve the Phase 3 gap and violate D-08. [VERIFIED: 03-04-SUMMARY.md + CONTEXT.md]
- **Protocol-layer language behavior:** JavaScript/Python setup belongs in adapter/packaging boundaries, not in `protocol/`. [VERIFIED: copilot-instructions.md]
- **Event streaming or blocking waits:** v1 docs and workflows must teach polling; streaming and blocking wait commands are v2/out of scope. [VERIFIED: REQUIREMENTS.md]
- **Throwaway exploratory notes:** Self-hosting discoveries must become planning backlog/follow-up items or verification notes, not transient chat notes. [VERIFIED: CONTEXT.md]

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| DAP protocol sequencing | Custom sequence outside existing client/controller | Existing `DapClient`, controller routes, and CLI command helpers | Existing tests cover lifecycle, events, JSON envelopes, and cleanup. [VERIFIED: codebase read] |
| JSON output parsing in tests | Ad hoc stdout parsing per test | `tests/helpers/runCli.ts` | Existing helper enforces one newline-terminated JSON envelope and isolated env. [VERIFIED: tests/helpers/runCli.ts] |
| Browser automation | Shell scripts that guess DOM timing | Playwright or @playwright/test | Official Playwright CLI supports test execution, browser install, project filters, single-worker runs, and traces/reporters. [CITED: playwright.dev/docs/test-cli] |
| JS debug adapter implementation | A custom Node inspector client | vscode-js-debug standalone DAP server | js-debug is a DAP-compatible JavaScript debugger with standalone DAP server releases. [CITED: github.com/microsoft/vscode-js-debug + VERIFIED: gh release view] |
| Python debug adapter implementation | A custom Python debugger bridge | debugpy | debugpy is Microsoft’s DAP implementation for Python and supports `python -m debugpy` CLI/API workflows. [CITED: github.com/microsoft/debugpy] |
| Backlog tracking | Unstructured chat/local notes | GSD-tracked planning backlog/follow-up file | User decision requires durable GSD-tracked follow-up for organic discoveries. [VERIFIED: CONTEXT.md] |

**Key insight:** Phase 4 should assemble and verify existing building blocks; custom protocol/browser/debugger machinery would increase risk and undermine v1 readiness. [VERIFIED: codebase read + CONTEXT.md]

## Common Pitfalls

### Pitfall 1: Built-In Adapter Claims Outrun Packaging

**What goes wrong:** README claims JavaScript/Python work out of the box while `js-debug` and `debugpy` are still missing from normal installs. [VERIFIED: docs/ADAPTER-SETUP.md + environment probe]

**Why it happens:** Current resolver treats built-in adapter IDs as descriptor shapes but still expects external binaries/modules to already exist. [VERIFIED: src/adapters/builtins/jsDebug.ts + debugpy.ts]

**How to avoid:** Plan a concrete provisioning/readiness strategy before final docs wording and default smoke enforcement. [VERIFIED: CONTEXT.md]

**Warning signs:** `js_debug_not_found`, Python `No module named debugpy`, skipped real adapter tests, or docs that still tell users to manually install built-ins. [VERIFIED: docs/ADAPTER-SETUP.md + 03-04-SUMMARY.md]

### Pitfall 2: Polling Docs Accidentally Promise Streaming

**What goes wrong:** Agent workflow docs imply agents can wait for pushed events or rely on a future `wait-for-stopped`. [VERIFIED: REQUIREMENTS.md]

**Why it happens:** DAP itself has events, but dap-cli v1 exposes bounded recent event polling through CLI commands. [VERIFIED: src/cli/commands/dapCore.ts]

**How to avoid:** Every workflow should include `status` and/or `events --after-cursor` polling before inspection. [VERIFIED: codebase read]

**Warning signs:** Docs use phrases like subscribe, stream, watch, or wait without saying v2/out of scope. [VERIFIED: REQUIREMENTS.md]

### Pitfall 3: Stale DAP Variable References

**What goes wrong:** An agent stores `frameId` or `variablesReference`, continues execution, then tries to reuse those references after the program stops again. [CITED: microsoft.github.io/debug-adapter-protocol/overview]

**Why it happens:** DAP object references for scopes/variables are limited to the current suspended state. [CITED: microsoft.github.io/debug-adapter-protocol/overview]

**How to avoid:** Docs should show reacquiring `threads`, `stack`, `scopes`, and `variables` after every resume/pause. [CITED: microsoft.github.io/debug-adapter-protocol/overview]

**Warning signs:** Playbooks skip from `continue` back to old `variables-reference` values. [CITED: microsoft.github.io/debug-adapter-protocol/overview]

### Pitfall 4: Flaky Playwright + Debugger Timing

**What goes wrong:** A browser action races debugger initialization/breakpoint configuration, causing missed pauses or intermittent failures. [ASSUMED]

**Why it happens:** Playwright can trigger UI actions before js-debug has completed initialize/launch/configurationDone and breakpoint verification. [ASSUMED]

**How to avoid:** Tests should establish the dap-cli session, set breakpoints, confirm status/capabilities/events, then trigger Playwright actions with single-worker deterministic execution. [VERIFIED: DAP docs + CITED: playwright.dev/docs/test-cli]

**Warning signs:** Tests pass locally but fail in CI unless run with `--workers=1` or added delays. [ASSUMED]

### Pitfall 5: Self-Hosting Too Broad Too Early

**What goes wrong:** The capstone tries to debug arbitrary CLI/controller behavior before stable fixture layers pass. [ASSUMED]

**Why it happens:** Self-hosting is attractive but can multiply unknowns across build output, controller lifecycle, adapter setup, and target behavior. [ASSUMED]

**How to avoid:** Use fixture smoke tests as prerequisites and keep the capstone narrow: one dap-cli process, one breakpoint/stop/inspect/cleanup path. [VERIFIED: CONTEXT.md]

**Warning signs:** A self-hosting failure cannot be classified as product bug, test bug, adapter setup bug, or environment bug. [ASSUMED]

## Files Likely to Change

| Area | Likely Files | Change Type |
|------|--------------|-------------|
| README-first docs | `README.md` | New quick-start and release-ready user entry point. [VERIFIED: file search found no README] |
| Focused docs | `docs/ADAPTER-SETUP.md`, `docs/AGENT-WORKFLOWS.md`, `docs/PLAYWRIGHT-INTEROP.md`, `docs/VERIFICATION.md` | Revise custom adapter docs and add focused workflows/playbooks. [VERIFIED: existing docs + CONTEXT.md] |
| CLI help/readiness | `src/cli/program.ts`, `src/cli/commands/*.ts` | Polish descriptions/options and possibly add `doctor`/setup/readiness command if chosen. [VERIFIED: command modules] |
| Adapter provisioning | `src/adapters/builtins/jsDebug.ts`, `src/adapters/builtins/debugpy.ts`, `src/adapters/registry.ts`, `src/config/paths.ts`, `package.json`, possible `scripts/` | Make built-in adapter availability align with v1 expectations. [VERIFIED: adapter resolver + package.json] |
| Real adapter smokes | `tests/integration/jsDebugAdapter.test.ts`, `tests/integration/debugpyAdapter.test.ts` | Convert from availability-gated to default-runnable after provisioning. [VERIFIED: current skipIf usage] |
| Self-hosting | New test under `tests/integration/` or script under `scripts/` | Add fixture-first and dap-cli-debugs-dap-cli workflows. [VERIFIED: CONTEXT.md] |
| Playwright interop | New Playwright/Vitest test and browser fixture docs | Add automated core scenario and docs/playbook. [VERIFIED: CONTEXT.md + no existing Playwright files] |
| Verification notes/backlog | `.planning/` follow-up/backlog artifact and/or Phase 4 summary | Record exploratory discoveries and final v1 evidence. [VERIFIED: CONTEXT.md + no existing backlog file found] |

## Code Examples

### CLI Polling Workflow

```bash
dap-cli start
dap-cli launch --adapter fake --script alias-inspection --name inspect
dap-cli status --name inspect
dap-cli events --name inspect --after-cursor 0 --limit 10
dap-cli threads --name inspect
dap-cli stack --thread-id 1 --name inspect
dap-cli scopes --frame-id 10 --name inspect
dap-cli variables --variables-reference 100 --name inspect
dap-cli continue --thread-id 1 --name inspect
dap-cli cleanup
```

[VERIFIED: tests/integration/fakeAdapterCli.test.ts + command modules]

### Playwright Interop Shape

```bash
# Terminal/session A: establish debugger state.
dap-cli launch --adapter js-debug --type chrome --url http://127.0.0.1:3000 --name web-demo
dap-cli breakpoints set --source tests/fixtures/simple-chrome-page/app.js --line 2 --name web-demo
dap-cli status --name web-demo

# Terminal/session B: drive the UI.
npx playwright test tests/interop/web-demo.spec.ts --project=chromium --workers=1

# Terminal/session A or agent loop: poll and inspect.
dap-cli events --name web-demo --after-cursor 0 --limit 20
dap-cli threads --name web-demo
dap-cli stack --thread-id 1 --name web-demo
```

[VERIFIED: dap-cli commands + CITED: playwright.dev/docs/test-cli]

### Real Adapter Readiness Check Shape

```bash
npm run build
npm run check
npm test -- tests/integration/jsDebugAdapter.test.ts tests/integration/debugpyAdapter.test.ts
```

[VERIFIED: package.json + existing test files]

## State of the Art

| Old Approach | Current Approach | When Changed / Verified | Impact |
|--------------|------------------|--------------------------|--------|
| Manual js-debug tarball installation documented as normal built-in setup | First-party provisioning/readiness should make built-in JS usable in intended v1 path | User locked D-04 on 2026-05-03; current doc still manual | Planner must include packaging/setup work. [VERIFIED: CONTEXT.md + docs/ADAPTER-SETUP.md] |
| Manual `pip install debugpy` documented as normal built-in setup | First-party setup/readiness should make Python built-in usable in intended v1 path | User locked D-04 on 2026-05-03; current environment lacks debugpy | Planner must resolve Python adapter availability. [VERIFIED: CONTEXT.md + environment probe] |
| Availability-gated real adapter smokes | Real built-in adapter smoke coverage runs by default for v1 | User locked D-08 on 2026-05-03; Phase 3 had 6 skipped tests | Planner must revisit `skipIf` gates after provisioning. [VERIFIED: CONTEXT.md + 03-04-SUMMARY.md] |
| Docs-only Playwright interop | Automated Playwright interop plus docs/playbooks | User locked D-09 on 2026-05-03 | Planner should add dependency/test/playbook together. [VERIFIED: CONTEXT.md] |

**Deprecated/outdated:**

- Treating `docs/ADAPTER-SETUP.md` manual js-debug/debugpy provisioning as the happy path is outdated for Phase 4. [VERIFIED: CONTEXT.md + docs/ADAPTER-SETUP.md]
- Treating skipped real adapter smoke tests as sufficient is outdated for Phase 4. [VERIFIED: CONTEXT.md + 03-04-SUMMARY.md]

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | A `dap-cli doctor` or similar readiness command is an acceptable way to satisfy no-manual-setup if it provisions/checks built-ins as part of the normal setup flow. | Architecture Patterns | Planner may need a different mechanism such as install script, bundled asset, or dev dependency strategy. |
| A2 | Playwright plus debugger timing can be flaky unless setup order is deterministic. | Common Pitfalls | Planner may over-invest in synchronization if simple fixture timing is already stable. |
| A3 | Self-hosting capstone should stay narrow to avoid compounding unknowns. | Common Pitfalls | Planner might choose a broader capstone if implementation is already robust enough. |

## Open Questions (RESOLVED)

1. **What exact no-manual-setup mechanism should v1 use for js-debug?**
   - What we know: js-debug provides standalone DAP server release assets, and v1.117.0 has `js-debug-dap-v1.117.0.tar.gz`. [VERIFIED: gh release view]
   - What's unclear: Whether the package should download/cache it, vendor it, install it via a script, or document a first-party setup command. [ASSUMED]
   - Recommendation: Planner should choose the smallest reproducible mechanism that makes default smoke tests pass without manual user steps. [VERIFIED: CONTEXT.md]

2. **What exact no-manual-setup mechanism should v1 use for debugpy?**
   - What we know: debugpy 1.8.20 is available from pip, and current local Python lacks it. [VERIFIED: pip index + import probe]
   - What's unclear: Whether dap-cli should manage a Python environment, depend on system Python plus setup command, or keep Python built-in readiness as a checked prerequisite. [ASSUMED]
   - Recommendation: Planner should make the setup path first-party and default-checkable, not just a docs instruction. [VERIFIED: CONTEXT.md]

3. **Should Playwright automation use Vitest orchestration or Playwright Test?**
   - What we know: Repo currently uses Vitest only, and `@playwright/test` 1.59.1 is current. [VERIFIED: package.json + npm view]
   - What's unclear: Whether adding a second test runner is worth the native browser fixtures/traces. [ASSUMED]
   - Recommendation: Use the smallest reliable test shape; if browser control is substantial, `@playwright/test` is justified. [CITED: playwright.dev/docs/test-cli]

4. **Where should the GSD-tracked backlog live?**
   - What we know: No existing backlog file was found under `.planning/`. [VERIFIED: file search]
   - What's unclear: Preferred GSD artifact name/location for this repo. [ASSUMED]
   - Recommendation: Planner should create a lightweight `.planning/BACKLOG.md` or phase-local follow-up artifact if no GSD command provides one. [ASSUMED]

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|-------------|-----------|---------|----------|
| Node.js | CLI, js-debug target, tests | yes | v22.22.1 | none needed. [VERIFIED: node --version] |
| npm | package scripts/dependencies | yes | 10.9.4 | none needed. [VERIFIED: npm --version] |
| Python 3 | debugpy adapter | yes | 3.13.11 | none needed for interpreter, but debugpy is missing. [VERIFIED: python3 --version] |
| debugpy | Python built-in smoke | no | latest available 1.8.20 | First-party setup/provisioning required. [VERIFIED: import probe + pip index] |
| js-debug DAP server | JavaScript built-in smoke | no local resolver path found | v1.117.0 release asset exists | First-party setup/provisioning required. [VERIFIED: path probes + gh release view] |
| Playwright | Interop automation/docs | no dependency in repo | 1.59.1 current | Add dev dependency or document `npx` use; automated tests require package/install choice. [VERIFIED: file search + npm view] |
| Knowledge graph | GSD graph context | absent | none | Continue from planning/codebase reads. [VERIFIED: graph status command produced no output] |

**Missing dependencies with no fallback:**

- js-debug and debugpy are missing for default real built-in smoke coverage until Phase 4 implements a provisioning/readiness path. [VERIFIED: environment probe + CONTEXT.md]

**Missing dependencies with fallback:**

- Playwright is missing, but Phase 4 can add it as a dev dependency or use an explicit setup/install path. [VERIFIED: package.json + npm view]

## Verification Strategy

| Requirement | Behavior | Test / Evidence | Suggested Command |
|-------------|----------|-----------------|-------------------|
| AGNT-04 | Playwright interop docs sequence UI actions and dap-cli debugger polling | Documentation review plus automated interop scenario | `npm test -- <interop test>` or `npx playwright test <interop spec> --project=chromium --workers=1` [CITED: playwright.dev/docs/test-cli] |
| AGNT-05 | Docs show polling status/events instead of event streaming | Documentation review and docs snippets validated against CLI help/tests | `node dist/index.js --help` and targeted CLI integration tests. [VERIFIED: command modules] |
| TEST-06 | Self-hosting uses dap-cli to debug fixtures and dap-cli itself | Fixture self-hosting test plus capstone workflow | `npm test -- tests/integration/<self-hosting>.test.ts` [VERIFIED: existing test conventions] |
| TEST-07 | Agentic exploratory scenario combines dap-cli and dynamic interaction | Playwright/dap-cli test plus final verification notes | `npm run check` after default real adapter smokes pass. [VERIFIED: package.json + CONTEXT.md] |
| D-08 support | Real built-in smokes run by default | Existing js-debug/debugpy tests no longer skip due to missing built-ins in normal setup | `npm test -- tests/integration/jsDebugAdapter.test.ts tests/integration/debugpyAdapter.test.ts` [VERIFIED: existing tests] |

**Recommended gate order:**

1. `npm run typecheck` after command/help/package changes. [VERIFIED: package.json]
2. `npm run lint` after docs-adjacent TypeScript changes. [VERIFIED: package.json]
3. Targeted integration tests for changed flows. [VERIFIED: existing test conventions]
4. Real adapter smokes after provisioning. [VERIFIED: existing test files]
5. Playwright interop automated scenario. [VERIFIED: CONTEXT.md]
6. `npm run check` as the final v1 readiness gate. [VERIFIED: package.json]

## Validation Architecture

> Nyquist validation is enabled in `.planning/config.json`; Phase 4 plans must include automated verification commands or Wave 0 tasks that create the missing tests before dependent implementation work. [VERIFIED: .planning/config.json + plan-phase workflow]

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest 3.2.4 with TypeScript tests. [VERIFIED: package.json] |
| Config file | `vitest.config.ts`; lint uses `eslint.config.js`; typecheck uses `tsconfig.json`. [VERIFIED: package.json + repo structure] |
| Quick run command | `npm test -- tests/integration/fakeAdapterCli.test.ts` for fixture-backed CLI workflow checks; use narrower file-specific commands for new docs/readiness/self-hosting tests as they are added. [VERIFIED: package.json + existing tests] |
| Full suite command | `npm run check` after provisioning/readiness and Playwright decisions are implemented. [VERIFIED: package.json] |
| Estimated runtime | Current full suite is suitable as the final gate; targeted Vitest files should be used for per-task feedback to avoid running adapter/browser smokes after every small docs edit. [ASSUMED based on existing test layout] |

### Phase Requirements -> Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| AGNT-04 | Agent-oriented docs interleave dap-cli polling/inspection commands with Playwright CLI-driven UI actions. | docs verification + integration smoke | `npm test -- tests/integration/playwrightInterop.test.ts` or equivalent focused Vitest/Playwright command after Wave 0 creates it. | Missing - Wave 0 should create the automated interop coverage and docs assertions. |
| AGNT-05 | Docs teach polling `status`/`events` and reacquiring stack/scope/variable references rather than relying on event streaming. | docs verification + CLI fixture smoke | `npm test -- tests/integration/fakeAdapterCli.test.ts` plus a docs/example validation test if command snippets are extracted or asserted. | Partial - fixture workflow exists; docs-specific validation is missing. |
| TEST-06 | Self-hosting workflows use dap-cli to debug fixtures and dap-cli or its own CLI execution path. | integration/self-hosting smoke | `npm test -- tests/integration/selfHosting.test.ts` or equivalent focused integration file after Wave 0 creates it. | Missing - Wave 0 should create the self-hosting test harness. |
| TEST-07 | Agentic exploratory debugging combines dap-cli with dynamic application interaction and preserves reproducible artifacts. | Playwright interop integration + verification artifact review | `npm test -- tests/integration/playwrightInterop.test.ts` and final `npm run check` once adapter provisioning is default-runnable. | Missing - depends on Playwright/dev dependency and js-debug readiness work. |
| D-04/D-08 support | Built-in js-debug/debugpy availability and real adapter smokes no longer depend on manual user setup for the intended v1 path. | adapter readiness smoke | `npm test -- tests/integration/jsDebugAdapter.test.ts tests/integration/debugpyAdapter.test.ts` after provisioning/readiness changes. | Partial - tests exist but are availability-gated until provisioning is implemented. |

### Sampling Rate

- **Per task commit:** Run the narrowest relevant targeted command, such as `npm test -- tests/integration/fakeAdapterCli.test.ts`, a new self-hosting test file, or a new Playwright interop test file. [VERIFIED: package.json + existing test conventions]
- **Per wave merge:** Run `npm run typecheck`, `npm run lint`, and the targeted integration tests touched by that wave. [VERIFIED: package.json]
- **Phase gate:** Run `npm run check`; additionally run real adapter and Playwright interop commands after the provisioning path makes them default-runnable. [VERIFIED: package.json + CONTEXT.md]
- **No watch mode:** Automated verification commands must use one-shot commands (`vitest run`, `npm run check`, or `npx playwright test ... --workers=1`) rather than watch/blocking modes. [VERIFIED: package.json + Playwright CLI docs]

### Wave 0 Gaps

- [ ] `tests/integration/selfHosting.test.ts` or equivalent - covers TEST-06 with a fixture-first workflow and one narrow dap-cli-debugs-dap-cli capstone. [VERIFIED: CONTEXT.md]
- [ ] `tests/integration/playwrightInterop.test.ts` or equivalent - covers AGNT-04 and TEST-07 with deterministic Playwright-driven interaction plus dap-cli polling/inspection. [VERIFIED: CONTEXT.md]
- [ ] Docs/example validation strategy - covers AGNT-04 and AGNT-05 by checking command examples against the generated CLI/help surface or extracting reusable snippets. [ASSUMED]
- [ ] Built-in adapter readiness/provisioning test updates - converts existing js-debug/debugpy smoke coverage from availability-gated to default-runnable once the setup mechanism exists. [VERIFIED: existing tests + CONTEXT.md]

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|------------------|
| V2 Authentication | no | No authentication surface is in Phase 4 scope. [VERIFIED: REQUIREMENTS.md] |
| V3 Session Management | yes | Local controller/session cleanup and isolated `DAP_CLI_HOME`; do not leak stale session state. [VERIFIED: existing session tests] |
| V4 Access Control | no | No multi-user authorization surface is in Phase 4 scope. [VERIFIED: REQUIREMENTS.md] |
| V5 Input Validation | yes | Keep JSON/options validation through existing CLI helpers and zod/config validation where applicable. [VERIFIED: package.json + command modules] |
| V6 Cryptography | no | No crypto implementation is in Phase 4 scope. [VERIFIED: REQUIREMENTS.md] |

### Known Threat Patterns for This Stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Downloading/provisioning js-debug from releases without integrity/version control | Tampering | Pin version, verify asset name/source, document/update checksum or lock metadata if downloading during setup. [VERIFIED: gh release view + ASSUMED mitigation] |
| Running debugpy on public interfaces in examples | Elevation of privilege / information disclosure | Use localhost examples and warn against `0.0.0.0` except secure networks; debugpy docs warn that public listeners can allow arbitrary code execution in the debugged process. [CITED: github.com/microsoft/debugpy] |
| Leaving debug adapter processes or controllers running after tests | Denial of service / resource leak | Use existing cleanup helpers and session cleanup commands. [VERIFIED: tests/helpers/runCli.ts + session commands] |
| Shell examples with unescaped user paths/JSON | Tampering / command injection in copied examples | Keep examples simple, quote JSON, and avoid interpolating untrusted shell values. [ASSUMED] |

## Sources

### Primary (HIGH confidence)

- `copilot-instructions.md` - project goals, constraints, stack, architecture boundaries. [VERIFIED: codebase read]
- `.planning/phases/04-agent-workflow-documentation-and-self-hosting-verification/04-CONTEXT.md` - locked Phase 4 decisions. [VERIFIED: codebase read]
- `.planning/REQUIREMENTS.md` - AGNT-04, AGNT-05, TEST-06, TEST-07 and v1/v2 boundaries. [VERIFIED: codebase read]
- `.planning/ROADMAP.md` - Phase 4 success criteria and plan breakdown. [VERIFIED: codebase read]
- `.planning/STATE.md` - current milestone position. [VERIFIED: codebase read]
- `package.json` - scripts, dependencies, bin, engine. [VERIFIED: codebase read]
- `src/cli/program.ts`, `src/cli/commands/*.ts` - command/help surface. [VERIFIED: codebase read]
- `src/adapters/builtins/jsDebug.ts`, `src/adapters/builtins/debugpy.ts` - current built-in adapter resolution. [VERIFIED: codebase read]
- `tests/helpers/runCli.ts`, `tests/integration/fakeAdapterCli.test.ts`, `tests/integration/jsDebugAdapter.test.ts`, `tests/integration/debugpyAdapter.test.ts` - existing test patterns and smoke gaps. [VERIFIED: codebase read]
- `gh release view v1.117.0 --repo microsoft/vscode-js-debug` - js-debug DAP tarball existence and release date. [VERIFIED: gh CLI]
- `npm view` / `pip index` version checks on 2026-05-03. [VERIFIED: package registries]

### Secondary (MEDIUM confidence)

- https://playwright.dev/docs/test-cli - Playwright CLI commands, browser install, workers, debug, project filters. [CITED: official docs]
- https://microsoft.github.io/debug-adapter-protocol/overview - DAP lifecycle, stopped state, inspection waterfall, object-reference lifetime. [CITED: official docs]
- https://github.com/microsoft/vscode-js-debug - js-debug standalone DAP server and release distribution notes. [CITED: official GitHub]
- https://github.com/microsoft/debugpy - debugpy CLI/API usage and security warning for public listeners. [CITED: official GitHub]

### Tertiary (LOW confidence)

- None. [VERIFIED: research review]

## Metadata

**Confidence breakdown:**

- Standard stack: HIGH - existing package metadata and registry versions were verified. [VERIFIED: package.json + npm view]
- Architecture: HIGH - repo boundaries and command/test surfaces were read directly. [VERIFIED: codebase read]
- Packaging path: MEDIUM - current gap and source distributions are verified, but exact no-manual-setup mechanism requires planning choice. [VERIFIED: codebase + registries + ASSUMED implementation choice]
- Playwright automation shape: MEDIUM - official CLI and current absence are verified, but runner choice needs planner decision. [VERIFIED: official docs + package.json + ASSUMED implementation choice]
- Pitfalls: MEDIUM - adapter packaging and DAP reference pitfalls are verified; timing/self-hosting breadth risks are partly assumed from integration-test practice. [VERIFIED: docs/codebase + ASSUMED]

**Research date:** 2026-05-03  
**Valid until:** 2026-06-02 for repo-specific findings; 2026-05-10 for fast-moving package versions. [ASSUMED]
