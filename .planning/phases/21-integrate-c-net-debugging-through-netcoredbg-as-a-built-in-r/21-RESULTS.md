# Phase 21 Fresh-Agent C# / .NET NetCoreDbg Results

results_status: complete_after_reruns

## Audit Rules Applied

- Every pass below is based on the Copilot CLI JSONL transcript plus the subagent report text, not on report summary alone.
- Transcript audit looked for command trajectory, wrong turns, hidden failures, retries, evidence, and cleanup.
- Missing or incomplete fresh-agent execution is marked `blocked`, not inferred from another scenario.

## Result Ledger

### C-01 - Install and readiness

result: pass
transcript: `/Users/roblou/.copilot/session-state/736d5a6c-cfa6-4fa6-8e2f-a8aff7ae9d94/events.jsonl`
transcript_audit: JSONL shows the agent read the skill/reference/setup docs, checked `Darwin arm64`, verified `netcoredbg` was not on PATH, ran isolated `npm run setup-adapters`, preserved `netcoredbg_unsupported_platform`, and removed the isolated DAP home.
actual_commands: `command -v netcoredbg`; `uname -s`; `uname -m`; `npm run setup-adapters` with `DAP_CLI_HOME=tmp/phase-21-fresh-agent-runs/C-01/.dap-cli-home`; cleanup/session checks.
wrong_turns: initial broad file searches before reading the intended skill path; setup installed other adapters before reaching the expected NetCoreDbg unsupported-platform gate.
what_worked: The documented readiness path and macOS arm64 unsupported-platform diagnostic were confirmed.
what_didnt: No usable PATH NetCoreDbg or supported pinned darwin/arm64 asset was available.
agent_confusion: Low; isolated `DAP_CLI_HOME` conflicted with generic skill advice but was required by this scenario.
dap_cli_ergonomic_issues: `setup-adapters` emits a stack-shaped failure for an expected readiness result.
evidence: `netcoredbg_unsupported_platform` diagnostic; no NetCoreDbg artifacts after setup failure; isolated home removed.
cleanup_verified: true

### C-02 - Fixture DLL launch debug

result: pass
transcript: `/Users/roblou/.copilot/session-state/401f9315-7aca-442d-a2ae-c4ec2d022a8a/events.jsonl`
transcript_audit: JSONL shows the agent built the fixture, hit a timeout with x64 NetCoreDbg plus arm64 dotnet, installed/used an isolated x64 runtime pair, reran, captured breakpoint/stack/scopes/variables/evaluate evidence, and cleaned up.
actual_commands: `dotnet restore`; `dotnet build -c Debug --no-restore`; `node dist/index.js start`; `launch --adapter netcoredbg --type coreclr --stop-on-entry`; `breakpoints set`; `continue`; `status`; `stack`; `scopes`; `variables`; `evaluate 'left + right'`; `close`; `cleanup`; `stop-controller`.
wrong_turns: First launch timed out at `configurationDone` due x64 NetCoreDbg paired with arm64 dotnet; rerun used matching x64 dotnet.
what_worked: Built DLL launch hit `Program.cs:17`, stack top was `Program.Calculate()`, locals showed `left=2`, `right=3`, `result=0`, evaluate returned `5`, and final status terminated.
what_didnt: Default setup still cannot provision NetCoreDbg on darwin/arm64.
agent_confusion: Architecture pairing was the main detour.
dap_cli_ergonomic_issues: Architecture mismatch surfaced as `dap_request_timeout` rather than a targeted runtime/architecture diagnostic.
evidence: Scenario log artifacts under `tmp/phase-21-fresh-agent-runs/C-02/`; transcript contains breakpoint, stack, scopes, variables, evaluate, final termination, and cleanup commands.
cleanup_verified: true

### C-03 - Short-lived fixture stop-at-entry

