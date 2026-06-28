## Why

The current command-line debugger pays roughly 108-113 ms of median process startup cost on each invocation because it starts a Node.js runtime. Reimplementing the product as a native Rust executable will make repeated agent-driven debugging commands substantially faster while preserving the complete stateful DAP workflow.

The rewrite must be clean-room and self-contained: the TypeScript implementation will be deleted before implementation begins, so these reviewed OpenSpec artifacts and the preserved behavioral verification assets must be sufficient to build the replacement without consulting the previous source.

## What Changes

- **BREAKING** Replace the TypeScript/Node.js implementation with a Rust crate under `agent-debug/`.
- **BREAKING** Rename the executable and all public branding from `dap-cli` to `agent-debug`, with no legacy alias.
- **BREAKING** Rename public state paths to `~/.agent-debug`, environment variables to `AGENT_DEBUG_*`, and the npm/plugin/skill surfaces to `agent-debug`.
- Preserve the agent-first stateful debugger workflow: persistent controller, named sessions, polling, DAP requests, breakpoint/inspection/control commands, launch configuration support, built-in adapters, and structured diagnostics.
- Preserve the four built-in adapter families: js-debug, debugpy, Delve, and CodeLLDB, including their verified platform and security boundaries.
- Keep npm as the installation channel, but install a native platform executable that does not use Node.js as the CLI or controller runtime; Node.js is allowed only as the on-demand host for upstream js-debug.
- Add explicit startup-performance budgets and reproducible benchmarks.
- Reuse preserved black-box tests, fixtures, packaging checks, and hand-driven scenarios where possible; port implementation-level tests to native Rust tests and replace TypeScript-specific architecture assertions.
- Keep event streaming, blocking wait commands, a TUI, remote-by-default transports, additional built-in adapter families, and broader CodeLLDB provisioning out of scope.

## Capabilities

### New Capabilities

- `cli-contract`: Native `agent-debug` command tree, help, output modes, JSON envelopes, errors, exit codes, and full public rename.
- `controller-sessions`: Persistent controller process, IPC discovery, session lifecycle, targeting, persistence, compounds, cleanup, and child-session visibility.
- `dap-protocol`: DAP Content-Length framing, lifecycle sequencing, requests/responses/events, generated and raw commands, capability gates, reverse requests, and bounded event history.
- `debug-operations`: Breakpoint management, paused-state polling, threads, stack, scopes, variables, source, evaluation, stepping, continuation, routing, and reference lifetime rules.
- `launch-configuration`: Program/type inference, command-line overrides, JSON payloads, VS Code `launch.json` JSONC parsing, variable substitution, platform overlays, auto-routing, and compounds.
- `adapter-management`: Built-in/custom adapter registry, local-only transports, lazy provisioning, consent, cache layout, integrity checks, concurrency, proxies, and diagnostic errors.
- `javascript-debugging`: js-debug Node/Chrome/Electron behavior, source maps, helper-process diagnostics, multi-process child sessions, breakpoint forwarding, and Playwright interoperability.
- `python-debugging`: debugpy launch/attach behavior, isolated provisioning, expression handling, and Python statement evaluation.
- `go-debugging`: Delve launch/test/exec/local-attach behavior, toolchain compatibility, environment forwarding, and cleanup safety.
- `rust-debugging`: CodeLLDB explicit-binary launch and owned local attach, Rust-focused defaults, verified platform boundary, and official-source provisioning.
- `distribution-performance`: Rust workspace layout, native npm installer, supported release targets, no Node runtime dependency, startup benchmarks, and latency budgets.
- `release-pipeline`: Exact GitHub Actions workflows, native runner matrix, compatibility-floor and performance runners, artifact handoff, npm trusted publication, recovery, and GitHub Release sequencing.
- `verification-contract`: Clean-room implementation boundary, retained fixtures and smoke scenarios, black-box compatibility harness, native Rust tests, packaging validation, and release acceptance gates.

### Modified Capabilities

None. `openspec/specs/` intentionally remains empty; this change defines the future Rust product without canonizing the TypeScript implementation as baseline specifications.

## Impact

- The existing TypeScript implementation, generated TypeScript DAP registry, Node build configuration, and TypeScript-only unit harnesses will be removed or replaced.
- The repository will gain a Rust crate, Rust tests, native release builds, platform npm packages or equivalent verified native payloads, and an npm installer package.
- Existing fixtures, user workflows, adapter cache concepts, plugin documentation, and hand-driven smoke sequences will be renamed and adapted to `agent-debug`.
- CI and release automation will use specified workflows, runners, scripts, artifact contracts, npm trusted publishing, and publication ordering to validate Rust formatting/linting/tests, native packaging, npm installation, real adapter smokes, startup performance, and the published executable.
- Existing users must migrate commands, environment variables, state paths, package names, and plugin/skill names; no automatic compatibility layer is provided.
