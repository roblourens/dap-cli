# Phase 5 Patterns

## Closest Existing Analogs

| Target Area | Existing Pattern | How to Reuse |
|-------------|------------------|--------------|
| Playwright orchestration | `tests/integration/playwrightInterop.test.ts` | Reuse fixture server setup, Playwright launch/cleanup, isolated `DAP_CLI_HOME`, and dap-cli polling command assertions. |
| Real js-debug coverage | `tests/integration/jsDebugAdapter.test.ts` | Reuse setup gating, real adapter launch expectations, breakpoint inspection assertions, and environment skip style. |
| Adapter setup | `scripts/setup-adapters.ts` | Depend on provisioned js-debug path instead of downloading inside tests. |
| Server-process adapter | `src/adapters/socketAdapter.ts` | Keep js-debug as an owned DAP server process; do not special-case browser tests in protocol core. |
| Launch config normalization | `src/config/launchConfig.ts` | Add any needed Chrome attach/webRoot mapping here if CLI overrides do not already cover it. |
| Test environment isolation | `src/testing/tempEnv.ts` and `tests/helpers/runCli.ts` | Keep per-test `DAP_CLI_HOME` and parse JSON envelopes through existing helpers or explicit schemas. |

## Style Constraints

- Keep browser tests explicit and diagnostic-rich; avoid hiding setup inside broad helpers until the real handoff is stable.
- Preserve default suite determinism. If the real browser handoff is environment-sensitive, gate it with an opt-in env var and a clear skip reason.
- Do not introduce language-specific behavior into DAP protocol core. Chrome/js-debug behavior belongs in adapter/config/test layers.
- Use async filesystem APIs in product code and tests.
- Keep cleanup narrowly scoped to processes and temp dirs created by the test.

## Verification Pattern

1. Start fixture HTTP server.
2. Start isolated dap-cli controller.
3. Launch or attach same browser target.
4. Establish breakpoint after debugger readiness.
5. Trigger Playwright action.
6. Poll dap-cli events/status until stopped.
7. Inspect stack/scopes/variables.
8. Continue and assert Playwright-visible result.
9. Stop session, close browser, stop controller, remove temp dirs.
