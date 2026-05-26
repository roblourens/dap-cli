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

**Sequences:**

- **Sequence A** — Node breakpoint round-trip via the real CLI.
- **Sequence B** — Side-by-side with Playwright on real Chromium.
- **Sequence C** — Fresh-machine consent + lazy provision (Phase 21). Run on
  any phase that touches `src/adapters/provision/`, `src/cli/confirm.ts`, or
  `src/cli/commands/setupAdapters.ts`.

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

## Launch.json Discovery And Compounds

For workspaces with `.vscode/launch.json`, the real CLI can list and start
named configurations or compounds:

```bash
node dist/index.js launch --workspace tests/fixtures/dap-cli-target --list-configs
node dist/index.js launch --workspace tests/fixtures/dap-cli-target --config "Fixture Compound"
node dist/index.js sessions
node dist/index.js close "Fixture Compound/Fixture Launch A"
```

Compound members are targetable sessions named `<compound>/<member>`. If
`stopAll` is omitted or `true`, closing one member removes the group. If
`stopAll: false`, peers remain running.

dap-cli resolves `${workspaceFolder}`, `${workspaceFolderBasename}`,
`${userHome}`, `${env:NAME}`, and `${execPath}`, and merges current-platform
overlays. It does not run VS Code tasks: `preLaunchTask` and `postDebugTask`
are ignored silently. `${input:...}` and `${command:...}` variables are
unsupported and fail fast. The CLI remains polling-only; there is no event
streaming mode in this phase.

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

# 3. Status while paused at entry (post-H-1 closure: paused: true).
#    js-debug reports the entry stop asynchronously after launch returns;
#    give the child stopped event a beat to mirror onto the parent record.
sleep 1
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
| 3    | after the short settle delay, `"paused":true` with `"stoppedReason":"entry"` (post-H-1 closure to `status`) |
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
> [../../docs/playwright-interop.md](../../docs/playwright-interop.md).

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
#    itself may time out with `controller_request_timeout` if it is still
#    waiting when the controller IPC deadline elapses. If `continue` arrives
#    first, it may instead complete with result `5`. Both outcomes are valid;
#    the required pause evidence is the stopped event, status, and stack below.
#    Run evaluate in the background:
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

