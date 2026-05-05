# Phase 5 Research: Real Chrome/js-debug Playwright Same-Browser Handoff

## Summary

Phase 4 proved the agent workflow with Playwright and a scripted adapter. Phase 5 should close the remaining integration gap: make one browser target both Playwright-controlled and js-debug-inspected through dap-cli.

The central technical decision is ownership order. Either Playwright starts the browser and js-debug attaches, or js-debug starts the browser and Playwright attaches over CDP. The most deterministic path is likely Playwright-owned browser plus js-debug attach, because the test harness can capture the browser endpoint and own browser cleanup directly.

## Current Baseline

- `tests/integration/playwrightInterop.test.ts` already starts a fixture HTTP server, launches Playwright Chromium, triggers page behavior, and exercises dap-cli status/events/threads/stack/scopes/variables/continue/stop.
- `tests/integration/jsDebugAdapter.test.ts` already validates real js-debug Node/TypeScript smoke coverage by default, with browser-oriented smokes skipped or opt-in.
- `src/adapters/builtins/jsDebug.ts` starts js-debug's `dapDebugServer.js` as a local socket DAP server.
- `src/config/launchConfig.ts` maps user-facing `chrome` to adapter-native `pwa-chrome`.

## Candidate Strategies

### Strategy A: Playwright Launches Chromium, js-debug Attaches

Flow:
1. Allocate a free remote debugging port.
2. Launch Playwright Chromium with `--remote-debugging-port=<port>` and a dedicated user data dir.
3. Serve the fixture over localhost and navigate Playwright to the page.
4. Launch dap-cli with `--adapter js-debug --request attach --type chrome --port <port>` or equivalent launch config override.
5. Set breakpoint in `app.js` before triggering the function.
6. Trigger Playwright action and poll dap-cli until stopped.

Pros:
- Playwright owns browser lifecycle and cleanup.
- Browser executable comes from Playwright's installed Chromium, avoiding host Chrome discovery.
- Test can create and dispose the user data dir deterministically.

Risks:
- js-debug attach config support through dap-cli may need additional CLI override coverage.
- Source mapping from localhost URL to workspace path may need `webRoot` or path override support.
- Chromium may reserve or expose a CDP endpoint differently from bundled Chrome on some systems.

### Strategy B: js-debug Launches Chrome, Playwright Connects Over CDP

Flow:
1. Choose a known remote debugging port and pass it to js-debug Chrome launch arguments.
2. Launch dap-cli js-debug Chrome session against the fixture URL.
3. Use Playwright `chromium.connectOverCDP` to connect to that browser.
4. Trigger the browser action and inspect with dap-cli.

Pros:
- js-debug owns the browser target exactly as users would launch it.
- The adapter launch path validates the same behavior documented in `docs/PLAYWRIGHT-INTEROP.md`.

Risks:
- Need reliable way to learn when Chrome is ready for CDP connection.
- js-debug/browser process ownership and cleanup become harder to reason about.
- Passing and preserving remote debugging args through js-debug may be adapter-sensitive.

## Recommendation

Start with Strategy A. It gives the test harness direct control over the browser executable, user-data-dir, port, page, and cleanup. If attach config or source mapping blocks this path, document the exact blocker and fall back to Strategy B as an opt-in extended smoke.

## Validation Architecture

Phase 5 validation should use a two-tier gate:

1. **Default deterministic gate**
   - `npm test -- tests/integration/playwrightInterop.test.ts`
   - Existing scripted interop remains stable and always runs.

2. **Real browser handoff gate**
   - New focused test or test case attempts same-browser Playwright plus js-debug interop.
   - If reliable on the standard dev environment, it runs by default.
   - If not reliable everywhere, it is gated by an explicit env var such as `DAP_CLI_RUN_CHROME_PLAYWRIGHT_HANDOFF=1` and records clear skip diagnostics.

Success requires the real-browser gate to demonstrate:

- Playwright action triggers code in the same browser target js-debug is attached to.
- dap-cli observes a stopped breakpoint event from js-debug.
- dap-cli can inspect threads, stack, scopes, and variables for the paused page script.
- dap-cli can continue execution and Playwright observes the completed page state.
- Cleanup leaves no Chromium, js-debug, fixture server, or dap-cli controller leftovers.

## Research Findings

- Local HTTP serving should remain the default for browser fixtures because it stabilizes URL identity and avoids `file://` restrictions.
- Breakpoint lines should target code only executed after debugger setup. The current `run()` auto-call may race; adding a button or delayed explicit Playwright-triggered function is likely safer.
- The phase should prefer helper extraction only after the real handoff is proven. Premature abstraction could hide useful diagnostics.
- Any environment-gated test must explain how to enable it and why it skipped, matching Phase 4 real-adapter smoke conventions.

## Open Questions for Implementation

- Does dap-cli currently expose enough attach override surface for js-debug Chrome attach port/webRoot configuration?
- Does Playwright's installed Chromium work with js-debug attach in the managed test environment?
- Which source path settings produce a verified breakpoint for `tests/fixtures/simple-chrome-page/app.js`?

These should be answered in the first task of the plan with a small spike before broadening the test.
