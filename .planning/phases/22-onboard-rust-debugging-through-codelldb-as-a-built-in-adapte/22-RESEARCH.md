# Phase 22: Rust / CodeLLDB Built-In Onboarding - Research

**Researched:** 2026-05-28
**Domain:** Rust debugging through the standalone CodeLLDB DAP adapter and verified VSIX provisioning
**Confidence:** HIGH for repository integration surfaces and official artifact/source facts; MEDIUM overall until execution gates pass

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

#### Adapter Identity and Scope

- Rust and CodeLLDB (`vadimcn.vscode-lldb`, baseline `v1.12.2`) are explicitly approved by Rob Lourens; the built-in adapter id is `codelldb` and the VS Code launch-config type is `lldb`.
- CodeLLDB support is scoped to documented Rust flows for this phase even though the upstream adapter can debug other native languages.
- LLVM `lldb-dap` is the recorded runner-up; if a blocking CodeLLDB transport or provenance gate fails, work stops for an explicit selection decision rather than silently substituting an adapter.

#### Blocking Transport and Supply-Chain Gates

- Before product implementation is committed, run the approved CodeLLDB artifact directly in phase-owned scratch and prove usable DAP operation against a minimal owned Rust target outside a VS Code extension host.
- A built-in server descriptor is allowed only after evidence proves the adapter listens on loopback alone, or a supported argument explicitly forces `127.0.0.1`; wildcard exposure blocks implementation.
- Before implementing download provisioning, record the platform VSIX asset names and SHA-256 values, extraction/entrypoint layout, upstream notices/licenses and relevant bundled runtime/native assets, and a clear caching/provenance conclusion.

#### Provisioning and Adapter Integration

- Extend the Phase 21 lazy-provisioning model: explicit consent, `DAP_CLI_ADAPTERS_DIR`, version-keyed marker, safe extraction, checksum validation, per-adapter lock, atomic installation, proxy/network/error shaping, setup-adapters reporting, synthetic archive tests, and packaging validation all remain required.
- Add a built-in `codelldb` descriptor and registry/provision dispatch only after gates pass; prefer existing adapter abstractions and structured diagnostics over new CLI flags.
- Support only a validated platform/asset matrix. A CodeLLDB-specific typed diagnostic is acceptable only if existing `provision_*` and adapter usage failures cannot accurately describe the condition.

#### Configuration and Rust Behavior

- Map VS Code `type: "lldb"` to `codelldb` and preserve native CodeLLDB Rust configuration fields that direct-adapter verification demonstrates are meaningful, including `program`, `cwd`, `args`, `env`, `sourceLanguages`, and source-related settings where applicable. Extension-owned `cargo` is rejected before native forwarding, including when `program` is also supplied.
- Do not add `.rs` program inference by analogy with `.go`; a Rust source file is not an executable launch target. Rust launch uses an explicit built binary or a named configuration targeting that binary.
- Repository fixtures and real-adapter tests must prove a real breakpoint stop, state inspection through stack and scopes/variables or evaluate with documented fallback, resume/termination cleanup, named launch configuration, and owned attach only when platform policy permits it safely.

#### External and Agent Verification

- Search for and screen public Rust candidates only after repo-owned gate/fixture behavior succeeds. Candidate records precede any untrusted execution and cover Cargo/build-script/proc-macro/task/config risks.
- Real public-project debug attempts run through fresh subagents in phase-owned scratch and isolated cache/home environments; containerized execution is preferred where practical, with an explicit inspected host fallback otherwise.
- The orchestrator audits corresponding Copilot CLI JSONL transcripts, records actual commands/wrong turns/cleanup, fixes blocking product or docs gaps, and appends rerun evidence without erasing original outcomes.
- Because Phase 22 changes `src/adapters/provision/**` and `src/cli/commands/setupAdapters.ts`, `/gsd-verify-work` is incomplete until the orchestrator personally executes hand-driven smoke Sequences A and B plus provisioning-applicable Sequence C steps C1-C6 and records verbatim passing output in `22-UAT.md`; UAT cannot reach `status: complete` before all pass.

### the agent's Discretion

- Exact module boundaries inside existing descriptor/provisioning/test helpers, provided they follow Phase 21 structure and preserve typed safety behavior.
- Exact Rust fixture contents, breakpoint lines, and screened public repositories, subject to the safety/coverage constraints.
- Whether safe owned PID attach is implemented as a passing automated scenario or recorded as a platform-policy blocker, based on real CodeLLDB evidence.

### Deferred Ideas (OUT OF SCOPE)

- Generic C/C++ or LLVM `lldb-dap` support.
- Remote CodeLLDB transports or permission-escalating attach workarounds.
- Automatic launch inference from `.rs` source files.
- New first-class CLI flags unless real CodeLLDB operation demonstrates a stable cross-project need not expressible through launch JSON.
</user_constraints>

## Summary

CodeLLDB `v1.12.2` is a technically plausible fit for dap-cli's existing server-adapter architecture: its tagged native adapter source implements a TCP `--port` mode binding `Ipv4Addr::LOCALHOST`, and the repository already has a localhost-only server descriptor/connector pattern for Delve. `[CITED: https://github.com/vadimcn/codelldb/blob/v1.12.2/src/codelldb/src/lib.rs]` `[VERIFIED: codebase grep]` This is supporting evidence for a gate plan, not a gate pass: the selected released binary has not been run directly against a Rust debuggee and its live listener has not been inspected in this research.

Provisioning is the material risk. The official `darwin-arm64` released VSIX was stream-listed read-only during research and contains `extension/adapter/codelldb`, `extension/lldb/bin/lldb-server`, `extension/lldb/lib/liblldb.dylib`, an embedded Python 3.12 tree, adapter Python scripts, and `extension/lang_support/rust.py`. `[VERIFIED: official GitHub release asset inspection]` The same inspection found no archive path containing `license`, `notice`, `copying`, `copyright`, or `third`, while the packaged manifest declares `"license": "MIT"` and tagged CodeLLDB source includes an MIT license requiring inclusion of its notice. `[VERIFIED: official GitHub release asset inspection]` `[CITED: https://github.com/vadimcn/codelldb/blob/v1.12.2/LICENSE]` The official build workflow also downloads a separate LLDB package from `vadimcn/lldb-build`. `[CITED: https://github.com/vadimcn/codelldb/blob/v1.12.2/.github/workflows/build.yml]` Consequently the bundled-runtime license, notice, source provenance, checksum, and caching disposition remains a blocking investigation before any download provisioner commit.

A second integration boundary is now clear: CodeLLDB's documented `cargo` launch convenience is resolved by the VS Code extension TypeScript layer, which runs Cargo and transforms the configuration into a concrete program launch; the standalone adapter schema has `program`, `args`, `cwd`, `env`, `sourceLanguages`, `sourceMap`, and `pid`, but no `cargo` field. `[CITED: https://github.com/vadimcn/codelldb/blob/v1.12.2/extension/cargo.ts]` `[CITED: https://github.com/vadimcn/codelldb/blob/v1.12.2/src/codelldb-types/src/lib.rs]` Phase 22 should implement and document explicit compiled-Rust-binary launch first, and must not represent raw VS Code `cargo` configurations as supported direct-DAP behavior unless a separate proved translation design is approved.

