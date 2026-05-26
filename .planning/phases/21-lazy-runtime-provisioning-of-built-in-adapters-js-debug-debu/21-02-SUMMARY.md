---
phase: 21-lazy-runtime-provisioning-of-built-in-adapters-js-debug-debu
plan: 02
subsystem: adapters
tags: [provisioning, js-debug, debugpy, delve, sha256, checksums, venv, pip, platform-matrix, descriptor-factories, async]

# Dependency graph
requires:
  - phase: 21-lazy-runtime-provisioning-of-built-in-adapters-js-debug-debu
    plan: 01
    provides: withAdapterLock, atomicInstall, downloadToFile, extractTarGz, extractZip, confirm, resolveAssumeYes, hasConsentMarker, writeConsentMarker, async AdapterRegistry.resolve, tests/helpers/fakeReleaseServer.ts
provides:
  - provisionAdapter(id, ctx) — single async entry point used by descriptor factories
  - provisionJsDebug — github tar.gz fetch + SHA-256 verify + extractTarGz strip:1 + commonjs package boundary
  - provisionDebugpy — `python3 -m venv` + `pip install debugpy==<version>` into adaptersDir/debugpy/venv
  - provisionDelve — platform matrix (5 targets) + zip/tar.gz extract + chmod 0o755 on POSIX
  - JS_DEBUG_CHECKSUMS / DELVE_CHECKSUMS embedded SHA-256 tables (D-21)
  - DELVE_VERSION='v1.26.3', JS_DEBUG_VERSION='1.117.0', DEBUGPY_VERSION='1.8.20'
  - scripts/dev/regen-checksums.ts — maintainer helper
  - Async createJsDebugDescriptor / createDebugpyDescriptor / createDelveDescriptor that lazily provision when binary is missing
  - Three provisioner test suites (15 tests total) exercising cold cache / warm cache / checksum mismatch / consent declined / consent required against FakeReleaseServer
affects: 21-03 (setup-adapters subcommand wraps provisionAdapter), 21-04 (snapshot error envelope tests), 21-06 (docs + hand-driven smoke)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Per-adapter provisioner module exports a single `provision<Id>(ctx)` function; the dispatcher in `provision/index.ts` just switches on id"
    - "Cache hit fast-path: `hasConsentMarker + exists(entrypoint)` returns `fromCache: true` BEFORE acquiring the lock; under-lock double-check returns early too"
    - "SHA-256 verification happens AFTER download to a sibling temp file, BEFORE atomicInstall — mismatch aborts before any canonical-dir rename"
    - "Test seam pattern: `DAP_CLI_PROVISION_RELEASE_BASE_URL` overrides github.com; `DAP_CLI_PROVISION_DELVE_PLATFORM_OVERRIDE` forces a deterministic asset key; `DAP_CLI_PROVISION_PYTHON3` overrides which python3 binary debugpy uses"
    - "Descriptor factory resolution order = (1) user-supplied path or PATH binary, (2) already-provisioned cache, (3) lazy provision — so a healthy host install always wins over network fetch"

key-files:
  created:
    - src/adapters/provision/checksums.ts
    - src/adapters/provision/types.ts
    - src/adapters/provision/jsDebug.ts
    - src/adapters/provision/debugpy.ts
    - src/adapters/provision/delve.ts
    - src/adapters/provision/index.ts
    - scripts/dev/regen-checksums.ts
    - tests/adapters/provision/jsDebug.test.ts
    - tests/adapters/provision/debugpy.test.ts
    - tests/adapters/provision/delve.test.ts
  modified:
    - src/adapters/builtins/jsDebug.ts
    - src/adapters/builtins/debugpy.ts
    - src/adapters/builtins/delve.ts
    - tests/adapters/delve.test.ts

