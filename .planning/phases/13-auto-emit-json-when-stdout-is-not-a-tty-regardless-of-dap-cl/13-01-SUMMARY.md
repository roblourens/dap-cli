---
phase: 13-auto-emit-json-when-stdout-is-not-a-tty-regardless-of-dap-cl
plan: 01
subsystem: cli/output
tags: [output-mode, tty, agent-pipeline, dap-cli-human]
dependency_graph:
  requires: []
  provides:
    - cli/output: "stdout-is-TTY now gates env-derived human mode; piped stdout always emits JSON unless --human is explicit"
  affects:
    - phase-14: "Phase 14 docs/SKILL update can drop the --no-human defensive workaround now that the underlying behavior no longer requires it"
tech_stack:
  added: []
  patterns:
    - "Resolver takes an explicit, REQUIRED isStdoutTTY input — the type system forces every caller (production + tests) to make a deliberate TTY choice"
    - "MemoryStream test double exposes isTTY so in-process tests exercise both branches without monkey-patching globals"
key_files:
  created:
    - .planning/phases/13-auto-emit-json-when-stdout-is-not-a-tty-regardless-of-dap-cl/13-01-SUMMARY.md
  modified:
    - src/cli/outputMode.ts
    - src/cli/main.ts
    - src/cli/program.ts
    - src/cli/output.ts
    - tests/helpers/runCli.ts
    - tests/cli/humanOutput.test.ts
    - tests/cli/jsonOutput.test.ts
decisions:
  - "isStdoutTTY is REQUIRED (not optional) on ResolveOutputModeInput. Forces every call site to make an explicit choice; defaulting would let agent pipelines silently regress."
  - "The TTY short-circuit (cliHuman === undefined && isStdoutTTY === false → 'json') runs BEFORE parseHumanEnv. This is what makes invalid DAP_CLI_HUMAN values safe in agent pipelines — env parsing never runs there."
  - "MemoryStream test double accepts isTTY in its constructor. runCliHuman sets it to true (preserving existing TTY-mode test semantics) and the new runCliPiped sets it to false."
metrics:
  duration: "~15 min"
  completed: "2026-05-09"
  tasks: 2
  task_files: 7
  test_count: 71
---

# Phase 13 Plan 01: Auto-emit JSON when stdout is not a TTY Summary

**One-liner:** `resolveOutputMode` now takes a required `isStdoutTTY` input that gates env-derived human mode — `DAP_CLI_HUMAN=1` inherited by an agent pipeline can no longer corrupt the JSON envelope.

## Result

A piped/redirected/captured `dap-cli` invocation produces parseable JSON regardless of `DAP_CLI_HUMAN`. A TTY user with `DAP_CLI_HUMAN=1` set still gets human output. `--human` and `--no-human` flags retain their existing override semantics in both TTY and non-TTY modes. The `--no-human` defensive workaround Phase 14 will drop from agent docs is now actually unnecessary at the code level.

## Resolver Precedence Table (canonical reference for Phase 14 docs)

| `cliHuman`  | `isStdoutTTY` | `DAP_CLI_HUMAN` | Resolved | Notes                                            |
| ----------- | ------------- | --------------- | -------- | ------------------------------------------------ |
| `true`      | any           | any             | `human`  | explicit flag wins, even when piped              |
| `false`     | any           | any             | `json`   | explicit flag wins                               |
| `undefined` | `false`       | `'1'`           | `json`   | non-TTY ignores env (the headline change)        |
| `undefined` | `false`       | `undefined`     | `json`   | unchanged default                                |
| `undefined` | `false`       | `'maybe'`       | `json`   | env parsing SKIPPED — no `usageError` thrown     |
| `undefined` | `true`        | `'1'`           | `human`  | TTY + truthy env → human (existing behavior)     |
| `undefined` | `true`        | `'0'`           | `json`   | TTY + falsy env → json                           |
| `undefined` | `true`        | `undefined`     | `json`   | TTY + no env → json (existing default)           |
| `undefined` | `true`        | `'maybe'`       | throws   | invalid env still throws ON A TTY (existing)     |

## Implementation Notes

