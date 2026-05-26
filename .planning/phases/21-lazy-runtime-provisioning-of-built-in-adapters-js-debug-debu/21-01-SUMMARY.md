---
phase: 21-lazy-runtime-provisioning-of-built-in-adapters-js-debug-debu
plan: 01
subsystem: adapters
tags: [provisioning, lockfile, undici, proxy-agent, tar, yauzl, fetch, async-registry, consent, confirm-prompt]

# Dependency graph
requires:
  - phase: 20-built-in-adapter-management
    provides: AdapterRegistry, AdapterDescriptor, src/adapters/builtins/{jsDebug,debugpy,delve}, ~/.dap-cli/adapters/ layout, setup-adapters CLI
provides:
  - confirm() prompt + resolveAssumeYes() with --yes / DAP_CLI_ASSUME_YES=1 / non-TTY fast-fail
  - program-level --yes flag wired through commander preAction
  - extractTarGz (tar@7 strict + strip option) — no shell-out
  - extractZip (yauzl) with zip-slip / absolute-path / drive-letter / symlink guards
  - downloadToFile (undici fetch + ProxyAgent) with structured network/proxy/rate-limit error classification + Content-Length progress
  - withAdapterLock (proper-lockfile, 60×0.5–2s retries, 5min stale) keyed by .<id>.lock-target sentinel
  - atomicInstall — stage → verify expected entrypoints → fs.rm canonical → fs.rename (cleanup on failure)
  - hasConsentMarker / writeConsentMarker keyed at <dir>/<id>/.consent-<version>
  - tests/helpers/fakeReleaseServer.ts (http server + serveBuffer/serveStatus + hitCount)
  - AdapterRegistry.resolve is now async (D-17) — no parallel sync path that could bypass provisioning
affects: 21-02 (js-debug), 21-03 (debugpy), 21-04 (delve), 21-05 (setup-adapters subcommand), 21-06 (docs + end-to-end)

# Tech tracking
tech-stack:
  added: [proper-lockfile@^4.1.2, tar@^7.5.15, yauzl@^3.3.1, undici@^7, @types/proper-lockfile, @types/yauzl]
  patterns:
    - "Provision primitive = pure function, no AdapterDescriptor knowledge — each plan composes them"
    - "All extract / install errors carry the offending path in CliError.diagnostics for actionable messages"
    - "Test-only retry override via injected retryOverride OR DAP_CLI_LOCK_RETRY_OVERRIDE env JSON"
    - "Hand-crafted stored-mode zip buffers in tests (no @types/yazl exists) so malicious shapes are precise"
    - "fakeReleaseServer is a 127.0.0.1 http.createServer with hitCount — reused across http.test and future install tests"

key-files:
  created:
    - src/cli/confirm.ts
    - src/adapters/provision/extractTarGz.ts
    - src/adapters/provision/extractZip.ts
    - src/adapters/provision/http.ts
    - src/adapters/provision/lock.ts
    - src/adapters/provision/atomicInstall.ts
    - src/adapters/provision/consent.ts
    - tests/cli/confirm.test.ts
    - tests/adapters/provision/extract.test.ts
    - tests/adapters/provision/http.test.ts
    - tests/adapters/provision/lock.test.ts
    - tests/adapters/provision/atomicInstall.test.ts
    - tests/adapters/provision/consent.test.ts
    - tests/helpers/fakeReleaseServer.ts
  modified:
    - src/adapters/registry.ts
    - src/cli/commands/dapCore.ts
    - src/cli/program.ts
    - tests/adapters/registry.test.ts
    - tests/integration/jsDebugAdapter.test.ts
    - tests/integration/delveAdapter.test.ts
    - tests/integration/debugpyAdapter.test.ts
    - package.json
    - package-lock.json

key-decisions:
  - "Adopted undici@^7 explicitly — Node 22's bundled undici does not expose ProxyAgent as a resolvable import"
  - "extractZip uses yauzl (read-only) and refuses any '..' segment, POSIX absolute paths, drive-letter paths, and symlink entries (POSIX mode 0o120000 in upper 16 bits of externalFileAttributes)"
  - "Lock retry budget = 60 retries × 0.5–2s linear (~60s wall) — covers worst-case js-debug install while still surfacing genuine deadlocks; test injection via retryOverride / DAP_CLI_LOCK_RETRY_OVERRIDE"
  - "Consent marker is per-adapter AND per-version (.consent-<version>) so a new release re-prompts"
  - "AdapterRegistry.resolve made async with NO parallel sync method (D-17) so future provisioners cannot be silently bypassed by a leftover sync caller"
  - "downloadToFile classifies fetch TypeError.cause: when HTTPS_PROXY/HTTP_PROXY is in effect → provision_proxy_error (proxy URL in diagnostics); otherwise → provision_network_error with cause code"
  - "Did NOT install @types/yazl (no such package); tests build malicious zips by hand via node:zlib.crc32 + DOS field encoding"

