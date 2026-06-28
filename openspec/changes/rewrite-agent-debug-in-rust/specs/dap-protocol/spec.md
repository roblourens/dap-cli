## ADDED Requirements

### Requirement: DAP Byte Framing
`agent-debug` SHALL exchange Debug Adapter Protocol messages using DAP `Content-Length` framing over bytes, not JSON-RPC framing. The body length SHALL be the UTF-8 byte length of the serialized JSON body, headers SHALL end with `\r\n\r\n`, and the `Content-Length` header name SHALL be accepted case-insensitively.

#### Scenario: Encode a non-ASCII DAP message
- **WHEN** `agent-debug` sends a DAP message whose JSON contains non-ASCII characters
- **THEN** the `Content-Length` value equals the UTF-8 byte count of the body
- **AND** the frame consists of DAP headers, `\r\n\r\n`, and exactly that many body bytes

#### Scenario: Receive a fragmented frame
- **WHEN** a DAP frame arrives across arbitrary transport chunks that split either the header or body
- **THEN** `agent-debug` buffers the incomplete bytes
- **AND** it emits the message only after the complete declared body has arrived

#### Scenario: Receive multiple frames together
- **WHEN** one transport read contains multiple complete DAP frames and optionally a partial following frame
- **THEN** `agent-debug` emits every complete message in wire order
- **AND** it retains the partial frame for the next read

### Requirement: Malformed DAP Frame Handling
`agent-debug` SHALL reject malformed DAP frames deterministically. Missing, non-decimal, negative, overflowing, or otherwise invalid `Content-Length` values, invalid UTF-8 JSON bodies, invalid JSON, and payloads that are not valid DAP request, response, or event messages SHALL be treated as protocol failures rather than partially accepted input.

#### Scenario: Receive an invalid Content-Length header
- **WHEN** an adapter sends a frame with a missing or invalid `Content-Length`
- **THEN** `agent-debug` closes or invalidates that DAP connection
- **AND** every request pending on the connection fails with a structured adapter-transport or protocol error

#### Scenario: Receive an invalid DAP body
- **WHEN** the declared body is not valid JSON or is not a valid DAP message shape
- **THEN** `agent-debug` does not dispatch the body as an event, response, or reverse request
- **AND** pending callers receive a structured failure that identifies malformed adapter protocol input

### Requirement: Bounded DAP and Diagnostic Inputs
DAP headers SHALL be limited to 8 KiB and an individual DAP body SHALL be limited to 16 MiB before allocation. JSON nesting SHALL be limited to 128 levels. One adapter stderr line SHALL be retained at no more than 16 KiB, the complete retained stderr tail SHALL be limited to 64 KiB, and one cached event body SHALL be limited to 256 KiB. Oversized cached bodies SHALL be replaced by a truncation descriptor that records the original byte length; oversized wire messages SHALL fail with `dap_message_too_large`.

#### Scenario: Adapter declares an oversized body
- **WHEN** `Content-Length` exceeds 16 MiB
- **THEN** `agent-debug` SHALL reject the message before allocating the body
- **AND** pending requests SHALL fail with `dap_message_too_large`

#### Scenario: Adapter emits an oversized event body
- **WHEN** a valid event body exceeds 256 KiB
- **THEN** live event processing MAY use the body for required state projection
- **AND** the cached event SHALL contain a truncation descriptor instead of the full body

#### Scenario: Adapter writes excessive stderr
- **WHEN** stderr output exceeds the per-line or total-tail limits
- **THEN** diagnostics SHALL retain only the bounded sanitized tail

### Requirement: DAP Message Sequencing and Correlation
Each DAP actor created by `agent-debug` SHALL begin its outgoing sequence numbers at 1 and increment them for every request or response it sends. Responses SHALL be correlated by `request_seq`, and outstanding requests SHALL be allowed to complete in an order different from request issuance.

