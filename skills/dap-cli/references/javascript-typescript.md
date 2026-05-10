# dap-cli — JavaScript / TypeScript (js-debug)

Notes specific to the js-debug adapter (`pwa-node`, `pwa-chrome`, `node`). Read this when debugging a JS or TS target. The general loop in [SKILL.md](../SKILL.md) still applies.

## TypeScript source vs compiled JS output

**Default rule for any TS codebase: set the breakpoint on the `.ts` source path.** Setting it on the compiled `.js` bypasses source-map resolution and gives you stack frames in `.js`, which is almost never what you want. Reach for `.js` only as a last-resort diagnostic.

For js-debug attach against a `tsc` build (the common case for codebases that ship to `out/` or `dist/`):

- **Use `--workspace + --config`, not raw `--adapter` flags.** A workspace launch.json config carries `outFiles` / `sourceMaps` / `resolveSourceMapLocations`, which js-debug needs to read source maps. Raw `--adapter js-debug --type pwa-node --port N` invocations omit these and `.ts` bps will silently never bind. If no matching config exists, see auto-injection below or pass `--out-files` explicitly.
- For js-debug to consider a JS file at all, the file must fall under the resolved config's `outFiles` (or `resolveSourceMapLocations`) globs. js-debug reads source maps from external `.map` files and from inline maps; both work.
- If the resolved config has no `outFiles` and the workspace has a `tsconfig.json`, dap-cli auto-injects defaults (`dist/**/*.js`, `out/**/*.js`, `build/**/*.js`).
- To override `outFiles` / `resolveSourceMapLocations` without dropping `--config`, use `--out-files <pattern...>` / `--resolve-source-maps <pattern...>` flags or `--json-overrides '{"sourceMaps":true,"outFiles":[...],"resolveSourceMapLocations":[...]}'`.
- **`.ts` bps stay unverified initially in multi-process attach** (`pwa-node` / `pwa-chrome`). That is normal — runtime sources live on children, not the bootstrap parent. Continue and poll; the bp upgrades when the child loads the source.
- **The bp must be on an executable line.** A `.ts` bp on a comment, blank line, or method signature will silently not bind in this adapter — it does not snap forward like an IDE. Open the source and put the breakpoint on a real statement *inside* the function body.

**Three checks before falling back to `.js`:**

1. Did you attach with `--workspace + --config` (or, for raw attach, pass `--out-files` matching your build)?
2. Is the bp on an executable line *inside* the target function body, not a comment / blank / signature?
3. After `continue`, did you poll `status` long enough for the program to plausibly run past that line?

If all three are true and the bp still never fires, *then* set the bp on the `.js` output path as a diagnostic. If the `.js` bp binds and the `.ts` bp didn't, you've isolated a real source-map issue worth reporting; don't quietly accept the `.js` fallback as a pass.

## Attach configs that auto-resume

Some js-debug attach configs (commonly for processes started with `--inspect-brk`) set `continueOnAttach: true`, which immediately resumes the debuggee on attach and leaves no window to set bps before user code runs. To stay paused at entry:

```bash
dap-cli attach --workspace <path> --config "<NAME>" --json-overrides '{"continueOnAttach":false}' --name <session>
```

There is no first-class `--no-continue-on-attach` flag.

## pwa-chrome / multi-renderer

`pwa-chrome` spawns one child per renderer. Children are not directly targetable; every child event is mirrored into the parent's stream with `body.child_session_id` annotated. Discover children with `--show-children`, read events from the parent, then filter by `child_session_id` to isolate one renderer:

```bash
dap-cli sessions --show-children                                     # discover children (parent_session_id, parent#hex name)
dap-cli events --name <parent> --include output --after-cursor 0     # all renderer output mirrors here
# pick a child id from --show-children, then:
dap-cli events --name <parent> --after-cursor 0 \
  | jq '.data.events[] | select(.body.child_session_id == "<child-id>")'
```

Logpoint output from a renderer comes through with `body.category: "stdout"` (js-debug logpoint convention, not `console`); filter on `child_session_id`, not category. Targeting a child directly returns `child_session_not_targetable` with `error.data.parentSessionId` for recovery.

## Wrong-process smoke test

Run immediately after attach to confirm you're talking to the user's process, not an adapter helper:

```bash
dap-cli evaluate --expression "process.pid" --name <session>
lsof -i :<port> | grep LISTEN
```

If the PIDs differ you attached to a helper. The synthetic `dapCli.helperProcessWarning` event covers residual cases (raw `--json` / scripted attach) that `--config` auto-route does not.
