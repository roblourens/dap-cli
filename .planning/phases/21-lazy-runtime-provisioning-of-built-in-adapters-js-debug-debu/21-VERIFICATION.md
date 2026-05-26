---
phase: 21-lazy-runtime-provisioning-of-built-in-adapters-js-debug-debu
verified: 2026-05-25T23:15:00Z
status: passed
score: 12/12 must-haves verified
overrides_applied: 0
re_verification: null
---

# Phase 21: Lazy Runtime Provisioning Verification Report

**Phase Goal:** Make `npm i -g @roblourens/dap-cli` (or `npx`) sufficient to debug Node, Python, and Go on a fresh machine: on first launch/attach the CLI prompts once (or accepts `--yes` / `DAP_CLI_ASSUME_YES=1`), then downloads, SHA-256 verifies, and atomically installs the relevant built-in adapter into `~/.dap-cli/adapters/<id>/` (overridable via `DAP_CLI_ADAPTERS_DIR`); concurrent installs are lockfile-serialized; every failure surface emits a structured `provision_*` error with actionable diagnostics.

**Verified:** 2026-05-25T23:15:00Z
**Status:** passed
**Re-verification:** No — initial verification

## Must-Haves Derivation

ROADMAP success criteria for phase 21 is empty (`success_criteria: []`); REQUIREMENTS.md does not exist; no plan declares a `must_haves:` block. Must-haves are derived from the goal sentence (Option C), the orchestrator's phase summary, and the locked decisions D-01..D-21 in [21-CONTEXT.md](21-CONTEXT.md).

