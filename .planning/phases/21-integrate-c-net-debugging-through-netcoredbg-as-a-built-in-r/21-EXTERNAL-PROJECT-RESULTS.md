# Phase 21 External C# Project Results

external_validation_status: pass

## Result Contract

Each attempt below preserves the required external-validation fields and uses one of the permitted result labels. Attempts used shallow clones recorded in `21-EXTERNAL-PROJECT-CANDIDATES.md`, phase-owned scratch under `tmp/phase-21-external-csharp/`, isolated `DAP_CLI_HOME`, `DOTNET_CLI_HOME`, and `NUGET_PACKAGES`, and separated restore, build, and debug execution.

## Result Ledger

### Attempt CSHARP-EXT-01

attempt_id: CSHARP-EXT-01  
candidate_id: CSHARP-CAND-01  
repo_url: https://github.com/dotnet/samples  
result: fail  
commit_sha: c6eb3268ba912447e820ba78e3d35ee2c5d7e0b0  
scenario_class: external console DLL launch, incompatible first host attempt  
debug_config: `{"program":".../dotnet-samples/core/getting-started/golden/app/bin/Debug/net8.0/app.dll","cwd":".../dotnet-samples/core/getting-started/golden/app","args":[],"stopAtEntry":true}`  
breakpoint: `core/getting-started/golden/app/Program.cs:10`  
exact_commands:

```text
git clone --depth 1 https://github.com/dotnet/samples tmp/phase-21-external-csharp/dotnet-samples
git -C tmp/phase-21-external-csharp/dotnet-samples rev-parse HEAD
screen README, Directory.Build.props, selected app/library .csproj files, selected Program.cs/Thing.cs, hooks, package feeds, scripts, workflows, and launch configs
export DAP_CLI_HOME=$PWD/tmp/phase-21-external-csharp/attempt-01-dotnet-samples-golden/dap-cli-home
export DOTNET_CLI_HOME=$PWD/tmp/phase-21-external-csharp/attempt-01-dotnet-samples-golden/dotnet-home
export NUGET_PACKAGES=$PWD/tmp/phase-21-external-csharp/attempt-01-dotnet-samples-golden/nuget-packages
export PATH=$PWD/tmp/phase-21-x64-proof/netcoredbg/netcoredbg:$PATH
dotnet restore tmp/phase-21-external-csharp/dotnet-samples/core/getting-started/golden/app/app.csproj
dotnet build tmp/phase-21-external-csharp/dotnet-samples/core/getting-started/golden/app/app.csproj -c Debug --no-restore
node dist/index.js start
node dist/index.js launch --adapter netcoredbg --type coreclr --name phase21-dotnet-samples --stop-on-entry --json <debug_config>
node dist/index.js cleanup
node dist/index.js stop-controller
kill 70758
```

evidence: Screening passed for the selected `dotnet/samples` golden app path. Isolated restore/build with the host arm64 `dotnet` completed, and x64 NetCoreDbg was found at the explicit phase proof path. `dap-cli launch` failed before a debug stop with `dap_request_timeout` on `configurationDone`; the adapter log showed only adapter startup. This is recorded as a failed first attempt, not a pass, because the Rosetta pair was incomplete: x64 NetCoreDbg was paired with arm64 `dotnet`.

product_docs_gap: none; docs already require an explicit compatible x64 `dotnet` + x64 NetCoreDbg pair on darwin/arm64. The failure confirmed that x64 NetCoreDbg alone is insufficient.

cleanup_verified: true

### Attempt CSHARP-EXT-02

attempt_id: CSHARP-EXT-02  
candidate_id: CSHARP-CAND-01  
repo_url: https://github.com/dotnet/samples  
result: pass  
commit_sha: c6eb3268ba912447e820ba78e3d35ee2c5d7e0b0  
scenario_class: external console DLL launch through NetCoreDbg `coreclr`  
debug_config: `{"program":".../dotnet-samples/core/getting-started/golden/app/bin/Debug/net8.0/app.dll","cwd":".../dotnet-samples/core/getting-started/golden/app","args":[],"stopAtEntry":true}`  
breakpoint: `core/getting-started/golden/app/Program.cs:10`  
exact_commands:

