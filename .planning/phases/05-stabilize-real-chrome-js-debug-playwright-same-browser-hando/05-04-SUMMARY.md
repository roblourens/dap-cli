---
phase: 05-stabilize-real-chrome-js-debug-playwright-same-browser-hando
plan: 04
status: complete
gap_closure: true
requirements:
  - TEST-07
files_modified:
  - src/adapters/socketAdapter.ts
  - src/controller/childSessions.ts
  - src/controller/server.ts
  - tests/controller/sessionManager.test.ts
  - tests/integration/jsDebugAdapter.test.ts
---

# 05-04 Summary — pwa-chrome child-session bring-up + DAP routing

## Outcome

Wires the seam from 05-03 into the controller. When a parent js-debug session
emits a `startDebugging` reverse request, the controller now opens a fresh
DAP transport on the *same* socket adapter endpoint, runs initialize → attach
or launch → configurationDone as a child session, registers it under the
parent via `SessionManager.registerChild`, and transparently routes
thread-scoped DAP requests on the parent to the right child.

## Tasks completed

### Task 1 — Socket adapter exposes a child-transport factory

- Extended `ConnectedSocketAdapter` with optional `openChildTransport(name)`.
- Both connection paths implement it:
  - `connectSocketAdapter`: opens a new TCP socket to the adapter's
    descriptor `host`/`port`.
  - `startServerSocketAdapter`: opens a new TCP socket to the allocated port
    captured by closure when the server-mode adapter started.
- Process (stdio) adapters do not implement it — the controller uses an
  `'openChildTransport' in adapter` type guard before binding it.

### Task 2 — `ChildSessionCoordinator`

- New class in `src/controller/childSessions.ts` encapsulates parent/child
  bring-up + routing. Unit-testable independent of the full controller.
- `attach()` registers a serialized `onReverseRequest` handler on the parent
  client. `startDebugging` requests are processed strictly in order so child
  registration order matches the order issued by the parent — required so
  thread aggregation is deterministic.
- Bring-up flow per child:
  1. `openChildTransport(name)`
  2. `new DapClient(transport)` + `client.onEvent(mirrorChildEvent)`
  3. `sessionManager.registerChild({ parent_session_id, ... })`
  4. `await client.request('initialize', ...)`
  5. **Resolve the reverse request** as `{ success: true }` once initialize is
     sent — js-debug only needs to know the controller picked it up; we don't
     block the parent on the rest of the lifecycle.
  6. Fire-and-forget `runChildLifecycle`: attach|launch → configurationDone →
     replay any cached initial breakpoints → `updateLifecycle('running')`.
- Failures during attach/launch surface as a synthetic `output` event with a
  `child_session_id` annotation appended into the parent's event cache, and
  the child's lifecycle is updated to `failed`.

### DAP routing — `maybeIntercept`

The coordinator transparently intercepts these commands when the parent has
≥1 child:

- `threads` — fanned out across children. Child thread ids are remapped to
  unique numeric `parentVisibleThreadCounter` ids and renamed
  `${childId}: ${name}`. The mapping is cached per child for routing.
- `stackTrace`, `scopes`, `continue`, `next`, `stepIn`, `stepOut`, `pause`
  — routed by `threadId` (rewritten back to the child's local id). Returned
  `frameId`s are recorded for downstream routing.
- `variables`, `evaluate` — routed by `variablesReference` or `frameId`.
  Returned `variablesReference`s are recorded for downstream routing.
- `source` — routed by `source.sourceReference`.
- `setBreakpoints` — fanned out to every child; aggregated with
  ANY-verified-wins per breakpoint index.

If a child cannot be located for a routable command, the coordinator throws.
Non-routable commands fall through to the parent.

### Task 3 — Controller wiring + integration smoke

- `ControllerServer.startDapSession` constructs a `ChildSessionCoordinator`
  whenever the adapter exposes `openChildTransport`. The coordinator is
  stored on `DapSessionRuntime.children` and disposed first during teardown
  (`stop()` and `disconnectRuntimeForTarget`).
- `ControllerServer.routeDapRequest` calls `runtime.children?.maybeIntercept`
  before falling through to the direct DAP client.
- The `before-configurationDone` hook now also calls
  `children.registerInitialBreakpoints(initialBreakpoints)` so cached
  breakpoints replay onto each child as it comes up.
- New env-gated test in `tests/integration/jsDebugAdapter.test.ts`:
  `pwa-chrome attach surfaces ≥1 child session and non-empty threads through
  the controller`. Polls `dap-cli sessions` until at least one entry has
  `parent_session_id === parentId`, then asserts `dap.threads` is non-empty.
  Reuses the existing `DAP_CLI_RUN_BROWSER_SMOKES=1` opt-in gate.

## Notable design decisions

1. **Thread-id remapping uses a unique numeric counter** (not parent-prefixed
   composite ids). Keeps DAP `Thread.id` numeric per the spec. Mapping is
   cached per child so reverse-routing is O(1).
2. **`setBreakpoints` replay timing** is **after** configurationDone — js-debug
   tolerates this and it keeps the child lifecycle close to the canonical
   sequence. Cached future breakpoints are stored on the coordinator so
   children that come up later still get them.
3. **ANY-verified-wins** when aggregating `setBreakpoints` across children:
   the parent surfaces "verified" if any child has a real binding, which is
   what the user wants to see.
4. **Strictly serialized startDebugging handling** is required because Map
   insertion order drives `threads` aggregation order — running handlers
   concurrently produced flaky test ordering.
5. **`requestPromise.catch(() => undefined)`** is applied immediately after
   creating the child's attach/launch request promise, before any other
   `await`. Without this, Node could surface the rejection as
   `unhandledRejection` in the microtask window between issuing the request
   and the `await requestPromise` further down.
6. **`awaitPendingChildren()`** yields once before checking the queue, then
   loops draining `activeHandlers` and `bringUps` until both are empty. This
   makes test-driven verification deterministic by waiting for both the
   reverse-request handler to be scheduled AND the bring-up to finish.

## Verification

- `npx tsc --noEmit` — clean.
- `npm run build` — clean.
- `npm test` — 132 pass, 4 skipped, 0 regressions.
- `npm test -- tests/controller/sessionManager.test.ts` — 24/24 (5 from 05-03
  + 12 new `ChildSessionCoordinator` tests + 7 pre-existing).
- New `pwa-chrome` controller smoke is gated behind
  `DAP_CLI_RUN_BROWSER_SMOKES=1` and runs only with real Chromium present.

## Self-Check: PASSED

- All four "must_haves.truths" from the plan are realized in code.
- `grep -n 'startDebugging\|registerChild\|listChildren' src/controller/server.ts`
  shows the new wiring (`children.attach()`, `children?.maybeIntercept(...)`,
  `children.registerInitialBreakpoints(...)`).