**Primary recommendation:** Begin the phase with a documentation/evidence-only gate plan for released-artifact transport and full bundled-asset provenance; permit descriptor/provisioner implementation only after those gates are recorded as passing.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Released-artifact transport proof | Adapter process boundary | Controller / DAP client | The CodeLLDB binary chooses its listener and DAP behavior; dap-cli can only connect after this behavior is proven. `[CITED: https://github.com/vadimcn/codelldb/blob/v1.12.2/src/codelldb/src/lib.rs]` |
| Loopback-only enforcement | Adapter descriptor / process boundary | OS observation during gate | dap-cli's `server` transport connects to `127.0.0.1`, but only live adapter evidence proves the spawned listener is not exposed on wildcard interfaces. `[VERIFIED: codebase grep]` |
| VSIX download, integrity, extraction, cache | Provisioning layer | CLI setup reporting | Existing Phase 21 modules own consent, checksum, extraction, locking, atomic install, and errors. `[VERIFIED: codebase grep]` |
| `type: "lldb"` mapping and request retention | Config layer | Adapter registry | Existing launch config mapping chooses built-in adapters; CodeLLDB native DAP defines the request fields that can be retained meaningfully. `[VERIFIED: codebase grep]` `[CITED: https://github.com/vadimcn/codelldb/blob/v1.12.2/src/codelldb-types/src/lib.rs]` |
| Rust compilation and fixture binary | Test fixture / build step | Config layer | CodeLLDB launches an executable, not a raw `.rs` source file; fixture setup must produce a debug executable first. `[CITED: https://github.com/vadimcn/codelldb/blob/v1.12.2/MANUAL.md]` |
| External crate validation | Verification evidence layer | Isolation environment | External Cargo/build-script/proc-macro behavior is untrusted and is permitted only after owned fixtures pass. `[CITED: 22-CONTEXT.md]` |

## Project Constraints (from copilot-instructions.md)

- GSD workflows are used only when explicitly requested, and this requested Phase 22 research is within that workflow. `[CITED: .github/copilot-instructions.md]`
- For every `/gsd-verify-work` round, the orchestrator must personally run `dev/smoke/hand-driven-smoke.md` Sequences A and B through a real terminal; because this phase changes provisioning/setup-adapters surfaces, it must also run applicable Sequence C steps C1-C6 and paste all verbatim output into `22-UAT.md`; tests or scripts are not substitutes. `[CITED: .github/copilot-instructions.md; dev/smoke/hand-driven-smoke.md]`
- UAT cannot be marked complete unless Sequences A and B and every applicable Sequence C step C1-C6 appear under `## Hand-Driven CLI Smoke` with passing results. `[CITED: dev/smoke/hand-driven-smoke.md]`
- This research pass is constrained to writing this research artifact only; no product code, no commit, and no modification of the existing Phase 20 unstaged edit. `[CITED: user request]`

## Blocking Evidence Gates

No row below is a passed gate. Official source and read-only artifact inspection narrow the execution plan; they do not replace required live and provenance evidence.

| Gate | Evidence Available Now | Missing Passing Evidence | Implementation Blocked Until Pass |
|------|------------------------|--------------------------|-----------------------------------|
| R-00 VSIX provenance, checksum, and caching disposition | Official `v1.12.2` API metadata exposes SHA-256 digests for seven release assets; a read-only `darwin-arm64` VSIX listing confirms its runtime tree and found no obvious license/notice entry. `[VERIFIED: official GitHub release API]` `[VERIFIED: official GitHub release asset inspection]` | Inspect each proposed supported platform VSIX; record extracted layout, executable readiness, upstream and bundled LLDB/Python licenses/notices, `vadimcn/lldb-build` provenance chain, digest validation procedure, and explicit caching/distribution conclusion. | Checksum table, supported download matrix, `codelldb` provisioner, setup-adapters exposure. |
| R-01 direct native DAP operation | Tagged source has a standalone adapter TCP path; launch schema supports explicit executable programs and standard stopped-state inspection. `[CITED: https://github.com/vadimcn/codelldb/blob/v1.12.2/src/codelldb/src/lib.rs]` `[CITED: https://github.com/vadimcn/codelldb/blob/v1.12.2/src/codelldb-types/src/lib.rs]` | Execute the approved extracted released adapter outside VS Code against a phase-owned Rust debug binary; record initialize/launch/breakpoint/stack/scopes-or-evaluate/resume/cleanup transcript. | Built-in descriptor and registry integration. |
| R-01 loopback-only live listener | Tagged source binds `--port` with `Ipv4Addr::LOCALHOST`. `[CITED: https://github.com/vadimcn/codelldb/blob/v1.12.2/src/codelldb/src/lib.rs]` | While that released adapter awaits the DAP connection, capture the process/listening socket showing only loopback exposure using the exact invocation intended by the descriptor. | Any server descriptor commit; wildcard exposure is a blocker. |
| R-05 Cargo/config contract | The extension's `Cargo.resolveCargoConfig` resolves artifacts or runner RPC then deletes `cargo`; native DAP request structs omit `cargo`. `[CITED: https://github.com/vadimcn/codelldb/blob/v1.12.2/extension/cargo.ts]` `[CITED: https://github.com/vadimcn/codelldb/blob/v1.12.2/src/codelldb-types/src/lib.rs]` | Plan 22-06 rejects every extension-owned `cargo` configuration before native DAP forwarding, including `cargo` plus `program`, with typed explicit-binary recovery and command-layer regression tests. | Claims of supported Cargo-shaped `launch.json` usage. |

### Gate Execution Recommendation

1. Use a phase-owned owned Rust binary built with debug symbols; do not clone or execute a public project in R-00/R-01. `[CITED: 22-SCENARIOS.md]`
2. Fetch only the approved `v1.12.2` platform artifact needed for the host spike, verify its official SHA-256, inventory its extracted contents and license/notices, and retain exact evidence paths in phase results. `[CITED: 22-LANGUAGE-ONBOARDING-PRD.md]` `[VERIFIED: official GitHub release API]`
3. Invoke its `extension/adapter/codelldb` directly with the proved bundled-library/runtime arrangement and TCP port option, inspect its live socket before connecting, then drive DAP through the owned Rust target. The exact executable arguments and environment are outputs of the gate, not assumptions to bake into source. `[CITED: https://github.com/vadimcn/codelldb/blob/v1.12.2/src/codelldb/src/lib.rs]` `[VERIFIED: official GitHub release asset inspection]`
4. Stop without product implementation if transport fails, exposure is not loopback-only, or provenance/license review lacks an acceptable cached-asset disposition. `[CITED: 22-CONTEXT.md]`

## Standard Stack

### Core

| Component | Version / Pin | Purpose | Prescriptive Use |
|-----------|---------------|---------|------------------|
| CodeLLDB platform VSIX | `v1.12.2` | Approved Rust-focused native DAP runtime payload | Use only after R-00/R-01 pass for each supported asset; do not switch adapters silently. `[VERIFIED: official GitHub release API]` `[CITED: 22-CONTEXT.md]` |
| Existing server adapter abstraction | repository current | Start a local adapter with an allocated port and connect over DAP | Reuse only after released-artifact loopback evidence passes. `[VERIFIED: codebase grep]` |
| Existing Phase 21 provision framework | repository current | Consent-gated verified download, lock, extraction, atomic cache install, setup reporting | Extend for the full CodeLLDB runtime tree; do not add a parallel installer. `[VERIFIED: codebase grep]` `[CITED: 22-CONTEXT.md]` |
| Existing ZIP extraction primitive (`yauzl`) | configured `^3.3.1` | Safe extraction of VSIX ZIP-format payloads | Reuse `src/adapters/provision/extractZip.ts`; test nested CodeLLDB paths and executable readiness. `[VERIFIED: package.json and codebase grep]` |
| Rust toolchain | local `rustc`/`cargo` `1.94.0` | Build owned debug fixture and later screened examples | Use for explicit compiled-binary verification, not raw `.rs` launch inference. `[VERIFIED: local environment audit]` `[CITED: 22-CONTEXT.md]` |

### Supporting

| Component | Version / Status | Purpose | When to Use |
|-----------|------------------|---------|-------------|
| Vitest | configured `^3.2.4` | Unit/integration/packaging verification | Extend established adapter, provisioning, config, docs, and real-integration test surfaces after gates pass. `[VERIFIED: package.json and codebase grep]` |
| GitHub CLI | local `2.92.0` | Retrieve official release metadata/assets during gate evidence work | Use in evidence-only plan to capture API digests and approved downloads. `[VERIFIED: local environment audit]` |
| Docker | CLI `27.3.1`; daemon unavailable during research | Preferred containment for later public-crate execution | Treat as unavailable until a later execution plan starts or proves a daemon; retain inspected isolated-host fallback. `[VERIFIED: local environment audit]` `[CITED: 22-LANGUAGE-ONBOARDING-PRD.md]` |

