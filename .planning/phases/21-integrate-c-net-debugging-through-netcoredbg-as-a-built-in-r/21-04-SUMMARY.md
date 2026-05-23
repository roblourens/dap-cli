---
phase: 21-integrate-c-net-debugging-through-netcoredbg-as-a-built-in-r
plan: 04
subsystem: docs
tags: [csharp, dotnet, netcoredbg, docs, agent-skill]

requires:
  - phase: 21-integrate-c-net-debugging-through-netcoredbg-as-a-built-in-r
    provides: NetCoreDbg setup, coreclr mapping, real DLL launch proof, and Rosetta x64 caveat from Plans 21-01 through 21-03
provides:
  - Human NetCoreDbg setup, launch, attach, cleanup, and troubleshooting documentation
  - Fresh-agent C#/.NET NetCoreDbg workflow reference
  - Docs validation retaining NetCoreDbg safety guidance
affects: [phase-21-csharp-netcoredbg, csharp-netcoredbg-docs, fresh-agent-guidance]

tech-stack:
  added: []
  patterns: [build-first DLL launch documentation, docs retention tests, safe owned-PID attach guidance]

key-files:
  created:
    - dap-cli/skills/dap-cli/references/csharp-netcoredbg.md
  modified:
    - docs/adapter-setup.md
    - dap-cli/skills/dap-cli/SKILL.md
    - tests/integration/docsValidation.test.ts

key-decisions:
  - "Documented NetCoreDbg as coreclr-only for the built-in path; clr remains unsupported."
  - "Documented build-first DLL launch and explicitly rejected .csproj auto-build behavior."
  - "Documented darwin/arm64 accurately: setup does not silently provision the x64 asset; real smoke requires an explicit compatible x64 dotnet + netcoredbg Rosetta path and opt-in override."

patterns-established:
  - "Language references should be linked from SKILL.md and included in docsValidation docsToValidate."
  - "Docs tests retain safety terms for adapter setup, no vsdbg bundling, no .csproj auto-build, coreclr, and attach cleanup."

requirements-completed: []

duration: 3min
completed: 2026-05-23
status: complete
---

# Phase 21 Plan 04: C#/.NET NetCoreDbg Docs and Agent Skill Reference Summary

**NetCoreDbg human setup docs and fresh-agent C# reference now document build-first DLL launch, coreclr-only launch type, safe owned-PID attach cleanup, digest-verified setup, no vsdbg bundling, no .csproj auto-build, and the explicit macOS arm64 Rosetta proof path.**

## Performance

- **Duration:** 3 min
- **Started:** 2026-05-23T04:12:20Z
- **Completed:** 2026-05-23T04:15:33Z
- **Tasks:** 2 completed
- **Files modified:** 4

## Accomplishments

- Added C#/.NET NetCoreDbg coverage to `docs/adapter-setup.md`, including setup, inference, `coreclr`, build-first `.dll` launch, no `.csproj` auto-build, no `vsdbg`, safe attach, troubleshooting diagnostics, and the darwin/arm64 caveat.
- Added a `SKILL.md` going-deeper link to the new C# reference.
- Created `dap-cli/skills/dap-cli/references/csharp-netcoredbg.md` for fresh agents, with readiness, launch config, short-lived app, scopes/variables/evaluate fallback, attach cleanup, diagnostics, and public-repo safety guidance.
- Extended `tests/integration/docsValidation.test.ts` so the new reference is command-validated and safety-critical C# docs terms are retained.

## Task Commits

Each task was committed atomically with TDD RED/GREEN commits:

1. **Task 21-04-01 RED: Add C#/.NET setup docs and skill link validation** - `42bab89` (test)
2. **Task 21-04-01 GREEN: Add C#/.NET setup docs and skill link** - `7bf8609` (docs)
3. **Task 21-04-02 RED: Add C# agent reference retention tests** - `d0234d7` (test)
4. **Task 21-04-02 GREEN: Add C# agent reference and docs validation entry** - `417d1ad` (docs)

