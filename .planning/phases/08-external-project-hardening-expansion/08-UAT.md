---
status: complete
phase: 08-external-project-hardening-expansion
source:
  - .planning/phases/08-external-project-hardening-expansion/08-01-PLAN.md
started: 2026-05-09T02:18:30Z
updated: 2026-05-08T23:59:00Z
---

# Phase 8 UAT: External Project Hardening Expansion

## Current Test

number: 1
name: Broader external repo sample
expected: At least 10 public launch-config candidates are screened and at least 5 new safe candidates are fully attempted through dap-cli.
result: pass

## Result Ledger

| Candidate | Screened | Cloned | Setup/build | dap-cli list configs | dap-cli launch/debug | Result | Evidence |
|-----------|----------|--------|-------------|----------------------|----------------------|--------|----------|
| `ginpei/vscode-debug-web-demo` | yes | yes | `npm install --ignore-scripts` passed | pass: `Server`, `Client` | `Server` launched; server breakpoints stayed unbound; `stack` on running thread returned misleading controller error | product-gap | `tmp/phase-08-ginpei-rerun.log` |
| `jobscale/zipcode-jp` | yes | yes | `npm install --ignore-scripts` passed | pass: `Chrome`, `Program` | `Program` launched; breakpoints stayed unbound; session terminated quickly after curl | product-gap/inconclusive | `tmp/phase-08-jobscale.log` |
| `ahpalmer/Katas` | yes | yes | no install required | pass: `Python Debugger: Current File` | original config rejected `${file}`; adapted scratch `type: python` config verified breakpoints, stack, continue, stopped events | pass-with-limitation | `tmp/phase-08-katas.log`, `tmp/phase-08-katas-rerun.log` |
| `github/codespaces-models` | yes | yes | skipped; model samples require env/secrets | pass: JS/Python current-file configs | both configs rejected `${file}`; `dap-cli start` timed out once in isolated home | project-blocked/inconclusive | `tmp/phase-08-codespaces-models.log` |
| `satanon2k1/debug-in-docker` | yes | yes | skipped; attach-only sample expects remote inspector | pass: `Attach to Remote` | attach failed because no target existed; adapter stderr/log diagnostics were surfaced | environment-blocked | `tmp/phase-08-debug-in-docker.log` |
| `kettleofketchup/pikvm-auto` | yes | yes | skipped; configs enough to classify | pass: four debugpy configs | `${file}`, `${command:pickArgs}`, and `${input:tests_selection}` rejected with structured usage diagnostics | project-blocked | `tmp/phase-08-python-config-blockers.log` |
| `tregermanhagai/Playwright_Pytest_Demo` | yes | yes | skipped; full run requires Playwright/browser/env setup | pass: `Debug Pytest` | launch failed with `unknown_launch_type` for `type: debugpy` | product-gap | `tmp/phase-08-python-config-blockers.log` |
| `cortesben/deno-test` | yes | yes | skipped | config inspected | Deno runtime not installed locally | environment-blocked | `tmp/phase-08-clone-screen.log` |
| `microsoft/adaptive-testing` | yes | no | deferred | deferred | setup-heavy fallback candidate | deferred | `08-EXTERNAL-PROJECT-CANDIDATES.md` |
| `sgeraldes/hidock-next` | yes | yes | deferred | deferred | very large checkout; smaller candidates covered same config surfaces | deferred | `tmp/phase-08-clone-screen.log` |
| `github/vscode-codeql` | yes | no | deferred | deferred | large/heavy high-signal candidate | deferred | GitHub code search output |
| `ankitects/anki` | yes | no | deferred | deferred | large/heavy high-signal candidate | deferred | GitHub code search output |

## Gaps

### GAP-08-01: `type: debugpy` launch configs list but cannot launch

truth: Modern Python VS Code launch configs commonly use `type: "debugpy"`; dap-cli should either map that type to the built-in debugpy adapter or provide a deliberate compatibility diagnostic.
status: closed
reason: dap-cli `--list-configs` reports debugpy configurations, but launching them fails with `unknown_launch_type` / `No adapter mapping is configured for launch type 'debugpy'`.
severity: major
test: Phase 8 external Python configs
fix: `src/config/launchConfig.ts` now maps `type: "debugpy"` to the built-in debugpy adapter, matching modern Python launch.json files.
verification: `tests/config/launchConfig.test.ts` covers `resolveAdapterIdFromType('debugpy')`.
artifacts:
  - `tmp/phase-08-katas.log`
  - `tmp/phase-08-python-config-blockers.log`
reproduction:
  - `DAP_CLI_HOME=tmp/phase-08-external-projects/.dap-cli-home/tregermanhagai__Playwright_Pytest_Demo node dist/index.js launch --workspace tmp/phase-08-external-projects/tregermanhagai__Playwright_Pytest_Demo --list-configs`
  - `DAP_CLI_HOME=tmp/phase-08-external-projects/.dap-cli-home/tregermanhagai__Playwright_Pytest_Demo node dist/index.js launch --workspace tmp/phase-08-external-projects/tregermanhagai__Playwright_Pytest_Demo --config "Debug Pytest" --name phase8-pytest`
