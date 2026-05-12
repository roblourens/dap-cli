# Phase 17 — Scenario Results

Per-scenario execution ledger for the 20 Code OSS attach scenarios in
`17-SCENARIOS.md`. Rows are appended in order S-01 → S-20, one per
fresh subagent run, committed individually for crash resilience.

## Scenario Results

### S-01 — Pause main process bootstrap

- **status:** pass
- **scenario:** S-01 — Pause main process bootstrap (Electron main, pwa-node, attach)
- **cleanup_verified:** true (pgrep -f 'scripts/code.sh' empty; port 5875 empty)
- **what_worked:**
  - Attached via `dap-cli` + workspace launch config `Attach to Main Process` (port 5875, `outFiles` from launch.json) against `./scripts/code.sh --inspect-brk=5875 --user-data-dir .build/chat-memory-smoke/user-data`.
  - `--json-overrides '{"continueOnAttach":false}'` kept the main process paused at entry so a deferred breakpoint could be set before continue.
  - Breakpoint set on the compiled JS path `out/vs/code/electron-main/main.js:85` verified=true and fired.
  - Top frame on stop: `id=25 name="CodeMain.startup"` at `out/vs/code/electron-main/main.js:85` — contains `startup` ✓.
  - `evaluate process.pid` → `9586` matches `lsof -i :5875 -sTCP:LISTEN` (Code-OSS PID 9586 listening on 5875).
  - No `dapCli.helperProcessWarning` event in the stream.
  - Cleanup: `dap-cli close` + `dap-cli stop-controller` + `pkill -f 'scripts/code.sh'` → pgrep empty, port 5875 empty, PID 9586 gone.
- **what_didnt:**
  - First attempt: breakpoint on the TypeScript source path `src/vs/code/electron-main/main.ts:100` returned `verified=false` and never bound — even after children loaded `main.ts`, even when set on the parent session as the dap-cli skill instructs. Code OSS ran past `startup()` with no stop. Switching the breakpoint to the `.js` output path with the launch config's `outFiles` is what made it bind.
  - Initial attach via raw flags (`--adapter js-debug --type pwa-node --port 5870`) had no `outFiles` attached, so even the `.js`-path breakpoint would likely have struggled. `--workspace` + `--config "Attach to Main Process"` was required to pick up `outFiles`.
- **agent_confusion:**
  - dap-cli attach has no `--address`/`--host` flag (only `--port`). The skill's Common Commands section doesn't show it either way. A model trained on generic DAP would guess `--address`. Minor papercut.
  - The skill says "set breakpoints on the parent session name" for multi-process js-debug. For this Electron `--inspect-brk` attach, the parent has 0 loaded sources, the bp goes Unbound, and the `verificationDiagnostic` literally reads "likely attached to the wrong process. Run: dap-cli dap loaded-sources --name s01". That diagnostic is misleading here: the subagent was attached to the right process — the source just wasn't loaded yet, and even after children loaded it the `.ts`→`.js` sourcemap binding never resolved on the parent. The hint sent the agent hunting the wrong way; only switching to the `.js` path made it bind.
  - The vscode launch skill is renderer/CDP-focused. It doesn't mention `--inspect` / `--inspect-brk` on `scripts/code.sh`, doesn't mention port 5875 / `Attach to Main Process`, and doesn't mention that the persistent profile is `.build/chat-memory-smoke/user-data`. For main-process attach scenarios the agent had to derive the right flags from `.vscode/launch.json` by hand.
- **dap_cli_ergonomic_issues:**
  - `verificationDiagnostic.hint` "likely attached to the wrong process" should be softer when the session has multi-process js-debug children but the parent has 0 sources and the breakpoint matches a child — current wording is actively misleading.
  - Setting a breakpoint on a TS source against a pwa-node attach that has `outFiles` in the config should resolve via sourcemap. With `Attach to Main Process` config it didn't. Either dap-cli isn't propagating `outFiles` to the SetBreakpoints request, or it's not surfacing what js-debug actually saw. A diagnostic field listing the `resolveSourceMapLocations` / `outFiles` that js-debug ended up using would have saved significant time.
  - dap-cli `attach` lacks `--address`/`--host` — only `--port`. Not a blocker for localhost, but worth documenting.
  - When parent `stoppedThreadIds` shows `[0]` but `threads()` `sessionName` points at a child, that's clear enough — but the docs/skill didn't make it obvious that `--thread-id 0` on the parent maps to the child's thread. Worked, just a subtle mental model.
- **evidence:**
  - `/tmp/s01-evidence.log` (summary)
  - `/tmp/s01-codeoss-3.log` (Code OSS launch terminal — captured `Debugger listening on ws://127.0.0.1:5875/...`)
  - Inline transcript in subagent report: poll 2 → True breakpoint [0]; stack frame 25 `CodeMain.startup` at `out/vs/code/electron-main/main.js:85`; `evaluate process.pid` → 9586; `lsof :5875` → Code-OSS PID 9586; final pgrep empty.

---

### S-01 — re-run after dap-cli + skill hardening

Re-run after two changes landed:
- `feat(cli): auto-resolve --thread-id when omitted on continue/pause/step/stack` (commit `ac9ad5e`).
- `~/.copilot/skills/dap-cli/SKILL.md` rewritten 248 → 108 lines, language-specific notes split into `references/javascript-typescript.md` and `references/python.md` (user dotfiles, not in this repo).

#### r8 — Claude default

- **status:** pass
- **cleanup_verified:** true (`pgrep -f 'scripts/code.sh'` empty)
- **summary:** Breakpoint set on the `.ts` source path — `src/vs/code/electron-main/main.ts:101` — fired with `stoppedReason: breakpoint`. Top frame `CodeMain.startup` at the `.ts` path. `evaluate process.pid` → `83722`, matched `lsof -i :5875 -sTCP:LISTEN` PID `83722`. No `helperProcessWarning` event.
- **what_didnt:** none of substance.
- **dap_cli_ergonomic_issues:**
  - `breakpoints set --no-human` still emits a human-readable warning line to stderr alongside the JSON envelope; agents parsing stdout are fine but mixed-stream parsers see noise.
  - `status` payload is verbose; a `--field` shorthand or smaller default shape would help polling loops.
  - Wished for a `dap-cli wait-for-stop` helper instead of `status` polling.
- **evidence:** `/tmp/codeoss-s01-r8.log`

#### r9 — GPT-5.5

- **status:** pass
- **cleanup_verified:** true (`pgrep -f 'scripts/code.sh'` empty)
- **summary:** Breakpoint on `src/vs/code/electron-main/main.ts:101` fired with `stoppedReason: breakpoint`. Top frame `CodeMain.startup`, source path is the `.ts` file. `evaluate process.pid` → `18491`, matched the PID listening on `:5875`. No `helperProcessWarning`.
- **what_didnt:**
  - `breakpoints set` returned an envelope with `verification_timeout` even though the breakpoint resolved and fired correctly after continue. Naming sounds alarming for a benign multi-process attach.
  - `stack` needed an explicit `--thread-id 0` once a worker thread also existed; auto-resolve only fires when there is exactly one candidate, which is the intended behavior but easy to miss after a worker spawns.
