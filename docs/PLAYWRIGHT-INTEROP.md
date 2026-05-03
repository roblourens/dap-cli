# Playwright Interop

Playwright drives the browser UI. dap-cli controls and inspects debugger state. Keep those responsibilities separate and coordinate through polling.

## Setup Order

1. Start the dap-cli controller.
2. Launch `js-debug` for a Chrome target.
3. Set breakpoints before triggering UI behavior.
4. Confirm the debugger is ready with `status` and `events`.
5. Run Playwright actions.
6. Poll `events --after-cursor` and inspect stopped state.
7. Continue, step, or clean up.

This order avoids racing UI actions ahead of debugger initialization.

## Example Target

The repository includes `tests/fixtures/simple-chrome-page/`. It has an `index.html` page and `app.js` with a `calculate(left, right)` function that is suitable for breakpoints.

## Terminal 1: Establish Debugger State

```bash
dap-cli start
dap-cli launch --adapter js-debug --type chrome --url http://127.0.0.1:3000 --runtime-executable "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --runtime-args "--headless=new" --name web-demo
dap-cli breakpoints set --source tests/fixtures/simple-chrome-page/app.js --line 2 --name web-demo
dap-cli status --name web-demo
dap-cli events --name web-demo --limit 5
```

For a local fixture server, use whichever static server your test harness starts. Keep the browser URL on localhost unless you are intentionally debugging a remote target.

## Terminal 2: Drive UI Actions

```bash
npx playwright test tests/fixtures/simple-chrome-page/interop.spec.ts --project=chromium --workers=1
```

Use `--workers=1` for debugger interop scenarios so UI actions happen in a deterministic order.

## Terminal 1: Poll and Inspect

```bash
dap-cli events --name web-demo --after-cursor 0 --limit 20
dap-cli threads --name web-demo
dap-cli stack --thread-id 1 --name web-demo
dap-cli scopes --frame-id 10 --name web-demo
dap-cli variables --variables-reference 100 --name web-demo
dap-cli evaluate --expression "document.title" --frame-id 10 --name web-demo
dap-cli continue --thread-id 1 --name web-demo
dap-cli cleanup
```

The `frame-id` and `variables-reference` values in this example are placeholders from a stopped state. Always use IDs returned by the current `stack` and `scopes` responses.

## Playwright Test Coordination

A Playwright test can be the actor while dap-cli remains the observer. Trigger one UI action, then poll dap-cli from the shell or test harness before triggering the next action.

```typescript
import { expect, test } from '@playwright/test';

test('calculator interaction', async ({ page }) => {
  await page.goto('http://127.0.0.1:3000');
  await page.click('#run');
  await expect(page.locator('#result')).toHaveText('5');
});
```

Between Playwright actions, the agent loop is still dap-cli polling:

```bash
dap-cli events --name web-demo --after-cursor 0 --limit 20
dap-cli stack --thread-id 1 --name web-demo
dap-cli variables --variables-reference 100 --name web-demo
```

## Automated Harness Pattern

The default automated interop test uses Vitest to orchestrate Playwright and dap-cli from one process. This keeps the browser action sequence deterministic while still exercising the agent-facing polling commands.

```typescript
import { chromium } from '@playwright/test';
import { test, expect } from 'vitest';
import { runCli } from '../helpers/runCli.js';

test('browser action plus debugger inspection', async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  await runCli(['launch', '--adapter', 'fake', '--script', 'playwright-inspection', '--name', 'web-demo']);
  await page.goto('http://127.0.0.1:3000/index.html');
  await page.evaluate('calculate(4, 6)');

  await runCli(['events', '--name', 'web-demo', '--after-cursor', '0', '--limit', '20']);
  await runCli(['threads', '--name', 'web-demo']);
  await runCli(['stack', '--thread-id', '1', '--name', 'web-demo']);
  await runCli(['variables', '--variables-reference', '100', '--name', 'web-demo']);
  await runCli(['continue', '--thread-id', '1', '--name', 'web-demo']);

  await expect.poll(async () => page.locator('#result').textContent()).toBe('10');
  await browser.close();
});
```

Use this pattern when the verification goal is agent workflow coordination: one action, one poll, inspect, then resume. Use real `js-debug` Chrome attachment when validating adapter-specific behavior, and keep that separate from the default suite unless browser discovery and debug-port ownership are fully deterministic on the target machine.

## Advanced Patterns

- **Multi-step browser flows:** keep each Playwright action small, then poll `events` and inspect the current frame before issuing the next action.
- **Expression inspection:** when the adapter supports evaluation, pause in the page script and use `evaluate` for DOM or application state reads before resuming.
- **Reference refresh:** treat `threadId`, `frameId`, and `variablesReference` values as single-pause handles. Reacquire them after every `continue`, step, restart, or new stopped event.
- **Local fixture serving:** serve browser fixtures over `http://127.0.0.1:<port>` in tests. It gives the debugger stable URL/source behavior and avoids `file://` policy differences.

## Known Limitations

- The default interop test proves deterministic Playwright plus dap-cli coordination with a scripted adapter. Real Chrome/js-debug handoff is tracked as follow-up work because browser executable discovery, remote debug port ownership, and source path mapping need extra stabilization.
- Conditional breakpoint and in-browser expression mutation scenarios are promising but should become tests only after they can run without timing assumptions.

## Troubleshooting

- If no stopped event appears, verify the breakpoint source path matches the browser-loaded script.
- If a Playwright action completes before the debugger is ready, restart the session and poll `status` before running the action.
- If Chrome fails to start, verify the `--runtime-executable` path or let the adapter use its default Chrome discovery.
- If variable references fail after a resume, reacquire `threads`, `stack`, and `scopes` before calling `variables` again.
