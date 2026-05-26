---
phase: 21-lazy-runtime-provisioning-of-built-in-adapters-js-debug-debu
plan: 03
subsystem: cli
tags: [setup-adapters, commander, provisioning, ci, prewarm, consolidated-consent, strip-types, transform-types, node-module-hook]

# Dependency graph
requires:
  - phase: 21-lazy-runtime-provisioning-of-built-in-adapters-js-debug-debu
    plan: 02
    provides: provisionAdapter(id, ctx), AdapterId union, ProvisionContext/ProvisionResult, JS_DEBUG_VERSION / DEBUGPY_VERSION / DELVE_VERSION constants, hasConsentMarker, confirm + resolveAssumeYes, getDapCliAdaptersDir
provides:
  - dap-cli setup-adapters subcommand (commander) with --adapter <id> choice validation
  - runSetupAdaptersAction(opts) — reusable async action that classifies pending vs cached and issues a single consolidated consent prompt before invoking provisionAdapter per target
  - SetupAdaptersOptions / SetupAdapterEntry / SetupAdaptersResult types
  - Thin developer-facing scripts/setup-adapters.ts wrapper (< 30 lines) that delegates to runSetupAdaptersAction
  - scripts/dev/strip-types-resolve-loader.mjs — node:module resolve hook mapping `./x.js` to `./x.ts` siblings under --experimental-transform-types
  - Flag-matrix test suite covering single-adapter install, warm cache, partial failure, non-TTY consent, and (gated) full install
