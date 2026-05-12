---
phase: 19-cleanup-help-command-output-drill-down-for-subcommands-categ
plan: 01
subsystem: cli
tags: [commander, help, cli-ux, error-envelope]

requires:
  - phase: prior phases established commander v14 + JSON envelope
    provides: createProgram(), main() with isCommanderHelp predicate
provides:
  - "dap-cli help" exits 0 with no envelope
  - "dap-cli help <cmd> <subcmd>" drills into the subcommand tree
  - usage_error envelope only on unknown drill-down paths
  - subcommand help routes through main()'s configured streams
affects: [help, ux, agent-discoverability]

tech-stack:
  added: []
  patterns:
    - commander custom help command replacing built-in helpCommand(false)
    - propagating configureOutput recursively to subcommands

key-files:
  created:
    - tests/cli/helpCommand.test.ts
  modified:
    - src/cli/main.ts
    - src/cli/program.ts

key-decisions:
  - "Match BOTH commander.help and commander.helpDisplayed (plus exitCode === 0 fallback) so all help paths suppress the failure envelope"
  - "Throw a CommanderError shaped error from the variadic help action so main.ts's existing usage_error path renders the unknown-subcommand envelope; no new error type"
  - "Recursively propagate configureOutput to subcommands rather than rewriting the help action to manually plumb streams"

patterns-established:
  - "Custom variadic help walker: program.helpCommand(false) + program.command('help [command...]') with manual descent over Command.commands"
  - "Subcommand stream propagation: walk command tree after activeProgram.configureOutput so subcmd.outputHelp() routes to captured streams"

requirements-completed: [HELP-01, HELP-02]

duration: 25min
completed: 2026-05-11
---

# Phase 19 Plan 01: Help envelope cleanup + drill-down

**`dap-cli help` no longer prints a bogus `(outputHelp)` usage_error envelope, and `dap-cli help <cmd> <subcmd>` now drills into the subcommand tree.**

## Accomplishments
- D-01 / HELP-01: `isCommanderHelp` recognizes `commander.help` (the built-in `help` subcommand path) in addition to `commander.helpDisplayed` (the `-h/--help` flag path), and defensively any `CommanderError` with `exitCode === 0`. `dap-cli help`, `dap-cli help <cmd>`, and `dap-cli --help` now exit 0 with zero JSON envelopes.
- D-02 / HELP-02: Replaced commander's default `help [command]` with a variadic `help [command...]` walker that descends `Command.commands` and prints the deepest match's help. Unknown drill paths render the parent's help and throw a `CommanderError`-shaped error so main.ts emits a clean `usage_error` envelope.
- Subcommand stream routing: `main()` now propagates its `configureOutput` writers recursively to all subcommands, so `subcmd.outputHelp()` writes through the captured streams rather than `process.stdout`.
- Test infra unbreak: incidental fix for fd11038 — `require('../package.json')` only resolved from the bundled `dist/index.js` and broke 22 vitest files at import. Added a try/dist-then-fallback so source-loaded tests work too.

## Task Commits

1. **Task 1: fix isCommanderHelp predicate** — `bcdde2a` (fix)
2. **Task 2: variadic help drill-down** — `1171be1` (feat)
3. **Test infra: package.json path fallback** — `e67e9eb` (fix, incidental)
4. **Task 3: helpCommand.test.ts + subcommand stream propagation** — `619170e` (test + small main.ts fix)

## Files Created/Modified
- `src/cli/main.ts` — broaden `isCommanderHelp`; propagate `configureOutput` to subcommands
- `src/cli/program.ts` — disable built-in `help`, register variadic walker; package.json path fallback
- `tests/cli/helpCommand.test.ts` — five vitest cases covering all five acceptance behaviors

## Decisions Made
- The variadic help action throws a synthetic `CommanderError` (`code: 'commander.unknownCommand'`, `exitCode: 2`) for unknown drill paths instead of throwing `CliError` directly. This keeps the error flow funneled through main.ts's existing `isCommanderError` branch and avoids a second envelope codepath.
- The package.json path fix is intentionally a try/catch fallback rather than a rewrite (e.g. inlining the version at build time). Smallest reversal of the regression with no new build complexity.

## Deviations from Plan

### Incidental fixes outside plan scope
- **Test infra (fd11038 regression):** Plan assumed `npx vitest run tests/cli/helpCommand.test.ts` would just work. It did not — fd11038 had broken source-loaded vitest. Confirmed with the user before fixing inline (chose smallest-fix option). Commit `e67e9eb`.
- **Subcommand stream propagation:** Plan implementation of `current.outputHelp()` wrote to the real `process.stdout` because `configureOutput` was only set on `program`. Added `configureSubcommandOutputs()` in main.ts. Folded into the test commit `619170e`.

## Verification

`npm test` → 40 files passed, 488 tests pass / 7 skipped (was 22 file-load failures before the path fix).

Hand-driven smoke (built `dist/index.js`):
- `dap-cli help` → exit 0, no envelope
- `dap-cli help breakpoints` → exit 0, no envelope
- `dap-cli help breakpoints set` → exit 0, prints `Usage: dap-cli breakpoints set [options]`
- `dap-cli --help` → exit 0, no envelope (regression check)
- `dap-cli help breakpoints bogus` → exit 2, parent help on stderr, single `usage_error` envelope on stdout, `error.message` mentions `bogus`
- `dap-cli breakpoints set -h` → unchanged, still prints subcommand help