#### Scenario: Correlate out-of-order responses
- **WHEN** two requests are outstanding and the adapter responds to the second before the first
- **THEN** each response resolves the request named by its `request_seq`
- **AND** neither response is matched by arrival order

#### Scenario: Ignore an unknown response
- **WHEN** a response refers to a request sequence that is no longer pending
- **THEN** `agent-debug` ignores that response without resolving or rejecting another request

### Requirement: DAP Request Timeouts and Failures
`agent-debug` SHALL bound lifecycle and ordinary adapter requests with configurable timeouts. A timeout, unsuccessful DAP response, malformed frame, or transport closure SHALL fail the affected operation with structured context including the command, request sequence when known, session, adapter, and available adapter diagnostics.

#### Scenario: Adapter returns an unsuccessful response
- **WHEN** a DAP response has `success: false`
- **THEN** the operation fails with the adapter's message and response details
- **AND** the error identifies the DAP command and `request_seq`

#### Scenario: A request exceeds its timeout
- **WHEN** an adapter does not answer a request before its configured deadline
- **THEN** the request is removed from the pending set
- **AND** the caller receives a timeout error that identifies the DAP command and session

#### Scenario: The transport closes with requests pending
- **WHEN** the DAP transport closes or errors while requests are outstanding
- **THEN** all outstanding requests fail promptly
- **AND** later requests on that connection fail without being written

### Requirement: Local DAP Transports
`agent-debug` SHALL support adapters over stdio, a pre-existing TCP socket, and a spawned DAP server. TCP adapter connections and listeners SHALL be restricted to the IPv4 loopback address `127.0.0.1`; remote adapter transports are out of scope.

#### Scenario: Use a stdio adapter
- **WHEN** an adapter descriptor selects stdio
- **THEN** `agent-debug` reads DAP frames from the adapter's stdout and writes them to its stdin
- **AND** transport shutdown closes stdin and tears down owned processes

#### Scenario: Connect to a socket adapter
- **WHEN** an adapter descriptor selects a socket endpoint
- **THEN** `agent-debug` connects only to `127.0.0.1` using the configured port and a bounded connection timeout

#### Scenario: Start a server adapter
- **WHEN** an adapter descriptor selects server mode
- **THEN** `agent-debug` allocates a free localhost port, substitutes it into the adapter command, starts the adapter without a shell, and retries the localhost connection for a bounded period
- **AND** startup failure terminates the owned process and returns adapter log and stderr diagnostics when available

#### Scenario: Open child connections to one server adapter
- **WHEN** an adapter uses multiple DAP connections for child runtimes
- **THEN** `agent-debug` can open additional localhost socket transports to the same owned adapter server without spawning another adapter process

### Requirement: DAP Session Handshake Ordering
For both launch and attach, `agent-debug` SHALL send `initialize` first, retain the returned capabilities, issue `launch` or `attach`, wait for the adapter's `initialized` event, execute the breakpoint configuration hook, send `configurationDone`, and then observe the launch or attach completion. Each handshake stage SHALL have a bounded timeout, and an early launch or attach rejection SHALL abort the handshake.

#### Scenario: Launch a configured session
- **WHEN** a launch session starts successfully
- **THEN** `initialize` completes before `launch` is issued
- **AND** `configurationDone` is not issued until the `initialized` event has arrived and the breakpoint hook has completed

#### Scenario: Attach a configured session
- **WHEN** an attach session starts successfully
- **THEN** `initialize` completes before `attach` is issued
- **AND** the same initialized-event, breakpoint-hook, and `configurationDone` ordering used for launch is preserved

#### Scenario: Adapter rejects launch before initialized
- **WHEN** the launch or attach request fails while `agent-debug` is waiting for `initialized`
- **THEN** the handshake fails immediately rather than waiting for the initialized-event timeout

#### Scenario: A handshake stage times out
- **WHEN** `initialize`, launch or attach, the `initialized` event, or `configurationDone` exceeds its stage deadline
- **THEN** the session enters a failed state
- **AND** the error identifies the timed-out stage and timeout duration

