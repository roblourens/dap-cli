# Stack Research

**Domain:** Agent-facing Debug Adapter Protocol CLI
**Researched:** 2026-05-02
**Confidence:** HIGH for core stack, MEDIUM for adapter packaging details

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

```bash
# Core
npm install commander zod @vscode/debugprotocol

# Dev dependencies
npm install -D typescript @types/node vitest tsup eslint
```

Adapter dependencies need separate treatment:

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

**If full typed DAP coverage is required:**
- Generate command metadata from `debugAdapterProtocol.json`.
- Keep hand-written ergonomic aliases for common requests like breakpoints, stack traces, variables, and stepping.

**If adapter packaging is uncertain:**
- Ship descriptors for built-in JS/Python adapters, but allow config paths to override every adapter command.
- Because adapter distribution varies by ecosystem and platform.

**If a command must operate on an active session:**
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

---
*Stack research for: Agent-facing DAP CLI*
*Researched: 2026-05-02*