---
phase: 10-auto-route-launch-attach-by-config-request-field-add-json-ov
plan: 03
subsystem: sessions/helperProcessDetection + controller/server
tags: [diagnostics, js-debug, attach, smoke-test]
dependency-graph:
  requires: []
  provides: [dapCli.helperProcessWarning synthetic event for attach smoke tests]
  affects: [src/controller/server.ts startDapSessionFromParams]
tech-stack:
  added: []
  patterns: [synthetic event cache append, in-process test seam, ps-based ppid lookup]
key-files:
  created:
    - src/sessions/helperProcessDetection.ts
    - tests/sessions/helperProcessDetection.test.ts
    - tests/integration/helperProcessDetection.test.ts
  modified:
    - src/controller/server.ts
    - tests/fixtures/fake-adapter-entry.ts
    - docs/AGENT-WORKFLOWS.md
decisions:
  - "Detector lives in src/sessions/ as a pure module; controller wires it per-session inside startDapSessionFromParams."
  - "Test seam is an in-process method (setHelperProcessLookupPpid) rather than a JSON-RPC start parameter, because functions cannot survive JSON serialization."
  - "Test seam signature is (helperPid, adapterPid) so stubs can force a match by returning adapterPid without out-of-band pid discovery."
  - "Warning is appended to DapEventCache as a synthetic event with name dapCli.helperProcessWarning and seq:-1, surfaced through the same events.recent path agents already use."
  - "Detector dedupes on (sessionId, helperPid) to avoid spamming repeat process events."
  - "Windows is a no-op (defaultLookupPpid returns undefined) because ps -o ppid= is not portable."
metrics:
  duration_minutes: ~70
  completed_date: 2025-01-XX
---

# Phase 10 Plan 03: Helper-process detector for js-debug attach

One-liner: Synthetic dapCli.helperProcessWarning event when a js-debug attach session receives a DAP process event whose system process is the adapter helper itself (parent pid equals adapter pid), surfaced through the existing events cache.

## What Was Built

- `src/sessions/helperProcessDetection.ts`: pure detector module with `createHelperProcessDetector(options)`, `defaultLookupPpid(pid)` (spawns `ps -o ppid= -p <pid>`), exported event name `helperProcessWarningEventName`, and types `HelperProcessDetectorOptions` / `HelperProcessDetector` / `HelperProcessWarningBody`. The detector handles DAP `process` events, gates on (mode === 'attach', adapter id === 'js-debug', adapter pid known, body has positive integer systemProcessId, not already-fired for this `(sessionId, helperPid)`), invokes the injected `lookupPpid`, and on `ppid === adapterPid` appends a synthetic event to the supplied event cache.
- `src/controller/server.ts`: imports `createHelperProcessDetector`; per-session, after the existing event-cache subscription in `startDapSessionFromParams`, gated on `descriptor.id === 'js-debug' && startParams.mode === 'attach'`, builds detector options and registers `client.onEvent(event => detector.handleEvent(event))`. New private field + public method `setHelperProcessLookupPpid` provide an in-process test seam that injects a stub receiving both the helper pid and the adapter pid.
- `tests/sessions/helperProcessDetection.test.ts`: 11 unit tests covering positive match, ppid mismatch, launch-mode short-circuit, non-js-debug short-circuit, undefined adapterPid short-circuit, non-process event short-circuit, missing/invalid systemProcessId short-circuit, already-fired guard, lookupPpid rejection silent, lookupPpid undefined silent, dispose suppresses late appends.
- `tests/integration/helperProcessDetection.test.ts`: 4 integration tests proving end-to-end wiring through the controller — positive (warning appears in events.recent), mismatch (no warning), launch-mode (no detector instantiation), non-js-debug (no detector instantiation). Uses the fake adapter spawned via stdio, with the new `attach-with-process-event` script.
- `tests/fixtures/fake-adapter-entry.ts`: new `attach-with-process-event` script that runs the attach lifecycle then emits a DAP `process` event with `systemProcessId: 99999` before `stopped`.
- `docs/AGENT-WORKFLOWS.md`: new "Wrong-process smoke test" section explaining the warning, recommended polling pattern, body shape, and platform/gate caveats.

## Verification

- `npx vitest run helperProcessDetection`: 15/15 pass (11 unit + 4 integration).
- `npx vitest run`: 350 tests pass, 7 skipped (no new failures introduced).
- `npm run build`: clean tsup build (`dist/index.js`).
- `npx tsc --noEmit`: clean.

## Deviations from Plan

**1. [Rule 3 - Blocking] JSON-RPC start-param test seam → in-process method**

- Found during: server wiring, after writing detector module
- Issue: The plan suggested threading `__testHooks.lookupPpid` through `dap.start` JSON-RPC parameters, but functions cannot survive JSON serialization across the controller socket.
- Fix: Replaced with `ControllerServer.setHelperProcessLookupPpid(fn)` — an in-process method on the server instance. Integration tests run the server in-process anyway and already hold the reference.
- Files modified: src/controller/server.ts
- Commit: 18f0010

**2. [Rule 3 - Blocking] Test seam signature: pass adapterPid to stub**

- Found during: integration test development
- Issue: To force a match, the test stub needs the adapter pid, but the spawned-adapter pid is not exposed through the public sessions.list / sessions.status surface (only via internal `cleanupActions` strings). Polling for it before the `process` event arrives also raced with lifecycle.
- Fix: Made the test seam signature `(helperPid, adapterPid) => Promise<number | undefined>`. The controller bridges this to the detector's `(helperPid) => Promise<number | undefined>` shape by closing over the known adapter pid. Tests can now return `adapterPid` to force a match or `adapterPid + 1` to force a miss without out-of-band pid discovery.
- Files modified: src/controller/server.ts
- No production-behavior change; seam is test-only.

## Authentication Gates

None.

## Threat Flags

None.

## Self-Check: PASSED

- src/sessions/helperProcessDetection.ts: FOUND
- tests/sessions/helperProcessDetection.test.ts: FOUND
- tests/integration/helperProcessDetection.test.ts: FOUND
- Commit 18f0010: FOUND
