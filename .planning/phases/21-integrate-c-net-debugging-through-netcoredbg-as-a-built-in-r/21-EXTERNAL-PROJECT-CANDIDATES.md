# Phase 21 External C# Project Candidates

## Purpose

Screen public C# repositories before any project restore/build/debug command is executed, then choose a small diversified set for NetCoreDbg validation beyond repo-owned fixtures.

## Safety Rules

- Treat every cloned repository as untrusted input.
- Clone shallowly only under ignored scratch space: `tmp/phase-21-external-csharp/`.
- Before any public repo command runs, inspect README/setup docs, `.sln`, `.csproj`, `.props`, `.targets`, `Directory.Build.*`, task files, devcontainer files, package feed configuration (`NuGet.config`, package sources), Makefiles, shell/PowerShell scripts, GitHub Actions/workflows if used by documented setup, `.vscode/launch.json`, and all script/build hook locations.
- Reject or block commands needing credentials, private feeds, cloud accounts, databases, Docker daemon dependencies not explicitly approved, native installers, opaque scripts, curl-pipe installers, heavyweight/unclear code generators, non-localhost traffic, or broad `dotnet workload install`.
- For selected attempts, use isolated `DAP_CLI_HOME`, `DOTNET_CLI_HOME`, and `NUGET_PACKAGES`; separate `dotnet restore`, `dotnet build -c Debug --no-restore`, and dap-cli debug execution.
- Prefer the already-proven x64 Rosetta NetCoreDbg path only when explicitly available on this darwin/arm64 host; do not weaken setup defaults or silently install x64.
- Record the exact repo URL, clone path, commit SHA, command sequence, result, evidence, and cleanup.

## Screen Procedure

The Phase 21 pool was shallow-cloned into `tmp/phase-21-external-csharp/<slug>`. Screening inspected SHAs, README/setup instructions, solution/project files, props/targets/Directory.Build files, NuGet/package-source configuration, task files, scripts, Makefiles, devcontainer files, `.vscode/launch.json`, and workflows that were part of documented setup signals before choosing any execution target. No Makefile, PowerShell, shell, workflow, package-publish, Docker, or installer target was executed during screening.

## Candidate Ledger

| ID | Repo URL | Shallow clone path | Commit SHA | Popularity signal | Launch.json signal | Screen notes | Status | Target scenario class | Diversification rationale |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| CSHARP-CAND-01 | `https://github.com/dotnet/samples` | `tmp/phase-21-external-csharp/dotnet-samples` | `c6eb3268ba912447e820ba78e3d35ee2c5d7e0b0` | Official .NET samples repository | No safe native `.vscode/launch.json` selected; docs recommend CLI restore/build/run | Root README documents `dotnet restore`, `dotnet build`, `dotnet run`; root `Directory.Build.props` only sets analyzer/style properties. Root workflows include secrets and installer script examples, but documented setup for selected `core/getting-started/golden/app` does not require workflows. Selected app references a local library and Newtonsoft.Json only; no `Directory.Build.targets`, `NuGet.config`, scripts, Makefile, devcontainer, or launch config under the selected sample path. | selected | external console DLL launch | Official compact console/library sample, net8.0-compatible with host runtime, good baseline for build-first DLL launch and library-frame locals. |
| CSHARP-CAND-02 | `https://github.com/Humanizr/Humanizer` | `tmp/phase-21-external-csharp/Humanizr-Humanizer` | `f9292aa90948de0aea2d4fa7d6549b1b2432c0fb` | Widely used text/date humanization library | No selected launch config | Screen found `Directory.Build.targets` with `AddCommitHashToAssemblyAttributes` `BeforeTargets=GetAssemblyAttributes` and PowerShell scripts. This target is legible but is a build hook, so it remains a backup only until a narrower package/test command is separately justified. | screened-caution | library test debugging backup | Nontrivial library surface if a second external test-mode target is needed, but build hooks make it less clean than official sample. |
| CSHARP-CAND-03 | `https://github.com/JamesNK/Newtonsoft.Json` | `tmp/phase-21-external-csharp/JamesNK-Newtonsoft.Json` | `4f73e74372445108d2c1bda37b36e6f5e43402e0` | Very popular JSON library | No selected launch config | README and source projects are recognizable, but `Build/*.ps1` includes build/signing workflow scripts. No scripts were run. Suitable only for a narrowly scoped project restore/build after deeper per-project review. | screened-caution | library/console backup | Mature library validates real-world code but is larger and has release scripts, so not selected for first pass. |
| CSHARP-CAND-04 | `https://github.com/serilog/serilog` | `tmp/phase-21-external-csharp/serilog-serilog` | `2ef63645cf0d0edd4b187510b238754249c4348f` | Popular logging library | No selected launch config | Root `NuGet.config`, `Build.ps1`, and CI publish paths with secret package keys were present. Project commands are blocked unless a future plan isolates a safe subproject and package-source behavior. | blocked | library test backup | Useful logging domain diversity, but package-feed/publish surfaces make it unsafe for this plan's execution target. |
| CSHARP-CAND-05 | `https://github.com/spectreconsole/spectre.console` | `tmp/phase-21-external-csharp/spectreconsole-spectre.console` | `09da7966bd3dd35513bd45f6eb7feaf899315e01` | Popular terminal UI library | No selected launch config | README is benign, but workflows include publish automation with `dotnet make publish --nuget-key=...`; source has centralized props/packages. No project commands were run. | screened-caution | console/library backup | Console domain is relevant to dap-cli users, but build system is broader than needed for first safe attempt. |
| CSHARP-CAND-06 | `https://github.com/commandlineparser/commandline` | `tmp/phase-21-external-csharp/commandlineparser-commandline` | `1e3607b97af6141743edb3c434c06d5b492f6fb3` | Established command-line parser library | No selected launch config | Root `CommandLine.sln`, `Directory.Build.props`, README, demos, tests, and library projects were inspected; no obvious credential/cloud/Docker/curl-pipe risk surfaced in the root screen. Kept as selected backup because target frameworks may require extra compatibility review. | selected-backup | external demo/library debug | CLI-oriented code is relevant and smaller than large platform repos; backup if CSHARP-CAND-01 fails. |

## Selected Attempts

- Primary execution target: `CSHARP-CAND-01` (`dotnet/samples`, `core/getting-started/golden/app`) because it is official, small, net8.0-compatible, has a simple Debug DLL output, and its selected path has no local scripts/hooks/launch config/package-source surprises beyond ordinary NuGet restore for Newtonsoft.Json.
- Backup target: `CSHARP-CAND-06` after additional per-project target-framework review if the primary attempt fails for environment reasons.
- Blocked target: `CSHARP-CAND-04` because root package-feed/publish/secret surfaces are unnecessary risk for this plan.

Every selected or backup candidate remains untrusted; execution in `21-EXTERNAL-PROJECT-RESULTS.md` may still downgrade to blocked if restore/build/debug exposes a new safety or environment issue.
