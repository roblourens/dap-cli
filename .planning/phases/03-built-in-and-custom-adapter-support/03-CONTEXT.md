# Phase 3: Built-in and Custom Adapter Support - Context

**Gathered:** 2026-05-03
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 3 makes dap-cli useful against real debug adapters. It adds built-in JavaScript and Python adapter support, custom adapter configuration, CLI overrides, and real smoke coverage while preserving the Phase 1/2 boundary: the DAP core stays language-neutral and adapters remain external services behind descriptors, config, processes, and transports.

</domain>

<decisions>
## Implementation Decisions

### Launch/Attach UX
- **D-01:** Launch/attach configuration should support three entry points: raw JSON, named configurations from `.vscode/launch.json`, and direct CLI flags for common properties.
- **D-02:** When sources are combined, precedence is `flags > JSON > named config`.
- **D-03:** Named `.vscode/launch.json` configs should not be inferred directly from `type` alone. dap-cli should use its own config mapping from launch config type to adapter id, while still allowing explicit adapter selection where needed.
- **D-04:** Real adapter `launch`/`attach` results should keep the current session summary shape: `sessionId`, `lifecycle`, `capabilities`, and `eventCursor`.

### JavaScript Adapter Strategy
- **D-05:** JavaScript support should use a `microsoft/vscode-js-debug` source/package/build-artifact route first, not a Marketplace VSIX dependency. VSIX downloading may be technically possible, but it should not be the primary plan unless licensing/terms and stability are explicitly reviewed.
- **D-06:** JavaScript support must cover Node, Chrome, Electron, and TypeScript source-map workflows before Phase 3 is considered complete.
- **D-07:** JavaScript adapter config should use a hybrid shape: preserve js-debug's native launch/attach configuration for compatibility, and layer dap-cli flags into that config as convenience overrides.

### the agent's Discretion
- The user explicitly delegated the detailed adapter-native-vs-normalized config shape. Planning should prefer adapter-native config passthrough with a small flag convenience layer unless research finds a strong reason otherwise.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project Scope
- `.planning/PROJECT.md` - product goals, constraints, and decisions around DAP-first architecture, Playwright-style CLI workflow, polling-only v1, bundled JS/Python adapters.
- `.planning/REQUIREMENTS.md` - Phase 3 requirements SESS-02, SESS-03, ADPT-01 through ADPT-06, and TEST-04.
- `.planning/ROADMAP.md` - Phase 3 success criteria and dependency on Phase 2.

### Prior Phase Outputs
- `.planning/phases/02-complete-typed-dap-command-surface/02-04-SUMMARY.md` - generated command, alias, capabilities, and fake-adapter coverage now available for real adapter smoke tests.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/adapters/descriptor.ts` - existing `AdapterDescriptor` supports stdio process adapters and localhost socket adapters; Phase 3 should extend around this boundary rather than bypass it.
- `src/adapters/processAdapter.ts` - process-owned adapters already capture pid, log path, stderr tail, and close behavior.
- `src/adapters/socketAdapter.ts` - socket transport support exists for adapters that expose a local DAP server.
- `src/cli/commands/dapCore.ts` - current `launch`/`attach` commands are fake-adapter-specific; Phase 3 should generalize their descriptor/config construction while preserving JSON envelopes and session targeting.
- `src/testing/fakeAdapter.ts` and `tests/fixtures/fake-adapter-entry.ts` - deterministic fake-adapter harnesses remain useful for config and failure tests that do not require real JS/Python adapters.

### Established Patterns
- Adapter-specific behavior belongs behind descriptors/config/process/transport boundaries, not in protocol modules.
- CLI commands call controller IPC and emit exactly one stdout JSON envelope for handled outcomes.
- Integration tests use isolated `DAP_CLI_HOME` roots and assert stderr-empty handled failures.
- Generated DAP commands and ergonomic aliases already converge on controller `dap.request`.

### Integration Points
- Persistent adapter configuration should connect through config/path helpers and adapter descriptor parsing.
- Real adapter launch/attach should flow through `dap.start`, `DapLifecycleController.start`, and existing session manager lifecycle updates.
- Smoke tests should reuse Phase 2 aliases (`breakpoints set`, `stack`, `scopes`, `variables`, `evaluate`, `continue`, `pause`, `next`, `step-in`, `step-out`) against real adapters.

</code_context>

<specifics>
## Specific Ideas

- The user wants `.vscode/launch.json` named config reuse, but with dap-cli-owned adapter mapping rather than blind `type` inference.
- JavaScript coverage should include Node, Chrome, Electron, and TypeScript source maps in Phase 3, not as a later nice-to-have.
- Marketplace VSIX download/bundling should be treated cautiously; source/package/build artifacts from the MIT js-debug project are preferred for planning.

</specifics>

<deferred>
## Deferred Ideas

None - discussion stayed within phase scope.

</deferred>

---

*Phase: 3-Built-in and Custom Adapter Support*
*Context gathered: 2026-05-03*