**Plan metadata:** this final docs commit.

## Files Created/Modified

- `docs/adapter-setup.md` - Added NetCoreDbg to built-ins, inference tables, setup/launch/attach docs, troubleshooting, and macOS arm64 caveat.
- `dap-cli/skills/dap-cli/SKILL.md` - Added going-deeper link to the C# NetCoreDbg reference.
- `dap-cli/skills/dap-cli/references/csharp-netcoredbg.md` - New fresh-agent workflow reference for C#/.NET debugging through NetCoreDbg.
- `tests/integration/docsValidation.test.ts` - Added C# reference command validation and retention checks for safety-critical guidance.

## Decisions Made

- NetCoreDbg docs use `coreclr` only; `clr` remains documented as unsupported through `unknown_launch_type`.
- The supported launch path is build-first `.dll` launch; `.csproj` auto-build remains explicitly unsupported.
- The darwin/arm64 caveat states setup does not silently provision the x64 asset; real smoke requires explicit compatible x64 `dotnet` + x64 NetCoreDbg under Rosetta and an opt-in override.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- `npm run check` was attempted and failed in pre-existing/non-Plan-21-04 areas:
  - `tests/integration/delveAdapter.test.ts` failed three Go/Delve tests because provisioned Delve is incompatible with the active Go toolchain.
  - `tests/integration/selfHosting.test.ts` timed out in `dap-cli debugs simple-node-app fixture with stop-on-entry inspection`.
- Docs validation and all task-specific acceptance criteria passed.

## Verification

- Task 21-04-01 RED: `npx vitest run tests/integration/docsValidation.test.ts` — failed as expected before docs existed.
- Task 21-04-01 acceptance:
  - `grep -R "netcoredbg" docs/adapter-setup.md dap-cli/skills/dap-cli/SKILL.md` — PASS.
  - `grep -R "coreclr" docs/adapter-setup.md` — PASS.
  - `grep -R "vsdbg" docs/adapter-setup.md` — PASS.
  - `npx vitest run tests/integration/docsValidation.test.ts` — PASS (11 tests at that point).
- Task 21-04-02 RED: `npx vitest run tests/integration/docsValidation.test.ts` — failed as expected because `csharp-netcoredbg.md` did not exist.
- Task 21-04-02 acceptance:
  - `test -f dap-cli/skills/dap-cli/references/csharp-netcoredbg.md` — PASS.
  - `grep -R "terminateDebuggee:false\\|terminateDebuggee.*false" dap-cli/skills/dap-cli/references/csharp-netcoredbg.md` — PASS.
  - `grep -R ".csproj" dap-cli/skills/dap-cli/references/csharp-netcoredbg.md` — PASS.
  - `npx vitest run tests/integration/docsValidation.test.ts` — PASS (12 tests).
- Plan verification:
  - `npx vitest run tests/integration/docsValidation.test.ts` — PASS (12 tests).
  - `npm run check` — ATTEMPTED; failed in unrelated Go/Delve toolchain compatibility and self-hosting timeout checks listed above.

## TDD Gate Compliance

- RED commits exist: `42bab89`, `d0234d7`.
- GREEN commits exist after their RED commits: `7bf8609`, `417d1ad`.
- No refactor commit was needed.

## Known Stubs

None.

## Threat Flags

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Plan 21-05 can rely on human and agent docs for NetCoreDbg setup, build-first DLL launch, safe attach cleanup, and public-repo safety constraints.
- The full-suite `npm run check` failures should be handled outside Plan 21-04 unless they reproduce as current-plan regressions.

## Self-Check: PASSED

- Verified created/modified files exist.
- Verified task commits exist: `42bab89`, `7bf8609`, `d0234d7`, `417d1ad`.
- Verified docs validation passed after implementation.

---
*Phase: 21-integrate-c-net-debugging-through-netcoredbg-as-a-built-in-r*
*Completed: 2026-05-23*