### Requirement: Child Session Handshake
When an adapter creates a child through `startDebugging`, `agent-debug` SHALL initialize the child, issue the requested launch or attach operation without deadlocking the reverse request, wait for the child's `initialized` event, replay current breakpoints, and send `configurationDone`. The child SHALL become usable when `configurationDone` succeeds even if the trailing launch or attach response remains pending.

#### Scenario: Configure a child runtime
- **WHEN** a valid `startDebugging` reverse request creates a child connection
- **THEN** `agent-debug` answers the reverse request without waiting for the full child handshake
- **AND** the child becomes ready after initialize, initialized, breakpoint replay, and `configurationDone`

#### Scenario: Trailing child attach response is delayed
- **WHEN** a child acknowledges `configurationDone` but delays its launch or attach response
- **THEN** `agent-debug` keeps the configured child usable
- **AND** a later non-transport failure is surfaced as a non-fatal parent event diagnostic

### Requirement: Termination and Disconnect
`agent-debug` SHALL process adapter `terminated` and `exited` events, SHALL support DAP `terminate` when the adapter advertises it, and SHALL support `disconnect` options including `terminateDebuggee`, `suspendDebuggee`, and `restart`. Closing an owned runtime SHALL attempt graceful teardown before forceful process termination and SHALL not leave pending DAP requests unresolved.

#### Scenario: Disconnect and terminate the debuggee
- **WHEN** a caller disconnects with `terminateDebuggee: true`
- **THEN** `agent-debug` forwards that option in the DAP `disconnect` request
- **AND** the session is reported as disconnected or terminated after teardown

#### Scenario: Adapter emits terminated
- **WHEN** the adapter emits a `terminated` event
- **THEN** `agent-debug` records the terminal lifecycle
- **AND** paused state and stop-scoped routing state no longer remain active

#### Scenario: Owned adapter does not exit gracefully
- **WHEN** an owned adapter or reverse-request child process remains alive after graceful termination
- **THEN** `agent-debug` escalates teardown within bounded waits
- **AND** reports any process it cannot confirm as terminated

### Requirement: Authoritative and Reproducible DAP Command Catalog
The repository SHALL contain a reviewed snapshot of the official schema from `https://microsoft.github.io/debug-adapter-protocol/debugAdapterProtocol.json`, including its source URL and content digest. Normal Rust builds SHALL generate the DAP command catalog from that vendored snapshot without network access. A dedicated refresh command SHALL fetch the live official schema, update the snapshot and digest, regenerate the catalog, and expose the resulting diff for review. Every request defined by the snapshot as client-to-adapter SHALL have a generated public command beneath `agent-debug dap` using the schema command converted from camel case to kebab case.

#### Scenario: Generate commands during a normal build
- **WHEN** the DAP command catalog is generated without requesting a schema refresh
- **THEN** the generator reads the reviewed vendored `debugAdapterProtocol.json`
- **AND** it emits one command for every client-to-adapter request in that snapshot
- **AND** it does not expose adapter-to-client reverse requests as sendable generated commands

#### Scenario: Refresh from the official schema
- **WHEN** the dedicated schema refresh command runs with network access
- **THEN** it fetches the official live `debugAdapterProtocol.json`
- **AND** updates the vendored snapshot, content digest, and generated catalog together
- **AND** validation fails if the reviewed snapshot and generated catalog are out of sync

#### Scenario: Convert a command name
- **WHEN** the schema contains `stackTrace`, `setBreakpoints`, or another camel-case request command
- **THEN** the generated CLI names are `stack-trace`, `set-breakpoints`, or the corresponding kebab-case name
- **AND** the wire command remains the exact schema command

### Requirement: Generated DAP Argument Validation
Generated DAP commands SHALL accept JSON request arguments and SHALL validate whether arguments are required, every schema-required property is present, and known properties have the schema's array, boolean, integer, number, object, or string type before sending the request.

