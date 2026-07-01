## ADDED Requirements

### Requirement: Native Rust Product
The product SHALL be implemented as a Rust crate under `agent-debug/` and SHALL produce a native executable named `agent-debug`. Starting the CLI client or controller SHALL execute Rust machine code directly and SHALL NOT require or start a Node.js wrapper. Adapter-specific external runtimes, such as the Node.js process required to host upstream js-debug, are allowed only when that adapter is actually started.

#### Scenario: Build the native command
- **WHEN** the Rust crate is built for a supported target
- **THEN** the build produces an `agent-debug` native executable
- **AND** invoking core commands does not require a Node.js runtime

### Requirement: Complete Public Rename
All public distribution and command surfaces SHALL use the name `agent-debug`, and the distribution SHALL NOT provide a `dap-cli` executable or any other legacy alias.

#### Scenario: Inspect installed command names
- **WHEN** a user installs the new distribution
- **THEN** the public executable is named `agent-debug`
- **AND** no `dap-cli` compatibility executable or alias is installed

### Requirement: Native npm Installation
The npm package `@roblourens/agent-debug` SHALL install a direct native `agent-debug` executable. Node.js MAY run during npm installation to select or place a platform payload, but SHALL NOT be required to start the installed CLI client or controller.

#### Scenario: Invoke the npm-installed core binary without Node
- **WHEN** `@roblourens/agent-debug` has been installed and Node.js is unavailable at command invocation time
- **THEN** `agent-debug --version` and `agent-debug --help` run directly as native programs
- **AND** no JavaScript launcher is evaluated

### Requirement: Supported Native Payloads
The release SHALL provide these exact native targets and SHALL validate them on the corresponding pinned GitHub-hosted runner:

| npm platform package | Rust target | Release validation runner |
| --- | --- | --- |
| `@roblourens/agent-debug-darwin-arm64` | `aarch64-apple-darwin` | `macos-15` |
| `@roblourens/agent-debug-darwin-x64` | `x86_64-apple-darwin` | `macos-15-intel` |
| `@roblourens/agent-debug-linux-x64` | `x86_64-unknown-linux-gnu` | `ubuntu-24.04` with glibc 2.39 |
| `@roblourens/agent-debug-linux-arm64` | `aarch64-unknown-linux-gnu` | `ubuntu-24.04-arm` with glibc 2.39 |
| `@roblourens/agent-debug-win32-x64` | `x86_64-pc-windows-msvc` | `windows-2022` |

Each platform package SHALL be restricted with npm `os` and `cpu` metadata and SHALL use exactly the same version as `@roblourens/agent-debug`.

The initial release SHALL support only the pinned GitHub-hosted validation environments and SHALL make no compatibility guarantee for older operating-system, kernel, or libc versions. In particular, the GNU Linux payloads MAY depend on glibc 2.39 from Ubuntu 24.04 and are not expected to run on distributions with an older glibc. Broader compatibility requires a reviewed requirement and a different verified build strategy.

#### Scenario: Install on a supported platform
- **WHEN** `@roblourens/agent-debug` is installed on a supported operating-system and architecture pair
- **THEN** installation selects a native payload matching that pair
- **AND** the payload is verified before it is exposed as the installed executable

#### Scenario: Reject an unsupported platform
- **WHEN** installation runs on an operating-system and architecture pair outside the supported target set
- **THEN** installation fails with a diagnostic that identifies the unsupported pair

#### Scenario: Run on the release validation runner
- **WHEN** a release payload is built on its pinned GitHub-hosted runner
- **THEN** core CLI and controller smoke tests pass on that runner
- **AND** the release does not claim unverified older-OS compatibility

### Requirement: Exact npm Installer Layout
`@roblourens/agent-debug` SHALL declare exact-version optional dependencies on all five platform packages and SHALL include a required install lifecycle hook. The hook SHALL map `process.platform` and `process.arch` to one platform package, resolve its fixed native payload path, verify it against the meta package's checksum manifest, atomically copy it to `bin/agent-debug.exe`, set executable permissions on POSIX, and create or repair npm command links so `agent-debug` executes that native file directly. JavaScript launch shims SHALL NOT remain on the invocation path.

