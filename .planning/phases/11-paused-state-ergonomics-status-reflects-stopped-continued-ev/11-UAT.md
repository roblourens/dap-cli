---
status: complete
phase: 11-paused-state-ergonomics-status-reflects-stopped-continued-ev
source:
  - .planning/phases/11-paused-state-ergonomics-status-reflects-stopped-continued-ev/11-01-PLAN.md
  - .planning/phases/11-paused-state-ergonomics-status-reflects-stopped-continued-ev/11-02-PLAN.md
ran_at: 2026-05-09T18:34:00Z
---

# Phase 11 UAT — Paused-state ergonomics

PAUSED-01 (status mirrors child stopped events) and PAUSED-02 (`evaluate`
auto-resolves `--frame-id` from session status / emits hint when not paused)
both observable in the hand-driven smoke against the published binary.

## Hand-Driven CLI Smoke

ran_at: 2026-05-09T18:34:00Z
sequences:
  - id: A
    result: pass
    captured_output_file: tmp/phases-10-14-smoke-A.log
  - id: B
    result: pass
    captured_output_file: tmp/phases-10-14-smoke-B.log

PAUSED-01 (status reflects mirrored child paused state):

Sequence A step 7, after `continue` released entry stop and the bp on line 3 fired:

```
{"ok":true,"data":{"id":"sess_zbAC1OaUt0lj99QX","name":"smoke-node",
"adapter":"js-debug","lifecycle":"running","status":"stopped",
"paused":true,"stoppedReason":"breakpoint","stoppedThreadIds":[0],...}}
```

Sequence B step 5, after the page child hit `app.js:2`:

```
{"ok":true,"data":{"id":"sess_-v2BujMuJb6jMwZN","name":"smoke-chrome",
"adapter":"js-debug","lifecycle":"running","status":"stopped",
"paused":true,"stoppedReason":"breakpoint","stoppedThreadIds":[0],...}}
```

Both confirm the parent `status` projection now carries `paused:true` and
`stoppedReason:"breakpoint"` even though only the child session emitted the DAP
`stopped` event — pre-phase-11 behavior was `lifecycle:"running"` with no
`paused` field.

PAUSED-02 (`evaluate` auto-resolves `--frame-id` from session status):

Sequence A step 5c — `evaluate --expression "typeof dapCliSelfHostDemo"` invoked
without `--frame-id` while session was paused at entry returned a clean DAP
result:

```
{"ok":true,"data":{"type":"string","result":"'undefined'","variablesReference":0},...}
```

Sequence B step 5 — `evaluate --expression 'calculate(2,3)'` invoked while the
session was still in `lifecycle:"running"` (BP not yet hit) emitted the new
hint to stderr and proceeded against the adapter REPL context:

```
evaluate: session not paused; sending evaluate without --frame-id (uses adapter REPL context)
```

Both confirm the new auto-frame resolution + paused-state diagnostic from
[11-02-SUMMARY.md](11-02-SUMMARY.md). No regressions.
