---
phase: 17
status: ready
target_repo: /Users/roblou/code/vscode
scenario_count: 20
---

# Phase 17 — Code OSS Attach Scenario Matrix

## How To Use

Plan 17-02 walks this matrix and spawns one fresh subagent per scenario. Each
subagent receives the scenario's `subagent_prompt` block verbatim. Per-scenario
results land in `17-RESULTS.md`; per-scenario terminal transcripts land in
`tmp/phase-17-runs/S-NN.log`.

Each scenario describes a *task to accomplish* and *what success looks like* —
deliberately not the dap-cli commands to run. Figuring out the right
sequence of dap-cli commands from the dap-cli skill is the test. If the
subagent can't get there from the skill, that's a finding (doc/skill gap),
not a malformed scenario.

Two skills are required reading for every scenario:

- `~/.copilot/skills/dap-cli/SKILL.md` — dap-cli usage, `evaluate` auto-wrap,
  child-session handling, launch-vs-attach verb rule, structured error
  envelopes.
- `/Users/roblou/code/vscode/.agents/skills/launch/SKILL.md` — how to launch
  Code OSS via `scripts/code.sh`, the persistent
  `--user-data-dir .build/chat-memory-smoke/user-data` invariant for
  workbench/renderer scenarios, and `npx @playwright/cli` snapshot/interact
  patterns.

Standing invariants (do not violate in any scenario):

- Use `npx dap-cli …` for the dap-cli (published-CLI form, run
  `npm install -g dap-cli` or use `npx dap-cli`).
- For workbench/renderer scenarios always pass
  `--user-data-dir .build/chat-memory-smoke/user-data` (relative to the vscode
  repo root) so Copilot auth survives. Never create a fresh user-data-dir.
- After every scenario, run cleanup
  (`pkill -f 'scripts/code.sh' || true; npx dap-cli stop || true`) and
  verify with `pgrep -f 'scripts/code.sh'` (must be empty).

All scenarios target only `/Users/roblou/code/vscode`. No other repos.

---

## Scenario Matrix

### S-01 — Pause main process bootstrap

- **focus:** Prove dap-cli can attach to the Electron main process and pause it inside its own bootstrap.
- **target_process:** Electron main
- **adapter_type (hint):** pwa-node
- **launch_verb (hint):** attach
- **launch_recipe:**
  ```bash
  cd /Users/roblou/code/vscode
  ./scripts/code.sh --user-data-dir .build/chat-memory-smoke/user-data
  ```
- **area of interest:** `src/vs/code/electron-main/main.ts`, around the `CodeMain.startup()` declaration (currently line 97). Pick a stable line yourself once you've read the file.
- **success criteria:**
  1. dap-cli reports the session as attached, with no `helperProcessWarning` event.
  2. After triggering startup again (Cmd+Q + relaunch), dap-cli reports the session paused inside `startup`.
  3. Top stack frame name contains `startup`.
  4. `process.pid` evaluated on the paused frame matches the PID listening on the inspector port.
  5. Cleanup leaves no orphaned `scripts/code.sh` processes.
- **cleanup:** standard sweep (see invariants).
- **subagent_prompt:**
  ```
  Read these two skills first, in this order, before running any commands:
  `~/.copilot/skills/dap-cli/SKILL.md` and
  `/Users/roblou/code/vscode/.agents/skills/launch/SKILL.md`. Do not skip this step.

  Scenario S-01 — Pause main process bootstrap.

  Goal: using dap-cli, attach to Code OSS's Electron main process and prove
  you can pause it inside `CodeMain.startup()`
  (`/Users/roblou/code/vscode/src/vs/code/electron-main/main.ts`, around the
  `private async startup()` declaration). Pick the exact line yourself after
  reading the file.

  Launch Code OSS like this (separate terminal):
    cd /Users/roblou/code/vscode
    ./scripts/code.sh --user-data-dir .build/chat-memory-smoke/user-data
  Wait for the workbench window before driving dap-cli.

  How you sequence dap-cli — adapter, verb, breakpoint, trigger, inspect — is
  up to you. The skills cover everything you need.

  Success criteria:
    1. session attached with no helperProcessWarning event.
    2. after you trigger startup again (Cmd+Q the window, relaunch with same
       flags), dap-cli reports paused inside startup.
    3. top stack frame name contains "startup".
    4. process.pid evaluated on the paused frame matches the PID listening on
       whatever inspector port you used.
    5. after cleanup, `pgrep -f 'scripts/code.sh'` is empty.

  Cleanup (mandatory):
    npx dap-cli close <your-session> || true
    npx dap-cli stop-controller || true
    pkill -f 'scripts/code.sh' || true
    pgrep -f 'scripts/code.sh'

  Report back in this exact shape:
    result: pass|fail|blocked
    what_worked: …
    what_didnt: …
    agent_confusion: <none | brief description of where the dap-cli or launch skill misled you, OR areas where you had to guess>
    dap_cli_ergonomic_issues: <none | bullet list>
    evidence: <terminal log path or inline transcript>
  ```

---

### S-02 — Catch an extension activating

- **focus:** Pause the extension host the moment a specific extension activates.
- **target_process:** Extension host
- **adapter_type (hint):** pwa-node
- **launch_verb (hint):** attach
- **launch_recipe:**
  ```bash
  cd /Users/roblou/code/vscode
  ./scripts/code.sh --user-data-dir .build/chat-memory-smoke/user-data --inspect-extensions=5870
  ```
- **area of interest:** `src/vs/workbench/api/common/extHostExtensionService.ts`, around the `_activateExtension` declaration (currently line 421).
- **success criteria:**
  1. Session attached.
  2. Triggering activations (open a folder) results in a paused stop inside `_activateExtension` within 60s.
  3. `extensionDescription.identifier.value` evaluates to a non-empty extension id string.
  4. Cleanup clean.
- **cleanup:** standard sweep.
- **subagent_prompt:**
  ```
  Read these two skills first, in this order, before running any commands:
  `~/.copilot/skills/dap-cli/SKILL.md` and
  `/Users/roblou/code/vscode/.agents/skills/launch/SKILL.md`. Do not skip this step.

  Scenario S-02 — Catch an extension activating.

  Goal: using dap-cli, pause the extension host the next time any extension
  activates. The interesting code is around `_activateExtension` in
  `src/vs/workbench/api/common/extHostExtensionService.ts`.

  Launch Code OSS like this:
    cd /Users/roblou/code/vscode
    ./scripts/code.sh --user-data-dir .build/chat-memory-smoke/user-data --inspect-extensions=5870

  You decide the dap-cli adapter, verb, breakpoint shape, and trigger
  (opening a folder is one easy way to force activations).

  Success criteria:
    1. session attached.
    2. dap-cli reports paused inside `_activateExtension` within 60s of the
       trigger.
    3. evaluating `extensionDescription.identifier.value` on the paused frame
       returns a non-empty string.
    4. cleanup leaves no orphans.

  Cleanup (mandatory):
    npx dap-cli close <session> || true
    npx dap-cli stop-controller || true
    pkill -f 'scripts/code.sh' || true
    pgrep -f 'scripts/code.sh'

  Report back: result / what_worked / what_didnt / agent_confusion / dap_cli_ergonomic_issues / evidence.
  ```

