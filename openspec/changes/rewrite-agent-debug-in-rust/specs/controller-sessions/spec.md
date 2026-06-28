## ADDED Requirements

### Requirement: Controller startup is explicit
The persistent controller MUST start only through `agent-debug start`. Commands that require the controller MUST NOT auto-start it; they MUST fail with a structured controller error that directs the user to run `agent-debug start`. `status` and `stop` MAY use their defined controller fallback only when no session selection exists.

#### Scenario: Session command before start
- **WHEN** a user invokes `agent-debug sessions` and no live controller is discoverable
- **THEN** the command SHALL fail with exit code `3` and an `agent-debug start` recovery action
- **AND** it SHALL NOT spawn a controller

#### Scenario: Explicit start
- **WHEN** a user invokes `agent-debug start` with no live controller
- **THEN** the CLI SHALL launch a detached controller, wait for successful discovery and handshake, and return its pid, endpoint, state directory, log directory, and build identifier

### Requirement: Start is idempotent and build-safe
`agent-debug start` MUST reuse a live controller whose handshake build identifier matches the invoking executable and MUST report `started:false` and `reused:true`. It MUST remove stale discovery for a dead or unreachable controller before starting a replacement. It MUST refuse to reuse a live controller with a different build identifier, return a controller-category `controller_build_mismatch` error, report both identifiers, and direct the user to `agent-debug stop-controller` before retrying.

#### Scenario: Reuse a matching controller
- **WHEN** `agent-debug start` discovers a live controller with the same build identifier
- **THEN** it SHALL return the existing controller without spawning a second process

#### Scenario: Reject a mismatched controller
- **WHEN** `agent-debug start` discovers a live controller with a different build identifier
- **THEN** it SHALL exit `3` without replacing or silently reusing that controller

### Requirement: Controller discovery and heartbeat
The controller MUST publish `~/.agent-debug/state/controller.json`, or the corresponding `AGENT_DEBUG_HOME` path, containing a schema version, controller pid, local endpoint, state directory, log directory, start timestamp, last-heartbeat timestamp, and build identifier. Discovery writes MUST be atomic. While running, the controller MUST refresh `lastHeartbeatAt`; clients MUST combine heartbeat freshness, pid liveness, endpoint connectivity, and a hello handshake rather than trusting any single field. Stale discovery MUST be treated as unavailable and safely replaceable by `agent-debug start`.

#### Scenario: Healthy discovery
- **WHEN** a client reads discovery for a live controller
- **THEN** the pid SHALL be live, the heartbeat SHALL be fresh, the endpoint SHALL accept a local connection, and `controller.hello` SHALL return the expected build identifier

#### Scenario: Stale discovery
- **WHEN** discovery exists but its pid is dead, heartbeat is stale, endpoint cannot be reached, or hello cannot complete
- **THEN** controller-dependent commands SHALL treat the controller as unavailable
- **AND** `agent-debug start` SHALL be allowed to replace the stale discovery

### Requirement: Local IPC transport and long-path fallback
On Unix-like systems the controller MUST use a Unix domain socket; on Windows it MUST use a named pipe. It MUST NOT expose controller IPC on a network interface. The normal Unix socket MUST live under `~/.agent-debug/state`; if that path exceeds the portable Unix socket path limit, the controller MUST use a deterministic, collision-resistant hashed socket name in an OS runtime or temporary directory and record the resolved path in discovery. Windows named-pipe names MUST likewise be deterministic for the selected agent-debug home.

#### Scenario: Normal Unix socket path
- **WHEN** the state-directory socket path is within the portable limit
- **THEN** discovery SHALL identify a Unix socket under `~/.agent-debug/state`

#### Scenario: Long Unix home path
- **WHEN** the normal socket path would exceed the portable limit
- **THEN** the controller SHALL bind a shorter hashed Unix socket path and clients SHALL connect using the discovery value

#### Scenario: Windows controller
- **WHEN** the controller runs on Windows
- **THEN** discovery SHALL identify a local named pipe rather than TCP

### Requirement: Controller IPC Authorization
Controller IPC MUST be accessible only to the operating-system user that owns the controller. On Unix, the socket or its private containing directory MUST deny access to group and other users, the server MUST verify peer credentials when the platform provides them, and fallback socket paths MUST be created in an owner-safe directory without following symlinks. On Windows, the named pipe MUST use an ACL limited to the current user and required system identities. Discovery and socket creation MUST reject unsafe ownership, link, or permission conditions rather than weakening the boundary.

