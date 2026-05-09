---
phase: 16-python-evaluate-ergonomics-auto-wrap-statements-and-document
plan: 02
subsystem: docs
tags: [docs, agent-workflows, debugpy, playwright, skill-mirror, docsvalidation]

requires:
  - phase: 16-python-evaluate-ergonomics-auto-wrap-statements-and-document
    provides: 16-01 shipped behavior — auto-wrap rule, opt-out shape, evaluate_requires_exec envelope
provides:
  - In-repo documentation of the auto-wrap rule, opt-out, and fallback envelope
  - Explicit "no --request flag" rule on the verb-selection guidance
  - Playwright-cli daemon-died recovery recipe in PLAYWRIGHT-INTEROP.md
  - User-level skill mirror (SKILL.md + references/agent-workflows.md) for both new sections
  - CI-enforced grep gates pinning the three doc surfaces
affects: [future agent-facing skill audits, future debugpy ergonomics work]

tech-stack:
  added: []
  patterns:
    - "CI-enforced doc keyword pinning via tests/integration/docsValidation.test.ts"
    - "User-level skill files mirrored by hand (out-of-repo, not CI-gated, per phase-14 precedent)"

key-files:
  created: []
  modified:
    - docs/AGENT-WORKFLOWS.md
    - README.md
    - docs/PLAYWRIGHT-INTEROP.md
    - tests/integration/docsValidation.test.ts
    - /Users/roblou/.copilot/skills/dap-cli/SKILL.md  (out-of-repo)
    - /Users/roblou/.copilot/skills/dap-cli/references/agent-workflows.md  (out-of-repo)

key-decisions:
  - "Mirror two of three new sections into the user-level skill (Python evaluate + verb selection); skip the playwright daemon recipe since the user-level skill does not own playwright guidance."
  - "Test against in-repo docs only — out-of-repo skill files cannot be CI-gated."
  - "Use markdown anchor link `#python-debugpy-evaluate` from README so the auto-generated GitHub heading anchor lines up with the new subsection."

patterns-established:
  - "Each doc-pinning test asserts both an exact-string keyword (cheap, structural) and a regex (semantic, allows minor rewording within the bounded text)."

requirements-completed: [PYEVAL-02, VERB-DOC-01, PWDOC-01]

duration: ~15min
completed: 2026-05-09
---

# Phase 16-02: Docs sweep + verb / playwright + CI gates Summary

**Three doc surfaces (AGENT-WORKFLOWS, README, PLAYWRIGHT-INTEROP) plus the user-level skill mirror now describe the Phase 16 auto-wrap rule, the launch-vs-attach verb (no `--request` flag), and the playwright-cli daemon recovery recipe; three new CI gates lock the keywords in place.**

## Performance

- **Duration:** ~15 min
- **Tasks:** 2 (in-repo docs sweep, user-skill mirror + docsValidation enforcement)
- **Files modified:** 6 (4 in-repo + 2 out-of-repo skill files)

## Accomplishments

- `docs/AGENT-WORKFLOWS.md` — new `### Python (debugpy) evaluate` subsection in the "Evaluation and Branching Decisions" section, plus an explicit "no `--request` flag" rule added to the existing `## Choosing launch vs attach` block.
- `README.md` — one-paragraph debugpy callout linking into AGENT-WORKFLOWS.md (`#python-debugpy-evaluate` anchor).
- `docs/PLAYWRIGHT-INTEROP.md` — `### Recovering from a dead playwright-cli daemon` subsection at the top of Troubleshooting (symptom: `not open, please run open first`; recovery: `pkill -f playwright-cli` → `playwright-cli open <url>`).
- `~/.copilot/skills/dap-cli/SKILL.md` — added `## Python (debugpy) evaluate` section before "## More Detail" and the "no `--request` flag" rule in "## launch.json: launch vs attach".
- `~/.copilot/skills/dap-cli/references/agent-workflows.md` — same two sections mirrored into the deeper reference doc.
- User memory (`/memories/dap-cli.md`) — added Phase 16+ note under existing BAD/GOOD example.
- `tests/integration/docsValidation.test.ts` — new `describe('Phase 16 docs (PYEVAL-02 / VERB-DOC-01 / PWDOC-01)')` with three `it()` guards.

