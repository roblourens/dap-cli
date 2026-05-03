# Phase 1: Project Foundation, Controller, and DAP Core - Pattern Map

**Mapped:** 2026-05-02
**Files analyzed:** 48 expected new files
**Analogs found:** 0 / 48

## Summary

This is a greenfield repository. There are no existing dap-cli product source files, tests, package manifests, or TypeScript modules to use as implementation analogs. The only code-like files currently present are GSD workflow/tooling files under `.github/get-shit-done/`, plus planning documents under `.planning/`. Those files are infrastructure for project planning, not product implementation patterns for dap-cli.

Planner guidance should therefore come from the Phase 1 research, roadmap, requirements, and project instructions rather than from copied source patterns. The intended pattern is a strict TypeScript/Node CLI with clear boundaries between CLI parsing, controller IPC, session state, language-neutral DAP protocol handling, adapter process/socket descriptors, config/state paths, and deterministic fake-adapter tests.

## Sources Consulted

- `.planning/phases/01-project-foundation-controller-and-dap-core/01-RESEARCH.md`
- `.planning/ROADMAP.md`
- `.planning/REQUIREMENTS.md`
- `.planning/research/ARCHITECTURE.md`
- `.planning/research/PITFALLS.md`
- `.planning/research/STACK.md`
- `.planning/PROJECT.md`
- `copilot-instructions.md`
- `.github/copilot-instructions.md`

## Analog Search Scope

Searched the workspace for existing product analogs matching TypeScript CLI, controller/server, session manager, DAP protocol/framing, adapter transport, config schema, fake adapter, and tests.

Result:

- No `package.json` exists yet.
- No `src/` directory exists yet.
- No `tests/` directory exists yet.
- No dap-cli product TypeScript or JavaScript implementation files exist yet.
- `.github/get-shit-done/**` is workflow infrastructure and is useful product inspiration as product source.
- `/Users/roblou/code/mcp-debugger/` is useful product inspiration for agent-debugging workflows.

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `package.json` | config | build/package metadata | none yet | no-analog |
| `tsconfig.json` | config | build/typecheck | none yet | no-analog |
| `tsup.config.ts` | config | build/bundle | none yet | no-analog |
| `eslint.config.js` | config | lint/static analysis | none yet | no-analog |
| `vitest.config.ts` | config | test runner | none yet | no-analog |
| `src/index.ts` | entrypoint | request-response | none yet | no-analog |
| `src/cli/main.ts` | controller | request-response | none yet | no-analog |
| `src/cli/program.ts` | route | request-response | none yet | no-analog |
| `src/cli/output.ts` | utility | transform | none yet | no-analog |
| `src/cli/exitCodes.ts` | model | transform | none yet | no-analog |
| `src/cli/errors.ts` | utility | transform | none yet | no-analog |
| `src/cli/commands/controller.ts` | route | request-response | none yet | no-analog |
| `src/cli/commands/sessions.ts` | route | request-response | none yet | no-analog |
| `src/cli/commands/dapCore.ts` | route | request-response | none yet | no-analog |
| `src/controller/server.ts` | service | request-response | none yet | no-analog |
| `src/controller/client.ts` | service | request-response | none yet | no-analog |
| `src/controller/ipc.ts` | utility | request-response | none yet | no-analog |
| `src/controller/requests.ts` | model | transform/validation | none yet | no-analog |
| `src/controller/diagnostics.ts` | utility | transform | none yet | no-analog |
| `src/sessions/session.ts` | model | event-driven | none yet | no-analog |
| `src/sessions/sessionManager.ts` | service | CRUD/event-driven | none yet | no-analog |
| `src/sessions/sessionStore.ts` | store | file-I/O | none yet | no-analog |
| `src/sessions/activeSession.ts` | utility | request-response | none yet | no-analog |
| `src/protocol/dapMessages.ts` | model | transform | none yet | no-analog |
| `src/protocol/framing.ts` | utility | streaming | none yet | no-analog |
| `src/protocol/transport.ts` | provider | streaming | none yet | no-analog |
| `src/protocol/stdioTransport.ts` | provider | streaming | none yet | no-analog |
| `src/protocol/socketTransport.ts` | provider | streaming | none yet | no-analog |
| `src/protocol/dapClient.ts` | service | request-response/event-driven | none yet | no-analog |
| `src/protocol/lifecycle.ts` | service | event-driven | none yet | no-analog |
| `src/protocol/eventCache.ts` | store | event-driven | none yet | no-analog |
| `src/adapters/descriptor.ts` | model | transform/validation | none yet | no-analog |
| `src/adapters/processAdapter.ts` | service | streaming/process I/O | none yet | no-analog |
| `src/adapters/socketAdapter.ts` | service | streaming/socket I/O | none yet | no-analog |
| `src/config/paths.ts` | utility | file-I/O | none yet | no-analog |
| `src/config/schema.ts` | config | validation/transform | none yet | no-analog |
| `src/testing/fakeAdapter.ts` | test fixture | streaming/event-driven | none yet | no-analog |
| `src/testing/dapScript.ts` | test fixture | transform/event-driven | none yet | no-analog |
| `src/testing/tempEnv.ts` | test fixture | file-I/O | none yet | no-analog |
| `tests/protocol/framing.test.ts` | test | streaming | none yet | no-analog |
| `tests/protocol/dapClient.test.ts` | test | request-response/event-driven | none yet | no-analog |
| `tests/protocol/lifecycle.test.ts` | test | event-driven | none yet | no-analog |
| `tests/protocol/eventCache.test.ts` | test | event-driven | none yet | no-analog |
| `tests/controller/sessionManager.test.ts` | test | CRUD/event-driven | none yet | no-analog |
| `tests/controller/controllerIpc.test.ts` | test | request-response | none yet | no-analog |
| `tests/cli/jsonOutput.test.ts` | test | transform/request-response | none yet | no-analog |
| `tests/cli/sessionCommands.test.ts` | test | request-response | none yet | no-analog |
| `tests/fixtures/fake-adapter-entry.ts` | test fixture | streaming/process I/O | none yet | no-analog |

