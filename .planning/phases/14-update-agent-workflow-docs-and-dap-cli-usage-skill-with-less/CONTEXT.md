# Phase 14 Context — Source: analysis.md (external agent feedback)

Added in response to feedback captured in `analysis.md` at the repo root.
This is the docs/skill counterpart to the dap-cli code changes in Phases
10–13.

## Problem (from analysis.md)

The external agent's debugging session surfaced several places where the
agent workflow docs (`docs/AGENT-WORKFLOWS.md`) and the dap-cli usage skill
(`~/.copilot/skills/dap-cli/SKILL.md`, maintained outside this repo)
either gave misleading advice or omitted recipes that would have caught
the original bug instantly.

## In scope for this phase

Update `docs/AGENT-WORKFLOWS.md` (and any in-repo skill assets) to
incorporate these recipes:

1. **launch-vs-attach decision rule.** If the resolved config has
   `request: 'attach'`, you must use `dap-cli attach --config …`, not
   `dap-cli launch --config …`. Lead with this — it's the single
   biggest footgun. (Phase 10 also fixes the underlying CLI behavior.)

2. **"Wrong process?" smoke test.** Right after `attach`, run
   `evaluate --expression "process.pid"` and verify it matches the
   inspector target's PID from `lsof -i :<port>`. One check that
   would have caught the analysis.md bug instantly.

3. **"Didn't bind?" recipe.** When a breakpoint won't verify, run
   `dap-cli dap loaded-sources` first; an empty result means the
   debuggee has no JS modules loaded yet (or you're attached to the
   wrong process). (Phase 12 also surfaces this from the error text.)

4. **Stop detection via `events --after-cursor`, not `status`.** The
   current "poll status and events" wording is wrong — only events
   reliably reflects stop state. (Phase 11 may also fix `status` to
   project paused state; update the doc to match whichever resolution
   ships.)

5. **Child sessions.** Promote into the standard loop: child sessions
   are not targetable; set breakpoints on the parent session name; child
   sessions still emit stops to the parent's event stream.

6. **Drop the `--no-human` workaround** once Phase 13 ships
   auto-JSON-when-not-TTY. Until then, recommend `unset DAP_CLI_HUMAN`
   at the top of an agent shell rather than threading `--no-human`
   through every command.

7. **`evaluate --frame-id` canonical recipe.** Show the
   `threads → stack → evaluate` triplet as the default inspect
   pattern (until Phase 11's auto-frame ships, after which the
   doc collapses to just `evaluate`).

## Out of scope

- Changing the dap-cli code (those changes are in Phases 10–13).
- Editing the user-level `~/.copilot/skills/dap-cli/SKILL.md` directly
  from this phase — that file lives outside the repo. We can mirror the
  guidance here and link from the user-level skill, or note the
  divergence in `docs/AGENT-WORKFLOWS.md`.
