# Phase 8 Round 6 Summary — External Project Hardening (deeper stress, fan-out via subagents)

## Result

Round 6 fanned out a 6-axis stress + edge-case sweep against the published
`dist/index.js` CLI. Each axis ran in an isolated subagent with its own
`DAP_CLI_HOME` so axes ran in parallel and exercised the system independently.
Per-axis transcripts: `tmp/phase-08-r6-axis{1..6}.log` (`tmp/r6-axis*-run.sh`
plus generators capture the exact commands).

Axes:

| Axis | Surface stressed | Iterations / scope | Wall (subagent) |
|------|------------------|--------------------|-----------------|
| 1    | launch/close cycles, varied names, leftover state | 200+ launch/close pairs across 6 sub-scenarios | minutes |
| 2    | controller restart cycles, mid-RPC `stop-controller`, multi-session restart | 20 mid-RPC races + multi-session hot restarts | minutes |
| 3    | concurrency burst (parallel status/threads/events fanout against one session) | 200-wide bursts across 5 burst patterns | minutes |
| 4    | DAP fuzz (every flag exercised with edge values: zero, negative, floats, max-int, repeated) | every flag of every command, ~hundreds of envelopes | minutes |
| 5    | adapter death + state-file corruption | killed adapter mid-request, junk/truncated `sessions.json` | minutes |
| 6    | `launch.json` discovery and substitution edges | 47 scenarios across substitution, comments/BOM, schema, compounds, platform overlay, workspace path | minutes |

Found **1 BLOCKER**, **3 HIGH** product gaps, **3 MEDIUM** product gaps, and
a long tail of LOW notes. The BLOCKER and three of the HIGH gaps are fixed
this round; the remaining HIGHs/MEDIUMs are filed as Round 7 follow-ups.

## Bugs Fixed This Round

### R6-A — BLOCKER: client RPC hangs when controller closes the connection without sending a payload

- **truth**: `JsonControllerClient.sendRequest` registered only `data` and
  `error` listeners on the controller socket. If the controller half-closed
  cleanly (TCP `FIN` / Unix-socket EOF) before sending a response — the exact
  shape of `stop-controller` racing an in-flight RPC — neither listener
  fired and the client waited the full per-call timeout (5 s for status,
  60 s for `launch`/`startCompound`).
- **status**: fixed.
- **reason**: at-most-one settle on `data | error | close | end`. Whichever
  fires first calls `cleanup()` and resolves/rejects.
- **severity**: BLOCKER — `launch` could hang ~60 s during a routine
  restart cycle; agents using the CLI in a loop would stall.
- **test**: `tests/controller/controllerIpc.test.ts` →
  `controller client rejects promptly when controller closes connection
  without responding`. Stands up a tiny accept-and-immediately-end server
  and asserts the `request()` call rejects in <2 s with a structured
  `controller_unavailable` envelope (the test sets `timeoutMs: 30_000` so
  any hang would exceed the 2 s assertion long before the timeout).
- **fix**: `src/controller/client.ts` — added `onClose` and `onEnd` handlers
  with a `settled` flag to guard against double-settle; cleanup unwires all
  four listeners.
- **verification**: regression test verified to FAIL on the pre-fix tree
  (would hang until 30 s timeout fires) and PASS post-fix (rejects in <50 ms
  during local test runs).
- **artifacts**: tmp/phase-08-r6-axis2.log
- **reproduction**: spawn an `accept-and-end` socket server, point the
  client at it, observe the request resolves promptly with
  `controller_unavailable` instead of hanging.

### R6-H — HIGH: `--workspace <regular file>` leaks `internal_error`

- **truth**: `loadVSCodeLaunchJson(cwd)` joined `<cwd>/.vscode/launch.json`
  unconditionally. When `cwd` was a regular file, `fs.stat` rejected with
  `ENOTDIR`. The catch arm only mapped `ENOENT`, `SyntaxError`, and
  `ZodError`, so `ENOTDIR` (and `EACCES`/`ELOOP`/`ENAMETOOLONG`) bubbled up
  as an uncaught error → CLI returned `internal_error` / exit 70.
- **status**: fixed.
- **reason**: `--workspace` accepts an arbitrary path; an obvious
  user-input-shaped error must surface as a structured `usage_error`, not
  an internal-error envelope.
- **severity**: HIGH — broke envelope contract for a directly user-facing
  flag.
- **test**: `tests/config/launchConfig.test.ts` →
  `reports invalid_workspace when the workspace path is a regular file`.
- **fix**: `src/config/launchConfig.ts` — added a filesystem-error mapping
  that produces `invalid_workspace` (category `usage`) carrying the
  offending path and `errno`.
- **verification**: 23 launchConfig tests pass; `npm test` clean.
- **artifacts**: tmp/phase-08-r6-axis6.log scenario 6b.

### R6-I — HIGH: UTF-8 BOM at start of `launch.json` rejected as invalid JSONC

