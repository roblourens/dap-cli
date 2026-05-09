# Phase 8 Round 3 Summary — External Project Hardening (additional verification)

## Result

Drove four new external/awkward-launch scenarios end-to-end. Found one new
product gap (BUG-08-04: child-routed `scopes`/`variables`/`source` requests
returned the misleading `controller_unavailable: Run dap-cli start` envelope
when the user passed an unknown frameId / variablesReference / sourceReference).
Fixed the root cause and verified with the external repro.

## Scenarios

| # | Scenario | Workspace | Config | Result | Log |
|---|----------|-----------|--------|--------|-----|
| A | pwa-node, breakpoint set AFTER child registration + curl trigger | `tmp/phase-08-external-projects/ginpei__vscode-debug-web-demo` | `Server` | pass + product-gap (BUG-08-04 found here) | `tmp/phase-08-scenario-a-ginpei-late-bp.log` |
| B | pwa-chrome, breakpoint set after both target children registered | `tmp/phase-08-external-projects/jobscale__zipcode-jp` (docs/ served by `python3 -m http.server 3000`) | `Chrome` | pass-with-limitation (bp verified, two children listed via `threads`, no in-CLI way to drive a Chrome user gesture so bp hit not observed; running-thread inspection correctly returned `thread_not_paused`) | `tmp/phase-08-scenario-b-jobscale-chrome.log` |
| C | debugpy `module:` launch with `args`, `env`, `cwd`, `stopOnEntry`, breakpoint on a function inside the module | `tmp/phase-08-external-projects/scenario-c-pymodule` (built fresh under tmp) | `PyModule` | pass (bp at `mypkg/__main__.py:4 greet` verified, hit, stack/scopes correct, continued to clean exit). Noted limitation: when adapter sends `allThreadsStopped:true`, `stoppedThreadIds` is `[]` by design — documented in `src/controller/pausedState.ts`. | `tmp/phase-08-scenario-c-pymodule.log` |
| D | pwa-node with awkward substitutions: `${execPath}`, `${workspaceFolder}`, `${workspaceFolderBasename}`, `${userHome}`, `${env:HOME}`, `${env:USER}`, `envFile`, multi-var concat in `env` block, plus a `MissingEnv` config that references an undefined `${env:DEFINITELY_NOT_SET_VAR_42}` | `tmp/phase-08-external-projects/scenario-d-vars` (built fresh under tmp) | `TrickyVars` + `MissingEnv` | pass (all variables substituted correctly; argv, cwd, env, envFile values observed in stdout; missing-env config returned structured `unresolved_launch_variable` usage error) | `tmp/phase-08-scenario-d-vars.log` |

## Gaps

### BUG-08-04: child-routed scopes/variables/source returned `controller_unavailable` for unknown frameId / variablesReference / sourceReference

truth: When the parent session has children (js-debug pwa-node / pwa-chrome) and
the user passes a frameId / variablesReference / sourceReference that no child
claims, dap-cli should return a structured session-state error (e.g.
`frame_not_found`) with a recovery hint pointing the user at `dap-cli stack` /
`dap-cli scopes` to discover current ids. It must NOT return
`controller_unavailable: Run dap-cli start` — that hint is a lie when the
controller is healthy and the only problem is a stale id.

status: closed

reason: `src/controller/childSessions.ts` `routeByFrameId`,
`routeByVariableReference`, and `routeBySourceReference` previously threw plain
`Error` instances when the lookup failed. Plain `Error`s travel through the
controller IPC envelope without `category` / `exitCode`, so the controller's
generic catch wraps them as `controller_request_failed`, and the CLI client
collapses anything not matching a known session-error code into
`controllerUnavailable(message)` — yielding the "Run dap-cli start"
diagnostic. This was the same shape as the previously-fixed GAP-08-02
(`thread_not_paused`), but for the frame/variables/source routing paths.

severity: major (misleading recovery guidance for a common interactive flow:
get a stale frame/variable id and try to inspect it)

