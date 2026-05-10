---
phase: 18-per-child-paused-state-and-paused-first-routing
plan: 02
subsystem: docs-and-skill
tags: [docs, skill, child-sessions, multi-process]
requires:
  - 18-01
provides:
  - Docs and in-repo skill present per-child paused-state union + paused-first routing as a guarantee, not a hedge (PAUSED-DOC-01)
  - docsValidation grep gate pinning the new wording across the three primary doc files
affects: [phase-18, docs, skill, testing]
tech-stack:
  added: []
  patterns:
    - Doc wording for multi-process js-debug uses concrete cases (pwa-node multi-process workers, Electron sub-Node helpers, worker threads, pwa-chrome page children) instead of generic "child sessions" hedge
    - Phase 15-02 child_session_not_targetable contract preserved
key-files:
  created: []
  modified:
    - skills/dap-cli/references/agent-workflows.md
    - skills/dap-cli/SKILL.md
    - skills/dap-cli/references/javascript-typescript.md
    - tests/integration/docsValidation.test.ts
key-decisions:
  - "Plan referenced docs/AGENT-WORKFLOWS.md but commit 44e5c9b (\"Restructure as Open Plugins\") moved that file to skills/dap-cli/references/agent-workflows.md and lowercased the remaining docs. Routed all Plan 18-02 edits to the actual file locations after the restructure."
  - "Pre-existing docsValidation.test.ts gates from Phase 16 were failing because they pointed at the old uppercase paths. Fixed them in this plan so the gate suite is green; this was strictly required to add the new Phase 18 gate without sitting on top of pre-existing failures."
  - "README.md left untouched — it carries no multi-process child-session recipe at this depth, so the plan's 'only touch README if it overlaps' rule applies."
patterns-established:
  - "New 'Phase 18 docs (PAUSED-DOC-01)' describe block in docsValidation.test.ts iterates the three primary doc files and asserts the literal phrase 'paused child' (case-insensitive) appears in each. Drift removes the phrase → test fails."
requirements-completed:
  - PAUSED-DOC-01
duration: 1 session
completed: 2026-05-10
---

# Phase 18 Plan 02: Docs and Skill Sweep Summary

**Present per-child paused-state union and paused-first routing as a guarantee across the agent-facing docs and the in-repo skill — backed by a docsValidation grep gate.**

## Performance

- **Started:** 2026-05-10
- **Completed:** 2026-05-10
- **Tasks:** 5 completed (with one path-correction deviation; see below)
- **Tests:** 475 unit + integration tests pass (7 docs gates including 3 new Phase 18 gates)

## Accomplishments

- Rewrote the Poll-Then-Inspect Loop intro and the Child sessions subsection in `skills/dap-cli/references/agent-workflows.md` to present the per-child paused-state union as a deterministic guarantee. Names the concrete cases (pwa-node multi-process workers, Electron sub-Node helpers including the extension host / pty host / shared / file watcher / search, worker threads, pwa-chrome page children).
- Updated `skills/dap-cli/SKILL.md`'s pwa-chrome / multi-renderer example to make the multi-process guarantee a Core-model statement: "dap-cli rolls per-child paused state up into the parent: `status --name <parent>` reports `paused: true` whenever any child is stopped, and routes thread-bearing requests to the paused child."
- Added a new "Multi-process js-debug" subsection to `skills/dap-cli/references/javascript-typescript.md` that names the concrete cases, confirms target-the-parent for inspection, notes there is no `--child-session-id` flag, links back to `agent-workflows.md`, and keeps the `.ts`-vs-`.js` breakpoint rule (verification is asynchronous; bp upgrades against the child's mapped `.js` once the child loads the source).
- Fixed three pre-existing failing docsValidation gates from Phase 16 that pointed at stale uppercase doc paths (`docs/AGENT-WORKFLOWS.md` / `docs/PLAYWRIGHT-INTEROP.md` / `docs/ADAPTER-SETUP.md`) that no longer exist after commit `44e5c9b`'s repo restructure.
- Added a new "Phase 18 docs (PAUSED-DOC-01)" describe block in `tests/integration/docsValidation.test.ts` that pins the literal phrase "paused child" (case-insensitive) in `agent-workflows.md`, `SKILL.md`, and `javascript-typescript.md`.

## Task Commits

- `2ddcac4` — Plan 18-02 in a single commit (docs + test + path corrections)

## Files Created/Modified

- `skills/dap-cli/references/agent-workflows.md` - Poll-Then-Inspect Loop intro rewritten; Child sessions subsection rewritten; both now present per-child paused-state union and paused-first routing as a guarantee.
- `skills/dap-cli/SKILL.md` - pwa-chrome example's closing line strengthened to the canonical Core-model statement; Phase 15-02 `child_session_not_targetable` contract preserved.
- `skills/dap-cli/references/javascript-typescript.md` - new "Multi-process js-debug" subsection added before the existing pwa-chrome / multi-renderer section.
- `tests/integration/docsValidation.test.ts` - fixed stale uppercase paths from prior restructure; added Phase 18 docs gate that iterates the three primary files asserting "paused child" (case-insensitive) is present in each.

## Decisions Made

- **Routed edits to actual file locations after restructure.** Plan referenced `docs/AGENT-WORKFLOWS.md` but commit `44e5c9b` moved that file to `skills/dap-cli/references/agent-workflows.md`. Following the plan path literally would have created a phantom doc; instead, the plan's intent ("authoritative multi-process js-debug recipe under the corrected paused-state union model") landed in the file that currently fulfils that role.
- **Fixed pre-existing failing gates in this plan.** Phase 16's gates were failing with ENOENT against the old paths. Adding new Phase 18 gates on top of pre-existing failures would have left the suite worse off; the fix was a one-block path correction that preserved every gate's intent.
- **Did not touch README.md.** It has no multi-process child-session recipe at this depth, so the "only touch README if it overlaps" rule applies.

## Deviations from Plan

**File-path deviation (significant):** Plan `files_modified` listed `docs/AGENT-WORKFLOWS.md`, but that file was moved during commit `44e5c9b` ("Restructure as Open Plugins") to `skills/dap-cli/references/agent-workflows.md`. The plan's stated intent — making the multi-process paused-state guarantee canonical in the authoritative workflow doc — landed in the actual current location.

**Test-fix-bundled deviation (minor):** Plan said to "preserve every existing docsValidation gate (from phases 14, 15, 16)" — they had already been broken by the path restructure. Updating them to the new paths in this plan made the gate suite functional again; without it the new Phase 18 gates would have been added on top of three pre-existing failures.

---

**Total deviations:** 2 documented (path correction; bundled test fix).
**Impact on plan:** No scope change — all plan intent fulfilled; only the on-disk filenames differed from the plan's snapshot.

## Issues Encountered

- None blocking. The path-restructure mismatch was caught immediately by running the existing docsValidation tests before adding the new gate.

## Verification

- `npx vitest run tests/integration/docsValidation.test.ts` — 7 tests pass (4 pre-existing Phase 16 gates after path fix + 3 new Phase 18 gates).
- Full suite: `npx vitest run` — 475 tests pass, 7 skipped (browser smokes gated by env vars). 39 test files green.
- Manual read-through of `agent-workflows.md`, `SKILL.md`, and `javascript-typescript.md` confirms no remaining hedge language about parent paused-state in multi-process attaches, the Phase 15-02 `child_session_not_targetable` contract is preserved, and the three files are mutually consistent.
