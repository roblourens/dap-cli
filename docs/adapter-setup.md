# Adapter Setup

## Overview

dap-cli launches debug adapters as external DAP services. Built-in adapter IDs provide the standard JavaScript and Python descriptor shape, and the intended v1 path is first-party setup/readiness rather than every user manually installing adapter binaries.

Use this guide for custom adapters, troubleshooting, and advanced manual provisioning.

## Built-in Adapters

Built-in adapter IDs:

- `js-debug` for Node.js, Chrome, Electron, and JavaScript/TypeScript debugging.
- `debugpy` for Python debugging.
- `delve` for Go debugging through Delve's local `dlv dap` server.

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

```bash
dap-cli launch --adapter delve --type go --json '{"mode":"debug","program":"tests/fixtures/simple-go-app","cwd":"tests/fixtures/simple-go-app","dlvCwd":"tests/fixtures/simple-go-app"}' --name verify-go
dap-cli status --name verify-go
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

## Inference rules

`--adapter` and `--type` are optional on `dap-cli launch` and `dap-cli attach`. When omitted, dap-cli infers the missing pieces from `--program` (extension) and from each other (`--type` → adapter via `launchConfigTypeMap`; `--adapter` → default DAP type). Explicit flags always win — passing `--adapter` AND/OR `--type` skips inference for that field, with no validation that the two agree.

Extension table (matched against `path.extname(program).toLowerCase()`):

| Extension | Inferred adapter | Inferred DAP type |
| --- | --- | --- |
| `.py` | `debugpy` | `python` |
| `.go` | `delve` | `go` |
| `.js`, `.mjs`, `.cjs` | `js-debug` | `pwa-node` |
| `.ts`, `.mts`, `.cts` | `js-debug` | `pwa-node` |
| `.html`, `.htm` | `js-debug` | `pwa-chrome` |

Adapter-only defaults (used when only `--adapter` is given):

| Adapter | Default type when only --adapter is given |
| --- | --- |
| `js-debug` | `pwa-node` (`pwa-chrome` if `--program` ends in `.html`/`.htm`) |
| `debugpy` | `python` |
| `delve` | `go` |
| any custom adapter | no default — pass `--type` explicitly |

- An unsupported program extension (or a program with no extension) produces a `usage_error` with code `adapter_inference_failed`. The error names the extension and asks you to pass `--adapter` or `--type` explicitly.
- When `--adapter`, `--type`, `--program`, and `--config` are all absent, dap-cli falls back to the built-in `fake` adapter — preserving the legacy test/sandbox behavior.

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

## Auto-routing `launch` vs `attach` by `--config`

When `--config <name>` is used, the launch.json configuration's `request:` field is the source of truth. If it differs from the CLI verb, dap-cli auto-routes to the matching DAP request and emits a structured warning. The verb is a fallback when the config has no `request:` field.

This catches the original failure mode where `dap-cli launch --config "Attach to Agent Host Process"` silently sent a DAP `launch` request to js-debug, which then spawned a bare `node` helper process and reported it as the debuggee — the real attach target was never touched.

| CLI verb | `config.request` | dap-cli action |
|----------|------------------|----------------|
| `launch` | `attach`         | Routes to DAP `attach`, emits `autoRouted` warning. |
| `attach` | `launch`         | Routes to DAP `launch`, emits `autoRouted` warning. |
| `launch` | `launch`         | Sends DAP `launch`. Silent (no warning). |
| `attach` | `attach`         | Sends DAP `attach`. Silent (no warning). |
| either   | (missing)        | Uses the verb. Silent (back-compat). |

When auto-routing fires, the `dap.start` success payload carries:

```json
{
  "warnings": ["auto_routed_to: 'Attach to Agent Host Process' has request:'attach'; CLI verb 'launch' was overridden"],
  "autoRouted": {
    "code": "auto_routed_to",
    "from": "launch",
    "to": "attach",
    "configName": "Attach to Agent Host Process"
  }
}
```

JSON consumers should read `autoRouted` for machine-readable detection; the `warnings` string is for humans. Compound members continue to honor each member's `request:` field (this auto-route extends the same logic to non-compound `--config` usage).

## Layering extra fields onto `--config`

Real-world launch.json configurations often miss fields you need for a one-off debug session. The vscode repo's `Attach to Agent Host Process` config, for example, sets only `outFiles`; getting js-debug to bind compiled-JS breakpoints reliably also wants `sourceMaps:true` and `resolveSourceMapLocations`. Dropping `--config` and rebuilding the entire payload with `--json` is heavyweight. `--json-overrides <json>` and `--resolve-source-maps <pattern...>` let you layer on top instead.

### Precedence stack

From highest precedence (always wins) to lowest (defaults):

1. **CLI flags** — `--program`, `--cwd`, `--out-files`, `--resolve-source-maps`, `--source-maps`, etc.
2. **`--json <json>`** — adapter-native config object.
3. **`--json-overrides <json>`** — extra fields layered on top of the named config.
4. **`--config <name>` named-config** — the resolved entry from `.vscode/launch.json`.
5. **Adapter defaults** — `launchDefaults` / `attachDefaults` from `.dap-cli/adapter-config.json`.

The merge is **shallow**. Nested objects (such as `env: { ... }`) are replaced wholesale, not deep-merged. If you need to extend a nested object, supply the full merged value via `--json-overrides`.

### Worked example

The vscode repo's `Attach to Agent Host Process` config (paraphrased):

```jsonc
{
  "name": "Attach to Agent Host Process",
  "type": "node",
  "request": "attach",
  "outFiles": ["${workspaceFolder}/out/**/*.js"]
}
```

To attach with both `sourceMaps:true` and explicit `resolveSourceMapLocations`:

```bash
dap-cli launch \
  --workspace . \
  --config "Attach to Agent Host Process" \
  --resolve-source-maps '**' '!**/node_modules/**' \
  --json-overrides '{"sourceMaps":true}'
