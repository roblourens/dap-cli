# Driving VS Code (built from sources) with `dap-cli` + `playwright-cli`

This walkthrough launches **VS Code OSS built from `/Users/roblou/code/vscode`**
through its workspace `.vscode/launch.json` compound, sets a breakpoint inside
the chat widget, then drives the chat panel with `playwright-cli` and observes
the breakpoint fire when the user submits a message.

It is the VS Code analogue of [../../docs/playwright-interop.md](../../docs/playwright-interop.md):
two clients (a debugger and a UI driver) sharing one Chrome DevTools Protocol
endpoint.

> **"Playwright CLI"** in this doc means the imperative
> [`@playwright/cli`](https://www.npmjs.com/package/@playwright/cli) binary
> (`playwright-cli`), **not** `npx playwright test`. See
> [../../docs/playwright-interop.md](../../docs/playwright-interop.md) for the distinction.

## Prerequisites

- **VS Code OSS checkout, built**, at `/Users/roblou/code/vscode`. The
  `out/` directory must be populated (`out/main.js` and
  `out/vs/workbench/contrib/chat/browser/widget/chatWidget.js` exist).
- **A persistent user-data-dir** so Copilot auth (and any other state) is
  preserved between runs. This guide uses
  `.build/chat-memory-smoke/user-data` inside the vscode repo. **Never
  launch with a fresh user-data-dir** — without it you land on the sign-in
  screen and the chat input is disabled.
- `dap-cli` built (`npm run build` in this repo so `dist/index.js` is
  current).
- `playwright-cli` 0.1.x installed globally
  (`npm i -g @playwright/cli`). Verify with `playwright-cli --version`.

For background on the VS Code launch flags below, see the launch skill at
`/Users/roblou/code/vscode/.agents/skills/launch/SKILL.md`.

## Why this works

- VS Code's renderer is Electron/Chromium. With `--remote-debugging-port=9224`
  Electron exposes a standard CDP endpoint on `127.0.0.1:9224`.
- CDP allows multiple concurrent clients. `dap-cli`'s `js-debug` adapter
  attaches as one CDP client; `playwright-cli` attaches as another. They do
  not interfere — one drives the UI, the other observes / pauses execution.
- The compiled JS in `out/vs/...` is what the renderer actually loads, but
  every file ships an **inline source map** at the bottom (a base64
  `data:application/json;...` payload after `//# sourceMappingURL=`). That
  means breakpoints set against the `.ts` source in `src/vs/...` bind via
  the source map and the resulting stack traces show TypeScript file paths
  and line numbers — exercising the full source-map path through both
  `js-debug` and dap-cli.

## Sequence

Run all terminals from `/Users/roblou/code/dap-cli` unless noted.

### Terminal A — start the controller and launch the VS Code compound

```bash
cd /Users/roblou/code/dap-cli

npx dap-cli cleanup --purge || true
npx dap-cli stop-controller || true
npx dap-cli start
npx dap-cli launch --config "VS Code" --workspace /Users/roblou/code/vscode
```

Expected compound member sessions:

```text
VS Code/Launch VS Code Internal
VS Code/Attach to Main Process
VS Code/Attach to Extension Host
VS Code/Attach to Shared Process
VS Code/Attach to Agent Host Process
```

Verify them with human output:

```bash
DAP_CLI_HUMAN=1 npx dap-cli sessions
```

If fewer than five members appear, stop and record the run as blocked or failed
in UAT. The expected compound uses `stopAll`, so closing one member should close
the whole group during cleanup.

### Terminal A (cont.) — set a breakpoint in the chat widget

`ChatWidget.acceptInput` runs every time the user submits a chat message,
regardless of backend or auth state — a reliable target. We point dap-cli at the
**TypeScript source** so binding goes through the inline source map.

First make sure the chat module is loaded (cold start may not have imported it
yet). Open the chat panel once with `playwright-cli` (Terminal B, below) or by
clicking the chat icon in the workbench, then come back and:

```bash
npx dap-cli breakpoints set --name "VS Code/Launch VS Code Internal" \
  --source /Users/roblou/code/vscode/src/vs/workbench/contrib/chat/browser/widget/chatWidget.ts \
  --line 2271
```

Line 2271 is the first executable line inside `async acceptInput(...)` in
the TypeScript file. The response includes `"verified": true` and the bound
`source` echoed back is the `.ts` path:

```text
"source": { "path": ".../src/vs/workbench/contrib/chat/browser/widget/chatWidget.ts" }
```

If you see `"verified": false`, the chat module still isn't loaded — open
the panel and re-issue the command. If `acceptInput` has moved, find the
new line with `grep -n "async acceptInput" .../widget/chatWidget.ts`.

### Terminal B — drive the UI with playwright-cli

```bash
playwright-cli attach --cdp=http://127.0.0.1:9224
playwright-cli tab-list                       # confirm one Welcome tab
playwright-cli screenshot --filename=screenshots/vscode-chat-smoke/01-attached.png

# Open and focus the chat panel (macOS: Ctrl+Cmd+I).
playwright-cli press "Control+Meta+i"
playwright-cli screenshot --filename=screenshots/vscode-chat-smoke/02-chat-open.png

# Type a message one keystroke at a time. fill/type are unreliable inside
# Code OSS Monaco inputs; per-key press is the only consistent pattern.
for k in H e l l o Space f r o m Space d a p Minus c l i; do
  playwright-cli press "$k"
done
playwright-cli screenshot --filename=screenshots/vscode-chat-smoke/03-typed.png
```

### Trigger the breakpoint and inspect

Pressing **Enter** invokes `ChatSubmitAction.run` which calls
`ChatWidget.acceptInput`. The renderer pauses immediately, so run the
keystroke in the background and switch to the dap-cli terminal:

```bash
( playwright-cli press "Enter" ) &
sleep 1
npx dap-cli events  --name "VS Code/Launch VS Code Internal" --include stopped --limit 5
npx dap-cli threads --name "VS Code/Launch VS Code Internal"
npx dap-cli stack   --name "VS Code/Launch VS Code Internal" --thread-id 0 --levels 5
```

Expected highlights from the captured run that produced this doc:

```text
events:  reason: "breakpoint", hitBreakpointIds: [0]

threads: [{ id: 0, name: "Welcome" },
          { id: 1, name: "editorWorkerService" }]

stack:   ChatWidget.acceptInput              chatWidget.ts:2271      # source-mapped
         ChatSubmitAction.run                chatExecuteActions.ts:159
         handler                             actions.ts:723
         InstantiationService.invokeFunction instantiationService.ts:109
         CommandService._tryExecuteCommand   commandService.ts:99
```

The top frame's `source.path` is the `.ts` file in `src/vs/...` — proof
that the inline source map resolved end-to-end.

Resume:

```bash
npx dap-cli continue --name "VS Code/Launch VS Code Internal" --thread-id 0
```

The backgrounded `playwright-cli press "Enter"` will then return; the chat
panel will show the submitted message.

### Cleanup

```bash
playwright-cli detach
npx dap-cli close "VS Code/Launch VS Code Internal"
npx dap-cli sessions
npx dap-cli stop-controller
```

Because the VS Code compound uses `stopAll`, `sessions` should show that the
group was removed after closing `VS Code/Launch VS Code Internal`.

## Troubleshooting

- **`acceptInput` line number drift.** If a `vscode` rebuild moves
  `acceptInput`, find the new line with:
  ```bash
  grep -n "async acceptInput" \
    /Users/roblou/code/vscode/src/vs/workbench/contrib/chat/browser/widget/chatWidget.ts
  ```
  Set the breakpoint on the first statement inside the function body (one
  line after the `async acceptInput(...)` header).
- **Want to bypass source maps?** You can target the compiled file directly
  (e.g. `out/vs/workbench/contrib/chat/browser/widget/chatWidget.js` line
  1693). Useful for ruling out source-map issues if a `.ts` breakpoint
  refuses to verify.
- **Breakpoint reports `verified: false`.** The chat module hasn't been
  loaded yet. Open the chat panel once (`Ctrl+Cmd+I` on macOS) so the
  workbench dynamically imports `chatWidget.js`, then re-issue the
  `breakpoints set` command.
- **Sign-in modal blocks the message.** That's fine for the smoke purpose
  — `acceptInput` runs *before* the auth check, so the breakpoint still
  fires. To send for real, sign in once with the persistent profile and
  the modal won't reappear on subsequent runs.
- **`fill` / `type` does nothing.** Confirmed quirk of Code OSS Monaco
  inputs. Always use per-key `playwright-cli press` after focusing the
  input.
- **Two CDP clients fighting?** They shouldn't — `dap-cli` (via js-debug)
  and `playwright-cli` open independent sessions on the same port.
  Anecdotally stable across this scenario; if you see odd disconnects,
  re-run the attach commands in order (dap-cli first, then playwright-cli).

## Captured artifacts

This run produced screenshots under
`screenshots/vscode-chat-smoke/`:

- `01-attached-*.png` — workbench after `playwright-cli attach`
- `02-chat-open-*.png` — chat panel focused
- `03-typed.png` — "Hello from dap-cli" typed in the input
- `05-after-continue.png` — message submitted, Copilot prompting for sign-in
