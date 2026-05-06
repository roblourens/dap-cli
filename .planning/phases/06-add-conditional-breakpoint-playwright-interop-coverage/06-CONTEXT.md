# Phase 06: Add Conditional Breakpoint Playwright Interop Coverage - Context

**Gathered:** 2026-05-05
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 6 adds conditional-breakpoint Playwright interop coverage on top of the existing dap-cli + js-debug + browser automation foundation. The phase should make it straightforward for an agent or human to set conditional breakpoint metadata through dap-cli, trigger browser behavior through Playwright, and prove that debugger pause/log behavior matches the requested breakpoint semantics.

This phase is not a redesign of DAP routing, child sessions, launch.json compounds, event streaming, or the Playwright interop architecture. It should build on the existing polling model, same-browser handoff work, and breakpoint/stack/variables command surface.

</domain>

<decisions>
## Implementation Decisions

### User-Facing Breakpoint Shape
- **D-01:** Phase 6 should add ergonomic conditional breakpoint flags to the friendly `breakpoints set` alias rather than relying only on raw/generated `setBreakpoints --json` calls.
- **D-02:** The alias should support the common DAP breakpoint metadata trio: `condition`, `hitCondition`, and `logMessage`.
- **D-03:** The CLI flag shape should be easy for agents and humans to discover, with names such as `--condition`, `--hit-condition`, and `--log-message` unless implementation research finds a stronger existing naming pattern.
- **D-04:** When `breakpoints set --line` receives multiple lines, any provided condition, hit condition, or log message should be copied to every requested breakpoint. Do not reject multi-line conditional requests solely because metadata is present.

### Adapter Capability Policy
- **D-05:** Whether dap-cli pre-checks adapter capabilities before sending conditional/logpoint fields is delegated to research and planning. Prefer the existing DAP-first style of passing fields through and surfacing adapter `verified`/`message` results unless the codebase already has a clear capability-gating pattern for this command family.

### the agent's Discretion
- Choose the exact automated scenario shape for conditional breakpoint coverage, using existing Playwright/js-debug fixture and helper patterns.
- Choose exact tests for false conditions, true conditions, hit-count thresholds, and logpoints, as long as the selected coverage proves the newly exposed alias fields interoperate with Playwright-driven browser behavior.
- Choose whether docs need a new example or an update to existing Playwright interop docs, but keep the examples aligned with the existing polling-only workflow.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project Scope and Prior Decisions
- `.planning/PROJECT.md` — product thesis, DAP-first architecture, Playwright-style stateful CLI, polling-only v1 model, and agent workflow expectations.
- `.planning/REQUIREMENTS.md` — DBG-01, AGNT-04, AGNT-05, TEST-04, TEST-05, TEST-07, and related verification requirements.
- `.planning/ROADMAP.md` — Phase 6 scope and dependency chain from Phase 5/05.2.
- `.planning/STATE.md` — current milestone state and continuity notes.
- `.planning/phases/05-stabilize-real-chrome-js-debug-playwright-same-browser-hando/05-CONTEXT.md` — same-browser Playwright/js-debug handoff decisions and the deferred conditional-breakpoint scope.
- `.planning/phases/05.1-a-mode-for-the-cli-where-it-produces-human-readable-nicely-f/05.1-CONTEXT.md` — output mode constraints: JSON stays default, human output is opt-in, and command aliases should remain readable.
- `.planning/phases/05.2-execute-vs-code-launch-json-configurations-and-compounds-ful/05.2-CONTEXT.md` — launch.json/compound decisions that affect real VS Code smoke contexts but are not to be redesigned here.

