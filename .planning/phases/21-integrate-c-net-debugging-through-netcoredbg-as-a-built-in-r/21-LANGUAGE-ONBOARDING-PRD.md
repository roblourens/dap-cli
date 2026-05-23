# Phase 21 Language Onboarding PRD: C#/.NET with NetCoreDbg

approved_language: C# / .NET
approved_adapter: NetCoreDbg

## Summary

Integrate C#/.NET debugging through NetCoreDbg as dap-cli's next built-in runtime. The phase must add deterministic NetCoreDbg provisioning, a built-in adapter descriptor, VS Code `coreclr` launch-config mapping, C#/.NET fixtures and real-adapter tests, documentation and skill guidance, screened public-project validation, fresh-agent hardening, and final UAT closure.

## built_in_adapter_contract

- Adapter id: `netcoredbg`.
- Label: `C#/.NET Debug Adapter (NetCoreDbg)`.
- Runtime type: `coreclr` for .NET/.NET Core launch configs.
- Built-in transport: stdio process owned by dap-cli.
- Adapter command: resolved NetCoreDbg executable.
- Adapter args: `--interpreter=vscode`.
- Optional socket/server mode is out of the built-in happy path unless implementation proves stdio cannot satisfy dap-cli's DAP transport needs.
- Supported launch target: built .NET DLL/executable debug target with adapter-native fields such as `program`, `cwd`, `args`, `env`, `stopAtEntry`, and related safe C# debug options that NetCoreDbg accepts.
- Supported attach target: same-machine process id owned by the user/test fixture.
- Preserve dap-cli's DAP-first behavior: no C# semantics in core protocol beyond adapter descriptor/config mapping/diagnostics.

## provisioning_contract

- Prefer an already-usable `netcoredbg` on `PATH`.
- If absent, provision a pinned NetCoreDbg GitHub release asset into `DAP_CLI_HOME/adapters/netcoredbg/`.
- Initial target pin: `3.1.3-1062` unless research during planning identifies a safer current pin.
- Verify downloaded asset digest using release metadata before extraction.
- Select platform/architecture assets explicitly.
- Run readiness proof such as `netcoredbg --version` or `netcoredbg --help` after provisioning.
- Emit typed actionable diagnostics for missing adapter, unsupported platform/architecture, failed digest verification, failed extraction, and unusable executable.
- The phase may choose macOS/Linux support first only if Windows support is documented as a non-goal or follow-up; otherwise support all upstream prebuilt assets that can be tested/reasoned safely.

## launch_config_contract

- Map VS Code `type: "coreclr"` to adapter id `netcoredbg`.
- Decide in the plan whether `type: "clr"` maps to `netcoredbg` or remains unsupported because NetCoreDbg is primarily for .NET Core/.NET rather than desktop .NET Framework.
- Keep `.vscode/launch.json` variable resolution and platform overlays consistent with existing dap-cli behavior.
- Continue stripping VS Code-only keys (`presentation`, `internalConsoleOptions`, `serverReadyAction`, `preLaunchTask`, `postDebugTask`) unless a planned C#-specific behavior safely supports one.
- Treat `${command:*}` and `${input:*}` variables as unsupported.
- Prefer users/agents building first and launching output DLLs unless the plan proves `.csproj` launch/build inference can be deterministic and safe.
- Add `.dll` inference to `netcoredbg`/`coreclr` if tests show it is safe and useful.
- Do not silently execute project build scripts from launch config.

## implementation_surfaces

- `src/adapters/builtins/netCoreDbg.ts`: built-in descriptor, readiness resolution, typed diagnostics.
- `src/adapters/registry.ts`: register `netcoredbg`.
- `src/config/launchConfig.ts`: map `coreclr`, optional `clr` decision, .NET config normalization if required.
- CLI/config inference layer: `.dll` and/or explicit non-inference decision.
- `scripts/setup-adapters.ts`: deterministic NetCoreDbg setup and digest verification.
- `tests/fixtures/`: C#/.NET console, test, and attach fixtures.
- `tests/integration/`: setup, descriptor/config mapping, inference, real adapter launch/test/attach coverage.
- `docs/adapter-setup.md`: NetCoreDbg setup, launch, attach, troubleshooting.
- `dap-cli/skills/dap-cli/SKILL.md`: link to new C# reference.
- `dap-cli/skills/dap-cli/references/csharp-netcoredbg.md`: fresh-agent guidance.
- Planning artifacts: `21-SCENARIOS.md`, `21-EXTERNAL-PROJECT-CANDIDATES.md`, `21-EXTERNAL-PROJECT-RESULTS.md`, `21-RESULTS.md`, `21-HARDENING-GAPS.md`, `21-UAT.md`.

