# Phase 18 — Context

## Origin

Surfaced during Phase 17 / Scenario S-02 (Catch an extension activating).
The subagent set a `.ts`-source breakpoint on the parent, js-debug
correctly replayed it onto a child (the actual extension-host Node
process), the breakpoint resolved (`breakpoint.changed verified=true`),
the program hit it, and the `stopped` event arrived at the parent's
event stream annotated with `child_session_id`. But:

- `dap-cli status --name s02` reported `paused: false`.
- `dap-cli sessions --show-children` reported every child `paused: false`.
- `dap-cli stack --name s02` returned `thread_not_paused`.

So the subagent could *see* the stop in `events --include stopped` but
could not acquire stack frames, scopes, or evaluate anything against
the paused program. S-02's success criteria (top frame name + evaluate
`extensionDescription.identifier.value`) were unreachable.

## Initial misread (and correction)

My first pass on this assumed dap-cli had no infrastructure for
mirroring child stops onto the parent and proposed building a "compact
child fold-in" model with virtual thread ids, reading `compact` /
`lifecycleManagedByParent` flags off the `startDebugging` reverse
request, and rewriting event ids.

Then I read the controller code. The infrastructure already exists:

- `ChildSessionCoordinator.mirrorChildEvent` annotates every child
  event with `body.child_session_id` (Phase 15-01).
- A separate handler on each child client calls
  `manager.updatePausedState(parent, derivePausedStateFromStopped(event.body))`
  on `stopped`, and `paused: false` on `continued` / `terminated`.
- `aggregateThreads()` returns the union of every child's threads with
  a `sessionName` discriminator.
- `routeByThreadId` routes thread-bearing commands by REAL child
  thread id (no remap) via `findChildOwningThread`.

So the mental model dap-cli already implements is the right one. The
S-02 failure has **two narrower bugs** in that infrastructure, not a
missing model.

## Root cause

**Bug A — parent paused-state is "last child event wins", not "union of
children's paused state".**

The mirror handler overwrites the parent's full paused-state record on
every child event:

```ts
client.onEvent(event => {
  if (event.event === 'stopped') {
    void manager.updatePausedState(parent, derivePausedStateFromStopped(event.body));
  } else if (event.event === 'continued' || event.event === 'terminated') {
    void manager.updatePausedState(parent, { paused: false });
  }
});
```

In a real js-debug attach (S-02's `--inspect-extensions` is one example;
pwa-chrome multi-child is another), the parent has multiple children:

- A bootloader / wrapper child that runs briefly and emits
  `terminated` after handing off.
- The actual target child(ren) that emit `stopped` when bps fire.

Order observed in S-02: ext-host child emits `stopped` → parent flips
to `paused: true`. Bootloader child emits `terminated` shortly after →
parent flips back to `paused: false`. Net: by the time the agent polls
`status`, the bootloader's `terminated` has clobbered the ext-host
child's `stopped`.

Symmetric case: child A stops (parent.stoppedThreadIds = `[5]`), then
child B stops on a different thread (parent.stoppedThreadIds = `[10]`,
last write wins). Child A's stop is lost from the parent's view.

**Bug B — `findChildOwningThread` picks the first child whose thread
cache claims the id, regardless of whether that child is currently
paused.**

When the agent runs `dap-cli stack --name s02 --thread-id 0` after the
ext-host child stops on thread 0, both the bootloader (still in
`this.children`, never removed on `terminated`) and the ext-host child
have thread 0 in their `knownThreadIds`. Map iteration order picks the
bootloader first. The request goes to a child that isn't paused; the
adapter returns "not paused"; `normalizeChildRequestError` translates
that to `thread_not_paused`.

The terminated child also still appears in `aggregateThreads`'s output
and in error payloads' `availableThreads`, polluting the
`status.stoppedThreadIds` auto-resolve from Phase 17 (multiple
candidates → ambiguous → `thread_id_required`).

## Fix

Two coupled changes inside `ChildSessionCoordinator`. No new external
concept (no compact-fold, no virtual ids, no flag reads). The skill's
existing promise — "parent's `status.paused` mirrors child stops" —
becomes actually true.

### 1. Per-child stoppedThreadIds + parent-as-union

