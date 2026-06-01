# Phase 22 PRD: Built-in Rust Debugging Through CodeLLDB

approved_language: Rust
approved_adapter: CodeLLDB (`vadimcn.vscode-lldb`, pinned baseline `v1.12.2`)
built_in_adapter_contract: Add built-in adapter id `codelldb` for Rust-oriented CodeLLDB flows only after direct-adapter and loopback-only transport spikes pass; expose VS Code `type: "lldb"` without claiming generic C++ support.
provisioning_contract: Extend Phase 21 consent-gated lazy provisioning, cache override, atomic install, locking, checksum verification, setup-adapters reporting, typed error, synthetic archive, packaging, and proxy/network test contracts for pinned CodeLLDB platform VSIX assets; the passed gate authorizes only verified direct official-source local caching on inspected `darwin-arm64`, not bundling, mirroring, offline redistribution, or uninspected platform assets.
launch_config_contract: Map `type: "lldb"` to `codelldb` and preserve native Rust CodeLLDB fields such as `program`, `cwd`, `args`, `env`, `sourceLanguages`, and source-map/source-language settings where direct-adapter evidence proves them; reject every raw VS Code CodeLLDB `cargo` configuration before native DAP forwarding, including `cargo` plus `program`, with typed explicit-built-binary recovery; do not infer executable launch from a raw `.rs` source path.
implementation_surfaces: `src/adapters/builtins/`, `src/adapters/registry.ts`, `src/adapters/provision/`, `src/config/launchConfig.ts`, `src/config/programInference.ts`, CLI setup output and config mapping only where required by the existing abstractions, `scripts/dev/regen-checksums.ts`, `tests/fixtures/`, `tests/adapters/`, `tests/config/`, `tests/cli/`, `tests/integration/`, `tests/packaging/`, `README.md`, `docs/adapter-setup.md`, `dap-cli/skills/dap-cli/SKILL.md`, and `dap-cli/skills/dap-cli/references/rust-codelldb.md`.
public_repo_safety_requirements: Public candidate discovery begins only after adapter gates and repo-owned fixture behavior pass; shallow clone only under `tmp/phase-22-external-rust/`; record URLs, exact SHAs, launch config signals and safety screens before executing code; reject credentialed, cloud, privileged, opaque hook, broad-network, or unscreened build-script/proc-macro flows.
container_or_sandbox_plan: First determine whether CodeLLDB and a Rust debuggee operate correctly together inside a non-root Linux container with no host home/Docker socket mount, only phase-owned source/cache mounts, resource limits, and network disabled during debug execution after explicit preparation; if infeasible, document why and use an inspected host fallback with isolated `DAP_CLI_HOME`/`DAP_CLI_ADAPTERS_DIR`, bounded environment, owned processes, and exact cleanup.
fresh_agent_verification_requirements: Each real-project or fresh-agent scenario has an exact bounded prompt, isolated scratch and cache, required breakpoint/stack/scopes-or-evaluate/cleanup evidence, fixed result report contract, and an orchestrator audit of its Copilot CLI JSONL transcript before any pass is accepted; confusion or failures are recorded and rerun after fixes.
acceptance_criteria: Pre-implementation transport/provenance gates recorded as pass; adapter lazy provisions safely on supported targets; `type: "lldb"` launch configs target explicit compiled Rust binaries while raw `cargo` and `.rs` inference receive tested typed recovery; real Rust fixture launch, named config, owned attach where safe, diagnostics and cleanup are exercised; multiple screened public crate attempts or explicit blockers are audited; fresh-agent results and transcript audits are complete; focused/full applicable automated checks pass; because this phase changes provisioning and setup-adapters surfaces, final orchestrator hand smoke records Sequences A, B, and provisioning-applicable Sequence C steps C1-C6 verbatim in `22-UAT.md` as pass before `status: complete`.
non_goals: Generic C/C++ support, automatic compilation of arbitrary `.rs` paths, remote debugging, privileged host attach workarounds, running arbitrary Cargo hooks from public repos, changing unrelated Go/Delve or JavaScript/Python behavior, or weakening any Phase 21 provisioning/security guarantee.

