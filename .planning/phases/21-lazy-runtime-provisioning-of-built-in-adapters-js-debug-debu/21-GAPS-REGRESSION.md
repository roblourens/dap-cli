---
phase: 21
captured_by: gsd-execute-phase orchestrator (regression_gate)
captured_at: 2026-05-25
source: npm test (post plan 21-06)
status: open
---

# Phase 21 — Regression Gaps Captured by execute-phase Close-Out

The hand-driven smoke (Sequences A + B + C) recorded in [21-UAT.md](21-UAT.md) passed. The regression test gate (`npm test`) failed with the following test files broken by phase 21 changes that were never updated.

## Failure Summary

| # | Test file | Failing test | Root cause | Introduced by |
| - | --- | --- | --- | --- |
| 1 | tests/adapters/registry.test.ts | `includes debugpy as a built-in adapter` | `registry.resolve('debugpy')` invokes new provisioner → `confirm()` throws `Confirmation required but stdin is not a TTY.` | 21-02 (debugpy provisioner) + 21-01 (async resolve) |
| 2 | tests/integration/debugpyAdapter.test.ts | `resolves debugpy as a built-in adapter descriptor` | Same as #1 | 21-02 |
| 3 | tests/integration/debugpyAdapter.test.ts | `launches Python script with debugpy and verifies breakpoint inspection` | Same as #1 | 21-02 |
| 4 | tests/integration/delveAdapter.test.ts | `launches a Go package and inspects breakpoint state` | `registry.resolve('delve')` → delve provisioner → consent throw | 21-02 (delve provisioner) |
| 5 | tests/integration/delveAdapter.test.ts | `debugs a Go package test and inspects locals` | Same as #4 | 21-02 |
| 6 | tests/integration/delveAdapter.test.ts | `debugs a symbol-friendly Go executable and inspects locals` | Same as #4 | 21-02 |
| 7 | tests/integration/docsValidation.test.ts | `adapter setup docs retain Delve provisioning and attach diagnostics` | Asserts `docs/adapter-setup.md` contains literal `'Delve'` (capital D). Plan 21-06 rewrote the doc using only lowercase `delve`; `Delve` appears 0 times. | 21-06 (doc rewrite) |
| 8 | tests/integration/selfHosting.test.ts | `dap-cli debugs simple-node-app fixture with stop-on-entry inspection` | Times out @5s in full-suite run; **passes 6/6 when run in isolation**. Likely cross-test interference (parallel adapter dir contention or pid bleed). Secondary — verify after #1–7 fixed. | unknown (pre-existing flake or phase 21 race) |

## Verbatim Failure Output (Excerpt)

```
× AdapterRegistry > includes debugpy as a built-in adapter 289ms
  → Confirmation required but stdin is not a TTY.

CliError: Confirmation required but stdin is not a TTY.
 ❯ usageError src/cli/errors.ts:56:10
 ❯ confirm src/cli/confirm.ts:21:11
 ❯ provisionDebugpy src/adapters/provision/debugpy.ts:58:9
 ❯ resolveDefaultDebugpyPythonPath src/adapters/builtins/debugpy.ts:57:18
 ❯ createDebugpyDescriptor src/adapters/builtins/debugpy.ts:12:45
 ❯ tests/adapters/registry.test.ts:67:24
```

```
AssertionError: expected '# Adapter Setup\n\nThis is the full r…' to contain 'Delve'
 ❯ tests/integration/docsValidation.test.ts:73:21
   expect(content).toContain('Delve');
```

## Root-Cause Analysis

### Cluster A — Tests resolve real adapters without consent path (failures #1–6)

Pre-phase-21, `AdapterRegistry.resolve()` was synchronous and the descriptors for `debugpy` / `delve` / `js-debug` were either available eagerly or detected from `PATH`. Tests like `tests/adapters/registry.test.ts:67` and the `*Adapter.test.ts` integration tests instantiated `new AdapterRegistry()` and called `resolve()` directly, expecting a descriptor.

