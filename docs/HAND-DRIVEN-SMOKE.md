# Hand-Driven CLI Smoke

This is the canonical sequence the agent MUST execute in a real terminal as
part of every `/gsd-verify-work` run for this repo (see
`.github/copilot-instructions.md` repo verification rules).

Tests that pass under `vitest` do NOT substitute for this. The whole point is
to catch what the test harness wraps around: argv parsing, the real `dap-cli`
binary on disk, real adapters resolved from `~/.dap-cli/`, and human-readable
CLI output.

The agent runs every command itself, captures stdout/stderr verbatim into
`<phase>-UAT.md` under a `## Hand-Driven CLI Smoke` heading, and only then is
the UAT eligible to be marked `status: complete`.

## Binary

The repo does not ship a `./bin/dap-cli` wrapper. After `npm run build`, the
published entry point is `dist/index.js` (registered as `dap-cli` in
`package.json` `bin`). Two equivalent invocations work everywhere below:

```bash
node dist/index.js <subcommand> ...   # what the verbatim transcripts use
npx dap-cli <subcommand> ...          # equivalent, after build/install
```

The transcripts in `<phase>-UAT.md` use `node dist/index.js`. Mirror that for
copy-paste fidelity.

## Prerequisites

```bash
npm run build
node --version            # must be >= 22
ls ~/.dap-cli/adapters    # js-debug must be installed; if missing, run scripts/setup-adapters.ts
npx tsx scripts/setup-adapters.ts  # provisions missing adapters, including debugpy when needed
```

If `debugpy` is not listed under `~/.dap-cli/adapters` but
`scripts/setup-adapters.ts` reports provisioning to `~/.dap-cli/venv`, run the
provisioning script per the doc: `npx tsx scripts/setup-adapters.ts` — the
provisioned debugpy will be available to the controller via the venv path.

Confirm the published CLI surface contains every subcommand this doc uses.
If any are missing, the build is wrong — re-run `npm run build`.

```bash
node dist/index.js --help
```

The `Commands:` block must include all of:

```
start  status  stop  stop-controller  sessions  use  detach  close  cleanup
launch  attach  events  breakpoints  threads  stack  scopes  variables
continue  evaluate
```

(Note: there is no `disconnect` subcommand. Teardown uses `close`. There is
no `setBreakpoints` subcommand — breakpoints live under `breakpoints set`.
`stackTrace` is `stack`. `start-controller` is just `start` and is global —
the controller is process-singleton, not per-session.)

## Sequence A — Node target, breakpoint round-trip via the real CLI

Use the bundled fixture `tests/fixtures/dap-cli-target/index.js`.

```bash
# 1. Start the controller (global, no --name)
node dist/index.js start &
CTRL_PID=$!
sleep 1

# 2. Launch the Node fixture under js-debug, stop on entry
node dist/index.js launch \
  --name smoke-node \
  --adapter js-debug \
  --type pwa-node \
  --program "$PWD/tests/fixtures/dap-cli-target/index.js" \
  --stop-on-entry

# 3. Status while paused at entry (post-H-1 closure: paused: true)
node dist/index.js status --name smoke-node

# 4. Set a breakpoint on the console.log line (line 3 of the fixture)
node dist/index.js breakpoints set \
  --name smoke-node \
  --source "$PWD/tests/fixtures/dap-cli-target/index.js" \
  --line 3

# 5. Inspect the entry stop before continuing
node dist/index.js threads --name smoke-node
# Use the thread id returned by `threads` (for example `--thread-id 0`).
THREAD_ID=0  # replace with the id from the threads output
node dist/index.js stack --name smoke-node --thread-id "$THREAD_ID"
# Optional: to inspect the top frame symbol, use the frame id from `stack`.
TOP_FRAME_ID=0  # replace with the top stack frame id from stack output
node dist/index.js evaluate --name smoke-node --frame-id "$TOP_FRAME_ID" --expression "typeof dapCliSelfHostDemo"

# 6. Continue, then poll events for the breakpoint stop
node dist/index.js continue --name smoke-node --thread-id "$THREAD_ID"
sleep 1
node dist/index.js events --name smoke-node --limit 500 | grep -E '"event":"(stopped|terminated)"'

# 7. Status while paused at the breakpoint (post-H-1 closure)
node dist/index.js status --name smoke-node

# 8. Tear down
node dist/index.js close smoke-node
node dist/index.js stop-controller
wait $CTRL_PID 2>/dev/null || true
```

