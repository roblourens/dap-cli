# Phase 2: Complete Typed DAP Command Surface - Research

**Researched:** 2026-05-02
**Domain:** Debug Adapter Protocol CLI command generation and typed request routing
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
## Implementation Decisions

### Protocol Metadata Source and Generation
- **D-01:** Treat official DAP protocol metadata/types as the source of truth for request inventory; do not maintain the full DAP command list by hand.
- **D-02:** Generate a local typed command registry artifact that maps DAP request names to CLI command metadata, argument validation, and routing metadata. The generated output should be deterministic and committed so coverage diffs are reviewable.
- **D-03:** Keep handwritten ergonomic aliases as thin wrappers over the generated registry and generic routing path rather than duplicating protocol request logic.

### CLI Command Shape
- **D-04:** Preserve the existing top-level `request <command> --json '{}'` escape hatch and add typed commands beside it, using names that match DAP concepts where possible.
- **D-05:** Common workflows should be ergonomic first-class aliases: breakpoint management, threads/stack/scopes/variables inspection, evaluate, continue, pause, step over, step in, and step out.
- **D-06:** Generated commands must use the existing stdout JSON envelope, `CliError` categories, session targeting semantics, and controller IPC client pattern.

### Capability and Unsupported Behavior
- **D-07:** Unsupported or unavailable adapter capabilities should be reported as structured handled failures, not as thrown internal errors or raw adapter messages.
- **D-08:** Capability reporting should be available to agents before or after command execution through machine-readable JSON, and failures should include request command, session ID, and adapter diagnostics when available.

### Scripted Coverage
- **D-09:** Add tests that compare generated command inventory against the selected official DAP metadata so newly missing official requests fail deterministically.
- **D-10:** Keep deterministic fake-adapter tests as the Phase 2 safety net for representative success, unsupported capability, paused/unpaused, raw passthrough, and ergonomic alias behavior.

### the agent's Discretion
- Choose the exact generator file layout, registry module names, and validation library usage as long as the implementation stays consistent with Phase 1 TypeScript, Commander, zod, and Vitest patterns.
- Choose the smallest useful set of representative DAP request fixtures for behavior tests, while inventory tests must cover the full official request list.

### Deferred Ideas (OUT OF SCOPE)
## Deferred Ideas

- Real JavaScript and Python adapter flows remain Phase 3.
- Documentation polish and Playwright interop examples remain Phase 4.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| DAP-03 | Agent can invoke every DAP request through a generated typed CLI command derived from official protocol metadata. | The official schema fetch found 46 `*Request` definitions and command enum strings; use that inventory as the generator input and test oracle. [VERIFIED: official schema fetch] |
| DAP-04 | Agent can use raw JSON DAP request passthrough as an escape hatch. | `src/cli/commands/dapCore.ts` already exposes `request <command> --json '{}'` and routes through controller method `dap.request`; preserve this shape. [VERIFIED: codebase read] |
| DAP-05 | dap-cli reports adapter capabilities and unsupported requests clearly. | `initialize` already returns capabilities from `DapLifecycleController.start`, but the runtime does not persist/query them yet; Phase 2 should store them on `DapSessionRuntime` and expose a JSON command. [VERIFIED: codebase read] |
| DBG-01 | Agent can set, replace, and inspect breakpoints. | DAP `setBreakpoints` replaces breakpoints for one source and returns verified/unverified breakpoint results; model aliases around this semantics. [CITED: microsoft.github.io/debug-adapter-protocol/overview] |
| DBG-02 | Agent can inspect threads, stack traces, scopes, and variables. | DAP paused-state inspection follows `threads -> stackTrace -> scopes -> variables`, and object references are valid only for the current suspended state. [CITED: microsoft.github.io/debug-adapter-protocol/overview] |
| DBG-03 | Agent can continue, pause, step over, step in, and step out when supported. | Official request inventory includes `continue`, `pause`, `next`, `stepIn`, and `stepOut`; generated commands plus aliases should route to those request commands. [VERIFIED: official schema fetch] |
| DBG-04 | Agent can evaluate expressions and inspect source context. | Official request inventory includes `evaluate`, `source`, `loadedSources`, `modules`, `completions`, `exceptionInfo`, and memory/disassembly requests behind capabilities. [VERIFIED: official schema fetch] |
| TEST-02 | Generated command coverage is tested against official DAP metadata. | The generator should emit a deterministic registry and a test should compare registry command strings to schema-derived command strings. [VERIFIED: project decisions + official schema fetch] |
| TEST-05 | Deterministic scripted tests exercise every implemented feature and supported command path. | Existing Vitest CLI integration uses isolated `DAP_CLI_HOME`, fake adapter scripts, one JSON envelope, and empty stderr assertions; extend this pattern. [VERIFIED: codebase read] |
</phase_requirements>

