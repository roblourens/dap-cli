---
status: testing
phase: 07-hardening-bug-discovery-and-exploratory-smoke-testing
source:
  - .planning/phases/07-hardening-bug-discovery-and-exploratory-smoke-testing/07-01-PLAN.md
  - .planning/phases/07-hardening-bug-discovery-and-exploratory-smoke-testing/07-HARDENING-MATRIX.md
started: 2026-05-08T01:42:00Z
updated: 2026-05-08T02:27:00Z
---

## Current Test

number: 3
name: Drive exploratory scenario groups
expected: Mandatory matrix scenarios beyond baseline and hand-driven smoke are executed, with every unique failure filed as a structured gap.
awaiting: gap closure planning

## Baseline

ran_at: 2026-05-08T01:42:12Z
binary: node dist/index.js (build 0.0.0:dist:1778204528001.1968:229174)
result: pass

Commands:

```bash
npm run build
npx tsx scripts/setup-adapters.ts
npm test -- tests/cli/sessionCommands.test.ts tests/cli/jsonOutput.test.ts tests/integration/jsDebugAdapter.test.ts tests/integration/debugpyAdapter.test.ts tests/integration/playwrightInterop.test.ts
```

Observed output summary:

```text
ESM Build success in 26ms
js-debug already available at /Users/roblou/.dap-cli/adapters/js-debug
debugpy v1.8.20 provisioned to /Users/roblou/.dap-cli/venv
Test Files  5 passed (5)
Tests  52 passed | 7 skipped (59)
```

Note: A VS Code `runTests` invocation reported two assertion failures where human output contained ANSI styling, but the exact terminal command required by the plan passed with 44/44 focused CLI tests. This is recorded as tool-environment noise, not a product gap.

## Hand-Driven CLI Smoke

ran_at: 2026-05-08T01:42:23Z
operator: Copilot orchestrator
binary: node dist/index.js (build 0.0.0:dist:1778204528001.1968:229174)

sequences:
  - id: A
    name: Node breakpoint round-trip via published CLI
    result: pass
    summary: |
      Launch, paused status, verified breakpoint, thread/stack inspection,
      continue-to-breakpoint, stopped event retention, breakpoint paused status,
      close, and stop-controller all produced the expected signals.
  - id: B
    name: Chrome side-by-side breakpoint via published CLI
    result: pass
    summary: |
      Chrome pwa-chrome launch, parent breakpoint routing, child-session hiding,
      child visibility with --show-children, evaluate-triggered breakpoint stop,
      parent paused-state mirroring, stack source mapping, continue, close, and
      smoke-profile orphan check all produced the expected signals.

### Verbatim transcript - Sequence A

Step 1: start controller

```json
{"ok":true,"data":{"started":true,"reused":false,"pid":36871,"endpoint":{"kind":"ipc","path":"/Users/roblou/.dap-cli/state/controller.sock"},"stateDir":"/Users/roblou/.dap-cli/state","logDir":"/Users/roblou/.dap-cli/logs","buildId":"0.0.0:dist:1778204528001.1968:229174"},"meta":{"command":"start","timestamp":"2026-05-08T01:42:23.582Z"}}
```

Step 2: launch Node fixture with stop-on-entry

```json
{"ok":true,"data":{"sessionId":"sess_ho9_7jic-qqD25W2","name":"smoke-node","lifecycle":"running","eventCursor":4},"meta":{"command":"launch","timestamp":"2026-05-08T01:42:31.175Z"}}
```

Step 3: status while paused at entry

```json
{"ok":true,"data":{"id":"sess_ho9_7jic-qqD25W2","name":"smoke-node","adapter":"js-debug","lifecycle":"running","status":"running","paused":true,"stoppedReason":"entry","stoppedThreadIds":[0],"logPath":"/Users/roblou/.dap-cli/logs/js-debug-37151.log"},"meta":{"command":"status","timestamp":"2026-05-08T01:42:35.114Z"}}
```

Step 4: set breakpoint on fixture line 3

```json
{"ok":true,"data":{"breakpoints":[{"id":0,"verified":true,"source":{"path":"/Users/roblou/code/dap-cli/tests/fixtures/dap-cli-target/index.js"},"line":3,"column":3}]},"meta":{"command":"breakpoints set","timestamp":"2026-05-08T01:42:35.186Z"}}
```

