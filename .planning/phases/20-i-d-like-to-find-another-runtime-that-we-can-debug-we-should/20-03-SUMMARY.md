---
phase: 20-i-d-like-to-find-another-runtime-that-we-can-debug-we-should
plan: 03
subsystem: integration-tests
tags: [go, delve, dap, integration, attach]

requires:
  - phase: 20-01
    provides: Delve descriptor and setup-adapters provisioning
  - phase: 20-02
    provides: Delve registry/config/inference surfaces
provides:
  - Dependency-free Go launch, test, and attach fixtures
  - Real Delve launch/debug, test, exec, and gated local PID attach integration coverage
  - Embedded `${port}` substitution for server adapter arguments
  - Correct Delve v1.26.3 official release asset names in setup-adapters
affects: [docs, external-project-validation, agent-hardening]

tech-stack:
  added: []
  patterns: [real-adapter DAP stopped-state inspection, gated local attach lifecycle assertion]

key-files:
  created:
    - tests/integration/delveAdapter.test.ts
    - tests/fixtures/simple-go-app/go.mod
    - tests/fixtures/simple-go-app/main.go
    - tests/fixtures/simple-go-test/go.mod
    - tests/fixtures/simple-go-test/calculate.go
    - tests/fixtures/simple-go-test/calculate_test.go
    - tests/fixtures/simple-go-attach/go.mod
    - tests/fixtures/simple-go-attach/main.go
  modified:
    - scripts/setup-adapters.ts
    - src/adapters/socketAdapter.ts

key-decisions:
  - "Keep Delve's default Go-version compatibility check intact; verify v1.26.3 with a supported Go 1.24 toolchain rather than passing --check-go-version=false."
  - "The gated local attach smoke disconnects with terminateDebuggee: false, asserts the attached target remains alive, then kills only the fixture child owned by the test."

patterns-established:
  - "Server adapter `${port}` replacement supports embedded placeholders so adapters can use combined listen flags like `--listen=127.0.0.1:${port}`."
  - "Real Delve failures retain adapter output event text in thrown test errors, keeping setup/config problems diagnosable."

requirements-completed: []

duration: not-recorded-inline
completed: 2026-05-17
---

# Phase 20 Plan 03: Real Delve Integration Summary

**Delve now has real end-to-end launch, test, exec, and gated same-machine PID attach coverage with paused-state inspection instead of shallow session creation checks.**

## Performance

- **Duration:** not recorded by the inline execute runner
- **Started:** not recorded by the inline execute runner
- **Completed:** 2026-05-17T06:48:37Z
- **Tasks:** 3
- **Files modified:** 11

## Accomplishments

- Added deterministic Go fixture modules for package launch, package tests, prebuilt exec debugging, and long-running local attach.
- Added `tests/integration/delveAdapter.test.ts` covering DAP initialize/start, breakpoints, stopped events, threads, stack, scopes, variables, expression evaluation, continue, disconnect, and cleanup across launch/test/exec/attach flows.
- Fixed two integration-discovered prerequisites: official Delve `v1.26.3` asset filenames and embedded server-port substitution in combined listen arguments.
- Made local PID attach behavior explicit: `terminateDebuggee: false` leaves the attached fixture alive after disconnect, and the test then cleans up exactly that child.

## Task Commits

Each task was committed atomically:

1. **Task 1: Add deterministic Go fixture modules** - `5b3ce3c` (test)
2. **Task 2: Add real Delve launch, test, and exec inspection coverage** - `48cabb2` (test)
3. **Task 3: Add gated local PID attach and disconnect lifecycle coverage** - `77d3677` (test)

## Files Created/Modified

- `tests/integration/delveAdapter.test.ts` - Real Delve DAP coverage for debug/test/exec plus gated local attach.
- `tests/fixtures/simple-go-*` - Repo-owned Go targets with stable source, locals, and readiness signals.
- `src/adapters/socketAdapter.ts` - Embedded `${port}` replacement for server adapter args.
- `scripts/setup-adapters.ts` - Official Delve `dlv_1.26.3_<platform>_<arch>` release filenames.

## Decisions Made

- Delve `v1.26.3` reports Go `1.23.5` as unsupported and labels `--check-go-version=false` as undefined behavior. The implementation keeps the default compatibility check; verification used Go's local toolchain manager with `GOTOOLCHAIN=go1.24.0`.
- Attach remains gated through `DAP_CLI_RUN_DELVE_ATTACH_SMOKE=1` because it controls a live local PID, even though the fixture PID is test-owned.

## Deviations from Plan

### Auto-fixed Issues

**1. Corrected official Delve release archive names**
- **Found during:** Task 2 setup verification
- **Issue:** Setup requested `dlv_darwin_arm64.tar.gz`, but official `v1.26.3` assets use the `dlv_1.26.3_...` prefix.
- **Fix:** Updated every supported platform asset mapping in `scripts/setup-adapters.ts` and reran real provisioning successfully.

**2. Generalized server `${port}` substitution**
- **Found during:** Task 2 integration implementation
- **Issue:** Shared server transport only replaced args equal to `${port}`, while Delve requires `--listen=127.0.0.1:${port}`.
- **Fix:** Replaced embedded occurrences with `replaceAll`, preserving existing exact-placeholder behavior and enabling Delve startup.

## Issues Encountered

- Delve `v1.26.3` is newer than the machine's default Go `1.23.5`; plain `npx vitest run tests/integration/delveAdapter.test.ts` surfaced Delve launch failures from that compatibility check. The supported-toolchain verification command below passed without weakening dap-cli or Delve.
- The editor diagnostics surface continued showing stale earlier test-failure payloads after green terminal verification; the actual final suite commands below passed.

## User Setup Required

- Delve `v1.26.3` expects Go 1.24 or newer for supported debugging. Later docs work should state that clearly and may point to Go's toolchain manager when a user intentionally needs a newer local toolchain.

## Verification

- `cd tests/fixtures/simple-go-test && go test ./...` passed.
- `npm run setup-adapters` provisioned Delve from `dlv_1.26.3_darwin_arm64.tar.gz` successfully.
- `GOTOOLCHAIN=go1.24.0 npx vitest run tests/integration/delveAdapter.test.ts` passed with 3 tests and the attach smoke skipped.
- `GOTOOLCHAIN=go1.24.0 DAP_CLI_RUN_DELVE_ATTACH_SMOKE=1 npx vitest run tests/integration/delveAdapter.test.ts` passed with all 4 tests.

## Next Phase Readiness

- Plan 20-04 can document concrete Delve launch fields, the Go 1.24+ compatibility requirement, exec debug-symbol guidance, and attach lifecycle expectations from verified behavior.
- Plans 20-05 and 20-06 have a real adapter suite and precise failure signals to reuse during external-project validation and fresh-agent hardening.

## Self-Check: PASSED

- Launch, test, exec, and attach flows all reached real Delve stopped state and inspected runtime data.
- Probe binaries created during compatibility investigation were removed before task commits.

---
*Phase: 20-i-d-like-to-find-another-runtime-that-we-can-debug-we-should*
*Completed: 2026-05-17*