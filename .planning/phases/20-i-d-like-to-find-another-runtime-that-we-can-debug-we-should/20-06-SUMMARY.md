---
phase: 20-i-d-like-to-find-another-runtime-that-we-can-debug-we-should
plan: 06
subsystem: hardening
tags: [go, delve, agents, setup, docs, validation]

requires:
  - phase: 20-05
    provides: Screened public Go repo attempts and real Delve evidence
provides:
  - Ten-scenario fresh-agent Go/Delve matrix with one initial result per prompt
  - Appended rerun audit trail for fixed product/docs gaps
  - Setup-adapters partial-debugpy-venv recovery and safer spawn failure diagnostics
  - Final Phase 20 verify-work gate preserving hand-driven CLI smoke requirements
affects: [verify-work, adapter-setup, go-delve-guidance]

tech-stack:
  added: []
  patterns: [fresh-agent initial-plus-rerun audit trail, classify-before-fix gap ledger, scratch recovery verification]

key-files:
  created:
    - .planning/phases/20-i-d-like-to-find-another-runtime-that-we-can-debug-we-should/20-SCENARIOS.md
    - .planning/phases/20-i-d-like-to-find-another-runtime-that-we-can-debug-we-should/20-RESULTS.md
    - .planning/phases/20-i-d-like-to-find-another-runtime-that-we-can-debug-we-should/20-HARDENING-GAPS.md
  modified:
    - scripts/setup-adapters.ts
    - dap-cli/skills/dap-cli/references/go-delve.md

key-decisions:
  - "Fresh-agent hardening kept first attempts and reruns separate so the plan shows both the original confusion and the post-fix outcome."
  - "setup-adapters repairs partial debugpy virtualenvs instead of turning an interrupted prior install into a sticky failure for later Go-only work."
  - "Thread/stopped-thread clarity remains queued follow-up work instead of receiving an unverified opportunistic fix inside Plan 20-06."

patterns-established:
  - "A fixed hardening gap needs a preserved same-prompt rerun or it remains follow-up, not declared solved."

requirements-completed: []

duration: not-recorded-inline
completed: 2026-05-17
---

# Phase 20 Plan 06: Fresh-Agent Go / Delve Hardening Summary

**Phase 20's final execution plan turned Go/Delve support into a fresh-agent workflow test, fixed the concrete setup/docs gaps it exposed, and preserved the later hand-driven UAT gate instead of treating hardening as UAT.**

## Performance

- **Duration:** not recorded by the inline execute runner
- **Started:** not recorded by the inline execute runner
- **Completed:** 2026-05-17T07:10:00Z
- **Tasks:** 3
- **Tracked files created/modified:** 5

## Accomplishments

- Authored ten concrete scenario prompts spanning readiness, repo fixtures, exec, attach, launch configs, screened external repos, negative diagnostics, and docs-only novice comprehension.
- Executed ten initial fresh-agent attempts and preserved all fixed-gap reruns separately in `20-RESULTS.md`.
- Fixed repeated doc gaps around `--stop-on-entry` for short-lived Go flows, evaluate-to-locals fallback, and the exact non-terminating attach disconnect command.
- Hardened `setup-adapters` so missing child-process stderr no longer crashes error formatting and partial debugpy virtualenvs missing pip are rebuilt automatically.
- Recorded the final verify-work gate requiring later real-terminal Sequence A/B capture in `20-UAT.md`.

## Task Commits

1. **Task 1: Author fresh-agent scenario matrix** - `2557ebd` (docs)
2. **Task 2 repair: Harden setup diagnostics and Go reference** - `c33691d` (fix)
3. **Task 2 repair: Rebuild partial debugpy virtualenvs** - `e8b3eb0` (fix)
4. **Tasks 2-3: Capture results, gaps, reruns, and verify-work handoff** - `3bd7ca9` (docs)

## Files Created/Modified

- `20-SCENARIOS.md` - Ten self-contained fresh-agent prompts and fixed report contract.
- `20-RESULTS.md` - Ten initial scenario reports plus appended same-prompt reruns for fixed gaps.
- `20-HARDENING-GAPS.md` - Product/docs classifications, repair routing, queued follow-up, and verify-work handoff.
- `scripts/setup-adapters.ts` - Safe spawn failure detail extraction and partial-venv recreation.
- `dap-cli/skills/dap-cli/references/go-delve.md` - Short-lived stop-on-entry advice, attach disconnect command, and evaluate fallback.

## Decisions Made

- Product/docs findings from passing scenarios still count as hardening gaps when they forced recoveries that a fresh agent should not have to invent.
- The setup bug was repaired at the recovery boundary, not just rephrased: a partial venv now gets recreated before pip install.
- The remaining `stoppedThreadIds: []` versus starred thread output and one controller-stop observation stay visible as `queued_follow_up` because this plan did not root-cause them.

## Deviations from Plan

- None in scope. Some initial scenarios passed while still surfacing actionable confusion; the plan's classify/fix/rerun loop handled those findings without reclassifying the original successful execution as a failure.

## Issues Encountered

- Fresh agents exposed setup interruption behavior that normal orchestrator setup did not reproduce until partial-venv recovery was intentionally replayed in scratch.
- `npm run typecheck` was attempted after the first hardening edit and still reports pre-existing `tests/adapters/delve.test.ts` optional-diagnostics strictness errors at lines 29-30; those are outside the Plan 20-06 edits.
- Focused Go breakpoint stops still showed thread-selection ergonomics worth a follow-up investigation.

## Verification

- Plan 20-06 exact Node verifier passed for ten `initial_result:` markers plus rerun audit coverage.
- Verify-work gate grep checks passed for `Sequence A`, `Sequence B`, `dev/smoke/hand-driven-smoke.md`, and `20-UAT.md`.
- `npx vitest run tests/integration/docsValidation.test.ts` passed with 9 tests.
- Fresh scratch setup replay passed twice after deleting `venv/bin/pip`, proving automatic partial-venv recovery.
- Editor diagnostics were clean for `scripts/setup-adapters.ts` after both code fixes.

## Next Phase Readiness

- Phase 20 execution plans are complete at 6/6. The next workflow step is `/gsd-verify-work`, including the mandatory hand-driven CLI smoke capture.
- GAP-20-06-05 remains a clear follow-up option for thread/status/controller polish if Rob wants a focused post-phase fix before or after UAT.

## Self-Check: PASSED

- Fresh-agent scenarios, result ledgers, rerun trail, gap classifications, and verify-work handoff all exist.
- Fixed gaps have same-prompt rerun evidence rather than erased originals.
- Remaining uncertainty is named explicitly instead of hidden in a broad success claim.

---
*Phase: 20-i-d-like-to-find-another-runtime-that-we-can-debug-we-should*
*Completed: 2026-05-17*