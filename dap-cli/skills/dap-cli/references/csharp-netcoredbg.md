# dap-cli - C# / .NET (NetCoreDbg)

Notes specific to the built-in `netcoredbg` adapter. Read this when debugging C#/.NET. The general loop in [SKILL.md](../SKILL.md) still applies.

## Readiness and compatibility

Run setup before a real NetCoreDbg session:

```bash
npm run setup-adapters
```

The built-in adapter prefers a usable `netcoredbg` on `PATH`; otherwise setup provisions pinned NetCoreDbg `3.1.3-1062` under `DAP_CLI_HOME/adapters/netcoredbg` for supported upstream platform assets. The setup path verifies pinned SHA-256 release metadata before extraction and starts NetCoreDbg with:

```bash
netcoredbg --interpreter=vscode
```

You also need a compatible `dotnet` SDK/runtime for `.dll` launch. Build projects before launching them; dap-cli does not run `.csproj` files, MSBuild targets, `preLaunchTask`, or `postDebugTask` on your behalf.

Microsoft `vsdbg` is not bundled or redistributed by dap-cli. Use NetCoreDbg with launch type `coreclr`. Desktop .NET Framework `clr` is unsupported for the built-in path unless separately proven; keep `type: "clr"` failures as `unknown_launch_type` rather than guessing.

### macOS arm64 caveat

Upstream NetCoreDbg `3.1.3-1062` has no `darwin/arm64` asset. dap-cli setup on Apple Silicon does not silently provision the macOS x64 asset. Real smoke on `darwin/arm64` has only been proven with an explicit compatible x64 `dotnet` SDK/runtime plus x64 NetCoreDbg under Rosetta and an opt-in environment override. Without that explicit pair, use a supported platform/arch asset or put a known-compatible `netcoredbg` on `PATH`.

## Build-first DLL launch

Build the project in Debug mode, then launch the output DLL:

```bash
dotnet build /workspace/my-csharp-app -c Debug
dap-cli launch --adapter netcoredbg --type coreclr --name csharp-debug \
  --json '{"program":"/workspace/my-csharp-app/bin/Debug/net8.0/my-csharp-app.dll","cwd":"/workspace/my-csharp-app","args":[],"stopAtEntry":true}'
dap-cli status --name csharp-debug
```

For short-lived console apps, include `--stop-on-entry` or `"stopAtEntry": true` so the process pauses before it can exit:

```bash
dap-cli launch --adapter netcoredbg --type coreclr --name csharp-entry --stop-on-entry \
  --json '{"program":"/workspace/my-csharp-app/bin/Debug/net8.0/my-csharp-app.dll","cwd":"/workspace/my-csharp-app"}'
```

After launch, set breakpoints by source path and follow the normal poll-then-inspect loop:

```bash
dap-cli breakpoints set --name csharp-debug --source /workspace/my-csharp-app/Program.cs --line 12
dap-cli continue --name csharp-debug
dap-cli status --name csharp-debug
dap-cli stack --name csharp-debug
dap-cli scopes --name csharp-debug --frame-id <frame-id-from-stack>
dap-cli variables --name csharp-debug --variables-reference <locals-reference-from-scopes>
dap-cli evaluate --name csharp-debug --expression 'left + right'
```

## Launch config shape

Use VS Code launch type `coreclr` with an explicit built artifact:

```jsonc
{
  "name": "Debug C# DLL",
  "type": "coreclr",
  "request": "launch",
  "program": "${workspaceFolder}/bin/Debug/net8.0/my-csharp-app.dll",
  "cwd": "${workspaceFolder}",
  "args": [],
  "stopAtEntry": true
}
```

dap-cli strips VS Code-only task/UI keys and rejects `${command:*}` / `${input:*}` variables with `unsupported_launch_variable`. Replace interactive variables with explicit values before invoking dap-cli. Do not convert this to a `.csproj` launch shortcut; project files can execute arbitrary build targets, so the supported flow is build first and launch the `.dll`.

## Scopes, variables, and evaluate fallback

When stopped, reacquire references every time:

```bash
dap-cli status --name csharp-debug
dap-cli threads --name csharp-debug
dap-cli stack --name csharp-debug
dap-cli scopes --name csharp-debug --frame-id <frame-id-from-stack>
dap-cli variables --name csharp-debug --variables-reference <locals-reference-from-scopes>
dap-cli evaluate --name csharp-debug --expression 'left + right'
```

Debug builds with PDB/source information give the best source, stack, locals, and evaluate behavior. If NetCoreDbg rejects an `evaluate` expression or returns a weak value, keep the stop and inspect `scopes` plus `variables` before deciding the value cannot be read.

## Safe same-machine PID attach

Attach only to a same-machine process you own and intend to debug:

```bash
dap-cli attach --adapter netcoredbg --type coreclr --name csharp-attach \
  --json '{"processId":12345}'
```

Use a breakpoint or pause to reach an inspectable stop, then use the same `status` → `stack` → `scopes` → `variables` loop. When detaching, preserve the target process with `terminateDebuggee:false` and then clean up only a process you created for the test:

```bash
dap-cli request disconnect --name csharp-attach --json '{"terminateDebuggee":false}'
dap-cli cleanup
```

Do not attach to arbitrary system PIDs, remote/container PIDs, or a process owned by another user. Do not use broad process cleanup after attach; terminate only the exact child process your script started.

## Troubleshooting diagnostics

- `netcoredbg_not_found`: run `npm run setup-adapters`, or put a compatible `netcoredbg` executable on `PATH`.
- `netcoredbg_unsupported_platform`: the pinned release has no supported asset for this platform/arch. On `darwin/arm64`, setup does not silently install x64 NetCoreDbg; provide an explicit x64 `dotnet` + `netcoredbg` Rosetta pair with the documented override, or move to a supported host.
- `netcoredbg_digest_mismatch`: the downloaded archive did not match pinned SHA-256 release metadata. Do not run or extract it.
- `dotnet` missing: install/select a compatible .NET SDK/runtime before launching a `.dll`.
- Build output missing: run `dotnet build -c Debug` and verify the exact `.dll` path under `bin/Debug/<target-framework>/`.
- `.csproj` given as `program`: unsupported by design. Build first; launch the compiled `.dll`.
- `unknown_launch_type` for `clr`: use `coreclr` for the built-in NetCoreDbg adapter.
- `unsupported_launch_variable`: replace `${command:*}` or `${input:*}` with concrete values before using dap-cli.

## Public repo safety

Treat public C# repositories as untrusted input. Before running commands, inspect README, `.sln`, `.csproj`, `.props`, `.targets`, `Directory.Build.*`, `NuGet.config`, launch configs, scripts, and task files. Reject flows requiring credentials, private feeds, cloud services, native installers, opaque scripts, non-localhost services, or curl-pipe installers.

Separate dependency fetch/build from debug execution, and isolate caches when validating external repos:

```bash
dotnet restore
dotnet build -c Debug --no-restore
dap-cli launch --adapter netcoredbg --type coreclr --name external-csharp \
  --json '{"program":"/workspace/external/bin/Debug/net8.0/external.dll","cwd":"/workspace/external","stopAtEntry":true}'
```

Keep exact commands and cleanup evidence. For attach validation, record that `disconnect` used `terminateDebuggee:false`, the target survived detach, and only the owned debuggee process was terminated afterward.
