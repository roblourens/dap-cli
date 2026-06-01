# Phase 22: Rust / CodeLLDB Built-In Onboarding - Context

**Gathered:** 2026-05-28
**Status:** Ready for planning
**Source:** PRD Express Path (`22-LANGUAGE-ONBOARDING-PRD.md`)

<domain>
## Phase Boundary

This phase delivers Rust-oriented debugging through approved CodeLLDB `v1.12.2` as dap-cli's next built-in adapter. It begins with blocking direct-adapter, loopback-listener, and VSIX provenance/license/checksum evidence; only after those gates pass does it extend lazy provisioning, registry and launch-config support, Rust fixtures, real adapter verification, docs, screened public-crate validation, transcript-audited fresh-agent hardening, and final hand-driven CLI smoke closure including provisioning-applicable Sequence C steps C1-C6.

The phase does not add generic native/C++ support, remote or privileged attach, or an assumption that a Rust source file is directly launchable.

</domain>

<decisions>
## Implementation Decisions

### Adapter Identity and Scope

- Rust and CodeLLDB (`vadimcn.vscode-lldb`, baseline `v1.12.2`) are explicitly approved by Rob Lourens; the built-in adapter id is `codelldb` and the VS Code launch-config type is `lldb`.
- CodeLLDB support is scoped to documented Rust flows for this phase even though the upstream adapter can debug other native languages.
- LLVM `lldb-dap` is the recorded runner-up; if a blocking CodeLLDB transport or provenance gate fails, work stops for an explicit selection decision rather than silently substituting an adapter.

### Blocking Transport and Supply-Chain Gates

- Before product implementation is committed, run the approved CodeLLDB artifact directly in phase-owned scratch and prove usable DAP operation against a minimal owned Rust target outside a VS Code extension host.
- A built-in server descriptor is allowed only after evidence proves the adapter listens on loopback alone, or a supported argument explicitly forces `127.0.0.1`; wildcard exposure blocks implementation.
- Before implementing download provisioning, record the platform VSIX asset names and SHA-256 values, extraction/entrypoint layout, upstream notices/licenses and relevant bundled runtime/native assets, and a clear caching/provenance conclusion.

### Provisioning and Adapter Integration

- Extend the Phase 21 lazy-provisioning model: explicit consent, `DAP_CLI_ADAPTERS_DIR`, version-keyed marker, safe extraction, checksum validation, per-adapter lock, atomic installation, proxy/network/error shaping, setup-adapters reporting, synthetic archive tests, and packaging validation all remain required.
- Add a built-in `codelldb` descriptor and registry/provision dispatch only after gates pass; prefer existing adapter abstractions and structured diagnostics over new CLI flags.
- Support only a validated platform/asset matrix. A CodeLLDB-specific typed diagnostic is acceptable only if existing `provision_*` and adapter usage failures cannot accurately describe the condition.

### Configuration and Rust Behavior

- Map VS Code `type: "lldb"` to `codelldb` and preserve native CodeLLDB Rust fields that direct-adapter verification demonstrates are meaningful, including `program`, `cwd`, `args`, `env`, `sourceLanguages`, and source-related settings where applicable. Reject every configuration containing extension-owned `cargo`, including `cargo` plus `program`, with typed explicit-built-binary recovery before native DAP forwarding.
- Do not add `.rs` program inference by analogy with `.go`; a Rust source file is not an executable launch target. Rust launch uses an explicit built binary or a named configuration targeting that binary, without raw `cargo` input.
- Repository fixtures and real-adapter tests must prove a real breakpoint stop, state inspection through stack and scopes/variables or evaluate with documented fallback, resume/termination cleanup, named launch configuration, and owned attach only when platform policy permits it safely.

### External and Agent Verification

- Search for and screen public Rust candidates only after repo-owned gate/fixture behavior succeeds. Candidate records precede any untrusted execution and cover Cargo/build-script/proc-macro/task/config risks.
- Real public-project debug attempts run through fresh subagents in phase-owned scratch and isolated cache/home environments; containerized execution is preferred where practical, with an explicit inspected host fallback otherwise.
- The orchestrator audits corresponding Copilot CLI JSONL transcripts, records actual commands/wrong turns/cleanup, fixes blocking product or docs gaps, and appends rerun evidence without erasing original outcomes.
- Because Phase 22 changes `src/adapters/provision/**` and `src/cli/commands/setupAdapters.ts`, `/gsd-verify-work` is incomplete until the orchestrator personally executes hand-driven smoke Sequences A and B plus provisioning-applicable Sequence C steps C1-C6 and records verbatim passing output in `22-UAT.md`; tests and subagent evidence cannot substitute for this live terminal proof, and UAT cannot reach `status: complete` without all three sequence records passing.

