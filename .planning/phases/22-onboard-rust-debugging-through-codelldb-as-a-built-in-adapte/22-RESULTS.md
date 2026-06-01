---
phase: 22
plan: 10
status: complete
approved_language: Rust
approved_adapter: CodeLLDB v1.12.2
recorded: 2026-06-01
---

# Phase 22 Transcript-Audited Results

## Acceptance Basis

The accepted evidence in this ledger comes from standalone Copilot CLI JSONL transcripts under `~/.copilot/session-state/`, executed after the Phase 22 implementation and scenario contract were in place. Acceptance was based on actual tool-execution events and outputs, not on matching prompt text, reference-file content, or a scenario's concluding prose alone.

All runtime attempts retained the approved product boundary: official CodeLLDB `v1.12.2` `codelldb-darwin-arm64.vsix` payload already present in an isolated local cache; Rust debug binaries compiled offline; loopback-only dap-cli/controller communication; no public-project attach, service start, privilege change, secret access, package fetch, or network build activity. The verified CodeLLDB scope remains `darwin_arm64` only.

## Accepted Standalone Evidence

### FA-DOC-01-CLI - Agent Documentation Discoverability

scenario_id: `FA-DOC-01-CLI`
subagent_id: `copilot-cli/FA-DOC-01-CLI`
transcript_file: `/Users/roblou/.copilot/session-state/151e960e-ab7d-4537-9aae-b20dc59b42d1/events.jsonl`
result: pass
cleanup_verified: true

transcript_audit: JSONL tool events show read-only discovery and reads of `dap-cli/skills/dap-cli/SKILL.md`, `dap-cli/skills/dap-cli/references/rust-codelldb.md`, and `docs/adapter-setup.md`. No `dap-cli`, Cargo, target-program, controller, or file-mutation command executed.

actual_commands: Read-only file discovery and views only; no runtime command was authorized for this scenario.

evidence: The final report accurately identified `setup-adapters --adapter codelldb --yes`, build-first explicit executable launch, breakpoint/inspection/cleanup workflow, named `type: "lldb"` support, and the rejected raw `.rs`, CodeLLDB `cargo`, unsupported-platform, unowned-attach, and unscreened-public-build surfaces.

findings: Documentation was discoverable and sufficient for the bounded Rust workflow. The agent performed harmless read-only path discovery before locating the Rust reference file; no safety or execution boundary was affected.

### FA-R02-CLI-R2 - Isolated Readiness With Cached Runtime

scenario_id: `FA-R02-CLI-R2`
subagent_id: `copilot-cli/FA-R02-CLI-R2`
transcript_file: `/Users/roblou/.copilot/session-state/4f4a53b1-c6c7-49b5-9c37-a4fe49d53fa0/events.jsonl`
result: pass
cleanup_verified: true

transcript_audit: This is the accepted rerun of `FA-R02-CLI` after two blocked standalone-runner attempts. JSONL command events prove the workspace-local isolated adapter seed was present and that the product setup command itself ran under `--allow-all`.

actual_commands:

```bash
find tmp/phase-22-fresh-agent-runs/r02-cli/a/codelldb -maxdepth 3 -mindepth 1 -print | head -80
/usr/bin/env -i HOME="$PWD/tmp/phase-22-fresh-agent-runs/r02-cli/h" CARGO_HOME="$PWD/tmp/phase-22-fresh-agent-runs/r02-cli/c" DAP_CLI_HOME="$PWD/tmp/phase-22-fresh-agent-runs/r02-cli/d" DAP_CLI_ADAPTERS_DIR="$PWD/tmp/phase-22-fresh-agent-runs/r02-cli/a" CARGO_NET_OFFLINE=true PATH="/Users/roblou/.local/state/fnm_multishells/35295_1780269958132/bin:/usr/bin:/bin" node "$PWD/dist/index.js" setup-adapters --adapter codelldb --yes
```

evidence: Setup returned `ok: true`, `id: "codelldb"`, `version: "v1.12.2"`, `status: "cached"`, and an isolated install root under `tmp/phase-22-fresh-agent-runs/r02-cli/a/codelldb`, with warning text that it was already cached. Post-command evidence showed no controller state in isolated `DAP_CLI_HOME`, no CodeLLDB/controller/Rust execution, and only the pre-existing unrelated Phase 20 tracked modification.

findings: The readiness product behavior passes. The earlier cache-access and standalone shell-permission blocks are preserved below and classified in `22-HARDENING-GAPS.md`.

