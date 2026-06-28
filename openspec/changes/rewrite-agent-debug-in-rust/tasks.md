## 1. Establish the Clean-Room Boundary

- [ ] 1.1 Delete the TypeScript product implementation, generated TypeScript DAP registry, Node runtime build output, and TypeScript-only product build configuration before creating Rust implementation code; preserve OpenSpec, tests, fixtures, user docs, smoke scenarios, and npm metadata needed for migration.
- [ ] 1.2 Create the versioned verification coverage manifest from the dated survey evidence (63 `*.test.ts`, 109 total `tests/` files, 568 textual declarations, 3 smoke files), mapping every preserved asset to retain/adapt, port, replace, or retire coverage.
- [ ] 1.3 Record and enforce the clean-room rule in contributor instructions: implementation may use OpenSpec and preserved verification assets but may not restore or inspect deleted implementation source through git history.
- [ ] 1.4 Remove public `dap-cli` compatibility expectations from the preserved tests and docs while retaining legacy names only in explicit negative migration scenarios.

## 2. Create the Rust Product Foundation

- [ ] 2.1 Create the `agent-debug/` Rust crate with thin `main.rs`, testable `lib.rs`, subsystem modules from the design, and a committed `Cargo.lock`.
- [ ] 2.2 Add the approved Rust dependencies and platform-specific feature gates without initializing async, logging, filesystem, network, or adapter subsystems on the version fast path.
- [ ] 2.3 Implement `AGENT_DEBUG_HOME`, state/log/config/adapter path resolution, supported-platform normalization, and the complete `AGENT_DEBUG_*` namespace.
- [ ] 2.4 Implement the complete versioned public result schemas, stable error-code registry, success/error metadata, warning, adapter-context, request-context, and recovery-data models from `cli-contract`.
- [ ] 2.5 Implement the exact public exit-code taxonomy `0`, `2`, `3`, `4`, `5`, `6`, `7`, and `70` with one mapping point from typed errors.
- [ ] 2.6 Add Rust formatting, clippy, unit-test, integration-test, and release-build commands to repository automation.

## 3. Implement the CLI and Output Contracts

- [ ] 3.1 Implement the exact public command tree and option surface from `cli-contract`, excluding the removed fake-adapter `--script` seam and all legacy aliases.
- [ ] 3.2 Implement grouped root help, hidden controller-serving help behavior, variadic drill-down help, unknown-path diagnostics, and help/version exit success.
- [ ] 3.3 Implement JSON output mode as the default, including one compact newline-terminated envelope, canonical `meta.warnings: OperationWarning[]`, completed interactive-prompt stderr exceptions, and omission of unavailable optional fields.
- [ ] 3.4 Implement `--human`, `--no-human`, `AGENT_DEBUG_HUMAN`, non-TTY precedence, invalid-value handling, and `NO_COLOR`.
- [ ] 3.5 Implement deterministic human rendering and terminal-control sanitization for all untrusted output.
- [ ] 3.6 Implement stderr-only prompts, `--yes`/`-y`, `AGENT_DEBUG_ASSUME_YES`, declined consent, and non-TTY consent failure.
- [ ] 3.7 Add native and black-box tests for help, output precedence, envelope shapes, exit codes, prompts, sanitizer behavior, and unknown arguments.

## 4. Implement Controller IPC and Session Persistence

- [ ] 4.1 Implement versioned newline-delimited JSON controller request/response codecs with typed method and parameter validation.
- [ ] 4.2 Implement Unix domain socket discovery, owner-only fallback directories, peer-credential checks, Windows current-user named-pipe ACLs, symlink-safe endpoint creation, deterministic long-path fallback, and atomic `controller.json`.
- [ ] 4.3 Implement controller hello/build-id checks, the backward-stable authorized hello/shutdown subset, heartbeat updates, liveness and process-birth validation, stale discovery cleanup, and explicit idempotent `agent-debug start`.
- [ ] 4.4 Implement controller status, shutdown, `status` fallback, and `stop` fallback without auto-starting the controller.
- [ ] 4.5 Implement versioned `sessions.json` persistence with temporary-file flush, atomic rename, parent-directory sync where supported, and corrupt-file backup recovery.
- [ ] 4.6 Implement opaque `sess_` identifiers, the complete lifecycle enum, public status projection, timestamps, active-session rules, and duplicate live-name rejection.
- [ ] 4.7 Implement `sessions`, `use`, `stop`, `detach`, `close`, and child visibility/targetability behavior.
- [ ] 4.8 Implement honest ownership-aware `cleanup`, `--purge`/`--force`, failure diagnostics, orphan reporting, and truthful retained records.
- [ ] 4.9 Implement compound metadata, ordered startup, rollback, derived names, `stopAll` defaulting, and close cascading.
- [ ] 4.10 Implement Unix process-group and Windows process-tree ownership with creation-time/executable identity, bounded disconnect/termination escalation, PID-reuse protection, and controller-shutdown record preservation.
- [ ] 4.11 Add concurrency and restart tests for simultaneous CLI clients, atomic state, stale discovery, build mismatch, cleanup, compounds, and shutdown.

