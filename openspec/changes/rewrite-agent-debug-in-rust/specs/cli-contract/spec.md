## ADDED Requirements

### Requirement: Public CLI identity and configuration namespace
The shipped executable and every user-facing command, path, diagnostic, example, package reference, and recovery hint MUST use the public name `agent-debug`. The system MUST NOT install, advertise, or accept a `dap-cli` executable alias. The default application home MUST be `~/.agent-debug`, `AGENT_DEBUG_HOME` MUST override that home, and all public product environment variables MUST use the `AGENT_DEBUG_` prefix.

#### Scenario: Invoke the renamed executable
- **WHEN** a user invokes `agent-debug --version`
- **THEN** the command SHALL report the installed version successfully
- **AND** the installation SHALL require no `dap-cli` alias

#### Scenario: Override the application home
- **WHEN** `AGENT_DEBUG_HOME` is set to an absolute path
- **THEN** state, logs, adapter caches, controller discovery, and session persistence SHALL be rooted under that path instead of `~/.agent-debug`

### Requirement: Exact public command tree
The public command tree MUST consist of the commands and options below, in addition to the standard per-command `-h, --help` option. No additional public aliases or legacy commands SHALL be exposed.

- Global options: `-V, --version`; `--human`; `--no-human`; `-y, --yes`.
- Controller lifecycle: `start`; `status [--name <name>]`; `stop [--name <name>]`; `stop-controller`.
- Sessions: `sessions [--show-children] [--all]`; `use <name>`; `detach [--name <name>]`; `close [name] [--name <name>]`; `cleanup [--purge] [--force]`.
- Launch and attach: `launch` and `attach`, each with `--adapter <adapter>`, `--config <name>`, `--workspace <path>`, `--list-configs`, `--json <json>`, `--name <name>`, `--program <path>`, `--cwd <path>`, `--runtime-executable <path>`, `--runtime-args <arg...>`, `--url <url>`, `--port <port>`, `--python <path>`, `--type <type>`, `--args <arg...>`, `--source-maps <boolean>`, `--out-files <pattern...>`, `--resolve-source-maps <pattern...>`, `--json-overrides <json>`, `--stop-on-entry`, and `--no-use`.
- Breakpoints: `breakpoints set --source <path> --line <number...> [--name <name>] [--condition <expr>] [--hit-condition <expr>] [--log-message <text>]`; `breakpoints list [--source <path>] [--name <name>]`; `breakpoints clear [--source <path>] [--name <name>]`.
- Paused-state inspection: `threads [--child-session-id <id>] [--name <name>]`; `stack [--thread-id <number>] [--child-session-id <id>] [--start-frame <number>] [--levels <number>] [--name <name>]`; `scopes --frame-id <number> [--child-session-id <id>] [--name <name>]`; `variables --variables-reference <number> [--child-session-id <id>] [--name <name>]`; `source --source-reference <number> [--path <path>] [--child-session-id <id>] [--name <name>]`; `evaluate --expression <expr> [--frame-id <number>] [--context <context>] [--child-session-id <id>] [--name <name>]`.
- Execution control: `continue [--thread-id <number>] [--child-session-id <id>] [--single-thread] [--name <name>]`; `pause [--thread-id <number>] [--child-session-id <id>] [--name <name>]`; `next [--thread-id <number>] [--child-session-id <id>] [--single-thread] [--name <name>]`; `step-in [--thread-id <number>] [--child-session-id <id>] [--single-thread] [--target-id <number>] [--name <name>]`; `step-out [--thread-id <number>] [--child-session-id <id>] [--single-thread] [--name <name>]`.
- DAP escape hatches: `request <command> [--json <json>] [--child-session-id <id>] [--name <name>]`; `capabilities [--child-session-id <id>] [--name <name>]`; `events [--name <name>] [--child-session-id <id>] [--after-cursor <cursor>] [--limit <count>] [--include <names>] [--exclude <names>]`.
- Generated DAP commands: `dap <command> [--json <json>] [--child-session-id <id>] [--name <name>]`, where `<command>` is generated from every client-to-adapter request in the repository's authoritative official DAP schema snapshot. The initial snapshot MUST provide at least `attach`, `breakpoint-locations`, `cancel`, `completions`, `configuration-done`, `continue`, `data-breakpoint-info`, `disassemble`, `disconnect`, `evaluate`, `exception-info`, `goto`, `goto-targets`, `initialize`, `launch`, `loaded-sources`, `locations`, `modules`, `next`, `pause`, `read-memory`, `restart`, `restart-frame`, `reverse-continue`, `scopes`, `set-breakpoints`, `set-data-breakpoints`, `set-exception-breakpoints`, `set-expression`, `set-function-breakpoints`, `set-instruction-breakpoints`, `set-variable`, `source`, `stack-trace`, `step-back`, `step-in`, `step-in-targets`, `step-out`, `terminate`, `terminate-threads`, `threads`, `variables`, and `write-memory`. Additional generated commands introduced by a reviewed schema refresh are allowed; additional hand-written aliases are not.
- Adapters: `setup-adapters [--adapter <id>]`, where `<id>` is one of `js-debug`, `debugpy`, `delve`, or `codelldb`.
- Help: `help [command...]`.

