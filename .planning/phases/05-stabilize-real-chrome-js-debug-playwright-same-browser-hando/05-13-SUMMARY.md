---
phase: 05
plan: 13
subsystem: testing
tags: [gap-closure, pwa-chrome, chrome-smoke, webRoot, partial]
gap_closure: true
gap_addressed: "gap #11 (chrome-smoke half) — partial: webRoot edit landed, but hypothesis falsified — chrome-smoke also needs nested-startDebugging coverage from 05-14."
requires:
  - "Plan 05-09 (deferred-items.md gap #11 diagnostic) — provided the webRoot hypothesis."
provides:
  - "tests/integration/jsDebugAdapter.test.ts: chrome-smoke launchArgs now declares `webRoot: path.dirname(page)` so pwa-chrome can map the local OS path supplied to setBreakpoints onto the parsed `file://` script URL — bringing the chrome-smoke launch config into parity with the strict handoff smoke in playwrightInterop.test.ts."
  - "Empirical falsification of the post-12 hypothesis that webRoot alone closes the chrome-smoke half of gap #11 — see Findings."
affects: []
tech-stack:
  added: []
  patterns:
    - "Test launch-config parity: gated single-process pwa-chrome smokes match the multi-session handoff smoke's webRoot configuration."
key-files:
  created:
    - .planning/phases/05-stabilize-real-chrome-js-debug-playwright-same-browser-hando/05-13-SUMMARY.md
  modified:
    - tests/integration/jsDebugAdapter.test.ts
decisions:
  - "Apply the one-line edit exactly as planned (`webRoot: path.dirname(page)`) and re-run. Do NOT add timeout extensions, retries, or polling when the test still times out — per the plan's explicit instruction to surface the new failure mode rather than bandage it."
  - "Keep the webRoot edit even though it does not by itself flip the test green: it is a correctness fix (matches the handoff smoke's parity, removes a real configuration gap pwa-chrome relies on) and is required before 05-14's recursive coordinator can have any effect on this test."
metrics:
  duration: ~10 min
  completed: 2026-05-03
requirements_satisfied:
  - "TEST-07 (partial — chrome-smoke webRoot configuration shipped; end-to-end pass still blocked on 05-14's recursive child-coordinator work)"
---

# Phase 05 Plan 13: Add `webRoot` to chrome-smoke launch config — Summary

One-liner: Added `webRoot: path.dirname(page)` to the gated `launches Chrome in headless mode and verifies breakpoint inspection` smoke's launchArgs in `tests/integration/jsDebugAdapter.test.ts`. The edit is correct and matches the handoff smoke's parity, but **the hypothesis that webRoot alone closes the chrome-smoke half of gap #11 is falsified** — the test still times out with the identical `stopped or terminated` failure. The remaining root cause is the same nested-startDebugging coverage gap that 05-14 addresses.

## What changed

### `tests/integration/jsDebugAdapter.test.ts`

Single-line addition to the `chrome-smoke` launchArgs object inside the gated test `launches Chrome in headless mode and verifies breakpoint inspection` (around line 90):

```diff
       launchArgs: {
         type: 'pwa-chrome',
         request: 'launch',
         name: 'chrome-smoke',
         url: `file://${page}`,
+        webRoot: path.dirname(page),
         runtimeExecutable: chromePath,
         runtimeArgs: ['--headless=new', ...],
       },
```

Where `page = path.join(process.cwd(), 'tests', 'fixtures', 'simple-chrome-page', 'index.html')`, so `path.dirname(page)` is the fixture directory containing `app.js`. This matches the `webRoot: fixtureRoot` already used by the strict handoff smoke in `tests/integration/playwrightInterop.test.ts`.

No other files were modified — no fixture edits, no helper edits, no production-code edits. Scope held to the plan's intentionally minimal surface.

## Why webRoot

Per the post-12 diagnostic spike documented in `deferred-items.md`: pwa-chrome maps the local OS path supplied to `setBreakpoints` (e.g. `/Users/.../simple-chrome-page/app.js`) onto parsed CDP script URLs (e.g. `file:///Users/.../simple-chrome-page/app.js`) only when `webRoot` is configured. Without it, the breakpoint placeholder returned from `setBreakpoints` never binds to the loaded script. The diagnostic noted: "this plus the `targetSelection: 'automatic'` flow likely explains both" the chrome-smoke and handoff-smoke timeouts.

