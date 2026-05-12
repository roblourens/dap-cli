<!-- GSD:project-start source:PROJECT.md -->
## Project

**dap-cli**

dap-cli is a TypeScript Node.js command-line tool that lets agents debug applications through the Debug Adapter Protocol. It provides a `playwright-cli`-inspired (see [@playwright/cli](https://www.npmjs.com/package/@playwright/cli)), stateful command surface for launching or attaching to debug sessions, setting breakpoints, inspecting paused programs, and calling DAP requests from shell commands.

The target user is an AI agent working alongside tools like `playwright-cli`: Playwright drives the app through the UI, while dap-cli controls and inspects the debugger state.

> Note on naming: "Playwright CLI" throughout this project means [`@playwright/cli`](https://www.npmjs.com/package/@playwright/cli) (the imperative `playwright-cli` binary). It is not the same package as [`@playwright/test`](https://www.npmjs.com/package/@playwright/test) (`npx playwright test`), the spec runner. Both can drive the browser side of an interop scenario; the imperative CLI is the one that inspired dap-cli's command shape. Phase artifacts written before this clarification (notably 02–05) use "Playwright CLI" loosely — read it as the imperative binary.

**Core Value:** Agents can reliably control a DAP debug session from repeatable CLI commands and inspect paused application state without needing language-specific debugger knowledge.

### Constraints

- **Tech stack**: Node.js with TypeScript - matches the requested implementation environment and the surrounding JavaScript tooling ecosystem.
- **Protocol boundary**: Core should be vanilla DAP - avoids binding the product to JavaScript, Python, or any single adapter.
- **Session behavior**: CLI calls must share debugger state across commands - required for agent workflows that set breakpoints, trigger UI actions, and inspect pause state later.
- **v1 event model**: Polling only - keeps the first version simple and predictable for agents.
- **Bundled adapters**: JavaScript and Python should work out of the box - gives v1 immediate utility for common app debugging scenarios.
- **Extensibility**: Additional adapters must be configurable - users should be able to point dap-cli at any compatible debug adapter.
- **Architecture**: Keep the internal design clean and modular. Debug adapters plug in as external services through explicit descriptors, config, process, and transport boundaries.
- **Implementation integrity**: Use mcp-debugger as product-shape inspiration.
<!-- GSD:project-end -->

<!-- GSD:stack-start source:research/STACK.md -->
## Technology Stack

## Recommended Stack
### Core Technologies
| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| Node.js | 22+ | Runtime for the CLI and session daemon | Modern ESM, stable process APIs, native AbortController, broad agent/tooling compatibility. |
| TypeScript | 6.0.3 | Implementation language | Strong typing matters because DAP has many structured requests, responses, events, and capabilities. |
| Debug Adapter Protocol | 1.71.0 | Protocol contract | Official latest DAP spec; should drive generated command coverage and request/response schemas. |
| @vscode/debugprotocol | 1.68.0 | DAP type declarations | Useful existing type package, but currently behind the latest spec, so do not rely on it as the sole source for typed command generation. |
| commander | 14.0.3 | CLI command routing | Mature command parser with nested subcommands, help output, options, and agent-friendly usage text. |
| zod | 4.4.2 | Runtime input validation | DAP commands accept structured JSON/options; validation should produce clear errors instead of adapter crashes. |
### Supporting Libraries
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| @vscode/debugadapter | 1.68.0 | Adapter-side helpers | Only if implementing or testing adapters locally; dap-cli itself is a DAP client, so this is not a primary dependency. |
| vitest | 4.1.5 | Test runner | Unit tests for protocol framing, session state, command parsing, and fake adapters. |
| tsup | 8.5.1 | Build and bundle | Produce an npm-friendly executable bundle while keeping development simple. |
| eslint | 10.3.0 | Linting | Enforce TypeScript quality and avoid unsafe protocol casts. |
| @types/node | 25.6.0 | Node type declarations | Keep process, fs, child_process, and stream types accurate. |
### Development Tools
| Tool | Purpose | Notes |
|------|---------|-------|
| npm package bin | Publish `dap-cli` executable | Keep command names stable and scriptable. |
| Protocol JSON generator | Generate typed DAP commands | Use the official `debugAdapterProtocol.json` so typed coverage tracks the latest spec. |
| Fake/mock adapter | Deterministic tests | Required before testing real js-debug/debugpy integration. |
## Installation
# Core
# Dev dependencies
- JavaScript: use vscode-js-debug standalone DAP server builds when possible, or document how to point config at an installed build.
- Python: use `debugpy`, normally installed in Python, and support launching/attaching through `python -m debugpy` where appropriate.
## Alternatives Considered
| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| commander | yargs | Use yargs if command generation from schemas becomes much easier with its builder API. |
| zod | JSON Schema validator | Use JSON Schema if generated DAP schemas become the single source of truth for validation. |
| Generate DAP command metadata | Hand-write every command | Hand-write only thin command descriptions; generated metadata avoids missing protocol requests. |
| Stateful daemon/controller | Stateless per-command process | Stateless is only acceptable for raw offline config helpers, not active debugging sessions. |
## What NOT to Use
| Avoid | Why | Use Instead |
|-------|-----|-------------|
| MCP debugger as inspiration | The project goal is a CLI shaped by agent debugging workflows. | Use it as product inspiration where helpful. |
| Hard-coded language logic in core | It breaks the DAP-first boundary and makes new adapters harder. | Adapter descriptors plus generic DAP request routing. |
| Only `@vscode/debugprotocol` for full coverage | npm package is at 1.68.0 while the official spec is 1.71.0. | Generate from official protocol JSON and optionally map to package types. |
| Event streaming in v1 | Adds daemon API design complexity before the polling workflow is proven. | Polling commands and status/stack inspection. |
## Stack Patterns by Variant
- Generate command metadata from `debugAdapterProtocol.json`.
- Keep hand-written ergonomic aliases for common requests like breakpoints, stack traces, variables, and stepping.
- Ship descriptors for built-in JS/Python adapters, but allow config paths to override every adapter command.
- Because adapter distribution varies by ecosystem and platform.
- Route through the controller/daemon using a session ID or default active session.
- Because DAP sequence numbers, capabilities, thread state, and events must persist across CLI invocations.
## Version Compatibility
| Package A | Compatible With | Notes |
|-----------|-----------------|-------|
| DAP spec 1.71.0 | @vscode/debugprotocol 1.68.0 | Treat the package as useful but not complete for latest typed command coverage. |
| vscode-js-debug 1.117.0 | Standalone DAP server builds | Official README says standalone DAP server builds are available on releases. |
| debugpy 1.8.20 | Python DAP adapter | Python adapter is usually run via `python -m debugpy` and can listen for client attach. |
| Node.js 22+ | TypeScript 6 / commander 14 | Modern supported Node baseline for CLI distribution. |
## Sources
- https://microsoft.github.io/debug-adapter-protocol/ - DAP overview and latest spec version.
- https://microsoft.github.io/debug-adapter-protocol/specification - protocol sections and official JSON reference.
- https://github.com/microsoft/vscode-debugadapter-node - protocol/adaptor helper packages.
- https://github.com/microsoft/vscode-js-debug - JS DAP adapter and standalone server notes.
- https://github.com/microsoft/debugpy - Python DAP adapter and CLI usage.
- `npm view` on 2026-05-02 - package versions above.
<!-- GSD:stack-end -->

<!-- GSD:conventions-start source:CONVENTIONS.md -->
## Conventions

Conventions not yet established. Will populate as patterns emerge during development.
<!-- GSD:conventions-end -->

<!-- GSD:architecture-start source:ARCHITECTURE.md -->
## Architecture

Use the architecture research in `.planning/research/ARCHITECTURE.md` as the starting point.

Expected module boundaries:
- `cli/`: command parsing, JSON output, and structured error mapping only.
- `controller/`: persistent daemon/server process, session routing, request sequencing, and lifecycle ownership.
- `sessions/`: session model, active session selection, state persistence, and cleanup behavior.
- `protocol/`: DAP framing, transports, request/response matching, lifecycle, and event cache. This layer stays language-neutral.
- `adapters/`: adapter descriptors, built-in JavaScript/Python descriptors, custom adapter resolution, process launch, and transport selection.
- `config/`: persistent config discovery, validation, and CLI overrides.
- `generator/`: official DAP protocol metadata to generated typed command metadata.
- `testing/`: fake adapters, fixtures, smoke tests, self-hosting, and agentic exploratory scenarios.

Do not put JavaScript/Python special cases inside the protocol core. Real adapters should be treated as external services connected by descriptors/config/process/transport boundaries.
<!-- GSD:architecture-end -->

<!-- GSD:skills-start source:skills/ -->
## Project Skills

No project skills found. Add skills to any of: `.github/skills/`, `.agents/skills/`, `.cursor/skills/`, `.github/skills/`, or `.codex/skills/` with a `SKILL.md` index file.
<!-- GSD:skills-end -->

<!-- GSD:workflow-start source:GSD defaults -->
## GSD Workflow Enforcement

Before using Edit, Write, or other file-changing tools, start work through a GSD command so planning artifacts and execution context stay in sync.

Use these entry points:
- `/gsd-quick` for small fixes, doc updates, and ad-hoc tasks
- `/gsd-debug` for investigation and bug fixing
- `/gsd-execute-phase` for planned phase work

Do not make direct repo edits outside a GSD workflow unless the user explicitly asks to bypass it.

### Branching

- **One dev branch per phase.** Branch name: `phase-<NN>-<short-slug>`. Created at the start of `/gsd-discuss-phase` or `/gsd-plan-phase`, used through `/gsd-execute-phase` and `/gsd-verify-work`. `gsd-executor` continues to make atomic commits on this branch.
- **Squash-merge into `main` when the phase is complete.** After verification passes, squash the dev branch into a single commit on `main`: `phase <NN>: <title>` with a short summary body.
- **Quick fixes go directly to `main`.** If the change fits in one commit, use `/gsd-fast` or `/gsd-quick` and commit straight to `main` — no dev branch.
- **Never force-push `main`.** Pre-cleanup history is preserved at tag `pre-rewrite-backup` and branch `main-backup-2026-05-11`.
<!-- GSD:workflow-end -->



<!-- GSD:profile-start -->
## Developer Profile

> Profile not yet configured. Run `/gsd-profile-user` to generate your developer profile.
> This section is managed by `generate-claude-profile` -- do not edit manually.
<!-- GSD:profile-end -->
