# Phase 21: Integrate C#/.NET debugging through NetCoreDbg as a built-in runtime - Context

**Gathered:** 2026-05-22
**Status:** Ready for planning
**Source:** PRD Express Path (`.planning/phases/21-integrate-c-net-debugging-through-netcoredbg-as-a-built-in-r/21-LANGUAGE-ONBOARDING-PRD.md`)

<domain>
## Phase Boundary

This phase delivers C#/.NET debugging through NetCoreDbg as a first-party dap-cli built-in adapter. It must add deterministic adapter provisioning, registry/config/inference wiring, real C#/.NET fixtures and integration tests, docs and agent-skill guidance, screened public-project validation, fresh-agent hardening with transcript audits, and final GSD/UAT closure.

The approved adapter pair is C#/.NET + NetCoreDbg. Microsoft `vsdbg` is intentionally not selected because its debugger-component license is not a clean fit for dap-cli's standalone built-in adapter model.
</domain>

<decisions>
## Implementation Decisions

### Approved Runtime and Adapter
- [locked] Implement C#/.NET support using NetCoreDbg.
- [locked] Use dap-cli adapter id `netcoredbg`.
- [locked] Use VS Code launch config type `coreclr` as the primary mapped type.
- [locked] Do not bundle or redistribute Microsoft `vsdbg`.

### Built-in Adapter Contract
- [locked] Add a built-in descriptor under `src/adapters/builtins/netCoreDbg.ts`.
- [locked] The built-in descriptor launches a dap-cli-owned stdio adapter process.
- [locked] NetCoreDbg adapter command resolves to a usable NetCoreDbg executable.
- [locked] NetCoreDbg adapter args are `--interpreter=vscode`.
- [locked] Optional NetCoreDbg socket/server mode is not the built-in happy path unless implementation proves stdio cannot satisfy dap-cli's DAP transport needs.
- [locked] The adapter must support built .NET DLL/executable launch with fields such as `program`, `cwd`, `args`, `env`, and `stopAtEntry`.
- [locked] The adapter must support same-machine attach to a user/test-owned process id.
- [locked] Keep core protocol DAP-first; do not add C# semantics to protocol core beyond adapter descriptor, config mapping, inference, and diagnostics.

### Provisioning Contract
- [locked] `npm run setup-adapters` must recognize a usable `netcoredbg` on `PATH`.
- [locked] If PATH lookup fails, setup provisions a pinned NetCoreDbg GitHub release asset into `DAP_CLI_HOME/adapters/netcoredbg/`.
- [locked] Initial target pin is `3.1.3-1062` unless research identifies a safer current pin before planning is finalized.
- [locked] Downloaded NetCoreDbg assets must be verified using release metadata digest before extraction.
- [locked] Setup must select platform/architecture assets explicitly.
- [locked] Setup must run a readiness proof such as `netcoredbg --version` or `netcoredbg --help`.
- [locked] Missing adapter, unsupported platform/architecture, failed digest verification, failed extraction, and unusable executable must produce typed actionable diagnostics.

### Launch Config and Inference Contract
- [locked] Map `type: "coreclr"` to adapter id `netcoredbg`.
- [locked] Decide explicitly whether `type: "clr"` maps or remains unsupported; default bias is unsupported unless NetCoreDbg proves suitable for that flow.
- [locked] Keep launch.json variable resolution, platform overlays, and VS Code-only key stripping consistent with existing dap-cli behavior.
- [locked] Treat `${command:*}` and `${input:*}` variables as unsupported.
- [locked] Prefer build-first / launch-output-DLL workflows unless `.csproj` launch/build inference can be deterministic and safe.
- [locked] Add `.dll` inference to `netcoredbg`/`coreclr` if tests show it is safe and useful.
- [locked] Do not silently execute project build scripts from launch config.

### Verification and Safety Contract
- [locked] Public repos are untrusted input and must be screened before execution.
- [locked] Public-project clones live under `tmp/phase-21-external-csharp/`.
- [locked] External attempts must isolate `DAP_CLI_HOME`, `DOTNET_CLI_HOME`, and `NUGET_PACKAGES`.
- [locked] Separate dependency fetch (`dotnet restore`) from debug execution.
- [locked] Fresh-agent verification results require JSONL transcript audit before claiming pass.
- [locked] `/gsd-verify-work 21` must include orchestrator-run hand-driven smoke Sequence A and Sequence B output in `21-UAT.md`.

