# Phase 20 Go / Delve Hardening Gaps

## Gap Ledger

gap_id: GAP-20-06-01
classification: docs/skill gap
source_scenarios: G-02, G-03, G-04
status: fixed
finding: Fresh agents repeatedly raced short-lived Go debug/test/exec targets when they launched first and tried to set breakpoints afterward.
repair: `dap-cli/skills/dap-cli/references/go-delve.md` now recommends `--stop-on-entry` for short-lived debug, test, and exec flows.
rerun_audit: `20-RESULTS.md` preserves `rerun_of: G-02` and `rerun_of: G-03` with `same_prompt: true` evidence.

gap_id: GAP-20-06-02
classification: product bug
source_scenarios: G-03, G-04, G-05, G-07, G-08
status: fixed
finding: Isolated `setup-adapters` runs could crash with `.trim()` on missing child-process stderr and could later fail with `spawnSync .../venv/bin/pip ENOENT` if a debugpy virtualenv was left partial.
repair: `scripts/setup-adapters.ts` now formats spawn failures safely when stderr is absent, and recreates the debugpy venv when either its Python or pip executable is missing. Orchestrator replay removed scratch `venv/bin/pip` and a second setup rebuilt the environment cleanly.
rerun_audit: `20-RESULTS.md` preserves `rerun_of: G-03` and the final `rerun_of: G-08` with `same_prompt: true` evidence.

gap_id: GAP-20-06-03
classification: docs/skill gap
source_scenarios: GO-EXT-02, GO-EXT-03, G-08
status: fixed
finding: Real Delve test frames can reject direct `evaluate` requests even while stack and locals remain inspectable.
repair: Go/Delve reference now says to keep the stop and use `scopes` plus `variables` before deciding a value is unavailable.
rerun_audit: `20-RESULTS.md` preserves `rerun_of: G-08`, `same_prompt: true`, and rerun evidence that the fresh agent explicitly followed this fallback.

gap_id: GAP-20-06-04
classification: docs/skill gap
source_scenarios: G-10
status: fixed
finding: The safe attach lifecycle was described conceptually, but the docs-only novice could not find the exact disconnect command using `terminateDebuggee:false`.
repair: Go/Delve reference now shows `dap-cli request disconnect --name go-attach --json '{"terminateDebuggee":false}'`.
rerun_audit: `20-RESULTS.md` preserves `rerun_of: G-10`, `same_prompt: true`, and rerun evidence that the exact command is now discoverable.

gap_id: GAP-20-06-05
classification: product bug
source_scenarios: G-03, G-05, G-06, G-07, rerun G-03, rerun G-08
status: queued_follow_up
finding: At real Go breakpoint stops, `status` often reported `stoppedThreadIds: []` while `threads` showed the starred stopped goroutine; stack/continue then required manual `--thread-id`. G-05 also saw one stop-controller response that said stopped before the scenario-owned controller PID was gone.
repair: Not changed in Plan 20-06. The current diagnostics let agents recover, and this needs a focused controller/session lifecycle investigation rather than a speculative patch.
rerun_audit: None claimed; this row remains explicit follow-up work rather than `status: fixed`.

## Verify-Work Gate

Phase 20 is not UAT-complete merely because automated tests, external public-repo ledgers, and fresh-agent scenario hardening have evidence. Later `/gsd-verify-work` must personally run `dev/smoke/hand-driven-smoke.md` Sequence A and Sequence B in a real terminal, capture the verbatim output under `## Hand-Driven CLI Smoke` in `20-UAT.md`, and record both sequence results as pass before UAT can reach complete status.

Hardening exit state:

- G-01 through G-10 each have one standalone `initial_result:` record in `20-RESULTS.md`.
- Actionable product/docs gaps GAP-20-06-01 through GAP-20-06-04 are fixed and have appended rerun evidence; nothing was overwritten.
- Non-closed controller/thread clarity work remains explicit as GAP-20-06-05 with `status: queued_follow_up`.
- No unsafe external repo surface was forced; Phase 20 kept public-project execution bounded to screened clones and safe targets.

Focused commands to rerun before `/gsd-verify-work`:

```bash
GOTOOLCHAIN=go1.24.0 npx vitest run tests/integration/delveAdapter.test.ts
DAP_CLI_RUN_DELVE_ATTACH_SMOKE=1 GOTOOLCHAIN=go1.24.0 npx vitest run tests/integration/delveAdapter.test.ts
npx vitest run tests/integration/docsValidation.test.ts
```