patterns-established:
  - "Provision primitives live under src/adapters/provision/ and only depend on node + the three new third-party packages — composable, no AdapterDescriptor knowledge"
  - "Error mapping convention: provision_consent_required, provision_consent_declined, provision_extract_failed, provision_network_error, provision_proxy_error, provision_rate_limited, provision_lock_timeout, provision_install_failed — all routed through usageError() so the CLI rendering layer formats them uniformly"
  - "Per-adapter sentinel files inside <adaptersDir> (.<id>.lock-target, .<id>.tmp.<pid>.<hex>, <id>/.consent-<ver>) — siblings of canonical adapter dirs, not nested children, so canonical dir replace is atomic"
  - "Tests prefer hand-crafted byte fixtures over real downloads/extracts when shape control matters (zip-slip etc.); real-shape fixtures via the tar package for happy paths"

requirements-completed: []

# Metrics
duration: ~70 min
completed: 2025-12-04
---

# Phase 21 Plan 01: Lazy provisioning scaffold Summary

**Cross-cutting provisioning primitives (lock + atomic install + undici download with proxy/rate-limit classification + tar.gz/zip extract with zip-slip guard + per-version consent marker + --yes/DAP_CLI_ASSUME_YES plumbing) and async `AdapterRegistry.resolve` — every per-adapter plan (21-02..21-04) and the setup-adapters subcommand (21-05) now compose against these primitives instead of inventing their own.**

## Performance

- **Duration:** ~70 min wall (5 atomic task commits + final SUMMARY)
- **Started:** 2025-12-04T11:00:00Z (approx)
- **Completed:** 2025-12-04T12:10:00Z (approx)
- **Tasks:** 5
- **Files modified:** 23 (14 created, 9 modified)

## Accomplishments
- Six new provision primitives under `src/adapters/provision/` (extractTarGz, extractZip, http.downloadToFile, withAdapterLock, atomicInstall, consent markers) — all unit-tested in isolation
- `confirm()` + `resolveAssumeYes()` helper with non-TTY fast-fail; program-level `--yes` flag wired through commander preAction so any subcommand inherits it via `DAP_CLI_ASSUME_YES=1`
- `AdapterRegistry.resolve()` is now async (`Promise<AdapterDescriptor>`), with no parallel sync method (D-17). Two call sites in `dapCore.ts` + four test sites updated
- New shared `tests/helpers/fakeReleaseServer.ts` (http.createServer + hitCount + serveBuffer/serveStatus helpers) for plans 21-02/21-03/21-04 to reuse
- 41 new unit tests across 6 files, all passing; full unit suite green at 460/461 (one preexisting env failure unrelated to this plan — see deferred-items.md)
- `npm run build` (tsup) succeeds clean

## Task Commits

Each task was committed atomically:

1. **Task 1: `--yes` plumbing + `confirm()` helper** — `8a5e963` (feat)
2. **Task 2: tar.gz + zip extract primitives with zip-slip guard** — `d153df8` (feat)
3. **Task 3: `downloadToFile` with proxy + rate-limit handling** — `2567c18` (feat)
4. **Task 4: lockfile + atomic install + consent marker** — `92bab8e` (feat)
5. **Task 5: make `AdapterRegistry.resolve` async (D-17)** — `014a702` (refactor)

**Plan metadata:** _this commit_ (docs: complete plan)

## Files Created/Modified

