# Agent Workflows

This guide is for agents that need a repeatable debug loop from shell commands. dap-cli keeps debugger state in the controller; each command polls, inspects, or advances that state.

## Poll-Then-Inspect Loop

Use the same loop for Node.js, Python, browser, and custom adapters:

1. Poll `status --name <session>` to check whether the session is running, stopped (paused), or terminated. `status` is the source of truth for paused-vs-running — it incorporates the most recent `stopped`/`continued` event for both single-process adapters (debugpy, fake) and multi-process adapters (js-debug pwa-node, pwa-chrome). For js-debug parent sessions, `status` reflects the child's most recent stop via the parent's mirrored `paused` projection — no need to walk child sessions.
2. Poll `events --name <session> --after-cursor <cursor> --limit 20` for richer context (cursor, body, reason history). `events` is no longer required for stop detection.
3. If stopped, inspect with `threads`, `stack --thread-id`, `scopes --frame-id`, and `variables --variables-reference`.
4. Decide with `evaluate`, `continue`, `next`, `step-in`, or `step-out`.
5. Repeat from `status` after every resume or step.

```bash
dap-cli status --name demo
dap-cli events --name demo --after-cursor 0 --limit 20
dap-cli threads --name demo
dap-cli stack --thread-id 1 --name demo
dap-cli scopes --frame-id 10 --name demo
dap-cli variables --variables-reference 100 --name demo
dap-cli evaluate --expression "value + 1" --frame-id 10 --name demo
dap-cli continue --thread-id 1 --name demo
```

DAP object references are valid only for the current suspended state. After `continue`, `next`, `step-in`, or `step-out`, do not reuse old `frame-id` or `variables-reference` values. Poll again and reacquire `threads`, `stack`, `scopes`, and `variables` on the next stop.

## Breakpoint Workflow

Set breakpoints before triggering the behavior you want to inspect. Then poll events and inspect the new stopped state.

```bash
dap-cli launch --adapter fake --script alias-inspection --name inspect
dap-cli breakpoints set --source app.ts --line 5 --name inspect
dap-cli status --name inspect
dap-cli events --name inspect --after-cursor 0 --limit 10
dap-cli threads --name inspect
dap-cli stack --thread-id 1 --name inspect
dap-cli scopes --frame-id 10 --name inspect
dap-cli variables --variables-reference 100 --name inspect
dap-cli continue --thread-id 1 --name inspect
dap-cli cleanup
```

Use `breakpoints set` as replacement semantics for a source. If you need a different set of lines, call it again with the complete desired set.

### Inspecting and clearing breakpoints

`breakpoints list` returns every source the controller has observed go through `setBreakpoints` for the session, with the adapter's response (including `verified` flags). `breakpoints clear` issues `setBreakpoints` with an empty list (DAP "clear" semantics) for one source or for every tracked source.

```bash
dap-cli breakpoints list --name inspect
# {
#   "ok": true,
#   "data": {
#     "sources": [
#       {
#         "source": { "path": "/abs/app.ts" },
#         "breakpoints": [{ "id": 1, "verified": true, "line": 5 }],
#         "requested": [{ "line": 5 }]
#       }
#     ]
#   }
# }

dap-cli breakpoints list --name inspect --source app.ts        # filter to one source
dap-cli breakpoints clear --name inspect --source app.ts       # clear one source (idempotent on unknown sources)
dap-cli breakpoints clear --name inspect                       # clear every tracked source
```

Tracking is in-memory on the controller and is dropped on session close or controller restart. Initial breakpoints injected via `dap launch --json '{ ..., __dapCliInitialBreakpoints: ... }'` are NOT tracked until they are re-set with `breakpoints set`.

### Diagnosing unverified breakpoints

When `breakpoints set` returns any breakpoint with `verified: false`, the CLI follows up with `loadedSources` and attaches a structured `verificationDiagnostic` object to the success payload. The diagnostic is informational — exit code is unchanged from today's behavior.

```typescript
interface VerificationDiagnostic {
  unverifiedCount: number;        // count of breakpoints with verified === false
  totalCount: number;             // total breakpoints in the response
  loadedSourcesCount: number;     // length of loadedSources response, or -1 on lookup failure
  matchingLoadedSources: Array<{ path: string; name?: string }>;
  hint: string;                   // one-line human/grep-friendly summary
  recipe: string;                 // literal command an agent should run next
}
```

The `hint` text distinguishes four failure modes:

