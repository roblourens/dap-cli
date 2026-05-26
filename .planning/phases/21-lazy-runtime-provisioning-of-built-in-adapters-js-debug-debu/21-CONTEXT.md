# Phase 21: Lazy Runtime Provisioning of Built-in Adapters - Context

**Gathered:** 2026-05-25
**Status:** Ready for planning
**Source:** Synthesized from `/gsd-explore` discussion of adapter installation gap

<domain>
## Phase Boundary

Phase 21 closes the install-path gap discovered during exploration: today `npm i -g @roblourens/dap-cli`, `npx @roblourens/dap-cli`, and the agent-skill install route all leave the user one step away from a working CLI because none of them ship the adapter binaries (js-debug, debugpy, delve). The `scripts/setup-adapters.ts` provisioner exists but is dev-only — it is not in `package.json`'s `files` allowlist and is not callable from the published tarball. The phase makes built-in adapters install lazily on first use, with explicit user confirmation, concurrency-safe install into `~/.dap-cli/adapters/`, and clear actionable failure surfaces.

The phase is bounded to the built-in adapter path. Custom adapters declared via `dap-cli.adapters.json` remain user-managed (out of scope). Adapter behavior, descriptors, protocol routing, and CLI surface are unchanged — only the provisioning layer in `src/adapters/builtins/*.ts` and a new `src/adapters/provision/` module are in scope.

</domain>

<decisions>
## Implementation Decisions

