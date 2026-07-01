## Context

`agent-debug` is an agent-first command-line debugger. Separate command invocations must cooperate through persistent debugger sessions, speak the Debug Adapter Protocol (DAP), support real project launch configurations, and present stable machine-readable results.

This rewrite is intentionally not an incremental port:

- The TypeScript implementation will be deleted before Rust implementation begins.
- Implementers may use this reviewed OpenSpec change and preserved tests, fixtures, and manual scenarios.
- Implementers may not inspect deleted source through git history.
- The public product is renamed completely to `agent-debug`; there is no compatibility alias or legacy state migration.
- npm remains the installation channel, but every invocation must execute a native binary directly.
- Startup latency is a primary acceptance criterion.

The planning baseline measured 60 invocations per command on the same host:

| Command | Median | p95 |
| --- | ---: | ---: |
| `--version` | 108.27 ms | 117.77 ms |
| `--help` | 112.19 ms | 183.77 ms |
| warm controller `status` | 113.31 ms | 129.67 ms |

The dated planning survey found 109 files under `tests/`, including 63 `*.test.ts` files and 568 textual `test()`/`it()` declarations, plus three files under `dev/smoke/`. These numbers are handoff evidence, not permanent acceptance counts.

## Goals / Non-Goals

**Goals:**

- Reproduce the complete reviewed product behavior as a native Rust executable.
- Make OpenSpec sufficient to implement the product after TypeScript source deletion.
- Preserve the stateful controller and polling model that agents rely on.
- Keep the DAP core language-neutral while retaining the four supported built-in adapters.
- Improve correctness where the prior public surface exposed test seams or ambiguous routing.
- Preserve or port every meaningful verification asset with an explicit disposition.
- Install through npm without starting Node.js at command invocation time.
- Meet the startup-performance budgets in `distribution-performance`.

**Non-Goals:**

- A `dap-cli` command alias, legacy environment variables, or automatic import from `~/.dap-cli`.
- Event streaming, blocking wait commands, a TUI, or an IDE UI.
- Remote-by-default controller or adapter transports.
- Additional built-in adapter families.
- CodeLLDB provisioning beyond verified macOS arm64 support.
- General C/C++ support, remote native debugging, or security-policy bypasses.
- Preserving TypeScript module boundaries, helpers, or implementation patterns.
- Exposing the deterministic fake adapter as a public product feature.

## Decisions

### 1. Use one primary Rust crate with a library boundary

The Rust implementation will live under:

```text
agent-debug/
├── Cargo.toml
├── build.rs
├── src/
│   ├── main.rs
│   ├── lib.rs
│   ├── cli/
│   ├── output/
│   ├── controller/
│   ├── sessions/
│   ├── dap/
│   ├── adapters/
│   ├── config/
│   └── process/
└── tests/
```

`main.rs` remains a thin process boundary. Product behavior lives behind `lib.rs` so native unit and integration tests can exercise typed APIs without spawning a process when black-box behavior is not the subject under test.

The initial rewrite will not split every subsystem into a separate crate. A single primary crate keeps compile times, dependency management, and cross-cutting refactors manageable. Test-only fixture binaries may be separate crates under `agent-debug/tests/fixtures/`.

**Alternatives considered:**

- **Many workspace crates:** clearer hard boundaries, but creates ceremony and dependency churn before the replacement is stable.
- **Binary-only crate:** simpler layout, but makes unit testing and reuse of protocol/config logic unnecessarily difficult.

### 2. Select dependencies for safety without putting work on the fast path

The expected dependency families are:

- `clap` for the statically generated command tree and grouped help.
- `serde` and `serde_json` for typed state, IPC, DAP, and output contracts.
- `tokio` for the controller, adapter I/O, timers, child coordination, and local IPC.
- `thiserror` for typed internal errors mapped once into public error envelopes.
- `tracing` with file-backed subscribers for controller diagnostics.
- `time` for RFC3339 UTC timestamps.
- `rand` plus URL-safe encoding for opaque `sess_` identifiers.
- `reqwest` with Rustls for HTTPS provisioning and proxy support.
- `sha2`, `flate2`, `tar`, and `zip` for verified in-process extraction.
- A maintained JSONC parser for VS Code launch files.
- `semver` for Go/Delve compatibility checks.
- `nix` on Unix and `windows-sys` on Windows for process groups, trees, signals, and named pipes.

Exact compatible versions are selected during implementation and pinned by `Cargo.lock`. Help and version handling must not initialize Tokio, networking, logging, state directories, or adapter code.

### 3. Keep one native executable for client and controller roles

The same executable serves two roles:

- Public CLI client commands.
- A hidden `serve-controller` process started only by `agent-debug start`.

