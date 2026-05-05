---
phase: 05-stabilize-real-chrome-js-debug-playwright-same-browser-hando
plan: 12
subsystem: protocol, controller, cli
tags: [stability, gap-closure, uat-13, build-id, ipc]
gap_closure: true
requirements: [TEST-07]
key-files:
  created:
    - src/controller/buildId.ts
  modified:
    - src/protocol/eventCache.ts
    - src/controller/server.ts
    - src/controller/requests.ts
    - src/cli/commands/controller.ts
    - tests/protocol/eventCache.test.ts
    - tests/controller/controllerIpc.test.ts
decisions:
  - "Source-mode build id is `<pkg.version>:src` — deterministic across all source-tree processes (vitest, tsx). Avoids `process.pid` / `Date.now()` so controller reuse during dev/test does NOT trip the mismatch gate. Tradeoff: source-mode id only changes when the package version bumps, not when source files change. Acceptable in dev because users typically reload the controller manually after meaningful refactors; for finer granularity later, upgrade to a sha1 of resolved entrypoint contents."
  - "On build-id mismatch, throw a `controller_build_mismatch` CliError (not a success envelope with a `mismatch` data field). This routes the recovery hint through the existing `error.diagnostics[]` channel so 05-10's backtick-wrapped-suggestion meta-test validates the new `dap-cli stop-controller` recovery command automatically — and matches the convention used by every other CLI recovery hint."
  - "`computeBuildId` honors a `DAP_CLI_BUILD_ID` env override. Primarily for tests (lets controller and CLI in the same vitest process disagree on id), secondarily useful for canary deploys / manual stale-controller diagnosis."
  - "`stop-controller` is a separate command from `stop`. `stop` (no `--name`) already shuts the controller down when no session is selected, but only via the implicit fallback path triggered by `no_active_session`. Surface area for an explicit operator-facing 'kill the controller, no questions asked' command is wide enough — and the recovery hint from `controller_build_mismatch` needs a single unambiguous command to point at."
metrics:
  duration: ~30 minutes
  completed: 2026-05-04
---

# Phase 05 Plan 12: events truncation signal + build-id handshake + stop-controller Summary

Closes UAT gap 13: `dap-cli events --limit 500` silently returned 100 (cache cap), and orphaned controllers from a prior build silently served new CLI requests with no version handshake.

## What was built

**Task 1 — `truncatedToCapacity` on `events.recent`.** [src/protocol/eventCache.ts](src/protocol/eventCache.ts) `EventCacheSnapshot` gains an optional `truncatedToCapacity?: number` field; `DapEventCache.recent` sets it to `this.capacity` whenever the requested `limit` exceeds capacity. The actual `events` count is unchanged (still bounded by the cache); the new field is purely informational so callers can detect the silent clip and either retry with a smaller window or surface a UI hint. [src/controller/server.ts](src/controller/server.ts) `recentEvents` IPC handler threads `truncatedToCapacity` onto its `EventsRecentResult` so the CLI's `events` command sees the field on the wire.

**Task 2 — Deterministic build-id handshake + explicit `stop-controller`.** New module [src/controller/buildId.ts](src/controller/buildId.ts) exports `computeBuildId()`: walks up from `import.meta.url` to find `package.json`, reads its `version`, then probes `dist/index.js` — present → `<version>:dist:<mtimeMs>:<size>`; absent → `<version>:src`. Result is cached per process; an env override `DAP_CLI_BUILD_ID` short-circuits computation (used by tests, also useful for canary deploys). [src/controller/server.ts](src/controller/server.ts) computes the id at `start()`, exposes it on `controller.status` (new `buildId` field) and a new `controller.hello` IPC method (registered in [src/controller/requests.ts](src/controller/requests.ts)). [src/cli/commands/controller.ts](src/cli/commands/controller.ts) `startControllerProcess` now sends `controller.hello` to any reusable existing controller; on mismatch it throws `controller_build_mismatch` (a `CliError` from `controllerError`) with three diagnostic lines: existing build id, current CLI build id, and the backtick-wrapped recovery hint `` Run `dap-cli stop-controller` and retry `dap-cli start` to launch a fresh controller. ``. The new `dap-cli stop-controller` command lives next to `serve-controller`: it reads discovery, returns `{ stopped: false }` if nothing is running, otherwise issues `controller.shutdown` and returns `{ stopped: true }`.

The `start` envelope grew two new fields (`reused: boolean`, `buildId: string`) — purely additive for existing parsers.

## Tests added

- [tests/protocol/eventCache.test.ts](tests/protocol/eventCache.test.ts):
  - `recent() returns truncatedToCapacity when limit exceeds capacity` — capacity 5, 10 events, `limit: 50` → `truncatedToCapacity === 5` and `events.length === 5`.
  - `recent() omits truncatedToCapacity when limit is within capacity` — same cache, `limit: 3` → field is `undefined`.