## Summary

Phase 2 should not create a second DAP execution path. The existing CLI already has a raw request command that sends `{ command, args, name }` to controller method `dap.request`, and the controller already resolves explicit/active sessions, calls `DapClient.request`, and maps failed DAP responses into handled JSON failures with session, request, adapter stderr, and log-path context. [VERIFIED: codebase read]

The planning-critical work is a generated command registry from the official DAP schema, a thin Commander registration layer over that registry, a capability/reporting layer backed by initialize response capabilities, and fake-adapter coverage that proves representative typed commands and aliases preserve Phase 1 contracts. [VERIFIED: official schema fetch + codebase read]

**Primary recommendation:** Generate `src/generated/dapCommandRegistry.ts` from the official `debugAdapterProtocol.json`, commit it, register all generated typed commands through one shared `sendDapRequest` helper, and keep ergonomic aliases as metadata-backed wrappers over the same route. [VERIFIED: project decisions]

## Project Constraints (from copilot-instructions.md)

- Use Node.js and TypeScript, keep the protocol core vanilla DAP, and do not bind Phase 2 to JavaScript or Python adapters. [VERIFIED: copilot-instructions.md]
- CLI calls must share debugger state across commands through the persistent controller. [VERIFIED: copilot-instructions.md]
- v1 remains polling-only; do not add streaming, watch, subscribe, or blocking wait semantics in Phase 2. [VERIFIED: copilot-instructions.md + architecture tests]
- Keep module boundaries: `cli/` parses commands and JSON output only; `controller/` owns session routing and request sequencing; `protocol/` stays language-neutral; `generator/` is the correct home for official DAP metadata generation. [VERIFIED: copilot-instructions.md]
- Use mcp-debugger as product-shape inspiration where helpful. [VERIFIED: copilot-instructions.md]
- Direct edits outside a GSD workflow are normally discouraged, but this task explicitly asks for a research artifact write. [VERIFIED: copilot-instructions.md + user request]

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|--------------|----------------|-----------|
| Official DAP request inventory | Build/generator | CLI | Generator should parse schema once into a deterministic committed registry; CLI should consume metadata only. [VERIFIED: project decisions] |
| Typed command parsing | CLI | Generator | Commander/zod should validate CLI arguments, then normalize to DAP `arguments`; generated metadata supplies names/options. [VERIFIED: codebase patterns] |
| DAP request execution | Controller | Protocol | Existing `dap.request` route already owns session resolution and calls `DapClient.request`; generated commands should converge there. [VERIFIED: codebase read] |
| Capability storage/reporting | Controller | CLI | Capabilities arrive during lifecycle initialization and must be associated with the runtime/session before CLI can report or preflight them. [VERIFIED: codebase read + DAP docs] |
| Ergonomic aliases | CLI | Controller | Aliases are user-facing command shapes; they should produce the same normalized request metadata as generated commands. [VERIFIED: project decisions] |
| Fake-adapter behavior coverage | Tests/testing | Protocol | Existing fake adapters provide deterministic DAP request/response scripts without real JS/Python adapter scope. [VERIFIED: codebase read] |

## Standard Stack

### Core
| Library / Source | Version | Purpose | Why Standard |
|------------------|---------|---------|--------------|
| Official DAP JSON schema | fetched 2026-05-02; no schema version field found | Source of request inventory and capability property names | It is the official protocol metadata and currently yields 46 request command strings. [VERIFIED: official schema fetch] |
| `@vscode/debugprotocol` | 1.68.0, published 2024-10-03 | TypeScript DAP declarations | Installed locally and useful for request/response type names, but older than current official schema inventory. [VERIFIED: npm registry + node_modules read] |
| `commander` | 14.0.3, published 2026-01-31 | CLI command/subcommand registration | Existing CLI uses Commander and `exitOverride`; generated registrations should follow it. [VERIFIED: npm registry + codebase read] |
| `zod` | 4.4.2, published 2026-05-01 | Runtime validation | Existing controller IPC schemas use zod at boundaries. [VERIFIED: npm registry + codebase read] |
| `vitest` | 4.1.5, published 2026-04-21 | Tests | Existing tests use Vitest for architecture, CLI, protocol, controller, and integration coverage. [VERIFIED: npm registry + codebase read] |
| `typescript` | 6.0.3, published 2026-04-16 | Implementation/generator typing | Project is TypeScript ESM and `tsc --noEmit` is the typecheck command. [VERIFIED: npm registry + package.json] |

