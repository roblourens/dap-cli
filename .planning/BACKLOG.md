# dap-cli Backlog

Discoveries and follow-up items from Phase 4 exploratory verification.

## Follow-Up Items

- [ ] Fix ambiguous duplicate session name resolution: when multiple sessions share the same name, commands like `status --name node-demo` currently return `session_not_found` even though matching sessions exist. The CLI should report an explicit ambiguity error with matching session IDs and guidance to use `dap-cli use <id>` or pass the session ID.
- [ ] Make real js-debug Node interactive inspection work through CLI commands: the current interactive launch flow can start js-debug, but it does not reliably produce a stopped state or usable `threads`/`stack`/`scopes` output. Agents need a CLI flow that can set breakpoints before `configurationDone`, wait for a stopped state, or otherwise clearly report that the target ran through without pausing.

## Promoted Items

- Phase 5: Stabilize real Chrome/js-debug Playwright handoff.
- Phase 6: Add conditional breakpoint Playwright interop coverage.
- Phase 7: Add evaluate-and-mutate browser state coverage.
- Phase 8: Expand multi-breakpoint UI flow fixture.

## Known Limitations

- Default Playwright interop automation uses a scripted adapter for deterministic dap-cli inspection instead of real Chrome/js-debug attachment. Real adapter behavior is already covered by js-debug smoke tests, but the combined same-browser Playwright handoff remains future work.
- Real js-debug Node launch works, but the current interactive CLI workflow does not yet provide a reliable paused inspection path. Lower-level integration tests can coordinate adapter requests before `configurationDone`; the public CLI needs an equivalent ergonomic flow.
- Duplicate session names are not diagnosed clearly. Ambiguous names can surface as `session_not_found`, which makes live debugging state hard to understand.
- Browser debugging scenarios are sensitive to source path mapping. Local HTTP serving is more reliable than `file://`, but real Chrome attachment still needs explicit validation on each supported platform.
- Conditional breakpoint and expression mutation flows are documented as patterns, not default tests, until their timing and adapter capability assumptions are hardened.

## Future Enhancements

- Provide a first-class `wait-for-stopped` command after v1 polling semantics are proven, reducing boilerplate in Playwright interop harnesses.
- Add a reusable test helper that starts a fixture HTTP server, launches dap-cli, coordinates Playwright actions, and returns typed session inspection helpers.
- Publish a cookbook of Playwright + dap-cli recipes for browser state inspection, breakpoint loops, and failure triage.
