---
phase: 20-i-d-like-to-find-another-runtime-that-we-can-debug-we-should
plan: 05
subsystem: validation
tags: [go, delve, external-projects, evidence, hardening]

requires:
  - phase: 20-04
    provides: Public and agent-facing Go/Delve setup and workflow guidance
provides:
  - Eight-candidate public Go repository safety screen under an explicit untrusted-input policy
  - Four grouped, SHA-pinned real-repo Delve attempt records covering debug, test, and exec scenarios
  - Plan 20-06 handoff note for evaluator rejection versus scopes/variables fallback guidance
affects: [fresh-agent-hardening, go-delve-guidance, external-validation]

tech-stack:
  added: []
  patterns: [isolated DAP_CLI_HOME per attempt, SHA-pinned external evidence, grouped attempt ledgers]

key-files:
  created:
    - .planning/phases/20-i-d-like-to-find-another-runtime-that-we-can-debug-we-should/20-EXTERNAL-PROJECT-CANDIDATES.md
    - .planning/phases/20-i-d-like-to-find-another-runtime-that-we-can-debug-we-should/20-EXTERNAL-PROJECT-RESULTS.md
  modified: []

key-decisions:
  - "External execution stayed inside tmp/phase-20-external-go-projects with shallow clones and per-attempt adapter homes."
  - "Selected attempts favored deterministic package launch, package test, and symbol-friendly exec flows over unsafe cloud/Docker/network surfaces discovered during screening."
  - "Direct Delve evaluate failures on two real test frames were recorded plainly while scopes/variables remained the durable inspection proof."

patterns-established:
  - "External validation records use standalone grouped attempt fields so plan checkers can audit SHA, result, scenario, evidence, and cleanup deterministically."

requirements-completed: []

duration: not-recorded-inline
completed: 2026-05-17
---

# Phase 20 Plan 05: External Go Project Validation Summary

**Phase 20 now has real public Go project evidence: eight repositories screened, four distinct repos fully debugged through Delve, and every successful attempt recorded with SHA-pinned grouped proof.**

## Performance

- **Duration:** not recorded by the inline execute runner
- **Started:** not recorded by the inline execute runner
- **Completed:** 2026-05-17T06:58:10Z
- **Tasks:** 2
- **Files created:** 2

## Accomplishments

- Screened eight public Go repositories under explicit untrusted-input rules and recorded safety notes for cloud/Docker subtrees, curl-pipe guidance, service examples, and network-sensitive CLI behavior.
- Fully attempted four selected repos: `golang/example`, `google/go-cmp`, `tidwall/gjson`, and `rakyll/hey`.
- Proved Delve package launch, Delve test mode across two different packages, and Delve exec mode against a symbol-friendly prebuilt binary, each with verified breakpoints, paused stack/local inspection, and cleanup.
- Captured setup and operational reality instead of hiding it: isolated homes need adapter provisioning, controllers must be started, Go test runs can expose many goroutines, and direct evaluator expressions may fail even when locals inspection succeeds.

## Task Commits

1. **Task 1: Screen public Go candidates** - `ffac229` (docs)
2. **Task 2: Record external Go attempt evidence** - `afd66af` (docs)
3. **Task 2 follow-up: Normalize grouped results ledger for exact verifier shape** - `8e94f30` (docs)

## Files Created

- `.planning/phases/20-i-d-like-to-find-another-runtime-that-we-can-debug-we-should/20-EXTERNAL-PROJECT-CANDIDATES.md` - Eight-repo safety screen, scenario classification, selection rationale, and blocked-surface notes.
- `.planning/phases/20-i-d-like-to-find-another-runtime-that-we-can-debug-we-should/20-EXTERNAL-PROJECT-RESULTS.md` - Four standalone grouped attempt records with URL, SHA, result, config, breakpoint, commands, evidence, doc-gap notes, and cleanup status.

## Decisions Made

- The execution set deliberately avoided unsafe or ambiguous candidate surfaces: no App Engine/cloud sample, Docker/vector DB stack, curl-pipe tool installer, benchmark HTTP target, or unreviewed Makefile hook was run.
- `GOTOOLCHAIN=go1.24.0` remained the supported verification path for Delve `v1.26.3`, matching the docs from Plan 20-04.
- The results ledger treats `evaluate` rejection as an observed adapter behavior to hand forward, not as a reason to discard otherwise successful breakpoint/stack/locals validation.

## Deviations from Plan

- None in scope. The results ledger needed one follow-up commit after the first write to match the plan's exact standalone `attempt_id:` grouped-record verifier shape.

## Issues Encountered

- Fresh isolated adapter homes correctly returned `delve_not_found` until `npm run setup-adapters` provisioned Delve into the attempt-owned cache.
- Fresh attempt homes also required an explicit `dap-cli start` before launch.
- Two real test-frame `evaluate` calls (`x` in go-cmp, `path` in gjson) returned Delve `dap_request_failed`; both sessions still exposed the target values through `scopes` plus `variables`.

## Verification

- Candidate ledger shell verification passed: file exists, includes `Candidate Ledger`, has at least eight candidate rows, names `untrusted`, and records `tmp/phase-20-external-go-projects`.
- Results ledger passed the plan's exact Node grouped-record verifier, including `Result Ledger`, four complete `attempt_id:` blocks, allowed result labels, 40-hex SHAs, evidence fields, and cleanup booleans.
- Four external attempts completed with `cleanup --purge` and `stop-controller` after the recorded debug workflow.

## Next Phase Readiness

- Plan 20-06 can use these real-repo transcripts to test whether fresh agents choose the right Go/Delve mode, controller/setup sequence, thread selection, and scopes/variables fallback.
- The only clear guidance candidate to carry forward is whether agent-facing Go/Delve docs should mention that direct evaluator expressions can be rejected on real Delve test frames while locals remain inspectable through standard DAP scopes/variables.

## Self-Check: PASSED

- Candidate and results ledgers are present and verifier-compatible.
- Four distinct public Go repositories were actually attempted, not substituted with blockers.
- Evidence stays local, bounded, and classified without hiding adapter diagnostics.

---
*Phase: 20-i-d-like-to-find-another-runtime-that-we-can-debug-we-should*
*Completed: 2026-05-17*