key-decisions:
  - "Plan URL string said `delve_<v>_<plat>.<ext>` but the actual github.com/go-delve/delve release uses `dlv_<v>_<plat>.<ext>` (verified via `gh api releases/tags/v1.26.3` and the existing `scripts/setup-adapters.ts`). Implementation uses `dlv_` — see Deviations."
  - "Delve archives extract FLAT (no top-level dir) → `extractTarGz` is called without `strip` and the dlv binary lands directly at `<installRoot>/dlv`. Js-debug tarballs DO have a top-level `js-debug/` dir → `extractTarGz` with `strip: 1` is used so the canonical install root IS the contents of that dir."
  - "Delve platform matrix lives in the provisioner module (not checksums.ts) so unsupported platforms throw a typed `provision_install_failed` with a list of supported targets BEFORE looking up a missing checksum. Checksums.ts is purely a lookup table."
  - "`createDelveDescriptor` keeps the existing `assertSupportedProvisionedDelveToolchain` assertion — it now runs on freshly-provisioned binaries too, so a fresh install of Delve v1.26.3 on a host with Go<1.24 still surfaces `delve_go_version_incompatible` instead of crashing at first launch."
  - "Debugpy `pip install` runs with `--no-warn-script-location --disable-pip-version-check` so a noisy pip doesn't leak diagnostic content into stderr that the user would think is a real error."
  - "Test for the consent-required path on the rewired descriptor factories explicitly clears `DAP_CLI_ASSUME_YES` — otherwise the host environment can make the test silently take the assume-yes path and try to hit the real network."

patterns-established:
  - "Provisioner module surface = `provision<Id>(ctx: ProvisionContext): Promise<ProvisionResult>`. Dispatcher in `provision/index.ts` is the only public surface for descriptor factories."
  - "Descriptor factory is async; resolution falls through `host-supplied → cached → provisioned`. The `assumeYes` flag is read from env via `resolveAssumeYes(undefined, env)` so a CLI `--yes` propagates without each factory growing a parameter."
  - "Tests construct a fake archive in-memory (tar.c for tar.gz, hand-built zip for zip later), compute its sha, mutate the in-memory `*_CHECKSUMS[VERSION]` table, and restore in `afterEach`. No global mocking."

requirements-completed: []

# Metrics
duration: ~3h
completed: 2025-12-04
tasks: 3
commits: 3
files_created: 10
files_modified: 4
---

# Phase 21 Plan 02: Per-Adapter Provisioners (js-debug, debugpy, delve) Summary

Wired the lazy runtime provisioning end-to-end for all three built-in adapters. A missing js-debug, debugpy, or delve binary now prompts for consent, downloads + verifies + atomically installs the adapter into `<adaptersDir>/<id>/`, and resolves a working descriptor — replacing the old `*_not_found` failure paths.

## What Changed

**`provisionAdapter(id, ctx)` — single async dispatch point.**
Implemented in `src/adapters/provision/index.ts`. Switches on adapter id and delegates to `provisionJsDebug`, `provisionDebugpy`, or `provisionDelve`. Each provisioner returns `{ adapterId, version, installRoot, entrypoint, fromCache }`.

**js-debug provisioner (`src/adapters/provision/jsDebug.ts`).**
Cache check → `confirm` → `withAdapterLock` with under-lock double-check → download `js-debug-dap-v${JS_DEBUG_VERSION}.tar.gz` from github releases → SHA-256 verify against `JS_DEBUG_CHECKSUMS[JS_DEBUG_VERSION]` → `atomicInstall` with `extractTarGz(strip: 1)` → write `{"type":"commonjs"}` package boundary → consent marker. Real SHA: `ad8d04ede9d4b75cc290fd5438a65047a06f786d04f604b6112485b36f090772`.

**debugpy provisioner (`src/adapters/provision/debugpy.ts`).**
Cache check (`<venv>/bin/python` or `Scripts/python.exe`) → `confirm` → `withAdapterLock` → detect python3 (env `DAP_CLI_PROVISION_PYTHON3 ?? 'python3'`) → `python3 -m venv <staging>/venv` → `<venv>/bin/pip install --no-warn-script-location --disable-pip-version-check debugpy==1.8.20` → `atomicInstall` with `expectedEntrypoints: [venv/bin/python]`. Distinct error codes for `provision_python3_missing`, `provision_python3_venv_unavailable`, `provision_pip_install_failed`; stderr tail truncated to 2KB in diagnostics. No SHA verification per D-21 (pip handles wheel integrity).

