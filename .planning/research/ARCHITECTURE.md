# Architecture Research

**Domain:** Agent-facing Debug Adapter Protocol CLI
**Researched:** 2026-05-02
**Confidence:** HIGH for core architecture, MEDIUM for adapter distribution

## Standard Architecture

### System Overview

```text
+---------------------------+
| dap-cli executable        |
| - command parser          |
| - JSON output             |
| - validation              |
+-------------+-------------+
              |
              v
+---------------------------+        +------------------------+
| Session controller        |<------>| Session state store    |
| - daemon/server process   |        | - session IDs          |
| - request sequencing      |        | - active session       |
| - event cache             |        | - adapter metadata     |
+-------------+-------------+        +------------------------+
              |
              v
+---------------------------+        +------------------------+
| DAP client core           |<------>| Adapter registry       |
| - initialize/launch/attach|        | - built-in JS/Python   |
| - requests/responses      |        | - custom descriptors   |
| - event handling/cache    |        | - command resolution   |
+-------------+-------------+        +-----------+------------+
              |                                  |
              v                                  v
+---------------------------+        +------------------------+
| Debug adapter process     |        | User app / target      |
| - stdio or TCP            |<------>| Runtime being debugged |
+---------------------------+        +------------------------+
```

### Component Responsibilities

| Component | Responsibility | Typical Implementation |
|-----------|----------------|------------------------|
| CLI command layer | Parse commands, validate inputs, print JSON/errors. | commander commands backed by generated DAP metadata and hand-written aliases. |
| Session controller | Preserve DAP state across separate CLI invocations. | Local daemon or server process with IPC/TCP socket and session registry. |
| DAP client core | Frame messages, track sequence IDs, route responses/events. | TypeScript protocol client using Node streams/sockets. |
| Adapter registry | Resolve adapter launch command, transport, default config, and docs. | JSON/TS descriptors loaded from built-ins and user config. |
| State store | Track active sessions, stopped state, threads, capabilities, logs. | Local file plus daemon memory; file enables discovery/reconnect. |
| Protocol generator | Produce typed command metadata from DAP spec. | Build-time generator from official `debugAdapterProtocol.json`. |

## Recommended Project Structure

```text
src/
  cli/                 # commander setup, output formatting, error mapping
  commands/            # hand-written ergonomic commands and generated DAP bindings
  protocol/            # DAP transport, framing, request/response/event types
  controller/          # daemon lifecycle, IPC server/client, session routing
  sessions/            # session model, active session selection, state persistence
  adapters/            # built-in descriptors and adapter resolution
  config/              # persistent config discovery and validation
  generator/           # protocol JSON to command metadata
  testing/             # fake adapter and integration fixtures
  index.ts             # bin entrypoint
```

### Structure Rationale

