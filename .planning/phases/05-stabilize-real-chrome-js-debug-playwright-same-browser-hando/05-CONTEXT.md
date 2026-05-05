# Phase 5: Stabilize Real Chrome/js-debug Playwright Same-Browser Handoff - Context

**Gathered:** 2026-05-03
**Status:** Ready for planning
**Source:** Backlog promotion from Phase 4 exploratory verification

<domain>
## Phase Boundary

Phase 5 turns the Phase 4 backlog item for real Chrome/js-debug Playwright interop into a deterministic implementation plan. The deliverable is a default-runnable or clearly environment-gated test path where Playwright controls browser actions against the same browser target that js-debug inspects through dap-cli.

This phase does not redesign the DAP lifecycle, add event streaming, or change the v1 polling model. It hardens one advanced interop scenario on top of the existing adapter, Playwright, fixture, and polling infrastructure.
</domain>

<decisions>
## Implementation Decisions

### Locked Decisions
- D-01: Reuse the existing `@playwright/test` dependency and Vitest integration style introduced in Phase 4.
- D-02: The test must use `DAP_CLI_HOME` isolation and explicit controller/session cleanup like existing integration tests.
- D-03: The browser fixture should be served over localhost, not `file://`, to keep URL and source mapping behavior stable.
- D-04: The scenario should prove same-browser ownership: the browser receiving Playwright actions is also the browser target attached to or launched through js-debug.
- D-05: If platform/browser constraints prevent default-runnable coverage, the phase must leave an opt-in extended smoke with documented prerequisites and deterministic skip behavior.
- D-06: No external GitHub issues or remote side effects are part of this phase.

### The Agent's Discretion
- Choose whether js-debug should launch Chrome and Playwright connects over CDP, or Playwright launches Chromium with a remote debugging port and js-debug attaches.
- Choose the minimal fixture changes required to make source mapping and breakpoint hits deterministic.
- Choose helper extraction boundaries based on duplication with `playwrightInterop.test.ts` and `jsDebugAdapter.test.ts`.
</decisions>

<canonical_refs>
## Canonical References

### Prior Phase Artifacts
- `.planning/BACKLOG.md` - promoted backlog item and known limitations from Phase 4.
- `.planning/phases/04-agent-workflow-documentation-and-self-hosting-verification/04-VERIFICATION-NOTES.md` - explains why real same-browser handoff was deferred.
- `.planning/phases/04-agent-workflow-documentation-and-self-hosting-verification/04-04-SUMMARY.md` - documents the deterministic scripted interop baseline and deviations.

### Existing Tests and Docs
- `tests/integration/playwrightInterop.test.ts` - deterministic Playwright plus dap-cli orchestration baseline.
- `tests/integration/jsDebugAdapter.test.ts` - real js-debug smoke patterns and environment gating.
- `tests/fixtures/simple-chrome-page/` - browser fixture and reference Playwright spec.
- `docs/PLAYWRIGHT-INTEROP.md` - documented interop pattern and limitations to update.

### Adapter Infrastructure
- `src/adapters/builtins/jsDebug.ts` - js-debug descriptor and DAP server process launch.
- `src/adapters/socketAdapter.ts` - server-process socket adapter startup and cleanup.
- `src/config/launchConfig.ts` - js-debug type mapping and config normalization.
- `src/protocol/dapClient.ts` - reverse request and cleanup handling.
</canonical_refs>

<specifics>
## Specific Ideas

- Prefer a same-browser flow that launches Chromium with `--remote-debugging-port=0` or a known free port, then attaches js-debug to that port, if js-debug attach behavior is reliable.
- Alternative: let js-debug launch Chrome with a known debug port and connect Playwright via `chromium.connectOverCDP`.
- Use the simple page fixture first; only expand the fixture if the current auto-run `calculate(2, 3)` makes the breakpoint race too tight.
- Preserve Phase 4's scripted interop test as the default workflow-coordination coverage even after real Chrome coverage is added.
</specifics>

<deferred>
## Deferred Ideas

- Conditional breakpoint interop is Phase 6.
- Evaluate-and-mutate browser state coverage is Phase 7.
- Rich multi-breakpoint UI fixture work is Phase 8.
</deferred>

---
*Phase: 05-stabilize-real-chrome-js-debug-playwright-same-browser-hando*
*Context gathered: 2026-05-03*
