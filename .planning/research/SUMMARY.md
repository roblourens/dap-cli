# Research Summary

**Domain:** Agent-facing Debug Adapter Protocol CLI
**Researched:** 2026-05-02
**Confidence:** HIGH for v1 direction

## Key Findings

**Stack:** Build a TypeScript/Node CLI with a persistent controller, commander for command routing, zod for validation, and generated DAP command metadata from the official protocol JSON. `@vscode/debugprotocol` is useful but currently behind the latest published DAP spec, so it should not be the only source for full typed coverage.

**Table Stakes:** The product needs a Playwright-style stateful session model, generic DAP transport/client behavior, typed request commands for the whole protocol, polling-based pause inspection, JSON output, built-in JS/Python adapter descriptors, and custom adapter config.

**Watch Out For:** Do not treat DAP as stateless. Model initialize/launch/attach/configurationDone/stopped lifecycle explicitly, keep adapter-specific behavior out of core, and assume adapter packaging will vary by language and platform.

## Recommended v1 Direction

1. Start with the controller/session foundation and fake adapter tests.
2. Build the generic DAP client and event cache before real adapters.
3. Generate full typed request command coverage from official DAP metadata.
4. Add ergonomic aliases for the commands agents will use constantly.
5. Add built-in JavaScript and Python adapter descriptors plus smoke tests.
6. Finish with config, logs, diagnostics, docs, and agent workflow examples.

## Requirements Implications

- v1 must include lifecycle commands: launch, attach/open, list/status, active-session selection, and stop/close.
- v1 must include inspection commands: threads, stackTrace, scopes, variables, evaluate, source context, and recent events/status.
- v1 must include execution control: continue, pause, next, stepIn, stepOut, and breakpoint operations.
- v1 must include generated DAP request command coverage, not only hand-written common commands.
- v1 should defer blocking wait/event streams until polling proves the workflow.

## Roadmap Implications

- The first phase should establish project scaffolding, the controller, the DAP client, and fake adapter verification.
- A separate phase should focus on generated command coverage because it is broad and foundational.
- Adapter bundling deserves its own phase because JS and Python have different packaging/runtime concerns.
- Final v1 polish should cover config, diagnostics, docs, security defaults, and Playwright-style workflow examples.

## Sources

- `.planning/PROJECT.md`
- `.planning/research/STACK.md`
- `.planning/research/FEATURES.md`
- `.planning/research/ARCHITECTURE.md`
- `.planning/research/PITFALLS.md`

---
*Research summary for: Agent-facing DAP CLI*
*Researched: 2026-05-02*