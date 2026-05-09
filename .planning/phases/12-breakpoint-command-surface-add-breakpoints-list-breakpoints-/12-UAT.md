---
status: complete
phase: 12-breakpoint-command-surface-add-breakpoints-list-breakpoints-
source:
  - .planning/phases/12-breakpoint-command-surface-add-breakpoints-list-breakpoints-/12-01-PLAN.md
  - .planning/phases/12-breakpoint-command-surface-add-breakpoints-list-breakpoints-/12-02-PLAN.md
ran_at: 2026-05-09T18:34:00Z
---

# Phase 12 UAT — Breakpoints list/clear + verification diagnostics

BPCMD-01 (`breakpoints list`) and BPCMD-02 (`breakpoints clear`) directly
exercised in Sequence B against the published binary. BPCMD-03
(`verificationDiagnostic` payload on unverified set + automatic
loadedSources follow-up) is unit-tested; the smoke confirms no regression in
the verified-bp path that returns the new payload shape.

## Hand-Driven CLI Smoke

ran_at: 2026-05-09T18:34:00Z
sequences:
  - id: A
    result: pass
    captured_output_file: tmp/phases-10-14-smoke-A.log
  - id: B
    result: pass
    captured_output_file: tmp/phases-10-14-smoke-B.log

BPCMD-01 (`breakpoints list`) — Sequence B step 3.5 immediately after `breakpoints set`:

```
{"ok":true,"data":{"sources":[{"source":{"path":"/Users/roblou/code/dap-cli/tests/fixtures/simple-chrome-page/app.js"},
"breakpoints":[{"id":0,"verified":true,"source":{"name":"app.js",
"path":"/Users/roblou/code/dap-cli/tests/fixtures/simple-chrome-page/app.js","sourceReference":0},
"line":2,"column":18}],"requested":[{"line":2}]}]},...}
```

Tracks both the requested input (`{line:2}`) and the adapter-resolved row with
`verified:true` + `column:18`.

BPCMD-02 (`breakpoints clear`) — Sequence B step 5.5 after the breakpoint fired
and was continued past:

```
{"ok":true,"data":{"cleared":[{"source":{"path":".../app.js"},"requested":0}]},...}
{"ok":true,"data":{"sources":[]},...}
```

`clear` returned the cleared source with the count of requests removed;
follow-up `breakpoints list` returns an empty `sources` array confirming
controller-side tracking was wiped.

Sequence A also confirmed the existing `breakpoints set` path still returns
`verified:true` for the Node fixture (step 4) and the bp fired on continue
(step 6/7), so no regression from the controller-side bp-tracking refactor in
[12-01-SUMMARY.md](12-01-SUMMARY.md).

BPCMD-03 verification diagnostic payload not exercised in the smoke (the smoke
fixture's bps all verify on first try); covered by
`tests/integration/breakpointsVerificationDiagnostic.test.ts` per
[12-02-SUMMARY.md](12-02-SUMMARY.md).
