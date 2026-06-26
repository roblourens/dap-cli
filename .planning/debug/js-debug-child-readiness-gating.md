---
gsd_debug_version: 1.0
slug: js-debug-child-readiness-gating
status: fixed
trigger: "A VS Code session using the launch skill could not debug a Code-OSS Electron renderer: dap-cli attach via js-debug pwa-chrome returned ok for the parent, but the page child session stayed in `attaching` and flipped to `failed` after exactly 30s, so breakpoints never bound."
created: 2026-06-26T16:00:00Z
updated: 2026-06-26T16:35:00Z
---

# Debug Session: js-debug-child-readiness-gating

## Symptoms

DATA_START
- expected_behavior: |
    Attaching js-debug pwa-chrome to a Code-OSS renderer (the Agents window page)
    should bring the page CHILD session to `running` so breakpoints set against it
    verify and bind.
- actual_behavior: |
    The parent (browser) session reports `running`, but the page child session sits
    in `attaching` and then flips to `failed` after exactly ~30.0s with
    `child session ... failed: DAP request timed out: attach`. Breakpoints never bind.
- error_messages: "DAP request timed out: attach"
- timeline: "Reported by a VS Code launch-skill session (session 6655bc60). Captured sessions.json showed createdAt→updatedAt delta of 30.005s on the child."
- reproduction: |
    Code-OSS renderer attach (heavy): launch the Agents window, dap-cli attach
    --adapter js-debug --type pwa-chrome to the renderer CDP port.
    Deterministic unit repro (added): tests/controller/childSessions.test.ts
    "readiness does not gate on launch/attach response".
DATA_END

## Root Cause

```yaml
root_cause: |
  ChildSessionCoordinator.runChildLifecycle awaited the child launch/attach
  RESPONSE after configurationDone before marking the child `running`/ready:

      const requestPromise = client.request(command, config);  // attach
      await runtime.initializedPromise;
      ...setBreakpoints...
      await client.request('configurationDone');
      await requestPromise;   // <-- gated readiness on the attach RESPONSE
      // mark running / resolveReady

  A js-debug pwa-chrome page session attaching to a Code-OSS Electron renderer
  acks `initialize`/`configurationDone` and emits `initialized`, but then
  auto-attaches the renderer's many `waitForDebuggerOnStart` web workers
  (TextMateWorker, editorWorkerService, ...) and wedges before answering the
  page session's `attach`. The child DapClient has a 30s requestTimeoutMs, so
  `await requestPromise` timed out, runChildLifecycle threw, and the child was
  marked `failed`.

  Proof the failure is the trailing attach response (not configurationDone or
  initialized): the only code path that can produce the captured string
  "DAP request timed out: attach" is the `await requestPromise` at the END of
  runChildLifecycle, which is reached ONLY after `initialized` fired AND
  `configurationDone` was acked. So js-debug had completed configuration; only
  the trailing attach response was withheld.
fix: |
  Gate child readiness on `configurationDone` (the DAP signal that the debuggee
  is configured and executing), NOT on the trailing launch/attach response.

  After configurationDone acks:
    - If the launch/attach response has ALREADY arrived as an explicit error
      (e.g. `attach refused`), that is authoritative -> fail the child
      (preserves existing behavior / the "attach failure marks child failed"
      test).
    - Otherwise mark the child `running`/ready immediately and observe the
      trailing launch/attach response in the BACKGROUND. A late timeout/error
      no longer fails the running child; it surfaces a non-fatal `output`
      warning on the parent ("... <command> response not received: ..."), so
      the condition stays debuggable. Transport-closed-on-teardown is ignored.
verification: |
  - Unit: new deterministic regression test reproduces the wedge (child silent
    on `attach`, acks configurationDone) and asserts the child reaches
    `running` + a trailing warning is emitted. It fails WITHOUT the fix
    (expected 'failed' to be 'running') and passes WITH it.
  - "attach failure marks child failed" test still passes (refusal semantics).
  - Full unit suite green except pre-existing unrelated failures
    (tests/bugreport/findings.test.ts) and a flaky selfHosting integration test
    that also fails on a clean tree under parallel load.
  - Hand-driven CLI smoke Sequences A and B pass (below).
files_changed:
  - src/controller/childSessions.ts
  - tests/controller/childSessions.test.ts
```