- **evidence:** `tmp/s01-r10-transcript.md` (subagent-saved)

#### Takeaway

Both models, with no scenario-specific hints, set a breakpoint on the `.ts` source, hit it, and identified the right process. The previous `.ts` → `.js` confusion and `--thread-id 1` guessing failures from earlier rounds did not recur. Remaining items are ergonomic papercuts, not blockers:

1. `verification_timeout` naming sounds like an error when it isn't.
2. `breakpoints set --no-human` mixes a stderr warning with the JSON envelope.
3. No first-class `wait-for-stop` / `--field` shorthand.

S-01 considered solid for the matrix; pause before resuming S-02 to let the docs/skill get another pass from a separate agent.

---

### S-02 — Catch an extension activating

#### r1 — Claude default (pre-Phase 18)

- **status:** fail
- **cleanup_verified:** true
- **summary:** `.ts` breakpoint on `extHostExtensionService.ts:423` source-mapped correctly (`breakpoint.changed verified=true` against the mapped `.js` path); triggering JSON ext activation fired the breakpoint with `reason: breakpoint, hitBreakpointIds: [1], child_session_id: sess_Yxn6OuS5OioNBAc6`. But `status --name s02` reported `paused: false`, `sessions --show-children` reported each child `paused: false`, `stack` returned `thread_not_paused`. Stop visible in `events --include stopped`; inspection unreachable through the parent.
- **diagnosis:** Two narrow bugs in `ChildSessionCoordinator` — (a) parent paused-state mirror was "last child event wins" (bootloader's `terminated` clobbered the real child's `stopped`); (b) `findChildOwningThread` picked the first child whose thread cache claimed an id, regardless of paused-ness. See [`.planning/phases/18-per-child-paused-state-and-paused-first-routing/CONTEXT.md`](../18-per-child-paused-state-and-paused-first-routing/CONTEXT.md).
- **evidence:** `/tmp/codeoss-s02-r1.log` … `/tmp/codeoss-s02-r4.log` (subagent terminal transcripts)

#### r2 — Claude default (post-Phase 18)

- **status:** pass
- **cleanup_verified:** true (`pgrep -f 'scripts/code.sh'` empty)
- **summary:** Re-run after `feat(18-01): per-child paused-state union and paused-first routing` (commits `3b7ba15` → `c1d0231`). `dap-cli attach --workspace … --config "Attach to Extension Host"` picked up `outFiles` from launch.json. `.ts` breakpoint on `extHostExtensionService.ts:424` (the `await this._mainThreadExtensionsProxy.$onWillActivateExtension(...)` line) verified `true` immediately. After one `continue`, the bp tripped on extension activation. `status` reports `paused: true`, `stoppedReason: "breakpoint"`, `stoppedThreadIds: [0]`. Top frame `ExtHostExtensionService._activateExtension` at the `.ts` path, line 424. `evaluate extensionDescription.identifier.value` → `'vscode.extension-editing'`. No `helperProcessWarning`.
- **what_didnt:** nothing material.
- **agent_confusion:** none.
- **dap_cli_ergonomic_issues:** none.
- **evidence:** `/tmp/codeoss-s02-r2.log`

#### Takeaway

Phase 18 fix validated against the live target that surfaced the bug. Inspection through the parent now works for multi-child js-debug attaches; the agent did not need to know a child existed.

---

### S-03 — Catch the chat widget submitting input

#### r1 — Claude default (post-Phase 18)

- **status:** pass
- **cleanup_verified:** true (`pgrep -f 'scripts/code.sh'` and `pgrep -f '@playwright/cli'` both empty)
- **summary:** `dap-cli attach --adapter js-debug --type pwa-chrome` to CDP port 9224 attached cleanly. `.ts` breakpoint on `src/vs/workbench/contrib/chat/browser/widget/chatWidget.ts:2377` (first executable line of `_acceptInput`) verified `true` immediately. Playwright drove the chat input via keyboard shortcut + `press` (no `fill`). The bp fired in under 30s of pressing Enter. `status --name s03` reported `paused: true`, `stoppedReason: "breakpoint"`, `stoppedThreadIds: [0]`. The stop was actually in a child session (`child_session_id: sess_y62aqjq2nqFOB61_`); Phase 18's per-child paused-state union surfaced it through the parent. Top frame `ChatWidget._acceptInput` at the `.ts` path, line 2377. No `helperProcessWarning`.
- **what_didnt:** nothing material.
- **agent_confusion:** none. Both skills covered the path. Phase 18 note in the skill that multi-child inspection works through the parent meant the agent never had to discover or target the child session — single-name workflow throughout.
- **dap_cli_ergonomic_issues:**
  - `dap-cli stack 2>&1 | python3 …` couldn't parse because a non-JSON line on stderr (likely heuristic warning) interleaved with the JSON envelope. Redirecting `2>/dev/null` fixed it. Same `--no-human`/stderr-interleave papercut noted on S-01 r8.
- **evidence:** `/tmp/s03-r1-evidence.txt`; Code OSS launch log `/tmp/codeoss-s03-r1.log`.

---

### S-04 — Pause the shared process during boot

#### r1 — Claude default