#### Scenario: Send valid generated arguments
- **WHEN** a user invokes a generated command with arguments satisfying the authoritative schema snapshot
- **THEN** `agent-debug` sends the corresponding DAP request with those arguments unchanged

#### Scenario: Reject invalid generated arguments
- **WHEN** required arguments or properties are missing or a known property has the wrong JSON type
- **THEN** `agent-debug` returns a usage error before contacting the adapter
- **AND** the diagnostic identifies the command and invalid argument

### Requirement: Mediated DAP Request Execution
Generated commands, raw requests, aliases, and internal lifecycle operations SHALL all pass through one controller mediation path. Requests that mutate execution or lifecycle SHALL be serialized per runtime. `initialize`, `launch`, `attach`, and `configurationDone` SHALL be rejected from public raw or generated invocation with `dap_lifecycle_managed` because the controller owns those handshake stages. Public `restart`, `terminate`, and `disconnect` MAY be allowed only when the adapter capability and current lifecycle permit them, and the controller SHALL update lifecycle, paused state, process ownership, and reference invalidation before another conflicting operation can run.

#### Scenario: Attempt a managed handshake request
- **WHEN** a caller invokes generated or raw `initialize`, `launch`, `attach`, or `configurationDone` against an existing session
- **THEN** `agent-debug` SHALL not forward the request
- **AND** SHALL return `dap_lifecycle_managed` with the supported high-level command

#### Scenario: Continue races with inspection
- **WHEN** a resume-like request and a reference-scoped inspection request arrive concurrently for one runtime
- **THEN** runtime mediation SHALL serialize them
- **AND** references SHALL be invalidated before an inspection can be forwarded after resume

#### Scenario: Disconnect through an escape hatch
- **WHEN** a permitted raw or generated disconnect request succeeds
- **THEN** the controller SHALL update the session lifecycle and clear paused/reference ownership state
- **AND** teardown behavior SHALL remain consistent with the selected `terminateDebuggee` value

### Requirement: Capability-Gated DAP Requests
For every request whose official schema says clients must check an adapter capability, `agent-debug` SHALL require that capability to be truthy in the retained initialize response before sending either a generated or raw request.

#### Scenario: Adapter supports a gated request
- **WHEN** the adapter reports the required capability and the caller invokes the request
- **THEN** `agent-debug` sends the request

#### Scenario: Adapter does not support a gated request
- **WHEN** the adapter does not report the capability required by the request
- **THEN** `agent-debug` does not send the request
- **AND** returns `dap_request_unsupported` with the adapter, request, capability, and session context

### Requirement: Raw DAP Request Escape Hatch
`agent-debug request <command> --json <arguments>` SHALL provide a raw client-to-adapter request escape hatch for extension and newly introduced commands. It SHALL preserve the caller's JSON value, use normal mediation, sequencing, timeout, capability, lifecycle, child-discriminator, routing, invalidation, and error behavior, and SHALL NOT allow callers to impersonate adapter-to-client reverse requests.

#### Scenario: Send an extension request
- **WHEN** a caller sends a raw command not yet represented by a generated convenience command
- **THEN** `agent-debug` sends the named DAP request with the supplied JSON arguments
- **AND** returns the response body through the normal output envelope

#### Scenario: Raw request violates a known capability gate
- **WHEN** a raw request names a catalog command whose required capability is absent
- **THEN** it is rejected in the same way as the generated command

### Requirement: Capability Reporting
`agent-debug capabilities` SHALL return the exact capabilities retained from the adapter's successful `initialize` response together with the resolved session, session name, and adapter identity.

#### Scenario: Inspect adapter capabilities
- **WHEN** a caller requests capabilities for a session
- **THEN** the result identifies the session and adapter
- **AND** includes the adapter capability object used for request gating

### Requirement: runInTerminal Reverse Requests
`agent-debug` SHALL handle valid `runInTerminal` reverse requests by launching the requested argument vector without a shell, applying the requested working directory and environment overlay, returning the process identifier when available, and tracking the process for teardown. Invalid arguments or spawn failures SHALL produce an unsuccessful DAP response rather than crash the controller.

