---
phase: 16-python-evaluate-ergonomics-auto-wrap-statements-and-document
plan: 01
subsystem: controller
tags: [debugpy, evaluate, python, dap, ergonomics, error-envelope]

requires:
  - phase: 15-child-session-enumeration-and-event-routing-for-js-debug-pwa
    provides: stable controller routeDapRequest baseline
provides:
  - Controller-side auto-wrap of statement-shaped Python on debugpy `evaluate`
  - Structured `evaluate_requires_exec` error envelope with retry recipe in `data.exec_form`
  - Pure, side-effect-free heuristic module decoupled from controller protocol
affects: [16-02 docs sweep, future phases touching controller routing or debugpy]

tech-stack:
  added: []
  patterns:
    - "Pure heuristic helper modules for protocol-edge ergonomics (no I/O, no DI surface)"
    - "Structured error-envelope upgrade inside wrapDapError closure"

key-files:
  created:
    - src/controller/pythonExpressionDetector.ts
    - tests/controller/pythonExpressionDetector.test.ts
    - tests/controller/dapRequestRouting.test.ts
  modified:
    - src/controller/server.ts
    - tests/fixtures/fake-adapter-entry.ts

key-decisions:
  - "Heuristic is gated by adapterId === 'debugpy' AND command === 'evaluate' — zero behavior change for non-Python adapters."
  - "Opt-out shape is request-args level: args.context === 'no-auto-wrap'. The token is stripped before forwarding so debugpy doesn't reject an unknown context value. CLI flag deliberately deferred to 16-02 docs sweep."
  - "Error upgrade fires whenever a debugpy evaluate returns SyntaxError — independent of whether we wrapped — so the heuristic missing is fully recoverable via the recipe in data.exec_form."
  - "wrapForExec uses JSON.stringify because Python string-literal escaping is a strict superset of JSON's for the chars we encode (\\n, \\\", \\\\, control chars)."

patterns-established:
  - "Pure protocol-edge helpers live alongside controller wiring but expose only string-in/value-out contracts so they can be unit-tested without mocks."
  - "DapResponseError shape match (regex on .message) is the integration point for SyntaxError-class error envelope upgrades."

requirements-completed: [PYEVAL-01]

duration: ~25min
completed: 2026-05-09
---

# Phase 16-01: Python evaluate auto-wrap Summary

**On debugpy `evaluate`, statement-shaped Python is now auto-wrapped with `exec("…")`; SyntaxError fallbacks return a structured `evaluate_requires_exec` envelope carrying the exact retry recipe.**

## Performance

- **Duration:** ~25 min
- **Started:** 2026-05-09 ~14:43 PT
- **Completed:** 2026-05-09 ~14:55 PT
- **Tasks:** 2 (TDD detector module, controller wiring + integration tests)
- **Files modified:** 5 (3 created, 2 modified)

## Accomplishments

- Pure Python statement-vs-expression heuristic with bracket-depth + string-state scanner; 61 passing unit tests covering every leading statement keyword, top-level `;`/`\n`/`=`, and expression negatives (lambda, walrus, ternary, comprehensions, kwargs).
- `wrapForExec(source)` returns `exec(JSON.stringify(source))` — round-trip-safe for embedded newlines, quotes, and backslashes.
- `routeDapRequest` rewires through `maybePythonEvaluateRewrite(adapterId, requestParams)`; success-path is invisible (caller sees the original DAP evaluate response).
- `wrapDapError` closure intercepts `DapResponseError` matching `/syntaxerror|invalid syntax/i` on a debugpy evaluate and upgrades it to `dapError('… evaluate requires exec(...) for Python statements …', { code: 'evaluate_requires_exec', data: { exec_form, original_expression }, … })`.
- 5 new fake-adapter scripts + integration tests pin: positive wrap, expression passthrough, non-debugpy passthrough, opt-out via `context: 'no-auto-wrap'` (with token stripped), and SyntaxError-fallback envelope upgrade.

## Task Commits

1. **Task 1: Pure Python statement heuristic** — `e7a0851` (feat)
2. **Task 2: Wire into routeDapRequest + structured fallback diagnostic** — `4bd2b99` (feat)

## Files Created/Modified

- `src/controller/pythonExpressionDetector.ts` — Pure module: `looksLikePythonStatement`, `wrapForExec`. No project imports, no I/O, no DI.
- `tests/controller/pythonExpressionDetector.test.ts` — 61 tests pinning heuristic boundary cases.
- `src/controller/server.ts` — Imports detector; `routeDapRequest` precomputes rewrite + uses `forwardArgs` for both `children.maybeIntercept` and `client.request`; `wrapDapError` upgrades SyntaxError shape on debugpy evaluate; new private helper `maybePythonEvaluateRewrite` placed near other server-internal helpers.
- `tests/controller/dapRequestRouting.test.ts` — 5 integration tests through the full controller IPC stack using descriptor.id-keyed fake adapters.
- `tests/fixtures/fake-adapter-entry.ts` — 5 new scripts: `py-evaluate-wrap-import`, `py-evaluate-passthrough-expression`, `py-evaluate-jsdebug-untouched`, `py-evaluate-optout`, `py-evaluate-syntax-error-fallback`.

