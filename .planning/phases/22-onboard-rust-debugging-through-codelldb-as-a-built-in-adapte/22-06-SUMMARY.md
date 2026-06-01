---
phase: 22-onboard-rust-debugging-through-codelldb-as-a-built-in-adapte
plan: 06
subsystem: config-routing
tags: [rust, codelldb, lldb, launch-config, cargo]
requires:
  - phase: 22-01
    provides: Proven native CodeLLDB explicit executable DAP contract.
provides:
  - `lldb` launch type routing to the `codelldb` built-in.
  - Early typed refusal of extension-owned `cargo` configuration input at the native forwarding boundary.
  - Explicit CodeLLDB adapter default type with a locked no-`.rs` inference boundary.
affects: [22-07, 22-08, rust, launch-config]
tech-stack:
  added: []
  patterns: [Explicit native executable configuration, extension-owned config rejection]
key-files:
  created: [tests/cli/codelldbConfigRouting.test.ts]
  modified: [src/config/launchConfig.ts, src/config/programInference.ts, src/cli/commands/dapCore.ts, tests/config/launchConfig.test.ts, tests/config/programInference.test.ts]
key-decisions:
  - "Any `cargo` key is invalid at the standalone CodeLLDB DAP boundary even when `program` is also supplied."
  - "Rust source extensions are deliberately absent from program inference; callers select a compiled executable or named configuration explicitly."
patterns-established:
  - "Adapter-specific native config limitations are enforced in `mapConfigForAdapter` before registry resolution."
requirements-completed: []
duration: 2 min
completed: 2026-06-01
---

# Phase 22 Plan 06: CodeLLDB Configuration Routing Summary

**Named `lldb` configurations now reach CodeLLDB for explicit binaries, while raw Cargo-shaped input fails early with explicit-build guidance.**

## Performance

- **Duration:** approximately 2 min
- **Completed:** 2026-06-01T00:02:43Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments

- Added `lldb -> codelldb` mapping and `--adapter codelldb` default native type selection.
- Preserved explicit Rust native fields including `program`, `cwd`, `args`, `env`, `sourceLanguages`, and `sourceMap` after variable resolution.
- Added a typed `codelldb_cargo_config_unsupported` boundary error and command-level proof that both Cargo-only and Cargo-plus-program inputs fail before provisioning/controller resolution.
- Locked `.rs` program-only input as `adapter_inference_failed` rather than pretending source is a native launch executable.

## Task Commits

1. **Tasks 1-2 RED: Native config boundary and inference tests** - `6600c71` (test)
2. **Tasks 1-2 GREEN: CodeLLDB mapping and early Cargo validation** - `49b79e1` (feat)

## Decisions Made

- `validateCodeLldbNativeConfig` rejects based on key presence, preventing a `cargo` object from surviving through defaults, named configuration, JSON overrides, or raw adapter-native JSON.
- The validator is invoked only after the selected adapter id is known to be `codelldb`, preserving custom adapter behavior for any unrelated type strings.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- VS Code retained RED diagnostics immediately after GREEN execution; a refreshed test/diagnostic pass cleared them.

## User Setup Required

None - Rust configurations should point `program` at an already built executable and omit VS Code's `cargo` helper object.

## Verification

- `tests/config/launchConfig.test.ts`, `tests/config/programInference.test.ts`, `tests/cli/codelldbConfigRouting.test.ts`, and `tests/cli/launchAttachAutoRoute.test.ts`: 60 passed.
- `npm run typecheck -- --pretty false`: passed.
- VS Code diagnostics for changed implementation/test files: no current errors after refresh.

## Next Phase Readiness

- Ready for Plan 22-07 to execute owned compiled-Rust integration sessions through the built-in CodeLLDB route and record attach disposition.

---
*Phase: 22-onboard-rust-debugging-through-codelldb-as-a-built-in-adapte*
*Completed: 2026-06-01*