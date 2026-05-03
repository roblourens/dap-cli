# Phase 4: Agent Workflow, Documentation, and Self-Hosting Verification - Context

**Gathered:** 2026-05-03
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 4 finishes dap-cli v1 as an agent-usable professional CLI. It should produce a README-first documentation experience, agent workflow examples, Playwright interop guidance, packaging/readiness polish, automated self-hosting verification, and final exploratory validation. The phase should also close the gap between "built-in adapter" and "user has to manually provision adapter binaries": built-in JavaScript and Python debugging should not require manual user setup in the intended v1 path.

</domain>

<decisions>
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

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project Scope
- `.planning/PROJECT.md` — product goals, constraints, Playwright-style agent workflow, polling-only v1, built-in JS/Python adapter expectations, and out-of-scope boundaries.
- `.planning/REQUIREMENTS.md` — Phase 4 requirement IDs AGNT-04, AGNT-05, TEST-06, and TEST-07.
- `.planning/ROADMAP.md` — Phase 4 goal, success criteria, and planned plan breakdown.
- `.planning/STATE.md` — current milestone position and Phase 4 readiness note.

### Prior Phase Decisions
- `.planning/phases/02-complete-typed-dap-command-surface/02-CONTEXT.md` — typed command surface, ergonomic aliases, raw passthrough, capability reporting, and agent-friendly command shape.
- `.planning/phases/03-built-in-and-custom-adapter-support/03-CONTEXT.md` — adapter boundaries, launch/attach UX, built-in js-debug/debugpy strategy, and real smoke coverage expectations.
- `.planning/phases/03-built-in-and-custom-adapter-support/03-04-SUMMARY.md` — final Phase 3 verification, known skipped real-adapter smokes, and current setup-documentation gap.

### Existing Docs and Code Surfaces
- `docs/ADAPTER-SETUP.md` — existing adapter setup doc that should be revised so custom adapter setup remains documented while built-in setup is not treated as manual user work.
- `package.json` — package metadata, scripts, bin entry, engine requirement, dependencies, and check/build commands.
- `src/cli/program.ts` — Commander program name/description and command registration surface for help polish.
- `src/cli/commands/dapAliases.ts` — ergonomic command examples that should appear in quick-start and agent workflows.
- `src/cli/commands/dapGenerated.ts` — generated DAP request command surface and JSON argument behavior.
- `tests/helpers/runCli.ts` — reusable test helper for automated CLI/self-hosting workflows.
- `tests/integration/fakeAdapterCli.test.ts` — deterministic fixture-backed workflows that can seed self-hosting coverage.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `tests/helpers/runCli.ts` — provides isolated `DAP_CLI_HOME`, one-envelope JSON parsing, and controller cleanup for automated CLI scenarios.
- `tests/fixtures/fake-adapter-entry.ts` — deterministic fake adapter scripts already cover stopped, attach, alias inspection, execution control, and failure paths.
- `tests/fixtures/simple-node-app/`, `tests/fixtures/simple-python-app/`, `tests/fixtures/simple-chrome-page/`, and `tests/fixtures/simple-electron-app/` — existing targets for docs, smoke workflows, and Playwright/debugger interop.
- `src/cli/program.ts` plus command modules under `src/cli/commands/` — central help and command example surfaces.

### Established Patterns
- CLI commands emit a single machine-readable JSON envelope and keep handled failures structured.
- Integration tests isolate state through `DAP_CLI_HOME` and shut down controllers explicitly.
- Real adapter tests are currently availability-gated, but Phase 4 should revisit that because the v1 goal is no manual setup for built-in adapters.
- Adapter-specific behavior belongs behind descriptor/config/process/transport boundaries; Phase 4 should not move language behavior into protocol core.

### Integration Points
- README quick start should use the actual `dap-cli` bin, current commands, JSON output contract, and cleanup behavior.
- Agent workflow docs should sequence `launch`/`attach`, `breakpoints set`, Playwright actions, `status`/`events`, `threads`, `stack`, `scopes`, `variables`, `evaluate`, `continue`, and `cleanup`.
- Self-hosting verification can begin from existing fake adapter integration workflows and then add real built-in adapter and dap-cli-debugs-dap-cli scenarios.
- Packaging/readiness work must align `package.json`, built-in adapter availability, generated help, and docs so v1 claims match behavior.

</code_context>

<specifics>
## Specific Ideas

- The README should prioritize a fast first-success path over exhaustive reference material.
- A focused docs page should explain custom adapters, while built-in js-debug/debugpy should work without manual setup for the intended v1 path.
- Self-hosting should be treated as a normal agent development habit: use dap-cli to investigate failing tests or confusing behavior, record unrelated discoveries in the planning backlog, and return to fix them later.
- Playwright interop should be both automated and documented as an agent playbook.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 4-Agent Workflow, Documentation, and Self-Hosting Verification*
*Context gathered: 2026-05-03*