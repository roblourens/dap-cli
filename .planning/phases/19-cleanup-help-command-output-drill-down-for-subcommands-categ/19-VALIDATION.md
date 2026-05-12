---
phase: 19
slug: cleanup-help-command-output-drill-down-for-subcommands-categ
status: approved
nyquist_compliant: true
wave_0_complete: true
created: 2026-05-12
---

# Phase 19 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 3.2.4 |
| **Config file** | `vitest.config.ts` |
| **Quick run command** | `npx vitest run tests/cli/helpCommand.test.ts` |
| **Full suite command** | `npm test` |
| **Estimated runtime** | ~25 seconds (full suite); helpCommand suite < 2s |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run tests/cli/helpCommand.test.ts`
- **After every plan wave:** Run `npm test`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** ~25 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 19-01-01 | 01 | 1 | HELP-01 | — | `dap-cli --help` and `dap-cli help` exit 0 with no JSON envelope | unit | `npx vitest run tests/cli/helpCommand.test.ts -t "no JSON envelope"` | ✅ | ✅ green |
| 19-01-02 | 01 | 1 | HELP-02 (drill-down) | — | `help <cmd> <subcmd>` walks Command tree, prints leaf help | unit | `npx vitest run tests/cli/helpCommand.test.ts -t "drills into the subcommand tree"` | ✅ | ✅ green |
| 19-01-03 | 01 | 1 | HELP-02 (unknown path) | T-19-02 | Unknown drill-down path emits a single, well-formed `usage_error` JSON envelope (no shell/eval/template injection) | unit | `npx vitest run tests/cli/helpCommand.test.ts -t "unknown drill-down path emits usage_error envelope"` | ✅ | ✅ green |
| 19-01-04 | 01 | 1 | HELP-02 (`-h` flag regression) | — | `<cmd> <subcmd> -h` still prints leaf help via commander `-h` | unit | `npx vitest run tests/cli/helpCommand.test.ts -t "drill-down regression"` | ✅ | ✅ green |
| 19-02-01 | 02 | 1 | HELP-03 (headings) | — | All seven D-03 category headings render in `dap-cli help` | unit | `npx vitest run tests/cli/helpCommand.test.ts -t "seven category headings"` | ✅ | ✅ green |
| 19-02-02 | 02 | 1 | HELP-03 (membership) | — | Each public command appears under its assigned heading and not elsewhere (HELP_CATEGORIES table) | unit | `npx vitest run tests/cli/helpCommand.test.ts -t "command appears under its assigned heading"` | ✅ | ✅ green |
| 19-02-03 | 02 | 1 | HELP-03 (hidden) | T-19-04 | `serve-controller` hidden command stays invisible in help output | unit | `npx vitest run tests/cli/helpCommand.test.ts -t "serve-controller"` | ✅ | ✅ green |
| 19-02-04 | 02 | 1 | HELP-02 (regression under categories) | — | Drill-down still works after categorization | unit | `npx vitest run tests/cli/helpCommand.test.ts -t "drill-down still works"` | ✅ | ✅ green |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

Total: 9 vitest cases in `tests/cli/helpCommand.test.ts` (5 from plan 19-01 + 4 from plan 19-02). Last full run: 40 files passed, 492 tests / 7 skipped.

---

## Wave 0 Requirements

Existing infrastructure covers all phase requirements. `tests/cli/helpCommand.test.ts` was created in plan 19-01 commit `619170e` and extended in plan 19-02 commit `e52a0e8`; no new framework, fixtures, or harness additions were required.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Cold-start build renders categorized help end-to-end through the bundled CLI binary | HELP-01 / HELP-02 / HELP-03 | Repo policy (`copilot-instructions.md`) requires hand-driven CLI smoke for every `/gsd-verify-work` round; vitest cases exercise the in-process Command tree via `createProgram()`, not the published `dist/index.js`. | `npm run build && node dist/index.js help` then `... help breakpoints set` then `... help bogus` (exit 2). Captured verbatim in `19-UAT.md` § Hand-Driven CLI Smoke. |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references (none — pre-existing harness sufficient)
- [x] No watch-mode flags (`vitest run`, not `vitest`)
- [x] Feedback latency < 30s (full suite ~25s)
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-05-12

---

## Validation Audit 2026-05-12

| Metric | Count |
|--------|-------|
| Gaps found | 0 |
| Resolved | 0 |
| Escalated | 0 |

All 3 phase requirements (HELP-01, HELP-02, HELP-03) mapped to 8 automated vitest cases (the 9th case `subcommand stream propagation` is incidental coverage of the main.ts `configureSubcommandOutputs` path established in plan 19-01). Hand-driven CLI smoke is documented as manual-only by repo policy and is captured in `19-UAT.md`.
