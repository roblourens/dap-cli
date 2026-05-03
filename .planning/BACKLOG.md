# dap-cli Backlog

Discoveries and follow-up items from Phase 4 exploratory verification.

## Follow-Up Items

No open follow-up items remain in this backlog after review.

## Promoted Items

- Phase 5: Stabilize real Chrome/js-debug Playwright handoff.
- Phase 6: Add conditional breakpoint Playwright interop coverage.
- Phase 7: Add evaluate-and-mutate browser state coverage.
- Phase 8: Expand multi-breakpoint UI flow fixture.

## Known Limitations

- Default Playwright interop automation uses a scripted adapter for deterministic dap-cli inspection instead of real Chrome/js-debug attachment. Real adapter behavior is already covered by js-debug smoke tests, but the combined same-browser Playwright handoff remains future work.
- Browser debugging scenarios are sensitive to source path mapping. Local HTTP serving is more reliable than `file://`, but real Chrome attachment still needs explicit validation on each supported platform.
- Conditional breakpoint and expression mutation flows are documented as patterns, not default tests, until their timing and adapter capability assumptions are hardened.

## Future Enhancements

- Provide a first-class `wait-for-stopped` command after v1 polling semantics are proven, reducing boilerplate in Playwright interop harnesses.
- Add a reusable test helper that starts a fixture HTTP server, launches dap-cli, coordinates Playwright actions, and returns typed session inspection helpers.
- Publish a cookbook of Playwright + dap-cli recipes for browser state inspection, breakpoint loops, and failure triage.
