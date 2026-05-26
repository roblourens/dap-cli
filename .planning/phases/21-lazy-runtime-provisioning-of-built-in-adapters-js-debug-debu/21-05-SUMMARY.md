---
phase: 21-lazy-runtime-provisioning-of-built-in-adapters-js-debug-debu
plan: 05
subsystem: testing
tags: [test-harness, packaging, concurrency, lockfile, proxy, npm-pack]

# Dependency graph
requires:
  - phase: 21
    provides: "Provisioner modules (jsDebug, debugpy, delve) with locked error envelopes from 21-04 and the in-process FakeReleaseServer scaffolding from 21-02/21-03."
provides:
  - "Reusable test helpers: synthetic adapter archive builders + extended FakeReleaseServer handlers (jsDebugTarballHandler, delveArchiveHandler, fixedStatusHandler, hitsByPath)."
  - "D-08 lockfile-serialization regression test: 4 parallel provisionAdapter('js-debug', ...) calls hit the release server exactly once (cold) and not at all once primed (warm)."
  - "D-09 proxy-handling regression tests: HTTPS_PROXY refusal surfaces provision_proxy_error, NO_PROXY bypass works for exact host + suffix-domain matches, HTTPS_PROXY does not apply to http:// URLs."
  - "D-12 DAP_CLI_ADAPTERS_DIR override regression test: provisioner respects the env var both at the helper layer (in-process) and at the bin layer (cross-process via npxCache.test.ts)."
  - "Pre-publish artifact gates wired into npm run check via a new check:pack script: publishedTarball.test.ts (npm pack contents) + npxCache.test.ts (cross-process cache hit using the actual packed bin)."
affects: [21-06, future-adapter-onboarding, npm-publish]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Pre-publish gates as DAP_CLI_RUN_PACKAGING-gated vitest suites — keeps the slow npm pack / npm install path off the normal vitest run while making it unavoidable on prepublishOnly."
    - "Synthetic adapter archives built in-process (tar via the tar package, zip stored-mode hand-built) so tests never touch the network and can mutate JS_DEBUG_CHECKSUMS to match the synthetic SHA."
    - "Refused-proxy detection via reserved-then-closed port (bind 0, capture port, close) instead of a real proxy server — guarantees ECONNREFUSED without any timing flake."
    - "Bypass-the-proxy detection via .invalid TLDs — DNS failure proves the request did not go through the proxy (which would have produced a proxy_error instead)."
    - "Cross-process cache test pre-populates the cache because JS_DEBUG_CHECKSUMS is burned in at build time and has no env override (per phase 21 design); test asserts the cache-hit contract by pointing the bin at a 404-only FakeReleaseServer and checking hitCount === 0."

key-files:
  created:
    - tests/helpers/buildFakeAdapterTarball.ts
    - tests/helpers/buildFakeAdapterTarball.test.ts
    - tests/adapters/provision/concurrent.test.ts
    - tests/adapters/provision/proxy.test.ts
    - tests/adapters/provision/cacheRootOverride.test.ts
    - tests/packaging/publishedTarball.test.ts
    - tests/packaging/npxCache.test.ts
  modified:
    - tests/helpers/fakeReleaseServer.ts
    - src/config/paths.ts
    - package.json
    - .planning/phases/21-lazy-runtime-provisioning-of-built-in-adapters-js-debug-debu/deferred-items.md

key-decisions:
  - "Synthetic zip archives built by hand in stored mode (no yazl dependency) — lifted the buildStoredZip technique from tests/adapters/provision/extract.test.ts. Avoids adding a runtime dependency just for test fixtures."
  - "concurrent.test.ts asserts only the observable D-08 contract (hitCount === 1, all installRoot equal) and explicitly does NOT assert the fromCache distribution. Discovered a pre-existing bug where under-lock cache hits still report fromCache:false — logged to deferred-items.md per phase scope boundary (Plan 21-05 forbids modifying src/adapters/provision/*)."
  - "proxy.test.ts uses reservePort() (bind 0 + close) for refused-connection scenarios and .invalid TLDs for DNS-failure scenarios. No real proxy server, no real outbound network, no timing-based flake surface."
  - "npxCache.test.ts pre-populates the cache rather than doing a true cold install. Justification documented in a top-of-file comment: JS_DEBUG_CHECKSUMS is pinned in src/adapters/provision/checksums.ts with no runtime override (per phase 21 SHA-pinning decision); a synthetic tarball cannot satisfy the burned-in SHA. We instead prove the cross-process cache-hit contract that npx dap-cli's second invocation depends on."
  - "Pre-publish gate via DAP_CLI_RUN_PACKAGING=1 + check:pack script chained into check. prepublishOnly already runs check, so publishing a tarball that drops dist/ or accidentally includes src/ now fails before bytes hit the registry. Used --no-file-parallelism in the script to prevent racy npm pack invocations across the two packaging files."
  - "Rule 2 fix in src/config/paths.ts: getDapCliAdaptersDir now honors DAP_CLI_ADAPTERS_DIR. The env var was advertised as a recovery hint in lock.ts and atomicInstall.ts error envelopes but never actually consulted. paths.ts is outside the src/adapters/provision/* scope-restriction of plan 21-05; the fix is minimal and well-tested by cacheRootOverride.test.ts."

