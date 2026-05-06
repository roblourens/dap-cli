# Playwright Interop

> **Naming clarification.** "Playwright CLI" in this repo means [`@playwright/cli`](https://www.npmjs.com/package/@playwright/cli) — the imperative shell binary `playwright-cli` that exposes commands like `attach`, `snapshot`, `click`, and `eval`. It is **not** the same as [`@playwright/test`](https://www.npmjs.com/package/@playwright/test), which is the spec runner invoked as `npx playwright test`. Both work with dap-cli; the imperative `playwright-cli` is the primary inspiration for dap-cli's command surface and the recommended interop driver for hand-driven and agent-driven workflows.

Playwright drives the browser UI. dap-cli controls and inspects debugger state. Keep those responsibilities separate and coordinate through polling.

> Looking for the **VS Code** flavor of this workflow (driving Code OSS built from sources, breakpointing chat input)? See [VSCODE-CHAT-SMOKE.md](VSCODE-CHAT-SMOKE.md).

## Setup Order

1. Start the dap-cli controller.
2. Launch a Chrome target under `js-debug` with a fixed CDP port.
3. Attach `playwright-cli` to that same CDP port.
4. Set breakpoints before triggering UI behavior.
5. Confirm the debugger is ready with `status` and `events`.
6. Drive UI actions with `playwright-cli`.
7. Poll `events --after-cursor` and inspect stopped state.
8. Continue, step, or clean up.

This order avoids racing UI actions ahead of debugger initialization, and it gives Playwright and dap-cli the **same browser instance** so breakpoints actually fire on the page Playwright is interacting with.

## Example Target

The repository includes [`tests/fixtures/ts-button-page/`](../tests/fixtures/ts-button-page/). It is a TypeScript page (`src/app.ts` compiled to `dist/app.js` with source maps) with a `Go` button whose handler calls `handleClick()` and increments `data-count`. Source maps are committed alongside the fixture so a breakpoint on the `.ts` file binds with `verified: true`.

To rebuild the fixture after editing `src/app.ts`:

```bash
cd tests/fixtures/ts-button-page
npm install
npm run build
```

## Prerequisites

```bash
# dap-cli (this repo)
npm install
npm run build

# @playwright/cli (the imperative binary)
npm install -g @playwright/cli@latest

# Confirm both are on PATH
npx dap-cli --version
playwright-cli --version
```

## Terminal 1: Controller + js-debug Chrome attach

```bash
# 1. Start the dap-cli controller
npx dap-cli start &
CTRL_PID=$!
sleep 1

# 2. Launch Chromium under js-debug with a fixed CDP port so playwright-cli
#    can attach to the same browser. webRoot lets the source map resolver
#    find src/app.ts. ?manual=1 disables any auto-running script paths.
npx dap-cli launch \
  --name web-demo \
  --adapter js-debug \
  --type pwa-chrome \
  --url "file://$PWD/tests/fixtures/ts-button-page/index.html?manual=1" \
  --json "{\"webRoot\":\"$PWD/tests/fixtures/ts-button-page\",\"runtimeArgs\":[\"--remote-debugging-port=9222\",\"--user-data-dir=$PWD/.demo-chrome-profile\"]}"

# 3. Set a breakpoint on the TypeScript source. Source maps resolve to
#    dist/app.js so the breakpoint binds verified=true.
npx dap-cli breakpoints set \
  --name web-demo \
  --source "$PWD/tests/fixtures/ts-button-page/src/app.ts" \
  --line 22


Conditional breakpoint metadata uses the same command and stays DAP-shaped. The CLI passes these fields through to the adapter; inspect the `verified`, `message`, and `warnings` fields in the response instead of pre-checking adapter capabilities.

```bash
npx dap-cli breakpoints set \
  --name web-demo \
  --source "$PWD/tests/fixtures/ts-button-page/src/app.ts" \
  --line 22 \
  --condition "count === 1"

npx dap-cli breakpoints set \
  --name web-demo \
  --source "$PWD/tests/fixtures/ts-button-page/src/app.ts" \
  --line 22 \
  --hit-condition 2

npx dap-cli breakpoints set \
  --name web-demo \
  --source "$PWD/tests/fixtures/ts-button-page/src/app.ts" \
  --line 22 \
  --log-message "handleClick count={count}"
```

After setting a conditional breakpoint, keep the same polling sequence: trigger one Playwright action, poll `events --include stopped`, inspect `threads`, `stack`, `scopes`, and `variables`, then `continue` when done.
# 4. Confirm the session is ready
npx dap-cli status --name web-demo
npx dap-cli events --name web-demo --limit 5
```

## Terminal 2: Drive UI with `playwright-cli`

Attach `playwright-cli` to the **same** CDP endpoint Chromium opened in Terminal 1, then use imperative commands to inspect and drive the page.

```bash
# 1. Attach to the same Chrome instance js-debug is controlling
playwright-cli attach --cdp=http://127.0.0.1:9222

# 2. Discover element refs
playwright-cli snapshot

# 3. Trigger the handler. Two options:
#
#    a) `eval` dispatches a DOM click without auto-wait. This is the
#       canonical "trigger a paused handler" pattern — it returns
#       immediately even when the handler pauses inside the debugger.
playwright-cli eval "document.getElementById('go').click()"

#    b) `click eN` works too, but Playwright's click auto-wait will block
#       until the handler returns. Use `--raw` and a long timeout if you
#       want the imperative semantics:
PWTEST_TIMEOUT=600000 playwright-cli click e3 --raw
```

## Terminal 1: Poll and inspect

While the handler is paused, use dap-cli to inspect state:

```bash
npx dap-cli events --name web-demo --include stopped --limit 20
npx dap-cli threads --name web-demo
npx dap-cli stack --name web-demo --thread-id 0
npx dap-cli scopes --name web-demo --frame-id <frame-from-stack>
npx dap-cli variables --name web-demo --variables-reference <ref-from-scopes>
npx dap-cli evaluate --name web-demo --expression "context.label" --frame-id <frame-from-stack>
npx dap-cli continue --name web-demo --thread-id 0
```

The `frame-id` and `variables-reference` values are valid only for the current paused state. Reacquire them after every `continue`, step, or new `stopped` event.

## Cleanup

```bash
playwright-cli detach
npx dap-cli close web-demo
npx dap-cli stop-controller
wait $CTRL_PID 2>/dev/null || true
rm -rf .playwright-cli .demo-chrome-profile
```

## Alternative: `@playwright/test` as the driver

If you prefer the spec runner over the imperative CLI, use `@playwright/test` to drive the same CDP-attached browser. Trigger one UI action per spec call, then poll dap-cli from another terminal between actions.

```typescript
import { expect, test } from '@playwright/test';

test('button click pauses in handleClick', async ({ playwright }) => {
  const browser = await playwright.chromium.connectOverCDP('http://127.0.0.1:9222');
  const context = browser.contexts()[0];
  const page = context.pages()[0];

  await page.click('#go'); // Will block on the breakpoint; use a long timeout.
  await expect(page.locator('#result')).toHaveText(/clicked 1 time/);
});
```

```bash
PWTEST_TIMEOUT=600000 npx playwright test path/to/spec.ts --workers=1
```

Use `--workers=1` for any debugger interop scenario so UI actions happen in a deterministic order.

## Automated harness pattern

The default automated interop test uses Vitest to orchestrate Playwright (`@playwright/test`'s `chromium` programmatic API) and dap-cli from one process. This keeps the action sequence deterministic while still exercising the agent-facing polling commands. See [`tests/integration/playwrightInterop.test.ts`](../tests/integration/playwrightInterop.test.ts) for the canonical example.

## Advanced patterns

- **Multi-step browser flows:** keep each driver action small, then poll `events` and inspect the current frame before issuing the next action.
- **Triggering paused handlers:** prefer `playwright-cli eval` (or `page.evaluate(...)` in spec form) over `click`. `click` auto-waits for the handler to settle and will appear to hang while the debugger holds the page.
- **Expression inspection:** when the adapter supports evaluation, pause in the page script and use `npx dap-cli evaluate` for DOM or application state reads before resuming.
- **Reference refresh:** treat `threadId`, `frameId`, and `variablesReference` values as single-pause handles. Reacquire them after every `continue`, step, restart, or new stopped event.
- **Local fixture serving:** for non-trivial pages, serve fixtures over `http://127.0.0.1:<port>` rather than `file://`. It gives the debugger stable URL/source mapping behavior. The `ts-button-page` fixture works over `file://` because its source maps resolve via `webRoot`.

## Troubleshooting

- **No `stopped` event after the click.** Inspect `npx dap-cli threads`. An empty thread list after Chrome attach means js-debug did not select a browser page target. If threads exist, inspect the `breakpoints set` response; an unbound breakpoint means the source path, URL mapping, or `webRoot` shape still does not match the browser-loaded script.
- **`playwright-cli attach` fails with `connection refused`.** The launch in Terminal 1 did not include `--remote-debugging-port=9222` in `runtimeArgs`, or Chromium is still starting up. Wait a second and retry.
- **`playwright-cli click` hangs.** That is correct behavior — the page is paused at your breakpoint. Either resume from Terminal 1 (`npx dap-cli continue --thread-id 0`) or use `playwright-cli eval` instead of `click` to dispatch the DOM event without auto-wait.
- **`verified: false` on the breakpoint.** Confirm `webRoot` points at the fixture root, the `dist/app.js.map` file is present, and the line exists in `src/app.ts`. If you edited the TypeScript, rerun `npm run build` in the fixture directory.
- **Variable references fail after a resume.** Reacquire `threads`, `stack`, and `scopes` before calling `variables` again.