### Created — provision primitives
- `src/cli/confirm.ts` — `confirm()` (readline/promises, throws `provision_consent_required` on non-TTY with `--yes`/`DAP_CLI_ASSUME_YES` hint in diagnostics, throws `provision_consent_declined` on "no") + `resolveAssumeYes(cliYes, env)`
- `src/adapters/provision/extractTarGz.ts` — wraps `tar.x({ strict:true, strip })`; maps errors to `provision_extract_failed`
- `src/adapters/provision/extractZip.ts` — yauzl lazyEntries mode; per-entry guards reject `..`, absolute paths, Windows drive paths, and POSIX-mode 0o120000 symlinks BEFORE `openReadStream`; offending entry name in diagnostics
- `src/adapters/provision/http.ts` — `downloadToFile({url,destPath,onProgress?,env?})`; HTTPS-only except 127.0.0.1/localhost; HTTPS_PROXY/HTTP_PROXY + NO_PROXY suffix matching via undici `ProxyAgent`; 403+`X-RateLimit-Remaining:0` → `provision_rate_limited` (diagnostics include `X-RateLimit-Reset` + literal `GITHUB_TOKEN` hint); other !ok → `provision_network_error`; fetch TypeError → `provision_proxy_error` (when proxy in effect) else `provision_network_error`
- `src/adapters/provision/lock.ts` — `withAdapterLock(adaptersDir, adapterId, fn, options?)`; production retry 60×0.5–2s linear, stale 5min, realpath:false; sentinel `${adaptersDir}/.${adapterId}.lock-target`; ELOCKED/EEXIST → `provision_lock_timeout`; test override via `retryOverride` arg or `DAP_CLI_LOCK_RETRY_OVERRIDE` env JSON
- `src/adapters/provision/atomicInstall.ts` — stages into `.${id}.tmp.${pid}.${randomBytes(4).toString('hex')}`, invokes `populate()`, verifies each `expectedEntrypoints[]` relative to staging, `fs.rm` canonical with `{recursive:true, force:true, maxRetries:5, retryDelay:100}`, then `fs.rename` staging → canonical; cleans staging on any failure
- `src/adapters/provision/consent.ts` — `hasConsentMarker` / `writeConsentMarker` at `<dir>/<id>/.consent-<version>`; idempotent writes

### Created — tests + helpers
- `tests/cli/confirm.test.ts` — 11 tests
- `tests/adapters/provision/extract.test.ts` — 9 tests (incl. hand-crafted store-mode zip with crafted unixMode for symlink case)
- `tests/adapters/provision/http.test.ts` — 8 tests (200/500/rate-limit/non-https/DNS/proxy/no-proxy bypass/progress)
- `tests/adapters/provision/lock.test.ts` — 3 tests (serialized contention, cross-id independence, retry exhaustion)
- `tests/adapters/provision/atomicInstall.test.ts` — 4 tests (happy / canonical replacement / missing entry point / populate throws)
- `tests/adapters/provision/consent.test.ts` — 5 tests (absent / round-trip / per-version / per-adapter / idempotent)
- `tests/helpers/fakeReleaseServer.ts` — `startFakeReleaseServer(handlers)` + `serveBuffer` / `serveStatus` + `hitCount`

### Modified
- `src/adapters/registry.ts` — `BuiltInAdapterFactory.create` returns `AdapterDescriptor | Promise<AdapterDescriptor>`; `resolve` is now `async`
- `src/cli/commands/dapCore.ts` — `await` both `new AdapterRegistry({ config: adapterConfig }).resolve(adapterId)` call sites (lines 246, 291)
- `src/cli/program.ts` — added `-y, --yes` option + `program.hook('preAction', ...)` that sets `process.env.DAP_CLI_ASSUME_YES = '1'`
- `tests/adapters/registry.test.ts` — `await` 3 sites; convert `adapter_not_found` assertion to `rejects.toMatchObject`; remove now-unused `catchErrorCode` helper
- `tests/integration/{jsDebugAdapter,delveAdapter,debugpyAdapter}.test.ts` — `await` every `registry.resolve(...)` (and `resolveDebugpyDescriptor()` at its three sites)
- `package.json` / `package-lock.json` — add deps + dev-deps listed in tech-stack

## Decisions Made