- `src/cli/outputMode.ts`: added required `isStdoutTTY: boolean` to `ResolveOutputModeInput`. Inserted the short-circuit `if (input.isStdoutTTY === false) return 'json';` between the `cliHuman === false` clause and `parseHumanEnv`.
- `src/cli/main.ts`: both `resolveOutputMode` call sites (writer factory and `selectRenderableError`) pass `isStdoutTTY: streams.stdout.isTTY === true`. `selectRenderableError` now takes `streams` so it can derive TTY from the same stream the writer uses.
- `src/cli/program.ts`: writer factory passes `isStdoutTTY: stdout.isTTY === true`. `--human` / `--no-human` descriptions updated to mention TTY auto-detection.
- `src/cli/output.ts`: `JsonWritable` widened with `readonly isTTY?: boolean` (already present on `process.stdout`).
- `tests/helpers/runCli.ts`: `MemoryStream` accepts `{ isTTY?: boolean }` in its constructor (default `false`). `runCliHuman` constructs streams with `isTTY: true` so the existing TTY-mode tests in `jsonOutput.test.ts` and `sessionCommands.test.ts` keep their semantics. Added new exported `runCliPiped` that constructs streams with `isTTY: false`.
- `tests/cli/humanOutput.test.ts`: full precedence matrix from the table above (9 rows) covered by 7 unit tests including the regression that invalid `DAP_CLI_HUMAN` does NOT throw on non-TTY.
- `tests/cli/jsonOutput.test.ts`: 3 new end-to-end tests via `runCliPiped` (headline regression, `--human` override on pipe, agent-pipeline safety net for invalid env). The previously-existing invalid-env-throws test was migrated to `runCliHuman` (TTY) so it still asserts the env-error path on the TTY branch.

## Verification

- `npx vitest run` → 386 passed, 7 skipped (37 files).
- `npm run build` → clean, 25ms.
- `npx tsc --noEmit` → 3 pre-existing errors in `tests/cli/jsonOverrides.test.ts` (see Deferred Issues). No new errors from this plan.
- Targeted run: `npx vitest run tests/cli/humanOutput.test.ts tests/cli/jsonOutput.test.ts tests/cli/sessionCommands.test.ts` → 71 passed.

## Deferred Issues

- **Pre-existing tsc errors in `tests/cli/jsonOverrides.test.ts`** (lines 39, 49, 58): `Conversion of type 'JsonFailure | JsonSuccess<unknown>' to type 'JsonFailure' may be a mistake`. Confirmed pre-existing by stashing this plan's diff and re-running `tsc --noEmit` — same 3 errors, unrelated to TTY work. Out of scope per SCOPE BOUNDARY rule; logged here for follow-up.

## Hand-Driven CLI Smoke

Deferred per the user's execution request. To be picked up before phase close.

## Deviations from Plan

- **None.** Plan executed exactly as written. The single non-obvious mechanical addition was threading `streams: CliStreams` into `selectRenderableError` so its in-error resolver re-check uses the same `isStdoutTTY` value as the success-path writer (called out implicitly by the plan's truth #3 but not explicitly enumerated in the action list).

## Phase 14 Hand-Off

The behavior Phase 14 docs/SKILL claim is now real:
- Agents can drop `--no-human` from machine-parsed commands. The CLI auto-detects piped stdout and emits JSON.
- `DAP_CLI_HUMAN=1` inherited from a developer's shell no longer corrupts agent pipelines.
- Invalid `DAP_CLI_HUMAN` values inherited by an agent are silently ignored (JSON path is taken without raising `invalid_output_mode_env`).

## Self-Check: PASSED

- Files exist:
  - `src/cli/outputMode.ts` — modified, `isStdoutTTY` field present
  - `src/cli/main.ts` — both resolveOutputMode calls pass `isStdoutTTY`
  - `src/cli/program.ts` — resolveOutputMode call passes `isStdoutTTY`; option descriptions updated
  - `src/cli/output.ts` — JsonWritable has `readonly isTTY?: boolean`
  - `tests/helpers/runCli.ts` — `runCliPiped` exported; `MemoryStream` accepts isTTY
  - `tests/cli/humanOutput.test.ts` — matrix tests present
  - `tests/cli/jsonOutput.test.ts` — `runCliPiped` tests present
- Build: GREEN
- Tests: 386 / 393 (7 skipped, none new)