## public_repo_safety_requirements

- Treat public repos as untrusted input.
- Clone shallowly only under `tmp/phase-21-external-csharp/`.
- Record repo URL, path, commit SHA, popularity signal, launch.json signal, safety screen, status, scenario class, and diversification rationale before execution.
- Inspect README, `.csproj`, `.sln`, `.props`, `.targets`, `Directory.Build.*`, Makefiles, task files, scripts, devcontainer files, launch configs, setup docs, and package feed configuration before running commands.
- Reject or block flows requiring credentials, private feeds, cloud accounts, databases, Docker daemon access not explicitly approved, native installers, opaque scripts, curl-pipe installers, code generators with unclear effects, or non-localhost service traffic.
- Separate `dotnet restore`/dependency fetch from debug execution.
- Use isolated `DAP_CLI_HOME`, `DOTNET_CLI_HOME`, and `NUGET_PACKAGES` per attempt.
- Preserve exact commands and cleanup evidence.

## container_or_sandbox_plan

- Prefer containers for public-project validation when feasible: official .NET SDK image, dap-cli + NetCoreDbg + debuggee in the same container, no host home mount, no Docker socket, non-root user when practical, phase-owned scratch only, read-only source mount where possible, explicit writable cache/build dirs, network only for restore, and no credentials.
- Docker is containment, not a perfect sandbox; still screen all project files before execution.
- Host fallback is acceptable when Docker is unavailable or would obscure adapter behavior: shallow clone under phase scratch, clean environment, isolated dap-cli/dotnet/NuGet homes, no credentialed feeds, no unreviewed scripts, and exact cleanup.

## fresh_agent_verification_requirements

- Create `21-SCENARIOS.md` before fresh-agent execution.
- Use one fresh subagent per scenario.
- Each prompt must name the docs to read first, scratch root, isolated `DAP_CLI_HOME`, target fixture/repo, safety constraints, required breakpoint/stack/scopes/evaluate evidence, and cleanup expectations.
- Each report must include exactly:
  - `result: pass|fail|blocked`
  - `what_worked: ...`
  - `what_didnt: ...`
  - `agent_confusion: ...`
  - `dap_cli_ergonomic_issues: ...`
  - `evidence: ...`
  - `cleanup_verified: true|false`
- Orchestrator must audit corresponding Copilot CLI JSONL transcripts under `~/.copilot/session-state/` and record command trajectory, wrong turns, hidden failures, retries, cleanup, and final evidence in `21-RESULTS.md`.
- Product/docs/skill gaps affecting success must be fixed in-phase and rerun with the same prompt where practical.

## acceptance_criteria

- Built-in `netcoredbg` adapter appears in adapter registry listing.
- `npm run setup-adapters` provisions or recognizes NetCoreDbg deterministically and reports actionable diagnostics.
- `type: "coreclr"` launch configs resolve to `netcoredbg`.
- Repo-owned .NET fixture launch hits a real breakpoint and supports status, threads, stack, scopes/variables, evaluate or documented fallback, continue, close, and cleanup.
- Repo-owned attach scenario attaches to an owned local .NET process and cleans up only phase-owned resources.
- Launch config scenario proves `.vscode/launch.json` discovery/use for `coreclr`.
- Negative diagnostics cover missing adapter and at least one .NET-specific failure such as missing SDK/build output or unsupported launch shape.
- External validation attempts are screened, SHA-pinned, documented, and run through subagents unless blocked by safety/environment constraints.
- Fresh-agent scenario results include transcript audits and reruns for fixed gaps.
- Docs and agent skill reference are sufficient for a fresh agent to debug a C#/.NET fixture without code archaeology.
- Existing JS, Python, Go, launch config, setup, docs validation, and smoke behavior remain intact.
- `/gsd-verify-work 21` records mandatory hand-driven smoke Sequence A and B verbatim in `21-UAT.md` with both `result: pass`.

## non_goals

- Full Visual Studio C# extension parity.
- Bundling or redistributing Microsoft `vsdbg`.
- Desktop .NET Framework `clr` support unless explicitly proven safe and supported by NetCoreDbg.
- Automatic project build orchestration that runs arbitrary MSBuild/project scripts.
- Remote/container attach as a built-in happy path.
- Symbol server, Source Link, ASP.NET browser launch, and Dev Kit `type: "dotnet"` parity unless discovered to be necessary for core dap-cli success.
