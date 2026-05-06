---
phase: 06
slug: add-conditional-breakpoint-playwright-interop-coverage
status: draft
nyquist_compliant: true
wave_0_complete: true
created: 2026-05-05
---

# Phase 06 - Validation Strategy

## Test Infrastructure

| Property | Value |
|----------|-------|
| Framework | Vitest |
| Config file | `vitest.config.ts` |
| Quick run command | `npm test -- tests/integration/fakeAdapterCli.test.ts` |
| Full suite command | `npm run typecheck && npm test -- tests/integration/fakeAdapterCli.test.ts tests/controller/sessionManager.test.ts tests/integration/playwrightInterop.test.ts tests/integration/docsValidation.test.ts` |
| Estimated runtime | Focused tests under normal repo test timing; gated browser smoke depends on local Chrome/js-debug availability |

## Sampling Rate

- After every task commit: run the task's focused Vitest command.
- After every plan wave: run the focused commands for completed plans in that wave.
- Before `/gsd-verify-work`: run `npm run typecheck`, focused Phase 6 tests, and the repo hard-rule hand-driven smoke from `docs/HAND-DRIVEN-SMOKE.md` Sequence A and Sequence B.
- Max feedback latency: one focused test command per task before broad checks.

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 06-01-01 | 01 | 1 | DBG-01 | T-06-01-01 | CLI metadata is explicit user input only and remains DAP-shaped | integration | `npm test -- tests/integration/fakeAdapterCli.test.ts` | yes | pending |
| 06-01-02 | 01 | 1 | DBG-01 | T-06-01-01 | Alias emits condition/hitCondition/logMessage without unsafe casts | integration | `npm test -- tests/integration/fakeAdapterCli.test.ts` | yes | pending |
| 06-02-01 | 02 | 2 | TEST-05 | T-06-02-01 | Child routing preserves but does not interpret breakpoint metadata | unit | `npm test -- tests/controller/sessionManager.test.ts` | yes | pending |
| 06-02-02 | 02 | 2 | DBG-01 | T-06-02-01 | Routing fixes, if needed, are limited to production controller code | unit | `npm test -- tests/controller/sessionManager.test.ts` | yes | pending |
| 06-03-01 | 03 | 3 | TEST-07 | T-06-03-01 | Gated browser smoke uses local fixture and cleans up sessions | integration | `DAP_CLI_RUN_CHROME_PLAYWRIGHT_HANDOFF=1 npm test -- tests/integration/playwrightInterop.test.ts` | yes | pending |
| 06-03-02 | 03 | 3 | AGNT-04 | T-06-03-02 | Docs avoid secrets and preserve polling-only workflow | docs | `npm test -- tests/integration/docsValidation.test.ts` | yes | pending |

## Wave 0 Requirements

Existing Vitest, fake adapter, js-debug, Playwright, and docs validation infrastructure covers Phase 6. No Wave 0 scaffold is required.

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Published CLI hand-driven smoke | TEST-07 | Repo hard rule requires the orchestrator to drive `docs/HAND-DRIVEN-SMOKE.md` Sequence A and Sequence B during verify-work | Run both sequences with the published `./bin/dap-cli`/built CLI contract and record verbatim output in the phase UAT |

## Validation Sign-Off

- [x] All tasks have automated verify commands.
- [x] Sampling continuity covers every task.
- [x] Wave 0 is not needed because infrastructure already exists.
- [x] No watch-mode flags.
- [x] `nyquist_compliant: true` set in frontmatter.

Approval: pending execution
