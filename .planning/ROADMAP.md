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

### Phase 21: Lazy runtime provisioning of built-in adapters (js-debug, debugpy, delve) on first use, with user confirmation, concurrency-safe install, and clear failure surfaces

**Goal:** Make `npm i -g @roblourens/dap-cli` (or `npx`) sufficient to debug Node, Python, and Go on a fresh machine: on first launch/attach the CLI prompts once (or accepts `--yes` / `DAP_CLI_ASSUME_YES=1`), then downloads, SHA-256 verifies, and atomically installs the relevant built-in adapter into `~/.dap-cli/adapters/<id>/` (overridable via `DAP_CLI_ADAPTERS_DIR`); concurrent installs are lockfile-serialized; every failure surface emits a structured `provision_*` error with actionable diagnostics.
**Requirements**: TBD
**Depends on:** Phase 20
**Plans:** 7/7 plans complete

Plans:

- [x] 21-01-PLAN.md — Provisioner scaffold: lock, atomic install, http+ProxyAgent, tar.gz/zip extract, consent helper, `--yes` / `DAP_CLI_ASSUME_YES` plumbing, async `AdapterRegistry.resolve`.
- [x] 21-02-PLAN.md — Per-adapter provisioners (js-debug, debugpy, delve) + embedded SHA-256 checksums + descriptor-factory wiring.
- [x] 21-03-PLAN.md — `dap-cli setup-adapters` user-facing subcommand + `scripts/setup-adapters.ts` rewritten as a thin wrapper.
- [x] 21-04-PLAN.md — Failure-surface audit + snapshot tests for every `provision_*` envelope + architecture-test assertions (no shell-out tar/unzip; `provision_`-namespaced codes).
- [x] 21-05-PLAN.md — FakeReleaseServer + synthetic-archive helpers + concurrent-install test + proxy precedence test + pre-publish tarball + npx-cache contract tests + `check:pack`.
- [x] 21-06-PLAN.md — README + `docs/adapter-setup.md` rewrite for lazy provisioning UX + hand-driven smoke `Sequence C` + orchestrator-driven UAT recording.

### Phase 22: Onboard Rust debugging through CodeLLDB as a built-in adapter with deterministic provisioning, safe real-project validation, and fresh-agent hardening

**Goal:** Integrate approved Rust debugging through CodeLLDB `v1.12.2` as a built-in adapter, after proving a loopback-only DAP transport and acceptable VSIX asset provenance; provision it through the existing lazy cache model, prove real Rust launch/config/attach behavior, and harden the workflow through screened public crates and transcript-audited fresh-agent runs.
**Requirements**: TBD
**Depends on:** Phase 21
**Plans:** 11/11 plans executed; standalone JSONL-audited Rust/CodeLLDB evidence and mandatory orchestrator terminal UAT are complete
**Status:** COMPLETE - `darwin-arm64` CodeLLDB provisioning and descriptor implementation are accepted using only the verified official asset and proved loopback-only invocation; bundling, mirroring, offline redistribution, and uninspected platform assets remain out of scope.

Plans:

- [x] 22-01-PLAN.md — Verified the official macOS arm64 VSIX, scoped direct-source local caching, and proved standalone loopback-only Rust DAP behavior.
- [x] 22-02-PLAN.md — Added gate-approved full CodeLLDB VSIX lazy provisioning plus synthetic archive and cold/warm concurrency tests.
- [x] 22-03-PLAN.md — Registered the verified built-in descriptor and preserved zero-download discovery behavior.
- [x] 22-04-PLAN.md — Exposed CodeLLDB setup/prewarm/status and maintainer checksum regeneration.
- [x] 22-05-PLAN.md — Extended typed-error, architecture-security, and packaged-cache regression gates.
- [x] 22-06-PLAN.md — Supported explicit `lldb` Rust configuration while rejecting raw Cargo and `.rs` inference.
- [x] 22-07-PLAN.md — Proved owned real-Rust launch/config/inspection and safe attach behavior under unchanged policy.
- [x] 22-08-PLAN.md — Published validated Rust/CodeLLDB setup and fresh-agent workflow guidance.
- [x] 22-09-PLAN.md — Screened public Cargo surfaces and recorded isolated delegated real-project attempts plus clean reruns for audit.
- [x] 22-10-PLAN.md — Audited standalone fresh-agent JSONL transcripts, retained blocked/preliminary history, and classified nonblocking hardening follow-ups.
- [x] 22-11-PLAN.md — Ran final verification, fixed the reproduced long Unix socket path blocker, and captured mandatory orchestrator hand-driven UAT smoke for Sequences A, B, and provisioning-applicable C1-C6.
