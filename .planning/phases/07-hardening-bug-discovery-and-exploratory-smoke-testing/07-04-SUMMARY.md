# Phase 7 Plan 4 Summary

## Result

status: complete

Closed GAP-07-03 by adding a js-debug adapter package boundary. The setup script now writes `{"type":"commonjs"}` at the provisioned js-debug adapter root, and isolated test homes write the same boundary when mirroring js-debug for integration tests.

## Changes

- `scripts/setup-adapters.ts` writes `adapters/js-debug/package.json` for new and already-existing js-debug installs.
- `src/testing/tempEnv.ts` writes the same package boundary when provisioning js-debug into test `DAP_CLI_HOME` directories.
- `tests/integration/jsDebugAdapter.test.ts` verifies js-debug launch works when `DAP_CLI_HOME` itself has `package.json` with `{"type":"module"}`.
- `07-UAT.md` marks GAP-07-03 closed.

## Verification

- `npm run build`
- `npx tsx scripts/setup-adapters.ts`
- `npm test -- tests/integration/jsDebugAdapter.test.ts`
- Built CLI hand verification: `tmp/phase-07-04-hand.log`

Hand result: `DAP_CLI_HOME=$PWD/tmp/phase-07-local-dap-home-fixed` successfully provisioned js-debug, launched `pwa-node`, listed threads, closed the session, purged cleanup, and stopped the controller without `Dynamic require of "fs" is not supported`.

## Deviations from Plan

- Added the same package-boundary write to `src/testing/tempEnv.ts` because integration tests mirror the user-provisioned adapter into temp homes; without that, test environments could retain stale adapter cache state.

## Self-Check: PASSED