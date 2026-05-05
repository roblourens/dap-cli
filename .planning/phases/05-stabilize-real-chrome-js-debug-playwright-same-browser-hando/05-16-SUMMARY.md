---
phase: 05-stabilize-real-chrome-js-debug-playwright-same-browser-hando
plan: 16
subsystem: tests/integration
tags: [gap-closure, chrome-smoke, pwa-chrome, start-debugging-handler, raw-dap-client]
gap_closure: true
requires: []
provides:
  - chrome-smoke-startdebugging-handler
affects:
  - tests/integration/jsDebugAdapter.test.ts
tech_stack_added: []
patterns:
  - "Mirror controller's `installStartDebuggingHandler` / `runChildLifecycle` in a raw-client test helper when js-debug pwa-chrome reverse-requests `startDebugging`."
  - "Background-await child launch/attach response (do NOT block the reverse-request response) — js-debug deadlocks otherwise."
  - "Replay parent setBreakpoints into each new child between `initialized` and `configurationDone` instead of relying on parent-provisional propagation."
key_files:
  created:
    - .planning/phases/05-stabilize-real-chrome-js-debug-playwright-same-browser-hando/05-16-SUMMARY.md
  modified:
    - tests/integration/jsDebugAdapter.test.ts
decisions:
  - "Implemented Option A from the deferred-items recommended split (handler in the test helper) instead of migrating the chrome-smoke through the controller. Keeps the test path narrow and avoids coupling the smoke to controller behavior."
  - "Best-effort parent `disconnect` with `.catch` — once `continue` is issued, the page child often terminates and tears the parent connection down before the disconnect response can be returned."
metrics:
  duration_minutes: ~25
  tasks_completed: 1
  files_changed: 1
  completed_at: 2026-05-04
---

# Phase 5 Plan 16: Handle js-debug `startDebugging` in chrome-smoke helper Summary

Closed the chrome-smoke half of gap #11 by installing a `startDebugging` reverse-request handler in [tests/integration/jsDebugAdapter.test.ts](tests/integration/jsDebugAdapter.test.ts) `runJsDebugBreakpointSmoke`. The raw single-process DAP client now brings up js-debug pwa-chrome page-level child sessions correctly, the parent's provisional breakpoint propagates, and the chrome smoke (`launches Chrome in headless mode and verifies breakpoint inspection`) passes end-to-end.

## Bring-up sequence used

Mirrors [src/controller/childSessions.ts](src/controller/childSessions.ts) `ChildSessionCoordinator.installStartDebuggingHandler` + `handleStartDebugging` + `runChildLifecycle`:

1. **Parent registration:** `installStartDebuggingHandler(client)` is called BEFORE `client.request('launch', ...)`. Each client (parent and every future child) gets its own serialized invocation chain so registrations are deterministic.
2. **On `startDebugging`:** open a new transport via `adapter.openChildTransport(name)` (only available for `socket` / `server` adapter kinds — js-debug is `server`, so this works; pwa-node Node/TS/Electron variants never emit `startDebugging` so the handler is a silent no-op for them).
3. **Synchronous portion of the bring-up:** install initialized-event watcher → `await child.request('initialize', ...)`. Then return `{success: true}` immediately.
4. **Background portion:** issue child `launch`/`attach` (do NOT await — js-debug holds the response until `configurationDone`), `await initializedChild`, replay every captured parent `setBreakpoints` payload onto the child, `await child.request('configurationDone')`, then `await launchPromise`.
5. **Recursive:** the same handler is installed on each new child so nested pwa-chrome (browser-level wrapper → page-level) targets are flat under the parent.

Two new helpers were added in the same file:
- `parentBreakpointPayloads: unknown[]` — captures parent `setBreakpoints` args so each child can replay them in step 4.
- `waitForAnyEventAcrossClients(getClients, eventNames, timeoutMs)` — races for `stopped`/`terminated` across parent + dynamically-added children. Re-polls the accessor every 50ms so children brought up after the waiter starts are auto-subscribed. Stopped/stackTrace/scopes/variables/continue are routed to whichever client actually emitted `stopped`.

Teardown: `detachParentHandler() + childDetachers[]` first, then close every child client and child transport (children before parent so child sockets unregister cleanly while the parent connection is still alive), then close parent client + adapter.

## Chrome-smoke result (closure proof)

Command:
```
DAP_CLI_RUN_BROWSER_SMOKES=1 npx vitest run tests/integration/jsDebugAdapter.test.ts
```

Result:
```
✓ resolves js-debug as a provisioned built-in adapter descriptor — 13ms
✓ launches Node.js app with js-debug and verifies breakpoint inspection — 202ms
✓ launches TypeScript output and verifies source-map breakpoint inspection — 200ms
✓ launches Chrome in headless mode and verifies breakpoint inspection — 10643ms
✓ pwa-chrome attach surfaces ≥1 child session and non-empty threads through the controller — 618ms
↓ launches Electron main process and verifies breakpoint inspection (skipped — no Electron in env)

Test Files: 1 passed (1)
Tests: 5 passed | 1 skipped (6)
Duration: 12.33s
Vitest exit code: 0
```

The chrome smoke verified:
- Breakpoint at `app.js:2` was registered on the parent (initially `provisionalBreakpoint`) and resolved to `verified: true` on the child once `loadedSource` fired for `app.js`.
- `stopped` event fired on the page child with `reason: "breakpoint"` and `hitBreakpointIds: [1]`.
- Stack frame's source path matched `simple-chrome-page/app.js`.
- Local variables included both `left` and `right` (the function arguments at the breakpoint).
- `continue` was issued on the page child; subsequent `terminated` event observed; clean teardown with no Vitest open-handles warnings.

Full-suite regression check:
```
npm test
→ 163 passed | 5 skipped (no failures)
```
Pre-existing pwa-node Node/TypeScript variants of the smoke remain green (the new handler is installed but never invoked for them).

## Gap #11: fully closed

With this plan landing alongside [05-15](.planning/phases/05-stabilize-real-chrome-js-debug-playwright-same-browser-hando/05-15-PLAN.md) (parent-route `setBreakpoints` for js-debug pwa-chrome), gap #11 is now fully closed:

- **Handoff smoke (controller path):** addressed by 05-15 — `ChildSessionCoordinator.maybeIntercept` routes `setBreakpoints` to the parent for js-debug, removing the per-child fan-out that was returning the spec-violating `{breakpoints: []}`.
- **Chrome smoke (raw single-process client path):** addressed here in 05-16 — explicit `startDebugging` handler + parent-bp replay + cross-client `stopped` wait.

Both required halves of gap #11 are green in CI as of this commit.

## Deviations from Plan

None — Task 1 was implemented as written (with the additional `parentBreakpointPayloads` replay, which the plan explicitly called out as following `runChildLifecycle`'s replay pattern). No checkpoints, no auth gates.

## Self-Check: PASSED

- `tests/integration/jsDebugAdapter.test.ts` exists and contains the `installStartDebuggingHandler` / `bringUpChild` / `waitForAnyEventAcrossClients` additions: confirmed via `git diff --stat` (210 insertions, 10 deletions).
- Commit `9361757` exists in `git log` with message `feat(05-16): handle js-debug startDebugging in chrome-smoke helper`.
- Closure proof above (vitest exit 0, chrome smoke passed, full suite passed) was captured directly from the test runner.
