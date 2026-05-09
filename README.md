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

dap-cli v1 is intentionally polling-only. Use `status` to check lifecycle and paused state (it incorporates the most recent `stopped`/`continued` event, including child-mirrored stops on js-debug parent sessions) and `events --after-cursor` for bounded recent event history. When execution is stopped, inspect in this order: `threads`, `stack`, `scopes`, `variables`, and `evaluate`.

For multi-process js-debug parents (`pwa-chrome` renderers, `pwa-node` workers), discover children with `dap-cli sessions --show-children` and filter the parent's `events` stream by `body.child_session_id` to isolate one runtime — see [docs/AGENT-WORKFLOWS.md → pwa-chrome multi-renderer recipe](docs/AGENT-WORKFLOWS.md#pwa-chrome-multi-renderer-recipe) for the full workflow.

DAP frame IDs and variable references are scoped to the current suspended state. After `continue`, `next`, `step-in`, or `step-out`, poll again and reacquire stack frames, scopes, and variable references before inspecting values.

`evaluate` auto-resolves `--frame-id` to the topmost paused frame when omitted on a paused session, so `dap-cli evaluate --expression "user.email" --name demo` is the canonical short form. Pass `--frame-id <N>` explicitly when you need a specific non-top frame.

On debugpy (Python) sessions, `evaluate` auto-wraps statement-shaped payloads with `exec("…")` before forwarding (debugpy is expression-only). Pure expressions are passed through unchanged. See [docs/AGENT-WORKFLOWS.md → Python (debugpy) evaluate](docs/AGENT-WORKFLOWS.md#python-debugpy-evaluate) for the wrap rule, the request-args opt-out (`args.context = 'no-auto-wrap'`), and the `evaluate_requires_exec` fallback envelope.

`breakpoints` has three subcommands. `set` (above) is the only one that talks to the adapter directly; `list` and `clear` read or clear the controller's in-memory tracking map for the session:

```bash
dap-cli breakpoints list --name demo                        # all sources tracked for the session
dap-cli breakpoints list --name demo --source path/to/x.js  # filter to one source
dap-cli breakpoints clear --name demo --source path/to/x.js # DAP setBreakpoints empty-list semantics for one source
dap-cli breakpoints clear --name demo                       # clear every tracked source for the session
```

Tracking is in-memory on the controller and is dropped on session close or controller restart. Initial breakpoints injected at `dap launch` time are NOT tracked until re-set via `breakpoints set`.

When `breakpoints set` returns any unverified breakpoint, the CLI automatically follows up with `loadedSources` and attaches a structured `verificationDiagnostic` object to the success payload (and a one-line stderr hint). The diagnostic's `recipe` field is the literal next command an agent should run; the `hint` distinguishes three failure modes:

- 0 sources loaded → likely attached to the wrong process (`wrong process` substring).
- Loaded but no path/basename match → check source maps / outFiles.
- Matching loaded source → check breakpoint line numbers.

```json
{
  "ok": true,
  "data": {
    "breakpoints": [{ "id": 1, "verified": false, "line": 10 }],
    "verificationDiagnostic": {
      "unverifiedCount": 1,
      "totalCount": 1,
      "loadedSourcesCount": 0,
      "matchingLoadedSources": [],
      "hint": "1 of 1 breakpoints unverified; debuggee has loaded 0 sources — likely attached to the wrong process. Run: dap-cli dap loaded-sources --name demo",
      "recipe": "dap-cli dap loaded-sources --name demo"
    }
  }
}
```

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

Set `DAP_CLI_HUMAN=1` in a shell to make human output the default when no explicit mode flag is present. Agent pipelines (non-TTY stdout) automatically receive JSON regardless of `DAP_CLI_HUMAN` (Phase 13), so `--no-human` is no longer required in scripts. `--no-human` is only needed on a TTY where a developer wants JSON despite their shell setting `DAP_CLI_HUMAN=1`. Human output is for reading, not a stable machine-parsing contract.

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

If your launch.json configuration has `request: "attach"`, prefer `dap-cli attach --config …` for clarity; `dap-cli launch --config …` will auto-route (Phase 10) but emits a `warnings` entry. Raw `--json` and CLI-flag-only invocations do NOT auto-route — pick the verb deliberately. See [docs/AGENT-WORKFLOWS.md](docs/AGENT-WORKFLOWS.md#choosing-launch-vs-attach) for the full rule and the post-attach wrong-process smoke test.

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

When `--config <name>` is used, the launch.json configuration's `request:` field is the source of truth. If it differs from the CLI verb, dap-cli auto-routes to the matching DAP request and emits a `warnings` entry plus a structured `autoRouted` field on the success payload. CLI-flag-only and `--json`-only invocations are unchanged — the auto-route only triggers with `--config`.

```bash
# Before: silently sent DAP `launch` (wrong); spawned a helper node process.
# After:  detects request:'attach', routes to DAP `attach`, prints a warning.
dap-cli launch --workspace /path/to/workspace --config "Attach to Agent Host Process"
```

### Layering extra fields onto `--config`

Use `--json-overrides <json>` to merge an extra object onto a `--config`-resolved configuration without abandoning `--config`. Use `--resolve-source-maps <pattern...>` to set `resolveSourceMapLocations` directly from the command line (variadic, mirrors `--out-files`). Both flags work on `launch` and `attach`.

```bash
dap-cli launch --workspace . --config "Attach to Agent Host Process" \
  --json-overrides '{"sourceMaps":true,"resolveSourceMapLocations":["**","!**/node_modules/**"]}'

dap-cli launch --workspace . --config "Attach to Agent Host Process" \
  --resolve-source-maps '**' '!**/node_modules/**'
```

Precedence (highest wins): `flags > --json > --json-overrides > --config (named-config) > adapter defaults`. So `--resolve-source-maps` always wins over `resolveSourceMapLocations` written via `--json-overrides`. The merge is shallow — nested objects (such as `env`) are replaced wholesale, not deep-merged. `--json-overrides` cannot bypass the `--config` auto-route: a malicious `--json-overrides '{"request":"launch"}'` is silently overwritten by the auto-routed `request:` field.

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
