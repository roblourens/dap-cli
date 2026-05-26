---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: (next)
status: milestone_complete
last_updated: 2026-05-26T00:55:00.000Z
last_activity: 2026-05-26
progress:
  total_phases: 2
  completed_phases: 1
  total_plans: 13
  completed_plans: 105
  percent: 50
stopped_at: Milestone complete (Phase 21 was final phase)
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-05-06)

**Core value:** Agents can reliably control a DAP debug session from repeatable CLI commands and inspect paused application state without needing language-specific debugger knowledge.
**Current focus:** Milestone complete

## Current Position

Phase: 21
Plan: Not started
Status: Milestone complete
Last activity: 2026-05-25

Progress: [█████████░] 92%

## Performance Metrics

**Velocity:**

- Total plans completed: 84
- Average duration: n/a
- Total execution time: 0.0 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| Phase 1 | 8/8 complete | n/a | n/a |
| Phase 2 | 4/4 complete | n/a | n/a |
| Phase 3 | 4/4 complete | n/a | n/a |
| Phase 4 | 4/4 complete | n/a | n/a |
| Phase 5 | 26/26 complete | n/a | n/a |
| Phase 05.1 | 6/6 complete | n/a | n/a |
| Phase 05.2 | 6/6 complete | n/a | n/a |
| Phase 06 | 3/3 complete | n/a | n/a |
| Phase 07 | 4/4 complete | n/a | n/a |
| Phase 08 | 2/2 complete | n/a | n/a |
| 16 | 2 | - | - |
| 20 | 6 | - | - |
| 21 | 7 | - | - |

**Recent Trend:**

- Last 5 plans: 07-02, 07-03, 07-04, 08-01, 08-02
- Trend: Phase 8 external repo expansion gaps are closed.

*Updated after each plan completion*
| Phase 05 P10 | 20 minutes | 2 tasks | 7 files |
| Phase 05.1 P01 | 10min | 2 tasks | 6 files |
| Phase 05.1 P02 | 15min | 2 tasks | 7 files |
| Phase 05.1 P03 | 13min | 2 tasks | 7 files |
| Phase 05.1 P04 | 12min | 2 tasks | 4 files |
| Phase 05.1 P05 | 22min | 3 tasks | 2 files |
| Phase 05.1 P06 | 20min | 3 tasks | 4 files |
| Phase 05.2 P01 | 4min | 2 tasks | 3 files |
| Phase 05.2 P02 | 6min | 2 tasks | 6 files |
| Phase 05.2 P03 | 4min | 2 tasks | 7 files |
| Phase 05.2 P04 | 7min | 2 tasks | 6 files |
| Phase 05.2 P05 | 4min | 2 tasks | 6 files |
| Phase 05.2 P06 | 28min | 3 tasks | 11 files |
| Phase 06 P01 | 10min | 2 tasks | 3 files |
| Phase 06 P02 | 18min | 2 tasks | 2 files |
| Phase 06 P03 | 12min | 2 tasks | 3 files |
| Phase 20 P01 | not-recorded-inline | 3 tasks | 4 files |
| Phase 20 P02 | not-recorded-inline | 3 tasks | 7 files |
| Phase 20 P03 | not-recorded-inline | 3 tasks | 11 files |
| Phase 20 P04 | not-recorded-inline | 3 tasks | 5 files |
| Phase 20 P05 | not-recorded-inline | 2 tasks | 2 files |
| Phase 20 P06 | not-recorded-inline | 3 tasks | 6 files |
| Phase 21 P21-01 | 70 | 5 tasks | 23 files |
| Phase 21 P21-01 | 70 | - tasks | - files |
| Phase 21 P21-02 | 3h | 3 tasks | 14 files |
| Phase 21 P03 | ~2h | 3 tasks | 7 files |
| Phase 21 P21-04 | 1500 | 3 tasks | 13 files |
| Phase 21 P05 | 25min | 3 tasks | 11 files |

## Accumulated Context

### Roadmap Evolution

