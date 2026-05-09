# Phase 10 Context — Source: analysis.md (external agent feedback)

Added in response to feedback captured in `analysis.md` at the repo root after
an external agent ran dap-cli against Code OSS and hit several rough edges.

## Problem (from analysis.md)

dap-cli has two top-level verbs — `launch` and `attach` — and they hard-code
which DAP request to send to the adapter regardless of the resolved
launch.json config's `request:` field. Running:

```
dap-cli launch --config "Attach to Agent Host Process"
```

against an attach-shaped config (`"request":"attach", "port":5878`) silently
sends a DAP `launch` request. js-debug then spawns a bare `node` helper
process and reports it as the debuggee — the real attach target (the agent
host listening on `:5878`) is never touched. Symptoms: bogus `process.pid`,
empty `require.cache`, empty `loaded-sources`, breakpoints stay `Unbound`,
and no diagnostic that anything is wrong.

The fix the external agent eventually used was simply
`dap-cli attach --config "Attach to Agent Host Process"` — same config,
right verb.

## In scope for this phase

1. **Auto-route or hard-error on `--config` mismatch.** When `--config` is
   used, inspect the resolved config's `request:` field. Either:
   - auto-route to the matching DAP verb (preferred — the launch.json name
     is unambiguous), OR
   - fail with an actionable error like
     `config 'Attach to Agent Host Process' has request:'attach'; use
     'dap-cli attach --config …' instead`.

   No more silent success on mismatched verb+config.

2. **`--json-overrides` flag** to merge extra fields onto a `--config`-resolved
   config object. Today the only escape hatch is to drop `--config` entirely
   and rebuild the whole config via `--json`. Repos like vscode set only
   `outFiles` in their attach config, but js-debug also wants
   `resolveSourceMapLocations` and explicit `sourceMaps: true`; you should
   be able to layer those on without abandoning `--config`.

3. **`--resolve-source-maps` passthrough flag** so the most common missing
   field can be set without `--json` or `--json-overrides`.

4. **Helper-process detection warning.** When js-debug reports an
   attach-target PID whose `ppid` equals the dapDebugServer PID, dap-cli
   should warn that we likely attached to an adapter-spawned helper process
   ("you probably meant `attach`, not `launch`"). This is the diagnostic
   that would have caught the original bug instantly.

## Out of scope

- Reworking the verb surface (e.g. unifying `launch`/`attach` into one
  command). Keep both verbs; just fix the dispatch and add the override flags.
