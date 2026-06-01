---
phase: 22-onboard-rust-debugging-through-codelldb-as-a-built-in-adapte
plan: 04
subsystem: adapter-setup
tags: [rust, codelldb, provisioning, setup-adapters, checksums]
requires:
  - phase: 22-01
    provides: Approved official CodeLLDB darwin-arm64 VSIX asset and SHA-256 boundary.
  - phase: 22-02
    provides: Full-tree CodeLLDB lazy cache and runtime readiness contract.
provides:
  - Explicit and consolidated `setup-adapters` prewarm/status support for CodeLLDB.
  - Shared complete-tree readiness predicate preventing partial CodeLLDB caches from being reported warm.
  - Review-only checksum regeneration descriptor for the single approved CodeLLDB asset.
affects: [22-05, codelldb, setup-adapters, packaging]
tech-stack:
  added: []
  patterns: [Shared cache-readiness predicate, review-only official artifact checksum generation]
key-files:
  created: []
  modified: [src/adapters/provision/codelldb.ts, src/cli/commands/setupAdapters.ts, scripts/setup-adapters.ts, scripts/dev/regen-checksums.ts, tests/cli/setupAdaptersCommand.test.ts]
key-decisions:
  - "Classify CodeLLDB cached status through the full retained VSIX runtime inventory rather than the adapter executable alone."
  - "Checksum regeneration lists only `codelldb-darwin-arm64.vsix`; unsupported assets remain outside product and maintainer workflows."
patterns-established:
  - "A native adapter's setup preflight calls the provisioner's readiness predicate so consent cannot be bypassed by a partial cache."
requirements-completed: []
duration: 5 min
completed: 2026-05-31
---

# Phase 22 Plan 04: CodeLLDB Setup and Checksum Summary

**CodeLLDB can now be explicitly prewarmed or reported through setup while partial bundled runtimes still require consent before repair.**

## Performance

- **Duration:** approximately 5 min
- **Completed:** 2026-05-31T23:57:31Z
- **Tasks:** 2
- **Files modified:** 7

## Accomplishments

- Included `codelldb v1.12.2` in single-target and all-target setup selection, Commander choices, consolidated consent, and setup output.
- Exported and reused the CodeLLDB complete-runtime readiness predicate so a cache missing bundled `liblldb` is pending, not cached.
- Added the official CodeLLDB darwin-arm64 VSIX only to the maintainer checksum-printing workflow, with no automatic source mutation.

## Task Commits

1. **Task 1 RED: CodeLLDB setup and full-tree status expectations** - `79fb89e` (test)
2. **Tasks 1-2 GREEN: Setup/status and checksum workflow implementation** - `cf5ff6f` (feat)

## Decisions Made

- The full-tree readiness check lives with the provisioner and is consumed by setup reporting to keep one definition of an installable CodeLLDB cache.
- The dev setup wrapper is part of the user-facing eager prewarm route and must accept the same adapter ids as the shipped command.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Added CodeLLDB parsing to the existing dev setup wrapper**
- **Found during:** Task 1
- **Issue:** `scripts/setup-adapters.ts` carries its own `--adapter` allowlist; without an update, `npm run setup-adapters -- --adapter codelldb` would silently select all adapters.
- **Fix:** Included `codelldb` in the wrapper's adapter parsing.
- **Files modified:** `scripts/setup-adapters.ts`
- **Verification:** Typecheck and setup command tests pass.

**2. [Rule 3 - Blocking] Narrowed previously-added checksum test buckets for strict typecheck**
- **Found during:** Task 2 verification
- **Issue:** Plan 22-02 CodeLLDB test fixture assignments indexed a versioned checksum bucket without an undefined guard, failing the required repository typecheck.
- **Fix:** Reused guarded setter helpers in provisioning, concurrency, and setup tests.
- **Files modified:** `tests/adapters/provision/codelldb.test.ts`, `tests/adapters/provision/concurrent.test.ts`, `tests/cli/setupAdaptersCommand.test.ts`
- **Verification:** `npm run typecheck -- --pretty false` passes.

---

**Total deviations:** 2 auto-fixed (1 missing critical, 1 blocking)
**Impact on plan:** Both changes are directly necessary for the setup contract and its required verification; supported asset scope is unchanged.

## Issues Encountered

- None beyond the strict-indexing verification correction recorded above.

## User Setup Required

None - `setup-adapters --adapter codelldb --yes` uses the consent-aware existing cache flow.

## Verification

- `tests/cli/setupAdaptersCommand.test.ts`, `tests/adapters/provision/codelldb.test.ts`, and `tests/adapters/provision/concurrent.test.ts`: 18 passed.
- `npm run typecheck -- --pretty false`: passed.
- VS Code diagnostics for changed files: no current errors.

## Next Phase Readiness

- Ready for Plan 22-05 to extend typed error, security boundary, and packaged-cache regression gates for CodeLLDB.

---
*Phase: 22-onboard-rust-debugging-through-codelldb-as-a-built-in-adapte*
*Completed: 2026-05-31*