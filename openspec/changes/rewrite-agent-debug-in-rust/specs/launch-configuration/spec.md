## ADDED Requirements

### Requirement: Symmetric Launch and Attach Commands
`agent-debug launch` and `agent-debug attach` SHALL expose the same launch-configuration option surface: `--adapter`, `--config`, `--workspace`, `--list-configs`, `--json`, `--name`, `--program`, `--cwd`, `--runtime-executable`, `--runtime-args`, `--url`, `--port`, `--python`, `--type`, `--args`, `--source-maps`, `--out-files`, `--resolve-source-maps`, `--json-overrides`, `--stop-on-entry`, and `--no-use`. There SHALL be no separate `--request` option and no public fake-adapter or adapter-script option.

#### Scenario: Compare command help
- **WHEN** a caller inspects `agent-debug launch --help` and `agent-debug attach --help`
- **THEN** both commands advertise the same launch-configuration options
- **AND** only the command verb and verb-specific descriptions differ

#### Scenario: Use a raw launch path
- **WHEN** a caller invokes `agent-debug launch` without `--config`
- **THEN** the effective DAP request is `launch`

#### Scenario: Use a raw attach path
- **WHEN** a caller invokes `agent-debug attach` without `--config`
- **THEN** the effective DAP request is `attach`

### Requirement: Adapter and Type Selection
`agent-debug` SHALL select adapters and DAP types deterministically. An explicit `--adapter` SHALL select the adapter even when `--type` is unknown or a named configuration has another type. For a named configuration without `--adapter`, its `type` SHALL select the adapter through the built-in or custom type map. Without a named configuration, an explicit `--type` SHALL select the mapped adapter, and otherwise `--program` SHALL infer both adapter and type by case-insensitive final extension.

The built-in type map SHALL be `node` and `pwa-node` to `js-debug`, `chrome` and `pwa-chrome` to `js-debug`, `python` and `debugpy` to `debugpy`, `go` to `delve`, and `lldb` to `codelldb`. The program map SHALL be `.py` to `debugpy`/`python`, `.go` to `delve`/`go`, `.js`, `.mjs`, `.cjs`, `.ts`, `.mts`, and `.cts` to `js-debug`/`pwa-node`, and `.html` and `.htm` to `js-debug`/`pwa-chrome`.

#### Scenario: Explicitly select both adapter and type
- **WHEN** a caller supplies both `--adapter <id>` and `--type <type>`
- **THEN** the selected adapter is `<id>`
- **AND** the effective configuration contains `<type>`
- **AND** no type-to-adapter lookup overrides the explicit adapter

#### Scenario: Override a named configuration's adapter
- **GIVEN** a named configuration maps to one adapter
- **WHEN** the caller supplies `--adapter <other-id>`
- **THEN** `agent-debug` uses `<other-id>`
- **AND** later configuration layers still determine the effective `type`

#### Scenario: Select an adapter from a named type
- **GIVEN** no explicit adapter was supplied
- **WHEN** a named configuration has a mapped string `type`
- **THEN** `agent-debug` selects the adapter mapped from that named type

#### Scenario: Reject a missing or unknown named type
- **GIVEN** no explicit adapter was supplied
- **WHEN** a selected named configuration lacks a string `type` or maps to no adapter
- **THEN** the command fails with `unknown_launch_type`

#### Scenario: Select an adapter from an explicit type
- **GIVEN** no named configuration and no explicit adapter were supplied
- **WHEN** the caller supplies a mapped `--type`
- **THEN** `agent-debug` selects the mapped adapter
- **AND** preserves the explicit type

#### Scenario: Infer from a program extension
- **GIVEN** no named configuration, adapter, or type was supplied
- **WHEN** `--program` ends in a supported extension
- **THEN** `agent-debug` infers the adapter and DAP type from the program map

#### Scenario: Reject an unsupported program extension
- **GIVEN** no named configuration, adapter, or type was supplied
- **WHEN** `--program` has an unsupported extension, including `.rs`
- **THEN** the command fails with `adapter_inference_failed`
- **AND** diagnostics instruct the caller to pass `--adapter` or `--type`

