---
gsd_debug_version: 1.0
slug: pwa-chrome-attach-launch-bugs
status: root_cause_found
trigger: "Diagnose why pwa-chrome attach to a Playwright-owned Chromium CDP port returns successfully but exposes zero DAP threads, and why pwa-chrome launch with Playwright CDP handoff reports the fixture app.js breakpoint as unbound."
created: 2026-05-03T18:03:02Z
updated: 2026-05-03T18:30:00Z
---

# Debug Session: pwa-chrome-attach-launch-bugs

## Symptoms

DATA_START
- expected_behavior: |
    1) Attaching pwa-chrome to a Playwright-owned Chromium CDP port should expose the
       page's JS execution as DAP threads (so `threads` returns non-empty).
    2) Launching pwa-chrome with the Playwright CDP handoff should successfully bind
       breakpoints in fixture app.js (verified=true / not unbound).
- actual_behavior: |
    1) Attach returns successfully but `threads` returns zero DAP threads.
    2) Launch reports the fixture app.js breakpoint as unbound.
- error_messages: "(none reported — silent functional failures; breakpoint shows as unbound)"
- timeline: "Observed during Phase 4 agent-workflow / Playwright interop verification."
- reproduction: |
    See tests/integration/playwrightInterop.test.ts and the simple-chrome-page fixture
    (tests/fixtures/simple-chrome-page/{app.js,index.html,interop.spec.ts}).
    Both scenarios go through the pwa-chrome adapter (jsDebug builtin) wired via
    src/adapters/builtins/jsDebug.ts.
DATA_END

## Current Focus

```yaml
hypothesis: "dap-cli's DapClient does not handle js-debug's `startDebugging` reverse request, so vscode-js-debug's child sessions (which actually own the browser page targets) are never established. The parent session has no threads of its own and cannot bind page breakpoints."
test: "Inspect DapClient.handleAdapterRequest for reverse request handling and confirm js-debug emits startDebugging at attach/launch time for each browser page target."
expecting: "Confirm DapClient rejects all reverse requests except runInTerminal, and that the bundled vscode-js-debug dapDebugServer.js calls startDebuggingRequest with __pendingTargetId."
next_action: "Surface root cause and let user decide: implement child-session multiplexing in the controller, or document the limitation."
reasoning_checkpoint: ""
tdd_checkpoint: ""
```

## Evidence

- timestamp: 2026-05-03T18:25:00Z
  source: src/protocol/dapClient.ts (handleAdapterRequest, lines ~163-179)
  observation: |
    Adapter→client requests are only handled if `request.command === 'runInTerminal'`.
    Every other reverse request — including js-debug's `startDebugging` — is rejected
    with `"Unsupported adapter request: ${request.command}"`.
- timestamp: 2026-05-03T18:25:00Z
  source: src/generated/dapCommandRegistry.ts
  observation: |
    `startDebugging` is recorded with `direction: "adapterToClient"` and capability
    `supportsStartDebuggingRequest`. dap-cli is aware of the reverse request from the
    schema but does not implement client-side handling.
- timestamp: 2026-05-03T18:25:00Z
  source: src/protocol/lifecycle.ts (DapLifecycleController.start)
  observation: |
    The controller drives a single transport per session: `initialize` → `attach|launch`
    → wait for `initialized` → optional setBreakpoints → `configurationDone`. There is
    no concept of a child session, no second transport, and no claim of a pending
    target id.
- timestamp: 2026-05-03T18:26:00Z
  source: ~/.dap-cli/adapters/js-debug/src/dapDebugServer.js (minified)
  observation: |
    `startDebuggingRequest({request: e.launchConfig.request, configuration: {type: ...,
    name: ..., __pendingTargetId: e.id()}})` — vscode-js-debug emits a `startDebugging`
    reverse request per browser/page/worker target it discovers, expecting the client
    to open a new DAP session that issues `attach`/`launch` with the same
    `__pendingTargetId` to claim that child target.