Each `ChildRuntime` gains:

```ts
stoppedThreadIds: Set<number>;   // realThreadIds currently stopped on this child
allThreadsStopped: boolean;       // true after a stopped event with allThreadsStopped: true
lifecycleEnded: boolean;          // true after a terminated/exited event
```

Update on child events:

- `stopped { threadId, allThreadsStopped }`:
  - if `allThreadsStopped: true`, set `allThreadsStopped = true` and
    add every id from this child's `knownThreadIds` to
    `stoppedThreadIds`.
  - else add the specific `threadId` to `stoppedThreadIds`.
- `continued { threadId, allThreadsContinued }`:
  - if `allThreadsContinued: true` (or `threadId` absent), clear
    `stoppedThreadIds` and `allThreadsStopped`.
  - else delete the specific `threadId`.
- `thread { reason: 'exited', threadId }`: delete from
  `stoppedThreadIds` and `knownThreadIds`.
- `terminated` / `exited`: set `lifecycleEnded = true`, clear
  `stoppedThreadIds`, do NOT remove the child from `this.children`
  yet (we still need it for late-arriving inspection — but we exclude
  it from `findChildOwningThread` candidates).

Recompute parent paused state as the **union** of every non-terminated
child's `stoppedThreadIds`:

- If any non-terminated child has a non-empty `stoppedThreadIds`,
  parent is `paused: true` with `stoppedThreadIds = union(...)` and
  `stoppedReason` = the most recent stopping child's reason (the existing
  derivation; we just gate it through the union check).
- Otherwise `paused: false`.

The mirror handler stops calling `updatePausedState` directly. It
records into the per-child set, then triggers the union recompute.

### 2. Paused-first routing

`findChildOwningThread(threadId)` becomes a two-pass lookup:

1. **Pass 1 (preferred):** return the first child where
   `lifecycleEnded === false && (stoppedThreadIds.has(threadId) ||
   (allThreadsStopped && knownThreadIds.has(threadId)))`.
2. **Pass 2 (fallback, current behavior):** return the first child
   where `lifecycleEnded === false && knownThreadIds.has(threadId)`.
3. **Pass 3 (cold path):** the existing live `threads`-fanout, but
   only against non-terminated children.

`aggregateThreads()` filters out terminated children too — those
threads should not appear in the parent's `threads` response and
should not pollute Phase 17's auto-resolve.

`listAvailableThreads` (used by error payloads) also filters
terminated children, so an agent that sees an ambiguity error gets a
clean candidate list.

## What NOT to change

- The `compact` / `lifecycleManagedByParent` flags on the
  `startDebugging` reverse request: we don't need them. The mirror
  already happens for every child today. Bug A is not "we don't know
  whether to mirror"; it's "the mirror is too eager".
- Virtual thread id space: real child thread ids stay end-to-end. They
  already do. Phase 17's auto-resolve composes naturally.
- The `child_session_not_targetable` contract for `events --name <child>`
  from Phase 15-02: untouched.
- Breakpoint replay / fanout: untouched (Phase 15-01 owns that).
- The CLI surface: no new flags, no renames. `--name <parent>` keeps
  doing the same thing, just correctly.

## Concrete invariants the fix must preserve / establish

Establish:

- `status --name <parent>` reports `paused: true` whenever any
  non-terminated child has any thread stopped.
- `status --name <parent>` reports `paused: false` only when every
  non-terminated child has every thread running.
- A bootloader child terminating after a real child stops does NOT
  flip the parent back to `paused: false`.