```text
screen README, Directory.Build.props, selected app/library .csproj files, selected Program.cs/Thing.cs, hooks, package feeds, scripts, workflows, and launch configs
export DAP_CLI_HOME=$PWD/tmp/phase-21-external-csharp/attempt-02-dotnet-samples-golden-x64/dap-cli-home
export DOTNET_CLI_HOME=$PWD/tmp/phase-21-external-csharp/attempt-02-dotnet-samples-golden-x64/dotnet-home
export NUGET_PACKAGES=$PWD/tmp/phase-21-external-csharp/attempt-02-dotnet-samples-golden-x64/nuget-packages
export DOTNET_ROOT=$PWD/tmp/phase-21-x64-proof/dotnet-x64
export PATH=$PWD/tmp/phase-21-x64-proof/dotnet-x64:$PWD/tmp/phase-21-x64-proof/netcoredbg/netcoredbg:$PATH
export DAP_CLI_ALLOW_DARWIN_ARM64_NETCOREDBG_SMOKE=1
dotnet --info
netcoredbg --version
dotnet restore tmp/phase-21-external-csharp/dotnet-samples/core/getting-started/golden/app/app.csproj
dotnet build tmp/phase-21-external-csharp/dotnet-samples/core/getting-started/golden/app/app.csproj -c Debug --no-restore
node dist/index.js start
node dist/index.js launch --adapter netcoredbg --type coreclr --name phase21-dotnet-samples-x64 --stop-on-entry --json <debug_config>
node dist/index.js breakpoints set --name phase21-dotnet-samples-x64 --source tmp/phase-21-external-csharp/dotnet-samples/core/getting-started/golden/app/Program.cs --line 10
node dist/index.js continue --name phase21-dotnet-samples-x64
node dist/index.js status --name phase21-dotnet-samples-x64
node dist/index.js events --name phase21-dotnet-samples-x64 --after-cursor 0 --limit 20
node dist/index.js threads --name phase21-dotnet-samples-x64
node dist/index.js stack --name phase21-dotnet-samples-x64
node dist/index.js continue --name phase21-dotnet-samples-x64
node dist/index.js status --name phase21-dotnet-samples-x64
node dist/index.js events --name phase21-dotnet-samples-x64 --after-cursor 12 --limit 20
node dist/index.js stack --name phase21-dotnet-samples-x64
node dist/index.js scopes --name phase21-dotnet-samples-x64 --frame-id 1
node dist/index.js variables --name phase21-dotnet-samples-x64 --variables-reference 1
node dist/index.js evaluate --name phase21-dotnet-samples-x64 --frame-id 1 --expression 'new Thing().Get(19, 23)'
node dist/index.js evaluate --name phase21-dotnet-samples-x64 --frame-id 1 --expression 'args.Length'
node dist/index.js continue --name phase21-dotnet-samples-x64
node dist/index.js status --name phase21-dotnet-samples-x64
node dist/index.js events --name phase21-dotnet-samples-x64 --after-cursor 15 --limit 20
node dist/index.js close --name phase21-dotnet-samples-x64
node dist/index.js cleanup
node dist/index.js stop-controller
```

evidence:

- **Screening:** Selected path was `tmp/phase-21-external-csharp/dotnet-samples/core/getting-started/golden/app`; README documents ordinary `dotnet restore`, `dotnet build`, `dotnet run`. Root `Directory.Build.props` only sets analyzer/style properties. Selected `app.csproj` is SDK-style `net8.0` and references only local `../library/library.csproj`; `library.csproj` targets `netstandard2.0` and references `Newtonsoft.Json` `13.0.3`. No selected-path scripts, Makefiles, devcontainers, `NuGet.config`, `.targets`, or `.vscode/launch.json` were found.
- **Pinned environment:** `dotnet --info` reported the explicit Rosetta x64 SDK `8.0.421` under `tmp/phase-21-x64-proof/dotnet-x64` with host architecture `x64`; `netcoredbg --version` reported `NET Core debugger 3.1.3-1` from `tmp/phase-21-x64-proof/netcoredbg/netcoredbg/netcoredbg`.
- **Restore/build separation:** `dotnet restore .../app.csproj` restored `app.csproj` and `library.csproj`; `dotnet build ... -c Debug --no-restore` produced `library/bin/Debug/netstandard2.0/library.dll` and `app/bin/Debug/net8.0/app.dll` with `Build succeeded`, `0 Warning(s)`, `0 Error(s)`.
- **Breakpoint:** `breakpoints set` initially returned `verified:false` with the normal symbol-loading warning, then events cursor `7` recorded breakpoint `id:1`, `line:10`, `source.path: .../Program.cs`, `verified:true`.
- **Stack:** After continuing past the entry stop, `status` reported `paused:true`, `stoppedReason:"breakpoint"`. `stack` reported `app.Program.Main()` at `Program.cs:10` with frame id `1`.
- **Scopes/variables:** `scopes --frame-id 1` returned `Locals` with `variablesReference:1`; `variables --variables-reference 1` returned local `args` with type `string[]` and value `{string[0]}`.
- **Evaluate-or-fallback:** `evaluate 'new Thing().Get(19, 23)'` failed with NetCoreDbg `SyntaxKindNotImplementedException: ObjectCreationExpression not implemented`, and `evaluate 'args.Length'` failed with `The name 'args.Length' does not exist in the current context`. The attempt therefore used the documented fallback: retained the stopped breakpoint and used `scopes`/`variables` as live paused-state proof rather than fabricating evaluate success.
- **Continue/close:** Final `continue` ran the public sample to completion; events cursor `40` recorded stdout `The answer is 42`, cursor `42` recorded `exitCode:0`, and cursor `43` recorded `terminated`. `close`, `cleanup`, and `stop-controller` succeeded.

product_docs_gap: none for launch; the existing docs already tell agents to fall back to scopes/variables when NetCoreDbg rejects an evaluate expression. The real external attempt reinforces that guidance.

cleanup_verified: true

## Summary

| Attempt | Candidate | Scenario class | Result | Cleanup |
| --- | --- | --- | --- | --- |
| CSHARP-EXT-01 | CSHARP-CAND-01 | external console DLL launch with incomplete Rosetta pair | fail | true |
| CSHARP-EXT-02 | CSHARP-CAND-01 | external console DLL launch with explicit x64 dotnet + x64 NetCoreDbg | pass | true |

- Selected external attempts completed: 2.
- Distinct public repositories fully attempted: 1.
- Passing screened public C# debug attempts: 1.
- The failed first attempt is preserved as a compatibility lesson and not counted as success.
- The passing attempt demonstrates screened public repo SHA pinning, isolated homes, separated restore/build/debug, breakpoint verification, stack, scopes, variables, evaluate-or-fallback, continue, close, and cleanup.