### Supporting
| Library / Tool | Version | Purpose | When to Use |
|----------------|---------|---------|-------------|
| Node.js | v22.22.1 locally | Runtime and generator execution | Use for scripts that fetch/parse schema and emit TypeScript. [VERIFIED: local environment] |
| npm | 10.9.4 locally | Dependency/package metadata | Use `npm view` for current registry versions. [VERIFIED: local environment] |
| `rg` | available locally | Inventory/code checks | Use for architecture/test audits and generator coverage debugging. [VERIFIED: local environment] |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Official schema generator | Handwritten full command list | Violates D-01 and will miss protocol additions. [VERIFIED: project decisions] |
| Committed generated registry | Runtime schema fetch | Runtime fetch adds network nondeterminism to CLI execution; committed output gives reviewable diffs. [VERIFIED: project decisions] |
| One shared generated-command executor | Per-command controller methods like `dap.stackTrace` | `controller/requests.ts` contains placeholder typed methods, but `server.ts` only implements `dap.request`; per-command methods would duplicate routing and schema work. [VERIFIED: codebase read] |
| zod object schemas for every DAP request | Type-only validation from `@vscode/debugprotocol` | Type declarations do not validate user JSON at runtime; zod keeps handled usage failures. [VERIFIED: codebase patterns] |

**Installation:** no new runtime dependencies are required for Phase 2. [VERIFIED: package.json + npm registry]

## Architecture Patterns

### System Architecture Diagram

```text
Official DAP schema URL
  -> generator script
  -> committed dapCommandRegistry.ts
  -> CLI generated command registration
  -> shared sendDapRequest helper
  -> controller IPC method dap.request
  -> ControllerServer resolves active/explicit session
  -> DapClient.request(command, arguments)
  -> adapter response body or structured CliError JSON

initialize response capabilities
  -> DapLifecycleController.start result
  -> DapSessionRuntime capability state
  -> `capabilities` CLI JSON report and optional preflight unsupported checks
```

### Recommended Project Structure

```text
src/
├── generator/              # schema fetch/parse and deterministic registry emission [VERIFIED: project architecture]
├── generated/              # committed generated DAP command registry [VERIFIED: project decisions]
├── cli/commands/           # generated command registration and ergonomic aliases [VERIFIED: codebase pattern]
├── controller/             # capability state/reporting and existing dap.request route [VERIFIED: codebase read]
└── testing/                # fake adapter scripts for representative Phase 2 command flows [VERIFIED: codebase read]

tests/
├── cli/                    # command parsing and JSON envelope tests [VERIFIED: codebase read]
├── integration/            # fake adapter CLI tests [VERIFIED: codebase read]
└── architecture/           # generated-boundary and no-language-specific gates [VERIFIED: codebase read]
```

### Pattern 1: Generated Registry, Handwritten Executor

**What:** Generate metadata, not behavior. Registry entries should describe CLI name, DAP command string, request type name, optional capability gate, and argument mode; one handwritten executor should parse JSON/options and call `client.request('dap.request', ...)`. [VERIFIED: project decisions + codebase read]

**Example:**

```typescript
export interface DapCommandMetadata {
  readonly command: string;
  readonly cliName: string;
  readonly requestType: string;
  readonly capability?: keyof DebugProtocol.Capabilities;
}

await sendDapRequest(stdout, metadata.cliName, {
  name: options.name,
  command: metadata.command,
  args: parsedArgs,
});
```

### Pattern 2: Capability Gate as Handled Usage/DAP Failure

**What:** Store adapter capabilities from `initialize`, expose them through a `capabilities` command, and when a registry entry has `capability`, fail before request execution if the capability is absent. Absence of a DAP capability means unsupported. [CITED: microsoft.github.io/debug-adapter-protocol/overview]