## Hand-Driven CLI Smoke

ran_at: 2026-06-26T16:34:00Z
binary_under_test: "node dist/index.js"
sequences:
  - id: A
    result: pass
    captured_output: |
      # launch (pwa-node, stop-on-entry)
      {"ok":true,"data":{"sessionId":"sess_hAblEvBLnX9gLOvO","name":"smoke-node","lifecycle":"running",...,"eventCursor":4}}
      # status at entry
      {"ok":true,"data":{...,"lifecycle":"running","status":"stopped","paused":true,"stoppedReason":"entry","stoppedThreadIds":[0],...}}
      # breakpoints set line 3
      {"ok":true,"data":{"breakpoints":[{"id":0,"verified":true,...,"line":3,"column":3}]}}
      # threads (resolved via child session smoke-node#63b9c1c37cfd651f305c5fdf)
      {"ok":true,"data":{"threads":[{"id":0,"name":"index.js [27781]","sessionName":"smoke-node#63b9c1c37cfd651f305c5fdf"}]}}
      # stack top frame
      {"ok":true,"data":{"stackFrames":[{"id":0,"name":"dapCliSelfHostDemo","line":2,"column":18,...}]}}
      # evaluate typeof dapCliSelfHostDemo
      {"ok":true,"data":{"type":"string","result":"'undefined'","variablesReference":0}}
      # continue
      {"ok":true,"data":{"allThreadsContinued":false}}
      # events: stopped reason entry then breakpoint
      "event":"stopped",...,"body":{"reason":"entry"...
      "event":"stopped",...,"body":{"reason":"breakpoint"...
      # status at breakpoint
      {paused: True, stoppedReason: 'breakpoint', stoppedThreadIds: [0], lifecycle: 'running'}
      # teardown
      close -> {"ok":true,...}
      stop-controller -> {"ok":true,"data":{"stopped":true}}
  - id: B
    result: pass
    captured_output: |
      # launch (pwa-chrome, headless, ?manual)
      {"ok":true,"data":{"sessionId":"sess_dy28enyQcGo3kB-9","name":"smoke-chrome","lifecycle":"running",...,"eventCursor":7}}
      # breakpoints set app.js line 2
      {"ok":true,"data":{"breakpoints":[{"id":0,"verified":true,"source":{"name":"app.js",...},"line":2,"column":18}]}}
      # sessions (parent only by default)
      {"ok":true,"data":[{"id":"sess_dy28enyQcGo3kB-9","name":"smoke-chrome",...,"lifecycle":"running"}]}
      # sessions --show-children: PAGE CHILD reaches lifecycle running (the previously-broken state)
      {"ok":true,"data":[{"id":"sess_dy28enyQcGo3kB-9","name":"smoke-chrome",...,"lifecycle":"running"},
        {"id":"sess_lguIlw5YMpOAZfgv","name":"smoke-chrome#0A2E9D1F46323A9AEECB6B7108B9856A","lifecycle":"running","status":"running","parent_session_id":"sess_dy28enyQcGo3kB-9","targetable":false}]}
      # drive bp via evaluate calculate(2,3); stopped event reason breakpoint
      "event":"stopped",...,"body":{"reason":"breakpoint"...
      # status at breakpoint
      {"ok":true,"data":{...,"paused":true,"stoppedReason":"breakpoint","stoppedThreadIds":[0],...}}
      # stack top frame
      "name":"Window.calculate","line":2,"column":18,"source":{"name":"app.js",...}
      # continue + evaluate result
      continue -> {"ok":true,"data":{"allThreadsContinued":false}}
      evaluate -> {"ok":true,"data":{"type":"number","result":"5","variablesReference":0}}
      # teardown + orphan check
      close -> {"ok":true,...,"orphanPids":[],"warnings":[]}
      stop-controller -> {"ok":true,"data":{"stopped":true}}
      pgrep -lf '/tmp/dap-cli-smoke-chrome' -> "no smoke profile orphans"

## Notes

The original `.planning/debug/pwa-chrome-attach-launch-bugs.md` covers the
ORIGINAL gap (no `startDebugging` reverse-request handling at all, fixed in
Phase 15 by introducing child-session multiplexing). This session fixes a
DOWNSTREAM bug in that same machinery: child readiness was over-gated on the
trailing launch/attach response.
