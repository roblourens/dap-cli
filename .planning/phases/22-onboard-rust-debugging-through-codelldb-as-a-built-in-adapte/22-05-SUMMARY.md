---
phase: 22-onboard-rust-debugging-through-codelldb-as-a-built-in-adapte
plan: 05
subsystem: testing
tags: [rust, codelldb, provisioning, security, packaging]
requires:
  - phase: 22-01
    provides: Passed artifact/platform and loopback DAP gates.
  - phase: 22-02
    provides: CodeLLDB full-tree provisioner and runtime inventory.
provides:
  - Typed CodeLLDB provision error-envelope regression coverage.
  - Static architecture/checksum boundaries for CodeLLDB native installation.
  - Packed-binary test proving a full pre-staged CodeLLDB cache is reused without network access.
affects: [22-06, 22-07, npm-pack, codelldb]
tech-stack:
  added: []
  patterns: [Native adapter envelope gates, packed-bin cache reuse without cold downloads]
key-files:
  created: []
  modified: [tests/adapters/provision/errorSnapshots.test.ts, tests/architecture/moduleBoundaries.test.ts, tests/packaging/publishedTarball.test.ts, tests/packaging/npxCache.test.ts]
key-decisions:
  - "Reuse shared transport/extractor failure contracts while locking CodeLLDB-specific platform, checksum, and incomplete-tree envelopes."
  - "Prove the published CodeLLDB cache path with a complete pre-staged tree because pinned release checksums prohibit a synthetic packed-child cold install."
patterns-established:
  - "A new native built-in joins both source security audits and a built-tarball cache invocation gate."
requirements-completed: []
duration: 3 min
completed: 2026-06-01
---

# Phase 22 Plan 05: CodeLLDB Security and Packaging Gates Summary

**CodeLLDB provisioning is now guarded by typed failure, native-asset boundary, and actual packed-binary cache tests.**

## Performance

- **Duration:** approximately 3 min plus 81 sec packaging execution
- **Completed:** 2026-06-01T00:00:52Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments

- Locked `codelldb` unsupported-platform, SHA mismatch, and incomplete bundled-runtime outcomes into the established `provision_*` test surface.
- Expanded architecture tests to audit CodeLLDB checksums, ZIP provisioner ownership, and protocol language-neutrality.
- Ran the installed npm tarball CLI against a complete pre-staged CodeLLDB runtime and proved it uses cache without contacting the failing release server.

## Task Commits

1. **Tasks 1-2: Diagnostics, architecture, and shipped-package CodeLLDB gates** - `1a7f0b9` (test)

## Decisions Made

- Shared download/proxy sanitization and safe ZIP extraction errors remain tested once at their common implementation; CodeLLDB-specific tests cover its platform and retained-tree inputs.
- The published-bin gate pre-seeds all Plan 22-02 required paths plus the consent marker, mirroring an approved prior local installation rather than modifying pinned checksums in built code.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- None.

## User Setup Required

None - this plan adds regression gates only.

## Verification

- `tests/adapters/provision/errorSnapshots.test.ts`, `tests/architecture/moduleBoundaries.test.ts`, and `tests/adapters/provision/codelldb.test.ts`: 34 passed.
- `npm run typecheck -- --pretty false`: passed.
- `DAP_CLI_RUN_PACKAGING=1 npx vitest run --no-file-parallelism tests/packaging/`: 5 passed, including installed-bin CodeLLDB no-network cache reuse.
- VS Code diagnostics for changed test files: no current errors.

## Next Phase Readiness

- Ready for Plan 22-06 to route explicit Rust `lldb` launch configuration to CodeLLDB while refusing ambiguous/raw Cargo forms.

---
*Phase: 22-onboard-rust-debugging-through-codelldb-as-a-built-in-adapte*
*Completed: 2026-06-01*