## Task Commits

1. **Task 1: In-repo docs sweep** — `d7809fa` (docs)
2. **Task 2: User-skill mirror + docsValidation** — `0e4d85a` (test)

## Diff snippets — what each gate asserts

```ts
// docs/AGENT-WORKFLOWS.md must contain
'evaluate_requires_exec'
'exec('
'debugpy'

// docs/AGENT-WORKFLOWS.md must also contain
'dap-cli launch'
'dap-cli attach'
/no .{0,15}--request.{0,15}flag/i

// docs/PLAYWRIGHT-INTEROP.md must contain
'not open, please run open first'
/pkill|kill .*playwright|killing/i
```

The regex bounds (`.{0,15}`) tolerate minor rewordings ("such as", "called", "named") without becoming wide-open.

## Confirmation: 16-02 wording matches 16-01's actual heuristic

Cross-checked against `16-01-SUMMARY.md`:

- ✅ Auto-wrap example `import os` → `exec("import os")` matches `wrapForExec` round-trip output exactly (uses `JSON.stringify`).
- ✅ Opt-out shape `args.context = 'no-auto-wrap'` matches `maybePythonEvaluateRewrite`'s actual gate (and the doc explicitly notes the token is stripped before forwarding, matching the `forwardArgs.context = undefined` line in `server.ts`).
- ✅ Error envelope shape (`code: 'evaluate_requires_exec'`, `data.exec_form`, `data.original_expression`, two-line `diagnostics` array) matches the literal `dapError(...)` call in `wrapDapError`.
- ✅ Adapter gate (`adapterId === 'debugpy'`) is documented as "It only fires when `runtime.adapterId === 'debugpy'`" — accurate.

## Deviations from Plan

### 1. SKILL.md "BAD/GOOD example" was actually in user memory, not the skill file

- **Found during:** Task 2 (user-skill mirror)
- **Issue:** Plan said to "add new line under existing BAD/GOOD example" in `~/.copilot/skills/dap-cli/SKILL.md ## dap-cli Notes`. That section does not exist in SKILL.md — the BAD/GOOD example is in user memory `/memories/dap-cli.md`.
- **Fix:** Added the Phase 16+ line to user memory (the actual location of the BAD/GOOD example) AND added a fresh `## Python (debugpy) evaluate` section to SKILL.md so an agent reading the skill itself learns about the auto-wrap. Both surfaces now point at `code: evaluate_requires_exec`.
- **Files modified:** `~/.copilot/skills/dap-cli/SKILL.md`, `/memories/dap-cli.md`
- **Verification:** Visual diff inspect; `grep -n 'evaluate_requires_exec' ~/.copilot/skills/dap-cli/SKILL.md` matches.
- **Committed in:** `0e4d85a` (in-repo portion only — out-of-repo files are not committed)

**Total deviations:** 1 auto-fixed (file location correction)
**Impact on plan:** None — Phase 16+ note ends up in both the user-memory BAD/GOOD context and the SKILL.md narrative, which is strictly better than the planned single location.

## Issues Encountered

None — both tasks executed cleanly. Tests went green on first run.

## Threats addressed

- **T-16-05 (Doc drift from 16-01):** Cross-checked all wording against 16-01-SUMMARY.md (see "Confirmation" section above). The example wrap output, opt-out shape, error code, and data field names are byte-identical to what 16-01 actually ships.
- **T-16-06 (User-skill drift, accepted):** Both new sections mirrored into `SKILL.md` and `references/agent-workflows.md` as part of the same execution session. Future drift is on a future audit.
- **T-16-07 (Silent doc removal):** Three new docsValidation guards make any keyword loss a CI failure. Each guard has both a structural `.toContain()` and a semantic regex so a partial reword still flags.

## Self-Check: PASSED

- `npx vitest run tests/integration/docsValidation.test.ts` → 4 passed (1 pre-existing + 3 new).
- Manual visual check: AGENT-WORKFLOWS.md anchor `#python-debugpy-evaluate` resolves; SKILL.md and references/agent-workflows.md contain mirrored sections with matching wording.

PYEVAL-02, VERB-DOC-01, PWDOC-01 closed.