## 5. Implement the DAP Core

- [ ] 5.1 Implement byte-correct DAP `Content-Length` encoding, 8 KiB header/16 MiB body/128-level JSON limits, and incremental parsing for fragmented, combined, non-ASCII, malformed, and oversized frames.
- [ ] 5.2 Implement stdio, loopback socket, and spawned loopback server transports with bounded connection and teardown behavior.
- [ ] 5.3 Implement a per-connection DAP actor with outgoing sequence numbers, pending request correlation, out-of-order responses, request timeouts, transport failure propagation, and adapter diagnostics.
- [ ] 5.4 Implement the launch/attach lifecycle coordinator with named stage timeouts, initialized-event ordering, breakpoint hook, `configurationDone`, and failed-state projection.
- [ ] 5.5 Implement `runInTerminal` reverse requests without a shell and track their owned processes for teardown.
- [ ] 5.6 Implement `startDebugging` reverse requests, recursive child handling, child readiness at `configurationDone`, and delayed trailing-response diagnostics.
- [ ] 5.7 Vendor the official DAP schema snapshot and source digest, generate Rust command metadata/source from it, and add a reviewed live-schema refresh command.
- [ ] 5.8 Implement one mediated path for aliases, generated `agent-debug dap` commands, and raw requests, including kebab-case mapping, required-argument/type validation, capability gates, per-runtime mutation serialization, managed-lifecycle rejection, and reference invalidation parity.
- [ ] 5.9 Implement capability reporting and structured DAP response, timeout, unsupported-request, malformed-protocol, and transport errors.
- [ ] 5.10 Implement the 200-entry high-priority and 50-entry low-priority event rings, monotonic cursors, loss markers, filter-before-limit behavior, and capacity warnings.
- [ ] 5.11 Add native protocol tests covering framing, lifecycle, actors, reverse requests, generated catalog synchronization, capabilities, and event history.

## 6. Implement Debug Operations and Child Routing

- [ ] 6.1 Implement persisted paused-state projection from stopped, continued, thread, exited, and terminated events.
- [ ] 6.2 Implement stop epochs and owner maps for thread ids, frame ids, variable references, and source references, including invalidation after resume or termination.
- [ ] 6.3 Implement source breakpoint replacement, absolute path normalization, conditional/hit/log fields, successful-state tracking, list filtering, and idempotent clear.
- [ ] 6.4 Implement asynchronous breakpoint verification diagnostics, loaded-source probes, child counts, bounded child verification updates, warnings, and literal recovery commands.
- [ ] 6.5 Implement `events`, `threads`, `stack`, `scopes`, `variables`, `source`, and `evaluate` result and error contracts.
- [ ] 6.6 Implement automatic stopped-thread, live-thread, and top-frame resolution with explicit ambiguity and no-candidate errors.
- [ ] 6.7 Implement `continue`, `pause`, `next`, `step-in`, and `step-out`, including single-thread behavior, target ids, pause warning delay, and DAP error preservation.
- [ ] 6.8 Implement parent child-session aggregation, child naming/visibility, parent-only targeting, `--child-session-id` discrimination, thread/reference routing, duplicate-id ambiguity, and ended-child exclusion.
- [ ] 6.9 Implement parent-owned breakpoint replay/merge and child event mirroring with top-level `childSessionId` metadata while preserving adapter event bodies.
- [ ] 6.10 Add native and black-box tests for every debug alias, reference invalidation, paused projection, breakpoint workflow, child ambiguity, and structured recovery data.

## 7. Implement Launch Configuration Resolution