result: pass
transcript: `/Users/roblou/.copilot/session-state/fa5a8741-9fe4-4eb0-82aa-6c43ac361044/events.jsonl` (rerun task `phase-21-c03-rerun`; initial blocked transcript `/Users/roblou/.copilot/session-state/9a0a5508-bf66-4602-a12e-1eea79bfb357/events.jsonl`)
transcript_audit: Initial JSONL showed a stalled fresh agent. Rerun JSONL plus `tmp/phase-21-fresh-agent-runs/C-03-rerun/logs/debug-stopatentry.log` show local CLI commands, TCP controller fallback for long home path, launch with `stopAtEntry:true`, entry stop, verified breakpoint, breakpoint stop, stack/scopes/variables/evaluate, termination, close, cleanup, and stop-controller.
actual_commands: `cleanup`; `stop-controller`; `start`; `launch --adapter netcoredbg --type coreclr --stop-on-entry --json {"program":"...simple-csharp-short-lived.dll","stopAtEntry":true}`; `status`; `stack`; `breakpoints set --line 12`; `continue`; `threads`; `stack`; `scopes --frame-id 1`; `variables --variables-reference 1`; `evaluate left + right`; `continue`; `status`; `close`; `cleanup`; `stop-controller`.
wrong_turns: `--stop-on-entry` alone did not pause NetCoreDbg before exit; rerun used explicit JSON `stopAtEntry:true` as documented. Agent rebuilt local `dist` before using `node dist/index.js`.
what_worked: Short-lived fixture paused at entry, armed breakpoint line 12, hit `Program.Calculate()`, exposed locals `left=8`, `right=13`, `result=0`, and evaluated `left + right` as `21`.
what_didnt: Immediate CLI flag-only stop-on-entry was insufficient for NetCoreDbg; JSON `stopAtEntry:true` was required.
agent_confusion: Low after the initial stall; main confusion was the distinction between dap-cli flag and NetCoreDbg-native `stopAtEntry`.
dap_cli_ergonomic_issues: Status can initially report running before NetCoreDbg projects the entry stop; agents should poll once.
evidence: `tmp/phase-21-fresh-agent-runs/C-03-rerun/logs/debug-stopatentry.log` lines contain `stoppedReason:"entry"`, verified breakpoint line 12, stack `Program.Calculate()`, locals, evaluate result `21`, final `lifecycle:"terminated"`, and clean close/cleanup.
cleanup_verified: true

### C-04 - Executable/DLL-only conclusion

result: pass
transcript: `/Users/roblou/.copilot/session-state/b0efc503-3d28-4c9a-93d0-5e16f7a52ba5/events.jsonl`
transcript_audit: JSONL shows explicit build, successful DLL launch through inferred `.dll -> netcoredbg/coreclr`, and safe `.csproj` negative check without dap-cli-triggered MSBuild.
actual_commands: `dotnet restore`; `dotnet build -c Debug --no-restore`; `node dist/index.js launch --program <dll>`; `breakpoints set`; `continue`; `status`; `.csproj` launch attempt; `close`; `stop-controller`.
wrong_turns: First attempts looked for `./bin/dap-cli` and hit darwin/arm64 setup limitations before using the existing explicit x64 proof path.
what_worked: DLL launch succeeded and `.csproj` shape returned `adapter_inference_failed`.
what_didnt: The `.csproj` diagnostic says to pass adapter/type explicitly, which could nudge users toward an unsupported project-file launch.
agent_confusion: CLI entrypoint mismatch (`./bin/dap-cli` vs `node dist/index.js`) delayed the run.
dap_cli_ergonomic_issues: `.csproj` recovery text should emphasize build-first DLL launch.
evidence: `tmp/phase-21-fresh-agent-runs/C-04/c-04-run.log`; launch `ok:true`; status breakpoint; `.csproj_exit=2`.
cleanup_verified: true

### C-05 - Safe local attach

result: pass
transcript: `/Users/roblou/.copilot/session-state/92b69e08-75ec-4769-9c8c-b1d0f7685998/events.jsonl`
transcript_audit: JSONL shows attach to an owned fixture PID, meaningful paused stack inspection, `disconnect` with `terminateDebuggee:false`, target-survival proof, and exact-PID target cleanup. It also shows multiple wrong turns around controller socket path length and temp workdirs.
actual_commands: `dotnet build`; start owned `simple-csharp-attach.dll`; `attach --adapter netcoredbg --type coreclr --json {"processId":...}`; `pause`; `threads`; `status`; `stack`; `request disconnect --json {"terminateDebuggee":false}`; exact PID liveness check; exact PID termination; `cleanup`; `stop-controller`.
wrong_turns: Used short `/tmp` runner workdir to avoid Unix socket path length; x64 runtime shadowed SDK build once; multiple-thread `pause` needed explicit thread id; transient stale controller/adapter PIDs were killed by exact PID.
what_worked: Attach succeeded, paused state exposed `Program.Main()`, detach preserved the target, and only the owned target PID was stopped.
what_didnt: Locals were not meaningful at the pause frame; evaluate failed in the selected context.
agent_confusion: Worktree path length and x64 runtime pairing complicated an otherwise correct attach flow.
dap_cli_ergonomic_issues: `serve-controller` hid socket-path startup failure behind opaque `internal_error`.
evidence: `tmp/phase-21-fresh-agent-runs/C-05/c-05-success-transcript.log`; `target_survived_detach=true`; `target_stopped=true`.
cleanup_verified: true

