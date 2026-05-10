---
name: dap-cli
description: "Use when: an agent needs to debug, inspect, or control a local program from shell commands with dap-cli; trigger for DAP debugging, breakpoints, stack/variables inspection, launch.json debugging, js-debug, debugpy, Chrome debugging, Playwright interop, or poll-then-inspect debug loops. Assumes dap-cli is already on PATH."
---

# Debug Adapter Control with dap-cli

`dap-cli` is an agent-facing CLI for the Debug Adapter Protocol. It's language-agnostic — any DAP adapter (js-debug, debugpy, custom) works the same way. The CLI is assumed to be on `PATH`; if it isn't, the user installed it as `npx dap-cli`.

The model is intentionally simple:

- **Polling, not streaming.** Drive the target with commands; poll `status` for state.
- **JSON envelope by default.** Every reply is `{ ok, data, error?, meta }`. JSON is emitted automatically when stdout is not a TTY.
- **Refs are scoped to the current stop.** After `continue` / `next` / `step-in` / `step-out`, reacquire `threads` / `stack` / `scopes` / `variables` before reusing IDs.

## Quick start

```bash
# start the persistent controller (once per machine — nothing else auto-starts it)
dap-cli start

# launch a Node target paused at entry
dap-cli launch --program app.js --stop-on-entry

# set a breakpoint, continue, poll for the stop
dap-cli breakpoints set --source app.js --line 12
dap-cli continue
dap-cli status

# inspect when paused — IDs come from these calls, never guess them
dap-cli threads
dap-cli stack
dap-cli scopes --frame-id 10
dap-cli variables --variables-reference 100
dap-cli evaluate --expression "user.email"

# clean up
dap-cli close
dap-cli stop-controller
```

## Standard loop

1. `dap-cli start` if you get `controller_unavailable`.
2. **Prefer `--config` over raw `--adapter` flags** when the project has a `.vscode/launch.json` — the config carries adapter-specific fields (`outFiles`, `webRoot`, `runtimeArgs`) you'd otherwise have to reconstruct.
3. Poll `status` for stop detection.
4. When stopped: `threads` → `stack` → `scopes` → `variables`. `--thread-id` and `--frame-id` are auto-resolved when there is exactly one candidate; `--variables-reference` and `--source-reference` always need a value from a fresh call.
5. Drive with `evaluate` / `continue` / `next` / `step-in` / `step-out`. Poll again after every resume.
6. Clean up with `close` / `cleanup` / `stop-controller`.

## Commands

### Lifecycle

```bash
dap-cli start                               # start the controller
dap-cli stop-controller                     # stop the controller
dap-cli sessions                            # list sessions (bare list, not envelope)
dap-cli sessions --show-children            # include js-debug child sessions
dap-cli close                               # stop and remove the active session
dap-cli cleanup                             # stop sessions, clear stale state
dap-cli cleanup --purge                     # also wipe DAP_CLI_HOME caches
```

### Launch / attach

```bash
# raw launch — adapter and type inferred from --program extension
dap-cli launch --program app.js --stop-on-entry
dap-cli launch --program main.py

# launch.json discovery and use (--workspace defaults to cwd)
dap-cli launch --list-configs                              # bare list
dap-cli attach --config "Attach Worker"
dap-cli attach --workspace /elsewhere --config "Attach Worker"

# layer extra fields onto a named config without abandoning --config
dap-cli launch --config "Attach to App" \
  --json-overrides '{"sourceMaps":true,"resolveSourceMapLocations":["**","!**/node_modules/**"]}'
dap-cli launch --config "Attach to App" \
  --resolve-source-maps '**' '!**/node_modules/**'
dap-cli launch --config "Attach to App" \
  --out-files 'dist/**/*.js'

# raw launch payload (no --config auto-route)
dap-cli launch --adapter js-debug --type pwa-node --json '{"program":"app.js","stopOnEntry":true}'
```

`launch` and `attach` map directly to the DAP `request` field — there is no `--request` flag. With `--config`, a verb mismatch auto-routes (warns + sets `autoRouted` on the response). Raw `--json` payloads do not auto-route.

### Inspection

