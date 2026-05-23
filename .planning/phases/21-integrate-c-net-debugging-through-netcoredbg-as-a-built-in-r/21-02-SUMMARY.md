---
phase: 21-integrate-c-net-debugging-through-netcoredbg-as-a-built-in-r
plan: 02
subsystem: config
tags: [csharp, dotnet, netcoredbg, launch-config, inference]

requires:
  - phase: 21-integrate-c-net-debugging-through-netcoredbg-as-a-built-in-r
    provides: NetCoreDbg built-in descriptor and setup target from Plan 21-01
provides:
  - VS Code `coreclr` launch type mapping to dap-cli adapter id `netcoredbg`
  - Regression coverage that `clr`, `.csproj`, `${command:*}`, and `${input:*}` remain unsupported
  - Confirmation that `.dll` inference remains deferred to Plan 21-03
affects: [adapter-registry, launch-config, program-inference, phase-21-csharp-netcoredbg]

tech-stack:
  added: []
  patterns: [launchConfigTypeMap adapter resolution, unsafe launch variable rejection, negative inference coverage]

key-files:
  created:
    - .planning/phases/21-integrate-c-net-debugging-through-netcoredbg-as-a-built-in-r/21-02-SUMMARY.md
  modified:
    - src/config/launchConfig.ts
    - tests/integration/launchAttachAutoRoute.test.ts
    - tests/integration/launchInference.test.ts

key-decisions:
  - "Mapped only VS Code `coreclr` to NetCoreDbg; `clr` remains unsupported until separately proven."
  - "Kept `.csproj` and `.dll` out of program inference in this plan; `.dll` inference remains gated on Plan 21-03 real DLL launch proof."

patterns-established:
  - "C# launch config support starts at VS Code `coreclr` type mapping without adding C# semantics to protocol core."
  - "Potentially unsafe VS Code launch conveniences are protected by negative integration coverage before adding later inference."

requirements-completed: []

duration: 2min
completed: 2026-05-23
---

# Phase 21 Plan 02: NetCoreDbg Registry and Config Mapping Summary

**NetCoreDbg is now reachable from VS Code `coreclr` launch configs while `clr`, project-file inference, command/input variables, and `.dll` inference remain deliberately blocked.**

## Performance

- **Duration:** 2 min
- **Started:** 2026-05-23T03:04:11Z
- **Completed:** 2026-05-23T03:06:00Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments

- Added `coreclr: 'netcoredbg'` to the launch config type map.
- Confirmed the NetCoreDbg built-in registry entry from Plan 21-01 is present and resolvable through registry listing code.
- Added regression tests that `type: "coreclr"` resolves to `netcoredbg` and `type: "clr"` returns `unknown_launch_type`.
- Added negative coverage for `.csproj` adapter inference and unsupported `${command:*}` / `${input:*}` launch variables.
- Confirmed no `.dll` inference was added to `src/config/programInference.ts`.

## Task Commits

Each task was committed atomically:

1. **Task 21-02-01 RED: coreclr/clr mapping expectations** - `4d6c7f9` (test)
2. **Task 21-02-01 GREEN: coreclr maps to NetCoreDbg** - `c9b7a33` (feat)
3. **Task 21-02-02: unsafe C# launch config regression coverage** - `a0883e8` (test)

**Plan metadata:** pending final docs commit.

## Files Created/Modified

- `src/config/launchConfig.ts` - Adds the VS Code `coreclr` launch type mapping to adapter id `netcoredbg`; no `clr` mapping was added.
- `tests/integration/launchAttachAutoRoute.test.ts` - Covers `coreclr` mapping, `clr` rejection, and command/input launch variable rejection.
- `tests/integration/launchInference.test.ts` - Covers `.csproj` adapter inference failure without implicit build behavior.
- `.planning/phases/21-integrate-c-net-debugging-through-netcoredbg-as-a-built-in-r/21-02-SUMMARY.md` - Records plan execution results.

## Decisions Made

- Mapped `coreclr` only; left `clr` as `unknown_launch_type`.
- Preserved the Plan 21-03 boundary by not adding `.dll` inference in this plan.
- Treated Task 21-02-02 as characterization coverage because the unsafe behaviors were already rejected by existing implementation.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- The literal acceptance check `grep -R "clr:" src/config/launchConfig.ts` also matches the required `coreclr:` line. Verification used a standalone-key check (`^  clr:`) to confirm no separate `clr` mapping exists.
- Task 21-02-02's safety tests passed immediately because `.csproj`, `${command:*}`, and `${input:*}` were already unsupported. The task goal was to protect those existing constraints before later inference changes.

## Verification

- `npx vitest run tests/integration/launchInference.test.ts tests/integration/launchAttachAutoRoute.test.ts` — PASS (10 tests).
- `npx tsc --noEmit` — PASS.
- `grep -R "createNetCoreDbgDescriptor" src/adapters/registry.ts` — PASS.
- `grep -R "coreclr: 'netcoredbg'" src/config/launchConfig.ts` — PASS.
- Standalone `clr` mapping check (`grep -R "^  clr:" src/config/launchConfig.ts`) — PASS (no matches).
- `.dll` inference check (`grep -R "'.dll'.*netcoredbg.*coreclr" src/config/programInference.ts`) — PASS (no matches).

## TDD Gate Compliance

- Task 21-02-01 followed RED/GREEN: `4d6c7f9` failed before mapping, then `c9b7a33` passed after implementation.
- Task 21-02-02 added characterization tests for already-existing safety behavior; no GREEN implementation commit was needed.

## Known Stubs

None.

## Threat Flags

None.

## User Setup Required

None.

## Next Phase Readiness

- Plan 21-03 can now prove real NetCoreDbg DLL launch behavior before adding any `.dll` inference.
- Existing JavaScript, Python, and Go type mappings and program inference behavior remain unchanged.

## Self-Check: PASSED

- Verified all created/modified files exist.
- Verified task commits exist: `4d6c7f9`, `c9b7a33`, `a0883e8`.

---
*Phase: 21-integrate-c-net-debugging-through-netcoredbg-as-a-built-in-r*
*Completed: 2026-05-23*
