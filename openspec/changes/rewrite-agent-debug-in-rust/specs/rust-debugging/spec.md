## ADDED Requirements

### Requirement: Narrow CodeLLDB Provisioning Boundary
The built-in Rust adapter SHALL provision exactly CodeLLDB `v1.12.2` only on macOS arm64. It SHALL download the official `codelldb-darwin-arm64.vsix` directly from the CodeLLDB GitHub Release after consent, verify its pinned SHA-256, and cache the extracted runtime under `~/.agent-debug`.

#### Scenario: Provision CodeLLDB on macOS arm64
- **WHEN** provisioning runs on `darwin_arm64`
- **THEN** `agent-debug` downloads the official CodeLLDB `v1.12.2` darwin-arm64 VSIX
- **AND** verifies its pinned checksum before using the extracted adapter

#### Scenario: Reject another platform
- **WHEN** built-in CodeLLDB provisioning runs on any platform other than `darwin_arm64`
- **THEN** it fails with `provision_arch_unsupported`
- **AND** reports `darwin_arm64` as the only supported provisioned platform

### Requirement: No CodeLLDB Redistribution Promise
The `agent-debug` distribution SHALL NOT bundle, mirror, rehost, or claim offline availability for CodeLLDB payloads. A machine that has neither a completed cache nor access to the official release SHALL NOT be promised successful first-time provisioning.

#### Scenario: Inspect the installed package
- **WHEN** `@roblourens/agent-debug` is installed
- **THEN** the package does not contain a redistributed CodeLLDB VSIX or extracted CodeLLDB runtime

#### Scenario: Provision without release access
- **GIVEN** no completed CodeLLDB cache exists
- **AND** the official release asset cannot be reached
- **WHEN** provisioning is attempted
- **THEN** provisioning fails with a download diagnostic
- **AND** does not silently use a mirror or unverified substitute

### Requirement: Compiled Rust Executable Launch
Rust launch SHALL require a compiled executable selected with adapter `codelldb` and DAP type `lldb`. `agent-debug` SHALL NOT treat a Rust source file as a launchable program.

#### Scenario: Launch a compiled Rust binary
- **GIVEN** the caller has built a Rust executable
- **WHEN** launch supplies that executable as `program` with type `lldb`
- **THEN** `agent-debug` launches it through CodeLLDB

#### Scenario: Reject Rust source inference
- **WHEN** the caller supplies only a `.rs` program path
- **THEN** adapter inference fails
- **AND** diagnostics instruct the caller to build and select the compiled executable

### Requirement: Reject VS Code cargo Configurations
`agent-debug` SHALL reject a selected CodeLLDB launch configuration containing the VS Code extension-specific `cargo` property, even when the same configuration also contains `program`.

#### Scenario: Reject cargo-only configuration
- **WHEN** a named `lldb` configuration contains `cargo`
- **THEN** launch fails with `codelldb_cargo_config_unsupported`
- **AND** diagnostics explain that the standalone adapter requires an explicitly built executable

#### Scenario: Reject cargo plus program
- **WHEN** a named `lldb` configuration contains both `cargo` and `program`
- **THEN** launch still fails with `codelldb_cargo_config_unsupported`

### Requirement: Named lldb Configuration and Rust Defaults
`agent-debug` SHALL support named VS Code configurations with type `lldb` when they directly select a compiled executable and contain no `cargo` property. Rust-focused launch defaults SHALL identify Rust sources with `sourceLanguages: ["rust"]` unless the caller supplies an explicit source-language list.

#### Scenario: Launch a named Rust executable
- **GIVEN** a named configuration has type `lldb`, a compiled `program`, and no `cargo` property
- **WHEN** the caller launches that configuration
- **THEN** `agent-debug` resolves it to the built-in `codelldb` adapter
- **AND** launches the selected executable

#### Scenario: Apply Rust source-language defaults
- **GIVEN** a Rust CodeLLDB launch does not define `sourceLanguages`
- **WHEN** `agent-debug` constructs the launch request
- **THEN** the request contains `sourceLanguages: ["rust"]`

#### Scenario: Preserve explicit source languages
- **GIVEN** the caller supplies `sourceLanguages`
- **WHEN** the launch request is constructed
- **THEN** `agent-debug` preserves the caller's list

### Requirement: Safe Owned Local Rust Attach
The built-in Rust adapter SHALL support attach to a local PID that the caller owns and intentionally started. Disconnect with `terminateDebuggee: false` SHALL leave that target running, and cleanup SHALL be limited to the caller-owned target.

#### Scenario: Attach to an owned Rust PID
- **GIVEN** the caller owns and intentionally started a local Rust process
- **WHEN** attach supplies CodeLLDB's native `pid` field
- **THEN** `agent-debug` attaches CodeLLDB to that PID

#### Scenario: Preserve the Rust target on disconnect
- **GIVEN** an owned Rust process is attached
- **WHEN** the caller disconnects with `terminateDebuggee: false`
- **THEN** the process remains alive
- **AND** the caller can terminate it separately

### Requirement: Loopback-Only Rust Adapter Transport
The built-in CodeLLDB server transport SHALL connect only through loopback and SHALL NOT expose a wildcard or remote listener as part of the built-in Rust workflow.

#### Scenario: Start the CodeLLDB adapter server
- **WHEN** `agent-debug` starts its built-in CodeLLDB server transport
- **THEN** the controller connects through `127.0.0.1`
- **AND** no remote-host address is accepted as a built-in Rust attach target

### Requirement: Rust-Focused Support Claim
Built-in CodeLLDB support SHALL be documented and verified as Rust-focused. It SHALL NOT claim general C/C++ debugging, remote debugging, or security-policy bypass support merely because upstream CodeLLDB has broader capabilities.

#### Scenario: Inspect supported Rust workflows
- **WHEN** a user reads built-in CodeLLDB help or diagnostics
- **THEN** the supported claims are compiled Rust executable launch and owned local Rust PID attach
- **AND** general C/C++, remote attach, and code-signing or ptrace workarounds are identified as outside the support claim