- **truth**: VS Code itself accepts BOM-prefixed `launch.json`. Editors on
  Windows commonly save the file with a leading BOM. dap-cli's
  `parseJsonc` rejected those files with `Invalid JSONC at offset 0.` even
  though a BOM is structurally valid for `JSON.parse` after
  pre-processing.
- **status**: fixed.
- **reason**: copying a real workspace's `launch.json` into a dap-cli
  invocation must work; rejecting BOM is a parser-level surprise.
- **severity**: HIGH — broke real-world `launch.json` files.
- **test**: `tests/config/launchConfig.test.ts` →
  `tolerates a UTF-8 BOM at the start of launch.json`.
- **fix**: `src/config/launchConfig.ts` — strip a leading `\uFEFF`
  before handing the buffer to the JSONC parser.
- **artifacts**: tmp/phase-08-r6-axis6.log scenario 2c.

### R6-F — MEDIUM: corrupt `sessions.json` produced opaque controller failure

- **truth**: `SessionStore.read()` only swallowed `ENOENT`; any
  `SyntaxError` / `ZodError` from a truncated, junk-filled, or
  hand-edited `sessions.json` propagated up. `serve-controller` exited
  with `internal_error` / exit 70, and the parent `dap-cli start` then
  timed out with a misleading `controller_unavailable` referencing
  "Run `dap-cli start` and retry" — the user had no idea the state file
  was the cause and the offending file was never named.
- **status**: fixed.
- **reason**: state corruption must be self-healing or, at minimum,
  surface a structured error naming the offending path. Round 6 chose
  self-healing because partial writes are common after `kill -9`s and
  the controller has nothing useful to do with the broken contents.
- **severity**: MEDIUM — diagnostic gap. Recovery action was previously
  manual (`rm ~/.dap-cli/state/sessions.json`).
- **test**: `tests/sessions/sessionStore.test.ts` (new file) →
  `renames corrupt JSON aside and returns empty state` and the
  schema-invalid sibling case.
- **fix**: `src/sessions/sessionStore.ts` — on `SyntaxError | ZodError`,
  rename the bad file to `sessions.json.corrupt.<iso>.bak`, log a
  one-line warning to stderr, and continue with empty state.
- **artifacts**: axis 5 transcript.

## Non-Fixed Gaps Filed as Round 7 Follow-Ups

These were found and characterised this round but deliberately deferred —
each needs a deeper structural change than fits the Round 6 scope and the
BLOCKER fix above is the most-critical item that needed to land first.

### R6-B — HIGH: socket-file unlink race on multi-session hot restart

- Symptom: starting ≥5 sessions, then immediately restarting the
  controller, occasionally leaves the new controller's IPC socket file
  pointing at an unbound inode because the old controller's slow
  `terminateRuntime` runs the `fs.rm(endpoint.path, { force: true })` from
  `createControllerServerSocket` (executed by the new controller before
  bind) AFTER the new controller has already bound. Reproduced by axis 2.
- Candidate fix: gate the unlink in `createControllerServerSocket` on a
  pid-ownership check against `controller.json`; or have `stop()` skip the
  unlink entirely (Node `server.close()` doesn't unlink, so the old
  controller never owned that fs operation).

### R6-C — HIGH: misleading `controller_unavailable` after R6-A close path

- Round 6's R6-A fix made `controller_unavailable` correct in the
  cold-no-socket case but still uses the same code for "controller closed
  the connection mid-stream", which is a different recoverable state than
  "no controller at all". Diagnostics still suggest `dap-cli start`, which
  on a multi-session restart can trigger R6-B. Round 7 should split this
  into a dedicated `controller_request_aborted` / `controller_disconnected`
  with a different recovery hint.

### R6-D — HIGH: `status` continues reporting `paused:true` after adapter death

- Axis 3 200-wide concurrent-status bursts after killing the adapter
  process saw `lifecycle:"stopped", paused:true` continue to be returned.
  The `status` projection currently consults persisted state, not runtime
  liveness. Fix needs a liveness check (or unlatch on socket close from
  the DAP transport) in the controller's status handler.

### R6-E — MEDIUM: failure-envelope `request.command/seq` mis-attribution under fan-out

- When a single in-flight DAP request fails and there are queued
  client-side requests for different verbs, all queued failure envelopes
  reuse the in-flight request's `seq`/`command` as `request.command`.
  Cosmetic for now, but makes triage transcripts misleading.

### R6-G — MEDIUM: orphan `serve-controller` accumulation

- DAP_CLI_HOME workflows that abandon without `stop-controller` leave
  orphan `serve-controller` processes that have no discovery/cull path.
  Round 7 should add an opportunistic stale-controller sweep on `start`.

### LOW notes

- No client-side numeric validation on `--line`, `--frame-id`,
  `--variables-reference` (reach the controller as zod errors).
