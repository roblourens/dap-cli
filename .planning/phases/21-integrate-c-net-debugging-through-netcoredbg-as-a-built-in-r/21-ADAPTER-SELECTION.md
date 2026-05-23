# dap-cli Adapter Selection: C#/.NET/NetCoreDbg

## Recommendation

| Contract | Value |
| --- | --- |
| Runtime/language | C# / .NET |
| Debug adapter | NetCoreDbg |
| dap-cli adapter id | `netcoredbg` |
| VS Code launch config type | `coreclr` |
| Adapter version/pin strategy | Pin a specific NetCoreDbg GitHub release asset, starting from the latest stable release available during onboarding (`3.1.3-1062` as of 2026-05-22), and verify the release asset `sha256` digest from GitHub release metadata before extraction. |
| Process/transport model | Standalone local adapter process over stdio with `netcoredbg --interpreter=vscode`; optional localhost TCP mode exists via `--server`, but stdio should be the built-in happy path unless implementation proves otherwise. |
| Provisioning strategy | Prefer an already-usable `netcoredbg` on `PATH`; otherwise download the pinned OS/architecture release asset into `DAP_CLI_HOME/adapters/netcoredbg/`, verify its digest, chmod on Unix, and run `netcoredbg --version` or `--help` as readiness proof. |

## Why this choice

C#/.NET is the best next runtime target because it adds a major managed ecosystem without duplicating the already-covered JavaScript, Python, or Go shapes. NetCoreDbg is the recommended adapter for dap-cli because it is a standalone Debug Adapter Protocol implementation that can be owned by dap-cli as a child process, works with normal DAP launch/attach/breakpoint/stack/scopes/evaluate flows, publishes prebuilt release assets for Linux, macOS, and Windows, and is MIT-licensed.

This is intentionally not a recommendation for Microsoft `vsdbg` as the built-in adapter. `vsdbg` is the official Microsoft debugger behind the C# extension's classic `coreclr`/`clr` flows and is attractive on ownership/popularity, but its .NET Core Debugger Components license says the debugger components may only be used with Visual Studio Code, Visual Studio, or Xamarin Studio and must not be provided as a standalone offering. That is a bad default for a dap-cli built-in. NetCoreDbg loses the Microsoft-owned point, but it is the cleaner product, licensing, and provisioning fit.

The existing dap-cli adapter architecture can model NetCoreDbg similarly to `debugpy`: a stdio descriptor launching an executable with fixed adapter args. The launch config mapping should reuse the real VS Code ecosystem type `coreclr`, and optionally accept `clr` only if onboarding proves it works cleanly and safely. A later implementation phase should decide whether to add `.csproj` inference, `.dll` inference, or require explicit `--adapter netcoredbg --type coreclr` for non-file launch shapes.

## Candidate comparison

| Candidate | Fit | Risks | Disposition |
| --- | --- | --- | --- |
| C#/.NET + NetCoreDbg | Strong DAP fit; standalone `--interpreter=vscode`; launch and attach model maps to dap-cli; MIT license; GitHub release assets include platform binaries and SHA-256 digests; .NET SDK containers make verification practical. | Not Microsoft-owned; macOS arm64 quality should be verified because upstream docs call out some community-support caveats; dap-cli must define a clear build-before-debug convention for `.csproj` targets. | **Selected** |
| C#/.NET + Microsoft `vsdbg` | Official Microsoft debugger; matches common C# VS Code `coreclr` launch configs; strong ecosystem recognition. | License/redistribution/standalone-use constraints are poor for a dap-cli built-in; provisioning uses Microsoft CDN debugger packages whose VSDBG-specific license is inside each zip as `license.txt`; may be better as user-provided custom adapter guidance than first-party setup. | Runner-up rejected after discussion. |
| C/C++ + Microsoft C/C++ `cppdbg` / OpenDebugAD7 | Microsoft-owned; mature VS Code `cppdbg` type; MIEngine/OpenDebugAD7 bridges DAP to GDB/LLDB; common launch.json shape. | C/C++ extension does not include a compiler/debugger; dap-cli would inherit gdb/lldb/compiler setup complexity, platform divergence, and more brittle breakpoint/symbol expectations; extension packaging/provisioning is heavier than a single adapter binary. | Strong future candidate, not first choice. |
| Java + Microsoft Java Debug Server | Microsoft-run; mature feature set; launch/attach/breakpoints/stack/scopes/evaluate are documented; `type: "java"` is common. | Official flow extends Red Hat Java language support/JDT LS; low-level standalone use needs a JDT LS/plugin/debug-session handshake, which does not fit dap-cli's simple adapter-process model. | Defer unless a future spike accepts the LSP bootstrap complexity. |
| PowerShell + PowerShell Editor Services | Microsoft-owned; supports debugging through DAP; useful scripting runtime. | Debug support is tied to Editor Services session details/named pipes and an LSP-style service model; stdio mode explicitly limits debugger functionality. | Not recommended for built-in happy path. |