## Product Goal

An agent should be able to debug a real Rust crate through the same discoverable dap-cli workflow used for JavaScript, Python, and Go: select a stable built-in adapter, accept a bounded verified install, launch a real configuration or debug binary, stop at source, inspect state, recover from adapter-specific limitations through documentation, and clean up deterministically.

## Locked Requirements

### Safety Gates Before Product Code

- No `codelldb` built-in descriptor or download provisioner is committed until a recorded spike proves direct DAP operation and loopback-only server exposure for the selected artifact.
- No CodeLLDB download matrix is committed until the relevant platform VSIX names, SHA-256 hashes, bundled notices/licenses, extracted entrypoint shape, and cached-asset policy are recorded in phase research or results.
- Any failed blocker sends the phase back to adapter selection or an explicit scope decision; it must not be worked around with wildcard listeners or unreviewed binaries.

### Built-In Adapter and Provisioning

- Add `codelldb` consistently with existing descriptor/registry boundaries and the Phase 21 `AdapterId` / `provisionAdapter` structure.
- Support only the validated platform asset matrix and emit existing structured provisioning codes or a narrowly justified new typed diagnostic for CodeLLDB-specific readiness failures.
- Maintain consent, checksum, safe extraction, cache locking, atomic replacement, proxy URL sanitization, setup-adapters, package/tarball, and concurrency coverage.

### Rust Debug Behavior

- Add a repo-owned minimal Rust binary fixture with deterministic values and source breakpoint lines; add test/config/attach fixtures only where CodeLLDB behavior and platform policy permit stable automation.
- Prove real adapter breakpoint binding, stopped state, stack, scopes/variables, evaluate or a documented adapter-specific fallback, resume/terminate/disconnect behavior, and process cleanup.
- Keep Rust compilation explicit: building owned or screened source is a separate preparation action; dap-cli launches a compiled debug executable. Reject raw VS Code CodeLLDB `cargo` objects before native forwarding, including objects that also include `program`, and keep raw `.rs` inference excluded.

### Configuration and Documentation

- Recognize VS Code `type: "lldb"` as the CodeLLDB built-in mapping and test named configuration use with Rust fields retained.
- Publish a Rust/CodeLLDB reference sufficient for a fresh agent to set up, build, launch/configure an explicit compiled executable, inspect, attach only to owned processes if supported, diagnose the Cargo/no-`.rs` limits, and clean up without reading implementation source.
- Update README built-in adapter inventory, adapter setup documentation, and general skill links; documentation tests must pin the guidance.

### External and Fresh-Agent Evidence

- Create `22-EXTERNAL-PROJECT-CANDIDATES.md` before executing public repository commands, and `22-EXTERNAL-PROJECT-RESULTS.md` from SHA-pinned screened attempts only.
- Use subagents for real public-project debug attempts. The orchestrator audits the matching JSONL command transcripts and records discrepancies in `22-RESULTS.md` and `22-HARDENING-GAPS.md`.
- Fix blocking product/docs gaps in this phase and append rerun evidence; never overwrite an initial failed or confusing run.

## Verification Requirements

- Automated tests cover descriptor behavior, supported/unsupported provisioning assets and checksums, setup reporting, registry/type mapping, explicit Rust launch behavior, diagnostics, real CodeLLDB integration, docs, and packaging surfaces affected by the implementation.
- The hand-driven smoke gate remains mandatory: because Phase 22 changes `src/adapters/provision/**` and `src/cli/commands/setupAdapters.ts`, the orchestrator personally runs `dev/smoke/hand-driven-smoke.md` Sequences A and B plus provisioning-applicable Sequence C steps C1-C6, pastes verbatim output into `22-UAT.md`, and records passing evidence for all applicable sequences/steps before `status: complete`. Tests, scripts, and subagents are not substitutes.
- Phase completion requires no unexamined hardening failure; non-blocking follow-ups must be explicitly justified and recorded.