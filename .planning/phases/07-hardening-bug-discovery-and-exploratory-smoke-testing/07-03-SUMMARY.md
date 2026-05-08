# Phase 7 Plan 3 Summary

## Result

status: complete

GAP-07-02 is mitigated. The external TypeScript projects still need project-specific source-map configuration for perfect binding, but dap-cli now applies safe js-debug source-map defaults for TypeScript workspaces and returns actionable diagnostics when TypeScript breakpoints remain unverified.

## Investigation Findings

- `express-openapi-validator` launches Mocha through `ts-node/register` and `source-map-support/register`, but the launch config omits `sourceMaps` and `outFiles`; its tsconfig emits `dist` maps for `src/**/*.ts`, while the tested breakpoints included `test/**/*.spec.ts` through ts-node.
- `descope/node-sdk` launches Jest with `--inspect-brk` and `--runInBand`, but omits `sourceMaps`, `outFiles`, and `--no-coverage`; the session terminated before stack/source inspection.
- `mapJsDebugFlags` already passes adapter-native source-map fields through, so the issue was missing defaults/guidance rather than dropped config.

## Changes

- `src/config/launchConfig.ts` adds `applyJsDebugSourceMapDefaults`, setting `sourceMaps: true` and common `dist`/`out`/`build` JavaScript `outFiles` globs only when the workspace has `tsconfig.json` and the user has not already set those fields.
- `src/cli/commands/dapCore.ts` applies those defaults to js-debug launch configs, including compound members.
- `src/controller/diagnostics.ts` and `src/controller/childSessions.ts` attach TypeScript source-map guidance to breakpoint `verification_timeout` warnings.
- `tests/config/launchConfig.test.ts` covers default injection and explicit-setting preservation.
- `tests/fixtures/ts-mocha-mini/` provides a reduced TypeScript launch-config fixture for hand verification.

## Verification

- `npm run typecheck`
- `npm test -- tests/config/launchConfig.test.ts`
- `npm run build`
- Built CLI hand verification: `tmp/phase-07-03-hand.log`

Hand result: the reduced TypeScript launch config compiled and launched successfully, and `breakpoints set` on `test/sample.ts:2` returned `verified: true` through the published CLI.

## Self-Check: PASSED