## Later public repo validation sketch

```text
likely_repo_shapes:
- Small .NET console apps with checked-in .sln/.csproj and no external services.
- Library/test projects using `dotnet test` or prebuilt Debug DLLs, preferably with simple deterministic tests.
- Minimal ASP.NET Core localhost services only after CLI/library flows pass, with network restricted to localhost.
- Repos with `.vscode/launch.json` using `type: "coreclr"` and explicit `program` pointing at a Debug DLL.

launch_json_search_terms:
- "\"type\": \"coreclr\""
- "\"request\": \"launch\""
- "\"request\": \"attach\""
- "\"program\": \"${workspaceFolder}/bin/Debug"
- "\"stopAtEntry\""

expected_safety_concerns:
- `dotnet restore` fetches NuGet packages and should be separated from debug execution.
- MSBuild targets can run arbitrary project-defined tasks; screen `.csproj`, `.props`, `.targets`, `Directory.Build.*`, scripts, and Makefiles before restore/build/test.
- Avoid repos requiring databases, cloud accounts, Docker daemon access, private package feeds, native installers, or credentialed services.
- Do not execute setup scripts, `curl | sh`, post-clone hooks, or broad `dotnet workload install` flows.

expected_scenario_classes:
- Adapter readiness/provisioning.
- Repo-owned fixture console launch with breakpoint, stack, scopes, locals, and evaluate.
- Repo-owned fixture test debugging or prebuilt Debug DLL debugging.
- Safe local PID attach to an owned long-running fixture.
- Launch-config discovery/use for `type: "coreclr"`.
- Screened public console app, library test, and optionally localhost-only service.
- Negative diagnostics for missing SDK, missing adapter, unsupported platform/arch, missing build output, and rejected unsafe launch config variables.
```

The later onboarding skill owns candidate repository discovery, shallow cloning, screening, and execution. This packet deliberately does not name or screen specific public repositories.

## Container/sandbox feasibility

C#/.NET debuggees can run inside containers. Microsoft publishes official .NET SDK images such as `mcr.microsoft.com/dotnet/sdk:8.0`, `9.0`, and `10.0`, and those images are suitable for restore/build/test/debug workflows. The cleanest verification posture is to run dap-cli, NetCoreDbg, the .NET SDK, and the debuggee inside the same container so PID attach, source paths, and adapter subprocess lifecycle stay local and predictable.

Recommended later-execution posture:

- No host home mount, no Docker socket mount, no privileged flags, and no credentials.
- Non-root user when practical.
- Phase-owned scratch volume only.
- Read-only source mount where practical, with explicit writable NuGet/build/cache directories.
- Network enabled only for the dependency-fetch phase (`dotnet restore`) and disabled during debug execution unless the scenario is explicitly localhost-only.
- CPU, memory, and wall-clock limits.
- Separate dependency fetch from debug execution: `dotnet restore`/`dotnet build` may need network; `dotnet <dll>` or NetCoreDbg launch should not.

