---
phase: 15-child-session-enumeration-and-event-routing-for-js-debug-pwa
plan: 01
status: complete
requirements: [CHILD-VERIFY-01]
files_modified:
  - tests/controller/childSessions.test.ts
  - tmp/phase-15-01-renderer-logpoint-repro.log
---

# Plan 15-01 — renderer logpoint output reaches parent stream

## Result

Verified end-to-end that `console`-class renderer output from a verified
logpoint reaches the parent's event cache tagged with the renderer's
`child_session_id`. **No production code change shipped** — the existing
`ChildSessionCoordinator.mirrorChildEvent` path was already correct.

### Task 1 — regression test for `mirrorChildEvent`

Added a new describe block in `tests/controller/childSessions.test.ts`:
`ChildSessionCoordinator output-event mirroring (CHILD-VERIFY-01)`, with two
tests:

1. **Positive:** A synthetic `output` event with
   `{ category: 'console', output: 'hello\n' }` emitted on a registered
   child's fake DapClient appears in the parent's `DapEventCache` snapshot
   exactly once, with `body.child_session_id` equal to the registered
   child's SessionId, and with `body.category` and `body.output` preserved
   unchanged.
2. **Negative guard:** A `DapEventCache.append(parentId, event)` call (the
   non-mirror path that pumps the parent client's own events) does NOT
   inject `child_session_id`. This pins annotation as a child-only concern
   so a future change moving annotation into `DapEventCache.append` would
   be caught.

Verified test setup mirrors the existing tests in the file — drives child
registration through the real `startDebugging` reverse-request path
(`ChildSessionCoordinator.attach()` + `parentEndpoint.emitReverseRequest('startDebugging', …)`),
no private state access.

### Task 2 — confirm or fix mirror path

Both new tests pass against current `main` without any change to
`src/controller/childSessions.ts`. The relevant production code is exactly
what the spec requires:

```typescript
private mirrorChildEvent(childId: SessionId, event: DapEventMessage): void {
  const annotated: DapEventMessage = {
    ...event,
    body: { ...((event as { body?: Record<string, unknown> }).body ?? {}), child_session_id: childId },
  };
  this.options.parentEventCache.append(this.options.parentSessionId, annotated);
  ...
}
```

- No event-name filter, no category filter.
- Additive merge — existing body fields (including `category` and `output`)
  are preserved; `child_session_id` is added.
- `client.onEvent(event => this.mirrorChildEvent(childId, event))` is wired
  inside `registerChildSession` BEFORE `client.request('initialize', …)`,
  so the early-handshake window is covered.

`npx vitest run tests/controller/childSessions.test.ts` → **25 passed**
(23 existing + 2 new).

### Task 3 — hand-driven repro against real pwa-chrome

Drove `dap-cli` against VS Code OSS at `/Users/roblou/code/vscode` per
`docs/VSCODE-CHAT-SMOKE.md`, but launched `Launch VS Code Internal` alone
(simpler than the full compound — only the renderer child is needed). Used
`CommandService.executeCommand` line 53 as the logpoint target since it
fires on every command and avoids needing Copilot auth in the chat view.

Captured run: [tmp/phase-15-01-renderer-logpoint-repro.log](../../../tmp/phase-15-01-renderer-logpoint-repro.log).

Key result lines:

```
parent session:  vsc / sess_SMEnfymXnijycYWY
renderer child:  vsc#6FC14EEF35A103BCE5D58986348398F0 / sess_WwXJttgSCnXKSQjE

logpoint set on:
  src/vs/workbench/services/commands/common/commandService.ts:53
  --log-message "phase15-renderer-hit cmd={id} ts={Date.now()}"
  → response: { verified: true, source: { path: ".../commandService.ts" }, line: 53 }

after triggering Cmd+Shift+P twice via playwright-cli:
  events --name vsc --include output --after-cursor 0
  → 5 matching events, each:
    {
      event: 'output',
      body: {
        category: 'stdout',
        output: 'phase15-renderer-hit cmd=workbench.action.showCommands ts=…',
        child_session_id: 'sess_WwXJttgSCnXKSQjE',   ← renderer child id, NOT extension host
      }
    }

cleanup --purge:
  signaledAdapter: [], orphanPids: [], failed: []   ← clean shutdown
```

#### Deviation from plan: `category` was `stdout`, not `console`

The plan's must-have truth said the captured event would have
`body.category === 'console'`. Reality: js-debug pwa-chrome emits logpoint
output with `category: 'stdout'`. This is js-debug's normal logpoint
convention — `console`-category output comes from `console.log()` calls
inside the page itself, not from logpoints set by the debugger.

This is a **documentation observation**, not a code bug. The CHILD-VERIFY-01
goal is "renderer logpoint output observable on the parent's event stream
tagged with child_session_id" — which is satisfied. Plan 15-03 will document
the behavior using the actual category js-debug emits.

Recorded in repo memory under `js-debug pwa-chrome breakpoint routing` so
future agents don't re-discover it.

## Pass conditions (per plan 15-01 Task 3)

- [x] At least one matching `output` event appeared (5 found).
- [x] `child_session_id` matches the renderer child id from
  `sessions --show-children` (NOT the extension host — there was no
  extension-host child in the single-config launch, but the only registered
  child was the renderer per the 32-hex CDP target id format).
- [x] `cleanup --purge` reported no orphan PIDs.

## Files changed

- `tests/controller/childSessions.test.ts` (+~75 lines, 1 new describe block
  with 2 tests at the end of the file).
- `tmp/phase-15-01-renderer-logpoint-repro.log` (new — captured hand-driven
  run).

No production code changed.

## Threats addressed

- **T-15-01** (Tampering on `mirrorChildEvent` body merge): pinned by the
  positive test (preserves `category`, `output`) and the negative guard
  test (the cache itself never injects `child_session_id`).
- **T-15-02** (Information Disclosure on mirrored child output): accepted
  per 05-19 design — parent IS the canonical observation point. No new
  boundary created.

## Out of scope confirmations

- `assertNotChildSession` and the 05-19 / H-3 design (children not
  directly targetable) untouched.
- Breakpoint replay / fanout in `childSessions.ts` untouched (Phase 12 /
  05-15 / 05-16 own that surface).
- No new exports or constructor parameters on `ChildSessionCoordinator`.
