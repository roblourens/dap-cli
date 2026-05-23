---
phase: 21-integrate-c-net-debugging-through-netcoredbg-as-a-built-in-r
plan: 01
subsystem: adapters
tags: [csharp, dotnet, netcoredbg, setup-adapters, debug-adapter-protocol]

requires:
  - phase: 20-i-d-like-to-find-another-runtime-that-we-can-debug-we-should
    provides: Delve built-in descriptor and deterministic setup precedent
provides:
  - Built-in NetCoreDbg stdio descriptor using `netcoredbg --interpreter=vscode`
  - PATH-first and cache-fallback NetCoreDbg runtime resolution
  - Pinned NetCoreDbg `3.1.3-1062` setup target with sha256 verification and extraction safety checks
affects: [adapter-registry, setup-adapters, phase-21-csharp-netcoredbg]

tech-stack:
  added: []
  patterns: [stdio built-in adapter descriptor, PATH-first adapter setup, sha256-verified archive provisioning]

key-files:
  created:
    - src/adapters/builtins/netCoreDbg.ts
    - tests/adapters/netCoreDbg.test.ts
  modified:
    - src/adapters/registry.ts
    - scripts/setup-adapters.ts
    - tests/integration/setupAdapters.test.ts
    - tests/adapters/delve.test.ts

key-decisions:
  - "NetCoreDbg setup treats darwin/arm64 as unsupported unless a user-provided PATH netcoredbg is available; it does not silently use the x64 asset."
  - "NetCoreDbg archive bytes are sha256-checked before extraction, and archive entries are inspected to reject path traversal before invoking tar/unzip."

patterns-established:
  - "NetCoreDbg descriptor mirrors debugpy stdio shape but uses Delve-style PATH-first cache fallback diagnostics."
  - "Setup tests import guarded helper exports from scripts/setup-adapters.js while child-process tests continue to execute the real CLI script."

requirements-completed: []

duration: 7min
completed: 2026-05-23
---

# Phase 21 Plan 01: NetCoreDbg Built-In Runtime Setup Summary

**C#/.NET debugging now has a first-party NetCoreDbg stdio descriptor and deterministic `setup-adapters` provisioning with pinned digest verification.**

## Performance

- **Duration:** 7 min
- **Started:** 2026-05-23T02:55:00Z
- **Completed:** 2026-05-23T03:02:05Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments

- Added `createNetCoreDbgDescriptor()` with adapter id `netcoredbg`, label `C#/.NET Debug Adapter (NetCoreDbg)`, stdio transport, and args `['--interpreter=vscode']`.
- Registered `netcoredbg` as a default built-in adapter so dap-cli can list and resolve the runtime path through normal adapter registry flows.
- Extended `scripts/setup-adapters.ts` with NetCoreDbg `3.1.3-1062` asset selection, PATH short-circuiting, sha256 verification, path traversal checks before extraction, executable presence validation, chmod on Unix, and `--version`/`--help` readiness diagnostics.
- Added regression coverage for descriptor shape, PATH-first lookup, setup dry-run output, unsupported platform handling, digest mismatch, extraction failure, and unusable executable diagnostics.

## Task Commits

Each task was committed atomically:

1. **Task 21-01-01 RED: Add NetCoreDbg descriptor expectations** - `fa853e6` (test)
2. **Task 21-01-01 GREEN: Add NetCoreDbg built-in descriptor** - `a1eb015` (feat)
3. **Task 21-01-02 RED: Add NetCoreDbg setup regression expectations** - `7db269f` (test)
4. **Task 21-01-02 GREEN: Add deterministic NetCoreDbg setup target** - `a916bfa` (feat)

**Plan metadata:** pending final docs commit.

## Files Created/Modified

- `src/adapters/builtins/netCoreDbg.ts` - NetCoreDbg stdio descriptor with PATH/cache resolution and `netcoredbg_not_found` diagnostics.
- `src/adapters/registry.ts` - Registers NetCoreDbg as a default built-in adapter.
- `scripts/setup-adapters.ts` - Adds pinned NetCoreDbg setup with digest verification, safe extraction checks, and typed/actionable diagnostics.
- `tests/adapters/netCoreDbg.test.ts` - Covers descriptor shape, PATH-first runtime resolution, missing adapter diagnostics, and registry visibility.
- `tests/integration/setupAdapters.test.ts` - Covers NetCoreDbg setup behavior while preserving existing debugpy/Delve setup regressions.
- `tests/adapters/delve.test.ts` - Keeps existing Delve tests type-safe under repository typecheck.

