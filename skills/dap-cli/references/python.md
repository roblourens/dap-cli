# dap-cli — Python (debugpy)

Notes specific to the debugpy adapter. Read this when debugging a Python target. The general loop in [SKILL.md](../SKILL.md) still applies.

## `evaluate` is expression-only

debugpy implements DAP `evaluate` as a Python *expression* — a raw multi-statement payload (`import …`, `x = 1`, multi-line) would normally raise `SyntaxError: invalid syntax`. dap-cli detects statement-shaped Python on debugpy sessions and auto-wraps `args.expression` with `exec("…")` before forwarding. Pure expressions are passed through unchanged.

```bash
dap-cli evaluate --expression 'import os'                # auto-wrapped to exec("import os")
dap-cli evaluate --expression 'x = 1; x + 1'             # auto-wrapped to exec("x = 1; x + 1")
dap-cli evaluate --expression '1 + 1'                    # forwarded raw — pure expression
```

The wrap is invisible on the success path and only fires when `runtime.adapterId === 'debugpy'`. To opt out at the request-args layer (force a raw expression even when it looks like a statement), set `args.context = 'no-auto-wrap'` on the underlying DAP request — dap-cli strips the token before forwarding.

If the heuristic misses and debugpy returns its own SyntaxError, dap-cli upgrades the error envelope to `error.code = 'evaluate_requires_exec'` with `error.data.exec_form` set to the exact retry recipe and `error.data.original_expression` echoing the caller's input. Re-send `error.data.exec_form` verbatim — do not re-derive the wrap.
