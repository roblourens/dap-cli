## ADDED Requirements

### Requirement: Pinned Delve Provisioning Matrix
The built-in Go adapter SHALL provision Delve `v1.26.3` only for macOS arm64, macOS x64, Linux x64, Linux arm64, and Windows x64. Provisioned release archives SHALL be selected for the detected platform and verified against pinned SHA-256 values before installation.

#### Scenario: Provision on a supported platform
- **WHEN** Delve provisioning runs on `darwin_arm64`, `darwin_x64`, `linux_x64`, `linux_arm64`, or `win32_x64`
- **THEN** `agent-debug` selects the corresponding official Delve `v1.26.3` archive
- **AND** verifies its pinned checksum before exposing the `dlv` executable

#### Scenario: Reject an unsupported platform
- **WHEN** Delve provisioning runs on any other platform pair
- **THEN** it fails with `provision_arch_unsupported`
- **AND** identifies the supported platform pairs

### Requirement: Delve Resolution Order
The built-in Go adapter SHALL prefer a usable `dlv` executable found on `PATH`. If none is usable, it SHALL use a completed provisioned cache or lazily provision Delve `v1.26.3`.

#### Scenario: Prefer PATH Delve
- **GIVEN** a usable `dlv` is on `PATH`
- **WHEN** the built-in Go adapter is resolved
- **THEN** `agent-debug` uses the PATH executable without provisioning another copy

#### Scenario: Fall back to provisioning
- **GIVEN** no usable `dlv` is on `PATH`
- **AND** no completed provisioned Delve cache exists
- **WHEN** a Go session requires the adapter
- **THEN** `agent-debug` provisions and uses Delve `v1.26.3`

### Requirement: Go Toolchain Compatibility
When `agent-debug` selects provisioned Delve `v1.26.3` and can determine the active Go version, it SHALL require Go `1.24.0` or newer. It SHALL forward the caller's `GOTOOLCHAIN` environment value to the `dlv dap` process.

#### Scenario: Reject an older Go toolchain
- **GIVEN** provisioned Delve `v1.26.3` is selected
- **AND** the active Go version is older than `1.24.0`
- **WHEN** a Go session starts
- **THEN** startup fails with `delve_go_version_incompatible`
- **AND** diagnostics recommend selecting Go 1.24 or newer, including a `GOTOOLCHAIN` recovery example

#### Scenario: Forward GOTOOLCHAIN
- **GIVEN** the caller environment defines `GOTOOLCHAIN`
- **WHEN** `agent-debug` starts `dlv dap`
- **THEN** the Delve process receives the same `GOTOOLCHAIN` value

### Requirement: Delve Launch Modes
`agent-debug` SHALL support Delve `debug`, `test`, and `exec` launch modes with caller-supplied `program`, `cwd`, and `dlvCwd` arguments.

#### Scenario: Debug a Go package
- **WHEN** the caller launches with `mode: "debug"` and a package directory
- **THEN** `agent-debug` sends that package directory and build context to Delve

#### Scenario: Debug Go tests
- **WHEN** the caller launches with `mode: "test"` and a package directory
- **THEN** Delve builds and debugs the package's tests

#### Scenario: Debug a prebuilt executable
- **WHEN** the caller launches with `mode: "exec"` and a compiled Go executable
- **THEN** Delve starts that executable without treating the program path as a package to build

### Requirement: Go Program and Package Selection
`agent-debug` SHALL infer the built-in `delve` adapter and DAP type `go` from a `.go` program path. A package directory SHALL require an explicit Go/Delve selection because a directory has no language extension.

#### Scenario: Infer from a Go source file
- **WHEN** the caller supplies a program path ending in `.go` without an adapter or type
- **THEN** `agent-debug` selects adapter `delve` and type `go`

#### Scenario: Select a package directory
- **WHEN** the caller supplies a package directory for `debug` or `test` mode
- **THEN** the caller explicitly selects the Go type or Delve adapter
- **AND** `agent-debug` does not infer a language solely from the directory path

### Requirement: Delve Working Directories
For Delve launch modes, `cwd` SHALL control the debuggee working directory and `dlvCwd` SHALL control Delve's Go build working directory. `agent-debug` SHALL preserve both values independently.

#### Scenario: Build from the module directory
- **GIVEN** a Go module has a directory containing `go.mod`
- **WHEN** the caller sets both `cwd` and `dlvCwd` to that directory for `debug` or `test`
- **THEN** the debuggee runs from `cwd`
- **AND** Delve invokes Go build operations from `dlvCwd`

#### Scenario: Preserve different directories
- **WHEN** the caller intentionally supplies different `cwd` and `dlvCwd` values
- **THEN** `agent-debug` forwards both without collapsing one into the other

### Requirement: Debuggable Go Executable Guidance
When a prebuilt Go executable lacks useful debug information because it was optimized or inlined, `agent-debug` documentation and diagnostics SHALL recommend rebuilding it with `go build -gcflags=all="-N -l"`.

#### Scenario: Recover poor exec-mode inspection
- **GIVEN** a Delve `exec` session has missing or misleading lines, frames, locals, or evaluation results
- **WHEN** recovery guidance is presented
- **THEN** it recommends rebuilding with `-gcflags=all="-N -l"`

### Requirement: Safe Local Go Attach
The built-in Go adapter SHALL support `mode: "local"` attach only as a same-machine, caller-owned PID workflow. Disconnect with `terminateDebuggee: false` SHALL leave the attached process running, and `agent-debug` SHALL NOT perform broad or unrelated process cleanup.

#### Scenario: Attach to an owned local process
- **GIVEN** the caller owns and intentionally started a local Go process
- **WHEN** attach is invoked with `mode: "local"` and its `processId`
- **THEN** `agent-debug` sends a Delve local attach request for that PID

#### Scenario: Preserve the process on disconnect
- **GIVEN** an owned local Go process is attached
- **WHEN** the caller disconnects with `terminateDebuggee: false`
- **THEN** the target process remains alive
- **AND** cleanup remains the caller's responsibility
