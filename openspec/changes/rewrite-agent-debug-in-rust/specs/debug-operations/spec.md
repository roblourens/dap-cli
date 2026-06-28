## ADDED Requirements

### Requirement: Poll-Based Debugging Workflow
`agent-debug` SHALL expose non-streaming `status` and `events` operations so an agent can repeatedly poll a named or active session. `status` SHALL return the current lifecycle projection, and `events` SHALL return an immediate cursor-based snapshot rather than waiting for future events.

#### Scenario: Poll a session
- **WHEN** a caller invokes `agent-debug status --name demo` and then `agent-debug events --name demo --after-cursor 12`
- **THEN** status returns the current projected session state
- **AND** events immediately returns retained events newer than cursor 12 together with the latest cursor and loss metadata

#### Scenario: Poll the active session
- **WHEN** no session name is supplied and one active target is available
- **THEN** status and events operate on that active session

### Requirement: Paused-State Projection
`agent-debug` SHALL project adapter `stopped`, `continued`, `thread`, `exited`, and `terminated` events into session status. A stopped projection SHALL include `paused: true`, a string `stoppedReason` defaulting to `unknown`, and known stopped thread identifiers. An observed continue or terminal transition SHALL set `paused: false` and remove stale stop details.

#### Scenario: Project a stopped event
- **WHEN** an adapter emits `stopped` with reason `breakpoint` and thread id 7
- **THEN** status reports `paused: true`, `stoppedReason: "breakpoint"`, and `stoppedThreadIds: [7]`
- **AND** the session summary status is `stopped`

#### Scenario: Project all threads stopped
- **WHEN** a stopped event reports `allThreadsStopped: true` or omits a specific thread
- **THEN** status reports the session as paused
- **AND** known stopped thread identifiers are derived from current thread knowledge rather than inventing an identifier

#### Scenario: Resume after a stop
- **WHEN** the relevant thread or all threads continue
- **THEN** status no longer reports stale stop reason or stopped-thread fields for resumed threads

#### Scenario: Combine child paused states
- **WHEN** one live child runtime is stopped and a sibling continues, exits, or terminates
- **THEN** the parent remains paused while any live child is still stopped
- **AND** the parent stopped-thread list is the union of paused threads across live children

### Requirement: Source Breakpoint Replacement
`agent-debug breakpoints set` SHALL resolve the source path to an absolute path and send one DAP `setBreakpoints` request containing the complete desired breakpoint set for that source. A successful call SHALL replace the previously tracked set for that source; it SHALL not append. A failed call SHALL leave the last successful tracked set unchanged.

#### Scenario: Replace breakpoints for one source
- **WHEN** source A has breakpoints at lines 10 and 20 and the caller sets source A to line 30
- **THEN** the adapter receives only the new line-30 set for source A
- **AND** subsequent breakpoint listing reports only the successful line-30 request and response for source A

#### Scenario: Preserve tracked state after adapter failure
- **WHEN** replacement of a source's breakpoints receives an unsuccessful DAP response
- **THEN** the operation returns a structured DAP error
- **AND** breakpoint listing still reports the previous successful set

### Requirement: Conditional, Hit-Count, and Log Breakpoints
Each source breakpoint SHALL support an optional condition, hit condition, and log message. When those options are supplied to `breakpoints set`, `agent-debug` SHALL attach them to every requested line without changing their text.

#### Scenario: Set an advanced source breakpoint
- **WHEN** a caller sets lines 10 and 20 with a condition, hit condition, and log message
- **THEN** each DAP source breakpoint contains its line and all three supplied values
- **AND** the response preserves the adapter's verification result for each breakpoint

### Requirement: Breakpoint Listing
`agent-debug breakpoints list` SHALL return successful breakpoint state grouped by source, including the original requested breakpoints and the latest adapter response with verification state. An optional source filter SHALL return only that absolute source path, and an unknown source SHALL return an empty list.

#### Scenario: List all tracked sources
- **WHEN** successful breakpoint sets exist for two source paths
- **THEN** breakpoint listing returns both source groups with requested and adapter-returned breakpoint data

#### Scenario: Filter breakpoint listing
- **WHEN** a caller lists one tracked source
- **THEN** only that source group is returned

### Requirement: Breakpoint Clearing
`agent-debug breakpoints clear` SHALL implement DAP replacement semantics by sending `setBreakpoints` with empty `breakpoints` and `lines` arrays for each cleared source. Clearing SHALL support either one source or every tracked source and SHALL be idempotent for unknown or already-clear sources.

#### Scenario: Clear one source
- **WHEN** a caller clears a tracked source
- **THEN** the adapter receives an empty replacement set for that source
- **AND** the source is removed from breakpoint listing only after the adapter accepts the request

