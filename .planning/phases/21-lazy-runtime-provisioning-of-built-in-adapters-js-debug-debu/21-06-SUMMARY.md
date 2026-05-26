---
phase: 21-lazy-runtime-provisioning-of-built-in-adapters-js-debug-debu
plan: 06
subsystem: docs+verification
tags: [docs, readme, adapter-setup, hand-driven-smoke, consent-ux, uat]

# Dependency graph
requires:
  - phase: 21
    provides: "Locked decisions D-03/D-06/D-08/D-09/D-12/D-13/D-14/D-15/D-16/D-18/D-19/D-20/D-21 and the shipped lazy-provisioning UX from plans 21-01..21-05 (consent prompt in src/cli/confirm.ts, per-adapter provisioners, setup-adapters subcommand, error envelope catalogue, packaging gates)."
provides:
  - "README install/quick-start section rewritten for npx-first lazy-provisioning workflow (D-16)."
  - "docs/adapter-setup.md as the canonical full reference (cache layout, pinned versions, setup-adapters subcommand, consent + --yes + DAP_CLI_ASSUME_YES + DAP_CLI_ADAPTERS_DIR, concurrency, proxy, error code table mirroring D-15, troubleshooting, security notes)."
  - "Sequence C in dev/smoke/hand-driven-smoke.md (6 steps: cold prompt, install + artifacts, paused session, warm-cache no-prompt, non-TTY fast-fail, env-var pre-consent)."
  - "21-UAT.md with verbatim captured output from orchestrator-run Sequences A + B + C, satisfying the .github/copilot-instructions.md hand-driven smoke gate."
affects: [21 (closes phase), npm-publish (UX docs ship with next release), future hand-driven smoke runs (Sequence C now part of the canonical gate for any phase touching provisioning)]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Doc-as-contract: dev/smoke/hand-driven-smoke.md now uses placeholder syntax (`<VERSION>`, `<ABSOLUTE_INSTALL_ROOT>`, `<DOWNLOAD_URL>`) for expected-signal blocks so the doc stays correct as pinned versions drift across upgrades — the doc describes the shape of the output, not the literal byte stream."
    - "Smoke-doc gap-closure-in-plan: when running the orchestrator-driven smoke surfaced three drifts between the doc and the implementation (C1 prompt format, C2 silent install, C5 consent-marker test premise), the doc was updated in this same plan rather than deferred — design intent (D-20: consent marker is download-record, not reuse gate) was preserved and the doc was brought back into alignment."

key-files:
  created:
    - .planning/phases/21-lazy-runtime-provisioning-of-built-in-adapters-js-debug-debu/21-UAT.md
  modified:
    - README.md
    - docs/adapter-setup.md
    - dev/smoke/hand-driven-smoke.md

key-decisions:
  - "Sequence C placeholders.  hand-driven-smoke.md C1 expected-signal uses `<VERSION>`, `<ABSOLUTE_INSTALL_ROOT>`, `<DOWNLOAD_URL>` placeholders with inline definitions, not literal `1.117.0` / `~/.dap-cli/...` / GitHub URL. Reason: the literal version drifts whenever `JS_DEBUG_VERSION` is bumped in `src/adapters/provision/checksums.ts`; baking the literal into the doc creates a maintenance trap."
  - "C2 success-signal is the launch envelope, not progress messages. The implementation does not emit `Installing...` / `Installed...` lines — install is silent on success in the JSON-default output mode. The doc was updated to describe success as the JSON launch envelope (`{\"ok\":true,...,\"lifecycle\":\"running\"}`) returned after the download completes. Artifact assertions (entrypoint, package.json, consent marker) were preserved."
  - "C5 wipes the install dir, not just the consent marker. The original draft of C5 removed only `~/.dap-cli/adapters/js-debug/.consent-<version>` and expected the non-TTY launch to fast-fail. That contradicts design D-20: the consent sentinel is a record of a past consent event, not authority over reuse of already-downloaded bits. `resolveDefaultJsDebugPath` correctly short-circuits when the entrypoint exists. The doc now removes the entire install dir to exercise the real fast-fail path; `.js-debug.lock-target` is permitted to appear in the snapshot diff (per-adapter lock is created before the consent check fires)."
  - "No code changes from this plan. The implementation was correct throughout — the gap was a stale smoke-doc spec. Filing the gap as a code change would have unnecessarily inverted D-20 semantics."

