# Agent Workflows

This guide is for agents that need a repeatable debug loop from shell commands. dap-cli keeps debugger state in the controller; each command polls, inspects, or advances that state.

## Choosing launch vs attach

Picking the wrong verb for an attach-shaped `launch.json` config is the highest-impact agent footgun. Symptom: an adapter helper process spawns, every `breakpoints set` returns `verified: false`, and `dap loaded-sources` returns `[]` — looks identical to a source-map bug, but the real problem is that nothing of the user's code ever loaded into the process you talked to.

Rule:

- `dap-cli launch` and `dap-cli attach` are two separate top-level commands and they directly select the DAP `request:` field. There is no `--request` flag — do not search for one.
- If the resolved `.vscode/launch.json` configuration has `request: "attach"`, use `dap-cli attach`.
- With `--config <name>`, the controller auto-routes a verb mismatch to the matching DAP request and emits a `warnings` entry plus an `autoRouted: { from, to }` field on the success payload (Phase 10). `--config` invocations are safe by default.
- With raw `--json` payloads or CLI-flag-only invocations (`--adapter`, `--type`, `--program`, `--port` etc.), the verb is authoritative — there is no auto-route. Pick `launch` vs `attach` deliberately.

After the request lands, prove you hit the right runtime with the wrong-process smoke test below before doing anything else.

The user-level `~/.copilot/skills/dap-cli/SKILL.md` mirrors this guidance and is updated alongside this file.

## Wrong-process smoke test (post-attach)

Run this immediately after an `attach` (or after a `launch` that auto-routed to `attach`):

```bash
# 1. Ask the debuggee for its PID. evaluate auto-resolves --frame-id on a paused
#    session (Phase 11); on a non-paused session evaluate runs in the REPL global.
dap-cli evaluate --expression "process.pid" --name <session>

# 2. Compare against the inspector target listening on the port you attached to.
lsof -i :<port> | grep LISTEN
```

If the two PIDs differ, you attached to the wrong process — typically a js-debug helper instead of the user's runtime. The synthetic `dapCli.helperProcessWarning` event (see "Wrong-process smoke test" further down) catches this automatically for js-debug attach via raw `--json` / scripted attach. The Phase 10 `--config` auto-route covers the named-config case. The smoke test above is the manual fallback that always works.

## Poll-Then-Inspect Loop

Multi-process js-debug adapters (`pwa-node`, `pwa-chrome`) spawn child sessions for each runtime they instrument. Child sessions are NOT targetable — see the "Child sessions" subsection below. Set breakpoints on the parent session name; the parent's `status.paused` mirrors child stops via the parent's event stream.

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

### Child sessions (multi-process adapters)

js-debug adapters (`pwa-node`, `pwa-chrome`) spin up a child session per runtime they attach to (one per worker, browser tab, child process, etc.). Child sessions are not directly targetable — passing a child name to `--name` returns `child_session_not_targetable`. The controller's projection rules:

- **Set breakpoints on the parent session name.** The parent forwards `setBreakpoints` to the relevant children.
- **Child stops show up in the parent's event stream.** `events --name <parent>` is the source of stop events.
- **`status --name <parent>` mirrors the most recent child stop** in `paused` (Phase 11), so the standard poll-then-inspect loop works without enumerating children.

Use `sessions` only to confirm that a parent session exists; you do not target children individually.

#### pwa-chrome multi-renderer recipe

`pwa-chrome` attaches to the root browser target and spawns one child per renderer (page, worker, etc.). Every child event — including `output` from a logpoint — is mirrored into the parent's event stream with the originating child's id annotated as `body.child_session_id`. The supported workflow:

1. **Discover children.** Children are hidden from `sessions` by default; opt them in with `--show-children`. The response includes `parent_session_id` and a 32-hex CDP target id appended to the parent name (e.g. `vsc#6FC14EEF…`):

    ```bash
    dap-cli sessions --show-children
    ```

2. **Read events from the parent.** All child events flow into the parent's cache. Do not poll children directly:

    ```bash
    dap-cli events --name <parent> --include output --after-cursor 0
    ```

3. **Filter by `child_session_id` on the consumer side.** Each mirrored event carries `body.child_session_id` set to the child's session id. Pick a renderer's id from step 1 and grep / `jq` on it:

    ```bash
    dap-cli events --name <parent> --after-cursor 0 \
      | jq '.data.events[] | select(.body.child_session_id == "<child-id>")'
    ```

   Logpoint output from a renderer arrives as an `output` event with `body.category` set to whatever js-debug used for the source — typically `stdout` for `--log-message` payloads (NOT `console`). Filter on `child_session_id` rather than `category` to be category-agnostic.