patterns-established:
  - "Synthetic adapter archive builders: buildFakeJsDebugTarball / buildFakeDelveTarGz / buildFakeDelveZip each return BuiltArchive { path, sha256, cleanup() } and produce archives whose layout matches what the real extractor expects (e.g. leading js-debug/ directory + strip:1 for js-debug, bare dlv binary for delve)."
  - "FakeReleaseServer handler builders: route-aware handlers (jsDebugTarballHandler, delveArchiveHandler, fixedStatusHandler) so test code never hand-assembles a URL match function — the same routing the real provisioner uses is the same routing the test asserts."
  - "hitCount + hitsByPath() observability on FakeReleaseServer — enables assertions on both 'exactly one download happened' and 'cache hits did not touch the network'."

requirements-completed: []

# Metrics
duration: 25min
completed: 2026-05-25
---

# Phase 21 Plan 05: Test Harness + Packaging Gates Summary

**Rounded out the test harness so the published npm artifact actually delivers lazy provisioning: shared FakeReleaseServer + synthetic-archive helpers, D-08 concurrency test, D-09 proxy tests, D-12 cache-root override test (in-process + cross-process), and prepublishOnly-chained packaging gates that fail the publish if dist/ regresses or if the bin stops hitting its own cache.**

## Performance

- **Duration:** ~25 min
- **Tasks:** 3
- **Files:** 11 changed (7 created, 4 modified)
- **Lines:** +1001 / −2

## Accomplishments

1. **Built reusable test helpers.** `tests/helpers/buildFakeAdapterTarball.ts` produces synthetic js-debug tar.gz, delve tar.gz, and delve zip archives that match the layouts the real extractors expect (leading `js-debug/` for js-debug strip:1; bare `dlv` binary for delve). Each builder returns `{path, sha256, cleanup()}`. Co-located test (`buildFakeAdapterTarball.test.ts`) round-trips every archive through the project's own `extractTarGz` / `extractZip`. Extended `tests/helpers/fakeReleaseServer.ts` with `jsDebugTarballHandler`, `delveArchiveHandler`, `fixedStatusHandler`, and `hitsByPath()`.

2. **Locked the D-08 lockfile-serialization contract.** `tests/adapters/provision/concurrent.test.ts` fires 4 parallel `provisionAdapter('js-debug', ctx)` calls against an empty cache and asserts (a) `server.hitCount === 1` (exactly one download), (b) all 4 callers see the same `installRoot`, (c) zero `provision_lock_timeout`. Warm-cache variant: prime sequentially then assert all 4 parallel calls return `fromCache:true` with `hitCount` unchanged.

3. **Locked the D-09 proxy-handling contract.** `tests/adapters/provision/proxy.test.ts` covers four scenarios with zero real outbound traffic: HTTPS_PROXY pointed at a refused port surfaces `provision_proxy_error`; NO_PROXY=127.0.0.1 bypasses HTTP_PROXY for a local FakeReleaseServer; NO_PROXY suffix matching bypasses the proxy for subdomains (DNS failure proves bypass fired, not proxy error); HTTPS_PROXY does not apply to http:// URLs.

4. **Locked the D-12 DAP_CLI_ADAPTERS_DIR contract.** `tests/adapters/provision/cacheRootOverride.test.ts` proves the env var is honored both at the helper layer (`getDapCliAdaptersDir` returns the override, falls back when whitespace-only or absent) and at the integration layer (`provisionAdapter` installs under the override root and leaves `<DAP_CLI_HOME>/adapters` untouched).

