# Phase 2: Complete Typed DAP Command Surface - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md - this log preserves the alternatives considered.

**Date:** 2026-05-02
**Phase:** 2-complete-typed-dap-command-surface
**Areas discussed:** Protocol Metadata Source and Generation, CLI Command Shape, Capability and Unsupported Behavior, Scripted Coverage

---

## Protocol Metadata Source and Generation

| Option | Description | Selected |
|--------|-------------|----------|
| Official metadata/types as source of truth | Generate local registry from official DAP metadata/types and commit deterministic output. | yes |
| Hand-maintained command list | Manually add command definitions for each request. | |
| Runtime reflection only | Discover request shape dynamically at runtime. | |

**User's choice:** Auto-selected official metadata/types as source of truth.
**Notes:** This best satisfies the requirement that all DAP methods are available as CLI arguments without manual drift.

---

## CLI Command Shape

| Option | Description | Selected |
|--------|-------------|----------|
| Generated typed commands plus ergonomic aliases | Keep raw `request` and add discoverable generated commands and thin common-workflow aliases. | yes |
| Generated commands only | Expose only generated protocol names. | |
| Aliases only | Add only common debugger workflow commands. | |

**User's choice:** Auto-selected generated typed commands plus ergonomic aliases.
**Notes:** This preserves Phase 1 escape hatch behavior while making common agent workflows faster and more discoverable.

---

## Capability and Unsupported Behavior

| Option | Description | Selected |
|--------|-------------|----------|
| Structured handled failures | Unsupported requests/capabilities return stable JSON errors with request/session/adapter context. | yes |
| Best-effort raw DAP failures | Surface adapter response messages directly. | |
| Preflight-only validation | Block unsupported requests only before dispatch. | |

**User's choice:** Auto-selected structured handled failures.
**Notes:** This carries forward Phase 1 diagnostics and keeps agent parsing stable.

---

## Scripted Coverage

| Option | Description | Selected |
|--------|-------------|----------|
| Inventory tests plus representative fake-adapter behavior | Fail when official requests are missing and test representative success/failure flows. | yes |
| Behavior tests only | Test sample commands but not full inventory. | |
| Inventory tests only | Test command coverage but not workflow behavior. | |

**User's choice:** Auto-selected inventory tests plus representative fake-adapter behavior.
**Notes:** Full inventory coverage is required; behavior tests keep implementation grounded in agent-visible workflows.

## the agent's Discretion

- Exact generator module layout and registry file names.
- Exact zod schema organization for generated or handwritten command argument boundaries.
- Representative fake-adapter request fixtures beyond the required inventory coverage.

## Deferred Ideas

- Real JavaScript and Python adapter support belongs to Phase 3.
- User docs, Playwright interop examples, and final polish belong to Phase 4.