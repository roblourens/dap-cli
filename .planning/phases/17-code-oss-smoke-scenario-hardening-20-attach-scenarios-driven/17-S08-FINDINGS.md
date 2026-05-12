---
phase: 17
status: investigated
scenario: S-08
related_commit: a6562ce
---

# Phase 17 — S-08 dap-cli bug investigation

S-08 surfaced two distinct dap-cli behaviors that combined into "agent attaches to agent host but cannot pause or set breakpoints." Both are reproducible. This note locates the code, explains the failure mode, and proposes a minimal fix for each. No code changes landed in this commit — fixes need explicit sign-off because they touch core routing.

## Bug 1 — `breakpoints set` hangs to `controller_request_timeout` on a single-child js-debug attach

### Symptom

Against a `pwa-node` attach to the Code OSS agent-host utility process (`--inspect-agenthost=5878`, with `chat.agentHost.enabled: true`):

- `dap-cli pause`, `dap-cli status`, `dap-cli sessions --show-children`, `dap-cli stack` all respond in <1s.
- `dap-cli breakpoints set --source agentService.ts --line 100` hangs the controller IPC and exits 7 with `controller_request_timeout`. Diagnostic ("Check whether the controller process is still healthy") is misleading — the controller is fine.

### Root cause

For js-debug, `setBreakpoints` always routes through `ChildSessionCoordinator.routeSetBreakpointsThroughParent` ([src/controller/childSessions.ts L780-L800](src/controller/childSessions.ts#L780-L800)). That path:

1. Awaits `awaitPendingChildren()` (bounded by reverse-request handler chain).
2. Then awaits `Promise.allSettled([...children].map(c => c.readyPromise))` ([childSessions.ts L796-L800](src/controller/childSessions.ts#L796-L800)).

`readyPromise` is resolved by `runChildLifecycle` ([childSessions.ts L502-L520](src/controller/childSessions.ts#L502-L520)) only after the child completes its full handshake: `initialize → initialized → setBreakpoints replay → configurationDone → launch/attach response → lifecycle 'running'`. It rejects only via `markChildFailed`.

For a js-debug attach against an Electron utility process whose user-code target is not actively running scripts (e.g. agent host idle), the child's `configurationDone` round-trip can hang indefinitely on the adapter side. `readyPromise` therefore never settles. `Promise.allSettled` will sit on a never-settling promise forever. The 5s controller IPC timeout fires first and the agent sees `controller_request_timeout`.

`fanOutSetBreakpoints` ([childSessions.ts L621-L626](src/controller/childSessions.ts#L621-L626)) for non-js-debug adapters has the identical structure (`awaitChildrenReady` → `await Promise.allSettled([...].readyPromise)`) — same hazard.

### Proposed fix

Add an `awaitChildrenReadyTimeoutMs` option to `ChildSessionCoordinatorOptions` (default ~3000ms — under the 5s controller IPC budget, with headroom for the post-readiness verification step). Bound the `Promise.allSettled([...].readyPromise)` call with that timeout; on timeout, proceed with whatever children are ready and surface a `warnings: [{ sessionId, message: 'child_readiness_timeout' }]` entry per still-pending child on the response. The bp_set request still completes and the agent gets actionable diagnostics.

This is symmetric with the existing `setBreakpointsVerificationTimeoutMs` (default 3500ms) — both bound a per-step wait so the controller IPC always responds.

Risk: changes the success criterion for js-debug bp_set when children are slow to handshake. A child that was about to complete in 3.001s would now be reported as `child_readiness_timeout` instead of being awaited. Test coverage in `tests/controller/childSessions.test.ts` would need to assert the new timeout shape; existing tests use 50ms verification timeouts so they're not affected by a 3s readiness ceiling.

## Bug 2 — `pause` returns `ok: true` but no `stopped` event ever arrives

### Symptom

On the same attach (without `-brk`, agent host bootstrapped and idle):

- `dap-cli pause --thread-id 0` returns `success: true` immediately.
- `dap-cli stack` returns `thread_not_paused` indefinitely.
- js-debug trace shows `cdp.send Debugger.pause` going out **with no CDP `sessionId`**, so it lands on the bootloader root target instead of the user-code child target. No `Debugger.paused` event ever fires.

### Root cause

Two layers contribute:

1. **dap-cli routing.** `pause` is in `ROUTABLE_COMMANDS` ([childSessions.ts L96-L114](src/controller/childSessions.ts#L96-L114)) and dispatched through `routeByThreadId('pause', args, false)` ([childSessions.ts L240-L242](src/controller/childSessions.ts#L240-L242)). `routeByThreadId` consults each child's `knownThreadIds` (populated from `threads` events / responses) to find which child owns the requested thread id. When no child claims `threadId: 0`, the request falls back to the parent client. The parent in this scenario is the js-debug bootloader root, so the request is sent to the wrong target.

2. **agent inputs.** `dap-cli pause` (auto-resolve, no explicit `--thread-id`) calls `resolveThreadId(threadFilter: 'any')` ([dapAliases.ts L379-L408](src/cli/commands/dapAliases.ts#L379-L408)), which calls `dap.request command: 'threads'`. That's intercepted by `aggregateThreads` ([childSessions.ts L580-L605](src/controller/childSessions.ts#L580-L605)), which asks every non-terminated child for its threads list. If the bootloader child reports `[{id:0, name:'<bootloader>'}]` and the user-code child reports nothing yet (because it hasn't been queried), auto-resolve picks `0` as "the unique thread."

The cascading failure: agent calls `pause` → auto-resolve picks bootloader's thread 0 → routed to bootloader root → js-debug sends `Debugger.pause` to bootloader CDP target → bootloader has nothing user-pauseable, so no `stopped` event → agent has no signal that the request silently misfired.

### Proposed fix

Two changes, neither risk-free:

a) **Surface "no stopped event after Ns" as a warning on `pause` responses.** After `pause` returns `success:true`, the controller could await the next `stopped` event for the targeted thread/session for ~2s and, on timeout, return `ok: true` with `meta.warnings: ['pause acknowledged but no stopped event arrived; the targeted child may not have user-pauseable code']`. The DAP success contract is preserved (the request *was* acknowledged); the agent gets actionable diagnostics. Implementation: add a per-route `awaitStopped` hook in `routeByThreadId` for `pause`-style commands.

b) **Auto-resolve should prefer threads in non-bootloader children.** `aggregateThreads` could annotate threads with the parent's adapter target type so `resolveThreadId('any')` can deprioritize "bootloader root" threads. This is more invasive and adapter-specific (only js-debug pwa-node has this concept), so (a) is the recommended starting point.

Risk: (a) adds a 2s wait to every `pause` request, which slows down the happy path. Mitigations: only emit the warning when the wait times out (don't add the wait to the success path — race the response against the wait); or gate the wait to js-debug attach sessions.

## Severity

Both bugs are **non-blocking** (other scenarios in this sweep work as documented). Neither is a security or data-loss issue. Both make agent debugging of utility-process attach scenarios significantly harder than necessary, and both surface as opaque failures (timeout, silence) rather than actionable diagnostics — which is the worst failure mode for an agent CLI.

## Recommendation

Land Bug 1's fix first (narrower scope, clearer risk envelope). Defer Bug 2 pending a discussion of the auto-resolve policy across adapters.
