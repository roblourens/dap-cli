---
phase: 06-add-conditional-breakpoint-playwright-interop-coverage
status: complete
result: pass
created: 2026-05-06
---

# Phase 06 UAT - Conditional Breakpoint Playwright Interop

## Automated Verification

### Typecheck

Command:

```bash
npm run typecheck
```

Exit code: 0

Captured output:

```text
> dap-cli@0.0.0 typecheck
> tsc --noEmit
```

### Alias and Routing Regression Tests

Command:

```bash
npm test -- tests/integration/fakeAdapterCli.test.ts tests/controller/sessionManager.test.ts
```

Exit code: 0

Captured output:

```text
> dap-cli@0.0.0 test
> vitest run tests/integration/fakeAdapterCli.test.ts tests/controller/sessionManager.test.ts

 RUN  v3.2.4 /Users/roblou/code/dap-cli

 ✓ tests/controller/sessionManager.test.ts (47 tests) 1844ms
   ✓ ControllerServer.terminateRuntime (H-8) > sessions.close on a fake-adapter session reports orphanPids when isProcessAlive stays true  1505ms
 ✓ tests/integration/fakeAdapterCli.test.ts (34 tests) 3524ms

 Test Files  2 passed (2)
      Tests  81 passed (81)
   Start at  22:09:56
   Duration  4.11s (transform 315ms, setup 0ms, collect 545ms, tests 5.37s, environment 0ms, prepare 128ms)
```

### Docs Validation

Command:

```bash
npm test -- tests/integration/docsValidation.test.ts
```

Exit code: 0

Captured output:

```text
> dap-cli@0.0.0 test
> vitest run tests/integration/docsValidation.test.ts

 RUN  v3.2.4 /Users/roblou/code/dap-cli

 ✓ tests/integration/docsValidation.test.ts (1 test) 6ms
   ✓ documentation command examples > use registered dap-cli command names 6ms

 Test Files  1 passed (1)
      Tests  1 passed (1)
   Start at  22:10:20
   Duration  554ms (transform 165ms, setup 0ms, collect 288ms, tests 6ms, environment 0ms, prepare 45ms)
```

## Gated Conditional Breakpoint Smoke

result: pass

Command:

```bash
DAP_CLI_RUN_CHROME_PLAYWRIGHT_HANDOFF=1 npm test -- tests/integration/playwrightInterop.test.ts
```

Exit code: 0

Captured output:

```text
> dap-cli@0.0.0 test
> vitest run tests/integration/playwrightInterop.test.ts

 RUN  v3.2.4 /Users/roblou/code/dap-cli

 ✓ tests/integration/playwrightInterop.test.ts (3 tests) 5491ms
   ✓ Playwright interop > coordinates Playwright browser action with dap-cli polling and inspection 177ms
   ✓ Playwright interop > coordinates Playwright with the same Chromium target attached by js-debug  546ms
   ✓ Playwright interop > coordinates Playwright with conditional breakpoints through js-debug  3880ms

 Test Files  1 passed (1)
      Tests  3 passed (3)
   Start at  22:10:01
   Duration  6.32s (transform 213ms, setup 0ms, collect 608ms, tests 5.49s, environment 0ms, prepare 40ms)
```

Behavior covered:

- `calculate(1, 2)` updated the page result to `3` and did not emit a new `stopped` event after the conditional breakpoint cursor.
- `calculate(7, 8)` emitted `stopped` with `reason: breakpoint`.
- dap-cli inspection through `threads`, `stack`, `scopes`, and `variables` found local `left` value `7` and `right` value `8` before `continue` resumed the page to result `15`.

## Repo Hard-Rule Verify-Work Reminder

This UAT records Phase 6 automated and gated verification. Before any `/gsd-verify-work` round marks UAT complete, the orchestrator must execute `docs/HAND-DRIVEN-SMOKE.md` Sequence A and Sequence B in a real terminal using the published `./bin/dap-cli` binary, paste the verbatim captured output under a `## Hand-Driven CLI Smoke` heading, and record both sequences as `result: pass`.