---

### S-03 — Catch the chat widget submitting input

- **focus:** Pause the renderer when the user submits a chat message via UI automation.
- **target_process:** Renderer (workbench)
- **adapter_type (hint):** pwa-chrome
- **launch_verb (hint):** attach
- **launch_recipe:**
  ```bash
  cd /Users/roblou/code/vscode
  unset ELECTRON_RUN_AS_NODE
  ./scripts/code.sh --user-data-dir .build/chat-memory-smoke/user-data --remote-debugging-port=9224
  ```
- **area of interest:** `src/vs/workbench/contrib/chat/browser/widget/chatWidget.ts`, around the private `_acceptInput` declaration (currently line 2376).
- **success criteria:**
  1. Session attached over CDP; child sessions enumerable.
  2. Triggering a chat submit via `npx @playwright/cli` causes dap-cli to report paused inside `_acceptInput`.
  3. Top stack frame name contains `_acceptInput`.
  4. Cleanup clean (Code OSS *and* playwright-cli).
- **cleanup:** standard sweep + `npx @playwright/cli close`.
- **subagent_prompt:**
  ```
  Read these two skills first, in this order, before running any commands:
  `~/.copilot/skills/dap-cli/SKILL.md` and
  `/Users/roblou/code/vscode/.agents/skills/launch/SKILL.md`. Do not skip this step.

  Scenario S-03 — Catch the chat widget submitting input.

  Goal: using dap-cli, pause the workbench renderer the moment a user submits
  a chat message. The interesting code is the private `_acceptInput` method
  in `src/vs/workbench/contrib/chat/browser/widget/chatWidget.ts`.

  Launch Code OSS with CDP open:
    cd /Users/roblou/code/vscode
    unset ELECTRON_RUN_AS_NODE
    ./scripts/code.sh --user-data-dir .build/chat-memory-smoke/user-data --remote-debugging-port=9224

  Drive the chat input from a separate process — the launch skill describes
  how to use `npx @playwright/cli` to focus the chat input and press Enter.
  dap-cli and playwright-cli can share the CDP port; the dap-cli skill covers
  child-session handling.

  Success criteria:
    1. session attached, children enumerable via dap-cli.
    2. paused inside `_acceptInput` within 30s of pressing Enter.
    3. top stack frame name contains `_acceptInput`.
    4. cleanup leaves no Code OSS or playwright-cli orphans.

  Cleanup (mandatory):
    npx dap-cli close <session> || true
    npx dap-cli stop-controller || true
    npx @playwright/cli close || true
    pkill -f 'scripts/code.sh' || true
    pgrep -f 'scripts/code.sh'

  Report back: result / what_worked / what_didnt / agent_confusion / dap_cli_ergonomic_issues / evidence.
  ```

---

### S-04 — Pause the shared process during boot

- **focus:** Pause the shared utility process inside its own bootstrap.
- **target_process:** Shared process
- **adapter_type (hint):** pwa-node
- **launch_verb (hint):** attach
- **launch_recipe:**
  ```bash
  cd /Users/roblou/code/vscode
  ./scripts/code.sh --user-data-dir .build/chat-memory-smoke/user-data --inspect-brk-sharedprocess=5879
  ```
  Note: the real VS Code flags are `--inspect-sharedprocess=PORT` and `--inspect-brk-sharedprocess=PORT` (no plain `--inspect-shared`). For this scenario you need `-brk`, otherwise the shared process boots past `init()` before any agent can race an attach in.
- **area of interest:** `src/vs/code/electron-utility/sharedProcess/sharedProcessMain.ts`, around the `SharedProcessMain` class declaration (currently line 148).
- **success criteria:**
  1. Attached.
  2. After Cmd+Q + relaunch, paused inside SharedProcessMain bootstrap.
  3. `process.pid` matches the inspector port's listening process.
  4. Cleanup clean.
- **cleanup:** standard sweep.
- **subagent_prompt:**
  ```
  Read these two skills first, in this order, before running any commands:
  `~/.copilot/skills/dap-cli/SKILL.md` and
  `/Users/roblou/code/vscode/.agents/skills/launch/SKILL.md`. Do not skip this step.

  Scenario S-04 — Pause the shared process during boot.

  Goal: using dap-cli, pause Code OSS's shared utility process inside its own
  bootstrap. The interesting code is the `SharedProcessMain` class in
  `src/vs/code/electron-utility/sharedProcess/sharedProcessMain.ts`.

  Launch Code OSS:
    cd /Users/roblou/code/vscode
    ./scripts/code.sh --user-data-dir .build/chat-memory-smoke/user-data --inspect-brk-sharedprocess=5879

  (Real VS Code flag is `--inspect-brk-sharedprocess=PORT` — there is no
  `--inspect-shared`. Without `-brk`, the shared process boots past `init()`
  before any agent can race an attach in.)

  Trigger a fresh shared-process boot however you like. The most reliable
  path is `pkill -f 'Code - OSS'` (or quit by hand) and then relaunch with
  the same flags — AppleScript Cmd+Q is often blocked by Accessibility
  permissions in CI-style environments.

  Success criteria:
    1. session attached.
    2. paused inside the SharedProcessMain bootstrap.
    3. process.pid on the paused frame matches the PID listening on whatever
       inspector port you used.
    4. cleanup leaves no orphans.

  Cleanup (mandatory):
    npx dap-cli close <session> || true
    npx dap-cli stop-controller || true
    pkill -f 'scripts/code.sh' || true
    pgrep -f 'scripts/code.sh'

  Report back: result / what_worked / what_didnt / agent_confusion / dap_cli_ergonomic_issues / evidence.
  ```

---

### S-05 — Conditional breakpoint on the pty host

- **focus:** Verify dap-cli correctly forwards a *conditional* breakpoint to the pty host process.
- **target_process:** Pty host
- **adapter_type (hint):** pwa-node
- **launch_verb (hint):** attach
- **launch_recipe:**
  ```bash
  cd /Users/roblou/code/vscode
  ./scripts/code.sh --user-data-dir .build/chat-memory-smoke/user-data --inspect-ptyhost=5877
  ```