#### Scenario: Clear all sources
- **WHEN** no source filter is supplied
- **THEN** `agent-debug` clears every tracked source
- **AND** returns the sources for which an empty replacement was accepted

#### Scenario: Clear an unknown source
- **WHEN** the requested source is not tracked
- **THEN** the command succeeds with an empty `cleared` collection

### Requirement: Asynchronous Breakpoint Verification Diagnostics
Breakpoint setting SHALL remain successful when an adapter returns unverified breakpoints, but `agent-debug` SHALL attach a structured verification diagnostic and an `OperationWarning` in `meta.warnings`. The diagnostic SHALL report total and unverified counts, loaded-source count, matching loaded sources, child-session count, a human-readable hint, and a reproducible follow-up command. Failure of the diagnostic probe SHALL not replace the successful primary response.

#### Scenario: All breakpoints are verified
- **WHEN** every returned breakpoint has `verified: true`
- **THEN** no verification diagnostic or warning is added

#### Scenario: No loaded sources match yet
- **WHEN** any breakpoint is unverified and the adapter supports `loadedSources`
- **THEN** `agent-debug` asynchronously probes loaded sources
- **AND** distinguishes no loaded sources, loaded sources with no path match, and a matching source whose line may be invalid

#### Scenario: loadedSources is unavailable
- **WHEN** the adapter lacks `supportsLoadedSourcesRequest` or the probe fails
- **THEN** the breakpoint response remains successful
- **AND** the diagnostic uses a sentinel unavailable count and explains that loaded-source verification could not be completed

#### Scenario: Child verification arrives later
- **WHEN** a parent or child initially returns an unverified breakpoint and a matching verified breakpoint event arrives within the bounded verification window
- **THEN** `agent-debug` merges the verified state into the response
- **AND** otherwise returns a `verification_timeout` warning in `meta.warnings` with binding guidance

### Requirement: Thread Inspection
`agent-debug threads` SHALL return active DAP threads for the selected runtime. For a parent with child runtimes, it SHALL aggregate live child threads, preserve the adapter's real thread identifiers, and annotate every returned thread with `childSessionId`. `--child-session-id` SHALL restrict the result to one child that belongs to the selected parent.

#### Scenario: List threads for a single runtime
- **WHEN** the adapter returns a threads response
- **THEN** `agent-debug` returns the adapter's thread identifiers and names

#### Scenario: List threads through a parent
- **WHEN** a parent has multiple live children
- **THEN** the parent threads result includes threads from every responsive live child
- **AND** each entry includes `childSessionId` identifying the runtime that owns it

#### Scenario: Filter threads to a child
- **WHEN** the caller supplies a valid `--child-session-id`
- **THEN** only that child's threads are returned

### Requirement: Stack Inspection
`agent-debug stack` SHALL send DAP `stackTrace` with a thread id and optional start-frame and levels values, and SHALL return stack frames without rewriting adapter frame identifiers. Every parent-routed frame SHALL include `childSessionId`.

#### Scenario: Inspect a selected thread
- **WHEN** a caller supplies `--thread-id`, `--start-frame`, and `--levels`
- **THEN** `agent-debug` forwards them as `threadId`, `startFrame`, and `levels`
- **AND** returns the adapter's stack frames

### Requirement: Scope and Variable Inspection
`agent-debug scopes` SHALL require a current frame id and return DAP scopes. `agent-debug variables` SHALL require a current variables reference and return DAP variables. Parent-routed scopes and variables SHALL include `childSessionId`. Positive variables references returned by scopes or variables SHALL be available for nested inspection only during the current stopped epoch.

#### Scenario: Inspect variables from a frame
- **WHEN** a caller obtains a frame id from stack, obtains a variables reference from scopes, and passes it to variables
- **THEN** each operation is routed to the runtime that produced the preceding reference
- **AND** nested positive variables references may be inspected during the same stop

### Requirement: Source Retrieval
`agent-debug source` SHALL retrieve virtual source content using a positive DAP source reference and SHALL optionally forward source path metadata. For child runtimes, the response SHALL include `childSessionId` and the request SHALL route to the child that issued the source reference.

#### Scenario: Retrieve virtual source
- **WHEN** a stack frame contains a positive source reference and the caller requests it
- **THEN** `agent-debug` returns the adapter's source response from the owning runtime

### Requirement: Expression Evaluation
`agent-debug evaluate` SHALL require an expression and SHALL support optional frame and context arguments. When a current frame is available it SHALL evaluate in that frame; when no frame is selected it SHALL permit the adapter's top-level or REPL evaluation behavior and SHALL report why automatic frame selection was not used.

#### Scenario: Evaluate in an explicit frame
- **WHEN** a caller supplies an expression and frame id
- **THEN** `agent-debug` forwards both values unchanged to the runtime that owns the frame