## Hand-Driven CLI Smoke

ran_at: 2026-05-06T15:34:42Z

### Prerequisites

Command:

```bash
npm run build
node --version
ls ~/.dap-cli/adapters
npx tsx scripts/setup-adapters.ts
node dist/index.js --help | sed -n '/Commands:/,$p' | head -80
```

Captured output:

```text
> dap-cli@0.0.0 build
> tsup

CLI Building entry: src/index.ts
CLI Using tsconfig: tsconfig.json
CLI tsup v8.5.1
CLI Using tsup config: /Users/roblou/code/dap-cli/tsup.config.ts
CLI Target: node22
CLI Cleaning output folder
ESM Build start
ESM dist/index.js     223.76 KB
ESM dist/index.js.map 459.82 KB
ESM ⚡️ Build success in 31ms
v22.22.1
js-debug
dap-cli home: /Users/roblou/.dap-cli
adapter cache: /Users/roblou/.dap-cli/adapters
js-debug already available at /Users/roblou/.dap-cli/adapters/js-debug
debugpy missing from system Python; will provision v1.8.20 to /Users/roblou/.dap-cli/venv
debugpy v1.8.20 provisioned to /Users/roblou/.dap-cli/venv
Adapter setup complete.
Commands:
  start                        Start the persistent controller for debug
                               sessions
  status [options]             Poll session status (running, stopped,
                               terminated)
  stop [options]               Stop a debug session, or stop the controller when
                               no session is selected
  stop-controller              Shut down the persistent controller (does not
                               affect on-disk session records)
  sessions [options]           List known debug sessions (child sessions are
                               hidden by default; use --show-children to include
                               them)
  use <name>                   Set the active debug session
  detach [options]             Detach from a debug session
  close [options] [name]       Close a debug session
  cleanup [options]            Clean up stale session state
  launch [options]             Start a DAP launch session using an adapter id,
                               named launch config, or fake adapter
  attach [options]             Start a DAP attach session using an adapter id,
                               named launch config, or fake adapter
  request [options] <command>  Send raw DAP request with JSON arguments (escape
                               hatch)
  capabilities [options]       Return adapter capabilities for a fake/custom
                               session
  events [options]             Poll recent DAP events with cursor-based
                               pagination
  dap                          Send generated DAP requests by protocol command
                               name
  breakpoints                  Manage source breakpoints
  threads [options]            List active threads in a paused session
  stack [options]              Get stack frames for a thread (requires thread-id
                               from threads command)
  scopes [options]             List scopes for a stack frame (requires frame-id
                               from stack command)
  variables [options]          Inspect variables for a scope (requires
                               variables-reference from scopes command)
  source [options]             Return source content
  evaluate [options]           Evaluate an expression
  continue [options]           Continue execution
  pause [options]              Pause execution
  next [options]               Step over
  step-in [options]            Step in
  step-out [options]           Step out
  help [command]               display help for command
```

### Sequence A

result: pass

Captured output:

```text
$ node dist/index.js start
{"ok":true,"data":{"started":true,"reused":false,"pid":1704,"endpoint":{"kind":"ipc","path":"/Users/roblou/.dap-cli/state/controller.sock"},"stateDir":"/Users/roblou/.dap-cli/state","logDir":"/Users/roblou/.dap-cli/logs","buildId":"0.0.0:dist:1778081669664.1416:229174"},"meta":{"command":"start","timestamp":"2026-05-06T15:36:05.283Z"}}

$ node dist/index.js launch --name smoke-node --adapter js-debug --type pwa-node --program "$PWD/tests/fixtures/dap-cli-target/index.js" --stop-on-entry
{"ok":true,"data":{"sessionId":"sess_4yIvnhQqeswPBxxB","name":"smoke-node","lifecycle":"running","capabilities":{"supportsConfigurationDoneRequest":true,"supportsFunctionBreakpoints":false,"supportsConditionalBreakpoints":true,"supportsHitConditionalBreakpoints":true,"supportsEvaluateForHovers":true,"supportsReadMemoryRequest":true,"supportsWriteMemoryRequest":true,"supportsLogPoints":true},"eventCursor":4},"meta":{"command":"launch","timestamp":"2026-05-06T15:36:20.683Z"}}

$ node dist/index.js status --name smoke-node
{"ok":true,"data":{"id":"sess_4yIvnhQqeswPBxxB","name":"smoke-node","adapter":"js-debug","lifecycle":"running","status":"running","updatedAt":"2026-05-06T15:36:20.819Z","paused":true,"stoppedReason":"entry","stoppedThreadIds":[0],"stderrTail":[],"cleanupActions":["Signal owned adapter pid 2141 if cleanup is required."],"logPath":"/Users/roblou/.dap-cli/logs/js-debug-2141.log"},"meta":{"command":"status","timestamp":"2026-05-06T15:36:28.445Z"}}

$ node dist/index.js breakpoints set --name smoke-node --source "$PWD/tests/fixtures/dap-cli-target/index.js" --line 3
{"ok":true,"data":{"breakpoints":[{"id":0,"verified":true,"source":{"name":"/Users/roblou/code/dap-cli/tests/fixtures/dap-cli-target/index.js","path":"/Users/roblou/code/dap-cli/tests/fixtures/dap-cli-target/index.js","sourceReference":0},"line":3,"column":3}]},"meta":{"command":"breakpoints set","timestamp":"2026-05-06T15:36:28.527Z"}}

$ node dist/index.js threads --name smoke-node
{"ok":true,"data":{"threads":[{"id":0,"name":"index.js [2145]","sessionName":"smoke-node#2056b7315d77751bf59f9498"}]},"meta":{"command":"threads","timestamp":"2026-05-06T15:36:28.603Z"}}

$ node dist/index.js stack --name smoke-node --thread-id 0
{"ok":true,"data":{"stackFrames":[{"id":0,"name":"dapCliSelfHostDemo","line":2,"column":18,"source":{"name":"/Users/roblou/code/dap-cli/tests/fixtures/dap-cli-target/index.js","path":"/Users/roblou/code/dap-cli/tests/fixtures/dap-cli-target/index.js","sourceReference":0},"presentationHint":"normal","canRestart":true}],"totalFrames":15},"meta":{"command":"stack","timestamp":"2026-05-06T15:36:28.680Z"}}

$ node dist/index.js continue --name smoke-node --thread-id 0
{"ok":true,"data":{"allThreadsContinued":false},"meta":{"command":"continue","timestamp":"2026-05-06T15:36:36.352Z"}}

$ node dist/index.js events --name smoke-node --include stopped --limit 100
{"ok":true,"data":{"sessionId":"sess_4yIvnhQqeswPBxxB","name":"smoke-node","events":[{"cursor":8,"receivedAt":"2026-05-06T15:36:20.819Z","sessionId":"sess_4yIvnhQqeswPBxxB","dapSeq":7,"event":"stopped","summary":"stopped event seq=7","body":{"reason":"entry","description":"Paused on breakpoint","threadId":0,"hitBreakpointIds":[],"allThreadsStopped":false,"child_session_id":"sess_NhyEVHPbarbnwT4G"}},{"cursor":173,"receivedAt":"2026-05-06T15:36:36.354Z","sessionId":"sess_4yIvnhQqeswPBxxB","dapSeq":172,"event":"stopped","summary":"stopped event seq=172","body":{"reason":"breakpoint","description":"Paused on breakpoint","threadId":0,"hitBreakpointIds":[0],"allThreadsStopped":false,"child_session_id":"sess_NhyEVHPbarbnwT4G"}}],"cursor":173,"dropped":114,"capacity":250,"capacityByPriority":{"high":200,"low":50}},"meta":{"command":"events","timestamp":"2026-05-06T15:36:36.426Z"}}

$ node dist/index.js status --name smoke-node
{"ok":true,"data":{"id":"sess_4yIvnhQqeswPBxxB","name":"smoke-node","adapter":"js-debug","lifecycle":"running","status":"running","updatedAt":"2026-05-06T15:36:36.354Z","paused":true,"stoppedReason":"breakpoint","stoppedThreadIds":[0],"stderrTail":[],"cleanupActions":["Signal owned adapter pid 2141 if cleanup is required."],"logPath":"/Users/roblou/.dap-cli/logs/js-debug-2141.log"},"meta":{"command":"status","timestamp":"2026-05-06T15:36:36.497Z"}}

$ node dist/index.js close smoke-node
{"ok":true,"data":{"id":"sess_4yIvnhQqeswPBxxB","name":"smoke-node","adapter":"js-debug","lifecycle":"running","status":"running","updatedAt":"2026-05-06T15:36:36.354Z","paused":true,"stoppedReason":"breakpoint","stoppedThreadIds":[0],"stderrTail":[],"cleanupActions":["Signal owned adapter pid 2141 if cleanup is required."],"logPath":"/Users/roblou/.dap-cli/logs/js-debug-2141.log","orphanPids":[],"warnings":[]},"meta":{"command":"close","timestamp":"2026-05-06T15:36:38.641Z"}}

$ node dist/index.js stop-controller
{"ok":true,"data":{"stopped":true},"meta":{"command":"stop-controller","timestamp":"2026-05-06T15:36:38.722Z"}}
```