- **status:** pass (with caveats — see agent_confusion / dap_cli_ergonomic_issues)
- **cleanup_verified:** true (no `scripts/code.sh`, no `Code - OSS`, ports 5879 and 9224 clear)
- **summary:** `dap-cli attach` via launch.json "Attach to Shared Process" config (port 5879, outFiles set). Bp on `src/vs/code/electron-utility/sharedProcess/sharedProcessMain.ts:181` (first executable line of `init()`) hit during boot. Initial bp set returned unverified with the "0 loaded sources / 1 child session" hint; bp upgraded and fired in worker child after `continue`. Phase 18 child rollup: parent `status` reported paused with `threads:[0]`, `stack --name shared` returned `SharedProcessMain.init` at the .ts source. `evaluate process.pid` → 6152, matched `lsof -i :5879 -sTCP:LISTEN -t` → 6152. No `helperProcessWarning`. `meta.warnings` showed up correctly on the `breakpoints set` envelope (post today's commit `5ba3928`).
- **what_didnt:** First two attach attempts missed `init()` because the prompt's `--inspect-shared=5879` flag does not exist — the real VS Code flags are `--inspect-sharedprocess=PORT` and `--inspect-brk-sharedprocess=PORT`. Without `-brk`, the shared process boots past `init()` before any agent can race in. Final pass needed: kill the running Code OSS, relaunch with `--inspect-brk-sharedprocess`, attach, set bps, `continue --thread-id 0`.
- **agent_confusion:**
  - **Scenarios doc bug** — `--inspect-shared=5879` is fabricated. Should be `--inspect-brk-sharedprocess=5879`. Agent had to read VS Code's `argv.ts` to discover the real flag names. Fix the S-04 entry in `17-SCENARIOS.md`.
  - The launch skill documents `--remote-debugging-port` for the renderer but is silent on per-utility-process `--inspect[-brk]-{sharedprocess,ptyhost,extensions}=PORT` flags. Worth a small section there.
  - AppleScript Cmd+Q was blocked by Accessibility permissions — the only reliable shared-process restart trigger was `pkill 'Code - OSS'` + relaunch with `-brk`.
- **dap_cli_ergonomic_issues:**
  - `dap-cli continue --name shared` (no `--thread-id`) **still** printed the `continue: --thread-id not provided; using stopped thread 0` line to stderr in JSON mode after today's `meta.warnings` migration. Needs investigation — either `continue` doesn't go through `OutputWriter.warn` (separate code path), or the subagent's `npx dap-cli` resolved to a stale build. Worth verifying.
  - Multi-child both-paused-on-id-0 case: parent `continue` correctly fails with `thread_id_required` listing both threads, but the error envelope lacks a concrete next-step recipe (e.g. `data.recovery: "re-run with --thread-id N --child-session-id sess_…"`). Fine for a human, friction for an agent loop.
  - Identical `breakpoints set` calls on the same TS source returned wildly different `verified` values across attach attempts (verified=true on a bootloader-paused parent that can't possibly have loaded the source yet, unverified on the next). The unverified case is diagnosed correctly; the false-verified one is misleading.
  - `dap-cli status --name shared` returns `paused: null` for ~1–2 seconds after `attach` before flipping to `paused: true`. Agents need to poll, not act on the first read. Small docs note ("settling") would help.
- **evidence:** `/tmp/codeoss-s04-r1.log`, `/tmp/codeoss-s04-r2.log`, `/tmp/codeoss-s04-r3.log`. Top frame `SharedProcessMain.init` at `…/sharedProcess/sharedProcessMain.ts:181`. PID match 6152.

---

### S-05 — Conditional breakpoint on the pty host

#### r1 — Claude default

- **status:** pass
- **cleanup_verified:** true (no `scripts/code.sh`, no `Code - OSS`, no `@playwright/cli`, ports 5877 and 9224 clear)
- **summary:** `--inspect-brk-ptyhost=5877` paused the pty host on entry as soon as the integrated terminal opened (Ctrl+\` via `@playwright/cli` against CDP 9224). `dap-cli attach --adapter js-debug --type pwa-node --json '{"port":5877,"continueOnAttach":false,"sourceMaps":true,"outFiles":[…],"resolveSourceMapLocations":[…]}'` attached cleanly with the parent paused on `pause` reason and a single child session for the pty host. No `helperProcessWarning`. Conditional bp on `src/vs/platform/terminal/node/ptyHostMain.ts:30` with `--condition "typeof process !== 'undefined'"` was forwarded verbatim — verified twice: (a) `dap-cli breakpoints list` echoed `requested:[{line:30, condition:"…"}]`, (b) the js-debug trace log showed the DAP `setBreakpoints` request with the literal `condition` field AND the corresponding CDP `Debugger.setBreakpointByUrl` wrapping that expression in js-debug's IIFE error-trap. After `continue`, bp fired in ≤1s with top frames `startPtyHost` and `<anonymous>` both at the `.ts` source.
- **what_didnt:** First attach attempt used raw js-debug attach without `sourceMaps`/`outFiles`. The .ts breakpoint set successfully and the condition was forwarded (visible in trace), but js-debug only registered a URL regex matching `ptyHostMain.ts`; when the runtime parsed the `out/.../ptyHostMain.js` file it never re-resolved via the source map, so the program ran past the line. dap-cli's `verificationDiagnostic` correctly flagged this; round 2 added `outFiles` + `sourceMaps:true` + `resolveSourceMapLocations` to the attach payload.
- **agent_confusion:**
  - none from the dap-cli skill. `verificationDiagnostic` told the agent exactly what was wrong on round 1.
  - Stale `DAP_CLI_HOME` exported from a previous session caused a brief detour (~30s); the dap-cli skill's gotchas already covers this.
  - **launch skill papercut** — `npx @playwright/cli press 'Control+Backquote'` is the right form; the skill doesn't spell that out (Ctrl+\` is ambiguous in markdown). One-liner fix.
- **dap_cli_ergonomic_issues:**
  - The unverified-bp `verificationDiagnostic` lists ts-node / Jest advice first; for a Node-attach-with-source-maps case the actual fix is `outFiles` + `sourceMaps` in the attach payload, which is mentioned but buried. Reordering / surfacing the attach-payload fix more prominently when the diagnostic detects an outFiles-shaped miss would shave time off similar setups.
- **evidence:** `/tmp/codeoss-s05-r1.log`; js-debug trace `~/.dap-cli/logs/js-debug-trace-1778464052008.log` (round 1 — condition forwarded but source-map never resolved); `~/.dap-cli/logs/js-debug-96861.log` (round 2 — bp fired). Top frames: `startPtyHost` and `<anonymous>` at `…/ptyHostMain.ts:30` and `:26`. CDP wrap of the condition: `(()=>{try{return typeof process !== 'undefined';}catch(e){…return false}})()`.

---

### S-06 — Reach into the file watcher process

#### r1 — Claude default

- **status:** blocked (anticipated by scenario doc — useful negative finding)
- **cleanup_verified:** true (no `scripts/code.sh`, no `Code - OSS`, port 5871 clear)
- **summary:** No inspector hook for the file watcher utility process. Source confirms: zero references to `VSCODE_FILE_WATCHER_INSPECT_PORT`, `--inspect-watcher`, or `--inspect-file-watcher` anywhere in `/Users/roblou/code/vscode/src`. The fork path in `src/vs/platform/files/node/watcher/watcherClient.ts` uses `Client(...)` with a hardcoded env block (no `--inspect-port` plumbing) and the utility-process variant in `src/vs/workbench/services/files/electron-browser/watcherClient.ts` uses `createWorker({ moduleId: ... })` with no inspect option. Empirical confirmation: launched Code OSS with the env var, opened a folder to force the watcher to spin up, `lsof -i :5871 -sTCP:LISTEN` returned no listener before AND after the folder open. Ext-host inspector on 5870 lit up correctly during the same launch — proves the launch was healthy, just no hook on the watcher.
- **what_didnt:** There is no zero-modification path to debug the watcher today. Adding the hook would require a small change to `watcherClient.ts` to forward an `--inspect-port=N` arg (gated on an env var) when forking.
- **agent_confusion:** none. The scenario heads-up about this being a likely blocker matched reality exactly.
- **dap_cli_ergonomic_issues:** none — never reached an attach attempt.
- **evidence:** `/tmp/codeoss-s06-r1.log` (ext-host inspector on 5870 visible, no watcher inspector line), `/tmp/codeoss-s06-r1-open.log`. Source: `src/vs/platform/files/node/watcher/watcherClient.ts` (fork path), `src/vs/workbench/services/files/electron-browser/watcherClient.ts` (utility-process path).

---

### S-07 — Read the user's Quick Open query out of the search process

#### r1 — Claude default

- **status:** pass (after pivot — see what_didnt)
- **cleanup_verified:** true (no `scripts/code.sh`, no `Code - OSS`, no `@playwright/cli`, ports 5876 / 5870 / 9224 clear)
- **summary:** **Architectural finding:** in current Code OSS, `rawSearchService.ts` is instantiated inside the **extension host** via `extHostSearch.ts:101` (`new SearchService('fileSearchProvider', ...)`). There is no separate "search worker" process anymore. `--inspect-search=5876` is dead — port never opened, even after driving the Quick Open path through to results. Pivoted to attaching to the ext-host inspector on 5870 (`--inspect-extensions=5870` added to launch). Attach payload: `pwa-node` with `sourceMaps:true`, `outFiles:[".../vscode/out/**/*.js"]`, `resolveSourceMapLocations`, `continueOnAttach:true`. Bps on `rawSearchService.ts:37` (fileSearch first executable line) AND `:92` (`doFileSearch` — the actual code path Quick Open hits) both verified=true immediately. Drove Cmd+P with Playwright, typing "readme" one char at a time. Bp fired 7 times (priming + 6 keystrokes). Read `config.filePattern` via auto-frame evaluate at every stop: `""` → `"r"` → `"re"` → `"rea"` → `"read"` → `"readm"` → `"readme"`. Final value matches the typed query exactly. Stack at every stop: `SearchService.doFileSearch` ← `NativeExtHostSearch.doInternalFileSearchWithCustomCallback` ← `doInternalFileSearch` ← `$provideFileSearchResults` ← `rpcProtocol` — confirms attach is to the ext-host, not a helper.
- **what_didnt:**
  - `--inspect-search=5876` has zero effect; port never opened. Looks like dead/legacy arg in argv.ts now that search has moved into the ext-host.
  - First Quick Open attempt was driven into the wrong OSS window (a tab with no folder open → "No matching results"). Switched to the workspace tab and bp fired immediately. Worth a one-liner in the scenario doc: when multiple OSS tabs are visible via CDP, pick the one with a workspace folder.
- **agent_confusion:** none material — scenario framing was "search process" but source-reading resolved the architecture in one round.
- **dap_cli_ergonomic_issues:**
  - On a fresh stop after `continue`, evaluating with the previously-cached `--frame-id 0` returned `dap_request_failed`. Dropping `--frame-id` and letting auto-frame resolve worked. A clearer error code (e.g. `stale_frame_id`) would save a retry.
  - `breakpoints set --line 37` snapped to line 38 (visible in response as `line: 38`), but a `meta.warnings` like "snapped from requested line 37 to 38" would make the snap obvious without diffing the request body.
- **evidence:** `/tmp/codeoss-s07-r2.log`; r1-only confirmation that 5876 dead at `/tmp/codeoss-s07-r1.log`. Source proof: `extHostSearch.ts:101`, `rawSearchService.ts:91`. Filename growth `'' → 'r' → 're' → 'rea' → 'read' → 'readm' → 'readme'`.

---

### S-08 — Pause the agent host process

#### r1 — Claude default

- **status:** blocked (pause/stop never observed despite healthy attach)
- **cleanup_verified:** true (no `scripts/code.sh`, no `Code - OSS`, no `@playwright/cli`, port 5878 / 9224 clear)
- **summary:** Multiple discoveries: (a) `--inspect-agenthost` / `--inspect-brk-agenthost` both exist and are wired through `parseAgentHostDebugPort` → `ElectronAgentHostStarter` (adds `--nolazy --inspect[-brk]=PORT` to utility-process `execArgv`); inspector port 5878 opens reliably ~3s after OSS launch on the agent-host node utility process. (b) Scenario doc pointed at `server/node/server.main.ts` but that's the remote server; the actual agent-host entry is `src/vs/platform/agentHost/node/agentHostMain.ts:65` (`startAgentHost();`). (c) **Prerequisite finding**: `chat.agentHost.enabled` defaults to `false` (`chat.contribution.ts:985`); without it, `AgentHostProcessManager` is never even constructed (`app.ts:1112-1114`). Wrote `{"chat.agentHost.enabled": true}` into `User/settings.json` and the agent host then spawned. Attach succeeded — parent + child sessions appeared per Phase 18.
- **what_didnt:** Pause never reaches the agent-host V8.
  - With `-brk`: utility process at `STAT=SN, %CPU=0.0`, log file 0 bytes (bootstrap held at entry — proof js-debug should have a paused target), but dap-cli never received a `stopped` event. js-debug trace shows it sent `Runtime.runIfWaitingForDebugger` to the parent CDP target (`connectionId:0`) and got `Target.attachToTarget` with the child sessionId — but no `Debugger.paused` ever came back.
  - Without `-brk`: agent host bootstrapped fully then sat idle. `dap-cli pause` (and raw `dap-cli request pause --json '{"threadId":0}'`) returned `success:true` immediately. js-debug trace shows `cdp.send` of `Debugger.pause` going out — but **with no CDP `sessionId`**, so it lands on the bootloader root target instead of the user-code child target. No `Debugger.paused` event ever fires; subsequent `stack` returns `thread_not_paused` indefinitely.
  - Could not even fall back to bp-on-known-line: `dap-cli breakpoints set --source agentService.ts --line 100` returned `controller_request_timeout` (exit 7) twice on two separate launches. Other commands (`pause`, `status`, `sessions`, `stack`) on the same session responded in <1s.
- **agent_confusion:**
  - Wrong file in scenario doc: `server/node/server.main.ts` vs actual `platform/agentHost/node/agentHostMain.ts`. Resolved by reading `nodeAgentHostStarter.ts:72` and `electronAgentHostStarter.ts:78-80` which name the entrypoint explicitly.
  - One round wasted assuming `--agents` flag alone makes the host start. It does not — the host spawns lazily via `_onRequestConnection.fire()` (`agentHostService.ts:39`), which requires `chat.agentHost.enabled: true` AND a renderer requesting the connection.
- **dap_cli_ergonomic_issues:**
  - **`pause` returns `ok: true` even when the underlying CDP request was sent to the wrong target session and no `Debugger.paused` event ever arrives.** From the agent's POV there is no signal — only repeated `thread_not_paused` on subsequent `stack`. A timeout-and-warn policy ("pause acknowledged but no `stopped` event after Ns; check whether js-debug routed to the correct child target") would have saved multiple rounds.
  - **`breakpoints set` hangs to controller_request_timeout** on a pwa-node attach session to an Electron utility process. Diagnostic ("Check whether the controller process is still healthy") was misleading — controller was healthy, the request just never resolved. A specific code like `bp_set_adapter_timeout` would help triage adapter-side hangs.
  - `--show-children` returns a bare `[parent, child]` list, not the standard envelope shape — a one-liner assumption that `data` was an array tripped initially. Documented in the skill but easy to forget.
- **evidence:** `/tmp/codeoss-s08-r1.log`; js-debug trace `~/.dap-cli/logs/js-debug-trace-1778468376396.log` (no `Debugger.paused` ever emitted). Process confirmation: agent host PID 1383 with `--type=utility --utility-sub-type=node.mojom.NodeService --nolazy --inspect=5878`, `STAT=SN, %CPU=0.0` while pause was queued. Source citations: `agentHostMain.ts:65`, `electronAgentHostStarter.ts:57-60`, `chat.contribution.ts:985`, `app.ts:1112-1114`, `agentHostService.ts:39`.

#### follow-up — dap-cli fixes landed

- **status:** both ergonomic issues fixed in dap-cli `main`. See `17-S08-FINDINGS.md` for the full root-cause investigation.
  - `pause` silent-misroute → commit `3af3194` `fix(controller): warn when pause is acked but no stopped event arrives`. Post-success hook in `routeDapRequest` waits up to `pauseStoppedWaitTimeoutMs` (default 2000ms) for `manager.status(...).paused === true`; on timeout attaches a `pause_no_stopped_event` warning to the response with diagnostics pointing at `dap-cli sessions --json`.
  - `breakpoints set` hang → commit `f836b61` `fix(controller): bound child-readiness wait in setBreakpoints to prevent controller IPC timeout`. Added `awaitChildrenReadyTimeoutMs` option (default 3000ms) and `awaitChildrenReadyBounded()` helper; both `routeSetBreakpointsThroughParent` and `fanOutSetBreakpoints` now skip stalled children and surface `child_readiness_timeout` warnings instead of hanging past the 5s IPC budget.
- **rerun_recommended:** S-08 r2 against current `main` to confirm the warnings surface end-to-end on a real Code OSS agent-host attach, and to capture the new diagnostic shape in evidence.

---

### S-09 — Logpoint that doesn't pause

#### r1 — Claude default

- **status:** pass
- **cleanup_verified:** true (no `scripts/code.sh`, no `Code - OSS`, no `@playwright/cli`, port 9225 clear)
- **summary:** `dap-cli attach --adapter js-debug --type pwa-chrome` to CDP port 9225 — parent + 1 child. `dap-cli breakpoints set --log-message "DAPLOG resolve resource={resource.toString()}"` on `fileService.ts:194` returned `verified:true` on first try. Logpoint did NOT pause execution. Triggered file activity with `npx @playwright/cli press "Meta+,"` (open settings). `dap-cli events --name vsc --include output --after-cursor 0` surfaced 90 stdout-category events with body matching the template, e.g. `DAPLOG resolve resource=file:///Users/roblou/.claude/rules`, `DAPLOG resolve resource=vscode-synced-customization:/.../skills/commit/SKILL.md`. Child output mirrored into parent stream as documented.
- **what_didnt:** Shared user-data-dir opened the Agents workbench (sessions-dev.html) with no folder open, so Cmd+P quick-open was unavailable. Pivoted to Cmd+, (settings) — enough to drive `fileService.resolve`. README.md itself never opened, but criterion 2 was met.
- **agent_confusion:** none — pwa-chrome attach + js-debug logpoint syntax in the skill matched what worked.
- **dap_cli_ergonomic_issues:** none for this scenario. The `body.category=stdout` (not `console`) for js-debug logpoints is already called out in the JS/TS reference; without that note the agent would have filtered the wrong category.
- **evidence:** `/tmp/codeoss-s09-r1.log`. Parent `sess_wyK7iqm_zSwMX7VU` + child `sess_6vCFJ7AtTrVxr5M-`. Bp set response `{verified:true, line:194, column:22}`. 90 DAPLOG hits in event stream after one Cmd+, press.

---

## S-10 r1 — pass

- **scenario:** Webview enumeration via `--show-children` and `child_session_not_targetable` rejection.
- **launch:** `./scripts/code.sh --user-data-dir .build/chat-memory-smoke/user-data --remote-debugging-port=9226`, attach via `dap-cli attach --adapter js-debug --type pwa-chrome --json '{"address":"localhost","port":9226,"webRoot":"/Users/roblou/code/vscode"}' --name vsc`. Trigger: opened README.md, pressed Cmd+Shift+V to spawn the Markdown preview webview.
- **result:** all three criteria satisfied.
  - `sessions --show-children` after webview open: 3 children with `parent_session_id = sess_ecwfpvoaIZCXKRLP`, `targetable: false`. Two new children appeared on Cmd+Shift+V.
  - `status --name 'vsc#4250...'` returned the rejection envelope verbatim: `error.code=child_session_not_targetable`, `category=session`, `exitCode=4`, `error.data.parentSessionId=sess_ecwfpvoaIZCXKRLP`, diagnostics string instructs `--name vsc`.
  - `events --name vsc --include output --after-cursor 0` returned 28 output events on the parent stream including a real ext-host stdout line. `body.child_session_id` set per-child for routing.
- **what_worked:** first-try attach; clean child enumeration; rejection envelope shape exactly matches the skill's documented contract; child output mirrored to parent via `body.child_session_id`.
- **what_didnt:** initial attach used `--request attach` (doesn't exist; `attach` is the verb). Skill quick-start does say so. Self-correcting on retry.
- **agent_confusion:** minor — reached for nonexistent `--request` flag.
- **dap_cli_ergonomic_issues:** the "common gotchas" line "`sessions` returns bare lists" is ambiguous — `sessions --show-children` actually returns the standard `{ok,data,meta}` envelope. Worth disambiguating which flavor is bare.
- **evidence:** `/tmp/codeoss-s10-r1.log`. Parent `sess_ecwfpvoaIZCXKRLP`. Children: `sess_V34QyMhUUdOqQjHv` (ext host), `sess_-yv2fmgYuRPzOrMN` + `sess_3c2bXAWKxmPTsMIu` (webviews from Cmd+Shift+V).

---

## S-11 r1 — blocked

- **scenario:** Walk through chat-service code with step in/over/out.
- **status:** blocked
- **cleanup_verified:** true
- **summary:** Code OSS launched on `--remote-debugging-port=9227`, Playwright attached, and dap-cli attached to the renderer, but Chat never became ready. The UI stayed at `Getting chat ready...` / `Signing in to GitHub`, so no chat request reached `_sendRequestAsync` and the step-over / step-in / step-out sequence could not be exercised.
- **what_worked:** CDP `/json/version` and `/json/list` were reachable; dap-cli controller started; js-debug attach succeeded with renderer sessions `sess_jH6EYg221IJrGOpF` and `sess_szW6r273QtnUw5Qq`; Playwright captured the workbench and chat UI.
- **what_didnt:** The TypeScript breakpoint at `src/vs/workbench/contrib/chat/common/chatService/chatServiceImpl.ts:1050` stayed unbound, as did an emitted-JS attempt at `out/vs/workbench/contrib/chat/common/chatService/chatServiceImpl.js:844`. Chat input submission attempts did not trigger a stopped event; `stack` failed with `thread_not_paused`.
- **agent_confusion:** The scenario prompt referenced missing `~/.copilot/skills/dap-cli/SKILL.md`; the subagent recorded that and used the repo-local `skills/dap-cli/SKILL.md` fallback. It also tried Playwright `run-code` once with statement syntax and hit `SyntaxError: Unexpected token 'const'` before switching approach.
- **dap_cli_ergonomic_issues:** `dap-cli sessions --json` is not accepted even though JSON is the default output envelope. `breakpoints set` normalizes URL-like sources into filesystem paths, making `vscode-file://...` breakpoints awkward through the convenience command. `dap loaded-sources` returned an empty list while the renderer child was present but `targetable:false`, making source binding harder to diagnose.
- **evidence:** `tmp/phase-17-runs/S-11.log`. Key outputs include controller `pid:60578`, attach sessions `sess_jH6EYg221IJrGOpF` / `sess_szW6r273QtnUw5Qq`, target URL `vscode-file://vscode-app/Users/roblou/code/vscode/out/vs/code/electron-browser/workbench/workbench-dev.html`, breakpoint `verification_timeout` / `Unbound breakpoint`, `thread_not_paused`, and UI text `Getting chat ready...` / `Signing in to GitHub`.

---

## S-12 r1 — blocked

- **scenario:** Restart a frame inside `extensionHostManager.activate`.
- **status:** blocked
- **cleanup_verified:** true
- **summary:** The required `--inspect-extensions=5870` attach succeeded, but that target was the extension host utility process while `extensionHostManager.activate` is workbench/renderer-side. A renderer attach verified breakpoints on `extensionHostManager.activate`, but reload/open-file/temporary-extension activation triggers never paused there, so `restart-frame` could not be validly attempted on the target frame.
- **what_worked:** dap-cli controller started; `S-12` attached to port 5870 as `sess_HeddX0WGLYkkYYYO` with `supportsRestartFrame: true`; renderer workaround session `S-12-renderer` attached as `sess_N1UH21u9160W8yP-`; TypeScript and compiled-JS breakpoints for `extensionHostManager.activate` verified in the renderer session.
- **what_didnt:** The 5870 session never bound the target breakpoint and reported no loaded sources on the parent. The renderer session stayed running after reload, opening Markdown/TypeScript files, installing a temporary `activationEvents: ["*"]` VSIX, and reloading again. No pause inside `activate`, so no legitimate restart-frame proof.
- **agent_confusion:** The prompt's launch command points at `--inspect-extensions=5870`, but the requested frame is not in the extension host process. The subagent also initially tried `sessions --json`; this CLI uses JSON by default or `--no-human`.
- **dap_cli_ergonomic_issues:** Parent `loaded-sources` returned empty while child sessions existed; child sessions are not directly targetable; setting breakpoints on the extension-host attach timed out as unbound; `pause` on some threads returned `pause_no_stopped_event`.
- **evidence:** `tmp/phase-17-runs/S-12.log`. Key outputs include requested `~/.copilot/skills/dap-cli/SKILL.md` missing with repo-skill fallback, `attach S-12` session `sess_HeddX0WGLYkkYYYO`, `supportsRestartFrame:true`, `verified:false` / `Unbound breakpoint` on 5870, CDP title `electron/js2c/utility_init`, renderer session `sess_N1UH21u9160W8yP-`, verified renderer breakpoints, and final cleanup `pgrep_exit=1`.

---

## S-13 r1 — blocked

- **scenario:** Pause-while-running and inspect scopes/variables.
- **status:** blocked
- **cleanup_verified:** true
- **summary:** The exact Code OSS launch printed a DevTools browser URL, but immediately left no process/listener on port 9228. A diagnostic relaunch with `--wait` kept the browser CDP endpoint alive, but `/json/list` stayed empty, so there was no debuggable renderer/page target for dap-cli/js-debug to attach to. Pause, scopes, variables, and continue could not be exercised.
- **what_worked:** Evidence logging was created; Code OSS emitted a DevTools URL; `dap-cli start` worked; failed sessions were closed; `stop-controller` worked; final cleanup removed `scripts/code.sh`, port 9228 listeners, and the dap controller.
- **what_didnt:** The exact launch did not leave port 9228 listening. With `--wait`, port 9228 listened but exposed only the browser endpoint and an empty target list. `dap-cli attach` first failed with `Could not find any debuggable target`, then timed out against the live-but-targetless endpoint.
- **agent_confusion:** The requested `~/.copilot/skills/dap-cli/SKILL.md` path was missing, so the subagent recorded that and read the repo-local fallback. The launch command printed `DevTools listening` even when the port was gone immediately afterward; `--wait` was only a diagnostic attempt and still exposed no renderer target.
- **dap_cli_ergonomic_issues:** `dap-cli sessions --json --show-children` failed because `sessions` has no `--json` option. `attach` against a live CDP browser endpoint with empty `/json/list` timed out instead of surfacing `no debuggable renderer/page target` directly.
- **evidence:** `tmp/phase-17-runs/S-13.log`. Key outputs include `DevTools listening on ws://127.0.0.1:9228/...` followed by `curl` connection failure, diagnostic `--wait` with `Code - OSS ... 127.0.0.1:9228 (LISTEN)`, `/json/version`, `/json/list` returning `[ ]`, attach failures `adapter_transport_closed` / `Could not find any debuggable target` and `dap_request_timeout`, and final cleanup with no `scripts/code.sh`, no port 9228 listener, and `controller_unavailable` after `stop-controller`.

---

## S-14 r1 — fail

- **scenario:** Catch an uncaught exception in the main process.
- **status:** fail
- **cleanup_verified:** true
- **summary:** Exception filter setup succeeded and the forced uncaught throw executed in the Code OSS main process, but dap-cli never observed a paused-on-exception state. Status stayed `running`, and stack retrieval after the throw failed with `thread_not_paused`.
- **what_worked:** `dap set-exception-breakpoints` accepted `{"filters":["uncaught"]}` with `ok:true`. Main-process inspector was exposed in-place via `SIGUSR1` on PID `97719`; attach succeeded as `sess_JRT6TOVpW-AFpoSU`; `evaluate --frame-id 28` scheduled `setImmediate(() => { throw new Error('s14-test') })`. Code OSS logged `[uncaught exception in main]: Error: s14-test` with throw site `eval-c731c480.repl:1:28`.
- **what_didnt:** After `continue --thread-id 0`, dap-cli status remained `running` with `paused:false`; events showed only the earlier `reason:"pause"` stop, not an exception stop. Final stack failed with `Thread is not paused`, so the paused-on-exception and stack success criteria were not met.
- **agent_confusion:** The requested `~/.copilot/skills/dap-cli/SKILL.md` path was missing, so the subagent captured that failure and used the repo-local skill. The scenario mentions `pause-while-running`, but that command was not available in dap-cli help; the subagent used `pause --thread-id 0` and a raw request path to get a paused REPL frame.
- **dap_cli_ergonomic_issues:** `sessions --json` and `status --json` are rejected; machine-readable output requires global `--no-human`. `set-exception-breakpoints` is only under `dap`. Parent/child routing was difficult: the child owning thread `0` cannot be targeted directly, parent `pause --thread-id 0` initially returned `pause_no_stopped_event`, and raw `request evaluate` timed out while still leaving the session paused. `dap exception-info` produced `Unknown request: exceptionInfo` in stderr tail.
- **evidence:** `tmp/phase-17-runs/S-14.log`. Key outputs include attach session `sess_JRT6TOVpW-AFpoSU`, exception filter `{"ok":true,"data":{}}`, evaluate result `{"ok":true,"data":{"type":"Immediate"...}}`, Code OSS log `[uncaught exception in main]: Error: s14-test`, final status `status:"running", paused:false`, and final stack error `thread_not_paused`.

---

## S-15 r1 — fail

- **scenario:** Pause Code OSS running as a web server.
- **status:** fail
- **cleanup_verified:** true
- **summary:** `code-server.sh` served HTTP successfully on port 8898, but the required launch command did not expose a Node inspector on 5872. The server printed `Ignoring option 'inspect': not supported for server.`, `lsof` showed no listener on 5872, and dap-cli attach failed before any breakpoint/pause work could happen.
- **what_worked:** `code-server.sh` launched, bound to `[::1]:8898`, and `curl http://localhost:8898/` returned `HTTP/1.1 200 OK`. dap-cli controller started successfully. Cleanup completed.
- **what_didnt:** dap-cli could not attach. Attach session `sess_N_ynXPdWLH8IK1Jo` failed with `adapter_transport_closed`; js-debug stderr said `Could not connect to debug target at http://127.0.0.1:5872: Could not find any debuggable target`. No breakpoint was verified, no pause occurred, and no paused-frame `process.pid` could be compared.
- **agent_confusion:** The exact requested skill path `~/.copilot/skills/dap-cli/SKILL.md` was missing, so the subagent logged that failure and read the repo-local skill. It also initially tried trailing `--json` as an output flag, but dap-cli treats `attach --json` as the raw attach config argument; it corrected and retried with explicit config JSON.
- **dap_cli_ergonomic_issues:** `dap-cli sessions --json` is not supported even though many commands emit JSON by default. `attach --json` is easy to confuse with an output-mode flag because it means adapter-native config JSON. The primary blocker was outside dap-cli: Code OSS server accepted `--inspect=5872` in argv but ignored it.
- **evidence:** `tmp/phase-17-runs/S-15.log`. Key outputs include `Ignoring option 'inspect': not supported for server.`, no listener from `lsof -nP -iTCP:5872 -sTCP:LISTEN`, `node ... TCP [::1]:8898 (LISTEN)`, attach failure for `sess_N_ynXPdWLH8IK1Jo`, and HTTP trigger `HTTP/1.1 200 OK`.

---

## S-16 r1 — fail

- **scenario:** Multi-thread inspection on the renderer.
- **status:** fail
- **cleanup_verified:** true
- **summary:** Code OSS launched on remote debugging port 9229 and CDP showed renderer worker targets, but dap-cli's `threads` listing never returned more than one DAP thread. Because the `>=2` thread criterion failed, the scenario could not satisfy pause/stack on a non-main thread.
- **what_worked:** Code OSS launched with `DevTools listening on ws://127.0.0.1:9229/...`. `curl http://127.0.0.1:9229/json/list` showed one `page` target plus worker targets including `TextMateWorker` and `editorWorkerService`. dap-cli controller started and js-debug attaches succeeded with sessions `sess_DVl3_uXl-Bd9QnjP`, `sess_DIQDIbYdjqAIEW1x`, and final probe `sess_XOiKAvnCUY4z0i6t`.
- **what_didnt:** `threads --name s16-renderer-broad` returned only one thread: `{"id":0,"name":"index.ts — dap-cli","sessionName":"s16-renderer-broad#BC27A7AD8100426D74C01914415E5A6B"}`. A pause against that only visible thread returned `ok:true` with `pause_no_stopped_event`; stack then failed with `thread_not_paused`.
- **agent_confusion:** The required `~/.copilot/skills/dap-cli/SKILL.md` path did not exist, so the subagent captured that failure and used the repo-local skill after reading the requested launch skill. Prior Phase 17 transcript searching was noisy and bloated the log, but the scenario evidence is present.
- **dap_cli_ergonomic_issues:** dap-cli/js-debug did not expose CDP worker targets as DAP threads even though `/json/list` showed them. `pause` can return `ok:true` with `pause_no_stopped_event`, so success classification requires follow-up `status`/`stack`. Failed `evaluate` while running returned a generic `dap_request_failed` without much adapter detail in stdout.
- **evidence:** `tmp/phase-17-runs/S-16.log`. Key outputs include CDP target list with `type:"page"` plus two `type:"worker"` targets, final `threads` output with exactly one thread, final `pause` warning `pause_no_stopped_event`, final `stack` error `thread_not_paused`, and cleanup `pgrep -f 'scripts/code.sh'` exit 1.

---

## S-17 r1 — pass

- **scenario:** Verify breakpoints list/clear semantics on main.
- **status:** pass
- **cleanup_verified:** true
- **summary:** Verified breakpoint list/clear semantics on the Code OSS main process. The default `Attach to Main Process` config used port 5875, but that port was not listening; the live main-process inspector was on `127.0.0.1:9229`, so the subagent retried the same config with `--port 9229` and completed the breakpoint CRUD checks.
- **what_worked:** `breakpoints set` behaved with replacement semantics per source. After setting line 90, `breakpoints list` showed `requested:[{"line":90}]`. After setting line 101 for the same source, the list showed only `requested:[{"line":101}]`, not both lines. `breakpoints clear --source ...` returned `requested:0`, and the subsequent list returned `sources:[]`.
- **what_didnt:** The first attach using the VS Code launch config's default main-process port 5875 failed with `dap_request_timeout` because nothing was listening on that port. The actual Code OSS main inspector was listening on 9229.
- **agent_confusion:** The required `~/.copilot/skills/dap-cli/SKILL.md` path did not exist, so the subagent recorded that failure and used the repo-local skill. It also hit a zsh helper-script mistake by using read-only variable name `status`, then continued with a corrected helper.
- **dap_cli_ergonomic_issues:** The attach timeout did not directly say that the configured port was not listening; the subagent diagnosed it with `lsof`. Breakpoint `set` returned `verified:false` / `Unbound breakpoint` warnings, but the scenario was about CRUD/list semantics and the controller-side list state was sufficient.
- **evidence:** `tmp/phase-17-runs/S-17.log`. Key outputs include failed default attach `dap_request_timeout` for `sess_fhlsGU0sNP6KruPO`, live port check showing Code OSS listening on `127.0.0.1:9229`, successful retry `sess_wWg5URfm4Po7Z9vb`, first list line 90, second list only line 101, clear returning `requested:0`, and final list `{"sources":[]}`.

---

## S-18 r1 — fail

- **scenario:** Evaluate REPL on a renderer with no paused frame.
- **status:** fail
- **cleanup_verified:** true
- **summary:** Attached dap-cli to the Code OSS renderer as `s18-renderer` (`sess_GqgIQDvkKwb8mrlZ`) and ran both evaluate probes. Explicit `--context repl` returned a useful `navigator.userAgent` string containing `Electron`, but the auto-frame short form did not return a structured error. It succeeded with the same Electron user-agent result, so the first success criterion failed.
- **what_worked:** Code OSS launched on 9230 after clearing a stale same-profile Code OSS instance. dap-cli attached successfully with `pwa-chrome`. Explicit REPL-context evaluation returned a user-agent containing `code-oss-dev/1.121.0`, `Chrome/142.0.7444.265`, and `Electron/39.8.8`.
- **what_didnt:** Auto-frame evaluate with nothing paused returned `ok:true` and exit code 0, with warning `evaluate: session not paused; sending evaluate without --frame-id (uses adapter REPL context)`. The scenario expected a structured error envelope, specifically not a misleading controller-unavailable error.
- **agent_confusion:** The requested `~/.copilot/skills/dap-cli/SKILL.md` path did not exist, so the subagent logged that failure and used the repo-local fallback. First attach also failed because an orphaned Code OSS instance was already running on the persistent profile with port 9229, so the initial 9230 launch did not expose a usable endpoint.
- **dap_cli_ergonomic_issues:** The key mismatch is that omitted-frame `evaluate` on a running session falls back to adapter REPL context and succeeds instead of surfacing the no-paused-frame structured error S-18 is checking for. Cleanup also required killing the detached Code OSS app process directly; `pkill -f 'scripts/code.sh'` only verified the wrapper process was gone.
- **evidence:** `tmp/phase-17-runs/S-18.log`. Key outputs include attach session `sess_GqgIQDvkKwb8mrlZ`; Probe 1 `evaluate --name s18-renderer --expression 'navigator.userAgent'` returning `ok:true`, Electron user-agent, and exit code 0; Probe 2 `--context repl` also returning `ok:true` and Electron user-agent; and the initial failed attach `adapter_transport_closed` before stale app cleanup.

---

## S-19 r1 — fail

- **scenario:** Drive the workspace `VS Code` compound launch.
- **status:** fail
- **cleanup_verified:** true
- **summary:** Compound launch of `VS Code` from `/Users/roblou/code/vscode` failed before any member sessions were created. dap-cli started the controller and discovered the `VS Code` compound with all five expected members, but `launch --config "VS Code"` failed on the first member, `Launch VS Code Internal`, with `compound_member_start_failed` / `DAP request timed out: launch`.
- **what_worked:** Config discovery worked and showed expected compound members: `Launch VS Code Internal`, `Attach to Main Process`, `Attach to Extension Host`, `Attach to Shared Process`, and `Attach to Agent Host Process`. Controller started successfully with pid `14172`. Cleanup completed.
- **what_didnt:** The compound did not create sessions. `sessions --show-children` returned `[]`, so status/threads for two members, member close, and compound stopAll cascade could not be exercised. The launched Code OSS process had `--remote-debugging-port=9222`, but `curl http://127.0.0.1:9222/json/version` failed with connection refused. The js-debug trace showed repeated `ECONNREFUSED` while looking up `/json/version`.
- **agent_confusion:** The requested `~/.copilot/skills/dap-cli/SKILL.md` path did not exist, so the subagent recorded that and used the repo-local dap-cli skill before reading the requested VS Code launch skill.
- **dap_cli_ergonomic_issues:** `npx dap-cli cleanup --purge` returns `controller_unavailable` unless the controller is already running, making the requested pre-step less robust. Compound launch appears sequential: it waits for `Launch VS Code Internal` to complete before starting `Attach to Main Process`, but the VS Code launch config includes `--inspect-brk=5875`, so the main process can stay paused before renderer debug port 9222 opens. That leaves no dap-cli session record while an orphaned Code OSS process can still be running.
- **evidence:** `tmp/phase-17-runs/S-19.log`. Key outputs include `launch --list-configs` finding compound `VS Code` with five expected members and `stopAll:true`; `launch --config "VS Code"` returning `compound_member_start_failed`; `sessions --show-children` returning `data:[]`; `status --name "VS Code"` returning `no_sessions`; js-debug trace with `Launching Chrome from /Users/roblou/code/vscode/scripts/code.sh` followed by repeated `connect ECONNREFUSED 127.0.0.1:9222`; and `ps` showing Code OSS launched with `--remote-debugging-port=9222`.

---

## S-20 r1 — pass

- **scenario:** Wrong-verb auto-route regression check.
- **status:** pass
- **cleanup_verified:** true
- **summary:** Wrong-verb `launch --config "Attach to Main Process"` auto-routed to attach successfully. The success payload included both `warnings` and `autoRouted` with `from:"launch"` and `to:"attach"`, and the resulting session was reachable via `status`.
- **what_worked:** `launch --workspace /Users/roblou/code/vscode --config "Attach to Main Process" --name s20-wrong-verb` returned `ok:true`, session `sess__XbucxYjQh9NTV25`, `warnings:["auto_routed_to: ..."]`, and `autoRouted:{"code":"auto_routed_to","from":"launch","to":"attach","configName":"Attach to Main Process"}`. `status` returned `ok:true`, lifecycle/status `running`.
- **what_didnt:** The literal required skill path `~/.copilot/skills/dap-cli/SKILL.md` was missing, so the subagent recorded that and read the repo-local skill. The requested Code OSS launch did not leave port 5875 listening; several Code OSS inspector attempts printed `Debugger listening` briefly and exited. The subagent used a fallback Node inspector on 5875 to complete the auto-route regression check.
- **agent_confusion:** The subagent first tried `--output json`, which is not a dap-cli option; correct JSON mode was global `--no-human`. It also had to start the dap-cli controller after an initial `controller_unavailable`.
- **dap_cli_ergonomic_issues:** The controller-unavailable path requires a separate `dap-cli start` retry. JSON output mode is global `--no-human`, while `launch --json` means raw config JSON, which is easy to confuse during smoke testing.
- **evidence:** `tmp/phase-17-runs/S-20.log`. Key outputs include launch payload `sessionId:"sess__XbucxYjQh9NTV25"`, `warnings:["auto_routed_to: 'Attach to Main Process' has request:'attach'; CLI verb 'launch' was overridden"]`, `autoRouted:{"from":"launch","to":"attach"}`, and status output `ok:true`, `name:"s20-wrong-verb"`, `lifecycle:"running"`, `status:"running"`.