`start` resolves the current executable, spawns it detached with the hidden role, and waits for discovery plus a hello handshake. A compile-time build identifier is embedded from package version, target, and source revision or release build identity. A client refuses to reuse a live controller with another identifier.

Commands do not auto-start the controller. This avoids hidden long-lived side effects and makes failure recovery explicit.

### 4. Use versioned newline-delimited JSON for local controller IPC

Controller IPC is internal, local-only, and independent from DAP. Each connection carries one request and one response:

```json
{"version":1,"id":"1","method":"sessions.status","params":{"name":"demo"}}
{"version":1,"id":"1","ok":true,"result":{}}
```

Failure responses contain the same typed error payload later rendered by the CLI:

```json
{"version":1,"id":"1","ok":false,"error":{"code":"session_not_found","category":"session","exitCode":4,"message":"...","diagnostics":[]}}
```

Messages are compact UTF-8 JSON terminated by `\n`. The controller validates the version, method, and parameter shape before dispatch.

Unix uses a Unix domain socket. Windows uses a named pipe. The controller never listens on TCP. Long Unix home paths use a deterministic SHA-256-derived socket name inside an owner-only runtime directory. Unix peers are checked against the controller user's UID where supported; Windows pipes use a current-user ACL. Discovery, socket, and fallback paths are opened without following symlinks and are rejected when ownership or permissions are unsafe.

IPC lines are bounded to 20 MiB with a JSON nesting limit of 128, allowing the complete 16 MiB DAP body limit plus controller and CLI envelopes.

**Alternative considered:** DAP framing or JSON-RPC for controller IPC. Both add unnecessary semantics and risk confusing the private control protocol with DAP.

### 5. Make discovery and persistent state independently recoverable

Public state lives under `AGENT_DEBUG_HOME`, defaulting to `~/.agent-debug`:

```text
~/.agent-debug/
├── state/
│   ├── controller.json
│   └── sessions.json
├── logs/
├── config/
│   └── adapters.json
└── adapters/
```

`controller.json` is ephemeral discovery with schema version, pid, endpoint, directories, build identifier, start time, and heartbeat. It is written atomically.

`sessions.json` is a versioned durable document:

```json
{
  "version": 1,
  "activeSessionId": "sess_...",
  "sessions": []
}
```

Only the controller writes session state. Every update writes a sibling temporary file, flushes it, atomically renames it, and syncs the parent directory where supported. Corrupt state is renamed to a timestamped backup before the controller starts with an empty registry.

A controller restart does not reconstruct live adapter connections from records. Records whose runtimes ended during shutdown remain truthful terminal history until closed or cleaned.

### 6. Model controller state with typed session and runtime registries

The controller owns:

- A persistent `SessionRegistry`.
- An in-memory `RuntimeRegistry` keyed by session id.
- The active top-level session id.
- Compound metadata.
- Parent/child relationships.
- Per-runtime paused state and DAP reference ownership.

The session lifecycle is represented by an enum matching the specification. Public status is derived from lifecycle plus paused projection rather than stored as an independent mutable field.

Duplicate live top-level names are rejected before adapter startup. Child sessions never become active and are never directly targetable.

Compound startup is sequential and transactional. A failure tears down successful members in reverse order and removes every partial record.

### 7. Represent process ownership and teardown explicitly

Every spawned adapter or `runInTerminal` process is recorded with:

- Ownership.
- PID and process-group or Job Object identity.
- Process creation time and executable identity.
- Log path.
- Bounded stderr tail.
- Child processes known to belong to the runtime.

Unix adapter processes start in their own process group. Windows-owned processes are assigned to a Job Object where possible. Teardown follows:

1. Send the appropriate DAP disconnect or terminate request.
2. Wait for a bounded graceful exit.
3. Signal the owned process group/tree.
4. Escalate after another bounded wait.
5. Recheck liveness and report surviving PIDs.

Unowned custom socket adapters and attached debuggees are never signaled merely because their PID is known. Persisted numeric process identifiers are never signaled after restart unless creation-time and executable evidence still matches.

### 8. Implement DAP as an actor per connection

Each DAP connection owns:

- A byte-oriented Content-Length parser.
- An outgoing sequence counter.
- A pending-request map keyed by sequence.
- Per-request timeout handles.
- An event channel.
- A reverse-request handler.

The actor reads arbitrary chunks, emits complete messages in order, correlates out-of-order responses by `request_seq`, and fails all pending requests when framing or transport fails.

The parser enforces 8 KiB headers, 16 MiB bodies, and JSON nesting depth 128. Stderr retention is capped at 16 KiB per line and 64 KiB total. Cached event bodies larger than 256 KiB are replaced by explicit truncation metadata after any required live state projection.

The lifecycle coordinator performs:

```text
initialize
  -> launch or attach begins
  -> wait for initialized event
  -> configure/replay breakpoints
  -> configurationDone
  -> observe launch or attach completion
```

