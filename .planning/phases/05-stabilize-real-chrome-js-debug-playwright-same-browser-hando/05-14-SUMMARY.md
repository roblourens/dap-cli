---
phase: 05
plan: 14
subsystem: controller
tags: [gap-closure, child-sessions, pwa-chrome, recursive-coordinator, handoff-smoke]
gap_closure: true
gap_addressed: "gap #11 (handoff-smoke half) — partial: recursive coordinator landed; strict smoke still fails for a different root cause than the 05-12 diagnostic spike hypothesized"
requires:
  - "Plan 05-09 ChildSessionCoordinator.awaitChildrenReady() + warnings-on-failure (commit 5b25dac)."
provides:
  - "src/controller/childSessions.ts: installStartDebuggingHandler(client) private; installed on parent during attach() AND on every new child during bring-up. Detach functions tracked in a Set so dispose() cleans up every client. fanOutSetBreakpoints prefers a non-empty `breakpoints` response over an empty one when aggregating."
  - "tests/controller/sessionManager.test.ts: nested-startDebugging-from-a-child unit test asserts grandchild registration is flat under the original parent."
  - "tests/integration/playwrightInterop.test.ts: setBreakpoints failure message now includes a `dap-cli sessions` snapshot (diagnostic-only — assertion semantics unchanged)."
affects:
  - "Downstream consumers of ChildSessionCoordinator may now see N+M children (flat under the same parent_session_id) for any pwa-chrome session tree that nests startDebugging at depth ≥ 2. Existing routing in aggregateThreads / routeBy* already iterates this.children.values() — no consumer change required."
tech-stack:
  added: []
  patterns:
    - "Per-client serialization chain inside installStartDebuggingHandler — preserves deterministic registration order per source client without requiring a global lock across all clients."
    - "Set<() => void> of detach functions instead of a single field — lets dispose() detach handlers from N clients in one iteration."
key-files:
  created:
    - .planning/phases/05-stabilize-real-chrome-js-debug-playwright-same-browser-hando/05-14-SUMMARY.md
  modified:
    - src/controller/childSessions.ts
    - tests/controller/sessionManager.test.ts
    - tests/integration/playwrightInterop.test.ts
    - .planning/phases/05-stabilize-real-chrome-js-debug-playwright-same-browser-hando/deferred-items.md
    - .planning/ROADMAP.md
decisions:
  - "Install the startDebugging handler on every child as it is brought up, not only on the parent. pwa-chrome's session model can nest at depth ≥ 2, and a single-level handler structurally cannot observe grandchildren. Even though this scenario did not exercise it (see Deferred), the change is a correctness improvement covered by the unit test."
  - "fanOutSetBreakpoints now prefers a child response with a non-empty breakpoints array over one that returned `[]`, falling back to the first defined response. With recursive registration intermediate wrappers can come up as siblings of the page-level child; picking the first defined response would surface the wrapper's empty `[]` and mask the page child's verified result."
  - "Honestly mark gap #11 as still partially open. The 05-12 diagnostic spike's primary hypothesis — that the handoff smoke fails because the controller observes a wrapper rather than a page-level grandchild — was not supported by the data once the recursive coordinator landed. With `__pendingTargetId` + `targetSelection: automatic`, pwa-chrome opens a single child and never emits a nested startDebugging. The smoke remains red for a different reason (likely Hypothesis 2 or 3 in deferred-items.md). DO NOT weaken the assertion to claim closure."
metrics:
  duration: ~45 min
  completed: 2026-05-03
requirements_satisfied:
  - "TEST-07 (partial — recursive coordinator + unit test shipped; strict handoff smoke still fails because pwa-chrome's `__pendingTargetId`+automatic flow does not emit nested startDebugging in this scenario)."
---

# Phase 05 Plan 14: recursive child coordinator for nested pwa-chrome startDebugging — Summary