Docker is not a perfect sandbox because the daemon is privileged. It is useful containment, not permission to skip project screening. If Docker is unavailable, the fallback is repo-owned fixtures plus screened public projects in ignored scratch directories on the host, using isolated `DAP_CLI_HOME`, bounded `NUGET_PACKAGES`/`DOTNET_CLI_HOME`, no credentialed feeds, and no unreviewed scripts or build hooks.

Host-dap-cli / container-debuggee split is not recommended for the built-in happy path. NetCoreDbg attach/debug should stay in the same namespace as the target process. Cross-container or remote debugging would be a custom adapter scenario, not the first built-in contract.

## Implementation surface preview

- Add a built-in descriptor under `src/adapters/builtins/netCoreDbg.ts` using stdio transport: `netcoredbg --interpreter=vscode`.
- Register adapter id `netcoredbg` with label `C#/.NET Debug Adapter (NetCoreDbg)`.
- Add `launchConfigTypeMap.coreclr = "netcoredbg"` and decide whether `clr` should map or be explicitly unsupported.
- Add setup support in `scripts/setup-adapters.ts`: PATH preference, pinned asset selection by platform/arch, digest verification, extraction, chmod, and readiness diagnostics.
- Add config/flag mapping for .NET launch payloads: `program`, `cwd`, `args`, `stopAtEntry`, `env`, attach `processId`, and rejection of VS Code-only fields such as command/input variables.
- Add inference only where it is safe: probably `.dll` to `netcoredbg`/`coreclr` after build output exists; `.csproj` inference should be considered only if dap-cli can give a clear build-output diagnostic rather than guessing target framework.
- Add fixtures for console launch, short-lived stop-on-entry, test/prebuilt DLL, and owned-process attach.
- Add integration tests with real NetCoreDbg behind an opt-in env gate if needed, plus non-network unit tests for descriptor/setup/launch-config mapping.
- Update `docs/adapter-setup.md`, `dap-cli/skills/dap-cli/SKILL.md`, and add `dap-cli/skills/dap-cli/references/csharp-netcoredbg.md`.

## Verification preview

- Readiness: isolated `DAP_CLI_HOME`, run setup, verify selected NetCoreDbg path and version/help output.
- Fixture launch: build a Debug console app, launch `dotnet <dll>` through NetCoreDbg, hit a source breakpoint, inspect stack/scopes/variables, evaluate a local, continue, and close.
- Fixture short-lived race: prove `stopAtEntry` guidance lets agents set breakpoints before process exit.
- Fixture attach: start an owned long-running .NET process, attach by PID, hit/inspect a breakpoint or pause state, disconnect without killing unexpectedly, then terminate only the owned process.
- Launch config: create a scratch `.vscode/launch.json` with `type: "coreclr"`, list/select by name, and prove dap-cli maps it to `netcoredbg`.
- Public project validation: after approval, screen small maintained C# repos for safe build/debug flows, then run diversified console/library-test/localhost scenarios.
- Fresh-agent hardening: reuse the Phase 20 pattern: one fresh agent per scenario, fixed report contract, gap ledger, reruns after docs/product fixes, then final hand-driven CLI smoke during `/gsd-verify-work`.

## Open questions

- Should dap-cli expose VS Code ecosystem type `coreclr` only, or also support `clr` as a mapped alias?
- Should built-in setup support Windows immediately, or initially document Windows as a follow-up while implementing macOS/Linux first?
- Should `.csproj` launch be first-class, or should dap-cli require users/agents to build first and launch the output DLL for a smaller, more DAP-native contract?
- How should dap-cli report unsafe or unsupported MSBuild/launch.json fields without overreaching into project build orchestration?

## Approval

status: approved
approved_language: C# / .NET
approved_adapter: NetCoreDbg
approved_by: Rob
approved_at: 2026-05-22T19:27:28.965-07:00
notes: Proceed with NetCoreDbg and use onboarding to discover any important gaps.
