# Phase 12 Context — Source: analysis.md (external agent feedback)

Added in response to feedback captured in `analysis.md` at the repo root.

## Problem (from analysis.md)

Three related breakpoint-surface gaps an external agent hit while debugging
Code OSS through dap-cli:

1. **`dap-cli breakpoints` has no `list`.** The obvious counterpart to `set`
   is missing. Agents currently have to track breakpoint state externally
   or scrape it out of `set` responses.

2. **No way to clear breakpoints in a source.** The DAP spec's
   "set with empty list = clear" semantics aren't reachable —
   `breakpoints set` requires `--line <number...>`. There's no
   `breakpoints clear --source <path>`.

3. **Verification-timeout diagnostics are misleading.** When the agent
   was attached to the wrong process (see Phase 10), every
   `breakpoints set` returned `verified: false` with a generic
   "verification timed out / check source maps / check outFiles"
   message. The actual problem was that the debuggee had loaded zero
   sources matching the workspace. The diagnostic should expose that.

## In scope for this phase

1. **`dap-cli breakpoints list [--source <path>]`** — return all
   currently-set breakpoints (optionally filtered by source) with their
   current `verified` state, ids, and any reason strings.

2. **`dap-cli breakpoints clear [--source <path>]`** — clear all
   breakpoints in a source via the empty-list `setBreakpoints` semantics.
   Without `--source`, clear all sources we currently track.

3. **Richer verification diagnostics.** When a breakpoint stays unverified
   past the existing timeout, include in the diagnostic:
   - the count of currently loaded sources (from `loadedSources`), and
   - whether any loaded source's path matches (or compiled-output of) the
     breakpoint source, with a wrong-process hint when zero loaded sources
     match the workspace at all.

4. **Surface the `dap loaded-sources` recipe in the error text** so an
   agent reading the failure knows the next thing to run.

## Out of scope

- Conditional/log/data breakpoint surface changes (already covered in
  earlier phases).
- Persistent breakpoint state across controller restarts.