### Alternatives Considered

| Instead of | Could Use | Disposition |
|------------|-----------|-------------|
| Approved CodeLLDB | LLVM `lldb-dap` | Recorded runner-up only; a failed blocker returns for explicit selection, never automatic substitution. `[CITED: 22-CONTEXT.md]` |
| Explicit compiled Rust program launch | VS Code extension-owned `cargo` config | Do not advertise for direct dap-cli DAP until a separately proved resolver contract exists; native adapter does not deserialize `cargo`. `[CITED: https://github.com/vadimcn/codelldb/blob/v1.12.2/extension/cargo.ts]` `[CITED: https://github.com/vadimcn/codelldb/blob/v1.12.2/src/codelldb-types/src/lib.rs]` |
| Phase 21 provision primitives | New CodeLLDB-specific download/cache framework | Reject; locked requirement is to extend the established model. `[CITED: 22-CONTEXT.md]` |

**Installation:** No new npm, Cargo, or Python dependency is recommended for dap-cli implementation. The external payload under review is the pinned upstream VSIX, and its installation is blocked by R-00. `[VERIFIED: codebase grep]` `[CITED: 22-CONTEXT.md]`

## Official Release Asset Inventory

GitHub's official release API reported `published_at: 2026-04-21T03:20:56Z` for tag `v1.12.2`. `[VERIFIED: official GitHub release API]` This is the complete release-asset inventory discovered during research; it is not yet the approved dap-cli support matrix.

| Asset | Bytes | GitHub Reported SHA-256 | Research Disposition |
|-------|------:|------------------------|----------------------|
| `codelldb-bootstrap.vsix` | 93,669 | `70e382942d2e13e626d749364f6a7f9a74dc82abcb5700c7faaa3f5bbba5ddcb` | Metadata recorded; not a proven standalone runtime payload. `[VERIFIED: official GitHub release API]` |
| `codelldb-darwin-arm64.vsix` | 45,389,090 | `c836b81c6f2da467b5920a376a7bfc849dc4b4d81b19779dedf1c685cb4aa1a0` | Metadata and read-only layout sample recorded; full license/caching gate pending. `[VERIFIED: official GitHub release API and asset inspection]` |
| `codelldb-darwin-x64.vsix` | 47,730,884 | `8270a342929bdc0deb6d7d3931c08d5ba6018265f840dd0508c4247fb8d32e8d` | Candidate only; inspect before support. `[VERIFIED: official GitHub release API]` |
| `codelldb-linux-arm64.vsix` | 54,541,539 | `f7c83ad67cc860fe6d753e8123b57a4db89c1fb00aef4b85a2f858334cdbaeb0` | Candidate only; inspect before support. `[VERIFIED: official GitHub release API]` |
| `codelldb-linux-armhf.vsix` | 52,534,752 | `37fdac94b1c8706437b44f82d5d1b776202cdc923008f086a7e11ead8ea199d1` | Candidate only; platform mapping/support decision pending. `[VERIFIED: official GitHub release API]` |
| `codelldb-linux-x64.vsix` | 55,572,743 | `b85b45a8570051d535b0927c6c9da11c39f3a056c73559064647faf7f37f637d` | Candidate only; inspect before support. `[VERIFIED: official GitHub release API]` |
| `codelldb-win32-x64.vsix` | 50,832,069 | `aa3f45175da3850973632fef1a1af0ed2382866bfd3dcd836544973831388a25` | Candidate only; inspect before support. `[VERIFIED: official GitHub release API]` |

### Released VSIX Payload Findings

The following observations are limited to the official `codelldb-darwin-arm64.vsix` streamed from GitHub by asset id during research; other platform packages require their own gate inspection.

| Observed Entry / Signal | Implication for Planning |
|-------------------------|--------------------------|
| `extension/adapter/codelldb` | Candidate adapter entrypoint exists in the full platform VSIX. `[VERIFIED: official GitHub release asset inspection]` |
| `extension/lldb/bin/lldb`, `extension/lldb/bin/lldb-server`, `extension/lldb/bin/lldb-argdumper` | Cached installation carries native debugger executables in addition to the adapter. `[VERIFIED: official GitHub release asset inspection]` |
| `extension/lldb/lib/liblldb.dylib` and `extension/lldb/lib/libpython312.dylib` | A full runtime tree must be preserved and its provenance/licensing reviewed; copying only `codelldb` is not a valid plan. `[VERIFIED: official GitHub release asset inspection]` |
| `extension/lldb/lib/python3.12/...` and `extension/adapter/scripts/codelldb/...` | Python runtime/scripts are bundled assets within the cache and must be covered by the provenance/caching conclusion. `[VERIFIED: official GitHub release asset inspection]` |
| `extension/lang_support/rust.py` | Rust language-support behavior relies on an additional payload path. `[VERIFIED: official GitHub release asset inspection]` |
| `extension/package.json` declares `name: "vscode-lldb"`, `publisher: "vadimcn"`, `version: "1.12.2"`, `license: "MIT"` | Manifest identity aligns with the approved release, but a declaration is not a complete notices review. `[VERIFIED: official GitHub release asset inspection]` |
| No entry name matched `license`, `notice`, `copying`, `copyright`, or `third` | The sampled package does not visibly carry a named notice/license file; legal/provenance disposition remains blocking, especially because upstream MIT text requires inclusion in copies/substantial portions. `[VERIFIED: official GitHub release asset inspection]` `[CITED: https://github.com/vadimcn/codelldb/blob/v1.12.2/LICENSE]` |

## Package Legitimacy Audit

No ecosystem package addition is proposed in this phase: existing repository dependencies already provide ZIP extraction, network fetch, validation, and locking. `[VERIFIED: package.json and codebase grep]` The installable external object is an official GitHub Release VSIX rather than an npm/PyPI/crates.io dependency, so `slopcheck` package-name validation is not applicable; the stronger locked artifact provenance/checksum/license gate applies instead.

| Payload | Registry / Authority | Provenance Checked During Research | Gate Status | Disposition |
|---------|----------------------|------------------------------------|-------------|-------------|
| CodeLLDB `v1.12.2` VSIX assets | Official `vadimcn/codelldb` GitHub Release | Tag, publication timestamp, filenames, byte sizes, GitHub SHA-256 digests; sampled macOS arm64 layout. `[VERIFIED: official GitHub release API and asset inspection]` | Pending | Do not add to provisioner until R-00 passes. |
| Bundled LLDB/Python/native runtime tree | Included within CodeLLDB platform VSIX; workflow references `vadimcn/lldb-build` input | Payload existence and workflow input identified. `[VERIFIED: official GitHub release asset inspection]` `[CITED: https://github.com/vadimcn/codelldb/blob/v1.12.2/.github/workflows/build.yml]` | Pending | Require license/notices/provenance/caching conclusion before installation code. |

**Packages removed due to slopcheck verdict:** none; no new ecosystem package is recommended.

**Packages flagged as suspicious:** none classified; bundled native runtime provenance is instead an explicit unresolved blocker.

## Architecture Patterns

### System Architecture Diagram

```text
Gate-only evidence (must pass first)
  official CodeLLDB v1.12.2 release API + VSIX payload
       | verify digest, layout, notices, bundled runtime provenance
       v
  approved extracted artifact in phase-owned scratch
       | launch standalone adapter; observe loopback socket
       v
  owned compiled Rust fixture <---- DAP probe ----> adapter/codelldb
       | breakpoint + stack + scopes/evaluate + cleanup evidence
       v
  pass / blocker record
       |
       | pass only
       v
Product implementation
  launch.json type "lldb" --> config mapping --> built-in codelldb registry
       |                                      |
       |                              lazy provision request
       |                                      v
       |                        consent/checksum/safe ZIP/lock/atomic cache
       v                                      |
  controller --> localhost server descriptor --> cached full CodeLLDB runtime
       |
       v
  Rust executable debug session --> stopped state / inspection / cleanup
```