`--json` on launch, attach, request, and generated DAP commands MUST parse request payload JSON and MUST NOT select the CLI output format. `--force` on cleanup MUST be an alias for `--purge`, and `--all` on sessions MUST be an alias for `--show-children`. If both the positional close target and `--name` are supplied with different values, the command MUST fail as usage error.

#### Scenario: Parse a representative nested command
- **WHEN** a user invokes `agent-debug breakpoints set --source app.rs --line 10 20 --condition 'x > 0'`
- **THEN** the CLI SHALL parse both line values as the variadic `--line` option and dispatch the `breakpoints set` command

#### Scenario: Reject an unknown public alias
- **WHEN** a user invokes the executable as `dap-cli` or invokes an undeclared legacy subcommand
- **THEN** the system SHALL NOT provide a compatibility path

### Requirement: Grouped and drill-down help
Root help MUST group top-level commands under the headings `Controller lifecycle`, `Sessions`, `Launch & attach`, `Breakpoints`, `Paused-state inspection`, `Execution control`, `DAP protocol escape hatches`, and `Adapters`. The hidden controller-serving entrypoint MUST NOT appear in public help. `agent-debug help [command...]` MUST accept a variadic command path and display help for the exact nested target, including paths such as `agent-debug help breakpoints set` and `agent-debug help dap read-memory`.

#### Scenario: Display grouped root help
- **WHEN** a user invokes `agent-debug help` or `agent-debug --help`
- **THEN** stdout SHALL contain each required group heading and its assigned commands
- **AND** no JSON envelope or hidden controller-serving command SHALL be emitted

#### Scenario: Drill into nested help
- **WHEN** a user invokes `agent-debug help breakpoints set`
- **THEN** stdout SHALL describe `agent-debug breakpoints set` and its `--source` and variadic `--line` options

#### Scenario: Reject an unknown drill-down segment
- **WHEN** a user invokes `agent-debug help breakpoints unknown`
- **THEN** the CLI SHALL show the nearest valid parent help and return a structured usage failure identifying the unknown segment

### Requirement: Machine-readable output is the default
Commands that return operational results MUST emit JSON by default even when stdout is a TTY. Human output MUST be selected only by explicit `--human` or, when stdout is a TTY and no CLI override is present, by a truthy `AGENT_DEBUG_HUMAN` value. `--no-human` MUST force JSON and override both TTY state and `AGENT_DEBUG_HUMAN`.

Truthy `AGENT_DEBUG_HUMAN` values MUST be `1`, `true`, `yes`, `on`, and `human`, case-insensitively after trimming. False values MUST be `0`, `false`, `no`, `off`, and `json`; a missing or blank value MUST mean JSON.

#### Scenario: Default on a TTY
- **WHEN** stdout is a TTY and neither `--human` nor a truthy `AGENT_DEBUG_HUMAN` is present
- **THEN** the command SHALL emit JSON rather than human-formatted text

#### Scenario: Environment selects human output on a TTY
- **WHEN** stdout is a TTY, no CLI output override is present, and `AGENT_DEBUG_HUMAN=yes`
- **THEN** the command SHALL emit human-readable output

#### Scenario: Explicit JSON override wins
- **WHEN** `--no-human` is supplied while `AGENT_DEBUG_HUMAN=1`
- **THEN** the command SHALL emit JSON

### Requirement: Non-TTY output ignores the human-output environment
When stdout is not a TTY, the CLI MUST emit JSON unless `--human` is explicitly supplied. In this case the CLI MUST NOT parse or validate `AGENT_DEBUG_HUMAN`, so inherited truthy or invalid values cannot corrupt an agent pipeline.