#### Scenario: Run a terminal process
- **WHEN** an adapter sends `runInTerminal` with a non-empty `args` array and valid optional `cwd` and `env`
- **THEN** `agent-debug` launches `args[0]` with the remaining arguments without shell interpretation
- **AND** responds successfully with the process identifier when one is available

#### Scenario: Reject malformed runInTerminal arguments
- **WHEN** `args` is absent or empty, or `cwd` or `env` has an invalid shape
- **THEN** `agent-debug` sends an unsuccessful response for that reverse request
- **AND** the DAP connection remains available for subsequent messages

### Requirement: startDebugging Reverse Requests
`agent-debug` SHALL handle `startDebugging` reverse requests by validating the configuration and requested launch or attach mode, opening a child DAP connection, registering a visible child runtime under the parent, and installing the same handler recursively for nested children. Child creation failures SHALL be returned to the originating adapter as unsuccessful reverse-request responses.

#### Scenario: Adapter starts a child runtime
- **WHEN** an adapter sends a valid `startDebugging` request
- **THEN** `agent-debug` creates a child runtime associated with the parent
- **AND** the child is visible for diagnostics but normal debugging operations remain targetable through the parent

#### Scenario: A child starts a nested child
- **WHEN** an existing child sends another `startDebugging` request
- **THEN** `agent-debug` handles it with the same parent coordination model
- **AND** mirrors the nested child's events into the parent's event history with child identity

### Requirement: Bounded Priority Event History
Each session SHALL retain DAP events in two independently bounded histories with one monotonic session cursor. The default high-priority capacity SHALL be 200 events. The default low-priority capacity SHALL be 50 events, and `loadedSource` SHALL be low priority by default; all other events SHALL be high priority unless explicitly configured otherwise.

#### Scenario: loadedSource events flood the session
- **WHEN** more than 50 `loadedSource` events arrive while high-priority events are retained
- **THEN** only the newest 50 low-priority events remain
- **AND** those evictions do not consume the 200-event high-priority capacity

#### Scenario: High-priority history reaches capacity
- **WHEN** more than 200 high-priority events arrive
- **THEN** the oldest high-priority events are evicted independently of the low-priority history

### Requirement: Event Cursors and Loss Markers
Every cached event SHALL have a monotonically increasing cursor, receipt timestamp, session identity, adapter sequence, event name, optional body, and summary. Polling SHALL return the latest cursor even when no matching events are returned and SHALL include a dropped marker equal to the highest cursor evicted from either priority history.

#### Scenario: Poll after a cursor
- **WHEN** a caller supplies `after-cursor`
- **THEN** only retained events with a strictly greater cursor are eligible
- **AND** the response cursor identifies the newest event observed by the session

#### Scenario: Poll after eviction
- **WHEN** either priority history has evicted events
- **THEN** the response includes a non-zero dropped marker identifying the highest evicted cursor
- **AND** the caller can detect that its cursor may cross a history gap

### Requirement: Event Filtering Before Limiting
Event-name include and exclude filters SHALL be applied after cursor filtering and before the result limit. The limit SHALL select the newest eligible events while preserving cursor order. Filter lists SHALL be bounded, and a requested limit larger than the combined 250-event default capacity SHALL report the available capacity and a truncation warning in `meta.warnings` rather than implying complete history.

#### Scenario: Filter then limit
- **WHEN** a caller requests `--include stopped,output --limit 2`
- **THEN** `agent-debug` first removes all other event types
- **AND** returns the newest two remaining events in ascending cursor order

#### Scenario: Limit exceeds retained capacity
- **WHEN** a caller requests more events than the combined configured capacity
- **THEN** the response reports total and per-priority capacities
- **AND** includes a machine-readable truncation marker
- **AND** `meta.warnings` includes the truncation warning