patterns-established:
  - "Hand-driven smoke gap-closure: when the orchestrator finds doc/code drift during the mandatory hand-driven gate, treat the drift as a gap per `.github/copilot-instructions.md`, then either (a) update the doc to match observed implementation when implementation is correct per design, or (b) file a code-fix gap when implementation is wrong. The 'do NOT explain it away' rule is honored either way — the issue is filed in the UAT and resolved before status: complete."
  - "UAT records both raw run + closure: when a gap is found-and-fixed in the same plan, the UAT preserves the initial mismatch as evidence (under the step's `notes:` block) and marks the step `pass` only after the resolving change is in. This keeps the audit trail (we found it; here's how we fixed it) without requiring a separate gap-closure plan when the fix is in-scope for the current plan."

requirements-completed: []

# Metrics
duration: ~40min (orchestrator-only; smoke captures across A/B/C + UAT recording + doc gap-closure)
completed: 2026-05-25
---

# Phase 21 Plan 06: Docs + Hand-Driven Smoke Summary

**Shipped the lazy-provisioning UX in docs (README rewrite, docs/adapter-setup.md as full reference) and proved the contract end-to-end via the mandatory orchestrator-run hand-driven smoke (Sequences A + B + C, all recorded verbatim in 21-UAT.md). Three smoke-doc drifts surfaced during the C run were resolved in the same commit as the UAT — implementation was correct per design throughout; the smoke doc just needed to catch up.**

## Performance

- **Duration:** ~40 min (orchestrator-only execution + UAT recording)
- **Tasks:** 4 (3 doc tasks already complete from prior turns; task 4 = this smoke + UAT)
- **Files:** 4 changed (1 created, 3 modified, 0 deleted)
- **Smoke captures:** A (8 steps), B (7 steps), C (6 steps + C5b evidence) — 21 verbatim outputs in `21-UAT.md`

## Accomplishments

1. **Executed Sequences A, B, and C in real terminals.** Per `.github/copilot-instructions.md`, the orchestrator (this agent) ran every step via `run_in_terminal` — not a subagent, not a script. All output captured verbatim into `/tmp/dap-cli-phase21-smoke/` (21 files) and from there into `21-UAT.md` under `## Hand-Driven CLI Smoke`. A and B pass cleanly. C functionally passes end-to-end: consent prompt fires (default-N, stderr-bound), `y` triggers a ~10s tar.gz download with SHA-256 verification, atomic install completes, sample.js launches and pauses on entry; warm-cache re-launch skips the prompt; non-TTY without `--yes` fast-fails with `provision_consent_required`; `DAP_CLI_ASSUME_YES=1` bypasses the prompt for a fresh install.