missing:
  - closed: launch config type mapping for `debugpy`.

### GAP-08-02: Running-thread inspection reports controller_unavailable

truth: When the controller is running but the selected thread is not paused, inspection commands should report a stopped-state/thread-state error, not `controller_unavailable` with `Run dap-cli start` guidance.
status: closed
reason: In the `ginpei/vscode-debug-web-demo` attempt, `stack --thread-id 0` against a running thread returned `code: controller_unavailable`, `message: Thread is not paused`, and diagnostics telling the user to run `dap-cli start`, even though the controller and session were running.
severity: major
test: Phase 8 `ginpei/vscode-debug-web-demo` Node server attempt
fix: `src/controller/childSessions.ts` now maps child-routed paused-only `stackTrace`/`scopes`/`variables` adapter failures containing "not paused" to the shared `thread_not_paused` diagnostic contract.
verification: `tests/controller/childSessions.test.ts` asserts child `stackTrace` not-paused failures surface `thread_not_paused` and event polling guidance.
artifacts:
  - `tmp/phase-08-ginpei-rerun.log`
reproduction:
  - Launch a long-running Node server config without stopping.
  - Run `dap-cli threads --name <session>`.
  - Run `dap-cli stack --name <session> --thread-id <running-thread-id>`.
missing:
  - closed: non-controller error category/code and diagnostics that explain the target must be paused before stack/scopes/variables inspection.

### GAP-08-03: Real JS pwa-node launch configs leave breakpoints unbound with little guidance

truth: For plain JavaScript pwa-node launch configs where the target process is running and source paths are known, dap-cli should either bind requested source breakpoints or explain why binding failed in actionable terms.
status: closed
reason: Both `ginpei/vscode-debug-web-demo` and `jobscale/zipcode-jp` launched pwa-node configs successfully, but breakpoints set in plain JavaScript source paths stayed unbound. The returned breakpoint payload only said `Unbound breakpoint`, without source-path or timing guidance.
severity: major
test: Phase 8 Node pwa-node external attempts
fix: `src/controller/diagnostics.ts` now adds JavaScript-specific breakpoint timeout diagnostics covering source-path comparison against stopped stack frames and timing guidance for quick-exit/lazy-loaded programs. Follow-up root-cause fix: breakpoint source paths are normalized to absolute paths, js-debug `setBreakpoints` requests are intercepted even before child sessions exist, pending payloads replay to newly-created children before `configurationDone`, and child breakpoint events now satisfy the parent provisional response.
verification: `tests/controller/sessionManager.test.ts` asserts the JS diagnostics are present on verification timeouts. `tests/controller/childSessions.test.ts` covers `setBreakpoints` before child registration. `tmp/phase-08-ginpei-rootcause-verified.log` captures the external ginpei pwa-node repro returning verified breakpoints, a stopped event, and a stack frame at `server.js` line 9.
artifacts:
  - `tmp/phase-08-ginpei-rerun.log`
  - `tmp/phase-08-jobscale.log`
  - `tmp/phase-08-ginpei-rootcause-verified.log`
reproduction:
  - `DAP_CLI_HOME=... node dist/index.js launch --workspace tmp/phase-08-external-projects/ginpei__vscode-debug-web-demo --config Server --name phase8-ginpei-server`
  - `DAP_CLI_HOME=... node dist/index.js breakpoints set --name phase8-ginpei-server --source tmp/phase-08-external-projects/ginpei__vscode-debug-web-demo/server.js --line 9 --line 15`
missing:
  - closed: better breakpoint-binding diagnostics for real JS pwa-node configs, including source-path comparison and pending/timing guidance.
  - closed: root-cause binding path for early pwa-node breakpoints in `ginpei/vscode-debug-web-demo`.

## Gap Closure Verification

- `npm test -- tests/config/launchConfig.test.ts tests/controller/childSessions.test.ts tests/controller/sessionManager.test.ts` passed: 85 tests.
- `npm test` passed: 24 files, 292 tests passed, 7 skipped.

## Non-Gap Limitations

- `${file}`, `${fileDirname}`, `${command:...}`, and `${input:...}` remain unsupported VS Code interaction/current-file variables. Phase 8 observed these in multiple real configs; current diagnostics are structured and explicit.
- Attach-only configs that depend on a remote inspector are environment-blocked when no target is listening. The `debug-in-docker` attempt surfaced adapter stderr and log path correctly.
- Deno configs were not launched because Deno is not installed locally.

## Cleanup

All Phase 8 dap-cli homes used `cleanup --purge` and `stop-controller` where a controller started successfully. Scratch clones remain under ignored `tmp/phase-08-external-projects/` for review.

## Round 3 Follow-Up (2026-05-09)

