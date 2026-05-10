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
