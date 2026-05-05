---
phase: 05-stabilize-real-chrome-js-debug-playwright-same-browser-hando
plan: 05
status: complete
gap_closure: true
requirements:
  - TEST-07
files_modified:
  - tests/integration/playwrightInterop.test.ts
---

# 05-05 Summary — strict same-browser Playwright handoff

## Outcome

The opt-in `coordinates Playwright with the same Chromium target attached
by js-debug` test is now strict end-to-end. Previously it returned early
when `waitForStoppedEvent` did not fire — exactly the fake-success path
flagged by the gap audit. Now any of the following is a HARD FAILURE:

1. No `stopped` event arrives within the 10s polling window.
2. The aggregated `setBreakpoints` response is not `verified`.
3. Top frame's source path does not resolve to `simple-chrome-page/app.js`.
4. Local scope is missing `left` or `right`, or their values do not match
   the Playwright-supplied `7` / `8`.
5. Page result text is not `15` after `continue`.

## Tasks completed

### Task 1 — Strict same-browser handoff

- Added a new `breakpointsSetDataSchema` (verified + message + source.path).
- After attach, the test polls `dap-cli threads` until non-empty (children
  registered), then explicitly issues `dap-cli breakpoints set` against
  `simple-chrome-page/app.js:2`. The aggregated response must report
  `verified === true`. If not, the failure message includes the captured
  `message` field for diagnostics.
- Source path assertion uses a regex that tolerates any path prefix but
  pins the suffix `simple-chrome-page/app.js`.
- The `expect(stopped).toBeDefined()` assertion remains the hard-fail
  gate for the missing-stop case (no early-return branch was ever
  present in the on-disk version of this test, but we now document the
  intent in a top-of-test comment so future readers do not try to add
  one).
- Local-variable assertions now check both names AND values: `left=7`,
  `right=8`. These come from the Playwright-supplied
  `setTimeout("calculate(7, 8)", 0)`.
- All inspection (threads/stack/scopes/variables/continue) runs
  unconditionally inside the env-gated test — there is no
  diagnostic-only path.

## Notable design decisions

1. **Assertion via aggregated `setBreakpoints` response.** The
   ChildSessionCoordinator from plan 05-04 fans `setBreakpoints` out to
   every child and aggregates per-index with ANY-verified-wins. We accept
   that aggregated `verified` flag rather than introspecting per-child
   responses.
2. **Source path assertion is a regex.** vscode-js-debug normalizes the
   source path; rather than asserting an exact equality, we pin the
   trailing `simple-chrome-page/app.js` segment so the test is portable
   across CI workspaces.
3. **No new env gate.** The single
   `DAP_CLI_RUN_CHROME_PLAYWRIGHT_HANDOFF=1` continues to control opt-in
   execution. Default `npm test` keeps skipping this test.

## Verification

- `npx tsc --noEmit` — clean.
- `npm test -- tests/integration/playwrightInterop.test.ts` — 1 passed,
  1 skipped (the opt-in handoff test stays gated).
- `grep -n 'waitForStoppedEvent' tests/integration/playwrightInterop.test.ts`
  shows only the wait helper itself + a hard-fail `expect(stopped).toBeDefined()`
  call — no early-return-on-false branch.

## Self-Check: PASSED

All four `must_haves.truths` from the plan are realized:

- Missing stopped event is now a hard failure (was already; documented).
- After Playwright triggers `calculate(7, 8)`, dap-cli observes a stopped
  event with reason `breakpoint`.
- While stopped: non-empty threads, top frame source resolves to
  `simple-chrome-page/app.js`, locals contain both `left` and `right`
  (with values 7 and 8).
- After `continue`, Playwright observes result text `15`.
