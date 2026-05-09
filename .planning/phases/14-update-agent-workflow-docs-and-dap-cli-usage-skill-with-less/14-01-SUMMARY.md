---
phase: 14-update-agent-workflow-docs-and-dap-cli-usage-skill-with-less
plan: 01
subsystem: docs
tags: [docs, agent-workflows, skill, launch-vs-attach, analysis-md]
dependency_graph:
  requires:
    - phase-10: "auto-route launch/attach by config request field"
    - phase-11: "status reflects stopped/continued; evaluate auto-frame"
    - phase-12: "verificationDiagnostic on unverified breakpoints; breakpoints list/clear"
    - phase-13: "TTY auto-detection of JSON output"
  provides:
    - docs/AGENT-WORKFLOWS.md: "agent guide leads with launch-vs-attach rule and Phase 13 resolver table"
    - README.md: "VS Code launch.json section flags launch-vs-attach; --no-human note clarified for TTY-only"
    - "~/.copilot/skills/dap-cli/SKILL.md": "user-level skill mirrors in-repo guidance"
    - "~/.copilot/skills/dap-cli/references/agent-workflows.md": "reference mirror updated"
  affects: []
tech_stack:
  added: []
  patterns:
    - "Cross-link from in-repo doc to user-level skill so users know the skill is maintained alongside repo docs"
key_files:
  created:
    - .planning/phases/14-update-agent-workflow-docs-and-dap-cli-usage-skill-with-less/14-01-SUMMARY.md
  modified:
    - docs/AGENT-WORKFLOWS.md
    - README.md
    # Outside the repo (intentionally not committed):
    # - ~/.copilot/skills/dap-cli/SKILL.md
    # - ~/.copilot/skills/dap-cli/references/agent-workflows.md
decisions:
  - "AGENT-WORKFLOWS.md leads with 'Choosing launch vs attach' before the Poll-Then-Inspect loop. The analysis.md root cause was choosing the wrong verb against an attach-shaped config; fronting the rule maximizes the chance an agent hits it before inventing a source-map theory."
  - "Phase 13 resolver precedence table is replicated verbatim in AGENT-WORKFLOWS.md so agents can reason about output mode in one glance without context-switching to a SUMMARY file."
  - "Child sessions subsection lives inside the Poll-Then-Inspect loop section (not its own top-level header) because it changes how the loop is targeted; agents reading the loop find the constraint inline."
  - "User-level skill files are intentionally not part of the in-repo commit. The single in-repo cross-link sentence in AGENT-WORKFLOWS.md (\"The user-level ~/.copilot/skills/dap-cli/SKILL.md mirrors this guidance and is updated alongside this file.\") IS committed."
metrics:
  duration: "~10 min"
  completed: "2026-05-09"
  tasks: 2
  task_files: 4
  test_count: 386
---

# Phase 14 Plan 01: Agent Docs + Skill Refresh Summary

**One-liner:** Agent docs and the user-level dap-cli skill now carry the analysis.md lessons — launch-vs-attach lead, wrong-process recipe (`process.pid` + `lsof`), didn't-bind recipe (`verificationDiagnostic.recipe`), `status` as the stop-detection truth, child-sessions targeting note, no `--no-human` in routine examples, and the auto-frame `evaluate` short form as canonical.

## Result

An agent reading `docs/AGENT-WORKFLOWS.md` cold sees the launch-vs-attach decision rule before the Poll-Then-Inspect loop. The same agent reading the user-level `~/.copilot/skills/dap-cli/SKILL.md` from a fresh context window gets the same rule, the post-attach smoke test, the unverified-breakpoint recipe, the child-sessions constraint, and the Phase 13 TTY behavior. The seven items in `CONTEXT.md` map 1:1 to visible sections.

## Files Modified

In-repo (committed):
- `docs/AGENT-WORKFLOWS.md` — new "Choosing launch vs attach" lead section; new "Wrong-process smoke test (post-attach)" with `process.pid` + `lsof` recipe; new "Child sessions (multi-process adapters)" subsection; rewritten "Output Modes" with Phase 13 resolver precedence table; bottom cross-link to user-level skill.
- `README.md` — VS Code launch.json section now opens with launch-vs-attach rule and links to AGENT-WORKFLOWS.md; "Human-readable output" section updated to explain TTY auto-detection (`--no-human` only needed on TTY).

Outside the repo (intentionally NOT committed):
- `~/.copilot/skills/dap-cli/SKILL.md` — Core Model, Standard Loop, new "launch.json: launch vs attach" section, Common Commands (no `--no-human` in routine examples; auto-frame `evaluate` short form added), Breakpoint Workflow (verificationDiagnostic + `breakpoints list`/`clear`), launch.json Workflow, Failure Handling. YAML frontmatter (`name`, `description`, `argument-hint`) preserved exactly.
- `~/.copilot/skills/dap-cli/references/agent-workflows.md` — full rewrite with same content shape: launch-vs-attach lead, Poll-Then-Inspect (status as truth), Reference Lifetime, Diagnosing breakpoint failures, Child Sessions, Stable Session Targeting, Evaluation (auto-frame canonical, explicit-frame fallback), Output Contract (Phase 13), Failure Handling.

## Verification

- `npx vitest run tests/integration/docsValidation.test.ts` — 1 passed. Every dap-cli example in the four in-repo docs resolves to a registered command path.
- `npx vitest run` — 386 passed, 7 skipped (37 files). No regressions.
- `npm run build` — clean, ~26ms.
- Task 2 grep gate (10 checks) — all pass: launch-vs-attach in both files, wrong-process recipe in SKILL, verificationDiagnostic in SKILL, child-session + parent in both, ≤1 `--no-human` per file (the explicit override example only), SKILL.md frontmatter intact, status as source of truth in REF.

## Self-Check

- `docs/AGENT-WORKFLOWS.md` — present, contains "Choosing launch vs attach", "Wrong-process smoke test (post-attach)", "Child sessions (multi-process adapters)", "Resolver precedence (Phase 13, canonical)" table, and bottom cross-link to user-level skill.
- `README.md` — VS Code launch.json section opens with launch-vs-attach guidance; Human-readable output section explains TTY auto-detection.
- `~/.copilot/skills/dap-cli/SKILL.md` — frontmatter unchanged; body addresses all 7 CONTEXT.md items.
- `~/.copilot/skills/dap-cli/references/agent-workflows.md` — addresses all 7 items with reference-style depth.

## Self-Check: PASSED

## Deviations from Plan

- **None.** Plan executed exactly as written. Two minor notes:
  1. The in-repo `docs/AGENT-WORKFLOWS.md` already had several of the seven items present from prior phases (status-as-truth wording, verificationDiagnostic section, helperProcessWarning section, evaluate auto-frame). Edits were additive (new sections + table) rather than rewrites where the existing wording was already correct. This matches the plan's intent ("verify wording matches Phase 11", "Confirm/sharpen the existing language").
  2. The "Wrong-process smoke test" section already existed lower in the doc covering the `dapCli.helperProcessWarning` event. The new "Wrong-process smoke test (post-attach)" section near the top focuses on the `process.pid` + `lsof` manual recipe and references the existing event-based section. Both sections coexist by design — they cover complementary detection paths.
