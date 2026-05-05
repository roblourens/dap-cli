# H-6 diagnosis (plan 05-22 Task 1)

**Finding: H-6 is ALREADY closed end-to-end through the published controller path.** The premise of plan 05-22 (that the production CLI cannot drive a pwa-chrome breakpoint to a stopped state) is no longer accurate after the wave 1.5 + wave 2 closures landed. Neither candidate root cause from `must_haves.truths` (#5) matches the trace.

## Reproduction (from `cli-transcript-2.txt`)

```
launch     smoke-chrome  pwa-chrome  url=…/index.html?manual  webRoot=…  ⇒ ok
sessions --show-children                                       ⇒ parent + page child (32-hex)
breakpoints set --source app.js --line 2                       ⇒ verified:true, line 2, col 18
evaluate --expression 'calculate(2,3)'                         ⇒ controller_request_timeout (expected — eval blocks at bp)
events --include stopped                                       ⇒ stopped event, reason:"breakpoint", hitBreakpointIds:[0]
threads                                                        ⇒ thread id 0, name "index.html?manual", sessionName smoke-chrome#…
stack --thread-id 0                                            ⇒ top frame Window.calculate at app.js:2
continue                                                       ⇒ ok
```

Both H-6 acceptance criteria from `must_haves.truths` are satisfied:
1. `events --include stopped` returns a `stopped` event with `reason:"breakpoint"` within 10s of the trigger.
2. `stack --thread-id <id>` returns a frame whose source path resolves to `tests/fixtures/simple-chrome-page/app.js` at line 2.

## Trace evidence (`jsdebug-trace.txt`, connectionId 0 = parent wrapper, connectionId 1 = page child)

```
1777932246812 conn=0 dap.recv  setBreakpoints app.js line 2          (parent)
1777932246812 conn=0 dap.send  resp seq=9  breakpoints[0].verified=false "Unbound breakpoint"
1777932246812 conn=1 dap.recv  setBreakpoints app.js line 2          (page child)
1777932246820 conn=1 dap.send  resp seq=8  breakpoints[0].verified=true line=2 column=18
1777932246822 conn=1 dap.send  event breakpoint  reason=changed  verified=true
1777932247926 conn=1 dap.send  event stopped  reason=breakpoint  hitBreakpointIds=[0]
```

The existing `routeSetBreakpointsThroughParent` (added by plan 05-15, deviated by plan 05-09 to also fan out to children) already does the right thing:
- sends `setBreakpoints` to the parent (provisional registry)
- fans out to existing children (which is where pwa-chrome's page session returns the real `verified:true`)
- merges via `childVerifiedByIndex` so the user-visible response is `verified:true`
- subscribes to parent `breakpoint` events with a verification-timeout fallback for the no-child-yet-but-coming case

## Why neither candidate root cause matches

**Candidate (a) — `webRoot` not propagated to child config**: Not the issue. The page child returns `verified:true` directly to the `setBreakpoints` request — no path-mapping hop is involved at this stage because the source path the user passed (`/Users/.../app.js`) is the same absolute path js-debug uses for the file:// scheme it parsed. No `webRoot` injection into `args.configuration` is needed. (The parent's launch config still has `webRoot` set; js-debug uses it internally for sourcemap resolution, not for re-keying child startDebugging args.)

**Candidate (b) — `source.path` shape**: Not the issue. The trace shows the page child accepting the verbatim absolute path and returning a fully-resolved `source: { name: "app.js", path: "/Users/.../app.js", sourceReference: 0 }`. No `file://` URL conversion is required.

## What was actually broken before wave 1.5 + wave 2

The original H-6 BLOCKER report in `05-UAT.md` was a true symptom, but it was caused by issues that have already been independently closed by other plans in the same phase:

1. **H-2 (plan 05-18, two-ring event cache)** — pre-fix the cache was a single 100-event ring. js-debug pwa-chrome floods 90+ `loadedSource` events during page parse; a `stopped` event arriving 1s later could be evicted before the user's `events` poll. With the high/low priority split, `stopped` is now retained.

2. **H-1 (plan 05-25, child→parent paused mirror)** — pre-fix `status --name <parent>` reported `paused:false` even when a child had stopped. So even when the stop fired, the user-visible signal under the parent name was wrong.

3. **Documented sequence race** — `docs/HAND-DRIVEN-SMOKE.md` Sequence B step 2 launches `index.html` (no `?manual`), and `app.js` immediately invokes `calculate(2,3)` at script-eval time. By the time the user types `breakpoints set` (~3s later), the function has already returned. The breakpoint is set verified:true but never fires because nothing else calls `calculate`. This is a docs-correctness bug, not a controller bug. The fix is `index.html?manual` + a deliberate trigger (page-level evaluate or a real Playwright spec wired to the same Chromium remote-debugging-pipe).

## Proposed Task 2 scope (revised)

No production controller change is needed. Task 2 reduces to:
1. Add a regression unit test in `tests/controller/sessionManager.test.ts` codifying the pwa-chrome merge path: parent returns `verified:false`, child returns `verified:true`, merged response is `verified:true` (this is the behavior that closed H-6 and we should not regress).
2. Fix `docs/HAND-DRIVEN-SMOKE.md` Sequence B to (a) launch the page with `?manual` so it does not auto-run, (b) drive the breakpoint via `dap-cli evaluate` (or document the same with a side Playwright trigger pointing at the same Chromium instance).

Task 3 (controller-driven integration test) stands as written — that is the regression guard the plan promised.