#### Scenario: Connect as the controller owner
- **WHEN** a client running as the controller's owning user connects through a safely owned endpoint
- **THEN** the controller MAY accept and validate its request

#### Scenario: Another Unix user connects
- **WHEN** peer credentials identify a different user
- **THEN** the controller SHALL close the connection without dispatching a command
- **AND** no adapter, debuggee, or `runInTerminal` process is started

#### Scenario: Fallback socket path is unsafe
- **WHEN** the selected fallback path or containing directory is symlinked, group/world writable, or owned by another user
- **THEN** controller startup SHALL fail with a safe controller error

### Requirement: Controller IPC Input Bounds
The controller and client SHALL accept at most 20 MiB for one newline-delimited request or response and SHALL reject JSON nesting deeper than 128 levels. The limit is intentionally larger than the 16 MiB DAP body limit so a valid DAP response plus the controller and CLI envelopes can cross IPC. Both sides SHALL close a connection that exceeds the line limit before allocating an unbounded buffer and SHALL return `controller_request_too_large` when a complete oversized message can be identified safely.

#### Scenario: Oversized controller request
- **WHEN** a client sends more than 20 MiB without completing a valid request line
- **THEN** the controller SHALL close the connection
- **AND** SHALL NOT continue growing the request buffer

#### Scenario: Excessively nested controller JSON
- **WHEN** a request exceeds the supported JSON nesting depth
- **THEN** it SHALL be rejected before dispatch

### Requirement: Status and stop fallback is selection-sensitive
Without `--name`, `agent-debug status` and `agent-debug stop` MUST first resolve the active session. They MAY fall back to controller status or controller shutdown only when there are no sessions or no active session. An explicit `--name`, an invalid explicit target, an ambiguous target, or any other session error MUST NOT fall back to the controller.

#### Scenario: Status with an active session
- **WHEN** an active session exists and the user invokes `agent-debug status`
- **THEN** the command SHALL return that session's status rather than controller status

#### Scenario: Status with no session selection
- **WHEN** the controller is live but there are no sessions or no active session and the user invokes `agent-debug status`
- **THEN** the command SHALL return controller status

#### Scenario: Explicit missing target
- **WHEN** the user invokes `agent-debug stop --name missing`
- **THEN** the command SHALL return `session_not_found` and SHALL NOT stop the controller

### Requirement: Stable session identifiers and persisted records
Every session, including diagnostic child sessions, MUST receive an opaque identifier beginning with `sess_` followed only by URL-safe characters. An identifier MUST remain stable for the lifetime of its persisted record and MUST NOT be recycled for a later session. Each record MUST persist at least the id, name, adapter id, lifecycle, created and updated timestamps, adapter ownership metadata, optional parent id, optional compound metadata, and optional paused-state projection.

#### Scenario: Create two sessions across a restart
- **WHEN** sessions are created before and after a controller restart
- **THEN** each SHALL retain a distinct stable `sess_` identifier in persisted state

### Requirement: Session lifecycle is explicit and observable
The controller MUST model the full lifecycle `created`, `adapterStarting`, `transportOpen`, `initializing`, `initialized`, `launching`, `attaching`, `configuring`, `running`, `stopped`, `terminating`, `terminated`, `disconnected`, and `failed`. Every transition MUST update `updatedAt` and be atomically persisted. Public status MUST project `failed` as failed, `terminated` and `disconnected` as terminated, `created` as unavailable, `stopped` or `paused:true` as stopped, and other non-terminal states as running. Terminal lifecycle state MUST take precedence over stale paused state.

#### Scenario: Launch lifecycle
- **WHEN** a launch session successfully opens its adapter, initializes, launches, configures, and begins execution
- **THEN** the persisted lifecycle SHALL advance through the applicable ordered states and end at `running` or `stopped`

#### Scenario: Continued event clears paused projection
- **WHEN** a stopped session receives a DAP continued event
- **THEN** `paused` SHALL become false and stale stopped reason and stopped-thread ids SHALL be removed

#### Scenario: Startup failure
- **WHEN** adapter startup or DAP initialization fails
- **THEN** the record SHALL enter `failed` and retain diagnostics needed for inspection and cleanup