- [ ] 7.1 Implement launch/attach option parsing, adapter/type defaults, supported extension inference, explicit override rules, and failure when no debuggable target is selected.
- [ ] 7.2 Implement bounded UTF-8 JSONC `.vscode/launch.json` parsing with BOM, comments, trailing commas, schema limits, exact name selection, and workspace errors.
- [ ] 7.3 Implement recursive supported variable substitution, missing-variable errors, and rejection of `${input:...}` and `${command:...}` without executing them.
- [ ] 7.4 Implement macOS/Linux/Windows overlays and removal of platform and VS Code-only task/UI fields.
- [ ] 7.5 Implement exact shallow precedence: adapter defaults, named config, `--json-overrides`, `--json`, and dedicated flags.
- [ ] 7.6 Implement named-config-only request auto-routing, warning and `autoRouted` payloads, and raw verb authority.
- [ ] 7.7 Implement source-map flags and TypeScript workspace defaults without overriding explicit values.
- [ ] 7.8 Implement config/compound listing without controller startup and the exact array result shape.
- [ ] 7.9 Integrate independently resolved compound members with controller transactional startup and rollback.
- [ ] 7.10 Add native and black-box tests for inference, JSONC, variables, overlays, precedence, auto-routing, source maps, list shape, and compounds.

## 8. Implement Adapter Registry and Provisioning

- [ ] 8.1 Implement built-in/custom descriptor schemas, `$AGENT_DEBUG_HOME/config/adapters.json`, type mapping, built-in collision precedence, and invalid-config errors.
- [ ] 8.2 Implement stdio, socket, and server descriptor resolution with strict `127.0.0.1` enforcement and `${port}` substitution.
- [ ] 8.3 Implement cache completeness checks, versioned consent markers, `AGENT_DEBUG_ADAPTERS_DIR`, custom-adapter exclusion, and lazy provisioning entrypoints.
- [ ] 8.4 Implement per-adapter renewable lease locks with PID/process-birth identity and nonce, 90-second acquisition timeout, dead-owner recovery without age-only stealing, under-lock cache recheck, and parallel different-adapter installs.
- [ ] 8.5 Implement HTTPS downloads, loopback HTTP test support, proxy and `NO_PROXY` matching, GitHub-only token attachment, rate-limit detection, `PIP_INDEX_URL`, and secret-safe URL rendering.
- [ ] 8.6 Create and validate complete versioned built-in manifests with exact source URLs/templates, archive/package layouts, required paths, commands, arguments, transports, readiness, permissions, versions, checksums, and approved debugpy wheel hashes.
- [ ] 8.7 Implement SHA-256 verification, safe tar/zip extraction, traversal/absolute/drive/symlink rejection, entrypoint validation, executable permissions, consent-marker creation/fsync inside staging, incomplete-canonical quarantine, staging cleanup, and atomic promotion.
- [ ] 8.8 Implement isolated debugpy virtual-environment creation using approved wheels, pip hash enforcement, no dependency resolution or source builds, and the Python provisioning failure modes.
- [ ] 8.9 Implement all 13 underlying `provision_*` errors with structured recovery data and no secret leakage.
- [ ] 8.10 Implement CLI-owned consent/provisioning before session IPC, controller manifest revalidation, compound pre-provisioning, `setup-adapters` pending/cached classification, consolidated consent, per-adapter continuation, partial results, and aggregate `provision_setup_failed`.
- [ ] 8.11 Add native provisioning tests for cache, consent, locking, concurrency, proxies, rate limits, checksums, extraction, permissions, atomicity, redaction, and all error snapshots.

## 9. Implement Built-In Language Adapters

- [ ] 9.1 Implement js-debug descriptor creation, on-demand `AGENT_DEBUG_JS_DEBUG_NODE`/PATH resolution with `>=20.19.0 <25.0.0` validation and stable missing/incompatible errors, Node/Chrome/Electron type normalization, source-map defaults, attach overrides, server diagnostics, and owned browser cleanup.
- [ ] 9.2 Implement js-debug `startDebugging` child coordination, parent paused union, breakpoint fan-out/merge, mirrored events, helper-process detection, and `agentDebug.helperProcessWarning`.
- [ ] 9.3 Implement the same-Chromium fixed-CDP-port Playwright workflow and gated Node, Chrome, Electron, source-map, multi-renderer, and helper-process tests.
- [ ] 9.4 Implement debugpy descriptor resolution, `AGENT_DEBUG_PROVISION_PYTHON3`, launch/attach, statement detection, `exec(...)` auto-wrap, opt-out stripping, and `evaluate_requires_exec`.
- [ ] 9.5 Implement Delve PATH preference, verified provisioned fallback, platform matrix, Go 1.24 compatibility, `GOTOOLCHAIN`, debug/test/exec modes, working directories, and safe local attach.
- [ ] 9.6 Implement CodeLLDB macOS arm64 official-source provisioning, explicit executable launch, `cargo` property rejection, Rust defaults, loopback server, and safe local attach.
- [ ] 9.7 Add gated real-adapter launch, breakpoint, inspection, evaluation, disconnect, and cleanup tests for Python, Go, and Rust.