### the agent's Discretion
- Decide exact NetCoreDbg version pin if research finds a better stable version than `3.1.3-1062`.
- Decide how much Windows support can be implemented and verified in this phase versus documented as bounded support.
- Decide whether `.csproj` convenience is safe enough for this phase or should remain a documented non-goal.
- Decide which public C# repositories are safe, maintained, and diverse enough for validation.
- Decide how many plan files are needed to keep execution atomic and auditable.
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase 21 Contracts
- `.planning/phases/21-integrate-c-net-debugging-through-netcoredbg-as-a-built-in-r/21-ADAPTER-SELECTION.md` — approved language/adapter decision, runner-up rationale, provisioning and verification preview.
- `.planning/phases/21-integrate-c-net-debugging-through-netcoredbg-as-a-built-in-r/21-LANGUAGE-ONBOARDING-PRD.md` — full onboarding scope, acceptance criteria, safety requirements, and non-goals.

### Project and Workflow Context
- `.github/copilot-instructions.md` — GSD branch/commit workflow and mandatory hand-driven smoke requirements.
- `.planning/PROJECT.md` — current product state, architecture constraints, and key decisions.
- `.planning/ROADMAP.md` — phase goal/dependencies and Phase 20 precedent.

### Phase 20 Precedent
- `.planning/phases/20-i-d-like-to-find-another-runtime-that-we-can-debug-we-should/20-ADAPTER-SELECTION.md` — prior runtime selection precedent.
- `.planning/phases/20-i-d-like-to-find-another-runtime-that-we-can-debug-we-should/20-SCENARIOS.md` — fresh-agent scenario matrix pattern.
- `.planning/phases/20-i-d-like-to-find-another-runtime-that-we-can-debug-we-should/20-EXTERNAL-PROJECT-CANDIDATES.md` — public repo candidate ledger pattern.
- `.planning/phases/20-i-d-like-to-find-another-runtime-that-we-can-debug-we-should/20-EXTERNAL-PROJECT-RESULTS.md` — external validation evidence pattern.
- `.planning/phases/20-i-d-like-to-find-another-runtime-that-we-can-debug-we-should/20-RESULTS.md` — fresh-agent result and rerun pattern.
- `.planning/phases/20-i-d-like-to-find-another-runtime-that-we-can-debug-we-should/20-HARDENING-GAPS.md` — gap ledger pattern.
- `.planning/phases/20-i-d-like-to-find-another-runtime-that-we-can-debug-we-should/20-UAT.md` — final UAT and hand-smoke precedent.

### Existing Implementation Surfaces
- `src/adapters/builtins/` — existing built-in adapter descriptors.
- `src/adapters/registry.ts` — built-in adapter registration.
- `src/config/launchConfig.ts` — launch.json type mapping, variable resolution, config normalization.
- `scripts/setup-adapters.ts` — deterministic setup/readiness for built-in adapters.
- `tests/fixtures/` — fixture layout for real adapter tests.
- `tests/integration/` — integration test patterns for setup, inference, launch configs, and real adapters.
- `docs/adapter-setup.md` — adapter setup and troubleshooting docs.
- `dap-cli/skills/dap-cli/SKILL.md` — agent-facing dap-cli workflow entry point.
- `dap-cli/skills/dap-cli/references/` — language-specific agent references.
</canonical_refs>

<specifics>
## Specific Ideas

- Model NetCoreDbg descriptor closer to `debugpy` than Delve: stdio process rather than localhost server.
- Model deterministic binary provisioning and typed diagnostics from Delve setup, but improve by verifying GitHub release asset digests because NetCoreDbg release metadata provides `sha256` values.
- Prefer fixtures that build a Debug DLL first, then launch `dotnet <dll>` through NetCoreDbg.
- Keep attach verification local and owned: start a fixture process, attach by PID, prove a meaningful paused inspection, disconnect/close, then terminate only the fixture process.
- Include a docs-only novice scenario to prove fresh agents understand build-first DLL launch, `coreclr`, setup, attach, and ref reacquisition.
</specifics>

<deferred>
## Deferred Ideas

- Full Visual Studio C# extension parity.
- Bundling or redistributing Microsoft `vsdbg`.
- Desktop .NET Framework `clr` support unless NetCoreDbg suitability is proven within this phase.
- Automatic project build orchestration that runs arbitrary MSBuild/project scripts.
- Remote/container attach as a built-in happy path.
- Symbol server, Source Link, ASP.NET browser launch, and Dev Kit `type: "dotnet"` parity unless discovered to be necessary for core dap-cli success.
</deferred>

---

*Phase: 21-integrate-c-net-debugging-through-netcoredbg-as-a-built-in-r*
*Context gathered: 2026-05-22 via PRD Express Path*