## Pattern Assignments

### Foundation and Package Configuration

**Files:** `package.json`, `tsconfig.json`, `tsup.config.ts`, `eslint.config.js`, `vitest.config.ts`

**Analog:** none yet

**Planner guidance:** Create the Node/TypeScript project foundation from the stack research. Target Node 22+, strict TypeScript, npm scripts for build/typecheck/test/lint, an npm bin named `dap-cli`, and dependencies split as runtime vs dev.

**Required dependencies:**

```text
runtime: commander, zod, @vscode/debugprotocol
dev: typescript, @types/node, vitest, tsup, eslint
```

**Boundary rule:** configuration should enable strict typing from the start. Do not introduce unsafe casts or `any` as a shortcut for DAP shapes; prefer explicit protocol wrapper types and zod validation at process/config/IPC boundaries.

### CLI Entrypoint and Command Routing

**Files:** `src/index.ts`, `src/cli/main.ts`, `src/cli/program.ts`, `src/cli/commands/controller.ts`, `src/cli/commands/sessions.ts`, `src/cli/commands/dapCore.ts`

**Analog:** none yet

**Planner guidance:** Keep the CLI thin. It owns argv parsing, Commander setup, command registration, JSON output, and exit-code behavior. It must not import `protocol/dapClient` directly. Active debugging commands should route through `controller/client.ts` using explicit session ID or default active-session resolution.

**Command pattern to implement:**

```typescript
// intended shape, not copied from existing code
export async function main(argv: readonly string[]): Promise<number> {
  const program = createProgram();
  await program.parseAsync(argv, { from: 'user' });
  return 0;
}
```

**Phase 1 command groups:**