## Decisions Made

- Kept Microsoft `vsdbg` completely out of the NetCoreDbg descriptor and setup flow.
- Rejected silent darwin/arm64 x64 asset selection; setup emits `netcoredbg_unsupported_platform` unless a usable PATH executable is already present.
- Added a main-module guard and exported setup helper functions so integration tests can validate digest/extraction/readiness behavior without triggering real adapter setup on import.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Registered NetCoreDbg in the default adapter registry**
- **Found during:** Task 21-01-01 (Add NetCoreDbg stdio descriptor and runtime diagnostic)
- **Issue:** The plan listed only the descriptor file, but the phase truth requires dap-cli to resolve a built-in NetCoreDbg descriptor through normal runtime flows.
- **Fix:** Added `createNetCoreDbgDescriptor()` to `src/adapters/registry.ts`.
- **Files modified:** `src/adapters/registry.ts`
- **Verification:** `tests/adapters/netCoreDbg.test.ts` checks default registry visibility; `npx tsc --noEmit` passed.
- **Committed in:** `a1eb015`

**2. [Rule 3 - Blocking] Kept existing Delve adapter tests type-safe for repository typecheck**
- **Found during:** Task 21-01-01 verification
- **Issue:** `npx tsc --noEmit` reported optional diagnostic access errors in existing Delve adapter tests, blocking the plan's required typecheck.
- **Fix:** Used optional chaining on `error?.diagnostics?.join(...)` in the existing Delve assertions.
- **Files modified:** `tests/adapters/delve.test.ts`
- **Verification:** `npx tsc --noEmit` passed.
- **Committed in:** `a1eb015`

---

**Total deviations:** 2 auto-fixed (1 missing critical, 1 blocking)
**Impact on plan:** Both fixes were needed to make the descriptor resolvable and to satisfy the plan's required typecheck. No scope expansion beyond adapter/setup correctness.

## Issues Encountered

- `npx vitest` initially required project dependencies; `npm ci` was run to install local `node_modules` for verification. No dependency files changed.
- Importing `scripts/setup-adapters.ts` from tests initially executed the setup script at import time; the implementation added a main-module guard before exporting helper functions.

## Verification

- `npx vitest run tests/integration/setupAdapters.test.ts` — PASS (8 tests).
- `npx tsc --noEmit` — PASS.
- `grep -R "vsdbg" src/adapters/builtins/netCoreDbg.ts` — PASS (no matches).
- `grep -R "id: 'netcoredbg'" src/adapters/builtins/netCoreDbg.ts` — PASS.
- `grep -R -- "--interpreter=vscode" src/adapters/builtins/netCoreDbg.ts` — PASS.
- `grep -R "netCoreDbgVersion = '3.1.3-1062'" scripts/setup-adapters.ts` — PASS.

## Known Stubs

None.

## Threat Flags

| Flag | File | Description |
|------|------|-------------|
| threat_flag: adapter-registry | `src/adapters/registry.ts` | New built-in adapter id registration surface added as required for NetCoreDbg resolution; covered by descriptor and setup diagnostics. |

## User Setup Required

None for this plan. Users on supported platforms can run `npm run setup-adapters`; darwin/arm64 users need a usable PATH `netcoredbg` until upstream provides a native asset.

## Next Phase Readiness

- NetCoreDbg descriptor and provisioning are ready for launch config mapping, inference, fixtures, docs, and end-to-end C#/.NET verification in later Phase 21 plans.
- Setup behavior preserves existing JavaScript, Python, and Go adapter setup paths.

## Self-Check: PASSED

- Verified all created/modified files exist.
- Verified task commits exist: `fa853e6`, `a1eb015`, `7db269f`, `a916bfa`.

---
*Phase: 21-integrate-c-net-debugging-through-netcoredbg-as-a-built-in-r*
*Completed: 2026-05-23*