### Trigger and Dispatch
- **D-01:** Provisioning is lazy and per-adapter, triggered the first time `AdapterRegistry.resolve(id)` in [src/adapters/registry.ts](src/adapters/registry.ts#L68) needs an adapter whose binary is missing. The descriptor factories (`createJsDebugDescriptor`, `createDebugpyDescriptor`, `createDelveDescriptor`) own the missing-binary detection and call into the new provisioner.
- **D-02:** Only the adapter actually needed for the current session is downloaded. A user who only debugs JavaScript never downloads debugpy or delve.

### User Consent
- **D-03:** Before any network download, dap-cli MUST prompt the user with a clear summary of what will be downloaded (adapter name, version, source URL, approximate size, install location) and require explicit confirmation. The default is "no" — Enter without input cancels.
- **D-04:** Consent is per-adapter (downloading js-debug does not pre-authorize debugpy).
- **D-05:** Consent is one-time per adapter version: a marker file in the adapter cache records that the user agreed to download `js-debug@1.117.0`; re-prompting only happens on a version bump or cache wipe.
- **D-06:** The confirmation MUST work without a TTY. Non-interactive callers (agents, CI, scripts piping output) need a deterministic answer. Resolution:
  - `--yes` / `-y` flag on `launch` / `attach` / `setup-adapters` to pre-consent
  - `DAP_CLI_ASSUME_YES=1` env var equivalent
  - When stdin is not a TTY AND neither flag/env is set, fail fast with a structured error pointing the user at the flag and env var rather than hanging on a prompt nobody can answer.

### Cache and Concurrency
- **D-07:** Install target is `~/.dap-cli/adapters/<adapter-id>/` (the existing path used by `setup-adapters.ts` and `getDapCliAdaptersDir`). This persists across `npx` invocations and is shared by `npm i -g` and the agent-skill install path — three install paths, one cache.
- **D-08:** Parallel `dap-cli` invocations MUST NOT corrupt the cache. The provisioner uses a per-adapter lockfile (acquire-or-wait, with timeout) and stages extracted files into `~/.dap-cli/adapters/<id>.tmp.<pid>/`, then atomically renames into place on success.
- **D-09:** On staging failure, the temp directory is cleaned up; a partial cache is never left in the canonical location.

### Code Location and Packaging
- **D-10:** Provisioning logic moves out of `scripts/setup-adapters.ts` and into `src/adapters/provision/` so it ships in the published `dist/` bundle. The existing dev script becomes a thin wrapper that imports from `src/`.
- **D-11:** Provisioner MUST NOT shell out to `tar` or `unzip`. Today's `scripts/setup-adapters.ts` calls `spawnSync('tar', ...)` which is fine on macOS/Linux dev machines but fragile on Windows and unreviewed for the production install path. Replace with an in-process Node implementation (e.g. `tar` package) or document a hard Node 22+ baseline and use built-in streams; decision deferred to research.

### Escape Hatches and CI Path
- **D-12:** `DAP_CLI_ADAPTERS_DIR` env var overrides the default cache location. Pre-staged installs (Docker images, corporate base images, monorepo `node_modules` mirror) point this at a populated directory and skip download entirely.
- **D-13:** `dap-cli setup-adapters` becomes a top-level CLI subcommand (replacing/superseding the `npm run setup-adapters` script) for eager prewarm. CI Dockerfiles and onboarding scripts call this once to populate the cache before any debug session runs.
- **D-14:** `dap-cli setup-adapters` accepts `--adapter <id>` (single adapter), no flag (all adapters), and `--yes` (skip confirmation). When run from a TTY without `--yes`, it confirms once for the full set rather than per-adapter.

### Failure Surfaces
- **D-15:** Lazy provisioning moves failure from "I'm installing" time to "I'm trying to debug" time — failure messages MUST be specific enough that a user can resolve them without reading source. At minimum:
  - Network unreachable / DNS failure: distinguish from HTTP 4xx/5xx.
  - GitHub rate limit (HTTP 403 with `X-RateLimit-Remaining: 0`): explicit message + retry-after.
  - Corporate proxy (HTTPS_PROXY/HTTP_PROXY honored; explicit error if request fails with a clear "proxy may be required" hint).
  - Missing `python3` (debugpy only): explicit error with install instructions per OS.
  - OS/arch mismatch (delve only): explicit error naming the detected platform.
  - Cache directory unwritable: explicit error with `DAP_CLI_ADAPTERS_DIR` workaround.

### README and Documentation
- **D-16:** The README claim "The first time the agent uses an adapter, dap-cli provisions it" ([README.md](README.md#L22)) becomes accurate. Update the install section to explicitly document the consent prompt, the `--yes` flag, and the `DAP_CLI_ADAPTERS_DIR` escape hatch.

### the agent's Discretion
- Exact lockfile mechanism (`proper-lockfile` dep vs `fs.mkdir` atomic vs `flock` shell-out): defer to research, pick based on cross-platform reliability and dep weight. **Resolved by research:** `proper-lockfile@4.1.2`.
- Exact archive extraction library (`tar` package vs `node-tar` vs streams + zlib): defer to research, must work in-process and on Windows. **Resolved by research:** `tar@7.x` for tar.gz, `yauzl@3.x` for zip.
- Whether to verify downloaded archive SHA-256 against a checksum manifest embedded in the published CLI. Strongly recommended for supply-chain hygiene but adds maintenance burden on version bumps. **Resolved (Q5):** YES, embed in source; maintain via `scripts/dev/regen-checksums.ts` helper run manually on adapter version bumps.
- Progress UI during download: spinner vs percentage vs simple "downloading..." line. Stderr only, never stdout (must not pollute JSON output mode).

### Confirmed Answers to Research Questions (2026-05-25)

- **D-17 (Q1):** `AdapterRegistry.resolve()` is converted to async. Do NOT add a parallel `resolveProvisioned()` — having two methods is a footgun that lets callers silently bypass provisioning. All ~6 call sites are already in async functions; migration is mechanical.
- **D-18 (Q2):** `--yes` / `-y` flag and `DAP_CLI_ASSUME_YES=1` env var work on **all three** of `launch`, `attach`, and `setup-adapters`. The agent-skill install path needs `dap-cli launch --yes` to self-provision on first use without a separate prewarm step.
- **D-19 (Q3):** Lockfile wait timeout is **90 seconds** (~60 retries × ~1.5s). Stale-lock threshold remains 5 minutes (longer than any plausible download).
- **D-20 (Q4):** Consent markers are **sentinel files inside the adapter dir**: `~/.dap-cli/adapters/<id>/.consent-<version>` (zero-byte). Self-cleaning — wiping the adapter dir invalidates consent, which is correct (re-install = re-prompt). No centralized `consents.json`.
- **D-21 (Q5):** SHA-256 checksum table is embedded in published source at `src/adapters/provision/checksums.ts`. Maintained manually via `scripts/dev/regen-checksums.ts` (new helper) — downloads each pinned artifact, computes SHA-256, prints the updated table for paste-in. Run as part of the version-bump runbook. Not enforced at build time (no known-good baseline to diff against).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project Scope
- `.planning/PROJECT.md` — product goals around agent-facing CLI, low-friction install
- `.planning/ROADMAP.md` — Phase 21 entry, depends on Phase 20

### Current Provisioning Code (the "before" state)
- [scripts/setup-adapters.ts](scripts/setup-adapters.ts) — dev-only provisioner; logic to be lifted into `src/`
- [src/adapters/builtins/jsDebug.ts](src/adapters/builtins/jsDebug.ts) — `createJsDebugDescriptor` + `resolveDefaultJsDebugPath` (throws `js_debug_not_found` today)
- [src/adapters/builtins/debugpy.ts](src/adapters/builtins/debugpy.ts) — debugpy descriptor + missing-binary error
- [src/adapters/builtins/delve.ts](src/adapters/builtins/delve.ts) — delve descriptor + missing-binary error
- [src/adapters/registry.ts](src/adapters/registry.ts#L68) — `resolve(id)` is the dispatch point
- [src/config/paths.ts](src/config/paths.ts) — `getDapCliHome`, `getDapCliAdaptersDir`, `getDapCliVenvPythonPath`
- [package.json](package.json) — `"files"` allowlist (currently `["dist/", "README.md", "LICENSE"]`), `"bin"` entry, npm scripts

### Documentation to Update
- [README.md](README.md#L22) — install section
- [docs/adapter-setup.md](docs/adapter-setup.md) — adapter setup reference

### Prior Related Phases
- Phase 3 (`.planning/phases/03-built-in-and-custom-adapter-support/03-CONTEXT.md`) — original adapter architecture; D-05/D-07 established js-debug as built-in via source/build artifacts
- Phase 20 (`.planning/phases/20-i-d-like-to-find-another-runtime-that-we-can-debug-we-should/20-RESEARCH.md`) — delve provisioning, established `~/.dap-cli/adapters/delve/` layout

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `scripts/setup-adapters.ts` already implements working download + extract + venv-create logic for all three adapters. The work is mostly relocating and hardening it, not rewriting from scratch.
- `getDapCliAdaptersDir()` in `src/config/paths.ts` is the single canonical path helper; no new path resolution is needed.
- `cli/errors.ts` `usageError(...)` is the established structured-error pattern (code, diagnostics, exit code). New provisioner failures fit this shape.

### Established Patterns
- All built-in adapter descriptors live in `src/adapters/builtins/`. New `src/adapters/provision/<adapter>.ts` is a parallel directory, one module per adapter, matching the existing structure.
- Structured stderr JSON errors with a `code` field are how dap-cli surfaces handled failures (`js_debug_not_found`, `debugpy_not_found`, `delve_not_found` are existing codes). New codes: `provision_consent_required`, `provision_consent_declined`, `provision_network_error`, `provision_proxy_error`, `provision_rate_limited`, `provision_arch_unsupported`, `provision_cache_unwritable`, `provision_lock_timeout`.
- Tests for adapter-installation flows use isolated `DAP_CLI_HOME` via `tests/testing/tempEnv.ts` and a fake-adapter-style fixture. Provisioning tests should follow the same pattern with a fake HTTP server stand-in for GitHub releases / PyPI.

### Integration Points
- The `--yes` / `-y` flag is a global CLI concern (`launch`, `attach`, `setup-adapters` all need it). Add via the commander program in `src/cli/program.ts` rather than per-command.
- `DAP_CLI_ASSUME_YES`, `DAP_CLI_ADAPTERS_DIR` env vars read via `src/config/paths.ts` (or a new `src/config/env.ts` if path-specific).
- The new `setup-adapters` subcommand lives in `src/cli/commands/setupAdapters.ts` alongside other commands; the existing npm script becomes a wrapper.

</code_context>

<specifics>
## Specific Ideas

- The conversation explicitly settled on **confirmation by default** over silent download. Implementation must respect this even though it adds friction; the `--yes` flag is the explicit opt-out for the (very common) non-interactive case.
- The hardest UX cost of "lazy + confirm" is non-TTY contexts (agents, CI). The plan must not just handle this — it must make it discoverable: when the prompt would be needed but can't be answered, the error message MUST literally name `--yes` and `DAP_CLI_ASSUME_YES=1`.
- `npx` is a first-class supported install path. The plan must verify the lazy provisioner does not re-download on every `npx` invocation (the persistent `~/.dap-cli/adapters/` cache makes this work, but it needs an automated test that runs `npx` twice and asserts only one download).
- Hand-driven smoke (per `dev/smoke/hand-driven-smoke.md`) must be extended with a fresh-machine scenario: wipe `~/.dap-cli/`, run `npx @roblourens/dap-cli launch --config "TypeScript Mini"`, observe consent prompt, answer yes, observe install, observe successful debug session. This is the contract the phase ships against.
- Pre-publish check (in `npm run check` or `prepublishOnly`) must assert that the published tarball does NOT regress to depending on `scripts/setup-adapters.ts`. Test: `npm pack`, extract, run a smoke scenario from the extracted tree.

</specifics>

<deferred>
## Deferred Ideas

- Adapter version self-update (e.g., a `dap-cli adapters update` subcommand): the version is currently pinned in code, and bumping requires a CLI release. Deferred.
- Mirror / private-registry support beyond `DAP_CLI_ADAPTERS_DIR` (e.g., custom download URL per adapter for air-gapped environments). Deferred — covered by the env var escape hatch for now.
- Custom adapter auto-install (downloading non-built-in adapters listed in `dap-cli.adapters.json`). Out of scope; custom adapters remain user-managed.
- Signed archives / Sigstore attestation. Deferred — SHA-256 checksum verification (D-?) is the realistic supply-chain bar for this phase.

</deferred>

---

*Phase: 21-Lazy Runtime Provisioning of Built-in Adapters*
*Context gathered: 2026-05-25 (synthesized from `/gsd-explore` discussion, no separate `/gsd-discuss-phase` run)*
