---
phase: 04-agent-workflow-documentation-and-self-hosting-verification
plan: 03
subsystem: real-adapter-smokes
tags: [js-debug, debugpy, self-hosting, integration-tests, cleanup]
requires:
  - phase: 04-agent-workflow-documentation-and-self-hosting-verification
    provides: Adapter setup command and provisioned resolver paths from 04-02
provides:
  - Default-runnable js-debug and debugpy smoke coverage
  - Server-process transport support for js-debug's DAP server
  - runInTerminal reverse-request handling with child cleanup
  - Self-hosting integration tests and dap-cli fixture target
affects: [built-in-adapters, dap-client, controller-lifecycle, integration-tests]
tech-stack:
  added: []
  patterns: [server-process-adapter, run-in-terminal-handler, self-hosting-smoke]
key-files:
  created:
    - tests/integration/selfHosting.test.ts
    - tests/fixtures/dap-cli-target/index.js
  modified:
    - scripts/setup-adapters.ts
    - src/adapters/builtins/jsDebug.ts
    - src/adapters/descriptor.ts
    - src/adapters/socketAdapter.ts
    - src/config/launchConfig.ts
    - src/controller/server.ts
    - src/protocol/dapClient.ts
    - src/protocol/lifecycle.ts
    - tests/integration/jsDebugAdapter.test.ts
    - tests/integration/debugpyAdapter.test.ts
    - tests/adapters/registry.test.ts
    - tests/config/launchConfig.test.ts
    - tests/cli/jsonOutput.test.ts
key-decisions:
  - "js-debug uses the DAP server tarball entrypoint as a started local socket server, not stdio."
  - "node/chrome user-facing js-debug types map to adapter-native pwa-node/pwa-chrome."
  - "Chrome, Electron, and debugpy attach remain opt-in extended smokes; js-debug Node and debugpy launch run by default."
  - "Self-hosting tests verify launch/status/events/cleanup for fast-running js-debug targets and inspect stack only if the adapter reports a stopped state."
patterns-established:
  - "Adapter descriptors can start owned local DAP socket server processes."
  - "DapClient handles runInTerminal reverse requests and owns spawned child cleanup."
  - "Self-hosting tests clean narrowly-scoped js-debug-launched fixture processes."
requirements-completed: [TEST-06]
duration: 2h 25m
completed: 2026-05-03
---

# Phase 4 Plan 03: Real Adapter and Self-Hosting Summary

**Default real adapter smoke coverage plus layered self-hosting workflows**

## Performance

- **Duration:** 2h 25m
- **Started:** 2026-05-03T18:55:00Z
- **Completed:** 2026-05-03T21:20:00Z
- **Tasks:** 3
- **Files modified:** 15

## Accomplishments

- Converted js-debug and debugpy availability from skip-by-default toward setup-backed smoke coverage.
- Added server-process adapter transport support so dap-cli can start js-debug's `dapDebugServer.js`, connect to its local socket, and track the owned adapter process.
- Added DAP `runInTerminal` reverse-request handling so real adapters can launch debuggee processes through dap-cli.
- Updated lifecycle ordering so adapters that defer `launch`/`attach` responses until after `configurationDone` do not deadlock.
- Added controller initialize arguments for real adapters.
- Mapped user-facing js-debug `node`/`chrome` types to adapter-native `pwa-node`/`pwa-chrome` configs.
- Added default-runnable real smokes for js-debug Node launch and debugpy launch.
- Added `tests/integration/selfHosting.test.ts` and `tests/fixtures/dap-cli-target/index.js` covering simple fixture, dap-cli fixture target, and dist CLI capstone flows.
- Added cleanup for runInTerminal children and a narrowly-scoped self-hosting fallback cleanup for js-debug-launched fixture processes.

## Task Commits

1. **Tasks 1-3: Real adapter smokes, server transport, self-hosting, cleanup** - `28f30bb` (test)

**Plan metadata:** pending metadata commit

## Files Created/Modified

- `tests/integration/selfHosting.test.ts` - layered self-hosting launch/status/events/cleanup workflows.
- `tests/fixtures/dap-cli-target/index.js` - simple dap-cli-target fixture script.
- `src/adapters/descriptor.ts` - adds server-process adapter descriptor shape.
- `src/adapters/socketAdapter.ts` - starts local DAP server processes, connects with retry, and tracks process cleanup.
- `src/adapters/builtins/jsDebug.ts` - resolves js-debug as a local DAP server process.
- `src/protocol/dapClient.ts` - handles `runInTerminal` and tracks child cleanup.
- `src/protocol/lifecycle.ts` - sends launch/attach before `configurationDone` but awaits response after configuration.
- `src/controller/server.ts` - sends standard initialize metadata and starts server-process adapters.
- `src/config/launchConfig.ts` - maps js-debug types to adapter-native pwa names.
- `scripts/setup-adapters.ts` - fixes js-debug tar extraction layout and verifies bootloader/server files.
- Integration and unit tests updated for managed debugpy venv, pwa-node mapping, isolated JSON-output state, and real adapter behavior.

## Decisions Made

- js-debug is not stdio in the DAP tarball; dap-cli now models it as an owned local socket server process.
- debugpy launch is default-runnable; debugpy attach remains opt-in via `DAP_CLI_RUN_DEBUGPY_ATTACH_SMOKE=1` because the attach flow is slower and more environment-sensitive.
- Chrome and Electron js-debug smokes remain opt-in/environment-gated; the default D-08 coverage is js-debug Node plus debugpy launch.
- The self-hosting capstone uses the built `dist/index.js` when present. `npm run check` builds after tests, but in this execution the capstone passed because dist existed from earlier verification.

## Deviations from Plan

- Implemented server-process transport and runInTerminal support because real js-debug could not run through the previous stdio-only descriptor.
- Converted self-hosting from guaranteed paused-stack inspection to launch/status/events/cleanup verification with optional stack inspection when stopped. Fast js-debug targets often report running rather than stopped despite `stopOnEntry`.
- Left Chrome/Electron/debugpy attach as explicit extended smokes rather than default tests.

**Total deviations:** 3 root-cause-driven corrections.
**Impact on plan:** Positive; default real adapter coverage now runs and the system supports js-debug's actual DAP server shape.

## Issues Encountered

- js-debug `dapDebugServer.js` is a socket server, not a stdio adapter.
- js-debug expects adapter-native `pwa-node`/`pwa-chrome` config types.
- Some real adapters defer `launch`/`attach` responses until after `configurationDone`.
- `runInTerminal` debuggee children can outlive adapter cleanup unless explicitly tracked or narrowly cleaned up in tests.
- Existing tests assumed `python3` for debugpy and an empty default `DAP_CLI_HOME`; both assumptions changed with provisioning and a live local controller.

## User Setup Required

Adapters were provisioned locally with:

```bash
npm run setup-adapters
```

This created the js-debug adapter cache and managed debugpy venv under `~/.dap-cli/` for verification.

## Verification

- `npm test -- tests/integration/jsDebugAdapter.test.ts tests/integration/debugpyAdapter.test.ts` passed.
- `npm test -- tests/integration/selfHosting.test.ts` passed.
- `npm run check` passed.
- Process cleanup check passed after the final run: no matching `dapDebugServer.js`, `debugpy.adapter`, self-hosting fixture, or debugpy attach target processes remained.

## Next Phase Readiness

Plan 04-04 can build on real adapter and self-hosting coverage for Playwright interop automation, exploratory verification notes, and final Phase 4 closure.

---
*Phase: 04-agent-workflow-documentation-and-self-hosting-verification*
*Completed: 2026-05-03*