A second external-repo hardening round drove four new scenarios end-to-end and surfaced one new product gap.

### Scenarios

| # | Scenario | Workspace | Config | Result | Log |
|---|----------|-----------|--------|--------|-----|
| A | pwa-node, breakpoint set AFTER child registration + curl trigger | `ginpei__vscode-debug-web-demo` | `Server` | pass + product-gap (BUG-08-04) | `tmp/phase-08-scenario-a-ginpei-late-bp.log` |
| B | pwa-chrome with breakpoint on docs/js/index.js (static `python3 -m http.server 3000` backing the URL) | `jobscale__zipcode-jp` | `Chrome` | pass-with-limitation (bp verified, two child targets listed; Chrome user-gesture trigger out of CLI scope) | `tmp/phase-08-scenario-b-jobscale-chrome.log` |
| C | debugpy `module:` launch with `args`, `env`, `cwd`, `stopOnEntry`, breakpoint on `greet()` | `tmp/.../scenario-c-pymodule` (built fresh) | `PyModule` | pass | `tmp/phase-08-scenario-c-pymodule.log` |
| D | pwa-node with `${execPath}`, `${workspaceFolder}`, `${workspaceFolderBasename}`, `${userHome}`, `${env:HOME}`, `${env:USER}`, `envFile`, multi-var concat in `env`; plus a `MissingEnv` config referencing an undefined var | `tmp/.../scenario-d-vars` (built fresh) | `TrickyVars` + `MissingEnv` | pass | `tmp/phase-08-scenario-d-vars.log` |

### GAP-08-04: child-routed scopes/variables/source returned `controller_unavailable` for unknown frameId / variablesReference / sourceReference

truth: For multi-child sessions (js-debug pwa-node / pwa-chrome), passing a stale or unknown frameId/variablesReference/sourceReference must return a structured session-state error pointing the user at `dap-cli stack`/`dap-cli scopes` to discover current ids — never `controller_unavailable: Run dap-cli start`.
status: closed
reason: `routeByFrameId`/`routeByVariableReference`/`routeBySourceReference` in `src/controller/childSessions.ts` threw plain `Error` instances. Plain errors travel through the controller IPC envelope without `category`/`exitCode`, so the controller wraps them as `controller_request_failed` and the CLI client collapses anything not matching a known session-error code into `controllerUnavailable(message)` — yielding the misleading "Run dap-cli start" diagnostic. Same shape as previously-fixed GAP-08-02, but for the frame/variables/source routing paths.
severity: major
test: Phase 8 round 3 Scenario A (`ginpei/vscode-debug-web-demo` `Server` paused at `server.js:19`).
fix:
- `routeByFrameId` now throws `sessionError` with `code: frame_not_found` (or `code: frame_id_required`), category `session`, exitCode 4, and `data.availableFrameIds`.
- `routeByVariableReference` now throws `sessionError` with `code: variable_reference_not_found`, plus `data.availableVariableReferences` + `data.availableFrameIds`.
- `routeBySourceReference` now throws `sessionError` with `code: source_reference_not_found` (or `code: source_reference_required`), plus `data.availableSourceReferences`.
verification:
- `tests/controller/childSessions.test.ts` adds three focused tests asserting the structured error code, category, and `data` payload for each routing path.
- External re-run: `tmp/phase-08-scenario-a-fix-verification.log` shows `scopes --frame-id 0` (stale id) returning `code: frame_not_found, category: session, exitCode: 4` with `availableFrameIds: []`, then after `stack --thread-id 0` seeded ids, `scopes --frame-id 999` returns `frame_not_found` with a populated `availableFrameIds` (frames 39…200+); positive control `scopes --frame-id 39` returns a normal scopes response.
artifacts:
- `tmp/phase-08-scenario-a-ginpei-late-bp.log` (pre-fix repro)
- `tmp/phase-08-scenario-a-fix-verification.log` (post-fix verification)
reproduction:
- `DAP_CLI_HOME=/tmp/d8a node dist/index.js launch --workspace tmp/phase-08-external-projects/ginpei__vscode-debug-web-demo --config Server --name scenA-ginpei`
- `node dist/index.js breakpoints set --name scenA-ginpei --source …/server.js --line 19`
- `curl -s http://localhost:8080/data.json`
- `node dist/index.js scopes --name scenA-ginpei --frame-id 0`
- Before fix: `controller_unavailable: Run dap-cli start`. After fix: `frame_not_found` with `data.availableFrameIds`.
missing: closed.

### Round 3 Non-Gap Limitations

- pwa-chrome breakpoint *hit* verification needs a separate browser driver to trigger a user gesture; dap-cli itself has no in-process way to click on the debugged page. Documented, not treated as a gap.
- `stoppedThreadIds: []` when the adapter sets `allThreadsStopped: true` is documented behavior in `src/controller/pausedState.ts` (covered by an existing test). For debugpy this means `status` always reports `[]` while paused; the user has to run `threads` separately. Flagged for a future UX pass.
