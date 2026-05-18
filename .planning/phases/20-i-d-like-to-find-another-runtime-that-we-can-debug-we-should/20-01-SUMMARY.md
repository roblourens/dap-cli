---
phase: 20-i-d-like-to-find-another-runtime-that-we-can-debug-we-should
plan: 01
subsystem: adapters
tags: [go, delve, provisioning, setup-adapters, dap]

requires:
  - phase: 20-planning
    provides: Go/Delve research, validation strategy, and pattern map
provides:
  - Go/Delve adapter selection decision record
  - Built-in Delve descriptor with typed missing-runtime diagnostics
  - Delve dry-run provisioning path in setup-adapters
affects: [adapter-registry, launch-config, program-inference, delve-e2e]

tech-stack:
  added: [Delve v1.26.3 provisioning contract]
  patterns: [localhost-only server descriptor, PATH-or-pinned adapter setup visibility]

key-files:
  created:
    - .planning/phases/20-i-d-like-to-find-another-runtime-that-we-can-debug-we-should/20-ADAPTER-SELECTION.md
    - src/adapters/builtins/delve.ts
    - tests/adapters/delve.test.ts
  modified:
    - scripts/setup-adapters.ts

key-decisions:
  - "Phase 20 targets Go debugging through Delve native `dlv dap`; Microsoft Java remains the documented runner-up for a future orchestration-heavy spike."
  - "Delve setup is visible as PATH-first readiness with pinned official v1.26.3 fallback assets under DAP_CLI_HOME, while descriptor sessions stay localhost-only."

patterns-established:
  - "Built-in Delve descriptors use the existing server transport and emit `delve_not_found` setup guidance when unavailable."
  - "Adapter provisioning dry-runs expose exact release asset URLs and trust-boundary wording before mutating cache state."

requirements-completed: []

duration: not-recorded-inline
completed: 2026-05-17
---

# Phase 20 Plan 01: Delve Adapter Foundation Summary

**Go/Delve was locked as the next runtime, with a localhost Delve descriptor, typed readiness failures, and a deterministic dry-run provisioning path.**

## Performance

- **Duration:** not recorded by the inline execute runner
- **Started:** not recorded by the inline execute runner
- **Completed:** 2026-05-17T06:35:12Z
- **Tasks:** 3
- **Files modified:** 4

## Accomplishments

- Recorded the Go/Delve choice, the Java runner-up tradeoff, the built-in scope boundary, and the provisioning trust contract.
- Added `createDelveDescriptor()` with localhost-only `dlv dap` launch arguments and typed `delve_not_found` diagnostics.
- Extended `npm run setup-adapters -- --dry-run` to report Delve v1.26.3 official asset provisioning without downloading, while focused Delve tests remain green.

## Task Commits

Each task was committed atomically:

1. **Task 1: Record the final Go/Delve selection and provisioning contract** - `12767e4` (docs)
2. **Task 2: Add the Delve descriptor and typed missing-runtime diagnostics** - `48dea5b` (feat)
3. **Task 3: Extend setup-adapters with PATH-or-pinned Delve provisioning** - `6e5aebc` (feat)

## Files Created/Modified

- `.planning/phases/20-i-d-like-to-find-another-runtime-that-we-can-debug-we-should/20-ADAPTER-SELECTION.md` - Final Phase 20 adapter choice and contract.
- `src/adapters/builtins/delve.ts` - Built-in Delve descriptor and missing-runtime error behavior.
- `tests/adapters/delve.test.ts` - Localhost descriptor and typed diagnostics coverage.
- `scripts/setup-adapters.ts` - Delve release asset selection, dry-run output, extraction path, and adapter-aware download errors.

## Decisions Made

- Delve native DAP is the Phase 20 implementation target because it maps directly onto dap-cli's existing server transport.
- Delve setup logs the pinned official GitHub release asset and explicitly states that checksum verification is not automated by `setup-adapters`, preserving a visible trust boundary.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- The first Task 3 pass stored Delve's version as `1.26.3` and rendered the `v` only in output. The plan acceptance check required the source to contain literal `v1.26.3`, so the constant and URL formatting were aligned before committing.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Plan 20-02 can now register `delve`, map `type: "go"`, and add `.go` program inference against a concrete descriptor and setup contract.
- Real Delve installation remains a later execution/verification step; Plan 20-01 intentionally validated only dry-run provisioning and descriptor behavior.

## Self-Check: PASSED

- `npx vitest run tests/adapters/delve.test.ts` passed.
- `npm run setup-adapters -- --dry-run` exited 0 and printed Delve v1.26.3 provisioning details.
- Task acceptance greps for the selection artifact and setup source passed before summary creation.

---
*Phase: 20-i-d-like-to-find-another-runtime-that-we-can-debug-we-should*
*Completed: 2026-05-17*