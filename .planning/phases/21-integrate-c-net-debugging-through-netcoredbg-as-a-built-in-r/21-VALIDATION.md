---
phase: 21
slug: integrate-c-net-debugging-through-netcoredbg-as-a-built-in-r
status: ready
nyquist_compliant: true
wave_0_complete: true
created: 2026-05-22
---

# Phase 21 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 3.2.4 |
| **Config file** | `vitest.config.ts` |
| **Quick run command** | `npx vitest run tests/integration/netCoreDbgAdapter.test.ts` |
| **Full suite command** | `npm run check` |
| **Estimated runtime** | ~120 seconds for focused tests; full suite varies |

---

## Sampling Rate

- **After every task commit:** Run the focused test command for the touched surface.
- **After every plan wave:** Run `npm run check` or the closest focused subset when external/runtime prerequisites are intentionally gated.
- **Before `/gsd-verify-work`:** Full suite must be green and real NetCoreDbg smoke evidence must exist.
- **Max feedback latency:** 120 seconds for focused feedback where practical.

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 21-01-01 | 01 | 0 | Adapter descriptor/setup | T-21-01 | Adapter archive digest verified before extraction | unit/integration | `npx vitest run tests/integration/setupAdapters.test.ts` | ✅ update | ⬜ pending |
| 21-02-01 | 02 | 1 | Registry/config/inference | — | `coreclr` maps only to approved `netcoredbg` adapter | integration | `npx vitest run tests/integration/launchInference.test.ts tests/integration/launchAttachAutoRoute.test.ts` | ✅ update | ⬜ pending |
| 21-03-01 | 03 | 1 | Real fixture launch/attach | T-21-02 | Attach targets only an owned local fixture PID | real adapter integration | `npx vitest run tests/integration/netCoreDbgAdapter.test.ts` | ❌ W0 | ⬜ pending |
| 21-04-01 | 04 | 2 | Docs/skill guidance | — | Docs forbid unsafe `.csproj` auto-build and untrusted public repo execution | docs integration | `npx vitest run tests/integration/docsValidation.test.ts` | ✅ update | ⬜ pending |
| 21-05-01 | 05 | 2 | Public repo/fresh-agent hardening | T-21-03 | External attempts use isolated dap-cli/dotnet/NuGet homes | artifact audit | `test -f .planning/phases/21-integrate-c-net-debugging-through-netcoredbg-as-a-built-in-r/21-RESULTS.md` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/integration/netCoreDbgAdapter.test.ts` — real NetCoreDbg launch/attach coverage.
- [ ] `tests/fixtures/simple-csharp-app/` — Debug DLL launch fixture.
- [ ] `tests/fixtures/simple-csharp-attach/` — owned local attach fixture.
- [ ] `dap-cli/skills/dap-cli/references/csharp-netcoredbg.md` — fresh-agent reference.
- [ ] `21-SCENARIOS.md` — fresh-agent scenario matrix.
- [ ] `21-EXTERNAL-PROJECT-CANDIDATES.md` — public repo screening ledger before execution.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Public-project safety screening | External validation | Requires judgment over untrusted repo manifests/scripts | Record screening in `21-EXTERNAL-PROJECT-CANDIDATES.md` before any public repo command. |
| Fresh-agent transcript audit | Hardening | Requires correlating subagent report with JSONL command trajectory | Record transcript path and command audit in `21-RESULTS.md`. |
| Hand-driven CLI smoke | Repo policy | Published CLI contract must be driven by orchestrator | Run `dev/smoke/hand-driven-smoke.md` Sequence A and B and record verbatim output in `21-UAT.md`. |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references through Plans 21-01 through 21-06
- [x] No watch-mode flags
- [x] Feedback latency < 120s for focused checks where prerequisites exist
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-05-22 for planning; execution must still satisfy each task command and final UAT.
