# dap-cli Adapter Selection: Rust/CodeLLDB

## Recommendation

| Contract | Value |
| --- | --- |
| Runtime/language | Rust |
| Debug adapter | CodeLLDB (`vadimcn.vscode-lldb`) |
| VS Code launch config type | `lldb` |
notes: Proceed only through `dap-cli-onboard-language`; preserve the loopback-listener proof and bundled VSIX license/provenance review as pre-implementation onboarding gates.
| Adapter version/pin strategy | Pin CodeLLDB `v1.12.2` platform VSIX assets after onboarding records SHA-256 values and reviews the bundled-asset license/provenance surface |
| Process/transport model | Adapter-owned local TCP DAP process using CodeLLDB's `--port` startup shape; require a loopback-only bind proof before implementing the built-in descriptor |
| Provisioning strategy | Consent-gated lazy provisioning into `DAP_CLI_ADAPTERS_DIR/codelldb/`, extracting only the required platform asset after checksum verification; allow an already usable local adapter as an explicit override only after readiness validation |

## Why this choice

Rust with CodeLLDB is the best next built-in language/adapter pair after JavaScript, Python, and Go.

- CodeLLDB explicitly focuses on Rust and C++, including Rust standard-library visualizers, `sourceLanguages: ["rust"]`, and Cargo-aware launch configuration. That is useful to an agent debugging real Rust crates rather than merely executing an arbitrary native binary.
- Its established VS Code configuration contract is `type: "lldb"`, with launch, PID attach, breakpoints, stack, variables, and expression behavior described in the maintainer manual. The extension has over 10 million Marketplace installs and a current `v1.12.2` release from April 2026.
- CodeLLDB's non-VS-Code launcher source starts the debug adapter with `--port` or `--connect`, which is compatible in shape with dap-cli's existing owned local-server transport used for Delve.
- Platform-specific release assets exist for macOS arm64/x64 and Linux arm64/x64, giving onboarding a feasible deterministic download and checksum matrix.
- Rust has both the Docker Official `rust` image and Microsoft's Rust devcontainer images, making screened external-project verification practical in an isolated build/debug environment.

The recommendation is deliberately narrower than "support LLDB for all native languages." Rust provides a coherent runtime workflow and safe validation target. C++ can be considered later without expanding this selection into an open-ended native debugger project.

CodeLLDB is not Microsoft-owned. That is outweighed here by its Rust-specific usability and clean adapter-process fit. The Microsoft-owned Java and C/C++ surfaces considered below introduce project-system or backend complexity that is less aligned with dap-cli's current built-in model.

## Candidate comparison

| Candidate | Fit | Risks | Disposition |
| --- | --- | --- | --- |
| Rust / CodeLLDB `v1.12.2` (`type: "lldb"`) | Strong Rust and Cargo UX; launch and PID attach; broad VS Code adoption; platform VSIX assets; adapter exposes local TCP startup shape | Need to prove adapter listener is loopback-only; VSIX bundles LLDB/Python components whose licensing/provenance and extraction layout must be reviewed before provisioning; native attach may be OS restricted | **Recommended** |
| Rust / LLVM `lldb-dap` (`type: "lldb-dap"`) | Official LLVM standalone DAP binary; documented launch/PID attach; `PATH` support; signed/attested LLVM release packages; local process fit is exceptionally clear | Weaker Rust/Cargo-first ergonomics than CodeLLDB; large LLVM package provisioning; the newer `lldb-dap` launch-config ecosystem is less likely to appear in existing Rust workspaces than `lldb` | **Named runner-up** if official provenance and generic DAP purity are preferred over CodeLLDB Rust ergonomics |
| C++ / Microsoft MIEngine `OpenDebugAD7` (`type: "cppdbg"`) | Microsoft-owned, MIT source, widespread `cppdbg` VS Code convention, launch/attach/evaluate capabilities | Adds GDB/LLDB backend and platform-toolchain variation; supported standalone packaging/provisioning path is not established by this selection; C++ project validation is more build-system dependent | Defer; good ownership signal but poorer bounded onboarding target |
| Java / Microsoft Debugger for Java (`type: "java"`) | Microsoft-owned, active and popular; rich DAP-visible functionality including launch/attach/evaluate | Official surface extends Red Hat Language Support for Java and resolves classpaths/project state through that ecosystem; not a clean standalone adapter-owned happy path | Reject for current built-in model |
| C# / Microsoft .NET debugger (`type: "dotnet"` or `coreclr`) | Microsoft-owned ecosystem; strong runtime demand; launch/attach configuration is documented | Competing configuration paths (`dotnet` project inference versus `coreclr`); backend/distribution and source/symbol network behavior need separate policy work | Defer for a dedicated .NET selection pass |

### Rubric conclusion

