## ADDED Requirements

### Requirement: js-debug Target Types
`agent-debug` SHALL provide the built-in `js-debug` adapter for Node.js, browser, and Electron workflows. It SHALL accept `node` and `pwa-node` as Node.js types, `chrome` and `pwa-chrome` as Chromium types, and SHALL represent Electron launches as `pwa-node` launches with an Electron runtime executable.

#### Scenario: Normalize a Node.js type
- **WHEN** a launch or attach selects type `node`
- **THEN** `agent-debug` sends a js-debug configuration using type `pwa-node`

#### Scenario: Normalize a Chromium type
- **WHEN** a launch or attach selects type `chrome`
- **THEN** `agent-debug` sends a js-debug configuration using type `pwa-chrome`

#### Scenario: Launch Electron
- **WHEN** a configuration selects Electron as the runtime executable
- **THEN** `agent-debug` uses js-debug with type `pwa-node`
- **AND** Electron-created Node.js helper targets MAY appear as child sessions

### Requirement: js-debug Adapter Host Runtime
Because upstream js-debug is JavaScript, `agent-debug` SHALL resolve a Node.js executable only when starting the js-debug adapter. js-debug `1.117.0` SHALL support Node.js `>=20.19.0 <25.0.0`. `AGENT_DEBUG_JS_DEBUG_NODE` SHALL override the executable; otherwise `node` on `PATH` SHALL be used. `agent-debug` SHALL run `<node> --version`, parse the semantic version, and reject a missing, non-executable, unparseable, or out-of-range runtime before starting js-debug. Core CLI and controller startup SHALL NOT resolve or start Node.js.

#### Scenario: Start js-debug with an override
- **WHEN** `AGENT_DEBUG_JS_DEBUG_NODE` names a usable Node.js executable and a js-debug session starts
- **THEN** `agent-debug` uses that executable to host the provisioned js-debug server

#### Scenario: Start another adapter without Node
- **WHEN** the caller uses debugpy, Delve, CodeLLDB, help, version, or controller/session commands that do not start js-debug
- **THEN** `agent-debug` does not require or launch Node.js

#### Scenario: Node is unavailable for js-debug
- **WHEN** a js-debug session is requested and neither the override nor a usable `node` executable is available
- **THEN** startup fails with a structured `js_debug_node_missing` adapter error
- **AND** diagnostics explain how to install Node.js or set `AGENT_DEBUG_JS_DEBUG_NODE`

#### Scenario: Node is installed but incompatible
- **WHEN** the resolved executable reports a version below `20.19.0`, at or above `25.0.0`, or an unparseable version
- **THEN** startup fails with `js_debug_node_incompatible`
- **AND** diagnostics report the detected value and required range

### Requirement: TypeScript Source-Map Defaults
For TypeScript workspaces, `agent-debug` SHALL preserve explicit js-debug source-map configuration and SHALL otherwise provide source-map-friendly defaults. When a selected js-debug configuration has no `outFiles`, the workspace contains `tsconfig.json`, and the caller has not disabled source maps, `agent-debug` SHALL enable source maps and supply workspace-relative globs for `dist/**/*.js`, `out/**/*.js`, and `build/**/*.js`.

#### Scenario: Apply TypeScript defaults
- **GIVEN** a workspace contains `tsconfig.json`
- **AND** the selected js-debug configuration does not define `outFiles`
- **WHEN** the session is launched
- **THEN** `sourceMaps` is enabled
- **AND** `outFiles` includes the workspace `dist`, `out`, and `build` JavaScript trees

#### Scenario: Preserve explicit source-map settings
- **GIVEN** a selected configuration explicitly disables `sourceMaps` or supplies `outFiles` or `resolveSourceMapLocations`
- **WHEN** the session is launched
- **THEN** `agent-debug` preserves those explicit values

#### Scenario: Bind a TypeScript breakpoint through a child
- **GIVEN** a breakpoint is set on an executable line in a `.ts` source file
- **AND** the corresponding runtime source belongs to a js-debug child session
- **WHEN** that child loads the mapped JavaScript
- **THEN** the parent-visible breakpoint can transition from unverified to verified

### Requirement: Attach Resume Override
`agent-debug` SHALL allow a caller to override a selected js-debug configuration's `continueOnAttach` value through JSON overrides before the attach request is sent.

#### Scenario: Stay paused after attach
- **GIVEN** a named attach configuration sets `continueOnAttach` to `true`
- **WHEN** the caller supplies a JSON override setting `continueOnAttach` to `false`
- **THEN** the effective attach request contains `continueOnAttach: false`
- **AND** the caller has an opportunity to configure breakpoints before resuming

### Requirement: Observable js-debug Server Diagnostics
Adapter-server tracing and logging SHALL remain observable without corrupting command output. When js-debug startup or communication fails, `agent-debug` SHALL include captured adapter stderr and a server log path when those values are available, and SHALL keep trace or log text out of structured stdout envelopes.

#### Scenario: Report a js-debug startup failure
- **GIVEN** js-debug writes diagnostic text or creates a server log before failing
- **WHEN** `agent-debug` reports the failure
- **THEN** the structured error includes a bounded stderr tail
- **AND** it includes the log path when js-debug supplied one

#### Scenario: Preserve JSON output
- **WHEN** js-debug trace or server-log output is produced during a command using structured output
- **THEN** stdout remains a valid `agent-debug` JSON envelope

### Requirement: startDebugging Child Sessions
`agent-debug` SHALL handle js-debug `startDebugging` reverse requests by creating child sessions associated with the requesting parent and completing the child DAP lifecycle on the adapter-provided child connection.

