## ADDED Requirements

### Requirement: Pinned Isolated debugpy Provisioning
The built-in Python adapter SHALL use debugpy `1.8.20`. When no usable adapter is available, `agent-debug` SHALL lazily provision an approved hash-locked wheel for that exact version into an isolated virtual environment under `~/.agent-debug/adapters/debugpy/venv` after obtaining provisioning consent. It SHALL NOT build or install a source distribution.

#### Scenario: Provision debugpy on first use
- **GIVEN** debugpy is not available from a usable configured interpreter or completed cache
- **WHEN** a Python launch or attach requires the built-in adapter
- **THEN** `agent-debug` creates an isolated virtual environment
- **AND** installs exactly an approved hash-locked `debugpy==1.8.20` wheel with no dependency resolution
- **AND** starts the adapter as that environment's Python module `debugpy.adapter`

#### Scenario: Reuse a completed cache
- **GIVEN** the isolated debugpy `1.8.20` environment and versioned consent marker are complete
- **WHEN** another Python session starts
- **THEN** `agent-debug` reuses the cached environment without reinstalling it

### Requirement: Python Provisioning Interpreter Override
The environment variable `AGENT_DEBUG_PROVISION_PYTHON3` SHALL override the Python executable used to create the isolated debugpy virtual environment. The renamed product SHALL NOT inspect legacy `~/.dap-cli/venv` paths or `DAP_CLI_*` override variables.

#### Scenario: Use an explicit provisioning interpreter
- **GIVEN** `AGENT_DEBUG_PROVISION_PYTHON3` names an executable Python interpreter
- **WHEN** debugpy provisioning begins
- **THEN** that interpreter is used to create the virtual environment

#### Scenario: Ignore legacy state
- **GIVEN** debugpy exists only under a legacy `~/.dap-cli/venv` path
- **WHEN** `agent-debug` resolves its built-in Python adapter
- **THEN** it does not use that legacy environment
- **AND** resolves or provisions debugpy through `agent-debug` state and configuration

### Requirement: Python Launch and Attach
`agent-debug` SHALL support debugpy launch and attach requests, including program-based launch and local process or endpoint attach configurations accepted by debugpy, while preserving the caller's request verb and structured adapter arguments.

#### Scenario: Launch a Python program
- **WHEN** the caller launches a `.py` program with the built-in Python adapter
- **THEN** `agent-debug` starts debugpy and sends a DAP `launch` request for that program

#### Scenario: Attach with debugpy arguments
- **WHEN** the caller invokes attach with a valid local debugpy attach configuration
- **THEN** `agent-debug` starts debugpy and sends a DAP `attach` request containing the supplied attach arguments

### Requirement: Python Statement Evaluation Auto-Wrap
For debugpy sessions, `agent-debug` SHALL distinguish expression-shaped evaluation input from statement-shaped input. It SHALL forward expressions unchanged and SHALL encode statement-shaped input as `exec(<JSON-string-literal>)` before sending the DAP `evaluate` request.

#### Scenario: Evaluate an expression
- **GIVEN** a debugpy session
- **WHEN** the caller evaluates `1 + 1`
- **THEN** the adapter receives `1 + 1` unchanged

#### Scenario: Evaluate statements
- **GIVEN** a debugpy session
- **WHEN** the caller evaluates an import, assignment, statement keyword, semicolon-separated statements, or multiline statements
- **THEN** the adapter receives an `exec(...)` expression containing the exact original input

#### Scenario: Do not rewrite another adapter
- **GIVEN** the active adapter is not debugpy
- **WHEN** the caller evaluates statement-shaped text
- **THEN** `agent-debug` forwards the text unchanged

### Requirement: Evaluation Auto-Wrap Opt-Out
The raw DAP request context value `no-auto-wrap` SHALL disable Python statement auto-wrapping for that request and SHALL be removed before the request is forwarded to debugpy.

#### Scenario: Force raw debugpy evaluation
- **GIVEN** a debugpy evaluate request contains statement-shaped input
- **AND** its request arguments contain `context: "no-auto-wrap"`
- **WHEN** `agent-debug` forwards the request
- **THEN** the expression is not wrapped
- **AND** the private `no-auto-wrap` token is not sent to debugpy

### Requirement: evaluate_requires_exec Recovery
When auto-wrap was applicable and debugpy rejects evaluation with a syntax error, `agent-debug` SHALL return a structured `evaluate_requires_exec` error containing an exact retry expression and the original caller input.

#### Scenario: Recover from a missed statement
- **GIVEN** debugpy rejects an evaluation with `SyntaxError` or `invalid syntax`
- **AND** the input was eligible for Python statement handling
- **WHEN** `agent-debug` reports the failure
- **THEN** `error.code` is `evaluate_requires_exec`
- **AND** `error.data.exec_form` contains the exact `exec(...)` retry expression
- **AND** `error.data.original_expression` equals the caller's original input

#### Scenario: Preserve opt-out context on failure
- **GIVEN** the caller used `context: "no-auto-wrap"`
- **WHEN** debugpy rejects the raw expression
- **THEN** `error.data.original_expression` remains the unmodified caller input