**delve provisioner (`src/adapters/provision/delve.ts`).**
Platform matrix maps `${process.platform}_${process.arch}` to a `DelvePlatformKey` (`darwin_arm64`, `darwin_amd64`, `linux_amd64`, `linux_arm64`, `windows_amd64`); unsupported platforms throw `provision_install_failed` before any network call. Test seam: `DAP_CLI_PROVISION_DELVE_PLATFORM_OVERRIDE`. Archive URL: `${base}/go-delve/delve/releases/download/${DELVE_VERSION}/dlv_${bareVersion}_${platformKey}.${ext}` (zip on Windows, tar.gz elsewhere). Flat extract → chmod 0o755 on POSIX. Real SHAs embedded for all five platforms.

**Embedded checksums (`src/adapters/provision/checksums.ts`).**
`JS_DEBUG_CHECKSUMS[JS_DEBUG_VERSION]: string`, `DELVE_CHECKSUMS[DELVE_VERSION]: Record<DelvePlatformKey, string>`. `DELVE_VERSION` keeps the leading `v` because consent markers and version strings should match the upstream release tag; the URL helper strips it for the asset filename.

**Maintainer regen script (`scripts/dev/regen-checksums.ts`).**
Single-file `node --experimental-strip-types` helper: downloads all current versions, prints a TS snippet ready to paste into `checksums.ts`. Per D-21 the maintainer pastes by hand so the diff is human-reviewed.

**Descriptor factories rewired (`src/adapters/builtins/{jsDebug,debugpy,delve}.ts`).**
All three are now `async`. Resolution order:
1. user-supplied path or PATH binary (preserves a healthy host install)
2. already-provisioned cache at `<adaptersDir>/<id>/...`
3. `await provisionAdapter(id, { env, assumeYes: resolveAssumeYes(undefined, env), adaptersDir })`

`createDelveDescriptor` keeps `assertSupportedProvisionedDelveToolchain` so a fresh install of Delve 1.26.3 against Go <1.24 still surfaces the typed `delve_go_version_incompatible` error.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] URL asset prefix is `dlv_`, not `delve_`**
- **Found during:** Task 3 (delve provisioner)
- **Issue:** Plan §interfaces specified the delve release URL as `${base}/go-delve/delve/releases/download/${version}/delve_${versionNoV}_${platform}_${arch}.${ext}` (`delve_` prefix). The real `github.com/go-delve/delve` releases use `dlv_<version>_<platform>.<ext>` (verified via `gh api repos/go-delve/delve/releases/tags/v1.26.3 -q '.assets[].name'` and the existing `scripts/setup-adapters.ts` which already uses `dlv_`).
- **Fix:** Implementation uses `dlv_${bareVersion()}_${platformKey}.${ext}`. The 5 embedded SHA-256 hashes match the `dlv_*` asset bodies (regenerated against the real assets).
- **Files modified:** `src/adapters/provision/delve.ts`
- **Commit:** `cef1b31`

**2. [Rule 1 - Bug] `tests/adapters/delve.test.ts` expected the obsolete `delve_not_found` error**
- **Found during:** Task 3 (descriptor factory rewire)
- **Issue:** The factory used to throw `delve_not_found` when no `dlv` was on PATH and no cached binary existed. After rewiring to fall through to `provisionAdapter`, that code path now hits `confirm()`. In a non-TTY vitest environment without `DAP_CLI_ASSUME_YES`, `confirm` throws `provision_consent_required` instead.
- **Fix:** Updated the test to assert `provision_consent_required`, made all `createDelveDescriptor` callers `await`, and added `DAP_CLI_ASSUME_YES` save/restore so a host with the env var set doesn't accidentally hit the real network during the test.
- **Files modified:** `tests/adapters/delve.test.ts`
- **Commit:** `cef1b31`

## Tests

**New (15 passing):**
- `tests/adapters/provision/jsDebug.test.ts` (5): cold cache, warm cache, checksum mismatch, consent decline, consent required.
- `tests/adapters/provision/debugpy.test.ts` (5): real venv + pip install (~13s), warm cache, python3 missing, consent decline, consent required.
- `tests/adapters/provision/delve.test.ts` (5): cold cache + chmod 0o111 assertion, warm cache, checksum mismatch, consent decline, consent required.

