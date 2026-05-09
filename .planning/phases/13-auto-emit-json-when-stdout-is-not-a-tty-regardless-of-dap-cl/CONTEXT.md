# Phase 13 Context — Source: analysis.md (external agent feedback)

Added in response to feedback captured in `analysis.md` at the repo root.

## Problem (from analysis.md)

The dap-cli SKILL.md currently warns agents to pass `--no-human` defensively
in case `DAP_CLI_HUMAN=1` was inherited from the shell. The external agent
followed that warning literally and threaded `--no-human` through every
machine-parsed command in the polling loop — even when the variable wasn't
actually set. That's friction for every agent invocation.

Subsequent debugging confirmed `DAP_CLI_HUMAN` is rarely actually set; the
default output is JSON and machine parsing usually works. The real fix is
to make the human/JSON decision sensitive to whether stdout is a TTY, so
agents never need the `--no-human` workaround at all.

## In scope for this phase

1. **When stdout is not a TTY, default to JSON regardless of
   `DAP_CLI_HUMAN`.** Piped/captured stdout is by definition not a human
   reader; there is no good reason to honor a human-formatting env var
   under those conditions.

2. **Honor `DAP_CLI_HUMAN` only when both set to a truthy value AND
   stdout is a TTY.** Explicit `--human` / `--no-human` flags continue
   to override unconditionally.

3. **Drop the need for `--no-human` from agent workflows.** Phase 14
   updates the docs/skill to remove the workaround.

## Out of scope

- Redesigning the human-formatted output itself (Phase 5.1 territory).
- Removing the `DAP_CLI_HUMAN` env var; only changing when it is honored.
