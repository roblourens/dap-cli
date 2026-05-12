---
phase: 19-cleanup-help-command-output-drill-down-for-subcommands-categ
plan: 02
subsystem: cli
tags: [commander, help, helpgroup, cli-ux]

requires:
  - phase: 19-01
    provides: clean help output (no spurious envelope) + drill-down walker
provides:
  - "dap-cli help renders seven locked category headings"
  - "every public top-level command lives under its assigned heading"
  - "serve-controller stays hidden (no helpGroup added)"
affects: [help, ux, agent-discoverability]

tech-stack:
  added: []
  patterns:
    - per-command commander helpGroup() at the registration site
    - HELP_CATEGORIES test-data table pinning heading -> commands mapping

key-files:
  created: []
  modified:
    - src/cli/commands/controller.ts
    - src/cli/commands/sessions.ts
    - src/cli/commands/dapCore.ts
    - src/cli/commands/dapAliases.ts
    - src/cli/commands/dapGenerated.ts
    - tests/cli/helpCommand.test.ts

key-decisions:
  - "Strings inline at registration sites, not in a constants module — reviewers see the heading next to the command it labels"
  - "helpGroup() chained immediately after .command(...) and before .description(...) for consistent ordering"
  - "Custom 'help [command...]' walker stays in commander's default 'Commands:' section (per D-03 — help is in the default position)"

patterns-established:
  - "Test-data table: HELP_CATEGORIES pins heading -> commands so future category changes are a one-line edit"

requirements-completed: [HELP-03]

duration: 15min
completed: 2026-05-11
---

# Phase 19 Plan 02: Categorize top-level help

**`dap-cli help` now renders the seven locked categories from D-03 instead of one flat command list.**

## Accomplishments
- HELP-03: Applied `commander v14` `helpGroup()` to all 25 public top-level commands across 5 files. Categories: Controller lifecycle (4), Sessions (5), Launch & attach (2), Breakpoints (1), Paused-state inspection (6), Execution control (5), DAP protocol escape hatches (4 — `request`/`capabilities`/`events` from dapCore + `dap` from dapGenerated).
- `serve-controller` left untouched (`{ hidden: true }` registration, no helpGroup).
- Test coverage: 4 new vitest cases in `tests/cli/helpCommand.test.ts` pin (a) all seven headings present, (b) each command appears under its assigned heading and not elsewhere, (c) `serve-controller` is invisible, (d) plan 19-01 drill-down still works.
- Negative-test verified: temporarily renaming `Sessions` → `Session` made the membership test fail red as expected.

## Task Commits

1. **Task 1: helpGroup categorization** — `b44c079` (feat)
2. **Task 2: category-membership tests** — `e52a0e8` (test)

## Files Created/Modified
- `src/cli/commands/controller.ts` — 4 helpGroup('Controller lifecycle') calls
- `src/cli/commands/sessions.ts` — 5 helpGroup('Sessions') calls
- `src/cli/commands/dapCore.ts` — 2 helpGroup('Launch & attach') + 3 helpGroup('DAP protocol escape hatches')
- `src/cli/commands/dapAliases.ts` — 1 Breakpoints + 6 Paused-state inspection + 5 Execution control
- `src/cli/commands/dapGenerated.ts` — 1 helpGroup('DAP protocol escape hatches') on the `dap` command
- `tests/cli/helpCommand.test.ts` — 4 added tests + HELP_CATEGORIES table

## Decisions Made

- The custom `help [command...]` from plan 19-01 was intentionally NOT given a helpGroup. It currently lands in commander's default `Commands:` section (visible between `Controller lifecycle` and `Sessions` in the rendered output). Per D-03: "The help command itself stays in commander's default position." If this is undesirable, a one-line follow-up adds `.helpGroup(...)` in `src/cli/program.ts`.

## Deviations from Plan

None. Plan executed as written.

## Verification

- `npm test` → 40 files, 492 tests pass / 7 skipped (no regressions vs plan 19-01 baseline).
- `node dist/index.js help` (after `npm run build`) — manually inspected, all seven headings render with their assigned commands; `serve-controller` not visible.
- All five plan-19-01 tests + four plan-19-02 tests pass.