#### Scenario: Truthy environment on a pipe
- **WHEN** stdout is not a TTY and `AGENT_DEBUG_HUMAN=1` is inherited without `--human`
- **THEN** the command SHALL emit JSON

#### Scenario: Invalid environment on a pipe
- **WHEN** stdout is not a TTY and `AGENT_DEBUG_HUMAN=maybe`
- **THEN** the command SHALL ignore that value and continue in JSON mode

#### Scenario: Explicit human output on a pipe
- **WHEN** stdout is not a TTY and `--human` is supplied
- **THEN** the command SHALL emit human-readable output

### Requirement: JSON success envelope
A successful operational command in JSON mode MUST write exactly one compact JSON object followed by exactly one newline to stdout, with no other stdout text. Stderr MUST be empty except for an interactive prompt transcript that completed before the result was written. The object MUST have the shape `{"ok":true,"data":<command-result>,"meta":{"schemaVersion":1,"command":<command-label>,"timestamp":<RFC3339-UTC>,"warnings"?:OperationWarning[]}}`. `meta.warnings` MUST be omitted when empty, and every non-fatal product warning MUST be accumulated there instead of being printed separately or embedded in command data.

#### Scenario: Successful JSON command
- **WHEN** `agent-debug stop-controller` succeeds in JSON mode
- **THEN** stdout SHALL contain one newline-terminated success envelope
- **AND** stderr SHALL be empty

### Requirement: JSON error envelope
A handled failure in JSON mode MUST write exactly one compact JSON object followed by exactly one newline to stdout and MUST leave stderr empty except for an interactive prompt already in progress. The object MUST have the shape `{"ok":false,"error":{"code":<stable-code>,"category":<category>,"message":<safe-message>,"exitCode":<number>,"diagnostics":[...],"sessionId"?:...,"request"?:{"command":...,"seq"?:...},"adapter"?:{"descriptorId"?:...,"pid"?:...,"stderrTail"?:[...],"logPath"?:...},"data"?:{...}},"meta":{"schemaVersion":1,"command":<command-label>,"timestamp":<RFC3339-UTC>,"warnings"?:OperationWarning[]}}`. Optional fields MUST be omitted when unavailable. Internal failures MUST NOT expose stack traces or unstructured implementation details.

#### Scenario: Controller is unavailable
- **WHEN** a controller-dependent command is invoked without a running controller
- **THEN** stdout SHALL contain one failure envelope with category `controller`, exit code `3`, and actionable diagnostics
- **AND** stderr SHALL be empty

#### Scenario: Unexpected internal error
- **WHEN** an unexpected implementation error reaches the CLI boundary
- **THEN** the CLI SHALL return code `70` with a safe `internal` error envelope that omits stack traces

### Requirement: Exit-code taxonomy
The process MUST use exactly these public exit codes: `0` success or help/version; `2` usage, validation, invalid environment, or declined/required consent; `3` controller discovery, connection, protocol, or build mismatch; `4` session selection, lifecycle, or targetability; `5` DAP request, capability, or protocol failure; `6` adapter resolution, provisioning, startup, transport, or integrity failure; `7` bounded operation timeout; and `70` unexpected internal failure.

#### Scenario: Unknown option
- **WHEN** a user supplies an unknown option
- **THEN** the CLI SHALL exit `2` and identify a usage error

#### Scenario: DAP request fails
- **WHEN** an adapter returns a failed DAP response to a valid request
- **THEN** the CLI SHALL exit `5` and preserve DAP request context in the error envelope

### Requirement: Stable Public Result Schemas
Public result data SHALL use camelCase agent-debug fields. Optional agent-debug fields SHALL be omitted rather than set to `null`; official DAP response bodies SHALL retain their official DAP field names and nullability. Array ordering SHALL be stable as defined below. The initial `schemaVersion` SHALL be `1`, and a breaking result-shape change SHALL require a new schema version.

The following public data shapes are normative:

```text
ControllerEndpoint =
  { kind: "ipc", path: string }

ControllerStart =
  { started: boolean, reused: boolean, pid: number, endpoint: ControllerEndpoint,
    stateDir: string, logDir: string, buildId: string }

ControllerStatus =
  { kind: "controller", pid: number, endpoint: ControllerEndpoint, stateDir: string,
    logDir: string, uptimeMs: number, sessionCount: number, buildId: string }

Compound =
  { id: string, name: string, memberName: string, stopAll: boolean, members: string[] }

OperationWarning =
  { code: string, message: string, diagnostics?: string[],
    sessionId?: string, childSessionId?: string, data?: object }

SessionSummary =
  { kind: "session", id: string, name: string, adapter: string, lifecycle: string,
    status: "running"|"stopped"|"terminated"|"unavailable"|"failed",
    updatedAt: string, parentSessionId?: string, targetable?: false,
    compound?: Compound, paused?: boolean, stoppedReason?: string,
    stoppedThreadIds?: number[] }

SessionStatus =
  SessionSummary & { logPath?: string, stderrTail: string[], cleanupActions: string[] }

DapStart =
  { sessionId: string, name: string, adapter: string, lifecycle: string,
    status: string, capabilities: object, eventCursor: number,
    autoRouted?: { code: "auto_routed_to", from: "launch"|"attach",
      to: "launch"|"attach", configName: string } }

CompoundStart =
  { compoundId: string, name: string, stopAll: boolean, members: DapStart[] }

Cleanup =
  { signaledAdapter: string[], removedRecords: string[],
    keptRunning: { sessionId: string, reason: string }[],
    failed: { sessionId: string, logPath?: string, stderrTail: string[],
      actions: string[], message: string }[],
    orphanPids: number[] }

CachedEvent =
  { cursor: number, receivedAt: string, sessionId: string, dapSeq: number,
    event: string, body?: unknown, summary: string, childSessionId?: string,
    bodyTruncated?: { originalBytes: number } }

Events =
  { sessionId: string, name: string, events: CachedEvent[], cursor: number,
    droppedBeforeCursor?: number, capacity: number,
    capacityByPriority: { high: number, low: number },
    truncatedToCapacity?: number }

VerificationDiagnostic =
  { unverifiedCount: number, totalCount: number, loadedSourcesCount: number,
    matchingLoadedSources: { path: string, name?: string }[],
    childSessionCount: number, hint: string, recipe: string }

TrackedBreakpointSource =
  { source: { path: string, name?: string },
    requested: DAP.SourceBreakpoint[], breakpoints: DAP.Breakpoint[] }

BreakpointsList = { sources: TrackedBreakpointSource[] }

BreakpointsClear =
  { cleared: { source: { path: string, name?: string },
      breakpoints: DAP.Breakpoint[] }[] }
```

Command-specific rules:

- `status` returns `SessionStatus` when a session is selected and `ControllerStatus` only for the documented fallback.
- `sessions` returns `SessionSummary[]` in persisted creation order.
- `use`, `stop`, and `detach` return `SessionStatus`.
- `close` returns `SessionStatus` plus `orphanPids`; any orphan warning is in `meta.warnings`.
- `stop-controller` returns `{ stopped: boolean }`.
- `launch` and `attach` return `DapStart`; compounds return `CompoundStart`.
- `launch --list-configs` returns the ordered launch-entry array defined by `launch-configuration`.
- `events` returns `Events`.
- `breakpoints set` returns the official DAP `setBreakpoints` response body plus optional `verificationDiagnostic: VerificationDiagnostic`; list returns `BreakpointsList`; clear returns `BreakpointsClear`; verification warnings use `meta.warnings`.
- `threads`, `stack`, `scopes`, and `variables` return their official DAP response bodies with each returned item annotated by `childSessionId` when parent-routed.
- `source`, `evaluate`, execution-control, raw, and generated commands return the official DAP response body plus top-level `childSessionId` when parent-routed.
- `capabilities` returns `{ sessionId, name, adapter, childSessionId?, capabilities }`.
- `setup-adapters` returns the shape defined by `adapter-management`.

#### Scenario: Distinguish controller and session status
- **WHEN** a caller parses `status` data
- **THEN** `kind` is `controller` or `session`
- **AND** the caller does not infer the variant from missing fields

#### Scenario: Parent-routed DAP response
- **WHEN** a DAP operation is routed to a child
- **THEN** the result identifies `childSessionId`
- **AND** the official DAP response fields remain unchanged

#### Scenario: Optional field is unavailable
- **WHEN** an optional agent-debug field has no value
- **THEN** the field is omitted rather than emitted as `null`

