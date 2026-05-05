# Phase 5 Verification Notes

## Selected Strategy

Phase 5 first implemented Strategy A from research: Playwright launches Chromium with a dedicated user data directory and known remote debugging port, then dap-cli starts a js-debug Chrome attach session against that same port.

This strategy was selected because Playwright owns browser lifecycle and cleanup, the browser executable comes from the installed Playwright Chromium, and the test can verify the page behavior in the same process that triggers it.

Gap-closure execution also tried Strategy B: dap-cli/js-debug launches Chromium with a known remote debugging port, then Playwright connects to that same browser over CDP. Strategy B removed the ambiguity about browser ownership, but js-debug still reported the fixture breakpoint as unbound in this environment.

Follow-up debugging added a dap-cli lifecycle hook for initial breakpoints before `configurationDone`, then revisited Strategy A with Playwright launching Chromium and js-debug attaching to the same CDP port. That attach handoff currently returns successfully but exposes zero js-debug threads for the selected page within 10s, so the gate now fails earlier and more precisely at target selection/thread availability.

## Implemented Coverage

| Coverage | Status | Evidence |
|----------|--------|----------|
| Scripted Playwright + dap-cli baseline | Passing by default | `npm test -- tests/integration/playwrightInterop.test.ts` runs the Phase 4 scripted adapter interop test. |
| Same-browser ownership | Blocked with strict evidence | The opt-in test uses a single Chromium target on a known CDP port, but js-debug attach currently exposes no browser thread for the selected page. |
| Same-browser breakpoint stop | Not complete | The opt-in gate fails before `stopped`: current attach strategy has no js-debug thread; earlier launch strategy produced an unbound breakpoint. |
| Documentation accuracy | Complete | `docs/PLAYWRIGHT-INTEROP.md` now describes the opt-in gate and its current unbound-breakpoint limitation. |
| Cleanup | Complete | The test stops the dap-cli session, closes the Playwright page/context, stops the controller, and removes the isolated `DAP_CLI_HOME`. |

## Verification Commands

```bash
npm test -- tests/integration/playwrightInterop.test.ts
DAP_CLI_RUN_CHROME_PLAYWRIGHT_HANDOFF=1 npm test -- tests/integration/playwrightInterop.test.ts
npm run check
```

## Results

- Default Playwright interop: passed with one default test and one skipped opt-in handoff.
- Opt-in handoff before gap closure: passed as diagnostic coverage with two tests passing, but only because the test returned early when no `stopped` event arrived.
- Opt-in handoff after gap closure hardening: fails intentionally. Earlier strict launch-handoff runs failed when `breakpoints set` returned `{ verified: false, message: "Unbound breakpoint" }`; the latest attach-handoff run fails because `threads` remains empty after js-debug attaches to the Playwright-owned browser. This is the correct current result because it prevents attach-only evidence from being mistaken for full same-browser inspection.

## Same-Browser Evidence

The current opt-in test uses a single Chromium target launched by Playwright with `--remote-debugging-port=<port>`. dap-cli/js-debug attaches to that same port with a URL filter and initial breakpoint setup before `configurationDone`.

The current evidence proves the test can force same-browser ownership at the browser-process/CDP-port level, but it does not yet prove paused-state inspection because js-debug does not expose a browser thread for that page. Earlier js-debug-owned launch evidence reached breakpoint setup, but the breakpoint remained unbound.

## Residual Follow-Up

The remaining work is not just source mapping. The original same-browser goal is still incomplete, and interactive real-adapter inspection exposed two additional usability gaps:

- Determine why js-debug attach to the Playwright-owned Chromium port returns successfully but exposes no browser thread for the selected page.
- Determine why js-debug does not bind `tests/fixtures/simple-chrome-page/app.js` in the js-debug-owned launch handoff even after dap-cli can send initial breakpoints before `configurationDone`.
- Inspect richer breakpoint/source details from js-debug or CDP so the next attempt can compare the browser-loaded script URL to dap-cli's `setBreakpoints` source.
- Keep the opt-in gate strict: it should fail until breakpoint binding, `stopped`, paused inspection, and `continue` are all proven.

Phases 6-8 remain deferred for conditional breakpoints, evaluate/mutate workflows, and richer multi-breakpoint fixtures.

## Readiness Assessment

Phase 5 now has stricter evidence: default suite stability is preserved, duplicate session-name handling and stale js-debug diagnostics are covered by gap-closure tests, dap-cli can send initial breakpoint setup before `configurationDone`, and the same-browser Chrome gate fails honestly at the current js-debug thread-selection blocker. The same-browser debugging loop should not be advertised as complete until the opt-in gate passes end to end.