affects:
  - 21-04 (error envelope tests can lean on the existing usageError shape with code='provision_setup_failed' that runSetupAdaptersAction's action handler throws)
  - 21-05 (CI workflows can replace the old scripts/setup-adapters.ts invocation with `dap-cli setup-adapters --yes`)
  - 21-06 (docs + hand-driven smoke can document `dap-cli setup-adapters --help` as the canonical entry point)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Subcommand factory exports both a thin commander-aware `registerSetupAdaptersCommand(program, output)` AND a reusable async `runSetupAdaptersAction(opts)` so tests can drive the action directly without spinning up the full CLI."
    - "Pending-vs-cached classification done BEFORE the consent prompt so D-14's consolidated `confirm()` names every adapter that will actually be installed. Inner provisioner contexts pass `assumeYes: true` to suppress per-adapter prompts once the outer consent is granted."
    - "Action handler throws `usageError('Adapter setup failed for: ...', { code: 'provision_setup_failed', diagnostics, data })` on partial failure — the action returns the full SetupAdaptersResult, and the CliError carries the diagnostics so main.ts's envelope mapper renders them consistently."
    - "Dev wrapper pattern: scripts/setup-adapters.ts is a < 30-line file that registers a resolve hook then dynamic-imports the real implementation from src/. Production users invoke the bundled dist/ and never load the hook."

key-files:
  created:
    - src/cli/commands/setupAdapters.ts
    - scripts/dev/strip-types-resolve-loader.mjs
    - tests/cli/setupAdaptersCommand.test.ts
  modified:
    - src/cli/program.ts
    - scripts/setup-adapters.ts
    - package.json
  deleted:
    - tests/integration/setupAdapters.test.ts

key-decisions:
  - "Use `--experimental-transform-types` for `npm run setup-adapters` instead of `--experimental-strip-types`. Required because src/cli/exitCodes.ts uses a TypeScript enum, and Node 22's strip-only mode rejects enums with `ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX`. The flag is still experimental on Node 22.22.1 but it's dev-only — production users invoke the bundled `dist/index.js setup-adapters`."
  - "Add scripts/dev/strip-types-resolve-loader.mjs to map `./x.js` → `./x.ts` for relative imports. Verified that Node 22.22's type-stripping ESM loader does NOT perform this fallback (vs. the bundled `tsx`/`ts-node` which do). The hook is registered from inside the wrapper script via `node:module`'s `register()` then the real entry is dynamic-imported, so package.json's npm script stays a one-liner."
  - "`runSetupAdaptersAction` keeps the consent-classification step (`pending` array) entirely separate from the provision-loop. This honors D-14 (single prompt enumerating every adapter to install) and means a warm-cache run never issues a prompt even when `--yes` is not set."
  - "On partial failure the action returns the full `SetupAdaptersResult` (including failed entries with their `error.code`/`error.diagnostics`) BEFORE the action handler throws. Tests use `runSetupAdaptersAction` directly so they assert the full result; the commander action handler throws `usageError` so end-users get a proper exit code via main.ts."
  - "Delete tests/integration/setupAdapters.test.ts. Both of its cases assert removed behaviour (the `--dry-run` flag and the in-DAP_CLI_HOME `<DAP_CLI_HOME>/venv` debugpy layout). The new tests/cli/setupAdaptersCommand.test.ts file covers the equivalent surface using `runSetupAdaptersAction` against an isolated `DAP_CLI_HOME` and a FakeReleaseServer."

patterns-established:
  - "Subcommand modules expose both `register<Name>Command(program, output)` (commander wiring) and `run<Name>Action(opts)` (reusable async) so tests don't need to drive commander."
  - "Dev scripts that need to load src/ TypeScript under `--experimental-transform-types` register the resolve hook in-script via `node:module`'s `register()`, then `await import()` the real entry — keeps the npm script declarative."
  - "Tests that exercise the all-three install path gate on python3 availability (`DAP_CLI_TEST_SKIP_DEBUGPY=1` or no `python3` on PATH) so the suite stays green on CI hosts without Python; cached short-circuit lets the partial-failure case run without python3."

requirements-completed: []

# Metrics
duration: ~2h
completed: 2026-05-25
tasks: 3
commits: 4
files_created: 3
files_modified: 3
files_deleted: 1
---

# Phase 21 Plan 03: setup-adapters CLI Subcommand Summary

Exposed `provisionAdapter` as a first-class `dap-cli setup-adapters` subcommand for CI / pre-warm workflows, and collapsed `scripts/setup-adapters.ts` from a 270-line standalone installer (with its own `spawnSync('tar', ...)` extraction path) into a < 30-line dev wrapper that delegates to the same provisioning code path used at runtime. There is now exactly one provisioning implementation in the project.

## Performance

- **Duration:** ~2h (session)
- **Completed:** 2026-05-25T19:43:26Z
- **Tasks:** 3 atomic tasks + 1 cleanup commit
- **Files created:** 3
- **Files modified:** 3
- **Files deleted:** 1

## Accomplishments

- New `dap-cli setup-adapters` subcommand under the `Adapters` help group, with `--adapter <id>` choice-validated against `js-debug | debugpy | delve`.
- Reusable async `runSetupAdaptersAction(opts)` so other code paths (and tests) can drive the same flow without going through commander.
- Single consolidated D-14 consent prompt that classifies pending vs cached BEFORE asking, and names every adapter that will be installed in one `confirm()`.
- `scripts/setup-adapters.ts` rewritten as a < 30-line dev wrapper. The old in-script `spawnSync('tar' | 'unzip', ...)` extraction path is gone — D-11 is now enforced.
- 5 new tests covering: single-adapter install, warm cache short-circuit, partial failure surfacing in the result, non-TTY consent failure with consolidated diagnostic, and (gated) end-to-end install of all three adapters.

## Task Commits

Each task was committed atomically:

1. **Task 1: Implement `setup-adapters` subcommand** — `1965dd4` (`feat(21-03)`)
   - Added `src/cli/commands/setupAdapters.ts` (190 lines): exports `registerSetupAdaptersCommand` + `runSetupAdaptersAction` + `SetupAdaptersOptions`/`SetupAdapterEntry`/`SetupAdaptersResult` types.
   - Wired into `src/cli/program.ts` under the new `Adapters` help group.
   - Verified via `tests/cli/helpCommand.test.ts` (9/9 still pass) and live `npm run build && node dist/index.js setup-adapters --help`.

2. **Task 2: Collapse `scripts/setup-adapters.ts` into a thin wrapper** — `396675e` (`refactor(21-03)`)
   - Rewrote `scripts/setup-adapters.ts` (270 → 27 lines).
   - Added `scripts/dev/strip-types-resolve-loader.mjs` resolve hook.
   - Switched `package.json` npm script flag from `--experimental-strip-types` to `--experimental-transform-types`.
   - Deleted `tests/integration/setupAdapters.test.ts` (asserts removed behaviour).
   - Verified zero `spawnSync` references in the new script and that `env -u DAP_CLI_ASSUME_YES DAP_CLI_HOME=/tmp/... npm run setup-adapters < /dev/null` exits 1 with `Confirmation required but stdin is not a TTY.`.

3. **Task 3: Flag-matrix tests** — `76d90ba` (`test(21-03)`)
   - Added `tests/cli/setupAdaptersCommand.test.ts` (5 tests, ~6s wall-clock when python3 is available).
   - All 5 pass; the suite verifies the consolidated-consent diagnostic names every pending adapter (js-debug, debugpy, delve).

**Cleanup:** `8d60a21` (`chore(21-03)`) — re-deleted `tests/integration/setupAdapters.test.ts` (the pre-existing-failure verification flow accidentally re-staged it) and folded in the `deferred-items.md` update documenting the pre-existing debugpy/delve integration-test failures that exist on the parent commit too.

## Files Created/Modified

**Created**
- `src/cli/commands/setupAdapters.ts` — subcommand registration + reusable action handler; classifies pending vs cached, issues consolidated consent, loops `provisionAdapter` per target, throws `usageError({code:'provision_setup_failed'})` on partial failure.
- `scripts/dev/strip-types-resolve-loader.mjs` — minimal node:module resolve hook; maps relative `./x.js` imports to their `./x.ts` siblings when present.
- `tests/cli/setupAdaptersCommand.test.ts` — 5-test flag matrix driven against an isolated `DAP_CLI_HOME` and a FakeReleaseServer.

**Modified**
- `src/cli/program.ts` — `+2` lines: import and call `registerSetupAdaptersCommand(program, output)`.
- `scripts/setup-adapters.ts` — full rewrite (270 → 27 lines): registers the resolve hook, dynamic-imports `runSetupAdaptersAction` and `resolveAssumeYes`, parses `--adapter <id>` / `--yes`/`-y`, sets `process.exitCode = 1` on failure or thrown CliError.
- `package.json` — `setup-adapters` npm script flag switched from `--experimental-strip-types` to `--experimental-transform-types`.

**Deleted**
- `tests/integration/setupAdapters.test.ts` — both cases test removed behaviour (`--dry-run` flag and in-`DAP_CLI_HOME` debugpy venv layout).

## Decisions Made

1. **`--experimental-transform-types` over `--experimental-strip-types`.** Required because `src/cli/exitCodes.ts` declares a TypeScript enum, and Node 22.22's strip-only ESM loader rejects enums with `ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX`. The flag is still experimental on Node 22 but it's strictly a contributor-facing flag; end-users invoke `node dist/index.js setup-adapters` from the bundled output and never hit it.

2. **Resolve hook inside the wrapper, not the npm script.** Considered registering the hook via `--import ./scripts/dev/register-ts-resolve.mjs`, but doing it in-script via `node:module`'s `register()` keeps `package.json` as a one-liner and keeps the hook scoped to this one entry point.

3. **Classification step is separate from the provision loop.** `runSetupAdaptersAction` walks the targets list once to compute the `pending` array, then walks it a second time to call `provisionAdapter` per target. This honors D-14 (single consent prompt naming every pending adapter) AND lets a warm-cache run skip the prompt entirely even when `--yes` is not set.

4. **Action returns the full result; commander handler throws.** `runSetupAdaptersAction` returns the full `SetupAdaptersResult` (including failed entries with `error.code` / `error.diagnostics`) regardless of outcome. The commander action handler inspects the result and throws `usageError('Adapter setup failed for: ...', { code: 'provision_setup_failed', diagnostics, data: { adapters } })` on partial failure, so end-users get a proper exit code via `main.ts`'s envelope mapper while test code can introspect the full result without a try/catch.

5. **Delete the legacy integration test rather than port it.** Its two cases assert behaviour Phase 21 deliberately removed: the `--dry-run` flag (the new wrapper has no such flag) and the in-`<DAP_CLI_HOME>/venv` debugpy layout (debugpy now installs into `<adaptersDir>/debugpy/venv/`). The new flag-matrix tests cover the equivalent positive surface.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 — Blocking issue] Node 22's `--experimental-strip-types` rejects enums.**
- **Found during:** Task 2 (wrapper rewrite — first live invocation of `node --experimental-strip-types scripts/setup-adapters.ts`).
- **Issue:** Loading transitive `src/cli/exitCodes.ts` threw `SyntaxError [ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX]: TypeScript enum is not supported in strip-only mode`.
- **Fix:** Switched the npm script and the wrapper's shebang to `--experimental-transform-types` (the broader flag that handles enums and other transforms). Plan must-have "no spawn-shell extraction" stays intact; nothing else in the plan is affected.
- **Files modified:** `package.json`, `scripts/setup-adapters.ts`.
- **Committed in:** `396675e`.

