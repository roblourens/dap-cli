---
status: complete
phase: 10-auto-route-launch-attach-by-config-request-field-add-json-ov
source:
  - .planning/phases/10-auto-route-launch-attach-by-config-request-field-add-json-ov/10-01-PLAN.md
  - .planning/phases/10-auto-route-launch-attach-by-config-request-field-add-json-ov/10-02-PLAN.md
  - .planning/phases/10-auto-route-launch-attach-by-config-request-field-add-json-ov/10-03-PLAN.md
ran_at: 2026-05-09T18:34:00Z
---

# Phase 10 UAT — Auto-route launch/attach + json-overrides + resolve-source-maps + helper-process detection

Phase 10 introduced no new top-level CLI verbs that Sequence A/B exercise directly
(autorouting fires only on `--config`, helper-process detection only on attach
sessions whose adapter spawns helpers), but the smoke confirms the published
binary still launches/attaches/closes cleanly with the new dispatch logic in
place. New behavior is unit-tested and was verified end-to-end in
[10-01-SUMMARY.md](10-01-SUMMARY.md), [10-02-SUMMARY.md](10-02-SUMMARY.md), and
[10-03-SUMMARY.md](10-03-SUMMARY.md).

## Hand-Driven CLI Smoke

ran_at: 2026-05-09T18:34:00Z
sequences:
  - id: A
    result: pass
    captured_output_file: tmp/phases-10-14-smoke-A.log
  - id: B
    result: pass
    captured_output_file: tmp/phases-10-14-smoke-B.log

Sequence A signals (Node, `node dist/index.js`):

- step 2 launch → `"lifecycle":"running"`, `"sessionId":"sess_zbAC1OaUt0lj99QX"`
- step 4 set bp → `"verified":true` for `index.js` line 3
- step 6 events → `stopped` event with `"reason":"breakpoint"` and `"hitBreakpointIds":[0]`
- step 7 status → `"paused":true,"stoppedReason":"breakpoint","stoppedThreadIds":[0]`
- step 8 close → `ok:true`; stop-controller → `{"stopped":true}`

Sequence B signals (Chromium under js-debug, `--user-data-dir=/tmp/dap-cli-smoke-chrome`):

- step 2 launch → `"lifecycle":"running"`, child session `sess__yDmhJesERyZnqCn` (32-hex CDP id) appears
- step 3 set bp → `"verified":true` on parent for `app.js` line 2 with `"column":18` populated
- step 5 events → `stopped` event `"reason":"breakpoint"`, `"hitBreakpointIds":[0]`
- step 5 status → `"paused":true,"stoppedReason":"breakpoint"`
- step 5 stack → top frame `Window.calculate` at app.js:2
- step 5 evaluate → `{"type":"number","result":"5"}` (BP held the eval; resolved after continue)
- step 7 → `no smoke profile orphans`

No regressions from phase 10's autoroute / merge-precedence / helper-pid wiring.