- **undici as an explicit dep (not Node's bundled copy).** Node 22 bundles undici internally but does NOT expose it as a resolvable user-land import — `import { ProxyAgent } from 'undici'` fails until the package is in `node_modules`. Installed `undici@^7`. While doing so, switched to undici's own `fetch` to avoid a deep type clash between `@types/node`'s embedded `undici-types` and the standalone `undici` package's `Dispatcher` definition.
- **No `@types/yazl`.** No such package exists in the registry. We don't need yazl at runtime — only crafted zip fixtures in tests. Wrote a small `buildStoredZip(entries)` helper in `tests/adapters/provision/extract.test.ts` that emits minimal stored-mode zips with arbitrary `unixMode` so the symlink (`0o120777`) test case is byte-precise.
- **AdapterRegistry.resolve fully async (D-17).** Did not add a parallel `resolveProvisioned()` async method — any leftover sync caller is a guaranteed bypass of provisioning. Forcing every site to `await` is mechanical and was completed in Task 5.
- **Lock retry budget.** 60 retries × 0.5–2s linear (~60s ceiling) is the worst case of js-debug's ~30s download/extract + jitter. Anything beyond that is more likely a true deadlock than contention, so we'd rather surface `provision_lock_timeout` than spin forever. Stale window kept at 5min so a real OOM-killed installer is recoverable on the next attempt.
- **Consent marker per-version.** `.consent-<version>` (not `.consent`) so when 21-02..21-04 bump a default adapter version the user re-consents to the new payload.

## Deviations from Plan

None — plan executed as written. No Rule-1/2/3 auto-fixes were needed beyond mechanical type-system follow-up (PRODUCTION_RETRY typed as `RetryConfig` so `retryOverride` is assignable; `extractCause` only spreads `code`/`message` when defined to satisfy `exactOptionalPropertyTypes`; switched to undici's own `fetch` to dodge the `@types/node` vs `undici` Dispatcher clash). All three are direct consequences of TypeScript's strict mode reacting to the just-introduced types.

**Total deviations:** 0 (no scope changes; only same-PR strict-mode tightening)
**Impact on plan:** None.

## Issues Encountered

- **`@types/yazl` not in registry.** Resolved by removing yazl entirely and hand-crafting test zips via `node:zlib.crc32`.
- **undici-types vs undici Dispatcher type clash.** When using global `fetch` (typed by `@types/node`'s embedded `undici-types`) with an undici@7 `Dispatcher` instance, `tsc` rejected the request init shape on a deeply nested compose method. Switched to undici's own `fetch` so both sides see the same `Dispatcher` definition.
- **Preexisting test failure:** `tests/adapters/registry.test.ts > includes debugpy as a built-in adapter` fails on this machine because `python -c 'import debugpy'` does not succeed. Verified identical failure on the parent commit (`92bab8e`) by stashing local changes — this is environment-dependent, not a regression. Will become obsolete when 21-04 lazy-provisions debugpy. Logged in `.planning/phases/21-lazy-runtime-provisioning-of-built-in-adapters-js-debug-debu/deferred-items.md`.
- **Preexisting tsc warnings:** `tests/adapters/delve.test.ts` TS18048 ×4. Unchanged by this plan; deferred to a follow-up `chore(tests)` or 21-06.

## User Setup Required

None — no external service configuration required. Provisioning primitives are pure code; they don't call any real GitHub/PyPI endpoint until 21-02..21-04 compose them.

## Next Phase Readiness

- 21-02 (js-debug) can compose `withAdapterLock` + `downloadToFile` (assets from GitHub Releases) + `extractTarGz` + `atomicInstall` + `confirm` + `hasConsentMarker/writeConsentMarker`. The `tests/helpers/fakeReleaseServer.ts` helper is ready to back end-to-end install tests.
- 21-03 (debugpy) can compose the same primitives over pip wheels (or `python -m pip` invocation behind `withAdapterLock`).
- 21-04 (delve) can compose `downloadToFile` (release tarballs/zips) + `extractTarGz`/`extractZip` + `atomicInstall`.
- 21-05 (setup-adapters subcommand) inherits `--yes` automatically via the program-level preAction hook; just needs to read `DAP_CLI_ASSUME_YES`.

No blockers.

## Self-Check: PASSED

- All created files exist:
  - `src/cli/confirm.ts` ✓
  - `src/adapters/provision/{extractTarGz,extractZip,http,lock,atomicInstall,consent}.ts` ✓
  - `tests/cli/confirm.test.ts` ✓
  - `tests/adapters/provision/{extract,http,lock,atomicInstall,consent}.test.ts` ✓
  - `tests/helpers/fakeReleaseServer.ts` ✓
  - `.planning/phases/21-lazy-runtime-provisioning-of-built-in-adapters-js-debug-debu/deferred-items.md` ✓
- All five task commits present in `git log`:
  - `8a5e963` ✓ `d153df8` ✓ `2567c18` ✓ `92bab8e` ✓ `014a702` ✓
- `npm run build`: PASS
- Unit suite: 460/461 PASS (1 preexisting env failure documented in deferred-items.md and verified preexisting on parent commit)

---
*Phase: 21-lazy-runtime-provisioning-of-built-in-adapters-js-debug-debu*
*Plan: 01*
*Completed: 2025-12-04*