**When to use:** Use preflight for requests with explicit `supports*` capabilities such as `supportsSetVariable`, `supportsRestartFrame`, `supportsGotoTargetsRequest`, `supportsStepInTargetsRequest`, `supportsCompletionsRequest`, `supportsModulesRequest`, `supportsExceptionInfoRequest`, `supportsLoadedSourcesRequest`, `supportsTerminateThreadsRequest`, `supportsSetExpression`, `supportsTerminateRequest`, `supportsDataBreakpoints`, `supportsReadMemoryRequest`, `supportsWriteMemoryRequest`, `supportsDisassembleRequest`, `supportsCancelRequest`, `supportsBreakpointLocationsRequest`, `supportsInstructionBreakpoints`, `supportsSingleThreadExecutionRequests`, and `supportsDataBreakpointBytes`. [VERIFIED: official schema fetch + installed debugProtocol.d.ts]

### Pattern 3: Aliases Normalize to Registry Entries

**What:** Aliases like `stack`, `variables`, `continue`, `next`, `step-in`, `step-out`, `breakpoints set`, and `evaluate` should look up the generated registry entry and then call the same helper as generated commands. [VERIFIED: project decisions]

**Why:** This keeps success envelopes, failure envelopes, active-session targeting, request diagnostics, and raw passthrough identical across generated commands and aliases. [VERIFIED: codebase read]

### Anti-Patterns to Avoid

- **Do not hand-maintain the full DAP request list:** official schema currently yields 46 request commands, and missing one violates DAP-03/TEST-02. [VERIFIED: official schema fetch + requirements]
- **Do not implement per-command controller methods:** placeholder names exist in `controllerRequestMethods`, but `server.ts` only routes `dap.request`; adding many controller methods duplicates behavior. [VERIFIED: codebase read]
- **Do not add JavaScript/Python adapter cases:** Phase 2 explicitly excludes real JS/Python adapters. [VERIFIED: CONTEXT.md]
- **Do not print handled failures to stderr:** existing tests assert handled failures produce one stdout JSON envelope and empty stderr. [VERIFIED: codebase tests]
- **Do not treat object references as durable across resume:** DAP variable/scope object references are limited to the current suspended state. [CITED: microsoft.github.io/debug-adapter-protocol/overview]

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| DAP request inventory | Manual list in CLI code | Official schema parser + generated registry | Prevents missing official requests and creates deterministic diffs. [VERIFIED: project decisions] |
| JSON envelope/error formatting | Ad hoc `console.log`/stderr writes | `writeJsonSuccess`, `writeJsonFailure`, and `CliError` | Existing tests enforce one newline-terminated JSON object and empty stderr for handled failures. [VERIFIED: codebase tests] |
| DAP request sequencing | Direct protocol writes from CLI | Controller `dap.request` route and `DapClient.request` | Existing client tracks sequence numbers, pending responses, timeouts, and last request diagnostics. [VERIFIED: codebase read] |
| Fake adapters per integration test | Real JS/Python adapters | Existing fake adapter scripts/harness | Phase 2 needs deterministic protocol behavior and excludes real adapters. [VERIFIED: CONTEXT.md + codebase read] |
| Capability meaning | Local hard-coded assumptions only | Official `Capabilities` properties plus request docs comments | DAP uses capability flags for backward-compatible feature discovery, and absence means unsupported. [CITED: microsoft.github.io/debug-adapter-protocol/overview] |

**Key insight:** Generate metadata and centralize behavior; custom per-command logic is the main source of contract drift in this phase. [VERIFIED: project decisions + codebase read]

## Common Pitfalls

### Pitfall 1: Treating `@vscode/debugprotocol` as Complete Inventory
**What goes wrong:** The package is installed at 1.68.0 and was published in 2024, while the live official schema fetch produced the current 46-command inventory. [VERIFIED: npm registry + official schema fetch]
**How to avoid:** Use the official schema as the inventory oracle and use `@vscode/debugprotocol` for helpful TypeScript type names only. [VERIFIED: project decisions]

### Pitfall 2: Losing Phase 1 Failure Contracts
**What goes wrong:** Generated commands can accidentally throw Commander/zod/internal errors that bypass `CliError` diagnostics or write help text to stderr. [VERIFIED: codebase tests]
**How to avoid:** Convert invalid CLI JSON/options to `usageError`, route adapter failures through the controller, and test stdout-only handled failures. [VERIFIED: codebase patterns]

### Pitfall 3: Capability Preflight Without Runtime State
**What goes wrong:** A CLI-only capability check cannot know adapter support unless the controller stores initialize capabilities per runtime. [VERIFIED: codebase read]
**How to avoid:** Add capabilities to `DapSessionRuntime`, return them from a controller method, and include session/request/adapter diagnostics in unsupported failures. [VERIFIED: codebase read + project decisions]

