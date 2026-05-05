---
phase: 05-stabilize-real-chrome-js-debug-playwright-same-browser-hando
plan: 21
subsystem: src/adapters + src/controller
tags: [gap-closure, hand-driven, adapter-logs, observability, H-5]
gap_closure: true
requires: []
provides:
  - adapter-log-startup-header
  - js-debug-trace-logfile-injection
affects:
  - src/adapters/processAdapter.ts
  - src/adapters/socketAdapter.ts
  - src/adapters/builtins/jsDebug.ts
  - src/controller/server.ts
  - tests/integration/jsDebugAdapter.test.ts
tech_stack_added: []
patterns:
  - "Both adapter spawn paths (`startProcessAdapter` for stdio, `startServerSocketAdapter` for `kind: 'server'`) write a `[dap-cli] adapter <id> started pid=<pid> at <iso>` header line to the log stream the moment it is created. A 0-byte log now unambiguously means 'we never started the adapter'."
  - "js-debug emits its DAP/CDP wire traffic over its socket transport, NOT stderr. The plan's diagnosed root cause was correct: the existing `<adapter>-<pid>.log` capture is structurally empty for healthy js-debug sessions. Fixed by injecting `trace: { stdio: false, logFile: <logDir>/js-debug-trace-<ts>.log }` into the launch/attach config when the user has not specified their own `trace`."
  - "Config injection lives in `applyJsDebugTraceDefaults(config, logDir)` exported from `src/adapters/builtins/jsDebug.ts`, called from `ControllerServer.startDapSession` immediately after `extractDapCliStartConfig`. The descriptor itself never sees launch args, so the merge has to happen at the lifecycle entry point where both descriptor identity AND the resolved `discovery.logDir` are available."
  - "User-supplied `trace` always wins. The helper only injects defaults when `config.trace` is undefined, so power users opting into js-debug's full trace schema (per-tag levels, custom log path) are not overridden."
key_files:
  created:
    - .planning/phases/05-stabilize-real-chrome-js-debug-playwright-same-browser-hando/05-21-SUMMARY.md
  modified:
    - src/adapters/processAdapter.ts
    - src/adapters/socketAdapter.ts
    - src/adapters/builtins/jsDebug.ts
    - src/controller/server.ts
    - tests/integration/jsDebugAdapter.test.ts
    - .planning/phases/05-stabilize-real-chrome-js-debug-playwright-same-browser-hando/deferred-items.md
decisions:
  - "Add the header-line write in BOTH `processAdapter.ts` AND `socketAdapter.ts` (Rule 1 deviation). The plan's `files_modified` listed only `processAdapter.ts`, but js-debug uses `kind: 'server'` and lands in `socketAdapter.startServerSocketAdapter` — the actually-broken file path producing 0-byte `js-debug-<pid>.log` was socketAdapter's, not processAdapter's. Fixing only processAdapter would have left H-5 open."
  - "Wire `applyJsDebugTraceDefaults` from `controller/server.ts` (Rule 3 deviation against the plan's `files_modified` list). The descriptor schema is parsed by zod and cannot carry a function field, and the descriptor module never sees launch args. The cleanest call site is `ControllerServer.startDapSession` right after `extractDapCliStartConfig`, where descriptor identity and the resolved `logDir` are both in scope. Modifying server.ts is the minimum-intrusion path; the alternative (a side-channel registry) would have been over-engineered for a single-adapter case."
  - "Sibling trace file rather than reusing the existing `<adapter>-<pid>.log` path. `processAdapter`'s logPath is constructed inside the spawn function from `child.pid`, which is not known at config-build time; the trace logFile has to be deterministic before the adapter starts. A timestamped sibling (`js-debug-trace-<Date.now()>.log`) keeps the spawn path unchanged AND gives a queryable filename pattern."
  - "Used `trace: { stdio: false, logFile }` (no `level: 'verbose'` field). Verified against the bundled `dapDebugServer.js`: the `trace` schema is `{ stdio?: boolean, logFile?: string }` plus per-tag flags (`cdp.send`, `cdp.receive`, `dap.send`, `dap.receive`, `internal`, `proxyActivity`) which all default to enabled. The plan's `level: 'verbose'` was speculative; the defaults already capture wire traffic."