| Condition | Hint phrase |
|-----------|-------------|
| `loadedSourcesCount === 0` | `wrong process` |
| `loadedSourcesCount > 0 && matchingLoadedSources.length === 0` | `none match …. Check source maps / outFiles` |
| `loadedSourcesCount > 0 && matchingLoadedSources.length > 0` | `Check breakpoint line numbers` |
| Adapter does not advertise `supportsLoadedSourcesRequest` | `does not support loadedSources` |

The `wrong process` phrase exists specifically so an agent grep can find it. Per `analysis.md` §3, "After the wrong attach, every dap-cli breakpoints set returned `verified: false`" — that failure mode now surfaces in-band instead of looking identical to a source-map mismatch. The `recipe` field is always the literal `dap-cli dap loaded-sources [--name <session>]` so the next-step is one read away.

## Evaluation and Branching Decisions

Evaluate expressions only while the target is stopped and use the JSON result to decide the next command.

```bash
dap-cli evaluate --expression "value + 1" --name inspect
dap-cli evaluate --expression "value > 10" --frame-id 10 --context repl --name inspect
dap-cli next --thread-id 1 --name inspect
dap-cli step-in --thread-id 1 --name inspect
dap-cli step-out --thread-id 1 --name inspect
```

`evaluate` auto-resolves `--frame-id` to the topmost frame of the most-recently-stopped thread when the session is paused and `--frame-id` is omitted. The four-command `threads → stack → grab frameId → evaluate` recipe still works (and is required when you want a specific non-top frame), but the short form `dap-cli evaluate --expression '...' --name <session>` is now sufficient for the common case. When multiple threads are paused or auto-resolution falls back, dap-cli prints a one-line stderr hint naming the auto-selected thread or failure reason.

A common agent pattern is:

1. `evaluate` a predicate.
2. If the result confirms the hypothesis, `continue`.
3. If the result is unexpected, inspect more variables or step once.
4. Reacquire stack and scopes after the next stop.

## Session Lifecycle

Named sessions make multi-command workflows stable across shells and agents.

```bash
dap-cli sessions
dap-cli use inspect
dap-cli status
dap-cli stop --name inspect
dap-cli cleanup
```

Use `sessions` to list known sessions. Use `use <name>` only when you want subsequent commands without `--name` to target that session. Prefer explicit `--name` in scripts and agent playbooks so commands remain reproducible.

## Failure Handling

Handled failures are JSON envelopes, not stack traces. Agents should continue relying on the default JSON envelope contract for automation; do not parse human-readable output in scripts. Read `error.code`, `error.diagnostics`, and adapter fields such as `stderrTail` or `logPath` before deciding whether to retry.

```bash
dap-cli request threads --name inspect --json '{}'
dap-cli capabilities --name inspect
dap-cli events --name inspect --limit 20
```

If a request fails because the target resumed, start the loop again at `status` and reacquire references after the next stop.

## Wrong-process smoke test

When attaching with `js-debug` the controller emits a synthetic event named `dapCli.helperProcessWarning` if a `process` event arrives whose system process is the js-debug helper itself (its parent pid equals the adapter's pid). This usually means the request reached the wrong runtime — for example, asking js-debug to attach when the launch shape was meant. Phase 10 plan 01's auto-route by `--config request` prevents this for `--config` flows; the warning catches the residual cases (raw `--json` payloads, scripted attaches without `--config`, custom helpers).

Poll for it during attach smoke tests:

```bash
dap-cli events --name <session> --include dapCli.helperProcessWarning --limit 5
```

Warning event body shape:

```json
{
  "code": "helper_process_detected",
  "message": "Attached to a js-debug helper process. Verify the request type and target.",
  "helperPid": 12345,
  "adapterPid": 12300,
  "adapterId": "js-debug",
  "sessionId": "...",
  "sessionName": "..."
}
```

The detector is a no-op for non-attach sessions, non-`js-debug` adapters, and non-Unix platforms (Windows skips the `ps` lookup).

## Output Modes

JSON remains the default output mode for agents and scripts. Humans can opt into readable terminal output with `--human`, or set `DAP_CLI_HUMAN=1` in their shell for a human default. Use `--no-human` to force JSON when `DAP_CLI_HUMAN=1` is inherited. Human output is for reading, not a stable machine-parsing contract.

```bash
dap-cli sessions --human
DAP_CLI_HUMAN=1 dap-cli status --name demo
DAP_CLI_HUMAN=1 dap-cli status --name demo --no-human
```

The command-level `--json <json>` option remains payload/config input for commands such as `launch`, `attach`, `request`, and generated `dap` requests. It is not an output-format switch.
