---
phase: 05-stabilize-real-chrome-js-debug-playwright-same-browser-hando
plan: 22
subsystem: controller, docs, integration-smoke
tags: [gap-closure, hand-driven, pwa-chrome, breakpoint, H-6]
gap_closure: true
requires: [17, 18, 21]
provides:
  - h6_trace_diagnosis
  - controller_driven_pwa_chrome_regression_guard
  - hand_driven_sequence_b_doc_fix
affects:
  - docs/HAND-DRIVEN-SMOKE.md
  - tests/integration/jsDebugAdapter.test.ts
  - .planning/phases/05-stabilize-real-chrome-js-debug-playwright-same-browser-hando/05-UAT.md
tech-stack:
  added: []
patterns:
  - "Diagnose pwa-chrome breakpoint failures with js-debug trace evidence before changing controller code."
  - "Use `?manual` plus an explicit `dap-cli evaluate` trigger in hand-driven browser smoke so breakpoint setup does not race a page's auto-run path."
  - "Guard hand-driven browser breakpoint behavior with a controller-driven integration test that exercises the published CLI surface."
key-files:
  created:
    - .planning/phases/05-stabilize-real-chrome-js-debug-playwright-same-browser-hando/05-22-trace/diagnosis.md
    - .planning/phases/05-stabilize-real-chrome-js-debug-playwright-same-browser-hando/05-22-trace/cli-transcript.txt
    - .planning/phases/05-stabilize-real-chrome-js-debug-playwright-same-browser-hando/05-22-trace/cli-transcript-2.txt
    - .planning/phases/05-stabilize-real-chrome-js-debug-playwright-same-browser-hando/05-22-trace/jsdebug-trace.txt
    - .planning/phases/05-stabilize-real-chrome-js-debug-playwright-same-browser-hando/05-22-SUMMARY.md
  modified:
    - docs/HAND-DRIVEN-SMOKE.md
    - tests/integration/jsDebugAdapter.test.ts
    - .planning/phases/05-stabilize-real-chrome-js-debug-playwright-same-browser-hando/deferred-items.md
    - .planning/phases/05-stabilize-real-chrome-js-debug-playwright-same-browser-hando/05-UAT.md
decisions:
  - "No production controller fix was needed in plan 05-22. Trace evidence showed H-6 was already closed by the composition of earlier fixes: 05-18's two-ring event cache, 05-25's child-to-parent paused projection, and 05-26's parent-name thread routing."
  - "Neither planned candidate root cause matched the trace: the page child accepted the absolute `source.path` and returned `verified:true`, and no child `webRoot` propagation change was needed."
  - "The hand-driven Sequence B blocker was partly a documentation race: loading `index.html` without `?manual` let the page call `calculate(2,3)` before the user could set the breakpoint. The docs now use `?manual` and an explicit evaluate trigger."
  - "The regression guard belongs in the controller-driven CLI integration path, not in `runJsDebugBreakpointSmoke`, because the original gap was about the published controller path."
metrics:
  duration_minutes: ~20
  completed_date: 2026-05-04
---

# Phase 05 Plan 22: H-6 pwa-chrome breakpoint stop closure Summary

Closes hand-driven gap H-6 from [05-UAT.md](05-UAT.md): Sequence B originally set a verified pwa-chrome breakpoint but did not produce a user-visible breakpoint stop through the published CLI flow. Plan 05-22 reproduced the flow with js-debug trace logging, proved the blocker was already closed by earlier gap fixes, corrected the hand-driven smoke race, and added a regression guard that exercises the controller-driven CLI path.

## What changed

### Task 1 — Trace diagnosis (commit `7cdc13c`)

- Captured hand-driven Sequence B transcripts and js-debug trace logs under [05-22-trace/](05-22-trace/).
- Wrote [05-22-trace/diagnosis.md](05-22-trace/diagnosis.md), which records the key finding: H-6 was already closed end-to-end through the published controller path.
- The trace showed the parent and page child both receiving `setBreakpoints`, with the child returning `verified:true` and later emitting `stopped` with `reason:"breakpoint"`.

Key trace signals:

```text
conn=0 dap.recv setBreakpoints app.js line 2
conn=0 dap.send breakpoints[0].verified=false "Unbound breakpoint"
conn=1 dap.recv setBreakpoints app.js line 2
conn=1 dap.send breakpoints[0].verified=true line=2 column=18
conn=1 dap.send event stopped reason=breakpoint hitBreakpointIds=[0]
```

### Task 2 — Sequence B smoke doc correction (commit `2843a3e`)

- Updated [docs/HAND-DRIVEN-SMOKE.md](../../../docs/HAND-DRIVEN-SMOKE.md) so browser Sequence B launches `index.html?manual` instead of letting the fixture auto-run before the breakpoint can be set.
- Changed the trigger to an explicit `dap-cli evaluate --expression 'calculate(2,3)'` path, making the smoke self-contained and tied to the same js-debug-controlled Chromium instance.
- Documented the expected `controller_request_timeout` from the backgrounded evaluate call while the page is paused at the breakpoint.

### Task 3 — Published-controller regression guard (commit `aaa645f`)

- Added a gated pwa-chrome integration test in [tests/integration/jsDebugAdapter.test.ts](../../../tests/integration/jsDebugAdapter.test.ts) that drives the published CLI/controller path and observes a stopped breakpoint event.
- The test guards the behavior that mattered for H-6: parent-name breakpoint setup, event polling, thread/stack inspection, and teardown through the same controller IPC path a hand-driven user exercises.
- Logged the residual H-7b follow-up in [deferred-items.md](deferred-items.md) rather than widening the paused-state gate in this plan.

## Verification

- Hand-driven Sequence B closure was recorded in [05-UAT.md](05-UAT.md) under `Hand-Driven CLI Smoke (Wave 3+4 closure verify — H-6 + H-8)`.
- The H-6 transcript shows:
  - `breakpoints set --name smoke-chrome --source .../app.js --line 2` returns `verified:true` with `line:2` and `column:18`.
  - `events --name smoke-chrome --include stopped` returns one `stopped` event with `reason:'breakpoint'`, `threadId:0`, and `hitBreakpointIds:[0]`.
  - `status --name smoke-chrome` reports `paused:true` and `stoppedReason:'breakpoint'`.
  - `stack --name smoke-chrome --thread-id 0` returns `Window.calculate` at `app.js:2:18`.
  - `continue --name smoke-chrome --thread-id 0` resumes the page and the backgrounded evaluate returns the result.

## Deviations from Plan

### 1. No production controller change was needed

- **Found during:** Task 1 trace diagnosis.
- **Issue:** The plan assumed the production controller path still lacked a missing pwa-chrome breakpoint piece.
- **Evidence:** The page child returned `verified:true` for the absolute source path and emitted the breakpoint `stopped` event. The actual closure came from already-landed related fixes: two-ring event retention, child-to-parent paused projection, and parent-name thread routing.
- **Decision:** Do not add speculative `webRoot` propagation or `file://` source normalization.

### 2. Hand-driven docs, not controller code, needed the active fix

- **Found during:** Task 1 reproduction.
- **Issue:** The original Sequence B launched the page without `?manual`, so `calculate(2,3)` could finish before the user set the breakpoint.
- **Fix:** Updated Sequence B to use `?manual` and an explicit evaluate trigger.

## Hand-driven checkpoint

Passed. The orchestrator-run UAT records the H-6 proof in [05-UAT.md](05-UAT.md): a hand-driven user can set a breakpoint on the page, trigger it, observe the stopped event, query threads/stack, and resume entirely through the parent session name `smoke-chrome`.

## Self-Check: PASSED

- [05-22-trace/diagnosis.md](05-22-trace/diagnosis.md) exists and identifies the actual root cause with trace evidence.
- [docs/HAND-DRIVEN-SMOKE.md](../../../docs/HAND-DRIVEN-SMOKE.md) uses `?manual` and a deliberate evaluate trigger for Sequence B.
- [tests/integration/jsDebugAdapter.test.ts](../../../tests/integration/jsDebugAdapter.test.ts) contains the controller-driven pwa-chrome regression guard.
- [05-UAT.md](05-UAT.md) records H-6 as `result: pass` in the Wave 3+4 closure verify.