| Criterion | Rust / CodeLLDB assessment |
| --- | --- |
| DAP fit | Strong: maintainer docs cover launch, attach, breakpoints, variables, expressions, and termination flow. |
| Process model | Strong pending one spike: adapter launcher uses `--port`/`--connect` rather than a required IDE or language-server handshake. |
| Transport fit | Likely strong: local TCP maps to dap-cli's `server` descriptor; loopback-only behavior must be proven before implementation. |
| Provisioning | Feasible: platform VSIX assets at pinned `v1.12.2`; generate SHA-256 allowlist and review extracted artifact ownership first. |
| Maintenance | Strong: current April 2026 release and active repository/Marketplace presence. |
| Ownership/popularity | Popular and MIT-licensed upstream, but not Microsoft-owned; this is the primary tradeoff. |
| VS Code ecosystem | Strong: stable `type: "lldb"`, Rust/Cargo configuration documented by CodeLLDB. |
| Implementation surface | Bounded and similar to Delve, with extra native-binary build and VSIX extraction work. |
| Verification feasibility | Strong: Rust crate binaries/tests and owned attach targets are easy to make deterministic. |
| Safety | Credible if dependency fetch and debug execution are separated and native attach is limited to owned processes. |

## Later public repo validation sketch

No public project was searched, cloned, or screened during selection. After approval, the onboarding skill should search for safe Rust targets with an existing or naturally expressible CodeLLDB flow.

```text
likely_repo_shapes:
- Maintained Cargo CLI crates with an isolated local subcommand that performs no network or filesystem-wide action.
- Pure library crates with bounded unit tests suitable for Cargo test debugging.
- Small localhost-only service examples only when network behavior can stay loopback-only and optional.
- Workspaces containing .vscode/launch.json or documented CodeLLDB Cargo launch configuration.

launch_json_search_terms:
- path:.vscode/launch.json "type": "lldb" language:Rust
- path:.vscode/launch.json "sourceLanguages": ["rust"]
- path:.vscode/launch.json "cargo" "lldb"

expected_safety_concerns:
- Cargo build scripts, proc macros, test helpers, and workspace hooks execute repository code during build or test.
- Crates may fetch dependencies, start local listeners, read environment variables, or assume external tools/services.
- Native PID attach must target only a phase-owned process; do not relax host ptrace/security settings for validation.

expected_scenario_classes:
- Debug a repo-owned minimal Rust binary at a real source breakpoint.
- Debug a repo-owned Rust unit/integration test target and inspect locals.
- Debug a symbol-friendly prebuilt Cargo binary in a CLI-shaped project.
- Attach to a phase-owned long-running local Rust process, detach safely, then clean it up explicitly.
- Launch through a real `type: "lldb"` configuration with `sourceLanguages: ["rust"]` or Cargo fields.
```

## Container/sandbox feasibility

- **Can the candidate run in a container?** Yes. Rust targets compile and run in the Docker Official `rust` image; Microsoft's `mcr.microsoft.com/devcontainers/rust` image family is also available for a devcontainer-shaped validation environment.
- **Recommended adapter placement.** For native debugging, run the Rust debuggee and CodeLLDB in the same Linux container during external-project execution so the adapter sees the same filesystem paths, symbols, PID namespace, and LLDB runtime libraries as the target. Run dap-cli inside that same container unless a later spike proves an intentionally exposed loopback bridge is simpler and equally contained.
- **Network separation.** Image pulls, the one-time pinned CodeLLDB asset download, and `cargo fetch` require network. Perform them as an explicit preparation stage. Run the debug scenarios with network disabled after dependencies, toolchain, adapter assets, and source are staged, except for local in-container DAP communication.
- **Container posture.** Use no host home mount and no Docker socket mount; run as a non-root user when feasible; mount only phase-owned scratch and screened source; prefer read-only source plus writable `target/`, Cargo cache, and dap-cli cache directories; set CPU/memory/time limits; provide no credentials or cloud configuration.
- **Attach limits.** Never broaden ptrace permissions on the host to make an external-repo scenario pass. If attach needs a container capability adjustment, record it as an explicit scenario exception and prefer launch coverage for the baseline contract.
- **No-container fallback.** Use a phase-owned local checkout and `DAP_CLI_HOME`, prefetch dependencies only after screening `Cargo.toml`, `Cargo.lock`, `build.rs`, workspace configuration, and test commands, then run only a local launch/test/owned-process attach flow with no credentials and no non-local network activity.

Docker is not a perfect sandbox: the Docker daemon itself is privileged. It is a useful containment layer for screened work, not permission to execute an unreviewed repository, mount secrets, expose the Docker socket, or accept opaque setup scripts.

## Implementation surface preview

This is a preview only; no implementation plan or source changes are authorized by selection.

