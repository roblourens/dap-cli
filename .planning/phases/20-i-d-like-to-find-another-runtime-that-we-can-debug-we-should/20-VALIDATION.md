---
phase: 20
slug: i-d-like-to-find-another-runtime-that-we-can-debug-we-should
status: planned
nyquist_compliant: true
wave_0_complete: false
created: 2026-05-16
---

# Phase 20 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 3.2.4 plus hand-driven CLI/debug-adapter smoke |
| **Config file** | `vitest.config.ts` |
| **Quick run command** | `npx vitest run tests/config/programInference.test.ts tests/config/launchConfig.test.ts tests/adapters/registry.test.ts` |
| **Full suite command** | `npm run typecheck && npm test && npm run build` |
| **Estimated runtime** | ~30 seconds for quick config coverage; full phase suite measured during execution |

---

## Sampling Rate

- **After every task commit:** Run the narrowest touched Delve/config/setup/docs test command named by that task.
- **After every plan wave:** Run `npx vitest run tests/integration/delveAdapter.test.ts tests/config/programInference.test.ts tests/config/launchConfig.test.ts tests/adapters/registry.test.ts` plus docs validation when docs change.
- **Before `/gsd-verify-work`:** Full suite, Delve adapter smoke coverage, external-project ledger, agent hardening results, and the repo-required hand-driven CLI smoke must be complete.
- **Max feedback latency:** 60 seconds for focused automated checks, excluding explicitly gated real-world repo exercises.

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 20-01-T2/T3 | 20-01 | 1 | DELVE-SETUP | T-20-01 | Delve descriptor stays localhost-only; setup resolves PATH or pinned official Delve with visible diagnostics | unit + setup dry-run | `npx vitest run tests/adapters/delve.test.ts && npm run setup-adapters -- --dry-run` | ❌ planned additions | ⬜ planned |
| 20-02-T1 | 20-02 | 2 | DELVE-CONFIG | T-20-02 | Registry discovery remains lazy and typed | unit | `npx vitest run tests/adapters/registry.test.ts` | ✅ harness exists, cases planned | ⬜ planned |
| 20-02-T2/T3 | 20-02 | 2 | DELVE-CONFIG | T-20-02 | `type: go`, `.go`, Delve attach fields, and resolved relative-program/cwd behavior stay deterministic | unit | `npx vitest run tests/config/launchConfig.test.ts tests/config/programInference.test.ts` | ✅ harness exists, cases planned | ⬜ planned |
| 20-03-T1 | 20-03 | 3 | DELVE-E2E | T-20-03 | Fixture modules remain local, dependency-free, and build/testable | fixture build | `bash -c "test -f tests/fixtures/simple-go-app/main.go && test -f tests/fixtures/simple-go-test/calculate_test.go && test -f tests/fixtures/simple-go-attach/main.go && (cd tests/fixtures/simple-go-test && go test ./...)"` | ❌ planned additions | ⬜ planned |
| 20-03-T2 | 20-03 | 3 | DELVE-E2E | T-20-03 | Launch/test/exec Delve sessions bind locally, inspect paused state, continue, and clean up | real adapter integration | `npx vitest run tests/integration/delveAdapter.test.ts` | ❌ planned addition | ⬜ planned |
| 20-03-T3 | 20-03 | 3 | DELVE-ATTACH | T-20-03 | Local PID attach/disconnect behavior is explicit and test-owned | gated integration | `DAP_CLI_RUN_DELVE_ATTACH_SMOKE=1 npx vitest run tests/integration/delveAdapter.test.ts` | ❌ planned addition | ⚠️ gated |
| 20-04-T1/T2/T3 | 20-04 | 3 | DELVE-DOCS | T-20-04 | Public docs and agent guidance describe only implemented Go/Delve commands and are drift-tested | docs validation | `npx vitest run tests/integration/docsValidation.test.ts` | ✅ harness exists, Go docs planned | ⬜ planned |
| 20-05-T1 | 20-05 | 4 | DELVE-REALWORLD | T-20-05 | External repositories are screened as untrusted before execution | artifact lint | `bash -c "F=.planning/phases/20-i-d-like-to-find-another-runtime-that-we-can-debug-we-should/20-EXTERNAL-PROJECT-CANDIDATES.md && test -f \"$F\" && grep -q 'Candidate Ledger' \"$F\" && [ \"$(grep -c '^| ' \"$F\")\" -ge 9 ]"` | ❌ planned artifact | ⬜ planned |
| 20-05-T2 | 20-05 | 4 | DELVE-REALWORLD | T-20-05 | Result ledger proves four attempts or concrete blockers, SHA/scenario/evidence/cleanup fields included | artifact contract + manual exercise | Plan 20-05 Task 2 Node ledger verifier | ❌ planned artifact | ⚠️ manual execution, automated ledger gate |
| 20-06-T1 | 20-06 | 5 | DELVE-HARDENING | T-20-06 | Ten fresh-agent prompts expose the required report shape before runs begin | artifact lint | `bash -c "F=.planning/phases/20-i-d-like-to-find-another-runtime-that-we-can-debug-we-should/20-SCENARIOS.md && test -f \"$F\" && grep -q 'Scenario Matrix' \"$F\" && grep -q 'cleanup_verified: true|false' \"$F\""` | ❌ planned artifact | ⬜ planned |
| 20-06-T2 | 20-06 | 5 | DELVE-HARDENING | T-20-06 | G-01..G-10 all receive initial results; actionable/fixed gap rows prove preserved rerun evidence | artifact contract + subagent exercise | Plan 20-06 Task 2 Node ledger verifier | ❌ planned artifacts | ⚠️ manual/subagent execution, automated ledger gate |
| 20-06-T3 | 20-06 | 5 | DELVE-HARDENING | T-20-06 | Verify-work gate preserves the mandatory later hand-driven CLI smoke requirement | artifact lint | `bash -c "F=.planning/phases/20-i-d-like-to-find-another-runtime-that-we-can-debug-we-should/20-HARDENING-GAPS.md && grep -q '^## Verify-Work Gate' \"$F\" && grep -q 'dev/smoke/hand-driven-smoke.md' \"$F\" && grep -q '20-UAT.md' \"$F\""` | ❌ planned artifact | ⬜ planned |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] Plan 20-01 creates `src/adapters/builtins/delve.ts`, setup-adapters provisioning, and descriptor tests.
- [ ] Plan 20-02 adds registry/config/inference coverage, including the resolved relative Go `program` path plus `cwd` policy.
- [ ] Plan 20-03 adds fixtures and real Delve launch/test/exec/attach integration coverage.
- [ ] Plan 20-04 adds docs/skill artifacts and docs validation coverage.
- [ ] Plan 20-05 adds external-project candidate/results ledgers with automated evidence-contract checks after the manual repo exercises.
- [ ] Plan 20-06 adds scenario/results/gap ledgers with automated G-01..G-10 and rerun-audit checks after fresh-agent execution.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Real Go/Delve debugging on screened external GitHub projects | DELVE-REALWORLD | The phase explicitly requires representative real-world projects, and fixture-only tests cannot validate install/config/documentation friction. | Shallow-clone screened repos into the phase scratch location chosen by the plan, inspect scripts before execution, run recorded dap-cli scenarios, and capture commands/results in the Phase 20 ledger/UAT artifacts. |
| Agent-driven hardening loop | DELVE-HARDENING | Confusion and task discoverability are properties of fresh-agent usage, not just CLI protocol correctness. | Run the plan's scenario matrix with separate subagents, record pass/fail/confusion evidence, fix actionable gaps, and rerun failed scenarios or record an honest blocker. |
| Repo-required bundled CLI smoke | DELVE-E2E | Repo policy requires `/gsd-verify-work` to drive the published CLI by hand and capture verbatim output; Vitest is not a substitute. | Execute `dev/smoke/hand-driven-smoke.md` Sequence A and Sequence B in a real terminal during verify-work and paste verbatim output into `20-UAT.md`. |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 60s for focused checks
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** validation map synchronized with Plans 20-01 through 20-06; implementation and gated/manual evidence remain pending execution.