Each stage has a named timeout. Child sessions become usable after `configurationDone`; a delayed trailing attach response cannot deadlock child readiness.

### 9. Vendor the official DAP schema and generate Rust source

Normal builds must not depend on the network. The repository will commit:

```text
agent-debug/dap-schema/debugAdapterProtocol.json
agent-debug/dap-schema/SOURCE.json
agent-debug/src/generated/dap_commands.rs
```

`SOURCE.json` records the official URL, fetch timestamp, and SHA-256 digest. A refresh command fetches the official schema, regenerates typed metadata and command registration, and leaves a reviewable diff. CI verifies that the snapshot, digest, and generated Rust source agree.

Generated metadata includes:

- Wire command.
- Kebab-case CLI name.
- Request direction.
- Required arguments and properties.
- Known primitive property types.
- Capability gate when defined by the schema.

Only client-to-adapter requests become public `dap` commands.

All first-class aliases, generated commands, and raw requests enter one mediated controller path. The runtime actor serializes execution- and lifecycle-mutating commands. Public escape hatches cannot repeat the controller-owned initialize/launch/attach/configurationDone handshake. Permitted restart/terminate/disconnect requests update lifecycle and invalidate stop-scoped references exactly like first-class commands.

### 10. Keep event history bounded and stop-scoped references typed

Each user-visible session has:

- A 200-entry high-priority ring.
- A 50-entry low-priority ring for `loadedSource` by default.
- One monotonic cursor across both rings.

Polling merges rings by cursor, applies cursor filtering, applies include/exclude filters, then selects the newest limited set while preserving ascending order.

Frame ids, variable references, source references, and thread ownership are recorded with:

- Runtime id.
- Parent session id.
- Stopped epoch.
- Reference kind and numeric value.

Resume, step, disconnect, terminate, or lifecycle-end events invalidate affected entries. This prevents a numeric id from being routed to the wrong child after execution changes.

### 11. Coordinate js-debug children through the parent

`startDebugging` creates a child runtime linked to the top-level parent. The child receives the same reverse-request handling recursively.

The coordinator maintains per-child:

- Lifecycle.
- Known threads.
- Stopped threads or all-threads-stopped state.
- Breakpoint responses.
- Reference ownership.

Parent paused state is recomputed as a union across live children. Thread routing prefers the uniquely stopped owner, then unique live ownership. Duplicate numeric thread ids across children produce an ambiguity error rather than registration-order routing.

Child events are copied into the parent event cache with a top-level `childSessionId` routing annotation; the adapter-owned body is preserved unchanged. Parent-owned source breakpoints are replayed before each child completes configuration.

### 12. Resolve launch configuration through explicit typed layers

The launch resolver performs these phases:

1. Load and validate the optional custom adapter config.
2. Load `.vscode/launch.json` only when requested.
3. Parse JSONC, apply the current platform overlay, and resolve supported variables.
4. Select adapter and DAP type.
5. Select launch or attach mode, including named-config auto-routing.
6. Apply mode-specific adapter defaults.
7. Shallow-merge named config, `--json-overrides`, `--json`, and dedicated flags.
8. Remove VS Code-only task/UI fields.
9. Apply adapter-specific mapping and validated defaults.

Raw invocations remain verb-driven. Named configurations may auto-route and return structured warning metadata.

The fake adapter is not part of public inference. Tests use a custom adapter descriptor pointing to a test fixture binary.

### 13. Separate adapter descriptors from provisioning

The adapter registry resolves descriptors. Provisioners only ensure that built-in descriptor entrypoints exist.

Built-in descriptor factories:

- `js-debug` (hosted by a Node.js executable resolved only when js-debug starts)
- `debugpy`
- `delve`
- `codelldb`

Custom descriptors use the same typed stdio/socket/server schema but are never provisioned.

Provisioning uses:

- Per-adapter renewable lease locks carrying PID, process creation identity, and nonce.
- Under-lock cache rechecks.
- Explicit consent before network access.
- HTTPS and proxy handling.
- Pinned checksums.
- In-process safe extraction.
- Sibling staging directories, consent marker creation and fsync inside staging, incomplete-canonical quarantine, and atomic promotion.
- Versioned consent markers.

The HTTP layer attaches `GITHUB_TOKEN` only to GitHub hosts and redacts credentials, query strings, and fragments from diagnostics.

The interactive CLI owns configuration resolution, consent, download, and installation. Only after provisioning succeeds does it send a descriptor plus manifest identity to the controller. The controller never prompts; it revalidates the manifest, consent marker, required paths, permissions, and cache-root containment before spawn.

