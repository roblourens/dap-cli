---
phase: 03-built-in-and-custom-adapter-support
plan: 03
subsystem: debugpy-built-in-adapter
tags: [debugpy, python, smoke-tests, docs]
requires:
  - 03-01
provides:
  - debugpy built-in adapter descriptor
  - Python smoke fixture
  - debugpy launch and attach smoke test scaffold
  - Python adapter setup documentation
affects: [adapters, config, tests, docs]
requirements-completed:
  - ADPT-03
  - ADPT-06
completed: 2026-05-03
---

# Phase 3 Plan 03: debugpy Built-in Adapter Summary

## Accomplishments

- Added `createDebugpyDescriptor`, using `python3 -m debugpy.adapter` as the DAP adapter subprocess.
- Registered debugpy as a built-in adapter in the adapter registry.
- Extended debugpy flag mapping so `--port` produces adapter-native attach `connect` configuration.
- Added deterministic Python fixture under `tests/fixtures/simple-python-app/`.
- Added debugpy integration tests with always-on descriptor coverage and availability-gated launch/attach smoke bodies.
- Extended adapter setup docs with debugpy installation, verification, launch example, and troubleshooting.

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| Task 1 | `f30532b` | Added debugpy descriptor, registry integration, and attach mapping. |
| Task 2 | `b38fd1b` | Added Python fixture. |
| Task 3 | `1f0f891` | Added debugpy smoke coverage. |
| Task 4 | `4cbfd7d` | Documented debugpy setup. |

## Verification

- `npm test -- tests/integration/debugpyAdapter.test.ts` passed with real launch/attach smokes skipped because debugpy is not installed locally.
- `npm test -- tests/adapters/ tests/config/ tests/integration/jsDebugAdapter.test.ts tests/integration/debugpyAdapter.test.ts` passed: 19 tests passed, 6 skipped.
- `npm run check` passed: typecheck, lint, tests, and build. Full suite: 18 files passed, 87 tests passed, 6 skipped.

## Deviations from Plan

- Real debugpy launch and attach smoke bodies are present but skipped in this environment because `python3 -c "import debugpy"` fails. The descriptor and config mapping are still covered by always-on tests, and setup docs include installation steps.

## Self-Check: PASSED

- debugpy is registered as a built-in adapter and resolves to `python3 -m debugpy.adapter`.
- Python fixture exists with deterministic launch behavior.
- Adapter setup documentation tells users how to install and verify debugpy before running real smoke tests.