**2. [Rule 3 — Blocking issue] Type-stripping loader does NOT map `.js` → `.ts`.**
- **Found during:** Task 2 (first live invocation, before the enum issue surfaced — the resolver chain wouldn't even reach `exitCodes.ts` because `provision/index.js` imports a `.js` sibling that only exists as `.ts`).
- **Issue:** `src/` uses `.js` extensions on relative imports (NodeNext ESM convention), but Node's strip-types loader treats specifiers literally — no fallback to the `.ts` sibling. Verified by a minimal /tmp playground (`Node 22.22.1`).
- **Fix:** Added `scripts/dev/strip-types-resolve-loader.mjs` (a `node:module` resolve hook) and called `register()` from the wrapper before the dynamic import. Production users invoke `dist/index.js` (built by tsup, which resolves extensions at bundle time) and never load the hook.
- **Files modified:** added `scripts/dev/strip-types-resolve-loader.mjs`, updated `scripts/setup-adapters.ts`.
- **Committed in:** `396675e`.

**3. [Rule 3 — Blocking issue] Legacy integration test asserts removed behaviour.**
- **Found during:** Task 2 (after rewriting the script — running the suite would now fail the existing `tests/integration/setupAdapters.test.ts` which expects `--dry-run` output and the old debugpy venv layout).
- **Issue:** Both test cases assert behaviour Phase 21 deliberately removed (the `--dry-run` flag is gone; debugpy now installs into `<adaptersDir>/debugpy/venv/`, not `<DAP_CLI_HOME>/venv/`).
- **Fix:** Deleted the file. Equivalent positive surface is covered by the new `tests/cli/setupAdaptersCommand.test.ts` flag matrix.
- **Files modified:** deleted `tests/integration/setupAdapters.test.ts`.
- **Committed in:** `396675e` (initial delete), `8d60a21` (re-delete after pre-existing-failure verification flow accidentally restored it).

---

**Total deviations:** 3 auto-fixed (all Rule 3 — blocking issues at the boundary between Node's type-stripping ESM loader and the project's NodeNext `.js`-extension convention; and one test cleanup forced by the Task 2 design).
**Impact on plan:** Plan's must-haves all hold. No scope creep — the loader hook is the minimum work needed to keep `npm run setup-adapters` working without `npm run build`, and the test deletion is a direct consequence of removing the `--dry-run` flag the plan already removed by design.

## Issues Encountered

**Pre-existing test failures (verified on parent commit `396675e`).** 6 tests fail when running the full `npx vitest run` suite, all caused by integration tests calling `createDebugpyDescriptor` / `createDelveDescriptor` synchronously in a non-TTY environment with no provisioned adapters. Same failures exist on `396675e` (the Task 2 parent). Documented in `.planning/phases/.../deferred-items.md` under a new "Preexisting test failures (unrelated to 21-03)" section. Phase 21 plans 21-04 / 21-06 are expected to either rewrite these tests to pre-warm `DAP_CLI_HOME` or eliminate the eager descriptor resolve.

**Stash dance re-added a deleted file.** The pre-existing-failure verification flow (`git stash --include-untracked` → `git checkout HEAD~1 -- .` → run tests → `git checkout HEAD -- .` → `git stash pop`) left `tests/integration/setupAdapters.test.ts` back in the working tree as a tracked file, and the Task 3 commit (`76d90ba`) accidentally re-included it. Fixed in a follow-up `chore(21-03)` commit (`8d60a21`) rather than an amend, per Rob's no-amend / no-force-push preference.

## User Setup Required

None — `dap-cli setup-adapters` is the new canonical pre-warm command and ships with the bundle. Contributors can keep using `npm run setup-adapters` for unbuilt-tree workflows (the wrapper now goes through the same code path).

## Next Phase Readiness

- 21-04 can import the same `usageError` envelope shape (`code: 'provision_setup_failed'`) the action handler throws, and the `SetupAdaptersResult` type for any snapshot tests.
- 21-05 can replace any CI invocation of `node --experimental-strip-types scripts/setup-adapters.ts` with `dap-cli setup-adapters --yes` after the bundle ships.
- 21-06 docs/hand-driven smoke should reference `dap-cli setup-adapters --help` as the canonical entry point.

## Self-Check: PASSED

- All 4 files claimed `created` (3 source + 1 SUMMARY) exist on disk: `src/cli/commands/setupAdapters.ts`, `scripts/dev/strip-types-resolve-loader.mjs`, `tests/cli/setupAdaptersCommand.test.ts`, `.planning/phases/21-.../21-03-SUMMARY.md`.
- All 3 files claimed `modified` are tracked at the new content: `src/cli/program.ts`, `scripts/setup-adapters.ts`, `package.json`.
- File claimed `deleted` (`tests/integration/setupAdapters.test.ts`) confirmed absent from working tree.
- All 4 commits (`1965dd4`, `396675e`, `76d90ba`, `8d60a21`) confirmed in `git log`.