Each built-in has a committed versioned manifest with exact source URL/template, archive/package format, checksum or allowed wheel hashes, required runtime paths, command, arguments, transport, readiness, permissions, and consent marker. debugpy uses only approved hash-locked wheels with pip hash enforcement and no dependency resolution.

### 14. Preserve adapter-specific behavior behind narrow modules

Adapter-specific mapping stays outside the DAP core:

- **js-debug:** type normalization, source-map defaults, server tracing, child coordination, helper-process warning, Chromium ownership.
- **debugpy:** isolated venv, Python interpreter selection, expression/statement detection, `exec(...)` retry data.
- **Delve:** PATH preference, verified fallback provisioning, Go version compatibility, `GOTOOLCHAIN`, mode-specific guidance.
- **CodeLLDB:** macOS arm64 official-source provisioning, explicit executable requirement, `cargo` config rejection, Rust defaults, loopback server.

These modules may transform launch data or errors only where their capability specs require it.

### 15. Emit public output through one typed boundary

Internal errors are an enum carrying:

- Public code and category.
- Exit code.
- Safe message.
- Diagnostics.
- Optional session, request, adapter, and recovery data.

The CLI boundary is the only place that serializes public success or failure envelopes. JSON uses one compact line plus newline. Every non-fatal product warning uses the canonical `meta.warnings: OperationWarning[]` location. Human rendering consumes the same typed payload, writes warnings to stderr, sanitizes terminal control characters, and honors `NO_COLOR`.

Prompts are separate stderr interactions and cannot share stdout with JSON.

Public result types are versioned through `meta.schemaVersion`. Agent-debug-owned fields use camelCase; official DAP bodies retain DAP casing. Rust structs corresponding to every normative type in `cli-contract` are serialized directly and snapshot-tested, so command handlers cannot return anonymous map shapes.

### 16. Keep client startup work minimal

Performance choices:

- Parse `--version` before constructing the full command tree.
- Do not initialize Tokio, logging, directories, config, or schema metadata for `--version`.
- Generate command registration at compile time.
- Delay the async runtime until an operational command requires I/O.
- Use a current-thread runtime for one-shot CLI requests.
- Keep controller IPC to one request/response connection per invocation.
- Avoid scanning adapter caches or launch files unless the command needs them.
- Keep human rendering and color setup off the JSON fast path.

The release-blocking absolute benchmark runs on the pinned GitHub-hosted `macos-15` arm64 runner using the exact release artifact. The harness uses release binaries, 5 warm-ups, 3 trials of 60 measured spawns, and wall-clock spawn-to-exit timing with drained non-TTY output. The report records the runner image and available hardware metadata. Other GitHub-hosted targets use stored target-native baselines and a 20 percent regression budget.

### 17. Distribute native binaries through npm platform packages

The npm layout will be:

```text
npm/
├── agent-debug/
│   ├── package.json
│   ├── install.cjs
│   └── bin/
│       └── agent-debug[.exe]
├── agent-debug-darwin-arm64/
├── agent-debug-darwin-x64/
├── agent-debug-linux-x64/
├── agent-debug-linux-arm64/
└── agent-debug-win32-x64/
```

The meta package is `@roblourens/agent-debug`. Platform packages are optional dependencies restricted by `os` and `cpu`. Install-time JavaScript selects the matching package, verifies its checksum, and places or links the native executable at the meta package's `bin` path. npm's command shim must execute that native file directly; no JavaScript launcher remains on the invocation path.

Exact packages and targets:

| Package | Rust target | Release validation runner |
| --- | --- | --- |
| `@roblourens/agent-debug-darwin-arm64` | `aarch64-apple-darwin` | `macos-15` |
| `@roblourens/agent-debug-darwin-x64` | `x86_64-apple-darwin` | `macos-15-intel` |
| `@roblourens/agent-debug-linux-x64` | `x86_64-unknown-linux-gnu` | `ubuntu-24.04`, glibc 2.39 |
| `@roblourens/agent-debug-linux-arm64` | `aarch64-unknown-linux-gnu` | `ubuntu-24.04-arm`, glibc 2.39 |
| `@roblourens/agent-debug-win32-x64` | `x86_64-pc-windows-msvc` | `windows-2022` |

The meta package uses exact-version optional dependencies. Its required install hook verifies the selected payload and atomically writes a fixed `bin/agent-debug.exe` target (the internal extension is used on every platform). It then creates or repairs Unix links and Windows `.cmd`/PowerShell shims so they execute the native target directly rather than Node. Standard local, global, and npx installs are tested. Lifecycle-disabled package-manager modes are explicitly unsupported.

Release automation builds and runs each target on its pinned GitHub-hosted runner, uploads checksums and provenance, assembles npm packages from those exact artifacts, installs the produced meta package through local/global/npx paths, removes Node from the core invocation PATH where practical, and runs the installed command. Older operating-system, kernel, and libc versions are not an initial support claim; the GNU Linux artifacts may require Ubuntu 24.04's glibc 2.39.

