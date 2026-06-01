---
phase: 22
status: draft-for-planning
approved_language: Rust
approved_adapter: CodeLLDB v1.12.2
scratch_root: tmp/phase-22-fresh-agent-runs
---

# Phase 22 Rust / CodeLLDB Scenario Contract

## Universal Report Contract

Every fresh-agent or public-project debugging attempt must report exactly:

```text
result: pass|fail|blocked
what_worked: ...
what_didnt: ...
agent_confusion: ...
dap_cli_ergonomic_issues: ...
evidence: ...
cleanup_verified: true|false
```

Every executed fresh-agent scenario must then be audited against its Copilot CLI JSONL transcript. A report without an identified transcript is `blocked`, even when its prose claims success.

## Safety and Gate Scenarios

### R-00 - Artifact provenance and extraction gate

- Inspect pinned CodeLLDB `v1.12.2` release assets, checksums, VSIX contents, licenses/notices, extracted adapter executable/library/runtime layout, and platform support before implementing provisioning.
- Write the evidence to phase research/results; do not run external repository code.

### R-01 - Direct adapter and loopback transport gate

- In phase-owned scratch, run only the approved extracted adapter against a minimal repo-owned Rust target and inspect its listening socket while it waits for DAP connection.
- Required result: the adapter accepts direct DAP use outside VS Code and listens only on loopback, or exposes a proven explicit loopback bind argument. A wildcard bind is a blocker.

## Repo-Owned Implementation Scenarios

### R-02 - Lazy setup and readiness

- From an isolated adapter cache, prove interactive/non-interactive provisioning or a typed bounded failure, version/readiness, checksum/install shape, and cleanup of temporary artifacts.

### R-03 - Rust debug binary launch

- Build a minimal owned Cargo binary with debug symbols, launch through `codelldb` stopped early enough to install a real source breakpoint, then capture stopped state, top stack, locals/evaluate evidence, resume, and cleanup.

### R-04 - VS Code `type: "lldb"` named configuration

- Use a scratch `.vscode/launch.json` that targets a repo-owned compiled Rust binary without `cargo`. Prove config discovery, adapter mapping, preserved native Rust fields, breakpoint/inspection, and teardown.

### R-05 - Raw Cargo boundary diagnostics

- Pass raw CodeLLDB configurations with `cargo` alone and with both `cargo` and `program` through the CLI configuration-routing path. Both must produce the same typed explicit-built-binary recovery before adapter provisioning or native DAP forwarding; no translated Cargo behavior is in scope.

### R-06 - Owned local attach lifecycle

- Attempt PID attach only to a phase-owned long-running Rust process and only when the selected platform supports safe validation without changing host security policy. Prove disconnect survival and explicit final target cleanup, or record a platform-policy blocker.

### R-07 - Negative diagnostics

- Safely force absent/unsupported/corrupt adapter asset behavior and any invalid Rust target/config diagnostic required by implementation; verify actionable structured recovery without unsafe workaround.

## Final Orchestrator UAT Smoke

### R-UAT - Published CLI proof for provisioning-applicable changes

- Phase 22 changes `src/adapters/provision/**` and `src/cli/commands/setupAdapters.ts`, so `dev/smoke/hand-driven-smoke.md` Sequence C applies in addition to the always-required Sequences A and B.
- During `/gsd-verify-work 22`, the orchestrator itself runs Sequences A and B and every Sequence C step C1-C6 in a real terminal, then writes verbatim captured output and passing results to `22-UAT.md` under `## Hand-Driven CLI Smoke`.
- Tests, smoke scripts, public-project attempts, and subagent reports are not substitutes. If A, B, or any C1-C6 output does not match its documented signal, record a gap and rerun after closure; do not set UAT `status: complete` until all applicable evidence passes.

## External Project Scenario Classes

Public candidate discovery starts only after R-00 through R-04 pass. Before executing any clone contents, create `22-EXTERNAL-PROJECT-CANDIDATES.md` and screen README, `Cargo.toml`, lockfile, `build.rs`, proc-macro members, `.cargo/`, task/build files, `.vscode/launch.json`, devcontainer files, and setup instructions.

