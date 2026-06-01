# Phase 22 Adapter Selection: Rust / CodeLLDB

## Approved Decision

status: approved
approved_language: Rust
approved_adapter: CodeLLDB (`vadimcn.vscode-lldb`, baseline `v1.12.2`)
approved_by: Rob Lourens
approved_at: 2026-05-28T04:37:33Z
source_artifact: `.planning/language-onboarding/20260528-rust-codelldb/ADAPTER-SELECTION.md`

| Contract | Decision |
| --- | --- |
| Runtime/language | Rust only for this onboarding; C++ remains outside scope. |
| dap-cli adapter id | `codelldb` |
| VS Code launch type | `lldb` |
| Version baseline | Pin CodeLLDB `v1.12.2` platform VSIX assets only after checksum and bundled-license/provenance review. |
| Process/transport contract | Adapter-owned local TCP DAP process using CodeLLDB's direct adapter launcher, only if a spike proves its listener is loopback-only or can be explicitly restricted to `127.0.0.1`. |
| Provisioning contract | Consent-gated Phase 21 lazy provisioning into `DAP_CLI_ADAPTERS_DIR/codelldb/`, checksum verified and atomically installed; retain explicit local override/readiness handling only if it has a testable contract. |

## Rationale

CodeLLDB is the approved next adapter because it is Rust-oriented, established in VS Code as `type: "lldb"`, actively released, widely used, and appears compatible with dap-cli's local-server adapter shape. LLVM `lldb-dap` remains the named runner-up: it has stronger official LLVM provenance but less Rust/Cargo-oriented project ergonomics.

CodeLLDB is not Microsoft-owned. The approval consciously selects its Rust workflow fit over Microsoft-owned candidates whose standalone provisioning or project-system boundaries are less suitable for this CLI.

## Pre-Implementation Gates

These are blockers, not documentation follow-ups:

1. Extract an approved CodeLLDB `v1.12.2` VSIX only in phase-owned scratch and prove that its adapter can complete a tiny Rust DAP flow outside the VS Code extension host.
2. Prove that adapter startup binds only to loopback, or find a supported startup argument that enforces `127.0.0.1`; do not ship a server descriptor that exposes a wildcard listener.
3. Record the VSIX contents, upstream license/notices and bundled native/runtime assets relevant to caching the archive, plus SHA-256 values for every supported platform asset before implementing download provisioning.
4. Prove breakpoint, stopped state, stack, scopes/variables, evaluate or documented fallback, resume, and cleanup against a repo-owned Rust fixture before searching for public project candidates.

## Safety Boundaries

- Public Rust repositories are untrusted; screen `Cargo.toml`, `Cargo.lock`, `build.rs`, proc-macro/workspace members, task files, launch configs, and setup guidance before build/test/debug commands.
- Use phase-owned shallow clones, isolated adapter cache/home directories, and no credentials. Separate dependency/tool preparation from network-disabled debug execution wherever feasible.
- A container is preferred for public-project execution when the debuggee and CodeLLDB can share one contained filesystem/PID namespace without privileged host mounts. Attach targets must always be processes owned by the scenario.