Phase 21-01 + 21-02 made `resolve()` async and added a per-adapter provisioner that invokes `confirm()` ([src/cli/confirm.ts](../../../src/cli/confirm.ts)) when the local cache is missing. `confirm()` requires `stdin.isTTY === true` (line 21) and throws `usageError('Confirmation required but stdin is not a TTY.')` otherwise. Vitest runs with `stdin.isTTY` undefined, so any test that triggers provisioning crashes.

The provisioning subsystem's own tests (21-05) use FakeReleaseServer + `DAP_CLI_ASSUME_YES=1` (or `DAP_CLI_ADAPTERS_DIR` pointed at a pre-staged cache), so they pass. The cross-cutting tests that pre-date the provisioning subsystem do not.

**Locked decisions that govern the fix:**
- **D-06**: `--yes` / `-y` / `DAP_CLI_ASSUME_YES=1` is the supported way to bypass consent.
- **D-12**: `DAP_CLI_ADAPTERS_DIR` overrides the default `~/.dap-cli/adapters/` root — tests can point this at a per-test temp dir.
- **D-20**: `.consent-<version>` is a download-record, not a reuse gate — pre-staging adapter files in a temp dir is sufficient to short-circuit provisioning entirely (`resolveDefaultJsDebugPath` etc. check entrypoint existence first).

**Acceptable fix strategies (planner to choose):**
1. Pre-stage adapter binaries under `DAP_CLI_ADAPTERS_DIR=<tmp>` per test using a fixture helper (preferred for integration tests — exercises real adapter binary).
2. Set `DAP_CLI_ASSUME_YES=1` + override `DAP_CLI_ADAPTERS_DIR` so the test downloads into an ephemeral cache once (heavier, network-bound).
3. For the registry unit test, inject a non-built-in stub descriptor instead of resolving `debugpy` live (lightest, but loses the descriptor-shape assertion).

### Cluster B — docsValidation case sensitivity (failure #7)

`docs/adapter-setup.md` contains the lowercase `delve` (the adapter ID) 13 times but never the capitalized product name `Delve`. The phase 20 doc had both. Plan 21-06 standardized on the lowercase ID. The test in [tests/integration/docsValidation.test.ts:73](../../../tests/integration/docsValidation.test.ts) asserts `expect(content).toContain('Delve')`.

**Two acceptable fix strategies (planner to choose):**
1. Add a capitalized `Delve` mention to `docs/adapter-setup.md` (e.g., rename the overview table column header or add a sentence like "Go support is provided by **Delve**.").
2. Loosen the test to `expect(content.toLowerCase()).toContain('delve')`.

### Cluster C — selfHosting flake (failure #8)

Passes in isolation (6/6); fails only in full-suite mode at the first stop-on-entry inspection. May be cross-test interference (parallel adapter provisioning or pid bleed) or unrelated pre-existing flake. Investigate AFTER clusters A + B are resolved, since fixing A may also fix the interference by giving tests their own adapter dirs.

## Affected Source

No `src/` changes are required for clusters A or C. Cluster B requires a one-line addition to `docs/adapter-setup.md` (or a one-line test relaxation).

Test files to modify:
- tests/adapters/registry.test.ts
- tests/integration/debugpyAdapter.test.ts
- tests/integration/delveAdapter.test.ts
- tests/integration/docsValidation.test.ts (or `docs/adapter-setup.md`)
- tests/integration/selfHosting.test.ts (investigate; may need no change)

## Exit Criteria for Gap-Closure Plan

- `npm test` passes (all suites green, including the 8 currently-failing tests).
- No new test depends on global state (each adapter-touching test must use `DAP_CLI_ADAPTERS_DIR=<unique-tmp>` or equivalent).
- Hand-driven smoke (A + B + C in [21-UAT.md](21-UAT.md)) remains passing after changes.
- No regression in `npm run build` or the architecture test ([tests/architecture/moduleBoundaries.test.ts](../../../tests/architecture/moduleBoundaries.test.ts)).
