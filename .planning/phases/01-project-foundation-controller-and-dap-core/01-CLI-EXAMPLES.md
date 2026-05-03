# Phase 1 CLI Examples and Direction

## Purpose

This file captures the command shape dap-cli should converge on while implementing Phase 1 and preparing Phase 2. It is a UX contract for planning and tests, not a full v1 reference manual.

The CLI should take inspiration from Playwright's command shape: short top-level verbs, concrete positional inputs where they are natural, and options for disambiguation. Avoid deeply nested service nouns such as `dap-cli controller start` for the common path.

## Command Shape Principles

- Use top-level verbs for common workflows: `start`, `launch`, `attach`, `status`, `events`, `breakpoints`, `stack`, `scopes`, `variables`, `continue`, `stop`, `close`, `cleanup`.
- Keep controller mechanics mostly implicit. `dap-cli start` starts or reuses the local controller; commands that require the controller may start it when that is safe and deterministic.
- Let `launch` and `attach` create debug sessions. They return a stable `sessionId`, may accept `--name`, and set the new session as active by default unless `--no-use` is passed.
- Every session-aware command accepts `--name <session-name>` for disambiguation. If omitted, use the active session. This mirrors Playwright's `--project` style: a short named option disambiguates concurrent work.
- Support `dap-cli use <id-or-name>` as a convenience to set the active session for subsequent commands.
- Keep Phase 1's fake adapter command path generic and explicitly experimental. Do not expose JavaScript/Python adapter UX until Phase 3.
- Keep Phase 2 inspection commands ergonomic, even though they map to DAP requests internally.

## Phase 1 Representative Flow

```sh
# Start or reuse the local controller.
dap-cli start

# Launch a deterministic fake adapter session for Phase 1 lifecycle proof.
dap-cli launch --adapter fake --script stopped-on-entry --name demo

# Inspect controller/session state through the active session.
dap-cli status
dap-cli sessions

dap-cli events --limit 20

# Send one internal DAP request while Phase 2 generated commands are not built yet.
dap-cli request threads --json '{}'

# Disambiguate when multiple sessions exist.
dap-cli attach --adapter fake --script attach-stopped --name worker
dap-cli sessions
dap-cli status --name demo
dap-cli use worker
dap-cli status

# Clean up.
dap-cli stop --name demo
dap-cli close --name demo
dap-cli cleanup
```

## Phase 2 Debugging Flow Preview

These commands should drive Phase 2 planning and command-generation UX. Phase 1 should not implement the full inspection surface, but should avoid choices that make this shape hard.

```sh
# Launch a real adapter session once adapter descriptors exist.
dap-cli launch --adapter js --name web -- npm run dev

# Set a source breakpoint. Positional file:line should be the common path.
dap-cli breakpoints add src/server.ts:42 src/worker.ts:18

# Pair naturally with Playwright or another automation tool in a separate terminal.
npx playwright test tests/login.spec.ts --headed

# Poll until the app is stopped, then inspect the paused state.
dap-cli status --name web
dap-cli stack --name web

dap-cli scopes --frame 0 --name web
dap-cli variables --scope locals --name web

# Continue execution after inspection.
dap-cli continue --name web
```

## Expected Semantics

| Command | What It Does |
|---------|--------------|
| `dap-cli start` | Starts or reuses the persistent local controller and returns controller metadata as JSON. |
| `dap-cli launch --adapter <id> --name <name> ...` | Creates a debug session, runs the DAP initialize plus launch lifecycle, sets the new session active by default, and returns `sessionId`, `name`, lifecycle state, capabilities, and event cursor. |
| `dap-cli attach --adapter <id> --name <name> ...` | Creates a debug session using attach lifecycle semantics where the adapter supports it. |
| `dap-cli sessions` | Lists known sessions, including `sessionId`, `name`, active marker, lifecycle/status, adapter id, and log path when known. |
| `dap-cli use <name>` | Sets the active session used by later commands that omit `--name`. |
| `dap-cli status [--name <session-name>]` | Polls current session/controller state and reports running, stopped, terminated, unavailable, or failed. |
| `dap-cli events [--name <session-name>] [--after-cursor N] [--limit N]` | Returns bounded recent cached events immediately. It never waits for future events in v1. |
| `dap-cli breakpoints add <file:line...>` | Adds one or more source breakpoints to dap-cli's stateful breakpoint set and applies the resulting set to the adapter. |
| `dap-cli breakpoints remove <file:line...>` | Removes one or more source breakpoints from dap-cli's stateful breakpoint set and applies the resulting set to the adapter. |
| `dap-cli breakpoints list` | Lists dap-cli's current breakpoint state and verified adapter breakpoint data when available. |
| `dap-cli stack [--name <session-name>] [--thread <id>]` | Returns stack frames for the stopped thread, defaulting to the stopped thread from the latest stopped event. |
| `dap-cli scopes --frame <id-or-index> [--name <session-name>]` | Returns scopes for a stack frame. |
| `dap-cli variables --scope <name> [--name <session-name>]` | Returns variables for a named scope resolved from the selected frame. |
| `dap-cli variables --ref <variablesReference> [--name <session-name>]` | Returns variables for an explicit DAP variables reference. |
| `dap-cli request <dap-command> --json <args>` | Escape hatch/internal request path. Phase 2 should keep this, but ergonomic commands should be preferred for common workflows. |
| `dap-cli stop [--name <session-name>]` | Requests termination/stop semantics for the selected session. With no active session and no `--name`, stops the controller. |
| `dap-cli close [--name <session-name>]` | Removes closed session state after the session is terminated or disconnected. |
| `dap-cli cleanup` | Cleans stale state and owned orphaned adapter processes only when ownership metadata proves dap-cli started them. |

## Multi-Session Disambiguation

Playwright does not have the same live debug-session model. It supports concurrent work through projects, workers, shards, test filters, and report/trace paths. The closest CLI inspiration is `--project <name>`: a concise option selects which configured lane of execution a command applies to.

For dap-cli, use both stable session IDs and human names:

- `launch` and `attach` return an opaque `sess_...` id, but the common CLI selector is the human name.
- `--name <name>` assigns a user-facing alias on launch/attach and disambiguates later session-aware commands.
- `use <name>` sets the active session for command sequences where repeating `--name` is noisy.
- `sessions` shows ids, names, and the active marker so agents can recover from ambiguity deterministically.

## Breakpoint Semantics

DAP's `setBreakpoints` request replaces the complete breakpoint set for a source. dap-cli should not expose that replacement-oriented shape as the primary UX. The CLI should maintain stateful breakpoint intent and provide add/remove/list semantics:

- `breakpoints add <file:line...>` merges locations into dap-cli's desired breakpoint set.
- `breakpoints remove <file:line...>` removes locations from dap-cli's desired breakpoint set.
- `breakpoints list` shows desired breakpoints and verified adapter breakpoint data.
- Internally, dap-cli can still translate the desired state into DAP `setBreakpoints` requests per source.
