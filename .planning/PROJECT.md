# dap-cli

## What This Is

dap-cli is a TypeScript Node.js command-line tool that lets agents debug applications through the Debug Adapter Protocol. It provides a Playwright CLI-inspired, stateful command surface for launching or attaching to debug sessions, setting breakpoints, inspecting paused programs, and calling DAP requests from shell commands.

The target user is an AI agent working alongside tools like the Playwright CLI: Playwright drives the app through the UI, while dap-cli controls and inspects the debugger state.

## Core Value

Agents can reliably control a DAP debug session from repeatable CLI commands and inspect paused application state without needing language-specific debugger knowledge.

## Requirements

### Validated

(None yet - ship to validate)

### Active

- [ ] Provide a stateful CLI session model similar to Playwright CLI, with launch/attach/open-style commands and explicit stop/close cleanup.
- [ ] Speak vanilla Debug Adapter Protocol without coupling core behavior to any specific runtime or language.
- [ ] Expose all DAP requests through typed CLI commands.
- [ ] Support polling-based status inspection in v1 so agents can detect whether a program is paused.
- [ ] Let agents set breakpoints, continue/step execution, and inspect stack frames, scopes, and variables from individual CLI calls.
- [ ] Bundle JavaScript and Python debug adapter support out of the box.
- [ ] Allow users to configure additional debug adapters through persistent config and/or command-line arguments.
- [ ] Keep the CLI ergonomic for agent workflows that interleave dap-cli calls with Playwright CLI calls.
- [ ] Preserve a clean, modular, professional architecture with debug adapters plugged in as external services through explicit descriptors, config, process, and transport boundaries.
- [ ] Provide README, user documentation, agent workflow docs, and project polish expected of a real professional CLI project.

### Out of Scope

- Event streaming in v1 - polling commands are enough for the first usable version, and event delivery can be designed after the command/session model is proven.
- Language-specific debugger semantics in core - adapters provide language behavior; dap-cli should remain DAP-first.
- The nearby debugger MCP project at `/Users/roblou/code/mcp-debugger/` may inform product shape and agent-debugging workflows.
- A graphical debugger UI - this project is a CLI for agents.

## Context

- The Debug Adapter Protocol is the core integration layer. The project should use official DAP concepts and names wherever possible.
- The official DAP website is a primary reference: https://microsoft.github.io/debug-adapter-protocol
- The `microsoft/vscode-debugadapter-node` repository is a possible dependency or reference point, but the project should choose based on fit rather than assuming it is required.
- The Playwright CLI is the strongest interaction model inspiration: commands can be issued separately while operating on shared session state.
- A typical workflow is: launch or attach a debug session, set a breakpoint with dap-cli, interact with the app via Playwright CLI, poll debugger state or stack trace until paused, inspect state, then continue or stop.
- The nearby debugger MCP project at `/Users/roblou/code/mcp-debugger/` is useful for inspiration, especially around agent-facing debugging actions.

## Constraints

- **Tech stack**: Node.js with TypeScript - matches the requested implementation environment and the surrounding JavaScript tooling ecosystem.
- **Protocol boundary**: Core should be vanilla DAP - avoids binding the product to JavaScript, Python, or any single adapter.
- **Session behavior**: CLI calls must share debugger state across commands - required for agent workflows that set breakpoints, trigger UI actions, and inspect pause state later.
- **v1 event model**: Polling only - keeps the first version simple and predictable for agents.
- **Bundled adapters**: JavaScript and Python should work out of the box - gives v1 immediate utility for common app debugging scenarios.
- **Extensibility**: Additional adapters must be configurable - users should be able to point dap-cli at any compatible debug adapter.
- **Implementation integrity**: Use mcp-debugger as product-shape inspiration.

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Use a Playwright-style stateful CLI controller | Agents need to make separate shell calls while targeting the same debug session. | - Pending |
| Start with polling for pause detection | Simple v1 behavior is enough, and richer event handling can be added later. | - Pending |
| Bundle JavaScript and Python adapters initially | These cover common agent debugging use cases and make the CLI useful immediately. | - Pending |
| Expose typed commands for all DAP requests | The user wants DAP methods available as CLI arguments, with a command surface agents can discover and use. | - Pending |
| Keep core DAP-first and language-neutral | Adapter-specific behavior should not leak into the core architecture. | - Pending |
| Treat debug adapters as external services | Adapter-specific launch, attach, process, and transport behavior should live behind descriptors/config instead of inside protocol core. | - Pending |
| Make docs and project polish part of v1 | The CLI should be usable by agents and humans as a professional project, not just as raw implementation code. | - Pending |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? Move to Out of Scope with reason
2. Requirements validated? Move to Validated with phase reference
3. New requirements emerged? Add to Active
4. Decisions to log? Add to Key Decisions
5. "What This Is" still accurate? Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check - still the right priority?
3. Audit Out of Scope - reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-05-02 after roadmap creation*