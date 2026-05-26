# Adapter Setup

This is the full reference for how dap-cli provisions, caches, and configures debug adapters. Most users only need the install snippet in the project [README](../README.md#install-the-cli); read this page when you need to debug a provisioning failure, work behind a proxy, point dap-cli at a pre-staged cache, or wire up a custom adapter.

## Overview

dap-cli ships three built-in adapter IDs:

| ID | Runtime | Upstream |
| --- | --- | --- |
| `js-debug` | Node.js, Chrome, Electron, browsers | [`microsoft/vscode-js-debug`](https://github.com/microsoft/vscode-js-debug) |
| `debugpy` | Python | [`microsoft/debugpy`](https://github.com/microsoft/debugpy) |
| `delve` | Go (Delve) | [`go-delve/delve`](https://github.com/go-delve/delve) |

**Adapter binaries are not bundled with dap-cli.** The first time `dap-cli launch` (or `attach`) needs one, the CLI:

1. checks the local cache (`~/.dap-cli/adapters/<id>/`),
2. if missing, prompts for explicit consent (or honors `--yes` / `DAP_CLI_ASSUME_YES=1`),
3. downloads + verifies + atomically installs the adapter into the cache,
4. records a per-version consent marker so the prompt does not appear again on the next launch.

Only the adapter actually needed for the current session is downloaded; a user who only debugs Python never downloads js-debug or delve. Cached adapters survive `npx` invocations, global installs, and CI restarts — the cache is the source of truth, three install paths share it.

For non-interactive consumers (CI, sealed images, agents in a pipeline), the [`dap-cli setup-adapters`](#the-setup-adapters-subcommand) subcommand pre-warms the cache in one shot.

## Cache layout

The canonical cache root is `~/.dap-cli/adapters/` (overridable; see [Cache override](#cache-override-d-12)):

```text
~/.dap-cli/
└── adapters/
    ├── js-debug/
    │   ├── src/dapDebugServer.js        # adapter entrypoint
    │   ├── package.json                 # contains {"type":"commonjs"} so the CJS adapter loads from ESM-default trees
    │   └── .consent-1.117.0             # zero-byte sentinel marking user consent for this version
    ├── debugpy/
    │   ├── venv/                        # python3 -m venv output; debugpy installed via pip inside
    │   │   ├── bin/python               # (Scripts/python.exe on Windows)
    │   │   └── ...
    │   └── .consent-1.8.20
    └── delve/
        ├── dlv                          # extracted binary (dlv.exe on Windows; chmod 0o755 on POSIX)
        └── .consent-v1.26.3
```

Per-adapter sibling sentinels live one level up at `~/.dap-cli/adapters/.<id>.lock-target` (lockfile target) and `.<id>.tmp.<pid>.<hex>/` (staging directories). They never sit inside the canonical adapter directory so the final atomic rename can replace the whole `<id>/` tree in one operation.

## Pinned versions

| Adapter | Pinned version | Source asset |
| --- | --- | --- |
| `js-debug` | `1.117.0` | `https://github.com/microsoft/vscode-js-debug/releases/download/v1.117.0/js-debug-dap-v1.117.0.tar.gz` |
| `debugpy` | `1.8.20` | `pip install debugpy==1.8.20` (PyPI) |
| `delve` | `v1.26.3` | `https://github.com/go-delve/delve/releases/download/v1.26.3/dlv_<version>_<platform>.<ext>` |

Versions are constants in [`src/adapters/provision/checksums.ts`](../src/adapters/provision/checksums.ts). Bumping a version requires:

1. Edit the constant in `checksums.ts`.
2. Run [`scripts/dev/regen-checksums.ts`](../scripts/dev/regen-checksums.ts) to download each pinned artifact and print the new SHA-256 table.
3. Paste the table back into `checksums.ts` (the manual step is deliberate — D-21 — so the diff is human-reviewed).
4. Run `npm run check`.

When a version bumps, every user re-prompts on next launch because the consent marker is keyed by version (`.consent-<version>`). Wiping `~/.dap-cli/adapters/<id>/` has the same effect.

## The `setup-adapters` subcommand

`dap-cli setup-adapters` (D-13) is the canonical pre-warm entry point. Behaviour summary:

```bash
dap-cli setup-adapters                            # interactive: one prompt naming every pending adapter (D-14)
dap-cli setup-adapters --yes                      # non-interactive: install everything missing
dap-cli setup-adapters --adapter js-debug         # single adapter (interactive)
dap-cli setup-adapters --adapter js-debug --yes   # single adapter, no prompt
```

The subcommand classifies adapters as `pending` (no consent marker OR missing entrypoint) vs `cached` BEFORE prompting, so a warm cache prints `cached` for everything and never asks. The single consolidated prompt names every pending adapter:

```text
Install 3 adapters (js-debug 1.117.0, debugpy 1.8.20, delve v1.26.3) into ~/.dap-cli/adapters/?
Proceed? [y/N]
```

On partial failure the action returns a `SetupAdaptersResult` with per-adapter status (`installed` | `cached` | `failed`) and the failing entry's `error.code` / `error.diagnostics`; the CLI then exits with `provision_setup_failed`.

The `npm run setup-adapters` script still works for repo contributors — it delegates to the same `runSetupAdaptersAction` code path. End users should prefer the CLI subcommand directly.

## Consent and `--yes` (D-03 / D-06 / D-18)

The provisioner never downloads anything without an affirmative yes. Three equivalent ways to provide it:

| Mechanism | Where it works | Notes |
| --- | --- | --- |
| Interactive `y` at the prompt | TTY launches and `setup-adapters` | Default answer is `N` (pressing Enter cancels). |
| `--yes` / `-y` flag | `launch`, `attach`, `setup-adapters` | Per-invocation pre-consent. |
| `DAP_CLI_ASSUME_YES=1` env var | Any subcommand | Equivalent to passing `--yes`. `--yes` wins if both are set. |

The prompt goes to **stderr** (not stdout) so redirecting JSON output to a file leaves the prompt visible in the terminal. The consent marker is per-adapter AND per-version, so consenting to `js-debug 1.117.0` does not pre-authorize `js-debug 1.118.0` or `debugpy 1.8.20` (D-04 / D-05).

**Non-TTY fast-fail.** If stdin is not a TTY and neither `--yes` nor `DAP_CLI_ASSUME_YES=1` is set, dap-cli fails fast with structured error:

```text
code: provision_consent_required
diagnostics:
  - Install vscode-js-debug 1.117.0 into ~/.dap-cli/adapters/js-debug/ (~10MB)?
  - Re-run with `--yes` / `-y` or set `DAP_CLI_ASSUME_YES=1` to pre-consent.
```

This is intentional: hanging on a prompt that no one can answer is worse than crashing with a recovery hint. Agents and CI scripts should always pass `--yes` (or set the env var once at the top of the script).

## Cache override (D-12)

```bash
export DAP_CLI_ADAPTERS_DIR=/srv/dap-cli/cache
dap-cli launch --config "Launch App"
```

The override applies to BOTH read (cache lookup) and write (install destination) paths. Use it for:

- **Sealed CI images** — bake the cache into a Docker layer once at image-build time.
- **Shared CI runners** — point every job at a host-volume-mounted cache so the first job warms it for the rest.
- **Air-gapped installs** — populate the directory offline; the consent marker + present entrypoint together mean dap-cli will not prompt or download.
- **Per-project sandboxes** — point at a project-local directory under your worktree.

When unset, dap-cli falls back to `~/.dap-cli/adapters/` (which itself respects `DAP_CLI_HOME` if set).

## Concurrency, lockfiles, and recovery (D-08 / D-19)

Multiple dap-cli processes can race to install the same adapter (e.g. parallel CI jobs, two terminals running `setup-adapters` at once, an editor warming the cache while you launch by hand). The provisioner serializes per-adapter installs with a sibling lockfile at `~/.dap-cli/adapters/.<id>.lock-target`:

- Each process tries to acquire the lock; up to ~60 retries on ~1.5s intervals.
- **Wait timeout: 90 seconds.** If still blocked after that, the process exits with `provision_lock_timeout` and the diagnostic names the sentinel path.
- **Stale-lock threshold: 5 minutes.** A lockfile whose timestamp is older than 5 minutes is treated as abandoned and forcibly stolen.

Inside the lock the provisioner re-checks the cache (under-lock double-check), then stages into `.<id>.tmp.<pid>.<hex>/`, verifies the expected entrypoint exists, and atomically renames the staging directory into place. A killed process leaves at most a temp directory; the canonical `~/.dap-cli/adapters/<id>/` is never half-installed.

**Recovery from a stuck lock:** if you know no other process is running and `provision_lock_timeout` keeps firing, delete the sentinel path printed in the error diagnostic:

```bash
rm ~/.dap-cli/adapters/.js-debug.lock-target
```

Then re-run.

## Network and proxy support (D-09)

Downloads honor the standard proxy environment variables:

| Variable | Effect |
| --- | --- |
| `HTTPS_PROXY` / `https_proxy` | Proxy for `https://` URLs (js-debug, delve, GitHub API). |
| `HTTP_PROXY` / `http_proxy` | Proxy for `http://` URLs only. |
| `NO_PROXY` / `no_proxy` | Comma-separated bypass list; supports exact hosts and suffix domains (`github.com` matches `foo.github.com`). |

When `HTTPS_PROXY` is set but the proxy refuses the connection, the error is `provision_proxy_error` (not `provision_network_error`) so the recovery message can point at proxy config. Proxy URLs are sanitized in diagnostics: `user:pass@` credentials and `?query` strings are stripped before any URL is rendered into stderr or `data{}`.

**GitHub rate limits.** Both js-debug and delve download from GitHub releases. Unauthenticated requests share a small per-IP quota. To raise it:

```bash
export GITHUB_TOKEN=ghp_xxx
dap-cli setup-adapters --yes
```

The provisioner attaches the token as `Authorization: Bearer <token>` for github.com hosts.

**Air-gapped / mirror.** There is no per-adapter URL override env var. The supported path is to pre-populate `DAP_CLI_ADAPTERS_DIR` from an internal mirror and let dap-cli short-circuit the download.

## Error code reference

The provisioner emits exactly the 13 `provision_*` codes below (D-15). Each carries a `code`, a human-readable `diagnostics` array, and a structured `data{}` payload for programmatic consumers. The canonical source of truth lives in [`tests/adapters/provision/errorSnapshots.test.ts`](../tests/adapters/provision/errorSnapshots.test.ts), which inline-snapshots every envelope.

| Code | When it fires | Recovery |
| --- | --- | --- |
| `provision_consent_required` | Non-TTY launch without `--yes` / `DAP_CLI_ASSUME_YES=1`. | Re-run with `--yes` or `DAP_CLI_ASSUME_YES=1`. |
| `provision_consent_declined` | User answered no to the prompt. | Re-run and answer `y`, or pass `--yes`. |
| `provision_network_error` | HTTP failure (DNS, connection refused, 4xx/5xx). | Check connectivity; check the URL in `data.url`; retry. |
| `provision_proxy_error` | Proxy fetch failed (proxy refused / unreachable). | Verify `HTTPS_PROXY`; bypass with `NO_PROXY=github.com`. |
| `provision_rate_limited` | GitHub returned 403 with `X-RateLimit-Remaining: 0`. | Set `GITHUB_TOKEN`, or wait for the reset window. |
| `provision_checksum_mismatch` | Downloaded archive's SHA-256 did not match the pinned table. | Re-run (transient corruption). If persistent, [file an issue](https://github.com/roblourens/dap-cli/issues) — possible supply-chain anomaly. |
| `provision_python3_missing` | `python3` not on `PATH` (debugpy only). | Install Python 3.8+ (`brew install python` / `apt install python3`). |
| `provision_python3_venv_unavailable` | `python3 -m venv` failed (Debian-derived distros split this out). | `apt install python3-venv`. |
| `provision_pip_install_failed` | `pip install debugpy==<v>` exited non-zero. | Inspect stderr tail in `diagnostics`; set `PIP_INDEX_URL` to a mirror. |
| `provision_arch_unsupported` | Detected `<platform>_<arch>` is not in the delve platform matrix. | See supported set in the diagnostic; manually provide a `dlv` on `PATH`. |
| `provision_cache_unwritable` | `mkdir` / `writeFile` / `lockfile.lock` hit `EACCES` / `EROFS` / `ENOSPC` / `EPERM`. | Override `DAP_CLI_ADAPTERS_DIR` to a writable path. |
| `provision_lock_timeout` | Another process held the per-adapter lock for >90s. | Wait, or delete the sentinel path named in the diagnostic. |
| `provision_extract_failed` | Archive corrupt OR rejected by the safe extractor (zip-slip, absolute path, drive letter, symlink). | Re-run (transient); if persistent, file an issue. |

## Troubleshooting

**"It downloaded once and I want to re-prompt for the same version."**

```bash
rm ~/.dap-cli/adapters/<id>/.consent-<version>
# e.g.
rm ~/.dap-cli/adapters/js-debug/.consent-1.117.0
```

The next launch will prompt again. The cached binary is left in place, so consenting is essentially free.

**"I want to wipe and reinstall."**

```bash
rm -rf ~/.dap-cli/adapters/<id>/
```

Removes both the binary and the consent marker. Next launch behaves like a fresh machine.

**"I want to disable provisioning entirely (offline / air-gapped)."**

Pre-stage the adapter into `DAP_CLI_ADAPTERS_DIR` so both the consent marker and the expected entrypoint already exist. The provisioner short-circuits before any network call:

```bash
export DAP_CLI_ADAPTERS_DIR=/srv/dap-cli/cache
mkdir -p "$DAP_CLI_ADAPTERS_DIR/js-debug/src"
cp -r /path/to/staged/js-debug/* "$DAP_CLI_ADAPTERS_DIR/js-debug/"
touch "$DAP_CLI_ADAPTERS_DIR/js-debug/.consent-1.117.0"
```

**"The prompt fires every time."**

Either the consent marker is missing, or the entrypoint is missing (a partially-installed cache forces re-prompt). Verify both files exist:

```bash
ls -la ~/.dap-cli/adapters/js-debug/.consent-1.117.0
ls -la ~/.dap-cli/adapters/js-debug/src/dapDebugServer.js
```

**"My agent is hanging on a prompt."**

Pass `--yes` or set `DAP_CLI_ASSUME_YES=1`. If you've done that and it still hangs, you've hit a bug — file an issue with the captured invocation.

**Delve attach diagnostics.**

Delve attach uses adapter-native start arguments (e.g., `--json '{"mode":"local","processId":12345}'`). If the adapter cannot be located on PATH and provisioning is disabled, the failure surfaces as `delve_not_found` — install Delve via `setup-adapters --adapter delve`, or expose a compatible `dlv` on `PATH`. The error names both recovery paths.

**"Tests pass but the published binary fails."**

Run [`dev/smoke/hand-driven-smoke.md`](../dev/smoke/hand-driven-smoke.md) Sequence C against the published tarball. The hand-driven smoke catches things the test harness wraps around (real TTY, real network, real filesystem permissions).

## Security notes

- **SHA-256 verification** is enforced for js-debug and delve. The pinned checksum table is embedded in [`src/adapters/provision/checksums.ts`](../src/adapters/provision/checksums.ts) and an architecture test (`tests/architecture/moduleBoundaries.test.ts`) refuses to compile placeholder / non-64-hex constants.
- **debugpy** is delegated to `pip`, which performs its own wheel hash verification against PyPI.
- **No shell-out to `tar` or `unzip`.** Extraction goes through `tar@7` (tar.gz) and `yauzl@3` (zip) in-process. An architecture test forbids `spawn`/`exec` of `tar` / `unzip` / `gzip` from any provisioning module (D-11).
- **Zip-slip and symlink rejection.** The extractor refuses entries with `..` path components, POSIX-absolute entry names, Windows drive letters, or POSIX symlink modes (`0o120000` in the upper 16 bits of `externalFileAttributes`). Snapshot-tested.
- **URL sanitization.** Credentials (`user:pass@`) and query strings (`?token=secret`) are stripped from every URL rendered into stderr or `data{}`. Snapshot-tested.
- **Atomic install.** Downloads stage into a sibling temp directory and are only renamed into the canonical location after the expected entrypoint is verified. A killed install leaves at most a temp directory, never a half-installed cache.

## Custom Adapters

Custom adapters are declared in dap-cli's adapter config at:

```bash
$DAP_CLI_HOME/config/adapters.json
```

(If `DAP_CLI_HOME` is unset, dap-cli uses `~/.dap-cli`.) Custom adapters are user-managed — dap-cli does not provision them.

### Stdio adapter

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
        "env": { "NODE_ENV": "development" }
      },
      "launchDefaults": { "type": "node", "request": "launch" },
      "attachDefaults": { "type": "node", "request": "attach" }
    }
  },
  "launchConfigTypeMap": { "node": "custom-node" }
}
```

Launch with the custom adapter:

```bash
dap-cli launch --adapter custom-node --program app.js --name custom-demo
```

### Socket adapter

Socket adapters must bind to localhost.

```json
{
  "adapters": {
    "socket-debugger": {
      "id": "socket-debugger",
      "label": "Socket debugger",
      "transport": { "kind": "socket", "host": "127.0.0.1", "port": 4711 }
    }
  }
}
```

```bash
dap-cli attach --adapter socket-debugger --name socket-demo
```

## Adapter / type inference

`--adapter` and `--type` are optional on `dap-cli launch` and `dap-cli attach`. When omitted, dap-cli infers the missing pieces from `--program` (extension) and from each other (`--type` → adapter via `launchConfigTypeMap`; `--adapter` → default DAP type). Explicit flags always win.

Extension table (matched against `path.extname(program).toLowerCase()`):

| Extension | Inferred adapter | Inferred DAP type |
| --- | --- | --- |
| `.py` | `debugpy` | `python` |
| `.go` | `delve` | `go` |
| `.js`, `.mjs`, `.cjs` | `js-debug` | `pwa-node` |
| `.ts`, `.mts`, `.cts` | `js-debug` | `pwa-node` |
| `.html`, `.htm` | `js-debug` | `pwa-chrome` |

Adapter-only defaults (used when only `--adapter` is given):

| Adapter | Default type when only `--adapter` is given |
| --- | --- |
| `js-debug` | `pwa-node` (`pwa-chrome` if `--program` ends in `.html`/`.htm`) |
| `debugpy` | `python` |
| `delve` | `go` |
| custom | no default — pass `--type` explicitly |

An unsupported program extension produces a `usage_error` with code `adapter_inference_failed`. When `--adapter`, `--type`, `--program`, and `--config` are all absent, dap-cli falls back to the built-in `fake` adapter (legacy test/sandbox behaviour).

## Launch config type mapping

Use `launchConfigTypeMap` when `.vscode/launch.json` uses a custom `type` value:

```json
{ "launchConfigTypeMap": { "myRuntime": "custom-node" } }
```

Then launch by configuration name:

```bash
dap-cli launch --config "Debug App" --name app
```

## Auto-routing `launch` vs `attach` by `--config`

When `--config <name>` is used, the launch.json configuration's `request:` field is the source of truth. If it differs from the CLI verb, dap-cli auto-routes to the matching DAP request and emits a structured warning. The verb is a fallback when the config has no `request:` field.

| CLI verb | `config.request` | Action |
| --- | --- | --- |
| `launch` | `attach` | Routes to DAP `attach`, emits `autoRouted` warning. |
| `attach` | `launch` | Routes to DAP `launch`, emits `autoRouted` warning. |
| `launch` | `launch` | Sends DAP `launch`. Silent. |
| `attach` | `attach` | Sends DAP `attach`. Silent. |
| either | (missing) | Uses the verb. Silent (back-compat). |

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

JSON consumers should read `autoRouted` for machine-readable detection. Compound members continue to honor each member's `request:` field.

## Layering extra fields onto `--config`

`--json-overrides <json>` and `--resolve-source-maps <pattern...>` let you layer fields on top of a named config without rebuilding the entire payload.

Precedence (highest wins):

1. CLI flags (`--program`, `--cwd`, `--out-files`, `--resolve-source-maps`, `--source-maps`, …).
2. `--json <json>` — adapter-native config object.
3. `--json-overrides <json>` — extra fields layered on top of the named config.
4. `--config <name>` — the resolved entry from `.vscode/launch.json`.
5. Adapter defaults — `launchDefaults` / `attachDefaults` from `.dap-cli/adapter-config.json`.

The merge is **shallow** — nested objects (such as `env: { ... }`) are replaced wholesale.

Worked example: layering `sourceMaps:true` + `resolveSourceMapLocations` onto the vscode repo's `Attach to Agent Host Process` config:

```bash
dap-cli launch \
  --workspace . \
  --config "Attach to Agent Host Process" \
  --resolve-source-maps '**' '!**/node_modules/**' \
  --json-overrides '{"sourceMaps":true}'
```

dap-cli auto-routes to DAP `attach` (per the named config's `request:'attach'`), then sends a payload containing `outFiles` (from the config), `sourceMaps:true` (from `--json-overrides`), `resolveSourceMapLocations:['**','!**/node_modules/**']` (from `--resolve-source-maps`, highest layer), and the locked `request:'attach'`. `--json-overrides` cannot bypass the auto-route: a `--json-overrides '{"request":"launch"}'` is silently overwritten by the config's `request:` at the tail.