- timestamp: 2026-05-03T18:26:00Z
  source: src/adapters/builtins/jsDebug.ts
  observation: |
    The js-debug descriptor uses transport.kind = 'server' and runs `dapDebugServer.js`
    on a TCP port. The server accepts multiple incoming DAP connections; each new
    connection is a separate session. dap-cli connects exactly once via
    `startServerSocketAdapter` and never opens a second connection.
- timestamp: 2026-05-03T18:27:00Z
  source: .planning/phases/05-stabilize-real-chrome-js-debug-playwright-same-browser-hando/05-CONTEXT.md
  observation: |
    Prior planning notes already flagged "src/protocol/dapClient.ts - reverse request
    and cleanup handling" as the area to investigate for the same-browser handoff
    flake — consistent with this root cause.

## Eliminated Hypotheses

- "Source-path / webRoot / urlFilter mismatch causes breakpoint to be unbound."
  Eliminated because zero threads on the root session means no targets exist to bind
  breakpoints against in the first place. webRoot mapping is downstream of having a
  child session that owns the page.
- "Race between Playwright page navigation and js-debug attach."
  Eliminated because the test explicitly polls
  `expect.poll(...).toBeGreaterThan(0)` on threads for up to 10s and the count
  remains 0 — js-debug never publishes a thread on the parent session regardless of
  timing.

## Resolution

```yaml
root_cause: |
  vscode-js-debug uses a parent/child session model. The pwa-chrome adapter does not
  drive browser page targets directly on the parent DAP session — instead, for each
  discovered target it emits a `startDebugging` reverse request carrying a
  `__pendingTargetId`. The IDE is expected to open a NEW DAP session (a second TCP
  connection to the same dapDebugServer.js port) and send `attach`/`launch` with
  that `__pendingTargetId` to claim the child target. Only the child session
  exposes threads and can bind breakpoints to the page's loaded scripts.

  dap-cli's DapClient rejects all reverse requests except `runInTerminal`
  (src/protocol/dapClient.ts handleAdapterRequest), and the controller has no
  mechanism for spawning a second transport / child session against the same
  adapter process. Consequently the parent pwa-chrome session reports zero threads
  and breakpoints set on it remain unbound.
fix: "not applied — requires a non-trivial controller feature (js-debug child-session multiplexing). Recommend planning as a dedicated phase via /gsd-plan-phase --gaps."
verification: ""
files_changed: []
```

## Recommended Fix Direction

Implementing the fix requires roughly:

1. **DapClient** (`src/protocol/dapClient.ts`): extend `handleAdapterRequest` so
   non-`runInTerminal` reverse requests can be routed to a registered handler
   instead of being rejected outright. Keep the adapter response wiring
   (`writeAdapterResponse`) but allow it to be deferred until the child session is
   established.
2. **Controller** (`src/controller/server.ts`): on receipt of a `startDebugging`
   reverse request from a js-debug parent runtime:
   - For `transport.kind === 'server'` adapters, open a second connection to the
     same host/port. For stdio adapters, surface a clear "not supported" error.
   - Create a new `DapClient` + `DapLifecycleController` + `DapEventCache` for the
     child transport.
   - Register the child as a session in `SessionManager` with a derived name (e.g.
     `<parent>:<child-id>` or based on the configuration `name`/target type).
   - Issue `initialize` then `attach`/`launch` with the configuration from the
     reverse request body (already carries `__pendingTargetId`), then
     `configurationDone`.
   - Reply `success: true` to the original `startDebugging` request after the
     child session is wired up (or `success: false` + message on failure).
3. **Breakpoints**: route `__dapCliInitialBreakpoints` through to matching child
   sessions once they appear, or document that user-set breakpoints must target a
   child session by name.
4. **Lifecycle**: when the parent terminates, terminate child sessions; when a
   child terminates (page closed), update its session record without affecting
   the parent.

This is the standard "DA root + child sessions" pattern used by VS Code's debug
service. The same plumbing also unblocks Node.js worker debugging and other
multi-target js-debug scenarios.