### Pitfall 4: Breakpoint Alias Semantics
**What goes wrong:** DAP `setBreakpoints` is replacement-by-source, not incremental append. [CITED: microsoft.github.io/debug-adapter-protocol/overview]
**How to avoid:** Name aliases clearly, such as `breakpoints set` or `breakpoints replace`, and return adapter-verified breakpoint results. [VERIFIED: requirements + DAP docs]

### Pitfall 5: Paused-State Inspection Drift
**What goes wrong:** `scopes` and `variables` references can become invalid after execution resumes. [CITED: microsoft.github.io/debug-adapter-protocol/overview]
**How to avoid:** Tests should cover paused and resumed/continued edge cases; docs/help should not imply variable references survive resume. [VERIFIED: DAP docs]

## Code Examples

### Existing Raw Passthrough Pattern

```typescript
await withController(stdout, 'request', async client => client.request('dap.request', {
  command,
  args: parseJsonOption(options.json ?? '{}'),
  name: options.name,
}));
```

Source: `src/cli/commands/dapCore.ts`. [VERIFIED: codebase read]

### Existing Controller Routing Pattern

```typescript
const requestParams = parseDapRequestParams(params);
const runtime = this.resolveRuntime(requestParams.name);
return await runtime.client.request(requestParams.command, requestParams.args);
```

Source: `src/controller/server.ts`. [VERIFIED: codebase read]

### Existing JSON Failure Contract

```typescript
writeJsonFailure(error, { command }, streams.stdout);
return error.exitCode;
```

Source: `src/cli/main.ts`; tests assert empty stderr for handled failures. [VERIFIED: codebase read]

## State of the Art

| Old Approach | Current Approach | When Checked | Impact |
|--------------|------------------|--------------|--------|
| Handwritten DAP request commands | Schema-generated request inventory | 2026-05-02 | Required to satisfy every official request and deterministic coverage. [VERIFIED: official schema fetch + project decisions] |
| Type package as source of truth | Official schema as inventory, type package as helper | 2026-05-02 | Avoids lag from `@vscode/debugprotocol` 1.68.0. [VERIFIED: npm registry] |
| One-off command failures | Structured JSON failures with diagnostics | Phase 1 complete | Phase 2 must preserve machine-readable errors and empty stderr. [VERIFIED: codebase tests] |
| Streaming event UX | Polling event/status UX | Phase 1 complete | Phase 2 should keep polling; streaming is out of scope. [VERIFIED: requirements + architecture tests] |

**Deprecated/outdated:** using only `@vscode/debugprotocol` as the full request inventory is outdated for this project because the live official schema is the selected source of truth. [VERIFIED: project decisions + npm registry]

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| — | No `[ASSUMED]` claims are used. | — | — |

## Open Questions (RESOLVED)

1. **Where should the schema snapshot live?**
   - What we know: The generated registry must be committed and deterministic. [VERIFIED: CONTEXT.md]
    - Resolution: Commit the generated TypeScript registry as the reviewable artifact and keep the official schema URL in the generator and tests. Do not commit a full JSON schema snapshot in Phase 2 unless implementation proves networkless regeneration is required. Normal CLI runtime must never fetch the schema. [RESOLVED: 02-01 and 02-04 plans]

2. **How strict should typed argument UX be in Phase 2?**
   - What we know: All DAP methods must be available as CLI arguments, and raw `--json` remains the escape hatch. [VERIFIED: user request + CONTEXT.md]
    - Resolution: Generated commands use `--json` for complete DAP request arguments plus generated validation metadata that checks object shape, required top-level fields, and direct JSON-schema primitive/array/object types before adapter execution when metadata is available. Ergonomic exploded flags are limited to DBG-01 through DBG-04 aliases. [RESOLVED: 02-01 and 02-03 plans]