### R-EXT-01 - Screened CLI crate binary

- A maintained CLI crate with a local-only invocation, built and debugged without reaching external services.

### R-EXT-02 - Screened pure library test or example

- A maintained crate with a bounded local test/example and no unsafe build script or proc-macro execution surface selected for validation.

### R-EXT-03 - Existing `type: "lldb"` configuration where safely runnable

- Prefer a screened workspace with a real CodeLLDB configuration; if no safe candidate exists, record the search and use the repo-owned named-config proof instead of manufacturing external evidence.

## Fresh-Agent Prompt Requirements

Each prompt specifies the exact skill/reference files to read first, scenario scratch root, isolated `DAP_CLI_HOME` and `DAP_CLI_ADAPTERS_DIR`, target fixture or screened SHA-pinned clone, safety limits, required stopped/inspection/cleanup evidence, and the report contract above.

## Final Bounded Prompt Matrix

### Common Native Execution Envelope

For `FA-R02` through `FA-R06`, use a fresh writable root `tmp/phase-22-fresh-agent-runs/<scenario-id>` with short children `h`, `c`, `d`, and `a`. Seed only the verified official local payload `/Users/roblou/.dap-cli/adapters/codelldb` to `<root>/a/codelldb`. All Cargo and dap-cli invocations use:

```bash
/usr/bin/env -i HOME=<root>/h CARGO_HOME=<root>/c DAP_CLI_HOME=<root>/d DAP_CLI_ADAPTERS_DIR=<root>/a CARGO_NET_OFFLINE=true RUSTC=/Users/roblou/.rustup/toolchains/stable-aarch64-apple-darwin/bin/rustc PATH=/Users/roblou/.rustup/toolchains/stable-aarch64-apple-darwin/bin:/Users/roblou/.local/state/fnm_multishells/35295_1780269958132/bin:/usr/bin:/bin
```

Cargo is invoked only as `/Users/roblou/.rustup/toolchains/stable-aarch64-apple-darwin/bin/cargo`; dap-cli is invoked only as `/Users/roblou/.local/state/fnm_multishells/35295_1780269958132/bin/node /Users/roblou/code/dap-cli/dist/index.js`. Agents must not install, download, fetch, use credentials/services, change security policy, attach to anything not explicitly started by that scenario, write tracked files, or commit. CodeLLDB loopback traffic and scenario-owned scratch output are permitted. Every report uses the Universal Report Contract plus `scenario_id`, `subagent_id`, exact commands, and isolation posture.

### FA-R02 - Seeded Readiness / Setup Status

- Read first: `dap-cli/skills/dap-cli/SKILL.md`, `dap-cli/skills/dap-cli/references/rust-codelldb.md`, and this scenario file.
- Root: `tmp/phase-22-fresh-agent-runs/r02`; use the common envelope and the seeded verified adapter only.
- Exact product command: `dap-cli setup-adapters --adapter codelldb --yes`; it must recognize or reuse the isolated full runtime without downloading. No Rust/public code executes.
- Evidence: returned adapter/version/cache status and absence of network/provision fallback; read-only readiness inventory if useful; cleanup of any controller only if one unexpectedly starts.

### FA-R03 - Owned Explicit Rust Binary Launch

- Read first: the Rust reference and this scenario file. Copy only `tests/fixtures/simple-rust-app` into `<root>/fixture`.
- Root: `tmp/phase-22-fresh-agent-runs/r03`; common envelope.
- Exact build/debug surface: offline Cargo debug-build of `<root>/fixture`; `dap-cli start`; `dap-cli launch --adapter codelldb --type lldb --name fa-r03 --json '{"program":"<root>/fixture/target/debug/simple-rust-app","cwd":"<root>/fixture","sourceLanguages":["rust"],"stopOnEntry":true}'`; set breakpoint at `<root>/fixture/src/main.rs:9`; continue/status/stack/scopes/variables or evaluate; close and stop-controller.
- Evidence: stopped owned frame, `answer` state containing `42`, and no remaining controller/session/target.

### FA-R04 - Owned Named `type: "lldb"` Configuration

