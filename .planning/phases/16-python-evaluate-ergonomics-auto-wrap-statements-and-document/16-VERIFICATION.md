---
phase: 16-python-evaluate-ergonomics-auto-wrap-statements-and-document
status: PASS
verified: 2026-05-09
verifier: inline (no gsd-verifier agent installed in this workspace)
---

# Phase 16 Verification

Goal-backward verification that the codebase actually delivers what Phase 16 promised.

## Phase goal (from ROADMAP)

Eliminate the debugpy `evaluate`-is-expression-only footgun (`SyntaxError` on `import`/`x = 1`/multi-statement) by auto-wrapping detected statements in `exec(...)` at the controller layer, and document three high-friction agent gotchas: the launch-vs-attach verb (with no `--request` flag), the Python evaluate auto-wrap rule, and the playwright-cli daemon recovery.

## Requirement-by-requirement

### PYEVAL-01 — auto-wrap statement-shaped Python on debugpy evaluate

- **Closed by:** Plan 16-01.
- **Evidence in code:** `src/controller/pythonExpressionDetector.ts` (heuristic) + `src/controller/server.ts` `maybePythonEvaluateRewrite` (gating + wrap).
- **Evidence in tests:**
  - `tests/controller/pythonExpressionDetector.test.ts` — 61 unit tests pin every statement keyword and expression negative.
  - `tests/controller/dapRequestRouting.test.ts` — 5 end-to-end tests through `dap.start` + `dap.request` IPC: positive wrap, expression passthrough, non-debugpy passthrough, opt-out (`context: 'no-auto-wrap'`), SyntaxError-fallback envelope upgrade.
- **Verdict:** ✅ PASS.

### PYEVAL-02 — document the rule on every agent-facing surface

- **Closed by:** Plan 16-02 Tasks 1 & 2.
- **Evidence in docs:**
  - `docs/AGENT-WORKFLOWS.md` `### Python (debugpy) evaluate` — wrap rule, three worked examples, opt-out, fallback envelope shape.
  - `README.md` — one-paragraph callout linking to AGENT-WORKFLOWS anchor `#python-debugpy-evaluate`.
  - `~/.copilot/skills/dap-cli/SKILL.md` `## Python (debugpy) evaluate` (out-of-repo).
  - `~/.copilot/skills/dap-cli/references/agent-workflows.md` `### Python (debugpy) evaluate` (out-of-repo).
  - User memory `/memories/dap-cli.md` updated with Phase 16+ note under existing BAD/GOOD example.
- **Evidence in CI gate:** `tests/integration/docsValidation.test.ts` `Phase 16 docs` describe block — first `it()` asserts AGENT-WORKFLOWS.md contains `evaluate_requires_exec`, `exec(`, `debugpy`. Passes.
- **Verdict:** ✅ PASS.

### VERB-DOC-01 — explicit "no --request flag" rule on launch vs attach

- **Closed by:** Plan 16-02 Task 1 (in-repo) + Task 2 (skill mirror).
- **Evidence in docs:**
  - `docs/AGENT-WORKFLOWS.md` `## Choosing launch vs attach` — first bullet now reads "There is no `--request` flag — do not search for one."
  - `~/.copilot/skills/dap-cli/SKILL.md` `## launch.json: launch vs attach` — same rule.
  - `~/.copilot/skills/dap-cli/references/agent-workflows.md` `## Choosing launch vs attach` — same rule.
- **Evidence in CI gate:** `docsValidation.test.ts` second `Phase 16 docs` `it()` asserts `dap-cli launch` AND `dap-cli attach` AND `/no .{0,15}--request.{0,15}flag/i`. Passes.
- **Verdict:** ✅ PASS.

### PWDOC-01 — playwright-cli daemon recovery recipe

- **Closed by:** Plan 16-02 Task 1.
- **Evidence in docs:** `docs/PLAYWRIGHT-INTEROP.md` `### Recovering from a dead playwright-cli daemon` — symptom (`not open, please run open first`), recovery (`pkill -f playwright-cli` → `playwright-cli open <url>`), explicit warning against socket-file deletion.
- **Evidence in CI gate:** `docsValidation.test.ts` third `Phase 16 docs` `it()` asserts `not open, please run open first` AND `/pkill|kill .*playwright|killing/i`. Passes.
- **Verdict:** ✅ PASS.

## Regression gate

- `npx vitest run` → **460 passed | 7 skipped (467 total) across 39 files**, run at 2026-05-09 15:01 PT.
- Baseline at start of phase was ≥391 passing — well above. New additions: 61 (detector) + 5 (routing) + 3 (docsValidation Phase-16 block) = 69 net-new tests, all passing.

## Threat model coverage

All threats from `16-01-PLAN.md` and `16-02-PLAN.md` are addressed (T-16-01..T-16-07). See per-plan SUMMARY.md files for the per-threat dispositions and pinning evidence.

## Verdict

**PASS — Phase 16 ships.** All four requirements closed with code, tests, docs, AND CI gates. No deviations from phase scope.