```bash
dap-cli status
dap-cli events --after-cursor 0 --limit 20    # optional, for richer history
dap-cli events --include stopped --include output
dap-cli threads
dap-cli stack                                 # --thread-id auto-resolved
dap-cli scopes --frame-id 10
dap-cli variables --variables-reference 100
dap-cli evaluate --expression "value + 1"     # auto-frame on a paused session
dap-cli evaluate --expression "value > 10" --frame-id 10 --context repl
dap-cli capabilities
```

### Stepping

```bash
dap-cli continue                              # --thread-id auto-resolved
dap-cli next
dap-cli step-in
dap-cli step-out
dap-cli pause
```

### Breakpoints

```bash
# set is replacement-semantic per source — send the full desired set for a file each time
dap-cli breakpoints set --source app.js --line 12
dap-cli breakpoints set --source app.js --line 22 --condition "count === 1"
dap-cli breakpoints set --source app.js --line 22 --hit-condition 2
dap-cli breakpoints set --source app.js --line 22 --log-message "count={count}"

# inspect / clear (controller-side tracking)
dap-cli breakpoints list
dap-cli breakpoints list --source app.js
dap-cli breakpoints clear --source app.js     # DAP empty-list semantics for one source
dap-cli breakpoints clear                     # clear every tracked source
```

### Raw DAP

For DAP requests not exposed as first-class commands:

```bash
dap-cli request stackTrace --json '{"threadId":1}'
dap-cli dap loaded-sources
dap-cli dap set-variable --json '{"variablesReference":100,"name":"x","value":"42"}'
dap-cli dap set-expression --json '{"frameId":10,"expression":"x","value":"42"}'
```

### Output mode

```bash
dap-cli sessions --human                 # human-readable (default on TTY only if DAP_CLI_HUMAN=1)
dap-cli status --no-human                # force JSON on a TTY
DAP_CLI_HUMAN=1 dap-cli status
```

Non-TTY stdout always gets JSON. The command-level `--json <json>` is request payload input, not an output-format switch.

## Multiple sessions

`--name <session>` lets you target one of several sessions explicitly. When omitted, commands act on the active session (the most recent one, or whatever was set with `dap-cli use <name>`).

```bash
# explicit, scriptable
dap-cli launch --program app.js --name api
dap-cli launch --program worker.js --name worker
dap-cli status --name api
dap-cli close api

# implicit (active-session shorthand)
dap-cli use api
dap-cli status
```

Always pass `--name` in scripts and agent playbooks; rely on the active session only for one-off interactive use.

## JSON envelope

```json
{ "ok": true,  "data": { /* … */ }, "meta": { "command": "status", "timestamp": "…" } }
{ "ok": false, "error": { "code": "adapter_not_found", "category": "usage", "exitCode": 2, "diagnostics": [] }, "meta": { /* … */ } }
```

Read `error.code`, `error.category`, `error.diagnostics`, `stderrTail`, and `logPath` before retrying. If a request fails because execution resumed, restart at `status` and reacquire IDs on the next stop.

## Breakpoint verification is asynchronous

The `verified` flag in the immediate `breakpoints set` response is a snapshot, not a verdict. Adapters often return `verified: false` initially and upgrade once the runtime loads the source.

1. Set the bp. If `verified: true`, you're done.
2. If `verified: false`, **don't conclude failure.** Continue and poll `status`. If a stop arrives with `reason: "breakpoint"`, your bp resolved.
3. Only after the program has plausibly run past the line *without* stopping should you read `verificationDiagnostic` and treat it as a binding failure.

The success payload carries `verificationDiagnostic` when any bp is unverified:

```json
{
  "verificationDiagnostic": {
    "unverifiedCount": 1,
    "loadedSourcesCount": 0,
    "matchingLoadedSources": [],
    "hint": "1 of 1 breakpoints unverified; debuggee has loaded 0 sources — likely attached to the wrong process. Run: dap-cli dap loaded-sources",
    "recipe": "dap-cli dap loaded-sources"
  }
}
```

`recipe` is the literal next command to run. Hint cases:

- 0 sources loaded → likely attached to the wrong process.
- Loaded but no path/basename match → check source maps / outFiles.
- Matching loaded source → check breakpoint line numbers.
- Adapter doesn't advertise `supportsLoadedSourcesRequest` → fall back to event inspection.

An empty `loaded-sources` result with `childSessionCount > 0` is **normal** for multi-process js-debug (children carry the sources, not the parent).

