---
phase: 22-onboard-rust-debugging-through-codelldb-as-a-built-in-adapte
plan: 11
status: complete
completed: 2026-06-01
binary_under_test: node dist/index.js
---

# Phase 22 Rust / CodeLLDB Final UAT

## Automated Verification

The final gate first reproduced and then closed a real blocker retained from hardening: overlong macOS Unix controller socket paths. Five `tests/integration/evaluateAutoFrame.test.ts` cases failed with `listen EINVAL: invalid argument .../state/controller.sock`; final verification therefore stopped before terminal UAT. `src/controller/ipc.ts` was fixed to use a deterministic short temporary Unix socket endpoint only when the configured endpoint exceeds the portable path budget, and `tests/controller/controllerIpc.test.ts` now covers the long-`DAP_CLI_HOME` case.

Focused closure rerun:

```text
runTests: tests/controller/controllerIpc.test.ts tests/integration/evaluateAutoFrame.test.ts tests/integration/selfHosting.test.ts
summary passed=22 failed=0
```

Final automated command:

```bash
git --no-pager diff --check -- src/controller/ipc.ts tests/controller/controllerIpc.test.ts .planning/ROADMAP.md .planning/STATE.md .planning/phases/22-onboard-rust-debugging-through-codelldb-as-a-built-in-adapte/22-RESULTS.md .planning/phases/22-onboard-rust-debugging-through-codelldb-as-a-built-in-adapte/22-HARDENING-GAPS.md .planning/phases/22-onboard-rust-debugging-through-codelldb-as-a-built-in-adapte/22-10-SUMMARY.md && npx vitest run tests/adapters/codelldb.test.ts tests/adapters/provision/codelldb.test.ts tests/adapters/provision/concurrent.test.ts tests/adapters/registry.test.ts tests/cli/setupAdaptersCommand.test.ts tests/config/launchConfig.test.ts tests/config/programInference.test.ts tests/integration/codelldbAdapter.test.ts tests/integration/docsValidation.test.ts tests/adapters/provision/errorSnapshots.test.ts tests/architecture/moduleBoundaries.test.ts && DAP_CLI_RUN_PACKAGING=1 npx vitest run --no-file-parallelism tests/packaging/ && npm run check
```

Final result:

```text
Test Files  11 passed (11)
Test Files  2 passed (2)

> @roblourens/dap-cli@0.2.0 check
> npm run typecheck && npm run lint && npm test && npm run build && npm run check:pack

Test Files  61 passed | 2 skipped (63)
ESM Build success in 30ms
Test Files  2 passed (2)
```

result: pass

## Verify-Work Coverage

| Behavior Prompt | Evidence | Result |
| --- | --- | --- |
| Approved payload and setup remain official-local-cache-only on verified `darwin_arm64`. | `22-GATE-RESULTS.md`, `22-RESULTS.md` `FA-R02-CLI-R2`, automated provision/setup/package tests. | pass |
| Explicit compiled Rust launch reaches source breakpoint state through CodeLLDB. | `22-RESULTS.md` `FA-R03-CLI`; real CodeLLDB integration suite. | pass |
| Named `type: "lldb"` configuration maps to built-in `codelldb`. | `22-RESULTS.md` `FA-R04-CLI`; integration/config tests. | pass |
| Raw Cargo objects and raw `.rs` inference fail with typed diagnostics; unsupported platform does not install. | `22-RESULTS.md` `FA-R05-R07-CLI`; config/inference/setup/error tests. | pass |
| Attach targets only an owned Rust PID and disconnect does not terminate it implicitly. | `22-RESULTS.md` `FA-R06-CLI`; real integration test. | pass |
| Screened public source execution remains isolated/offline and selected-only. | `22-EXTERNAL-PROJECT-CANDIDATES.md`; accepted `EXT-01-R2-CLI-minigrep` and `EXT-02-R2-CLI-itoa` transcripts in `22-RESULTS.md`. | pass |
| Fresh-agent/rerun closure is transcript-audited and blocked/preliminary history is retained. | `22-RESULTS.md`; `22-HARDENING-GAPS.md`. | pass |
| Final-gate socket-path failure is closed rather than waived. | `src/controller/ipc.ts`; `tests/controller/controllerIpc.test.ts`; automated results above. | pass |

