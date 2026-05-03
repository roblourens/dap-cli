---
phase: 03-built-in-and-custom-adapter-support
plan: 02
subsystem: js-debug-built-in-adapter
tags: [js-debug, javascript, chrome, electron, typescript, smoke-tests]
requires:
  - 03-01
provides:
  - Lazy js-debug built-in adapter descriptor
  - JavaScript, TypeScript, Chrome, and Electron smoke fixtures
  - js-debug smoke test scaffold with setup diagnostics
  - JavaScript adapter setup documentation
affects: [adapters, cli, config, tests, docs]
requirements-completed:
  - SESS-02
  - ADPT-01
  - ADPT-02
  - ADPT-06
completed: 2026-05-03
---

# Phase 3 Plan 02: js-debug Built-in Adapter Summary

## Accomplishments

- Added `createJsDebugDescriptor` with lazy resolution for `DAP_CLI_HOME/adapters/js-debug/src/dapDebugServer.js` and `node_modules/vscode-js-debug/src/dapDebugServer.js`.
- Added js-debug to the adapter registry as a lazy built-in so custom adapters still work when js-debug is not installed.
- Extended launch/attach flags for adapter-native JavaScript workflows, including `--type`, `--args`, `--runtime-args`, `--source-maps`, and `--out-files`.
- Added deterministic Node.js, TypeScript, Chrome, and Electron fixtures for smoke coverage.
- Added js-debug integration tests with always-on setup diagnostics and real-adapter smoke bodies guarded by explicit local availability checks.
- Created `docs/ADAPTER-SETUP.md` with js-debug provisioning, verification, and troubleshooting guidance.

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| Task 1 | `4d332a0` | Added lazy js-debug built-in descriptor and registry integration. |
| Task 2 | `46538fd` | Added JavaScript, TypeScript, Chrome, and Electron fixtures. |
| Task 3 | `69a58b9` | Added js-debug smoke coverage and flag mapping support. |
| Task 4 | `c5c2be7` | Documented js-debug setup. |

## Verification

- `npm test -- tests/integration/jsDebugAdapter.test.ts` passed: 1 passed, 4 skipped because js-debug and Electron are not installed locally.
- `npm test -- tests/adapters/ tests/config/ tests/integration/jsDebugAdapter.test.ts tests/integration/debugpyAdapter.test.ts` passed as part of Wave 2 targeted verification.
- `npm run check` passed: typecheck, lint, tests, and build. Full suite: 18 files passed, 87 tests passed, 6 skipped.

## Deviations from Plan

- Real js-debug Node, TypeScript, Chrome, and Electron smoke bodies are present but skipped in this environment because `DAP_CLI_HOME/adapters/js-debug/src/dapDebugServer.js`, `node_modules/vscode-js-debug/src/dapDebugServer.js`, and local Electron are not installed. The always-on diagnostic test verifies `js_debug_not_found` points to setup docs.

## Self-Check: PASSED

- js-debug is registered as a built-in adapter without breaking custom adapter resolution when the optional binary is absent.
- Required JavaScript smoke fixtures exist for Node.js, TypeScript source maps, Chrome headless, and Electron.
- Adapter setup documentation tells users how to provision js-debug before running real smoke tests.