One-liner: `ChildSessionCoordinator` now installs its `startDebugging` reverse-request handler on every child as it is brought up (not only on the parent), so any pwa-chrome session tree that nests beyond depth 1 collapses into flat sibling children under the original parent. The strict handoff smoke is **not yet green** — runtime evidence shows the wrapper-versus-grandchild hypothesis from 05-12 does not manifest in this scenario, surfacing a third axis that was not covered by this plan.

## What changed

### `src/controller/childSessions.ts`

- **`installStartDebuggingHandler(client: DapClient): () => void`** — new private method. Captures the per-client serialization chain (`chain = chain.then(...)` so registration order in `this.children` stays deterministic per source client), pushes each dispatch promise onto `this.activeHandlers` (so `awaitPendingChildren()` still observes them regardless of which client originated the request), and tracks the returned detach function on a private `Set<() => void>`.
- **`attach()`** — now a one-liner that delegates to `installStartDebuggingHandler(this.options.parentClient)`. The single `detachReverseHandler: (() => void) | undefined` field is replaced by the `Set<() => void>` so multiple clients can be detached cleanly.
- **`handleStartDebugging`** — immediately after `client = factory(transport)` and before `client.request('initialize', ...)`, we call `this.installStartDebuggingHandler(client)`. This is the entire behavioral change: any nested startDebugging from this child now flows back through the same coordinator and registers the grandchild under the same `parentSessionId` / `parentEventCache` / `parentName` (since the registration code already uses those `this.options.*` values, no per-child threading is needed).
- **`dispose()`** — iterates `this.detachHandlers` and calls each detach function (swallowing errors). Existing `awaitPendingChildren()` + child-close ordering is preserved.
- **`fanOutSetBreakpoints`** — `firstWithBreakpoints` now prefers a response whose `breakpoints` array is non-empty over one that returned `breakpoints: []`, falling back to the first response with any defined `breakpoints` field. Rationale: with recursive registration intermediate wrappers can come up as siblings of the page-level child; the wrapper legitimately returns `[]` because the source isn't loaded there, and picking it as the base mask the page child's verified result.

### `tests/controller/sessionManager.test.ts`