4. **Never target a child directly.** As covered above, `events --name <child>` (or `status`, `stack`, etc.) returns `child_session_not_targetable` with `error.data.parentSessionId` pointing back to the parent. The recovery is always to retry against the parent and filter.

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
  loadedSourcesCount: number;     // length of loadedSources response on the parent, or -1 on lookup failure
  matchingLoadedSources: Array<{ path: string; name?: string }>;
  childSessionCount: number;      // count of js-debug child sessions attached to the parent
  hint: string;                   // one-line human/grep-friendly summary
  recipe: string;                 // literal command an agent should run next
}
```

The `hint` text distinguishes five failure modes:

| Condition | Hint phrase |
|-----------|-------------|
| `loadedSourcesCount === 0 && childSessionCount === 0` | `wrong process` |
| `loadedSourcesCount === 0 && childSessionCount > 0` | `parent has 0 loaded sources but session has N child session(s)` |
| `loadedSourcesCount > 0 && matchingLoadedSources.length === 0` | `none match …. Check source maps / outFiles` |
| `loadedSourcesCount > 0 && matchingLoadedSources.length > 0` | `Check breakpoint line numbers` |
| Adapter does not advertise `supportsLoadedSourcesRequest` | `does not support loadedSources` |

The `wrong process` phrase exists specifically so an agent grep can find it. Per `analysis.md` §3, "After the wrong attach, every dap-cli breakpoints set returned `verified: false`" — that failure mode now surfaces in-band instead of looking identical to a source-map mismatch. For multi-process js-debug attaches (`pwa-node` / `pwa-chrome`), the parent's loadedSources is always empty by design — the runtime sources live on the children — so the `childSessionCount > 0` branch fires instead, with hint text that names the child count and explicitly says this is normal. The `recipe` field is always the literal `dap-cli dap loaded-sources [--name <session>]` so the next-step is one read away.

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

### Python (debugpy) evaluate

debugpy implements DAP `evaluate` as a Python *expression*. A raw multi-statement payload (`import …`, `x = 1`, multi-line) would normally raise `SyntaxError: invalid syntax`. As of Phase 16, dap-cli detects statement-shaped Python on debugpy sessions and auto-wraps `args.expression` with `exec("…")` before forwarding. Pure expressions are passed through unchanged.

```bash
# All three of these work end-to-end on a paused debugpy session:
dap-cli evaluate --expression 'import os'                # auto-wrapped to exec("import os")
dap-cli evaluate --expression 'x = 1; x + 1'             # auto-wrapped to exec("x = 1; x + 1")
dap-cli evaluate --expression '1 + 1'                    # forwarded raw — pure expression
```

The wrap is invisible on the success path (the DAP response shape is unchanged). It only fires when `runtime.adapterId === 'debugpy'`; non-Python adapters (js-debug, etc.) always receive the expression verbatim.

**Opt-out (request-args level).** If you want to send a raw expression even when the heuristic would classify it as a statement, set `args.context = 'no-auto-wrap'` on the underlying DAP request. dap-cli strips the `'no-auto-wrap'` token before forwarding so debugpy doesn't reject an unknown context value. (No CLI flag is exposed for this in Phase 16; the request-args opt-out is the contract.)

**Fallback envelope when the heuristic misses.** If the heuristic mis-classifies a statement as an expression and debugpy returns its SyntaxError, dap-cli upgrades the controller error envelope to:

```
{ ok: false, error: {
    code: 'evaluate_requires_exec',
    category: 'dap',
    message: '`evaluate` requires `exec(...)` for Python statements (debugpy is expression-only).',
    diagnostics: [
      'Re-send with `args.expression` wrapped as: exec("…")',
      "Or set `args.context = 'no-auto-wrap'` to bypass auto-wrap if you intentionally want the raw expression.",
    ],
    data: {
      exec_form: 'exec("…the original expression…")',
      original_expression: '…',
    },
}}
```

Agents should read `error.data.exec_form` and re-send verbatim instead of re-deriving the wrap. The `exec_form` reflects the caller's original input (not any prior wrap), so re-sending it once is always correct.

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

Agent pipelines do not need `--no-human`. When stdout is not a TTY (piped, redirected, captured), `dap-cli` emits JSON regardless of `DAP_CLI_HUMAN` (Phase 13). The `--no-human` flag is only needed on a TTY where a developer wants JSON despite their shell exporting `DAP_CLI_HUMAN=1`.

```bash
dap-cli sessions --human                              # explicit human (TTY or pipe)
DAP_CLI_HUMAN=1 dap-cli status --name demo            # TTY: human; pipe: still JSON
DAP_CLI_HUMAN=1 dap-cli status --name demo --no-human # TTY override: force JSON
```

Resolver precedence (Phase 13, canonical):

| `--human` / `--no-human` | stdout is TTY | `DAP_CLI_HUMAN` | Resolved | Notes                                            |
| ------------------------ | ------------- | --------------- | -------- | ------------------------------------------------ |
| `--human`                | any           | any             | `human`  | explicit flag wins, even when piped              |
| `--no-human`             | any           | any             | `json`   | explicit flag wins                               |
| (none)                   | `false`       | `'1'`           | `json`   | non-TTY ignores env (the headline change)        |
| (none)                   | `false`       | `undefined`     | `json`   | unchanged default                                |
| (none)                   | `false`       | `'maybe'`       | `json`   | env parsing skipped — no `usageError` thrown     |
| (none)                   | `true`        | `'1'`           | `human`  | TTY + truthy env → human                         |
| (none)                   | `true`        | `'0'`           | `json`   | TTY + falsy env → json                           |
| (none)                   | `true`        | `undefined`     | `json`   | TTY + no env → json (default)                    |
| (none)                   | `true`        | `'maybe'`       | throws   | invalid env still throws ON A TTY                |

The command-level `--json <json>` option remains payload/config input for commands such as `launch`, `attach`, `request`, and generated `dap` requests. It is not an output-format switch.
