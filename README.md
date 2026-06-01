# dap-cli

Give your agent debugging skills!

A command-line debugger built for AI agents. Drive any [Debug Adapter Protocol](https://microsoft.github.io/debug-adapter-protocol/) target — Node.js, Python, Go, Rust, Chrome, custom adapters — from shell commands, with stable JSON output and `.vscode/launch.json` support.

## Why

Agents already know how to run shell commands. They don't know how to drive an IDE debugger. `dap-cli` closes that gap so an agent can:

- **Set breakpoints, step, and inspect variables** in any runtime with a DAP adapter — no ad-hoc `console.log` campaigns or re-building the program for every new question.
- **Reuse your `.vscode/launch.json` configs** — `dap-cli launch --config "Launch App"` runs the same configuration you'd pick from the Run and Debug picker in VS Code.
- **Coordinate with other tools like [`playwright-cli`](https://www.npmjs.com/package/@playwright/cli)** — Playwright drives the page, dap-cli polls the debugger, both attached to the same Chromium instance.

## Install the CLI

```bash
npm install -g @roblourens/dap-cli
dap-cli --version
```

(Or use `npx @roblourens/dap-cli ...` for one-off invocations — the cache below is shared across both install paths.)

**First launch:** when an agent first runs a `launch` / `attach`, dap-cli prompts before downloading the relevant adapter binary:

```text
Install vscode-js-debug 1.117.0 into ~/.dap-cli/adapters/js-debug/ (~10MB)? [y/N]
```

Answer `y`. The adapter is downloaded into `~/.dap-cli/adapters/` once and reused for every subsequent session. Only the adapter you actually use is downloaded — if you only debug Python, you never download js-debug, delve, or CodeLLDB.

Built-in adapters are `js-debug` for JavaScript/browser targets, `debugpy` for Python, `delve` for Go, and `codelldb` (CodeLLDB) for explicit compiled Rust executables.

**Non-interactive callers (agents, CI, scripts):** pre-consent so the prompt does not block:

```bash
dap-cli launch --yes --config "Launch App"      # per-invocation flag
DAP_CLI_ASSUME_YES=1 dap-cli launch ...         # equivalent env var
```

When stdin is not a TTY and neither `--yes` nor `DAP_CLI_ASSUME_YES=1` is set, dap-cli fails fast with `provision_consent_required` rather than hanging on a prompt nobody can answer.

**Pre-warm the cache (optional):** for sealed CI images or fresh dev machines, install all four built-in adapters up front:

```bash
dap-cli setup-adapters --yes
dap-cli setup-adapters --adapter js-debug --yes    # or one at a time
dap-cli setup-adapters --adapter codelldb --yes    # Rust / CodeLLDB only
```

**Custom cache location:** set `DAP_CLI_ADAPTERS_DIR=/path/to/cache` to override the default `~/.dap-cli/adapters/` (useful for shared CI caches or air-gapped pre-staged installs).

See [docs/adapter-setup.md](docs/adapter-setup.md) for the full reference — pinned versions, cache layout, concurrency model, proxy support, the `provision_*` error catalogue, troubleshooting, and custom adapter configuration.

> **Repo contributors:** `npm run setup-adapters` still works as a dev wrapper around `dap-cli setup-adapters`; end users should use the CLI subcommand directly.

## Install the agent skill

The repo includes an [Open Plugins](https://open-plugins.com/) plugin. The [SKILL.md](dap-cli/skills/dap-cli/SKILL.md) teaches your agent how to use the CLI — common commands, the polling loop, breakpoint verification, and language-specific gotchas for `js-debug`, `debugpy`, Delve, and CodeLLDB.

**VS Code (Copilot Chat agent mode):**

1. Run **Chat: Install Plugin from Source**.
2. Enter `roblourens/dap-cli`.

**Claude Code / Copilot CLI / other Open Plugins hosts:**

```text
/plugin install roblourens/dap-cli
```

## Quick taste

The philosophy: drive the target with explicit commands, poll `status` for state changes, every reply is a JSON envelope. Pass `--human` for human-readable output.

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

## Multiple sessions

dap-cli is able to be running several debug sessions at once. Pass `--name <session>` to target one explicitly; when omitted, commands act on the active session (the most recent one, or whatever was set with `dap-cli use <name>`).

```bash
dap-cli launch --program api.js --name api
dap-cli launch --program worker.js --name worker
dap-cli status --name api
dap-cli close api
```

## Going deeper

Most of what an agent needs lives in [the SKILL.md](dap-cli/skills/dap-cli/SKILL.md). For longer-form material:

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
