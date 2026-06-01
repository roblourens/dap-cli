---
phase: 22-onboard-rust-debugging-through-codelldb-as-a-built-in-adapte
plan: 08
subsystem: documentation
tags: [rust, codelldb, documentation, skill, setup]
requires:
  - phase: 22-01
    provides: Official VSIX/platform and loopback transport scope.
  - phase: 22-07
    provides: Real Rust launch, named configuration, and safe owned attach evidence.
provides:
  - README inventory and setup documentation for verified Rust/CodeLLDB behavior.
  - Fresh-agent Rust CodeLLDB reference linked from the primary skill.
  - Documentation regression tests for the explicit binary and limitation contract.
affects: [22-09, 22-10, rust-agent-workflows]
tech-stack:
  added: []
  patterns: [Evidence-backed agent documentation, documentation limitation assertions]
key-files:
  created: [dap-cli/skills/dap-cli/references/rust-codelldb.md]
  modified: [README.md, docs/adapter-setup.md, dap-cli/skills/dap-cli/SKILL.md, tests/integration/docsValidation.test.ts]
key-decisions:
  - "CodeLLDB docs advertise only direct official-source `darwin_arm64` local caching and do not extend generic offline/mirror guidance to its VSIX payload."
  - "Rust guidance always builds first and targets an explicit executable; raw `.rs` inference and VS Code `cargo` objects are documented as rejected."
patterns-established:
  - "A native adapter reference names trusted acquisition, safe execution boundaries, state-inspection loop, attach limits, and public-repository screening."
requirements-completed: []
duration: 2 min
completed: 2026-06-01
---

# Phase 22 Plan 08: Rust CodeLLDB Documentation Summary

**Agents can now discover and follow the verified Rust CodeLLDB path without inferring unsupported Cargo, source-file, platform, or distribution behavior.**

## Performance

- **Duration:** approximately 2 min
- **Completed:** 2026-06-01T00:10:41Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments

- Corrected README from three to four built-in adapters and added concise Rust/CodeLLDB setup discoverability.
- Documented CodeLLDB `v1.12.2`, the verified `darwin_arm64` full-runtime cache, direct official-source-only acquisition, explicit compiled executable workflow, Cargo/no-`.rs` limitations, and evidenced owned-PID attach boundary.
- Added a Rust/CodeLLDB skill reference with build, launch/config, inspection, cleanup, diagnostic, and public-project screening guidance; linked it from the primary skill.
- Added documentation validation assertions for the new public contract and command examples.

## Task Commits

1. **Tasks 1-2 RED: Rust documentation contract checks** - `11fa52d` (test)
2. **Tasks 1-2 GREEN: README, setup, and skill/reference guidance** - `283bf5c` (docs)

## Decisions Made

- Existing offline/pre-staged cache wording was qualified because the approved CodeLLDB scope does not permit dap-cli to advertise an offline-distributed or mirrored VSIX path.
- The skill reference states the evidenced owned local attach pass while explicitly excluding unrelated PID access, policy changes, remote debug, and generic native-language claims.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- VS Code temporarily retained RED documentation test diagnostics after the green run; refreshed diagnostics are clear.

## User Setup Required

None - the new reference explains the optional `dap-cli setup-adapters --adapter codelldb --yes` prewarm command.

## Verification

- `tests/integration/docsValidation.test.ts`: 12 passed.
- VS Code diagnostics for the changed documentation test: no current errors after refresh.

## Next Phase Readiness

- Ready for Plan 22-09 to screen public Rust candidates before delegating isolated, SHA-pinned real-project attempts.

---
*Phase: 22-onboard-rust-debugging-through-codelldb-as-a-built-in-adapte*
*Completed: 2026-06-01*