#### Scenario: Default a built-in adapter type
- **GIVEN** the caller supplies only `--adapter`
- **WHEN** the adapter is `js-debug`, `debugpy`, `delve`, or `codelldb`
- **THEN** the inferred type is respectively `pwa-node`, `python`, `go`, or `lldb`
- **AND** js-debug instead infers `pwa-chrome` when the program ends in `.html` or `.htm`

#### Scenario: Leave a custom adapter type unset
- **GIVEN** the caller supplies only a custom adapter ID
- **WHEN** no type can be inferred
- **THEN** `agent-debug` does not invent a DAP type

#### Scenario: Require a debuggable target
- **WHEN** `--config`, `--adapter`, `--type`, and `--program` are all absent
- **THEN** `agent-debug` fails with `adapter_inference_failed`
- **AND** diagnostics explain how to select a named configuration, adapter, type, or program

### Requirement: Shallow Configuration Precedence
The effective adapter configuration SHALL be assembled in this exact low-to-high precedence order: mode-specific adapter defaults, selected named configuration, `--json-overrides`, `--json`, and dedicated CLI flags. Each layer SHALL use shallow replacement: a value at a higher layer replaces the entire value at that key rather than recursively merging nested objects or concatenating arrays. The effective request mode SHALL then be enforced from the verb or named-config auto-routing rules.

#### Scenario: Resolve all precedence layers
- **GIVEN** the same key appears in every configuration layer
- **WHEN** the effective configuration is constructed
- **THEN** the dedicated CLI flag value wins over `--json`
- **AND** `--json` wins over `--json-overrides`
- **AND** `--json-overrides` wins over the named configuration
- **AND** the named configuration wins over adapter defaults

#### Scenario: Replace a nested object
- **GIVEN** a lower layer defines `env` with multiple entries
- **WHEN** a higher layer defines `env`
- **THEN** the higher layer's complete `env` object replaces the lower object
- **AND** keys are not deep-merged

#### Scenario: Select mode-specific defaults
- **GIVEN** a configured adapter has both `launchDefaults` and `attachDefaults`
- **WHEN** the effective request is `launch` or `attach`
- **THEN** only the defaults for that effective request are the first precedence layer

### Requirement: Named-Configuration Request Auto-Routing
Only a configuration selected by `--config <name>` SHALL be allowed to change the request selected by the command verb. A named `request: "launch"` or `request: "attach"` SHALL become authoritative; a missing or other request value SHALL leave the verb authoritative. Raw flag and JSON paths without `--config` SHALL remain verb-driven even when their JSON contains `request`.

#### Scenario: Route launch to attach
- **GIVEN** `--config AttachShaped` selects `request: "attach"`
- **WHEN** the caller invokes `agent-debug launch`
- **THEN** the session is started in attach mode
- **AND** success metadata identifies command `attach`
- **AND** the payload contains `autoRouted: { "code": "auto_routed_to", "from": "launch", "to": "attach", "configName": "AttachShaped" }`
- **AND** `meta.warnings` contains one `OperationWarning` with code `auto_routed_to`

#### Scenario: Route attach to launch
- **GIVEN** `--config LaunchShaped` selects `request: "launch"`
- **WHEN** the caller invokes `agent-debug attach`
- **THEN** the session is started in launch mode
- **AND** the payload reports the corresponding `autoRouted` object
- **AND** `meta.warnings` contains the corresponding `auto_routed_to` warning

#### Scenario: Avoid a redundant warning
- **WHEN** a named configuration's request agrees with the command verb
- **THEN** no `autoRouted` field or auto-routing warning is emitted

#### Scenario: Fall back for an omitted request
- **WHEN** a selected named configuration has no `request`
- **THEN** the command verb determines the request
- **AND** no auto-routing warning is emitted

#### Scenario: Keep raw JSON verb-driven
- **GIVEN** no `--config` is supplied
- **WHEN** `--json`, `--json-overrides`, or flags contain a conflicting `request`
- **THEN** the command verb remains the effective request
- **AND** no auto-routing warning is emitted

### Requirement: Bounded JSONC Launch Documents
`agent-debug` SHALL load `.vscode/launch.json` from the resolved workspace as UTF-8 JSONC. It SHALL accept one leading UTF-8 BOM, line and block comments, and trailing commas. It SHALL reject a file larger than 256 KiB, invalid JSONC, more than 100 configurations, or more than 100 compounds with `invalid_launch_json`. A missing file SHALL represent an empty document.