### Recommended Project Structure After Gates Pass

```text
src/
  adapters/
    builtins/codelldb.ts           # Descriptor using proven standalone invocation
    provision/codelldb.ts          # Full validated VSIX runtime installation
    provision/checksums.ts         # Only approved assets and verified SHA-256 values
    registry.ts                    # Built-in adapter registration
  config/
    launchConfig.ts                # lldb -> codelldb mapping
    programInference.ts            # Explicitly retain no .rs inference
tests/
  fixtures/rust/                   # Owned deterministic Rust debug target
  adapters/codelldb.test.ts
  adapters/provision/codelldb.test.ts
  integration/codelldbAdapter.test.ts
  config/                          # lldb mapping and no-.rs-inference coverage
docs/adapter-setup.md
dap-cli/skills/dap-cli/references/rust-codelldb.md
```

All paths above are recommended later implementation surfaces derived from existing Delve and provisioner organization; none exist as CodeLLDB changes at research completion. `[VERIFIED: codebase grep]`

### Pattern 1: Gate Before Descriptor or Provisioner

**What:** Keep R-00/R-01 as evidence-only work that produces pass/blocker records before any product implementation commit. `[CITED: 22-CONTEXT.md]`

**When to use:** This is mandatory for the first Phase 22 execution wave because the adapter is a downloaded native/runtime payload and server exposure is security-sensitive.

**Why:** The official source provides a strong transport hypothesis, but only the approved released artifact running in the intended standalone layout establishes dap-cli compatibility and live listener behavior.

### Pattern 2: Full-Tree VSIX Provisioning Using Phase 21 Primitives

**What:** Once R-00 passes, install the validated CodeLLDB VSIX tree atomically into adapter cache, retaining `extension/adapter`, `extension/lldb`, adapter scripts, and language support files needed by the approved runtime. `[VERIFIED: official GitHub release asset inspection]`

**When to use:** Provisioning implementation after an explicit support matrix and caching/license conclusion exist.

**How:** Extend existing consent, download, SHA-256 verification, safe ZIP extraction, lock, staging, install marker, error, setup-adapters, and packaging contracts instead of creating new mechanics. `[VERIFIED: codebase grep]` `[CITED: 22-CONTEXT.md]`

### Pattern 3: Direct-DAP Rust Program Contract

**What:** Make the first supported launch shape an explicit debug executable with `program`, optional `cwd`/`args`/`env`, `sourceLanguages: ["rust"]`, and applicable `sourceMap`/expression settings. The native schema and manual support those fields. `[CITED: https://github.com/vadimcn/codelldb/blob/v1.12.2/src/codelldb-types/src/lib.rs]` `[CITED: https://github.com/vadimcn/codelldb/blob/v1.12.2/MANUAL.md]`

**When to use:** Owned fixtures, named-config validation, documentation, and screened projects that build a binary through a separately explicit preparation step.

**Constraint:** Do not pass through and claim support for raw `cargo` launch objects: official extension code resolves `cargo` before DAP, and the native adapter schema does not accept it. `[CITED: https://github.com/vadimcn/codelldb/blob/v1.12.2/extension/cargo.ts]` `[CITED: https://github.com/vadimcn/codelldb/blob/v1.12.2/src/codelldb-types/src/lib.rs]`

### Pattern 4: Stable Non-UI DAP Verification

**What:** Configure an owned launch to avoid relying on VS Code terminal behavior, prove source stop and state through DAP, and accept scopes/variables as the stable inspection route when expression ergonomics vary. CodeLLDB exposes scopes/variables and evaluate handlers, while its terminal behavior can involve client `runInTerminal` capability. `[CITED: https://github.com/vadimcn/codelldb/blob/v1.12.2/src/codelldb/src/debug_session/variables.rs]` `[CITED: https://github.com/vadimcn/codelldb/blob/v1.12.2/src/codelldb/src/debug_session/launch.rs]`

**When to use:** Direct gate transcript and real adapter integration tests.

### Anti-Patterns to Avoid

- **Treating official source as a passed live listener gate:** retain source findings as probe justification; record a pass only after the released artifact socket is observed in execution. `[CITED: 22-CONTEXT.md]`
- **Extracting only `extension/adapter/codelldb`:** the sampled VSIX bundles LLDB, Python, scripts, and Rust support assets required for the packaged runtime. `[VERIFIED: official GitHub release asset inspection]`
- **Forwarding VS Code `cargo` config directly into native DAP:** that field is extension-resolved and absent from native launch arguments. `[CITED: https://github.com/vadimcn/codelldb/blob/v1.12.2/extension/cargo.ts]` `[CITED: https://github.com/vadimcn/codelldb/blob/v1.12.2/src/codelldb-types/src/lib.rs]`
- **Inferring a launch target from `.rs`:** a Rust source path is not the executable required by CodeLLDB launch. `[CITED: 22-CONTEXT.md]` `[CITED: https://github.com/vadimcn/codelldb/blob/v1.12.2/MANUAL.md]`
- **Validating on arbitrary public crates before owned proof:** Cargo build scripts and proc macros are executable untrusted input and must be screened after repo-owned flows pass. `[CITED: 22-CONTEXT.md]`

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Adapter selection | A silent fallback to `lldb-dap` | Stop and request explicit selection if CodeLLDB blocks | Adapter choice is locked and transport/provenance failures are decision points. `[CITED: 22-CONTEXT.md]` |
| Download/cache integrity | A CodeLLDB-only downloader or ad hoc digest check | Phase 21 provision pipeline and checksum source of record | Consent, lock, atomic install, proxy/error, and packaging contracts already exist. `[VERIFIED: codebase grep]` |
| VSIX extraction | Shelling out to `unzip` or selectively copying binaries | Existing safe ZIP extraction plus CodeLLDB nested-layout tests | Archives cross a supply-chain trust boundary and the runtime is a multi-directory tree. `[VERIFIED: codebase grep]` `[VERIFIED: official GitHub release asset inspection]` |
| Cargo launch support | A partial imitation of CodeLLDB extension Cargo orchestration slipped into config forwarding | Explicit compiled executable for Phase 22, unless a separately approved resolver design is proved | Official Cargo support uses extension tasks/RPC and artifact selection before native DAP. `[CITED: https://github.com/vadimcn/codelldb/blob/v1.12.2/extension/cargo.ts]` |
| Rust inspection success | Expression-only success criteria | Standard DAP breakpoint, stack, scopes/variables, with evaluate recorded where reliable | CodeLLDB implements both paths and locked requirements permit a documented fallback. `[CITED: https://github.com/vadimcn/codelldb/blob/v1.12.2/src/codelldb/src/debug_session/variables.rs]` `[CITED: 22-CONTEXT.md]` |
| External safety | Unscreened `cargo build`/`cargo test` on public repositories | Candidate ledger, SHA pin, build-script/proc-macro screen, isolation and transcript audit | Cargo compilation may execute repository-supplied code. `[CITED: 22-CONTEXT.md]` |

**Key insight:** CodeLLDB onboarding should be thin in product abstraction and heavy in artifact/transport evidence: once the binary and payload are approved, the repository already has the right descriptor and provisioner ownership boundaries. `[VERIFIED: codebase grep]`

## Common Pitfalls

### Pitfall 1: Committing Integration Before the Blocking Spike

**What goes wrong:** Descriptor or provisioner code codifies an invocation, listener, asset matrix, or cache policy that has not been accepted.

**Why it happens:** Tagged source and a successful file listing look close to execution evidence, but the locked contract requires the released artifact under direct DAP and live socket observation.

**How to avoid:** Make the first implementation plan evidence-only and place a hard checkpoint between gate results and product tasks. `[CITED: 22-CONTEXT.md]`

**Warning signs:** A plan editing `src/adapters/` before it creates R-00/R-01 results; a claim that the loopback gate passed based solely on source.