### Existing Interop Docs and Tests
- `docs/PLAYWRIGHT-INTEROP.md` — canonical agent-facing Playwright + dap-cli workflow, including setup order, same-browser CDP attachment, polling, stack/scopes/variables, and cleanup.
- `docs/HAND-DRIVEN-SMOKE.md` — hand-driven smoke patterns for browser breakpoint pause, evaluate trigger, event polling, stack inspection, and no-orphans cleanup.
- `tests/integration/playwrightInterop.test.ts` — deterministic Playwright orchestration baseline and gated same-browser handoff test using js-debug.
- `tests/integration/jsDebugAdapter.test.ts` — real js-debug browser smoke patterns, H-6 regression coverage, event polling, child session routing, and cleanup expectations.
- `tests/fixtures/simple-chrome-page/app.js` — simple browser fixture with `calculate(left, right)` used by current manual/evaluate breakpoint workflows.
- `tests/fixtures/ts-button-page/src/app.ts` — TypeScript/source-map button fixture used by documented Playwright interop examples.

### Existing Breakpoint and Routing Code
- `src/cli/commands/dapAliases.ts` — current `breakpoints set` alias only supports `--source`, `--line`, and `--name`; this is the likely user-facing integration point.
- `src/cli/commands/dapGenerated.ts` — generated command/raw request path that already sends arbitrary DAP payloads and can inform validation/error patterns.
- `src/controller/childSessions.ts` — parent-name routing and js-debug `setBreakpoints` handling for pwa-chrome children; conditional metadata must survive this route.
- `src/controller/server.ts` — public child-session targeting guard and controller request routing; useful context for parent-owned breakpoint/event stream behavior.
- `src/controller/pausedState.ts` — stopped-event to paused-state projection used by parent/child status checks.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/cli/commands/dapAliases.ts` already parses alias options and builds the `setBreakpoints` payload. Extending the `BreakpointsSetOptions` interface and the `breakpoints` array mapping should be the smallest user-facing command change.
- `sendAliasRequest` already routes alias commands through the same generated DAP request path and session targeting behavior, so conditional breakpoint flags should not need a new controller route.
- `tests/integration/jsDebugAdapter.test.ts` contains the strongest real browser breakpoint regression pattern: launch pwa-chrome, wait for children, set breakpoint through the parent name, trigger with `evaluate`, poll `events --include stopped`, inspect `threads`/`stack`, then continue and close.
- `tests/integration/playwrightInterop.test.ts` contains the same-browser Playwright handoff scaffolding and helper patterns for browser/page orchestration, CDP ports, fixture serving, and event polling.
- `docs/PLAYWRIGHT-INTEROP.md` already explains why `playwright-cli eval` is preferred over click auto-wait when the debugger pauses a handler.

### Established Patterns
- The CLI remains DAP-first: command aliases create DAP-shaped payloads, controller/server routes them, and adapter responses surface `verified`, `message`, and warnings rather than dap-cli inventing language-specific semantics.
- js-debug pwa-chrome child sessions are hidden and not directly targetable; users target the parent name and the `ChildSessionCoordinator` routes `setBreakpoints`, `threads`, `stackTrace`, `scopes`, `variables`, and `evaluate` appropriately.
- Browser breakpoint coverage should poll events/status rather than adding event streaming or blocking wait commands.
- Real adapter tests are often gated by environment/prerequisites; deterministic fake-adapter or fixture tests should cover always-runnable behavior where possible.

### Integration Points
- Add user-facing flags to `breakpoints set` without changing existing `--line <number...>` behavior or breaking multi-line requests.
- Ensure conditional metadata is preserved through `sendAliasRequest`, controller routing, and js-debug parent/child breakpoint fan-out.
- Extend tests around alias payload shape and at least one Playwright/js-debug interop path that proves conditional behavior from a browser action.
- Update docs only where they help an agent perform the conditional breakpoint workflow with the existing polling model.

</code_context>

<specifics>
## Specific Ideas

- Use `--condition <expr>`, `--hit-condition <expr>`, and `--log-message <text>` as the expected alias flags unless implementation research finds a local naming convention that should override them.
- Applying one condition/log message to every provided `--line` is expected and intentional.
- A good conditional-browser proof would set a breakpoint in a simple page function, trigger it with Playwright, and show one path that does not pause plus one path that does.
- Hit-condition/logpoint coverage should be included if practical, but research/planning can choose exact depth and whether some parts are unit/integration/docs rather than full real-browser UAT.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---
*Phase: 06-add-conditional-breakpoint-playwright-interop-coverage*
*Context gathered: 2026-05-05*