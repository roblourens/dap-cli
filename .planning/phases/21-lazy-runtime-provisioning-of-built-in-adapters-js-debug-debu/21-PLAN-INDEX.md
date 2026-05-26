# Phase 21 Plan Index

Phase 21 — Lazy runtime provisioning of built-in adapters (js-debug, debugpy, delve)
on first use, with user confirmation, concurrency-safe install, and clear failure surfaces.

| # | Plan | Wave | Depends on | Autonomous | Core deliverable |
|---|------|------|------------|------------|------------------|
| 1 | [21-01-PLAN.md](21-01-PLAN.md) | 1 | — | yes | Provision primitives (lock, atomic install, http+ProxyAgent, tar.gz/zip extract, consent helpers) + program-level `--yes` / `DAP_CLI_ASSUME_YES` plumbing + async `AdapterRegistry.resolve` (D-17). |
| 2 | [21-02-PLAN.md](21-02-PLAN.md) | 2 | 21-01 | yes | Per-adapter provisioners (`provisionJsDebug`, `provisionDebugpy`, `provisionDelve`) + embedded SHA-256 checksums (D-21) + descriptor-factory wiring so `*_not_found` becomes `provisionAdapter()`. |
| 3 | [21-03-PLAN.md](21-03-PLAN.md) | 3 | 21-01, 21-02 | yes | `dap-cli setup-adapters` user-facing subcommand (D-13/D-14) + `scripts/setup-adapters.ts` rewritten as a thin wrapper (no `spawnSync('tar', ...)` per D-11). |
| 4 | [21-04-PLAN.md](21-04-PLAN.md) | 4 | 21-02, 21-03 | yes | Failure-surface audit + snapshot tests for every `provision_*` error envelope (D-15) + architecture-test assertions locking in D-10/D-11. |
| 5 | [21-05-PLAN.md](21-05-PLAN.md) | 4 | 21-02, 21-03 | yes | Full FakeReleaseServer + synthetic-archive helpers + concurrent-install test (D-08) + proxy precedence test + `tests/packaging/` (publishedTarball + npxCache) + `check:pack` chained into `check`. |
| 6 | [21-06-PLAN.md](21-06-PLAN.md) | 5 | 21-01..21-05 | **no** | README + `docs/adapter-setup.md` rewritten for lazy provisioning UX (D-16) + new hand-driven smoke `Sequence C` (fresh-machine consent) + orchestrator-driven UAT recording per `.github/copilot-instructions.md`. |

## Wave structure

- **Wave 1:** 21-01.
- **Wave 2:** 21-02.
- **Wave 3:** 21-03.
- **Wave 4:** 21-04 and 21-05 may run in parallel (disjoint file scope: 21-04 owns `errorSnapshots.test.ts` + `moduleBoundaries.test.ts`; 21-05 owns `concurrent.test.ts`, `proxy.test.ts`, `tests/packaging/`).
- **Wave 5:** 21-06 (docs + hand-driven smoke gate).

## Hand-driven smoke gate

Per `.github/copilot-instructions.md`, the phase is NOT complete until the
orchestrator agent (not a subagent) has executed Sequence A, Sequence B,
**and the new Sequence C** in a real terminal and captured the verbatim
output into `21-UAT.md` under `## Hand-Driven CLI Smoke`. See 21-06 Task 4.