- **cli/** stays thin so protocol logic is testable without shelling out.
- **protocol/** owns DAP correctness and should not know about JavaScript/Python special cases.
- **controller/** is the Playwright-style stateful layer that makes separate commands act on one debug session.
- **adapters/** contains descriptors, not language logic embedded in core.
- **generator/** is important because full typed DAP coverage should be regenerated as the spec changes.

## Architectural Patterns

### Pattern 1: Stateful Controller with Thin CLI Client

**What:** Each CLI invocation connects to a local controller that owns long-lived debug sessions.
**When to use:** Any command that talks to an active adapter.
**Trade-offs:** More moving parts than stateless commands, but required for DAP sequence numbers, event cache, and paused state.

### Pattern 2: Adapter Descriptor Registry

**What:** Adapters are described by config: command, args, transport, supported request hints, and example launch/attach configs.
**When to use:** Built-in JS/Python and user-defined adapters.
**Trade-offs:** Keeps core generic but requires good validation and diagnostics.

### Pattern 3: Generated DAP Command Surface

**What:** Generate command names, option schemas, JSON examples, and help text from the official DAP protocol JSON.
**When to use:** All protocol-level request commands.
**Trade-offs:** Requires a generator, but avoids silently missing new or less-common requests.

### Pattern 4: Event Cache, Polling API

**What:** The controller listens to adapter events and stores the latest session/thread/stopped state; CLI commands read it on demand.
**When to use:** v1 pause detection and stack inspection.
**Trade-offs:** Polling can be less efficient than subscriptions, but is much simpler for agents and terminals.

## Data Flow

### Launch Flow

```text
agent -> dap-cli launch --adapter js --config launch.json
      -> controller starts/resolves adapter
      -> DAP initialize
      -> DAP launch or attach
      -> DAP configurationDone when appropriate
      -> session ID returned
```

### Breakpoint and Playwright Flow

```text
agent -> dap-cli setBreakpoints --session app --source file --lines 42
agent -> playwright click ...
agent -> dap-cli status --session app
agent -> dap-cli stackTrace --session app --thread <id>
agent -> dap-cli scopes / variables / evaluate
agent -> dap-cli continue --session app
```

### Event Handling in v1

```text
adapter stopped event -> controller updates cached stopped state
agent polling command -> controller returns current state and recent events
```

## Scaling Considerations

| Scale | Architecture Adjustments |
|-------|--------------------------|
| Single session | Default active session, local state file, simple controller lifecycle. |
| Multiple sessions | Explicit session IDs, list/status commands, per-session log files. |
| Many adapters/users | Strong config validation, socket namespacing, cleanup of stale controllers. |

### Scaling Priorities

1. **First bottleneck:** stale session/controller state. Fix with robust close/cleanup and heartbeat/status checks.
2. **Second bottleneck:** noisy adapter logs and events. Fix with bounded event history and log files.
3. **Third bottleneck:** generated command discoverability. Fix with grouped help and examples.

## Anti-Patterns

### Anti-Pattern 1: New Adapter per CLI Command

**What people do:** Spawn a debug adapter for every command.
**Why it's wrong:** DAP sessions are stateful; breakpoints, threads, and paused state disappear.
**Do this instead:** Keep sessions alive in a controller and route commands to them.

### Anti-Pattern 2: Language Branches in Protocol Core

**What people do:** Add `if adapter is python` branches inside request handling.
**Why it's wrong:** Core becomes impossible to extend cleanly.
**Do this instead:** Put language differences in adapter descriptors and launch config presets.

### Anti-Pattern 3: Manual Command Coverage for Every DAP Request

**What people do:** Hand-write a command and options for each DAP request.
**Why it's wrong:** The protocol is broad and evolves; coverage will drift.
**Do this instead:** Generate the generic typed surface and hand-write only ergonomic aliases.

## Integration Points

### External Services

| Service | Integration Pattern | Notes |
|---------|---------------------|-------|
| vscode-js-debug | Spawn/connect to standalone DAP server or configured local build. | Releases provide standalone DAP server builds; packaging must be verified per platform. |
| debugpy | Launch Python with `-m debugpy --listen` or attach to existing server. | Warn about non-localhost listen addresses because debugpy can execute code in the debuggee. |
| Custom adapters | Configured command/args or host/port. | Must support env vars, cwd, and transport selection. |
| Playwright CLI | Separate shell command workflow. | dap-cli should produce stable JSON and nonzero exits so agents can sequence calls. |

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| CLI to controller | Local IPC/TCP with JSON messages | Commands should fail clearly if the controller is not running. |
| Controller to adapter | DAP over stdio or socket | Core must handle content-length framing, response matching, and async events. |
| Controller to state store | File IO plus memory | Store enough for discovery, not sensitive launch secrets by default. |

## Sources

- https://microsoft.github.io/debug-adapter-protocol/specification - DAP requests, events, reverse requests, and types.
- https://github.com/microsoft/vscode-js-debug - standalone JS DAP server and features.
- https://github.com/microsoft/debugpy - Python adapter launch/listen/attach behavior.
- `/Users/roblou/code/mcp-debugger/README.md` and package metadata - inspiration for adapter categories and agent debugging actions only.

---
*Architecture research for: Agent-facing DAP CLI*
*Researched: 2026-05-02*