### Sequence B

result: pass

Captured output:

```text
$ node dist/index.js start
{"ok":true,"data":{"started":true,"reused":false,"pid":5148,"endpoint":{"kind":"ipc","path":"/Users/roblou/.dap-cli/state/controller.sock"},"stateDir":"/Users/roblou/.dap-cli/state","logDir":"/Users/roblou/.dap-cli/logs","buildId":"0.0.0:dist:1778081669664.1416:229174"},"meta":{"command":"start","timestamp":"2026-05-06T15:36:49.097Z"}}

$ node dist/index.js cleanup --purge
{"ok":true,"data":{"signaledAdapter":[],"removedRecords":[],"keptRunning":[],"failed":[],"orphanPids":[],"warnings":[]},"meta":{"command":"cleanup","timestamp":"2026-05-06T15:37:02.709Z"}}

$ node dist/index.js launch --name smoke-chrome --adapter js-debug --type pwa-chrome --url "file://$PWD/tests/fixtures/simple-chrome-page/index.html?manual" --json "{\"webRoot\":\"$PWD/tests/fixtures/simple-chrome-page\",\"runtimeArgs\":[\"--headless=new\",\"--disable-gpu\",\"--no-first-run\",\"--user-data-dir=/tmp/dap-cli-smoke-chrome\"]}"
{"ok":true,"data":{"sessionId":"sess_oHI3eO8Kbkhf8xyl","name":"smoke-chrome","lifecycle":"running","capabilities":{"supportsConfigurationDoneRequest":true,"supportsFunctionBreakpoints":false,"supportsConditionalBreakpoints":true,"supportsHitConditionalBreakpoints":true,"supportsEvaluateForHovers":true,"supportsReadMemoryRequest":true,"supportsWriteMemoryRequest":true,"supportsLogPoints":true},"eventCursor":7},"meta":{"command":"launch","timestamp":"2026-05-06T15:37:04.355Z"}}

$ node dist/index.js events --name smoke-chrome --limit 50
{"ok":true,"data":{"sessionId":"sess_oHI3eO8Kbkhf8xyl","name":"smoke-chrome","events":[{"cursor":5,"receivedAt":"2026-05-06T15:37:04.265Z","sessionId":"sess_oHI3eO8Kbkhf8xyl","dapSeq":2,"event":"initialized","summary":"initialized event seq=2","body":{"child_session_id":"sess_gMrxnvtYeqS8tWck"}},{"cursor":7,"receivedAt":"2026-05-06T15:37:04.271Z","sessionId":"sess_oHI3eO8Kbkhf8xyl","dapSeq":5,"event":"thread","summary":"thread event seq=5","body":{"reason":"started","threadId":0,"child_session_id":"sess_gMrxnvtYeqS8tWck"}}],"cursor":11,"dropped":0,"capacity":250,"capacityByPriority":{"high":200,"low":50}},"meta":{"command":"events","timestamp":"2026-05-06T15:37:25.497Z"}}

$ node dist/index.js breakpoints set --name smoke-chrome --source "$PWD/tests/fixtures/simple-chrome-page/app.js" --line 2
{"ok":true,"data":{"breakpoints":[{"id":0,"verified":true,"source":{"name":"app.js","path":"/Users/roblou/code/dap-cli/tests/fixtures/simple-chrome-page/app.js","sourceReference":0},"line":2,"column":18}]},"meta":{"command":"breakpoints set","timestamp":"2026-05-06T15:37:25.594Z"}}

$ node dist/index.js sessions
{"ok":true,"data":[{"id":"sess_oHI3eO8Kbkhf8xyl","name":"smoke-chrome","adapter":"js-debug","lifecycle":"running","status":"running","updatedAt":"2026-05-06T15:37:04.353Z"}],"meta":{"command":"sessions","timestamp":"2026-05-06T15:37:25.670Z"}}

$ node dist/index.js sessions --show-children
{"ok":true,"data":[{"id":"sess_oHI3eO8Kbkhf8xyl","name":"smoke-chrome","adapter":"js-debug","lifecycle":"running","status":"running","updatedAt":"2026-05-06T15:37:04.353Z"},{"id":"sess_gMrxnvtYeqS8tWck","name":"smoke-chrome#4675A537882A54C8BD85830720483AB2","adapter":"js-debug","lifecycle":"running","status":"running","updatedAt":"2026-05-06T15:37:04.371Z","parent_session_id":"sess_oHI3eO8Kbkhf8xyl","targetable":false}],"meta":{"command":"sessions","timestamp":"2026-05-06T15:37:25.746Z"}}

$ node dist/index.js evaluate --name smoke-chrome --expression 'calculate(2,3)'
{"ok":false,"error":{"code":"controller_request_timeout","category":"timeout","message":"Timed out waiting for dap-cli controller response.","exitCode":7,"diagnostics":["Check whether the controller process is still healthy."]},"meta":{"command":"evaluate smoke-chrome","timestamp":"2026-05-06T15:37:50.337Z"}}

$ node dist/index.js events --name smoke-chrome --include stopped --limit 100
{"ok":true,"data":{"sessionId":"sess_oHI3eO8Kbkhf8xyl","name":"smoke-chrome","events":[{"cursor":16,"receivedAt":"2026-05-06T15:37:45.354Z","sessionId":"sess_oHI3eO8Kbkhf8xyl","dapSeq":12,"event":"stopped","summary":"stopped event seq=12","body":{"reason":"breakpoint","description":"Paused on breakpoint","threadId":0,"hitBreakpointIds":[0],"allThreadsStopped":false,"child_session_id":"sess_gMrxnvtYeqS8tWck"}}],"cursor":17,"dropped":0,"capacity":250,"capacityByPriority":{"high":200,"low":50}},"meta":{"command":"events","timestamp":"2026-05-06T15:38:03.628Z"}}

$ node dist/index.js threads --name smoke-chrome
{"ok":true,"data":{"threads":[{"id":0,"name":"index.html?manual","sessionName":"smoke-chrome#4675A537882A54C8BD85830720483AB2"}]},"meta":{"command":"threads","timestamp":"2026-05-06T15:38:03.709Z"}}

$ node dist/index.js status --name smoke-chrome
{"ok":true,"data":{"id":"sess_oHI3eO8Kbkhf8xyl","name":"smoke-chrome","adapter":"js-debug","lifecycle":"running","status":"running","updatedAt":"2026-05-06T15:37:45.354Z","paused":true,"stoppedReason":"breakpoint","stoppedThreadIds":[0],"stderrTail":[],"cleanupActions":["Signal owned adapter pid 5826 if cleanup is required."],"logPath":"/Users/roblou/.dap-cli/logs/js-debug-5826.log"},"meta":{"command":"status","timestamp":"2026-05-06T15:38:03.785Z"}}

$ node dist/index.js stack --name smoke-chrome --thread-id 0
{"ok":true,"data":{"stackFrames":[{"id":0,"name":"Window.calculate","line":2,"column":18,"source":{"name":"app.js","path":"/Users/roblou/code/dap-cli/tests/fixtures/simple-chrome-page/app.js","sourceReference":0},"presentationHint":"normal","canRestart":true},{"id":1,"name":"<anonymous>","line":1,"column":1,"source":{"name":"<eval>/VM46947590","path":"<eval>/VM46947590","sourceReference":46947590},"presentationHint":"normal","canRestart":true}],"totalFrames":2},"meta":{"command":"stack","timestamp":"2026-05-06T15:38:03.867Z"}}

$ node dist/index.js continue --name smoke-chrome --thread-id 0
{"ok":true,"data":{"allThreadsContinued":false},"meta":{"command":"continue","timestamp":"2026-05-06T15:38:03.946Z"}}

$ node dist/index.js close smoke-chrome
{"ok":true,"data":{"id":"sess_oHI3eO8Kbkhf8xyl","name":"smoke-chrome","adapter":"js-debug","lifecycle":"running","status":"running","updatedAt":"2026-05-06T15:38:03.945Z","paused":false,"stderrTail":[],"cleanupActions":["Signal owned adapter pid 5826 if cleanup is required."],"logPath":"/Users/roblou/.dap-cli/logs/js-debug-5826.log","orphanPids":[],"warnings":[]},"meta":{"command":"close","timestamp":"2026-05-06T15:38:06.095Z"}}

$ node dist/index.js stop-controller
{"ok":true,"data":{"stopped":true},"meta":{"command":"stop-controller","timestamp":"2026-05-06T15:38:06.198Z"}}

$ pgrep -lf '/tmp/dap-cli-smoke-chrome' || echo "no smoke profile orphans"
no smoke profile orphans
```