Standard npm local installation, global installation, and `npx @roblourens/agent-debug` SHALL be supported and tested. Package-manager modes that disable lifecycle scripts, including npm `--ignore-scripts`, SHALL be documented as unsupported because they cannot assemble the native command.

#### Scenario: Install the meta package locally
- **WHEN** standard npm installs `@roblourens/agent-debug` as a project dependency
- **THEN** `node_modules/.bin/agent-debug` invokes the verified native payload directly

#### Scenario: Install the meta package globally
- **WHEN** standard npm installs the package globally
- **THEN** the global `agent-debug` command invokes the verified native payload directly on Unix and Windows

#### Scenario: Invoke through npx
- **WHEN** `npx @roblourens/agent-debug --version` performs a normal lifecycle-enabled install
- **THEN** it selects the matching platform package and executes the native payload

#### Scenario: Lifecycle scripts are disabled
- **WHEN** installation disables lifecycle scripts
- **THEN** that mode is not considered a supported installation
- **AND** documentation explains that standard npm lifecycle execution is required

### Requirement: Release Integrity Evidence
Every native release SHALL publish checksums and provenance for its native payloads, and release validation SHALL verify that packaged payloads match that evidence. The `release-pipeline` capability defines the authoritative workflow, runner, artifact-handoff, and publication process that produces and validates this evidence.

#### Scenario: Validate a release payload
- **WHEN** release automation prepares a native payload for publication
- **THEN** it verifies the payload against its published checksum
- **AND** it records provenance linking the payload to the release build

### Requirement: Reproducible Startup Benchmark
The release-blocking startup gate SHALL run on the pinned GitHub-hosted `macos-15` arm64 runner using the exact release-mode artifact intended for `@roblourens/agent-debug-darwin-arm64`. The report SHALL record the GitHub runner image version and available hardware metadata. A runner-image or hardware-class change SHALL require a reviewed native-baseline refresh before regression comparisons resume.

The benchmark harness SHALL measure wall-clock time from immediately before process spawn until process exit after stdout and stderr have been fully drained. It SHALL use a new isolated `AGENT_DEBUG_HOME`, redirect output to files or null without a terminal, perform at least 5 unmeasured warm-up invocations, and run 3 trials of 60 measured invocations per command. Warm controller status SHALL start and verify one controller before each trial and reuse it for that trial. The report SHALL include runner image, available hardware metadata, filesystem, Rust toolchain, binary digest, command, trial samples, median, p95, and the stored native baseline for that runner image.

#### Scenario: Benchmark version and help startup
- **WHEN** release validation benchmarks `agent-debug --version` and `agent-debug --help`
- **THEN** each command is measured using the required warm-ups and 3 trials of 60 invocations
- **AND** at least two of three trials have median latency no greater than 25 ms and p95 latency no greater than 40 ms on `macos-15`

#### Scenario: Benchmark warm controller status
- **WHEN** release validation benchmarks controller status after the controller has been warmed in the isolated home
- **THEN** status is measured using the required warm-ups and 3 trials of 60 invocations
- **AND** at least two of three trials have median latency no greater than 30 ms and p95 latency no greater than 50 ms on `macos-15`

#### Scenario: Run performance checks on another target
- **WHEN** CI runs on another supported GitHub-hosted target
- **THEN** it compares against a stored native baseline for that target with a 20 percent regression budget
- **AND** it does not apply the macOS arm64 absolute millisecond thresholds

### Requirement: Historical TypeScript Baseline Context
Benchmark reports SHALL retain the captured TypeScript baselines of 108.27 ms for version, 112.19 ms for help, and 113.31 ms for warm controller status as planning context. Because those values were measured on a different non-CI host, release automation SHALL NOT use them for a cross-host performance ratio. Release acceptance SHALL use the GitHub-hosted absolute budgets and stored native regression baselines.

#### Scenario: Report historical context
- **WHEN** startup benchmark evidence is produced
- **THEN** it records the captured TypeScript values as historical context
- **AND** pass or fail is determined only by the GitHub-hosted absolute and native-regression gates
