# Phase 5 Validation Contract

## Goal

Validate that dap-cli can coordinate with Playwright against a real same-browser Chrome/js-debug target, or produce a clearly documented opt-in gate if environmental constraints prevent default-runnable coverage.

## Required Evidence

| Evidence | Required Result |
|----------|-----------------|
| Same-browser ownership | The browser receiving Playwright actions is the browser js-debug attaches to or launched. |
| Breakpoint hit | dap-cli observes a `stopped` event with reason `breakpoint` after the Playwright-triggered page action. |
| Inspection | dap-cli successfully reads threads, stack, scopes, and variables from the paused page script. |
| Resume | dap-cli continues execution and Playwright observes the expected page result. |
| Cleanup | Focused process check finds no owned Chromium, js-debug, fixture server, or fake adapter leftovers. |
| Documentation | `docs/PLAYWRIGHT-INTEROP.md` reflects the proven same-browser pattern and any prerequisites. |

## Automated Commands

```bash
npm test -- tests/integration/playwrightInterop.test.ts
npm run check
```

If the real same-browser case is gated:

```bash
DAP_CLI_RUN_CHROME_PLAYWRIGHT_HANDOFF=1 npm test -- tests/integration/playwrightInterop.test.ts
```

## Nyquist Gates

- Gate 1: The stable scripted interop test must continue to pass, proving Phase 4 behavior does not regress.
- Gate 2: The real Chrome/js-debug handoff must either pass by default or skip with a precise, documented reason.
- Gate 3: Documentation must not claim default-runnable real-browser handoff unless the default test actually runs it.
- Gate 4: The final process cleanup check must be scoped to test-owned processes and must not kill unrelated VS Code/Electron helpers.

## Failure Signals

- Playwright action succeeds but dap-cli never sees `stopped`.
- Breakpoint remains unverified because source path mapping does not match the served fixture URL.
- Browser or adapter process remains after test cleanup.
- The new test only proves two separate browsers rather than one shared target.
