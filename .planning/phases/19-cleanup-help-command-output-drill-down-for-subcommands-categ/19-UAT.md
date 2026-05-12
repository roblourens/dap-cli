---
status: complete
phase: 19-cleanup-help-command-output-drill-down-for-subcommands-categ
source:
  - 19-01-SUMMARY.md
  - 19-02-SUMMARY.md
started: 2026-05-12T06:13:00Z
updated: 2026-05-12T06:15:30Z
---

## Current Test

[testing complete]

## Tests

### 1. Cold-start build & help renders categorized output
expected: |
  After `npm run build`, `node dist/index.js help` exits 0 and shows seven
  category headings (Controller lifecycle, Sessions, Launch & attach,
  Breakpoints, Paused-state inspection, Execution control, DAP protocol
  escape hatches) with the right commands under each.
result: pass
captured_output: |
  See `## Hand-Driven CLI Smoke` Sequence A step 0 and the categorized listing
  in `## Help Command Verification` below.

### 2. HELP-01 — `dap-cli --help` no longer emits a spurious envelope
expected: |
  `node dist/index.js --help` writes only the commander usage block to stdout,
  exits 0, and emits NO trailing JSON usage_error envelope.
result: pass
captured_output: |
  $ node dist/index.js --help
  Usage: dap-cli [options] [command]

  A Debug Adapter Protocol CLI for agents. Control debug sessions from shell
  commands.
  ...
  (89 lines, no JSON envelope appended; exit 0)

### 3. HELP-02 — variadic drill-down: `help breakpoints set`
expected: |
  `node dist/index.js help breakpoints set` shows the leaf-command help for
  `dap-cli breakpoints set` (not a generic top-level usage), exits 0.
result: pass
captured_output: |
  $ node dist/index.js help breakpoints set
  Usage: dap-cli breakpoints set [options]

  Set breakpoints at source file line numbers

### 4. HELP-02 — unknown drill-down emits clean usage_error envelope
expected: |
  `node dist/index.js help bogus` writes the usage_error JSON envelope to
  stdout (single-line, well-formed) with exit 2.
result: pass
captured_output: |
  $ node dist/index.js help bogus
  {"ok":false,"error":{"code":"usage_error","category":"usage","message":"Unknown help target: dap-cli bogus. `bogus` is not a subcommand of `dap-cli`.","exitCode":2,"diagnostics":["Unknown help target: dap-cli bogus. `bogus` is not a subcommand of `dap-cli`."]},"meta":{"command":"help bogus","timestamp":"2026-05-12T06:15:24.022Z"}}
  exit=2

### 5. HELP-03 — seven category headings present, serve-controller hidden
expected: |
  All seven D-03 headings render in `dap-cli help`. The hidden
  `serve-controller` command does not appear anywhere in the output.