Step 5: threads and stack while stopped at entry

```json
{"ok":true,"data":{"threads":[{"id":0,"name":"index.js [37169]","sessionName":"smoke-node#8ecd4f715f401fcb24ef8571"}]},"meta":{"command":"threads","timestamp":"2026-05-08T01:42:35.253Z"}}
{"ok":true,"data":{"stackFrames":[{"id":0,"name":"dapCliSelfHostDemo","line":2,"column":18,"source":{"path":"/Users/roblou/code/dap-cli/tests/fixtures/dap-cli-target/index.js"}}],"totalFrames":15},"meta":{"command":"stack","timestamp":"2026-05-08T01:42:39.945Z"}}
{"ok":true,"data":{"type":"string","result":"'undefined'","variablesReference":0},"meta":{"command":"evaluate","timestamp":"2026-05-08T01:42:40.016Z"}}
```

Step 6: continue and observe breakpoint stop in events

```json
{"ok":true,"data":{"allThreadsContinued":false},"meta":{"command":"continue","timestamp":"2026-05-08T01:42:40.088Z"}}
{"cursor":170,"event":"stopped","body":{"reason":"breakpoint","threadId":0,"hitBreakpointIds":[0],"allThreadsStopped":false,"child_session_id":"sess_tMTko6U0xx4LGLrp"}}
```

Step 7: status while paused at breakpoint

```json
{"ok":true,"data":{"id":"sess_ho9_7jic-qqD25W2","name":"smoke-node","adapter":"js-debug","lifecycle":"running","status":"running","paused":true,"stoppedReason":"breakpoint","stoppedThreadIds":[0],"logPath":"/Users/roblou/.dap-cli/logs/js-debug-37151.log"},"meta":{"command":"status","timestamp":"2026-05-08T01:42:40.221Z"}}
```

Step 8: close and stop controller

```json
{"ok":true,"data":{"id":"sess_ho9_7jic-qqD25W2","name":"smoke-node","adapter":"js-debug","lifecycle":"running","status":"running","paused":true,"stoppedReason":"breakpoint","stoppedThreadIds":[0],"orphanPids":[],"warnings":[]},"meta":{"command":"close","timestamp":"2026-05-08T01:42:42.371Z"}}
{"ok":true,"data":{"stopped":true},"meta":{"command":"stop-controller","timestamp":"2026-05-08T01:42:51.925Z"}}
```

### Verbatim transcript - Sequence B

Step 1-2: start controller, purge stale records, launch Chrome

```json
{"ok":true,"data":{"started":true,"reused":false,"pid":38828,"endpoint":{"kind":"ipc","path":"/Users/roblou/.dap-cli/state/controller.sock"},"buildId":"0.0.0:dist:1778204528001.1968:229174"},"meta":{"command":"start","timestamp":"2026-05-08T01:42:59.027Z"}}
{"ok":true,"data":{"signaledAdapter":[],"removedRecords":[],"keptRunning":[],"failed":[],"orphanPids":[],"warnings":[]},"meta":{"command":"cleanup","timestamp":"2026-05-08T01:42:59.096Z"}}
{"ok":true,"data":{"sessionId":"sess_xUGgU5q9-9-Vmj3i","name":"smoke-chrome","lifecycle":"running","eventCursor":7},"meta":{"command":"launch","timestamp":"2026-05-08T01:43:00.585Z"}}
```

Step 3: set breakpoint in app.js

```json
{"ok":true,"data":{"breakpoints":[{"id":0,"verified":true,"source":{"name":"app.js","path":"/Users/roblou/code/dap-cli/tests/fixtures/simple-chrome-page/app.js"},"line":2,"column":18}]},"meta":{"command":"breakpoints set","timestamp":"2026-05-08T01:43:04.595Z"}}
```

Step 4: sessions hide children by default and show children with flag

