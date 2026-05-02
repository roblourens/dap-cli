# Pitfalls Research

**Domain:** Agent-facing Debug Adapter Protocol CLI
**Researched:** 2026-05-02
**Confidence:** HIGH

## Critical Pitfalls

### Pitfall 1: Treating DAP as Stateless

**What goes wrong:**
Each CLI command tries to create a fresh adapter connection, so breakpoints, threads, capabilities, and pause state are lost.

**Why it happens:**
Most CLIs are request/response tools, but DAP sessions are long-lived and eventful.

**How to avoid:**
Build a controller/daemon in the first architecture phase and make active-session routing a core concept.

**Warning signs:**
Commands can set a breakpoint but a later stack trace command has no session context.

**Phase to address:**
Phase 1.

---

### Pitfall 2: Missing DAP Lifecycle Steps

**What goes wrong:**
Adapters behave inconsistently because initialize, launch/attach, initialized, setBreakpoints, configurationDone, and stopped handling are sequenced incorrectly.

**Why it happens:**
DAP is simple JSON at the transport layer, but the session lifecycle is semantic.

**How to avoid:**
Model lifecycle states explicitly and test against a fake adapter before real adapters.

**Warning signs:**
Breakpoints are unverified, execution never stops, or adapters hang after launch.

**Phase to address:**
Phase 1 and Phase 2.

---

### Pitfall 3: Hand-Maintained Full Protocol Surface

**What goes wrong:**
Some DAP requests are missing or option shapes drift from the spec.

**Why it happens:**
The protocol has many requests and changes over time.

**How to avoid:**
Generate command metadata from the official DAP protocol JSON and cover generated output with snapshot/schema tests.

**Warning signs:**
New spec requests are absent from help, or command arguments differ from official DAP names.

**Phase to address:**
Phase 2.

---

### Pitfall 4: Adapter Packaging Surprises

**What goes wrong:**
Bundled JS/Python support works on one machine but fails elsewhere due to platform binaries, Python environment differences, or missing standalone adapter builds.

**Why it happens:**
Debug adapters are distributed differently across ecosystems.

**How to avoid:**
Use adapter descriptors, config overrides, smoke tests, and clear diagnostics. Treat bundled adapters as presets with escape hatches.

**Warning signs:**
Adapter launch errors mention missing Python modules, missing server files, unsupported architecture, or invalid cwd.

**Phase to address:**
Phase 3.

---

### Pitfall 5: Unsafe Attach/Listen Defaults

**What goes wrong:**
Remote attach or debugpy listen mode exposes debugger access beyond localhost.

**Why it happens:**
Debug protocols can allow code evaluation or sensitive state inspection.

**How to avoid:**
Default to localhost, warn on `0.0.0.0`, and make remote attach explicit.

**Warning signs:**
Examples bind to all interfaces or hide host/port in presets.

**Phase to address:**
Phase 3 and Phase 4.

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Store raw launch config with secrets | Easy session restore | Credentials leak into state/logs. | Never without redaction. |
| Add JS/Python special cases to core | Fast built-in adapter support | Custom adapters become second-class. | Only in descriptor-specific launch helpers. |
| Skip fake adapter tests | Faster early implementation | Real adapters make failures flaky and hard to diagnose. | Never for protocol core. |
| Manual command definitions only | Quick first commands | Full DAP coverage will drift. | Accept only for ergonomic aliases. |

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| DAP stdio | Forget content-length framing or mix logs into protocol streams. | Keep adapter stderr separate and implement strict framing on stdout/stdin. |
| js-debug | Assume VS Code extension layout is the same as standalone server layout. | Detect/configure the actual standalone server command and validate at startup. |
| debugpy | Bind to public interfaces by default. | Default to localhost and require explicit remote configuration. |
| Custom adapters | Assume all adapters support the same requests. | Use initialize capabilities and report unsupported commands clearly. |

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Unbounded event history | Controller memory grows over long sessions. | Keep bounded recent event buffers and log to files. | Long-running agent sessions. |
| Huge variable expansion by default | `variables` commands hang or output too much JSON. | Require pagination/ranges where DAP supports them and provide depth limits. | Large objects or arrays. |
| Repeated adapter startup | Every command is slow and loses state. | Persistent controller. | Immediately after first multi-command workflow. |

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| Logging full env/args | Secrets exposed in planning logs or artifacts. | Redact env vars and sensitive-looking args. |
| Remote debug listen by default | Unauthorized code evaluation or state inspection. | Localhost default and explicit warnings. |
| Allowing arbitrary config execution silently | Users may run unexpected binaries. | Show resolved adapter command in status and support trust/confirmation in interactive future modes. |

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Human-only output | Agents must scrape text. | JSON-first output with concise text available separately. |
| Requiring session ID every time | Agent commands get noisy and brittle. | Default active session plus explicit override. |
| Hiding adapter stderr | Failures are opaque. | Include log path and latest adapter error summary. |
| DAP jargon without examples | Hard to discover commands. | Generated help plus agent-oriented examples. |

## "Looks Done But Isn't" Checklist

- [ ] **Session lifecycle:** Launch works, but close/cleanup also terminates adapters and removes stale state.
- [ ] **Breakpoint command:** Breakpoints are not just sent; verified results are surfaced.
- [ ] **Stack inspection:** Handles multiple threads and no-stopped-state gracefully.
- [ ] **Variables:** Supports nested variables without dumping unbounded output.
- [ ] **Custom adapters:** Works with stdio and TCP/server adapters, not only built-ins.
- [ ] **Typed coverage:** Help output includes every DAP request from the chosen spec version.

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Stateless implementation | HIGH | Introduce controller, migrate commands to route through sessions, add compatibility aliases. |
| Protocol drift | MEDIUM | Add generator, compare command inventory to official spec, deprecate mismatched commands. |
| Adapter packaging failure | MEDIUM | Add descriptor overrides, platform checks, smoke tests, and docs for installed adapters. |
| Unsafe remote defaults | LOW | Change defaults to localhost and add warnings before broad release. |

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| Treating DAP as stateless | Phase 1 | Two separate CLI calls operate on one fake adapter session. |
| Missing lifecycle steps | Phase 1 | Fake adapter asserts initialize/launch/configurationDone ordering. |
| Protocol surface drift | Phase 2 | Generated command inventory matches official protocol request list. |
| Adapter packaging surprises | Phase 3 | JS and Python smoke tests run through built-in descriptors. |
| Unsafe attach/listen defaults | Phase 4 | Tests verify localhost defaults and warnings for public binds. |

## Sources

- https://microsoft.github.io/debug-adapter-protocol/specification - lifecycle, requests, events, capabilities.
- https://github.com/microsoft/debugpy - security warning for non-localhost debugpy listen mode.
- https://github.com/microsoft/vscode-js-debug - standalone adapter availability and feature breadth.
- `/Users/roblou/code/mcp-debugger/README.md` - inspiration for agent-debugging failure modes.

---
*Pitfalls research for: Agent-facing DAP CLI*
*Researched: 2026-05-02*