```

Result: dap-cli auto-routes to DAP `attach` (per the named config's `request:'attach'`), then sends a config containing `outFiles` (from `--config`), `sourceMaps:true` (from `--json-overrides`), `resolveSourceMapLocations:['**','!**/node_modules/**']` (from `--resolve-source-maps`, the highest layer), and the locked `request:'attach'`.

`--json-overrides` cannot bypass the auto-route: a malicious `--json-overrides '{"request":"launch"}'` is silently overwritten by the `request:` field at the tail of the config object. The verb routing is decided once from `--config` and is not negotiable through overrides.

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

## Go / Delve

`npm run setup-adapters` prefers an already-usable `dlv` on `PATH`. If none is available, it provisions the pinned official Delve `v1.26.3` release into `DAP_CLI_HOME/adapters/delve` and uses that binary for the built-in `delve` adapter. The setup command reports the exact official release asset URL and its trust boundary; checksum verification is not automated by this repo.

Delve `v1.26.3` expects debuggee builds from Go 1.24 or newer. Delve rejects older Go toolchains by default, and dap-cli intentionally preserves that check. Upgrade Go or use Go's toolchain manager when a project can be built with a supported toolchain.

The built-in adapter starts a localhost-only DAP server equivalent to:

```bash
dlv dap --listen=127.0.0.1:<port>
```

It covers local `launch` and same-machine PID `attach`. Advanced remote/headless Delve workflows are different adapter shapes; use a custom socket descriptor for those instead of assuming the built-in `delve` adapter models them.

For single-file `.go` launches, `--program main.go` can infer adapter `delve` and DAP type `go`. For package-directory debugging, pass `--adapter delve --type go` explicitly because a directory has no `.go` extension to infer from.

Launch a Go package in Delve debug mode:

```bash
dap-cli launch --adapter delve --type go --name go-debug \
	--json '{"mode":"debug","program":"/workspace/my-go-module","cwd":"/workspace/my-go-module","dlvCwd":"/workspace/my-go-module"}'
```

Debug package tests with Delve test mode:

```bash
dap-cli launch --adapter delve --type go --name go-test \
	--json '{"mode":"test","program":"/workspace/my-go-module","cwd":"/workspace/my-go-module","dlvCwd":"/workspace/my-go-module"}'
```

For `mode: "exec"`, build a symbol-friendly binary first so stack frames, locals, and breakpoints remain useful:

```bash
go build -gcflags=all="-N -l" -o /tmp/my-go-app /workspace/my-go-module
dap-cli launch --adapter delve --type go --name go-exec \
	--json '{"mode":"exec","program":"/tmp/my-go-app","cwd":"/workspace/my-go-module","dlvCwd":"/workspace/my-go-module"}'
```

Attach only to a same-machine process you own and intend to debug:

```bash
dap-cli attach --adapter delve --type go --name go-attach \
	--json '{"mode":"local","processId":12345}'
```

Delve honors DAP disconnect lifecycle flags for attach. The Phase 20 attach smoke uses `terminateDebuggee: false`, verifies the target survives disconnect, then separately kills only the test-owned fixture process.

## Troubleshooting

- `js_debug_not_found`: run the first-party setup/readiness flow first. If you need a pinned or offline fallback, manually provision the js-debug DAP tarball under `DAP_CLI_HOME/adapters/js-debug`.
- `No module named debugpy`: run the first-party setup/readiness flow first. If using a system Python fallback, install debugpy in the Python environment used by dap-cli.
- `delve_not_found`: run `npm run setup-adapters`, or make a compatible `dlv` executable available on `PATH`. The error names both recovery paths.
- Delve launch fails with a Go-version message: Delve `v1.26.3` supports Go 1.24+ debuggee builds; use a supported Go toolchain rather than disabling Delve's version check.
- Delve package launch/test fails outside the intended module: pass adapter-native `cwd` and `dlvCwd` fields so Delve's Go build runs from the module directory.
- Delve `mode: "exec"` hits poor stack/local/breakpoint behavior: rebuild the binary with `go build -gcflags=all="-N -l"` before debugging it.
- `python3: command not found`: install Python 3 or configure a custom adapter descriptor with the desired Python executable.
- Chrome headless failures: verify `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome` exists on macOS or configure Chrome through adapter-native js-debug options.
- Electron failures: install Electron in the project that owns the target app, then set `--runtime-executable electron` or the full Electron binary path.
- `adapter_not_found`: check the adapter id and `$DAP_CLI_HOME/config/adapters.json`; custom adapter ids may contain letters, numbers, dots, underscores, and dashes.