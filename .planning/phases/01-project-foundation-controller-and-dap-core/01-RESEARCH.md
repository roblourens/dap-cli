# Phase 1: Project Foundation, Controller, and DAP Core - Research

**Researched:** 2026-05-02  
**Domain:** TypeScript/Node agent-facing Debug Adapter Protocol CLI  
**Confidence:** HIGH for Phase 1 architecture and DAP lifecycle, MEDIUM for final package choices after implementation starts

## User Constraints (No CONTEXT.md)

There is intentionally no Phase 1 `CONTEXT.md`; the user selected "Continue Without Context," so this research uses `.planning/PROJECT.md`, `.planning/ROADMAP.md`, `.planning/REQUIREMENTS.md`, `.planning/research/*`, `copilot-instructions.md`, and the explicit user request as source of truth. [VERIFIED: user request] [VERIFIED: phase init]

Locked Phase 1 constraints:

- Phase 1 must establish a persistent controller, session state, active-session targeting, language-neutral DAP transport/client lifecycle, bounded event cache, polling state, JSON/error diagnostics, and deterministic fake-adapter tests. [VERIFIED: .planning/ROADMAP.md] [VERIFIED: .planning/REQUIREMENTS.md]
- The protocol core must remain vanilla DAP and language-neutral; JavaScript and Python adapter specifics belong behind descriptor/config/process/transport boundaries, not inside protocol request handling. [VERIFIED: copilot-instructions.md] [VERIFIED: .planning/PROJECT.md]
- The CLI should be thin and Playwright-inspired: separate shell invocations route to a persistent controller that owns debugger sessions. [VERIFIED: .planning/PROJECT.md] [VERIFIED: .planning/research/ARCHITECTURE.md]
- The v1 event model is polling-only; do not plan event streaming, subscription APIs, or blocking wait commands for Phase 1. [VERIFIED: .planning/PROJECT.md] [VERIFIED: .planning/REQUIREMENTS.md]
- Professional modular TypeScript architecture is a first-class requirement, not polish work. [VERIFIED: copilot-instructions.md] [VERIFIED: .planning/ROADMAP.md]
- Use `/Users/roblou/code/mcp-debugger/` as product-shape inspiration where helpful. [VERIFIED: .planning/PROJECT.md] [VERIFIED: copilot-instructions.md]
- Nyquist validation is disabled in `.planning/config.json`, so Phase 1 should include normal implementation tests but should not require separate Nyquist validation artifacts. [VERIFIED: .planning/config.json]

## Summary