## 10. Build Native npm Distribution and Release Automation

- [ ] 10.1 Replace `.github/workflows/publish.yml` with `.github/workflows/ci.yml` and `.github/workflows/release.yml`, including stable-tag, dry-run/recovery, and protected emergency dispatch inputs, immutable tag/version/default-branch validation, per-tag concurrency, and no publication from pull requests or branch refs.
- [ ] 10.2 Add root `rust-toolchain.toml`, committed Cargo target configuration and vendor directory, offline locked native release builds on `macos-15`, `macos-15-intel`, `ubuntu-24.04`, `ubuntu-24.04-arm`, and `windows-2022`, plus a pinned `cargo-deny` license/source/ban/duplicate/advisory gate; pin actions, Linux containers, Node.js, npm, and other release tooling immutably.
- [ ] 10.3 Implement `scripts/release.mjs` with deterministic `validate`, `stage-platform`, `assemble`, `verify`, and `publish` subcommands and expose each through root npm scripts without adding Node.js to the product invocation path.
- [ ] 10.4 Stage each native build as executable plus `artifact.json` and `SHA256SUMS`, verify target and runner architecture, upload it with 14-day retention, validate upload digests, and generate GitHub build-provenance attestations.
- [ ] 10.5 Run Linux floor smoke inside digest-pinned glibc 2.28 containers and on credential-free kernel 4.18/glibc 2.28 arm64/x64 runners; configure and validate credential-free macOS 12 arm64/x64 and Windows 10 1809 x64 floor runners; block release when a required floor runner is absent or mismatched.
- [ ] 10.6 Run the absolute startup gate against the exact macOS arm64 candidate on `[self-hosted, agent-debug-performance, macos-15, arm64, m3-max]` and keep target-relative regression checks in GitHub-hosted jobs.
- [ ] 10.7 Create the exact target-restricted npm platform packages named in `distribution-performance`, containing only the applicable native payload, package metadata, license, and checksum evidence.
- [ ] 10.8 Create `@roblourens/agent-debug` with exact-version optional platform dependencies and the required local/global/npx install lifecycle hook; implement checksum verification, atomic copy to fixed `bin/agent-debug.exe`, POSIX mode setup, and Unix/Windows command-link repair.
- [ ] 10.9 Assemble the six npm tarballs only from current-run native artifacts and produce `release-manifest.json` binding package integrity, executable digests, targets, tag, commit, and attestation references.
- [ ] 10.10 Add a five-platform prepublication matrix in which each job starts its own loopback-only ephemeral npm registry containing the six candidate tarballs, then tests local, global, and npx installation, command-link identity, platform/ABI errors, core invocation without Node on PATH, and the structured js-debug missing-Node error.
- [ ] 10.11 Add the documented one-time `0.0.0-bootstrap.0` npm package-name bootstrap and trusted-publisher setup for all six packages; ensure normal workflows use GitHub OIDC and contain no reusable npm write token.
- [ ] 10.12 After prepublication verification, create or verify a draft GitHub Release containing the exact six candidate tarballs, `release-manifest.json`, and aggregate checksums; require fresh recovery runs to use those assets whenever partial public publication exists, and require a new version if they are missing or inconsistent.
- [ ] 10.13 Implement integrity-aware idempotent publication from the draft bundle: publish or verify all five platform packages first, fail on an integrity collision, and publish the meta package only after every exact platform version is visible.
- [ ] 10.14 Add five-platform public-registry local/global/npx verification with bounded propagation retries, then remove candidate tarballs from the draft and publish the GitHub Release with `release-manifest.json` and `SHA256SUMS` only after all checks pass.
- [ ] 10.15 Add the protected `emergency-release` environment flow that can waive only a timed-out self-hosted floor/performance gate for an urgent security release, records approval and justification, and reruns waived gates against published artifacts within seven days.
- [ ] 10.16 Enforce least-privilege job permissions, credential-free self-hosted jobs, immutable tags, no cancellation during publication, and new-version-only remediation after a published-version defect.
- [ ] 10.17 Document the npm-only signing scope: checksums, GitHub attestations, and npm provenance are required; raw standalone archives and Apple/Windows signing claims remain blocked pending a reviewed specification update.

## 11. Migrate the Complete Verification Suite