```json
{"ok":true,"data":[{"id":"sess_xUGgU5q9-9-Vmj3i","name":"smoke-chrome","adapter":"js-debug","lifecycle":"running","status":"running"}],"meta":{"command":"sessions","timestamp":"2026-05-08T01:43:04.668Z"}}
{"ok":true,"data":[{"id":"sess_xUGgU5q9-9-Vmj3i","name":"smoke-chrome","adapter":"js-debug","lifecycle":"running","status":"running"},{"id":"sess_VnwVCnu_t1F8lAhS","name":"smoke-chrome#DCDFA2D584E3E93216A2AB838C4CF274","adapter":"js-debug","lifecycle":"running","status":"running","parent_session_id":"sess_xUGgU5q9-9-Vmj3i","targetable":false}],"meta":{"command":"sessions","timestamp":"2026-05-08T01:43:04.740Z"}}
```

Step 5: trigger, observe breakpoint stop, inspect, continue

```json
{"ok":true,"data":{"sessionId":"sess_xUGgU5q9-9-Vmj3i","name":"smoke-chrome","events":[{"cursor":13,"event":"stopped","body":{"reason":"breakpoint","threadId":0,"hitBreakpointIds":[0],"allThreadsStopped":false,"child_session_id":"sess_VnwVCnu_t1F8lAhS"}}]},"meta":{"command":"events","timestamp":"2026-05-08T01:43:15.165Z"}}
{"ok":true,"data":{"threads":[{"id":0,"name":"index.html?manual","sessionName":"smoke-chrome#DCDFA2D584E3E93216A2AB838C4CF274"}]},"meta":{"command":"threads","timestamp":"2026-05-08T01:43:15.233Z"}}
{"ok":true,"data":{"id":"sess_xUGgU5q9-9-Vmj3i","name":"smoke-chrome","adapter":"js-debug","lifecycle":"running","status":"running","paused":true,"stoppedReason":"breakpoint","stoppedThreadIds":[0],"logPath":"/Users/roblou/.dap-cli/logs/js-debug-38831.log"},"meta":{"command":"status","timestamp":"2026-05-08T01:43:15.299Z"}}
{"ok":true,"data":{"stackFrames":[{"id":0,"name":"Window.calculate","line":2,"column":18,"source":{"name":"app.js","path":"/Users/roblou/code/dap-cli/tests/fixtures/simple-chrome-page/app.js"}},{"id":1,"name":"<anonymous>","line":1,"column":1}],"totalFrames":2},"meta":{"command":"stack","timestamp":"2026-05-08T01:43:15.371Z"}}
{"ok":true,"data":{"allThreadsContinued":false},"meta":{"command":"continue","timestamp":"2026-05-08T01:43:15.446Z"}}
{"ok":true,"data":{"type":"number","result":"5","variablesReference":0},"meta":{"command":"evaluate","timestamp":"2026-05-08T01:43:15.448Z"}}
```

Step 6-7: close, stop controller, confirm no smoke-owned Chrome orphan

```json
{"ok":true,"data":{"id":"sess_xUGgU5q9-9-Vmj3i","name":"smoke-chrome","adapter":"js-debug","lifecycle":"running","status":"running","paused":false,"orphanPids":[],"warnings":[]},"meta":{"command":"close","timestamp":"2026-05-08T01:43:28.462Z"}}
{"ok":true,"data":{"stopped":true},"meta":{"command":"stop-controller","timestamp":"2026-05-08T01:43:28.561Z"}}
no smoke profile orphans
```

## Tests

### 1. BASE-01 Baseline build/tests
expected: Build succeeds and focused smoke suites pass before exploratory runs.
result: pass

### 2. HAND-01 Node hand-driven smoke
expected: Sequence A produces entry pause, verified breakpoint, breakpoint stop, paused status, and clean teardown.
result: pass

### 3. HAND-02 Chrome hand-driven smoke
expected: Sequence B produces verified Chrome breakpoint, child-session visibility behavior, breakpoint stop, stack at `Window.calculate`, continue, close, and no smoke profile orphans.
result: pass

### 4. OUT-01 Output modes
expected: JSON output remains parseable by default, human output is readable, `--no-human` overrides `DAP_CLI_HUMAN`, and request payload `--json` still works with human mode.
result: pass
evidence: `tmp/phase-07-local-fixups.log`

### 5. LIFE-01 Session lifecycle
expected: start, launch, sessions, use, status, close, cleanup, cleanup --purge, and stop-controller operate on intended sessions and clean up state.
result: pass
evidence: `tmp/phase-07-local-scenarios.log`

