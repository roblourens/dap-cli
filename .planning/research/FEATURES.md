# Feature Research

**Domain:** Agent-facing Debug Adapter Protocol CLI
**Researched:** 2026-05-02
**Confidence:** HIGH

## Feature Landscape

### Table Stakes (Users Expect These)

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Stateful session lifecycle | Agents need separate commands to target the same debug session. | HIGH | Launch/attach/open and stop/close semantics should mirror Playwright-style statefulness. |
| Adapter configuration | DAP supports many adapters; users must point at arbitrary adapters. | MEDIUM | Support persistent config and command-line overrides. |
| Built-in JS and Python adapters | User explicitly requested js-debug and Python out of the box. | HIGH | Packaging and platform behavior are the hard parts. |
| Typed DAP request commands | User wants all DAP methods available as CLI args. | HIGH | Generate command metadata from the official spec to avoid drift. |
| Common ergonomic aliases | Agents need memorable commands for frequent debugging actions. | MEDIUM | Examples: `set-breakpoints`, `stack-trace`, `scopes`, `variables`, `continue`, `next`, `step-in`, `step-out`. |
| Polling status inspection | v1 relies on polling to know whether execution is paused. | MEDIUM | Provide `status`, `threads`, `stackTrace`, and stopped-state summaries. |
| JSON output | Agents need parseable responses. | LOW | Default to JSON or provide `--json` consistently. |
| Error clarity | Debug adapters fail in many ways. | MEDIUM | Include session ID, request name, adapter stderr/log path, and next action. |

### Differentiators (Competitive Advantage)

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Playwright-style command ergonomics | Fits directly into UI-driving agent workflows. | MEDIUM | Command names should feel scriptable and composable. |
| Default active session | Reduces repeated flags when an agent is debugging one app. | MEDIUM | Still allow explicit session IDs for parallel sessions. |
| Generated help for every DAP request | Makes full protocol coverage discoverable. | HIGH | Help can include capability requirements and argument schema. |
| Adapter descriptor registry | Lets users add languages without core changes. | MEDIUM | Descriptors define command, args, transport, capabilities, and config examples. |
| Transcript/log capture | Helps agents diagnose why a DAP request failed. | MEDIUM | Redact sensitive launch args where possible. |

### Anti-Features (Commonly Requested, Often Problematic)

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Event streaming in v1 | Avoid polling and react instantly. | Requires stable daemon event subscription semantics and terminal behavior. | Poll first; add `wait-for-stopped` or event streams later. |
| Language-specific first-class core APIs | Feels easier for common languages. | Pollutes a DAP CLI with adapter-specific behavior. | Keep core generic and layer adapter presets/descriptors around it. |
| Bundling every popular adapter | Makes the tool seem universal. | Distribution size, licensing, platform binaries, and toolchain requirements balloon quickly. | Bundle JS/Python first; support configured custom adapters. |
| VS Code launch.json compatibility as v1 blocker | Familiar config format. | Full compatibility brings many VS Code-specific assumptions. | Accept DAP launch config JSON and consider launch.json import later. |

## Feature Dependencies

```text
Adapter descriptors
    -> Session controller
        -> DAP transport/client
            -> Typed request commands
                -> Polling status and inspection commands

Official DAP protocol metadata
    -> Generated command schema
        -> Generated help and validation

Built-in JS/Python adapters
    -> Adapter packaging and smoke tests
```

### Dependency Notes

- **Typed commands require protocol metadata:** Full DAP coverage is too broad to hand-maintain safely.
- **Polling requires persistent session state:** A stack trace command only works if the daemon knows the current stopped thread/session state.
- **Built-in adapters require config override support:** Even bundled adapters need escape hatches for local toolchain/version differences.

## MVP Definition

### Launch With (v1)

- [ ] Stateful controller with launch, attach, list/status, and stop/close commands.
- [ ] Generic DAP client transport for stdio and TCP/server-style adapters.
- [ ] Typed commands for every DAP request, generated or backed by protocol metadata.
- [ ] Ergonomic aliases for breakpoint, stack, scopes, variables, continue, step, pause, evaluate, and source inspection commands.
- [ ] Polling-based pause detection through status/stack/threads commands.
- [ ] Built-in JavaScript and Python adapter descriptors with smoke tests.
- [ ] Persistent config for custom adapters and command-line overrides.
- [ ] JSON-first output and clear nonzero exit codes.

### Add After Validation (v1.x)

- [ ] Blocking helper commands such as `wait-for-stopped --timeout` after polling semantics are stable.
- [ ] Launch config import/export helpers.
- [ ] More bundled adapter descriptors for Go, Java, .NET, Rust, or others.
- [ ] Rich event log inspection and replay.

### Future Consideration (v2+)

- [ ] Streaming event subscriptions.
- [ ] Long-running TUI or watch mode.
- [ ] Agent policy layer for safe evaluation and remote attach controls.

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Stateful session lifecycle | HIGH | HIGH | P1 |
| DAP transport/client | HIGH | HIGH | P1 |
| Typed request coverage | HIGH | HIGH | P1 |
| Polling inspection commands | HIGH | MEDIUM | P1 |
| JS/Python built-ins | HIGH | HIGH | P1 |
| Custom adapter config | HIGH | MEDIUM | P1 |
| Blocking wait commands | MEDIUM | MEDIUM | P2 |
| Event streams | MEDIUM | HIGH | P3 |

## Competitor Feature Analysis

| Feature | Playwright CLI | mcp-debugger | Our Approach |
|---------|----------------|--------------|--------------|
| Stateful control | Uses open/close style flows for browser interaction. | Uses MCP sessions/tools. | Stateful CLI controller with launch/attach/stop commands. |
| Agent API | Shell commands for browser actions. | Structured MCP tools. | Shell commands for DAP actions that pair with Playwright commands. |
| Multi-language debug | Not applicable. | Adapter pattern for multiple languages. | Core DAP client plus JS/Python bundled descriptors and custom adapters. |
| Event handling | Browser actions often block or return state. | Tool calls return structured state. | Polling in v1, richer wait/event primitives later. |

## Sources

- User project brief and follow-up answers.
- https://microsoft.github.io/debug-adapter-protocol/ - protocol scope and implementor ecosystem.
- https://github.com/microsoft/vscode-js-debug - JavaScript adapter behavior and standalone server note.
- https://github.com/microsoft/debugpy - Python adapter behavior and CLI attach/listen usage.
- `/Users/roblou/code/mcp-debugger/README.md` - product inspiration for agent-debugging workflows.

---
*Feature research for: Agent-facing DAP CLI*
*Researched: 2026-05-02*