### the agent's Discretion

- Exact module boundaries inside existing descriptor/provisioning/test helpers, provided they follow Phase 21 structure and preserve typed safety behavior.
- Exact Rust fixture contents, breakpoint lines, and screened public repositories, subject to the safety/coverage constraints.
- Whether safe owned PID attach is implemented as a passing automated scenario or recorded as a platform-policy blocker, based on real CodeLLDB evidence.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Approved Selection and Requirements

- `.planning/phases/22-onboard-rust-debugging-through-codelldb-as-a-built-in-adapte/22-ADAPTER-SELECTION.md` - approved adapter decision, process/provisioning contract, and blocker gates.
- `.planning/phases/22-onboard-rust-debugging-through-codelldb-as-a-built-in-adapte/22-LANGUAGE-ONBOARDING-PRD.md` - locked scope, acceptance bar, and safety requirements.
- `.planning/phases/22-onboard-rust-debugging-through-codelldb-as-a-built-in-adapte/22-SCENARIOS.md` - scenario/report/transcript audit contract.
- `.planning/language-onboarding/20260528-rust-codelldb/ADAPTER-SELECTION.md` - original approval evidence and research-informed recommendation.

### Repository Workflow and Precedent

- `.github/copilot-instructions.md` - GSD workflow and mandatory orchestrator hand-smoke rule.
- `.planning/PROJECT.md` - phase branching/squash workflow and project constraints.
- `.planning/phases/20-i-d-like-to-find-another-runtime-that-we-can-debug-we-should/20-ADAPTER-SELECTION.md` - Go/Delve adapter precedent.
- `.planning/phases/20-i-d-like-to-find-another-runtime-that-we-can-debug-we-should/20-SCENARIOS.md` - fresh-agent scenario precedent.
- `.planning/phases/20-i-d-like-to-find-another-runtime-that-we-can-debug-we-should/20-EXTERNAL-PROJECT-CANDIDATES.md` - external screening ledger precedent.
- `.planning/phases/20-i-d-like-to-find-another-runtime-that-we-can-debug-we-should/20-EXTERNAL-PROJECT-RESULTS.md` - exact evidence ledger precedent.
- `.planning/phases/20-i-d-like-to-find-another-runtime-that-we-can-debug-we-should/20-RESULTS.md` - rerun evidence precedent.
- `.planning/phases/20-i-d-like-to-find-another-runtime-that-we-can-debug-we-should/20-HARDENING-GAPS.md` - classification and closure precedent.
- `.planning/phases/20-i-d-like-to-find-another-runtime-that-we-can-debug-we-should/20-UAT.md` - UAT and hand-smoke transcript precedent.

### Implementation Surfaces

- `src/adapters/builtins/delve.ts`, `src/adapters/provision/delve.ts`, `src/adapters/provision/index.ts`, and `src/adapters/provision/checksums.ts` - nearest built-in/server and lazy-provisioning analogs.
- `src/adapters/registry.ts`, `src/config/launchConfig.ts`, and `src/config/programInference.ts` - adapter discovery and configuration contracts.
- `docs/adapter-setup.md` and `dap-cli/skills/dap-cli/references/go-delve.md` - documentation shape to extend for Rust/CodeLLDB.
- `tests/integration/delveAdapter.test.ts`, `tests/config/`, and `tests/adapters/provision/` - closest verification surfaces.

</canonical_refs>

<specifics>
## Specific Ideas

- Treat the direct CodeLLDB launcher and listener inspection as a first execution plan whose pass/fail result controls later waves.
- Keep networked preparation (approved adapter/dependency fetches) separate from external-project debug execution so public crate runs can be network-disabled where feasible.
- Prefer inspecting paused locals through standard DAP scopes/variables when an LLDB expression path is inconsistent; document real behavior rather than assuming parity with Delve.

</specifics>

<deferred>
## Deferred Ideas

- Generic C/C++ or LLVM `lldb-dap` support.
- Remote CodeLLDB transports or permission-escalating attach workarounds.
- Automatic launch inference from `.rs` source files.
- New first-class CLI flags unless real CodeLLDB operation demonstrates a stable cross-project need not expressible through launch JSON.

</deferred>

---

*Phase: 22-onboard-rust-debugging-through-codelldb-as-a-built-in-adapte*
*Context gathered: 2026-05-28 via PRD Express Path*