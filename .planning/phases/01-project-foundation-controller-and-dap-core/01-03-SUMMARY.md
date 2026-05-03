---
phase: 01-project-foundation-controller-and-dap-core
plan: 03
subsystem: controller-ipc
tags: [controller, ipc, discovery, cli, lifecycle]
requires:
  - 01-02
provides:
  - Persistent local controller server lifecycle
  - DAP_CLI_HOME-derived discovery file and IPC endpoint
  - Newline-delimited JSON controller IPC
  - Controller client with request IDs, zod response validation, and timeouts
  - Top-level dap-cli start/status/stop commands
affects: [phase-1, cli, controller, config, testing]
tech-stack:
  added: []
  patterns:
    - Local net.Server IPC with JSON lines
    - Discovery validation with zod
    - Built CLI start command spawns hidden serve-controller mode
key-files:
  created:
    - src/controller/ipc.ts
    - src/controller/server.ts
    - src/controller/diagnostics.ts
    - src/config/schema.ts
    - tests/controller/controllerIpc.test.ts
    - tests/helpers/runCli.ts
  modified:
    - src/controller/client.ts
    - src/controller/requests.ts
    - src/config/paths.ts
    - src/cli/commands/controller.ts
    - src/cli/program.ts
    - src/cli/main.ts
    - tests/cli/jsonOutput.test.ts
key-decisions:
  - "Common controller UX is top-level dap-cli start/status/stop, not dap-cli controller start."
  - "serve-controller is a hidden internal command used by start to spawn the persistent process."
  - "Controller IPC uses newline-delimited JSON and validates request/response envelopes with zod."
patterns-established:
  - "Controller discovery is stored at DAP_CLI_HOME/state/controller.json."
  - "Controller start removes stale discovery before spawning a new controller."
  - "Controller unavailable and timeout failures use structured JSON errors."
requirements-completed:
  - SESS-01
  - AGNT-02
  - TEST-03
duration: 0 min
completed: 2026-05-02
---

# Phase 1 Plan 03: Controller IPC Summary

**Persistent controller discovery, local JSON IPC, server/client lifecycle, and top-level controller commands**

## Performance

- **Duration:** 0 min
- **Started:** 2026-05-02T00:00:00Z
- **Completed:** 2026-05-02T00:00:00Z
- **Tasks:** 2 completed
- **Files modified:** 6 created, 7 modified

## Accomplishments

- Added controller discovery types, zod validation, discovery read/write/remove helpers, stale-health checks, and local IPC socket creation.
- Added a persistent `ControllerServer` that writes discovery, handles status and shutdown requests, rejects malformed JSON as structured controller errors, and removes discovery on shutdown.
- Added a controller client with request IDs, response schema validation, and default request timeout behavior.
- Wired top-level `dap-cli start`, `dap-cli status`, and `dap-cli stop` commands, plus hidden `serve-controller` mode for the persistent process.
- Added controller IPC tests for discovery creation, stale pid detection, malformed request handling, request timeout, and multi-client status/shutdown behavior.
- Added an isolated built-CLI smoke for `start`, `status`, `stop`, and post-stop `status` failure.

## Task Commits

Implementation will be committed with this summary as a single Plan 01-03 commit.

## Files Created/Modified

- `src/controller/ipc.ts` - discovery schema, path resolution, health checks, socket creation, and endpoint connection.
- `src/controller/server.ts` - persistent local controller server and lifecycle routes.
- `src/controller/client.ts` - JSON IPC controller client.
- `src/controller/requests.ts` - controller method and request/response zod schemas.
- `src/controller/diagnostics.ts` - structured controller diagnostic helpers.
- `src/config/schema.ts` - initial config schema module.
- `src/cli/commands/controller.ts` - top-level start/status/stop and hidden serve-controller commands.
- `src/cli/program.ts` - command registration now receives the active stdout stream.
- `src/cli/main.ts` - creates the program with the active stdout stream.
- `tests/controller/controllerIpc.test.ts` - controller discovery and IPC coverage.
- `tests/helpers/runCli.ts` - subprocess CLI test helper.
- `tests/cli/jsonOutput.test.ts` - updated handled controller failure fixture.

## Decisions Made

- Used local IPC sockets for the controller endpoint and kept TCP in the endpoint type for future compatibility.
- Kept live session count at `0` until the session manager plan owns session state.
- Left adapter/session behavior out of this layer; unimplemented controller methods return structured method errors.

## Deviations from Plan

None - plan executed within controller discovery/IPC/lifecycle scope.

---

**Total deviations:** 0 auto-fixed.  
**Impact on plan:** No scope change.

## Issues Encountered

- Strict optional property typing required option bags to explicitly accept `undefined` for environment-derived values.
- The `net.Server.listen` overload needed separate IPC and TCP branches for TypeScript to narrow endpoint types correctly.
- Lint required `Command` to be imported as a type-only import and the discovery path helper to be synchronous.

## Verification

- `npm test -- tests/controller/controllerIpc.test.ts tests/cli/jsonOutput.test.ts -- --run` passed.
- `npm run typecheck` passed.
- `npm run check` passed: typecheck, lint, tests, and build.
- Isolated built CLI smoke with `DAP_CLI_HOME=$PWD/.tmp/controller-smoke` passed:
  - `node dist/index.js start` returned `ok: true` and `started: true`.
  - `node dist/index.js status` returned the same controller pid and `sessionCount: 0`.
  - `node dist/index.js stop` returned `ok: true` and `stopped: true`.
  - post-stop `status` returned `ok: false`, `controller_unavailable`, and exit code `3`.

## User Setup Required

None.

## Next Phase Readiness

Ready for Plan 01-06: stdio/socket transports, DAP client sequencing, and lifecycle state machine can build on the protocol primitives while controller routes are now available for integration.

---
*Phase: 01-project-foundation-controller-and-dap-core*  
*Completed: 2026-05-02*