- `controller status/start/stop` for daemon lifecycle and health.
- `sessions list/status/target/close/cleanup` for state and active target behavior.
- Minimal DAP core commands only where needed to prove initialize, launch/attach, status, and recent events against fake adapters.

**Do not:** put protocol sequencing, adapter process management, session registry mutation, or DAP lifecycle rules inside CLI command files.

### JSON Output, Exit Codes, and Error Mapping

**Files:** `src/cli/output.ts`, `src/cli/exitCodes.ts`, `src/cli/errors.ts`

**Analog:** none yet

**Planner guidance:** Establish the agent-facing output contract early and reuse it from every command. Commander parse errors should become structured dap-cli JSON failures instead of unstructured help/error text in default agent mode.

**Success envelope pattern:**

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

**Failure envelope pattern:**

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

**Exit code pattern:**

| Exit Code | Category | Use |
|---|---|---|
| 0 | success | Command succeeded. |
| 2 | usage | CLI parse, validation, or config input error. |
| 3 | controller | Controller unavailable, stale endpoint, startup failure. |
| 4 | session | Session not found, no active session, invalid lifecycle. |
| 5 | dap | DAP request failed or adapter returned unsuccessful response. |
| 6 | adapter | Adapter process/socket failed. |
| 7 | timeout | Controller, socket, adapter startup, or DAP request timeout. |
| 70 | internal | Unexpected dap-cli bug after handled diagnostics fail. |

### Controller API and IPC

**Files:** `src/controller/server.ts`, `src/controller/client.ts`, `src/controller/ipc.ts`, `src/controller/requests.ts`, `src/controller/diagnostics.ts`

**Analog:** none yet

**Planner guidance:** Implement a persistent local controller daemon with explicit endpoint discovery. The controller owns live sessions, active-session state, request routing, lifecycle transitions, and adapter ownership hooks. The CLI process should be disposable and reconnect on every invocation.

**Discovery pattern:**

```typescript
export interface ControllerDiscovery {
  version: 1;
  pid: number;
  endpoint:
    | { kind: 'ipc'; path: string }
    | { kind: 'tcp'; host: '127.0.0.1'; port: number };
  stateDir: string;
  logDir: string;
  activeSessionId?: string;
  startedAt: string;
  lastHeartbeatAt: string;
}
```

**Phase 1 controller requests:**

| Request | Purpose |
|---|---|
| `controller.status` | Report pid, endpoint, version, uptime, state/log dirs, and session count. |
| `controller.shutdown` | Stop controller after closing or detaching sessions according to policy. |
| `sessions.list` | Return summaries for all sessions. |
| `sessions.status` | Return lifecycle, stopped state, active thread, event cursor, adapter diagnostics. |
| `sessions.target` | Set active session by stable ID. |
| `sessions.close` | Close session and remove state. |
| `sessions.cleanup` | Remove stale discovery/session records and owned orphan adapter processes where safe. |
| `dap.start` | Create a DAP session and run initialize plus launch/attach path for fake/custom descriptors. |
| `dap.request` | Internal raw request helper for fake-adapter tests and future Phase 2 command generation. |
| `events.recent` | Return bounded recent events with cursor filtering. |

**Validation pattern:** define zod schemas for controller IPC request and response payloads in `requests.ts`; infer TypeScript types from schemas at the boundary instead of accepting untyped JSON.

**Diagnostics pattern:** controller errors must include category, action hints, endpoint/discovery information where useful, session ID when known, request name when known, and log paths/stderr tails for adapter-related failures.

### Session State and Active Targeting

**Files:** `src/sessions/session.ts`, `src/sessions/sessionManager.ts`, `src/sessions/sessionStore.ts`, `src/sessions/activeSession.ts`

**Analog:** none yet

**Planner guidance:** Put selection, lifecycle summary, active-session logic, and persistent discovery summaries in `sessions/`; do not duplicate target resolution in individual CLI commands.