## Example: launch a Node target, break, inspect, continue

```bash
dap-cli start
dap-cli launch --program app.js --stop-on-entry
dap-cli breakpoints set --source app.js --line 12
dap-cli continue
dap-cli status
# stopped → inspect
dap-cli stack
dap-cli scopes --frame-id 1000
dap-cli variables --variables-reference 1001
dap-cli evaluate --expression "user.email"
dap-cli continue
dap-cli close
```

## Example: attach to a workspace launch.json config

```bash
dap-cli launch --list-configs                                 # discover names (bare list)
dap-cli attach --config "Attach Worker"
# wrong-process smoke test — confirm you're talking to the user's process, not an adapter helper
dap-cli evaluate --expression "process.pid"
lsof -i :9229 | grep LISTEN                                   # PIDs should match
```

If the resolved config has `request: "attach"`, use `dap-cli attach` (or let `--config` auto-route from `launch`). Picking the wrong verb is the highest-impact footgun: an adapter helper process spawns, every `breakpoints set` returns `verified: false`, and `dap loaded-sources` returns `[]` — looks like a source-map bug; isn't.

## Example: js-debug pwa-chrome with multi-renderer events

```bash
# launch chrome under js-debug with a fixed CDP port (so Playwright can attach to the same browser)
dap-cli launch --name web-demo --adapter js-debug --type pwa-chrome \
  --url "file://$PWD/index.html" \
  --json '{"webRoot":"'"$PWD"'","runtimeArgs":["--remote-debugging-port=9222"]}'

# children are hidden by default — opt them in
dap-cli sessions --show-children

# child events (including renderer logpoint output) mirror into the parent stream
dap-cli events --name web-demo --include output --after-cursor 0

# filter to one child by body.child_session_id (logpoint output arrives as category=stdout, not console)
dap-cli events --name web-demo --after-cursor 0 \
  | jq '.data.events[] | select(.body.child_session_id == "<child-id>")'
```

Set bps on the parent; the parent's `status.paused` mirrors child stops. Targeting a child directly returns `child_session_not_targetable` with `error.data.parentSessionId`.

## Example: Playwright interop (drive UI while dap-cli polls)

Playwright drives the browser UI. dap-cli controls and inspects debugger state. Same Chromium instance, separate responsibilities, coordinate by polling.

```bash
# terminal 1 — dap-cli launches Chrome with a fixed CDP port
dap-cli start
dap-cli launch --name web-demo --adapter js-debug --type pwa-chrome \
  --url "file://$PWD/page.html" \
  --json '{"webRoot":"'"$PWD"'","runtimeArgs":["--remote-debugging-port=9222"]}'
dap-cli breakpoints set --name web-demo --source "$PWD/src/app.ts" --line 22

# terminal 2 — playwright-cli attaches to the same browser
playwright-cli attach --cdp=http://localhost:9222
playwright-cli click e5                  # triggers the breakpoint
# back in terminal 1 — poll, inspect, continue
dap-cli status --name web-demo
dap-cli stack --name web-demo
dap-cli evaluate --expression "count" --name web-demo
dap-cli continue --name web-demo
```

## Common gotchas

- **`--list-configs` and `sessions` return bare lists**, not the standard envelope.
- **Don't set `DAP_CLI_HOME` to a fresh per-task dir.** The adapter cache (js-debug, debugpy) lives there. A clean home means every adapter resolution fails with `js_debug_not_found`. Use the default `~/.dap-cli/`.
- **Compounds.** Member session names are derived as `<compound>/<member>`; use `dap-cli sessions` to discover exact names before targeting a member. Closing one member closes the group unless `stopAll: false`.
- **`--json-overrides` cannot bypass `--config` auto-route.** A `'{"request":"launch"}'` override is silently overwritten by the auto-routed `request` field.
- **Stale state.** When sessions or adapters look wrong: `dap-cli sessions` → `dap-cli cleanup` → `dap-cli cleanup --purge` → `dap-cli stop-controller`.

## Going deeper

- General agent workflows (adapter inference, Python evaluate auto-wrap, child sessions, output contract) → [references/agent-workflows.md](./references/agent-workflows.md)
- JS / TS / browser → [references/javascript-typescript.md](./references/javascript-typescript.md)
- Python → [references/python.md](./references/python.md)
