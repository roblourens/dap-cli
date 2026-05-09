---
phase: 12-breakpoint-command-surface-add-breakpoints-list-breakpoints-
plan: 02
subsystem: cli
tags: [breakpoints, diagnostics, loaded-sources, dx]
requires: [12-01 controller breakpoint tracking, phase 11 controller-client pattern]
provides: [verificationDiagnostic field on breakpoints set success payload]
affects: [breakpoints set CLI action]
tech-stack:
  added: []
  patterns: [in-band structured diagnostic, capability-gated DAP follow-up, one-shot ControllerClient lifecycle in CLI action]
key-files:
  created:
    - tests/integration/breakpointsVerificationDiagnostic.test.ts
  modified:
    - src/cli/commands/dapAliases.ts
    - tests/fixtures/fake-adapter-entry.ts
    - README.md
    - docs/AGENT-WORKFLOWS.md
decisions:
  - name: degrade gracefully on follow-up failure
    rationale: the user's primary setBreakpoints request must NEVER fail because of a diagnostic follow-up. Every error path returns the diagnostic with loadedSourcesCount = -1 and a degraded hint
  - name: in-band diagnostic on data, not stderr only
    rationale: JSON consumers should not have to merge stdout + stderr; stderr is informational warn() only
  - name: literal "wrong process" phrase for grep
    rationale: analysis.md §3 names this exact failure mode; the substring is the contract an agent reads
  - name: capability probe before loadedSources DAP roundtrip
    rationale: avoids one wasted DAP call against adapters that can't answer (and avoids the dap_request_unsupported error path)
metrics:
  duration: ~15 minutes
  completed: 2026-05-09
---

# Phase 12 Plan 02: verificationDiagnostic on unverified `breakpoints set`

## One-liner
When `breakpoints set` returns any unverified breakpoint, the CLI auto-probes `loadedSources` and attaches a structured `verificationDiagnostic` (with the literal "wrong process" / "Check source maps" / "Check breakpoint line numbers" phrasing) plus a stderr hint, so an external agent reading `analysis.md §3`-style failures gets the actual cause inline instead of the generic "verification timed out" message.

## What changed

- **`breakpoints set` action:** no longer routes through `sendAliasRequest` (which writes the envelope and hides the response body). Now opens one `ControllerClient`, sends `dap.request setBreakpoints` directly, inspects the response, and on `unverifiedCount > 0` calls the new `buildVerificationDiagnostic` helper before merging the diagnostic onto the success payload.
- **`buildVerificationDiagnostic` helper:** capability probe via `dap.capabilities` first; if `supportsLoadedSourcesRequest`, fires one `dap.request loadedSources` follow-up. Path matching is exact-or-basename, case-insensitive on win32. Builds the hint from the four-row matrix (zero-sources / no-match / match / no-cap).
- **Fake adapter scripts:** five new scenarios (`bp-verify-all`, `bp-verify-unverified-zero-sources`, `bp-verify-unverified-no-match`, `bp-verify-unverified-match`, `bp-verify-no-loaded-sources-cap`) drive the matrix.
- **Tests:** `tests/integration/breakpointsVerificationDiagnostic.test.ts` covers all five cases end-to-end and asserts the warn-stream stderr line.
- **Docs:** README JSON example + `Diagnosing unverified breakpoints` subsection in docs/AGENT-WORKFLOWS.md.

## Deviations from Plan

None — plan executed as written. No authentication gates encountered.

## Verification

- `npx vitest run tests/integration/breakpointsVerificationDiagnostic.test.ts`: 5 passed.
- `npx vitest run` (full suite): 380 passed, 7 skipped — no regression.
- `npm run build`: exit 0.
- `npx tsc --noEmit`: only pre-existing unrelated errors in `tests/cli/jsonOverrides.test.ts` (verified by `git stash` baseline).

Hand-driven smoke: deferred per user instruction.

## Self-Check: PASSED
- src/cli/commands/dapAliases.ts: FOUND (`buildVerificationDiagnostic` helper + four hint phrases as literal strings)
- tests/integration/breakpointsVerificationDiagnostic.test.ts: FOUND
- tests/fixtures/fake-adapter-entry.ts: FOUND (5 new bp-verify-* scripts present)
- README.md, docs/AGENT-WORKFLOWS.md: FOUND
- Commit c7758d2: FOUND
