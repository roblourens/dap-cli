---
phase: 01-project-foundation-controller-and-dap-core
plan: 02
subsystem: cli-contracts
tags: [cli, json, errors, paths, controller-contracts]
requires:
  - 01-01
provides:
  - JSON stdout success and failure envelope helpers
  - Typed CLI error factories and stable exit-code mapping
  - Command shell groups for controller, sessions, and generic DAP routing
  - Controller request/client TypeScript contracts
  - DAP_CLI_HOME-first state and log path helpers
affects: [phase-1, cli, controller, config, testing]
tech-stack:
  added: []
  patterns:
    - Centralized JSON stdout writes in src/cli/output.ts
    - Handled errors represented by CliError and mapped in src/cli/main.ts
    - Environment-first path resolution in src/config/paths.ts
key-files:
  created:
    - src/cli/output.ts
    - src/cli/errors.ts
    - src/cli/commands/controller.ts
    - src/cli/commands/sessions.ts
    - src/cli/commands/dapCore.ts
    - src/controller/client.ts
    - src/controller/requests.ts
    - src/config/paths.ts
    - tests/cli/jsonOutput.test.ts
    - tests/cli/errorContracts.test.ts
  modified:
    - src/cli/main.ts
    - src/cli/program.ts
key-decisions:
  - "Handled CLI failures are emitted as exactly one newline-terminated JSON object on stdout."
  - "Unexpected errors are converted to internal failures without serializing raw stack traces."
  - "Command shells intentionally return not_implemented failures for behavior owned by later plans."
patterns-established:
  - "JsonSuccess and JsonFailure envelopes include meta.command and meta.timestamp."
  - "CliError factories own stable code/category/exitCode/diagnostics values."
  - "Path helpers accept env/platform parameters for deterministic tests."
requirements-completed:
  - AGNT-01
  - AGNT-02
  - AGNT-03
  - TEST-03
duration: 0 min
completed: 2026-05-02
---

# Phase 1 Plan 02: CLI Contracts Summary

**JSON stdout envelopes, typed failure contracts, command shells, controller request types, and DAP_CLI_HOME path resolution**

## Performance

- **Duration:** 0 min
- **Started:** 2026-05-02T00:00:00Z
- **Completed:** 2026-05-02T00:00:00Z
- **Tasks:** 2 completed
- **Files modified:** 10 created, 2 modified

## Accomplishments

- Added `JsonSuccess<T>`, `JsonFailure`, `JsonErrorPayload`, `JsonMeta`, and centralized JSON writers.
- Added `CliError` plus stable usage, controller, session, DAP, adapter, timeout, and internal error factories.
- Updated `main()` to map Commander errors, handled `CliError` instances, and unexpected failures to JSON stdout with stable exit codes.
- Added controller, sessions, and DAP command group shells that return structured `not_implemented` failures for later-plan behavior.
- Added controller client/request TypeScript contracts without live IPC.
- Added `DAP_CLI_HOME`-first path helpers for home, state, and log directories.

## Task Commits

Implementation will be committed with this summary as a single Plan 01-02 commit.

## Files Created/Modified

- `src/cli/output.ts` - JSON envelope types and stdout writer helpers.
- `src/cli/errors.ts` - typed CLI error class and factory functions.
- `src/cli/main.ts` - handled failure mapping and Commander parse error conversion.
- `src/cli/program.ts` - command shell registration.
- `src/cli/commands/controller.ts` - controller command shell.
- `src/cli/commands/sessions.ts` - sessions command shell.
- `src/cli/commands/dapCore.ts` - generic DAP command shell.
- `src/controller/client.ts` - controller client interface.
- `src/controller/requests.ts` - controller request/response method contracts.
- `src/config/paths.ts` - state/log path helpers.
- `tests/cli/jsonOutput.test.ts` - JSON stdout and path contract coverage.
- `tests/cli/errorContracts.test.ts` - error factory and failure payload coverage.

## Decisions Made

- Kept command behavior intentionally shallow: shell commands exist and return structured `not_implemented` failures until the controller/session/DAP plans implement live behavior.
- Suppressed Commander human output in `main()` so handled parse failures do not leak text to stderr.
- Converted unexpected errors to a generic internal failure to avoid stack trace exposure.

## Deviations from Plan

None - plan executed within the intended shell/contract scope.

---

**Total deviations:** 0 auto-fixed.  
**Impact on plan:** No scope change.

## Issues Encountered

- TypeScript caught a test fixture passing an unsupported option to `usageError`; the fixture was corrected to use only the supported error options.

## Verification

- `npm test -- tests/cli/jsonOutput.test.ts tests/cli/errorContracts.test.ts` passed.
- `grep -R "console\.log\|console\.error" src/cli | grep -v "src/cli/output.ts" && exit 1 || exit 0` passed.
- `npm run typecheck` passed.
- `npm run build` passed.
- `npm run check` passed: typecheck, lint, tests, and build.

## User Setup Required

None.

## Next Phase Readiness

Ready for Plan 01-03: controller discovery, local IPC, and client/server lifecycle can build on the controller request contracts and deterministic path helpers.

---
*Phase: 01-project-foundation-controller-and-dap-core*  
*Completed: 2026-05-02*
