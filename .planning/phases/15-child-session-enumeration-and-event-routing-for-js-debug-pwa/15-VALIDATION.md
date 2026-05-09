---
phase: 15
slug: child-session-enumeration-and-event-routing-for-js-debug-pwa
status: verified
nyquist_compliant: true
wave_0_complete: true
created: 2026-05-09
---

# Phase 15 — Validation Strategy

> Per-phase validation contract. State B reconstruction — phase 15 is complete; this audit confirms automated coverage for all 3 requirements.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest |
| **Config file** | `vitest.config.ts` |
| **Quick run command** | `npx vitest run tests/controller/childSessions.test.ts tests/cli/sessionCommands.test.ts` |
| **Full suite command** | `npx vitest run` |
| **Estimated runtime** | ~5s for the two changed test files; ~30s full suite (37 files / 391 tests) |

---

## Sampling Rate

- **After every task commit:** quick run command above (covers the 2 test files phase 15 touched).
- **After every plan wave:** full suite (`npx vitest run`).
- **Before `/gsd-verify-work`:** full suite must be green — confirmed in UAT (391 passed, 7 skipped, 0 failed).
- **Max feedback latency:** ~5 seconds for the per-task quick path.

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 15-01-01 | 01 | 1 | CHILD-VERIFY-01 | T-15-01 | `mirrorChildEvent` annotates child events additively (`{ ...existingBody, child_session_id }`); preserves `category`/`output`. | unit | `npx vitest run tests/controller/childSessions.test.ts -t "output-event mirroring"` | ✅ | ✅ green |
| 15-01-02 | 01 | 1 | CHILD-VERIFY-01 (negative guard) | T-15-01 | `DapEventCache.append(parentId, event)` does NOT inject `child_session_id` — annotation is a child-only concern of the mirror path. | unit | `npx vitest run tests/controller/childSessions.test.ts -t "parent-direct cache append does NOT receive child_session_id"` | ✅ | ✅ green |
| 15-01-03 | 01 | 1 | CHILD-VERIFY-01 (live) | T-15-01 | Live pwa-chrome run shows renderer logpoint output reaching parent stream with `child_session_id`. | manual (hand-driven) | `tmp/phase-15-01-renderer-logpoint-repro.log` (captured + recorded in 15-UAT.md ## Hand-Driven CLI Smoke) | ✅ | ✅ green |
| 15-02-01 | 02 | 1 | CHILD-ERR-01 | T-15-03 | `events --name <child-id>` returns `child_session_not_targetable` with `data.parentSessionId` / `data.parentName`. | unit | `npx vitest run tests/cli/sessionCommands.test.ts -t "events --name <child-id> returns child_session_not_targetable"` | ✅ | ✅ green |
| 15-02-02 | 02 | 1 | CHILD-ERR-01 (alias form) | T-15-03 | `events --name <parent#hex>` rejects with the same code (alias resolution doesn't bypass the gate). | unit | `npx vitest run tests/cli/sessionCommands.test.ts -t "events --name <parent#hex> for events also returns child_session_not_targetable"` | ✅ | ✅ green |
| 15-02-03 | 02 | 1 | CHILD-ERR-01 (negative) | T-15-03 | `events --name <unknown>` returns `session_not_found` — gate doesn't over-fire on missing names. | unit | `npx vitest run tests/cli/sessionCommands.test.ts -t "events --name <unknown> still returns session_not_found"` | ✅ | ✅ green |
| 15-03-01 | 03 | 1 | CHILD-DOC-01 (in-repo) | T-15-05 | Every fenced `dap-cli …` example in `docs/AGENT-WORKFLOWS.md` resolves through the registered command registry. | integration | `npx vitest run tests/integration/docsValidation.test.ts` | ✅ | ✅ green |
| 15-03-02 | 03 | 1 | CHILD-DOC-01 (user skill) | T-15-05 | User-level skill files (`~/.copilot/skills/dap-cli/SKILL.md` and `references/agent-workflows.md`) contain `child_session_id` and `show-children`. | grep gate | `grep -cE "child_session_id\|show-children" ~/.copilot/skills/dap-cli/SKILL.md ~/.copilot/skills/dap-cli/references/agent-workflows.md` | ✅ | ✅ green |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Existing infrastructure covers all phase 15 requirements. Phase 15 added regression tests over already-correct code; no Wave 0 stubs were necessary.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Renderer logpoint output reaches parent stream end-to-end against real js-debug pwa-chrome | CHILD-VERIFY-01 | Requires live VS Code OSS process, real DevTools-attached Chromium, and a real logpoint set via the running adapter — js-debug behaviors that the unit test mocks abstract away (e.g. logpoint output emitted as `category: "stdout"` rather than `"console"`). | `docs/HAND-DRIVEN-SMOKE.md` Sequence B (variant). Captured run: [tmp/phase-15-01-renderer-logpoint-repro.log](../../../tmp/phase-15-01-renderer-logpoint-repro.log). Replayed in 15-UAT.md as Test 4 + Sequence B. |
| User-level skill file content (live agent surface) | CHILD-DOC-01 | The user-level `~/.copilot/skills/dap-cli/` files live outside the repo; `docsValidation.test.ts` validates only in-repo docs. | UAT Test 2 grep gates run from the orchestrator. Re-run with: `grep -cE "child_session_id\|show-children" ~/.copilot/skills/dap-cli/SKILL.md ~/.copilot/skills/dap-cli/references/agent-workflows.md` (expect non-zero on both). |

---

## Validation Sign-Off

- [x] All tasks have automated `<verify>` or hand-driven captured artifact.
- [x] Sampling continuity: no 3 consecutive tasks without automated verify (every plan task has a unit/integration test or a captured hand-driven log).
- [x] Wave 0 covers all MISSING references — none required (state B reconstruction; phase added tests over already-correct code).
- [x] No watch-mode flags in any sampled command.
- [x] Feedback latency < 30s (full suite); < 5s for per-task quick run.
- [x] `nyquist_compliant: true` set in frontmatter.

**Approval:** approved 2026-05-09

---

## Validation Audit 2026-05-09

| Metric | Count |
|--------|-------|
| Requirements audited | 3 (CHILD-VERIFY-01, CHILD-ERR-01, CHILD-DOC-01) |
| Tasks audited | 8 (3 plans × 2-3 tasks each) |
| Gaps found | 0 |
| Resolved | 0 (no gaps) |
| Manual-only escalated | 2 (live pwa-chrome repro for CHILD-VERIFY-01; user-level skill grep for CHILD-DOC-01) — both have captured artifacts in 15-UAT.md, no test code missing |

**Notes:**

- State B audit. No prior VALIDATION.md.
- Verified each requirement maps to at least one automated test landed in this
  phase (childSessions.test.ts, sessionCommands.test.ts) plus the existing
  docsValidation.test.ts integration gate.
- Manual-only items are captured artifacts (logs in `tmp/`) referenced from
  `15-UAT.md` ## Hand-Driven CLI Smoke — they are not unautomated gaps.
- Full vitest suite ran green pre-UAT (391 passed / 7 skipped / 0 failed
  per UAT entry). No flaky tests detected.
