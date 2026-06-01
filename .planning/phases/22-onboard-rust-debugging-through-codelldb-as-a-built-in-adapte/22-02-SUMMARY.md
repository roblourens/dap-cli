---
phase: 22-onboard-rust-debugging-through-codelldb-as-a-built-in-adapte
plan: 02
subsystem: adapter-provisioning
tags: [rust, codelldb, vsix, lazy-provisioning, atomic-cache]
requires:
  - phase: 22-01
    provides: Passed darwin-arm64 official-source local-cache and standalone loopback DAP gates.
  - phase: 21-lazy-runtime-provisioning
    provides: Consent, checksum, lock, safe extraction, atomic installation, and typed provisioning patterns.
provides:
  - CodeLLDB `v1.12.2` darwin-arm64-only lazy provisioner for the verified official VSIX.
  - Full required runtime-tree cache validation with executable readiness restoration.
  - Offline synthetic VSIX functional and cold/warm concurrency regression coverage.
affects: [22-03, 22-04, 22-05, codelldb, setup-adapters]
tech-stack:
  added: []
  patterns: [Full-tree VSIX cache health, single-approved-platform native provisioning]
key-files:
  created: [src/adapters/provision/codelldb.ts, tests/adapters/provision/codelldb.test.ts]
  modified: [src/adapters/provision/types.ts, src/adapters/provision/checksums.ts, src/adapters/provision/index.ts, tests/helpers/buildFakeAdapterTarball.ts, tests/adapters/provision/concurrent.test.ts]
key-decisions:
  - "Enable only the inspected `darwin_arm64` asset and pinned SHA-256; every other CodeLLDB platform remains typed-unsupported until separately evidenced."
  - "Cache health requires the adapter, bundled LLDB executables/libraries, Python sentinel, Rust support, and manifest paths rather than accepting a single native executable."
patterns-established:
  - "Native VSIX provisioners download from official source only, verify before extraction, publish atomically, and validate the complete required runtime layout on warm use."
requirements-completed: []
duration: 10 min
completed: 2026-05-31
---

# Phase 22 Plan 02: CodeLLDB Lazy Provisioning Summary

**Verified CodeLLDB macOS arm64 VSIX provisioning through the existing consent-gated, SHA-verified, atomic local cache with full runtime-tree checks and concurrent-install tests.**

## Performance

- **Duration:** approximately 10 min
- **Completed:** 2026-05-31T23:50:07Z
- **Tasks:** 2
- **Files modified:** 7

## Accomplishments

- Added `codelldb` to the closed provisioning interface with only the R-00-approved `v1.12.2` `darwin_arm64` digest and official release asset.
- Implemented safe full-VSIX lazy provisioning using existing consent, lock, download, checksum, ZIP extraction, atomic install, consent-marker, and typed diagnostic primitives.
- Added offline synthetic VSIX coverage for success/failure behavior and cold/warm parallel calls, including full-tree publication and no partial staging residue.

## Task Commits

1. **Task 1: Define failing full-tree and concurrency contract** - `23552da`, `dda771e` (test)
2. **Task 2: Implement verified CodeLLDB provisioner** - `ad42ad6` (feat)

## Files Created/Modified

- `src/adapters/provision/codelldb.ts` - Scoped CodeLLDB VSIX download, verification, extraction, readiness, and cache implementation.
- `src/adapters/provision/checksums.ts` - Single approved version/platform checksum source of truth.
- `src/adapters/provision/types.ts` and `src/adapters/provision/index.ts` - `codelldb` provisioning identity and dispatch.
- `tests/adapters/provision/codelldb.test.ts`, `tests/adapters/provision/concurrent.test.ts`, and `tests/helpers/buildFakeAdapterTarball.ts` - Offline runtime-tree and concurrency contract.

## Decisions Made

- Kept the supported matrix at `darwin_arm64` only; release filenames are not permission to ship uninspected platform support.
- Required key files across `extension/adapter`, bundled LLDB/Python, Rust language support, and the manifest on every warm-cache health check.

## Deviations from Plan

The first RED fixture omitted two R-00-recorded LLDB tool binaries; it was corrected in `dda771e` before production implementation so the test contract represents the accepted runtime tree. No product scope was broadened.

## Issues Encountered

None after the RED contract alignment.

## User Setup Required

None - local provisioning remains consent-driven when the adapter is actually selected.

## Verification

- `tests/adapters/provision/codelldb.test.ts`, `tests/adapters/provision/concurrent.test.ts`, `tests/adapters/provision/extract.test.ts`, `tests/adapters/provision/errorSnapshots.test.ts`, and `tests/architecture/moduleBoundaries.test.ts`: 44 passed.
- VS Code TypeScript diagnostics for changed production and test files: no errors.

## Next Phase Readiness

- Ready for Plan 22-03 to add a lazy built-in descriptor and registry entry using only the R-01-proved loopback invocation.
- Documentation must continue to describe direct official-source local provisioning, not bundling, mirroring, offline distribution, or unsupported platforms.

---
*Phase: 22-onboard-rust-debugging-through-codelldb-as-a-built-in-adapte*
*Completed: 2026-05-31*