5. **Added pre-publish artifact gates.** `tests/packaging/publishedTarball.test.ts` runs a fresh `npm run build`, then `npm pack --dry-run --json` to assert dist/index.js + README.md + LICENSE + package.json are included and src/, tests/, scripts/, .planning/, dev/, docs/, tmp/, and dev configs are absent; then a real `npm pack` + `tar -x` to confirm the bin entry carries the shebang and the bundled `provisionAdapter` / `withAdapterLock` symbols. `tests/packaging/npxCache.test.ts` builds + packs the current tree, installs the tarball into a fresh prefix, pre-populates the js-debug cache, points the bin at a 404-only FakeReleaseServer, then spawns `dap-cli setup-adapters --adapter js-debug` twice and asserts exit 0 + `hitCount === 0`.

6. **Wired pre-publish into the check chain.** `package.json` now has `"check:pack": "DAP_CLI_RUN_PACKAGING=1 vitest run --no-file-parallelism tests/packaging/"` chained into `"check"` (which `prepublishOnly` already runs). Publishing a tarball that drops `dist/` or strips the provisioner bundle now fails before bytes hit the registry.

## Task Commits

1. **Task 1: Build shared FakeReleaseServer handlers + synthetic archive builders** — `31f29c1` (test)
2. **Task 2: Add concurrent, proxy, and cache-root-override provisioner tests (+ Rule 2 paths.ts fix)** — `47382e0` (test + fix)
3. **Task 3: Add publishedTarball + npxCache packaging gates** — `5230115` (test)

**Plan metadata:** _(final commit at SUMMARY write)_

## Test Results

- `npx vitest run tests/helpers/buildFakeAdapterTarball.test.ts` — **3/3 PASS** (45 ms).
- `npx vitest run tests/adapters/provision/concurrent.test.ts tests/adapters/provision/proxy.test.ts tests/adapters/provision/cacheRootOverride.test.ts` — **8/8 PASS** (~2 s).
- `DAP_CLI_RUN_PACKAGING=1 npx vitest run tests/packaging/` — **4/4 PASS** (~3 s).
- `npx vitest run tests/packaging/` (gate not set) — **4/4 SKIPPED** as designed.
- Full provision suite (`npx vitest run tests/adapters/provision/`) — all 57 tests still pass after the paths.ts change.

## Files Created/Modified

- `tests/helpers/buildFakeAdapterTarball.ts` (created) — `buildFakeJsDebugTarball` (tar.gz, top-level `js-debug/src/{dapDebugServer,bootloader}.js` + minimal package.json), `buildFakeDelveTarGz` (top-level `dlv` binary), `buildFakeDelveZip` (hand-built stored zip via `buildStoredZip`).
- `tests/helpers/buildFakeAdapterTarball.test.ts` (created) — round-trip every archive through the project's own extractor.
- `tests/helpers/fakeReleaseServer.ts` (modified) — added `hitsByPath()`, `jsDebugTarballHandler`, `delveArchiveHandler`, `fixedStatusHandler`.
- `tests/adapters/provision/concurrent.test.ts` (created) — D-08 lockfile serialization: 4 parallel callers, exactly one download (cold) and zero downloads (warm).
- `tests/adapters/provision/proxy.test.ts` (created) — D-09 HTTPS_PROXY refusal, NO_PROXY bypass (exact host + suffix domain), HTTPS_PROXY ignored on http:// URLs.
- `tests/adapters/provision/cacheRootOverride.test.ts` (created) — D-12 DAP_CLI_ADAPTERS_DIR at the helper + integration layer.
- `tests/packaging/publishedTarball.test.ts` (created) — npm pack contents gate (dry-run JSON + real pack + tar -x), gated on `DAP_CLI_RUN_PACKAGING=1`.
- `tests/packaging/npxCache.test.ts` (created) — cross-process cache hit gate using the actual packed bin, gated on `DAP_CLI_RUN_PACKAGING=1`.
- `src/config/paths.ts` (modified) — Rule 2 fix: `getDapCliAdaptersDir` now honors `DAP_CLI_ADAPTERS_DIR` (was advertised in error hints but never consulted).
- `package.json` (modified) — added `check:pack` script and chained it into `check`.
- `deferred-items.md` (modified) — appended a "Discovered during 21-05" section documenting the `fromCache` semantics bug uncovered while writing the concurrent test.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 — Missing critical functionality] DAP_CLI_ADAPTERS_DIR was never read**