### 18. Use one explicit cross-platform release pipeline

The current Ubuntu-only `.github/workflows/publish.yml` is replaced by:

- `.github/workflows/ci.yml` for pull requests and pushes to the default branch.
- `.github/workflows/release.yml` for tagged release builds, package validation, npm publication, and final GitHub Release creation.

`release.yml` runs automatically for stable `v<major>.<minor>.<patch>` tags. A manual dispatch accepts an existing tag and a `publish` input that defaults to false, providing a full dry run and explicit recovery path. Pull requests and ordinary branch pushes cannot enter publication jobs. The workflow uses a per-tag concurrency group with cancellation disabled.

The release graph is:

```text
validate immutable tag/version/source
  ├─ build-native[5] -> attest and upload native artifacts
  │    └─ execute each artifact and run smoke on its build runner
  ├─ native/unit/integration release gates
  └─ macos-15 arm64 absolute performance gate
       -> assemble six npm tarballs and release manifest
       -> prepublish install matrix[5] through ephemeral npm registry
       -> persist exact candidate tarballs in a draft GitHub Release
       -> OIDC publish platform packages, then meta package
       -> public npm install matrix[5]
       -> remove candidate tarballs and publish GitHub Release evidence
```

Native release jobs use exact non-`latest` GitHub-hosted runners:

| Target | Runner | Additional build constraint |
| --- | --- | --- |
| `aarch64-apple-darwin` | `macos-15` | native GitHub-hosted build |
| `x86_64-apple-darwin` | `macos-15-intel` | native GitHub-hosted build |
| `x86_64-unknown-linux-gnu` | `ubuntu-24.04` | native GitHub-hosted build |
| `aarch64-unknown-linux-gnu` | `ubuntu-24.04-arm` | native GitHub-hosted build |
| `x86_64-pc-windows-msvc` | `windows-2022` | static CRT from committed Cargo configuration |

Every build verifies its runner architecture and uses the committed lockfile, committed Cargo vendor directory, source-replacement configuration, and the toolchain pinned in root `rust-toolchain.toml`:

```text
cargo build --manifest-path agent-debug/Cargo.toml \
  --locked --offline --release --target <target>
```

Each build stages `release/native/<target>/agent-debug[.exe]`, `artifact.json`, and `SHA256SUMS`. Metadata binds the executable to the version, tag, full commit, target, runner, OS, toolchain, size, and digest. GitHub artifact digest validation and a build-provenance attestation are generated before the directory is uploaded with 14-day retention. Package assembly rejects any metadata or digest mismatch and never rebuilds a binary.

A GitHub-hosted prebuild job runs a pinned `cargo-deny` version against a reviewed license/source/ban/duplicate policy and pinned advisory snapshot. Rust release builds use only vendored dependencies and run without registry network access. Exceptions are explicit, scoped, justified, and time-bounded.

Every artifact runs core CLI and controller smoke tests on the same GitHub-hosted runner that built it. The `macos-15` arm64 job also runs the absolute startup budgets; the other jobs run stored native regression checks. No self-hosted runner or private machine is part of CI or release automation, and the initial release does not claim compatibility with older OS, kernel, or libc versions that are not represented by these runners.

Cross-platform release logic is centralized in `scripts/release.mjs` with `validate`, `stage-platform`, `assemble`, `verify`, and `publish` subcommands, exposed through corresponding root npm scripts. Workflow YAML directly invokes Cargo and OS inspection, but does not duplicate package layout, checksum, manifest, integrity-comparison, or publication-order logic in shell snippets. The release tool runs on a pinned Node.js 22 patch and pinned trusted-publishing-compatible npm version; neither is on the installed product invocation path.

The assembly job downloads the five native artifacts from the current workflow run and produces the exact six npm tarballs plus `release-manifest.json`. Before public publication, each entry in a five-platform matrix starts its own loopback-only ephemeral npm registry and publishes those same tarballs there. It then tests local, global, and npx installation, verifies selected payload digests and command links, runs core controller smoke, removes Node from the invocation path, and separately verifies the js-debug missing-Node contract.

After prepublication validation, a narrowly privileged job creates or updates a draft GitHub Release for the tag and uploads the exact six tarballs, manifest, and aggregate checksums. This draft is the durable recovery source. Publication always downloads and revalidates those assets. If any public package for the version already exists, a fresh run may not rebuild that version; it must use the matching draft assets. If the draft is missing or conflicts after partial publication, the version is abandoned and recovery uses a new patch version.