### Pitfall 2: Missing Bundled Runtime Obligations

**What goes wrong:** dap-cli caches a VSIX tree containing LLDB and Python assets without a defensible notices/provenance/caching record.

**Why it happens:** The adapter package manifest says MIT, while the full platform package also carries upstream native runtimes; the sampled archive has no visibly named notice/license entry and the official workflow sources LLDB from a separate release input. `[VERIFIED: official GitHub release asset inspection]` `[CITED: https://github.com/vadimcn/codelldb/blob/v1.12.2/.github/workflows/build.yml]`

**How to avoid:** Inspect each supported VSIX and its upstream runtime provenance before committing a support/checksum matrix; record the caching decision explicitly.

**Warning signs:** A checksum table exists before a notice inventory; an installer retains only the adapter executable; a platform is supported solely because an asset name exists.

### Pitfall 3: Confusing Extension Configuration With DAP Configuration

**What goes wrong:** A named `type: "lldb"` configuration containing `cargo` is passed straight to native CodeLLDB and fails because no executable program was resolved.

**Why it happens:** The manual documents user-facing extension behavior, while the extension implements Cargo artifact/RPC resolution before native DAP. `[CITED: https://github.com/vadimcn/codelldb/blob/v1.12.2/MANUAL.md]` `[CITED: https://github.com/vadimcn/codelldb/blob/v1.12.2/extension/cargo.ts]`

**How to avoid:** Document and test explicit executable configs as supported; add a clear unsupported/configuration outcome for `cargo` unless a translation feature is separately scoped and proved.

**Warning signs:** An integration test contains `cargo` but never demonstrates how it becomes `program`; docs copy VS Code Cargo snippets without a dap-cli qualifier.

### Pitfall 4: Testing the Wrong Launch Target

**What goes wrong:** `.rs` is treated like `.go`, causing attempts to launch source rather than a compiled debug binary.

**Why it happens:** Delve precedent includes Go-friendly inference, while CodeLLDB requires an executable or target-create commands. `[CITED: https://github.com/vadimcn/codelldb/blob/v1.12.2/MANUAL.md]`

**How to avoid:** Add negative coverage preserving no `.rs` inference and keep build preparation explicit.

**Warning signs:** `.rs` enters extension-to-adapter inference tables or documentation uses `--program src/main.rs`.

### Pitfall 5: Assuming Attach Semantics Match Delve

**What goes wrong:** Tests send the wrong attach field or kill an owned process expected to survive disconnect.

**Why it happens:** CodeLLDB attach uses `pid`, and tagged adapter source sets `terminate_on_disconnect = false` for attach while launch sets it `true`. `[CITED: https://github.com/vadimcn/codelldb/blob/v1.12.2/src/codelldb-types/src/lib.rs]` `[CITED: https://github.com/vadimcn/codelldb/blob/v1.12.2/src/codelldb/src/debug_session/launch.rs]`

**How to avoid:** Test attach only against an owned long-running fixture, prove detach/survival and explicit final cleanup, or record the allowed platform-policy blocker.

**Warning signs:** `processId` appears in CodeLLDB attach tests; attach validation requires host security-setting changes.

### Pitfall 6: Relying on Container Isolation Without Availability Proof

**What goes wrong:** External-validation plans assume a running container runtime and stall, or fall back to host execution without recording safety controls.

**Why it happens:** Docker CLI presence does not prove a live daemon; during this research `docker info` could not connect to the local daemon. `[VERIFIED: local environment audit]`

**How to avoid:** Add an environment checkpoint before public-crate execution; use the locked inspected isolated-cache/home host fallback only when documented.

**Warning signs:** A public project command is executed before either container readiness or fallback screening is recorded.

## Code Examples

Verified configuration patterns from official CodeLLDB documentation and tagged native schema follow. These examples describe later proof targets; they do not assert gates passed.

### Explicit Rust Binary Launch Contract

```jsonc
{
  "name": "Debug owned Rust binary",
  "type": "lldb",
  "request": "launch",
  "program": "${workspaceFolder}/target/debug/owned_fixture",
  "cwd": "${workspaceFolder}",
  "args": [],
  "env": {},
  "sourceLanguages": ["rust"],
  "terminal": "console"
}
```

Source: `program`, `cwd`, `args`, `env`, `sourceLanguages`, and `terminal` are documented launch/native fields; Rust formatter enablement uses `sourceLanguages: ["rust"]`. `[CITED: https://github.com/vadimcn/codelldb/blob/v1.12.2/MANUAL.md]` `[CITED: https://github.com/vadimcn/codelldb/blob/v1.12.2/src/codelldb-types/src/lib.rs]`

### Owned Attach Contract

```jsonc
{
  "name": "Attach to owned Rust fixture",
  "type": "lldb",
  "request": "attach",
  "program": "${workspaceFolder}/target/debug/owned_fixture",
  "pid": 12345,
  "sourceLanguages": ["rust"]
}
```

Source: CodeLLDB documents `pid` and its native attach type accepts `pid`; OS attach restrictions must be honored and no security policy may be relaxed for validation. `[CITED: https://github.com/vadimcn/codelldb/blob/v1.12.2/MANUAL.md]` `[CITED: https://github.com/vadimcn/codelldb/blob/v1.12.2/src/codelldb-types/src/lib.rs]` `[CITED: 22-CONTEXT.md]`

### Extension-Only Cargo Boundary

```jsonc
{
  "type": "lldb",
  "request": "launch",
  "cargo": { "args": ["test", "--no-run"] }
}
```

This is a documented VS Code extension configuration, not yet a valid dap-cli direct-adapter contract: official `extension/cargo.ts` resolves it to a concrete `program` and removes `cargo`, whereas native `LaunchRequestArguments` has no `cargo` property. `[CITED: https://github.com/vadimcn/codelldb/blob/v1.12.2/MANUAL.md]` `[CITED: https://github.com/vadimcn/codelldb/blob/v1.12.2/extension/cargo.ts]` `[CITED: https://github.com/vadimcn/codelldb/blob/v1.12.2/src/codelldb-types/src/lib.rs]`

### Candidate Server Descriptor Shape, Gated

```typescript
// Planning shape only: implement only after released-artifact R-01 passes.
{
  type: 'server',
  command: '<validated-cache-root>/extension/adapter/codelldb',
  args: ['--port=${port}'],
  host: '127.0.0.1'
}
```

Source: dap-cli already models loopback-only server descriptors and port substitution; tagged CodeLLDB source implements a localhost TCP listener when configured with a port. The final command, argument spelling, required library/runtime environment, and readiness behavior must be copied from live gate evidence, not this sketch. `[VERIFIED: codebase grep]` `[CITED: https://github.com/vadimcn/codelldb/blob/v1.12.2/src/codelldb/src/lib.rs]`

## State of the Art

| Earlier Behavior | Current Baseline | When Changed | Planning Impact |
|------------------|------------------|--------------|-----------------|
| CodeLLDB depended on external Python/LLDB variants | Platform packages bundle LLDB and Python runtime assets | Python bundled beginning `v1.6.0`; current sampled `v1.12.2` confirms payload | Provisioning is full-runtime supply-chain work, not a single binary install. `[CITED: https://github.com/vadimcn/codelldb/blob/v1.12.2/CHANGELOG.md]` `[VERIFIED: official GitHub release asset inspection]` |
| Maintained custom Rust language service/formatters | Stock LLDB-oriented approach with partial Rust toolchain formatters | `v1.11.0` | Tests should prove ordinary locals/inspection behavior and avoid promises about broader visualizer fidelity. `[CITED: https://github.com/vadimcn/codelldb/blob/v1.12.2/CHANGELOG.md]` |
| Cargo workflows previously required build-oriented setup | Extension supports normal Cargo command lines such as `cargo run` | `v1.11.6` | This capability lives in extension orchestration; direct dap-cli must not claim it without a resolver design. `[CITED: https://github.com/vadimcn/codelldb/blob/v1.12.2/CHANGELOG.md]` `[CITED: https://github.com/vadimcn/codelldb/blob/v1.12.2/extension/cargo.ts]` |
| Earlier bundled runtime versions | Bundled LLDB updated to `v21.1` and embedded Python is visible in platform VSIX | `v1.12.0` LLDB update; `v1.12.2` sampled asset | Review exactly the pinned payload and do not reuse historical license/runtime conclusions. `[CITED: https://github.com/vadimcn/codelldb/blob/v1.12.2/CHANGELOG.md]` `[VERIFIED: official GitHub release asset inspection]` |
| Rust `Option<String>::None` inspection issue | Fixed in CodeLLDB `v1.12.2` | `v1.12.2` | The approved baseline includes a directly Rust-relevant inspection fix. `[CITED: https://github.com/vadimcn/codelldb/blob/v1.12.2/CHANGELOG.md]` |