### 6. DBG-01 Debug operations
expected: breakpoints, threads, stack, scopes, variables, evaluate, continue, pause, next, step-in, and step-out produce useful success or diagnostic responses on a paused Node target.
result: issue
evidence: `tmp/phase-07-local-scenarios.log`
notes: `breakpoints set`, `threads`, `stack`, `scopes`, `variables`, `evaluate`, `next`, and `step-in` passed. `step-out` failed with a misleading `controller_unavailable` error category/diagnostic even though the controller was available. A no-thread-id `pause` command correctly failed as usage error and is not counted as a product gap.

### 7. JSD-01 js-debug Node
expected: pwa-node launches fast and long-running fixtures, verifies breakpoints, exposes threads/events, and cleans up.
result: pass
evidence: `tmp/phase-07-local-scenarios.log`

### 8. CHR-01 Chrome interop
expected: pwa-chrome source binding, hidden child-session behavior, child visibility with `--show-children`, parent-routed inspect commands, and stack at app source.
result: pass
evidence: `## Hand-Driven CLI Smoke` Sequence B

### 9. PW-01 Playwright interop
expected: Browser action and debugger pause coordinate on the same browser, or the documented test harness fallback is explicit.
result: pass
evidence: `## Baseline` included `tests/integration/playwrightInterop.test.ts`; `## Hand-Driven CLI Smoke` Sequence B used dap-cli evaluate as the no-extra-driver fallback described in `docs/HAND-DRIVEN-SMOKE.md`.

### 10. PY-01 debugpy
expected: Python launch, breakpoint, threads, stack, continue, stopped events, close, cleanup, and stop-controller work through the published CLI.
result: pass
evidence: `tmp/phase-07-local-scenarios.log`

### 11. LC-01/LC-02 launch.json single and compound
expected: Launch config listing, single config launch, compound member naming, member targeting, stopAll cascade, cleanup, and stop-controller work.
result: pass
evidence: `tmp/phase-07-launch-json-fixup-2.log`

### 12. EXT-01 External project screening
expected: At least three candidates are screened for legitimacy and safe local setup.
result: pass
evidence: `07-EXTERNAL-PROJECT-CANDIDATES.md`
screened:
  - `cdimascio/express-openapi-validator` (~1000 stars, active, MIT, selected)
  - `visjs/vis-network` (~3500 stars, active, deferred because of install size)
  - `descope/node-sdk` (~60 stars, active org SDK, selected with `--ignore-scripts` install)
  - `microsoft/adaptive-testing` (~190 stars, Microsoft, fallback)
  - three 0-star personal repos demoted or blocked

### 13. EXT-02 External project clone/setup/build/debug
expected: At least two external projects are cloned, set up, built/run when safe, launched via dap-cli, and exercised with multiple breakpoints.
result: issue
evidence: `tmp/phase-07-external-debug-2.log`, `tmp/phase-07-express-retry.log`
projects:
  - repo: `cdimascio/express-openapi-validator`
    commit: `0b53031095376b4a9140624f1f9b6c3c2a63ee42`
    setup: `npm install --ignore-scripts`, `npm run compile` passed
    launch: copied root `launch.json` to `.vscode/launch.json`; `--list-configs` found `Attach`, `Fastify Attach`, and `Mocha All`; `Mocha All` launched with runtime executable overridden to local Node
    breakpoints: attempted `src/index.ts:30`, `test/openapi.spec.ts:14`, and `test/openapi.spec.ts:39`; all remained unbound with `verification_timeout`; no breakpoint stopped event was observed after continue
    cleanup: close, cleanup --purge, stop-controller passed
  - repo: `descope/node-sdk`
    commit: `1f1c4959e9b9140537e26c071f889b027a67db7b`
    setup: `npm install --ignore-scripts`, `npm run build` passed
    launch: copied `.vscode/launch.json.default` to `.vscode/launch.json`; `--list-configs` found `Debug Jest Tests` and `Run Example: Express`; `Debug Jest Tests` launched
    breakpoints: attempted `lib/index.ts:34` and `lib/index.test.ts:31`; both remained unbound with `verification_timeout`; session terminated before stack inspection and emitted no stopped event in retained history
    cleanup: close, cleanup --purge, stop-controller passed

