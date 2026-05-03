---
phase: 04-agent-workflow-documentation-and-self-hosting-verification
plan: 02
subsystem: adapter-readiness
tags: [adapter-setup, js-debug, debugpy, cli-help, readiness]
requires:
  - phase: 04-agent-workflow-documentation-and-self-hosting-verification
    provides: README and adapter setup documentation from 04-01
provides:
  - Discoverable adapter setup command
  - Provisioned-path resolution for built-in js-debug and debugpy adapters
  - Agent-oriented command help text
  - Setup scripts included in typecheck and lint coverage
affects: [built-in-adapters, cli-help, setup-scripts, phase-04-readiness]
tech-stack:
  added: []
  patterns: [node-strip-types-scripts, provisioned-adapter-cache]
key-files:
  created:
    - scripts/setup-adapters.ts
  modified:
    - package.json
    - tsconfig.json
    - eslint.config.js
    - src/config/paths.ts
    - src/adapters/builtins/jsDebug.ts
    - src/adapters/builtins/debugpy.ts
    - src/cli/program.ts
    - src/cli/main.ts
    - src/cli/commands/controller.ts
    - src/cli/commands/dapCore.ts
    - src/cli/commands/dapAliases.ts
key-decisions:
  - "Adapter setup is explicit via npm run setup-adapters instead of postinstall because it has network and Python package side effects."
  - "The setup script runs from TypeScript source using Node 22 strip-types, matching the existing generator script pattern."
  - "Resolvers check provisioned DAP_CLI_HOME paths before preserving existing manual/system fallbacks."
patterns-established:
  - "Built-in adapter cache paths are exposed from src/config/paths.ts."
  - "Setup scripts live under scripts/ and are covered by typecheck and lint."
requirements-completed: [AGNT-04, AGNT-05]
duration: 1h 10m
completed: 2026-05-03
---

# Phase 4 Plan 02: Adapter Readiness and Command Help Summary

**Built-in adapter setup command, provisioned resolver paths, and agent-oriented CLI help polish**

## Performance

- **Duration:** 1h 10m
- **Started:** 2026-05-03T17:45:00Z
- **Completed:** 2026-05-03T18:55:00Z
- **Tasks:** 4
- **Files modified:** 12

## Accomplishments

- Added `scripts/setup-adapters.ts`, an idempotent adapter setup script for js-debug v1.117.0 and debugpy v1.8.20 with `--help` and `--dry-run` support.
- Added `npm run setup-adapters` using Node 22 `--experimental-strip-types`, avoiding a new runtime dependency.
- Included `scripts/**/*.ts` in TypeScript and ESLint coverage.
- Added shared adapter cache and managed venv path helpers in `src/config/paths.ts`.
- Updated js-debug resolution to use the provisioned adapter cache path first and point missing-adapter errors to `npm run setup-adapters`.
- Updated debugpy resolution to prefer the managed venv Python, fall back to system `python3`, and point missing-adapter errors to `npm run setup-adapters`.
- Polished root CLI, controller, DAP core, and alias help descriptions around polling, paused sessions, cursor-based events, and shell-friendly workflows.
- Fixed Commander help output so `dap-cli --help` and command help text render instead of being suppressed.

## Task Commits

1. **Tasks 1-4: Help polish, setup script, resolvers, package script** - `ddfc37e` (feat)

**Plan metadata:** pending metadata commit

## Files Created/Modified

- `scripts/setup-adapters.ts` - provisions js-debug and debugpy into `DAP_CLI_HOME` locations with dry-run/help support.
- `package.json` - adds `setup-adapters` and extends lint coverage to scripts.
- `tsconfig.json` - includes scripts in typecheck coverage.
- `eslint.config.js` - includes scripts in typed ESLint coverage.
- `src/config/paths.ts` - adds adapter cache and managed venv Python helpers.
- `src/adapters/builtins/jsDebug.ts` - checks provisioned js-debug path first and improves missing-adapter guidance.
- `src/adapters/builtins/debugpy.ts` - checks managed debugpy venv first, then system Python, and improves missing-adapter guidance.
- `src/cli/program.ts` - updates root description, version, and examples.
- `src/cli/main.ts` - lets Commander help output render and treats help as success.
- `src/cli/commands/controller.ts` - improves start/status help.
- `src/cli/commands/dapCore.ts` - improves request/events help.
- `src/cli/commands/dapAliases.ts` - improves alias descriptions and workflow examples.

## Decisions Made

- Did not add a `postinstall` hook. Adapter setup downloads a GitHub release asset and may create a Python virtual environment, so running it implicitly during every install would be too aggressive for CI and offline environments.
- Did not add `tsx`; the repo already uses Node 22 `--experimental-strip-types` for TypeScript scripts, and the package engine is `node >=22`.
- Verified setup with `--dry-run` instead of provisioning into the real user cache during this plan. The real adapter smoke plan will perform the end-to-end runtime verification.

## Deviations from Plan

- Updated `src/cli/commands/controller.ts` and `src/cli/main.ts` in addition to the plan's listed help files because `status` lives in `controller.ts`, and help output was otherwise suppressed by the main parser.

**Total deviations:** 1 intentional scope correction.
**Impact on plan:** Positive; the documented help-output checks now exercise the actual CLI help surface.

## Issues Encountered

- Adding `scripts/` to the lint command initially failed because the typed ESLint file glob did not include scripts. Fixed by adding `scripts/**/*.ts` to `eslint.config.js`.
- Running the setup script from TypeScript source initially failed when it imported `../src/config/paths.js`; direct source execution does not rewrite that import. Fixed by making the setup script self-contained for path calculation.
- `npm test -- tests/cli` failed under the default user cache because a live controller made the existing `status` failure test non-deterministic. Re-running with isolated `DAP_CLI_HOME=$(mktemp -d)` passed.

## User Setup Required

None for the code changes. Users can now run:

```bash
npm run setup-adapters
```

The command is explicit rather than automatic, and supports:

```bash
npm run setup-adapters -- --dry-run
npm run setup-adapters -- --help
```

## Verification

- `npm run typecheck` passed.
- `npm run lint` passed.
- `npm run build` passed.
- `npm run setup-adapters -- --help` passed.
- `npm run setup-adapters -- --dry-run` passed.
- `node dist/index.js --help | grep -E "(Debug Adapter Protocol CLI|poll|paused)"` passed.
- `node dist/index.js status --help | grep "Poll session status"` passed.
- `DAP_CLI_HOME=$(mktemp -d) npm test -- tests/cli` passed.

## Next Phase Readiness

Plan 04-03 can now use `npm run setup-adapters` and the provisioned resolver paths to make real js-debug/debugpy smoke tests default-runnable.

---
*Phase: 04-agent-workflow-documentation-and-self-hosting-verification*
*Completed: 2026-05-03*