metrics:
  duration_minutes: ~20
  tasks_completed: 2
  files_changed: 6
  completed_at: 2026-05-04
threat_model_status:
  - "T-05-21-01 (js-debug verbose trace may include filesystem paths) — accepted per plan; trace files written under user-only-writable `~/.dap-cli/logs/`."
  - "T-05-21-02 (trace files grow unbounded; one per session, no rotation) — accepted per plan; flagged here for follow-up if disk usage becomes user-visible."
---

# Phase 5 Plan 21: Non-empty adapter logs + js-debug DAP/CDP trace Summary

Closes hand-driven gap H-5 from [05-UAT.md](.planning/phases/05-stabilize-real-chrome-js-debug-playwright-same-browser-hando/05-UAT.md): every adapter log file under `~/.dap-cli/logs/` was 0 bytes, so the diagnostic affordance "see `~/.dap-cli/logs/<adapter>-<pid>.log`" pointed users at empty files. After this plan: every adapter log starts with a `[dap-cli] adapter <id> started pid=<pid> at <iso>` header line on launch, and js-debug additionally writes its built-in DAP/CDP wire trace to a sibling `js-debug-trace-<timestamp>.log` under the same `logDir`.

## What changed

### Task 1 — Header line + js-debug trace injection (commit `8297069`)

[src/adapters/processAdapter.ts](src/adapters/processAdapter.ts):
- Immediately after `createWriteStream(logPath, ...)`, write `[dap-cli] adapter <id> started pid=<pid> at <iso>\n` to the log stream. Spawn errors now also prefix with `[dap-cli] adapter <id> spawn error:` so the log distinguishes startup failure from runtime stderr.

[src/adapters/socketAdapter.ts](src/adapters/socketAdapter.ts) (Rule 1 deviation — see `decisions`):
- Same header-line write in `startServerSocketAdapter`. This is the path js-debug actually uses (it has `kind: 'server'`), so without this change H-5 would have stayed open even after Task 1's plan-listed file was patched.

[src/adapters/builtins/jsDebug.ts](src/adapters/builtins/jsDebug.ts):
- New exported helper `applyJsDebugTraceDefaults(config, logDir)`. Returns `config` unchanged if it isn't a plain object or if the user already provided a `trace` field; otherwise returns `{ ...config, trace: { stdio: false, logFile: <logDir>/js-debug-trace-<Date.now()>.log } }`.
- JSDoc documents the verified `trace` schema (`stdio`, `logFile`) and notes that no `JS_DEBUG_*` env var controls tracing — config-only.

[src/controller/server.ts](src/controller/server.ts) (Rule 3 deviation — descriptor never sees launch args):
- After `extractDapCliStartConfig`, set `preparedConfig = descriptor.id === 'js-debug' ? applyJsDebugTraceDefaults(config, discovery.logDir) : config`. The `lifecycle.start({ launchArgs: preparedConfig })` / `{ attachArgs: preparedConfig }` calls now ship the merged config to the adapter.

### Task 2 — Integration assertion the log is non-empty (commit `19b204d`)

[tests/integration/jsDebugAdapter.test.ts](tests/integration/jsDebugAdapter.test.ts):
- After every js-debug breakpoint smoke run, after `adapter.close()` has flushed the log stream:
  - Assert `stat(adapter.ownedAdapter.logPath).size > 0` so the header-line write is regression-protected.
  - `readdir(logDir)`, filter to `js-debug-trace-*.log`, assert at least one exists AND at least one has size > 0 so `applyJsDebugTraceDefaults` not being called (or being called with the wrong directory) fails fast at the gate level.

This test runs as part of the default suite (the Node smoke is unconditional; only the Chrome/Electron smokes are gated behind `DAP_CLI_RUN_BROWSER_SMOKES`).

## Deviations from Plan

### Auto-fixed issues

