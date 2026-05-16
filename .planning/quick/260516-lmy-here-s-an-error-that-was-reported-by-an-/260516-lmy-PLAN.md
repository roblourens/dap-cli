---
quick_id: 260516-lmy
slug: here-s-an-error-that-was-reported-by-an-
created: 2026-05-16
status: planned
---

# Make `stop` disconnect requests safe for js-debug

## Description

An agent reported this adapter-side failure while stopping a session:

`TypeError: Cannot read properties of undefined (reading 'terminateDebuggee') at Rg._disconnectRoot (.../js-debug/src/dapDebugServer.js:100:7958)`

The controller already documents the same js-debug disconnect race on the stronger
`close` teardown path, where it intentionally sends a shaped DAP body:
`{ terminateDebuggee: true }`. The regular session `stop` and `detach` path still flows
through `ControllerServer.disconnectRuntimeForTarget`, which calls zero-arg
`runtime.lifecycle.disconnect()`. That leaves js-debug receiving an undefined
disconnect argument object and matches the reported stack.

This quick task should make the ordinary stop-session path explicit and regression-tested
without broadening the existing `close`, `cleanup --purge`, or controller-shutdown
termination policy.

## Tasks

### Task 1: Lock the stop/detach disconnect contract with focused tests

**Files**

- `tests/controller/sessionManager.test.ts`
- `tests/integration/fakeAdapterCli.test.ts`

**Action**

Add regression coverage around the live-runtime stop path before changing production code.
At controller level, exercise `sessions.stop` and/or `sessions.detach` against the existing
stdio fake-adapter runtime so the test proves the DAP `disconnect` request includes an
object body instead of undefined args. Keep the asserted boolean semantics intentional:
`stop` should preserve stop/termination intent, while `detach` must not accidentally become
debuggee-killing teardown. At CLI level, cover `dap-cli stop --name <session>` returning a
successful envelope after the shaped disconnect path so the user-facing command that
reported the issue stays covered.

Do not rewrite the existing `sessions.close` orphan-process tests; those protect a separate
`terminateRuntime(..., { terminateDebuggee: true })` contract and should remain the proof for
full teardown.

**Verify**

- `npx vitest run tests/controller/sessionManager.test.ts tests/integration/fakeAdapterCli.test.ts`

**Done**

- Focused tests fail on the current zero-arg runtime disconnect behavior or otherwise encode
  the missing disconnect-body invariant directly.
- The tests distinguish lightweight stop/detach disconnect behavior from the existing close
  teardown behavior.

### Task 2: Send explicit disconnect args from the shared stop/detach runtime helper

**Files**

- `src/controller/server.ts`
- `tests/controller/sessionManager.test.ts`
- `tests/integration/fakeAdapterCli.test.ts`

**Action**

Update `ControllerServer.disconnectRuntimeForTarget` so live `sessions.stop` and
`sessions.detach` disconnects no longer call `DapLifecycleController.disconnect()` with no
arguments. Pass an explicit disconnect option object aligned with the route's intended
semantics, so js-debug can safely read `terminateDebuggee` without an undefined argument
object. Keep the heavier `terminateRuntime` path unchanged: `close`, `cleanup --purge`, and
controller shutdown already own adapter signaling, orphan PID reporting, and
`terminateDebuggee: true` teardown.

If the helper needs the route intent as an argument, thread that intent from the two existing
call sites rather than inferring it from session state. Avoid adapter-specific branching; the
controller should emit a valid generic DAP disconnect payload, not special-case js-debug.

**Verify**

- `npx vitest run tests/controller/sessionManager.test.ts tests/integration/fakeAdapterCli.test.ts`
- `npm run typecheck`

**Done**

- `dap-cli stop --name <session>` and the controller `sessions.stop` route send a shaped DAP
  disconnect payload that prevents the reported js-debug undefined-args crash pattern.
- `sessions.detach` keeps non-terminating semantics while also avoiding an undefined
  disconnect payload.
- Existing `close` teardown expectations remain intact and the focused controller/CLI test
  set plus typecheck pass.

## Files

- `src/controller/server.ts`
- `tests/controller/sessionManager.test.ts`
- `tests/integration/fakeAdapterCli.test.ts`

## Verification

- `npx vitest run tests/controller/sessionManager.test.ts tests/integration/fakeAdapterCli.test.ts`
- `npm run typecheck`

## Notes

This is deliberately narrower than revisiting all session lifecycle semantics. The nearby
Phase 05 H-8 work already established the full adapter-killing close path; this quick task
addresses the distinct ordinary stop-session regression reported by the agent.