---
phase: 22-onboard-rust-debugging-through-codelldb-as-a-built-in-adapte
plan: 01
subsystem: adapter-provenance
tags: [rust, codelldb, vsix, provenance, licensing, gate]
requires:
  - phase: 21-lazy-runtime-provisioning
    provides: Consent-gated verified lazy provisioning model whose supply-chain bar applies to new built-ins.
provides:
  - Verified official CodeLLDB macOS arm64 and upstream LLDB-build artifact digests.
  - Scoped R-00 authorization for verified direct official-source local caching on darwin-arm64 only.
  - Passing R-01 standalone DAP, loopback-only listener, Rust state-inspection, and cleanup evidence.
affects: [22-02, 22-03, 22-04, 22-05, 22-06, 22-07, 22-08, 22-09, 22-10, 22-11]
tech-stack:
  added: []
  patterns: [Evidence gate must pass before cached native runtime integration]
key-files:
  created: [.planning/phases/22-onboard-rust-debugging-through-codelldb-as-a-built-in-adapte/22-GATE-RESULTS.md]
  modified: []
key-decisions:
  - "CodeLLDB v1.12.2 darwin-arm64 may be lazily downloaded from its pinned official release and cached locally for the requesting user; bundling, mirroring, or offline redistribution remains out of scope."
  - "The released adapter contract is `codelldb --liblldb <bundled-relative-lib> --port <allocated-port>` with dap-cli connecting only to `127.0.0.1`; the Rust proof target must live long enough for CodeLLDB's launch handshake."
patterns-established:
  - "Official native artifact onboarding records digest/provenance concerns separately from a narrowly approved direct-source local provisioning contract."
requirements-completed: []
duration: initial evidence gate plus resumed live proof
completed: 2026-05-31
---

# Phase 22 Plan 01: CodeLLDB Evidence Gate Summary

**CodeLLDB's verified official macOS arm64 payload is approved for direct-source local caching and its standalone adapter passed loopback-only Rust DAP verification.**

## Performance

- **Duration:** Initial evidence gate plus resumed scoped-decision/live-proof execution
- **Started:** 2026-05-28T16:05:38Z
- **Completed:** 2026-05-31T23:45:52Z
- **Tasks:** 2 gate outcomes completed after an explicit scope decision resolved R-00 and authorized R-01
- **Files modified:** 1 tracked evidence document; ignored scratch retained for audit

## Accomplishments

- Downloaded the official host `codelldb-darwin-arm64.vsix` through `gh` and verified its GitHub-published SHA-256 before extraction.
- Traced the VSIX to the official `vadimcn/lldb-build` `codelldb/22.x-72` macOS arm64 runtime archive and verified that GitHub-published SHA-256 as well.
- Recorded that the full runtime payload includes CodeLLDB, LLDB, and Python material and lacks visible license/notice-like paths, then captured Rob's approval for direct official-source local caching without bundling or rehosting the payload.
- Ran the released `extension/adapter/codelldb` with its bundled `liblldb.dylib`, proved a live `127.0.0.1`-only listener, and drove a real owned Rust breakpoint/stack/locals/evaluate/continue/disconnect flow.
- Identified a stable fixture requirement: a very short target can exit during CodeLLDB's launch/attach handshake, while the deterministic target with a brief pre-breakpoint delay passes cleanly.

## Task Commits

1. **Task 1 / gated Task 2 disposition: Record R-00 blocker and R-01 non-execution** - `9b48139` (docs)
2. **Resumed Tasks 1-2: Authorize scoped local provisioning and prove released-artifact DAP/loopback behavior** - `108f691` (docs)

Task 2 initially stopped under its gate dependency. After Rob explicitly approved direct official-source local caching, the gate result was superseded and Task 2 was executed against only the verified phase-owned artifact and owned Rust target.

## Files Created/Modified

- `.planning/phases/22-onboard-rust-debugging-through-codelldb-as-a-built-in-adapte/22-GATE-RESULTS.md` - Official digests, extracted-runtime inventory, provenance finding, scoped caching authorization, and passing R-01 transcript.
- `tmp/phase-22-codelldb-gate/approved-artifact/` and `tmp/phase-22-codelldb-gate/owned-rust/` - Ignored phase-owned release and live-proof evidence retained for audit; not product artifacts.

## Decisions Made

- The built-in platform matrix begins with only verified `darwin-arm64`; uninspected release assets cannot be enabled by inference.
- Local caching is authorized only when dap-cli downloads the pinned official artifact directly for that user; bundling, mirroring, and offline redistribution remain outside the approved contract.
- Plans 22-02 through 22-11 may proceed using the proved loopback descriptor invocation and the fixture timing requirement.

## Deviations from Plan

The initial R-00 blocker was superseded by an explicit scope decision: direct official-source local caching does not assert dap-cli redistribution of the upstream VSIX. During R-01, the first ultra-short owned executable exposed CodeLLDB launch-handshake timing; a deterministic two-second pre-breakpoint lifetime produced the required passing evidence without altering the product contract.

## Issues Encountered

- The official CodeLLDB VSIX and referenced LLDB-build archive omit visible license/notice-like paths while retaining native LLDB and Python runtime content. This remains recorded as a follow-up concern for any future bundling, mirroring, offline distribution, or additional platform scope; it is nonblocking for the approved official-source local cache path.

## User Setup Required

None - no product adapter was installed or executed.

## Next Phase Readiness

- **Ready:** Product Plan 22-02 may implement the single verified `darwin-arm64` official-source local provisioning path and its offline synthetic/concurrency tests.
- Descriptor work must copy the R-01 invocation and `127.0.0.1` transport exactly; later Rust integration fixtures must keep a stable launch window.

---
*Phase: 22-onboard-rust-debugging-through-codelldb-as-a-built-in-adapte*
*Completed: 2026-05-28*