- `stack --name <parent> --thread-id <id>` (and the rest of
  `routeByThreadId`'s commands) routes to the child that is actually
  stopped on `<id>`, even when an earlier child also has `<id>` in
  its thread cache.
- `stack --name <parent>` (no `--thread-id`, Phase 17 auto-resolve)
  picks the unique stopped thread across the union — terminated
  children's stale ids do not interfere.
- `aggregateThreads` and error-payload candidate lists exclude
  terminated children.

Preserve:

- Phase 15-01 mirror annotation (`body.child_session_id`).
- Phase 15-02 `child_session_not_targetable` contract.
- Phase 17 `--thread-id` auto-resolve.
- `--frame-id` / `--variables-reference` routing (independent of
  thread routing; no change).
- Single-child case behavior (no regression — the union of one set is
  that set).

## Risk + open questions

- **Capabilities for `allThreadsStopped` / `allThreadsContinued`.**
  Both are optional in DAP and many adapters omit them. We treat
  absence as "false" and rely on the explicit `threadId` field. A
  child that emits `stopped` with neither field is treated as having
  no specific thread paused; we add nothing to `stoppedThreadIds` but
  still record a `lastStoppedReason` so the parent's `stoppedReason`
  has something to surface. (This is a degraded mode; in practice
  js-debug always sends `threadId`.)
- **Terminated children that re-emit a `stopped`.** Should not
  happen, but if it does, we resurrect (`lifecycleEnded = false`).
  Cheap and avoids a confusing "ghost-stopped" state.
- **`exited` event vs `terminated` event.** `exited` is per-thread
  (an exit code), `terminated` is whole-session. Bug A's specific
  failure mode is `terminated` from the bootloader. Both should mark
  `lifecycleEnded` for the child session as a whole.
- **Disconnect / process exit cleanup.** The existing
  `markChildFailed` already exists for hard failures; we add a
  parallel `markChildLifecycleEnded` for graceful termination, both
  of which set `lifecycleEnded = true`. We don't `this.children.delete`
  on terminate today; we stop doing routing through them but keep
  them addressable for diagnostics.
- **Thread-event ordering vs stopped-event ordering.** A child can
  emit `thread { reason: 'started', threadId: 1 }` after `stopped {
  threadId: 1, allThreadsStopped: true }`. Today's behavior: thread
  event adds 1 to `knownThreadIds`. With per-child stoppedThreadIds:
  the stopped event already added 1 to `stoppedThreadIds`; thread
  event has no additional effect. Fine.

## Files in scope

Primary:
- `src/controller/childSessions.ts` — extend `ChildRuntime`, replace
  the mirror-side `updatePausedState` calls with per-child state
  bookkeeping + a parent-union recompute, paused-first routing in
  `findChildOwningThread`, terminated-filter on `aggregateThreads` /
  `listAvailableThreads`.
- `src/controller/pausedState.ts` — add a small helper to combine
  multiple per-child paused states into a single parent paused-state
  shape. Keep `derivePausedStateFromStopped` for the existing direct
  parent-event path (debugpy / fake adapter).

Tests:
- `tests/controller/childSessions.test.ts` — new `describe` block for
  multi-child paused-state union + paused-first routing. Existing
  H-1a/H-1b single-child mirror tests keep passing unchanged.
- `tests/fixtures/fake-adapter-entry.ts` — new fake script
  `multi-child-stop` that brings up two children, has the bootloader
  emit `terminated` *after* the real child emits `stopped`, and
  answers child threads / stackTrace / continue requests.
- `tests/integration/fakeAdapterCli.test.ts` — end-to-end test driving
  the multi-child-stop script through the controller and asserting
  parent `status` reports paused, parent `stack` (no `--thread-id`,
  exercising Phase 17 auto-resolve) returns the real child's frame,
  parent `continue` resumes the child.

Docs:
- `docs/AGENT-WORKFLOWS.md` — the multi-process js-debug section's
  "parent mirrors child stops" claim becomes a guarantee instead of a
  hedged promise; add a one-paragraph explanation that dap-cli routes
  thread-bearing commands to the child that's actually paused.
- `skills/dap-cli/SKILL.md` (in-repo plugin) — same: drop any hedge
  language about parent paused-state being unreliable in multi-child.
- `skills/dap-cli/references/javascript-typescript.md` — note that
  pwa-node multi-process attaches (including `--inspect-extensions` /
  Electron sub-Node helpers) and pwa-chrome multi-child attaches
  reliably surface stops on the parent.
- `README.md` — only if it carries the same recipe at this granularity.

## Predecessors

- Phase 15-01: child event mirroring with `child_session_id` annotation —
  provides the substrate.
- Phase 15-02: `child_session_not_targetable` for direct child
  addressing — preserved.
- Phase 17: `--thread-id` auto-resolve from `status.stoppedThreadIds` —
  composes once the parent union is correct.
