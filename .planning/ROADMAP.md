# Roadmap: dap-cli

## Milestones

- ✅ **v0.1.0** — initial public release (Phases 1–19, shipped 2026-05-12) — see [milestones/v0.1.0-ROADMAP.md](milestones/v0.1.0-ROADMAP.md)
- 📋 **v0.2.0 (next)** — TBD via `/gsd-new-milestone`

## Phases

<details>
<summary>✅ v0.1.0 — Phases 1–19 (SHIPPED 2026-05-12)</summary>

- [x] Phase 1: Project Foundation, Controller, and DAP Core
- [x] Phase 2: Complete Typed DAP Command Surface
- [x] Phase 3: Built-in and Custom Adapter Support
- [x] Phase 4: Agent Workflow, Documentation, and Self-Hosting Verification
- [x] Phase 5: Stabilize real Chrome/js-debug Playwright same-browser handoff
- [x] Phase 5.1: Human-readable output mode *(INSERTED)*
- [x] Phase 5.2: VS Code launch.json + compound execution *(INSERTED)*
- [x] Phase 6: Conditional breakpoint Playwright interop coverage
- [x] Phase 7: Hardening bug discovery and exploratory smoke testing
- [x] Phase 8: External project hardening expansion
- [x] Phase 9: Infer adapter/type from `--program` file extension
- [x] Phase 10: Auto-route launch/attach by `--config request` field, `--json-overrides`, `--resolve-source-maps`
- [x] Phase 11: Paused-state ergonomics — status reflects events, evaluate auto-uses topmost paused frame
- [x] Phase 12: Breakpoint command surface — `breakpoints list`, `breakpoints clear`, richer verification diagnostics
- [x] Phase 13: Auto-emit JSON when stdout is not a TTY
- [x] Phase 14: Update agent workflow docs from external usage analysis
- [x] Phase 15: Child-session enumeration and event routing for js-debug pwa-*
- [x] Phase 16: Python evaluate ergonomics — auto-wrap statements as `exec(...)`
- [x] Phase 17: Code OSS smoke scenario hardening (20 attach scenarios)
- [x] Phase 18: Per-child paused state and paused-first routing
- [x] Phase 19: `dap-cli help` UX cleanup, drill-down for subcommands, category headings

Full archive: [milestones/v0.1.0-ROADMAP.md](milestones/v0.1.0-ROADMAP.md)

</details>

### 📋 v0.2.0 (planned)

Run `/gsd-new-milestone` to scope the next milestone.

## Progress

| Milestone | Phases | Plans | Status | Shipped |
|-----------|--------|-------|--------|---------|
| v0.1.0    | 1–19   | 91    | ✅ SHIPPED | 2026-05-12 |
| v0.2.0    | TBD    | TBD   | 📋 Planned | — |

### Phase 20: I'd like to find another runtime that we can debug. We should do this by picking another debug adapter that already exists in the world and is popular, ideally one that is run by Microsoft. Then we should make a pretty substantial plan to implement it in this repo and figure out how to verify it. Going through a similar process to what we've done in the past, the most important thing is to just run through it right: 1. We need to identify the language of the debug adapter. 2. We need to make a plan for how it is installed or vendored into this repo or whatever we're doing for jsdebug and debugpy. I don't really even know. 3. We need to write the code. 4. We need to have substantial automated end-to-end testing. 5. We need to go through a process of trying it in different real-world debugging scenarios for different projects in that language that exist on GitHub that we can safely download and run and verify with debugging. Then we just set up the loop of having subagents run some different tasks, try to use dap-cli with the new language, and if they fail then we try to fix the issue or fix the confusion and repeat. I would like basically that entire end-to-end flow planned out.

**Goal:** Integrate Go debugging through Delve's native `dlv dap` server as dap-cli's next built-in runtime, provision it deterministically, prove launch/attach/state inspection through substantial real-adapter coverage, validate it on screened public Go projects, and harden the workflow through fresh-agent retries.
**Requirements**: None discovered (`.planning/REQUIREMENTS.md` is absent for Phase 20; plans use goal-derived must-haves without fabricating requirement IDs.)
**Depends on:** Phase 19
**Plans:** 6/6 plans complete

Plans:
- [x] 20-01-PLAN.md — Finalize the Go/Delve choice and add deterministic Delve provisioning plus descriptor diagnostics.
- [x] 20-02-PLAN.md — Wire `delve`, `type: "go"`, and `.go` inference into registry/config/CLI selection.
- [x] 20-03-PLAN.md — Build Go fixtures and substantial real Delve launch/test/exec/local-attach integration coverage.
- [x] 20-04-PLAN.md — Document Go/Delve setup and agent workflows, then pin them with docs validation.
- [x] 20-05-PLAN.md — Screen and debug safe public Go repositories with reproducible external-validation ledgers.
- [x] 20-06-PLAN.md — Run the fresh-agent hardening/fix-retry loop and preserve the mandatory later verify-work hand smoke gate.