- **Found during:** Task 2, while writing `cacheRootOverride.test.ts`.
- **Issue:** `src/config/paths.ts` `getDapCliAdaptersDir(env)` only consulted `DAP_CLI_HOME` and ignored `DAP_CLI_ADAPTERS_DIR`, but the error-recovery hints in `src/adapters/provision/lock.ts` and `src/adapters/provision/atomicInstall.ts` (locked by 21-04's `provision_cache_unwritable` snapshots) tell users to set `DAP_CLI_ADAPTERS_DIR=<writable-path>` to recover. The recovery path was unreachable.
- **Fix:** `getDapCliAdaptersDir` now reads `env.DAP_CLI_ADAPTERS_DIR` first (trim + `path.resolve`), falls back to `path.join(getDapCliHome(env), 'adapters')` when absent or whitespace-only.
- **Scope check:** `src/config/paths.ts` is outside the `src/adapters/provision/*` scope-restriction of plan 21-05, so this is an allowed Rule 2 fix.
- **Files modified:** `src/config/paths.ts`.
- **Commit:** `47382e0`.

### Documented but Deferred

**1. [Out of scope — would require touching src/adapters/provision/*] `fromCache:false` reported under-lock**

- **Discovered during:** `concurrent.test.ts` initial implementation.
- **Behavior:** `provisionJsDebug`, `provisionDelve`, and `provisionDebugpy` all do a double-check inside `withAdapterLock` and return from the inner closure when the marker + entrypoints are already present (the racy "I lost the race, the winner already installed it" path). However, the outer function unconditionally returns `fromCache: false`. So N-1 racers report `installed` to the user when they should report `cached`.
- **Why deferred:** Plan 21-05's scope explicitly forbids modifying `src/adapters/provision/*`. The concurrent test asserts only the observable D-08 contract (`hitCount === 1`, equal `installRoot`); the `fromCache` distribution is documented in `deferred-items.md` under "Discovered during 21-05" for a follow-up.
- **Affected files:** `src/adapters/provision/{jsDebug,delve,debugpy}.ts`.

## Pre-existing Failures (not introduced by this plan)

Confirmed pre-existing across all 5 commits of phase 21 — neither caused nor fixed by 21-05. All listed under `deferred-items.md`:

- `tests/adapters/registry.test.ts > includes debugpy as a built-in adapter` (eager debugpy resolve).
- `tests/integration/debugpyAdapter.test.ts` (2 tests, same root cause).
- `tests/integration/delveAdapter.test.ts` (3 tests — eager delve provision fails confirm in test env).
- TypeScript strict-null errors in `tests/adapters/provision/delve.test.ts`, `tests/adapters/provision/errorSnapshots.test.ts`, `tests/architecture/moduleBoundaries.test.ts`, `tests/cli/setupAdaptersCommand.test.ts`, and exactOptionalPropertyTypes errors in `src/adapters/provision/{debugpy,delve}.ts`.
- ESLint configuration error on `scripts/dev/strip-types-resolve-loader.mjs` (rule expects type info but parserOptions don't enable typed linting for .mjs files).
- `npm run check` end-to-end therefore fails on pre-existing typecheck + lint issues unrelated to 21-05. The `check:pack` step itself passes and is wired correctly.

## Self-Check: PASSED

- `tests/helpers/buildFakeAdapterTarball.ts` — FOUND
- `tests/helpers/buildFakeAdapterTarball.test.ts` — FOUND
- `tests/helpers/fakeReleaseServer.ts` — FOUND (modified)
- `tests/adapters/provision/concurrent.test.ts` — FOUND
- `tests/adapters/provision/proxy.test.ts` — FOUND
- `tests/adapters/provision/cacheRootOverride.test.ts` — FOUND
- `tests/packaging/publishedTarball.test.ts` — FOUND
- `tests/packaging/npxCache.test.ts` — FOUND
- `src/config/paths.ts` — modified
- `package.json` — modified (check:pack added and chained)
- Commit `31f29c1` — FOUND
- Commit `47382e0` — FOUND
- Commit `5230115` — FOUND
- `grep -c check:pack package.json` → 2 (script definition + chain in check) — PASS
