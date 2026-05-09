# Phase 11 Context — Source: analysis.md (external agent feedback)

Added in response to feedback captured in `analysis.md` at the repo root.

## Problem (from analysis.md)

Two paused-state ergonomics bugs an external agent hit while debugging Code
OSS through dap-cli:

1. **`dap-cli status` does not reflect the most recent stopped/continued
   event.** The agent's polling loop never observed `status: stopped` even
   though `events --limit 200` clearly contained
   `{event: stopped, reason: breakpoint, …}`. The current SKILL.md tells
   agents to "poll `status` and `events`" as if either works for stop
   detection — only events does.

2. **`dap-cli evaluate` requires `--frame-id` for proper scope.** Without it,
   evaluation runs in some global REPL context where in-frame variables are
   `undefined` (and worse, certain expressions like `process.pid` *do*
   succeed in that global context, masking that you're in the wrong scope).
   Today every inspect requires `threads → stack → grab frameId → evaluate`,
   which is friction every single time.

## In scope for this phase

1. **`status` reflects stop state.** Either:
   - update the projected status to incorporate the most recent
     `stopped`/`continued` event from the cache, OR
   - explicitly remove "poll status for stop detection" from the docs and
     surface a top-level `paused`/`pausedThreads` projection that *does*
     track stops, so polling loops have a single source of truth.

2. **`evaluate` defaults `--frame-id` to the topmost frame of the stopped
   thread when the session is paused** and `--frame-id` is omitted. If the
   session is not paused, behavior is unchanged. If multiple threads are
   paused, prefer the most recently stopped, and emit a stderr hint if the
   selection is ambiguous.

## Out of scope

- Auto-pausing on attach. Auto-frame is purely about when the session is
  *already* paused.
- Changing the event cache contract.