Expected verbatim signals:

| Step | Expected verbatim signal in output |
|------|------------------------------------|
| 2    | `"lifecycle":"running"` and a `sessionId` of the form `sess_…` returned from `launch` |
| 3    | `"paused":true` with `"stoppedReason":"entry"` (post-H-1 closure to `status`) |
| 4    | response shows `"verified":true` for line 3 |
| 5    | `threads` returns a thread id; `stack` using that thread id shows top frame name `dapCliSelfHostDemo` at line 2 of the fixture. Optional `evaluate --frame-id <TOP_FRAME_ID>` may be used for frame-scoped inspection, but the stack frame is the required signal. |
| 6    | a `stopped` event with `"reason":"breakpoint"` appears within ~1s (post-H-2 closure: critical events not evicted by `loadedSource` spam) |
| 7    | `"paused":true` with `"stoppedReason":"breakpoint"` |
| 8    | `close` returns `ok:true`; `stop-controller` returns cleanly |

If ANY step's output deviates, the gap goes into `<phase>-UAT.md` as an
issue. No glossing.

## Sequence B — Side-by-side with Playwright on real Chromium

This is the live equivalent of `npm run test:smoke:handoff` but driven by
hand to prove the published CLI surface works.

> Naming: "Playwright" in this section is generic and refers to whichever
> driver attaches to the same Chromium instance js-debug controls — either
> [`@playwright/cli`](https://www.npmjs.com/package/@playwright/cli) (the
> imperative `playwright-cli` binary, recommended) or
> [`@playwright/test`](https://www.npmjs.com/package/@playwright/test). The
> sequence below uses `dap-cli evaluate` as the trigger so it has no
> external Playwright dependency; for the imperative interop loop see
> [PLAYWRIGHT-INTEROP.md](PLAYWRIGHT-INTEROP.md).

```bash
# 1. Start controller (global)
node dist/index.js start &
CTRL_PID=$!
sleep 1

# 1a. Remove stale persisted session records before asserting session-list shape.
#     This ensures `sessions` output is not polluted by previously persisted
#     demo records (for example, `ts-button-demo`).
node dist/index.js cleanup --purge

# 2. Launch Chromium under js-debug pointed at the simple-chrome-page fixture.
#    Use the `?manual` query so app.js does NOT auto-run calculate(2,3) at
#    script-eval time — without ?manual the page completes BEFORE the user
#    can type `breakpoints set`, and the bp is set verified:true but never
#    fires (that race was a major contributor to the original H-6 BLOCKER).
#    webRoot is NOT a top-level flag — pass it via --json (matches the
#    verbatim transcript that worked in 05-UAT.md). Headless runtime args
#    keep the run automation-friendly; drop them for a visible window.
node dist/index.js launch \
  --name smoke-chrome \
  --adapter js-debug \
  --type pwa-chrome \
  --url "file://$PWD/tests/fixtures/simple-chrome-page/index.html?manual" \
  --json "{\"webRoot\":\"$PWD/tests/fixtures/simple-chrome-page\",\"runtimeArgs\":[\"--headless=new\",\"--disable-gpu\",\"--no-first-run\",\"--user-data-dir=/tmp/dap-cli-smoke-chrome\"]}"

# 3. Set a breakpoint in app.js (parent routing — see repo memory on
#    js-debug pwa-chrome breakpoint propagation). Expect verified:true
#    sourced from the page child's index-aligned response.
node dist/index.js breakpoints set \
  --name smoke-chrome \
  --source "$PWD/tests/fixtures/simple-chrome-page/app.js" \
  --line 2

# 4. Sessions list — by default child sessions are hidden (post-H-3 closure).
#    Use --show-children to see the page child.
node dist/index.js sessions
node dist/index.js sessions --show-children

# 5. Drive the breakpoint by evaluating `calculate(2,3)` in the page's JS
#    context via dap-cli evaluate (no frameId — top-level evaluate routes
#    to the first child with known threads, per plan 05-26). The evaluate
#    itself will time out with `controller_request_timeout` because it
#    blocks waiting for the bp to be released — that's the EXPECTED
#    signal that the page paused. The events/threads/stack queries below
#    are how you observe the stop. Run evaluate in the background:
node dist/index.js evaluate --name smoke-chrome --expression 'calculate(2,3)' &
EVAL_PID=$!
sleep 3
node dist/index.js events --name smoke-chrome --include stopped --limit 100
node dist/index.js threads --name smoke-chrome
node dist/index.js status --name smoke-chrome
# Use the threadId from `threads` above (typically 0 for the page).
node dist/index.js stack --name smoke-chrome --thread-id 0
node dist/index.js continue --name smoke-chrome --thread-id 0
wait $EVAL_PID 2>/dev/null || true

# Note: the Playwright spec at tests/fixtures/simple-chrome-page/interop.spec.ts
# spawns its OWN Chromium and is NOT wired to the same Chromium instance
# js-debug attached to. Driving the breakpoint via that spec from a side
# terminal does NOT work for hand-driven sequence B — use the evaluate
# trigger above. The integration test
# `tests/integration/jsDebugAdapter.test.ts:runs pwa-chrome breakpoint
# through the published controller and observes a stopped event` is the
# automated equivalent of this sequence (gated by DAP_CLI_RUN_BROWSER_SMOKES=1).

# 6. Tear down
node dist/index.js close smoke-chrome
node dist/index.js stop-controller
wait $CTRL_PID 2>/dev/null || true

# 7. Confirm no orphan Chromium processes survived close (post-H-8 closure)
pgrep -lf 'remote-debugging-pipe' || echo "no orphans"
```

Expected verbatim signals:

| Step | Expected verbatim signal |
|------|--------------------------|
| 2    | `"lifecycle":"running"` returned from `launch`; a child session id (32-hex CDP target id) appears in the event stream within ~3s |
| 3    | breakpoint acknowledged with `"verified":true` on the parent (per repo memory: js-debug pwa-chrome routing). Page child returns the verified row with `column` populated and the parent's "Unbound breakpoint" provisional message dropped from the merged response |
| 4    | after `cleanup --purge`, first `sessions` invocation shows the parent `smoke-chrome` with child sessions hidden by default; second invocation with `--show-children` adds at least one `smoke-chrome#<32-hex>` child row. If you intentionally skip purge, stale terminated records may appear, but `smoke-chrome` parent presence and child visibility remain the required signals. |
| 5    | within ~3s of the `evaluate` trigger, `events --include stopped` shows a `stopped` event with `"reason":"breakpoint"` (post-H-2 closure: critical events not evicted by `loadedSource` spam; post-H-6 closure: page child's `setBreakpoints` response merged into the user-visible breakpoint, parent provisional bp registry propagates to existing children). `status` reports `"paused":true`, `"stoppedReason":"breakpoint"` (post-H-1 closure: child paused state mirrored to parent record). `stack --thread-id 0` returns frames with the top frame `Window.calculate` at `app.js` line 2. The backgrounded `evaluate` exits with `controller_request_timeout` (exit 7) — that is the EXPECTED signal that the page paused and the bp held the eval response open past the 5s controller IPC timeout |
| 6    | `close` returns `ok:true` |
| 7    | `pgrep -lf 'remote-debugging-pipe'` exits non-zero / prints `no orphans` (post-H-8 closure: `close` actually terminates the adapter's child Chromium processes) |

## Recording the result

The agent appends to `<phase>-UAT.md`:

```markdown
## Hand-Driven CLI Smoke

ran_at: <ISO timestamp>
sequences:
  - id: A
    result: pass | issue
    captured_output: |
      <verbatim>
  - id: B
    result: pass | issue
    captured_output: |
      <verbatim>
```

A UAT is NOT eligible for `status: complete` unless both sequences are
recorded with `result: pass`. If either fails, it's a gap and goes through
the normal gap-closure loop.