- [ ] 11.1 Replace the TypeScript fake adapter with a Rust test fixture binary and exercise it only through custom test adapter configuration or another private test seam.
- [ ] 11.2 Rewrite the CLI harness to spawn `AGENT_DEBUG_BIN`, capture real stdout/stderr/exit status, isolate `AGENT_DEBUG_HOME`, and support built or npm-installed binaries.
- [ ] 11.3 Port every test marked `C` or the native half of `B+C` in the design's 63-file table to Rust without carrying TypeScript module structure into the new tests.
- [ ] 11.4 Adapt and retain every test marked `B` or the black-box half of `B+C` to the renamed binary, paths, environment variables, intentional fake-adapter removal, and improved contracts.
- [ ] 11.5 Replace the module-boundary and docs-validation tests marked `D` with Cargo dependency/forbidden-process checks and generated command/example validation.
- [ ] 11.6 Retain all 14 fixture groups with the dispositions in the design, including JavaScript/TypeScript fixtures as debug targets rather than product source.
- [ ] 11.7 Preserve environment gates for browser, attach, packaging, and real-adapter tests under renamed `AGENT_DEBUG_*` variables.
- [ ] 11.8 Run the complete native and black-box suites and document any intentionally retired assertion with its replacing OpenSpec requirement and test.

## 12. Rename and Update Documentation and Plugin Assets

- [ ] 12.1 Rename the Open Plugins manifest, skill directory, skill name, descriptions, examples, commands, paths, and environment variables to `agent-debug`.
- [ ] 12.2 Rewrite README installation and quick-start guidance for `@roblourens/agent-debug` and the direct native executable.
- [ ] 12.3 Update adapter setup documentation for the new cache, consent, security, proxy, platform, and custom adapter contracts.
- [ ] 12.4 Update Playwright interoperability documentation for `agent-debug` and verify every command against the native CLI.
- [ ] 12.5 Update all language-specific skill references for JavaScript/TypeScript, Python, Go, and Rust.
- [ ] 12.6 Update `dev/smoke/README.md` and `dev/smoke/hand-driven-smoke.md` for native build and npm-installed invocation.
- [ ] 12.7 Generalize `dev/smoke/vscode-chat-smoke.md` to configurable repository/workspace paths and rename every public surface.
- [ ] 12.8 Add breaking migration guidance stating that there is no command alias, environment/state migration, or automatic reuse of `~/.dap-cli`.
- [ ] 12.9 Add documentation validation that rejects stale public `dap-cli`, `DAP_CLI_*`, or `~/.dap-cli` references outside explicit migration/negative examples.

## 13. Meet Performance, Security, and Platform Gates

- [ ] 13.1 Add the specified Apple M3 Max reference harness with release binaries, isolated home, drained non-TTY output, 5 warm-ups, 3 trials of 60 measured spawns, complete metadata, and target-specific 20 percent regression checks elsewhere.
- [ ] 13.2 Meet median/p95 budgets for `--version`, `--help`, and warm controller `status`, and demonstrate at least fourfold median improvement over each captured TypeScript baseline.
- [ ] 13.3 Profile and remove avoidable fast-path initialization until all startup gates pass in release mode.
- [ ] 13.4 Verify controller and adapter IPC remain local-only on every supported platform.
- [ ] 13.5 Verify private local-state permissions, archive traversal/symlink defenses, environment/argument/URL/token redaction, checksum enforcement, owned-process-only cleanup, and terminal sanitization.
- [ ] 13.6 Run cross-platform CI for all native payload targets and adapter-specific supported subsets.

## 14. Complete End-to-End Release Verification

- [ ] 14.1 Run Rust formatting, clippy with warnings denied, all native tests, all black-box tests, release builds, and strict OpenSpec validation.
- [ ] 14.2 Run the gated real js-debug, debugpy, Delve, CodeLLDB, Playwright, self-hosting, and packaging suites in their supported environments.
- [ ] 14.3 Install the produced `@roblourens/agent-debug` package in a clean environment and verify the installed native payload, command tree, JSON contract, state namespace, and no Node invocation dependency.
- [ ] 14.4 Hand-drive adapted smoke Sequence A and Sequence B with the native executable and capture verbatim terminal output.
- [ ] 14.5 Hand-drive adapted smoke Sequence C on a clean adapter cache and capture prompt, install, cache reuse, and non-TTY consent behavior.
- [ ] 14.6 Verify no smoke-owned adapter or debuggee processes remain, no temporary test state remains, and all reported orphan arrays are empty.
- [ ] 14.7 Verify public files contain no unintended legacy command, package, environment, state-path, or plugin names.
- [ ] 14.8 Confirm every OpenSpec requirement has automated or hand-driven evidence and mark every checklist item complete before release.
