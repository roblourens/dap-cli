# dap-cli

A command-line debugger built for AI agents. Drive any [Debug Adapter Protocol](https://microsoft.github.io/debug-adapter-protocol/) target — Node.js, Python, Chrome, custom adapters — from shell commands, with stable JSON output and `.vscode/launch.json` support.

```bash
npm install -g dap-cli
```

## Why

Agents already know how to run shell commands. They don't know how to drive an IDE debugger. `dap-cli` closes that gap so an agent can:

- **Set breakpoints, step, and inspect variables** in any runtime with a DAP adapter — no ad-hoc `console.log` campaigns or re-building the program for every new question.
- **Reuse your `.vscode/launch.json` configs** — `dap-cli attach --config "Attach to App"` runs the same configuration you'd pick from the Run and Debug picker in VS Code.
- **Coordinate with other tools like [`playwright-cli`](https://www.npmjs.com/package/@playwright/cli)** — Playwright drives the page, dap-cli polls the debugger, both attached to the same Chromium instance.

## Install the CLI

```bash
npm install -g dap-cli
dap-cli --version
```

The first time the agent uses an adapter, dap-cli provisions it (js-debug binary; a Python venv with debugpy). See [docs/adapter-setup.md](docs/adapter-setup.md) for custom adapters and troubleshooting.

## Install the agent skill

The repo doubles as an [Open Plugins](https://open-plugins.com/) plugin. The [SKILL.md](skills/dap-cli/SKILL.md) at the root teaches your agent how to use the CLI — common commands, the polling loop, breakpoint verification, and language-specific gotchas for `js-debug` and `debugpy`.

**VS Code (Copilot Chat agent mode):**

1. Run **Chat: Install Plugin from Source**.
2. Enter `roblourens/dap-cli`.

**Claude Code / Copilot CLI / other Open Plugins hosts:**

```text
/plugin install roblourens/dap-cli
```

**Codex / harnesses without plugin support:** point the agent at [skills/dap-cli/SKILL.md](skills/dap-cli/SKILL.md) however your harness loads custom skills.

## Quick taste

The philosophy: drive the target with explicit commands, poll `status` for state changes, every reply is a JSON envelope. The CLI is designed for agents but works fine for humans too — pass `--human` for readable output.

```bash
# launch a Node script paused at entry
dap-cli launch --program app.js --stop-on-entry

# set a breakpoint, continue, poll until paused
dap-cli breakpoints set --source app.js --line 12
dap-cli continue
dap-cli status

# inspect — IDs come from these calls, never guess
dap-cli stack
dap-cli scopes --frame-id 1000
dap-cli variables --variables-reference 1001
dap-cli evaluate --expression "user.email"
```

## Use your existing `launch.json`

If the project has `.vscode/launch.json`, run a config by name:

```bash
# discover available configs (bare list, not envelope)
dap-cli launch --list-configs

# run a named config
dap-cli attach --config "Attach to App"

# layer extra fields onto a named config without abandoning it
dap-cli launch --config "Attach to App" \
  --json-overrides '{"sourceMaps":true,"resolveSourceMapLocations":["**","!**/node_modules/**"]}'
```

`--workspace` defaults to the current directory; pass it explicitly to point at a different repo. Compounds and most VS Code launch variables (`${workspaceFolder}`, `${env:NAME}`, etc.) are supported. See [docs/adapter-setup.md](docs/adapter-setup.md) for the full list.

## Output

JSON by default; non-TTY stdout always gets JSON regardless of any setting.

```json
{ "ok": true,  "data": { /* … */ }, "meta": { "command": "status", "timestamp": "…" } }
{ "ok": false, "error": { "code": "adapter_not_found", "category": "usage", "exitCode": 2, "diagnostics": [] }, "meta": { /* … */ } }
```

For a person at a terminal:

```bash
dap-cli sessions --human
DAP_CLI_HUMAN=1 dap-cli status
```

Human output is for reading, not parsing.

## Multiple sessions

dap-cli is designed to be running several debug sessions at once. Pass `--name <session>` to target one explicitly; when omitted, commands act on the active session (the most recent one, or whatever was set with `dap-cli use <name>`).

```bash
dap-cli launch --program api.js --name api
dap-cli launch --program worker.js --name worker
dap-cli status --name api
dap-cli close api
```

## Going deeper

Most of what an agent needs lives in [the SKILL.md](skills/dap-cli/SKILL.md). For longer-form material:

| Doc | What it covers |
|---|---|
| [docs/adapter-setup.md](docs/adapter-setup.md) | Built-in adapter readiness; configuring custom stdio / socket adapters; supported launch variables |
| [docs/playwright-interop.md](docs/playwright-interop.md) | Driving Chromium UI with `playwright-cli` while dap-cli polls — setup order, fixed CDP port, conditional breakpoints |

## Building from source

```bash
git clone https://github.com/roblourens/dap-cli
cd dap-cli
npm install
npm run build
node dist/index.js --version
```

`npm run check` runs typecheck, lint, tests, and build.

## License

MIT