**Lifecycle type pattern:**

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
```

**Status projection pattern:**

```typescript
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

**Selection rules:** explicit `--session <id>` wins. Otherwise use persisted `activeSessionId`. Return structured errors for no sessions, no active session, missing session, terminated/unavailable session, and ambiguous selection.

**Persistence rule:** persist discovery and summaries needed for reconnect/cleanup. Keep live DAP clients and adapter process objects in controller memory. Avoid persisting raw launch environment or secrets.

### DAP Protocol Core

**Files:** `src/protocol/dapMessages.ts`, `src/protocol/framing.ts`, `src/protocol/transport.ts`, `src/protocol/stdioTransport.ts`, `src/protocol/socketTransport.ts`, `src/protocol/dapClient.ts`, `src/protocol/lifecycle.ts`, `src/protocol/eventCache.ts`

**Analog:** none yet

**Planner guidance:** Keep `protocol/` vanilla DAP and language-neutral. It should know about messages, framing, request sequence numbers, response matching, events, lifecycle helpers, and transport byte streams. It should not know about JavaScript, Python, Playwright, js-debug, debugpy, or concrete adapter presets.

**Transport abstraction pattern:**

```typescript
export interface DapTransport {
  readonly name: string;
  readonly readable: NodeJS.ReadableStream;
  readonly writable: NodeJS.WritableStream;
  close(): Promise<void>;
}
```

**Framing pattern:** DAP uses ASCII headers with required `Content-Length`, then `\r\n\r\n`, then a UTF-8 JSON body. The parser must handle arbitrary stream chunking, multiple messages in one chunk, split headers, split bodies, and invalid lengths. The writer must use `Buffer.byteLength(json, 'utf8')`.

**Request pattern:** allocate client request `seq` in `DapClient`, starting at 1. Keep a pending map keyed by request seq. Match responses by `request_seq`, not arrival order. Events must be dispatched independently of pending responses.

**Lifecycle pattern:**

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

**Event cache pattern:**

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

**Important state rule:** track `stoppedEpoch` in Phase 1. Stack frame, scope, and variable references from a suspended state must be treated as invalid after execution resumes.

### Adapter Boundary

**Files:** `src/adapters/descriptor.ts`, `src/adapters/processAdapter.ts`, `src/adapters/socketAdapter.ts`

**Analog:** none yet

**Planner guidance:** Adapters are external services. `adapters/` owns descriptors, process spawn/kill, socket connection setup, stderr tail/log capture, and ownership tracking. It passes streams or sockets into `protocol/` through `DapTransport`.

**Process pattern:** use `child_process.spawn(command, args, { stdio: ['pipe', 'pipe', 'pipe'], shell: false })` by default. Avoid `exec` for adapters because it spawns a shell, buffers output, and creates shell-injection risk for unsanitized input.

**Stderr/log pattern:** never mix adapter stderr with stdout protocol bytes or dap-cli JSON output. Capture stderr into a bounded tail plus log file. Include stderr tail and log path in structured diagnostics.

**Socket pattern:** use localhost defaults for socket-style transports. Handle connect, error, timeout, end, and close. Do not default to public bind/connect behavior.

**Descriptor pattern:** launch/attach args are adapter-specific and opaque to `protocol/`; descriptor/config layers own those shapes.

### Config and Paths

**Files:** `src/config/paths.ts`, `src/config/schema.ts`

**Analog:** none yet

**Planner guidance:** Put state/log path calculation and persistent config schemas in `config/`. Include an env override such as `DAP_CLI_HOME` so tests can isolate controller state and logs.

**Path pattern:** resolve controller discovery, state files, and log directories in one helper. Avoid scattering default path logic across controller, session store, adapter process, and tests.

**Schema pattern:** use zod schemas for config/state files and IPC payloads. Validate on load and report structured usage/config errors with actionable diagnostics.

### Testing Fixtures and Fake Adapter