#### Scenario: Evaluate while not paused
- **WHEN** no frame id is supplied and status is not paused
- **THEN** `agent-debug` sends evaluate without a frame id
- **AND** returns an `OperationWarning` in `meta.warnings` that adapter top-level or REPL context is being used

### Requirement: Automatic Thread Resolution
For `stack`, `continue`, `next`, `step-in`, and `step-out`, omission of `--thread-id` SHALL select the unique stopped thread. For `pause`, omission SHALL select the unique live thread. If status lacks stopped-thread detail, `agent-debug` SHALL query threads before deciding. `--child-session-id` SHALL restrict candidate resolution to that child.

#### Scenario: One stopped thread exists
- **WHEN** a stopped-only operation omits `--thread-id` and exactly one stopped thread is known
- **THEN** `agent-debug` uses that thread
- **AND** reports the automatic selection as an `OperationWarning` in `meta.warnings`

#### Scenario: Multiple candidate threads exist
- **WHEN** more than one candidate thread is eligible
- **THEN** `agent-debug` does not choose arbitrarily
- **AND** returns `thread_id_required` with the candidate thread ids, names, and child identities when available
- **AND** instructs the caller to retry with both `--thread-id` and `--child-session-id` when numeric ids collide

#### Scenario: No candidate thread exists
- **WHEN** no eligible thread can be found
- **THEN** `agent-debug` returns `thread_id_required` with a diagnostic describing how to list or wait for threads

### Requirement: Automatic Frame Resolution
When `evaluate` omits `--frame-id` on a paused session, `agent-debug` SHALL select the top frame of the most recently stopped thread. If exactly one stopped thread is known it SHALL use it; if all threads are reported stopped without identifiers it SHALL query threads. Multiple candidates SHALL produce an explicit ambiguity diagnostic rather than silently selecting a runtime.

#### Scenario: Resolve the top paused frame
- **WHEN** the session is paused with one stopped thread and evaluate omits a frame id
- **THEN** `agent-debug` requests one stack frame starting at frame zero
- **AND** uses that frame id for evaluate

#### Scenario: Multiple paused threads are candidates
- **WHEN** automatic frame resolution finds multiple equally eligible stopped threads
- **THEN** `agent-debug` returns or attaches an ambiguity diagnostic listing the candidates
- **AND** instructs the caller to provide a thread or frame selection

#### Scenario: Automatic frame lookup fails
- **WHEN** status, threads, or stack lookup cannot produce a frame
- **THEN** `agent-debug` continues with frameless evaluation when the adapter supports it
- **AND** returns an `auto_frame_failed` warning in `meta.warnings` containing the failed stage

### Requirement: Continue Operation
`agent-debug continue` SHALL require or automatically resolve a stopped thread and SHALL support `--single-thread`, forwarding it as DAP `singleThread: true` only when requested.

#### Scenario: Continue one thread
- **WHEN** a caller invokes continue with `--single-thread`
- **THEN** `agent-debug` sends `continue` with the selected `threadId` and `singleThread: true`

#### Scenario: Continue the normal execution set
- **WHEN** `--single-thread` is omitted
- **THEN** `agent-debug` omits the optional `singleThread` property

### Requirement: Pause Operation
`agent-debug pause` SHALL require or automatically resolve a live thread. After a successful DAP response it SHALL wait a bounded period for paused state to become true; if no `stopped` event arrives, it SHALL return success with a structured `pause_no_stopped_event` warning in `meta.warnings`.

#### Scenario: Pause produces a stopped event
- **WHEN** the adapter acknowledges pause and a stopped event arrives within the bounded wait
- **THEN** the command succeeds without a pause warning
- **AND** status projects the stopped state

#### Scenario: Pause is acknowledged without stopping
- **WHEN** the adapter acknowledges pause but no stopped event arrives within two seconds
- **THEN** the command returns a `pause_no_stopped_event` warning
- **AND** the diagnostic explains that the selected parent or child thread may not be user-pauseable

### Requirement: Step Operations
`agent-debug next`, `agent-debug step-in`, and `agent-debug step-out` SHALL require or automatically resolve a stopped thread. All three SHALL support `--single-thread`; `next`, `step-in`, and `step-out` SHALL preserve any supported granularity value, and `step-in` SHALL additionally support a target id.

#### Scenario: Step into a target
- **WHEN** a caller invokes `step-in` with a selected thread, `--single-thread`, and a target id
- **THEN** `agent-debug` sends DAP `stepIn` with `threadId`, `singleThread: true`, and `targetId`

#### Scenario: Step request fails in the adapter
- **WHEN** the adapter returns an unsuccessful next, stepIn, or stepOut response
- **THEN** `agent-debug` returns a DAP-category error rather than a controller-unavailable error
- **AND** preserves the adapter's failure message