Resolved gap:

```yaml
- truth: "Sequence B final orphan check prints no orphans"
  status: fixed
  reason: "The original documented broad check `pgrep -lf 'remote-debugging-pipe' || echo \"no orphans\"` matched unrelated MCP/Playwright Chrome processes using user-data-dir `/Users/roblou/Library/Caches/ms-playwright/mcp-chrome-7b08013`. docs/HAND-DRIVEN-SMOKE.md now scopes the check to `/tmp/dap-cli-smoke-chrome`, and the rerun printed `no smoke profile orphans`."
  severity: major
  test: "Sequence B step 7"
  artifacts:
    - docs/HAND-DRIVEN-SMOKE.md
  fixed_by:
    - "Profile-scoped orphan check that distinguishes smoke-owned Chromium from unrelated Playwright/MCP browser processes."
```

Gap-closure verification:

```text
$ npm test -- tests/integration/docsValidation.test.ts

> dap-cli@0.0.0 test
> vitest run tests/integration/docsValidation.test.ts

 RUN  v3.2.4 /Users/roblou/code/dap-cli

 ✓ tests/integration/docsValidation.test.ts (1 test) 8ms
   ✓ documentation command examples > use registered dap-cli command names 7ms

 Test Files  1 passed (1)
      Tests  1 passed (1)
   Start at  08:40:35
   Duration  520ms (transform 154ms, setup 0ms, collect 253ms, tests 8ms, environment 0ms, prepare 43ms)

$ pgrep -lf '/tmp/dap-cli-smoke-chrome' || echo "no smoke profile orphans"
no smoke profile orphans
```
