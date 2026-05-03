---
phase: 4
slug: agent-workflow-documentation-and-self-hosting-verification
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-05-03
---

# Phase 4 - Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 3.2.4 with TypeScript tests |
| **Config file** | `vitest.config.ts`; lint via `eslint.config.js`; typecheck via `tsconfig.json` |
| **Quick run command** | `npm test -- tests/integration/fakeAdapterCli.test.ts` or the narrowest new Phase 4 integration file |
| **Full suite command** | `npm run check` |
| **Estimated runtime** | Use targeted Vitest files for task feedback; reserve `npm run check` for wave and phase gates |

---

## Sampling Rate

- **After every task commit:** Run the narrowest relevant targeted command, such as `npm test -- tests/integration/fakeAdapterCli.test.ts`, a new self-hosting test file, or a new Playwright interop test file.
- **After every plan wave:** Run `npm run typecheck`, `npm run lint`, and the targeted integration tests touched by that wave.
- **Before `/gsd-verify-work`:** `npm run check` must pass; real adapter and Playwright interop commands must run once the provisioning path makes them default-runnable.
- **Max feedback latency:** Use targeted one-shot commands for inner loops; avoid watch mode and blocking waits.

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 04-01-01 | 04-01 | 0 | AGNT-04, AGNT-05 | T-04-docs / T-04-shell | Examples use localhost/simple fixture paths and do not interpolate untrusted shell input | docs verification + CLI smoke | `npm test -- tests/integration/fakeAdapterCli.test.ts` plus docs/example validation created in Wave 0 | Partial | pending |
| 04-02-01 | 04-02 | 0 | D-04, D-08 support | T-04-supply-chain / T-04-debugpy-listener | Adapter setup pins versions/sources and does not expose debug listeners publicly by default | adapter readiness smoke | `npm test -- tests/integration/jsDebugAdapter.test.ts tests/integration/debugpyAdapter.test.ts` | Partial | pending |
| 04-03-01 | 04-03 | 0 | TEST-06 | T-04-session-cleanup / T-04-process-leak | Self-hosting tests isolate `DAP_CLI_HOME` and clean up controller/adapter processes | integration/self-hosting smoke | `npm test -- tests/integration/selfHosting.test.ts` | Missing - W0 | pending |
| 04-04-01 | 04-04 | 0 | AGNT-04, TEST-07 | T-04-browser-race / T-04-session-cleanup | Playwright actions occur only after debugger setup; tests use deterministic single-worker execution and cleanup | Playwright interop integration | `npm test -- tests/integration/playwrightInterop.test.ts` or `npx playwright test <interop spec> --project=chromium --workers=1` if Playwright Test is chosen | Missing - W0 | pending |

*Status: pending, green, red, flaky*

---

## Wave 0 Requirements

- [ ] `tests/integration/selfHosting.test.ts` or equivalent - covers TEST-06 with a fixture-first workflow and one narrow dap-cli-debugs-dap-cli capstone.
- [ ] `tests/integration/playwrightInterop.test.ts` or equivalent - covers AGNT-04 and TEST-07 with deterministic Playwright-driven interaction plus dap-cli polling/inspection.
- [ ] Docs/example validation strategy - covers AGNT-04 and AGNT-05 by checking command examples against the generated CLI/help surface or extracting reusable snippets.
- [ ] Built-in adapter readiness/provisioning test updates - converts existing js-debug/debugpy smoke coverage from availability-gated to default-runnable once the setup mechanism exists.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Final documentation readability and agent ergonomics | AGNT-04, AGNT-05 | Automated snippet checks can verify command names, but final docs need a human/agent pass for flow clarity | Read README and focused docs; confirm the first debug loop is quick, polling-only semantics are explicit, and deeper workflows are linked rather than overwhelming the README |
| Exploratory debugging discoveries recorded durably | TEST-07 | Organic discoveries depend on what exploration finds | During Phase 4 exploratory work, confirm unrelated discoveries are recorded in `.planning/BACKLOG.md` or a phase-local follow-up artifact |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency is managed with targeted one-shot commands
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
