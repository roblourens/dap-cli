---
phase: 21-integrate-c-net-debugging-through-netcoredbg-as-a-built-in-r
plan: 05
subsystem: validation
tags: [csharp, dotnet, netcoredbg, external-validation, public-repo-screening]

requires:
  - phase: 21-integrate-c-net-debugging-through-netcoredbg-as-a-built-in-r
    provides: NetCoreDbg setup, Rosetta x64 proof path, C# docs, and Phase 20 ledger patterns
provides:
  - Fresh-agent C# scenario matrix C-01 through C-10
  - Screened public C# repo candidate ledger with safety checklist
  - External validation result ledger with a passing screened NetCoreDbg public repo attempt
affects: [phase-21-csharp-netcoredbg, csharp-fresh-agent-validation, external-project-validation]

tech-stack:
  added: []
  patterns: [public repo safety screening, isolated dotnet/NuGet/dap-cli homes, Rosetta x64 NetCoreDbg validation evidence]

key-files:
  created:
    - .planning/phases/21-integrate-c-net-debugging-through-netcoredbg-as-a-built-in-r/21-SCENARIOS.md
    - .planning/phases/21-integrate-c-net-debugging-through-netcoredbg-as-a-built-in-r/21-EXTERNAL-PROJECT-CANDIDATES.md
    - .planning/phases/21-integrate-c-net-debugging-through-netcoredbg-as-a-built-in-r/21-EXTERNAL-PROJECT-RESULTS.md
  modified: []

key-decisions:
  - "Selected dotnet/samples golden app as the primary external validation target after screening because its selected net8.0 path has ordinary restore/build/run instructions and no local scripts/hooks/package-feed surprises."
  - "Recorded the arm64-dotnet plus x64-NetCoreDbg launch timeout as a failed attempt, then used the previously proven explicit x64 dotnet + x64 NetCoreDbg Rosetta pair for the passing attempt."
  - "Preserved NetCoreDbg evaluate failures as evaluate-or-fallback evidence rather than fabricating success; scopes/variables provided the paused-state value proof."

patterns-established:
  - "External C# validation attempts must record clone SHA, safety screen, isolated DAP_CLI_HOME/DOTNET_CLI_HOME/NUGET_PACKAGES, separate restore/build/debug, and cleanup."
  - "Fresh-agent C# scenarios use the fixed result/what_worked/what_didnt/agent_confusion/dap_cli_ergonomic_issues/evidence/cleanup_verified report contract."

requirements-completed: []

duration: 6min
completed: 2026-05-23
status: complete
---

# Phase 21 Plan 05: Public C# Repo Screening, Scenario Matrix, and External Validation Ledgers Summary

**C# NetCoreDbg fresh-agent scenarios, screened public repo candidate ledger, and a passing dotnet/samples external breakpoint/stack/scopes/variables validation are now recorded with isolated Rosetta x64 evidence.**

## Performance

- **Duration:** 6 min
- **Started:** 2026-05-23T04:17:41Z
- **Completed:** 2026-05-23T04:23:34Z
- **Tasks:** 2 completed
- **Files modified:** 4

## Accomplishments

- Created `21-SCENARIOS.md` with scenarios C-01 through C-10 and the required fixed report contract.
- Screened six public C# repositories under `tmp/phase-21-external-csharp/`, recording SHA-pinned candidate status, safety checklist coverage, and selected/blocked rationale.
- Ran screened `dotnet/samples` external validation with isolated `DAP_CLI_HOME`, `DOTNET_CLI_HOME`, and `NUGET_PACKAGES`, separated restore/build/debug, and captured one passing NetCoreDbg public repo debug attempt.
- Preserved one failed compatibility attempt honestly before the passing attempt, showing that x64 NetCoreDbg without x64 dotnet is insufficient on darwin/arm64.

## Task Commits

Each task was committed atomically:

1. **Task 21-05-01: Create C# scenario matrix and candidate screening ledger** - `8aa06a4` (docs)
2. **Task 21-05-02: Run external validation attempts and record results** - `0246ffc` (docs)

**Plan metadata:** this final docs commit.

## Files Created/Modified

- `.planning/phases/21-integrate-c-net-debugging-through-netcoredbg-as-a-built-in-r/21-SCENARIOS.md` - Fresh-agent C# scenario matrix C-01 through C-10.
- `.planning/phases/21-integrate-c-net-debugging-through-netcoredbg-as-a-built-in-r/21-EXTERNAL-PROJECT-CANDIDATES.md` - Public C# repo safety screening ledger with six candidates.
- `.planning/phases/21-integrate-c-net-debugging-through-netcoredbg-as-a-built-in-r/21-EXTERNAL-PROJECT-RESULTS.md` - External validation attempts, including one passing screened public repo debug run.
- `.planning/phases/21-integrate-c-net-debugging-through-netcoredbg-as-a-built-in-r/21-05-SUMMARY.md` - This summary.

## Decisions Made

- Selected `dotnet/samples` `core/getting-started/golden/app` as the primary external validation target after screening.
- Used the explicit x64 dotnet + x64 NetCoreDbg Rosetta proof path for the passing darwin/arm64 validation attempt without weakening setup defaults.
- Treated NetCoreDbg evaluator rejection as a documented fallback case and used scopes/variables as the live paused-state evidence.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- First external debug attempt (`CSHARP-EXT-01`) paired x64 NetCoreDbg with host arm64 `dotnet` and failed with `dap_request_timeout` during `configurationDone`. This was recorded as `result: fail`, cleaned up, and corrected by using the previously proven explicit x64 dotnet + x64 NetCoreDbg pair for `CSHARP-EXT-02`.
- `dist/index.js` was absent before external dap-cli execution, so `npm run build` was run to create the CLI entrypoint. No repository source files changed from that build.

## Verification

- `test -f 21-SCENARIOS.md` — PASS.
- `test -f 21-EXTERNAL-PROJECT-CANDIDATES.md` — PASS.
- `test -f 21-EXTERNAL-PROJECT-RESULTS.md` — PASS.
- `grep -c '^### C-' 21-SCENARIOS.md` — PASS (`10`).
- `grep -R "tmp/phase-21-external-csharp" 21-EXTERNAL-PROJECT-CANDIDATES.md` — PASS.
- `grep -R "DOTNET_CLI_HOME\|NUGET_PACKAGES\|DAP_CLI_HOME" 21-SCENARIOS.md 21-EXTERNAL-PROJECT-CANDIDATES.md` — PASS.
- Candidate ledger includes six `CSHARP-CAND-` candidates and selected/blocked statuses — PASS.
- `grep -R "CSHARP-EXT-\|commit_sha:\|cleanup_verified:" 21-EXTERNAL-PROJECT-RESULTS.md` — PASS.
- `grep -R "result: pass" 21-EXTERNAL-PROJECT-RESULTS.md` — PASS.
- Passing attempt evidence includes breakpoint, stack, scopes, variables, evaluate-or-fallback, continue, close, and cleanup — PASS.

## Known Stubs

None.

## Threat Flags

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Plan 21-06 can use the scenario matrix and external ledgers for fresh-agent runs.
- External validation has a known-good public C# reproduction target and a documented darwin/arm64 Rosetta compatibility requirement.

## Self-Check: PASSED

- Verified created files exist: `21-SCENARIOS.md`, `21-EXTERNAL-PROJECT-CANDIDATES.md`, `21-EXTERNAL-PROJECT-RESULTS.md`, and `21-05-SUMMARY.md`.
- Verified task commits exist: `8aa06a4`, `0246ffc`.
- Verified plan-level acceptance commands passed.

---
*Phase: 21-integrate-c-net-debugging-through-netcoredbg-as-a-built-in-r*
*Completed: 2026-05-23*