## Recommended Phase Plan Shape

| Wave | Goal | Files / Artifacts | Exit Condition |
|------|------|-------------------|----------------|
| 1 - Blocking gate only | Prove R-00 and R-01 without product implementation | Phase-owned evidence/results artifacts, owned Rust spike scratch only | Direct released-artifact DAP pass, live loopback proof, and accepted asset/license/provenance/caching conclusion; otherwise stop for explicit decision. `[CITED: 22-CONTEXT.md]` |
| 2 - Provisioner and descriptor | Extend Phase 21 model and register the adapter only after Wave 1 passes | `src/adapters/builtins/`, `src/adapters/provision/`, `src/adapters/registry.ts`, setup/packaging tests | Supported matrix installs complete validated runtime tree with typed safe failures and descriptor uses gate-proved invocation. `[VERIFIED: codebase grep]` |
| 3 - Rust configuration and real adapter | Map `lldb`, preserve native-DAP fields, retain no `.rs` inference, and prove owned launch/config/optional attach | `src/config/`, Rust fixtures, adapter/config/integration tests | Breakpoint, stack, scopes/variables-or-evaluate, teardown, named config, negative Cargo boundary, and attach result documented. `[CITED: 22-CONTEXT.md]` |
| 4 - Documentation and agent guidance | Teach supported explicit-binary workflow and honest limitations | setup docs, Rust reference, skill links, docs tests | Fresh agent can provision, compile, launch, inspect, diagnose, and clean up without assuming Cargo parity. `[CITED: 22-LANGUAGE-ONBOARDING-PRD.md]` |
| 5 - Screened external and fresh-agent hardening | Validate bounded real Rust projects after owned pass | candidate/result/hardening/transcript artifacts and isolated scratch | Initial outcomes retained, transcript audited, blocking gaps fixed and rerun. `[CITED: 22-CONTEXT.md]` |
| 6 - Verification closure | Full automated checks and required hand-driven CLI smoke | `22-UAT.md` | Orchestrator-recorded Sequence A/B plus provisioning-applicable Sequence C steps C1-C6 verbatim passing evidence; no unexamined blocker and no premature `status: complete`. `[CITED: .github/copilot-instructions.md; dev/smoke/hand-driven-smoke.md]` |

## Environment Availability

| Dependency | Required By | Available | Version / Evidence | Fallback / Action |
|------------|-------------|-----------|--------------------|-------------------|
| Node.js | dap-cli build/test/runtime | Yes | `v24.15.0` `[VERIFIED: local environment audit]` | Meets repository `>=22` engine. `[VERIFIED: package.json]` |
| npm | repository scripts | Yes | `11.12.1` `[VERIFIED: local environment audit]` | None needed. |
| Rust compiler | owned Rust fixture | Yes | `rustc 1.94.0` `[VERIFIED: local environment audit]` | None needed for local gate. |
| Cargo | owned fixture build; optional screened preparation | Yes | `cargo 1.94.0` `[VERIFIED: local environment audit]` | Use explicit build preparation only; not direct DAP Cargo support. |
| rustup toolchain | Rust formatter/toolchain context | Yes | `stable-aarch64-apple-darwin (default)` `[VERIFIED: local environment audit]` | Record toolchain in evidence. |
| LLDB on host | Diagnostic comparison only | Yes | Apple LLDB `lldb-1600.0.39.109` `[VERIFIED: local environment audit]` | Do not substitute host LLDB for bundled-runtime gate. |
| GitHub CLI | approved release retrieval/metadata | Yes | `2.92.0` `[VERIFIED: local environment audit]` | Use for official artifact evidence. |
| Docker daemon | Preferred external-project containment | No during research | `docker info` could not connect to daemon. `[VERIFIED: local environment audit]` | Future plan may start/prove containment or use documented isolated-host fallback after screening. `[CITED: 22-LANGUAGE-ONBOARDING-PRD.md]` |

**Missing dependencies with no fallback:** None for the owned macOS gate; it does not require Docker. `[VERIFIED: local environment audit]` `[CITED: 22-SCENARIOS.md]`

**Missing dependencies with fallback:** A running Docker daemon is unavailable for later preferred public-crate containment; the PRD permits an explicit inspected host fallback with isolated homes/caches and bounded cleanup. `[VERIFIED: local environment audit]` `[CITED: 22-LANGUAGE-ONBOARDING-PRD.md]`

## Validation Architecture

`workflow.nyquist_validation` is explicitly `true`, so the planner must provide task-level automated and manual gate coverage. `[VERIFIED: .planning/config.json]`

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest configured at `^3.2.4`. `[VERIFIED: package.json]` |
| Config file | `vitest.config.ts`. `[VERIFIED: workspace inventory]` |
| Quick run command | `npx vitest run tests/adapters/codelldb.test.ts tests/adapters/provision/codelldb.test.ts tests/config/launchConfig.test.ts tests/config/programInference.test.ts tests/integration/codelldbAdapter.test.ts` (after those files exist). |
| Full suite command | `npm run check`. `[VERIFIED: package.json]` |

### Scenario Requirements to Test Map

| Scenario | Behavior | Test / Evidence Type | Automated Command or Evidence | File Exists? |
|----------|----------|----------------------|-------------------------------|--------------|
| R-00 | Official asset digest/layout/license/provenance/caching gate | Manual blocking evidence | Recorded release API, extracted inventory, license/provenance decision in phase artifact before source commit | No - Wave 1 evidence artifact required. `[CITED: 22-SCENARIOS.md]` |
| R-01 | Standalone released adapter DAP and live loopback-only listener | Manual blocking integration spike | Owned Rust target DAP transcript plus socket observation from released artifact | No - Wave 1 evidence artifact required. `[CITED: 22-SCENARIOS.md]` |
| R-02 | Consent, checksum, extraction, cache/lock/atomic install, errors/setup | Unit/integration | `npx vitest run tests/adapters/provision/codelldb.test.ts tests/cli/setupAdaptersCommand.test.ts tests/packaging/` | New CodeLLDB test missing - Wave 2. `[VERIFIED: codebase grep]` |
| R-03 | Explicit Rust binary launch, stop, inspect, cleanup | Real adapter integration | `npx vitest run tests/integration/codelldbAdapter.test.ts` | Missing - Wave 3. |
| R-04 | `type: "lldb"` mapping and retained native fields | Unit + real config integration | `npx vitest run tests/config/launchConfig.test.ts tests/integration/codelldbAdapter.test.ts` | Existing config test file to extend; CodeLLDB integration missing. `[VERIFIED: workspace inventory]` |
| R-05 | Honest Cargo boundary or approved proven Cargo flow | Unit/docs + manual decision | Test diagnostic/documented behavior; do not manufacture pass-through Cargo support | Missing - decision follows R-01 research. `[CITED: 22-SCENARIOS.md]` |
| R-06 | Owned local PID attach lifecycle or platform-policy blocker | Real integration/manual evidence | Add integration scenario only if safe without policy modification; otherwise record blocker | Missing - discretionary after live evidence. `[CITED: 22-CONTEXT.md]` |
| R-07 | Absent/unsupported/corrupt asset and invalid target/config errors | Unit/integration | `npx vitest run tests/adapters/provision/codelldb.test.ts tests/config/` | Missing - Waves 2/3. |
| External/fresh-agent | Screened bounded public Rust behavior and transcript audit | Manual isolated evidence | Candidate/result/hardening ledgers after owned pass | Missing by design until gates/fixtures pass. `[CITED: 22-CONTEXT.md]` |
| Final UAT | CLI smoke Sequences A and B plus applicable Sequence C steps C1-C6 | Mandatory manual gate | Orchestrator terminal output pasted verbatim into `22-UAT.md`; tests and subagents are not substitutes | Missing until verification. `[CITED: .github/copilot-instructions.md; dev/smoke/hand-driven-smoke.md]` |