### FA-R03-CLI - Explicit Compiled Rust Launch

scenario_id: `FA-R03-CLI`
subagent_id: `copilot-cli/FA-R03-CLI`
transcript_file: `/Users/roblou/.copilot/session-state/12f27c5f-5911-435b-9934-ac9f6a9078b7/events.jsonl`
result: pass
cleanup_verified: true

transcript_audit: JSONL events prove the agent copied the repository-owned fixture to its isolated scratch root, built it offline, launched the explicit compiled executable through built-in `codelldb`/`lldb`, stopped on the intended source breakpoint, inspected local state, and shut down its named session and controller.

actual_commands: Offline `cargo build`; isolated `node dist/index.js start`; `launch --adapter codelldb --type lldb --name fa-r03-cli` with explicit compiled `program`; `breakpoints set` for `fixture/src/main.rs:9`; `continue`; polling/stack/scopes/variables; `close fa-r03-cli`; `stop-controller`.

evidence: The verified breakpoint stopped in `simple_rust_app::main` at source line `9`; local variables showed `left = 19`, `right = 23`, and `answer = 42`. Cleanup evidence showed no remaining adapter/controller PID and no controller socket.

findings: After the stop, the agent first queried an incorrect variables reference (`1003`) and received an empty result, then used the Local scope reference (`1018`) and obtained the required state. Real CodeLLDB stop status also reported `stoppedThreadIds: []`; thread/frame inspection still succeeded.

### FA-R04-CLI - Named `lldb` Configuration Launch

scenario_id: `FA-R04-CLI`
subagent_id: `copilot-cli/FA-R04-CLI`
transcript_file: `/Users/roblou/.copilot/session-state/f2a47707-fcc8-487f-be12-6f321a8c8843/events.jsonl`
result: pass
cleanup_verified: true

transcript_audit: JSONL events prove an isolated scratch `.vscode/launch.json` was created with `type: "lldb"` and an explicit compiled Rust `program`, then selected through `launch --workspace ... --config "Rust named launch"` and debugged through the real CodeLLDB path.

actual_commands: Offline `cargo build`; isolated `start`; named-config `launch`; `breakpoints set` at `fixture/src/main.rs:9`; `continue`; `stack` followed by status/event polling and retried inspection; `close fa-r04-cli`; `stop-controller`.

evidence: Breakpoint resolution was verified at line `9`; after polling made the stop visible, stack and local-variable inspection proved `answer = 42`. Cleanup returned the controller to a stopped/no-socket state.

findings: The agent attempted `stack` immediately after `continue` and received typed `thread_not_paused` before polling for the asynchronous breakpoint stop. It recovered using the documented poll-before-inspect loop. Stop status again exposed `stoppedThreadIds: []` despite a recoverable stopped event/thread.

### FA-R05-R07-CLI - Rejected Surfaces And Unsupported Platform

scenario_id: `FA-R05-R07-CLI`
subagent_id: `copilot-cli/FA-R05-R07-CLI`
transcript_file: `/Users/roblou/.copilot/session-state/9e3a3564-0773-4f07-a2e6-b0e071859ac0/events.jsonl`
result: pass
cleanup_verified: true

transcript_audit: JSONL tool events prove only a scratch launch configuration was created and four bounded negative product commands were run. No Rust target was built or run, and unsupported setup produced no adapter/controller/cache residue.

actual_commands: Named launch using a `cargo`-only CodeLLDB configuration; named launch using `cargo` plus `program`; direct launch of a raw `.rs` source path; `setup-adapters --adapter codelldb --yes` under `DAP_CLI_PROVISION_CODELLDB_PLATFORM_OVERRIDE=linux_x64`.

evidence: Both `cargo` configurations exited with usage code `2` and error code `codelldb_cargo_config_unsupported`; the raw `.rs` command exited with code `2` and `adapter_inference_failed`; unsupported setup exited with code `2`, top-level `provision_setup_failed`, and nested adapter error `provision_arch_unsupported`. Post-run inventory showed an empty isolated adapter root and no target/controller payload.

findings: Negative ownership behavior is correct. The top-level setup wrapper makes unsupported-platform diagnosis one level less direct than the nested product error.

### FA-R06-CLI - Owned Local PID Attach Lifecycle