### 14. NEG-01 Negative diagnostics
expected: Missing sessions, duplicate live names, missing adapters, and bad config names return structured errors with useful codes and recovery hints.
result: pass
evidence: `tmp/phase-07-local-fixups.log`

### 15. CLEAN-01 Cleanup/recovery
expected: cleanup, cleanup --purge, close, and stop-controller are idempotent and leave no owned orphans.
result: pass
evidence: `tmp/phase-07-local-scenarios.log`, `tmp/phase-07-local-fixups.log`, `tmp/phase-07-external-debug-2.log`

### 16. CONC-01 Concurrency/stale-state
expected: Multiple live sessions target deterministically, duplicate live names are rejected, closing one session does not poison another, and cleanup succeeds.
result: pass
evidence: `tmp/phase-07-local-scenarios.log`

### 17. External adapter home probe
expected: A scratch `DAP_CLI_HOME` under `tmp/phase-07-external-projects/` or similar works for adapter provisioning and launch.
result: issue
evidence: failed first run in `tmp/phase-07-local-scenarios.log` before rerun
notes: Provisioning js-debug under `tmp/phase-07-local-dap-home` placed the adapter under this repo's package scope. Because the repo root package has `"type":"module"`, Node treated js-debug's `.js` entrypoint as ESM and crashed on dynamic `require("fs")`.

## Summary

total: 17
passed: 14
issues: 3
pending: 0
skipped: 0
blocked: 0

## Gaps

### GAP-07-01 Misleading step-out failure category

truth: Debug operation failures should preserve the real DAP/adapter failure category and should not tell the user to start the controller when the controller is already available.
status: closed
closed_by: 07-02-PLAN.md
resolution: Added a regression fake-adapter script and CLI error contract test proving an adapter-returned `stepOut` failure surfaces as `category: dap`, `code: dap_request_failed`, with no `dap-cli start` recovery hint. Built-CLI hand verification in `tmp/phase-07-02-hand.log` produced the same result.
reason: `node dist/index.js step-out --name phase7-node --thread-id 0` failed with `code: controller_unavailable`, `category: controller`, and diagnostic `Run dap-cli start and retry the command`, but the controller was running and adjacent `next`/`step-in` operations had succeeded.
severity: minor
test: DBG-01 Debug operations
artifacts:
  - `tmp/phase-07-local-scenarios.log`
missing:
  - Preserve adapter/DAP failure category for step control failures such as `Unable to step out`.
  - Avoid controller recovery guidance when the controller successfully handled the request and the failure came from the adapter/session state.
reproduction:
  - `node dist/index.js start`
  - `node dist/index.js launch --adapter js-debug --type pwa-node --program "$PWD/tests/fixtures/dap-cli-target/index.js" --stop-on-entry --name phase7-node`
  - `node dist/index.js threads --name phase7-node`
  - `node dist/index.js next --name phase7-node --thread-id 0`
  - `node dist/index.js step-in --name phase7-node --thread-id 0`
  - `node dist/index.js step-out --name phase7-node --thread-id 0`

### GAP-07-02 External TypeScript launch configs do not produce project source breakpoint stops

truth: Real-world TypeScript launch configs should either bind project source breakpoints or provide actionable diagnostics explaining required source-map/outFiles/config changes.
status: mitigated
mitigated_by: 07-03-PLAN.md
investigation: Preserved external clones and logs show dap-cli was not dropping source-map fields. `express-openapi-validator` launches tests through ts-node without explicit `sourceMaps` or `outFiles`, while its tsconfig emits `dist` maps for a different source set. `descope/node-sdk` launches Jest without explicit source-map/outFiles settings and the debug session terminated before stack/source inspection. Both failures produced only bare `verification_timeout` warnings before this fix.
resolution: dap-cli now applies conservative js-debug source-map defaults for launch configs in workspaces with `tsconfig.json` (`sourceMaps: true` and common `dist`/`out`/`build` JavaScript `outFiles` globs when not explicitly set). Breakpoint verification timeouts for TypeScript sources now include actionable diagnostics pointing to js-debug trace logs, `sourceMaps`, `outFiles`, ts-node source maps, and Jest `--no-coverage`. Reduced fixture coverage and hand verification in `tmp/phase-07-03-hand.log` confirm a TypeScript source breakpoint binds through a launch.json config; the remaining external-project risk is project-specific source-map configuration.
reason: Two external projects listed and launched successfully through dap-cli, but project source breakpoints remained unbound with `verification_timeout`, and no project breakpoint stopped event was observed after continue.
severity: minor
test: EXT-02 External GitHub launch.json projects
artifacts:
  - `tmp/phase-07-external-debug-2.log`
  - `tmp/phase-07-express-retry.log`
