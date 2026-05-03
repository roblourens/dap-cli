# Adapter Setup

## Overview

dap-cli launches debug adapters as external DAP services. Built-in adapter IDs provide the descriptor shape, but the adapter binaries still need to be available on the machine running dap-cli.

## JavaScript (js-debug)

### Method 1: GitHub Release Tarball

```bash
mkdir -p ~/.dap-cli/adapters
curl -L https://github.com/microsoft/vscode-js-debug/releases/download/v1.117.0/js-debug-dap-v1.117.0.tar.gz | tar xzf - -C ~/.dap-cli/adapters/
```

The expected adapter entrypoint is:

```bash
~/.dap-cli/adapters/js-debug/src/dapDebugServer.js
```

### Method 2: Project Dependency

If a project has a compatible js-debug build under `node_modules/vscode-js-debug/src/dapDebugServer.js`, dap-cli can use that entrypoint.

## Verification

```bash
dap-cli launch --adapter js-debug --type node --program test.js --name verify
```

## Troubleshooting

- `js_debug_not_found`: install the js-debug DAP tarball into `DAP_CLI_HOME/adapters/js-debug`.
- Chrome headless failures: verify `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome` exists on macOS or configure Chrome through adapter-native js-debug options.
- Electron failures: install Electron in the project that owns the target app, then set `--runtime-executable electron` or the full Electron binary path.

## Python (debugpy)

Install debugpy into the Python environment that dap-cli will use:

```bash
pip3 install debugpy==1.8.20
```

Verify the module is importable:

```bash
python3 -c "import debugpy; print(debugpy.__version__)"
```

Launch a Python script:

```bash
dap-cli launch --adapter debugpy --type python --program script.py --name verify
```

Troubleshooting:

- `No module named debugpy`: install debugpy with `pip3 install debugpy` in the Python environment used by dap-cli.
- `python3: command not found`: install Python 3 or configure a custom adapter descriptor with the desired Python executable.