#### Scenario: Create a child target
- **GIVEN** a js-debug parent session is running
- **WHEN** js-debug sends a `startDebugging` reverse request for a page, worker, process, or Electron helper
- **THEN** `agent-debug` creates a child session linked to that parent
- **AND** initializes and configures the child without requiring a separate user launch command

### Requirement: Parent-Only Child Targeting
Users SHALL target a multi-process js-debug session through its parent name. Child sessions SHALL be hidden from the default session listing, SHALL be shown only by an explicit child-visibility option, and SHALL NOT be directly targetable by debugging or event commands.

#### Scenario: List child sessions explicitly
- **GIVEN** a parent has js-debug child sessions
- **WHEN** the caller lists sessions with child visibility enabled
- **THEN** each child includes `parentSessionId`
- **AND** its visible name uses the form `<parent>#<32-hex-target-id>`

#### Scenario: Reject direct child targeting
- **GIVEN** a caller selects a child session name
- **WHEN** the caller requests status, events, inspection, or execution control
- **THEN** the command fails with `child_session_not_targetable`
- **AND** the error data identifies the recoverable parent session

### Requirement: Parent Paused-State Union and Thread Routing
A js-debug parent's paused state SHALL be the union of its non-terminated children. Parent-targeted stack, scopes, variables, evaluate, continue, pause, and step operations SHALL route to the child that owns the selected thread or paused reference.

#### Scenario: Report a paused child through the parent
- **GIVEN** one non-terminated child is stopped
- **WHEN** the caller requests parent status
- **THEN** the parent reports `paused: true`
- **AND** `stoppedThreadIds` contains the stopped thread IDs from all non-terminated children

#### Scenario: Preserve pause after a sibling terminates
- **GIVEN** one child is stopped and an unrelated helper child terminates
- **WHEN** parent status is recomputed
- **THEN** the parent remains paused

#### Scenario: Route by thread ownership
- **GIVEN** a parent-visible stopped thread belongs to a child
- **WHEN** the caller issues an inspection or execution-control command for that thread against the parent
- **THEN** `agent-debug` sends the DAP request to the owning child

### Requirement: Child Breakpoint Forwarding and Merge
Breakpoints set through a js-debug parent SHALL remain parent-owned, SHALL be forwarded to applicable child sessions, and SHALL merge child verification updates into the parent-visible breakpoint list without changing source-breakpoint order.

#### Scenario: Replay breakpoints to a new child
- **GIVEN** a parent has configured source breakpoints
- **WHEN** js-debug creates a child that can load that source
- **THEN** `agent-debug` forwards the breakpoints to the child
- **AND** merges the child's verification, identifier, line, and message information into the corresponding parent breakpoints

#### Scenario: Preserve provisional breakpoints
- **GIVEN** no child has loaded a breakpoint's source yet
- **WHEN** the caller reads the parent breakpoint result
- **THEN** the breakpoint remains visible in its original position
- **AND** it MAY remain unverified until an applicable child responds

### Requirement: Mirrored Child Events
Every event emitted by a js-debug child SHALL be appended to the parent event stream with an `agent-debug` event-envelope field `childSessionId` identifying the source child. The original adapter event body SHALL remain byte-for-byte semantically unchanged and SHALL NOT be mutated to add routing metadata.

#### Scenario: Read renderer output from the parent
- **GIVEN** a browser child emits an `output` event
- **WHEN** the caller reads events from the parent
- **THEN** the event appears in the parent stream
- **AND** the cached event's `childSessionId` equals the emitting child's session identifier
- **AND** the adapter-provided `body` remains unchanged

### Requirement: Helper-Process Warning
When `agent-debug` detects that a js-debug attach selected an adapter or helper process instead of the intended user process, it SHALL emit a synthetic `agentDebug.helperProcessWarning` event with actionable diagnostics.

#### Scenario: Detect a helper attach
- **GIVEN** the attached runtime process is identified as a js-debug helper rather than the requested target
- **WHEN** process identity detection completes
- **THEN** the parent event stream contains `agentDebug.helperProcessWarning`
- **AND** the event explains that the caller should verify the target process and attach configuration

### Requirement: Same-Chromium Playwright Interoperability
`agent-debug` SHALL support a workflow in which js-debug launches or attaches to Chromium using a fixed loopback CDP port and Playwright connects to that same Chromium instance to drive UI actions while `agent-debug` owns debugger control.

#### Scenario: Pause on a Playwright-driven action
- **GIVEN** a `pwa-chrome` session and Playwright are connected to the same Chromium CDP endpoint
- **AND** a source-mapped breakpoint is configured before the UI action
- **WHEN** Playwright triggers that action
- **THEN** the parent js-debug session reports the resulting stopped state
- **AND** the caller can inspect and resume it through `agent-debug`

### Requirement: Browser Process Cleanup
Closing a js-debug browser session SHALL attempt to terminate browser processes owned by that session without targeting unrelated processes. If owned browser processes remain after bounded graceful and forced cleanup, the close result SHALL disclose their PIDs and `meta.warnings` SHALL contain an orphan warning.

#### Scenario: Close a browser session cleanly
- **GIVEN** a js-debug session launched Chromium processes
- **WHEN** the caller closes the session
- **THEN** `agent-debug` attempts to terminate only the owned browser process tree
- **AND** reports no orphan PIDs when cleanup succeeds

#### Scenario: Disclose surviving browser processes
- **GIVEN** an owned browser process survives cleanup
- **WHEN** close completes
- **THEN** the result includes that PID in `orphanPids`
- **AND** `meta.warnings` includes an `orphan_processes_remain` warning
