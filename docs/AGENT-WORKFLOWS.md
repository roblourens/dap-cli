# Agent Workflows

This guide is for agents that need a repeatable debug loop from shell commands. dap-cli keeps debugger state in the controller; each command polls, inspects, or advances that state.

## Poll-Then-Inspect Loop

Use the same loop for Node.js, Python, browser, and custom adapters:

1. Poll `status --name <session>` to check whether the session is running, stopped, or terminated.
2. Poll `events --name <session> --after-cursor <cursor> --limit 20` to read bounded recent events.
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

## Evaluation and Branching Decisions

Evaluate expressions only while the target is stopped and use the JSON result to decide the next command.

```bash
dap-cli evaluate --expression "value > 10" --frame-id 10 --context repl --name inspect
dap-cli next --thread-id 1 --name inspect
dap-cli step-in --thread-id 1 --name inspect
dap-cli step-out --thread-id 1 --name inspect
```

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

Handled failures are JSON envelopes, not stack traces. Read `error.code`, `error.diagnostics`, and adapter fields such as `stderrTail` or `logPath` before deciding whether to retry.

```bash
dap-cli request threads --name inspect --json '{}'
dap-cli capabilities --name inspect
dap-cli events --name inspect --limit 20
```

If a request fails because the target resumed, start the loop again at `status` and reacquire references after the next stop.
