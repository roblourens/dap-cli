---
phase: 15-child-session-enumeration-and-event-routing-for-js-debug-pwa
plan: 03
status: complete
requirements: [CHILD-DOC-01]
files_modified:
  - docs/AGENT-WORKFLOWS.md
  - README.md
  - ~/.copilot/skills/dap-cli/SKILL.md
  - ~/.copilot/skills/dap-cli/references/agent-workflows.md
---

# Plan 15-03 — document the canonical pwa-chrome multi-renderer workflow

## Result

Added the canonical pwa-chrome / multi-renderer workflow to all four
agent-facing surfaces, layered on top of the 14-01 child-sessions paragraph
without disturbing it. Cold-start agents now have a runnable recipe:
`sessions --show-children` → `events --name <parent>` → filter by
`body.child_session_id` → never target a child directly.

### Task 1 — in-repo docs

`docs/AGENT-WORKFLOWS.md` — added a `#### pwa-chrome multi-renderer recipe`
subsection immediately after the existing 14-01 `### Child sessions
(multi-process adapters)` block. Subsection covers the four required
points:

1. Discovery via `dap-cli sessions --show-children` (response shape: each
   child has `parent_session_id` and a `parent#hex` name with a 32-hex CDP
   target id).
2. Observation via `dap-cli events --name <parent>` — every child event
   mirrored into the parent's stream (verified by plan 15-01).
3. Filter pattern with `jq` showing `select(.body.child_session_id == "<child-id>")`.
4. Error-path callout: `events --name <child>` returns
   `child_session_not_targetable` with `error.data.parentSessionId`.

Also pinned a deviation noticed in plan 15-01's hand-driven repro: js-debug
emits logpoint output with `body.category: "stdout"`, NOT `console`. The
recipe explicitly tells agents to filter on `child_session_id` rather than
category to be category-agnostic.

`README.md` — added a one-paragraph addition right after the polling-only
`v1 model` paragraph, naming `dap-cli sessions --show-children` and the
`body.child_session_id` filter pattern, and linking to the new
AGENT-WORKFLOWS subsection (`docs/AGENT-WORKFLOWS.md#pwa-chrome-multi-renderer-recipe`).

### Task 2 — user-level dap-cli skill

`~/.copilot/skills/dap-cli/SKILL.md` — added a tight `## pwa-chrome /
multi-renderer` section after the existing `## Failure Handling` block and
before `## More Detail`. Skill-style: 4 lines of prose plus one fenced
shell block chaining `sessions --show-children`, `events --name <parent>`,
and the `jq` filter, plus the `category: "stdout"` callout and the
`child_session_not_targetable` recovery hint.

`~/.copilot/skills/dap-cli/references/agent-workflows.md` — added a
`### pwa-chrome multi-renderer recipe` subsection inside the existing
`## Child Sessions` block. Mirrors the AGENT-WORKFLOWS.md subsection
closely so the SKILL.md `More Detail → references/agent-workflows.md`
link continues to land readers on equivalent content (parity with what
14-01 set up).

## Verification

- `npx vitest run tests/integration/docsValidation.test.ts` → **1 passed**
  (every fenced `dap-cli` example resolves through the registered command
  registry).
- Task 2 grep gate: `child_session_id` and `show-children` appear in both
  user-level files. **All 4 grep gates pass**.
- 14-01 baseline preserved: no edits to existing child-sessions paragraph,
  launch-vs-attach guidance, wrong-process recipe, didn't-bind recipe,
  status-as-truth section, or `--no-human` rule. Verified by `git diff`
  showing only additions.

## Files changed

- `docs/AGENT-WORKFLOWS.md` (+~30 lines, new `#### pwa-chrome multi-renderer recipe` subsection).
- `README.md` (+1 paragraph after the polling-only v1 model paragraph).
- `~/.copilot/skills/dap-cli/SKILL.md` (+~15 lines, new `## pwa-chrome / multi-renderer` section).
- `~/.copilot/skills/dap-cli/references/agent-workflows.md` (+~30 lines,
  new `### pwa-chrome multi-renderer recipe` subsection inside `## Child Sessions`).

No production code changed.

## Threats addressed

- **T-15-05** (Documentation drift): every fenced shell block uses
  registered commands (`sessions --show-children`, `events --name`,
  `events --include`, `events --after-cursor`); `docsValidation.test.ts`
  enforces this for the in-repo docs. The user-level skill files are
  validated by the Task 2 grep gate.
- **T-15-06** (Information Disclosure): documentation-only — no new data
  flow, no new secrets surface.

## Out of scope confirmations

- No edits to the SKILL.md `description` / trigger phrases (skill discovery
  tuning is preserved).
- No new YAML frontmatter keys in SKILL.md.
- No re-documentation of `--no-human`, launch-vs-attach, wrong-process
  recipe, didn't-bind recipe, or status-as-truth — those belong to
  Phase 14 and re-writing them would create drift.
