# Phase 15 — Context

(Originally drafted as "make child sessions first-class". Rescoped after a
code audit showed most of the plumbing already exists and the original
framing contradicted the 05-19 / gap H-3 design decision.)

## Source

`analysis2.md` §2 — flagged by an external agent as the highest-impact gap
because they couldn't observe renderer logpoint output from `dap-cli`.

## Verbatim quote

> `pwa-chrome` attaches to the root browser target and then spawns **child
> sessions** for each renderer/page. I confirmed via events that the renderer
> was running as `child_session_id: sess_XauamTv1FaIRKzby`:
>
> ```
> continued | {'threadId': 1, 'allThreadsContinued': False, 'child_session_id': 'sess_XauamTv1FaIRKzby'}
> ```
>
> But:
> - `dap-cli sessions` only listed the parent `oss` session — the child wasn't
>   enumerated, so I had no way to discover its name canonically.
> - `dap-cli events --name sess_XauamTv1FaIRKzby --after-cursor 0` returned
>   `total: 0`.
> - The logpoints I set on the parent session were `verified: true`, but
>   `dap-cli events --name oss` only ever showed the extension-host stdout
>   (`[Extension Host] ...`), never any `console`-category output from the
>   renderer.

## What already ships (do not redesign)

- **Enumeration:** `dap-cli sessions --show-children` lists child sessions
  with `parent_session_id` populated. See
  [src/cli/commands/sessions.ts](../../../src/cli/commands/sessions.ts) and
  [src/cli/humanOutput.ts](../../../src/cli/humanOutput.ts) `--show-children`
  formatting.
- **Event mirroring:** `ChildSessionCoordinator.mirrorChildEvent` already
  fans every child event (including `output`) into the parent's event cache,
  annotated with `child_session_id`. See
  [src/controller/childSessions.ts](../../../src/controller/childSessions.ts)
  `mirrorChildEvent` / `installStartDebuggingHandler`.
- **Targeting policy (intentional):** plan 05-19 / gap H-3 decided child
  sessions are NOT directly targetable from public CLI commands; the parent
  owns the breakpoint registry, threads, and event stream in pwa-chrome.
  `assertNotChildSession` in
  [src/controller/server.ts](../../../src/controller/server.ts) enforces
  this with a structured error pointing back at the parent. Do not undo
  this.

## Goal restated

### CHILD-VERIFY-01 — repro renderer logpoint output end-to-end

Build a hand-driven repro against a real Chrome target (Code-OSS or any
plain pwa-chrome target) that:

1. Attaches with `dap-cli attach --type pwa-chrome` (or equivalent).
2. Sets a logpoint via `breakpoints set --log-message` on a line that we
   know fires in a renderer child.
3. Triggers the line.
4. Reads `dap-cli events --name <parent>` and asserts a `console`-category
   `output` event appears, tagged with the renderer's `child_session_id`.

If the assertion fails, fix the mirror path so it does. The most likely
failure modes to look at first:

- The renderer's `output` events not subscribed by `mirrorChildEvent`.
- The breakpoint being applied to the wrong child (extension host vs
  renderer) — in which case the fix is in the breakpoint replay/fanout, not
  the mirror.
- Output category being filtered or rewritten somewhere downstream.

The analysis itself flagged "either the breakpoints were applied to the
wrong child or the renderer's logpoint output isn't being routed" — both
are in scope.

### CHILD-ERR-01 — fix `events --name <child_session_id>` to return the structured error

Per the analysis, `events --name <child>` returned `total: 0`. Per the
05-19 design it should throw the same `not-targetable` structured error
that other commands do (with a `parent_session_id` data field telling the
caller which session to query instead). Confirm the current behavior with a
focused test and, if it really returns an empty event stream, route it
through `assertNotChildSession` (or the equivalent for events.recent /
events.list).

### CHILD-DOC-01 — document the canonical pwa-chrome workflow

Update `docs/AGENT-WORKFLOWS.md`, `README.md`, and the user-level
`~/.copilot/skills/dap-cli/SKILL.md` to spell out the only supported
workflow:

1. `dap-cli sessions --show-children` to discover child IDs.
2. `dap-cli events --name <parent>` and **filter by `child_session_id`**
   on the consumer side to read child output.
3. Do not target a child session directly — the CLI will reject it.

Today none of those docs mention `--show-children` or the filter pattern,
which is what set the analysis agent up for failure.

## Out of scope

- Making child sessions directly targetable for any command (contradicts
  05-19 / H-3).
- pwa-msedge or other Chromium variants (free if pwa-chrome works; verify
  but do not test-matrix).
- Any rework of how `breakpoints set` decides which child receives a
  breakpoint — that's covered by Phase 12 and the bp-fanout work in
  childSessions.ts.

## Related work

- Phase 5 plan 05-19 / gap H-3 (the design decision).
- Phase 8 child-session lifecycle / structured-error work.
- Phase 11 (paused-state mirroring — same plumbing layer).
- Phase 12 (breakpoint surface, including verification diagnostics).