fix:
- `routeByFrameId` now throws `sessionError` with `code: frame_not_found` (or
  `code: frame_id_required` when frameId is missing entirely), category
  `session`, exitCode 4, and a `data.availableFrameIds` payload listing the
  currently-known frame ids per child.
- `routeByVariableReference` now throws `sessionError` with `code:
  variable_reference_not_found`, category `session`, exitCode 4, and a
  `data.availableVariableReferences` + `data.availableFrameIds` payload.
- `routeBySourceReference` now throws `sessionError` with `code:
  source_reference_not_found` (or `code: source_reference_required`),
  category `session`, exitCode 4, and a `data.availableSourceReferences`
  payload.

verification:
- New focused tests in `tests/controller/childSessions.test.ts`:
  - `routeByFrameId throws frame_not_found with availableFrameIds when no child claims the id`
  - `routeByVariableReference throws variable_reference_not_found with availableVariableReferences`
  - `routeBySourceReference throws source_reference_not_found with availableSourceReferences`
  Each asserts the structured error code, category, and the populated `data`
  payload.
- External repro re-run end-to-end against `ginpei/vscode-debug-web-demo`:
  paused at `server.js:19`, then `scopes --frame-id 0` (pre-stack-call) returned
  `code: frame_not_found, category: session, exitCode: 4` with
  `availableFrameIds: []`, then after `stack --thread-id 0` seeded frame ids,
  `scopes --frame-id 999` returned `frame_not_found` with a populated
  `availableFrameIds` list (frames 39…200+) — captured in
  `tmp/phase-08-scenario-a-fix-verification.log`.
- `variables --variables-reference 9999` after seeding returned
  `code: variable_reference_not_found, category: session, exitCode: 4`.
- Same log captures the positive control: `scopes --frame-id 39` (a real id
  observed from `stack`) returned a normal scopes response.

artifacts:
- `tmp/phase-08-scenario-a-ginpei-late-bp.log` (original repro)
- `tmp/phase-08-scenario-a-fix-verification.log` (post-fix verification)

reproduction:
- `DAP_CLI_HOME=/tmp/d8a … node dist/index.js launch --workspace tmp/phase-08-external-projects/ginpei__vscode-debug-web-demo --config Server --name scenA-ginpei`
- `node dist/index.js breakpoints set --name scenA-ginpei --source …/server.js --line 19`
- `curl -s http://localhost:8080/data.json` (causes parent to mirror paused state)
- `node dist/index.js scopes --name scenA-ginpei --frame-id 0`
- Before fix: `controller_unavailable: Run dap-cli start`. After fix:
  `frame_not_found` with `data.availableFrameIds`.

missing: closed.

## Non-Gap Limitations Observed

- pwa-chrome breakpoint hit verification still requires a real user gesture in
  the page (or a separate Playwright driver). `dap-cli` itself has no
  in-process way to trigger a click against the debugged page. Documented
  rather than treated as a gap.
- `stoppedThreadIds: []` when an adapter sets `allThreadsStopped: true` is
  documented in `src/controller/pausedState.ts` (see existing test
  `tests/controller/childSessions.test.ts: 'allThreadsStopped: true forces
  stoppedThreadIds to []'`). For debugpy, this means `status` always reports
  an empty list while paused. The user has to run `threads` separately to
  pick a thread id. Not changed in this round; flagging for a future UX
  pass.

## Cleanup

All scenario controllers were `close`d and `stop-controller` invoked. Per-run
DAP_CLI_HOME directories under `/tmp/d8a`, `/tmp/d8a2`, `/tmp/d8b`, `/tmp/d8c`,
`/tmp/d8d` (short paths chosen to stay under the macOS Unix-socket length
limit). Scratch projects (`scenario-c-pymodule`, `scenario-d-vars`) live under
the existing ignored `tmp/phase-08-external-projects/` folder.

## Self-Check: PASSED