scenario_id: `FA-R06-CLI`
subagent_id: `copilot-cli/FA-R06-CLI`
transcript_file: `/Users/roblou/.copilot/session-state/45f3a816-c717-43f6-a208-a246a983c49e/events.jsonl`
result: pass
cleanup_verified: true

transcript_audit: JSONL events prove the agent launched only its repository-owned scratch fixture target, identified that owned PID (`11283`), attached CodeLLDB only to that PID, inspected the source stop, disconnected without terminating the debuggee, verified it remained alive, and then explicitly killed only its owned process.

actual_commands: Offline fixture build; asynchronous owned fixture execution; isolated `start`; `attach --adapter codelldb --type lldb --name fa-r06-cli --json '{"pid":11283}'`; `breakpoints set` at `fixture/src/main.rs:10`; `continue`; stop/stack/evaluation inspection; `request disconnect --json '{"terminateDebuggee":false}'`; owned `kill 11283`; `stop-controller`.

evidence: The stopped stack frame was `simple_rust_attach::main` at line `10`, evaluation showed `answer = 15`, and the target remained alive after nonterminating disconnect. It exited only after explicit owned cleanup, with the shell later reporting exit code `143`; controller cleanup succeeded.

findings: The agent briefly looked for the Rust reference at a wrong in-repository path and consulted command help before using the supported attach path. No unowned process was attached or signaled. Stop status again reported `stoppedThreadIds: []` while stopped-frame recovery worked.

### EXT-01-R2-CLI-minigrep - Screened Public CLI Binary

scenario_id: `EXT-01-R2-CLI-minigrep`
subagent_id: `copilot-cli/EXT-01-R2-CLI-minigrep`
transcript_file: `/Users/roblou/.copilot/session-state/6078e37a-6728-4c3d-b495-0e6bfd576061/events.jsonl`
result: pass
cleanup_verified: true

transcript_audit: JSONL events prove the agent first read the authorization/results ledgers, used selected Rust Book checkout SHA `05d114287b7d6f6c9253d5242540f00fbd6172ab`, built only the authorized `minigrep` binary offline in the isolated environment, and launched only that explicit executable through cached CodeLLDB.

actual_commands: `cargo build --locked --offline --bin minigrep`; isolated `start`; explicit `launch --adapter codelldb --type lldb`; `breakpoints set` at public `src/lib.rs:4`; `continue`; status/stack/scopes/variables; `close`; `stop-controller`.

evidence: The verified public-source breakpoint stopped in `minigrep::search` at `src/lib.rs:4`; inspected local `query` was `"duct"`. The named debug session closed, controller stopped, and its socket was absent after cleanup.

findings: `status.stoppedThreadIds` was `[]` at the real CodeLLDB stop; subsequent thread/stack/variable inspection supplied the necessary evidence without broadening execution.

### EXT-02-R2-CLI-itoa - Screened Public Library Through Owned Probe

scenario_id: `EXT-02-R2-CLI-itoa`
subagent_id: `copilot-cli/EXT-02-R2-CLI-itoa`
transcript_file: `/Users/roblou/.copilot/session-state/5c7e679e-1d1c-4f87-af8f-f98b9061bc86/events.jsonl`
result: pass
cleanup_verified: true

transcript_audit: JSONL events prove the agent used selected `itoa` SHA `af77385d0daf4d0e949e81f2588be2e44f69f086`, created only the authorized scratch-owned probe with a local path dependency on that checkout, compiled it offline, and launched only the owned probe executable.

actual_commands: Write scratch-only probe `Cargo.toml` and `src/main.rs`; `cargo build --offline`; isolated `start`; explicit CodeLLDB launch of `itoa_probe`; `breakpoints set` in public `itoa/src/lib.rs` at requested line `106`; `continue`; status poll/stack/scopes/variables; `close external-it-cli`; `stop-controller`.

evidence: The breakpoint request verified and resolved to executable public source line `107`; after polling, the stop was in `itoa::Buffer::format`, with local `i = 128`. Cleanup returned `cleanup_socket=absent`, and tracked status still contained only the unrelated Phase 20 modification.

findings: Status immediately after `continue` still showed running and required the expected later poll. `stoppedThreadIds` was `[]` at the eventual stop. Requested line `106` resolving to executable line `107` is the already-documented candidate-ledger correction, not an expanded scope.

## Blocked Standalone Attempts Retained

### FA-R02-CLI - Initial User-Cache Seed Attempt