- Add a `codelldb` built-in descriptor alongside the existing JS, Python, and Go descriptors. It should own a local CodeLLDB process and connect through dap-cli's `server` transport only after a spike proves the adapter binds safely to loopback.
- Add `codelldb` to the adapter registry and to lazy setup/provisioning types, checksums, consent messaging, and extraction coverage. Provision only the approved platform matrix and fail with structured diagnostics for unsupported hosts or rejected archives.
- Map VS Code `type: "lldb"` to `codelldb` and decide whether `.rs` inference targets an already-built binary or requires explicit Cargo configuration. Rust source files are not executable programs, so automatic `.rs` launch should not be assumed merely because `.go` inference exists.
- Preserve CodeLLDB launch configuration fields needed for Rust use, especially `cargo`, `sourceLanguages`, `program`, `cwd`, `args`, `env`, and source mapping settings.
- Add a Rust-specific skill reference describing Cargo build/test/binary flows, debug-symbol expectations, expression behavior, attach safety, and any LLDB evaluator fallback found in real testing.
- Add fixtures and real-adapter integration coverage for binary launch, Cargo test, prebuilt executable, owned local attach, launch-config use, negative provisioning diagnostics, cleanup, and any CodeLLDB thread/stop behavior that differs from Delve.
- Update adapter setup documentation and hand-driven smoke coverage only in the later onboarding workflow.

### Required onboarding gates before implementation commitment

1. Run CodeLLDB's extracted adapter directly from an approved VSIX in a phase-owned scratch directory and prove it accepts DAP initialize/launch traffic without VS Code extension-host state.
2. Prove the `--port` listener is loopback-only or identify a supported argument that restricts it to `127.0.0.1`; reject a built-in server descriptor if it exposes a wildcard listener.
3. Review the VSIX contents, upstream notices/licenses, platform asset provenance, and generated SHA-256 table before adopting download-based provisioning.
4. Exercise a tiny Rust fixture through breakpoint, threads, stack, scopes, variables, evaluate, continue, and cleanup before any external-project search.

## Verification preview

If approved, onboarding should require the same evidence quality Phase 20 established for Go/Delve:

- Repository-owned Rust fixture coverage for a binary launch, a test target, a prebuilt debug binary, and a same-machine owned PID attach/detach lifecycle.
- A temporary `type: "lldb"` launch configuration with Rust fields (`sourceLanguages` and/or `cargo`) to prove VS Code configuration mapping rather than only raw adapter flags.
- Typed negative diagnostics for missing adapter asset, unsupported platform, checksum mismatch, invalid native target, and blocked unsafe attach behavior.
- Later screened public-project scenarios diversified across CLI, library-test, and configuration-driven flows; do not discover or execute those projects until approval is recorded.
- Fresh-agent repeats that preserve failures and generate docs/product gaps, including tests for short-lived targets, expression fallback, native symbol/source mapping, and clean process teardown.
- The repository's hand-driven CLI smoke gate still applies when later verification claims completion; automated integration tests alone are insufficient.

## Open questions

- Does the approved CodeLLDB `v1.12.2` executable bind its `--port` listener exclusively to loopback, or is an explicit host control needed? This is a blocker for the built-in local-server descriptor, not a documentation nicety.
- Does downloading and extracting the platform VSIX for dap-cli provisioning comply with all licenses and notices for CodeLLDB's bundled LLDB/Python runtime pieces? The repository MIT license alone is not enough evidence for redistributed or cached binary contents.
- Should `codelldb` intentionally support Rust only at first, even though CodeLLDB also supports C++? Recommendation: yes, keep fixture/docs/verification ownership scoped to Rust and consider C++ separately.
- Should later onboarding retain CodeLLDB's Cargo conveniences or start with built binaries only? Recommendation: prove both, with prebuilt binary launch as the simplest baseline and Cargo test/config flows as required Rust ergonomics coverage.

## Sources consulted

- Existing dap-cli Phase 20 Go/Delve selection, scenario, external-project, results, and hardening artifacts.
- Current dap-cli built-in adapter, registry, provisioning, launch-config, inference, adapter-setup, and agent-reference surfaces.
- CodeLLDB `v1.12.2` manual, Marketplace listing, GitHub release assets, MIT license, and adapter launcher source (`extension/novsc/adapter.ts`).
- LLVM `lldb-dap` README, Marketplace listing, and LLVM `22.1.6` signed/attested release-package documentation.
- VS Code official C/C++, C#, and Java debugger documentation plus Microsoft MIEngine and Java Debugger repository descriptions.
- Docker Official Rust image documentation and Microsoft's Rust devcontainer image tags.

## Approval

status: approved
approved_language: Rust
approved_adapter: CodeLLDB (`vadimcn.vscode-lldb`, recommended baseline `v1.12.2`)
approved_by: Rob Lourens
approved_at: 2026-05-28T04:37:33Z
notes: Proceed only through `dap-cli-onboard-language`; preserve the loopback-listener proof and bundled VSIX license/provenance review as pre-implementation onboarding gates.