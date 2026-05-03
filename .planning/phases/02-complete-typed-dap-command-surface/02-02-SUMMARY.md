---
phase: 02-complete-typed-dap-command-surface
plan: 02
subsystem: capabilities-and-raw-requests
tags: [dap, capabilities, controller, diagnostics, testing]
requires:
  - 02-01
provides:
  - `capabilities` CLI and `dap.capabilities` controller route
  - Runtime capability storage from initialize results
  - Structured unsupported capability preflight for `dap.request`
affects: [phase-2, cli, controller, diagnostics, testing]
requirements-completed:
  - DAP-04
  - DAP-05
  - TEST-05
completed: 2026-05-03
---

# Phase 2 Plan 02: Capabilities and Raw Requests Summary

## Accomplishments

- Preserved raw `request <command> --json '{}'` passthrough through `dap.request`.
- Added `capabilities --name <name>` and controller IPC method `dap.capabilities` returning session, adapter id, and initialize capabilities.
- Stored capabilities on each DAP runtime and preflighted generated capability gates before adapter requests.
- Added handled `dap_request_unsupported` failures with request, session, and adapter context.

## Verification

- `npm run typecheck` passed.
- `npm test -- tests/controller/controllerIpc.test.ts tests/cli/errorContracts.test.ts tests/integration/fakeAdapterCli.test.ts` passed.

## Deviations

- Corrected the fake adapter initialize response body to match DAP capability shape directly rather than nesting under `capabilities`.
