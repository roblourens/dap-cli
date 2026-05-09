---
phase: 15
slug: child-session-enumeration-and-event-routing-for-js-debug-pwa
status: verified
threats_open: 0
asvs_level: 1
created: 2026-05-09
---

# Phase 15 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| Child DAP client → parent event cache | `ChildSessionCoordinator.mirrorChildEvent` annotates child events with `child_session_id` and appends them to the parent's `DapEventCache`. | DAP event objects (incl. `output.body.output` payloads from child runtimes — renderer, worker). |
| Controller IPC → caller (events surface) | `ControllerServer.recentEvents` invokes `resolveRuntime` → `assertNotChildSession` before returning a snapshot. | Session id / name supplied by caller; on rejection, structured `child_session_not_targetable` envelope back to caller. |
| Documentation surfaces | `docs/AGENT-WORKFLOWS.md`, `README.md`, user-level skill files. | Agent-facing recipes for pwa-chrome multi-renderer workflow. |

---

## Threat Register

| Threat ID | Category | Component | Disposition | Mitigation | Status |
|-----------|----------|-----------|-------------|------------|--------|
| T-15-01 | Tampering | `mirrorChildEvent` body merge (`src/controller/childSessions.ts`) | mitigate | Annotation is additive only: `{ ...existingBody, child_session_id: childId }` — preserves `category`, `output`, and all other adapter-supplied fields. Verified by the positive + negative-guard regression tests in `tests/controller/childSessions.test.ts` ("CHILD-VERIFY-01") added in plan 15-01. Live UAT Test 4 confirms parent's own events stay undecorated. | closed |
| T-15-02 | Information Disclosure | Child output mirrored into parent event stream | accept | Per the 05-19 design decision, child sessions are intentionally not directly targetable — the parent IS the canonical observation point, so mirroring is the intended behavior, not a leak. No new boundary is created by this phase. See [Accepted Risks Log](#accepted-risks-log) AR-15-01. | closed |
| T-15-03 | Spoofing / Information Disclosure | `events.recent` / `events.list` for a child name | mitigate | `recentEvents` routes through `resolveRuntime` → `assertNotChildSession` BEFORE any runtime lookup, so a caller passing a child id (or `parent#hex` alias) receives `child_session_not_targetable` with `data.parentSessionId` / `data.parentName` — never a silent empty stream. Three regression tests in `tests/cli/sessionCommands.test.ts` (plan 15-02) pin: child-id rejection, alias-form rejection, and unknown-name → `session_not_found` (gate doesn't over-fire). Live UAT Test 3 confirms behavior end-to-end against the published binary. | closed |
| T-15-04 | Repudiation | `child_session_not_targetable` error envelope shape | accept | The structured-error envelope contract (`code`, `category`, `exitCode`, `data.*`) is already pinned by Phase 5/8 tests. Phase 15 introduces no new repudiation surface; the envelope shape was reused, not redefined. See [Accepted Risks Log](#accepted-risks-log) AR-15-02. | closed |
| T-15-05 | Tampering (documentation drift) | `docs/AGENT-WORKFLOWS.md`, `README.md`, user-level skill files (plan 15-03) | mitigate | `tests/integration/docsValidation.test.ts` validates every fenced `dap-cli …` invocation in `docs/AGENT-WORKFLOWS.md` against the registered CLI program — runs green post-15-03. User-level skill files (`~/.copilot/skills/dap-cli/SKILL.md`, `references/agent-workflows.md`) are validated by the plan-15-03 grep gate (`child_session_id`, `show-children` present). UAT Test 2 confirms presence of all required keywords and headings. | closed |
| T-15-06 | Information Disclosure | Documentation surfaces (plan 15-03) | accept | Documentation-only phase; no new data flow, no new secret surface, no privileged content added to public docs. See [Accepted Risks Log](#accepted-risks-log) AR-15-03. | closed |

*Status: open · closed*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| AR-15-01 | T-15-02 | Child output mirrored to parent stream IS the canonical observation point per 05-19 design — there is no separate "leak" surface to seal. Children are not directly targetable (CHILD-ERR-01 gate), so the parent stream is the only way agents observe child activity. Re-evaluating this would mean re-litigating 05-19. | rob (via /gsd-secure-phase 15) | 2026-05-09 |
| AR-15-02 | T-15-04 | Error envelope shape is inherited from prior phases (pinned by phase 5 / 8 tests). No new envelope keys introduced; phase 15 only adds new `data.*` fields that are defensive metadata, not security-relevant. | rob (via /gsd-secure-phase 15) | 2026-05-09 |
| AR-15-03 | T-15-06 | Phase 15-03 is documentation-only. No code paths, no data flows, no secrets. Recipes reference only public CLI surface already documented elsewhere. | rob (via /gsd-secure-phase 15) | 2026-05-09 |

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-05-09 | 6 | 6 | 0 | /gsd-secure-phase 15 (Copilot) |

### Audit notes — 2026-05-09

State B audit (no prior SECURITY.md). Threat register reconstructed from
`<threat_model>` blocks in the three plan files (15-01-PLAN.md L196-209,
15-02-PLAN.md L160-173, 15-03-PLAN.md L148-161) and cross-checked against
`Threats addressed` sections of each SUMMARY.md and the live UAT
(`15-UAT.md`).

**Code paths reviewed (read-only):**
- `src/controller/childSessions.ts` — `mirrorChildEvent` (additive merge)
  + `client.onEvent` wiring before `initialize` request.
- `src/controller/server.ts` — `recentEvents` → `resolveRuntime` →
  `assertNotChildSession` gate.

**Mitigation evidence verified:**
- 4 mitigations have positive + negative regression tests landed
  (childSessions.test.ts, sessionCommands.test.ts, docsValidation.test.ts).
- 2 accepted risks (T-15-02, T-15-06) are explicitly documentation /
  design-acknowledged with prior-phase citations (05-19 design, phase 5/8
  envelope contract).
- T-15-04's "no new envelope" claim verified by inspecting plan-15-02
  diff: only adds tests; no controller/server source changes.

**Phase 15 made zero production code changes** — all four "mitigate"
threats are pinned by tests over already-correct code. This significantly
reduces residual risk surface.

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-05-09
