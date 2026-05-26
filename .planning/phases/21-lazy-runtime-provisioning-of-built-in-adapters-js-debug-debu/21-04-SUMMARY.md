---
phase: 21-lazy-runtime-provisioning-of-built-in-adapters-js-debug-debu
plan: 04
subsystem: adapters
tags: [provisioning, error-handling, security, architecture-tests, snapshot-tests]

# Dependency graph
requires:
  - phase: 21
    provides: "Provisioner modules (jsDebug, debugpy, delve) with their initial error envelopes — Plans 21-01 and 21-02 created the surface; 21-04 hardens it."
provides:
  - "Single authoritative catalogue of 13 provision_* error codes, each with actionable diagnostics + structured data{} for programmatic consumers."
  - "Inline snapshots of every provision_* error envelope so any future change requires a deliberate snapshot update."
  - "Architectural assertions that fail CI if D-10 (provision in src/), D-11 (no shell-out tar/unzip), D-15 (provision_ prefix), or D-21 (real 64-char hex checksums) regress."
  - "Defense-in-depth URL sanitization: credentials and query strings are stripped before any URL is rendered into stderr diagnostics or err.data{}."
affects: [21-05, 21-06, future-adapter-onboarding]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Error envelope = (code, diagnostics[], data{}, cause). data{} is the structured side for JSON/programmatic consumers; diagnostics[] is the human-readable side."
    - "Snapshot-locked failure surface: provision_* error catalogue is asserted via inline snapshots, so an envelope shape change forces an explicit review."
    - "URL sanitization at the diagnostic boundary (sanitizeUrl in http.ts): strip user:pass@ + ?query + #fragment before any URL is shown to the user or logged."
    - "Architectural assertions co-located with module-boundary tests, regex-scanning src/ + scripts/ for forbidden patterns (shell-out, code literals, placeholder checksums)."

key-files:
  created:
    - tests/adapters/provision/errorSnapshots.test.ts
  modified:
    - src/cli/errors.ts
    - src/cli/confirm.ts
    - src/adapters/provision/atomicInstall.ts
    - src/adapters/provision/debugpy.ts
    - src/adapters/provision/delve.ts
    - src/adapters/provision/extractTarGz.ts
    - src/adapters/provision/extractZip.ts
    - src/adapters/provision/http.ts
    - src/adapters/provision/jsDebug.ts
    - src/adapters/provision/lock.ts
    - tests/adapters/provision/atomicInstall.test.ts
    - tests/architecture/moduleBoundaries.test.ts

key-decisions:
  - "Renamed three provision_install_failed sites to catalogue codes (provision_arch_unsupported for delve platform mismatch, provision_checksum_mismatch for missing-checksum-table, provision_extract_failed for missing-entrypoint) — provision_install_failed is now a dead string."
  - "Added the previously-unreachable provision_cache_unwritable surface in atomicInstall.ts and lock.ts. Triggered by EACCES/EROFS/ENOSPC/EPERM from mkdir/writeFile/lockfile.lock. Diagnostic always includes the DAP_CLI_ADAPTERS_DIR=<writable-path> override hint."
  - "Added cause?: unknown to CliErrorOptions and passed it through to super(). Existing code that didn't pass cause is unaffected; new code can preserve the original errno/network stack trace for debugging."
  - "Snapshot tests capture only (code, diagnostics, data) — not message, not cause. Message is asserted separately where it matters; cause is implementation detail. This keeps snapshots stable across cause-chain restructuring."
  - "URL sanitization scrubs credentials AND query strings, not just credentials. Defense in depth: future contributors might add `?token=` to download URLs."

patterns-established:
  - "Per-error data{} schema: every provision_* error has a minimal, documented data{} shape. Examples: {adapterId, version, platform} for checksum errors; {adaptersDir, errnoCode, adapterId} for cache_unwritable; {url, proxyUrl, causeCode} for proxy_error."
  - "Architecture test guards locked-decision invariants directly via regex scans; they run in <500ms and need no fixtures."

requirements-completed: []

# Metrics
duration: 25min
completed: 2026-05-25
---

# Phase 21 Plan 04: Finalize Provisioning Failure-Surface Contract Summary

**Locked the provisioning error catalogue: 13 provision_* codes, each enriched with actionable recovery diagnostics, structured data{}, cause chain, and snapshot-asserted shape; plus 4 architectural guards (D-10/D-11/D-15/D-21) that prevent regression.**

## Performance

- **Duration:** ~25 min
- **Tasks:** 3
- **Files modified:** 12 (1 created, 11 modified)
- **Lines:** +805 / −34

## Accomplishments

1. **Aligned every provision_* error site to the locked catalogue.** Three sites had been emitting the un-catalogued `provision_install_failed`; they now emit catalogue codes (`provision_arch_unsupported`, `provision_checksum_mismatch`, `provision_extract_failed`). Every error now includes (a) at least one diagnostic naming the recovery flag/env var/install step, (b) a structured `data{}` for programmatic consumers, and (c) `cause: <original-error>` where applicable.