## Hand-Driven CLI Smoke

ran_at: 2026-06-01T05:42:35Z through 2026-06-01T05:47:52Z
orchestrator: GitHub Copilot
binary_under_test: `node dist/index.js` built from this branch
isolation: Phase-local `tmp/phase-22-uat/**` controller, adapter, and Chromium profile roots; Sequence C used a genuinely empty isolated adapter cache and downloaded the official js-debug asset after interactive consent without changing the existing global adapter installation.

sequences:
  - id: A
    description: Node target breakpoint round-trip through the real CLI
    result: pass
    captured_output: |
      --- A-R1 isolation ---
      DAP_CLI_HOME=/Users/roblou/code/dap-cli/tmp/phase-22-uat/a-r1-20260601/home
      DAP_CLI_ADAPTERS_DIR=/Users/roblou/code/dap-cli/tmp/phase-22-uat/a-r1-20260601/adapters
      --- A-R1 start ---
      {"ok":true,"data":{"started":true,"reused":false,"pid":70512,"endpoint":{"kind":"ipc","path":"/Users/roblou/code/dap-cli/tmp/phase-22-uat/a-r1-20260601/home/state/controller.sock"},"stateDir":"/Users/roblou/code/dap-cli/tmp/phase-22-uat/a-r1-20260601/home/state","logDir":"/Users/roblou/code/dap-cli/tmp/phase-22-uat/a-r1-20260601/home/logs","buildId":"0.2.0:dist:1780292517582.478:338774"},"meta":{"command":"start","timestamp":"2026-06-01T05:47:47.292Z"}}
      --- A-R1 launch ---
      {"ok":true,"data":{"sessionId":"sess_K92rpzn5oxTah928","name":"smoke-node","lifecycle":"running","capabilities":{"supportsConfigurationDoneRequest":true,"supportsConditionalBreakpoints":true,"supportsHitConditionalBreakpoints":true,"supportsEvaluateForHovers":true,"supportsLoadedSourcesRequest":true,"supportsLogPoints":true}},"meta":{"command":"launch","timestamp":"2026-06-01T05:47:47.539Z"}}
      --- A-R1 status entry ---
      {"ok":true,"data":{"id":"sess_K92rpzn5oxTah928","name":"smoke-node","adapter":"js-debug","lifecycle":"running","status":"stopped","updatedAt":"2026-06-01T05:47:47.653Z","paused":true,"stoppedReason":"entry","stoppedThreadIds":[0],"stderrTail":[],"cleanupActions":["Signal owned adapter pid 70514 if cleanup is required."],"logPath":"/Users/roblou/code/dap-cli/tmp/phase-22-uat/a-r1-20260601/home/logs/js-debug-70514.log"},"meta":{"command":"status","timestamp":"2026-06-01T05:47:48.681Z"}}
      --- A-R1 breakpoint ---
      {"ok":true,"data":{"breakpoints":[{"id":0,"verified":true,"source":{"name":"/Users/roblou/code/dap-cli/tests/fixtures/dap-cli-target/index.js","path":"/Users/roblou/code/dap-cli/tests/fixtures/dap-cli-target/index.js","sourceReference":0},"line":3,"column":3}]},"meta":{"command":"breakpoints set","timestamp":"2026-06-01T05:47:48.791Z"}}
      --- A-R1 threads ---
      {"ok":true,"data":{"threads":[{"id":0,"name":"index.js [70518]","sessionName":"smoke-node#d1def69b5ca18c854ebfeb32"}]},"meta":{"command":"threads","timestamp":"2026-06-01T05:47:48.894Z"}}
      selected_thread_id=0
      --- A-R1 stack ---
      {"ok":true,"data":{"stackFrames":[{"id":0,"name":"dapCliSelfHostDemo","line":2,"column":18,"source":{"name":"/Users/roblou/code/dap-cli/tests/fixtures/dap-cli-target/index.js","path":"/Users/roblou/code/dap-cli/tests/fixtures/dap-cli-target/index.js","sourceReference":0},"presentationHint":"normal","canRestart":true},{"id":1,"name":"<anonymous>","line":7,"column":1,"source":{"name":"/Users/roblou/code/dap-cli/tests/fixtures/dap-cli-target/index.js","path":"/Users/roblou/code/dap-cli/tests/fixtures/dap-cli-target/index.js","sourceReference":0},"presentationHint":"normal","canRestart":false}],"totalFrames":15},"meta":{"command":"stack","timestamp":"2026-06-01T05:47:49.029Z"}}
      --- A-R1 continue ---
      {"ok":true,"data":{"allThreadsContinued":false},"meta":{"command":"continue","timestamp":"2026-06-01T05:47:49.136Z"}}
      --- A-R1 stopped event ---
      {"ok":true,"data":{"sessionId":"sess_K92rpzn5oxTah928","name":"smoke-node","events":[{"cursor":8,"receivedAt":"2026-06-01T05:47:47.653Z","sessionId":"sess_K92rpzn5oxTah928","dapSeq":7,"event":"stopped","summary":"stopped event seq=7","body":{"reason":"entry","description":"Paused on breakpoint","threadId":0,"hitBreakpointIds":[],"allThreadsStopped":false,"child_session_id":"sess_VK00-DuRezgjVxdz"}},{"cursor":167,"receivedAt":"2026-06-01T05:47:49.139Z","sessionId":"sess_K92rpzn5oxTah928","dapSeq":170,"event":"stopped","summary":"stopped event seq=170","body":{"reason":"breakpoint","description":"Paused on breakpoint","threadId":0,"hitBreakpointIds":[0],"allThreadsStopped":false,"child_session_id":"sess_VK00-DuRezgjVxdz"}}],"cursor":167,"dropped":114,"capacity":250,"capacityByPriority":{"high":200,"low":50}},"meta":{"command":"events","timestamp":"2026-06-01T05:47:50.276Z"}}
      --- A-R1 breakpoint status ---
      {"ok":true,"data":{"id":"sess_K92rpzn5oxTah928","name":"smoke-node","adapter":"js-debug","lifecycle":"running","status":"stopped","updatedAt":"2026-06-01T05:47:49.139Z","paused":true,"stoppedReason":"breakpoint","stoppedThreadIds":[0],"stderrTail":[],"cleanupActions":["Signal owned adapter pid 70514 if cleanup is required."],"logPath":"/Users/roblou/code/dap-cli/tmp/phase-22-uat/a-r1-20260601/home/logs/js-debug-70514.log"},"meta":{"command":"status","timestamp":"2026-06-01T05:47:50.379Z"}}
      --- A-R1 close ---
      {"ok":true,"data":{"id":"sess_K92rpzn5oxTah928","name":"smoke-node","adapter":"js-debug","lifecycle":"running","status":"stopped","updatedAt":"2026-06-01T05:47:49.139Z","paused":true,"stoppedReason":"breakpoint","stoppedThreadIds":[0],"stderrTail":[],"cleanupActions":["Signal owned adapter pid 70514 if cleanup is required."],"logPath":"/Users/roblou/code/dap-cli/tmp/phase-22-uat/a-r1-20260601/home/logs/js-debug-70514.log","orphanPids":[],"warnings":[]},"meta":{"command":"close","timestamp":"2026-06-01T05:47:52.578Z"}}
      --- A-R1 stop controller ---
      {"ok":true,"data":{"stopped":true},"meta":{"command":"stop-controller","timestamp":"2026-06-01T05:47:52.699Z"}}
      --- A-R1 result: pass ---
  - id: B
    description: Real headless Chromium child-session breakpoint flow
    result: pass
    captured_output: |
      --- B0 isolation ---
      DAP_CLI_HOME=/Users/roblou/code/dap-cli/tmp/phase-22-uat/b-20260601/home
      DAP_CLI_ADAPTERS_DIR=/Users/roblou/code/dap-cli/tmp/phase-22-uat/b-20260601/adapters
      CHROME_PROFILE=/Users/roblou/code/dap-cli/tmp/phase-22-uat/b-20260601/chrome-profile
      --- B1 start ---
      {"ok":true,"data":{"started":true,"reused":false,"pid":58005,"endpoint":{"kind":"ipc","path":"/Users/roblou/code/dap-cli/tmp/phase-22-uat/b-20260601/home/state/controller.sock"},"stateDir":"/Users/roblou/code/dap-cli/tmp/phase-22-uat/b-20260601/home/state","logDir":"/Users/roblou/code/dap-cli/tmp/phase-22-uat/b-20260601/home/logs","buildId":"0.2.0:dist:1780292517582.478:338774"},"meta":{"command":"start","timestamp":"2026-06-01T05:43:19.957Z"}}
      --- B1a cleanup purge ---
      {"ok":true,"data":{"signaledAdapter":[],"removedRecords":[],"keptRunning":[],"failed":[],"orphanPids":[],"warnings":[]},"meta":{"command":"cleanup","timestamp":"2026-06-01T05:43:20.861Z"}}
      --- B2 launch chrome ---
      {"ok":true,"data":{"sessionId":"sess_ou8KcjuQ5Y5SsgVC","name":"smoke-chrome","lifecycle":"running","capabilities":{"supportsConfigurationDoneRequest":true,"supportsConditionalBreakpoints":true,"supportsHitConditionalBreakpoints":true,"supportsEvaluateForHovers":true,"supportsLoadedSourcesRequest":true,"supportsLogPoints":true}},"meta":{"command":"launch","timestamp":"2026-06-01T05:43:23.709Z"}}
      --- B3 breakpoint ---
      {"ok":true,"data":{"breakpoints":[{"id":0,"verified":true,"source":{"name":"app.js","path":"/Users/roblou/code/dap-cli/tests/fixtures/simple-chrome-page/app.js","sourceReference":0},"line":2,"column":18}]},"meta":{"command":"breakpoints set","timestamp":"2026-06-01T05:43:25.840Z"}}
      --- B4 sessions parent-only ---
      {"ok":true,"data":[{"id":"sess_ou8KcjuQ5Y5SsgVC","name":"smoke-chrome","adapter":"js-debug","lifecycle":"running","status":"running","updatedAt":"2026-06-01T05:43:23.706Z"}],"meta":{"command":"sessions","timestamp":"2026-06-01T05:43:25.943Z"}}
      --- B4 sessions with children ---
      {"ok":true,"data":[{"id":"sess_ou8KcjuQ5Y5SsgVC","name":"smoke-chrome","adapter":"js-debug","lifecycle":"running","status":"running","updatedAt":"2026-06-01T05:43:23.706Z"},{"id":"sess_polMjEcDznPlH97b","name":"smoke-chrome#1A688A8D9213AE57404B9A75A7EEEAAA","adapter":"js-debug","lifecycle":"running","status":"running","updatedAt":"2026-06-01T05:43:23.722Z","parent_session_id":"sess_ou8KcjuQ5Y5SsgVC","targetable":false}],"meta":{"command":"sessions","timestamp":"2026-06-01T05:43:26.049Z"}}
      --- B5 stopped events ---
      {"ok":true,"data":{"sessionId":"sess_ou8KcjuQ5Y5SsgVC","name":"smoke-chrome","events":[{"cursor":10,"receivedAt":"2026-06-01T05:43:26.161Z","sessionId":"sess_ou8KcjuQ5Y5SsgVC","dapSeq":10,"event":"stopped","summary":"stopped event seq=10","body":{"reason":"breakpoint","description":"Paused on breakpoint","threadId":0,"hitBreakpointIds":[0],"allThreadsStopped":false,"child_session_id":"sess_polMjEcDznPlH97b"}}],"cursor":13,"dropped":0,"capacity":250,"capacityByPriority":{"high":200,"low":50}},"meta":{"command":"events","timestamp":"2026-06-01T05:43:29.180Z"}}
      --- B5 threads ---
      {"ok":true,"data":{"threads":[{"id":0,"name":"index.html?manual","sessionName":"smoke-chrome#1A688A8D9213AE57404B9A75A7EEEAAA"}]},"meta":{"command":"threads","timestamp":"2026-06-01T05:43:29.287Z"}}
      selected_thread_id=0
      --- B5 status ---
      {"ok":true,"data":{"id":"sess_ou8KcjuQ5Y5SsgVC","name":"smoke-chrome","adapter":"js-debug","lifecycle":"running","status":"stopped","updatedAt":"2026-06-01T05:43:26.161Z","paused":true,"stoppedReason":"breakpoint","stoppedThreadIds":[0],"stderrTail":["(node:58024) [DEP0169] DeprecationWarning: `url.parse()` behavior is not standardized and prone to errors that have security implications. Use the WHATWG URL API instead. CVEs are not issued for `url.parse()` vulnerabilities.","(Use `node --trace-deprecation ...` to show where the warning was created)"],"cleanupActions":["Signal owned adapter pid 58024 if cleanup is required."],"logPath":"/Users/roblou/code/dap-cli/tmp/phase-22-uat/b-20260601/home/logs/js-debug-58024.log"},"meta":{"command":"status","timestamp":"2026-06-01T05:43:29.424Z"}}
      --- B5 stack ---
      {"ok":true,"data":{"stackFrames":[{"id":0,"name":"Window.calculate","line":2,"column":18,"source":{"name":"app.js","path":"/Users/roblou/code/dap-cli/tests/fixtures/simple-chrome-page/app.js","sourceReference":0},"presentationHint":"normal","canRestart":true},{"id":1,"name":"<anonymous>","line":1,"column":1,"source":{"name":"<eval>/VM46947590","path":"<eval>/VM46947590","sourceReference":46947590},"presentationHint":"normal","canRestart":true}],"totalFrames":2},"meta":{"command":"stack","timestamp":"2026-06-01T05:43:29.545Z"}}
      --- B5 continue ---
      {"ok":true,"data":{"allThreadsContinued":false},"meta":{"command":"continue","timestamp":"2026-06-01T05:43:29.665Z"}}
      {"ok":true,"data":{"type":"number","result":"5","variablesReference":0},"meta":{"command":"evaluate","timestamp":"2026-06-01T05:43:29.665Z","warnings":["evaluate: session not paused; sending evaluate without --frame-id (uses adapter REPL context)"]}}
      --- B6 close ---
      {"ok":true,"data":{"id":"sess_ou8KcjuQ5Y5SsgVC","name":"smoke-chrome","adapter":"js-debug","lifecycle":"running","status":"running","updatedAt":"2026-06-01T05:43:29.664Z","paused":false,"stderrTail":["(node:58024) [DEP0169] DeprecationWarning: `url.parse()` behavior is not standardized and prone to errors that have security implications. Use the WHATWG URL API instead. CVEs are not issued for `url.parse()` vulnerabilities.","(Use `node --trace-deprecation ...` to show where the warning was created)"],"cleanupActions":["Signal owned adapter pid 58024 if cleanup is required."],"logPath":"/Users/roblou/code/dap-cli/tmp/phase-22-uat/b-20260601/home/logs/js-debug-58024.log","orphanPids":[],"warnings":[]},"meta":{"command":"close","timestamp":"2026-06-01T05:43:31.868Z"}}
      --- B6 stop controller ---
      {"ok":true,"data":{"stopped":true},"meta":{"command":"stop-controller","timestamp":"2026-06-01T05:43:31.989Z"}}
      --- B7 orphan check ---
      no smoke profile orphans
      --- B result: pass ---
  - id: C
    description: Fresh-cache consent and lazy provisioning through the built CLI
    binary_under_test: "node dist/index.js"
    steps:
      - step: C1
        result: pass
        captured_output: |
          --- C preflight isolation ---
          DAP_CLI_HOME=/Users/roblou/code/dap-cli/tmp/phase-22-uat/c-20260601/home
          DAP_CLI_ADAPTERS_DIR=/Users/roblou/code/dap-cli/tmp/phase-22-uat/c-20260601/adapters
          DAP_CLI_ASSUME_YES=unset
          --- C1 prompt (stdout redirected to phase-local capture; prompt remains on stderr) ---

          Install vscode-js-debug 1.117.0 into /Users/roblou/code/dap-cli/tmp/phase-22-uat/c-20260601/adapters/js-debug (~10MB)?
            Source: https://github.com/microsoft/vscode-js-debug/releases/download/v1.117.0/js-debug-dap-v1.117.0.tar.gz
          Proceed? [y/N] y
      - step: C2
        result: pass
        captured_output: |
          --- C2 launch envelope after consent/install ---
          {"ok":true,"data":{"sessionId":"sess_2BGaQUYq6q5bVk7q","name":"default","lifecycle":"running","capabilities":{"supportsConfigurationDoneRequest":true,"supportsConditionalBreakpoints":true,"supportsHitConditionalBreakpoints":true,"supportsEvaluateForHovers":true,"supportsLoadedSourcesRequest":true,"supportsLogPoints":true}},"meta":{"command":"launch","timestamp":"2026-06-01T05:45:17.131Z"}}
          --- C2 installed runtime artifacts ---
          -rw-r--r--@ 1 roblou  staff      25 May 31 22:45 /Users/roblou/code/dap-cli/tmp/phase-22-uat/c-20260601/adapters/js-debug/.consent-1.117.0
          -rw-r--r--@ 1 roblou  staff      20 May 31 22:45 /Users/roblou/code/dap-cli/tmp/phase-22-uat/c-20260601/adapters/js-debug/package.json
          -rw-r--r--@ 1 roblou  staff  818088 Apr 17 15:22 /Users/roblou/code/dap-cli/tmp/phase-22-uat/c-20260601/adapters/js-debug/src/dapDebugServer.js
      - step: C3
        result: pass
        captured_output: |
          --- C3 paused installed session ---
          {"ok":true,"data":{"id":"sess_2BGaQUYq6q5bVk7q","name":"default","adapter":"js-debug","lifecycle":"running","status":"stopped","updatedAt":"2026-06-01T05:45:17.247Z","paused":true,"stoppedReason":"entry","stoppedThreadIds":[0],"stderrTail":[],"cleanupActions":["Signal owned adapter pid 62349 if cleanup is required."],"logPath":"/Users/roblou/code/dap-cli/tmp/phase-22-uat/c-20260601/home/logs/js-debug-62349.log"},"meta":{"command":"status","timestamp":"2026-06-01T05:45:18.299Z"}}
          {"ok":true,"data":{"id":"sess_2BGaQUYq6q5bVk7q","name":"default","adapter":"js-debug","lifecycle":"running","status":"stopped","updatedAt":"2026-06-01T05:45:17.247Z","paused":true,"stoppedReason":"entry","stoppedThreadIds":[0],"stderrTail":[],"cleanupActions":["Signal owned adapter pid 62349 if cleanup is required."],"logPath":"/Users/roblou/code/dap-cli/tmp/phase-22-uat/c-20260601/home/logs/js-debug-62349.log","orphanPids":[],"warnings":[]},"meta":{"command":"close","timestamp":"2026-06-01T05:45:20.503Z"}}
      - step: C4
        result: pass
        captured_output: |
          --- C4 warm cached launch: stderr must remain empty ---
          {"ok":true,"data":{"sessionId":"sess_2uizL783La7GbTOb","name":"default","lifecycle":"running"},"meta":{"command":"launch","timestamp":"2026-06-01T05:46:40.405Z"}}
          --- C4 stderr bytes ---
                 0 /Users/roblou/code/dap-cli/tmp/phase-22-uat/c-20260601/c4-launch.stderr
          {"ok":true,"data":{"id":"sess_2uizL783La7GbTOb","name":"default","adapter":"js-debug","lifecycle":"running","status":"stopped","updatedAt":"2026-06-01T05:46:40.520Z","paused":true,"stoppedReason":"entry","stoppedThreadIds":[0],"stderrTail":[],"cleanupActions":["Signal owned adapter pid 66988 if cleanup is required."],"logPath":"/Users/roblou/code/dap-cli/tmp/phase-22-uat/c-20260601/home/logs/js-debug-66988.log","orphanPids":[],"warnings":[]},"meta":{"command":"close","timestamp":"2026-06-01T05:46:42.621Z"}}
      - step: C5
        result: pass
        captured_output: |
          --- C5-R1 corrected evidence capture outside inspected adapters parent ---
          c5_r1_exit_code=2
          {"ok":false,"error":{"code":"provision_consent_required","category":"usage","message":"Confirmation required but stdin is not a TTY.","exitCode":2,"diagnostics":["Install vscode-js-debug 1.117.0 into /Users/roblou/code/dap-cli/tmp/phase-22-uat/c-20260601/adapters/js-debug (~10MB)?","Re-run with `--yes` / `-y` or set `DAP_CLI_ASSUME_YES=1` to pre-consent."],"data":{"question":"Install vscode-js-debug 1.117.0 into /Users/roblou/code/dap-cli/tmp/phase-22-uat/c-20260601/adapters/js-debug (~10MB)?"}},"meta":{"command":"launch /Users/roblou/code/dap-cli/tests/fixtures/ts-mocha-mini","timestamp":"2026-06-01T05:47:08.205Z"}}
          --- C5-R1 stderr ---
          --- C5-R1 adapter snapshot diff (expected empty or lock-only) ---
          --- C5-R1 result: pass ---
      - step: C6
        result: pass
        captured_output: |
          --- C6-R2 restart controller after prior teardown ---
          {"ok":true,"data":{"started":true,"reused":false,"pid":70161,"endpoint":{"kind":"ipc","path":"/Users/roblou/code/dap-cli/tmp/phase-22-uat/c-20260601/home/state/controller.sock"},"stateDir":"/Users/roblou/code/dap-cli/tmp/phase-22-uat/c-20260601/home/state","logDir":"/Users/roblou/code/dap-cli/tmp/phase-22-uat/c-20260601/home/logs","buildId":"0.2.0:dist:1780292517582.478:338774"},"meta":{"command":"start","timestamp":"2026-06-01T05:47:25.420Z"}}
          --- C6-R2 pre-consented reinstall: stderr must remain empty ---
          {"ok":true,"data":{"sessionId":"sess_ZUoCzWscvQjOGZ0J","name":"default","lifecycle":"running"},"meta":{"command":"launch","timestamp":"2026-06-01T05:47:25.669Z"}}
          --- C6-R2 stderr bytes ---
                 0 /tmp/dap-cli-phase22-c6-r2-67568/launch.stderr
          -rw-r--r--@ 1 roblou  staff      25 May 31 22:47 /Users/roblou/code/dap-cli/tmp/phase-22-uat/c-20260601/adapters/js-debug/.consent-1.117.0
          -rw-r--r--@ 1 roblou  staff  818088 Apr 17 15:22 /Users/roblou/code/dap-cli/tmp/phase-22-uat/c-20260601/adapters/js-debug/src/dapDebugServer.js
          {"ok":true,"data":{"id":"sess_ZUoCzWscvQjOGZ0J","name":"default","adapter":"js-debug","lifecycle":"running","status":"stopped","updatedAt":"2026-06-01T05:47:25.785Z","paused":true,"stoppedReason":"entry","stoppedThreadIds":[0],"stderrTail":[],"cleanupActions":["Signal owned adapter pid 70170 if cleanup is required."],"logPath":"/Users/roblou/code/dap-cli/tmp/phase-22-uat/c-20260601/home/logs/js-debug-70170.log"},"meta":{"command":"status","timestamp":"2026-06-01T05:47:26.841Z"}}
          {"ok":true,"data":{"id":"sess_ZUoCzWscvQjOGZ0J","name":"default","adapter":"js-debug","lifecycle":"running","status":"stopped","updatedAt":"2026-06-01T05:47:25.785Z","paused":true,"stoppedReason":"entry","stoppedThreadIds":[0],"stderrTail":[],"cleanupActions":["Signal owned adapter pid 70170 if cleanup is required."],"logPath":"/Users/roblou/code/dap-cli/tmp/phase-22-uat/c-20260601/home/logs/js-debug-70170.log","orphanPids":[],"warnings":[]},"meta":{"command":"close","timestamp":"2026-06-01T05:47:29.042Z"}}
          {"ok":true,"data":{"stopped":true},"meta":{"command":"stop-controller","timestamp":"2026-06-01T05:47:29.160Z"}}
          --- C6-R2 result: pass ---

## Smoke Issues Closed During Capture

- The first Sequence A run passed but emitted an oversized one-line event history that the terminal capture compacted; the recorded `A-R1` rerun used the same real CLI workflow with stopped-event-only output so the required terminal evidence is readable and complete.
- The first C5 evidence snapshot placed its capture files under the parent of the inspected adapter directory, changing `ls -la` metadata; `C5-R1` wrote captures outside that parent and produced an empty diff while preserving the same `provision_consent_required` result.
- The first attempt to restore C6 after `C5-R1` used a controller already stopped by the earlier successful C6 and exited `3`; `C6-R2` explicitly restarted the isolated controller and passed without a prompt.

## Final Result

result: pass
status: complete

Automated verification, transcript-audited Rust/CodeLLDB acceptance, and orchestrator-run terminal smoke all pass after closing the socket-path blocker discovered by the final gate. The remaining recorded CodeLLDB findings are nonblocking ergonomic follow-ups within the unchanged official-local-cache and `darwin_arm64` support boundary.
