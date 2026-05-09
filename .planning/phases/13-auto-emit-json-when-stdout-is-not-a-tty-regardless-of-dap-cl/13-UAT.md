---
status: complete
phase: 13-auto-emit-json-when-stdout-is-not-a-tty-regardless-of-dap-cl
source:
  - .planning/phases/13-auto-emit-json-when-stdout-is-not-a-tty-regardless-of-dap-cl/13-01-PLAN.md
ran_at: 2026-05-09T18:34:00Z
---

# Phase 13 UAT — Auto-emit JSON when stdout is not a TTY

The hand-driven smoke is the canonical proof for phase 13: every command in
Sequences A and B was invoked without `--no-human`, without
`DAP_CLI_HUMAN` set, and with stdout piped through `tee` (i.e. **not** a TTY).
Pre-phase-13, this would have rendered human-mode tables and broken downstream
JSON parsing. Post-phase-13, every captured response is JSON — exactly what an
agent pipeline expects.

## Hand-Driven CLI Smoke

ran_at: 2026-05-09T18:34:00Z
sequences:
  - id: A
    result: pass
    captured_output_file: tmp/phases-10-14-smoke-A.log
  - id: B
    result: pass
    captured_output_file: tmp/phases-10-14-smoke-B.log

Evidence — every captured response in both logs is structured JSON, e.g.:

```
{"ok":true,"data":{"started":true,"reused":false,"pid":31645,...},"meta":{"command":"start",...}}
{"ok":true,"data":{"sessionId":"sess_zbAC1OaUt0lj99QX","name":"smoke-node",...},"meta":{"command":"launch",...}}
{"ok":true,"data":{"breakpoints":[{"id":0,"verified":true,...}]},"meta":{"command":"breakpoints set",...}}
```

Verify environment of the smoke run:

```
$ env | grep DAP_CLI_HUMAN || echo "DAP_CLI_HUMAN not set"
DAP_CLI_HUMAN not set
```

Both logs were produced by `... 2>&1 | tee $LOG`, i.e. stdout is a pipe.
Pre-phase-13 default behavior would have honored a `DAP_CLI_HUMAN=1` from the
shell rc; phase 13's TTY gate short-circuits that env-derived human mode before
`parseHumanEnv` runs.

The phase 11 PAUSED-02 hint to stderr (`evaluate: session not paused; sending
evaluate without --frame-id...`) appears **outside** the JSON envelope in
Sequence B step 5 — confirming hints route to `errorStream` (stderr) and don't
contaminate the JSON stdout pipeline.

No regressions. Unit coverage in
`tests/cli/jsonOutput.test.ts` and `tests/cli/humanOutput.test.ts` per
[13-01-SUMMARY.md](13-01-SUMMARY.md).