Each configuration SHALL be an object with non-empty string `name` and `type` fields and an optional non-empty string `request`. Each compound SHALL have a non-empty string `name`, a non-empty array of non-empty configuration names, and an optional Boolean `stopAll`.

#### Scenario: Load common VS Code JSONC
- **WHEN** `launch.json` begins with a BOM and contains comments and trailing commas
- **THEN** `agent-debug` parses its configurations and compounds

#### Scenario: Treat a missing file as empty
- **WHEN** the workspace has no `.vscode/launch.json`
- **THEN** configuration and compound lists are empty

#### Scenario: Reject an oversized document
- **WHEN** `.vscode/launch.json` is larger than 256 KiB
- **THEN** loading fails with `invalid_launch_json`

#### Scenario: Reject an invalid workspace path
- **WHEN** the launch document cannot be addressed because the workspace is not a readable directory
- **THEN** loading fails with `invalid_workspace`
- **AND** structured data identifies the resolved workspace and filesystem error when available

### Requirement: Launch Variable Resolution
After selecting a named configuration, `agent-debug` SHALL recursively substitute variables in strings contained in arrays and objects. It SHALL support `${workspaceFolder}`, `${workspaceFolderBasename}`, `${userHome}`, `${execPath}`, and `${env:NAME}`. Missing environment variables and unknown variables SHALL fail with `unresolved_launch_variable`; `${input:...}` and `${command:...}` SHALL fail with `unsupported_launch_variable`. Errors SHALL identify the token and JSON path.

#### Scenario: Resolve supported variables recursively
- **WHEN** a named configuration uses supported variables in nested objects and arrays
- **THEN** every occurrence is replaced with the resolved workspace, basename, user home, current `agent-debug` executable path, or environment value

#### Scenario: Reject a missing environment value
- **WHEN** `${env:NAME}` is used and `NAME` is unset
- **THEN** resolution fails with `unresolved_launch_variable`
- **AND** error data identifies `NAME`, the token, and its JSON path

#### Scenario: Reject an interactive VS Code variable
- **WHEN** a configuration contains `${input:...}` or `${command:...}`
- **THEN** resolution fails with `unsupported_launch_variable`
- **AND** no command or interactive input provider is executed

### Requirement: Platform Overlays
Named configurations SHALL support `osx`, `mac`, `linux`, and `windows` overlay objects. On macOS, `osx` SHALL be deep-merged first and `mac` second; on Linux, `linux` SHALL be merged; on Windows, `windows` SHALL be merged. Overlay objects SHALL recursively merge plain objects and replace all other values. All platform keys SHALL be removed from the adapter-bound configuration.

#### Scenario: Apply macOS aliases in order
- **GIVEN** a configuration contains both `osx` and `mac`
- **WHEN** it is resolved on macOS
- **THEN** base values are overlaid by `osx` and then by `mac`

#### Scenario: Remove nonmatching overlays
- **WHEN** a named configuration is resolved on any platform
- **THEN** no `osx`, `mac`, `linux`, or `windows` key is sent to the adapter

### Requirement: VS Code-Only Fields Are Omitted
`agent-debug` SHALL preserve adapter-native fields but SHALL omit the VS Code-only fields `presentation`, `internalConsoleOptions`, `serverReadyAction`, `preLaunchTask`, and `postDebugTask` before sending a configuration to an adapter. It SHALL NOT execute VS Code tasks or UI actions represented by those fields.

#### Scenario: Resolve a configuration with VS Code UI and task fields
- **WHEN** a selected configuration contains any omitted field
- **THEN** the field is absent from the adapter-bound configuration
- **AND** other adapter-native fields remain present

### Requirement: Source-Map Options and Defaults
The `--source-maps <boolean>`, `--out-files <pattern...>`, and `--resolve-source-maps <pattern...>` flags SHALL map respectively to `sourceMaps`, `outFiles`, and `resolveSourceMapLocations` and SHALL participate as the highest configuration layer. For js-debug types in a workspace containing `tsconfig.json`, absent values SHALL default to `sourceMaps: true` and absolute workspace patterns for `dist/**/*.js`, `out/**/*.js`, and `build/**/*.js`. Explicit values from any higher-precedence source SHALL be preserved.