The first automated release has one explicit administrative prerequisite: a maintainer publishes metadata-only `0.0.0-bootstrap.0` packages under a `bootstrap` dist-tag for all six names, configures each npm trusted publisher to this repository and exact `.github/workflows/release.yml` filename, and disables reusable write tokens. Normal release jobs contain no `NPM_TOKEN`. The only npm publication job runs on GitHub-hosted `ubuntu-24.04` with `id-token: write`.

Publication is idempotent. Platform packages are handled first. An absent version is published from the preverified tarball; an existing version with identical registry integrity is skipped; an existing version with different integrity is a permanent failure. The meta package is published only after all five platform versions are visible and match the release manifest. This permits a rerun to finish a partial platform publication without attempting an overwrite.

After the meta package is visible, the five-platform matrix repeats local, global, and npx installation from the public registry with bounded propagation retries. Only then does the final job delete the six candidate tarballs from the draft and publish it with `release-manifest.json` and `SHA256SUMS`. Reruns verify and reuse a matching public release or repair missing matching evidence, but fail on conflicting evidence. A defect after meta-package publication requires a new version; the workflow never unpublishes or mutates the released version.

Workflow permissions default to `contents: read`. Attestation, draft-bundle, npm OIDC, and final GitHub Release jobs receive only their narrow additional permissions. Actions are pinned to full commit SHAs, and the workflow never moves or force-pushes a tag.

The initial distribution remains npm-only. Checksums, GitHub attestations, and npm provenance are required, but Apple signing/notarization and Windows Authenticode are not claimed. Raw executable archives are not attached to GitHub Releases. Adding standalone downloads or platform-signing claims requires a reviewed specification update covering key custody and failure handling.

### 19. Preserve the agent plugin as documentation, not runtime code

The Open Plugins manifest and skill are renamed to `agent-debug`. They contain:

- The poll-then-inspect loop.
- Output and error contracts.
- Child-session routing.
- Breakpoint verification.
- Launch configuration guidance.
- Language-specific references.
- Playwright interoperability.

The plugin does not load code into the Rust process and does not define a separate plugin runtime.

### 20. Use a two-layer verification architecture

#### Layer A: native Rust tests

Rust tests cover algorithms, state machines, protocol actors, provisioning, controller behavior, and typed serialization. They replace tests that imported TypeScript modules.

#### Layer B: black-box compatibility and acceptance tests

A development-only Node/Vitest suite may remain where it efficiently verifies CLI behavior, npm installation, existing fixtures, browsers, and adapters. Its harness must spawn `AGENT_DEBUG_BIN` and must not import Rust internals. Node is a test/install dependency and an adapter-specific host dependency for upstream js-debug. It is not the process runtime or invocation wrapper for the `agent-debug` CLI or controller.

The compatibility suite treats OpenSpec as authoritative. Expected names, state paths, environment variables, removed fake-adapter options, and intentional error improvements are updated rather than blindly matched.

### 21. Complete test-file survey and disposition

Disposition codes:

- **B:** Adapt and retain as black-box subprocess coverage.
- **C:** Port the behavioral assertions to native Rust tests.
- **B+C:** Split between black-box CLI coverage and native component tests.
- **D:** Replace with Rust-appropriate verification; do not port the implementation-specific assertion.