### Requirement: Active-session selection rules
An explicit command target MUST take precedence over the active session. A newly created top-level session MUST become active when `use` is true; launch and attach MUST default `use` to true, while `--no-use` MUST preserve the existing active selection. If no active session exists, the first top-level session MUST become active unless explicitly created with use disabled. Child sessions MUST never become active automatically. `agent-debug use <name-or-id>` MUST persist the selected top-level session. Closing the active session MUST clear active selection and MUST NOT silently select another session.

#### Scenario: Explicit target overrides active
- **WHEN** session A is active and a command supplies `--name` for session B
- **THEN** the command SHALL target B without changing active selection

#### Scenario: Child registration
- **WHEN** a child session is registered under an active parent
- **THEN** the parent SHALL remain active

#### Scenario: Close the active session
- **WHEN** the active session is closed while another session remains
- **THEN** subsequent untargeted session commands SHALL return `no_active_session` until `agent-debug use` selects one

### Requirement: Live session names are unique
The controller MUST reject creation of a top-level session whose name exactly matches another top-level session not in `terminated`, `disconnected`, or `failed` lifecycle. The error MUST be `session_name_in_use` and identify the conflicting id and lifecycle. Names from terminal records MAY be reused, producing a new id; name lookup MUST prefer the live record. Derived compound member names are subject to the same rule. Child-session implementation names do not participate in top-level uniqueness.

#### Scenario: Duplicate live name
- **WHEN** a running session named `demo` exists and another top-level session is started as `demo`
- **THEN** creation SHALL fail without disturbing the existing session

#### Scenario: Reuse a terminal name
- **WHEN** the prior `demo` record is terminated and a new `demo` session starts
- **THEN** the new session SHALL receive a new id and name targeting SHALL resolve to the live record

### Requirement: Session listing and child visibility
`agent-debug sessions` MUST list top-level sessions only by default. `--show-children` and its `--all` alias MUST include child records. Child summaries MUST include `parentSessionId` and `targetable:false`; top-level summaries MUST NOT be marked non-targetable. Listings and status MUST include compound metadata and paused-state fields when present.

#### Scenario: Default listing
- **WHEN** a parent and child session exist and the user invokes `agent-debug sessions`
- **THEN** only the parent SHALL be returned

#### Scenario: Diagnostic child listing
- **WHEN** the user invokes `agent-debug sessions --show-children`
- **THEN** both records SHALL be returned and the child SHALL identify its parent and `targetable:false`

### Requirement: Child sessions cannot be targeted directly
Every public targeting path, including status, use, events, breakpoint operations, aliases, and generated or raw DAP requests, MUST reject a child id or child name with session-category code `child_session_not_targetable`. The error data MUST include `childSessionId`, `parentSessionId`, and `parentName` and direct the caller to target the parent. An unknown non-child target MUST remain `session_not_found`.

#### Scenario: Target child events
- **WHEN** a user invokes `agent-debug events --name <child-id>`
- **THEN** the command SHALL exit `4` with `child_session_not_targetable` and parent recovery data

#### Scenario: Select a child through its parent
- **GIVEN** a child belongs to the selected parent
- **WHEN** a supported command targets the parent and supplies `--child-session-id <child-id>`
- **THEN** the command SHALL remain parent-targeted
- **AND** routing SHALL be constrained to that child without treating the child as a standalone session

#### Scenario: Target an unknown name
- **WHEN** a user targets a name matching neither a parent nor child record
- **THEN** the command SHALL return `session_not_found`

### Requirement: Use, stop, detach, and close have distinct semantics
`use` MUST change only active selection. `stop` MUST send DAP `disconnect` with `terminateDebuggee:true`, tear down the owned adapter runtime, and retain the record as `terminated`. `detach` MUST send DAP `disconnect` with `terminateDebuggee:false`, tear down the adapter connection without intentionally terminating an attached debuggee, and retain the record as `disconnected`. `close` MUST perform bounded teardown with `terminateDebuggee:true`, remove the selected record, remove its child records, and clear active selection if needed. Each operation MUST accept an explicit name or id where defined and otherwise use the active session.

#### Scenario: Stop a launch session
- **WHEN** the user stops a live launch session
- **THEN** the debuggee and owned adapter SHALL be terminated and the retained record SHALL report terminated

