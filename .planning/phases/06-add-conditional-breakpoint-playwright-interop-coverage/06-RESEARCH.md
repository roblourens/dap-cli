---
phase: 06-add-conditional-breakpoint-playwright-interop-coverage
status: complete
created: 2026-05-05
---

# Phase 06 Research: Conditional Breakpoint Playwright Interop Coverage

## Research Complete

Phase 6 is a focused extension of existing DAP-first breakpoint and Playwright interop work. No new external dependency or adapter architecture is required.

## Existing Surfaces

- `src/cli/commands/dapAliases.ts` owns the friendly `breakpoints set` alias. It currently builds `setBreakpoints` with `source`, `breakpoints: [{ line }]`, and `lines`.
- `tests/fixtures/fake-adapter-entry.ts` can validate exact DAP request arguments by script name. This is the fastest always-runnable proof that alias flags become DAP breakpoint metadata.
- `src/controller/childSessions.ts` already routes `setBreakpoints` for js-debug parents and fake multi-process children. Phase 6 should test that `condition`, `hitCondition`, and `logMessage` survive this routing without adding capability pre-gates.
- `tests/integration/playwrightInterop.test.ts` contains the canonical same-browser Playwright plus js-debug handoff pattern and should host the browser-level conditional breakpoint proof.
- `docs/PLAYWRIGHT-INTEROP.md` is the canonical agent-facing workflow doc for combining dap-cli with Playwright polling.

## Decisions From Research

- Use `--condition`, `--hit-condition`, and `--log-message` on `breakpoints set` because they map directly to the DAP breakpoint fields `condition`, `hitCondition`, and `logMessage`.
- Keep the existing DAP-first policy: do not pre-check adapter capabilities for these fields. Send the fields and surface adapter breakpoint `verified`, `message`, and `warnings` results.
- Copy supplied metadata to every line when `--line` has multiple values. This matches the existing one-command-many-lines alias shape and preserves user intent.
- Prove behavior in three layers: alias payload construction with fake adapter, child-session routing preservation with controller unit coverage, and same-browser conditional pause behavior with the existing gated Playwright/js-debug smoke.

## Validation Architecture

| Layer | Purpose | Command |
| --- | --- | --- |
| Alias payload | Always-runnable proof that CLI flags produce the expected DAP shape | `npm test -- tests/integration/fakeAdapterCli.test.ts` |
| Routing preservation | Proof that metadata survives child-session fan-out and js-debug parent routing | `npm test -- tests/controller/sessionManager.test.ts` |
| Browser interop | Gated proof that Playwright-triggered browser behavior respects a conditional breakpoint | `DAP_CLI_RUN_CHROME_PLAYWRIGHT_HANDOFF=1 npm test -- tests/integration/playwrightInterop.test.ts` |
| Docs | Agent-facing commands remain accurate | `npm test -- tests/integration/docsValidation.test.ts` |

## Out Of Scope

- Event streaming, blocking waits, new adapter capability policy, and redesigned child-session routing.
- New Playwright architecture or a replacement fixture. Reuse the existing simple Chrome page and polling model.