### Requirement: Stop-Scoped DAP Reference Invalidation
Frame ids and variables references SHALL be associated with the stopped epoch and runtime that produced them. Any continue, next, step-in, step-out, restart, terminate, disconnect, or event indicating the relevant execution has resumed or ended SHALL invalidate those references before subsequent inspection requests are routed.

#### Scenario: Use a reference during the same stop
- **WHEN** a frame id or variables reference was returned during the current stopped epoch
- **THEN** stack-follow-up, scopes, variables, set-variable, or evaluate operations can use it with its owning runtime

#### Scenario: Reuse a reference after resume
- **WHEN** execution resumes and a caller reuses a frame id or variables reference from the prior stop
- **THEN** `agent-debug` does not forward the stale reference to an arbitrary runtime
- **AND** returns a structured stale-reference diagnostic instructing the caller to poll for the next stop and refresh stack, scopes, and variables

#### Scenario: Raw resume request invalidates references
- **WHEN** a raw or generated resume-like request is permitted through the mediated DAP path
- **THEN** it invalidates the same stop-scoped references as the corresponding first-class command

### Requirement: Parent-Routed Child Debugging
Child runtimes SHALL remain visible for diagnostics but normal debug operations SHALL be issued against the parent session. The parent SHALL route thread-scoped requests by live thread ownership, frame-scoped requests by recorded frame ownership, variable-scoped requests by reference ownership, and source requests by source-reference ownership, without rewriting DAP identifiers. When numeric identifiers are ambiguous, `--child-session-id` SHALL provide a legal discriminator and MUST name a child of the selected parent.

#### Scenario: Route a thread-scoped request
- **WHEN** a caller sends stack, continue, pause, next, step-in, step-out, or goto to the parent with a child-owned thread id
- **THEN** `agent-debug` forwards the request unchanged to the owning live child

#### Scenario: Route a reference-scoped request
- **WHEN** a caller sends scopes, variables, set-variable, evaluate, or source with a current child-owned reference
- **THEN** `agent-debug` forwards the request to the child that produced that reference

#### Scenario: Two children claim the same thread id
- **WHEN** more than one live child could own the requested thread id and stopped-state evidence does not uniquely identify one owner
- **THEN** `agent-debug` does not use registration order as a tie breaker
- **AND** returns a structured ambiguity error listing the matching child sessions

#### Scenario: Disambiguate a reused numeric identifier
- **WHEN** multiple children expose the same thread, frame, variable, or source-reference number
- **AND** the caller supplies one matching `--child-session-id`
- **THEN** the request is routed to that child
- **AND** a child id outside the selected parent is rejected

#### Scenario: A child runtime has ended
- **WHEN** a child emits exited or terminated
- **THEN** its threads and stop-scoped references are excluded from subsequent parent routing

### Requirement: Parent-Routed Breakpoints
For adapters with child runtimes, breakpoint operations SHALL be issued through the parent-facing operation. `agent-debug` SHALL preserve the latest breakpoint set per source for replay to current and future children, wait only a bounded time for child readiness, merge successful verification evidence, and return per-child `OperationWarning` entries in `meta.warnings` rather than hiding partial failures.

#### Scenario: A child appears after breakpoints were set
- **WHEN** a child runtime is created after the parent has accepted source breakpoints
- **THEN** `agent-debug` replays the latest replacement set for each source before the child completes configuration

#### Scenario: One child is not ready
- **WHEN** breakpoint fan-out reaches its child-readiness deadline
- **THEN** ready children still receive the request
- **AND** `meta.warnings` contains a `child_readiness_timeout` warning for each pending child

### Requirement: Structured Debug Operation Errors
Every handled debug-operation failure SHALL use a stable structured error with `code`, `category`, `message`, numeric exit code, diagnostics, and command metadata. When applicable it SHALL also include session id, DAP request command and sequence, adapter identity, process or log context, and machine-readable recovery data.

#### Scenario: Operation requires paused state
- **WHEN** stack, scopes, variables, or another paused-only operation is requested while the session is known to be running
- **THEN** `agent-debug` returns `thread_not_paused` in the DAP category
- **AND** the diagnostic instructs the caller to poll stopped events and does not suggest starting a new controller

#### Scenario: Adapter rejects an operation
- **WHEN** the adapter returns an unsuccessful response
- **THEN** `agent-debug` returns `dap_request_failed` with request and adapter context
- **AND** preserves useful response-body details in diagnostics

#### Scenario: A required child-owned target is unknown
- **WHEN** a thread, frame, variable reference, or source reference cannot be mapped through the parent
- **THEN** `agent-debug` returns a specific not-found or required code
- **AND** includes the requested value and currently available candidates in machine-readable data

#### Scenario: Session selection fails
- **WHEN** the requested session is missing or ambiguous
- **THEN** the failure uses a session-category code
- **AND** ambiguity diagnostics list matching session identifiers rather than choosing one