scenario_id: `FA-R02-CLI`
subagent_id: `copilot-cli/FA-R02-CLI`
transcript_file: `/Users/roblou/.copilot/session-state/4d6bef05-c171-4353-9cf3-088bc1334aa8/events.jsonl`
result: blocked
cleanup_verified: true

transcript_audit: The JSONL records required doc reads and scratch-directory creation, but attempts to read or copy `/Users/roblou/.dap-cli/adapters/codelldb` were denied by the standalone CLI permission model. The isolated `setup-adapters` product command never ran.

actual_commands: Read required docs; `mkdir -p tmp/phase-22-fresh-agent-runs/r02-cli/{h,c,d,a}`; read-only status/inventory checks. Attempts containing the user-cache path were denied before execution.

evidence: Permission completed with `denied-no-approval-rule-and-could-not-request-from-user`; final scratch inventory contained only empty `a`, `c`, `d`, and `h` directories; worktree status showed only the pre-existing Phase 20 modification.

disposition: Superseded for product acceptance by `FA-R02-CLI-R2`; retained as a runner/environment blocker.

### FA-R02-CLI-R1 - Preseeded Cache But Shell Permission Denied

scenario_id: `FA-R02-CLI-R1`
subagent_id: `copilot-cli/FA-R02-CLI-R1`
transcript_file: `/Users/roblou/.copilot/session-state/116c3d9b-aa36-40da-8d17-37018d93ba8a/events.jsonl`
result: blocked
cleanup_verified: true

transcript_audit: The adapter runtime was successfully preseeded into the workspace-local isolated root before the run, and JSONL views confirmed the full runtime tree. Under standalone runner option `--allow-all-tools`, the required `/usr/bin/env -i ... node dist/index.js setup-adapters --adapter codelldb --yes` shell command was denied twice before product execution.

actual_commands: Required doc views and local adapter-tree inventory succeeded; two attempted exact isolated setup commands were permission-denied without running `dap-cli`.

evidence: Both shell attempts produced `permission.completed` result `denied-no-approval-rule-and-could-not-request-from-user`; no isolated controller state or unexpected process was created.

disposition: Superseded for product acceptance by `FA-R02-CLI-R2`, which used the same seeded isolation shape under `--allow-all` and executed successfully.

## Preliminary Delegated Evidence Retained As Non-Accepted

The earlier delegated external-project results remain in `22-EXTERNAL-PROJECT-RESULTS.md` and are intentionally not promoted here as final acceptance evidence because the scenario contract requires standalone Copilot CLI transcript audit.

| Attempt | Recorded Result | Acceptance Disposition | Reason Retained |
| --- | --- | --- | --- |
| `EXT-01-minigrep` | fail | not accepted | Public behavior succeeded, but a concurrent attempt wrote adapter state into its root; long `DAP_CLI_HOME` also exposed socket-path failure. |
| `EXT-02-itoa` | blocked | not accepted | Agent copied adapter state into the concurrent minigrep root and aborted before public build/debug execution. |
| `EXT-01-R1-minigrep` | pass | preliminary only | Clean delegated behavioral proof; retained CodeLLDB REPL-evaluate ergonomics finding. Replaced for acceptance by `EXT-01-R2-CLI-minigrep`. |
| `EXT-02-R1-itoa` | pass | preliminary only | Clean delegated behavioral proof; identified and corrected line `104` to executable requested line `106` resolving to `107`. Replaced for acceptance by `EXT-02-R2-CLI-itoa`. |

## Audit Conclusion

result: pass
accepted_scenarios: `FA-DOC-01-CLI`, `FA-R02-CLI-R2`, `FA-R03-CLI`, `FA-R04-CLI`, `FA-R05-R07-CLI`, `FA-R06-CLI`, `EXT-01-R2-CLI-minigrep`, `EXT-02-R2-CLI-itoa`
blocked_history_retained: `FA-R02-CLI`, `FA-R02-CLI-R1`, `EXT-02-itoa`
preliminary_history_retained: `EXT-01-minigrep`, `EXT-01-R1-minigrep`, `EXT-02-R1-itoa`

The command-level JSONL audit accepts the required Phase 22 Rust/CodeLLDB behavior classes. Observed runner blocks, agent detours, asynchronous polling behavior, and nonblocking product ergonomics findings are retained and classified in `22-HARDENING-GAPS.md`; no blocking implementation, documentation, or safety-boundary gap remains for Plan 22-10 acceptance.