3. **How should reverse requests be represented?**
   - What we know: Official inventory includes reverse requests such as `runInTerminal` and `startDebugging`. [VERIFIED: official schema fetch]
    - Resolution: Include reverse-request definitions in generated inventory metadata for protocol completeness and coverage visibility, but mark them with `direction: "adapterToClient"` so normal generated CLI registration can either hide them from user-invoked adapter-bound commands or surface them only as unsupported-client-direction metadata. Client-to-adapter request definitions remain the executable generated command surface. [RESOLVED: 02-01, 02-03, and 02-04 plans]

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|-------------|-----------|---------|----------|
| Node.js | generator, tests, CLI | yes | v22.22.1 | none needed. [VERIFIED: local environment] |
| npm | version checks, scripts | yes | 10.9.4 | none needed. [VERIFIED: local environment] |
| Official DAP schema URL | generator input | yes | fetched 2026-05-02 | use committed generated registry for normal CLI runtime. [VERIFIED: official schema fetch] |
| `@vscode/debugprotocol` d.ts | type helpers | yes | 1.68.0 | use generated metadata if type package lags. [VERIFIED: node_modules read] |
| Knowledge graph | cross-document discovery | no | `.planning/graphs/graph.json` missing | continue from planning docs and code reads. [VERIFIED: local environment] |

**Missing dependencies with no fallback:** none. [VERIFIED: local environment]

**Missing dependencies with fallback:** knowledge graph is missing; planning docs and direct code reads were sufficient. [VERIFIED: local environment]

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|------------------|
| V2 Authentication | no | Local CLI/controller has no user authentication in Phase 2. [VERIFIED: requirements] |
| V3 Session Management | yes | Preserve explicit/active session targeting and avoid cross-session capability/request confusion. [VERIFIED: codebase read] |
| V4 Access Control | yes | Local controller IPC should only execute requests against resolved sessions; do not add remote/network auth changes in Phase 2. [VERIFIED: codebase read] |
| V5 Input Validation | yes | Use zod/typed parsing and `usageError` for malformed JSON/options. [VERIFIED: codebase patterns] |
| V6 Cryptography | no | Phase 2 adds no secrets or cryptographic operations. [VERIFIED: requirements] |

### Known Threat Patterns for Generated CLI Commands

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Malformed JSON arguments causing internal exceptions | Tampering / DoS | Parse as `unknown`, validate at boundaries, return handled `usageError`. [VERIFIED: codebase patterns] |
| Unsupported adapter capability hidden as raw DAP failure | Information disclosure / Reliability | Preflight known capability gates and include request/session/adapter diagnostics in JSON failure. [VERIFIED: project decisions] |
| Generated code drift from official schema | Tampering / Reliability | Deterministic generation plus inventory test against official schema command strings. [VERIFIED: project decisions + official schema fetch] |
| Language-specific adapter behavior leaking into protocol core | Design boundary risk | Architecture tests should continue forbidding JS/Python terms in `src/protocol`. [VERIFIED: architecture tests] |

## Sources

### Primary (HIGH confidence)
- `https://microsoft.github.io/debug-adapter-protocol/debugAdapterProtocol.json` - fetched and parsed on 2026-05-02; found 46 request command strings and current `Capabilities.supports*` properties. [VERIFIED: official schema fetch]
- `https://microsoft.github.io/debug-adapter-protocol/overview` - DAP lifecycle, capabilities, breakpoints, stopped-state inspection, object-reference lifetime. [CITED: microsoft.github.io/debug-adapter-protocol/overview]
- `https://microsoft.github.io/debug-adapter-protocol/specification` - official schema/changelog links and protocol reference. [CITED: microsoft.github.io/debug-adapter-protocol/specification]
- Local code reads: `src/cli/commands/dapCore.ts`, `src/controller/server.ts`, `src/controller/requests.ts`, `src/protocol/dapClient.ts`, `src/protocol/lifecycle.ts`, `tests/integration/fakeAdapterCli.test.ts`, `tests/fixtures/fake-adapter-entry.ts`. [VERIFIED: codebase read]
- npm registry on 2026-05-02 for `@vscode/debugprotocol`, `commander`, `zod`, `vitest`, and `typescript`. [VERIFIED: npm registry]

### Secondary (MEDIUM confidence)
- Installed `node_modules/@vscode/debugprotocol/lib/debugProtocol.d.ts` comments for request command names and capability hints. [VERIFIED: node_modules read]

### Tertiary (LOW confidence)
- None. [VERIFIED: research log]

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - versions and local availability were verified with npm/local commands. [VERIFIED: npm registry + local environment]
- Architecture: HIGH - existing CLI/controller/protocol/test boundaries were read directly. [VERIFIED: codebase read]
- Pitfalls: HIGH - derived from official DAP docs, existing tests, and current Phase 2 decisions. [VERIFIED: official docs + codebase read]

**Research date:** 2026-05-02
**Valid until:** 2026-06-01 for repo architecture; 2026-05-09 for protocol/package freshness because DAP schema and npm packages can change. [VERIFIED: research policy]