Phase 1 should build the substrate that makes every later DAP command reliable: a TypeScript CLI entrypoint that emits stable JSON, a persistent local controller, a session registry with default active-session targeting, a vanilla DAP client over stdio and TCP/socket transports, an explicit lifecycle state machine, bounded recent event history, and deterministic fake-adapter tests. [VERIFIED: .planning/ROADMAP.md] [VERIFIED: .planning/REQUIREMENTS.md] [CITED: https://microsoft.github.io/debug-adapter-protocol/overview]

The primary planning risk is treating DAP as simple stateless JSON. DAP uses request/response/event messages over a framed stream, requires `initialize` capability negotiation before other requests, has launch/attach arguments that are adapter-specific, and invalidates many frame/scope/variable references when execution resumes. [CITED: https://microsoft.github.io/debug-adapter-protocol/debugAdapterProtocol.json] [CITED: https://microsoft.github.io/debug-adapter-protocol/overview]

**Primary recommendation:** Implement a small but complete architecture slice: CLI -> controller IPC -> session router -> DAP client -> fake adapter, with JSON/error contracts and tests proving two separate CLI invocations can operate on the same persistent session. [VERIFIED: .planning/ROADMAP.md] [ASSUMED]

## Project Constraints (from copilot-instructions.md)

- Use Node.js with TypeScript for the CLI and controller. [VERIFIED: copilot-instructions.md]
- Keep the core protocol boundary vanilla DAP, without JavaScript/Python special cases. [VERIFIED: copilot-instructions.md]
- Share debugger state across CLI calls through persistent session behavior. [VERIFIED: copilot-instructions.md]
- Use polling for v1 event/state inspection. [VERIFIED: copilot-instructions.md]
- Treat adapters as external services through descriptors, config, process, and transport boundaries. [VERIFIED: copilot-instructions.md]
- Preserve clean module boundaries: `cli/`, `controller/`, `sessions/`, `protocol/`, `adapters/`, `config/`, `generator/`, and `testing/`. [VERIFIED: copilot-instructions.md]
- Use `mcp-debugger` as product-shape inspiration where helpful. [VERIFIED: copilot-instructions.md]
- This artifact is a direct user-requested planning edit, so it is allowed despite the default GSD note that implementation edits should normally start through GSD workflow entry points. [VERIFIED: user request] [VERIFIED: copilot-instructions.md]

<phase_requirements>

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| SESS-01 | Start a persistent controller preserving sessions across CLI invocations. | Controller daemon, discovery file, IPC client, and fake two-invocation test recommendations. [VERIFIED: .planning/REQUIREMENTS.md] |
| SESS-04 | List sessions, inspect status, target default active session. | Session registry, active-session selector, status JSON, and structured errors for missing/ambiguous sessions. [VERIFIED: .planning/REQUIREMENTS.md] |
| SESS-05 | Stop, detach, close, cleanup without stale state or orphaned adapters. | Lifecycle owner model, adapter process ownership, terminate/disconnect fallback, cleanup scans. [VERIFIED: .planning/REQUIREMENTS.md] [CITED: https://microsoft.github.io/debug-adapter-protocol/debugAdapterProtocol.json] |
| DAP-01 | Communicate with adapters over stdio and socket-style transports. | `Readable/Writable` transport abstraction over child process stdio and `net.Socket`. [VERIFIED: .planning/REQUIREMENTS.md] [CITED: https://nodejs.org/api/child_process.html] [CITED: https://nodejs.org/api/net.html] |
| DAP-02 | Model initialize, launch/attach, initialized, configurationDone, stopped, termination. | Explicit lifecycle state machine and fake adapter scripted lifecycle. [VERIFIED: .planning/REQUIREMENTS.md] [CITED: https://microsoft.github.io/debug-adapter-protocol/overview] |
| DBG-05 | Poll current status: running, paused, terminated, unavailable. | Cached lifecycle plus last stopped/continued/terminated events surfaced by `status`. [VERIFIED: .planning/REQUIREMENTS.md] |
| DBG-06 | Inspect bounded recent event history. | Per-session ring buffer with cursor and event sequence metadata. [VERIFIED: .planning/REQUIREMENTS.md] |
| AGNT-01 | Machine-readable JSON output. | Single JSON envelope recommendation for success and failure. [VERIFIED: .planning/REQUIREMENTS.md] |
| AGNT-02 | Stable nonzero exit codes and structured errors. | Error taxonomy and exit-code table. [VERIFIED: .planning/REQUIREMENTS.md] |
| AGNT-03 | Surface stderr, log paths, request names, session IDs, diagnostics. | Adapter stderr tail, transcript/log path, request metadata, and diagnostic actions in error payloads. [VERIFIED: .planning/REQUIREMENTS.md] |
| TEST-01 | Deterministic fake-adapter tests for framing, sequencing, event caching, session state. | Scripted fake adapter plus protocol/unit/integration test matrix. [VERIFIED: .planning/REQUIREMENTS.md] |
| TEST-03 | CLI parsing and JSON output contracts covered by automated tests. | Commander exit/output override tests and CLI subprocess tests. [VERIFIED: .planning/REQUIREMENTS.md] [CITED: https://github.com/tj/commander.js#readme] |

</phase_requirements>

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|--------------|----------------|-----------|
| Command parsing and process exit behavior | CLI process | Controller client | The CLI owns argv parsing and exit codes; controller client owns routing once arguments are validated. [VERIFIED: .planning/research/ARCHITECTURE.md] |
| Persistent debug session ownership | Controller daemon | Session store | DAP sessions are long-lived and eventful, so the daemon owns live clients and adapter processes while the store enables discovery across invocations. [CITED: https://microsoft.github.io/debug-adapter-protocol/overview] [VERIFIED: .planning/research/PITFALLS.md] |
| Active-session targeting | Session store | CLI process | The store records `activeSessionId`; the CLI resolves `--session` or active default before sending controller requests. [VERIFIED: .planning/REQUIREMENTS.md] [ASSUMED] |
| DAP request sequencing and response matching | Protocol client | Controller session | DAP messages include per-actor sequence numbers and responses include `request_seq`; the protocol client should assign seq values and match responses. [CITED: https://microsoft.github.io/debug-adapter-protocol/debugAdapterProtocol.json] |
| Adapter process lifecycle | Adapters/process layer | Controller daemon | Debug adapter startup is not specified by DAP, so dap-cli must manage external processes and sockets outside protocol core. [CITED: https://microsoft.github.io/debug-adapter-protocol/overview] |
| Event cache and polling status | Controller session | Protocol client | The protocol client receives events; the controller interprets them into session status and bounded history for polling commands. [VERIFIED: .planning/research/ARCHITECTURE.md] |
| JSON success/error contract | CLI process | Controller API | Agent-facing output must be stable even when failures originate in controller, session, transport, or adapter layers. [VERIFIED: .planning/REQUIREMENTS.md] |
| Deterministic fake-adapter tests | Testing fixtures | Protocol/client/controller | The fake adapter should exercise framing and lifecycle without real JS/Python adapter packaging variability. [VERIFIED: .planning/research/PITFALLS.md] |

## Standard Stack

### Core

| Library/Technology | Version | Purpose | Why Standard | Source |
|--------------------|---------|---------|--------------|--------|
| Node.js | 22.22.1 available locally; Node 22+ target | Runtime for CLI, controller, child processes, sockets. | Modern supported Node baseline for TypeScript CLI work and stable async process/socket APIs. | [VERIFIED: local command] [CITED: https://nodejs.org/api/child_process.html] [CITED: https://nodejs.org/api/net.html] |
| npm | 10.9.4 available locally | Package manager and script runner. | Present in the target environment. | [VERIFIED: local command] |
| TypeScript | 6.0.3, modified 2026-04-16 | Implementation language. | Strong type checking is needed for DAP request/response/event shapes. | [VERIFIED: npm registry] [VERIFIED: .planning/research/STACK.md] |
| Debug Adapter Protocol | 1.71.x current spec family | Wire protocol and lifecycle contract. | Official DAP JSON/spec should drive protocol semantics and later command generation. | [CITED: https://microsoft.github.io/debug-adapter-protocol/debugAdapterProtocol.json] [CITED: https://microsoft.github.io/debug-adapter-protocol/changelog] |
| `@vscode/debugprotocol` | 1.68.0, modified 2024-11-05 | Useful DAP type declarations. | Helpful for names/types, but behind current DAP 1.71.x changes, so it must not be the sole source for full command coverage. | [VERIFIED: npm registry] [CITED: https://microsoft.github.io/debug-adapter-protocol/changelog] |
| `commander` | 14.0.3, modified 2026-04-24 | CLI command routing and help. | Supports nested commands, async actions via `parseAsync`, TypeScript import, output/exit override, and strict option validation. | [VERIFIED: npm registry] [CITED: https://github.com/tj/commander.js#readme] |
| `zod` | 4.4.2, modified 2026-05-01 | Runtime validation for config, IPC messages, and JSON command inputs. | TypeScript-first validation with `strict` TypeScript support and JSON Schema conversion. | [VERIFIED: npm registry] [CITED: https://zod.dev/] |

### Supporting

| Library/Technology | Version | Purpose | When to Use | Source |
|--------------------|---------|---------|-------------|--------|
| `vitest` | 4.1.5, modified 2026-04-23 | Unit/integration tests. | Use for protocol framing, session state, controller API, fake adapter, and CLI contract tests. | [VERIFIED: npm registry] [CITED: https://vitest.dev/guide/] |
| `tsup` | 8.5.1, modified 2025-11-12 | Bundle CLI executable. | Use if the project wants a simple npm-publishable binary bundle. | [VERIFIED: npm registry] [VERIFIED: .planning/research/STACK.md] |
| `eslint` | 10.3.0, modified 2026-05-01 | Static quality gate. | Use to enforce strict TypeScript and prevent unsafe protocol casts. | [VERIFIED: npm registry] [VERIFIED: user instructions] |
| `@types/node` | 25.6.0, modified 2026-04-10 | Node API type declarations. | Required for typed process, fs, stream, net, and child_process APIs. | [VERIFIED: npm registry] |
| `@vscode/debugadapter` | 1.68.0, modified 2024-11-05 | Adapter-side helper package. | Avoid as a runtime dependency for dap-cli client core; consider only for fake adapter implementation if it reduces test complexity. | [VERIFIED: npm registry] [ASSUMED] |

**Installation baseline:**

```bash
npm install commander zod @vscode/debugprotocol
npm install -D typescript @types/node vitest tsup eslint
```

This repository currently has no `package.json`, so Plan 01-01 must create the Node package foundation before dependency installation. [VERIFIED: workspace file search]

## Recommended Phase 1 Module Boundaries and File Layout

Use this structure as the Phase 1 target slice. It preserves the later roadmap boundaries while keeping Phase 1 focused. [VERIFIED: copilot-instructions.md] [ASSUMED]

```text
src/
  index.ts                     # bin entrypoint; calls cli/main.ts
  cli/
    main.ts                    # create Command, parseAsync, top-level error bridge
    program.ts                 # command registration; no protocol logic
    output.ts                  # success/error JSON envelope writing
    exitCodes.ts               # stable exit code enum
    errors.ts                  # CLI error mapping to JsonErrorPayload
    commands/
      controller.ts            # start/stop/controller status commands
      sessions.ts              # list/status/target/cleanup commands
      dapCore.ts               # Phase 1 minimal initialize/launch/attach/request plumbing if exposed
  controller/
    server.ts                  # local daemon server lifecycle
    client.ts                  # CLI-side controller client
    ipc.ts                     # local IPC endpoint discovery and connect/listen
    requests.ts                # zod schemas/types for controller API messages
    diagnostics.ts             # controller health and failure summaries
  sessions/
    session.ts                 # Session, SessionId, lifecycle state, status projection
    sessionManager.ts          # registry, routing, cleanup, active-session coordination
    sessionStore.ts            # persisted discovery/active-session metadata
    activeSession.ts           # selection rules and errors
  protocol/
    dapMessages.ts             # protocol message types and helpers
    framing.ts                 # Content-Length parser/writer
    transport.ts               # DapTransport interface
    stdioTransport.ts          # child_process stdio transport
    socketTransport.ts         # net.Socket transport
    dapClient.ts               # seq allocation, pending responses, request API, event emitter
    lifecycle.ts               # initialize/launch/attach/configurationDone/stopped/termination state
    eventCache.ts              # bounded event ring and cursor model
  adapters/
    descriptor.ts              # external adapter descriptor contract
    processAdapter.ts          # spawn/kill/log stderr tail for stdio adapters
    socketAdapter.ts           # host/port connection descriptors
  config/
    paths.ts                   # state/log path resolution with test overrides
    schema.ts                  # zod schemas for config/state files
  testing/
    fakeAdapter.ts             # reusable fake adapter process/server harness
    dapScript.ts               # scripted request/event scenarios
    tempEnv.ts                 # isolated DAP_CLI_HOME/test paths

tests/
  protocol/
    framing.test.ts
    dapClient.test.ts
    lifecycle.test.ts
    eventCache.test.ts
  controller/
    sessionManager.test.ts
    controllerIpc.test.ts
  cli/
    jsonOutput.test.ts
    sessionCommands.test.ts
  fixtures/
    fake-adapter-entry.ts
```

Boundary rules:

- `cli/` may depend on `controller/client`, `output`, and shared error types, but must not import `protocol/dapClient` directly. [VERIFIED: copilot-instructions.md] [ASSUMED]
- `controller/` owns live session objects, request routing, adapter process ownership, and lifecycle transitions. [VERIFIED: .planning/research/ARCHITECTURE.md]
- `protocol/` owns framing, transports, request sequence numbers, response matching, event parsing, and DAP lifecycle helpers; it must not know about JavaScript, Python, Playwright, or concrete adapter presets. [VERIFIED: copilot-instructions.md] [CITED: https://microsoft.github.io/debug-adapter-protocol/overview]
- `adapters/` owns external process/socket descriptors and stderr/log handling; it passes streams/sockets into `protocol/` through `DapTransport`. [VERIFIED: copilot-instructions.md] [CITED: https://nodejs.org/api/child_process.html]
- `sessions/` owns stable session IDs, default active-session state, status projection, and cleanup policy. [VERIFIED: .planning/REQUIREMENTS.md]
- `testing/` should provide the fake adapter and fixture utilities consumed by protocol, controller, and CLI tests. [VERIFIED: .planning/REQUIREMENTS.md]

## Architecture Patterns

### System Architecture Diagram

```text
Agent shell command
  |
  v
Thin CLI process
  | parse args, validate command input, write one JSON envelope
  v
Controller client
  | local IPC request: { command, sessionId?, payload }
  v
Persistent controller daemon
  | owns session registry, active session, lifecycle, event cache, diagnostics
  +--> Session store on disk
  |       stores endpoint, controller pid, activeSessionId, session summaries
  |
  +--> DAP session
          | uses DAP client core for seq/request/event lifecycle
          v
      Transport boundary
          | stdio: child_process stdin/stdout, stderr to diagnostics
          | socket: net.Socket host/port or IPC-style socket
          v
      External debug adapter or fake adapter
```

A separate CLI invocation should only reconnect to the controller and route a command; it should not recreate the DAP adapter or lose request sequence/event state. [VERIFIED: .planning/research/PITFALLS.md] [CITED: https://microsoft.github.io/debug-adapter-protocol/overview]

### Pattern 1: Controller Daemon with Explicit Discovery

**What:** Start a local controller process that listens on a local IPC endpoint and writes a discovery file containing endpoint, pid, project identity, version, and last heartbeat. [CITED: https://nodejs.org/api/net.html] [ASSUMED]

**When to use:** Every command that needs session state, active-session resolution, adapter diagnostics, or DAP request routing. [VERIFIED: .planning/REQUIREMENTS.md]

**Plan implication:** Plan 01-02 should implement controller start/status/stop and stale discovery cleanup before adding real DAP behavior. [ASSUMED]

**Recommended discovery shape:**

```typescript
export interface ControllerDiscovery {
  version: 1;
  pid: number;
  endpoint: { kind: 'ipc'; path: string } | { kind: 'tcp'; host: '127.0.0.1'; port: number };
  stateDir: string;
  logDir: string;
  activeSessionId?: string;
  startedAt: string;
  lastHeartbeatAt: string;
}
```

Use IPC sockets/named pipes or localhost TCP behind one `ControllerEndpoint` abstraction; Node documents IPC path differences and persistence behavior across Unix domain sockets and Windows named pipes, so hide those details early. [CITED: https://nodejs.org/api/net.html]

### Pattern 2: Session Manager Owns Active-Session Targeting

**What:** Resolve a command target by `--session <id>` first, otherwise by persisted active session. Return structured errors for no sessions, missing session, terminated session, and ambiguous selection. [VERIFIED: .planning/REQUIREMENTS.md] [ASSUMED]

**When to use:** `status`, `events`, lifecycle, and later DAP request commands. [VERIFIED: .planning/ROADMAP.md]

**Plan implication:** Do not let every CLI command implement its own session lookup rules; put selection in `sessions/activeSession.ts` and test it once. [ASSUMED]

### Pattern 3: DAP Client with Transport Abstraction

**What:** Implement `DapTransport` as a duplex byte stream abstraction and build the DAP framing/request/event logic above it. [CITED: https://microsoft.github.io/debug-adapter-protocol/overview] [CITED: https://nodejs.org/api/child_process.html] [CITED: https://nodejs.org/api/net.html]

```typescript
export interface DapTransport {
  readonly name: string;
  readonly readable: NodeJS.ReadableStream;
  readonly writable: NodeJS.WritableStream;
  close(): Promise<void>;
}
```

**When to use:** Both stdio adapters and socket-style adapters must feed the same `DapClient`. [VERIFIED: .planning/REQUIREMENTS.md]

**Plan implication:** Plan 01-03 should avoid request APIs that assume child processes; process ownership belongs in `adapters/`, while protocol only sees byte streams. [VERIFIED: copilot-instructions.md]

### Pattern 4: Polling Status Projection from Bounded Events

**What:** Convert DAP events into a durable status projection and recent event ring. `status` reads the projection; `events` reads the ring by cursor/count. [VERIFIED: .planning/REQUIREMENTS.md] [ASSUMED]

**When to use:** Phase 1 v1 polling semantics and Phase 2 inspection commands. [VERIFIED: .planning/ROADMAP.md]

**Plan implication:** Do not cache scoped object references as generally reusable state; DAP states that scope/variable references are valid only for the current suspended state and become invalid after resume. [CITED: https://microsoft.github.io/debug-adapter-protocol/overview]

## Controller and Session-State Architecture

### Controller API Surface for Phase 1

Plan a small internal controller API before adding broad DAP commands. [ASSUMED]

| Controller Request | Purpose | Required Phase |
|--------------------|---------|----------------|
| `controller.status` | Report pid, endpoint, version, uptime, state/log dirs, session count. [ASSUMED] | 01-02 |
| `controller.shutdown` | Stop controller after closing or detaching sessions according to policy. [VERIFIED: .planning/REQUIREMENTS.md] | 01-02 |
| `sessions.list` | Return summaries for all sessions. [VERIFIED: .planning/REQUIREMENTS.md] | 01-02 |
| `sessions.status` | Return lifecycle, stopped state, active thread, event cursor, adapter diagnostics. [VERIFIED: .planning/REQUIREMENTS.md] | 01-02/01-03 |
| `sessions.target` | Set active session by stable ID. [VERIFIED: .planning/REQUIREMENTS.md] | 01-02 |
| `sessions.close` | Close session and remove state. [VERIFIED: .planning/REQUIREMENTS.md] | 01-02/01-03 |
| `sessions.cleanup` | Remove stale discovery/session records and orphan-owned adapter processes where safe. [VERIFIED: .planning/REQUIREMENTS.md] | 01-02/01-04 |
| `dap.start` | Create a DAP session with descriptor/config and run initialize plus launch/attach path. [VERIFIED: .planning/ROADMAP.md] | 01-03 |
| `dap.request` | Internal raw request helper for fake-adapter tests and future Phase 2 command surface. [VERIFIED: .planning/ROADMAP.md] | 01-03 |
| `events.recent` | Return bounded recent events with cursor filtering. [VERIFIED: .planning/REQUIREMENTS.md] | 01-03 |

### Session Model

Recommended state object:

```typescript
export type SessionLifecycle =
  | 'created'
  | 'adapterStarting'
  | 'transportOpen'
  | 'initializing'
  | 'initialized'
  | 'launching'
  | 'attaching'
  | 'configuring'
  | 'running'
  | 'stopped'
  | 'terminating'
  | 'terminated'
  | 'disconnected'
  | 'failed';

export interface SessionStatus {
  sessionId: string;
  active: boolean;
  lifecycle: SessionLifecycle;
  adapter: {
    descriptorId: string;
    transport: 'stdio' | 'socket';
    pid?: number;
    logPath?: string;
    stderrTail?: string[];
  };
  dap: {
    initialized: boolean;
    capabilities?: Record<string, unknown>;
    lastRequest?: { command: string; seq: number; at: string };
  };
  stopped?: {
    reason: string;
    threadId?: number;
    allThreadsStopped?: boolean;
    description?: string;
    stoppedEpoch: number;
    at: string;
  };
  recentEvents: {
    cursor: number;
    count: number;
    dropped: number;
  };
}
```

Important model rules:

- `sessionId` should be stable, opaque, and generated by dap-cli, not borrowed from adapter process IDs. [VERIFIED: .planning/REQUIREMENTS.md] [ASSUMED]
- `activeSessionId` is convenience state, not the only way to target a session; every routed command should still accept explicit session ID. [VERIFIED: .planning/REQUIREMENTS.md]
- `stoppedEpoch` should increment on every `stopped` event and be cleared or invalidated on continued/running transitions; use it later to reject stale `frameId`/`variablesReference` usage. [CITED: https://microsoft.github.io/debug-adapter-protocol/overview] [ASSUMED]
- The controller should keep live session state in memory and persist only discovery/summaries needed for reconnection and cleanup; avoid persisting raw launch env or secrets. [VERIFIED: .planning/research/PITFALLS.md] [ASSUMED]

### Cleanup Lifecycle

DAP termination behavior differs for launched vs attached debuggees: `terminate` is graceful and capability-gated; `disconnect` ends the debug session and may terminate a launched debuggee while detaching from an attached one. [CITED: https://microsoft.github.io/debug-adapter-protocol/overview] [CITED: https://microsoft.github.io/debug-adapter-protocol/debugAdapterProtocol.json]

Recommended Phase 1 cleanup policy:

1. `stop` should attempt graceful `terminate` only when capabilities indicate support, then fall back to `disconnect` if needed. [CITED: https://microsoft.github.io/debug-adapter-protocol/debugAdapterProtocol.json] [ASSUMED]
2. `detach` should send `disconnect` with detach semantics for attached sessions and should not kill an externally owned debuggee. [CITED: https://microsoft.github.io/debug-adapter-protocol/debugAdapterProtocol.json] [ASSUMED]
3. `close` should remove dap-cli session state after protocol shutdown succeeds or after explicit force cleanup. [VERIFIED: .planning/REQUIREMENTS.md] [ASSUMED]
4. `cleanup` should detect stale controller discovery by pid/endpoint health and remove stale state; it should only kill adapter processes that dap-cli started and still owns. [CITED: https://nodejs.org/api/child_process.html] [ASSUMED]

## DAP Transport and Client Lifecycle Notes

### Base Protocol Framing

DAP messages use an ASCII header section with required `Content-Length`, followed by `\r\n\r\n`, then a UTF-8 JSON body. [CITED: https://microsoft.github.io/debug-adapter-protocol/overview]

Implementation implications:

- The parser must handle arbitrary stream chunking, multiple messages in one chunk, split headers, split JSON bodies, and invalid `Content-Length`. [CITED: https://microsoft.github.io/debug-adapter-protocol/overview] [ASSUMED]
- The writer must compute byte length with `Buffer.byteLength(json, 'utf8')`, not string length. [CITED: https://microsoft.github.io/debug-adapter-protocol/overview] [ASSUMED]
- Adapter stderr must never be mixed into stdout protocol bytes for stdio transports. [CITED: https://microsoft.github.io/debug-adapter-protocol/overview] [VERIFIED: .planning/research/PITFALLS.md]

### Request Sequencing and Matching

DAP protocol messages have `seq`; responses include `request_seq`, `success`, and `command`. [CITED: https://microsoft.github.io/debug-adapter-protocol/debugAdapterProtocol.json]

Recommended client behavior:

- Allocate request `seq` in `DapClient`, starting at 1 for the client actor. [CITED: https://microsoft.github.io/debug-adapter-protocol/debugAdapterProtocol.json]
- Keep a pending map keyed by request seq; do not assume responses arrive in the same order as requests. [CITED: https://microsoft.github.io/debug-adapter-protocol/debugAdapterProtocol.json] [ASSUMED]
- Keep Phase 1 controller routing serialized per session unless there is a tested need for concurrent DAP requests; the client can still support out-of-order matching internally. [ASSUMED]
- Convert failed DAP responses into dap-cli structured errors while preserving adapter `message`, structured `body.error`, request name, session ID, and seq. [CITED: https://microsoft.github.io/debug-adapter-protocol/debugAdapterProtocol.json] [VERIFIED: .planning/REQUIREMENTS.md]

### Initialization and Launch/Attach

The `initialize` request must be the first client request, may only be sent once, and returns adapter capabilities. [CITED: https://microsoft.github.io/debug-adapter-protocol/debugAdapterProtocol.json]

Launch and attach arguments are runtime/debugger-specific and are not specified by DAP; this is the strongest reason to keep adapter descriptors/config outside `protocol/`. [CITED: https://microsoft.github.io/debug-adapter-protocol/overview] [CITED: https://microsoft.github.io/debug-adapter-protocol/debugAdapterProtocol.json]

Recommended lifecycle implementation:

```text
created
  -> adapterStarting
  -> transportOpen
  -> initializing
  -> initialized
  -> launching | attaching
  -> configuring after initialized event
  -> running after launch/attach/configurationDone path completes
  -> stopped on stopped event
  -> running on continued/continue-like transition
  -> terminated on terminated event
  -> disconnected after disconnect/transport close
  -> failed on transport/protocol/adapter errors
```

The fake adapter should assert that no request except `initialize` is sent before the initialize response and that `configurationDone` is only sent after the adapter has emitted `initialized` and capabilities allow or require it. [CITED: https://microsoft.github.io/debug-adapter-protocol/debugAdapterProtocol.json] [ASSUMED]

### Stdio Transport

Use `child_process.spawn(command, args, { stdio: ['pipe', 'pipe', 'pipe'], shell: false })` for stdio adapters unless a descriptor explicitly requires shell behavior. [CITED: https://nodejs.org/api/child_process.html] [ASSUMED]

Planning notes:

- `spawn` is asynchronous and returns a `ChildProcess`; handle `spawn`, `error`, `exit`, and `close` distinctly because stdio may still be open at `exit`. [CITED: https://nodejs.org/api/child_process.html]
- Avoid `exec` for adapters because it spawns a shell, buffers output, and has shell-injection risks with unsanitized input. [CITED: https://nodejs.org/api/child_process.html]
- Capture stderr into a bounded tail plus a log file; never write adapter stderr into dap-cli JSON output directly. [VERIFIED: .planning/REQUIREMENTS.md] [ASSUMED]
- Use AbortController or explicit kill/disconnect paths for cleanup, and report signal/exit code in diagnostics. [CITED: https://nodejs.org/api/child_process.html]

### Socket-Style Transport

Use `net.createConnection` for TCP/socket adapters and treat the resulting `net.Socket` as the DAP byte stream. [CITED: https://nodejs.org/api/net.html]

Planning notes:

- Default host should be `localhost`/`127.0.0.1` for locally managed adapters; public bind/connect behavior should be explicit later in adapter config. [CITED: https://nodejs.org/api/net.html] [VERIFIED: .planning/research/PITFALLS.md]
- Handle `connect`, `error`, `timeout`, `end`, and `close`; Node sockets do not close automatically on idle timeout, so the controller must close/destroy on timeout policy. [CITED: https://nodejs.org/api/net.html]
- Node IPC sockets/named pipes have platform-specific paths and cleanup behavior; keep those details inside controller IPC rather than DAP protocol core. [CITED: https://nodejs.org/api/net.html]

## Bounded Event Cache and Polling State Model

DAP events are adapter-initiated messages and include lifecycle-critical events such as `initialized`, `stopped`, `continued`, `thread`, `output`, `exited`, and `terminated`. [CITED: https://microsoft.github.io/debug-adapter-protocol/debugAdapterProtocol.json]

Recommended cache contract:

```typescript
export interface CachedDapEvent {
  cursor: number;
  receivedAt: string;
  sessionId: string;
  dapSeq: number;
  event: string;
  body?: unknown;
  summary: string;
}

export interface EventCacheSnapshot {
  cursor: number;
  events: CachedDapEvent[];
  droppedBeforeCursor?: number;
  capacity: number;
}
```

Phase 1 defaults should be simple and bounded: keep a per-session ring buffer by count, for example 200 events, and write full controller/adapter diagnostics to log files when needed. [VERIFIED: .planning/research/PITFALLS.md] [ASSUMED]

Polling commands should return state projections, not live subscriptions:

```json
{
  "ok": true,
  "data": {
    "sessionId": "s_abc123",
    "status": "stopped",
    "lifecycle": "stopped",
    "active": true,
    "stopped": {
      "reason": "breakpoint",
      "threadId": 1,
      "stoppedEpoch": 3
    },
    "events": {
      "cursor": 42,
      "recentCount": 12,
      "dropped": 0
    }
  }
}
```

Reference invalidation is a core state rule: stack frame, scope, and variable references obtained during a suspended state must be treated as invalid once execution resumes. [CITED: https://microsoft.github.io/debug-adapter-protocol/overview]

Plan implication: Phase 1 should track stopped epochs even before implementing full inspection commands, so Phase 2 can reject stale frame/scope/variable operations cleanly. [ASSUMED]

## JSON Output and Structured Error/Diagnostics Contract

Agents should be able to parse one stable JSON envelope for every command. [VERIFIED: .planning/REQUIREMENTS.md]

Recommended stdout/stderr policy:

- Default command output should be exactly one JSON object on stdout for both success and handled failures; process exit code still communicates success/failure to shells. [VERIFIED: .planning/REQUIREMENTS.md] [ASSUMED]
- Stderr should not contain adapter stderr, DAP transcript bytes, or Commander human text in default agent mode; stderr can be reserved for catastrophic process failures before JSON output is possible. [VERIFIED: .planning/REQUIREMENTS.md] [ASSUMED]
- Override Commander exit/output handling so parse errors become dap-cli JSON errors instead of unstructured text. [CITED: https://github.com/tj/commander.js#readme] [ASSUMED]

Success envelope:

```typescript
export interface JsonSuccess<T> {
  ok: true;
  data: T;
  meta: {
    command: string;
    sessionId?: string;
    activeSessionId?: string;
    controllerPid?: number;
    request?: { command: string; seq: number };
    eventCursor?: number;
    timestamp: string;
  };
}
```

Error envelope:

```typescript
export interface JsonFailure {
  ok: false;
  error: {
    code: string;
    message: string;
    category:
      | 'usage'
      | 'controller'
      | 'session'
      | 'adapter'
      | 'dap'
      | 'timeout'
      | 'internal';
    exitCode: number;
    sessionId?: string;
    request?: { command: string; seq?: number };
    adapter?: {
      descriptorId?: string;
      pid?: number;
      stderrTail?: string[];
      logPath?: string;
    };
    diagnostics: Array<{ message: string; action?: string }>;
  };
  meta: {
    command: string;
    controllerPid?: number;
    timestamp: string;
  };
}
```

Recommended exit codes:

| Exit Code | Category | Use |
|-----------|----------|-----|
| 0 | success | Command succeeded. [ASSUMED] |
| 2 | usage | CLI parse/validation/config input error. [ASSUMED] |
| 3 | controller | Controller unavailable, stale endpoint, startup failure. [ASSUMED] |
| 4 | session | Session not found, no active session, invalid lifecycle for command. [ASSUMED] |
| 5 | dap | DAP request failed or adapter returned unsuccessful response. [CITED: https://microsoft.github.io/debug-adapter-protocol/debugAdapterProtocol.json] [ASSUMED] |
| 6 | adapter | Adapter process/socket failed, stderr indicates startup/runtime failure. [VERIFIED: .planning/REQUIREMENTS.md] [ASSUMED] |
| 7 | timeout | Controller, socket, adapter startup, or DAP request timeout. [ASSUMED] |
| 70 | internal | Unexpected dap-cli bug after handled diagnostics fail. [ASSUMED] |

## Fake Adapter and Deterministic Test Strategy

Phase 1 should prove the architecture with a fake adapter before real JavaScript/Python adapters. [VERIFIED: .planning/ROADMAP.md] [VERIFIED: .planning/research/PITFALLS.md]

### Fake Adapter Shape

Build a small fake adapter that can run in two modes:

- stdio mode: launched as a child process with DAP on stdin/stdout and diagnostics on stderr. [CITED: https://nodejs.org/api/child_process.html] [ASSUMED]
- socket mode: listens on localhost and accepts one DAP connection for socket transport tests. [CITED: https://nodejs.org/api/net.html] [ASSUMED]

Script fake adapter behavior declaratively:

```typescript
export interface FakeAdapterScriptStep {
  onRequest: string;
  respond?: { success: boolean; body?: unknown; message?: string };
  emitAfterResponse?: Array<{ event: string; body?: unknown }>;
  writeStderr?: string;
  closeTransport?: boolean;
}
```

Use scripts to cover:

- chunked Content-Length framing, split headers, split bodies, and multiple messages per chunk. [CITED: https://microsoft.github.io/debug-adapter-protocol/overview]
- initialize capability response and `initialized` event ordering. [CITED: https://microsoft.github.io/debug-adapter-protocol/debugAdapterProtocol.json]
- launch and attach paths with adapter-specific opaque arguments. [CITED: https://microsoft.github.io/debug-adapter-protocol/debugAdapterProtocol.json]
- stopped, continued, thread, output, exited, and terminated events updating status/event cache. [CITED: https://microsoft.github.io/debug-adapter-protocol/debugAdapterProtocol.json]
- failed responses with DAP `message` and structured `body.error`. [CITED: https://microsoft.github.io/debug-adapter-protocol/debugAdapterProtocol.json]
- adapter stderr tail/log path diagnostics. [VERIFIED: .planning/REQUIREMENTS.md]

### Test Matrix

| Test Area | Example Assertions | Phase Plan |
|-----------|--------------------|------------|
| Framing | Parser handles chunk boundaries and exact UTF-8 byte length. [CITED: https://microsoft.github.io/debug-adapter-protocol/overview] | 01-03 |
| DAP client | Request seq starts at 1, pending map resolves by `request_seq`, events are emitted independently. [CITED: https://microsoft.github.io/debug-adapter-protocol/debugAdapterProtocol.json] | 01-03 |
| Lifecycle | `initialize` happens first, capabilities stored, `initialized` gates configuration, stopped/continued/terminated transitions update status. [CITED: https://microsoft.github.io/debug-adapter-protocol/overview] | 01-03 |
| Session state | Start/list/target/status/close/cleanup work across isolated test state dirs. [VERIFIED: .planning/REQUIREMENTS.md] | 01-02 |
| Controller persistence | Two separate CLI processes connect to one controller and operate on one fake adapter session. [VERIFIED: .planning/REQUIREMENTS.md] | 01-04 |
| Event cache | Capacity is bounded, cursors advance, dropped counts are reported, status references last stopped event. [VERIFIED: .planning/REQUIREMENTS.md] | 01-03/01-04 |
| CLI JSON | Success and failure envelopes are stable JSON with no stray stdout/stderr text in agent mode. [VERIFIED: .planning/REQUIREMENTS.md] | 01-04 |
| Diagnostics | Adapter startup failure includes descriptor ID, stderr tail, log path, command display, and action hint. [VERIFIED: .planning/REQUIREMENTS.md] | 01-04 |

Test implementation notes:

- Prefer event-driven promises and fake clocks where timeout logic is under test; avoid sleeps in deterministic tests. [ASSUMED]
- Use isolated state/log roots through an env var such as `DAP_CLI_HOME` in tests so controller state cannot leak between test runs. [ASSUMED]
- Start with in-process controller tests, then add CLI subprocess tests for the final JSON/exit-code contract. [ASSUMED]
- Real JS/Python adapters are Phase 3; Phase 1 tests should not depend on adapter package distribution. [VERIFIED: .planning/ROADMAP.md]

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| CLI parser/help/options | Custom argv parser | `commander` | Commander already handles nested commands, async actions, help, strict option validation, and output/exit override. [CITED: https://github.com/tj/commander.js#readme] |
| Runtime validation | Ad hoc `typeof` checks everywhere | `zod` schemas at boundaries | Zod provides TypeScript-first schema parsing and strict mode support. [CITED: https://zod.dev/] |
| DAP wire framing | Line-delimited JSON or newline parser | Content-Length parser/writer | DAP uses HTTP-like headers plus UTF-8 JSON body, not newline-delimited JSON. [CITED: https://microsoft.github.io/debug-adapter-protocol/overview] |
| Adapter process execution | `exec` shell strings | `child_process.spawn` with args array | `exec` spawns a shell and unsanitized metacharacters can trigger command execution. [CITED: https://nodejs.org/api/child_process.html] |
| Full DAP typed command coverage | Hand-maintained request list | Phase 2 generator from official `debugAdapterProtocol.json` | DAP 1.71.x includes changes beyond `@vscode/debugprotocol` 1.68.0, so generated metadata reduces drift. [VERIFIED: npm registry] [CITED: https://microsoft.github.io/debug-adapter-protocol/changelog] |
| Event streaming in v1 | Subscription server/watch mode | Polling `status` and `events` | v1 explicitly chooses polling; streaming is out of scope. [VERIFIED: .planning/REQUIREMENTS.md] |

**Key insight:** The hard part of Phase 1 is not printing JSON; it is preserving DAP session semantics across separate CLI invocations while keeping protocol, controller, adapter, and CLI responsibilities isolated. [VERIFIED: .planning/research/PITFALLS.md] [ASSUMED]

## Common Pitfalls

### Pitfall 1: Treating DAP as Stateless

**What goes wrong:** A later command cannot see breakpoints, thread state, capabilities, or pause state because every CLI call created a new adapter connection. [VERIFIED: .planning/research/PITFALLS.md]

**How to avoid:** Make the controller/session path mandatory for active debugging commands in Phase 1. [VERIFIED: .planning/ROADMAP.md]

**Warning signs:** `status` works only immediately after launch inside one process, or fake-adapter tests cannot run two separate CLI invocations against one session. [ASSUMED]

### Pitfall 2: Leaking Adapter-Specific Logic into Protocol Core

**What goes wrong:** Protocol lifecycle code starts branching on JavaScript/Python behavior before descriptors exist. [VERIFIED: copilot-instructions.md]

**How to avoid:** Keep launch/attach arguments opaque in `protocol/`; put adapter-specific command/config defaults in `adapters/` and later `config/`. [CITED: https://microsoft.github.io/debug-adapter-protocol/debugAdapterProtocol.json]

**Warning signs:** `protocol/dapClient.ts` imports JS/Python descriptor files or checks adapter IDs. [ASSUMED]

### Pitfall 3: Incorrect Lifecycle Sequencing

**What goes wrong:** Adapter hangs, breakpoints are not accepted, or `configurationDone` is sent at the wrong time. [VERIFIED: .planning/research/PITFALLS.md]

**How to avoid:** Model lifecycle states explicitly and write fake adapter tests that assert initialize/initialized/configurationDone ordering. [CITED: https://microsoft.github.io/debug-adapter-protocol/overview]

### Pitfall 4: Unbounded Logs and Events

**What goes wrong:** Long agent sessions grow controller memory or emit enormous JSON payloads. [VERIFIED: .planning/research/PITFALLS.md]

**How to avoid:** Use bounded event rings, bounded stderr tails, log files for detail, and pagination-ready fields for later variable/stack commands. [CITED: https://microsoft.github.io/debug-adapter-protocol/debugAdapterProtocol.json]

### Pitfall 5: Stale Runtime State

**What goes wrong:** Discovery files, active session IDs, or adapter processes remain after controller crash or failed shutdown. [VERIFIED: .planning/REQUIREMENTS.md]

**How to avoid:** Include controller health checks, stale endpoint detection, owned-process cleanup, and explicit `cleanup` command in Plan 01-02. [CITED: https://nodejs.org/api/net.html] [CITED: https://nodejs.org/api/child_process.html]

## Concrete Recommendations for the Four Phase 1 Plans

### 01-01: Scaffold TypeScript/Node CLI Foundation and Internal Architecture Boundaries

Plan should cover:

- Create `package.json`, `tsconfig.json` with `strict`, lint/test/build scripts, npm bin entry, and source/test folders. [VERIFIED: workspace file search] [CITED: https://zod.dev/]
- Install baseline dependencies: `commander`, `zod`, `@vscode/debugprotocol`, `typescript`, `@types/node`, `vitest`, `tsup`, `eslint`. [VERIFIED: npm registry]
- Add the module skeleton from this research with placeholder interfaces and no cross-boundary shortcuts. [VERIFIED: copilot-instructions.md]
- Implement JSON output envelope and error/exit-code types early, even if commands are stubbed. [VERIFIED: .planning/REQUIREMENTS.md]
- Add initial tests for output envelopes, exit code mapping, and command registration. [VERIFIED: .planning/REQUIREMENTS.md]

Acceptance focus: `dap-cli --help`, `dap-cli controller status`, and test/build scripts exist; no protocol or adapter logic lives in `cli/`. [ASSUMED]

### 01-02: Implement Persistent Controller, Session State, Active Session Targeting, and Cleanup Lifecycle

Plan should cover:

- Implement local controller server/client, discovery file, health/status, start/shutdown commands, and stale discovery cleanup. [VERIFIED: .planning/REQUIREMENTS.md] [CITED: https://nodejs.org/api/net.html]
- Implement `SessionManager`, session IDs, active session set/get, list/status, and structured selection errors. [VERIFIED: .planning/REQUIREMENTS.md]
- Implement session cleanup lifecycle with owned-process tracking hooks, even if fake/no-op sessions are used before DAP client integration. [VERIFIED: .planning/REQUIREMENTS.md]
- Add isolated test state root support, for example `DAP_CLI_HOME`, to keep controller tests deterministic. [ASSUMED]
- Add tests for two CLI invocations sharing controller state, no active session, missing session, active target switching, close, and cleanup. [VERIFIED: .planning/REQUIREMENTS.md]

Acceptance focus: separate invocations can start/list/target/status/close fake sessions without stale state. [VERIFIED: .planning/ROADMAP.md]

### 01-03: Implement Language-Neutral DAP Transport/Client Lifecycle and Bounded Event Cache

Plan should cover:

- Implement DAP framing parser/writer from the official Content-Length protocol. [CITED: https://microsoft.github.io/debug-adapter-protocol/overview]
- Implement `DapTransport` for stdio and socket streams, with adapter stderr/log capture in the adapter process layer. [CITED: https://nodejs.org/api/child_process.html] [CITED: https://nodejs.org/api/net.html]
- Implement `DapClient` request seq allocation, pending response matching, event dispatch, failed response handling, and timeout handling. [CITED: https://microsoft.github.io/debug-adapter-protocol/debugAdapterProtocol.json]
- Implement lifecycle helper for initialize, launch/attach, initialized/configurationDone, stopped/continued, terminated/exited/disconnect. [CITED: https://microsoft.github.io/debug-adapter-protocol/overview]
- Implement per-session event cache with cursor/capacity/dropped metadata and stopped epoch tracking. [VERIFIED: .planning/REQUIREMENTS.md]
- Add fake adapter scripts for stdio and socket transport tests. [VERIFIED: .planning/REQUIREMENTS.md]

Acceptance focus: fake adapter proves protocol framing, lifecycle transitions, request sequencing, status projection, and recent-event polling over both transport styles. [VERIFIED: .planning/ROADMAP.md]

### 01-04: Add JSON/Error Output Contracts, Diagnostics, and Deterministic Fake-Adapter/CLI Tests

Plan should cover:

- Finalize success/error JSON envelopes and Commander output/exit overrides. [VERIFIED: .planning/REQUIREMENTS.md] [CITED: https://github.com/tj/commander.js#readme]
- Add structured diagnostics for controller unavailable, session not found, adapter spawn failure, socket connection failure, DAP failed response, request timeout, and stale lifecycle state. [VERIFIED: .planning/REQUIREMENTS.md]
- Add adapter stderr tail and log path plumbing to every relevant adapter/protocol failure. [VERIFIED: .planning/REQUIREMENTS.md]
- Add CLI subprocess tests asserting stdout JSON, exit codes, and no unstructured default output. [VERIFIED: .planning/REQUIREMENTS.md]
- Add representative end-to-end fake-adapter tests: start session, poll running/stopped, inspect recent events, target active session, close session, cleanup. [VERIFIED: .planning/ROADMAP.md]
- Add failure contract snapshots or schema assertions so agent-facing JSON does not drift accidentally. [ASSUMED]

Acceptance focus: all Phase 1 requirements have deterministic automated coverage using fake adapters, and failure payloads include session IDs, request names, stderr summaries, log paths, and actionable diagnostics. [VERIFIED: .planning/ROADMAP.md] [VERIFIED: .planning/REQUIREMENTS.md]

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|-------------|-----------|---------|----------|
| Node.js | CLI/controller/test runtime | yes | 22.22.1 | None needed. [VERIFIED: local command] |
| npm | Dependency install/scripts | yes | 10.9.4 | None needed. [VERIFIED: local command] |
| TypeScript package | Build/tooling | registry available | 6.0.3 | Pin latest verified version during scaffold. [VERIFIED: npm registry] |
| Vitest package | Tests | registry available | 4.1.5 | None recommended. [VERIFIED: npm registry] |
| Real JS/Python adapters | Phase 3 only | not required for Phase 1 | n/a | Use fake adapter in Phase 1. [VERIFIED: .planning/ROADMAP.md] |

**Missing dependencies with no fallback:** None for Phase 1 research and planning. [VERIFIED: local command] [VERIFIED: npm registry]

**Missing dependencies with fallback:** Real debug adapters are not Phase 1 dependencies; fake adapters are the required fallback for deterministic testing. [VERIFIED: .planning/ROADMAP.md]

## Validation Architecture

Nyquist validation is disabled in `.planning/config.json`, so do not create separate Nyquist validation artifacts for Phase 1. [VERIFIED: .planning/config.json]

Still include normal automated tests inside the four implementation plans:

| Requirement Group | Test Type | Recommended Command After Scaffold | Notes |
|-------------------|-----------|------------------------------------|-------|
| Protocol framing/client lifecycle | Unit/integration | `npm test -- tests/protocol` | Use fake adapter and chunked stream fixtures. [ASSUMED] |
| Controller/session state | Integration | `npm test -- tests/controller` | Use isolated `DAP_CLI_HOME`. [ASSUMED] |
| CLI JSON/error contracts | CLI subprocess tests | `npm test -- tests/cli` | Assert stdout JSON and exit codes. [ASSUMED] |
| Phase gate | Full test suite | `npm test` | No separate validation docs required. [VERIFIED: .planning/config.json] [ASSUMED] |

## Security Domain

Phase 1 does not implement remote adapter presets or expression evaluation commands yet, but it does create process/socket and JSON boundaries that later security controls depend on. [VERIFIED: .planning/ROADMAP.md] [ASSUMED]

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|------------------|
| V2 Authentication | no for Phase 1 local CLI | No network-auth feature in Phase 1. [VERIFIED: .planning/ROADMAP.md] |
| V3 Session Management | yes, local debug sessions | Opaque session IDs, explicit active-session state, cleanup lifecycle, no secret persistence. [VERIFIED: .planning/REQUIREMENTS.md] [ASSUMED] |
| V4 Access Control | limited | Local controller endpoint should be scoped to the current user/state directory; public TCP should not be the default. [CITED: https://nodejs.org/api/net.html] [ASSUMED] |
| V5 Input Validation | yes | Zod schemas for config, controller API, JSON command payloads. [CITED: https://zod.dev/] |
| V6 Cryptography | no | No custom crypto required in Phase 1. [VERIFIED: .planning/ROADMAP.md] |

### Known Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Shell injection in adapter commands | Elevation of privilege | Use `spawn(command, args, { shell: false })` by default; require explicit descriptor opt-in for shell. [CITED: https://nodejs.org/api/child_process.html] |
| Secret leakage through env/config/logs | Information disclosure | Redact env-like keys and avoid persisting raw launch env in session store. [VERIFIED: .planning/research/PITFALLS.md] [ASSUMED] |
| Public controller/debug socket | Spoofing/tampering | Default local IPC or localhost endpoint; no public bind in Phase 1. [CITED: https://nodejs.org/api/net.html] [ASSUMED] |
| Adapter stderr/protocol transcript mixed with JSON | Tampering/parse failure | Keep JSON envelope separate from logs and expose log paths/tails structurally. [VERIFIED: .planning/REQUIREMENTS.md] [ASSUMED] |

## State of the Art

| Old/Weak Approach | Current Recommended Approach | Evidence | Impact |
|-------------------|------------------------------|----------|--------|
| Per-command adapter process | Persistent controller with long-lived DAP sessions | DAP sessions are started over a persistent connection and emit async events. [CITED: https://microsoft.github.io/debug-adapter-protocol/overview] | Required for agent workflows across separate shell invocations. |
| Hand-written protocol coverage | Generate Phase 2 command metadata from official JSON | DAP 1.71.x changelog differs from `@vscode/debugprotocol` 1.68.0. [VERIFIED: npm registry] [CITED: https://microsoft.github.io/debug-adapter-protocol/changelog] | Phase 1 should not block later generator design with manual-only command assumptions. |
| Unbounded event transcript in memory | Bounded recent cache plus log files | Long sessions can emit many events/logs. [VERIFIED: .planning/research/PITFALLS.md] | Keeps controller stable for agent runs. |
| Human-first stderr errors | JSON-first error envelope with diagnostics | Agent requirements demand parseable JSON and structured nonzero failures. [VERIFIED: .planning/REQUIREMENTS.md] | Prevents brittle agent scraping. |

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Default command output should put handled success and failure envelopes on stdout, with stderr reserved for catastrophic fallback or explicit human mode. | JSON Output and Structured Error/Diagnostics Contract | If the project prefers Unix-style error JSON on stderr, Plan 01-04 should adjust tests and docs consistently. |
| A2 | A local IPC endpoint plus discovery file is the right controller discovery model. | Controller and Session-State Architecture | If packaging or cross-platform constraints favor localhost TCP, keep the endpoint abstraction but change the default endpoint kind. |
| A3 | Phase 1 should track `stoppedEpoch` before full inspection commands exist. | Bounded Event Cache and Polling State Model | If deferred, Phase 2 must retrofit stale reference checks across stack/scope/variable commands. |
| A4 | `@vscode/debugadapter` should not be a runtime dependency for dap-cli core. | Standard Stack | If it meaningfully reduces fake-adapter complexity, it can be dev-only in tests without affecting runtime architecture. |
| A5 | Per-session request routing should be serialized in Phase 1 while the DAP client still matches responses by `request_seq`. | DAP Transport and Client Lifecycle Notes | If early generated commands need parallel requests, concurrency policy must be added and tested explicitly. |

## Open Questions (RESOLVED)

1. **Where should dap-cli store controller state by default?**
   - What we know: Phase 1 needs persistent controller discovery and active-session state across CLI invocations. [VERIFIED: .planning/REQUIREMENTS.md]
  - Resolution: Implement a configurable path helper that honors `DAP_CLI_HOME` first. If unset, use `~/.dap-cli` for controller state, logs, adapter cache, and config across platforms. Tests should always set `DAP_CLI_HOME` to an isolated temp directory. [ASSUMED]

2. **Should handled error JSON go to stdout or stderr?**
   - What we know: Agent consumers need structured JSON and stable nonzero exits. [VERIFIED: .planning/REQUIREMENTS.md]
  - Resolution: Emit exactly one handled JSON envelope on stdout for both success and structured failures. Use the process exit code to signal failure. Reserve stderr for catastrophic startup/crash fallback and for future explicit human-mode output, never for adapter stderr passthrough in normal JSON mode. [ASSUMED]

3. **How much of launch/attach should Phase 1 expose?**
   - What we know: Real JavaScript/Python adapter support is Phase 3, but DAP lifecycle and fake-adapter launch/attach paths are Phase 1. [VERIFIED: .planning/ROADMAP.md]
  - Resolution: Phase 1 may expose generic internal/fake-adapter lifecycle commands sufficient to prove `initialize`, `launch` or `attach`, `configurationDone`, `stopped`, and termination behavior. It must not promise polished JavaScript/Python adapter UX or built-in adapter selection until Phase 3. [ASSUMED]

## Sources

### Primary (HIGH confidence)

- `.planning/PROJECT.md` - project goals, constraints, key decisions. [VERIFIED: workspace read]
- `.planning/ROADMAP.md` - Phase 1 scope, success criteria, plan stubs. [VERIFIED: workspace read]
- `.planning/REQUIREMENTS.md` - requirement IDs and traceability. [VERIFIED: workspace read]
- `.planning/STATE.md` - current project state. [VERIFIED: workspace read]
- `.planning/research/ARCHITECTURE.md` - baseline module architecture. [VERIFIED: workspace read]
- `.planning/research/STACK.md` - stack choices and package baseline. [VERIFIED: workspace read]
- `.planning/research/PITFALLS.md` - known architecture/UX/security pitfalls. [VERIFIED: workspace read]
- `.planning/research/FEATURES.md` - feature dependencies and MVP scope. [VERIFIED: workspace read]
- `copilot-instructions.md` - project constraints and module boundaries. [VERIFIED: workspace read]
- `.planning/config.json` - Nyquist validation disabled. [VERIFIED: workspace read]
- `https://microsoft.github.io/debug-adapter-protocol/overview` - DAP architecture, base protocol, launch sequencing, stopped-state references, termination behavior. [CITED: official docs]
- `https://microsoft.github.io/debug-adapter-protocol/debugAdapterProtocol.json` - DAP schema for messages, requests, events, capabilities, errors, lifecycle messages. [CITED: official docs]
- `https://microsoft.github.io/debug-adapter-protocol/changelog` - current 1.71.x changes and protocol evolution. [CITED: official docs]
- `https://nodejs.org/api/child_process.html` - process spawning, stdio, signals, shell warnings, process events. [CITED: official docs]
- `https://nodejs.org/api/net.html` - TCP/IPC sockets, connection lifecycle, timeout behavior, path platform differences. [CITED: official docs]

### Secondary (MEDIUM confidence)

- `https://github.com/tj/commander.js#readme` - Commander command parsing, async actions, help, output/exit override, TypeScript usage. [CITED: project README]
- `https://zod.dev/` - Zod TypeScript-first validation, strict mode requirement, JSON Schema conversion. [CITED: official docs]
- `https://vitest.dev/guide/` - Vitest setup, Node requirement, test file conventions, `vitest run`. [CITED: official docs]
- npm registry probes on 2026-05-02 - current package versions and modified timestamps. [VERIFIED: npm registry]

### Tertiary (LOW confidence)

- Assumptions in the `Assumptions Log` are design recommendations not directly specified by project docs or official protocol docs. [ASSUMED]

## Metadata

**Confidence breakdown:**

- Standard stack: HIGH - package versions verified against npm registry and project stack research. [VERIFIED: npm registry] [VERIFIED: .planning/research/STACK.md]
- DAP lifecycle and transport requirements: HIGH - verified against official DAP overview/schema and Node docs. [CITED: https://microsoft.github.io/debug-adapter-protocol/overview] [CITED: https://microsoft.github.io/debug-adapter-protocol/debugAdapterProtocol.json]
- Controller/session architecture: HIGH for need and boundaries, MEDIUM for exact IPC/state path choices. [VERIFIED: .planning/REQUIREMENTS.md] [ASSUMED]
- JSON/error contract: MEDIUM - requirements demand structured JSON/errors, but stdout/stderr policy is a recommendation. [VERIFIED: .planning/REQUIREMENTS.md] [ASSUMED]
- Fake adapter strategy: HIGH - required by Phase 1 success criteria and supported by DAP/Node docs. [VERIFIED: .planning/ROADMAP.md] [CITED: https://nodejs.org/api/child_process.html]

**Research date:** 2026-05-02  
**Valid until:** 2026-06-01 for architecture and DAP semantics; re-run npm version probes during Plan 01-01 before pinning dependencies.