## Decisions Made

- **Opt-out at request-args layer, not CLI flag** — defers CLI-surface decision to 16-02 docs sweep so we can document the request-args contract first and add a `--no-auto-wrap` flag only if agents demonstrably need one. Token is stripped from forwarded args because debugpy rejects unknown `context` values.
- **`originalExpression` always set when entering rewrite path** — even on the opt-out and pure-expression branches — so the SyntaxError-fallback recipe is available regardless of whether we wrapped.
- **JSON.stringify for wrap encoding** — avoids hand-rolled Python string-escape rules; the JSON character set we emit (`\n`, `\"`, `\\`, control-char `\uNNNN`) is a strict subset of valid Python string literal escapes.
- **No CLI command/flag changes** — `dap-cli evaluate` surface is byte-for-byte unchanged; the wrap is invisible on the success path.

## Wire-format example (verbatim before/after)

Caller sends:
```
dap.request { command: 'evaluate', args: { expression: 'import os' }, name: 'py' }
```

Adapter (debugpy) actually receives:
```
{ command: 'evaluate', arguments: { expression: 'exec("import os")' } }
```

If detector misses (statement-shape-but-classified-as-expression), the adapter returns SyntaxError and the caller sees:
```
{ ok: false, error: {
    code: 'evaluate_requires_exec',
    category: 'dap',
    message: '`evaluate` requires `exec(...)` for Python statements (debugpy is expression-only).',
    diagnostics: [
      'Re-send with `args.expression` wrapped as: exec("…the original expression…")',
      "Or set `args.context = 'no-auto-wrap'` to bypass auto-wrap if you intentionally want the raw expression.",
    ],
    data: {
      exec_form: 'exec("…")',
      original_expression: '…',
    },
    adapter: { descriptorId: 'debugpy', … },
}}
```

## Heuristic edge cases discovered

For 16-02 documentation:

- **`await EXPR` is treated as a statement** (true), even though Python ≥ 3.8 REPL allows top-level `await`. Conservative: false negatives are safer than failed wraps. Document as "use opt-out for top-level `await EXPR`" if it ever bites.
- **Bare comment `# …` returns false** — has no executable form; debugpy's own SyntaxError surfaces normally.
- **Augmented assignment (`x += 1`) is a statement** — caught via the top-level `=` rule (the `+` precedes it but doesn't disqualify).
- **Tuple unpacking (`a, b = 1, 2`) is a statement** — same path.
- **Comments containing `;` or `\n` outside string literals** — comment-skip explicitly returns true on the trailing newline so multi-line `# foo\nbar` correctly classifies as multi-statement.

## Deviations from Plan

None — plan executed as written. The "errors object shape" in tests uses `category` (not `category: 'dap'` string-match) — confirmed against `src/cli/errors.ts`.

## Issues Encountered

- **Initially added fake-adapter scripts to `src/testing/fakeAdapter.ts`** — that's the in-process library used by some unit tests, not the spawned-binary one. The controller spawns `tests/fixtures/fake-adapter-entry.ts` for descriptor-driven sessions. Reverted and re-added to the right file. (Tests went from 5/5 failing with `DAP transport closed` → 5/5 passing.)

## Threats addressed (T-16-01 .. T-16-04)

- **T-16-01 (Tampering — args mutation):** Opt-out (`context: 'no-auto-wrap'`) covered by `py-evaluate-optout` test. `originalExpression` is preserved separately so the error-path recipe always reflects the caller's input, never the wrapped form.
- **T-16-02 (Information Disclosure — `data.exec_form` echoes input):** Accepted per plan. Single-tenant controller; the expression is round-tripping back to its sender.
- **T-16-03 (Tampering — heuristic mis-classification):** 61-test matrix pins both directions. Mis-classification's worst case (statement classified as expression → raw forward → adapter SyntaxError) is automatically recovered into the structured `evaluate_requires_exec` envelope, so the user still gets the recipe.
- **T-16-04 (Spoofing — error-message regex):** Match is gated on `adapterId === 'debugpy'` AND `command === 'evaluate'` AND `evaluateRewrite !== undefined` (we actually saw the request). Worst case (genuine non-statement SyntaxError on debugpy) gets a slightly-misleading recipe whose execution is still safe (`exec("...")` of a syntactically-broken string raises the same SyntaxError, no escalation).

## Self-Check: PASSED

- `npx vitest run tests/controller/pythonExpressionDetector.test.ts` → 61 passed
- `npx vitest run tests/controller/dapRequestRouting.test.ts` → 5 passed
- `npx vitest run tests/controller` → 155 passed (no regressions)

PYEVAL-01 closed; 16-02 docs sweep can now reference the exact wrap form, the opt-out shape, and the error envelope.