### C-06 - Launch config `coreclr`

result: pass
transcript: `/Users/roblou/.copilot/session-state/fa5a8741-9fe4-4eb0-82aa-6c43ac361044/events.jsonl` (rerun task `phase-21-c06-rerun`; initial blocked transcript `/Users/roblou/.copilot/session-state/5c14c19f-a175-4d39-9a94-1ff06a478eb7/events.jsonl`)
transcript_audit: Initial JSONL showed repeated socket/version detours and a stall. Rerun JSONL plus `tmp/phase-21-fresh-agent-runs/C-06-rerun/logs/final/transcript.log` show local `node dist/index.js`, TCP fallback endpoint for the long DAP_CLI_HOME, config discovery, named config launch, breakpoint stop, stack/scopes/variables/evaluate, termination, and cleanup.
actual_commands: `start`; `launch --workspace <scratch> --list-configs`; `launch --workspace <scratch> --config "C-06 Debug Simple CSharp DLL"`; `status`; `breakpoints set --line 17`; `continue`; `status`; `threads`; `stack`; `scopes`; `variables`; `evaluate result`; `evaluate left + right`; `continue`; `status`.
wrong_turns: Initial relative DAP_CLI_HOME timed out; absolute scratch home plus controller TCP fallback worked.
what_worked: Scratch `type:"coreclr"` launch config was discovered and used; breakpoint `Program.cs:17` hit; stack showed `Program.Calculate()`; locals showed `left=2`, `right=3`, `result=0`; evaluate `left + right` returned `5`.
what_didnt: Immediate post-launch status showed running before the entry stop/breakpoint sequence settled.
agent_confusion: None after switching to local built CLI and absolute scratch home.
dap_cli_ergonomic_issues: Agents must poll status after NetCoreDbg launch; the initial running status is not final.
evidence: `tmp/phase-21-fresh-agent-runs/C-06-rerun/logs/final/transcript.log` includes config listing, named launch, breakpoint, stack/scopes/variables/evaluate, and final `lifecycle:"terminated"`.
cleanup_verified: true

### C-07 - Negative diagnostics

result: pass
transcript: `/Users/roblou/.copilot/session-state/4ebf5846-2a77-4f23-99b0-fa14761fd76a/events.jsonl`
transcript_audit: JSONL shows the agent selected a deterministic `clr` negative path, used isolated `DAP_CLI_HOME`, captured the exact `unknown_launch_type` JSON envelope, and did not turn the negative case green.
actual_commands: `dap-cli launch --type clr --program tests/fixtures/simple-csharp-app/bin/Debug/net8.0/simple-csharp-app.dll ...`
wrong_turns: Looked for unavailable `./bin/dap-cli`/`dist/index.js` before using `dap-cli` on PATH.
what_worked: Typed diagnostic `unknown_launch_type` with category `usage`, exit code `2`, and recovery to use `coreclr`.
what_didnt: The error diagnostics do not include C#-specific recovery text inline.
agent_confusion: Minor CLI path mismatch only.
dap_cli_ergonomic_issues: Recovery is in docs rather than in the diagnostic payload.
evidence: Exact JSON error envelope recorded in transcript.
cleanup_verified: true

### C-08 - Screened external console/library repo

result: pass
transcript: `/Users/roblou/.copilot/session-state/fa5a8741-9fe4-4eb0-82aa-6c43ac361044/events.jsonl` (rerun task `phase-21-c08-rerun`)
transcript_audit: Rerun JSONL and `tmp/phase-21-fresh-agent-runs/C-08-rerun/` logs show the agent used the already-screened `dotnet/samples` clone at SHA `c6eb3268ba912447e820ba78e3d35ee2c5d7e0b0`, isolated homes/caches, x64 Rosetta dotnet/netcoredbg, separated restore/build/debug, breakpoint stop, stack/scopes/variables, evaluate fallback, continue to output/exit, and cleanup.
actual_commands: `dotnet restore`; `dotnet build -c Debug --no-restore`; `node dist/index.js start`; `launch --adapter netcoredbg --type coreclr`; `breakpoints set Program.cs:10`; `continue`; `status`; `events`; `threads`; `stack`; `scopes`; `variables`; `evaluate`; `continue`; `close`; `cleanup`; `stop-controller`.
wrong_turns: Minor shell `!` history-expansion issue while parsing output; reran cleanly.
what_worked: Screened public `dotnet/samples` golden app hit `Program.cs:10`, stack showed `app.Program.Main()`, variables exposed `args={string[0]}`, and final stdout was `The answer is 42` with exit code 0.
what_didnt: NetCoreDbg evaluate failed for object creation and `args.Length`, so scopes/variables fallback was used.
agent_confusion: Low; shell quoting/history expansion was the only notable detour.
dap_cli_ergonomic_issues: First `start` timeout had sparse diagnostics before final rerun passed.
evidence: `tmp/phase-21-fresh-agent-runs/C-08-rerun/logs/` contains status, events, stack, scopes, variables, evaluate, close, cleanup, and stop-controller JSON artifacts.
cleanup_verified: true