#### Scenario: Detach an attach session
- **WHEN** the user detaches an attach session
- **THEN** the controller SHALL disconnect without requesting debuggee termination and the retained record SHALL report disconnected

#### Scenario: Close a parent
- **WHEN** the user closes a parent session with registered children
- **THEN** the parent and all child records SHALL be removed atomically after teardown is attempted

### Requirement: Cleanup is ownership-aware and honest
Plain `agent-debug cleanup` MUST remove terminal unowned records and MUST signal and remove stale adapters that are explicitly recorded as agent-debug-owned. It MUST NOT signal an unowned adapter or remove a live unowned record. `cleanup --purge` and `cleanup --force` MUST perform a hard cleanup of all records and MUST use the same bounded runtime teardown as close for active owned runtimes. Result data MUST separately report `signaledAdapter`, `removedRecords`, `keptRunning` with reasons, `failed`, and `orphanPids`; non-fatal cleanup warnings MUST use the canonical envelope warning location. It MUST NOT claim a record was cleaned when it remains.

#### Scenario: Plain cleanup sees a live unowned record
- **WHEN** cleanup examines a live session whose adapter is not owned by agent-debug
- **THEN** it SHALL neither signal the process nor remove the record and SHALL report it in `keptRunning`

#### Scenario: Purge active sessions
- **WHEN** the user invokes `agent-debug cleanup --purge`
- **THEN** the controller SHALL attempt bounded teardown of owned runtimes, remove successfully handled records, and report any failures or orphans

### Requirement: Compound sessions are transactional
Starting a launch configuration compound MUST create one targetable top-level session per member, named `<compound>/<member>`, with a shared opaque compound id and metadata containing compound name, member name, member list, and `stopAll`. `stopAll` MUST default to true when omitted. Members MUST start in declared order, and if any member fails, already-started members MUST be torn down and all records created for the failed compound attempt MUST be removed before returning `compound_member_start_failed` with structured member details.

#### Scenario: Start a compound
- **WHEN** a compound named `Full Stack` declares members `Server` and `Client`
- **THEN** the controller SHALL create `Full Stack/Server` and `Full Stack/Client` with one shared compound id

#### Scenario: A member fails
- **WHEN** the second compound member fails during startup
- **THEN** the first member SHALL be torn down, no partial compound records SHALL remain, and the error SHALL identify the failed and already-started members

### Requirement: Compound stopAll controls close cascading
When a member with `stopAll:true` is closed, the controller MUST tear down and remove every record sharing its compound id and aggregate all orphan diagnostics. When `stopAll:false`, closing one member MUST leave peer members running and persisted.

#### Scenario: Close a stop-all member
- **WHEN** either member of a `stopAll:true` compound is closed
- **THEN** all compound members SHALL be closed

#### Scenario: Close an independent member
- **WHEN** one member of a `stopAll:false` compound is closed
- **THEN** the other member SHALL remain available

### Requirement: Session state persistence is atomic and recoverable
Session state MUST be stored at `~/.agent-debug/state/sessions.json`, or under `AGENT_DEBUG_HOME`, as a versioned JSON document containing `activeSessionId` when selected and the session records. Every update MUST write and flush a sibling temporary file and atomically replace the destination; partial JSON MUST never be published as the current file. If the file is syntactically invalid or violates the supported schema, the controller MUST rename it to `sessions.json.corrupt.<timestamp>.bak`, emit one safe warning to stderr or the controller log, and continue with empty state.

#### Scenario: Atomic persistence
- **WHEN** a lifecycle or active-session update is persisted
- **THEN** readers SHALL observe either the complete previous document or the complete new document, never a partial write

#### Scenario: Corrupt state file
- **WHEN** controller startup reads invalid session JSON
- **THEN** the invalid file SHALL be preserved under a timestamped corrupt backup and the controller SHALL start with no sessions

### Requirement: Private Local State Permissions
On platforms with POSIX-style permissions, `~/.agent-debug`, state, config, log, and adapter directories MUST be owner-accessible only by default; controller discovery, session state, custom adapter config, and logs MUST be owner-readable and owner-writable only. Native adapter executables MAY be owner/group/world executable only when contained inside the private adapter directory and MUST NOT be group/world writable.

#### Scenario: Create local state on POSIX
- **WHEN** `agent-debug` creates its home, state, config, log, and adapter paths
- **THEN** directories use mode `0700`
- **AND** state, config, discovery, and log files use mode `0600`

