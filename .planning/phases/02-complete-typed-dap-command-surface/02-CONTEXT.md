# Phase 2: Complete Typed DAP Command Surface - Context

**Gathered:** 2026-05-02
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 2 turns the Phase 1 generic DAP request path into a discoverable, typed CLI command surface for every official Debug Adapter Protocol request. It adds generation and coverage checks for protocol command inventory, keeps raw JSON passthrough as an escape hatch, adds ergonomic debugging aliases for common workflows, and preserves the existing controller/session/error contracts.

</domain>

<decisions>
## Implementation Decisions

### Protocol Metadata Source and Generation
- **D-01:** Treat official DAP protocol metadata/types as the source of truth for request inventory; do not maintain the full DAP command list by hand.
- **D-02:** Generate a local typed command registry artifact that maps DAP request names to CLI command metadata, argument validation, and routing metadata. The generated output should be deterministic and committed so coverage diffs are reviewable.
- **D-03:** Keep handwritten ergonomic aliases as thin wrappers over the generated registry and generic routing path rather than duplicating protocol request logic.

### CLI Command Shape
- **D-04:** Preserve the existing top-level `request <command> --json '{}'` escape hatch and add typed commands beside it, using names that match DAP concepts where possible.
- **D-05:** Common workflows should be ergonomic first-class aliases: breakpoint management, threads/stack/scopes/variables inspection, evaluate, continue, pause, step over, step in, and step out.
- **D-06:** Generated commands must use the existing stdout JSON envelope, `CliError` categories, session targeting semantics, and controller IPC client pattern.

### Capability and Unsupported Behavior
- **D-07:** Unsupported or unavailable adapter capabilities should be reported as structured handled failures, not as thrown internal errors or raw adapter messages.
- **D-08:** Capability reporting should be available to agents before or after command execution through machine-readable JSON, and failures should include request command, session ID, and adapter diagnostics when available.

### Scripted Coverage
- **D-09:** Add tests that compare generated command inventory against the selected official DAP metadata so newly missing official requests fail deterministically.
- **D-10:** Keep deterministic fake-adapter tests as the Phase 2 safety net for representative success, unsupported capability, paused/unpaused, raw passthrough, and ergonomic alias behavior.

### the agent's Discretion
- Choose the exact generator file layout, registry module names, and validation library usage as long as the implementation stays consistent with Phase 1 TypeScript, Commander, zod, and Vitest patterns.
- Choose the smallest useful set of representative DAP request fixtures for behavior tests, while inventory tests must cover the full official request list.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project Scope
- `.planning/PROJECT.md` - Product intent, constraints, and validated Phase 1 decisions.
- `.planning/REQUIREMENTS.md` - Requirement IDs for Phase 2: DAP-03, DAP-04, DAP-05, DBG-01, DBG-02, DBG-03, DBG-04, TEST-02, TEST-05.
- `.planning/ROADMAP.md` - Phase 2 goal, success criteria, and planned plan breakdown.
- `.planning/phases/01-project-foundation-controller-and-dap-core/01-CONTEXT.md` - Not present; Phase 1 decisions are captured in summaries and validation artifacts instead.

### Existing Phase 1 Foundation
- `.planning/phases/01-project-foundation-controller-and-dap-core/01-07-SUMMARY.md` - Generic adapter descriptors, fake adapter harness, controller DAP routes, and fake adapter integration.
- `.planning/phases/01-project-foundation-controller-and-dap-core/01-08-SUMMARY.md` - Structured diagnostics, isolated CLI test helper, and final Phase 1 scope gates.
- `.planning/phases/01-project-foundation-controller-and-dap-core/01-UAT.md` - User-facing Phase 1 verification evidence.
- `.planning/phases/01-project-foundation-controller-and-dap-core/01-SECURITY.md` - Closed Phase 1 threat register relevant to generated command routing and diagnostics.
- `.planning/phases/01-project-foundation-controller-and-dap-core/01-VALIDATION.md` - Phase 1 requirement-to-test map and sampling strategy.

### External Protocol Reference
- `https://microsoft.github.io/debug-adapter-protocol` - Official Debug Adapter Protocol concepts and request inventory.
- `@vscode/debugprotocol` package - Installed dependency that provides DAP protocol TypeScript types.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/cli/commands/dapCore.ts`: Existing `request <command> --json` escape hatch, event polling command, and controller wrapper pattern.
- `src/controller/server.ts`: `dap.request` routing, runtime resolution by explicit/active session, DAP error mapping, and event cache access.
- `src/controller/requests.ts`: Controller method schema currently includes placeholder DAP methods plus `dap.request` and `events.recent`.
- `src/protocol/dapClient.ts`: Request sequencing, response matching, `lastRequest`, timeouts, and handled DAP failures.
- `src/testing/fakeAdapter.ts` and `tests/fixtures/fake-adapter-entry.ts`: Deterministic fake adapter scripts can be extended for Phase 2 request fixtures.
- `tests/helpers/runCli.ts`: One-JSON-envelope CLI runner for integration tests.

### Established Patterns
- CLI commands register through `register...Commands(program, stdout)` and write only via `writeJsonSuccess` or handled `CliError` failures.
- Boundary validation uses zod at filesystem/IPC/descriptor edges and typed interfaces internally.
- Integration tests isolate `DAP_CLI_HOME`, start test-owned controllers, and clean them up through shared helpers.
- Architecture gates live in `tests/architecture/moduleBoundaries.test.ts` and should grow to protect generated command boundaries.

### Integration Points
- Generated typed commands should register from `src/cli/program.ts` through a new command module or registry adapter.
- All DAP request execution should converge on the existing controller `dap.request` route unless planning identifies a compelling shared abstraction.
- Capability and unsupported diagnostics should reuse `CliError` metadata and controller IPC structured failure preservation.

</code_context>

<specifics>
## Specific Ideas

- The typed surface should feel discoverable to agents in the same spirit as the Playwright CLI: specific commands for common work, plus raw JSON passthrough for anything unusual.
- The generated inventory test is important because the user explicitly required that all DAP methods be available as CLI arguments.
- Phase 2 should not add JavaScript or Python adapter support; that remains Phase 3.

</specifics>

<deferred>
## Deferred Ideas

- Real JavaScript and Python adapter flows remain Phase 3.
- Documentation polish and Playwright interop examples remain Phase 4.

</deferred>

---

*Phase: 2-Complete Typed DAP Command Surface*
*Context gathered: 2026-05-02*