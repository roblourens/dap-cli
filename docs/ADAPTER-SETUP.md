# Adapter Setup

## Overview

dap-cli launches debug adapters as external DAP services. Built-in adapter IDs provide the standard JavaScript and Python descriptor shape, and the intended v1 path is first-party setup/readiness rather than every user manually installing adapter binaries.

Use this guide for custom adapters, troubleshooting, and advanced manual provisioning.

## Built-in Adapters

Built-in adapter IDs:

- `js-debug` for Node.js, Chrome, Electron, and JavaScript/TypeScript debugging.
- `debugpy` for Python debugging.

The built-in path should be validated by the package setup/readiness flow. When adapter readiness is implemented, run the repository setup command before real adapter smokes:

```bash
npm run setup-adapters
```

Then verify a launch with the normal dap-cli workflow:

```bash
dap-cli launch --adapter js-debug --type node --program tests/fixtures/simple-node-app/index.js --args run --name verify-js
dap-cli status --name verify-js
dap-cli cleanup
```

```bash
dap-cli launch --adapter debugpy --type python --program tests/fixtures/simple-python-app/main.py --name verify-py
dap-cli status --name verify-py
dap-cli cleanup
```

If setup/readiness fails, check the troubleshooting section before using manual provisioning.

## Custom Adapters

Custom adapters live in the dap-cli adapter config at:

```bash
$DAP_CLI_HOME/config/adapters.json
```

If `DAP_CLI_HOME` is unset, dap-cli uses `~/.dap-cli`.

### Stdio Adapter

```json
{
	"adapters": {
		"custom-node": {
			"id": "custom-node",
			"label": "Custom Node adapter",
			"transport": {
				"kind": "stdio",
				"command": "node",
				"args": ["/path/to/adapter.js"],
				"cwd": "/path/to/project",
				"env": {
					"NODE_ENV": "development"
				}
			},
			"launchDefaults": {
				"type": "node",
				"request": "launch"
			},
			"attachDefaults": {
				"type": "node",
				"request": "attach"
			}
		}
	},
	"launchConfigTypeMap": {
		"node": "custom-node"
	}
}
```

Launch with the custom adapter:

```bash
dap-cli launch --adapter custom-node --program app.js --name custom-demo
```

### Socket Adapter

Socket adapters must bind to localhost.

```json
{
	"adapters": {
		"socket-debugger": {
			"id": "socket-debugger",
			"label": "Socket debugger",
			"transport": {
				"kind": "socket",
				"host": "127.0.0.1",
				"port": 4711
			}
		}
	}
}
```

Attach to a running socket adapter:

```bash
dap-cli attach --adapter socket-debugger --name socket-demo
```

## Launch Config Type Mapping

Use `launchConfigTypeMap` when `.vscode/launch.json` uses a custom `type` value and dap-cli needs to map it to an adapter id.

```json
{
	"launchConfigTypeMap": {
		"myRuntime": "custom-node"
	}
}
```

Then launch by configuration name:

```bash
dap-cli launch --config "Debug App" --name app
```

## Advanced Setup: Manual Provisioning

Manual provisioning is a fallback for pinned versions, offline installs, or non-standard adapter locations. It should not be the normal built-in adapter experience.

### JavaScript js-debug Tarball

```bash
mkdir -p ~/.dap-cli/adapters
curl -L https://github.com/microsoft/vscode-js-debug/releases/download/v1.117.0/js-debug-dap-v1.117.0.tar.gz | tar xzf - -C ~/.dap-cli/adapters/
```

The expected adapter entrypoint is:

```bash
~/.dap-cli/adapters/js-debug/src/dapDebugServer.js
```

### Project Dependency

If a project has a compatible js-debug build under `node_modules/vscode-js-debug/src/dapDebugServer.js`, dap-cli can use that entrypoint.

### Python debugpy

```bash
python3 -m pip install debugpy==1.8.20
python3 -c "import debugpy; print(debugpy.__version__)"
```

## Troubleshooting

- `js_debug_not_found`: run the first-party setup/readiness flow first. If you need a pinned or offline fallback, manually provision the js-debug DAP tarball under `DAP_CLI_HOME/adapters/js-debug`.
- `No module named debugpy`: run the first-party setup/readiness flow first. If using a system Python fallback, install debugpy in the Python environment used by dap-cli.
- `python3: command not found`: install Python 3 or configure a custom adapter descriptor with the desired Python executable.
- Chrome headless failures: verify `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome` exists on macOS or configure Chrome through adapter-native js-debug options.
- Electron failures: install Electron in the project that owns the target app, then set `--runtime-executable electron` or the full Electron binary path.
- `adapter_not_found`: check the adapter id and `$DAP_CLI_HOME/config/adapters.json`; custom adapter ids may contain letters, numbers, dots, underscores, and dashes.