**Updated:**
- `tests/adapters/delve.test.ts` (5): adapted to async signature + lazy-provisioning fallback path.

**Full suite:** 550 passing / 15 failing / 11 skipped — the 15 failures are pre-existing tests (integration tests that depend on host-installed adapters + one debugpy registry test) that were failing on the baseline branch identically. No regressions.

**Build:** `npm run build` succeeds (tsup ESM dist/index.js, 312 KB).

## Manual Smoke (deferred to 21-06)

The plan's "fresh `rm -rf ~/.dap-cli/adapters && node dist/index.js launch --config "TypeScript Mini" --yes` → installs js-debug → reaches session start" was explicitly tagged as a manual smoke whose hand-driven version is the Phase 21-06 deliverable. Not executed in this plan; provisioner-level coverage is provided by the unit suites above.

## Key Files

**Created:**
- [src/adapters/provision/checksums.ts](src/adapters/provision/checksums.ts) — embedded SHA-256 tables and pinned versions
- [src/adapters/provision/types.ts](src/adapters/provision/types.ts) — `AdapterId`, `ProvisionContext`, `ProvisionResult`
- [src/adapters/provision/jsDebug.ts](src/adapters/provision/jsDebug.ts) — js-debug provisioner
- [src/adapters/provision/debugpy.ts](src/adapters/provision/debugpy.ts) — debugpy provisioner
- [src/adapters/provision/delve.ts](src/adapters/provision/delve.ts) — delve provisioner with platform matrix
- [src/adapters/provision/index.ts](src/adapters/provision/index.ts) — `provisionAdapter()` dispatcher
- [scripts/dev/regen-checksums.ts](scripts/dev/regen-checksums.ts) — maintainer helper
- [tests/adapters/provision/jsDebug.test.ts](tests/adapters/provision/jsDebug.test.ts)
- [tests/adapters/provision/debugpy.test.ts](tests/adapters/provision/debugpy.test.ts)
- [tests/adapters/provision/delve.test.ts](tests/adapters/provision/delve.test.ts)

**Modified:**
- [src/adapters/builtins/jsDebug.ts](src/adapters/builtins/jsDebug.ts) — async + lazy provisioning fallback
- [src/adapters/builtins/debugpy.ts](src/adapters/builtins/debugpy.ts) — async + lazy provisioning fallback (preserves 3-tier resolution: legacy `$DAP_CLI_HOME/venv` → system python3 with debugpy → provision)
- [src/adapters/builtins/delve.ts](src/adapters/builtins/delve.ts) — async + lazy provisioning fallback (preserves Go toolchain assertion)
- [tests/adapters/delve.test.ts](tests/adapters/delve.test.ts) — adapted for async signature

## Commits

| Hash | Task | Subject |
|------|------|---------|
| `13742e1` | 1 | feat(21-02): implement js-debug provisioner with embedded SHA-256 checksums |
| `efad694` | 2 | feat(21-02): implement debugpy provisioner via isolated venv + pip |
| `cef1b31` | 3 | feat(21-02): implement delve provisioner with platform matrix + chmod |

## Self-Check

**Created files exist:**
- ✅ src/adapters/provision/checksums.ts
- ✅ src/adapters/provision/types.ts
- ✅ src/adapters/provision/jsDebug.ts
- ✅ src/adapters/provision/debugpy.ts
- ✅ src/adapters/provision/delve.ts
- ✅ src/adapters/provision/index.ts
- ✅ scripts/dev/regen-checksums.ts
- ✅ tests/adapters/provision/jsDebug.test.ts
- ✅ tests/adapters/provision/debugpy.test.ts
- ✅ tests/adapters/provision/delve.test.ts

**Modified files exist:**
- ✅ src/adapters/builtins/jsDebug.ts
- ✅ src/adapters/builtins/debugpy.ts
- ✅ src/adapters/builtins/delve.ts
- ✅ tests/adapters/delve.test.ts

**Commits exist:**
- ✅ 13742e1
- ✅ efad694
- ✅ cef1b31

## Self-Check: PASSED