missing:
  - Breakpoints in `cdimascio/express-openapi-validator` `src/index.ts` and `test/openapi.spec.ts` should bind or return guidance about source maps / ts-node / outFiles.
  - Breakpoints in `descope/node-sdk` `lib/index.ts` and `lib/index.test.ts` should bind or return guidance about source maps / Jest / TypeScript config.
reproduction:
  - Clone `cdimascio/express-openapi-validator` at `0b53031095376b4a9140624f1f9b6c3c2a63ee42`.
  - Run `npm install --ignore-scripts` and `npm run compile`.
  - Copy root `launch.json` to `.vscode/launch.json`.
  - `node /Users/roblou/code/dap-cli/dist/index.js launch --workspace <clone> --config "Mocha All" --runtime-executable "$(command -v node)" --stop-on-entry --name ext-express`
  - `node /Users/roblou/code/dap-cli/dist/index.js breakpoints set --name ext-express --source <clone>/test/openapi.spec.ts --line 14 --line 39`
  - Continue and poll stopped events.
  - Clone `descope/node-sdk` at `1f1c4959e9b9140537e26c071f889b027a67db7b`, install/build with scripts disabled, copy `.vscode/launch.json.default` to `.vscode/launch.json`, launch `Debug Jest Tests`, and set breakpoints in `lib/index.ts` and `lib/index.test.ts`.

### GAP-07-03 Built-in js-debug adapter fails when `DAP_CLI_HOME` is inside this repo package scope

truth: A valid `DAP_CLI_HOME` should work from scratch locations, including ignored workspace temp directories recommended by the external-project hardening plan, or dap-cli should reject unsafe adapter-home locations before provisioning/launch.
status: closed
closed_by: 07-04-PLAN.md
resolution: Adapter provisioning now writes `{"type":"commonjs"}` to the js-debug adapter root package.json so Node stops package-scope lookup before reaching an ancestor `type=module` package. Integration coverage verifies js-debug launch under a `type=module` DAP_CLI_HOME, and `tmp/phase-07-04-hand.log` captures the original scratch-home reproduction passing.
reason: With `DAP_CLI_HOME=/Users/roblou/code/dap-cli/tmp/phase-07-local-dap-home`, adapter setup provisioned js-debug successfully but launch failed because Node treated `adapters/js-debug/src/dapDebugServer.js` as ESM under this repo's `"type":"module"` package scope, causing `Error: Dynamic require of "fs" is not supported`.
severity: major
test: EXT-02 / external scratch home safety probe
artifacts:
  - `tmp/phase-07-local-scenarios.log` first failed run
  - `tmp/phase-07-local-dap-home/logs/js-debug-4638.log`
missing:
  - Either launch js-debug with a package-scope-safe cwd/module treatment, provision a package boundary for the adapter, or diagnose `DAP_CLI_HOME` locations that place CommonJS adapter code under an ESM package scope.
reproduction:
  - `export DAP_CLI_HOME="$PWD/tmp/phase-07-local-dap-home"`
  - `npx tsx scripts/setup-adapters.ts`
  - `node dist/index.js start`
  - `node dist/index.js launch --adapter js-debug --type pwa-node --program "$PWD/tests/fixtures/dap-cli-target/index.js" --stop-on-entry --name phase7-node`

## Recommended Next Step

Phase 7 gap closure and final verification are complete. Archive or summarize the phase when ready.

## Final Hand-Driven CLI Smoke

ran_at: 2026-05-08T15:17:20Z
operator: Copilot orchestrator
binary: node dist/index.js (build 0.0.0:dist:1778253435287.9602:231251)
result: pass

transcripts:
  - `tmp/phase-07-final-hand-smoke.log`
  - `tmp/phase-07-final-hand-smoke-sequence-a-rerun.log`