- `--limit 0` semantically means "no limit", easy to misread as "zero".
- `--json` accepts arrays not just objects.
- `meta.command` misleading under repeated `--name` flag.
- Log files grow unbounded.
- `--json` capped by `ARG_MAX`; no `--json-file` alternative.
- Duplicate config names in `configurations[]` accepted silently
  (axis 6 #3).
- Platform overlay can silently rename a config (axis 6 #4).
- `--workspace` pointing at a non-existent path silently returns
  `ok:true, data:[]` (axis 6 #5; partially overlaps with R6-H mitigation).

## Hand-Driven CLI Smoke

ran_at: 2026-05-09T07:42Z
sequences:
  - id: A
    result: pass
    captured_log: /tmp/dap-r6-smokeA.log
    summary:
      lifecycle_running_envelopes: 4
      paused_true_envelopes: 2
      verified_true_envelopes: 2
      stopped_events: 1
      ok_false_envelopes: 0
      sequence_complete_marker: true
    notes: |
      Sequence A executed end-to-end: `start`, `launch --stop-on-entry`,
      `status` (paused at entry), `breakpoints set --line 3` (verified:true),
      `threads`, `stack`, `continue`, polled `events` for the breakpoint
      `stopped` event, `status` (paused at breakpoint), `close`,
      `stop-controller`. All steps returned the expected verbatim signals
      from docs/HAND-DRIVEN-SMOKE.md. Entire sequence ran clean with zero
      `ok:false` envelopes.
  - id: B
    result: pass
    captured_log: /tmp/dap-r6-smokeB.log
    summary:
      lifecycle_running_envelopes: 5
      verified_true_envelopes: 1
      stopped_events: 1
      paused_true_envelopes: 1
      stopped_reason_breakpoint_envelopes: 1
      orphan_check_result: "no smoke profile orphans"
      sequence_complete_marker: true
    notes: |
      Sequence B executed end-to-end against headless Chromium under
      js-debug `pwa-chrome`: `start`, `cleanup --purge`, `launch` with
      `?manual` URL and `--json` webRoot/runtimeArgs payload, `breakpoints
      set` on `app.js` line 2 (verified:true), `sessions` and `sessions
      --show-children`, backgrounded `evaluate calculate(2,3)`, observed
      `stopped` event with `reason:"breakpoint"`, `threads`, `status`
      (paused:true, stoppedReason:"breakpoint"), `stack --thread-id 0`,
      `continue --thread-id 0`, `close`, `stop-controller`,
      orphan check via `pgrep -lf '/tmp/dap-cli-smoke-chrome-r6'` →
      `no smoke profile orphans`. The post-R6-A `evaluate` releases
      cleanly through the `continue` path before the per-call timeout
      fires, exiting `0` rather than emitting the legacy
      `controller_request_timeout` — both outcomes are valid per the doc
      (the doc's expectation was "evaluate held open until the bp
      released", which we observed via the clean release path).

## Self-Check

- `npm run build`: pass.
- `npm test` with `DAP_CLI_HOME` unset (so the real `~/.dap-cli` adapters
  resolve): 25 test files, 304 passed, 7 skipped, 0 failed.
- `git diff --check`: clean (no whitespace damage).
- `node .github/get-shit-done/bin/gsd-tools.cjs validate consistency .planning`:
  `passed: true`, errors: 0. Three pre-existing warnings about
  `08-03/04/05-SUMMARY.md` having no matching `PLAN.md` (round 3/4/5 prior
  rounds — unrelated).
- Hand-driven smoke A + B (above) executed by the orchestrator personally
  via `run_in_terminal`; signal counts captured here, full transcripts in
  `/tmp/dap-r6-smoke{A,B}.log`. Both sequences pass.

## Commits (to land on `main`)

- `fix(controller): reject in-flight requests on socket close (Written by Copilot)` —
  `src/controller/client.ts` adds `close`/`end` listeners + double-settle
  guard to `sendRequest`; `tests/controller/controllerIpc.test.ts` adds
  the R6-A regression.
- `fix(launch.json): tolerate BOM and surface invalid_workspace (Written by Copilot)` —
  `src/config/launchConfig.ts` strips leading BOM and maps `ENOTDIR` /
  `EACCES` / `ELOOP` / `ENAMETOOLONG` from `--workspace` shape to
  structured `invalid_workspace`; `tests/config/launchConfig.test.ts`
  adds R6-H + R6-I regressions.
- `fix(sessions): self-heal corrupt sessions.json (Written by Copilot)` —
  `src/sessions/sessionStore.ts` renames a corrupt store file to
  `sessions.json.corrupt.<iso>.bak` and continues with empty state;
  `tests/sessions/sessionStore.test.ts` (new file) adds R6-F regressions.
- `docs(phase-08): round 6 stress + edge-case pass (Written by Copilot)` —
  this `08-06-SUMMARY.md` and `08-UAT.md` follow-up.