2. **Added the missing `provision_cache_unwritable` surface.** Previously a code in the catalogue with no emitter. `atomicInstall.ts` and `lock.ts` now catch EACCES/EROFS/ENOSPC/EPERM from mkdir/writeFile/lockfile.lock and emit it with the `DAP_CLI_ADAPTERS_DIR=<writable-path>` override hint.

3. **Snapshot-locked all 13 envelopes.** New file `tests/adapters/provision/errorSnapshots.test.ts` asserts the (code, diagnostics, data) triplet for each catalogue entry via `toMatchInlineSnapshot`. Any change to error shape now requires an explicit snapshot update.

4. **Locked D-10/D-11/D-15/D-21 in architecture tests.** Four new `it()` cases in `tests/architecture/moduleBoundaries.test.ts` regex-scan src/ + scripts/ to catch: (a) re-declared provisioning functions outside src/adapters/provision/, (b) shell-out to host tar/unzip/gzip, (c) non-`provision_` codes thrown from provision modules, (d) placeholder/non-hex checksum constants.

5. **Defense-in-depth URL sanitization.** Added `sanitizeUrl()` in http.ts that strips credentials and query strings before any URL hits stderr or `data{}`. Snapshot test for `provision_proxy_error` asserts `user:pass@` from `HTTPS_PROXY` and `?token=secret` from URLs do not leak.

## Task Commits

1. **Task 1: Audit and finalize error diagnostics across all provision modules** — `f767b83` (fix)
2. **Task 2: Snapshot every provision_* error envelope** — `a1d0218` (test)
3. **Task 3: Lock D-10/D-11/D-15/D-21 in architecture test** — `267c3ad` (test)

**Plan metadata:** _(final commit at SUMMARY write)_

## Failure-Surface Catalogue (13 codes)

| Code | Source module | Recovery hint embedded |
|------|---------------|------------------------|
| `provision_consent_required` | `cli/confirm.ts` | `--yes` / `DAP_CLI_ASSUME_YES=1` |
| `provision_consent_declined` | `cli/confirm.ts` | `--yes` to pre-consent |
| `provision_network_error` | `provision/http.ts` | HTTP status + URL |
| `provision_proxy_error` | `provision/http.ts` | `HTTPS_PROXY` correctness, `NO_PROXY=github.com` bypass |
| `provision_rate_limited` | `provision/http.ts` | `GITHUB_TOKEN` |
| `provision_checksum_mismatch` | `provision/delve.ts`, `provision/jsDebug.ts` | Re-run setup or issue tracker |
| `provision_python3_missing` | `provision/debugpy.ts` | platform-specific install commands |
| `provision_python3_venv_unavailable` | `provision/debugpy.ts` | `apt install python3-venv` |
| `provision_pip_install_failed` | `provision/debugpy.ts` | `PIP_INDEX_URL` mirror workaround |
| `provision_arch_unsupported` | `provision/delve.ts` | Supported platform list + manual install |
| `provision_cache_unwritable` | `provision/atomicInstall.ts`, `provision/lock.ts` | `DAP_CLI_ADAPTERS_DIR=<writable-path>` |
| `provision_lock_timeout` | `provision/lock.ts` | Wait or delete stale sentinel path |
| `provision_extract_failed` | `provision/atomicInstall.ts`, `provision/extractTarGz.ts`, `provision/extractZip.ts` | Names missing entrypoint or unsafe entry path |

## Files Created/Modified

- `tests/adapters/provision/errorSnapshots.test.ts` (created) — 13 inline-snapshot tests, one per catalogue code. Helper `pickEnvelope` scrubs port numbers and tempdir paths for stable snapshots.
- `tests/architecture/moduleBoundaries.test.ts` — added 4 architectural assertions for D-10/D-11/D-15/D-21 (~126 LOC, <500ms run).
- `tests/adapters/provision/atomicInstall.test.ts` — updated 1 line to match renamed code.
- `src/cli/errors.ts` — added `cause?: unknown` to `CliErrorOptions`, passed to `super()`.
- `src/cli/confirm.ts` — added `data: { question }` to `provision_consent_required` AND `provision_consent_declined`.
- `src/adapters/provision/delve.ts` — renamed arch error → `provision_arch_unsupported`; enriched checksum errors with adapter/version + issue tracker hint + `data{}`.
- `src/adapters/provision/jsDebug.ts` — renamed missing-checksum-table → `provision_checksum_mismatch`; enriched SHA-mismatch error with retry hint + `data{}`.
- `src/adapters/provision/atomicInstall.ts` — added `cache_unwritable` errno detection on mkdir; renamed missing-entrypoint → `provision_extract_failed` with `cause`.
- `src/adapters/provision/lock.ts` — added `cache_unwritable` errno detection on mkdir/writeFile/lockfile.lock; refined `provision_lock_timeout` diagnostic to name the sentinel.
- `src/adapters/provision/http.ts` — `sanitizeUrl()` strips credentials + query strings; added `data{}` + `cause` to every error; `proxy_error` now mentions `HTTPS_PROXY`/`NO_PROXY`.
- `src/adapters/provision/extractZip.ts` — added `data: { archivePath, entry }` + `cause`.
- `src/adapters/provision/extractTarGz.ts` — added `data: { archivePath }` + `cause`.
- `src/adapters/provision/debugpy.ts` — added `PIP_INDEX_URL` workaround hint; added `cause` to all 3 errors.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Three `provision_install_failed` sites used an un-catalogued code**