sequences:
  - id: A
    name: Node breakpoint round-trip via published CLI
    result: pass
    summary: |
      The first final run queried status before the paused projection appeared,
      so Sequence A was rerun with bounded polling for the status signals. The
      rerun produced the required entry pause, verified breakpoint, stack frame
      at `dapCliSelfHostDemo`, breakpoint stopped event, breakpoint paused
      status, clean close, and clean stop-controller output.
  - id: B
    name: Chrome side-by-side breakpoint via published CLI
    result: pass
    summary: |
      Chrome pwa-chrome launch, parent breakpoint routing, child-session hiding,
      child visibility with --show-children, evaluate-triggered breakpoint stop,
      parent paused-state mirroring, stack source mapping at `Window.calculate`,
      continue, close, stop-controller, and smoke-profile orphan check all
      produced the expected signals.

### Final Sequence A Key Verbatim Signals

```json
{"ok":true,"data":{"id":"sess_WA10hSKp2LSV4CFF","name":"smoke-node","adapter":"js-debug","lifecycle":"running","status":"running","updatedAt":"2026-05-08T15:18:00.646Z","paused":true,"stoppedReason":"entry","stoppedThreadIds":[0],"stderrTail":[],"cleanupActions":["Signal owned adapter pid 89011 if cleanup is required."],"logPath":"/Users/roblou/.dap-cli/logs/js-debug-89011.log"},"meta":{"command":"status","timestamp":"2026-05-08T15:18:00.687Z"}}
```

```json
{"ok":true,"data":{"breakpoints":[{"id":0,"verified":true,"source":{"name":"/Users/roblou/code/dap-cli/tests/fixtures/dap-cli-target/index.js","path":"/Users/roblou/code/dap-cli/tests/fixtures/dap-cli-target/index.js","sourceReference":0},"line":3,"column":3}]},"meta":{"command":"breakpoints set","timestamp":"2026-05-08T15:18:00.786Z"}}
```

```json
{"ok":true,"data":{"stackFrames":[{"id":0,"name":"dapCliSelfHostDemo","line":2,"column":18,"source":{"name":"/Users/roblou/code/dap-cli/tests/fixtures/dap-cli-target/index.js","path":"/Users/roblou/code/dap-cli/tests/fixtures/dap-cli-target/index.js","sourceReference":0},"presentationHint":"normal","canRestart":true}],"totalFrames":15},"meta":{"command":"stack","timestamp":"2026-05-08T15:18:00.992Z"}}
```

```json
{"ok":true,"data":{"sessionId":"sess_WA10hSKp2LSV4CFF","name":"smoke-node","events":[{"cursor":8,"receivedAt":"2026-05-08T15:18:00.646Z","sessionId":"sess_WA10hSKp2LSV4CFF","dapSeq":7,"event":"stopped","summary":"stopped event seq=7","body":{"reason":"entry","description":"Paused on breakpoint","threadId":0,"hitBreakpointIds":[],"allThreadsStopped":false,"child_session_id":"sess_Gk523fRDEue-t4E4"}},{"cursor":167,"receivedAt":"2026-05-08T15:18:01.197Z","sessionId":"sess_WA10hSKp2LSV4CFF","dapSeq":171,"event":"stopped","summary":"stopped event seq=171","body":{"reason":"breakpoint","description":"Paused on breakpoint","threadId":0,"hitBreakpointIds":[0],"allThreadsStopped":false,"child_session_id":"sess_Gk523fRDEue-t4E4"}}],"cursor":167,"dropped":114,"capacity":250,"capacityByPriority":{"high":200,"low":50},"warnings":["limit_exceeded_capacity: 500 requested, 250 available"],"truncatedToCapacity":250},"meta":{"command":"events","timestamp":"2026-05-08T15:18:01.270Z"}}
```

```json
{"ok":true,"data":{"id":"sess_WA10hSKp2LSV4CFF","name":"smoke-node","adapter":"js-debug","lifecycle":"running","status":"running","updatedAt":"2026-05-08T15:18:01.197Z","paused":true,"stoppedReason":"breakpoint","stoppedThreadIds":[0],"stderrTail":[],"cleanupActions":["Signal owned adapter pid 89011 if cleanup is required."],"logPath":"/Users/roblou/.dap-cli/logs/js-debug-89011.log"},"meta":{"command":"status","timestamp":"2026-05-08T15:18:01.365Z"}}
```