| Existing test file | Disposition | Replacement focus |
| --- | --- | --- |
| `tests/adapters/codelldb.test.ts` | C | CodeLLDB descriptor and config mapping |
| `tests/adapters/config.test.ts` | C | Custom descriptor schema and atomic config |
| `tests/adapters/delve.test.ts` | C | Delve descriptor and version checks |
| `tests/adapters/provision/atomicInstall.test.ts` | C | Staging, promotion, cleanup |
| `tests/adapters/provision/cacheRootOverride.test.ts` | C | `AGENT_DEBUG_ADAPTERS_DIR` |
| `tests/adapters/provision/codelldb.test.ts` | C | VSIX selection, checksum, platform boundary |
| `tests/adapters/provision/concurrent.test.ts` | C | Per-adapter races and cache recheck |
| `tests/adapters/provision/consent.test.ts` | B+C | Prompt subprocess behavior and consent logic |
| `tests/adapters/provision/debugpy.test.ts` | C | venv and pip failures |
| `tests/adapters/provision/delve.test.ts` | C | platform archives and executable mode |
| `tests/adapters/provision/errorSnapshots.test.ts` | B+C | Public envelopes plus typed error construction |
| `tests/adapters/provision/extract.test.ts` | C | traversal, symlink, and archive rejection |
| `tests/adapters/provision/http.test.ts` | C | HTTPS, status, rate limits, redaction |
| `tests/adapters/provision/jsDebug.test.ts` | C | tarball verification and cache shape |
| `tests/adapters/provision/lock.test.ts` | C | timeout and stale-lock recovery |
| `tests/adapters/provision/proxy.test.ts` | C | proxy selection and `NO_PROXY` |
| `tests/adapters/registry.test.ts` | C | built-in/custom precedence |
| `tests/architecture/moduleBoundaries.test.ts` | D | Cargo dependency and forbidden-process checks |
| `tests/cli/codelldbConfigRouting.test.ts` | B | named config routing and errors |
| `tests/cli/confirm.test.ts` | B+C | TTY prompt I/O and parser logic |
| `tests/cli/dapGeneratedCommands.test.ts` | B+C | generated CLI plus schema synchronization |
| `tests/cli/errorContracts.test.ts` | B+C | exit/envelope contracts plus error mapping |
| `tests/cli/helpCommand.test.ts` | B | grouped and drill-down help |
| `tests/cli/humanOutput.test.ts` | B+C | terminal output snapshots and sanitizer |
| `tests/cli/jsonOutput.test.ts` | B | one-line JSON and metadata |
| `tests/cli/jsonOverrides.test.ts` | B | precedence through the public CLI |
| `tests/cli/launchAttachAutoRoute.test.ts` | B | named-config auto-routing |
| `tests/cli/sessionCommands.test.ts` | B | session lifecycle commands |
| `tests/cli/setupAdaptersCommand.test.ts` | B | batch provisioning behavior |
| `tests/config/launchConfig.test.ts` | C | JSONC, variables, overlays, compounds |
| `tests/config/programInference.test.ts` | C | adapter/type inference |
| `tests/controller/breakpointsTracking.test.ts` | C | replacement, list, clear |
| `tests/controller/childSessions.test.ts` | C | child state, routing, breakpoint fan-out |
| `tests/controller/controllerIpc.test.ts` | B+C | public controller flows and IPC codec |
| `tests/controller/dapRequestRouting.test.ts` | C | capability and paused routing |
| `tests/controller/pythonExpressionDetector.test.ts` | C | Python evaluation classification |
| `tests/controller/sessionManager.test.ts` | C | session, compound, cleanup, child behavior |
| `tests/helpers/buildFakeAdapterTarball.test.ts` | C | Rust test-fixture archive builder |
| `tests/integration/breakpointsListClear.test.ts` | B | end-to-end breakpoint state |
| `tests/integration/breakpointsVerificationDiagnostic.test.ts` | B | public verification diagnostics |
| `tests/integration/codelldbAdapter.test.ts` | B | gated real Rust launch/attach |
| `tests/integration/debugpyAdapter.test.ts` | B | gated real Python launch/attach |
| `tests/integration/delveAdapter.test.ts` | B | gated real Go modes/attach |
| `tests/integration/docsValidation.test.ts` | D | docs command/example validator for new names |
| `tests/integration/evaluateAutoFrame.test.ts` | B | auto-frame public workflow |
| `tests/integration/fakeAdapterCli.test.ts` | B | custom test adapter through subprocess |
| `tests/integration/helperProcessDetection.test.ts` | B | synthetic helper warning |
| `tests/integration/jsDebugAdapter.test.ts` | B | gated Node/Chrome/Electron workflows |
| `tests/integration/jsonOverrides.test.ts` | B | end-to-end precedence |
| `tests/integration/launchAttachAutoRoute.test.ts` | B | integration auto-routing |
| `tests/integration/launchInference.test.ts` | B | public inference |
| `tests/integration/playwrightInterop.test.ts` | B | same-browser breakpoint handoff |
| `tests/integration/selfHosting.test.ts` | B | native `agent-debug` debugging an owned fixture or itself |
| `tests/packaging/npxCache.test.ts` | B | npm install/cache reuse |
| `tests/packaging/publishedTarball.test.ts` | B | native payload package contents |
| `tests/protocol/dapClient.test.ts` | C | actor sequencing and reverse requests |
| `tests/protocol/eventCache.test.ts` | C | priority rings and cursors |
| `tests/protocol/fakeAdapter.test.ts` | C | Rust fake-adapter fixture behavior |
| `tests/protocol/framing.test.ts` | C | byte framing and malformed input |
| `tests/protocol/lifecycle.test.ts` | C | handshake state machine |
| `tests/sessions/helperProcessDetection.test.ts` | C | process identity rules |
| `tests/sessions/sessionStore.test.ts` | C | atomic persistence and corrupt recovery |
| `tests/testing/tempEnv.test.ts` | C | isolated home and fixture staging |

### 22. Preserve and adapt every fixture group