- New test: **`nested startDebugging from a child registers a grandchild flat under the same parent`**.
  - Parent emits `startDebugging` → wrapper child is registered (1 child).
  - Wrapper child emits its own `startDebugging` → page-level grandchild is registered as a flat sibling under the original parent (2 children, both with `parent_session_id === parent.id`).
  - Asserts `coordinator.listChildSessionIds().length === 2`, `manager.listChildren(parent.id).length === 2` with both pointing to the original parent, and that the page-level adapter actually received the attach reverse-request configuration (proving the same coordinator's handler ran on the child client, not a no-op).

### `tests/integration/playwrightInterop.test.ts`

- Diagnostic-only: before the gated `breakpoints set`, snapshot `dap-cli sessions` and include the JSON in the `firstBp` assertion's failure message. Success-path semantics are unchanged. Plan 05-14 explicitly permitted this to disambiguate which child the breakpoint resolved on.

## Verification evidence

### `npx tsc --noEmit`

Exit 0.

### `npx vitest run tests/controller`

```
 Test Files  2 passed (2)
      Tests  36 passed (36)
   Duration  516ms
```

(Up from 35 in plan 05-09 → 36 here. The new test is `ChildSessionCoordinator > nested startDebugging from a child registers a grandchild flat under the same parent`.)

### `npm test` (default, non-gated)

```
 Test Files  22 passed (22)
      Tests  161 passed | 5 skipped (166)
   Duration  3.14s
```

Zero regressions outside the gated smokes.

### `npm run test:smoke:handoff` — STILL RED

```
 ❯ tests/integration/playwrightInterop.test.ts (2 tests | 1 failed) 1460ms
   ✓ Playwright interop > coordinates Playwright browser action with dap-cli polling and inspection
   × Playwright interop > coordinates Playwright with the same Chromium target attached by js-debug
     → expected ≥1 breakpoint in setBreakpoints response;
       warnings=[];
       sessions=[
         { id: sess_PsyGej0YgaIyZ7K9, name: chrome-playwright-handoff, lifecycle: running, no parent },
         { id: sess_pH3-Ub2cwUn4P0Iw, name: chrome-playwright-handoff#5505DA09…, lifecycle: attaching, parent_session_id: sess_PsyGej0YgaIyZ7K9 },
       ]
```

**What this tells us:** Only **one** child was registered (`chrome-playwright-handoff#5505DA09…`, named after a CDP target id). pwa-chrome did NOT emit a nested `startDebugging` reverse request in this configuration — the recursive coordinator's installed handler on the wrapper child was never invoked. Therefore Hypothesis 1 from `deferred-items.md` ("nested startDebugging not coordinated") is structurally correct as a correctness fix for any depth-≥2 pwa-chrome tree, but **does not match the actual session shape** for the `__pendingTargetId` + `targetSelection: 'automatic'` configuration the strict handoff smoke uses.

The single child still returns `{breakpoints: []}` (no warnings → no per-child error). Whatever blocks resolution of `file:///…/simple-chrome-page/app.js` against the parsed scripts inside that child is a different axis: more likely Hypothesis 2 (webRoot/file:// mapping inside the child) or Hypothesis 3 (script-load timing — `Debugger.scriptParsed` not replayed by the time `setBreakpoints` is issued, even after `configurationDone`).

### `npm run test:smoke` (combined)

Not run as the closure proof — depends on plan 05-13 (chrome-smoke webRoot edit) shipping in parallel. The handoff half (above) is independent and is the closure proof for this plan; that proof remains red.

## Why recursive (still the right change, even though it didn't unblock this scenario)

The single-handler design was structurally incomplete: `ChildSessionCoordinator.attach()` only installed `onReverseRequest` on the parent, so any nested `startDebugging` from a child was silently unhandled (DapClient's default reverse-request fallback would mark it failed). For any pwa-chrome session tree that DOES nest at depth ≥ 2 — and js-debug's docs and the post-12 diagnostic spike both indicate this happens for some browser/target-selection configurations — the controller would have registered only the depth-1 wrapper and missed the actual debuggee. The new test asserts this works end-to-end at the coordinator layer.

## Out of scope (deferred to a follow-up)

- **The actual root cause of the strict handoff smoke failure.** Evidence now strongly points to Hypothesis 2 or 3 from `deferred-items.md`. A follow-up plan should:
  1. Inside the bring-up child, dump the parsed scripts (`scriptParsed` events from CDP) and the source path the controller tried to set the breakpoint against, side by side.
  2. Test whether `webRoot` is honored by js-debug's pwa-chrome pathBreakpointResolver for `file://` URLs (it is documented to work for `http(s)://` only — this may be the smoking gun).
  3. If webRoot is the issue, switch the source-path mapping in the controller's `setBreakpoints` fan-out to use the `file://` URL form when the child reports it does not understand the absolute path.
- **Further pwa-chrome session-tree depth (≥ 3 levels).** The recursive handler covers any depth in principle (each new child gets the handler before it can emit anything), but no test exercises depth ≥ 3.

## Self-Check

Files claimed:
- `src/controller/childSessions.ts` — FOUND (modified, commits ec558ca + e721f51).
- `tests/controller/sessionManager.test.ts` — FOUND (modified, commit eaf3fe3).
- `tests/integration/playwrightInterop.test.ts` — FOUND (modified, commit e721f51).
- `.planning/phases/05-stabilize-real-chrome-js-debug-playwright-same-browser-hando/05-14-SUMMARY.md` — FOUND (this file).

Commits claimed (all on `main`, none pushed):
- `ec558ca` — `feat(05-14): install startDebugging handler on every child client (recursive)`
- `eaf3fe3` — `test(05-14): nested startDebugging registers grandchild flat under parent`
- `e721f51` — `fix(05-14): prefer non-empty breakpoints when fanning out + handoff diagnostic`

## Self-Check: PASSED