#### Scenario: Install a native adapter executable
- **WHEN** a native adapter executable is installed under the private adapter cache
- **THEN** it MAY use mode `0755`
- **AND** the containing directories remain private and the executable is not group/world writable

### Requirement: Adapter ownership is explicit
Each session record MUST state whether the adapter process was started by agent-debug and MAY record its pid, process-group or Job Object identity, process creation time, executable identity, log path, and bounded stderr tail. Process signaling MUST occur only for an owned runtime whose live process identity still matches the recorded creation and executable evidence. A numeric PID loaded from persisted state MUST NOT be signaled after controller restart without that verification. Ownership metadata and cleanup actions MUST be visible in status diagnostics without exposing unbounded logs.

#### Scenario: External adapter
- **WHEN** a session uses an adapter process not started by agent-debug
- **THEN** stop, cleanup, and shutdown logic SHALL NOT send operating-system signals to that process solely because its pid is recorded

#### Scenario: Owned adapter failure
- **WHEN** signaling an owned adapter fails
- **THEN** the result SHALL identify the session id, safe error message, log path when known, bounded stderr tail, and recovery actions

#### Scenario: Persisted PID has been reused
- **GIVEN** a session record contains an adapter PID from an earlier controller process
- **WHEN** that PID now belongs to a process whose creation time or executable identity does not match
- **THEN** cleanup SHALL NOT signal it
- **AND** SHALL report that automatic process cleanup could not be verified

### Requirement: Teardown reports orphan processes
Runtime teardown MUST attempt DAP disconnect first, wait only for bounded intervals, then terminate an owned adapter process tree gracefully and escalate if necessary. On POSIX, signaling MUST cover the owned process group; on Windows, it MUST cover the owned process tree using platform-appropriate facilities. After final liveness checks, every surviving owned adapter pid MUST be returned in `orphanPids` with a matching `orphan_processes_remain` entry in `meta.warnings`. Clean teardown MUST return an empty `orphanPids` array and no orphan warning.

#### Scenario: Adapter exits cleanly
- **WHEN** disconnect causes the owned adapter to exit within the bounded wait
- **THEN** close SHALL return empty `orphanPids`
- **AND** `meta.warnings` SHALL contain no orphan warning

#### Scenario: Adapter survives escalation
- **WHEN** an owned adapter remains alive after graceful and forced termination attempts
- **THEN** close or purge SHALL still complete record handling as defined and SHALL report the surviving pid and warning

### Requirement: Controller shutdown preserves session history
`agent-debug stop-controller` and controller shutdown fallback MUST stop accepting requests, remove controller discovery, close IPC, and perform bounded teardown of in-memory owned runtimes. Shutdown MUST NOT delete persisted session records merely because the controller is stopping. Records whose live runtimes were torn down MUST be atomically updated to a truthful terminal lifecycle and retain their ids, names, ownership metadata, and diagnostics so a later controller can list, close, or clean them.

#### Scenario: Stop controller with sessions
- **WHEN** the controller is stopped while sessions are persisted
- **THEN** controller discovery SHALL be removed and the controller process SHALL exit
- **AND** the session records SHALL remain in `sessions.json` with truthful post-shutdown lifecycle state

#### Scenario: Restart after shutdown
- **WHEN** `agent-debug start` runs after a prior controller shutdown
- **THEN** the new controller SHALL load the preserved records without treating them as live runtimes or silently deleting them

### Requirement: Cross-Build Shutdown Recovery
The controller protocol SHALL reserve a backward-stable, authorization-protected hello and shutdown subset across build identifiers. A mismatched client MAY use only that subset to identify and stop the controller; it MUST NOT issue session, DAP, adapter, or process-launch commands. If even the stable subset is incompatible, recovery MAY terminate the discovered process only after verifying the recorded process creation and executable identity.

#### Scenario: Stop a mismatched controller safely
- **WHEN** `agent-debug start` detects a live controller with a different build identifier
- **THEN** diagnostics SHALL instruct the user to run `agent-debug stop-controller`
- **AND** that command SHALL be permitted through the stable shutdown subset after normal IPC authorization

#### Scenario: Discovery PID was reused
- **WHEN** stable shutdown cannot connect and the discovery PID identity does not match the recorded controller
- **THEN** recovery SHALL remove stale discovery without signaling the unrelated process