| Fixture group | Disposition |
| --- | --- |
| `tests/fixtures/dap-cli-target/` | Rename references; retain as Node smoke target |
| `tests/fixtures/fake-adapter-entry.ts` | Replace with a Rust test fixture binary |
| `tests/fixtures/simple-chrome-page/` | Retain |
| `tests/fixtures/simple-electron-app/` | Retain |
| `tests/fixtures/simple-go-app/` | Retain |
| `tests/fixtures/simple-go-attach/` | Retain |
| `tests/fixtures/simple-go-test/` | Retain |
| `tests/fixtures/simple-node-app/` | Retain |
| `tests/fixtures/simple-python-app/` | Retain |
| `tests/fixtures/simple-rust-app/` | Retain |
| `tests/fixtures/simple-rust-attach/` | Retain |
| `tests/fixtures/simple-ts-app/` | Retain as a debug target, not product source |
| `tests/fixtures/ts-button-page/` | Retain source-map and browser fixture |
| `tests/fixtures/ts-mocha-mini/` | Retain TypeScript/Mocha debug fixture |

The existing `runCli` helper becomes a subprocess harness controlled by `AGENT_DEBUG_BIN`. The fake release server remains a local HTTP test helper. Adapter tarball generation is ported where it tests Rust extraction internals and may remain in the compatibility suite where it only feeds black-box provisioning.

### 23. Preserve all three manual smoke assets

- `dev/smoke/README.md` is updated for native build and installed npm invocation.
- `dev/smoke/hand-driven-smoke.md` is renamed throughout and remains the canonical A/B/C terminal contract.
- `dev/smoke/vscode-chat-smoke.md` is generalized to configurable workspace paths instead of hard-coded personal paths while preserving the VS Code compound and Playwright workflow.

Sequences A and B run for every verification round. Sequence C runs for provisioning changes. Captured output must come from the built or npm-installed native executable.

## Risks / Trade-offs

- **[Scope size]** A full behavior rewrite can hide omissions.
  **Mitigation:** capability specs, the 63-file disposition table, strict OpenSpec validation, and staged acceptance gates.

- **[Clean-room ambiguity]** A behavior may be absent from the specs after source deletion.
  **Mitigation:** update the reviewed OpenSpec or preserved behavioral asset; never restore or inspect deleted source.

- **[Startup regression]** A large CLI tree or async runtime could erase Rust's startup advantage.
  **Mitigation:** compile-time command generation, early version path, lazy runtime/logging/config initialization, and release benchmarks.

- **[npm native installation complexity]** Platform packages can be missing or mismatched.
  **Mitigation:** optional dependency restrictions, checksums, clean install tests per target, and no runtime launcher.

- **[Cross-platform process cleanup]** Unix process groups and Windows trees differ.
  **Mitigation:** platform-specific ownership modules with integration tests and explicit orphan reporting.

- **[Adapter supply-chain risk]** Native adapter downloads execute third-party code.
  **Mitigation:** pinned official sources, SHA-256 verification, safe extraction, explicit consent, and redacted diagnostics.

- **[CodeLLDB licensing/provenance]** Redistribution is not approved by the existing evidence.
  **Mitigation:** direct official-source local caching only; never include CodeLLDB in npm payloads.

- **[Child-session complexity]** js-debug can reuse numeric ids across runtimes and delay responses.
  **Mitigation:** typed owner maps, stopped epochs, ambiguity errors, and readiness at `configurationDone`.

- **[Compatibility suite retains Node as a dev dependency]** The repository may still contain JavaScript test tooling.
  **Mitigation:** product invocation and packaging tests prove Node is absent from the runtime path; native tests own internal correctness.

- **[Official DAP drift]** The live schema can change unexpectedly.
  **Mitigation:** reviewed vendored snapshots and an explicit refresh workflow rather than network-dependent builds.

## Migration Plan

1. Review and approve this OpenSpec change.
2. Establish the clean-room boundary by deleting TypeScript implementation source and build artifacts while preserving OpenSpec, tests, fixtures, docs, and smoke scenarios.
3. Create the `agent-debug/` Rust crate and native test fixture binaries.
4. Implement CLI/output, controller/session state, DAP, launch configuration, adapters, and language behavior in dependency order.
5. Adapt black-box tests to `AGENT_DEBUG_BIN` and port internal tests to Rust.
6. Replace root npm metadata with the `@roblourens/agent-debug` meta installer and platform packages.
7. Rename docs, plugin manifest, skill, environment variables, state paths, examples, and smoke commands.
8. Run native tests, compatibility tests, real adapter/browser jobs, npm packaging tests, performance benchmarks, and hand-driven sequences.
9. Publish only when all release gates pass.

There is no runtime rollback to the TypeScript implementation. If a release candidate fails, fix the Rust implementation or the reviewed requirements and publish a corrected native build.

There is no automatic state migration from `~/.dap-cli`. Users receive explicit migration notes and start with `~/.agent-debug`.

## Open Questions

No product-shape questions remain. Implementation may select maintained Rust crates that satisfy these contracts, but changing the command surface, supported target matrix, state schema, npm distribution model, performance budgets, or clean-room boundary requires updating this OpenSpec change for review.
