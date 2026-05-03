# Phase 4: Agent Workflow, Documentation, and Self-Hosting Verification - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-03
**Phase:** 4-Agent Workflow, Documentation, and Self-Hosting Verification
**Areas discussed:** Documentation shape, Self-hosting verification

---

## Documentation Shape

| Option | Description | Selected |
|--------|-------------|----------|
| Compact guide set | README plus focused docs under docs/: user guide, agent workflows, adapter setup, development/testing. | |
| README-first | Put most user-facing material in README and keep docs/ minimal. | Yes |
| Full canonical set | README plus architecture, getting-started, development, testing, configuration, and agent workflow docs. | |
| You decide | Let the planner choose the smallest professional structure that satisfies Phase 4. | |

**User's choice:** README-first.
**Notes:** README should be quick-start heavy. Detailed command examples should mostly live in an agent workflow doc. The user clarified that built-in js-debug and debugpy should not require manual setup; docs should cover setup for other custom adapters.

### Built-In Adapter Setup Follow-Up

| Option | Description | Selected |
|--------|-------------|----------|
| No manual setup for built-ins | Planner should add/install/package a path so js-debug and debugpy work by default; docs cover only verification/custom adapters. | Yes |
| Docs say optional prerequisites | Keep current external adapter setup model, but make docs clearer. | |
| Split by environment | Dev setup may require installs, but packaged/user path should not. | |
| You decide | Let planning find the cleanest way to meet v1 expectations. | |

**User's choice:** No manual setup for built-ins.
**Notes:** This is a locked v1 expectation and should drive packaging/readiness planning, not only documentation wording.

---

## Self-Hosting Verification

| Option | Description | Selected |
|--------|-------------|----------|
| Debug dap-cli itself | Use dap-cli to inspect/debug dap-cli or its own CLI execution path; strongest self-hosting signal. | |
| Debug fixtures end-to-end | Use dap-cli against bundled Node/Python/browser fixtures; simpler and more stable. | |
| Both, in layers | Start with fixtures, then add one dap-cli-debugs-dap-cli workflow as the capstone. | Yes |
| You decide | Let planning choose the strongest reliable proof. | |

**User's choice:** Both, in layers.
**Notes:** Self-hosting should include automated tests, but also become part of normal development practice. When something goes wrong, agents should eagerly use dap-cli to debug it. Unrelated issues discovered while self-hosting should be noted and later fixed.

### Discovery Tracking

| Option | Description | Selected |
|--------|-------------|----------|
| Planning backlog | Capture discoveries as GSD deferred/backlog items tied to Phase 4 evidence. | Yes |
| Dedicated notes doc | Maintain a docs or planning notes file for self-hosting observations. | |
| GitHub issues later | Document them in verification notes, but do not file anything automatically. | |
| You decide | Planner picks a lightweight durable place. | |

**User's choice:** Planning backlog.
**Notes:** Do not file external GitHub issues automatically.

### Real Adapter Smoke Coverage

| Option | Description | Selected |
|--------|-------------|----------|
| Run by default | Built-in js-debug/debugpy smokes should run in normal checks because built-ins require no manual setup. | Yes |
| Availability-gated | Keep smokes skipped when adapters are missing, with diagnostics and docs. | |
| Split local vs CI | Run fake/stable tests by default, real adapters in an explicit smoke command or CI job. | |
| You decide | Planner balances reliability with the no-manual-setup requirement. | |

**User's choice:** Run by default.
**Notes:** This follows from the built-in adapter setup decision.

### Playwright Interop

| Option | Description | Selected |
|--------|-------------|----------|
| Documented workflow first | Write agent playbooks that sequence Playwright actions with dap-cli polling and inspection. | |
| Runnable example script | Add a reproducible fixture/script that drives browser UI and debugger together. | |
| Automated test | Make at least one Playwright+dap-cli scenario part of test automation. | |
| Hybrid | Document the workflow and automate the stable core if practical. | Yes |

**User's choice:** Automated tests plus docs/playbooks.
**Notes:** Playwright interop should have automated coverage and written guidance showing how the tools are used together.

## the agent's Discretion

- Choose the smallest docs structure that keeps README fast and deeper workflows discoverable.
- Choose the exact implementation path for no-manual-setup built-in adapters.
- Choose the stable boundary between automated tests and documented playbooks, while respecting the user's automation requirements.

## Deferred Ideas

None.