- Phase 05.1 inserted after Phase 05: A mode for the CLI where it produces human-readable nicely formatted output instead of JSON. (URGENT)
- Phase 07 completed: Hardening bug discovery and exploratory smoke testing.
- Phase 08 complete: External project hardening expansion closed GAP-08-01 through GAP-08-03.
- Phase 9 added: Infer adapter/type from --program file extension (make --type and --adapter optional, derive from --program / each other when possible).
- Phases 10–14 added (source: analysis.md from external Code OSS debugging session): 10 — auto-route launch/attach by --config request field + --json-overrides + --resolve-source-maps + adapter-helper warning; 11 — paused-state ergonomics (status reflects stops, evaluate auto-frame); 12 — breakpoints list/clear + richer verification diagnostics; 13 — auto-JSON when stdout is not a TTY; 14 — agent workflow doc/skill updates capturing the lessons.
- Phases 15–16 added (source: analysis2.md from second external Code OSS debugging session + Python agent feedback): 15 — verify and document existing child-session event mirroring for js-debug pwa-chrome (analysis2.md §2; rescoped down after audit confirmed enumeration via `--show-children` and `mirrorChildEvent` already ship and the 05-19 / H-3 decision intentionally keeps child sessions non-targetable — work is now repro+fix-if-broken for renderer logpoint output, fix `events --name <child>` to return the structured "not targetable" error instead of `total: 0`, and doc the `--show-children` + `child_session_id` filter workflow); 16 — Python evaluate auto-wrap of statement-shaped input + docs/skill mirror, plus a "use the right verb" doc note (analysis2.md §1 — originally proposed as a separate `--request` flag phase but determined to be agent confusion since `launch`/`attach` are separate verbs) and a docs note on the playwright-cli daemon-died failure mode (analysis2.md §3).
- Phase 17 added: Code OSS smoke scenario hardening — 20 attach scenarios driven by subagents (similar to phases 7/8 hardening, scoped to the sibling Code OSS repo only; subagents read the dap-cli skill + VS Code launch skill, run one scenario each, orchestrator records pass/fail/agent-confusion notes).
- Phase 19 added: Cleanup help command output — fix the JSON error printed at the bottom of `dap-cli help`, decide and implement drill-down behavior for compound commands (e.g. `dap-cli help breakpoints set`) vs `-h`, and group the long flat command list into readable categories (lifecycle, launch/attach, special commands, etc.).
- Phase 20 added: I'd like to find another runtime that we can debug. We should do this by picking another debug adapter that already exists in the world and is popular, ideally one that is run by Microsoft. Then we should make a pretty substantial plan to implement it in this repo and figure out how to verify it. Going through a similar process to what we've done in the past, the most important thing is to just run through it right: 1. We need to identify the language of the debug adapter. 2. We need to make a plan for how it is installed or vendored into this repo or whatever we're doing for jsdebug and debugpy. I don't really even know. 3. We need to write the code. 4. We need to have substantial automated end-to-end testing. 5. We need to go through a process of trying it in different real-world debugging scenarios for different projects in that language that exist on GitHub that we can safely download and run and verify with debugging. Then we just set up the loop of having subagents run some different tasks, try to use dap-cli with the new language, and if they fail then we try to fix the issue or fix the confusion and repeat. I would like basically that entire end-to-end flow planned out.
- Phase 21 added: Lazy runtime provisioning of built-in adapters on first use. Today `scripts/setup-adapters.ts` is dev-only and not shipped in the npm tarball, so `npm i -g`, `npx`, and the agent-skill install paths all fail with "Run npm run setup-adapters" the first time a user tries to debug. Goal: provision js-debug / debugpy / delve into `~/.dap-cli/adapters/` at first use, with explicit user confirmation before any network download, concurrency-safe install (parallel `dap-cli` invocations must not corrupt the cache), and clear actionable failure surfaces for offline / proxy / missing-`python3` / arch-mismatch cases. Keep `dap-cli setup-adapters` as an eager-prewarm path for CI / Dockerfile users and honor `DAP_CLI_ADAPTERS_DIR` as an escape hatch for pre-staged installs.

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- [Phase 1]: Establish the persistent controller, language-neutral DAP core, polling/event cache, JSON contracts, and fake-adapter tests before real adapters.
- [Phase 2]: Generate the full typed DAP request command surface from official protocol metadata rather than maintaining it by hand.
- [Phase 3]: Treat built-in and custom adapters as external services resolved through descriptors, config, processes, and transports.
- [Phase 4]: Finish v1 with README/user docs, Playwright interop examples, self-hosting, smoke coverage, and agentic exploratory verification.
- [Phase 21]: 21-02: per-adapter provisioner pattern — Each adapter ships its own provisionXxx(ctx) module; provisionAdapter(id,ctx) dispatches. Descriptor factories try host/cached binary first, then lazily provision.
- [Phase 21]: 21-02: delve URL uses dlv_ prefix (not delve_) — Plan text was wrong; verified against github.com/go-delve/delve release assets and scripts/setup-adapters.ts.
- [Phase ?]: 21-04: Locked provision_* error catalogue (13 codes) via inline snapshot tests; renamed 3 provision_install_failed sites to catalogue codes; added previously-unreachable provision_cache_unwritable surface; added URL sanitization to prevent credential/query-string leaks; added cause chain to CliError.
- [Phase ?]: 21-05 pre-publish gates

### Pending Todos

- Pick the next milestone item or revisit deferred Phase 5.2 launch.json compound execution.

### Blockers/Concerns

None yet.

## Deferred Items

| Category | Item | Status | Deferred At |
|----------|------|--------|-------------|
| *(none)* | | | |

## Quick Tasks Completed

| ID | Slug | Date | Summary |
|----|------|------|---------|
| 260504-rp5 | reverse-duplicate-name-session-disambigu | 2026-05-04 | Reject duplicate `--name` at session create time (`session_name_in_use`); resolver prefers live records over terminated when matching by name. Reverses earlier `session_ambiguous` design. |
| 260516-lmy | here-s-an-error-that-was-reported-by-an- | 2026-05-16 | Shape ordinary stop/detach DAP disconnect payloads so js-debug never receives undefined disconnect args, with controller and CLI regression coverage. |
| 260525-ot8 | set-up-npm-publishing-via-github-actions | 2026-05-26 | Added `.github/workflows/publish.yml` (release-triggered, Node 22, tag↔version guard, `npm run check`, `npm publish --provenance --access public`) and a README "Releasing" section documenting `NPM_TOKEN` setup. |

## Session Continuity

Last session: 2026-05-25T20:21:40.233Z
Stopped at: Completed 21-03-PLAN.md
Resume file: None