- **Found during:** Task 1 audit
- **Issue:** The catalogue in 21-CONTEXT D-15 lists 13 codes; `provision_install_failed` is not one of them. delve's arch mismatch, jsDebug's missing-checksum-table, and atomicInstall's missing-entrypoint all emitted this dead code.
- **Fix:** Renamed each to the catalogue code that semantically matches: `provision_arch_unsupported`, `provision_checksum_mismatch`, `provision_extract_failed` respectively.
- **Files modified:** `delve.ts`, `jsDebug.ts`, `atomicInstall.ts`, plus 1 line in `atomicInstall.test.ts`.
- **Commit:** `f767b83`

**2. [Rule 2 - Missing critical functionality] `provision_cache_unwritable` was unreachable**

- **Found during:** Task 1 audit
- **Issue:** The catalogue declares `provision_cache_unwritable` but no code path emitted it. `fs.mkdir(adaptersDir, { recursive: true })` would throw a raw `Error` with `code: 'EACCES'` and crash without the recovery hint.
- **Fix:** Wrapped mkdir/writeFile/lockfile.lock in both `atomicInstall.ts` and `lock.ts` with errno detection (EACCES/EROFS/ENOSPC/EPERM) that emits `provision_cache_unwritable` with the `DAP_CLI_ADAPTERS_DIR=<writable-path>` override hint.
- **Files modified:** `atomicInstall.ts`, `lock.ts`.
- **Commit:** `f767b83`

**3. [Rule 2 - Security] URL credentials and query strings could leak to stderr**

- **Found during:** Task 1 audit of `http.ts`
- **Issue:** `provision_proxy_error` diagnostics included the raw `proxyUrl` from `HTTPS_PROXY`. If a user set `HTTPS_PROXY=http://user:pass@proxy:8080`, their proxy credentials would appear verbatim in stderr.
- **Fix:** Added `sanitizeUrl()` that parses the URL, clears `.username`/`.password`/`.search`/`.hash`, and re-serializes. Applied to every URL field in `http.ts` diagnostics and `data{}`. Snapshot test `provision_proxy_error` asserts `user:pass` and `?token=secret` never appear in the error envelope.
- **Files modified:** `http.ts`.
- **Commit:** `f767b83`

**4. [Rule 2 - Debuggability] CliError didn't preserve `cause` chain**

- **Found during:** Task 1 audit (needed for error wrapping)
- **Issue:** `CliErrorOptions` had no `cause` field, so wrapping a low-level errno or network error lost the original stack trace.
- **Fix:** Added `cause?: unknown` to `CliErrorOptions` and threaded it to `super(message, { cause })`. Used in every wrap site in this plan (atomicInstall, lock, http, extractZip, extractTarGz, debugpy, delve).
- **Files modified:** `src/cli/errors.ts`.
- **Commit:** `f767b83`

### Non-Deviations

The plan was executed exactly as written for Tasks 2 and 3 (snapshot file + 4 architecture assertions). All 4 fixes above happened inside Task 1's "audit every error path" scope.

## Verification

- `npx vitest run tests/adapters/provision tests/architecture` — **68/68 passed** in 19s.
- New snapshot test: 13/13 inline snapshots match.
- New architecture test: 11/11 (4 new + 7 pre-existing) pass in <500ms.
- Existing `tests/adapters/provision/atomicInstall.test.ts` updated to match renamed code (1 line).

### Pre-existing failures (NOT caused by this plan)

8 failures observed in the full suite under concurrent load:
- 6 consent-required failures in `tests/integration/{debugpyAdapter,delveAdapter,registry}.test.ts` (also fail on baseline before any 21-04 edits — these integration tests don't set `DAP_CLI_ASSUME_YES` for consent).
- 2 timeouts in `tests/integration/selfHosting.test.ts` (pass in isolation; flaky under concurrent integration-test load).

Both classes are pre-existing and unrelated to 21-04. Logged for the phase deferred-items but not blocking this plan's completion.

## Threat Flags

No new security-relevant surface introduced — this plan only narrows the existing surface by sanitizing URLs and adding errno detection on existing filesystem calls.

## Self-Check: PASSED

All 13 source/test files and 1 SUMMARY exist; all 3 commits (`f767b83`, `a1d0218`, `267c3ad`) present in git log.