**1. [Rule 1 — Bug] Plan listed only `processAdapter.ts`, but js-debug logs are written by `socketAdapter.ts`**
- **Found during:** Task 1 implementation.
- **Issue:** The plan's `files_modified` and Task 1 action both targeted `src/adapters/processAdapter.ts`. js-debug's descriptor uses `transport.kind: 'server'`, which routes through `startServerSocketAdapter` in `socketAdapter.ts` — a structurally near-identical sibling that was the actual producer of the 0-byte `js-debug-<pid>.log`. Patching only processAdapter would have left H-5 open.
- **Fix:** Added the same `[dap-cli] adapter ... started ...` header-line write in `startServerSocketAdapter`, with a comment cross-referencing `applyJsDebugTraceDefaults` so the next reader can see the two-part fix together.
- **Files modified:** `src/adapters/socketAdapter.ts`.
- **Commit:** `8297069`.

**2. [Rule 3 — Blocking] Descriptor cannot carry the trace-injection step alone**
- **Found during:** Task 1 implementation.
- **Issue:** `AdapterDescriptor` is a zod-validated data shape; adding a `prepareConfig?: (...) => ...` function field would have broken schema parsing for the descriptors loaded from JSON config files. The descriptor module also never observes the launch args — those flow through `ControllerServer.startDapSession`. To actually wire `trace.logFile` through to js-debug, the helper had to be invoked at the lifecycle entry point.
- **Fix:** Exported `applyJsDebugTraceDefaults` from `jsDebug.ts` and called it from `controller/server.ts` immediately after `extractDapCliStartConfig`. Discriminated by `descriptor.id === 'js-debug'` so other adapters are untouched.
- **Files modified:** `src/controller/server.ts` (added to the implicit files_modified set).
- **Commit:** `8297069`.

### Out-of-scope deferrals

**Pre-existing TS error in `src/sessions/sessionStore.ts:63`** — Reproduces on a clean checkout of `main` at `6b155cd` BEFORE plan 05-21 changes (verified via `git stash` round-trip). Likely fallout from plan 05-19's `parent_session_id` schema work. Logged in [.planning/phases/05-.../deferred-items.md](.planning/phases/05-stabilize-real-chrome-js-debug-playwright-same-browser-hando/deferred-items.md) for follow-up. Not in scope per the executor's "fix only what this task caused" rule.

## Authentication gates

None.

## Verification

- `npm test`: 22 test files, 178 passed, 5 skipped (skips are pre-existing browser-smoke / Electron / debugpy guards). `tests/integration/jsDebugAdapter.test.ts` — the gap-H-5 assertion lands in the unconditional Node smoke and passes on first run.
- `npm test -- tests/adapters`: 10/10 pass.
- `npm run typecheck`: pre-existing `sessionStore.ts:63` error remains (deferred); no new TS errors introduced by 05-21 changes.

## Hand-driven checkpoint

Out of scope for this executor — the orchestrator owns the hand-driven Sequence A re-run per task 3's checkpoint. Expected verbatim signal after a `launch --adapter js-debug --type pwa-node ...` smoke:

```
$ ls -la ~/.dap-cli/logs/
... js-debug-<pid>.log         (> 0 bytes — header line)
... js-debug-trace-<ts>.log    (> 0 bytes — DAP/CDP trace)
$ head -1 ~/.dap-cli/logs/js-debug-<pid>.log
[dap-cli] adapter js-debug started pid=<pid> at <iso>
```

## Self-Check: PASSED

- `src/adapters/processAdapter.ts` — FOUND, header line written.
- `src/adapters/socketAdapter.ts` — FOUND, header line written.
- `src/adapters/builtins/jsDebug.ts` — FOUND, exports `applyJsDebugTraceDefaults`.
- `src/controller/server.ts` — FOUND, calls `applyJsDebugTraceDefaults` for js-debug.
- `tests/integration/jsDebugAdapter.test.ts` — FOUND, asserts non-empty log + trace.
- Commit `8297069` (feat) — present in `git log`.
- Commit `19b204d` (test) — present in `git log`.