### Sampling Rate

- **Per implementation task commit after gates:** Run focused Vitest files for touched adapter/provision/config/docs/integration surface.
- **Per implementation wave:** Run `npm test` plus the relevant real adapter or packaging checks. `[VERIFIED: package.json]`
- **Phase gate:** Run `npm run check`, complete evidence artifacts, then perform mandatory hand-driven smoke during `/gsd-verify-work`. `[VERIFIED: package.json]` `[CITED: .github/copilot-instructions.md]`

### Wave 0 / Gate Gaps

- [ ] Gate evidence artifact for official asset inventory, notice/license/provenance/caching disposition, and support matrix decision (R-00).
- [ ] Owned minimal Rust spike target and standalone released-artifact DAP/socket transcript (R-01).
- [ ] `tests/adapters/codelldb.test.ts` for descriptor invocation after R-01 passes.
- [ ] `tests/adapters/provision/codelldb.test.ts` plus synthetic nested VSIX fixture/support helpers after R-00 passes.
- [ ] `tests/integration/codelldbAdapter.test.ts` and owned Rust fixture after gate pass.
- [ ] Config/doc tests extending existing test surfaces for `lldb`, explicit program, no `.rs` inference, and Cargo boundary.

## Security Domain

Security enforcement was not disabled in project configuration; the phase crosses network download, native code execution, archive extraction, local listening socket, attach, and untrusted public-code boundaries. `[VERIFIED: .planning/config.json]` `[CITED: 22-CONTEXT.md]`

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|------------------|
| V2 Authentication | No | No authentication feature is introduced; do not add remote/RPC exposure. `[CITED: 22-CONTEXT.md]` |
| V3 Session Management | No | Local debug session lifecycle remains existing controller behavior. `[VERIFIED: codebase grep]` |
| V4 Access Control | Yes, local attach boundary | Only owned PID attach when allowed without weakening platform policy; otherwise record blocker. `[CITED: 22-CONTEXT.md]` |
| V5 Validation, Sanitization and Encoding | Yes | Existing structured config validation, safe ZIP extraction, validated platform keys and typed provisioning errors. `[VERIFIED: codebase grep]` |
| V6 Stored Cryptography / Integrity | Yes, integrity only | Pin official SHA-256 values and verify downloaded assets before install; no custom cryptography. `[VERIFIED: official GitHub release API]` `[VERIFIED: codebase grep]` |
| V12 Files and Resources | Yes | Safe archive extraction, phase-owned scratch, atomic cache installation, and cleanup. `[VERIFIED: codebase grep]` `[CITED: 22-CONTEXT.md]` |
| V13 API / Communications | Yes, local DAP listener | Permit server descriptor only after live loopback-only evidence. `[CITED: 22-CONTEXT.md]` |

### Known Threat Patterns for CodeLLDB Onboarding

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Substituted or altered platform VSIX | Tampering | Official pinned SHA-256 plus checksum-before-extract/install and recorded provenance. `[VERIFIED: official GitHub release API]` `[CITED: 22-CONTEXT.md]` |
| License/provenance gap in bundled native runtimes | Compliance / supply-chain risk | Block download provisioning until bundled LLDB/Python/notices and caching disposition are recorded. `[VERIFIED: official GitHub release asset inspection]` `[CITED: 22-CONTEXT.md]` |
| ZIP traversal/symlink or incomplete runtime install | Tampering / denial of service | Existing safe extractor and atomic full-tree install, with synthetic nested VSIX tests. `[VERIFIED: codebase grep]` |
| Adapter opens wildcard listener | Information disclosure / elevation of exposure | Observe the released adapter live; allow server descriptor only for loopback-only binding. `[CITED: 22-CONTEXT.md]` |
| Attaching to an unintended process or changing host ptrace policy | Elevation of privilege | Use only an owned PID; never change security policy; accept blocker. `[CITED: 22-CONTEXT.md]` `[CITED: https://github.com/vadimcn/codelldb/blob/v1.12.2/MANUAL.md]` |
| Running build scripts/proc macros from public Rust repositories | Tampering / execution of untrusted code | Screen before execution, SHA-pin, isolate cache/home, prefer container with disabled debug-time network, audit transcript and cleanup. `[CITED: 22-CONTEXT.md]` |

## Assumptions Log

No implementation decision below is treated as passed on assumption. The unresolved items are deliberately represented as blocking open questions or live evidence requirements.

| # | Claim Requiring Confirmation | Section | Risk if Wrong |
|---|------------------------------|---------|---------------|
| A1 | The final supported CodeLLDB platform matrix can include some or all full VSIX assets reported by the release API; only R-00 may decide which. | Official Release Asset Inventory | Shipping an unreviewed runtime or an unusable platform install. |
| A2 | A safe direct-adapter invocation can preserve the sampled full VSIX tree without extra extension-host preparation; R-01 must determine exact arguments/environment. | Architecture Patterns | Descriptor starts an adapter that cannot load its bundled runtime. |
| A3 | Containerized public-project validation may be practical later if Docker becomes available; PRD host fallback remains necessary. | Environment Availability | Validation plan stalls or executes untrusted code without intended controls. |

Each assumption above is non-authoritative and requires an explicit checkpoint before it affects product implementation.

## Open Questions

1. **What precise bundled-license/notices and caching disposition is acceptable for the platform VSIX tree?**
   - What we know: the sampled `darwin-arm64` VSIX contains LLDB/Python/native/runtime assets, its manifest declares MIT, no named notice/license path was found, and official builds source LLDB from `vadimcn/lldb-build`. `[VERIFIED: official GitHub release asset inspection]` `[CITED: https://github.com/vadimcn/codelldb/blob/v1.12.2/.github/workflows/build.yml]`
   - What is unclear: complete transitive notice obligations and whether dap-cli's downloaded cache must add/preserve accompanying notices for each supported platform.
   - Recommendation: make this a blocking R-00 conclusion before implementing provisioning.
  - **RESOLVED FOR PLANNING:** Plan 22-01 must execute R-00 and record the binding asset/license/provenance/caching disposition. This does not claim R-00 passed; provisioning, checksum support and setup exposure remain blocked unless R-00 records `result: pass`.

2. **What is the exact standalone released-artifact command/runtime layout required by the descriptor?**
   - What we know: tagged source supports TCP port mode and the sampled full package carries adapter and bundled runtime paths. `[CITED: https://github.com/vadimcn/codelldb/blob/v1.12.2/src/codelldb/src/lib.rs]` `[VERIFIED: official GitHub release asset inspection]`
   - What is unclear: exact flags/environment/readiness behavior when invoked from the extracted released package outside the extension host.
   - Recommendation: capture it in R-01 and copy only the proved invocation into descriptor tests and implementation.
  - **RESOLVED FOR PLANNING:** Plan 22-01 must execute R-01 against the approved released payload and record the only permissible descriptor invocation and listener disposition. This does not claim R-01 passed; descriptor, registry and dependent product work remain blocked unless R-01 records `result: pass`.

