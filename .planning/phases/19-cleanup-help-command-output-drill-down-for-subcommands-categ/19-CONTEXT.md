# Phase 19: Help command cleanup — Context

**Gathered:** 2026-05-11
**Status:** Ready for planning
**Source:** Direct user request (no discuss-phase)

<domain>
## Phase Boundary

Cleanup pass on the `dap-cli help` UX. No new commands, no behavioral changes
to debug session functionality. Three concrete user-reported papercuts:

1. Bogus `{"ok":false,"error":{...,"message":"(outputHelp)"}}` JSON envelope
   printed at the bottom of every help invocation.
2. `dap-cli help <cmd> <subcmd>` (e.g. `dap-cli help breakpoints set`) does
   not drill down — it prints the parent's help instead of the subcommand's.
   `dap-cli <cmd> <subcmd> -h` already works; `help` should match.
3. Top-level `dap-cli help` is a long flat list. Group commands into a small
   number of readable categories.

</domain>

<decisions>
## Implementation Decisions

### D-01 — Suppress the spurious help envelope (HELP-01)
`dap-cli help` and `dap-cli help <cmd>` MUST exit 0 and emit ZERO JSON
envelopes on stdout/stderr in any output mode (default, `--human`,
`--no-human`, non-TTY pipe). Root cause is `isCommanderHelp()` in
`src/cli/main.ts` only matching `commander.helpDisplayed`; commander v14's
explicit `help` subcommand throws with `code: 'commander.help'` and
`exitCode: 0`. Fix the predicate to also treat `commander.help` as a
successful help dispatch (and any CommanderError with `exitCode === 0`,
defensively).

### D-02 — `dap-cli help <cmd> [subcmd...]` drills down (HELP-02)
`dap-cli help breakpoints set` MUST print the help for `breakpoints set`,
not for `breakpoints`. Generalize: `help` accepts a variadic command path
and walks the subcommand tree, returning the deepest match's help. Unknown
path → print parent help and exit non-zero with a usage error envelope
naming the unknown segment. Keep `dap-cli <path...> -h` behavior unchanged.

### D-03 — Categorize the top-level command list (HELP-03)
Group top-level commands using commander v14's `helpGroup()` so
`dap-cli help` (and `dap-cli --help`) renders categorized headings instead
of a flat `Commands:` list. Categories (locked):

| Category heading | Commands |
|---|---|
| Controller lifecycle | `start`, `status`, `stop`, `stop-controller` |
| Sessions | `sessions`, `use`, `detach`, `close`, `cleanup` |
| Launch & attach | `launch`, `attach` |
| Breakpoints | `breakpoints` |
| Paused-state inspection | `threads`, `stack`, `scopes`, `variables`, `source`, `evaluate` |
| Execution control | `continue`, `pause`, `next`, `step-in`, `step-out` |
| DAP protocol escape hatches | `dap`, `request`, `capabilities`, `events` |

Hidden commands (`serve-controller`) stay hidden. The `help` command itself
stays in commander's default position.

### the agent's Discretion
- Exact category-heading rendering (whitespace, separators) — match commander
  v14's `helpGroup` defaults; do not write a custom Help class unless
  helpGroup output is unacceptable.
- How drill-down is implemented (override `program.helpCommand(...)` vs.
  custom `program.command('help')` handler) — pick whichever requires the
  least surface area and keeps `-h` semantics intact.

</decisions>

<canonical_refs>
## Canonical References

### Source under test
- `src/cli/main.ts` — `isCommanderHelp` predicate (root cause of D-01)
- `src/cli/program.ts` — `createProgram`, top-level `addHelpText`
- `src/cli/commands/controller.ts` — start/status/stop/stop-controller
- `src/cli/commands/sessions.ts` — sessions/use/detach/close/cleanup
- `src/cli/commands/dapCore.ts` — launch/attach/request/capabilities/events
- `src/cli/commands/dapAliases.ts` — breakpoints + paused-state + execution
- `src/cli/commands/dapGenerated.ts` — `dap` escape hatch

### External
- commander v14 `helpGroup()` — https://github.com/tj/commander.js#help-groups

</canonical_refs>

<specifics>
## Specific Reproductions

```text
$ dap-cli help
… (long flat list) …
{"ok":false,"error":{"code":"usage_error","category":"usage",
 "message":"(outputHelp)","exitCode":2,
 "diagnostics":["(outputHelp)"]},"meta":{"command":"help",…}}
$ echo $?  # currently nonzero — should be 0 with no envelope

$ dap-cli help breakpoints set
Usage: dap-cli breakpoints [options] [command]   # WRONG — should be `breakpoints set`
…
{"ok":false,"error":{"code":"usage_error","message":"(outputHelp)",…}}

$ dap-cli breakpoints set -h   # already correct — preserve
Usage: dap-cli breakpoints set [options]
…
```

</specifics>

<deferred>
## Deferred Ideas

- Rewriting the help output via a custom `Help` subclass for prettier
  formatting / colors. Not required; revisit only if `helpGroup()` output
  is materially worse than today's flat list.
- Reordering / renaming commands themselves. Out of scope — categorization
  only.

</deferred>

---

*Phase: 19-cleanup-help-command-output-drill-down-for-subcommands-categ*
*Context gathered: 2026-05-11*
