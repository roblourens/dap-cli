---
status: complete
phase: 09-infer-adapter-type-from-program-file-extension
source:
  - 09-01-SUMMARY.md
started: 2026-05-09T16:25:00Z
updated: 2026-05-09T16:28:00Z
---

## Current Test

[testing complete]

## Tests

### 1. Inferred Node launch (`--program app.js` only)
expected: |
  Inferred js-debug + pwa-node from .js extension. Launch returns lifecycle=running;
  paused at entry; capabilities reports adapterId=js-debug.
result: pass
captured_output: |
  $ node dist/index.js launch --program "$PWD/tests/fixtures/dap-cli-target/index.js" --stop-on-entry --name infer-node
  {"ok":true,"data":{"sessionId":"sess_uqF5OE9HQbtlz8eb","name":"infer-node","lifecycle":"running",...},"meta":{"command":"launch",...}}
  $ node dist/index.js status --name infer-node
  {"ok":true,"data":{"id":"sess_uqF5OE9HQbtlz8eb","name":"infer-node","adapter":"js-debug","lifecycle":"running",...}}
  $ node dist/index.js capabilities --name infer-node
  {"ok":true,"data":{"sessionId":"sess_uqF5OE9HQbtlz8eb","name":"infer-node","adapterId":"js-debug",...}}
  $ node dist/index.js close infer-node
  {"ok":true,"data":{...,"adapter":"js-debug",...,"paused":true,"stoppedReason":"entry","stoppedThreadIds":[0],...}}

### 2. Inferred Python launch (`--program app.py` only)
expected: |
  Inferred debugpy + python from .py extension. paused=true; adapterId=debugpy.
result: pass
captured_output: |
  $ node dist/index.js launch --program /tmp/d9-py.py --stop-on-entry --name infer-py --python ~/.dap-cli/venv/bin/python
  {"ok":true,"data":{"sessionId":"sess_23HPbZwFQKJFSA4s","name":"infer-py","lifecycle":"running",...}}
  $ node dist/index.js status --name infer-py
  {"ok":true,"data":{"id":"sess_23HPbZwFQKJFSA4s","name":"infer-py","adapter":"debugpy","lifecycle":"stopped","status":"stopped",...,"paused":true,"stoppedReason":"entry",...}}
  $ node dist/index.js capabilities --name infer-py
  adapterId: debugpy

### 3. Type-only inference (`--type node --program app.js`, no --adapter)
expected: |
  Resolves adapter to js-debug via launchConfigTypeMap; capabilities reports adapterId=js-debug.
result: pass
captured_output: |
  $ node dist/index.js launch --type node --program "$TARGET" --stop-on-entry --name typeonly
  ok: True lifecycle: running
  $ node dist/index.js capabilities --name typeonly
  adapterId: js-debug

### 4. Adapter-only inference for HTML
expected: |
  defaultTypeForAdapter('js-debug', '*.html') -> 'pwa-chrome'.
result: pass
captured_output: |
  Verified by tests/config/programInference.test.ts cases:
    "adapter-only js-debug with .html program defaults type to pwa-chrome"
    "adapter-only js-debug with .htm program defaults type to pwa-chrome"
  $ npx vitest run tests/config/programInference.test.ts
  ✓ tests/config/programInference.test.ts (20 tests) 4ms

### 5. Unsupported extension fails with `adapter_inference_failed`
expected: |
  Exit 2 with envelope code: adapter_inference_failed, data.extension: '.unknown'.
result: pass
captured_output: |
  $ node dist/index.js launch --program /tmp/foo.unknown --name infer-fail
  {"ok":false,"error":{"code":"adapter_inference_failed","category":"usage","message":"Cannot infer adapter from program extension '.unknown'. Pass --adapter or --type explicitly.","exitCode":2,"diagnostics":["No adapter mapping is configured for program extension '.unknown'.","Pass --adapter or --type explicitly."],"data":{"program":"/tmp/foo.unknown","extension":".unknown"}},"meta":{"command":"launch /tmp/foo.unknown",...}}

  $ node dist/index.js launch --program /tmp/run --name no-ext
  {"ok":false,"error":{"code":"adapter_inference_failed",...,"data":{"program":"/tmp/run","extension":""}},...}

### 6. All-absent defaults to `fake` adapter
expected: |
  Lifecycle stopped; capabilities reports adapterId=fake.
result: pass
captured_output: |
  $ node dist/index.js launch --name allabsent
  ok: True lifecycle: stopped
  $ node dist/index.js capabilities --name allabsent
  adapterId: fake

### 7. Explicit `--adapter` AND `--type` still win (no inference)
expected: |
  Legacy explicit form continues to succeed end-to-end. Verified inline AND by Sequence A below.
