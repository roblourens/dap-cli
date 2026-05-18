# Phase 20: New Runtime Debug Adapter Integration - Research

**Researched:** 2026-05-16  
**Domain:** Selecting, provisioning, integrating, validating, and hardening one substantial new runtime/debug-adapter path for dap-cli. [VERIFIED: `.planning/ROADMAP.md`, `.planning/STATE.md`]  
**Confidence:** HIGH for the Go/Delve recommendation and repo integration shape; MEDIUM for final external-repository smoke candidates because those should be re-screened immediately before execution. [VERIFIED: codebase review; CITED: https://github.com/go-delve/delve/blob/master/Documentation/api/dap/README.md]

## User Constraints

- No Phase 20 `CONTEXT.md` exists, so this research treats the user-provided phase brief and the Phase 20 roadmap entry as the active scope. [VERIFIED: `gsd-sdk query init.phase-op "20"`; VERIFIED: `.planning/ROADMAP.md`]
- The phase must select a popular existing adapter, favor Microsoft ownership when practical, decide install/vendor treatment against current js-debug/debugpy practice, implement support, add substantial automated end-to-end tests, validate on safe real GitHub projects, and run a subagent failure/confusion capture loop with fix-and-retry. [VERIFIED: user prompt; VERIFIED: `.planning/ROADMAP.md`]
- No AI-SPEC is present and the user explicitly chose to continue without one because this is debugger integration work rather than an AI-system phase. [VERIFIED: user prompt]
- `.planning/REQUIREMENTS.md` was requested but does not exist in this workspace at research time; no Phase 20 requirement IDs were available to map verbatim. [VERIFIED: failed workspace read; VERIFIED: `.planning/**/REQUIREMENTS.md` search returned no matches]

## Summary

Phase 20 should integrate **Go debugging through Delve's native DAP server, `dlv dap`**, and treat it as dap-cli's third built-in runtime after js-debug and debugpy. Delve is not Microsoft-owned, but it is the most planning-ready candidate found: it is the DAP path used by VS Code Go, it is actively maintained, it ships current platform release binaries, and it exposes a single-use localhost TCP DAP server that matches dap-cli's existing `server` transport almost directly. [CITED: https://github.com/go-delve/delve/blob/master/Documentation/api/dap/README.md; CITED: https://github.com/golang/vscode-go/blob/master/docs/debugging.md; CITED: https://github.com/go-delve/delve/releases]

The stronger Microsoft-owned candidates are less suitable for this repo's built-in-adapter model. Microsoft's Java Debug Server is real DAP technology, but official usage routes through Eclipse JDT Language Server initialization plus an LSP command that yields a DAP port, which makes it materially more coupled and orchestration-heavy than js-debug/debugpy. PowerShell Editor Services has a stable DAP connection, but its debugging flow requires session-details discovery and named pipes or Unix sockets, while dap-cli currently models stdio, localhost TCP sockets, and spawned localhost TCP servers only. The C# VS Code extension is official and popular, but its repository/readme/release shape is extension-centric and did not present a comparable standalone DAP server path in this research. [CITED: https://github.com/microsoft/java-debug; CITED: https://github.com/PowerShell/PowerShellEditorServices; CITED: https://github.com/dotnet/vscode-csharp; VERIFIED: `src/adapters/descriptor.ts`]

**Primary recommendation:** Plan Phase 20 around a new built-in `delve` adapter for Go: provision pinned Delve release binaries into `DAP_CLI_HOME` with a PATH fallback, spawn `dlv dap --listen=127.0.0.1:${port}` through the existing server transport, map VS Code's `type: "go"` and `.go` programs into that adapter, add launch/attach flag mapping plus docs/skill coverage, prove launch/test/exec/local-attach scenarios through Vitest and hand-driven CLI evidence, then run external-repo and subagent hardening rounds before closing the phase. [VERIFIED: `scripts/setup-adapters.ts`; VERIFIED: `src/adapters/builtins/jsDebug.ts`; VERIFIED: `src/config/launchConfig.ts`; CITED: https://github.com/go-delve/delve/blob/master/Documentation/usage/dlv_dap.md]

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|--------------|----------------|-----------|
| Adapter selection and built-in registration | API / Backend | - | `AdapterRegistry` owns built-in IDs and descriptor construction today. [VERIFIED: `src/adapters/registry.ts`] |
| Delve process provisioning/readiness | API / Backend | OS / Local Tooling | `setup-adapters` already provisions adapter assets/tooling into `DAP_CLI_HOME`; Delve should follow that seam. [VERIFIED: `scripts/setup-adapters.ts`] |
| DAP server process lifecycle | API / Backend | OS / Local Tooling | dap-cli already starts localhost server adapters, allocates a port, connects, logs stderr, and terminates spawned servers. [VERIFIED: `src/adapters/socketAdapter.ts`; VERIFIED: `src/controller/server.ts`] |
| Launch/attach config normalization | API / Backend | - | Existing `launchConfig.ts` and `programInference.ts` own type-to-adapter mapping and friendly flag mapping. [VERIFIED: `src/config/launchConfig.ts`; VERIFIED: `src/config/programInference.ts`] |
| Runtime-specific docs and skill guidance | CDN / Static | - | The repo's docs and skill files are static deliverables validated by docs tests in prior phases. [VERIFIED: `docs/adapter-setup.md`; VERIFIED: `tests/integration/docsValidation.test.ts` search results] |
| Automated E2E fixtures and real-repo smoke | API / Backend | OS / Local Tooling | Current real-adapter testing launches local target processes, controls DAP, and inspects live state through Vitest and terminal-driven UAT. [VERIFIED: `tests/integration/debugpyAdapter.test.ts`; VERIFIED: `.planning/phases/07-hardening-bug-discovery-and-exploratory-smoke-testing/07-HARDENING-MATRIX.md`] |

## Project Constraints (from copilot-instructions.md)

- Phase work belongs on a `phase-<NN>-<slug>` branch; current init output already reports `phase-20-new-runtime-adapter`. [VERIFIED: `.github/copilot-instructions.md`; VERIFIED: terminal init output]
- GSD work should preserve the phase workflow, and later `/gsd-verify-work` must execute the hand-driven CLI smoke sequences in `dev/smoke/hand-driven-smoke.md` directly in a terminal and capture verbatim output into UAT. [VERIFIED: `.github/copilot-instructions.md`]
- Built deliverables for a CLI phase cannot rely on “tests green” alone; published `./bin/dap-cli` or built CLI behavior must be driven by hand during verification. [VERIFIED: `.github/copilot-instructions.md`]
- Existing repo patterns should be retained: js-debug uses a release tarball provisioned under `DAP_CLI_HOME/adapters`, debugpy prefers a usable system runtime or a private provisioned environment, and both expose stable built-in descriptor IDs. [VERIFIED: `scripts/setup-adapters.ts`; VERIFIED: `src/adapters/builtins/jsDebug.ts`; VERIFIED: `src/adapters/builtins/debugpy.ts`]

## Candidate Selection

### Recommendation Table

| Candidate | Ownership / maintenance | DAP/process fit | Provisioning fit | Recommendation |
|-----------|-------------------------|-----------------|------------------|----------------|
| Go + Delve `dlv dap` | Delve is a large, active Go debugger project; VS Code Go uses its native DAP mode and documents it as the modern path. [CITED: https://github.com/go-delve/delve; CITED: https://github.com/golang/vscode-go/blob/master/docs/debugging.md] | Native single-use TCP DAP server with `--listen`, launch and local attach support, server shutdown semantics, and DAP logging. [CITED: https://github.com/go-delve/delve/blob/master/Documentation/usage/dlv_dap.md; CITED: https://github.com/go-delve/delve/blob/master/Documentation/api/dap/README.md] | Current releases expose platform archives and checksums; this mirrors js-debug's pinned release-asset setup more closely than any other candidate. [CITED: https://github.com/go-delve/delve/releases; VERIFIED: `scripts/setup-adapters.ts`] | **Choose.** Best balance of runtime popularity, adapter quality, standalone operation, and compatibility with dap-cli's architecture. [VERIFIED: synthesis from cited sources] |
| Microsoft Java Debug Server / vscode-java-debug | Microsoft-owned and active; vscode-java-debug 0.59.0 released Apr. 15, 2026. [CITED: https://github.com/microsoft/vscode-java-debug; CITED: https://github.com/microsoft/vscode-java-debug/releases/tag/0.59.0] | Official `java-debug` usage requires launching JDT LS with the plugin bundle, then issuing `vscode.java.startDebugSession` over LSP to receive a DAP port. [CITED: https://github.com/microsoft/java-debug] | Releases exist, but the official low-level flow is a plugin-plus-language-server handshake, not a direct adapter binary analogous to js-debug/debugpy. [CITED: https://github.com/microsoft/java-debug; CITED: https://github.com/microsoft/java-debug/releases] | Runner-up only. Valuable future integration, but too much multi-service orchestration for Phase 20's “another built-in runtime” slot. [VERIFIED: synthesis from cited sources] |
| PowerShell Editor Services | PowerShell-owned, active, release v4.6.0 shown one day before research. [CITED: https://github.com/PowerShell/PowerShellEditorServices] | Debugging uses a session-details file plus a debug named pipe or Unix-domain socket; stdio explicitly limits debugger support. [CITED: https://github.com/PowerShell/PowerShellEditorServices] | dap-cli has no named-pipe/session-discovery transport today; adding one would broaden the phase from adapter integration into transport-platform work. [VERIFIED: `src/adapters/descriptor.ts`; CITED: https://github.com/PowerShell/PowerShellEditorServices] | Reject for Phase 20. Revisit only if dap-cli intentionally grows non-TCP local socket/session discovery primitives. [VERIFIED: synthesis from cited sources] |
| C# VS Code extension / C# Dev Kit ecosystem | Official, popular, and active. [CITED: https://github.com/dotnet/vscode-csharp] | The official repo/readme is extension-centric and the researched materials did not expose a simple standalone DAP server path comparable to `dlv dap`. [CITED: https://github.com/dotnet/vscode-csharp] | Installation path pulls in extension/runtime tooling rather than a small direct adapter artifact this repo can confidently vendor. [CITED: https://github.com/dotnet/vscode-csharp] | Reject for Phase 20 pending a separate focused standalone-debugger feasibility spike. [VERIFIED: synthesis from cited source] |

### Why Delve Wins Despite Not Being Microsoft-Owned

- The user's preference was “ideally Microsoft-run,” not “Microsoft-only,” and Delve is the strongest practical match to dap-cli's current built-in adapter contract. [VERIFIED: user prompt; VERIFIED: synthesis]
- Delve's native DAP server is already the integration point documented by VS Code Go, so dap-cli can align with an established client model instead of inventing a new Go-specific protocol bridge. [CITED: https://github.com/golang/vscode-go/blob/master/docs/debugging.md]
- Delve v1.26.3 was the latest release visible at research time, published Apr. 27, 2026, with `darwin_arm64`, `darwin_amd64`, Linux, and Windows binary assets plus checksum artifacts. [CITED: https://github.com/go-delve/delve/releases]

## Standard Stack

### Core

| Library / Tool | Version | Purpose | Why Standard |
|----------------|---------|---------|--------------|
| Delve `dlv` | v1.26.3 release at research time | Go debugger and native DAP server via `dlv dap`. | Official Delve docs define DAP launch/attach semantics; VS Code Go documents dlv-dap as its native DAP integration. [CITED: https://github.com/go-delve/delve/releases; CITED: https://github.com/go-delve/delve/blob/master/Documentation/api/dap/README.md; CITED: https://github.com/golang/vscode-go/blob/master/docs/debugging.md] |
| Go toolchain | Local research machine: go1.23.5 darwin/arm64 | Builds fixture/external Go targets for `mode: "debug"` and supplies manual `go install` fallback. | Delve's debug/test modes build Go programs; local availability matters for Phase 20 E2E execution. [VERIFIED: terminal `go version`; CITED: https://github.com/golang/vscode-go/blob/master/docs/debugging.md] |
| dap-cli server adapter transport | Repo-local | Spawn `dlv dap` on `127.0.0.1:${port}`, connect, log, and close. | Existing `server` transport does this for js-debug and is a direct implementation seam. [VERIFIED: `src/adapters/socketAdapter.ts`; VERIFIED: `src/adapters/builtins/jsDebug.ts`] |

### Supporting

| Library / Tool | Version | Purpose | When to Use |
|----------------|---------|---------|-------------|
| Vitest | `^3.2.4` in this repo | Unit/integration/E2E automation. | Use for descriptor/config tests, real Delve integration tests, docs validation, and fixture CLI orchestration. [VERIFIED: `package.json`; VERIFIED: `vitest.config.ts`] |
| Existing setup script | Repo-local | Provision adapter assets. | Extend `scripts/setup-adapters.ts` rather than creating an unrelated Delve installer. [VERIFIED: `scripts/setup-adapters.ts`] |
| Existing CLI/docs validation | Repo-local | Keep examples and skills aligned with real command surfaces. | Update docs/skill material and extend `docsValidation.test.ts` if new public examples are added. [VERIFIED: `docs/adapter-setup.md`; VERIFIED: docsValidation search results] |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Pinned release-asset Delve provisioning under `DAP_CLI_HOME` | Require `go install github.com/go-delve/delve/cmd/dlv@latest` | Officially documented and easy for Go users, but less deterministic for dap-cli smokes and less similar to js-debug's pinned first-party setup. [CITED: https://github.com/golang/vscode-go/blob/master/docs/debugging.md; VERIFIED: `scripts/setup-adapters.ts`] |
| Spawned `server` descriptor | Require users to start `dlv dap` themselves and use `socket` descriptors | Supports expert/manual flows, but built-in launch parity should own the subprocess as js-debug already does. [VERIFIED: `src/adapters/descriptor.ts`; VERIFIED: `src/adapters/builtins/jsDebug.ts`] |
| Go/Delve | Microsoft Java Debug Server | Stronger ownership match, weaker standalone fit because official use requires JDT LS plugin registration and LSP session startup. [CITED: https://github.com/microsoft/java-debug] |

**Installation recommendation:**

```bash
npm run setup-adapters
```

- Extend that command to resolve a usable `dlv` first, then provision a pinned Delve release binary into `DAP_CLI_HOME/adapters/delve/` when no acceptable PATH binary is present. [VERIFIED: current debugpy system-first pattern in `scripts/setup-adapters.ts`; CITED: https://github.com/go-delve/delve/releases]
- Keep manual fallback docs for `GOBIN=<dir> go install github.com/go-delve/delve/cmd/dlv@v1.26.3` or a release archive, because VS Code Go officially documents manual `go install` as a non-VS-Code install path. [CITED: https://github.com/golang/vscode-go/blob/master/docs/debugging.md]
- Record release asset URL, checksum-awareness decision, and platform mapping in the plan. Release artifacts already include checksums and signatures, so checksum verification is feasible and should be considered instead of silently trusting a network download. [CITED: https://github.com/go-delve/delve/releases]

**Version verification note:** Delve is not an npm package, so `npm view` is not applicable to the recommended adapter itself. Current Delve version and asset availability were verified from the official GitHub releases page; repo-local npm package versions remain sourced from `package.json`. [CITED: https://github.com/go-delve/delve/releases; VERIFIED: `package.json`]

## Architecture Patterns

### System Architecture Diagram

```text
agent / user CLI
      |
      v
dap-cli launch|attach --adapter delve --type go
      |
      v
program inference + launch config resolver
(.go -> delve/go; launch.json type go -> delve)
      |
      v
AdapterRegistry.createDelveDescriptor()
      |
      v
server transport starts local process
dlv dap --listen=127.0.0.1:${port} [--log...]
      |
      +---------------------------+
      |                           |
      v                           v
local TCP DAP session      adapter stderr/log files
      |
      v
Delve builds/launches or attaches to Go target
      |
      v
breakpoints -> stopped -> threads/stack/scopes/variables/evaluate
      |
      v
automated fixtures, external repos, subagent scenario matrix
```

All arrows above map to existing dap-cli lifecycle concepts except the new Delve descriptor/setup surface. [VERIFIED: `src/adapters/socketAdapter.ts`; VERIFIED: `src/controller/server.ts`; VERIFIED: `src/config/programInference.ts`]

### Recommended Project Structure

```text
src/
|- adapters/builtins/delve.ts       # built-in descriptor + not-found diagnostics
|- adapters/registry.ts             # register built-in id and label
|- config/launchConfig.ts           # type: go mapping + friendly flag mapper
|- config/programInference.ts       # .go inference + adapter default type
|- cli/...                           # only if new public Go-specific flags need parser wiring

scripts/
|- setup-adapters.ts                # Delve resolution/download/provisioning

tests/
|- fixtures/simple-go-app/          # launch/breakpoint/variables fixture
|- fixtures/simple-go-test/         # mode:test fixture if separate package shape helps
|- integration/delveAdapter.test.ts # descriptor + real DAP launch/attach/test/exec smokes
|- config/...                        # type and .go inference tests

docs/ and skills/
|- adapter-setup.md                 # provisioning and Go examples
|- agent workflow / skill refs      # Go launch/attach guidance and pitfalls
```

The exact docs filenames should follow the files currently used in this repo at execution time; prior phases found case/path drift, so the planner should re-check before tasking docs edits. [VERIFIED: `.planning/phases/18-per-child-paused-state-and-paused-first-routing/18-02-SUMMARY.md`]

### Pattern 1: Built-In Descriptor Reusing Server Transport

**What:** Add a Delve built-in descriptor that resolves a concrete `dlv` executable path, then uses `{ kind: 'server' }` with `dlv dap --listen=127.0.0.1:${port}`. [VERIFIED: `src/adapters/builtins/jsDebug.ts`; CITED: https://github.com/go-delve/delve/blob/master/Documentation/usage/dlv_dap.md]  
**When to use:** Always for first-party dap-cli-managed Go launch/local attach sessions; retain custom `socket` descriptors only for advanced users connecting to an externally started server. [VERIFIED: `src/adapters/descriptor.ts`; CITED: https://github.com/golang/vscode-go/blob/master/docs/debugging.md]

**Example:**

```typescript
// Source pattern: src/adapters/builtins/jsDebug.ts + Delve dlv_dap.md
export function createDelveDescriptor(dlvPath?: string): AdapterDescriptor {
  const command = dlvPath ?? resolveDefaultDelvePath();
  return {
    id: 'delve',
    label: 'Go Debug Adapter (Delve)',
    transport: {
      kind: 'server',
      command,
      args: ['dap', '--listen=127.0.0.1:${port}'],
      host: '127.0.0.1',
    },
  };
}
```

This example is planning guidance, not an already-existing file. It is grounded in the repo's server descriptor pattern and Delve's documented CLI. [VERIFIED: `src/adapters/builtins/jsDebug.ts`; CITED: https://github.com/go-delve/delve/blob/master/Documentation/usage/dlv_dap.md]

### Pattern 2: Go Launch/Attach Mapping Should Match Delve Vocabulary

**What:** Map high-value friendly flags without hiding Delve's native launch JSON escape hatch. Delve DAP launch supports modes such as `debug`, `test`, and `exec`; local attach supports `mode: "local"` plus `processId`. [CITED: https://github.com/go-delve/delve/blob/master/Documentation/api/dap/README.md; CITED: https://github.com/golang/vscode-go/blob/master/docs/debugging.md]  
**When to use:** Add only the common flags that agents will repeatedly need (`program`, `cwd`, `args`, `stopOnEntry`, `mode`, `processId`, perhaps `buildFlags`); keep `--json`/`--json-overrides` as the adapter-native pressure valve. [VERIFIED: `src/config/launchConfig.ts`; VERIFIED: `docs/adapter-setup.md`]

**Planning shape:**

| User surface | Delve field | Notes |
|--------------|-------------|-------|
| `--program` | `program` | For `debug`/`test`, prefer package or Go-file path; for `exec`, use prebuilt debug binary. [CITED: https://github.com/golang/vscode-go/blob/master/docs/debugging.md] |
| `--mode debug|test|exec` | `mode` | Delve DAP documents these modes. [CITED: https://github.com/go-delve/delve/blob/master/Documentation/api/dap/README.md] |
| `--stop-on-entry` | `stopOnEntry` | Delve docs recommend it where `--continue` is not part of `dlv dap`. [CITED: https://github.com/go-delve/delve/blob/master/Documentation/usage/dlv_dap.md] |
| attach process PID | `processId` + `mode: "local"` | Plan an explicit CLI/config path; this is core attach validation. [CITED: https://github.com/golang/vscode-go/blob/master/docs/debugging.md] |
| `--json` | raw Delve launch/attach object | Preserve full reach for `substitutePath`, logs, `hideSystemGoroutines`, etc. [VERIFIED: current CLI JSON layering in `docs/adapter-setup.md`; CITED: https://github.com/golang/vscode-go/blob/master/docs/debugging.md] |

### Pattern 3: Provisioning Should Be “Pinned Asset First, System Fallback Visible”

**What:** Use the js-debug release-asset precedent for deterministic first-party setup, but also permit a preinstalled `dlv` PATH binary if it is present and suitable, similar to debugpy's system-first behavior. [VERIFIED: `scripts/setup-adapters.ts`]  
**When to use:** Setup/readiness and descriptor resolution. The plan should define version/capability checks carefully, because Delve docs state DAP features are versioned and VS Code Go recommends updating Delve for DAP bug fixes. [CITED: https://github.com/go-delve/delve/blob/master/Documentation/api/dap/README.md; CITED: https://github.com/golang/vscode-go/blob/master/docs/debugging.md]

### Component Responsibilities

| Component | Phase 20 responsibility |
|-----------|-------------------------|
| `setup-adapters.ts` | Resolve/provision Delve, print deterministic setup status, verify executable usability, expose actionable failure text. [VERIFIED: `scripts/setup-adapters.ts`] |
| `builtins/delve.ts` | Descriptor construction, lookup path precedence, `delve_not_found` error with setup guidance. [VERIFIED: `src/adapters/builtins/debugpy.ts`; VERIFIED: `src/adapters/builtins/jsDebug.ts`] |
| Registry/config/inference | Built-in list entry, `type: "go"` launch config resolution, `.go` inference, adapter-only default type. [VERIFIED: `src/adapters/registry.ts`; VERIFIED: `src/config/launchConfig.ts`; VERIFIED: `src/config/programInference.ts`] |
| Integration tests | Direct DAP protocol launch/attach inspection plus published-CLI flows if current integration style needs both. [VERIFIED: `tests/integration/debugpyAdapter.test.ts`; VERIFIED: `tests/integration/jsDebugAdapter.test.ts`] |
| Docs/skills | Setup instructions, launch/test/exec/local attach recipes, Go-specific pitfalls and external-smoke procedure. [VERIFIED: `docs/adapter-setup.md`; VERIFIED: `.planning/phases/17-code-oss-smoke-scenario-hardening-20-attach-scenarios-driven/17-SCENARIOS.md`] |

### Anti-Patterns to Avoid

- **Do not invent a custom Go DAP bridge:** Delve already exposes native DAP and VS Code Go relies on it. [CITED: https://github.com/go-delve/delve/blob/master/Documentation/api/dap/README.md; CITED: https://github.com/golang/vscode-go/blob/master/docs/debugging.md]
- **Do not make users pre-start `dlv dap` for the built-in happy path:** dap-cli already owns spawned TCP adapter lifecycles for js-debug. [VERIFIED: `src/adapters/builtins/jsDebug.ts`; VERIFIED: `src/adapters/socketAdapter.ts`]
- **Do not promise remote/headless multi-client coverage as the first built-in milestone:** `dlv dap` is single-use; `dlv --headless` remote attach has a distinct operating model. Validate local launch/local attach first, then explicitly scope remote/headless only if Phase 20 needs it. [CITED: https://github.com/go-delve/delve/blob/master/Documentation/api/dap/README.md; CITED: https://github.com/go-delve/delve/blob/master/Documentation/usage/dlv_dap.md]
- **Do not silently execute arbitrary external repo scripts during smoke selection:** prior phases treat cloned repos as untrusted input and screen install/build/run commands before execution. [VERIFIED: `.planning/phases/07-hardening-bug-discovery-and-exploratory-smoke-testing/07-EXTERNAL-PROJECT-CANDIDATES.md`; VERIFIED: `.planning/phases/08-external-project-hardening-expansion/08-EXTERNAL-PROJECT-CANDIDATES.md`]

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Go DAP protocol server | Custom Go adapter or JSON-RPC wrapper | Delve `dlv dap` | Delve already speaks DAP, supports launch/local attach, and is the path documented by VS Code Go. [CITED: https://github.com/go-delve/delve/blob/master/Documentation/api/dap/README.md; CITED: https://github.com/golang/vscode-go/blob/master/docs/debugging.md] |
| TCP adapter process management | New Delve-specific process runner | Existing `server` transport | Port allocation, connect retry, stderr logs, and process termination already exist. [VERIFIED: `src/adapters/socketAdapter.ts`] |
| Installer framework | Separate Go-only setup command | Extend `setup-adapters` | The repo already centralizes built-in adapter provisioning there. [VERIFIED: `scripts/setup-adapters.ts`; VERIFIED: `docs/adapter-setup.md`] |
| External repo safety policy | Ad hoc “clone something and run it” notes | Reuse Phase 7/8 screening ledger pattern | Earlier phases already captured clone roots, isolated homes, script inspection, and block rules. [VERIFIED: Phase 7/8 candidate docs] |
| Agent hardening loop format | Free-form anecdotes | Reuse Phase 17 scenario/result shape | Phase 17 has scenario prompts, evidence fields, confusion capture, and fix/retry follow-up notes. [VERIFIED: `.planning/phases/17-code-oss-smoke-scenario-hardening-20-attach-scenarios-driven/17-SCENARIOS.md`; VERIFIED: `.planning/phases/17-code-oss-smoke-scenario-hardening-20-attach-scenarios-driven/17-RESULTS.md`] |

**Key insight:** Phase 20's novelty is not inventing debugger infrastructure; it is extending dap-cli's proven adapter seams to a new ecosystem and validating that agents can actually use the result on real Go projects. [VERIFIED: synthesis from codebase and cited adapter docs]

## Common Pitfalls

### Pitfall 1: Picking a Microsoft-Owned Adapter That Is Not Standalone Enough

**What goes wrong:** The phase becomes a Java language-server orchestration project or a PowerShell transport expansion instead of a focused built-in runtime integration. [CITED: https://github.com/microsoft/java-debug; CITED: https://github.com/PowerShell/PowerShellEditorServices]  
**Why it happens:** Ownership preference is over-weighted compared with process model, transport support, and provisioning fit. [VERIFIED: synthesis]  
**How to avoid:** Choose Delve for Phase 20 and record Java as a future feasibility spike, not the implementation target. [VERIFIED: synthesis]  
**Warning signs:** Planning tasks mention JDT LS initialization, LSP commands, session JSON parsing, named pipes, or new transport abstractions before a single new built-in session exists. [CITED: https://github.com/microsoft/java-debug; CITED: https://github.com/PowerShell/PowerShellEditorServices]

### Pitfall 2: Treating `dlv dap` and `dlv --headless` as One Mode

**What goes wrong:** Tests/config examples mix local launch/local attach with remote multi-client semantics and fail in confusing ways. [CITED: https://github.com/go-delve/delve/blob/master/Documentation/api/dap/README.md]  
**Why it happens:** Both speak to debugging over network connections, but their config ownership differs: `dlv dap` receives launch/attach config from the DAP client, while `dlv --headless` starts with a target and remote attach semantics. [CITED: https://github.com/go-delve/delve/blob/master/Documentation/api/dap/README.md]  
**How to avoid:** Scope the built-in descriptor to `dlv dap`; reserve external socket/custom adapter docs for manual advanced scenarios. [CITED: https://github.com/go-delve/delve/blob/master/Documentation/usage/dlv_dap.md; VERIFIED: `src/adapters/descriptor.ts`]  
**Warning signs:** The planned built-in descriptor starts using `--accept-multiclient` or remote `mode` as if those were `dlv dap` defaults. [CITED: https://github.com/go-delve/delve/blob/master/Documentation/usage/dlv_dap.md]

### Pitfall 3: Relative Go Program Paths Resolve from the Wrong Working Directory

**What goes wrong:** A real project launches or breaks differently depending on where `dlv dap` was spawned. [CITED: https://github.com/go-delve/delve/blob/master/Documentation/usage/dlv_dap.md; CITED: https://github.com/golang/vscode-go/blob/master/docs/debugging.md]  
**Why it happens:** Delve interprets program/output paths relative to its own working directory; VS Code Go documentation explicitly warns about path resolution and encourages absolute expansion. [CITED: https://github.com/golang/vscode-go/blob/master/docs/debugging.md]  
**How to avoid:** Decide in the plan whether dap-cli sets descriptor `cwd` to workspace/project context or normalizes user-facing program paths to absolute paths before DAP launch; test relative and absolute shapes. [VERIFIED: `AdapterDescriptor.transport.cwd` supports cwd; CITED: https://github.com/golang/vscode-go/blob/master/docs/debugging.md]  
**Warning signs:** Fixture passes only from repo root; external repo runs fail with build/package lookup errors. [VERIFIED: synthesis]

### Pitfall 4: Expecting Optimized or `go run` Binaries to Debug Well

**What goes wrong:** Attach/exec scenarios lack usable symbols or breakpoints do not bind reliably. [CITED: https://github.com/golang/vscode-go/blob/master/docs/debugging.md]  
**Why it happens:** VS Code Go docs advise building exec targets with `go build -gcflags=all="-N -l"` and warn that stripped binaries/go-run-style flows can omit debug information. [CITED: https://github.com/golang/vscode-go/blob/master/docs/debugging.md]  
**How to avoid:** Keep `mode: "debug"` as the simplest smoke, add one explicit `mode: "exec"` fixture built with debug-friendly flags, and document that external repo exec candidates need symbol-friendly builds. [CITED: https://github.com/golang/vscode-go/blob/master/docs/debugging.md]  
**Warning signs:** Delve reports missing debug info, breakpoint verification fails in prebuilt binaries, or external repos rely on release builds. [CITED: https://github.com/golang/vscode-go/blob/master/docs/debugging.md]

### Pitfall 5: Treating External GitHub Repos as Fixtures Without Screening

**What goes wrong:** The phase spends time on huge installs, secrets, cloud dependencies, privileged actions, or ambiguous project setup instead of debugger verification. [VERIFIED: Phase 7/8 candidate docs]  
**Why it happens:** “Real world” gets mistaken for “run whatever search returns.” [VERIFIED: synthesis]  
**How to avoid:** Reuse the Phase 7/8 ledger: shallow clone into ignored scratch space, inspect build files and launch configs, skip repos needing secrets/Docker/cloud/privilege, and record blocked results honestly. [VERIFIED: `.planning/phases/07-hardening-bug-discovery-and-exploratory-smoke-testing/07-EXTERNAL-PROJECT-CANDIDATES.md`; VERIFIED: `.planning/phases/08-external-project-hardening-expansion/08-EXTERNAL-PROJECT-CANDIDATES.md`]  
**Warning signs:** A candidate has heavyweight infra prerequisites, install hooks not yet inspected, or no deterministic way to hit the code path under debug. [VERIFIED: Phase 7/8 candidate docs]

### Pitfall 6: Letting the Subagent Round Produce Stories Instead of Actionable Gaps

**What goes wrong:** Agents report “it felt confusing” without enough command, evidence, and reproduction context to fix dap-cli or docs. [VERIFIED: comparison with Phase 17 structured scenario/result artifacts]  
**Why it happens:** The loop is under-specified. [VERIFIED: synthesis]  
**How to avoid:** Require every scenario result to report pass/fail/blocked, exact evidence path/transcript, what worked, what did not, agent confusion, dap-cli ergonomic issues, and cleanup verification; then triage findings into code gap, docs/skill gap, target-project issue, or blocked environment. [VERIFIED: `.planning/phases/17-code-oss-smoke-scenario-hardening-20-attach-scenarios-driven/17-SCENARIOS.md`; VERIFIED: `.planning/phases/17-code-oss-smoke-scenario-hardening-20-attach-scenarios-driven/17-RESULTS.md`]  
**Warning signs:** Findings omit exact session shape, breakpoint/source path, command transcript, or cleanup status. [VERIFIED: Phase 17 scenario contract]

## Code Examples

Verified patterns from official sources and current repo seams:

### Built-In Delve Launch Config Shape

```json
{
  "type": "go",
  "request": "launch",
  "mode": "debug",
  "name": "Go fixture smoke",
  "program": "/absolute/path/to/tests/fixtures/simple-go-app",
  "stopOnEntry": true
}
```

The `type`, `request`, `mode`, `program`, and `stopOnEntry` concepts are documented in VS Code Go and Delve DAP references; Phase 20 should make this payload work through dap-cli's normal `launch --json` and named config flows. [CITED: https://github.com/golang/vscode-go/blob/master/docs/debugging.md; CITED: https://github.com/go-delve/delve/blob/master/Documentation/api/dap/README.md]

### Local Attach Config Shape

```json
{
  "type": "go",
  "request": "attach",
  "mode": "local",
  "name": "Attach running Go binary",
  "processId": 4242,
  "stopOnEntry": true
}
```

VS Code Go documents local attach using `processId`; the plan should add one deterministic fixture/run that starts a long-lived Go process, obtains its PID, attaches, pauses or stops, inspects, and disconnects without orphaning it unexpectedly. [CITED: https://github.com/golang/vscode-go/blob/master/docs/debugging.md]

### Delve Server Startup and Logs

```bash
dlv dap --listen=127.0.0.1:12345 --log --log-output=dap
```

Delve docs explicitly show `dlv dap`, the `--listen` option, and DAP logging via `--log --log-output=dap`; dap-cli may choose whether verbose DAP logging is opt-in or a test-only diagnostic default. [CITED: https://github.com/go-delve/delve/blob/master/Documentation/usage/dlv_dap.md; CITED: https://github.com/go-delve/delve/blob/master/Documentation/api/dap/README.md]

### Automated Integration Skeleton to Mirror debugpy/js-debug Tests

```typescript
// Planning reference: mirror tests/integration/debugpyAdapter.test.ts structure.
const descriptor = new AdapterRegistry().resolve('delve');
const adapter = await startServerSocketAdapter(descriptor.id, descriptor.transport, logDir);
const client = new DapClient(adapter.transport, { requestTimeoutMs: 30_000 });

await client.request('initialize', {
  adapterID: 'go',
  clientID: 'dap-cli-tests',
  linesStartAt1: true,
  columnsStartAt1: true,
  pathFormat: 'path'
});
```

The direct helper names and imports should follow actual repo types at implementation time; the pattern is grounded in existing integration tests and the existing server transport API. [VERIFIED: `tests/integration/debugpyAdapter.test.ts`; VERIFIED: `src/adapters/socketAdapter.ts`]

## Planning-Ready Implementation Outline

1. **Decision and provisioning slice**: codify Delve as the chosen adapter, pin an initial release version, add setup/download/PATH fallback behavior, and define error codes/readiness diagnostics. [CITED: https://github.com/go-delve/delve/releases; VERIFIED: `scripts/setup-adapters.ts`]
2. **Descriptor and config slice**: add `delve` built-in registration, descriptor lookup, `type: "go"` map, `.go` inference, adapter-only default type, and Go-specific launch/attach flag mapping only where the CLI already has analogous flags. [VERIFIED: `src/adapters/registry.ts`; VERIFIED: `src/config/launchConfig.ts`; VERIFIED: `src/config/programInference.ts`]
3. **Fixture and E2E slice**: add deterministic simple Go programs and tests that cover launch `mode: debug`, a test mode or package/test fixture, `mode: exec` with debug build flags, local attach by PID, breakpoint verification, threads/stack/scopes/variables/evaluate/continue, and cleanup. [CITED: https://github.com/golang/vscode-go/blob/master/docs/debugging.md; VERIFIED: `tests/integration/debugpyAdapter.test.ts`; VERIFIED: `tests/integration/jsDebugAdapter.test.ts`]
4. **Docs and skill slice**: update adapter setup docs, public examples, agent skill/reference notes, docs validation gates, troubleshooting for missing `dlv`, symbol/debug build advice, and the difference between built-in `dlv dap` and manual advanced remote/headless scenarios. [VERIFIED: `docs/adapter-setup.md`; VERIFIED: docsValidation grep results; CITED: https://github.com/go-delve/delve/blob/master/Documentation/api/dap/README.md]
5. **External-project validation slice**: create a candidate ledger, screen at least 6-8 Go repos, fully attempt several low-risk ones spanning CLI app, module package, tests, workspace/launch.json config, and long-running attachable service; capture commit SHAs, exact commands, pass/fail/block status, and dap-cli evidence. [VERIFIED: Phase 7/8 external-project candidate patterns]
6. **Agent-driven hardening slice**: draft a scenario matrix, run one fresh subagent per scenario, require evidence fields, classify failures, fix dap-cli/docs/skills for actionable gaps, and retry the same scenarios until passes or an honest external blocker remains. [VERIFIED: Phase 17 scenario/results artifacts]

## External-Project Validation Strategy

### Safe Candidate Screen

Use this exact screening policy for real GitHub repos. [VERIFIED: adapted from Phase 7/8 candidate docs]

| Criterion | Pass rule |
|-----------|-----------|
| Trust/safety | Public repo, ordinary license/project identity signal, no obvious credential/deploy focus; treat all source as untrusted. [VERIFIED: Phase 7/8 docs] |
| Clone scope | Shallow clone into ignored `tmp/phase-20-external-go-projects/`; use isolated `DAP_CLI_HOME` per repo. [VERIFIED: Phase 7 pattern, adapted path] |
| Script screen | Inspect `README`, `go.mod`, Makefile/task scripts, `.vscode/launch.json`, and any shell hooks before executing. [VERIFIED: Phase 7/8 docs] |
| Environment cost | Skip or block repos requiring Docker, databases, cloud accounts, secrets, privileged setup, long code generation, or flaky network services. [VERIFIED: Phase 7/8 docs] |
| Debuggability | Prefer repositories with deterministic small commands/tests, package main entrypoints, or explicit Go launch configs. [ASSUMED] |
| Evidence | Record repo URL, commit SHA, setup commands actually run, debug config used, breakpoint file/line, inspect commands, cleanup status, and result. [VERIFIED: Phase 7 result ledger pattern] |

### Scenario Classes to Exercise

| Class | Why it matters | Suggested success signal |
|-------|----------------|--------------------------|
| Small CLI package launch | Fastest real-world `mode: debug` signal. [ASSUMED] | Breakpoint hits in package code; stack/locals readable; continue exits or closes cleanly. [ASSUMED] |
| `go test` / package test mode | Tests a mainstream Go debugging use case. [CITED: https://github.com/golang/vscode-go/blob/master/docs/debugging.md] | Delve builds test binary, breakpoint hits inside test or code under test, local variables visible. [ASSUMED] |
| Long-running service | Supports pause/attach and multi-command agent workflows. [ASSUMED] | Start service safely on localhost, attach or launch under Delve, stop on request path or on-entry, cleanup leaves no server. [ASSUMED] |
| Existing `.vscode/launch.json` with `type: "go"` | Verifies launch-config mapping and user-facing interoperability. [CITED: https://github.com/golang/vscode-go/blob/master/docs/debugging.md] | `--list-configs`, named config launch, auto-route request type, breakpoint/inspect all work or actionable unsupported fields surface. [VERIFIED: current launch config features in `docs/adapter-setup.md`] |
| Exec/prebuilt binary | Exercises debug-symbol guidance and `mode: "exec"`. [CITED: https://github.com/golang/vscode-go/blob/master/docs/debugging.md] | Debug build made with `-gcflags=all="-N -l"`; breakpoint binds and state is inspectable. [CITED: https://github.com/golang/vscode-go/blob/master/docs/debugging.md] |
| Path-mapping/symlink candidate, only if safe | Delve docs call out `substitutePath` for symlinks/remotes; this is high-value if a low-cost candidate exists. [CITED: https://github.com/golang/vscode-go/blob/master/docs/debugging.md] | Either working documented mapping or a clearly classified deferred/block result. [ASSUMED] |

### Candidate Search Guidance

- Search for Go repositories with `.vscode/launch.json`, `"type": "go"`, `"mode": "debug"`, `"mode": "test"`, or `"mode": "exec"`. [CITED: https://github.com/golang/vscode-go/blob/master/docs/debugging.md]
- Also include a few popular small Go projects without launch configs so dap-cli's direct `--program` / `.go` inference flow is tested rather than only launch-json interoperability. [ASSUMED]
- Do not lock exact candidates in this research file; repository state and safety screens can change quickly, so execution should capture the current screen result before choosing. [ASSUMED]

## Agent-Driven Hardening Loop

### Task Matrix

Each row should become a fresh subagent task with a concrete goal, not a command recipe, following Phase 17's scenario style. [VERIFIED: `.planning/phases/17-code-oss-smoke-scenario-hardening-20-attach-scenarios-driven/17-SCENARIOS.md`]

| ID | Task family | Required task outcome |
|----|-------------|-----------------------|
| G-01 | Install/readiness | Starting from “Delve missing,” get the built-in adapter ready using project docs/setup and report whether instructions were sufficient. [VERIFIED: local `dlv` missing; VERIFIED: `scripts/setup-adapters.ts` precedent] |
| G-02 | Fixture launch debug | Launch a simple Go package, set a breakpoint, inspect stack/scopes/variables/evaluate, continue, clean up. [ASSUMED] |
| G-03 | Test-mode debug | Debug a package test and inspect one local value. [CITED: https://github.com/golang/vscode-go/blob/master/docs/debugging.md] |
| G-04 | Exec-mode debug | Build a debug-symbol-friendly binary, launch with `mode: exec`, bind a breakpoint. [CITED: https://github.com/golang/vscode-go/blob/master/docs/debugging.md] |
| G-05 | Local attach | Attach to a safely started long-running Go target by PID, pause/inspect/disconnect, and report whether process lifetime matches docs. [CITED: https://github.com/golang/vscode-go/blob/master/docs/debugging.md; CITED: https://github.com/go-delve/delve/blob/master/Documentation/api/dap/README.md] |
| G-06 | Launch config | Use a real or fixture `.vscode/launch.json` with `type: "go"`, list configs, launch by name, and diagnose any unsupported/adapter-native fields. [CITED: https://github.com/golang/vscode-go/blob/master/docs/debugging.md; VERIFIED: current named config support in `docs/adapter-setup.md`] |
| G-07 | External repo CLI | Screen, set up, and debug a small public Go CLI repo under the safety policy. [ASSUMED] |
| G-08 | External repo tests/service | Screen, set up, and debug a test-focused or safe localhost-service repo under the safety policy. [ASSUMED] |
| G-09 | Negative diagnostics | Deliberately try missing Delve, bad program path, optimized/unsymbolized exec binary, and invalid attach PID; classify error quality. [CITED: https://github.com/golang/vscode-go/blob/master/docs/debugging.md; VERIFIED: existing negative-diagnostics style in Phase 7 matrix] |
| G-10 | Docs/skill-only novice pass | Give an agent only the updated dap-cli skill/docs and ask it to complete a Go debugging task; confusion becomes documentation backlog. [VERIFIED: Phase 17 scenario design] |

### Required Evidence Contract

Each subagent result should include exactly these fields so the orchestrator can triage quickly. [VERIFIED: Phase 17 results format]

```text
result: pass|fail|blocked
what_worked: ...
what_didnt: ...
agent_confusion: <none | concise description>
dap_cli_ergonomic_issues: <none | concise list>
evidence: <workspace-relative log/transcript path or inline terminal excerpt>
cleanup_verified: true|false
```

### Feedback/Fix/Retry Cycle

1. Run discovery scenarios once, preserving transcripts under an ignored `tmp/phase-20-runs/` tree or the phase's chosen artifact location. [VERIFIED: Phase 17 used per-scenario transcripts; path adapted]
2. Classify each non-pass as `product bug`, `docs/skill gap`, `candidate/project issue`, `unsafe/block`, or `environment dependency`. [ASSUMED]
3. Convert actionable product/docs gaps into phase gap tasks with exact reproduction evidence; do not “explain away” failed scenarios. [VERIFIED: repo GSD verify/hardening precedent in Phase 7/17 docs]
4. Fix the actionable dap-cli/docs issues, run targeted tests, then rerun the exact failed scenario with a fresh agent prompt. [VERIFIED: Phase 17 results include re-runs after fixes]
5. Keep an explicit “remaining blocker” ledger for external project issues or unavailable prerequisites that are legitimate non-product failures. [VERIFIED: Phase 7/8 ledgers]

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| VS Code Go legacy TypeScript adapter between VS Code and Delve | Direct native Delve DAP (`dlv-dap`) | VS Code Go docs describe the transition as current; docs page reviewed 2026-05-16. [CITED: https://github.com/golang/vscode-go/blob/master/docs/debugging.md] | dap-cli can integrate the debugger directly rather than replicating VS Code Go's historical adapter layer. [VERIFIED: synthesis] |
| Delve DAP with older feature set | Current Delve releases include restart support, active DAP fixes, and fresh v1.26.x maintenance | Delve docs/release notes show restart support by v1.25.1 and v1.26.3 latest Apr. 27, 2026. [CITED: https://github.com/go-delve/delve/blob/master/Documentation/api/dap/README.md; CITED: https://github.com/go-delve/delve/releases] | Pin a current release and avoid planning from stale pre-DAP/early-DAP assumptions. [VERIFIED: synthesis] |
| “Adapter integration” tested only with fake adapters or curated fixtures | dap-cli v0.1.0 already uses real adapter E2E, external repo hardening, and subagent scenario loops | Phases 7, 8, and 17 artifacts exist in this repo. [VERIFIED: Phase 7/8/17 planning artifacts] | Phase 20 should extend that validation standard, not regress to a descriptor-only change. [VERIFIED: synthesis] |

**Deprecated/outdated for this phase:**

- Planning a Go adapter around VS Code Go's legacy adapter layer is outdated for this purpose; the native Delve DAP path is the target. [CITED: https://github.com/golang/vscode-go/blob/master/docs/debugging.md]
- Treating `remotePath` as the primary path-mapping answer is outdated in dlv-dap mode; VS Code Go docs direct users toward `substitutePath`. [CITED: https://github.com/golang/vscode-go/blob/master/docs/debugging.md]

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Final external Go repo candidates should be selected immediately before execution, not locked from this research. | External-Project Validation Strategy | Low; planner can still create a candidate-screen task without hardcoding repos. |
| A2 | Small public Go CLI/test/service repos can be found that satisfy the safety screen and offer deterministic breakpoint triggers. | External-Project Validation Strategy | Medium; if search yields poor candidates, the execution phase may need more screening time or narrower examples. |
| A3 | The agent hardening task families G-07/G-08 can be satisfied by real repos without installing unsafe or unusually heavy dependencies. | Agent-Driven Hardening Loop | Medium; legitimate environment blockers must be recorded rather than forced. |
| A4 | A modest friendly-flag mapping for common Go fields improves agent ergonomics without overfitting a runtime-specific CLI surface. | Architecture Patterns | Medium; planner may choose JSON-first support if implementation complexity or CLI consistency argues against new flags. |

## Open Questions (RESOLVED)

1. **Should setup download a Delve release binary, prefer PATH first, or do both?**
   - What we know: js-debug uses a pinned release asset; debugpy uses a system-first/private-fallback pattern; Delve offers release archives plus Go-install fallback. [VERIFIED: `scripts/setup-adapters.ts`; CITED: https://github.com/go-delve/delve/releases; CITED: https://github.com/golang/vscode-go/blob/master/docs/debugging.md]
      - Resolution: Phase 20 accepts a usable PATH `dlv` first and otherwise provisions pinned Delve v1.26.3 under `DAP_CLI_HOME/adapters/delve/`. Setup output and descriptor diagnostics must identify which path won so reproducibility stays visible. [VERIFIED: `.planning/phases/20-i-d-like-to-find-another-runtime-that-we-can-debug-we-should/20-01-PLAN.md`]

2. **How much remote/headless Delve support belongs in Phase 20?**
   - What we know: `dlv dap` and `dlv --headless` have distinct session semantics; dap-cli can already connect to custom socket adapters manually. [CITED: https://github.com/go-delve/delve/blob/master/Documentation/api/dap/README.md; VERIFIED: `src/adapters/descriptor.ts`]
      - Resolution: Phase 20 guarantees built-in `dlv dap` launch and same-machine local PID attach only. Remote/headless/multi-client Delve is explicitly outside the built-in contract; Plan 20-04 may document that advanced users can use separate external socket/headless workflows without implementing or validating that support here. [VERIFIED: `.planning/phases/20-i-d-like-to-find-another-runtime-that-we-can-debug-we-should/20-01-PLAN.md`; VERIFIED: `.planning/phases/20-i-d-like-to-find-another-runtime-that-we-can-debug-we-should/20-04-PLAN.md`]

3. **Should dap-cli normalize Go program paths or set Delve server cwd?**
   - What we know: Delve resolves paths relative to the DAP server process cwd; dap-cli descriptors support `cwd`; current named launch config resolution already expands workspace variables. [CITED: https://github.com/go-delve/delve/blob/master/Documentation/usage/dlv_dap.md; VERIFIED: `src/adapters/descriptor.ts`; VERIFIED: `src/config/launchConfig.ts`]
      - Resolution: Plan 20-02 normalizes relative Go `program` paths to absolute paths from the already-resolved effective `cwd` used by dap-cli config layering, defaulting to the existing process/workspace cwd convention when no explicit `cwd` exists. The normalized launch payload keeps the user's `cwd` value intact and does not rely on silently changing the spawned Delve server transport cwd. Tests must cover relative-program-plus-cwd, already-absolute program preservation, and unchanged attach `processId` handling. [VERIFIED: `.planning/phases/20-i-d-like-to-find-another-runtime-that-we-can-debug-we-should/20-02-PLAN.md`]

4. **Where should Go-specific skill guidance live?**
   - What we know: prior phases maintain in-repo skill docs and user-level mirrors, and docsValidation gates have caught drift. [VERIFIED: Phase 16/18 planning summaries and grep results]
      - Resolution: Plan 20-04 creates `dap-cli/skills/dap-cli/references/go-delve.md`, links it from the existing dap-cli skill/workflow entry points, and pins those references in docs validation. Executors still read the active files first, but the target artifact and validation path are fixed. [VERIFIED: `.planning/phases/20-i-d-like-to-find-another-runtime-that-we-can-debug-we-should/20-04-PLAN.md`]

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|-------------|-----------|---------|----------|
| Node.js | Existing dap-cli repo/build/tests | yes | v22.22.1 | - [VERIFIED: terminal probe] |
| npm | Existing scripts/setup-adapters/test commands | yes | 10.9.4 | - [VERIFIED: terminal probe] |
| Go toolchain | Go fixtures, external projects, `go install` fallback | yes | go1.23.5 darwin/arm64 | Use release-built Delve binary where Go install is not desired, but Go itself remains needed for debug/test fixture builds. [VERIFIED: terminal `go version`; CITED: https://github.com/golang/vscode-go/blob/master/docs/debugging.md] |
| Delve `dlv` | Recommended built-in adapter runtime | no | - | `setup-adapters` should provision it; manual `go install .../dlv@v1.26.3` or release asset remains docs fallback. [VERIFIED: terminal probe; CITED: https://github.com/golang/vscode-go/blob/master/docs/debugging.md; CITED: https://github.com/go-delve/delve/releases] |
| Java runtime/JDK | Java runner-up candidate only | no usable runtime detected by `java -version` / `javac -version` | - | This strengthens the “not Phase 20” stance for Java on this workstation. [VERIFIED: terminal probe] |
| PowerShell | PowerShell runner-up candidate only | yes | PowerShell 7.6.1 | Transport mismatch still blocks choosing it for Phase 20. [VERIFIED: terminal probe; VERIFIED: `src/adapters/descriptor.ts`; CITED: https://github.com/PowerShell/PowerShellEditorServices] |
| .NET SDK | C# runner-up candidate only | no | - | Not needed for recommended Go/Delve path. [VERIFIED: terminal probe] |

**Missing dependencies with no fallback:** None for the research phase itself. [VERIFIED: current task completed without Delve installation]

**Missing dependencies with fallback:** Delve `dlv` is absent locally, but Phase 20's planned setup flow should provision it before Go E2E work; official manual install/release alternatives exist. [VERIFIED: terminal probe; CITED: https://github.com/golang/vscode-go/blob/master/docs/debugging.md; CITED: https://github.com/go-delve/delve/releases]

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest `^3.2.4` [VERIFIED: `package.json`] |
| Config file | `vitest.config.ts` [VERIFIED: workspace read] |
| Quick run command | `npx vitest run tests/config/programInference.test.ts tests/config/launchConfig.test.ts tests/adapters/registry.test.ts` [VERIFIED: existing test paths] |
| Focused Delve E2E command | `npx vitest run tests/integration/delveAdapter.test.ts` once added [ASSUMED] |
| Full phase command | `npm run typecheck && npm test && npm run build` plus gated Delve/external smoke commands defined by the plan [VERIFIED: `package.json`; ASSUMED for Delve gate names] |

### Phase Behaviors -> Test Map

| Behavior | Test Type | Automated Command | File Exists? |
|----------|-----------|-------------------|--------------|
| Registry lists/resolves `delve` built-in | unit/integration | `npx vitest run tests/adapters/registry.test.ts tests/integration/delveAdapter.test.ts` | Registry file exists; Delve file is Wave 0. [VERIFIED: existing file search; ASSUMED planned file] |
| `type: "go"` and `.go` infer to Delve | unit | `npx vitest run tests/config/launchConfig.test.ts tests/config/programInference.test.ts` | Existing files; cases are Wave 0 additions. [VERIFIED: existing files] |
| Setup provision/readiness diagnostics | integration/unit | `npx vitest run tests/testing/tempEnv.test.ts` plus setup-focused tests selected by executor | Existing temp env tests; Delve cases are Wave 0 additions. [VERIFIED: `tests/testing/tempEnv.test.ts` grep result] |
| Launch Go package, break, inspect, continue | real adapter integration | `npx vitest run tests/integration/delveAdapter.test.ts` | Wave 0. [ASSUMED] |
| Debug `mode: test` | real adapter integration | `npx vitest run tests/integration/delveAdapter.test.ts` | Wave 0. [ASSUMED] |
| Debug `mode: exec` with debug-symbol build | real adapter integration | `npx vitest run tests/integration/delveAdapter.test.ts` | Wave 0. [ASSUMED] |
| Local attach by PID | gated integration | `DAP_CLI_RUN_DELVE_ATTACH_SMOKE=1 npx vitest run tests/integration/delveAdapter.test.ts` | Wave 0; env-gate pattern mirrors debugpy/browser smokes. [VERIFIED: existing `DAP_CLI_RUN_DEBUGPY_ATTACH_SMOKE` and browser smoke gates; ASSUMED env name] |
| Docs/examples/skill references remain accurate | docs validation | `npx vitest run tests/integration/docsValidation.test.ts` | Existing file. [VERIFIED: grep results] |
| External repositories are screened and attempted safely | manual/UAT with transcripts | Planning artifact/UAT verification command to be defined | Wave 0 planning artifact. [VERIFIED: Phase 7/8 precedent] |
| Subagent retry loop produces evidence and closes actionable gaps | manual/UAT plus focused regressions | Scenario/results artifact review plus targeted tests per fix | Wave 0 planning artifact. [VERIFIED: Phase 17 precedent] |

### Sampling Rate

- **Per task commit:** Run the narrowest config/descriptor/setup/integration tests touched by the task. [VERIFIED: repo GSD phase plans commonly use focused commands; ASSUMED exact command per task]
- **Per wave merge:** Run all Delve-focused tests, docsValidation if docs changed, and `npm run typecheck`. [ASSUMED]
- **Phase gate:** Full repo check, Delve real-adapter smoke suite, external-project ledger complete, subagent scenario matrix complete or honestly blocked, and later `/gsd-verify-work` hand-driven CLI sequences captured per repo rule. [VERIFIED: `.github/copilot-instructions.md`; VERIFIED: Phase 7/17 precedent]

### Wave 0 Gaps

- [ ] `src/adapters/builtins/delve.ts` - built-in descriptor and diagnostics. [ASSUMED]
- [ ] Delve setup/provisioning code in `scripts/setup-adapters.ts`. [ASSUMED]
- [ ] `tests/fixtures/simple-go-app/` and fixture variants for test/exec/attach. [ASSUMED]
- [ ] `tests/integration/delveAdapter.test.ts` - descriptor plus real DAP E2E coverage. [ASSUMED]
- [ ] New config/inference cases in existing `tests/config/*.test.ts`. [ASSUMED]
- [ ] Docs/skill update tests if new command examples are added. [VERIFIED: docsValidation precedent; ASSUMED exact assertions]
- [ ] Phase 20 external candidate ledger and Phase 20 agent scenario/results artifacts. [VERIFIED: Phase 7/8/17 precedent; ASSUMED Phase 20 file names]

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | Phase 20 is a local CLI/debugger integration, not an auth system. [VERIFIED: phase scope] |
| V3 Session Management | yes, locally | Preserve dap-cli session identity/lifecycle controls and deterministic cleanup. [VERIFIED: current controller/session architecture; VERIFIED: Phase 7 cleanup matrix] |
| V4 Access Control | limited | Delve should bind to localhost/same-user defaults; do not broaden access by default. [CITED: https://github.com/go-delve/delve/blob/master/Documentation/usage/dlv_dap.md] |
| V5 Input Validation | yes | Keep schema/config validation in existing Zod/config layers and surface structured errors for missing adapters, invalid config, bad PIDs, and unsupported paths. [VERIFIED: `src/adapters/config.ts`; VERIFIED: existing CLI error patterns in Phase 7 matrix] |
| V6 Cryptography | limited | Do not hand-roll integrity; if setup downloads release assets, prefer official checksum verification or document the trust boundary explicitly. [CITED: https://github.com/go-delve/delve/releases; ASSUMED product choice] |

### Known Threat Patterns for This Stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Publicly reachable debug adapter can run/debug arbitrary programs | Elevation of Privilege / Tampering | Bind `dlv dap` to `127.0.0.1`, retain same-user default, avoid remote listen defaults, document advanced remote use separately. [CITED: https://github.com/go-delve/delve/blob/master/Documentation/usage/dlv_dap.md; CITED: https://github.com/golang/vscode-go/blob/master/docs/debugging.md] |
| Downloading adapter binaries during setup | Tampering | Use pinned official releases, consider checksum verification from published checksum assets, and show exact version/path in setup logs. [CITED: https://github.com/go-delve/delve/releases; ASSUMED checksum implementation choice] |
| Running arbitrary external repo setup/build scripts | Tampering / Information Disclosure | Reuse Phase 7/8 untrusted-repo screening and skip unsafe/credentialed/heavy candidates. [VERIFIED: Phase 7/8 candidate docs] |
| Debug logs leak env/args/source details | Information Disclosure | Keep logs local, avoid shipping logs externally, and preserve earlier repo guidance that debug artifacts may contain sensitive details. [VERIFIED: `.copilot/instructions/general.instructions.md`; CITED: https://github.com/golang/vscode-go/blob/master/docs/debugging.md] |
| Attach semantics unexpectedly terminate a target | Denial of Service | Test launched-vs-attached disconnect behavior and document the intended `terminateDebuggee` lifecycle. [CITED: https://github.com/go-delve/delve/blob/master/Documentation/api/dap/README.md] |

## Sources

### Primary (HIGH confidence)

- `/go-delve/delve` Context7 library resolution and fetched Delve DAP docs - `dlv dap`, logging, disconnect, listen defaults. [VERIFIED: Context7 CLI output]
- https://github.com/go-delve/delve/blob/master/Documentation/usage/dlv_dap.md - exact `dlv dap` server semantics and flags. [CITED]
- https://github.com/go-delve/delve/blob/master/Documentation/api/dap/README.md - launch/attach modes, shutdown behavior, logging, versions. [CITED]
- https://github.com/golang/vscode-go/blob/master/docs/debugging.md - VS Code Go's current dlv-dap guidance, config fields, attach behavior, install guidance, symbol/debug tips. [CITED]
- https://github.com/go-delve/delve/releases - latest release/version/assets and checksums at research time. [CITED]
- Workspace source and planning artifacts named throughout this file - current dap-cli architecture, provisioning precedent, smoke/hardening precedent. [VERIFIED: workspace reads/search]

### Secondary (MEDIUM confidence)

- https://github.com/microsoft/java-debug and https://github.com/microsoft/vscode-java-debug - Microsoft Java runner-up ownership, current release shape, JDT LS-dependent low-level usage. [CITED]
- https://github.com/PowerShell/PowerShellEditorServices - PowerShell runner-up transport/session-details shape. [CITED]
- https://github.com/dotnet/vscode-csharp - official C# ecosystem runner-up, extension-centric install/readme shape. [CITED]

### Tertiary (LOW confidence)

- None used as an authority. Search-only or assumption-only items are isolated in the Assumptions Log and marked `[ASSUMED]`. [VERIFIED: research method]

## Metadata

**Confidence breakdown:**

- Standard stack: HIGH - Delve's DAP/process model, release assets, and VS Code Go usage are all confirmed from official sources. [CITED: Delve docs/releases; CITED: VS Code Go docs]
- Architecture: HIGH - the required dap-cli seams already exist and were read directly in the workspace. [VERIFIED: adapter/config/setup source files]
- Pitfalls: HIGH for transport/config/provisioning distinctions; MEDIUM for external repo candidate availability because execution-time screening remains necessary. [VERIFIED: cited docs; ASSUMED repo availability]
- Validation architecture: HIGH for repo-local test seams and prior hardening patterns; MEDIUM for exact new file/env-gate names because those are plan choices. [VERIFIED: tests/planning artifacts; ASSUMED names]

**Research date:** 2026-05-16  
**Valid until:** 2026-06-15 for the Delve/runtime recommendation; re-check release versions and candidate repositories immediately before implementation. [ASSUMED]