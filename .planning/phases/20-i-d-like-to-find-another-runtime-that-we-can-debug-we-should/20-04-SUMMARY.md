---
phase: 20-i-d-like-to-find-another-runtime-that-we-can-debug-we-should
plan: 04
subsystem: docs
tags: [go, delve, docs, skills, validation]

requires:
  - phase: 20-03
    provides: Verified Delve launch/test/exec/attach behavior and compatibility findings
provides:
  - Public Delve setup, selection, launch, attach, and troubleshooting docs
  - Dedicated Go/Delve agent reference linked from skill entry points
  - Docs validation coverage for Delve public terms and Go reference command examples
affects: [external-project-validation, fresh-agent-hardening]

tech-stack:
  added: []
  patterns: [docs backed by integration-proven command shapes, narrow drift assertions]

key-files:
  created:
    - dap-cli/skills/dap-cli/references/go-delve.md
  modified:
    - docs/adapter-setup.md
    - dap-cli/skills/dap-cli/SKILL.md
    - dap-cli/skills/dap-cli/references/agent-workflows.md
    - tests/integration/docsValidation.test.ts

key-decisions:
  - "Docs state Delve v1.26.3's supported Go 1.24+ expectation instead of suggesting --check-go-version=false."
  - "Docs distinguish debuggee cwd from Delve build dlvCwd because real package launches require the build working directory to be correct."

patterns-established:
  - "Language-specific agent guidance lives under skill references and is linked from both the top-level skill index and agent workflow index."

requirements-completed: []

duration: not-recorded-inline
completed: 2026-05-17
---

# Phase 20 Plan 04: Go / Delve Guidance Summary

**The Delve runtime is now documented for humans and fresh agents, and Phase 20-specific setup/reference terms are pinned by automated docs validation.**

## Performance

- **Duration:** not recorded by the inline execute runner
- **Started:** not recorded by the inline execute runner
- **Completed:** 2026-05-17T06:49:50Z
- **Tasks:** 3
- **Files modified:** 5

## Accomplishments

- Extended public adapter setup guidance with Delve provisioning, Go inference, package/debug/test/exec/local-attach command shapes, attach lifecycle facts, and troubleshooting.
- Added `go-delve.md` so a fresh agent can choose the right launch mode, attach safely, inspect paused state, and recover from Delve-specific failures.
- Wired the Go reference into `SKILL.md` and `agent-workflows.md`, then extended docs validation to parse its commands and pin the public terms `Delve`, `delve_not_found`, `processId`, and `go-delve.md`.

## Task Commits

Each task was committed atomically:

1. **Task 1: Document Delve setup, Go adapter discovery, and troubleshooting** - `a7e8480` (docs)
2. **Task 2: Add Go/Delve agent skill guidance and workflow index links** - `8c8b09b` (docs)
3. **Task 3: Pin Go/Delve docs terms with docs-validation tests** - `a129431` (test)

## Files Created/Modified

- `docs/adapter-setup.md` - Human-facing Delve setup, commands, attach semantics, and troubleshooting.
- `dap-cli/skills/dap-cli/references/go-delve.md` - Agent-facing Go/Delve debugging reference.
- `dap-cli/skills/dap-cli/SKILL.md` and `references/agent-workflows.md` - Reference discoverability.
- `tests/integration/docsValidation.test.ts` - Go reference command validation and Delve drift checks.

## Decisions Made

- Setup/docs explain the actual supported path from Plan 20-03: Go 1.24+ for Delve `v1.26.3`, `cwd` plus `dlvCwd` for package builds, symbol-friendly `exec` builds, and local PID attach only.
- The docs gate remains narrow. It validates command examples through the existing parser and pins high-value Phase 20 terms instead of snapshotting prose.

## Deviations from Plan

None - plan executed as written using implementation facts from Plan 20-03.

## Issues Encountered

None beyond incorporating Plan 20-03's verified Delve compatibility and working-directory findings into the docs.

## User Setup Required

None for the repository change. Users following the new docs still need a supported Go toolchain for Delve `v1.26.3` debugging.

## Verification

- Required grep checks for setup docs and Go skill reference passed.
- `npx vitest run tests/integration/docsValidation.test.ts` passed with 9 tests.
- Editor diagnostics were clean for the edited docs-validation test and newly created Go/Delve reference.

## Next Phase Readiness

- Plan 20-05 can now test public Go projects against code and docs that agree on real setup, build, launch, and inspection rules.
- Plan 20-06 can hand a fresh agent `SKILL.md`, `agent-workflows.md`, and `go-delve.md` without undocumented implementation trivia.

## Self-Check: PASSED

- Go/Delve guidance is discoverable from both skill entry points required by the plan.
- Docs validation includes the new Go reference in the existing command-fence parser.

---
*Phase: 20-i-d-like-to-find-another-runtime-that-we-can-debug-we-should*
*Completed: 2026-05-17*