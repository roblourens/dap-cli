---
phase: 21-integrate-c-net-debugging-through-netcoredbg-as-a-built-in-r
plan: 03
subsystem: testing
tags: [csharp, dotnet, netcoredbg, integration-tests, fixtures]

requires:
  - phase: 21-integrate-c-net-debugging-through-netcoredbg-as-a-built-in-r
    provides: NetCoreDbg descriptor, setup target, and coreclr mapping from Plans 21-01 and 21-02
provides:
  - Repo-owned net8.0 C# fixtures for launch, short-lived, and attach scenarios
  - NetCoreDbg integration test coverage for descriptor shape, DLL launch, stop-on-entry, paused inspection, and gated attach
  - Rosetta x64 proof path for NetCoreDbg launch/attach on darwin/arm64 hosts
  - `.dll` inference after real NetCoreDbg DLL launch proof
affects: [phase-21-csharp-netcoredbg, netcoredbg-validation, program-inference]

tech-stack:
  added: []
  patterns: [repo-owned C# Debug DLL fixtures, env-gated owned-PID attach smoke, no-false-pass NetCoreDbg blocker diagnostics]

key-files:
  created:
    - tests/fixtures/simple-csharp-app/simple-csharp-app.csproj
    - tests/fixtures/simple-csharp-app/Program.cs
    - tests/fixtures/simple-csharp-short-lived/simple-csharp-short-lived.csproj
    - tests/fixtures/simple-csharp-short-lived/Program.cs
    - tests/fixtures/simple-csharp-attach/simple-csharp-attach.csproj
    - tests/fixtures/simple-csharp-attach/Program.cs
    - tests/integration/netCoreDbgAdapter.test.ts
  modified:
    - scripts/setup-adapters.ts
    - src/config/programInference.ts
    - tests/integration/launchInference.test.ts

key-decisions:
  - "Accepted a Rosetta x64 proof path for darwin/arm64 only after pairing x64 NetCoreDbg with an x64 .NET SDK/runtime in phase-owned scratch."
  - "Added .dll inference only after real NetCoreDbg DLL launch and attach smokes passed through that compatible x64 pair."
  - "The attach smoke remains gated by DAP_CLI_RUN_NETCOREDBG_ATTACH_SMOKE=1 and disconnects with terminateDebuggee:false before killing only the owned fixture process."

patterns-established:
  - "C# fixtures use SDK-style net8.0 console projects without PackageReference dependencies."
  - "NetCoreDbg tests fail with explicit BLOCKED diagnostics instead of passing when the local platform lacks a compatible adapter/runtime pair."

requirements-completed: []

duration: 56min
completed: 2026-05-23
status: complete
---

# Phase 21 Plan 03: C# Fixtures and NetCoreDbg Smoke Coverage Summary

**Repo-owned C# Debug DLL fixtures, NetCoreDbg launch/attach smoke tests, setup extraction flattening, and `.dll` inference are complete after validating a compatible x64 NetCoreDbg + x64 .NET proof path under Rosetta.**

## Performance

- **Duration:** 56 min
- **Started:** 2026-05-23T03:08:02Z
- **Completed:** 2026-05-23T03:56:38Z
- **Tasks:** 3 completed
- **Files modified:** 11

## Accomplishments

- Added three package-free SDK-style `net8.0` C# fixtures:
  - `simple-csharp-app` for DLL launch and breakpoint inspection.
  - `simple-csharp-short-lived` for stop-on-entry race coverage.
  - `simple-csharp-attach` for owned local PID attach coverage.
- Added `tests/integration/netCoreDbgAdapter.test.ts` with descriptor assertions, DLL launch smoke coverage, stop-on-entry coverage, paused-state assertions for `left`, `right`, and `result`, evaluate-or-scopes fallback documentation, and env-gated attach coverage.
- Preserved the Plan 21-03 safety gate: `.dll` inference was added only after real NetCoreDbg DLL launch and attach smokes passed using x64 .NET and x64 NetCoreDbg under Rosetta.
- Fixed NetCoreDbg setup extraction flattening so archives that unpack into a nested `netcoredbg/` directory still produce the cache-root executable expected by the descriptor.

## Task Commits

1. **Task 21-03-01: Create deterministic C# fixtures** - `a239042` (feat)
2. **Task 21-03-02: Add real NetCoreDbg launch, short-lived, and gated attach integration tests** - `6534769` (test)
3. **Task 21-03-03: Add .dll inference after real DLL launch proof** - pending commit after orchestrator gap closure.

**Plan metadata:** pending final docs commit.

## Files Created/Modified

- `tests/fixtures/simple-csharp-app/simple-csharp-app.csproj` - SDK-style net8.0 Debug DLL launch fixture.
- `tests/fixtures/simple-csharp-app/Program.cs` - Deterministic `Calculate(2, 3)` fixture with inspectable `left`, `right`, and `result` locals.
- `tests/fixtures/simple-csharp-short-lived/simple-csharp-short-lived.csproj` - SDK-style net8.0 short-lived fixture.
- `tests/fixtures/simple-csharp-short-lived/Program.cs` - Fast-exit `Calculate(8, 13)` fixture for stop-on-entry breakpoint arming.
- `tests/fixtures/simple-csharp-attach/simple-csharp-attach.csproj` - SDK-style net8.0 attach target fixture.
- `tests/fixtures/simple-csharp-attach/Program.cs` - Owned attach target that prints `simple-csharp-attach ready`, loops, sleeps, and calls `Calculate(21, 34)`.
- `tests/integration/netCoreDbgAdapter.test.ts` - NetCoreDbg descriptor, DLL launch, stop-on-entry, paused inspection, and env-gated owned-PID attach smoke tests.
- `scripts/setup-adapters.ts` - Flattens NetCoreDbg archive root directory after extraction so the provisioned executable lands at `DAP_CLI_HOME/adapters/netcoredbg/netcoredbg`.
- `src/config/programInference.ts` - Adds `.dll` inference to `netcoredbg` / `coreclr` and default type `coreclr` for `--adapter netcoredbg`.
- `tests/integration/launchInference.test.ts` - Adds direct inference assertions for `.dll` and adapter-only NetCoreDbg default type.

## Decisions Made

- Added `.dll` inference to `src/config/programInference.ts` only after real DLL launch proof passed.
- Kept `.csproj` inference absent.
- Installed local Homebrew `dotnet@8` to complete fixture builds after host `dotnet` was initially absent and the Docker SDK image pull/manifest check hung.
- Downloaded an x64 .NET SDK/runtime under `tmp/phase-21-x64-proof/dotnet-x64` and the pinned NetCoreDbg macOS x64 asset under `tmp/phase-21-x64-proof/netcoredbg`; both are phase scratch artifacts and not committed.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Installed local .NET 8 SDK when host dotnet was absent and Docker SDK fallback stalled**
- **Found during:** Task 21-03-01 (fixture build verification)
- **Issue:** `dotnet` was not on PATH. Docker was running, but `mcr.microsoft.com/dotnet/sdk:8.0` pull/manifest checks hung and could not provide the plan's fallback.
- **Fix:** Installed Homebrew `dotnet@8` and verified fixtures with `DOTNET_ROOT=/opt/homebrew/opt/dotnet@8/libexec`.
- **Files modified:** none in repository.
- **Verification:** All three C# fixtures built successfully with `dotnet build ... -c Debug`.
- **Committed in:** not applicable (environment-only fix).

**2. [Rule 1 - Bug] Converted C# fixtures from top-level local functions to class-based `Program` methods**
- **Found during:** Task 21-03-02 (NetCoreDbg breakpoint verification)
- **Issue:** Initial top-level local-function fixture layout did not produce reliable debugger source mapping for the smoke test.
- **Fix:** Converted fixtures to `internal static class Program` with `static int Calculate(...)` methods while preserving deterministic locals and output.
- **Files modified:** `tests/fixtures/simple-csharp-app/Program.cs`, `tests/fixtures/simple-csharp-short-lived/Program.cs`, `tests/fixtures/simple-csharp-attach/Program.cs`
- **Verification:** `npx tsc --noEmit` passed; static acceptance criteria passed.
- **Committed in:** `6534769`

**3. [Rule 1 - Bug] Flattened nested NetCoreDbg archive extraction**
- **Found during:** Orchestrator gap closure after Task 21-03-02
- **Issue:** The real NetCoreDbg macOS x64 archive extracts as `netcoredbg/netcoredbg`, while setup and descriptor readiness expect the executable at `DAP_CLI_HOME/adapters/netcoredbg/netcoredbg`.
- **Fix:** Added `flattenNetCoreDbgArchiveRoot(...)` after extraction to move nested archive contents to the adapter cache root when needed.
- **Files modified:** `scripts/setup-adapters.ts`
- **Verification:** `npx vitest run tests/integration/setupAdapters.test.ts` passed in the focused verification batch.
- **Committed in:** pending orchestrator commit

---

**Total deviations:** 3 auto-fixed (1 blocking, 2 bugs)
**Impact on plan:** The fixture/test scaffolding is complete and the compatible x64 proof path unblocked real adapter verification without weakening the darwin/arm64 setup default.

## Issues Encountered

- **Platform mismatch:** This host is `darwin/arm64`, and upstream NetCoreDbg `3.1.3-1062` has no supported darwin/arm64 release asset. The accepted proof path uses both x64 NetCoreDbg and x64 .NET under Rosetta; setup still does not silently install the x64 asset for darwin/arm64 users.
- **Docker fallback unavailable:** Docker itself is running, but `docker pull mcr.microsoft.com/dotnet/sdk:8.0` and `docker manifest inspect mcr.microsoft.com/dotnet/sdk:8.0` hung and had to be stopped. No official SDK-container proof was available.
- **Full-suite check note:** Earlier `npm run check` failed during lint on Plan 21-01 `scripts/setup-adapters.ts` issues (`no-redundant-type-constituents`, `require-await`) before this gap closure. Focused typecheck and tests now pass; full-suite cleanup remains for later phase verification if lint still reports issues.

## Verification

- `dotnet build tests/fixtures/simple-csharp-app -c Debug` — PASS with Homebrew `dotnet@8`.
- `dotnet build tests/fixtures/simple-csharp-short-lived -c Debug` — PASS with Homebrew `dotnet@8`.
- `dotnet build tests/fixtures/simple-csharp-attach -c Debug` — PASS with Homebrew `dotnet@8`.
- Task 21-03-01 static acceptance checks — PASS.
- Task 21-03-02 static acceptance checks — PASS:
  - `DAP_CLI_RUN_NETCOREDBG_ATTACH_SMOKE` gate present.
  - `terminateDebuggee: false` attach disconnect present.
  - `left`, `right`, `result` local-variable assertions present.
- `npx tsc --noEmit` — PASS.
- `npx vitest run tests/integration/netCoreDbgAdapter.test.ts tests/integration/launchInference.test.ts tests/integration/setupAdapters.test.ts` with x64 .NET + x64 NetCoreDbg + `DAP_CLI_ALLOW_DARWIN_ARM64_NETCOREDBG_SMOKE=1` — PASS (18 passed, 1 skipped).
- `DAP_CLI_RUN_NETCOREDBG_ATTACH_SMOKE=1 npx vitest run tests/integration/netCoreDbgAdapter.test.ts` with x64 .NET + x64 NetCoreDbg + `DAP_CLI_ALLOW_DARWIN_ARM64_NETCOREDBG_SMOKE=1` — PASS (4 passed).
- `npx tsc --noEmit` — PASS.

## Deferred Issues

- **Full-suite lint audit:** If `npm run check` still reports lint findings in `scripts/setup-adapters.ts`, close them before `/gsd-verify-work`.

## Known Stubs

None.

## Threat Flags

| Flag | File | Description |
|------|------|-------------|
| threat_flag: process-spawn | `tests/integration/netCoreDbgAdapter.test.ts` | Test starts local .NET fixture processes for launch and attach smoke coverage. |
| threat_flag: attach-pid | `tests/integration/netCoreDbgAdapter.test.ts` | Attach smoke passes a PID to NetCoreDbg, gated by `DAP_CLI_RUN_NETCOREDBG_ATTACH_SMOKE=1` and scoped to a fixture-owned child process. |

## User Setup Required

To unblock Task 21-03-03, run the NetCoreDbg smoke tests on a supported NetCoreDbg platform (Linux x64/arm64, macOS x64 with matching x64 .NET, or Windows x64), or provide a Docker environment where the official .NET SDK image can run NetCoreDbg and the debuggee in the same container/process namespace.

## Next Phase Readiness

- C# fixture and test scaffolding are ready for rerun on a compatible environment.
- `.dll` inference must remain deferred until the real DLL launch test passes.

## Self-Check: PASSED

- Verified created files exist.
- Verified task commits exist: `a239042`, `6534769`.
- Verified real NetCoreDbg launch and attach smoke passed under compatible x64 Rosetta proof environment.
- Verified `.dll` inference was added only after that proof.

---
*Phase: 21-integrate-c-net-debugging-through-netcoredbg-as-a-built-in-r*
*Completed: 2026-05-23*
