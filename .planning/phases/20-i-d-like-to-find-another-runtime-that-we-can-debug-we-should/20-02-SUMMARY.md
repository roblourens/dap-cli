---
phase: 20-i-d-like-to-find-another-runtime-that-we-can-debug-we-should
plan: 02
subsystem: config
tags: [go, delve, registry, launch-config, inference]

requires:
  - phase: 20-01
    provides: Delve descriptor and provisioning contract
provides:
  - Lazy built-in Delve registry entry
  - Built-in `type: "go"` launch-config routing to Delve
  - `.go` and adapter-only Delve inference
  - Deterministic Go relative-program normalization from effective cwd
affects: [delve-e2e, docs, external-project-validation]

tech-stack:
  added: []
  patterns: [shared config normalization across named and direct launch paths]

key-files:
  created: []
  modified:
    - src/adapters/registry.ts
    - src/config/launchConfig.ts
    - src/config/programInference.ts
    - src/cli/commands/dapCore.ts
    - tests/adapters/registry.test.ts
    - tests/config/launchConfig.test.ts
    - tests/config/programInference.test.ts

key-decisions:
  - "Delve stays a lazy built-in registration so adapter discovery does not require local Delve installation."
  - "Go launch `program` values are normalized after normal config resolution and again after direct flag layering, preserving configured `cwd` and avoiding a Delve transport cwd override."

patterns-established:
  - "Runtime-specific config transformations live in launchConfig helpers and dapCore adapter dispatch rather than splitting named/direct configuration paths."

requirements-completed: []

duration: not-recorded-inline
completed: 2026-05-17
---

# Phase 20 Plan 02: Go Selection and Inference Summary

**Delve is now reachable through public registry selection, `type: "go"` launch configs, `.go` program inference, and deterministic Go launch path normalization.**

## Performance

- **Duration:** not recorded by the inline execute runner
- **Started:** not recorded by the inline execute runner
- **Completed:** 2026-05-17T06:37:46Z
- **Tasks:** 3
- **Files modified:** 7

## Accomplishments

- Registered Delve lazily in the built-in adapter registry and pinned that behavior with registry tests.
- Added built-in Go launch-config type routing plus config-path normalization for relative Go launch programs without mutating attach payloads.
- Added `.go -> delve/go` inference and `--adapter delve` default type behavior while existing adapter/type precedence tests stayed green.

## Task Commits

Each task was committed atomically:

1. **Task 1: Register the Delve built-in lazily and expose stable registry behavior** - `6815424` (feat)
2. **Task 2: Map `type: go`, preserve Delve launch/attach fields, and keep launch-json validation strict** - `220a611` (feat)
3. **Task 3: Infer `.go` programs and Delve default type without regressing explicit precedence** - `ce1b5bd` (feat)

## Files Created/Modified

- `src/adapters/registry.ts` - Adds lazy Delve built-in registration.
- `src/config/launchConfig.ts` - Adds `go -> delve` routing and shared Go program normalization.
- `src/cli/commands/dapCore.ts` - Applies Go normalization after merged direct/named config layering.
- `src/config/programInference.ts` - Adds `.go` and adapter-only Delve inference.
- `tests/adapters/registry.test.ts`, `tests/config/launchConfig.test.ts`, `tests/config/programInference.test.ts` - Focused regressions for all new public selection flows.

## Decisions Made

- Direct and named Go launch inputs share the same normalization helper so external-project validation later sees the same payload shape users get from flags or launch.json.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Plan 20-03 can now test real Delve launch, test, exec, and attach behavior through public adapter/config inference surfaces instead of hand-built descriptors only.

## Self-Check: PASSED

- `npx vitest run tests/adapters/registry.test.ts tests/config/launchConfig.test.ts tests/config/programInference.test.ts` passed with 54 tests.
- Editor diagnostics for all edited TypeScript files were clean during task verification.

---
*Phase: 20-i-d-like-to-find-another-runtime-that-we-can-debug-we-should*
*Completed: 2026-05-17*