---
phase: 22-onboard-rust-debugging-through-codelldb-as-a-built-in-adapte
plan: 09
subsystem: external-validation
tags: [rust, codelldb, public-projects, isolation, subagents]
requires:
  - phase: 22-01
    provides: Official VSIX/platform and loopback transport scope.
  - phase: 22-07
    provides: Owned real Rust launch/config/attach proof before public execution.
  - phase: 22-08
    provides: Published Rust/CodeLLDB safety and workflow guidance.
provides:
  - Pre-execution SHA-pinned safety screen for two selected public Rust targets.
  - Delegated isolated-host behavioral proof for a public CLI binary and public pure library implementation.
  - Append-only preliminary failure/blocker and clean rerun evidence for transcript audit.
affects: [22-10, rust-agent-workflows, controller-ipc-ergonomics]
tech-stack:
  added: []
  patterns: [Screen-before-Cargo execution, exclusive delegated native-debug scratch roots]
key-files:
  created: [22-EXTERNAL-PROJECT-CANDIDATES.md, 22-EXTERNAL-PROJECT-RESULTS.md]
  modified: []
key-decisions:
  - "Selected Rust Book minigrep and dtolnay/itoa only after read-only Cargo/build/proc-macro/task/config screening and a committed authorization ledger."
  - "Used isolated macOS host fallback because the proved CodeLLDB artifact is darwin-arm64; offline builds and isolated adapter/state homes bound public execution."
  - "Retained contaminated/blocked first-wave evidence and required clean sequential reruns rather than accepting ambiguous parallel evidence."
patterns-established:
  - "Public native debugging passes remain pending until their fresh-subagent JSONL transcripts are audited in the following hardening plan."
requirements-completed: []
duration: approximately 25 min
completed: 2026-06-01
---

# Phase 22 Plan 09: Screened External Rust Validation Summary

**Two screened public Rust workflows now have delegated, isolated behavioral pass evidence, with initial failure and safety-abort history preserved for transcript audit.**

## Performance

- **Duration:** approximately 25 min
- **Completed:** 2026-06-01T00:35:16Z
- **Tasks:** 2
- **Files created/modified:** 2

## Accomplishments

- Created and committed the execution boundary before any public Cargo/build/debug action, then read-only screened two SHA-pinned candidates across manifests, locks, build/proc-macro/config/task/devcontainer and runtime-risk surfaces.
- Selected the Rust Book `minigrep` final listing as a dependency-free CLI-binary scenario and `dtolnay/itoa` as a pure-library scenario compiled only through an owned offline path-dependency harness with optional/dev paths excluded.
- Delegated attempts to fresh `gsd-executor` agents using isolated `HOME`, `CARGO_HOME`, `DAP_CLI_HOME`, and `DAP_CLI_ADAPTERS_DIR` plus the verified local CodeLLDB payload and offline Cargo execution.
- Preserved an initial successful-but-contaminated minigrep attempt and an itoa safety abort, then obtained clean sequential rerun passes: minigrep stopped at public `src/lib.rs:4` with `query == "duct"`; itoa stopped in public `Buffer::format` with `i == 128`.
- Recorded transcript identities, command envelopes, cleanup proof, and all surfaced issues for Plan 22-10 audit rather than treating subagent prose as accepted final truth.

## Task Commits

1. **Task 1 initial safety boundary** - `65fb337` (docs)
2. **Task 1 screened selected candidates** - `6f1ff6c` (docs)
3. **Task 2 delegated results and observed line correction** - `a7b86d5` (docs)

## Decisions Made

- Container isolation was recorded as unusable for this native validation because the only verified CodeLLDB payload is macOS arm64; the allowed fallback used fresh scratch homes, offline builds, seeded verified adapter trees, no attach, and launched scenario-owned targets only.
- The initial parallel attempt wave is not accepted evidence: an agent seeded adapter state into the other attempt root. Clean reruns were therefore sequential and used exclusive shorter paths.
- `itoa/src/lib.rs:104` was corrected to executable method line 106 (resolving to 107) after the first bounded debug probe showed line 104 is documentation at the pinned SHA; no selected target, dependency, or feature scope changed.

## Deviations From Plan

- The first delegated wave exposed an isolation-path mistake before the itoa agent ran public code; it correctly aborted and is recorded `blocked` with `cleanup_verified: false`. Clean reruns close behavioral validation but do not erase that evidence.
- The accepted-candidate location record for itoa initially pointed to a non-executable documentation line; it was corrected transparently after a bounded same-method retry succeeded.

## Issues Encountered

- A longer isolated `DAP_CLI_HOME` made controller startup fail with `controller_unavailable` / `internal_error`; a shorter exclusive scratch path worked. This is an audit input for controller Unix-socket path diagnostics/handling.
- Optional CodeLLDB `evaluate --context repl --expression query` in the minigrep rerun returned `internal_error` because it was interpreted as an LLDB command; variable inspection still supplied required proof. This is an audit input for docs or error-surfacing classification.

## Verification

- Candidate ledger verification required `Cargo.toml`, `Cargo.lock`, `build.rs`, `proc-macro`, `.cargo`, `launch.json`, `devcontainer`, `commit_sha`, and `isolation`: passed.
- Result ledger verification found four attempt records plus an explicit blocker and required subagent/SHA/cleanup fields: passed.
- Changed Markdown diagnostics: no errors.
- Clean delegated behavior: `EXT-01-R1-minigrep` `result: pass`, `cleanup_verified: true`; `EXT-02-R1-itoa` `result: pass`, `cleanup_verified: true`.

## Next Phase Readiness

- Ready for Plan 22-10 to audit all four referenced JSONL transcripts, classify the cross-attempt abort, socket-path startup failure, CodeLLDB evaluation failure, and itoa location correction, and require reruns or gap closure where needed before accepting passes.

---
*Phase: 22-onboard-rust-debugging-through-codelldb-as-a-built-in-adapte*
*Completed: 2026-06-01*