- [tests/controller/controllerIpc.test.ts](tests/controller/controllerIpc.test.ts):
  - `controller.hello returns a non-empty buildId and the controller pid` — also asserts `status.buildId === hello.buildId`.
  - `controller.shutdown leaves subsequent connect attempts unable to handshake` — covers stop-controller's underlying IPC: discovery removed, dead endpoint fails `isControllerAlive`.
  - `dap-cli stop-controller shuts down a running controller` — end-to-end via `runCli(['stop-controller'])`; asserts exit 0 and discovery is removed.
  - `dap-cli start refuses reuse when controller build id mismatches` — sets `DAP_CLI_BUILD_ID=test-build-controller`, resets cache, starts in-process server, then sets `DAP_CLI_BUILD_ID=test-build-cli`, resets cache, runs `runCli(['start'])`; asserts `controller_build_mismatch` failure envelope contains both build ids and the backtick-wrapped `` `dap-cli stop-controller` `` recovery hint.

## Verification

- `npm run typecheck` — clean.
- `npx vitest run tests/protocol/eventCache.test.ts` — 7/7 pass.
- `npx vitest run tests/controller/controllerIpc.test.ts` — 9/9 pass.
- `npm test` — full suite **160 passed, 5 skipped (165)**.
- `npm run lint` — 2 pre-existing errors unchanged from prior plans (`childSessions.ts:243` prefer-const, `server.ts:340` unbound-method — moved from line 318 due to lines added by this plan); no new lint errors introduced.
- `npm run build` — clean (`dist/index.js` 153.49 KB).
- Manual smoke (`node dist/index.js start` → `{started:true,reused:false,...,buildId:"0.0.0:dist:..."}`; `stop-controller` → `{stopped:true}`; second `stop-controller` → `{stopped:false}`).

## Meta-test interaction (handoff from 05-10)

The new `controller_build_mismatch` diagnostic emits `` `dap-cli stop-controller` `` and `` `dap-cli start` `` — both backtick-wrapped, so 05-10's session-commands meta-test (which only triggers session-class diagnostics) does not exercise this code path automatically, but the new dedicated test in `controllerIpc.test.ts` asserts the backtick-wrapping explicitly. If a future plan extends the meta-test to controller-class diagnostics, `stop-controller` is a real commander command and will parse cleanly.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 — Correctness] Throw `CliError` on build-id mismatch instead of returning a success envelope with a `mismatch` field.**
- **Found during:** Task 2 design.
- **Issue:** The plan suggested `return { started: false, reused: false, mismatch: { existingBuildId, currentBuildId } }` with an "actionable diagnostic". But diagnostics in dap-cli flow through `error.diagnostics[]` on failure envelopes, not through arbitrary success-envelope keys. Returning success would (a) bypass the JSON contract the failure handler enforces, (b) hide the diagnostic from any tool that only inspects `ok:false` envelopes, and (c) miss the 05-10 backtick-wrapped-suggestion machinery.
- **Fix:** Throw a `controllerError(...)` with `code: 'controller_build_mismatch'` and three diagnostic lines (existing id, current id, recovery hint with backtick-wrapped commands). The CLI's existing failure-envelope serializer routes this naturally; existing build ids are preserved in the diagnostics for log forensics.
- **Files modified:** src/cli/commands/controller.ts (`controllerBuildMismatch` helper).
- **Commit:** `c4219ff`.

**2. [Rule 2 — Testability] Added `DAP_CLI_BUILD_ID` env override to `computeBuildId`.**
- **Found during:** Writing the mismatch test.
- **Issue:** The build id is module-cached, and in vitest's same-process model the controller server and the CLI's `start` handler share that cache. Without an override, no test can simulate a mismatch.
- **Fix:** `computeBuildId` checks `process.env.DAP_CLI_BUILD_ID` before any disk I/O. Combined with the new `resetCachedBuildIdForTesting()` exported helper, tests can flip the id between server-start and CLI-start. Side benefit: ops can force a build id for canary deploys or to test stale-controller diagnostics manually.
- **Files modified:** src/controller/buildId.ts.
- **Commit:** `c4219ff`.

### Intentionally not done

- **Did not change `events --limit` to clamp at capacity.** The plan is explicit: surface truncation, don't change behavior. Capacity stays at 100 (the eventual fix is to make capacity configurable per session, which is out of scope for this gap).
- **Did not change source-mode build id to a content hash.** Per the plan's tradeoff documentation: source-mode only changes when `package.json` version bumps. Cheap, deterministic across processes in the same checkout, and acceptable because dev users restart the controller after meaningful refactors anyway.

## Commits

- `b5851db` — feat(05-12): surface truncatedToCapacity on events.recent
- `c4219ff` — feat(05-12): build-id handshake on start, dap-cli stop-controller

## Handoff

- The `start` JSON envelope is now `{ started, reused, pid, endpoint, stateDir, logDir, buildId }` — additive only; existing parsers continue to work.
- `controller.status` now includes `buildId`; `controller.hello` is the new lightweight IPC for build-id-only checks.
- `tests/helpers/runCli.ts > stopController` cleanup helper is unchanged; it still uses `client.request('controller.shutdown')` directly (verified — full integration suite passes).
- If a future plan changes the build id format, also update the `EXAMPLE` formats in any docs under `docs/` (none reference build id today).

## Self-Check: PASSED

- All listed source files exist on disk: `src/controller/buildId.ts` (created), modified files contain the described changes.
- Both commit hashes (`b5851db`, `c4219ff`) resolve in `git log` on `main`.
- New tests pass (7 eventCache + 9 controllerIpc); full vitest suite **160 passed, 5 skipped**; build succeeds; no new lint errors.