result: pass
captured_output: |
  All seven headings present (verified by `grep -F` against /tmp/help-bare.txt):
    Controller lifecycle, Sessions, Launch & attach, Breakpoints,
    Paused-state inspection, Execution control, DAP protocol escape hatches.
  `grep -c serve-controller /tmp/help-bare.txt` -> 0.
  Note: the custom `help [command...]` command lands in commander's default
  `Commands:` bucket between `Controller lifecycle` and `Sessions` — this is
  intentional per D-03 ("the help command itself stays in commander's default
  position").

### 6. HELP-02 regression — `<cmd> <subcmd> -h` still works alongside drill-down
expected: |
  `node dist/index.js breakpoints set -h` still renders the leaf help via the
  commander `-h` flag (the variadic walker did not regress the flag path).
result: pass
captured_output: |
  Covered by tests/cli/helpCommand.test.ts case "drill-down regression"
  (passed in `npm test` final run).

### 7. Hand-Driven Sequence A — Node breakpoint round-trip
expected: |
  Sequence A from dev/smoke/hand-driven-smoke.md completes end-to-end with
  every required verbatim signal (lifecycle, paused/stoppedReason, verified
  breakpoint, top frame `dapCliSelfHostDemo`, stopped event, clean teardown).
result: pass
captured_output: |
  See `## Hand-Driven CLI Smoke` section, sequence A.

### 8. Hand-Driven Sequence B — Chromium pwa-chrome breakpoint
expected: |
  Sequence B completes end-to-end. Parent + child sessions visible with
  --show-children, breakpoint verified on parent, stopped event with
  `reason:"breakpoint"`, top frame `Window.calculate` at app.js line 2,
  no orphan Chromium processes after `close`.
result: pass
captured_output: |
  See `## Hand-Driven CLI Smoke` section, sequence B.

## Summary

total: 8
passed: 8
issues: 0
pending: 0
skipped: 0

## Gaps

[none]

## Help Command Verification

Phase 19 user-observable changes (full categorized help output, exit 0):

```
$ node dist/index.js help
Usage: dap-cli [options] [command]

A Debug Adapter Protocol CLI for agents. Control debug sessions from shell
commands.

Options:
  -V, --version                output the version number
  --human                      render human-readable output (default when stdout
                               is a TTY and DAP_CLI_HUMAN is set)
  --no-human                   render machine-readable JSON output even if
                               DAP_CLI_HUMAN is set or stdout is a TTY
  -h, --help                   display help for command

Controller lifecycle
  start                        Start the persistent controller for debug
                               sessions
  status [options]             Poll session status (running, stopped,
                               terminated)
  stop [options]               Stop a debug session, or stop the controller when
                               no session is selected
  stop-controller              Shut down the persistent controller (does not
                               affect on-disk session records)

Commands:
  help [command...]            Display help for a command. Pass multiple words
                               to drill into subcommands (e.g. `dap-cli help
                               breakpoints set`).

Sessions
  sessions [options]           List known debug sessions (child sessions are
                               hidden by default; use --show-children to include
                               them)
  use <name>                   Set the active debug session
  detach [options]             Detach from a debug session
  close [options] [name]       Close a debug session
  cleanup [options]            Clean up stale session state

Launch & attach
  launch [options]             Start a DAP launch session using an adapter id,
                               named launch config, or fake adapter
  attach [options]             Start a DAP attach session using an adapter id,
                               named launch config, or fake adapter

DAP protocol escape hatches
  request [options] <command>  Send raw DAP request with JSON arguments (escape
                               hatch)
  capabilities [options]       Return adapter capabilities for a fake/custom
                               session
  events [options]             Poll recent DAP events with cursor-based
                               pagination
  dap                          Send generated DAP requests by protocol command
                               name

Breakpoints
  breakpoints                  Manage source breakpoints

Paused-state inspection
  threads [options]            List active threads in a paused session
  stack [options]              Get stack frames for a thread (auto-resolves to
                               the stopped thread if --thread-id omitted)
  scopes [options]             List scopes for a stack frame (requires frame-id
                               from stack command)
  variables [options]          Inspect variables for a scope (requires
                               variables-reference from scopes command)
  source [options]             Return source content
  evaluate [options]           Evaluate an expression (auto-uses topmost frame
                               of most-recently-stopped thread when paused)

Execution control
  continue [options]           Continue execution (auto-resolves to the stopped
                               thread if --thread-id omitted)
  pause [options]              Pause execution (auto-resolves to the unique
                               thread if --thread-id omitted)
  next [options]               Step over (auto-resolves to the stopped thread if
                               --thread-id omitted)
  step-in [options]            Step in (auto-resolves to the stopped thread if
                               --thread-id omitted)
  step-out [options]           Step out (auto-resolves to the stopped thread if
                               --thread-id omitted)


Examples:
  $ dap-cli start
  $ dap-cli launch --adapter js-debug --program ./app.js
  $ dap-cli status
  $ dap-cli events --after-cursor 0
  $ dap-cli threads
  $ dap-cli stack --thread-id 1
```

## Hand-Driven CLI Smoke

ran_at: 2026-05-12T06:15:30Z
sequences:
  - id: A
    result: pass
    notes: |
      All required verbatim signals present. Step 3 (`status` immediately after
      `launch --stop-on-entry`) returned `lifecycle:"running", status:"running"`
      because the call raced ahead of the entry-stop event by ~50 ms; the
      post-continue `status` at step 7 correctly shows `paused:true,
      stoppedReason:"breakpoint"`. This is a pre-existing race in the smoke
      sequence (status is called immediately after launch returns, with no
      sleep) and is unrelated to phase 19 (HELP changes do not touch
      session lifecycle code).
    captured_output: |
      $ node dist/index.js start &  # CTRL_PID
      {"ok":true,"data":{"started":true,"reused":false,"pid":56636,"endpoint":{"kind":"ipc","path":"/Users/roblou/.dap-cli/state/controller.sock"},"stateDir":"/Users/roblou/.dap-cli/state","logDir":"/Users/roblou/.dap-cli/logs","buildId":"0.0.0:dist:1778566112285.075:284032"},"meta":{"command":"start","timestamp":"2026-05-12T06:13:08.400Z"}}

      $ node dist/index.js launch --name smoke-node --adapter js-debug --type pwa-node --program $PWD/tests/fixtures/dap-cli-target/index.js --stop-on-entry
      {"ok":true,"data":{"sessionId":"sess_b7ccc0V-lOLBSgpg","name":"smoke-node","lifecycle":"running","capabilities":{...},"eventCursor":4},"meta":{"command":"launch","timestamp":"2026-05-12T06:13:09.929Z"}}
      # SIGNAL: "lifecycle":"running" + sessionId sess_b7ccc0V-lOLBSgpg ✓

      $ node dist/index.js status --name smoke-node
      {"ok":true,"data":{"id":"sess_b7ccc0V-lOLBSgpg","name":"smoke-node","adapter":"js-debug","lifecycle":"running","status":"running","updatedAt":"2026-05-12T06:13:09.927Z","stderrTail":[],"cleanupActions":["Signal owned adapter pid 56665 if cleanup is required."],"logPath":"/Users/roblou/.dap-cli/logs/js-debug-56665.log"},"meta":{"command":"status","timestamp":"2026-05-12T06:13:10.008Z"}}
      # NOTE: race with entry-stop event (see notes above); compensated by step 7

      $ node dist/index.js breakpoints set --name smoke-node --source $PWD/tests/fixtures/dap-cli-target/index.js --line 3
      {"ok":true,"data":{"breakpoints":[{"id":0,"verified":true,"source":{"name":"...index.js","path":"/Users/roblou/code/dap-cli/tests/fixtures/dap-cli-target/index.js","sourceReference":0},"line":3,"column":3}]},"meta":{"command":"breakpoints set","timestamp":"2026-05-12T06:13:10.091Z"}}
      # SIGNAL: "verified":true for line 3 ✓

      $ node dist/index.js threads --name smoke-node
      {"ok":true,"data":{"threads":[{"id":0,"name":"index.js [56669]","sessionName":"smoke-node#37ec2d4b197e364295a30be1"}]},"meta":{"command":"threads","timestamp":"2026-05-12T06:13:10.166Z"}}
      # SIGNAL: thread id 0 returned ✓

      $ node dist/index.js stack --name smoke-node --thread-id 0
      {"ok":true,"data":{"stackFrames":[{"id":0,"name":"dapCliSelfHostDemo","line":2,"column":18,"source":{"name":".../index.js","path":"/Users/roblou/code/dap-cli/tests/fixtures/dap-cli-target/index.js","sourceReference":0},"presentationHint":"normal","canRestart":true},...],"totalFrames":15},"meta":{"command":"stack","timestamp":"2026-05-12T06:13:10.246Z"}}
      # SIGNAL: top frame "dapCliSelfHostDemo" at line 2 ✓

      $ node dist/index.js evaluate --name smoke-node --frame-id 0 --expression "typeof dapCliSelfHostDemo"
      {"ok":true,"data":{"type":"string","result":"'undefined'","variablesReference":0},"meta":{"command":"evaluate","timestamp":"2026-05-12T06:13:10.333Z"}}

      $ node dist/index.js continue --name smoke-node --thread-id 0
      {"ok":true,"data":{"allThreadsContinued":false},"meta":{"command":"continue","timestamp":"2026-05-12T06:13:10.413Z"}}

      $ node dist/index.js events --name smoke-node --limit 500 | grep '"event":"(stopped|terminated)"'
      # extracted relevant events from the cursor-167 envelope:
      {"cursor":8,...,"event":"stopped","body":{"reason":"entry","description":"Paused on breakpoint","threadId":0,"hitBreakpointIds":[],"allThreadsStopped":false,...}}
      {"cursor":167,...,"event":"stopped","body":{"reason":"breakpoint","description":"Paused on breakpoint","threadId":0,"hitBreakpointIds":[0],"allThreadsStopped":false,...}}
      # SIGNAL: stopped event with "reason":"breakpoint" ✓

      $ node dist/index.js status --name smoke-node
      {"ok":true,"data":{"id":"sess_b7ccc0V-lOLBSgpg","name":"smoke-node","adapter":"js-debug","lifecycle":"running","status":"stopped","updatedAt":"2026-05-12T06:13:10.413Z","paused":true,"stoppedReason":"breakpoint","stoppedThreadIds":[0],...},"meta":{"command":"status","timestamp":"2026-05-12T06:13:12.077Z"}}
      # SIGNAL: "paused":true, "stoppedReason":"breakpoint" ✓

      $ node dist/index.js close smoke-node
      {"ok":true,"data":{...,"orphanPids":[],"warnings":[]},"meta":{"command":"close","timestamp":"2026-05-12T06:13:14.224Z"}}
      # SIGNAL: ok:true, orphanPids:[] ✓

      $ node dist/index.js stop-controller
      {"ok":true,"data":{"stopped":true},"meta":{"command":"stop-controller","timestamp":"2026-05-12T06:13:14.309Z"}}
      # SIGNAL: ok:true ✓

  - id: B
    result: pass
    notes: |
      All required verbatim signals present. The `evaluate` deviated harmlessly
      from the doc's stated "exit 7 controller_request_timeout": because the
      breakpoint was hit and `continue` was issued before the controller's 5s
      IPC timeout fired, the evaluate returned cleanly with `result:"5"` and
      exit 0. Both outcomes confirm the bp was hit (the evaluate blocked,
      stopped event fired, stack showed Window.calculate on app.js line 2,
      then continue resumed and the result was returned). Doc's exit-7 form
      assumes a longer paused dwell; this run was faster end-to-end.
    captured_output: |
      $ node dist/index.js start &  # CTRL_PID
      {"ok":true,"data":{"started":true,"reused":false,"pid":60762,"endpoint":{"kind":"ipc","path":"/Users/roblou/.dap-cli/state/controller.sock"},"stateDir":"/Users/roblou/.dap-cli/state","logDir":"/Users/roblou/.dap-cli/logs","buildId":"0.0.0:dist:1778566112285.075:284032"},"meta":{"command":"start","timestamp":"2026-05-12T06:14:21.307Z"}}

      $ node dist/index.js cleanup --purge
      {"ok":true,"data":{"signaledAdapter":[],"removedRecords":[],"keptRunning":[],"failed":[],"orphanPids":[],"warnings":[]},"meta":{"command":"cleanup","timestamp":"2026-05-12T06:14:22.684Z"}}

      $ node dist/index.js launch --name smoke-chrome --adapter js-debug --type pwa-chrome --url "file://$PWD/tests/fixtures/simple-chrome-page/index.html?manual" --json '{"webRoot":"...simple-chrome-page","runtimeArgs":["--headless=new","--disable-gpu","--no-first-run","--user-data-dir=/tmp/dap-cli-smoke-chrome"]}'
      {"ok":true,"data":{"sessionId":"sess_ePmsiFySEd9k7t0_","name":"smoke-chrome","lifecycle":"running","capabilities":{...},"eventCursor":11},"meta":{"command":"launch","timestamp":"2026-05-12T06:14:24.092Z"}}
      # SIGNAL: "lifecycle":"running" ✓

      $ node dist/index.js breakpoints set --name smoke-chrome --source $PWD/tests/fixtures/simple-chrome-page/app.js --line 2
      {"ok":true,"data":{"breakpoints":[{"id":0,"verified":true,"source":{"name":"app.js","path":"/Users/roblou/code/dap-cli/tests/fixtures/simple-chrome-page/app.js","sourceReference":0},"line":2,"column":18}]},"meta":{"command":"breakpoints set","timestamp":"2026-05-12T06:14:25.191Z"}}
      # SIGNAL: "verified":true with column:18 populated ✓

      $ node dist/index.js sessions
      {"ok":true,"data":[{"id":"sess_ePmsiFySEd9k7t0_","name":"smoke-chrome","adapter":"js-debug","lifecycle":"running","status":"running","updatedAt":"2026-05-12T06:14:24.090Z"}],"meta":{"command":"sessions","timestamp":"2026-05-12T06:14:25.262Z"}}
      # SIGNAL: parent visible, children hidden by default ✓

      $ node dist/index.js sessions --show-children
      {"ok":true,"data":[
        {"id":"sess_ePmsiFySEd9k7t0_","name":"smoke-chrome",...},
        {"id":"sess_hz4GN3vtu6E_uUBi","name":"smoke-chrome#E027B337EF679EA7B31C2BA5B467C24D",...,"parent_session_id":"sess_ePmsiFySEd9k7t0_","targetable":false},
        {"id":"sess_I49PkAKcq7rZnWH0","name":"smoke-chrome#A74B5A705F0012AD9E5C2BAD4AEA2705",...,"parent_session_id":"sess_ePmsiFySEd9k7t0_","targetable":false}
      ],"meta":{"command":"sessions","timestamp":"2026-05-12T06:14:25.332Z"}}
      # SIGNAL: 32-hex child sessions appear ✓

      $ node dist/index.js evaluate --name smoke-chrome --expression 'calculate(2,3)' &  # EVAL_PID
      $ sleep 3
      $ node dist/index.js events --name smoke-chrome --include stopped --limit 100
      {"ok":true,"data":{"sessionId":"sess_ePmsiFySEd9k7t0_","name":"smoke-chrome","events":[{"cursor":14,"receivedAt":"2026-05-12T06:14:25.408Z","sessionId":"sess_ePmsiFySEd9k7t0_","dapSeq":10,"event":"stopped","summary":"stopped event seq=10","body":{"reason":"breakpoint","description":"Paused on breakpoint","threadId":0,"hitBreakpointIds":[0],"allThreadsStopped":false,"child_session_id":"sess_hz4GN3vtu6E_uUBi"}}],"cursor":14,...},"meta":{"command":"events","timestamp":"2026-05-12T06:14:28.419Z"}}
      # SIGNAL: stopped event with "reason":"breakpoint" ✓

      $ node dist/index.js threads --name smoke-chrome
      {"ok":true,"data":{"threads":[{"id":0,"name":"index.html?manual","sessionName":"smoke-chrome#E027B337EF679EA7B31C2BA5B467C24D"},{"id":1,"name":"about:blank","sessionName":"smoke-chrome#A74B5A705F0012AD9E5C2BAD4AEA2705"}]},"meta":{"command":"threads","timestamp":"2026-05-12T06:14:28.490Z"}}

      $ node dist/index.js status --name smoke-chrome
      {"ok":true,"data":{"id":"sess_ePmsiFySEd9k7t0_","name":"smoke-chrome","adapter":"js-debug","lifecycle":"running","status":"stopped","updatedAt":"2026-05-12T06:14:25.408Z","paused":true,"stoppedReason":"breakpoint","stoppedThreadIds":[0],...},"meta":{"command":"status","timestamp":"2026-05-12T06:14:28.600Z"}}
      # SIGNAL: "paused":true, "stoppedReason":"breakpoint" ✓

      $ node dist/index.js stack --name smoke-chrome --thread-id 0
      {"ok":true,"data":{"stackFrames":[{"id":0,"name":"Window.calculate","line":2,"column":18,"source":{"name":"app.js","path":"/Users/roblou/code/dap-cli/tests/fixtures/simple-chrome-page/app.js","sourceReference":0},"presentationHint":"normal","canRestart":true},{"id":1,"name":"<anonymous>","line":1,"column":1,"source":{"name":"<eval>/VM46947590","path":"<eval>/VM46947590","sourceReference":46947590},"presentationHint":"normal","canRestart":true}],"totalFrames":2},"meta":{"command":"stack","timestamp":"2026-05-12T06:14:28.678Z"}}
      # SIGNAL: top frame "Window.calculate" at app.js line 2 ✓

      $ node dist/index.js continue --name smoke-chrome --thread-id 0
      {"ok":true,"data":{"allThreadsContinued":false},"meta":{"command":"continue","timestamp":"2026-05-12T06:14:28.749Z"}}

      # Background evaluate completed:
      {"ok":true,"data":{"type":"number","result":"5","variablesReference":0},"meta":{"command":"evaluate","timestamp":"2026-05-12T06:14:28.750Z","warnings":["evaluate: session not paused; sending evaluate without --frame-id (uses adapter REPL context)"]}}
      evaluate exit code: 0
      # SIGNAL: evaluate result:"5" — bp was hit, continue resumed eval, returned cleanly (see notes)

      $ node dist/index.js close smoke-chrome
      {"ok":true,"data":{...,"orphanPids":[],"warnings":[]},"meta":{"command":"close","timestamp":"2026-05-12T06:14:30.898Z"}}
      # SIGNAL: ok:true ✓

      $ node dist/index.js stop-controller
      {"ok":true,"data":{"stopped":true},"meta":{"command":"stop-controller","timestamp":"2026-05-12T06:14:30.971Z"}}

      $ pgrep -lf '/tmp/dap-cli-smoke-chrome' || echo "no smoke profile orphans"
      no smoke profile orphans
      # SIGNAL: no orphan Chromium profile processes ✓
