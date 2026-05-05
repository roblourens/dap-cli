# Deferred Items — Phase 05

## From plan 05-09 (gap closure for gap #11)

### Strict handoff smoke still fails after readiness gate + warnings surface

**Discovered during:** Plan 05-09 Task 2 (running `npm run test:smoke:handoff`).

**Status:** Plan 05-09's diagnosed cause (`fanOutSetBreakpoints` swallowing
errors + readiness race) has been fixed. The smoke now produces a clean
diagnostic instead of an empty success — but the underlying pwa-chrome
setBreakpoints still returns `{ breakpoints: [] }` with no warnings, so the
strict assertion still fails.

**What we observed (with temporary debug logging):**

```
[handleStartDebugging] args={"request":"attach","configuration":{"type":"pwa-chrome","name":"Chrome Debug Test","__pendingTargetId":"E1F44850FC5FAB74029AE9AE00BEECAC"}}
[fanOut] setBreakpoints args={"source":{"path":".../simple-chrome-page/app.js"},"breakpoints":[{"line":2}],"lines":[2]} children=1
[fanOut] child sess_xrjacIMYTEq800k0 ok={"breakpoints":[]}
```

The single child responds to `setBreakpoints` with an **empty `breakpoints` array** (success, no error to surface as a warning). Polling that call for up to 10 s produced the same empty array — so this is not a per-call timing race that the readiness gate or a brief retry can close.

**What this means:**

The plan diagnosed gap #11 as "fanOutSetBreakpoints swallows per-child errors
and returns `{ breakpoints: [] }`" — that is a real bug and 05-09 fixes it
(per-child errors now surface as `warnings`). But it is **not** the only thing
preventing the strict handoff smoke from passing. Even with errors fully
surfaced and per-child readiness gated on `configurationDone`, the
js-debug pwa-chrome child does not resolve breakpoints against
`file://.../simple-chrome-page/app.js` for the page that's already loaded
when we attach.

Likely root causes (need investigation in a follow-up plan):

1. **Nested startDebugging not coordinated.** js-debug's pwa-chrome flow can
   nest sessions: parent → browser-level child → page-level grandchild.
   `ChildSessionCoordinator.attach()` only installs `onReverseRequest` on the
   parent client. If the "child" we observe is the browser-level wrapper
   rather than the page-level session, breakpoints would never resolve there.
2. **Source-path / webRoot mapping.** The fixture page is loaded from `file://`
   with `webRoot` set to the fixture directory. js-debug pwa-chrome may not
   apply webRoot mapping to `file://` URLs, so `/Users/.../app.js` may not
   match the parsed `file:///Users/.../app.js` script in the child's view.
3. **Script-load timing inside the child.** Even after the protocol-level
   handshake completes, CDP `Debugger.scriptParsed` events for already-loaded
   scripts may not have arrived in the child by the time `setBreakpoints` is
   issued. `Debugger.enable` is supposed to replay them, but the timing in
   the wrapper-child case is unclear.

