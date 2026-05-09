# Phase 16 — Context

## Sources

- `analysis2.md` § "From another agent" — Python `evaluate` is expression-only
  in debugpy.
- `analysis2.md` §1 — agent confusion about `--request` flag (docs-only fix;
  see VERB-DOC-01 below).
- `analysis2.md` §3 — playwright-cli daemon-died failure mode (out of dap-cli
  scope as a fix, but in scope for `docs/PLAYWRIGHT-INTEROP.md`).

## Verbatim quotes

### Python evaluate

> When I tried:
>
> ```
> --expression "import builtins; builtins.input = lambda *a: '24'"
> ```
>
> debugpy returned `SyntaxError` because it evaluates the string as a Python
> *expression*, and `import` is a statement. I had to wrap it in `exec()`:
>
> ```
> --expression "exec(\"import builtins; builtins.input = lambda *a: '24'\")"
> ```
>
> The skill's `evaluate` examples don't mention this Python-specific gotcha.

### Playwright

> After a successful `attach` + `tab-list`, a few minutes later every command
> failed with:
>
> ```
> The browser 'default' is not open, please run open first
> ```
>
> Re-running `attach` then died with `connect ECONNREFUSED 127.0.0.1:9224` —
> even though `curl http://127.0.0.1:9224/json/version` succeeded and
> `lsof -t -i :9224` showed Code OSS still listening. The daemon process from
> the earlier attach apparently exited but left stale state, and a fresh
> attach couldn't recover. There's no `playwright-cli detach` / `reset` to
> clear it.

## Goal restated

### PYEVAL-01 — auto-wrap detection

`dap-cli evaluate` against a debugpy session detects statement-shaped Python
input (heuristics: leading `import`/`from`/`def`/`class`/`if`/`for`/`while`
/`with`/`try`/`raise`/`return`/`pass`/`global`/`nonlocal`/`del`/`assert`
keyword, an unbalanced `=` outside brackets, or `;` / newline separators) and
either:

- **Option A (preferred):** auto-wrap with
  `exec(<json-encoded source>)` before sending to the adapter, behind a
  detection that errs on the side of *not* wrapping ambiguous expressions.
- **Option B (fallback):** surface a structured `evaluate_requires_exec`
  diagnostic with the literal `exec(...)` recipe to retry, instead of
  bubbling debugpy's raw `SyntaxError`.

Planning decides A vs B (or both — A by default with `--no-auto-exec` to
opt out, plus B as the catch-when-detection-misses safety net).

### PYEVAL-02 — docs/skill mirror

Update `docs/AGENT-WORKFLOWS.md`, `README.md`, and the user-level
`~/.copilot/skills/dap-cli/SKILL.md` `evaluate` examples to call out the
Python expression-only rule and whatever `evaluate` actually does in this
phase. Today the SKILL has no Python-specific guidance.

### VERB-DOC-01 — launch vs attach verb selection

In the same docs/skill pass, add a short "use the right verb" note. Per
analysis2.md §1, an agent tried `dap-cli launch --type pwa-chrome --request
attach ...` and was confused that `--request` didn't exist. The CLI already
models `request:` as the verb — `dap-cli launch` vs `dap-cli attach` — so
there is intentionally no `--request` flag. Phase 10 also auto-routes when
a `--config` JSON's `request:` field disagrees with the verb. Doc updates:

- `docs/AGENT-WORKFLOWS.md`: explicit "choose the verb" subsection with the
  pwa-chrome attach example using `dap-cli attach`.
- `README.md`: one-line clarification on the launch/attach commands.
- `~/.copilot/skills/dap-cli/SKILL.md`: same.

No CLI surface change — documentation only.

### PWDOC-01 — playwright-cli failure-mode note

Add a section to `docs/PLAYWRIGHT-INTEROP.md` covering:

- Symptom: "The browser 'default' is not open, please run open first" after
  a previously-successful `attach`.
- Symptom: subsequent `attach` failing with `ECONNREFUSED` even though the
  Chrome target's `/json/version` is reachable.
- Diagnosis: the playwright-cli daemon exited but its on-disk/IPC state is
  stale.
- Recovery recipe: kill any lingering playwright-cli daemon process and
  re-attach. (Concrete command to be researched in planning.)

This is *documentation only* for dap-cli — playwright-cli itself is a
separate tool. We do not propose a fix to playwright-cli here.

## Out of scope

- Auto-wrapping for non-debugpy adapters (Node REPL already accepts
  statements).
- Implementing a `playwright-cli detach` / `reset` ourselves.

## Related work

- Phase 14 already updated agent docs; the skill mirror in PYEVAL-02 should
  follow the pattern set there.