**Files:** `src/testing/fakeAdapter.ts`, `src/testing/dapScript.ts`, `src/testing/tempEnv.ts`, `tests/fixtures/fake-adapter-entry.ts`

**Analog:** none yet

**Planner guidance:** Phase 1 must prove DAP correctness through a deterministic fake adapter before real JavaScript/Python adapter support. Build reusable fixtures for stdio and socket fake-adapter modes.

**Script pattern:**

```typescript
export interface FakeAdapterScriptStep {
  onRequest: string;
  respond?: { success: boolean; body?: unknown; message?: string };
  emitAfterResponse?: Array<{ event: string; body?: unknown }>;
  writeStderr?: string;
  closeTransport?: boolean;
}
```

**Fake adapter must cover:**

- Chunked Content-Length framing, split headers, split bodies, and multiple messages per chunk.
- `initialize` capability response and `initialized` event ordering.
- Launch and attach paths with adapter-specific opaque arguments.
- `stopped`, `continued`, `thread`, `output`, `exited`, and `terminated` events.
- Failed responses with DAP `message` and structured `body.error`.
- Adapter stderr tail/log path diagnostics.

**Test environment pattern:** `tempEnv.ts` should create isolated state/log roots through `DAP_CLI_HOME` or equivalent so controller state cannot leak across tests.

### Test Files

**Files:** `tests/protocol/framing.test.ts`, `tests/protocol/dapClient.test.ts`, `tests/protocol/lifecycle.test.ts`, `tests/protocol/eventCache.test.ts`, `tests/controller/sessionManager.test.ts`, `tests/controller/controllerIpc.test.ts`, `tests/cli/jsonOutput.test.ts`, `tests/cli/sessionCommands.test.ts`

**Analog:** none yet

**Planner guidance:** Start with unit/integration tests around the boundaries most likely to break agent workflows. Prefer deterministic fake adapter scripts and fake clocks for timeout logic. Avoid sleeps.

**Test matrix:**

| Test Area | Assertions |
|---|---|
| Framing | Parser handles chunk boundaries and exact UTF-8 byte length. |
| DAP client | Request seq starts at 1, responses resolve by `request_seq`, events emit independently. |
| Lifecycle | `initialize` happens first, capabilities stored, `initialized` gates configuration, stopped/continued/terminated transitions update status. |
| Session state | Start/list/target/status/close/cleanup work across isolated state dirs. |
| Controller persistence | Two separate CLI processes connect to one controller and operate on one fake adapter session. |
| Event cache | Capacity is bounded, cursors advance, dropped counts are reported, status references last stopped event. |
| CLI JSON | Success and failure envelopes are stable JSON with no stray stdout/stderr text in agent mode. |
| Diagnostics | Adapter startup failure includes descriptor ID, stderr tail, log path, command display, and action hint. |

## Shared Patterns

### Module Boundaries

**Apply to:** all implementation files

- `cli/` may depend on `controller/client`, output helpers, and shared error types, but not `protocol/dapClient` directly.
- `controller/` owns live session objects, request routing, adapter process ownership, and lifecycle transitions.
- `sessions/` owns session IDs, active-session state, status projection, and cleanup policy.
- `protocol/` owns framing, transports, sequence numbers, response matching, event parsing, lifecycle helpers, and event cache.
- `adapters/` owns descriptor resolution, process/socket setup, stderr/log handling, and ownership tracking.
- `config/` owns state/log path resolution and config schemas.
- `testing/` owns fake adapters and isolated test environment helpers.

### Language Neutrality

**Apply to:** `src/protocol/**`, `src/controller/**`, `src/sessions/**`

Do not add JavaScript/Python branches to protocol request handling or lifecycle. Keep launch/attach arguments opaque in protocol. Adapter-specific behavior belongs behind descriptors/config/process/transport boundaries.

### Persistent Controller

**Apply to:** controller, sessions, CLI command routes

