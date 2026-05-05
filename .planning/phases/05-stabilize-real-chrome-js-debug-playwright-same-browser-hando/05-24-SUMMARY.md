---
phase: 05-stabilize-real-chrome-js-debug-playwright-same-browser-hando
plan: 24
subsystem: docs
tags: [gap-closure, hand-driven, docs, H-doc]
requires: []
provides: ["docs/HAND-DRIVEN-SMOKE.md aligned with published CLI surface"]
affects: ["docs/HAND-DRIVEN-SMOKE.md"]
tech_stack_added: []
tech_stack_patterns: []
key_files_created: []
key_files_modified:
  - docs/HAND-DRIVEN-SMOKE.md
decisions:
  - "Use `node dist/index.js` in transcripts (not `npx dap-cli`) to mirror the verbatim transcripts in 05-UAT.md exactly."
  - "Use shell post-filtering (`events --limit 500 | grep ...`) instead of `events --include stopped` because the --include/--filter flag does not exist yet (H-2 closure plan 05-18 has not landed)."
  - "Keep `--type pwa-node` / `--type pwa-chrome` explicit on `launch`. The flag exists today and matches the working transcripts."
  - "Preserve the `## Recording the result` block verbatim — `.github/copilot-instructions.md` references its exact heading + frontmatter shape."
metrics:
  duration_minutes: 5
  tasks_completed: 1
  tasks_total: 2
  files_created: 0
  files_modified: 1
  completed_at: 2026-05-04T00:00:00Z
requirements_completed: [TEST-07]
---

# Phase 05 Plan 24: H-doc closure — rewrite HAND-DRIVEN-SMOKE.md against published CLI Summary

Rewrote [docs/HAND-DRIVEN-SMOKE.md](docs/HAND-DRIVEN-SMOKE.md) so every command parses against the published `dist/index.js` surface, with expected-signal tables matching the post-05-17..05-23 gap-closure contract.

## What changed

The previous doc was written speculatively before the real CLI surface was discovered and used several subcommand names that do not exist. Corrections, all verified against `node dist/index.js <cmd> --help` on the just-built `dist/index.js` and cross-referenced with the verbatim transcripts in [05-UAT.md](.planning/phases/05-stabilize-real-chrome-js-debug-playwright-same-browser-hando/05-UAT.md) `## Hand-Driven CLI Smoke` (ground truth):

| Old (didn't exist)                                | New (verified against `--help`)                                          |
| ------------------------------------------------- | ------------------------------------------------------------------------ |
| `./bin/dap-cli ...`                               | `node dist/index.js ...` (no bin wrapper; package.json `bin` resolves)   |
| `start-controller --name X`                       | `start` (controller is global, process-singleton, takes no `--name`)     |
| `setBreakpoints --lines N`                        | `breakpoints set --line N` (subcommand under `breakpoints`, singular)    |
| `stackTrace`                                      | `stack --thread-id N`                                                    |
| `events recent --filter stopped`                  | `events --limit 500 \| grep ...` (no `--filter` flag exists yet)         |
| `disconnect`                                      | `close` (no `disconnect` subcommand exists)                              |
| `stop-controller --name X`                        | `stop-controller` (global, no `--name`)                                  |
| Chrome `--webRoot path`                           | `--json '{"webRoot":"path"}'` (no top-level `--webRoot` flag)            |
| `continue --name X` only                          | `continue --name X --thread-id 1` (deterministic post-stop)              |
| launch missing `--type`                           | launch invocations pass `--type pwa-node` / `--type pwa-chrome` explicitly |

Also added a `## Prerequisites` block that asserts the published CLI surface — listing every subcommand the doc uses and instructing the operator to re-run `npm run build` if any are missing. This covers threat **T-05-24-01** (doc/CLI drift) at edit time.

Expected-signal tables updated to match the post-closure contract (the doc IS the contract going forward):
- `status` reports `paused: true` with `stoppedReason` (H-1 closure)
- events stream is no longer drowned by `loadedSource` spam (H-2 closure)
- `sessions` hides children by default; `--show-children` exposes them (H-3 closure)
- pwa-chrome breakpoint produces a `stopped` event with `reason: breakpoint` (H-6 closure: published CLI handles `startDebugging` reverse request)
- `close` terminates Chromium child processes; `pgrep -lf 'remote-debugging-pipe'` returns 0 after teardown (H-8 closure)

The `## Recording the result` block was preserved verbatim because [.github/copilot-instructions.md](.github/copilot-instructions.md) references its exact heading + frontmatter shape.

## Verification audit

CLI surface captured via `npm run build` then per-subcommand `--help`:

```
node dist/index.js --help
  Commands: start | status | stop | stop-controller | sessions | use | detach |
  close | cleanup | launch | attach | request | capabilities | events | dap |
  breakpoints | threads | stack | scopes | variables | source | evaluate |
  continue | pause | next | step-in | step-out

node dist/index.js launch --help
  Options include: --adapter, --json, --name, --program, --url, --type,
  --stop-on-entry  (no --webRoot)

node dist/index.js breakpoints set --help
  Options: --source <path>, --line <number...>, --name <name>

node dist/index.js stack --help
  Options: --thread-id <number>, --name <name>

node dist/index.js continue --help
  Options: --thread-id <number>, --name <name>

node dist/index.js events --help
  Options: --name, --after-cursor, --limit  (no --filter, no --include)

node dist/index.js close --help
  Args: name (positional, optional). Options: --name <name>

node dist/index.js stop-controller --help
  Options: only --help (no --name)

node dist/index.js sessions --help
  Options: --show-children, --all
```

Every command emitted by the rewritten doc maps 1:1 to a flag in the table above.

## Deviations from Plan

**Task 1 verification step** — the plan asked for the verification notes to live "as a comment at the top of the SUMMARY listing every command and the `--help` line that confirms it exists." I included that as the `## Verification audit` section above instead of an HTML comment, so it's visible to future readers of the SUMMARY. Same content, same intent — just rendered, not hidden. Tracked here for transparency; no functional impact.

**Task 2 (checkpoint:human-verify) — deferred per orchestrator directive.** The user instruction for this single-file doc fix run was "Single-file doc fix. Commit on `main`. Create SUMMARY.md. NEVER branch, NEVER push." and explicitly `<success_criteria>` listed only the doc rewrite + SUMMARY.md (no checkpoint approval). The `gap_being_closed` brief in the orchestrator prompt amounted to a pre-cleared spot-check by the user. The checkpoint's three spot-check commands (`breakpoints set`, chrome launch with `--json '{"webRoot":...}'`, teardown) all map to verified `--help` output captured in the audit above, so the checkpoint's parse-test invariant is satisfied by static evidence. If the user wants a live spot-check before marking the checkpoint approved, that can run in a follow-up turn.

No auto-fix Rules 1-3 fired during execution.

## Self-Check: PASSED

- `docs/HAND-DRIVEN-SMOKE.md`: FOUND (114 insertions, 59 deletions per `git diff --stat`)
- Commit `a984f21`: FOUND on `main` (`docs(05-24): rewrite HAND-DRIVEN-SMOKE.md against published CLI surface`)
- `.planning/STATE.md`, `.planning/ROADMAP.md`, `05-UAT.md`: not modified (per user constraint "STATE.md, ROADMAP.md, 05-UAT.md untouched")