- **area of interest:** `src/vs/platform/terminal/node/ptyHostMain.ts`, around the `startPtyHost` declaration (currently line 28).
- **success criteria:**
  1. Conditional breakpoint accepted as verified.
  2. Paused on terminal-open trigger (Ctrl+\` in Code OSS).
  3. Cleanup clean.
- **cleanup:** standard sweep.
- **subagent_prompt:**
  ```
  Read these two skills first, in this order, before running any commands:
  `~/.copilot/skills/dap-cli/SKILL.md` and
  `/Users/roblou/code/vscode/.agents/skills/launch/SKILL.md`. Do not skip this step.

  Scenario S-05 — Conditional breakpoint on the pty host.

  Goal: using dap-cli, set a *conditional* breakpoint inside the pty host's
  bootstrap (`startPtyHost` in `src/vs/platform/terminal/node/ptyHostMain.ts`)
  and prove the breakpoint actually fires when the condition is satisfied.
  Pick a condition that's always true at that line (e.g. `typeof process !== 'undefined'`).

  Launch Code OSS:
    cd /Users/roblou/code/vscode
    ./scripts/code.sh --user-data-dir .build/chat-memory-smoke/user-data --inspect-ptyhost=5877

  Trigger by opening the integrated terminal in Code OSS (Ctrl+`).

  Success criteria:
    1. conditional breakpoint accepted as verified.
    2. dap-cli reports paused on the terminal-open trigger.
    3. cleanup leaves no orphans.

  Cleanup (mandatory):
    npx dap-cli close <session> || true
    npx dap-cli stop-controller || true
    pkill -f 'scripts/code.sh' || true
    pgrep -f 'scripts/code.sh'

  Report back: result / what_worked / what_didnt / agent_confusion / dap_cli_ergonomic_issues / evidence.
  ```

---

### S-06 — Reach into the file watcher process

- **focus:** Attach pwa-node to the file watcher utility process — exercises raw `--json` attach since there is no canonical workspace launch config.
- **target_process:** File watcher
- **adapter_type (hint):** pwa-node
- **launch_verb (hint):** attach
- **launch_recipe:**
  ```bash
  cd /Users/roblou/code/vscode
  VSCODE_FILE_WATCHER_INSPECT_PORT=5871 ./scripts/code.sh --user-data-dir .build/chat-memory-smoke/user-data
  ```
- **area of interest:** `src/vs/platform/files/node/watcher/watcherMain.ts`, around the `const service = new UniversalWatcher();` line (currently line 20).
- **success criteria:**
  1. Attached (synthetic `helperProcessWarning` for raw `--json` is acceptable per the dap-cli skill — note it in the report).
  2. Breakpoint verified, paused after a folder-open trigger.
  3. Cleanup clean.
  4. If `VSCODE_FILE_WATCHER_INSPECT_PORT` has no effect (no inspector on 5871), report `result: blocked` with that as the reason — the missing hook is itself the finding.
- **cleanup:** standard sweep.
- **subagent_prompt:**
  ```
  Read these two skills first, in this order, before running any commands:
  `~/.copilot/skills/dap-cli/SKILL.md` and
  `/Users/roblou/code/vscode/.agents/skills/launch/SKILL.md`. Do not skip this step.

  Scenario S-06 — Reach into the file watcher process.

  Goal: using dap-cli, attach to Code OSS's file watcher utility process and
  pause it inside its bootstrap (`src/vs/platform/files/node/watcher/watcherMain.ts`,
  around the `new UniversalWatcher()` line). There is no workspace launch
  config for this process — figure out the right dap-cli attach shape from
  the skill.

  Launch Code OSS:
    cd /Users/roblou/code/vscode
    VSCODE_FILE_WATCHER_INSPECT_PORT=5871 ./scripts/code.sh --user-data-dir .build/chat-memory-smoke/user-data

  Trigger by opening a folder via File > Open Folder.

  If the env var has no effect (no inspector on 5871 after launch), mark
  result: blocked with reason "no inspector hook for file watcher process" —
  that's a useful finding by itself.

  Success criteria:
    1. session attached. (A synthetic helperProcessWarning is expected for
       raw --json attach per the dap-cli skill — note it but don't fail on it.)
    2. breakpoint verified.
    3. paused after the folder-open trigger.
    4. cleanup clean.

  Cleanup (mandatory):
    npx dap-cli close <session> || true
    npx dap-cli stop-controller || true
    pkill -f 'scripts/code.sh' || true
    pgrep -f 'scripts/code.sh'

  Report back: result / what_worked / what_didnt / agent_confusion / dap_cli_ergonomic_issues / evidence.
  ```

---

### S-07 — Read the user's Quick Open query out of the search process

- **focus:** Pause inside the search code when the user types a Quick Open query and read the query string.
- **target_process:** Extension host (search now runs there — see note below)
- **adapter_type (hint):** pwa-node
- **launch_verb (hint):** attach
- **launch_recipe:**
  ```bash
  cd /Users/roblou/code/vscode
  ./scripts/code.sh --user-data-dir .build/chat-memory-smoke/user-data --inspect-extensions=5870
  ```
  Note: `--inspect-search=5876` is declared in `argv.ts` but **dead** in current OSS — `rawSearchService.ts` is now instantiated inside the extension host (`src/vs/workbench/api/node/extHostSearch.ts:101` does `new SearchService(...)`). There is no separate search worker process. Attach to the ext-host inspector (`--inspect-extensions=5870`) instead.
- **area of interest:** `src/vs/workbench/services/search/node/rawSearchService.ts`. The `fileSearch` entry around line 37 is fine as a first stop, but the actual code path Quick Open hits is `doFileSearch` around line 92.
- **success criteria:**
  1. Attached, breakpoint verified.
  2. Paused on Cmd+P + typed query.
  3. `config.filePattern` evaluates to a string matching what was typed.
  4. Cleanup clean.
- **cleanup:** standard sweep.
- **subagent_prompt:**
  ```
  Read these two skills first, in this order, before running any commands:
  `~/.copilot/skills/dap-cli/SKILL.md` and
  `/Users/roblou/code/vscode/.agents/skills/launch/SKILL.md`. Do not skip this step.

  Scenario S-07 — Read the user's Quick Open query out of the search process.

  Goal: using dap-cli, pause the search process inside `fileSearch`
  (`src/vs/workbench/services/search/node/rawSearchService.ts`) and read the
  Quick Open query the user typed.

  Launch Code OSS:
    cd /Users/roblou/code/vscode
    ./scripts/code.sh --user-data-dir .build/chat-memory-smoke/user-data --inspect-extensions=5870

  Note: `--inspect-search=5876` is declared but dead in current OSS — search
  runs in the extension host now (see `src/vs/workbench/api/node/extHostSearch.ts:101`).
  Attach to the ext-host inspector instead. Set the breakpoint in
  `rawSearchService.ts` (the file is still imported into the ext-host).

  Trigger by pressing Cmd+P in Code OSS and typing any query (e.g. "x").
  If multiple OSS windows are visible via CDP, drive the one that has a
  workspace folder open — Quick Open in a no-folder window won't reach the
  file-search code path.

  Success criteria:
    1. session attached, breakpoint verified.
    2. paused on the Cmd+P query.
    3. evaluating `config.filePattern` on the paused frame returns a string
       matching what you typed.
    4. cleanup clean.

  Cleanup (mandatory):
    npx dap-cli close <session> || true
    npx dap-cli stop-controller || true
    pkill -f 'scripts/code.sh' || true
    pgrep -f 'scripts/code.sh'

  Report back: result / what_worked / what_didnt / agent_confusion / dap_cli_ergonomic_issues / evidence.
  ```

---

### S-08 — Pause the agent host process

- **focus:** Attach to the agent host and pause it inside its bootstrap.
- **target_process:** Agent host (Electron utility process, sub-type `node.mojom.NodeService`)
- **adapter_type (hint):** pwa-node
- **launch_verb (hint):** attach
- **prereq:** the agent host only spawns when `chat.agentHost.enabled: true`. The default is `false` (see `chat.contribution.ts`). Write the setting into `.build/chat-memory-smoke/user-data/User/settings.json` before launch, otherwise `AgentHostProcessManager` is never constructed and inspector port 5878 stays closed even with `--inspect-agenthost`.
- **launch_recipe:**
  ```bash
  cd /Users/roblou/code/vscode
  mkdir -p .build/chat-memory-smoke/user-data/User
  echo '{"chat.agentHost.enabled": true}' > .build/chat-memory-smoke/user-data/User/settings.json
  ./scripts/code.sh --user-data-dir .build/chat-memory-smoke/user-data --inspect-brk-agenthost=5878
  ```
  The host spawns lazily when a renderer requests the connection. After launch, drive activity in the Agents window so `_onRequestConnection.fire()` runs.
- **area of interest:** `src/vs/platform/agentHost/node/agentHostMain.ts`, around the `startAgentHost()` call (currently line 65). NOT `src/vs/server/node/server.main.ts` — that's the remote server, a different process.
- **success criteria:**
  1. Attached.
  2. Paused on bootstrap or first request.
  3. `process.pid` matches the inspector port.
  4. Cleanup clean. If `--inspect-agenthost` isn't recognized on the current branch, mark `blocked` with the missing-flag reason.
- **cleanup:** standard sweep.
- **subagent_prompt:**
  ```
  Read these two skills first, in this order, before running any commands:
  `~/.copilot/skills/dap-cli/SKILL.md` and
  `/Users/roblou/code/vscode/.agents/skills/launch/SKILL.md`. Do not skip this step.

  Scenario S-08 — Pause the agent host process.

  Goal: using dap-cli, attach to Code OSS's agent host process and pause it
  inside its bootstrap (`src/vs/platform/agentHost/node/agentHostMain.ts`,
  around `startAgentHost()` near line 65). The agent host runs as an
  Electron utility process (sub-type `node.mojom.NodeService`).

  Prereq: the agent host only spawns when `chat.agentHost.enabled: true`.
  Default is false. Set it before launch:
    cd /Users/roblou/code/vscode
    mkdir -p .build/chat-memory-smoke/user-data/User
    echo '{"chat.agentHost.enabled": true}' > .build/chat-memory-smoke/user-data/User/settings.json

  Launch Code OSS:
    ./scripts/code.sh --user-data-dir .build/chat-memory-smoke/user-data --inspect-brk-agenthost=5878

  After launch, drive activity in the Agents window so the host actually
  spawns (it spawns lazily on `_onRequestConnection.fire()`). If port 5878
  never opens after triggering agent activity, mark result: blocked with
  that as the reason.

  Success criteria:
    1. session attached.
    2. paused on bootstrap or first request.
    3. process.pid matches whatever inspector port you used.
    4. cleanup clean.

  Cleanup (mandatory):
    npx dap-cli close <session> || true
    npx dap-cli stop-controller || true
    pkill -f 'scripts/code.sh' || true
    pgrep -f 'scripts/code.sh'

  Report back: result / what_worked / what_didnt / agent_confusion / dap_cli_ergonomic_issues / evidence.
  ```

---

### S-09 — Logpoint that doesn't pause

- **focus:** Use a logpoint (no pause, just an output event) to observe file-resolve activity in the renderer.
- **target_process:** Renderer (file service)
- **adapter_type (hint):** pwa-chrome
- **launch_verb (hint):** attach
- **launch_recipe:**
  ```bash
  cd /Users/roblou/code/vscode
  unset ELECTRON_RUN_AS_NODE
  ./scripts/code.sh --user-data-dir .build/chat-memory-smoke/user-data --remote-debugging-port=9225
  ```
- **area of interest:** `src/vs/platform/files/common/fileService.ts`, around the `async resolve(...)` implementation (currently line 192).
- **success criteria:**
  1. Logpoint accepted (no pause occurs).
  2. After opening a file, dap-cli's event stream contains at least one output event whose body matches the logpoint message.
  3. Cleanup clean.
- **cleanup:** standard sweep.
- **subagent_prompt:**
  ```
  Read these two skills first, in this order, before running any commands:
  `~/.copilot/skills/dap-cli/SKILL.md` and
  `/Users/roblou/code/vscode/.agents/skills/launch/SKILL.md`. Do not skip this step.

  Scenario S-09 — Logpoint that doesn't pause.

  Goal: using dap-cli, attach to the renderer and install a *logpoint* (not a
  pause-style breakpoint) inside `resolve(...)` in
  `src/vs/platform/files/common/fileService.ts`. The logpoint message should
  include the resource path. Then prove the message shows up in dap-cli's
  output event stream when you open a file.

  Launch Code OSS:
    cd /Users/roblou/code/vscode
    unset ELECTRON_RUN_AS_NODE
    ./scripts/code.sh --user-data-dir .build/chat-memory-smoke/user-data --remote-debugging-port=9225

  Trigger by opening any file (e.g. README.md) in Code OSS.

  Success criteria:
    1. logpoint accepted, no pause occurs.
    2. dap-cli's output event stream contains at least one event whose body
       matches your logpoint template within 30s of the trigger.
    3. cleanup clean.

  (The dap-cli skill covers js-debug logpoint output category and child
  session output mirroring — you'll need both.)

  Cleanup (mandatory):
    npx dap-cli close <session> || true
    npx dap-cli stop-controller || true
    npx @playwright/cli close || true
    pkill -f 'scripts/code.sh' || true
    pgrep -f 'scripts/code.sh'

  Report back: result / what_worked / what_didnt / agent_confusion / dap_cli_ergonomic_issues / evidence.
  ```

---

### S-10 — Enumerate webview children and prove they're not directly targetable

- **focus:** Confirm `--show-children` enumerates webview child sessions and that targeting one returns the documented `child_session_not_targetable` error.
- **target_process:** Renderer + webview children
- **adapter_type (hint):** pwa-chrome
- **launch_verb (hint):** attach
- **launch_recipe:**
  ```bash
  cd /Users/roblou/code/vscode
  unset ELECTRON_RUN_AS_NODE
  ./scripts/code.sh --user-data-dir .build/chat-memory-smoke/user-data --remote-debugging-port=9226
  ```
- **area of interest:** none — pure session enumeration.
- **success criteria:**
  1. After triggering a webview (Markdown preview), at least one child session is listed.
  2. Targeting a child returns the structured `child_session_not_targetable` error with `error.data.parentSessionId` set.
  3. Output events on the parent are non-empty.
  4. Cleanup clean.
- **cleanup:** standard sweep.
- **subagent_prompt:**
  ```
  Read these two skills first, in this order, before running any commands:
  `~/.copilot/skills/dap-cli/SKILL.md` and
  `/Users/roblou/code/vscode/.agents/skills/launch/SKILL.md`. Do not skip this step.

  Scenario S-10 — Enumerate webview children and prove they're not directly targetable.

  Goal: using dap-cli, attach to the renderer, open a webview in Code OSS
  (e.g. open a markdown file and press Cmd+K V to open the preview), then
  prove the dap-cli skill's documented child-session contract holds:
    - the child shows up in dap-cli's `--show-children` output.
    - targeting that child directly returns the `child_session_not_targetable`
      error envelope (with `error.data.parentSessionId`).

  Launch Code OSS:
    cd /Users/roblou/code/vscode
    unset ELECTRON_RUN_AS_NODE
    ./scripts/code.sh --user-data-dir .build/chat-memory-smoke/user-data --remote-debugging-port=9226

  Success criteria:
    1. at least one child session enumerated after opening the webview.
    2. targeting the child returns `error.code = child_session_not_targetable`
       with `error.data.parentSessionId` populated.
    3. dap-cli output events on the parent session are non-empty.
    4. cleanup clean.

  Cleanup (mandatory):
    npx dap-cli close <session> || true
    npx dap-cli stop-controller || true
    pkill -f 'scripts/code.sh' || true
    pgrep -f 'scripts/code.sh'

  Report back: result / what_worked / what_didnt / agent_confusion / dap_cli_ergonomic_issues / evidence.
  ```

---

### S-11 — Walk through chat-service code with step in/over/out

- **focus:** Pause inside chat service request handling and exercise step-in / step-over / step-out.
- **target_process:** Renderer
- **adapter_type (hint):** pwa-chrome
- **launch_verb (hint):** attach
- **launch_recipe:**
  ```bash
  cd /Users/roblou/code/vscode
  unset ELECTRON_RUN_AS_NODE
  ./scripts/code.sh --user-data-dir .build/chat-memory-smoke/user-data --remote-debugging-port=9227
  ```
- **area of interest:** `src/vs/workbench/contrib/chat/common/chatService/chatServiceImpl.ts`, around the `_sendRequestAsync` declaration (currently line 1049).
- **success criteria:**
  1. Paused inside `_sendRequestAsync` after submitting a chat message.
  2. After step-over, top frame line/function changes.
  3. After step-in from a call site, top frame is in a different function.
  4. After step-out, frame is back in the caller.
  5. Cleanup clean.
- **cleanup:** standard sweep + `npx @playwright/cli close`.
- **subagent_prompt:**
  ```
  Read these two skills first, in this order, before running any commands:
  `~/.copilot/skills/dap-cli/SKILL.md` and
  `/Users/roblou/code/vscode/.agents/skills/launch/SKILL.md`. Do not skip this step.

  Scenario S-11 — Walk through chat-service code with step in/over/out.

  Goal: using dap-cli, pause the renderer inside `_sendRequestAsync` in
  `src/vs/workbench/contrib/chat/common/chatService/chatServiceImpl.ts`, then
  exercise step-over, step-in, and step-out, observing that the stack changes
  in the expected direction after each step.

  Launch Code OSS:
    cd /Users/roblou/code/vscode
    unset ELECTRON_RUN_AS_NODE
    ./scripts/code.sh --user-data-dir .build/chat-memory-smoke/user-data --remote-debugging-port=9227

  Trigger by submitting a chat message via npx @playwright/cli (focus chat
  input, type something, Enter).

  Success criteria:
    1. paused inside `_sendRequestAsync`.
    2. after step-over, the top frame's line or function changes.
    3. after step-in from a call site, the top frame is in a different function.
    4. after step-out, the frame is back in the caller.
    5. cleanup clean.

  Cleanup (mandatory):
    npx dap-cli close <session> || true
    npx dap-cli stop-controller || true
    npx @playwright/cli close || true
    pkill -f 'scripts/code.sh' || true
    pgrep -f 'scripts/code.sh'

  Report back: result / what_worked / what_didnt / agent_confusion / dap_cli_ergonomic_issues / evidence.
  ```

---

### S-12 — Restart a frame inside extensionHostManager.activate

- **focus:** Pause inside `extensionHostManager.activate`, restart the current frame, and prove the frame is re-entered with locals reset.
- **target_process:** Extension host manager (runs main-side)
- **adapter_type (hint):** pwa-node
- **launch_verb (hint):** attach
- **launch_recipe:**
  ```bash
  cd /Users/roblou/code/vscode
  ./scripts/code.sh --user-data-dir .build/chat-memory-smoke/user-data --inspect-extensions=5870
  ```
- **area of interest:** `src/vs/workbench/services/extensions/common/extensionHostManager.ts`, around `public async activate` (currently line 319).
- **success criteria:**
  1. Paused inside `activate`.
  2. restart-frame returns success.
  3. After restart, status reports paused inside the same function (locals reset).
  4. Cleanup clean.
- **cleanup:** standard sweep.
- **subagent_prompt:**
  ```
  Read these two skills first, in this order, before running any commands:
  `~/.copilot/skills/dap-cli/SKILL.md` and
  `/Users/roblou/code/vscode/.agents/skills/launch/SKILL.md`. Do not skip this step.

  Scenario S-12 — Restart a frame inside extensionHostManager.activate.

  Goal: using dap-cli, pause inside `public async activate` in
  `src/vs/workbench/services/extensions/common/extensionHostManager.ts`, then
  use the restart-frame DAP request to re-enter that frame and prove the
  function starts over.

  Launch Code OSS:
    cd /Users/roblou/code/vscode
    ./scripts/code.sh --user-data-dir .build/chat-memory-smoke/user-data --inspect-extensions=5870

  Trigger an extension activation (open a folder; install or reload an
  extension).

  Success criteria:
    1. paused inside `activate`.
    2. restart-frame succeeds.
    3. after restart-frame, status still reports paused inside the same
       function (locals reset).
    4. cleanup clean.

  Cleanup (mandatory):
    npx dap-cli close <session> || true
    npx dap-cli stop-controller || true
    pkill -f 'scripts/code.sh' || true
    pgrep -f 'scripts/code.sh'

  Report back: result / what_worked / what_didnt / agent_confusion / dap_cli_ergonomic_issues / evidence.
  ```

---

### S-13 — Pause-while-running and inspect scopes/variables

- **focus:** Pause an idle renderer (no breakpoint) and prove threads/stack/scopes/variables all return useful state.
- **target_process:** Renderer
- **adapter_type (hint):** pwa-chrome
- **launch_verb (hint):** attach
- **launch_recipe:**
  ```bash
  cd /Users/roblou/code/vscode
  unset ELECTRON_RUN_AS_NODE
  ./scripts/code.sh --user-data-dir .build/chat-memory-smoke/user-data --remote-debugging-port=9228
  ```
- **area of interest:** none (pause is the trigger).
- **success criteria:**
  1. dap-cli pause request succeeds.
  2. status reports paused.
  3. scopes returns ≥1 scope.
  4. variables on a scope ref returns ≥1 entry.
  5. continue resumes; cleanup clean.
- **cleanup:** standard sweep.
- **subagent_prompt:**
  ```
  Read these two skills first, in this order, before running any commands:
  `~/.copilot/skills/dap-cli/SKILL.md` and
  `/Users/roblou/code/vscode/.agents/skills/launch/SKILL.md`. Do not skip this step.

  Scenario S-13 — Pause-while-running and inspect scopes/variables.

  Goal: using dap-cli, attach to an idle Code OSS renderer (no breakpoint),
  pause it on demand, and prove you can read threads, stack frames, scopes,
  and variables from the paused state, then resume cleanly.

  Launch Code OSS:
    cd /Users/roblou/code/vscode
    unset ELECTRON_RUN_AS_NODE
    ./scripts/code.sh --user-data-dir .build/chat-memory-smoke/user-data --remote-debugging-port=9228

  Success criteria:
    1. pause request succeeds.
    2. status reports paused.
    3. scopes returns at least one scope.
    4. variables on a scope ref returns at least one entry.
    5. continue resumes cleanly; cleanup clean.

  Cleanup (mandatory):
    npx dap-cli close <session> || true
    npx dap-cli stop-controller || true
    pkill -f 'scripts/code.sh' || true
    pgrep -f 'scripts/code.sh'

  Report back: result / what_worked / what_didnt / agent_confusion / dap_cli_ergonomic_issues / evidence.
  ```

---

### S-14 — Catch an uncaught exception in the main process

- **focus:** Configure exception breakpoints (uncaught) on main, force an uncaught throw, and observe the resulting paused-on-exception state.
- **target_process:** Electron main
- **adapter_type (hint):** pwa-node
- **launch_verb (hint):** attach
- **launch_recipe:**
  ```bash
  cd /Users/roblou/code/vscode
  ./scripts/code.sh --user-data-dir .build/chat-memory-smoke/user-data
  ```
- **area of interest:** none — the test is the exception filter, not a source line. You'll need to use `evaluate` from a paused frame to schedule an uncaught throw (e.g. via `setImmediate`).
- **success criteria:**
  1. Exception filter (`uncaught`) accepted.
  2. After scheduling an uncaught throw and resuming, status flips back to paused with reason `exception`.
  3. Stack shows the throw site.
  4. Cleanup clean.
- **cleanup:** standard sweep.
- **subagent_prompt:**
  ```
  Read these two skills first, in this order, before running any commands:
  `~/.copilot/skills/dap-cli/SKILL.md` and
  `/Users/roblou/code/vscode/.agents/skills/launch/SKILL.md`. Do not skip this step.

  Scenario S-14 — Catch an uncaught exception in the main process.

  Goal: using dap-cli, configure exception breakpoints (uncaught) on Code
  OSS's main process, then force an uncaught throw and observe the
  paused-on-exception state. There is no source-line breakpoint here — the
  exception filter is the trigger.

  To force an uncaught throw without restarting Code OSS, pause first (via
  pause-while-running), then evaluate something that schedules a throw on the
  next tick so it escapes any try/catch, e.g. `setImmediate(() => { throw new
  Error('s14-test') })`.

  Launch Code OSS:
    cd /Users/roblou/code/vscode
    ./scripts/code.sh --user-data-dir .build/chat-memory-smoke/user-data

  Success criteria:
    1. exception filter accepted.
    2. after the scheduled throw + resume, status flips back to paused with
       reason "exception" within ~10s.
    3. stack shows the throw site.
    4. cleanup clean.

  Cleanup (mandatory):
    npx dap-cli close <session> || true
    npx dap-cli stop-controller || true
    pkill -f 'scripts/code.sh' || true
    pgrep -f 'scripts/code.sh'

  Report back: result / what_worked / what_didnt / agent_confusion / dap_cli_ergonomic_issues / evidence.
  ```

---

### S-15 — Pause Code OSS running as a web server

- **focus:** Launch `scripts/code-server.sh` in inspect mode and prove dap-cli can pause it on its first HTTP request.
- **target_process:** Code-server (Code OSS as web server)
- **adapter_type (hint):** pwa-node
- **launch_verb (hint):** attach
- **launch_recipe:**
  ```bash
  cd /Users/roblou/code/vscode
  ./scripts/code-server.sh --inspect=5872 --port=8898 --without-connection-token
  ```
- **area of interest:** `src/vs/server/node/server.main.ts`, around the imported `createServer` binding (currently line 11) — fires on first request.
- **success criteria:**
  1. Attached.
  2. Breakpoint verified.
  3. Paused after the first HTTP request to `localhost:8898/`.
  4. `process.pid` matches the inspector port.
  5. Cleanup clean (also kills code-server).
- **cleanup:** standard sweep + `pkill -f 'scripts/code-server.sh'`.
- **subagent_prompt:**
  ```
  Read these two skills first, in this order, before running any commands:
  `~/.copilot/skills/dap-cli/SKILL.md` and
  `/Users/roblou/code/vscode/.agents/skills/launch/SKILL.md`. Do not skip this step.

  Scenario S-15 — Pause Code OSS running as a web server.

  Goal: using dap-cli, attach to a `scripts/code-server.sh` instance and
  pause it on its first HTTP request. The interesting code is around the
  `createServer` binding in `src/vs/server/node/server.main.ts`.

  Launch code-server:
    cd /Users/roblou/code/vscode
    ./scripts/code-server.sh --inspect=5872 --port=8898 --without-connection-token

  Trigger by sending an HTTP request to `localhost:8898/` (any GET will do).

  Success criteria:
    1. session attached.
    2. breakpoint verified.
    3. paused after the first HTTP request.
    4. process.pid on the paused frame matches the PID listening on the
       inspector port.
    5. cleanup leaves no code-server or scripts/code.sh orphans.

  Cleanup (mandatory):
    npx dap-cli close <session> || true
    npx dap-cli stop-controller || true
    pkill -f 'scripts/code-server.sh' || true
    pkill -f 'scripts/code.sh' || true
    pgrep -f 'scripts/code-server.sh'

  Report back: result / what_worked / what_didnt / agent_confusion / dap_cli_ergonomic_issues / evidence.
  ```

---

### S-16 — Multi-thread inspection on the renderer

- **focus:** Confirm dap-cli enumerates multiple threads on a renderer with workers and can pause + inspect a non-main thread.
- **target_process:** Renderer (with workers)
- **adapter_type (hint):** pwa-chrome
- **launch_verb (hint):** attach
- **launch_recipe:**
  ```bash
  cd /Users/roblou/code/vscode
  unset ELECTRON_RUN_AS_NODE
  ./scripts/code.sh --user-data-dir .build/chat-memory-smoke/user-data --remote-debugging-port=9229
  ```
- **area of interest:** none — multi-thread enumeration check.
- **success criteria:**
  1. Threads listing returns ≥2 entries.
  2. Pause request on a non-main thread succeeds.
  3. Stack on that non-main thread returns ≥1 frame.
  4. Cleanup clean.
- **cleanup:** standard sweep.
- **subagent_prompt:**
  ```
  Read these two skills first, in this order, before running any commands:
  `~/.copilot/skills/dap-cli/SKILL.md` and
  `/Users/roblou/code/vscode/.agents/skills/launch/SKILL.md`. Do not skip this step.

  Scenario S-16 — Multi-thread inspection on the renderer.

  Goal: using dap-cli, attach to the renderer and prove that:
    - dap-cli's threads listing returns more than one thread (Code OSS spawns
      workers).
    - you can pause a non-main thread.
    - you can read a stack from that non-main thread.

  Launch Code OSS:
    cd /Users/roblou/code/vscode
    unset ELECTRON_RUN_AS_NODE
    ./scripts/code.sh --user-data-dir .build/chat-memory-smoke/user-data --remote-debugging-port=9229

  Success criteria:
    1. threads listing returns >=2.
    2. pause on a non-main thread succeeds.
    3. stack on that non-main thread returns >=1 frame.
    4. cleanup clean.

  Cleanup (mandatory):
    npx dap-cli close <session> || true
    npx dap-cli stop-controller || true
    pkill -f 'scripts/code.sh' || true
    pgrep -f 'scripts/code.sh'

  Report back: result / what_worked / what_didnt / agent_confusion / dap_cli_ergonomic_issues / evidence.
  ```

---

### S-17 — Verify breakpoints list/clear semantics on main

- **focus:** Set, list, and clear breakpoints on main; prove DAP replacement semantics (set per source replaces, clear empties).
- **target_process:** Electron main
- **adapter_type (hint):** pwa-node
- **launch_verb (hint):** attach
- **launch_recipe:**
  ```bash
  cd /Users/roblou/code/vscode
  ./scripts/code.sh --user-data-dir .build/chat-memory-smoke/user-data
  ```
- **area of interest:** `src/vs/code/electron-main/main.ts` — pick any two stable lines (e.g. the `CodeMain.startup` declaration around line 97 and the `CodeMain.main` declaration around line 88).
- **success criteria:**
  1. After two consecutive `breakpoints set` calls (each with a single different breakpoint) for the same source, `breakpoints list` shows the *replacement* outcome, not accumulation.
  2. After `breakpoints clear --source <file>`, list shows that source as empty.
  3. Cleanup clean.
- **cleanup:** standard sweep.
- **subagent_prompt:**
  ```
  Read these two skills first, in this order, before running any commands:
  `~/.copilot/skills/dap-cli/SKILL.md` and
  `/Users/roblou/code/vscode/.agents/skills/launch/SKILL.md`. Do not skip this step.

  Scenario S-17 — Verify breakpoints list/clear semantics on main.

  Goal: using dap-cli, attach to the main process and verify the documented
  DAP breakpoint semantics for `breakpoints set` (replacement per source) and
  `breakpoints clear` (empties a source). Use any two stable lines in
  `src/vs/code/electron-main/main.ts`.

  Launch Code OSS:
    cd /Users/roblou/code/vscode
    ./scripts/code.sh --user-data-dir .build/chat-memory-smoke/user-data

  No trigger needed — this scenario is about CRUD on the breakpoint list, not
  hitting a breakpoint.

  Success criteria:
    1. two consecutive `breakpoints set` calls for the same source (each
       carrying one different breakpoint) leave the list in a *replacement*
       state, not accumulated.
    2. `breakpoints clear --source <file>` leaves that source empty in the
       subsequent list.
    3. cleanup clean.

  If the observed behavior differs from the dap-cli skill's "replacement
  semantics" claim, that's the finding — record it precisely.

  Cleanup (mandatory):
    npx dap-cli close <session> || true
    npx dap-cli stop-controller || true
    pkill -f 'scripts/code.sh' || true
    pgrep -f 'scripts/code.sh'

  Report back: result / what_worked / what_didnt / agent_confusion / dap_cli_ergonomic_issues / evidence.
  ```

---

### S-18 — Evaluate REPL on a renderer with no paused frame

- **focus:** Show that REPL-context evaluate works without a paused frame, and that the auto-frame short form follows the Phase 11 contract when nothing is paused: it sends evaluate without `frameId`, emits the not-paused warning, and uses adapter REPL context rather than failing.
- **target_process:** Renderer
- **adapter_type (hint):** pwa-chrome
- **launch_verb (hint):** attach
- **launch_recipe:**
  ```bash
  cd /Users/roblou/code/vscode
  unset ELECTRON_RUN_AS_NODE
  ./scripts/code.sh --user-data-dir .build/chat-memory-smoke/user-data --remote-debugging-port=9230
  ```
- **area of interest:** none — pure REPL.
- **success criteria:**
  1. Auto-frame `evaluate` (no `--frame-id`, nothing paused) does not return `controllerUnavailable`; it either succeeds in adapter REPL context with a warning containing `session not paused`, or returns a structured adapter error.
  2. Explicit REPL-context `evaluate` of `navigator.userAgent` returns a string containing `Electron`.
  3. Cleanup clean.
- **cleanup:** standard sweep.
- **subagent_prompt:**
  ```
  Read these two skills first, in this order, before running any commands:
  `~/.copilot/skills/dap-cli/SKILL.md` and
  `/Users/roblou/code/vscode/.agents/skills/launch/SKILL.md`. Do not skip this step.

  Scenario S-18 — Evaluate REPL on a renderer with no paused frame.

  Goal: using dap-cli, attach to the renderer (no breakpoint, no pause) and
  prove two things:
    1. the auto-frame short form of `evaluate` follows the Phase 11 contract
       when nothing is paused: it does not return the old misleading
       `controllerUnavailable` error; it may succeed in adapter REPL context
       with a `session not paused` warning, or return a structured adapter
       error.
    2. the explicit REPL-context form of `evaluate` returns a useful value
       (e.g. `navigator.userAgent` should contain "Electron").

  Launch Code OSS:
    cd /Users/roblou/code/vscode
    unset ELECTRON_RUN_AS_NODE
    ./scripts/code.sh --user-data-dir .build/chat-memory-smoke/user-data --remote-debugging-port=9230

  Success criteria:
    1. auto-frame evaluate with nothing paused does NOT return
       controllerUnavailable; success in adapter REPL context with a
       `session not paused` warning is acceptable.
    2. explicit REPL-context evaluate of `navigator.userAgent` returns a
       string containing "Electron".
    3. cleanup clean.

  Cleanup (mandatory):
    npx dap-cli close <session> || true
    npx dap-cli stop-controller || true
    pkill -f 'scripts/code.sh' || true
    pgrep -f 'scripts/code.sh'

  Report back: result / what_worked / what_didnt / agent_confusion / dap_cli_ergonomic_issues / evidence.
  ```

---

### S-19 — Drive the workspace "VS Code" compound launch

- **focus:** Launch the canonical workspace compound and prove member-session naming + targeting + stopAll cascade.
- **target_process:** Compound (renderer + main + ext host + shared + agent host)
- **adapter_type (hint):** mixed
- **launch_verb (hint):** launch (compound)
- **launch_recipe:** none — dap-cli launches Code OSS itself via the workspace compound. Make sure no Code OSS is already running first (`pkill -f 'scripts/code.sh' || true`).
- **area of interest:** none — pure compound enumeration / member targeting.
- **success criteria:**
  1. The compound launch surfaces all 5 expected member sessions: `Launch VS Code Internal`, `Attach to Main Process`, `Attach to Extension Host`, `Attach to Shared Process`, `Attach to Agent Host Process` (under the compound name).
  2. status / threads succeed against two distinct members.
  3. Closing one member succeeds.
  4. Closing the compound cascades stopAll.
  5. Cleanup clean.
- **cleanup:** standard sweep + `npx dap-cli cleanup --purge`.
- **subagent_prompt:**
  ```
  Read these two skills first, in this order, before running any commands:
  `~/.copilot/skills/dap-cli/SKILL.md` and
  `/Users/roblou/code/vscode/.agents/skills/launch/SKILL.md`. Do not skip this step.

  Scenario S-19 — Drive the workspace "VS Code" compound launch.

  Goal: using dap-cli, launch the workspace compound named "VS Code" from
  `/Users/roblou/code/vscode` and prove:
    - the 5 expected member sessions appear (Launch VS Code Internal, Attach
      to Main Process, Attach to Extension Host, Attach to Shared Process,
      Attach to Agent Host Process), under the compound name.
    - you can target two distinct members independently (status, threads).
    - closing one member succeeds.
    - closing the compound cascades stopAll.

  Pre-step (avoid port collisions):
    pkill -f 'scripts/code.sh' || true
    npx dap-cli cleanup --purge || true

  Success criteria:
    1. all 5 member sessions present.
    2. status and threads succeed for two distinct members.
    3. member close succeeds.
    4. compound close cascades stopAll.
    5. cleanup leaves no orphans.

  Cleanup (mandatory):
    npx dap-cli close "VS Code" || true
    npx dap-cli stop-controller || true
    pkill -f 'scripts/code.sh' || true
    pgrep -f 'scripts/code.sh'

  Report back: result / what_worked / what_didnt / agent_confusion / dap_cli_ergonomic_issues / evidence.
  ```

---

### S-20 — Wrong-verb auto-route regression check

- **focus:** Deliberately call dap-cli's `launch` verb against an attach-shaped config and confirm the Phase 10 auto-route fires.
- **target_process:** Electron main
- **adapter_type (hint):** pwa-node
- **launch_verb (hint):** launch (intentional misuse — should auto-route to attach)
- **launch_recipe:**
  ```bash
  cd /Users/roblou/code/vscode
  ./scripts/code.sh --user-data-dir .build/chat-memory-smoke/user-data
  ```
- **area of interest:** none — the test is the auto-route envelope, not a breakpoint hit.
- **success criteria:**
  1. The `launch --config "Attach to Main Process"` success payload includes both a `warnings` entry describing the verb mismatch and an `autoRouted: { from: "launch", to: "attach" }` field (per the dap-cli skill).
  2. The resulting session is reachable via `status` (proves the route worked end-to-end).
  3. Cleanup clean.
  4. If `autoRouted` is missing, mark `result: fail` and file as a Phase 10 regression.
- **cleanup:** standard sweep.
- **subagent_prompt:**
  ```
  Read these two skills first, in this order, before running any commands:
  `~/.copilot/skills/dap-cli/SKILL.md` and
  `/Users/roblou/code/vscode/.agents/skills/launch/SKILL.md`. Do not skip this step.

  Scenario S-20 — Wrong-verb auto-route regression check.

  Goal: deliberately call dap-cli's `launch` verb against the workspace
  config `Attach to Main Process` (an attach-shaped config). Per the dap-cli
  skill (Phase 10), dap-cli should auto-route this to attach and emit both a
  `warnings` entry AND an `autoRouted: { from: "launch", to: "attach" }`
  field on the success payload.

  Launch Code OSS first so port 5875 is open:
    cd /Users/roblou/code/vscode
    ./scripts/code.sh --user-data-dir .build/chat-memory-smoke/user-data

  Success criteria:
    1. the `launch --config` success payload contains both `warnings` and
       `autoRouted: { from: "launch", to: "attach" }`.
    2. the resulting session is reachable via `status`.
    3. cleanup clean.
    4. if `autoRouted` is missing, mark result: fail and call out the Phase 10
       regression in what_didnt.

  Cleanup (mandatory):
    npx dap-cli close <session> || true
    npx dap-cli stop-controller || true
    pkill -f 'scripts/code.sh' || true
    pgrep -f 'scripts/code.sh'

  Report back: result / what_worked / what_didnt / agent_confusion / dap_cli_ergonomic_issues / evidence.
  ```

---

## Coverage Audit

| id | target_process | debug_op | launch_verb |
|----|----------------|----------|-------------|
| S-01 | Electron main | line breakpoint | attach |
| S-02 | Extension host | activation breakpoint | attach |
| S-03 | Renderer (workbench) | line breakpoint via Playwright trigger | attach |
| S-04 | Shared process | line breakpoint at class declaration | attach |
| S-05 | Pty host | conditional breakpoint | attach |
| S-06 | File watcher | line breakpoint via raw `--json` attach | attach |
| S-07 | Search service | line breakpoint + evaluate | attach |
| S-08 | Agent host | line breakpoint on bootstrap | attach |
| S-09 | Renderer (file service) | logpoint (no pause) | attach |
| S-10 | Webview children | session enumeration / `child_session_not_targetable` | attach |
| S-11 | Renderer | step in / over / out | attach |
| S-12 | Extension host manager (main-side) | restart-frame | attach |
| S-13 | Renderer | pause-while-running + variable inspection | attach |
| S-14 | Electron main | exception breakpoint (uncaught) | attach |
| S-15 | Code-server | line breakpoint via curl trigger | attach |
| S-16 | Renderer (workers) | multi-thread enumeration | attach |
| S-17 | Electron main | breakpoints list/clear (DAP replacement semantics) | attach |
| S-18 | Renderer | evaluate (REPL form) | attach |
| S-19 | Compound (renderer + main + ext host + shared + agent host) | compound member targeting | launch (compound) |
| S-20 | Electron main | wrong-verb auto-route regression | launch (intentional misuse, expected to auto-route to attach) |