## Verification evidence

`npx tsc --noEmit` — clean.

`DAP_CLI_RUN_BROWSER_SMOKES=1 npx vitest run tests/integration/jsDebugAdapter.test.ts -t "launches Chrome in headless mode"`:

```
 ❯ tests/integration/jsDebugAdapter.test.ts (6 tests | 1 failed | 5 skipped) 10139ms
   × js-debug adapter integration > launches Chrome in headless mode and verifies breakpoint inspection 10138ms
     → Timed out waiting for DAP event 'stopped or terminated'.

 FAIL  tests/integration/jsDebugAdapter.test.ts > js-debug adapter integration > launches Chrome in headless mode and verifies breakpoint inspection
Error: Timed out waiting for DAP event 'stopped or terminated'.
 ❯ Timeout._onTimeout tests/integration/jsDebugAdapter.test.ts:301:14

 Test Files  1 failed (1)
      Tests  1 failed | 5 skipped (6)
   Duration  10.87s
```

Same failure mode as before the edit (`setBreakpoints` returns length-1 placeholder, no `stopped` event arrives within the 10 s `waitForAnyEvent` budget). webRoot did not move the needle.

## Findings — hypothesis falsified

The post-12 diagnostic in `deferred-items.md` proposed two-component root cause for gap #11: (a) chrome-smoke needs `webRoot`; (b) handoff-smoke needs the recursive nested-startDebugging coordinator from 05-14. We assumed those two halves were independent.

**They are not.** The chrome-smoke also relies on nested startDebugging:

- The smoke uses a raw single-process `DapClient` against the parent js-debug stdio adapter (no controller, no `ChildSessionCoordinator`). It calls `setBreakpoints` directly on the parent client.
- pwa-chrome's parent session does not own the page-level CDP target. It spawns child sessions via `startDebugging` reverse requests: parent → browser-wrapper child → page-level grandchild. The page grandchild is what owns the parsed `file://.../app.js` script.
- Because the raw test client never handles `startDebugging` reverse requests, the page-level grandchild is never connected. `setBreakpoints` on the parent returns a length-1 placeholder (the parent treats the bp as "queued, will resolve when a script with this URL parses"), but no script ever parses *in the parent* — the script lives in the unconnected grandchild.
- Result: identical timeout-on-`stopped` regardless of webRoot.

webRoot is still the correct configuration (and necessary for the page child once it *is* connected), but it is **not sufficient** for the raw single-process test path. The chrome-smoke test cannot be green with a raw `DapClient` — it would need either:

1. A reverse-request handler in the test client that auto-attaches startDebugging children (essentially inlining what `ChildSessionCoordinator` does), or
2. A rewrite to drive through the controller so 05-14's coordinator does the work.

That is a non-trivial scope expansion outside this plan's one-line surface, and is exactly the territory plan 05-14 carves out at the controller layer.

## Out of scope

- Handoff smoke (`playwrightInterop.test.ts`): different test path, addressed by plan 05-14's recursive coordinator.
- Reverse-request plumbing in the raw `DapClient` test path: would require a new helper or a rewrite of `runJsDebugBreakpointSmoke` to mirror controller behavior. Out of this plan's intentionally minimal scope; will be reconsidered after 05-14 lands (the test may be better served by going through the controller instead).

## Deferred Issues

The chrome-smoke half of gap #11 is **not** closed by this plan alone. After 05-14 ships, a follow-up should decide between (a) inlining a startDebugging reverse-request handler into `runJsDebugBreakpointSmoke` to keep the raw single-process test path, or (b) rewriting the chrome-smoke to drive through the controller and inherit 05-14's coordinator. Tracking this in `deferred-items.md` so the next agent picks it up.

## Self-Check: PASSED

- File `tests/integration/jsDebugAdapter.test.ts` exists and contains `webRoot: path.dirname(page)` on the chrome-smoke launchArgs.
- File `.planning/phases/05-stabilize-real-chrome-js-debug-playwright-same-browser-hando/05-13-SUMMARY.md` exists.
- Per-task commit hashes recorded below in the final commit message.