#### Scenario: Apply TypeScript workspace defaults
- **GIVEN** the workspace contains `tsconfig.json`
- **AND** a js-debug configuration omits source-map settings
- **WHEN** the configuration is resolved
- **THEN** `sourceMaps` is `true`
- **AND** `outFiles` contains the workspace's `dist`, `out`, and `build` JavaScript trees

#### Scenario: Preserve explicit source-map values
- **WHEN** configuration layers explicitly set `sourceMaps`, `outFiles`, or `resolveSourceMapLocations`
- **THEN** defaults do not replace those values

#### Scenario: Override source maps with flags
- **WHEN** the caller supplies source-map flags
- **THEN** their values replace lower-precedence source-map values

### Requirement: Configuration Listing Shape
`--list-configs` SHALL read the workspace launch document without starting the controller or an adapter. Structured output data SHALL be one array with configurations first in document order and compounds second in document order. Configuration entries SHALL have `{ "kind": "configuration", "name": string, "type": string, "request"?: string }`. Compound entries SHALL have `{ "kind": "compound", "name": string, "configurations": string[], "stopAll"?: boolean }`. Success metadata SHALL identify command `launch configs`.

#### Scenario: List a mixed launch document
- **WHEN** the caller passes `--list-configs`
- **THEN** the data array contains the exact summary fields for every configuration and compound
- **AND** no session is created

#### Scenario: List an empty workspace
- **WHEN** the workspace has no launch document
- **THEN** the data array is empty

### Requirement: Named Entry Errors
Configuration and compound names SHALL be matched exactly. A missing name SHALL fail with `launch_config_not_found`. A document containing both a configuration and compound with the selected name SHALL fail with `launch_config_ambiguous` and SHALL report both matches.

#### Scenario: Select a missing name
- **WHEN** `--config <name>` matches no configuration or compound
- **THEN** the command fails with `launch_config_not_found`
- **AND** error data identifies the workspace and name

#### Scenario: Select an ambiguous name
- **WHEN** a configuration and compound share the selected name
- **THEN** the command fails with `launch_config_ambiguous`
- **AND** error data includes summaries of both matches

### Requirement: Compound Startup and Lifecycle
Before contacting the controller, `agent-debug` SHALL verify that every compound member names an existing configuration and SHALL resolve every member independently, including platform variables, adapter selection, configuration precedence, and request auto-routing. Member session names SHALL be `<compound-name>/<configuration-name>`. `stopAll` SHALL default to `true`.

Members SHALL start in document order. If a later member fails, `agent-debug` SHALL terminate and remove every already-started member in reverse startup order, remove the failed member's partial session, and fail with `compound_member_start_failed` whose data contains `compoundName`, `memberName`, and the successfully `startedMembers`. No compound member SHALL remain listed after rollback.

#### Scenario: Reject a missing compound member before IPC
- **WHEN** a compound references a configuration that does not exist
- **THEN** the command fails with `compound_member_not_found`
- **AND** error data contains `workspaceFolder`, `compoundName`, and `memberName`
- **AND** no compound start request reaches the controller

#### Scenario: Start a compound
- **WHEN** every compound member resolves and starts successfully
- **THEN** member sessions are named `<compound-name>/<member-name>`
- **AND** each member records the compound name, member name, complete member-name list, compound ID, and effective `stopAll`

#### Scenario: Auto-route compound members
- **WHEN** compound members declare different `request` values
- **THEN** each member independently uses its named request
- **AND** a member without `request` uses the invoking command verb

#### Scenario: Roll back a partial compound
- **GIVEN** one or more members started successfully
- **WHEN** a later member fails to start
- **THEN** all started and partial member sessions are terminated and removed
- **AND** the command fails with `compound_member_start_failed`
- **AND** no member of the failed compound remains listed

#### Scenario: Close a stop-all compound member
- **GIVEN** `stopAll` is omitted or `true`
- **WHEN** any member is closed
- **THEN** every member in the same compound is terminated and removed

#### Scenario: Close an independent compound member
- **GIVEN** `stopAll` is `false`
- **WHEN** one member is closed
- **THEN** only that member is terminated and removed
- **AND** peer members remain available
