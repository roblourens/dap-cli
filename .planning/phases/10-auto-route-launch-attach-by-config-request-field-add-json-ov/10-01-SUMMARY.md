---
phase: 10-auto-route-launch-attach-by-config-request-field-add-json-ov
plan: 01
subsystem: cli/dapCore
tags: [auto-route, launch-config, warnings, ergonomics]
dependency-graph:
  requires: []
  provides: [auto-route logic that 10-02 must NOT bypass; effectiveMode invariant]
  affects: [src/cli/commands/dapCore.ts startDap]
tech-stack:
  added: []
  patterns: [structured warnings on success payload (autoRouted + warnings[])]
key-files:
  created:
    - tests/cli/launchAttachAutoRoute.test.ts
    - tests/integration/launchAttachAutoRoute.test.ts
  modified:
    - src/cli/commands/dapCore.ts
    - README.md
    - docs/ADAPTER-SETUP.md
decisions:
  - When --config is used, launch.json `request:` is the source of truth — verb is overridden silently except for the warning.
  - Auto-route ONLY fires on --config; CLI-flag-only and --json-only paths stay verb-driven (back-compat).
  - Removed per-verb default for `--script` so effectiveMode picks the right fake script.
  - Surface BOTH `warnings` (human) AND `autoRouted` (machine) on success payload — JSON consumers don't have to string-match.
metrics:
  duration: ~30 min
  completed: 2026-05-09
---

# Phase 10 Plan 01: Auto-route launch/attach by --config request field — Summary

`dap-cli launch --config <attach-shaped>` (and the symmetric attach + launch case) now auto-routes to the DAP request that matches the launch.json's `request:` field, surfacing a structured `autoRouted` warning so JSON consumers and humans can both see the override.

## Result

- 6 test files updated, 7 new tests, all 335 tests in the suite pass.
- Build clean: `npm run build` exits 0.
- Commit: `c418f69`.

## Implementation

The change in [src/cli/commands/dapCore.ts](src/cli/commands/dapCore.ts) computes `effectiveMode` from `namedConfig.request`, threads it through the descriptor (`createFakeDescriptor`), the config object's `request:` field, and the `dap.start` controller request. The compound path (`createCompoundStartMember`) already had the same per-member logic; the change extends it to non-compound `--config` usage.

```typescript
const effectiveMode: 'launch' | 'attach' =
  namedConfig?.request === 'attach' ? 'attach'
  : namedConfig?.request === 'launch' ? 'launch'
  : mode;
const autoRouted = effectiveMode !== mode;
```

When `autoRouted`, the success payload gets:

```json
{
  "warnings": ["auto_routed_to: '<name>' has request:'<X>'; CLI verb '<Y>' was overridden"],
  "autoRouted": { "code": "auto_routed_to", "from": "<verb>", "to": "<request>", "configName": "<name>" }
}
```

The `--script` per-verb commander defaults (`stopped-on-entry` / `attach-stopped`) had to move from commander into `startDap` so `effectiveMode` (not the verb) selects the script. This fixes the test failure where the fake adapter received a launch script under an attach mode after auto-routing.

## Tests

- [tests/cli/launchAttachAutoRoute.test.ts](tests/cli/launchAttachAutoRoute.test.ts) — 6-case matrix: launch+attach × launch-shaped/attach-shaped/no-request/no-config. Drives via `runCli` against a real controller + fake adapter; the fake adapter's mode validation proves the on-the-wire DAP request matches `effectiveMode`.
- [tests/integration/launchAttachAutoRoute.test.ts](tests/integration/launchAttachAutoRoute.test.ts) — end-to-end: `dap-cli launch --config <attach-only>` against a fake adapter. If auto-route did NOT fire, fake-adapter mode validation rejects with `adapter_transport_closed`. Clean `lifecycle:'stopped'` proves DAP `attach` was actually sent.

## Deviations from Plan

None functional. One small adjustment:

**[Rule 1 - Bug] Removed per-verb `--script` commander default.** The plan said to use `effectiveMode` for the fake-script default fallback, but commander already populated `options.script` with the verb-default value (`stopped-on-entry`/`attach-stopped`), so the `??` fallback inside `startDap` never fired. Result: when auto-routing, the fake adapter got a mismatched script (e.g. `attach-stopped` script under `launch` mode). Removed the commander defaults so `options.script` is undefined when the user didn't pass `--script`, and `startDap` falls back based on `effectiveMode`. Found via failing test, fixed in the same commit.

## Threat Model Status

| Threat ID | Disposition | Notes |
|-----------|-------------|-------|
| T-10-01-01 | accept | `request:` was already trusted (Phase 5.2 schema validation); no new attack surface. |
| T-10-01-02 | accept | `autoRouted` field is advisory; same trust model as `warnings`. |
| T-10-01-03 | mitigate (no-op) | `configName` echoes user-supplied argument; not disclosure. |

## Self-Check: PASSED

- `src/cli/commands/dapCore.ts` modified (effectiveMode + autoRouted): FOUND
- `tests/cli/launchAttachAutoRoute.test.ts` created: FOUND
- `tests/integration/launchAttachAutoRoute.test.ts` created: FOUND
- `README.md` updated: FOUND (auto-routes section)
- `docs/ADAPTER-SETUP.md` updated: FOUND (Auto-routing section + matrix)
- Commit `c418f69`: FOUND