3. **Should dap-cli explicitly reject/document `cargo`-shaped CodeLLDB launch configurations, or should a new resolver be separately scoped?**
   - What we know: the CodeLLDB extension resolves Cargo before DAP and the native adapter schema omits `cargo`. `[CITED: https://github.com/vadimcn/codelldb/blob/v1.12.2/extension/cargo.ts]` `[CITED: https://github.com/vadimcn/codelldb/blob/v1.12.2/src/codelldb-types/src/lib.rs]`
   - What is unclear: whether the phase owner wants a bounded translation feature beyond direct adapter onboarding.
   - Recommendation: support explicit compiled executable configs in Phase 22 and record raw `cargo` configs as unsupported unless explicitly re-scoped.
  - **RESOLVED FOR PLANNING:** Phase 22 supports the explicit compiled executable contract and explicitly rejects/documents raw CodeLLDB `cargo` configuration at the native dap-cli boundary. No Cargo resolver or extension-orchestration emulation is scoped in this phase.

4. **Which owned attach result is stable on supported hosts?**
   - What we know: CodeLLDB accepts `pid`, documents OS restrictions, and detaches by default on attach disconnect. `[CITED: https://github.com/vadimcn/codelldb/blob/v1.12.2/MANUAL.md]` `[CITED: https://github.com/vadimcn/codelldb/blob/v1.12.2/src/codelldb/src/debug_session/launch.rs]`
   - What is unclear: stable automated behavior across the final supported host matrix.
   - Recommendation: attempt only owned local attach under unchanged host policy and accept the locked platform-policy blocker path when needed.
  - **RESOLVED FOR PLANNING:** Plan 22-07 attempts attach only for a scenario-owned PID under unchanged host policy. A cleanup-verified platform-policy `blocked` result is an acceptable binding disposition; security-policy workarounds and broader attach claims remain out of scope.

## Sources

### Primary (HIGH confidence)

- Local phase contract: `.planning/phases/22-onboard-rust-debugging-through-codelldb-as-a-built-in-adapte/22-CONTEXT.md`, `22-LANGUAGE-ONBOARDING-PRD.md`, and `22-SCENARIOS.md` - locked scope, gates, and evidence contract. `[VERIFIED: workspace reads]`
- Local implementation/test surfaces: `src/adapters/descriptor.ts`, `src/adapters/socketAdapter.ts`, `src/adapters/builtins/delve.ts`, `src/adapters/provision/`, `src/adapters/registry.ts`, `src/config/`, `tests/`, `package.json`, and `.planning/config.json` - existing architectural and validation precedent. `[VERIFIED: codebase grep and workspace reads]`
- Official CodeLLDB release API for tag `v1.12.2` - asset metadata and GitHub SHA-256 digests, queried 2026-05-28 with `gh api`. `[VERIFIED: official GitHub release API]`
- Official `codelldb-darwin-arm64.vsix` asset - streamed entry listing and packaged manifest inspection, queried 2026-05-28 with `gh api` and archive read-only tools. `[VERIFIED: official GitHub release asset inspection]`
- https://github.com/vadimcn/codelldb/blob/v1.12.2/src/codelldb/src/lib.rs - standalone TCP/stdio transport behavior. `[CITED: official tagged source]`
- https://github.com/vadimcn/codelldb/blob/v1.12.2/src/codelldb-types/src/lib.rs - native adapter launch/attach/config schema. `[CITED: official tagged source]`
- https://github.com/vadimcn/codelldb/blob/v1.12.2/src/codelldb/src/debug_session/launch.rs - launch, attach, detach/terminate and terminal behavior. `[CITED: official tagged source]`
- https://github.com/vadimcn/codelldb/blob/v1.12.2/src/codelldb/src/debug_session/variables.rs - scopes/variables/evaluate behavior. `[CITED: official tagged source]`
- https://github.com/vadimcn/codelldb/blob/v1.12.2/extension/cargo.ts - extension-owned Cargo resolution boundary. `[CITED: official tagged source]`
- https://github.com/vadimcn/codelldb/blob/v1.12.2/MANUAL.md - user-facing launch, attach, Rust language support and Cargo documentation. `[CITED: official tagged documentation]`
- https://github.com/vadimcn/codelldb/blob/v1.12.2/.github/workflows/build.yml - platform build matrix and LLDB package source input. `[CITED: official tagged source]`
- https://github.com/vadimcn/codelldb/blob/v1.12.2/LICENSE - upstream MIT notice text. `[CITED: official tagged source]`

### Secondary (MEDIUM confidence)

- https://github.com/vadimcn/codelldb/blob/v1.12.2/CHANGELOG.md - release-history context for bundled runtime and Rust fixes, used only to shape validation focus. `[CITED: official tagged release notes]`

### Tertiary (LOW confidence)

- None. Unknowns were left as blocking gate work rather than filled from non-authoritative sources.

## Metadata

**Confidence breakdown:**

- Standard stack: HIGH - approved identity, official release metadata, and existing repository surfaces were directly inspected.
- Architecture: HIGH for intended repository ownership and upstream source shape; MEDIUM for final descriptor invocation until R-01 executes the released artifact.
- Provisioning: MEDIUM - Phase 21 pattern is verified and official digests/layout are known, but license/provenance/caching disposition is intentionally unresolved and blocking.
- Configuration: HIGH for explicit executable, native fields, attach `pid`, and Cargo extension/native boundary from official source.
- Pitfalls/security: HIGH for locked gate requirements and observed payload/exposure boundaries; final platform support remains gated.

**Research date:** 2026-05-28
**Valid until:** 2026-06-04 for release/provenance assumptions; re-query official release assets before committing checksums or support decisions.

## RESEARCH COMPLETE

**Phase:** 22 - Rust / CodeLLDB Built-In Onboarding
**Confidence:** MEDIUM overall until blocking live/provenance gates pass

### Key Findings

- Official tagged CodeLLDB source supports a localhost TCP adapter mode, making dap-cli's existing server architecture plausible, but live released-artifact DAP and socket evidence remains a mandatory unpassed blocker.
- Official `v1.12.2` release metadata provides SHA-256 values for bootstrap and six platform VSIX files; only `darwin-arm64` layout was read-only sampled in this research, and no platform is approved for provisioning yet.
- The sampled full VSIX installs a bundled native LLDB/Python/Rust-support tree, and no named license/notice entry was observed; license/provenance/caching review must block provisioner implementation.
- CodeLLDB's `cargo` launch convenience is implemented in its VS Code extension layer, not the standalone native DAP schema; explicit compiled-Rust-program launch is the correct first dap-cli contract.
- The repository already provides the provisioner, descriptor, config, integration-test, docs, and smoke-test boundaries to extend after the evidence gate passes.

### File Created

`.planning/phases/22-onboard-rust-debugging-through-codelldb-as-a-built-in-adapte/22-RESEARCH.md`

### Confidence Assessment

| Area | Level | Reason |
|------|-------|--------|
| Standard Stack | HIGH | Approved adapter, release metadata, official docs/source, and local precedents were inspected. |
| Architecture | MEDIUM | Source shape is strong, but the released binary has not completed the required direct-DAP/listener spike. |
| Pitfalls | HIGH | Primary risks are grounded in locked gates, official payload/source evidence, and extension/native config separation. |

### Planning Dispositions

- **RESOLVED FOR PLANNING - R-00:** R-00 must determine acceptable license/notices/provenance/caching treatment and the supported platform asset matrix; it remains unpassed and blocks product provisioning work until a `result: pass` evidence record exists.
- **RESOLVED FOR PLANNING - R-01:** R-01 must prove the exact standalone invocation, live loopback-only listener, and owned Rust DAP workflow using the released artifact; it remains unpassed and blocks descriptor/product work until a `result: pass` evidence record exists.
- **RESOLVED FOR PLANNING - Cargo boundary:** Raw CodeLLDB `cargo` launch configs are rejected and documented in Phase 22; explicit compiled executable configurations are the supported dap-cli contract.
- **RESOLVED FOR PLANNING - attach:** Owned attach is attempted only under unchanged platform policy, with a cleanup-verified policy blocker accepted when safe attach cannot be proved.

### Ready for Planning

Research is complete for a gate-first plan. Product implementation is not authorized by this research until R-00 and R-01 are executed and recorded as passing.