| # | Truth | Source |
| - | --- | --- |
| 1 | All three built-in adapters (js-debug, debugpy, delve) lazily provision on first use without per-call dev-script involvement | Goal; D-01, D-02, D-10 |
| 2 | First-use prompts the user once and accepts `y/yes` / declines on Enter | Goal; D-03 |
| 3 | `--yes` / `-y` CLI flag and `DAP_CLI_ASSUME_YES=1` env both bypass the prompt | Goal; D-06, D-18 |
| 4 | Non-TTY callers without `--yes` / env fail fast with `provision_consent_required` (not a hang) | Goal; D-06 |
| 5 | Downloads are SHA-256 verified against an embedded checksum table | Goal; D-21 |
| 6 | Install is atomic: stage-and-rename via a sibling `.tmp` directory; no partial install left in canonical path on failure | Goal; D-08, D-09 |
| 7 | Install target is `~/.dap-cli/adapters/<id>/`, overridable via `DAP_CLI_ADAPTERS_DIR` | Goal; D-07, D-12 |
| 8 | Concurrent dap-cli invocations serialize on a per-adapter lockfile (not corrupted; one download wins) | Goal; D-08, D-19 |
| 9 | Per-version consent marker (`.consent-<version>`) records the download and survives re-launches | D-05, D-20 |
| 10 | Every failure surface emits a `provision_*`-prefixed CliError envelope with actionable diagnostics | Goal; D-15 |
| 11 | `dap-cli setup-adapters` subcommand exists and pre-warms the cache, with `--adapter <id>` selection and consolidated consent | D-13, D-14 |
| 12 | Provisioning ships in the published bundle (no shell-out to `tar`/`unzip`; lives in `src/`, not `scripts/`); user docs (README + adapter-setup.md) describe the new UX and hand-driven smoke covers Sequence C end-to-end | D-10, D-11, D-16; phase ROADMAP "Plans 6/6" |

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
| - | --- | ------ | -------- |
| 1 | All three adapters lazily provision on first use | ✓ VERIFIED | [src/adapters/builtins/jsDebug.ts](src/adapters/builtins/jsDebug.ts#L85-L90), [src/adapters/builtins/debugpy.ts](src/adapters/builtins/debugpy.ts#L57), [src/adapters/builtins/delve.ts](src/adapters/builtins/delve.ts#L56) all call `provisionAdapter(...)` when the binary path is missing. `AdapterRegistry.resolve` is async ([src/adapters/registry.ts](src/adapters/registry.ts#L67)) and awaits the descriptor factory (D-17). |
| 2 | First-use prompts once, defaults to "no" | ✓ VERIFIED | [src/cli/confirm.ts](src/cli/confirm.ts#L30-L48): writes `<question>\n  <details>\nProceed? [y/N] ` to stderr, reads from stdin, accepts only `y`/`yes`. Empty reply (Enter) hits the `provision_consent_declined` branch. Sequence C1+C2 in [21-UAT.md](21-UAT.md) captures the live prompt and a real install. |
| 3 | `--yes` and `DAP_CLI_ASSUME_YES=1` bypass the prompt | ✓ VERIFIED | [src/cli/program.ts](src/cli/program.ts#L55) registers `-y, --yes` at program level; preAction hook ([src/cli/program.ts](src/cli/program.ts#L62-L67)) bridges to `process.env.DAP_CLI_ASSUME_YES='1'`. [src/cli/confirm.ts](src/cli/confirm.ts#L52-L58) `resolveAssumeYes` returns true on either input; `confirm` short-circuits at line 13. Sequence C6 in [21-UAT.md](21-UAT.md) captures the env-var path: empty adapters dir + `DAP_CLI_ASSUME_YES=1` → fresh install, no prompt. |
| 4 | Non-TTY without consent fails fast | ✓ VERIFIED | [src/cli/confirm.ts](src/cli/confirm.ts#L20-L29) throws `usageError('Confirmation required but stdin is not a TTY.', { code: 'provision_consent_required', ... })` when `stdin.isTTY !== true` and assumeYes is false. Sequence C5b in [21-UAT.md](21-UAT.md) captures the literal envelope from a real `node dist/index.js` invocation, including the `--yes` / `DAP_CLI_ASSUME_YES=1` diagnostic. |
| 5 | SHA-256 verification | ✓ VERIFIED | [src/adapters/provision/checksums.ts](src/adapters/provision/checksums.ts) holds the embedded table (`JS_DEBUG_CHECKSUMS`, `DEBUGPY_CHECKSUMS`, `DELVE_CHECKSUMS` per `DELVE_VERSION`+platform). [src/adapters/provision/jsDebug.ts](src/adapters/provision/jsDebug.ts#L29-L37) computes file sha256 and throws `provision_checksum_mismatch` on mismatch (lines 113-128). [scripts/dev/regen-checksums.ts](scripts/dev/regen-checksums.ts) exists for version bumps. Snapshot test [tests/adapters/provision/errorSnapshots.test.ts](tests/adapters/provision/errorSnapshots.test.ts#L253-L278) pins the envelope. |
| 6 | Atomic stage-and-rename install | ✓ VERIFIED | [src/adapters/provision/atomicInstall.ts](src/adapters/provision/atomicInstall.ts#L65-L101): `atomicInstall()` stages into `.<id>.tmp.<pid>.<rand>/`, verifies expected entrypoints exist, then `fs.rename(staging, canonical)`. On any error, staging dir is `fs.rm`-ed and the partial state never lands in the canonical path (line 95). Verified by [tests/adapters/provision/atomicInstall.test.ts](tests/adapters/provision/atomicInstall.test.ts). |
| 7 | Install target `~/.dap-cli/adapters/<id>/` overridable via `DAP_CLI_ADAPTERS_DIR` | ✓ VERIFIED | [src/config/paths.ts](src/config/paths.ts#L24-L33) `getDapCliAdaptersDir(env)`: returns `env.DAP_CLI_ADAPTERS_DIR` if set, else `<DAP_CLI_HOME>/adapters`. Verified by [tests/adapters/provision/cacheRootOverride.test.ts](tests/adapters/provision/cacheRootOverride.test.ts) and [tests/packaging/npxCache.test.ts](tests/packaging/npxCache.test.ts). Sequence C2 in [21-UAT.md](21-UAT.md) shows the install populating the actual `~/.dap-cli/adapters/js-debug/` tree. |
| 8 | Lockfile-serialized concurrent installs | ✓ VERIFIED | [src/adapters/provision/lock.ts](src/adapters/provision/lock.ts#L96): `withAdapterLock(adaptersDir, adapterId, async () => …)` wraps each provisioner using `proper-lockfile`; production retry is 60 × 500-2000ms ≈ 90s (D-19); stale > 5 min. Per-adapter provisioners also double-check the consent marker inside the lock to short-circuit if a parallel caller already installed ([jsDebug.ts](src/adapters/provision/jsDebug.ts#L93-L98), debugpy.ts L70, delve.ts). [tests/adapters/provision/concurrent.test.ts](tests/adapters/provision/concurrent.test.ts#L53-L99) asserts: 4 cold-cache parallel callers → exactly 1 server hit; 4 warm-cache parallel callers → 0 additional fetches. |
| 9 | Per-version consent marker | ✓ VERIFIED | [src/adapters/provision/consent.ts](src/adapters/provision/consent.ts) writes `<adaptersDir>/<id>/.consent-<version>` (ISO timestamp body). Each provisioner reads it at the fast path and writes it after a successful install. Sequence C2 captures the marker file (25 bytes, ISO timestamp); C4 captures the warm-path launch reusing it without re-prompting. |
| 10 | Every failure surface emits `provision_*` envelope with diagnostics | ✓ VERIFIED | All codes from D-15 are present in `src/`: `provision_consent_required`, `provision_consent_declined` ([confirm.ts](src/cli/confirm.ts)), `provision_network_error`, `provision_proxy_error`, `provision_rate_limited` ([http.ts](src/adapters/provision/http.ts)), `provision_checksum_mismatch` (jsDebug/debugpy/delve provisioners), `provision_extract_failed` ([atomicInstall.ts](src/adapters/provision/atomicInstall.ts), extractTarGz, extractZip), `provision_cache_unwritable` ([atomicInstall.ts](src/adapters/provision/atomicInstall.ts#L18), [lock.ts](src/adapters/provision/lock.ts#L46)), `provision_lock_timeout` ([lock.ts](src/adapters/provision/lock.ts#L88)), `provision_arch_unsupported` ([delve.ts](src/adapters/provision/delve.ts#L50)), `provision_python3_missing` (debugpy.ts, errorSnapshots T#L310), `provision_setup_failed` ([setupAdapters.ts](src/cli/commands/setupAdapters.ts#L183)). Each envelope carries `diagnostics: string[]` with actionable hints (override flags, retry instructions, install help). Snapshots pinned in [tests/adapters/provision/errorSnapshots.test.ts](tests/adapters/provision/errorSnapshots.test.ts). |
| 11 | `dap-cli setup-adapters` subcommand | ✓ VERIFIED | [src/cli/commands/setupAdapters.ts](src/cli/commands/setupAdapters.ts) `registerSetupAdaptersCommand` defines `dap-cli setup-adapters --adapter <id>` with `js-debug|debugpy|delve` choices, classifies pending vs cached BEFORE prompting (D-14 consolidated prompt — line 89-103), and emits `provision_setup_failed` on any failure. Registered into the program at [src/cli/program.ts](src/cli/program.ts#L74). Behavioral tests at [tests/cli/setupAdaptersCommand.test.ts](tests/cli/setupAdaptersCommand.test.ts) cover single-adapter install, warm-cache cached path, partial failure, and non-TTY fast-fail. |
| 12 | Ships in published bundle; no shell-out; docs + smoke complete | ✓ VERIFIED | [package.json](package.json#L34) `files` allowlist still ships `dist/` only; the published bundle contains `provisionAdapter` and `withAdapterLock` (verified literally by [tests/packaging/publishedTarball.test.ts](tests/packaging/publishedTarball.test.ts#L86-L105)). Architecture tests pin D-10 (provisioning lives only in `src/adapters/provision/`) and D-11 (no `tar`/`unzip` shell-out) at [tests/architecture/moduleBoundaries.test.ts](tests/architecture/moduleBoundaries.test.ts#L129-L162). Docs: [README.md](README.md#L32-L52) documents `--yes`, `DAP_CLI_ASSUME_YES=1`, `provision_consent_required`, `setup-adapters`, and `DAP_CLI_ADAPTERS_DIR`. [docs/adapter-setup.md](docs/adapter-setup.md) is a full reference (consent, marker layout, version-bump behavior, setup-adapters semantics). [dev/smoke/hand-driven-smoke.md](dev/smoke/hand-driven-smoke.md#L266) Sequence C is present and was driven end-to-end in [21-UAT.md](21-UAT.md). |

**Score:** 12/12 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
| -------- | -------- | ------ | ------- |
| [src/adapters/provision/index.ts](src/adapters/provision/index.ts) | `provisionAdapter(id, ctx)` dispatcher | ✓ VERIFIED | Dispatches on `'js-debug'`/`'debugpy'`/`'delve'`; exhaustive switch. |
| [src/adapters/provision/jsDebug.ts](src/adapters/provision/jsDebug.ts) | js-debug tarball provisioner | ✓ VERIFIED | Full implementation: consent, checksum check, lock, atomic install, tar.gz extract, package.json boundary write, marker write. |
| [src/adapters/provision/debugpy.ts](src/adapters/provision/debugpy.ts) | debugpy venv provisioner | ✓ VERIFIED | Symmetric structure with python3 detection and venv creation. |
| [src/adapters/provision/delve.ts](src/adapters/provision/delve.ts) | delve go-install provisioner | ✓ VERIFIED | Symmetric structure with arch-detection (`provision_arch_unsupported`). |
| [src/adapters/provision/atomicInstall.ts](src/adapters/provision/atomicInstall.ts) | stage + rename helper | ✓ VERIFIED | Substantive: 101 lines, full cache-unwritable mapping. |
| [src/adapters/provision/lock.ts](src/adapters/provision/lock.ts) | proper-lockfile wrapper | ✓ VERIFIED | Substantive: production retry + env-overridable retry for tests, structured timeout error. |
| [src/adapters/provision/http.ts](src/adapters/provision/http.ts) | undici fetch + ProxyAgent + error classification | ✓ VERIFIED | Substantive: HTTPS_PROXY/HTTP_PROXY/NO_PROXY parsing, rate-limit/proxy/network classifications, URL sanitization for credential leak prevention. |
| [src/adapters/provision/extractTarGz.ts](src/adapters/provision/extractTarGz.ts) | in-process tar extraction | ✓ VERIFIED | Uses `tar@7` package; no shell-out. |
| [src/adapters/provision/extractZip.ts](src/adapters/provision/extractZip.ts) | in-process zip extraction | ✓ VERIFIED | Uses `yauzl@3`; no shell-out. |
| [src/adapters/provision/checksums.ts](src/adapters/provision/checksums.ts) | embedded SHA-256 table | ✓ VERIFIED | Holds `JS_DEBUG_VERSION`/`DEBUGPY_VERSION`/`DELVE_VERSION` + per-version/per-platform hash maps. |
| [src/adapters/provision/consent.ts](src/adapters/provision/consent.ts) | per-version marker helpers | ✓ VERIFIED | `hasConsentMarker` / `writeConsentMarker` on `<adaptersDir>/<id>/.consent-<version>`. |
| [src/cli/confirm.ts](src/cli/confirm.ts) | TTY consent + assumeYes resolver | ✓ VERIFIED | Substantive: prompt to stderr, structured errors for non-TTY and decline, `resolveAssumeYes(cliYes, env)`. |
| [src/cli/commands/setupAdapters.ts](src/cli/commands/setupAdapters.ts) | `setup-adapters` subcommand action + registration | ✓ VERIFIED | 196 lines; consolidated D-14 prompt, per-adapter classification, failure aggregation, registered into commander. |
| [scripts/dev/regen-checksums.ts](scripts/dev/regen-checksums.ts) | checksum regen helper | ✓ VERIFIED | Exists per D-21 contract (downloads pinned artifacts, prints updated hashes). |

### Key Link Verification

| From | To | Via | Status | Details |
| ---- | -- | --- | ------ | ------- |
| `AdapterRegistry.resolve(id)` | per-adapter descriptor factory | async `await builtInAdapter.create()` | ✓ WIRED | [registry.ts](src/adapters/registry.ts#L67-L70). Method is async (D-17), all 3 built-in factories registered. |
| `createJsDebugDescriptor` | `provisionAdapter('js-debug', …)` | binary-missing fall-through | ✓ WIRED | [jsDebug.ts](src/adapters/builtins/jsDebug.ts#L85-L90); checks provisioned path + repo fallback, then provisions. |
| `createDebugpyDescriptor` | `provisionAdapter('debugpy', …)` | binary-missing fall-through | ✓ WIRED | [debugpy.ts](src/adapters/builtins/debugpy.ts#L57). |
| `createDelveDescriptor` | `provisionAdapter('delve', …)` | binary-missing fall-through | ✓ WIRED | [delve.ts](src/adapters/builtins/delve.ts#L56). |
| `provisionAdapter('<id>', …)` | `confirm({...})` then `withAdapterLock` then `atomicInstall` | sequential await chain | ✓ WIRED | Each provisioner: consent → double-checked cache inside lock → atomicInstall(populate=download+verify+extract) → writeConsentMarker. |
| `program.option('-y, --yes')` | `process.env.DAP_CLI_ASSUME_YES = '1'` | `program.hook('preAction', ...)` | ✓ WIRED | [program.ts](src/cli/program.ts#L62-L67). Subsequent `resolveAssumeYes(undefined, process.env)` reads the env value uniformly across descriptor factories and setupAdapters. |
| `registerSetupAdaptersCommand` | program | `program.command('setup-adapters')...` | ✓ WIRED | [program.ts](src/cli/program.ts#L74). |

### Data-Flow Trace (Level 4)

This phase ships provisioning logic, not a data-rendering UI, so Level 4 is partially out-of-scope. The closest analog is the install pipeline producing real on-disk artifacts:

| Pipeline | Data Variable | Source | Produces Real Data | Status |
| -------- | ------------- | ------ | ------------------ | ------ |
| Cold install | `staging` directory contents | `populate(stagingDir)` → `downloadToFile` (undici fetch) → `extractTarGz/extractZip` | Yes — real bytes from configurable base URL; SHA-256 verified before extract | ✓ FLOWING |
| Warm cache check | `hasConsentMarker + entrypointsExist` boolean | `fs.stat` on `.consent-<version>` + each expected entrypoint | Yes — real filesystem checks | ✓ FLOWING |
| `setup-adapters` summary | `entries: SetupAdapterEntry[]` | per-adapter `provisionAdapter` invocation collecting `{ adapterId, version, status, installRoot, error? }` | Yes — real provisioning result per adapter, not a hardcoded payload | ✓ FLOWING |

### Behavioral Spot-Checks

Behavioral execution evidence is centralized in [21-UAT.md](21-UAT.md) (hand-driven smoke) rather than re-run here; the orchestrator-driven Sequences A/B/C captured live JSON envelopes from `node dist/index.js`. Spot checks below cross-reference UAT signals to source:

| Behavior | Evidence | Result | Status |
| -------- | -------- | ------ | ------ |
| Sequence C1: First launch on wiped cache emits the three-line consent prompt on stderr | UAT C1 captured `Install vscode-js-debug 1.117.0 into /Users/roblou/.dap-cli/adapters/js-debug (~10MB)?\n  Source: https://github.com/.../v1.117.0/js-debug-dap-v1.117.0.tar.gz\nProceed? [y/N] ` followed by a real `lifecycle:running` launch envelope | matches confirm.ts L30-L33 prompt shape | ✓ PASS |
| Sequence C2: After consent, install completes within ~10s with real artifacts | UAT C2: `~/.dap-cli/adapters/js-debug/src/dapDebugServer.js` (818088 bytes), `package.json = {"type":"commonjs"}`, `.consent-1.117.0` (25 bytes ISO timestamp) | matches PACKAGE_BOUNDARY constant and writeConsentMarker | ✓ PASS |
| Sequence C4: Warm cache + non-TTY launches directly without prompting | UAT C4: piped stdin → `lifecycle:running` no error | matches hasConsentMarker fast-path | ✓ PASS |
| Sequence C5b: Non-TTY + wiped install dir + no `--yes` → `provision_consent_required` envelope | UAT C5b literal envelope: `{"ok":false,"error":{"code":"provision_consent_required","category":"usage","message":"Confirmation required but stdin is not a TTY.","exitCode":2,"diagnostics":["Install vscode-js-debug 1.117.0 into /Users/roblou/.dap-cli/adapters/js-debug (~10MB)?","Re-run with \`--yes\` / \`-y\` or set \`DAP_CLI_ASSUME_YES=1\` to pre-consent."], ... }}` | matches confirm.ts L20-L29 envelope verbatim | ✓ PASS |
| Sequence C6: `DAP_CLI_ASSUME_YES=1` on empty adapters dir → fresh install with no prompt | UAT C6: `lifecycle:running`, marker re-created | matches resolveAssumeYes env path | ✓ PASS |
| Sequences A+B re-verification after 21-07: rebuilt binary still reaches breakpoints with no regression | UAT 2026-05-25T22:44:00Z appendix: A pass (8 steps), B pass (7 steps, real Playwright child session paused on `app.js:2:18`) | Plan 21-07 did not regress shipped behavior | ✓ PASS |

### Probe Execution

Phase 21 declared no `scripts/*/tests/probe-*.sh` probes (and none exist in the repo). The repository's contract for this kind of evidence is the hand-driven smoke (see "Behavioral Spot-Checks" above and [21-UAT.md](21-UAT.md)) plus `npm test`. Both are reported as final-state green by the phase orchestrator (596 passed / 15 skipped / 0 failed; `npm run build` green at 322 KB `dist/index.js`).

| Probe | Command | Result | Status |
| ----- | ------- | ------ | ------ |
| (none declared) | — | — | N/A |

### Requirements Coverage

ROADMAP "Requirements: TBD" for phase 21, and no `.planning/REQUIREMENTS.md` exists in the workspace. Requirements coverage is therefore exercised via the derived truth list above (12/12 verified). No orphaned `REQ-*` IDs surfaced.

### Anti-Patterns Found

Scanned files modified during phase 21 (per 21-01..21-07 SUMMARYs). No blocker anti-patterns:

| File | Pattern | Severity | Impact |
| ---- | ------- | -------- | ------ |
| `src/adapters/provision/lock.ts` line 78 | `// fall through to production retry` | ℹ️ Info | Comment on intentional `catch {}` for env-var parsing — design intent, not debt. |
| (none) | TBD/FIXME/XXX | — | No debt markers in modified files. |
| (none) | `return null` / empty handlers in provisioning paths | — | All early returns carry semantic meaning (cache hit, decline). |
| (none) | "Not implemented" / placeholder | — | None. |

`git diff --stat src/` between the phase 21-06 commit and the final `fb94546` is empty (per [21-07-SUMMARY.md](21-07-SUMMARY.md) verification evidence), confirming the gap-closure plan did not silently introduce src/ drift after the regression gate.

### Human Verification Required

None. Sequences A+B+C in [21-UAT.md](21-UAT.md) (2026-05-25T20:42:00Z) and the A+B re-verification (2026-05-25T22:44:00Z) capture verbatim live output from `node dist/index.js` for every consent / install / warm-cache / non-TTY / env-var path. The provisioning behavior is observable via JSON envelopes and on-disk artifacts — no UX visual judgment is required.

### Gaps Summary

No gaps. Phase 21 delivers the full goal:

- Lazy provisioning is wired across all three built-in adapter descriptor factories (D-01/D-02/D-17).
- Consent UX works in both TTY and non-TTY modes, with `--yes` / env-var escape hatches and a per-version download marker (D-03/D-05/D-06/D-18/D-20).
- Atomic install via stage-and-rename, SHA-256 verification, and per-adapter lockfile serialization are all in `src/adapters/provision/` with tests covering each path (D-08/D-09/D-19/D-21).
- Cache root is `~/.dap-cli/adapters/<id>/` with `DAP_CLI_ADAPTERS_DIR` override (D-07/D-12), exercised by both the npx-cache packaging test and live UAT.
- Every error envelope catalogued in D-15 is present with `provision_*` namespace and actionable diagnostics, with snapshot tests pinning the shape.
- `dap-cli setup-adapters` subcommand pre-warms the cache with a single consolidated D-14 prompt and aggregates failures (D-13).
- Provisioning ships in the published `dist/` bundle (packaging test asserts `provisionAdapter` and `withAdapterLock` literally appear in the published binary), with no `tar`/`unzip` shell-out (architecture test).
- README and docs/adapter-setup.md document the lazy UX, escape hatches, error envelope, and setup-adapters semantics; hand-driven Sequence C is present and was executed end-to-end.

**Recommend phase 21 for closure.**

---

_Verified: 2026-05-25T23:15:00Z_
_Verifier: the agent (gsd-verifier)_
