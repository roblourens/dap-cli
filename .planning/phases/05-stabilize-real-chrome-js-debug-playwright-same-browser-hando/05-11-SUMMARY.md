---
phase: 05-stabilize-real-chrome-js-debug-playwright-same-browser-hando
plan: 11
subsystem: cli/dapCore, config/launchConfig, fixtures
tags: [stability, fixture, docs, gap-closure, uat-2]
gap_closure: true
requirements: [TEST-07]
key-files:
  modified:
    - src/cli/commands/dapCore.ts
    - src/config/launchConfig.ts
    - src/testing/fakeAdapter.ts
    - tests/fixtures/fake-adapter-entry.ts
    - tests/config/launchConfig.test.ts
    - tests/integration/fakeAdapterCli.test.ts
    - README.md
  created:
    - tests/fixtures/simple-node-app/long-running.js
decisions:
  - "stopOnEntry is treated as a pure pass-through flag — both js-debug and debugpy accept the same field name natively, so flag-mapping is a one-line `copyDefined` for each adapter rather than per-adapter translation."
  - "End-to-end --stop-on-entry assertion went into tests/integration/fakeAdapterCli.test.ts (the file that already exercises the launch path with `expect-launch-overrides`) instead of tests/cli/dapGeneratedCommands.test.ts as suggested in the plan — that file is a metadata/registry test and would need a new beforeEach controller harness to do an end-to-end launch."
metrics:
  duration: ~10 minutes
  completed: 2026-05-03
---

# Phase 05 Plan 11: --stop-on-entry + README quick-start that hits a breakpoint Summary

Closes UAT gap 2 (major): the README Node quick-start used to race the fixture — `simple-node-app/index.js` exits in ~50ms, so the follow-up `breakpoints set` landed after termination and came back `verified: false`. The new flow halts on entry first, binds the breakpoint, then continues.

## What was built

**Task 1 — `--stop-on-entry` flag.** Added `stopOnEntry?: boolean` to [`DapStartCommandOptions`](src/cli/commands/dapCore.ts), `.option('--stop-on-entry', ...)` to both the `launch` and `attach` commands (attach support is harmless — the adapter ignores it if unsupported), and `setIfDefined(flags, 'stopOnEntry', options.stopOnEntry)` to `collectFlagOverrides`. In [`src/config/launchConfig.ts`](src/config/launchConfig.ts), both `mapJsDebugFlags` and `mapDebugpyFlags` now `copyDefined(mapped, flags, 'stopOnEntry')` — both adapters accept `stopOnEntry: boolean` natively, so a passthrough is correct. Registered an `expect-stop-on-entry` fake-adapter script in BOTH [`src/testing/fakeAdapter.ts`](src/testing/fakeAdapter.ts) and [`tests/fixtures/fake-adapter-entry.ts`](tests/fixtures/fake-adapter-entry.ts), declared `mode: 'launch'` per 05-07's `validateScriptForMode` contract, with `expectedArguments: { stopOnEntry: true }` on the launch step so the fake adapter actively rejects the launch if the flag does not reach it.

**Task 2 — Long-running fixture + README quick-start.** Created [`tests/fixtures/simple-node-app/long-running.js`](tests/fixtures/simple-node-app/long-running.js), a `setInterval`-driven loop bounded by `DAP_CLI_FIXTURE_ITERATIONS` for the test suite (default: infinite). Updated the README quick-start to use `--stop-on-entry` against the existing `index.js`, sequenced `breakpoints set` then `continue` (the prior order assumed a stopped session that did not yet exist), and added a one-line note pointing readers at `long-running.js` for manual exploration. Did not modify `index.js` — other tests rely on its current shape.

## Tests added

- [tests/config/launchConfig.test.ts](tests/config/launchConfig.test.ts): two new unit tests assert `stopOnEntry` passes through `mapJsDebugFlags` and `mapDebugpyFlags` unchanged.
- [tests/integration/fakeAdapterCli.test.ts](tests/integration/fakeAdapterCli.test.ts): new end-to-end `--stop-on-entry forwards stopOnEntry: true into the launch arguments` test. Uses `runCli(['launch', '--adapter', 'fake', '--script', 'expect-stop-on-entry', '--stop-on-entry', '--name', 'soe-test'])`. The fake adapter's `expectedArguments` matcher fails the launch if `stopOnEntry: true` is missing, so a 0 exit code is positive proof the flag reached the launch arguments.

## Verification

- `npm run typecheck` — clean.
- `npx vitest run tests/cli tests/config tests/integration/fakeAdapterCli.test.ts` — 50/50 pass.
- `npx vitest run tests/integration/docsValidation.test.ts` — 1/1 pass (new README quick-start commands all parse against registered command paths).
- `npm test` — full suite **147 passed | 5 skipped (152 total)**, 0 failures.
- `npm run lint` — 2 pre-existing errors unrelated to this plan (`childSessions.ts:243` prefer-const; `server.ts:318` unbound-method); no new lint errors introduced.

## Manual quick-start verification

The README quick-start was not run end-to-end against a real js-debug install in this plan (test environment did not have js-debug provisioned in a way matching the README invocation). However:

- The new `expect-stop-on-entry` fake-adapter script proves the flag reaches the launch arguments end-to-end through `runCli` → controller → adapter.
- `docsValidation.test.ts` proves every command in the new quick-start parses against registered commands.
- The js-debug adapter accepts `stopOnEntry: boolean` as a documented native field (no flag mapping required).

The remaining unverified link — that js-debug's `stopOnEntry: true` actually halts before user code on a real Node target — is exercised by the existing gated browser/handoff smokes (which run js-debug under DAP_CLI_RUN_BROWSER_SMOKES=1) and is not regressed by this plan. Re-running the README quick-start verbatim against a real js-debug install is recommended as a follow-up manual smoke before the next release.

## Deviations from Plan

### Test placement

Plan suggested adding the end-to-end `--stop-on-entry` assertion to `tests/cli/dapGeneratedCommands.test.ts` or `tests/cli/jsonOutput.test.ts`. Neither actually exercises a fake-adapter launch end-to-end (the first is a metadata/registry test; the second is an output-shape test using `MemoryStream`). The natural home is `tests/integration/fakeAdapterCli.test.ts`, which already runs `expect-launch-overrides` and `expect-attach-overrides` through the real `runCli` → controller → spawned-fake-adapter path. Added the test there.

### Intentionally not done

- `tests/integration/docsValidation.test.ts` was not extended to assert the literal `--stop-on-entry` example string. Its existing assertion (every command in every README example resolves to a registered command path) already covers the new `--stop-on-entry` example via the new `launch` flag. Adding a verbatim string match would be redundant and brittle.
- `index.js` was not modified per plan instructions ("other tests rely on its current shape").

## Commits

- `7517c2a` — feat(05-11): add --stop-on-entry flag and wire through adapter flag mapping
- `c55dd9f` — docs(05-11): README quick-start uses --stop-on-entry; add long-running fixture

## Self-Check: PASSED

- All listed source files exist and contain the described changes.
- Both commit hashes resolve in `git log` on `main`.
- New tests pass; full vitest suite green; no new lint errors.
- New `tests/fixtures/simple-node-app/long-running.js` exists.