# 7. Confirm no smoke-owned Chromium processes survived close (post-H-8 closure).
#    Scope the check to this smoke profile so unrelated Playwright/MCP browser
#    sessions that also use `remote-debugging-pipe` do not produce false gaps.
pgrep -lf '/tmp/dap-cli-smoke-chrome' || echo "no smoke profile orphans"
```

Expected verbatim signals:

| Step | Expected verbatim signal |
|------|--------------------------|
| 2    | `"lifecycle":"running"` returned from `launch`; a child session id (32-hex CDP target id) appears in the event stream within ~3s |
| 3    | breakpoint acknowledged with `"verified":true` on the parent (per repo memory: js-debug pwa-chrome routing). Page child returns the verified row with `column` populated and the parent's "Unbound breakpoint" provisional message dropped from the merged response |
| 4    | after `cleanup --purge`, first `sessions` invocation shows the parent `smoke-chrome` with child sessions hidden by default; second invocation with `--show-children` adds at least one `smoke-chrome#<32-hex>` child row. If you intentionally skip purge, stale terminated records may appear, but `smoke-chrome` parent presence and child visibility remain the required signals. |
| 5    | within ~3s of the `evaluate` trigger, `events --include stopped` shows a `stopped` event with `"reason":"breakpoint"` (post-H-2 closure: critical events not evicted by `loadedSource` spam; post-H-6 closure: page child's `setBreakpoints` response merged into the user-visible breakpoint, parent provisional bp registry propagates to existing children). `status` reports `"paused":true`, `"stoppedReason":"breakpoint"` (post-H-1 closure: child paused state mirrored to parent record). `stack --thread-id 0` returns frames with the top frame `Window.calculate` at `app.js` line 2. The backgrounded `evaluate` may either exit with `controller_request_timeout` (exit 7) if the breakpoint holds it beyond the IPC deadline, or complete with result `"5"` after `continue` releases the paused page. |
| 6    | `close` returns `ok:true` |
| 7    | `pgrep -lf '/tmp/dap-cli-smoke-chrome'` exits non-zero / prints `no smoke profile orphans` (post-H-8 closure: `close` actually terminates the adapter's child Chromium processes that belong to this smoke run) |

## Sequence C: Fresh-machine consent and provision (Phase 21)

**Purpose:** Prove the published `@roblourens/dap-cli` binary, invoked by hand
on a wiped-cache machine, prompts for consent, downloads js-debug, and reaches
a working debug session — without any local repo build steps.

**Pre-flight:**
1. Ensure `~/.dap-cli/adapters/` is wiped:
   ```
   rm -rf ~/.dap-cli/adapters
   ```
2. Ensure no `DAP_CLI_ASSUME_YES` is set in the environment (`unset DAP_CLI_ASSUME_YES`).
3. Ensure the CLI is reachable. Either install globally (`npm i -g @roblourens/dap-cli@<version-under-test>`) OR run from the local repo build (`./bin/dap-cli`). Record which one is used.

**Step C1: First launch triggers consent prompt**

Command (in an interactive terminal):
```
dap-cli launch --config "TypeScript Mini"
```

Expected output (verbatim signal — must appear on stderr, three lines, blank line first):
```

Install vscode-js-debug <VERSION> into <ABSOLUTE_INSTALL_ROOT> (~10MB)?
  Source: <DOWNLOAD_URL>
Proceed? [y/N] 
```

Where:
- `<VERSION>` is the pinned version from `src/adapters/provision/checksums.ts` (currently `1.117.0`).
- `<ABSOLUTE_INSTALL_ROOT>` is the absolute path to `~/.dap-cli/adapters/js-debug` (no trailing slash, fully expanded — e.g. `/Users/<user>/.dap-cli/adapters/js-debug`).
- `<DOWNLOAD_URL>` is the GitHub releases URL, e.g. `https://github.com/microsoft/vscode-js-debug/releases/download/v1.117.0/js-debug-dap-v1.117.0.tar.gz`.

Pass criteria: prompt text matches the three-line shape above (question / indented `Source:` detail / `Proceed? [y/N] ` on its own line), default answer is `N`, prompt goes to stderr (test by redirecting stdout: `dap-cli launch ... 1>/tmp/c1.out` — the prompt must still appear in the terminal).

**Step C2: Answer yes, observe install**

Type `y` and Enter at the prompt.

The install is silent on success (JSON-default output mode emits no progress messages). The success signal is the JSON launch envelope returned on stdout after the download completes (~10s) — `{"ok":true,"data":{"sessionId":"sess_...","lifecycle":"running",...}}`.

Pass criteria: install completes within ~30s; `~/.dap-cli/adapters/js-debug/src/dapDebugServer.js` exists after; `~/.dap-cli/adapters/js-debug/package.json` exists (containing `{"type":"commonjs"}`); `~/.dap-cli/adapters/js-debug/.consent-1.117.0` exists; launch envelope reports `lifecycle:running`.

**Step C3: Session reaches paused state**

Same command continues; the debug session should launch the configured program.

Pass criteria: dap-cli reaches the same paused/launched state as Sequence A step 3 (program runs and either exits or hits a breakpoint depending on the launch config).

**Step C4: Second invocation does NOT prompt**

Command:
```
dap-cli launch --config "TypeScript Mini"
```

Pass criteria: NO consent prompt appears; session launches directly. (Demonstrates the consent marker is honored.)

**Step C5: Non-TTY without `--yes` fails fast**

This exercises the contract that lazy provisioning gates a *download* on consent. Once the adapter is installed, re-using it does not require new consent (see decision D-20 — the `.consent-<version>` sentinel is a download-record, not a reuse gate). To exercise the fast-fail path, the entire install directory must be removed first.

Command:
```
rm -rf ~/.dap-cli/adapters/js-debug
ls -la ~/.dap-cli/adapters/ > /tmp/dap-cli-c5-before.txt
echo "" | dap-cli launch --config "TypeScript Mini"
ls -la ~/.dap-cli/adapters/ > /tmp/dap-cli-c5-after.txt
diff /tmp/dap-cli-c5-before.txt /tmp/dap-cli-c5-after.txt
```

Expected output (verbatim signal — must appear on stdout as part of the JSON error envelope when stdin is piped from `echo`):
```
{"ok":false,"error":{"code":"provision_consent_required","category":"usage","message":"Confirmation required but stdin is not a TTY.","exitCode":2,"diagnostics":["Install vscode-js-debug <VERSION> into <ABSOLUTE_INSTALL_ROOT> (~10MB)?","Re-run with `--yes` / `-y` or set `DAP_CLI_ASSUME_YES=1` to pre-consent."], ...}}
```

Pass criteria:
- Exit code of `dap-cli launch ...` is `2` (usage error).
- Error message contains the recovery hint.
- `diff` output is EMPTY (or contains only the lock-target file `.js-debug.lock-target` — the per-adapter lock is created up-front but no install dir follows). The `before`/`after` snapshots of `~/.dap-cli/adapters/` are byte-identical apart from that lock file, proving no download was attempted. Mtime alone is unreliable across filesystems and clock skew; the snapshot diff is the deterministic check.

**Step C6: `DAP_CLI_ASSUME_YES=1` pre-consents**

Command:
```
DAP_CLI_ASSUME_YES=1 dap-cli launch --config "TypeScript Mini"
```

Pass criteria: no prompt, session launches, consent marker re-created.

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
  - id: C
    binary_under_test: "npm i -g @roblourens/dap-cli@<ver>" | "./bin/dap-cli" | "node dist/index.js"
    steps:
      - step: C1
        result: pass | issue
        captured_output: |
          <verbatim>
      - step: C2
        result: pass | issue
        captured_output: |
          <verbatim>
      - step: C3
        result: pass | issue
        captured_output: |
          <verbatim>
      - step: C4
        result: pass | issue
        captured_output: |
          <verbatim>
      - step: C5
        result: pass | issue
        captured_output: |
          <verbatim>
      - step: C6
        result: pass | issue
        captured_output: |
          <verbatim>
```

A UAT is NOT eligible for `status: complete` unless every applicable sequence
(A, B, and — for any phase touching provisioning — every step C1–C6 of C) is
recorded with `result: pass`. If any step fails or its captured output does
not match the expected verbatim signal, it's a gap and goes through the
normal gap-closure loop — do NOT explain it away.
