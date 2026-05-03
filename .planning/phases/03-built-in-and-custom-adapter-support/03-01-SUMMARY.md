---
phase: 03-built-in-and-custom-adapter-support
plan: 01
subsystem: adapter-registry-and-launch-config
tags: [adapters, config, cli, launch-config, verification]
requires: []
provides:
  - Adapter registry with built-in-before-custom resolution
  - Persistent adapter config schema and load/save helpers
  - Launch config resolution with flags > JSON > named config precedence
  - Launch/attach CLI adapter selection and config forwarding
affects: [adapters, config, cli, controller, tests]
requirements-completed:
  - ADPT-04
  - ADPT-05
completed: 2026-05-03
---

# Phase 3 Plan 01: Adapter Registry and Launch Config Summary

## Accomplishments

- Added persistent adapter config support in `src/adapters/config.ts`, including Zod validation, missing-file defaults, invalid config diagnostics, and atomic JSON writes.
- Added `AdapterRegistry` in `src/adapters/registry.ts` with built-in-first resolution, custom adapter fallback, deterministic listing, and `adapter_not_found` handled failures.
- Added `src/config/launchConfig.ts` for `.vscode/launch.json` loading, VS Code type-to-adapter mapping, config precedence, and D-07 js-debug/debugpy flag mapping helpers.
- Updated `launch` and `attach` to accept `--adapter`, `--config`, `--json`, and common override flags while preserving fake adapter compatibility.
- Forwarded resolved launch/attach config through the controller into lifecycle `launch` and `attach` DAP requests.

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| Task 1 | `3651937` | Added adapter registry and registry unit tests. |
| Task 2 | `5539437` | Added adapter config persistence and direct load/save tests. |
| Task 3 | `3e62fe8` | Added launch config resolution and mapping tests. |
| Task 4 | `c7f7f7a` | Routed launch/attach through registry-aware config handling and integration tests. |

## Verification

- `npm test -- tests/adapters/ tests/config/ tests/cli/ tests/integration/fakeAdapterCli.test.ts` passed: 8 files, 44 tests.
- `npm run typecheck` passed.
- `npm run lint` passed.
- `npm run check` passed: typecheck, lint, tests, and build. Full suite: 16 files passed, 83 tests passed.

## Deviations from Plan

None - plan executed exactly as written.

## Self-Check: PASSED

- Adapter registry resolves built-in and custom adapters and reports unknown IDs with handled usage errors.
- Adapter config validates descriptors with optional launch/attach defaults and persists under `DAP_CLI_HOME/config/adapters.json`.
- Launch config resolution implements flags > JSON > named config precedence and maps Node, Chrome, and Python launch types through dap-cli adapter IDs.
- Launch/attach commands now use registry-based descriptor resolution and preserve deterministic fake adapter behavior.