### C-09 - External `coreclr` launch.json flow if found

result: pass
transcript: `/Users/roblou/.copilot/session-state/fa5a8741-9fe4-4eb0-82aa-6c43ac361044/events.jsonl` (rerun task `phase-21-c09-rerun`)
transcript_audit: Rerun JSONL plus `tmp/phase-21-fresh-agent-runs/C-09-rerun/evidence.log` show scratch `.vscode/launch.json` with `type:"coreclr"`, launch-config discovery/use through local `node dist/index.js`, screened `dotnet/samples` SHA, isolated homes, restore/build, breakpoint stop, stack/scopes/variables, evaluate fallback, continue to stdout/exit 0, and cleanup.
actual_commands: create scratch `.vscode/launch.json`; `dotnet restore`; `dotnet build -c Debug --no-restore`; `start`; `launch --list-configs`; `launch --workspace <scratch> --config "C-09 Golden CoreCLR"`; `breakpoints set Program.cs:10`; `continue`; `status`; `stack`; `scopes`; `variables`; `evaluate args.Length`; `continue`; `events`; `close`; `cleanup`; `stop-controller`.
wrong_turns: Initial stale `dist` required `npm run build`; one bad JSON capture was corrected.
what_worked: Scratch launch.json listed and launched by `--config`; breakpoint hit at `Program.cs:10`; stack `app.Program.Main()`; variables `args={string[0]}`; stdout `The answer is 42`; exit code 0.
what_didnt: `evaluate args.Length` failed, so variables fallback was used.
agent_confusion: Moderate initial CLI/build-output capture detour, then clean rerun.
dap_cli_ergonomic_issues: Stale dist can surface as controller start timeout; terminated state is represented by `lifecycle/status`, not `data.terminated`.
evidence: `tmp/phase-21-fresh-agent-runs/C-09-rerun/evidence.log` records environment, launch.json, restore/build, launch-config flow, breakpoint, stack/scopes/variables, output, exit, and cleanup.
cleanup_verified: true

### C-10 - Docs-only novice pass

result: pass
transcript: `/Users/roblou/.copilot/session-state/727466d7-4519-4541-9bb5-8d678581297b/events.jsonl`
transcript_audit: First docs-only run marked `cleanup_verified:false` despite no runtime resources; rerun used the exact docs-only cleanup expectation and returned `cleanup_verified:true`. No terminal/project commands beyond file reads were run in the passing transcript.
actual_commands: none; file reads only.
wrong_turns: Initial run `/Users/roblou/.copilot/session-state/cc058b5a-e54b-4653-9fa4-8dad-3ca6c38e2bec/events.jsonl` used correct content but wrong cleanup flag.
what_worked: Novice explanation covered build-first DLL launch, `coreclr` launch.json, short-lived `stopAtEntry`, safe attach with `terminateDebuggee:false`, public repo screening, evaluate fallback, cleanup, and stale reference reacquisition.
what_didnt: Initial cleanup flag was wrong and therefore not counted.
agent_confusion: Low after rerun.
dap_cli_ergonomic_issues: Docs require novices to track DLL paths, platform compatibility, and stop-scoped references manually.
evidence: Passing transcript includes only reads of `SKILL.md`, `csharp-netcoredbg.md`, and `docs/adapter-setup.md`.
cleanup_verified: true

## Summary

| Scenario | Result | Transcript audit | Cleanup |
| --- | --- | --- | --- |
| C-01 | pass | transcript found | true |
| C-02 | pass | transcript found | true |
| C-03 | pass | transcript found after rerun | true |
| C-04 | pass | transcript found | true |
| C-05 | pass | transcript found | true |
| C-06 | pass | transcript found after rerun | true |
| C-07 | pass | transcript found | true |
| C-08 | pass | transcript found after rerun | true |
| C-09 | pass | transcript found after rerun | true |
| C-10 | pass | transcript found after rerun | true |

Fresh-agent pass count: 10  
Blocked/fail count: 0  
No scenario is marked pass without JSONL transcript evidence.