result: pass
captured_output: |
  $ node dist/index.js launch --adapter js-debug --type pwa-node --program "$TARGET" --stop-on-entry --name explicit-regr
  ok: True lifecycle: running
  $ node dist/index.js capabilities --name explicit-regr
  adapterId: js-debug

### 8. Help text reflects new optional/inferred semantics
expected: |
  --adapter and --type help text mentions inference on both launch and attach.
result: pass
captured_output: |
  $ node dist/index.js launch --help | grep -E "^\s*--(adapter|type)\s"
    --adapter <adapter>          adapter id (inferred from --type or --program
    --type <type>                adapter-native debug type (inferred from
                                 --adapter or --program when omitted)
  $ node dist/index.js attach --help | grep -E "^\s*--(adapter|type)\s"
    --adapter <adapter>          adapter id (inferred from --type or --program
    --type <type>                adapter-native debug type (inferred from
                                 --adapter or --program when omitted)

## Summary

total: 8
passed: 8
issues: 0
pending: 0
skipped: 0

## Gaps

[none]

## Hand-Driven CLI Smoke

ran_at: 2026-05-09T16:28:00Z
sequences:
  - id: A
    result: pass
    captured_output: |
      === Sequence A ===
      $ node dist/index.js start
      {"ok":true,"data":{"started":true,"reused":false,"pid":93410,...,"buildId":"0.0.0:dist:1778343883604.6777:242624"},...}

      --- 2 launch ---
      ok: True sid: sess_MBD05X-_PuRwpPCt lc: running
      [signal: lifecycle="running" + sess_… returned per spec]

      --- 3 status (immediately after launch) ---
      paused: None reason: None
      [Note: known timing race — status raced ahead of the stopped event by ~70ms.
       Re-ran with sleep 1 between launch and status:
         --- status after sleep 1 ---
         paused: True reason: entry
       Confirmed entry-stop propagates per spec; race is in the smoke script
       sequencing, not a phase-9 regression. Step 7 (after the breakpoint round-trip)
       reports paused:True reason:breakpoint correctly without any sleep.]

      --- 4 bp set ---
      verified: True
      [signal: verified=true on line 3 per spec]

      --- 5 threads ---
      [{'id': 0, 'name': 'index.js [93445]', 'sessionName': 'smoke-node#f11c4313076743 57f088b96c'}]
      --- 5 stack ---
      name: dapCliSelfHostDemo line: 2
      [signal: top frame name dapCliSelfHostDemo at line 2 per spec]
      --- 5 evaluate ---
      result: 'undefined'
      [Note: optional per spec — "the stack frame is the required signal"]

      --- 6 continue + events ---
      "event":"stopped","summary":"stopped event seq=171","body":{"reason":"breakpoint","description":"Paused on breakpoint","threadId":0,"hitBreakpointIds":[0],...}
      [signal: stopped event with reason="breakpoint" appears within ~1s per spec]

      --- 7 status ---
      paused: True reason: breakpoint
      [signal: paused=true with stoppedReason=breakpoint per spec]

      --- 8 teardown ---
      ok: True (close)
      ok: True stopped: True (stop-controller)
      [signal: close ok=true; stop-controller clean per spec]

  - id: B
    result: pass
    captured_output: |
      === Sequence B ===
      $ node dist/index.js start
      {"ok":true,"data":{"started":true,"reused":false,"pid":98190,...}}

      --- 2 launch (Chromium under js-debug) ---
      ok: True lc: running
      [signal: lifecycle="running" returned from launch per spec]

      --- 3 bp set ---
      verified: True
      [signal: verified=true on parent per spec]

      --- 4 sessions (default) ---
      ['smoke-chrome']
      --- 4 sessions --show-children ---
      ['smoke-chrome', 'smoke-chrome#D07F8D3CF1444C63EB79B4AF6433C778', 'smoke-chrome#A85AFCD70B4109CA6D5ACF00A4C11BC9']
      [signal: parent visible by default; --show-children reveals 32-hex child rows per spec]

      --- 5 evaluate (background) + observe ---
      events:
      "event":"stopped","summary":"stopped event seq=10","body":{"reason":"breakpoint"
      status:
      paused: True reason: breakpoint
      stack top frame:
      ('Window.calculate', 2)
      [signals: stopped event with reason="breakpoint" within ~3s; status paused=true
       with stoppedReason=breakpoint; stack top frame Window.calculate at line 2 per spec]

      --- 6 close ---
      ok: True
      [signal: close ok=true per spec]

      --- 7 orphans ---
      no smoke profile orphans
      [signal: pgrep returns no /tmp/dap-cli-smoke-chrome processes per spec]
