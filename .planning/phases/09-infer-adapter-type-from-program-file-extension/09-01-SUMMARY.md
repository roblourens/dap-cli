---
phase: 09-infer-adapter-type-from-program-file-extension
plan: 01
subsystem: cli
tags: [cli, adapter, inference, launch, attach, dap]

requires:
  - phase: 04-debugpy-and-launch-config-integration
    provides: launchConfigTypeMap + resolveAdapterIdFromType (reused as the canonical type->adapter table)
  - phase: 05-js-debug-and-launch-config-integration
    provides: js-debug adapter id and pwa-node / pwa-chrome DAP types

provides:
  - "inferAdapterAndType: pure resolver from {adapter?, type?, program?} -> {adapterId, type?, inferred}"
  - "Optional --adapter and --type on dap-cli launch / attach with extension-driven inference"
  - "Structured usage_error 'adapter_inference_failed' for unsupported / missing program extensions"
  - "Documentation of the inference rules table in docs/ADAPTER-SETUP.md and short-form examples in README"

affects: [agent-workflows, future-adapters, launch-config]

tech-stack:
  added: []
  patterns:
    - "Pure inference module + thin call-site adapter (no duplicate maps; reuses resolveAdapterIdFromType)"
    - "Explicit-flag-wins precedence with structured failure modes for ambiguous inputs"

key-files:
  created:
    - src/config/programInference.ts
    - tests/config/programInference.test.ts
    - tests/integration/launchInference.test.ts
  modified:
    - src/cli/commands/dapCore.ts
    - README.md
    - docs/ADAPTER-SETUP.md

key-decisions:
  - "Inference module is pure (no I/O); dapCore is the only place that touches CLI options + adapter config."
  - "Type-only branch reuses resolveAdapterIdFromType so future entries in launchConfigTypeMap (and customTypeMap) flow through automatically — no duplicate adapter map."
  - "Adapter-only branch returns undefined type for unknown adapters rather than fabricating one — keeps custom adapters in control of their DAP type."
  - "Named-config (--config) path is intentionally untouched: it already had its own resolveAdapterIdFromType call and its own ownership of the type field."
  - "All-absent default to 'fake' is preserved as the legacy test/sandbox path (no behavior change)."

patterns-established:
  - "Inference helpers expose an `inferred: { adapter, type }` flag so callers can distinguish user intent from defaults without re-running the resolver."
  - "Structured CLI errors include data.{program,extension} so JSON consumers can surface the actual offending extension without parsing diagnostics."

requirements-completed: [INFER-01]

duration: ~25min
completed: 2026-05-09
---

# Phase 09: Infer Adapter / Type from --program Summary

**`dap-cli launch --program app.{js,py,ts,html}` now picks the right adapter and DAP type automatically; `--adapter` and `--type` are optional and explicit flags always win.**

## Performance

- **Duration:** ~25 min
- **Started:** 2026-05-09 ~09:14 PT
- **Completed:** 2026-05-09 ~09:20 PT
- **Tasks:** 3 / 3
- **Files modified:** 6

## Accomplishments

- New pure inference module `src/config/programInference.ts` resolves `{adapter?, type?, program?}` into `{ adapterId, type?, inferred }` with explicit-wins precedence.
- `dap-cli launch` and `dap-cli attach` accept `--program` alone (or `--type` alone, or `--adapter` alone) and infer the rest. Unsupported extensions fail loud with `code: adapter_inference_failed` and `data: { program, extension }`.
- 20 unit tests + 4 integration tests cover every branch (explicit-wins, adapter-only, type-only via `customTypeMap`, program-only extension table, no-extension, case-insensitive, all-absent fake fallback). Full suite still green: 328 / 335 tests passing (7 pre-existing skips).
- README quick-start now shows the inferred form alongside the explicit form for both Node and Python; ADAPTER-SETUP.md gains an `## Inference rules` section with the extension table, adapter-only default-type table, and failure-mode notes.

## Task Commits

Each task was committed atomically (TDD: RED → GREEN per task):

1. **Task 1 RED — failing unit tests for inferAdapterAndType** — `084266c` (test)
2. **Task 1 GREEN — programInference module** — `fca0999` (feat)
3. **Task 2 RED — failing integration tests for launch inference** — `80ec559` (test)
4. **Task 2 GREEN — wire inference into launch/attach** — `98a3918` (feat)
5. **Task 3 — README + ADAPTER-SETUP inference docs** — `03c79e8` (docs)

**Plan metadata:** `5e81b66` (docs: plan adapter/type inference)

## Files Created/Modified

- `src/config/programInference.ts` — Pure resolver (`inferAdapterAndType`) + private `extensionTable` and `defaultTypeForAdapter` helper. Re-uses `resolveAdapterIdFromType` for the type-only branch.
- `tests/config/programInference.test.ts` — 20 unit tests, one per branch including negative paths.
- `src/cli/commands/dapCore.ts` — `resolveAdapterId` replaced by `resolveAdapterAndType` (named-config path unchanged); `collectFlagOverrides` now takes an `inferredType` and stamps `flags.type` only when the user did not pass `--type`. Commander descriptions on both `launch` and `attach` updated for `--adapter` and `--type`.
- `tests/integration/launchInference.test.ts` — 4 end-to-end tests through `runCli` + `ControllerServer` + custom fake adapter (custom-typeMap, explicit-wins, unsupported-extension failure, all-absent fake fallback).
- `README.md` — Inferred-form examples next to the existing explicit `js-debug` and `debugpy` quick-start lines.
- `docs/ADAPTER-SETUP.md` — New `## Inference rules` section between `## Custom Adapters` and `## Launch Config Type Mapping`.

## Verification

- `npm run typecheck` — clean.
- `npm test` — 27 / 27 files, 328 passed / 7 skipped (no regressions).
- `npm test -- tests/config/programInference.test.ts` — 20 / 20 pass.
- `npm test -- tests/integration/launchInference.test.ts` — 4 / 4 pass.
- `npm test -- tests/integration/fakeAdapterCli.test.ts` — 35 / 35 pass (no regressions on the existing fake-adapter integration suite).
- Hand smoke against built `dist/index.js`:
  - `node dist/index.js launch --program tests/fixtures/simple-node-app/index.js --stop-on-entry --name infer-demo` selected `js-debug` (failed only on adapter-not-installed in throwaway DAP_CLI_HOME, confirming inference resolved to js-debug).
  - `node dist/index.js launch --program /tmp/foo.unknown` → exit 2, `code: adapter_inference_failed`, `data.extension: '.unknown'`.
  - `node dist/index.js launch --program /tmp/run` (no extension) → exit 2, `code: adapter_inference_failed`, `data.extension: ''`.
- `grep -c "## Inference rules" docs/ADAPTER-SETUP.md` → `1`.

## Self-Check: PASSED