### Requirement: Stable Error Code Registry
Handled errors SHALL use the following initial stable registry. New codes require a specification update; adapter-provided messages SHALL NOT become ad hoc public codes.

- Usage/exit `2`: `usage_error`, `invalid_output_mode_env`, `invalid_json`, `invalid_dap_arguments`, `invalid_config`, `invalid_workspace`, `invalid_launch_json`, `launch_config_not_found`, `launch_config_ambiguous`, `compound_member_not_found`, `unresolved_launch_variable`, `unsupported_launch_variable`, `unknown_launch_type`, `adapter_inference_failed`, `codelldb_cargo_config_unsupported`, `provision_consent_required`, `provision_consent_declined`.
- Controller/exit `3`: `controller_unavailable`, `controller_start_failed`, `controller_build_mismatch`, `controller_protocol_mismatch`, `controller_unauthorized`, `controller_request_too_large`.
- Session/exit `4`: `no_sessions`, `no_active_session`, `session_not_found`, `session_ambiguous`, `session_unavailable`, `session_name_in_use`, `child_session_not_targetable`, `parent_not_found`, `compound_member_start_failed`.
- DAP/exit `5`: `dap_request_failed`, `dap_request_unsupported`, `dap_lifecycle_managed`, `dap_transport_closed`, `dap_message_too_large`, `thread_id_required`, `thread_not_paused`, `stale_dap_reference`, `evaluate_requires_exec`.
- Adapter/exit `6`: `adapter_not_found`, `adapter_start_failed`, `js_debug_node_missing`, `js_debug_node_incompatible`, `delve_go_version_incompatible`, `provision_network_error`, `provision_proxy_error`, `provision_rate_limited`, `provision_checksum_mismatch`, `provision_python3_missing`, `provision_python3_venv_unavailable`, `provision_pip_install_failed`, `provision_arch_unsupported`, `provision_cache_unwritable`, `provision_extract_failed`, `provision_setup_failed`.
- Timeout/exit `7`: `controller_start_timeout`, `controller_request_timeout`, `dap_request_timeout`, `dap_handshake_timeout`, `provision_lock_timeout`.
- Internal/exit `70`: `internal_error`.

#### Scenario: Known handled failure
- **WHEN** a handled failure crosses the CLI boundary
- **THEN** its code and category come from the stable registry
- **AND** its exit code matches the category mapping

#### Scenario: Unclassified implementation failure
- **WHEN** an error has no registered public mapping
- **THEN** it is rendered as `internal_error`
- **AND** internal type names and stack traces are not exposed

### Requirement: Prompt and consent behavior
All interactive prompts and their explanatory details MUST be written to stderr, never stdout. `-y, --yes` MUST pre-consent to every provisioning prompt for the invocation, and truthy `AGENT_DEBUG_ASSUME_YES` values `1` and `true` MUST provide the same behavior. If consent is required and stdin is not a TTY, the command MUST fail with exit `2` and instruct the caller to use `--yes` or `AGENT_DEBUG_ASSUME_YES=1`. A declined prompt MUST fail with exit `2`.

#### Scenario: Pre-consent from the CLI
- **WHEN** adapter provisioning is required and the user supplies `--yes`
- **THEN** the CLI SHALL proceed without reading an interactive answer

#### Scenario: Prompt cannot run non-interactively
- **WHEN** adapter provisioning requires consent, `--yes` and `AGENT_DEBUG_ASSUME_YES` are absent, and stdin is not a TTY
- **THEN** the CLI SHALL return a structured usage failure without contaminating stdout with prompt text

### Requirement: Human output is terminal-safe
Human-mode results and failures MUST be deterministic, omit JSON envelope metadata such as command and timestamp, and sanitize untrusted strings before terminal rendering. The sanitizer MUST preserve printable Unicode, tabs, and line feeds; convert carriage returns to line feeds; and replace ESC, C0/C1 control characters other than tab/newline, and other terminal-control bytes with a visible safe replacement. Human-mode warnings and prompts MUST go to stderr. ANSI styling MUST honor `NO_COLOR`.

#### Scenario: Adapter text contains terminal controls
- **WHEN** adapter, debuggee, path, variable, or diagnostic text contains escape sequences or unsafe control characters
- **THEN** human output SHALL render sanitized text that cannot execute terminal control sequences

#### Scenario: Disable color
- **WHEN** `NO_COLOR` is present in human mode
- **THEN** the CLI SHALL emit no ANSI styling sequences