- Read first: the Rust reference and this scenario file. Copy only `tests/fixtures/simple-rust-app` into `<root>/fixture`; create `<root>/workspace/.vscode/launch.json` containing one named `type: "lldb"`, `request: "launch"` configuration targeting the compiled explicit fixture executable, with `cwd` and `sourceLanguages: ["rust"]` and no `cargo` property.
- Root: `tmp/phase-22-fresh-agent-runs/r04`; common envelope.
- Exact build/debug surface: offline Cargo debug-build of `<root>/fixture`; `dap-cli start`; `dap-cli launch --workspace <root>/workspace --config "Rust named launch" --name fa-r04`; breakpoint at `<root>/fixture/src/main.rs:9`; continue/status/stack/variables; close and stop-controller.
- Evidence: named configuration routes through CodeLLDB to the owned source stop with `answer` containing `42`, plus cleanup.

### FA-R05-R07 - Negative Cargo, Raw `.rs`, And Platform Diagnostics

- Read first: the Rust reference and this scenario file. No target is built or executed.
- Root: `tmp/phase-22-fresh-agent-runs/r05`; isolate `HOME`, `DAP_CLI_HOME`, and an empty `DAP_CLI_ADAPTERS_DIR`; do not seed an adapter and do not start a controller.
- Exact command surfaces: create a scratch `.vscode/launch.json` with `type: "lldb"` configurations named `Cargo only` and `Cargo plus program`, both carrying a `cargo` object and the latter a nonexecuted dummy `program`; issue `dap-cli launch --workspace <workspace> --config <name>` for both and require typed `codelldb_cargo_config_unsupported`. Issue `dap-cli launch --program <root>/not-launchable.rs --stop-on-entry` and require adapter/inference rejection before execution. Issue `DAP_CLI_PROVISION_CODELLDB_PLATFORM_OVERRIDE=linux_x64 dap-cli setup-adapters --adapter codelldb --yes` and require `provision_arch_unsupported` without download.
- Evidence: typed diagnostics and recovery guidance; verify no controller, adapter payload, Cargo build, or target process was created.

### FA-R06 - Owned Local PID Attach

- Read first: the Rust reference and this scenario file. Copy only `tests/fixtures/simple-rust-attach` into `<root>/fixture`.
- Root: `tmp/phase-22-fresh-agent-runs/r06`; common envelope.
- Exact build/debug surface: offline Cargo debug-build; intentionally start only `<root>/fixture/target/debug/simple-rust-attach`; `dap-cli start`; `dap-cli attach --adapter codelldb --type lldb --name fa-r06 --json '{"pid":<owned-pid>}'`; set breakpoint at `<root>/fixture/src/main.rs:10`, continue/poll, inspect `answer` containing `15`; disconnect/close without debugger termination where supported; explicitly terminate and await only the owned target; stop controller.
- Evidence: PID ownership, stopped frame/state or policy blocker, disconnect survival where attached, and explicit target/controller cleanup. Never adjust host security policy.

### FA-EXT-01 And FA-EXT-02 - Already Delegated Screened Public Attempts

- Inputs: `EXT-01-R1-minigrep` and `EXT-02-R1-itoa` in `22-EXTERNAL-PROJECT-RESULTS.md`, already run by fresh subagents only after the committed screening checkpoint. Do not execute them again in Task 1.
- Audit requirement: treat their behavioral `result: pass` claims as pending until their named JSONL files prove SHA checks, isolated offline selected-only commands, public stopped frames/variables, and cleanup. Also audit the retained preliminary contaminated/blocked records.

### FA-DOC-01 - Docs-Only Novice Recovery

- Read first only: `dap-cli/skills/dap-cli/SKILL.md`, `dap-cli/skills/dap-cli/references/rust-codelldb.md`, and `docs/adapter-setup.md`.
- Root/state: no runtime state or adapter directory is created; no command is executed. In a text report, propose the documented commands for prewarming CodeLLDB, building an owned Rust binary, launching its explicit executable, inspecting a breakpoint, and cleanup.
- Evidence: report must reject raw `.rs` programs, raw VS Code `cargo` objects, unsupported platform assets, unowned attach, and unscreened public Cargo execution; `cleanup_verified: true` means the agent confirms it created no process or scratch state.