Active debugging commands must route to a persistent controller. A separate CLI invocation should reconnect to the controller and operate on the same session; it must not recreate a DAP adapter or lose request sequence/event state.

### Polling-Only v1

**Apply to:** status/events/session commands and controller API

Phase 1 and v1 should expose polling state through `status` and `events.recent`. Do not plan event streaming, subscriptions, watch mode, or blocking wait commands in this phase.

### Structured Diagnostics

**Apply to:** CLI, controller, adapters, protocol error paths

Every handled failure should include a stable error code, category, exit code, command metadata, request name/seq when applicable, session ID when applicable, adapter descriptor/pid/log/stderr when applicable, and one or more action-oriented diagnostics.

### Cleanup Ownership

**Apply to:** controller, sessions, adapters

Only kill adapter processes that dap-cli started and still owns. `stop` should attempt graceful terminate when capabilities allow, then disconnect/fallback. `detach` should not kill externally owned debuggees. `cleanup` should detect stale controller discovery and stale session records safely.

## No Analog Found

All expected Phase 1 implementation files have no existing product-code analog in this repository.

| File/Area | Role | Data Flow | Reason |
|---|---|---|---|
| Project scaffold | config | build/package metadata | No package manifest or build config exists yet. |
| CLI files | entrypoint/route/utility | request-response/transform | No dap-cli CLI implementation exists yet. |
| Controller files | service/model/utility | request-response | No daemon, IPC, or controller API implementation exists yet. |
| Session files | model/service/store | CRUD/event-driven/file-I/O | No session model, active-session state, or store exists yet. |
| Protocol files | model/service/provider/utility | streaming/request-response/event-driven | No DAP framing, transport, client, lifecycle, or event cache exists yet. |
| Adapter files | model/service | streaming/process I/O/socket I/O | No adapter descriptor/process/socket boundary exists yet. |
| Config files | config/utility | validation/file-I/O | No config schema or path helper exists yet. |
| Testing files | test/test fixture | streaming/request-response/event-driven | No fake adapter or product tests exist yet. |

## Explicit Non-Analogs

| Existing Workspace Area | Why It Is Not an Analog |
|---|---|
| `.github/get-shit-done/**` | GSD workflow implementation and templates, not dap-cli product source. It is CommonJS-oriented support tooling and should not define dap-cli architecture. |
| `.github/skills/**` | Workflow command metadata, not product implementation patterns. |
| `.planning/**` | Planning source of truth, not executable product code. Use for requirements and architecture guidance only. |
| `/Users/roblou/code/mcp-debugger/` | Product inspiration for agent-debugging workflows. |

## Plan Mapping Guidance

### Plan 01-01

Create package/tooling, `src/` and `tests/` skeletons, CLI entrypoint, command registration shell, JSON envelope helpers, exit codes, and initial contract tests. Preserve boundaries even if some modules initially contain placeholder interfaces.

### Plan 01-02

Implement controller server/client/IPC, discovery file, session manager/store, active session targeting, controller/session commands, stale discovery cleanup, and state-isolated tests.

### Plan 01-03

Implement DAP framing, transport abstraction, stdio/socket transports, DAP client request sequencing/response matching/event dispatch, lifecycle state machine, event cache, and fake-adapter protocol tests.

### Plan 01-04

Harden JSON/error contracts and diagnostics, add adapter stderr/log plumbing to failures, add CLI subprocess tests, add end-to-end fake-adapter tests for persistent controller behavior across separate invocations, and verify all Phase 1 requirements with deterministic automation.

## Metadata

**Analog search scope:** workspace root excluding external projects; `.github/get-shit-done/**` reviewed as infrastructure only
**Files scanned:** planning docs, root instructions, workspace file listing, phase directory, research directory, representative GSD skill indexes
**Pattern extraction date:** 2026-05-02
**Confidence:** HIGH that no product-code analogs exist; HIGH that expected files and boundaries come from Phase 1 research and roadmap