2. **Closed three smoke-doc drifts in-plan.** The C run surfaced three places where `dev/smoke/hand-driven-smoke.md` (written in task 3 of this same plan) had drifted from the shipped implementation:

   - **C1 prompt shape.** Doc expected a single-line `Install ... [y/N]`. Implementation emits three lines: question, indented `Source: <url>` detail, and `Proceed? [y/N] ` on its own line. Doc was updated to use placeholder syntax (`<VERSION>`, `<ABSOLUTE_INSTALL_ROOT>`, `<DOWNLOAD_URL>`) describing the actual three-line shape.
   - **C2 install progress.** Doc expected `Installing... / Installed...` progress messages. Implementation is silent on success in JSON-default mode; the success signal is the launch envelope returned after download. Doc updated to describe the JSON envelope as the success signal while preserving the artifact assertions (entrypoint, package.json, consent marker).
   - **C5 fast-fail premise.** Doc expected `rm ~/.dap-cli/adapters/js-debug/.consent-<version>` alone to re-trigger a consent prompt. Implementation correctly short-circuits in `resolveDefaultJsDebugPath` when the entrypoint exists (D-20: consent marker is a download-record, not a reuse gate). Doc updated to `rm -rf ~/.dap-cli/adapters/js-debug` and the design intent documented inline. The `C5b` supplementary capture in 21-UAT.md proves the actual fast-fail path (exit 2, `provision_consent_required`, diagnostics with `--yes` and `DAP_CLI_ASSUME_YES=1`, no install dir created) works correctly.

   Per `.github/copilot-instructions.md` rule "do NOT explain it away", all three were filed in the UAT as `issue` results during the run and then converted to `pass` in the same commit as the doc fix, with the original mismatch preserved under each step's `notes:` block as evidence.

3. **Restored production state.** The C pre-flight backed up `~/.dap-cli/adapters` to `~/.dap-cli/adapters.bak-phase21-smoke-1779741490` before wiping it. After C6 + teardown (`stop-controller`), the production adapters were restored. One unrelated `serve-controller` pid 33602 from a different worktree was observed but is not from this smoke and was left alone.

## Decisions

- **`<placeholder>` syntax over literal values** in the smoke doc's expected-signal blocks. Trade-off: doc readers must dereference (`<VERSION>` = "look at `src/adapters/provision/checksums.ts`") instead of seeing a literal `1.117.0`. Benefit: the doc stops drifting every time `JS_DEBUG_VERSION` is bumped, and CI / orchestrator runs that use the doc verbatim continue to pass after upgrades. Pinned the literal current values inline as examples so the doc is still self-explanatory.

- **C5 as design-contract test, not consent-marker test.** Recognized that the design intent of the `.consent-<version>` sentinel (D-20) is to record that the user agreed to a *download*, not to authorize *reuse* of already-downloaded bits. The C5 test was rewritten to match the actual contract (no install dir → must consent → fast-fail in non-TTY) rather than inverting the design.

- **Gap-fix in same plan, not a follow-up gap-closure plan.** All three drifts were doc-only fixes in files this plan was already modifying. Filing a separate `/gsd-plan-phase 21 --gaps` plan for a 1-commit doc patch would have added 3+ artifacts (gap plan, gap UAT, gap summary) for no architectural benefit. The UAT preserves the audit trail by recording the original mismatch under each step's `notes:` block before marking it pass.

## Surprises

1. **`run_in_terminal` reliably exercises the real TTY consent path.** Initial concern (from the pre-summary state) was that `run_in_terminal` might run the CLI under a non-TTY stdin, which would have made C1 unreachable. In practice, the terminal's stdin is a TTY, the prompt fired exactly as a human would see it, and `send_to_terminal` with `y` correctly drove the install. This validates the hand-driven smoke gate's premise: this IS how a human runs the CLI.

2. **The implementation's silent-success install is a feature, not a gap.** In JSON-default output mode, the launch envelope (with `lifecycle:running` after install completes) is sufficient signal — there is no value in interleaving `Installing... / Installed...` lines with a JSON-machine-readable stream. The smoke doc was the only place suggesting otherwise; updating it removes the false expectation.

3. **`.js-debug.lock-target` persists in `adapters/` after fast-fail.** When C5b removed the install dir and then tried to launch with non-TTY stdin, the consent check fires *after* the lockfile is created (lock is acquired first to serialize the consent decision across processes per D-08). The fast-fail returns without creating any download dir, but the lock-target file remains in `adapters/`. The doc now mentions this as an allowed diff entry.

## What's Next

- Phase 21 completion: state updates, code review (advisory), regression test gate, schema drift gate, codebase drift gate, gsd-verifier subagent for `21-VERIFICATION.md`, then `phase.complete 21` and PROJECT.md update.
