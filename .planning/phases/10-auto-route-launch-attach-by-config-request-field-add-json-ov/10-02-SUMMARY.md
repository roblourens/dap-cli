---
phase: 10-auto-route-launch-attach-by-config-request-field-add-json-ov
plan: 02
subsystem: cli/dapCore + config/launchConfig
tags: [overrides, launch-config, layering, source-maps]
dependency-graph:
  requires: [10-01]
  provides: [5-layer launch config merge; --json-overrides + --resolve-source-maps flags]
  affects: [src/cli/commands/dapCore.ts, src/config/launchConfig.ts]
tech-stack:
  added: []
  patterns: [shallow-merge spread layering, env-driven fake-adapter assertion]
key-files:
  created:
    - tests/cli/jsonOverrides.test.ts
    - tests/integration/jsonOverrides.test.ts
  modified:
    - src/cli/commands/dapCore.ts
    - src/cli/commands/jsonOptions.ts
    - src/config/launchConfig.ts
    - tests/fixtures/fake-adapter-entry.ts
    - README.md
    - docs/ADAPTER-SETUP.md
decisions:
  - "Override layer is a SHALLOW spread between namedConfig and jsonConfig (matches existing resolveLaunchConfig behavior)."
  - "Promote parseJsonRecordOption to jsonOptions.ts so --json and --json-overrides share one validator (no duplicate enforcement of object-shape)."
  - "Preserve plan 01's auto-route invariant: request: literal is the LAST write in the config object — overrides cannot re-route the verb."
  - "Test strategy: add an env-driven assert-launch-args / assert-attach-args fake adapter script (DAP_CLI_FAKE_EXPECT_ARGS) so each test can specify its expected arguments without per-test fake script proliferation."
  - "Compound members inherit the same jsonOverrides and resolveSourceMaps from the parent CLI invocation; no per-member override syntax in this phase."
metrics:
  duration_minutes: ~50
  completed_date: 2025-01-XX
---

# Phase 10 Plan 02: --json-overrides and --resolve-source-maps flags

One-liner: Add a `jsonOverrides` layer to `resolveLaunchConfig` and two new CLI flags so users can layer `resolveSourceMapLocations`, `sourceMaps:true`, and other extras onto a `--config`-resolved launch.json entry without abandoning `--config`.

## What Was Built

- `src/config/launchConfig.ts`: `LaunchConfigSources` extended with `jsonOverrides?: Record<string, unknown> | undefined`. `resolveLaunchConfig` spread order is now `{ ...namedConfig, ...jsonOverrides, ...jsonConfig, ...flags }` — yielding precedence `flags > jsonConfig > jsonOverrides > namedConfig`. Code comment documents the shallow-merge contract.
- `src/cli/commands/jsonOptions.ts`: new exported `parseJsonRecordOption(value)` — moved verbatim from a private helper in `dapCore.ts`. Throws `usageError('JSON argument must be an object.', { code: 'invalid_json' })` for non-objects.
- `src/cli/commands/dapCore.ts`:
  - `DapStartCommandOptions` extended with `jsonOverrides?: string` and `resolveSourceMaps?: string[]`.
  - Both `launch` and `attach` register `.option('--json-overrides <json>', ...)` and `.option('--resolve-source-maps <pattern...>', ...)`.
  - `startDap` parses `options.jsonOverrides` via the shared `parseJsonRecordOption` and threads it as a new layer in `resolveLaunchConfig`.
  - `collectFlagOverrides` writes `setIfDefined(flags, 'resolveSourceMapLocations', options.resolveSourceMaps)` after the existing `outFiles` line.
  - `createCompoundStartMember` mirrors the override threading for compound members.
  - Local `parseJsonRecordOption` deleted; import is from `./jsonOptions.js`.
- `tests/fixtures/fake-adapter-entry.ts`: new `assert-launch-args` and `assert-attach-args` scripts (lifecycle scripts that delegate to `validateAssertArgsScript`). The validator reads `DAP_CLI_FAKE_EXPECT_ARGS` (a JSON object env var) and asserts that each expected key matches the corresponding launch/attach argument.
- `tests/cli/jsonOverrides.test.ts`: 9 unit tests covering parse rejection (3 cases), no-config layering, named-config + override merge, `--json` precedence over `--json-overrides`, `--resolve-source-maps` shape, flag layer wins over override, and override cannot bypass auto-route.
- `tests/integration/jsonOverrides.test.ts`: 2 end-to-end tests through the real controller + fake adapter (one per flag) verifying merged fields land on the wire.
- `README.md`: new "Layering extra fields onto `--config`" subsection with the precedence stack one-liner and two examples.
- `docs/ADAPTER-SETUP.md`: new top-level "Layering extra fields onto `--config`" section with full 5-layer precedence stack, shallow-merge note, worked example using the analysis.md scenario, and the auto-route invariant.

## Verification

- `npx vitest run jsonOverrides`: 11/11 pass (9 unit + 2 integration).
- `npx vitest run`: 361 tests pass, 7 skipped (no regressions in plan 01 auto-route, launchInference, or compound tests).
- `npm run build`: clean tsup build (`dist/index.js`).
- `npx tsc --noEmit`: clean.

## Deviations from Plan

**1. [Rule 3 - Blocking] Fake-adapter test infrastructure: env-driven assert script**

- Found during: writing tests/cli/jsonOverrides.test.ts
- Issue: The existing fake adapter validates launch/attach arguments either by deep-equal `expectedArguments` per-script (verbose: would require a new script per test case) or by per-script hardcoded `validateDynamicArguments` branches (also verbose).
- Fix: Added a single `validateAssertArgsScript` helper plus two new scripts (`assert-launch-args`, `assert-attach-args`) that read `DAP_CLI_FAKE_EXPECT_ARGS` env var and assert each expected key matches the corresponding actual launch/attach argument. Tests now set the env var per-case and reuse a single script.
- Files modified: tests/fixtures/fake-adapter-entry.ts
- Commit: 5ae24ea

## Authentication Gates

None.

## Threat Flags

None — `--json-overrides` is in the same trust class as the existing `--json` flag. Type confusion is mitigated by `parseJsonRecordOption` (asserted by 3 unit tests). The `request:` field locked at the tail of the config object prevents override-based verb re-routing (asserted by unit test #9).

## Self-Check: PASSED

- src/config/launchConfig.ts (jsonOverrides field + spread): FOUND
- src/cli/commands/jsonOptions.ts (exported parseJsonRecordOption): FOUND
- src/cli/commands/dapCore.ts (no local parseJsonRecordOption, both flags wired): FOUND
- tests/cli/jsonOverrides.test.ts: FOUND
- tests/integration/jsonOverrides.test.ts: FOUND
- README.md "Layering extra fields onto `--config`": FOUND
- docs/ADAPTER-SETUP.md "Layering extra fields onto `--config`" section: FOUND
- Commit 5ae24ea: FOUND
