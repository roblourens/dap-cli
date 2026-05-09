---
status: complete
phase: 14-update-agent-workflow-docs-and-dap-cli-usage-skill-with-less
source:
  - .planning/phases/14-update-agent-workflow-docs-and-dap-cli-usage-skill-with-less/14-01-PLAN.md
ran_at: 2026-05-09T18:34:00Z
---

# Phase 14 UAT — Agent workflow docs + dap-cli usage skill refresh

Docs-only phase. The hand-driven smoke confirms the published binary still
matches what the refreshed docs (`docs/AGENT-WORKFLOWS.md`, `README.md`, and
`~/.copilot/skills/dap-cli/`) describe — every recipe documented in the new
sections is exercisable against `node dist/index.js` as captured in the smoke
logs.

## Hand-Driven CLI Smoke

ran_at: 2026-05-09T18:34:00Z
sequences:
  - id: A
    result: pass
    captured_output_file: tmp/phases-10-14-smoke-A.log
  - id: B
    result: pass
    captured_output_file: tmp/phases-10-14-smoke-B.log

Doc claims cross-checked against captured smoke output:

| Doc claim (post-phase-14) | Smoke evidence |
|---|---|
| `breakpoints list` returns sources + breakpoints + requested input | Sequence B step 3.5 |
| `breakpoints clear --source <path>` empties tracking | Sequence B step 5.5 |
| `status` reports `paused:true` + `stoppedReason` for js-debug parents when child stops | Sequence A step 7, Sequence B step 5 |
| `evaluate` without `--frame-id` works on a paused session | Sequence A step 5c |
| `evaluate` without `--frame-id` on a non-paused session emits a stderr hint and proceeds | Sequence B step 5 |
| Drop `--no-human` for piped/agent invocations (TTY auto-detect) | All captured commands return JSON despite no `--no-human` flag |
| `sessions` hides children by default; `--show-children` reveals them | Sequence B step 4a/4b |

Doc grep gate from [14-01-SUMMARY.md](14-01-SUMMARY.md) (10 checks against
`docs/AGENT-WORKFLOWS.md`, `README.md`, and the user-level skill files) all
passed during execute. Tests: 386 pass / 7 skip; build clean.