The sibling test `launches Chrome in headless mode and verifies breakpoint
inspection` in `tests/integration/jsDebugAdapter.test.ts` exhibits the same
class of failure (per plan 05-08 SUMMARY: "10s timeout waiting for
stopped/terminated"). That confirms this is a broader pwa-chrome breakpoint
integration issue, not specific to the handoff scenario.

**Follow-up triage (post 05-12, by direct repro):**

Re-ran `npx vitest run tests/integration/jsDebugAdapter.test.ts -t "launches
Chrome in headless mode"` with `DAP_CLI_RUN_BROWSER_SMOKES=1`. The test
passes `setBreakpoints` itself — line 229 `expect(breakpoints.breakpoints)
.toHaveLength(1)` succeeds — but then the test times out at line 246 waiting
for a `stopped` event. So js-debug at the **parent client level** acknowledges
the breakpoint (returns `[{...}]` of length 1) but the breakpoint never
resolves/fires when the page actually executes. The chrome-smoke launch config
has NO `webRoot` set — without it js-debug pwa-chrome can't map
`/Users/.../app.js` to the parsed `file:///Users/.../app.js` script URL.
That plus the `targetSelection: 'automatic'` flow likely explains both:

- **Chrome smoke (no controller):** parent returns the bp placeholder (length 1)
  but it never gets resolved against the real script → no stopped event.
- **Handoff smoke (through controller fanOut):** the child returns
  `{breakpoints: []}` — a DAP spec violation (a request listing N bps must
  return N entries). Strongly suggests the "child" the coordinator sees is an
  intermediate wrapper, not the page-level grandchild that owns the script.
  Hypothesis 1 (nested startDebugging) is the more likely primary cause for
  the handoff smoke; Hypothesis 2 (webRoot/file:// mapping) is the cause for
  the chrome smoke and may also be needed at the page child once it's exposed.

**What 05-09 still delivered:**

- `fanOutSetBreakpoints` no longer swallows per-child errors. Future failure
  modes will be visible in the response's `warnings` array instead of
  silently producing `{ breakpoints: [] }`.
- `ChildSessionCoordinator.awaitChildrenReady()` is public and used by
  `fanOutSetBreakpoints` to gate fan-out commands on per-child handshake
  completion. This closes the protocol-level race (children that appear in
  `threads` but have not yet finished `configurationDone`).
- Strict handoff smoke is now wired through the shared
  `provisionAdapterIntoTempEnv` helper (matches plan 05-08's chrome
  children smoke) and skips cleanly without the user's local `js-debug`.
- The smoke test's failure message now dumps `warnings` so the next
  investigator has a diagnostic surface instead of `expected undefined to be
  defined`.

**Recommended next plan:**

A follow-up plan to (a) recursively coordinate nested startDebugging so
page-level grandchildren are observable, (b) diagnose webRoot/file:// path
mapping with js-debug pwa-chrome, and (c) make the sibling
`launches Chrome in headless mode` test green at the same time. These two
gated smokes share root cause and should be fixed together.

## From plan 05-13 (gap-closure attempt for gap #11 chrome-smoke half)

### `webRoot` alone does NOT close chrome-smoke; raw single-process test client is also blind to nested startDebugging

**Discovered during:** Plan 05-13 verification re-run with `DAP_CLI_RUN_BROWSER_SMOKES=1`.

**What we did:** Added `webRoot: path.dirname(page)` to the `launches Chrome in headless mode and verifies breakpoint inspection` smoke's launchArgs (the only edit the plan called for). Re-ran the gated smoke.

**What we observed:** Identical failure mode — `setBreakpoints` returns the length-1 placeholder, then the test times out at 10s waiting for `stopped or terminated`. webRoot did not change behavior.

**New finding:** The post-12 hypothesis that the chrome-smoke and handoff-smoke halves of gap #11 had independent root causes is wrong. Both halves rely on nested startDebugging: the page-level CDP target lives in a grandchild that the parent js-debug session spawns via `startDebugging` reverse requests. The raw single-process `DapClient` used by the chrome-smoke does NOT handle reverse requests, so the page grandchild is never connected, no script is ever parsed *in the parent*, and the bp placeholder never resolves regardless of webRoot.

**Why keep the webRoot edit:** It's still correct (matches handoff-smoke parity, required for the page child once it IS connected), and it removes a real configuration gap as a precondition for 05-14.

**Recommended follow-up after 05-14 ships:** Decide between (a) inlining a startDebugging reverse-request handler into `runJsDebugBreakpointSmoke` to keep the raw single-process test path, or (b) rewriting the chrome-smoke to drive through the controller and inherit 05-14's coordinator. Option (b) is the lower-risk path because it shares the same code path being verified by the handoff smoke.

## From plan 05-14 (gap-closure attempt for gap #11 handoff-smoke half)

### Recursive coordinator landed; nested-startDebugging hypothesis NOT supported by runtime evidence — gap #11 still open

**Discovered during:** Plan 05-14 Task 3 (re-running `npm run test:smoke:handoff` after the recursive coordinator + unit test landed in commits ec558ca + eaf3fe3 + e721f51).

**What 05-14 shipped (and is correct):**
- `ChildSessionCoordinator.installStartDebuggingHandler(client)` is private and installed on parent AND every child as it is brought up.
- `dispose()` detaches handlers from every client.
- New unit test `nested startDebugging from a child registers a grandchild flat under the same parent` proves the recursive registration path works at the coordinator layer (parent emits startDebugging → wrapper child registered → wrapper emits startDebugging → page-level grandchild registered as a flat sibling under the original parent).
- `fanOutSetBreakpoints` now prefers a non-empty `breakpoints` response over an empty `[]` when aggregating — defends against the wrapper-returns-empty mask once depth-≥2 trees do appear.

**What we observed when re-running the strict handoff smoke (same as before 05-14, plus a `dap-cli sessions` snapshot taken just before `breakpoints set`):**

```
sessions: [
  { id: sess_PsyGej0YgaIyZ7K9, name: chrome-playwright-handoff,
    adapter: js-debug, lifecycle: running, no parent_session_id },
  { id: sess_pH3-Ub2cwUn4P0Iw,
    name: chrome-playwright-handoff#5505DA090C132E53042F7EF5F9FA6AB1,
    adapter: js-debug, lifecycle: attaching,
    parent_session_id: sess_PsyGej0YgaIyZ7K9 },
]
warnings: []
breakpoints: []
```

**Only one child.** The single child is named `<parent>#<32-hex-CDP-target-id>` — i.e. it's already the child for a specific CDP target, not an intermediate browser-level wrapper. pwa-chrome did NOT emit a nested `startDebugging` reverse request from this child. The recursive coordinator's installed handler on the wrapper-child was therefore never invoked; the change is structurally correct but does not match the actual session shape produced by the `__pendingTargetId` + `targetSelection: 'automatic'` configuration the strict handoff smoke uses.

**What this means for gap #11:**

Hypothesis 1 ("nested startDebugging not coordinated") from the post-12 diagnostic spike is structurally a real correctness gap (and now fixed), but it is NOT the active root cause of the handoff-smoke failure. The single child still returns `{breakpoints: []}` with NO per-child error to surface as a warning — i.e. js-debug acknowledges the request and successfully responds with an empty breakpoints array. That points at Hypothesis 2 (webRoot/file:// path mapping inside the child) or Hypothesis 3 (script-load timing — `Debugger.scriptParsed` for an already-loaded page not replayed by the time the controller issues `setBreakpoints` on the child even after `configurationDone`).

**Recommended next plan:**

A targeted instrumentation pass that, inside the bring-up of the page-level child, dumps:
1. The full list of `scriptParsed` events the child has observed at the moment `setBreakpoints` is issued (URLs and source-map URLs).
2. The exact `setBreakpoints` argument the controller sent (source.path, source.name, the resolved `webRoot`).
3. Whether js-debug's pwa-chrome pathBreakpointResolver applies `webRoot` to `file://` URLs at all (current evidence suggests it may only apply to `http(s)://`).

Likely fix surfaces:
- (a) Pass the `file://` URL form (not the absolute filesystem path) in `source.path` when the child is a pwa-chrome session and the original request used a filesystem path.
- (b) Re-issue `setBreakpoints` against the child after the next `loadedSource`/`scriptParsed` event for the matching URL fires (replace the readiness gate's "after configurationDone" criterion with "after the page child has parsed the source we want a breakpoint in").

**Definitive triage from direct js-debug DAP trace (post 05-14):**

Wrote a standalone DAP client (`/tmp/jsd-trace-runner.mjs`) that talks to
`dapDebugServer.js` directly (no controller, no test framework) and enabled
`trace: { logFile: '/tmp/jsd-trace.log', level: 'verbose' }` in the launch
config. Captured the full DAP + CDP traffic. Findings:

1. **Parent's `setBreakpoints` returns `{verified:false, message:"breakpoint.provisionalBreakpoint"}`** — parent owns a provisional bp registry and is supposed to propagate to child sessions when they're brought up. This is by-design js-debug behavior, not a bug.

2. **Parent emits `startDebugging` reverse request after `configurationDone`.** A correct DAP client MUST handle this and bring up a new child DAP connection back to js-debug. Without it, the page-level child is never created, the provisional breakpoint never gets propagated, and `stopped` is never fired. `ChildSessionCoordinator.installStartDebuggingHandler` (shipped in 05-14) does this — but only when going through the controller. The raw `runJsDebugBreakpointSmoke` helper in `tests/integration/jsDebugAdapter.test.ts` does NOT install such a handler, which is why the chrome smoke times out even with `webRoot` set (05-13).

3. **`fanOutSetBreakpoints` over children is the wrong strategy for pwa-chrome.** Children return `{breakpoints: []}` because js-debug pwa-chrome child sessions don't accept direct `setBreakpoints` — the parent owns the bp registry. The controller should send `setBreakpoints` to the **parent** session and rely on js-debug's internal propagation to children.

**The actual fix path for gap #11 (now sharply scoped):**

- **Plan 05-15 (handoff smoke):** in `ChildSessionCoordinator.maybeIntercept`, do NOT route `setBreakpoints` through `fanOutSetBreakpoints` for js-debug pwa-chrome. Send it to the parent client instead. Wait for the `breakpoint` event (with `reason: "changed"` / `verified: true`) to confirm resolution. Update `awaitChildrenReady`-style semantics so the response reflects the resolved state.
- **Plan 05-16 (chrome smoke):** rewrite `runJsDebugBreakpointSmoke` for pwa-chrome to install a `startDebugging` reverse-request handler that opens a child DAP connection and drives the child handshake, OR migrate the chrome-smoke to run through the controller (where 05-14's recursive coordinator already handles startDebugging for free).

The fundamental mistake in plans 05-09 and 05-14 was assuming `setBreakpoints` should be fanned out to children. js-debug pwa-chrome's actual contract is: parent owns bp registry, children receive bps via internal propagation. Documented in `/memories/repo/dap-cli.md` so future planning sessions don't repeat the assumption.

## From plan 05-21 (gap H-5)

**Pre-existing TS error in `src/sessions/sessionStore.ts:63`** —
`parent_session_id: string | undefined` from the zod schema is not assignable
to `SessionRecord.parent_session_id: string` under
`exactOptionalPropertyTypes: true`. Reproduces on a clean checkout of `main`
at `6b155cd` BEFORE plan 05-21 changes (verified via `git stash` round-trip).
Likely fallout from plan 05-19's parent_session_id schema work. Not in scope
for H-5; flagged for follow-up to either widen `SessionRecord` to
`string | undefined` or strip undefined keys when constructing the record
inside `sessionStore.ts`.

## From plan 05-22 Task 3 (gap H-6 regression test)

**Architecture-test failure introduced by parallel plan 05-23**:
`tests/architecture/moduleBoundaries.test.ts > module boundaries > protocol modules remain language-neutral` fails because plan 05-23's commit `c5c57cf` added the literal `js-debug` to `src/protocol/lifecycle.ts` (likely in the new `disconnect({terminateDebuggee:true})` plumbing). The architecture test forbids js-debug literals in `src/protocol/*` so adapter-specific knowledge stays out of the language-neutral protocol layer.

Out of scope for plan 05-22 (this is 05-23's surface). Filed here for the 05-23 author to either (a) move the js-debug branch out of `src/protocol/lifecycle.ts` into `src/adapters/builtins/jsDebug.ts` or `src/controller/server.ts`, or (b) refactor the disconnect plumbing so protocol code is parametrized rather than naming the adapter.

Reproduces with `npx vitest run tests/architecture/moduleBoundaries.test.ts`. Baseline regression: was 216 passed | 5 skipped | 0 failed before wave 3; now 222 passed | 6 skipped | 1 failed (the +6 = 05-22's H-6 unit test + 05-23's H-8 tests + 05-22's H-6 integration test).