### Final Sequence B Key Verbatim Signals

```json
{"ok":true,"data":{"breakpoints":[{"id":0,"verified":true,"source":{"name":"app.js","path":"/Users/roblou/code/dap-cli/tests/fixtures/simple-chrome-page/app.js","sourceReference":0},"line":2,"column":18}]},"meta":{"command":"breakpoints set","timestamp":"2026-05-08T15:17:26.116Z"}}
```

```json
{"ok":true,"data":[{"id":"sess_N4cIbDilB5ekFB77","name":"smoke-chrome","adapter":"js-debug","lifecycle":"running","status":"running","updatedAt":"2026-05-08T15:17:26.012Z"}],"meta":{"command":"sessions","timestamp":"2026-05-08T15:17:26.219Z"}}
```

```json
{"ok":true,"data":[{"id":"sess_N4cIbDilB5ekFB77","name":"smoke-chrome","adapter":"js-debug","lifecycle":"running","status":"running","updatedAt":"2026-05-08T15:17:26.012Z"},{"id":"sess_wCO61fwgaUQeNDc5","name":"smoke-chrome#04F8D795D99289409D46B7A40A8D02F5","adapter":"js-debug","lifecycle":"running","status":"running","updatedAt":"2026-05-08T15:17:26.025Z","parent_session_id":"sess_N4cIbDilB5ekFB77","targetable":false},{"id":"sess_XDdw5cDYp1ikbNpy","name":"smoke-chrome#16F4048F23EB678ABB7E5C667B19171C","adapter":"js-debug","lifecycle":"running","status":"running","updatedAt":"2026-05-08T15:17:26.018Z","parent_session_id":"sess_N4cIbDilB5ekFB77","targetable":false}],"meta":{"command":"sessions","timestamp":"2026-05-08T15:17:26.305Z"}}
```

```json
{"ok":true,"data":{"sessionId":"sess_N4cIbDilB5ekFB77","name":"smoke-chrome","events":[{"cursor":16,"receivedAt":"2026-05-08T15:17:26.391Z","sessionId":"sess_N4cIbDilB5ekFB77","dapSeq":10,"event":"stopped","summary":"stopped event seq=10","body":{"reason":"breakpoint","description":"Paused on breakpoint","threadId":0,"hitBreakpointIds":[0],"allThreadsStopped":false,"child_session_id":"sess_wCO61fwgaUQeNDc5"}}],"cursor":16,"dropped":0,"capacity":250,"capacityByPriority":{"high":200,"low":50},"warnings":["limit_exceeded_capacity: 500 requested, 250 available"],"truncatedToCapacity":250},"meta":{"command":"events","timestamp":"2026-05-08T15:17:26.464Z"}}
```

```json
{"ok":true,"data":{"id":"sess_N4cIbDilB5ekFB77","name":"smoke-chrome","adapter":"js-debug","lifecycle":"running","status":"running","updatedAt":"2026-05-08T15:17:26.391Z","paused":true,"stoppedReason":"breakpoint","stoppedThreadIds":[0],"stderrTail":[],"cleanupActions":["Signal owned adapter pid 84812 if cleanup is required."],"logPath":"/Users/roblou/.dap-cli/logs/js-debug-84812.log"},"meta":{"command":"status","timestamp":"2026-05-08T15:17:26.675Z"}}
```

```json
{"ok":true,"data":{"stackFrames":[{"id":0,"name":"Window.calculate","line":2,"column":18,"source":{"name":"app.js","path":"/Users/roblou/code/dap-cli/tests/fixtures/simple-chrome-page/app.js","sourceReference":0},"presentationHint":"normal","canRestart":true},{"id":1,"name":"<anonymous>","line":1,"column":1,"source":{"name":"<eval>/VM46947590","path":"<eval>/VM46947590","sourceReference":46947590},"presentationHint":"normal","canRestart":true}],"totalFrames":2},"meta":{"command":"stack","timestamp":"2026-05-08T15:17:26.761Z"}}
```

```text
$ pgrep -lf /tmp/dap-cli-smoke-chrome

[exit:1]
no smoke profile orphans
```