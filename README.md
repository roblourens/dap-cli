# dap-cli

A Debug Adapter Protocol CLI for agents. Control debug sessions from shell commands and inspect paused application state without writing debugger-specific glue.

## Installation

From this repository:

```bash
npm install
npm run build
```

For package consumers, the CLI binary is `dap-cli` after installation.

## Quick Start

Start the controller, launch a Node.js target with `--stop-on-entry` (so the program halts before any user code runs), set a breakpoint, continue, inspect the stop, then clean up.

```bash
dap-cli start
dap-cli launch --adapter js-debug --type node --program tests/fixtures/simple-node-app/index.js --args run --stop-on-entry --name demo
# Equivalent — adapter and type are inferred from the .js extension:
dap-cli launch --program tests/fixtures/simple-node-app/index.js --args run --stop-on-entry --name demo
dap-cli breakpoints set --source tests/fixtures/simple-node-app/index.js --line 9 --name demo
dap-cli continue --thread-id 1 --name demo
dap-cli status --name demo
dap-cli events --name demo --limit 10
dap-cli threads --name demo
dap-cli stack --thread-id 1 --name demo
dap-cli continue --thread-id 1 --name demo
dap-cli cleanup
```

`--stop-on-entry` is the agent-friendly pattern: it eliminates the race where short-lived programs exit before `breakpoints set` lands. If you'd rather explore against a long-running program, use `tests/fixtures/simple-node-app/long-running.js` (loops on `setInterval`).

Python follows the same loop with the `debugpy` adapter:

```bash
dap-cli start
dap-cli launch --adapter debugpy --type python --program tests/fixtures/simple-python-app/main.py --name py-demo
# Equivalent — adapter and type are inferred from the .py extension:
dap-cli launch --program tests/fixtures/simple-python-app/main.py --name py-demo
dap-cli status --name py-demo
dap-cli events --name py-demo --limit 10
dap-cli threads --name py-demo
dap-cli stack --thread-id 1 --name py-demo
dap-cli cleanup
```

## Polling-Only v1 Model

dap-cli v1 is intentionally polling-only. Use `status` to check lifecycle state and `events --after-cursor` to read bounded recent events. When execution is stopped, inspect in this order: `threads`, `stack`, `scopes`, `variables`, and `evaluate`.

DAP frame IDs and variable references are scoped to the current suspended state. After `continue`, `next`, `step-in`, or `step-out`, poll again and reacquire stack frames, scopes, and variable references before inspecting values.

See [docs/AGENT-WORKFLOWS.md](docs/AGENT-WORKFLOWS.md) for deeper agent loops.

## JSON Output

Commands write one JSON envelope to stdout. Successful commands use:

```json
{
  "ok": true,
  "data": {},
  "meta": { "command": "status", "timestamp": "2026-05-03T00:00:00.000Z" }
}
```

Handled failures use:

```json
{
  "ok": false,
  "error": { "code": "adapter_not_found", "category": "usage", "exitCode": 2, "diagnostics": [] },
  "meta": { "command": "launch", "timestamp": "2026-05-03T00:00:00.000Z" }
}
```

## Human-readable output

`dap-cli` emits JSON by default so agents, scripts, and tests can rely on a stable stdout contract. Use `--human` when a person wants readable terminal output instead of the JSON envelope.

```bash
dap-cli sessions --human
DAP_CLI_HUMAN=1 dap-cli status --name demo
DAP_CLI_HUMAN=1 dap-cli status --name demo --no-human
dap-cli request stackTrace --json '{"threadId":1}' --human
```

Set `DAP_CLI_HUMAN=1` in a shell to make human output the default when no explicit mode flag is present. Add `--no-human` to force machine-readable JSON when that environment variable is inherited. Human output is for reading, not a stable machine-parsing contract.

Command-level `--json <json>` options are still request payload or launch/attach configuration input. They are not output-format switches; use `--human` and `--no-human` for output mode.

## Session Management

The controller keeps debugger state across separate CLI invocations. Use `--name` to target a session explicitly, `sessions` to list sessions, `use <name>` to set the active session, and `cleanup` to stop sessions and clear stale state.

```bash
dap-cli sessions
dap-cli use demo
dap-cli stop --name demo
dap-cli cleanup
```

## VS Code `launch.json` Workspaces

`launch` and `attach` can discover VS Code-style `.vscode/launch.json` files from a workspace. Use `--list-configs` to inspect available configurations and compounds without contacting the controller:

```bash
dap-cli launch --workspace /path/to/workspace --list-configs
dap-cli attach --workspace /path/to/workspace --list-configs
```

Start a named configuration with `--config <name>`:

```bash
dap-cli launch --workspace /path/to/workspace --config "Launch App"
dap-cli attach --workspace /path/to/workspace --config "Attach Worker"
```

Compounds start every referenced member as a coordinated group. Member session names are derived as `<compound>/<member>`, so DAP requests target the member by that derived name:

```bash
dap-cli launch --workspace /path/to/workspace --config "Full Stack"
dap-cli sessions
dap-cli threads --name "Full Stack/Server"
dap-cli close "Full Stack/Server"
```

If `stopAll` is omitted or `true`, closing one member closes the whole compound group. If `stopAll: false`, closing one member leaves peers running.

Supported launch variables are `${workspaceFolder}`, `${workspaceFolderBasename}`, `${userHome}`, `${env:NAME}`, and `${execPath}`. Platform overlays (`osx`/`mac`, `linux`, `windows`) are merged for the current platform. VS Code task fields such as `preLaunchTask` and `postDebugTask` are ignored silently; dap-cli does not run VS Code tasks. `${input:...}` and `${command:...}` variables are rejected as unsupported. Phase 05.2 does not add new adapters or event streaming; this remains the polling CLI model described above.

## Built-in Adapters

JavaScript debugging uses the built-in `js-debug` adapter descriptor. Python debugging uses the built-in `debugpy` adapter descriptor. The intended v1 path is first-party setup/readiness, not manual adapter installation by every user. If adapter readiness fails, see [docs/ADAPTER-SETUP.md](docs/ADAPTER-SETUP.md) for troubleshooting and advanced manual provisioning.

## Custom Adapters

Custom adapters are configured under dap-cli adapter config and remain external DAP services. See [docs/ADAPTER-SETUP.md](docs/ADAPTER-SETUP.md) for descriptor shape, launch defaults, attach defaults, and troubleshooting.

## Playwright Interop

Playwright can drive browser UI actions while dap-cli polls and inspects debugger state. The recommended driver is [`@playwright/cli`](https://www.npmjs.com/package/@playwright/cli) (the imperative `playwright-cli` binary), attached to the same Chromium instance js-debug controls; [`@playwright/test`](https://www.npmjs.com/package/@playwright/test) (`npx playwright test`) also works. See [docs/PLAYWRIGHT-INTEROP.md](docs/PLAYWRIGHT-INTEROP.md) for setup order, the disambiguation note, and command sequences.
