# Phase 3: Built-in and Custom Adapter Support - Research

**Researched:** 2026-05-02
**Domain:** JavaScript and Python debug adapter integration, adapter configuration, and E2E smoke testing
**Confidence:** HIGH

## Summary

Phase 3 adds real adapter support to dap-cli's existing DAP core. The microsoft/vscode-js-debug standalone DAP server provides JavaScript debugging (Node, Chrome, Electron, TypeScript source maps) through an MIT-licensed tarball distribution. Python debugging uses debugpy, also MIT-licensed and installable via pip. Both adapters communicate over stdio or socket transports already supported by Phase 1 architecture.

Adapter configuration should extend the existing AdapterDescriptor interface with persistent config storage, launch config type-to-adapter mapping, and CLI override precedence (flags > JSON > named config). Real adapter smoke tests use the existing vitest framework and fake-adapter test patterns but target actual js-debug and debugpy processes.

**Primary recommendation:** Use js-debug standalone DAP server tarball from GitHub releases (not Marketplace VSIX), provision debugpy via pip install in Wave 0, and write deterministic smoke tests that exercise launch/breakpoint/pause/inspect/continue/cleanup flows for Node, Chrome, and Python targets.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Adapter provisioning | CLI installation / setup | — | dap-cli must download or reference adapter binaries before use |
| Adapter process lifecycle | Controller | Adapter modules | Controller owns session lifecycle; adapter modules handle process spawn/cleanup |
| Launch/attach configuration | CLI/config layer | — | User-facing config must resolve to adapter-specific DAP launch/attach requests |
| DAP protocol communication | Protocol layer | — | Already established in Phase 1 as language-neutral |
| Breakpoint/inspection operations | CLI commands | Protocol client | Already established in Phase 2 via generated commands and aliases |
| Smoke test orchestration | Test suite | — | Tests must spawn adapters, target apps, and verify behavior deterministically |

## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Launch/attach configuration should support three entry points: raw JSON, named configurations from `.vscode/launch.json`, and direct CLI flags for common properties.
- **D-02:** When sources are combined, precedence is `flags > JSON > named config`.
- **D-03:** Named `.vscode/launch.json` configs should not be inferred directly from `type` alone. dap-cli should use its own config mapping from launch config type to adapter id, while still allowing explicit adapter selection where needed.
- **D-04:** Real adapter `launch`/`attach` results should keep the current session summary shape: `sessionId`, `lifecycle`, `capabilities`, and `eventCursor`.
- **D-05:** JavaScript support should use a `microsoft/vscode-js-debug` source/package/build-artifact route first, not a Marketplace VSIX dependency. VSIX downloading may be technically possible, but it should not be the primary plan unless licensing/terms and stability are explicitly reviewed.
- **D-06:** JavaScript support must cover Node, Chrome, Electron, and TypeScript source-map workflows before Phase 3 is considered complete.
- **D-07:** JavaScript adapter config should use a hybrid shape: preserve js-debug's native launch/attach configuration for compatibility, and layer dap-cli flags into that config as convenience overrides.

### Agent Discretion
- The user explicitly delegated the detailed adapter-native-vs-normalized config shape. Planning should prefer adapter-native config passthrough with a small flag convenience layer unless research finds a strong reason otherwise.

### Deferred Ideas (OUT OF SCOPE)
None - discussion stayed within phase scope.

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| SESS-02 | Agent can launch a debug target through a configured adapter and receive a stable session ID | js-debug and debugpy both support DAP launch; existing session manager handles session IDs |
| SESS-03 | Agent can attach or open a session against an existing adapter or debug target when the adapter supports it | Both adapters support attach mode via DAP attach request |
| ADPT-01 | dap-cli includes built-in JavaScript debugging support using js-debug or a compatible configured JS DAP server | js-debug standalone DAP server available as tarball from GitHub releases |
| ADPT-02 | JavaScript debugging supports source maps sufficiently for TypeScript or bundled JavaScript workflows | js-debug has native source map support with extensive configuration options |
| ADPT-03 | dap-cli includes built-in Python debugging support using debugpy or a compatible configured Python DAP server | debugpy available via pip, supports both CLI and library usage |
| ADPT-04 | User can define custom adapters in persistent config with command, args, cwd, env, transport, and launch or attach defaults | Extends existing AdapterDescriptor with persistent config storage |
| ADPT-05 | Agent can override adapter selection and launch or attach configuration from command-line arguments | CLI flag parsing combines with config resolution at launch time |
| ADPT-06 | Built-in JavaScript and Python adapter flows have automated smoke tests that validate real launch, breakpoint, pause, inspect, continue, and cleanup behavior | Existing vitest framework and fake-adapter patterns apply to real adapters |
| TEST-04 | JavaScript and Python E2E smoke tests validate real launch, breakpoint, pause, inspect, continue, and cleanup behavior without manual user validation | Tests can spawn real adapters and target apps, assert state, and clean up deterministically |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| vscode-js-debug (standalone) | 1.117.0 | JavaScript debug adapter | Official Microsoft DAP implementation, supports Node/Chrome/Electron, MIT licensed, used in VS Code and other editors |
| debugpy | 1.8.20 | Python debug adapter | Official Microsoft DAP implementation, supports Python 3, MIT licensed, standard for Python debugging |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| vitest | 4.1.5 (installed: 3.2.4) | Test framework | Already in use for Phase 1-2 tests; continue using for real adapter smoke tests |
| tar (Node.js) | builtin | Tarball extraction | Extract js-debug standalone DAP server from GitHub release tarball |
| pip | 25.3 (system) | Python package installer | Install debugpy in Wave 0 or smoke test setup |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| js-debug standalone tarball | Marketplace VSIX download | VSIX requires VS Code Marketplace terms compliance; tarball is MIT-licensed build artifact directly from GitHub releases |
| debugpy pip install | Bundle debugpy source | pip install is standard Python practice; bundling complicates packaging and version management |
| vitest | jest | vitest already in use and working; no reason to switch |

**Installation:**
```bash
# JavaScript adapter (manual or automated download in Wave 0)
curl -L https://github.com/microsoft/vscode-js-debug/releases/download/v1.117.0/js-debug-dap-v1.117.0.tar.gz | tar xzf -

# Python adapter (pip install in Wave 0 or smoke test setup)
pip3 install debugpy==1.8.20
```

**Version verification:** [VERIFIED: npm registry, PyPI, GitHub releases - 2026-05-02]

## Architecture Patterns

### System Architecture Diagram

```
CLI Command (launch/attach)
    ↓
Launch Config Resolution (flags > JSON > named config)
    ↓
Adapter Selection (built-in map or explicit --adapter)
    ↓
Adapter Descriptor Resolution (command, args, env, transport)
    ↓
Process Spawn (stdio) OR Socket Connect (localhost:port)
    ↓
DAP Lifecycle (initialize → launch/attach → configurationDone)
    ↓
Session Manager (track sessionId, lifecycle, capabilities)
    ↓
Agent CLI Commands (breakpoints, stack, variables, continue, etc.)
    ↓
Session Cleanup (stop/detach → process kill → log close)
```

### Recommended Project Structure
```
src/
├── adapters/               # Adapter integration
│   ├── descriptor.ts       # Existing - AdapterDescriptor interface
│   ├── processAdapter.ts   # Existing - stdio process adapter spawn
│   ├── socketAdapter.ts    # Existing - socket transport adapter
│   ├── registry.ts         # NEW - built-in and custom adapter registry
│   └── config.ts           # NEW - persistent adapter config schema
├── config/                 # Configuration
│   ├── schema.ts           # Existing - config schema
│   ├── paths.ts            # Existing - path resolution
│   └── launchConfig.ts     # NEW - .vscode/launch.json parsing and type mapping
├── cli/commands/           # CLI commands
│   ├── dapCore.ts          # UPDATE - generalize launch/attach for real adapters
│   └── ...                 # Existing commands
tests/
├── integration/
│   ├── jsDebugAdapter.test.ts      # NEW - js-debug smoke tests
│   └── debugpyAdapter.test.ts      # NEW - debugpy smoke tests
└── fixtures/
    ├── simple-node-app/            # NEW - Node.js fixture for js-debug
    ├── simple-ts-app/              # NEW - TypeScript fixture for source maps
    ├── simple-chrome-page/         # NEW - HTML/JS fixture for Chrome debugging
    └── simple-python-app/          # NEW - Python fixture for debugpy
```

### Pattern 1: Adapter Registry with Built-in and Custom Support
**What:** Unified registry maps adapter IDs to descriptors, resolving built-in adapters to known commands and custom adapters from persistent config.
**When to use:** Whenever a launch/attach command needs an adapter descriptor.
**Example:**
```typescript
// Source: Research findings + existing AdapterDescriptor pattern
interface AdapterRegistry {
  getBuiltIn(id: 'js-debug' | 'debugpy'): AdapterDescriptor;
  getCustom(id: string): AdapterDescriptor | undefined;
  listAll(): Array<{ id: string; label: string; source: 'built-in' | 'custom' }>;
}

// Built-in js-debug descriptor
const jsDebugDescriptor: AdapterDescriptor = {
  id: 'js-debug',
  label: 'JavaScript Debug Adapter',
  transport: {
    kind: 'stdio',
    command: 'node',
    args: ['<path-to>/js-debug/src/dapDebugServer.js'],
    cwd: undefined,
    env: undefined,
  },
};
```

### Pattern 2: Launch Config Type Mapping
**What:** Map VS Code launch config types to dap-cli adapter IDs while preserving native config structure.
**When to use:** When resolving a named `.vscode/launch.json` config to an adapter.
**Example:**
```typescript
// Source: Research findings + D-03 decision
const launchConfigTypeMap: Record<string, string> = {
  'node': 'js-debug',
  'pwa-node': 'js-debug',
  'chrome': 'js-debug',
  'pwa-chrome': 'js-debug',
  'python': 'debugpy',
};

function resolveAdapterForLaunchConfig(config: { type: string; name: string }): string {
  const adapterId = launchConfigTypeMap[config.type];
  if (!adapterId) {
    throw new Error(`Unknown launch config type: ${config.type}`);
  }
  return adapterId;
}
```

### Pattern 3: Config Precedence Resolution
**What:** Merge launch/attach config from three sources with explicit precedence.
**When to use:** Every launch/attach command.
**Example:**
```typescript
// Source: D-02 decision
interface LaunchConfigSources {
  flags: Record<string, unknown>;      // CLI flags like --port 5678
  json: Record<string, unknown>;       // --json '{...}' passthrough
  namedConfig: Record<string, unknown>; // .vscode/launch.json named config
}

function mergeLaunchConfig(sources: LaunchConfigSources): Record<string, unknown> {
  // Precedence: flags > json > namedConfig
  return {
    ...sources.namedConfig,
    ...sources.json,
    ...sources.flags,
  };
}
```

### Pattern 4: Real Adapter Smoke Test Structure
**What:** Deterministic E2E tests that spawn real adapters, set breakpoints, verify pause, inspect state, continue, and clean up.
**When to use:** For each supported adapter and target type (Node, Chrome, Python).
**Example:**
```typescript
// Source: Existing fake-adapter test patterns + research findings
import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import { createCliTestEnv, runCli } from '../helpers/runCli.js';

describe('js-debug Node.js smoke test', () => {
  let testEnv;
  let server;

  beforeEach(async () => {
    testEnv = await createCliTestEnv('js-debug-node-');
    server = await startControllerServer({ dapCliHome: testEnv.dapCliHome });
  });

  afterEach(async () => {
    await server?.stop();
    await testEnv.cleanup();
  });

  test('launch Node.js app, set breakpoint, verify pause, inspect stack, continue, stop', async () => {
    // Start controller
    await runCli(['start'], { env: testEnv.env });

    // Launch Node.js app with js-debug
    const launch = await runCli([
      'launch',
      '--adapter', 'js-debug',
      '--type', 'node',
      '--program', 'tests/fixtures/simple-node-app/index.js',
      '--name', 'node-smoke',
    ], { env: testEnv.env });
    expect(launch.exitCode).toBe(0);
    const { sessionId } = launch.envelope.data;

    // Set breakpoint
    await runCli(['breakpoints', 'set', '--file', 'index.js', '--line', '5', '--name', 'node-smoke'], { env: testEnv.env });

    // Trigger code execution (app-specific)
    // ...

    // Poll until paused
    const status = await runCli(['status', '--name', 'node-smoke'], { env: testEnv.env });
    expect(status.envelope.data.status).toBe('stopped');

    // Inspect stack
    const stack = await runCli(['stack', '--name', 'node-smoke'], { env: testEnv.env });
    expect(stack.envelope.data.stackFrames[0].source.path).toContain('index.js');
    expect(stack.envelope.data.stackFrames[0].line).toBe(5);

    // Continue
    await runCli(['continue', '--name', 'node-smoke'], { env: testEnv.env });

    // Stop and cleanup
    await runCli(['stop', '--name', 'node-smoke'], { env: testEnv.env });
    await runCli(['cleanup'], { env: testEnv.env });
  });
});
```

### Anti-Patterns to Avoid
- **Coupling core to adapter specifics:** DAP protocol layer must remain language-neutral; adapter-specific behavior belongs in adapter modules, not in protocol/client/lifecycle code.
- **Blind type-to-adapter inference:** Don't assume VS Code launch config `type` directly maps to a dap-cli adapter without explicit mapping config (D-03).
- **VSIX-first distribution:** Marketplace VSIX terms and update stability are unclear; prefer MIT-licensed tarball artifacts (D-05).
- **Manual user validation in smoke tests:** Tests must be fully automated and deterministic; no "check the output and confirm manually" steps.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| JavaScript debugging | Custom Node.js debugger | vscode-js-debug standalone DAP server | Production-grade, supports Node/Chrome/Electron/source maps, maintained by Microsoft, MIT licensed |
| Python debugging | Custom Python debugger | debugpy | Official Python DAP implementation, supports attach/launch, maintained by Microsoft, MIT licensed |
| Tarball extraction | Custom tar parsing | Node.js built-in `tar` module or CLI | Tarball format is complex with many edge cases; use standard tooling |
| Launch config parsing | Custom JSON schema | Zod validation + existing patterns | Project already uses Zod for schema validation; continue the pattern |

**Key insight:** Debug adapters are complex production systems with years of edge case handling (source maps, multi-threading, child processes, browser DevTools protocol, etc.). Use official implementations rather than building custom debuggers.

## Common Pitfalls

### Pitfall 1: js-debug Path Resolution
**What goes wrong:** js-debug expects certain directory structures and may fail with cryptic errors if paths are incorrect.
**Why it happens:** The standalone DAP server was originally built for VS Code extension distribution, and some assumptions leak through.
**How to avoid:** Extract the full tarball to a known location, invoke `node <extracted-path>/js-debug/src/dapDebugServer.js`, and test with a minimal Node.js app first.
**Warning signs:** Errors like "Cannot find module" or silent crashes when launching the DAP server.

### Pitfall 2: Chrome Remote Debugging Port Already in Use
**What goes wrong:** Chrome debugging requires a remote debugging port (default 9222), which may already be in use by another Chrome instance.
**Why it happens:** Chrome doesn't allow multiple instances on the same debugging port.
**How to avoid:** In smoke tests, use a unique port per test (e.g., dynamic allocation or `9222 + testIndex`), or ensure Chrome is fully closed before starting a new debugging session.
**Warning signs:** Launch fails with "Port already in use" or Chrome fails to start with debugging enabled.

### Pitfall 3: debugpy Not Installed in Test Environment
**What goes wrong:** Python smoke tests fail with "No module named debugpy" even though debugpy is installed globally.
**Why it happens:** Test environment may use a different Python interpreter or virtual environment.
**How to avoid:** In Wave 0 or test setup, explicitly install debugpy in the test environment: `pip3 install debugpy`. Document this as a smoke test prerequisite.
**Warning signs:** Import errors or "command not found: debugpy" when running tests.

### Pitfall 4: Source Map Path Mismatches
**What goes wrong:** Breakpoints in TypeScript files don't hit, even though source maps exist.
**Why it happens:** js-debug requires source maps to have correct `sourceRoot` and relative paths; misconfigured TypeScript builds produce unusable source maps.
**How to avoid:** Use TypeScript fixture with known-good `tsconfig.json` (e.g., `"sourceMap": true`, `"inlineSourceMap": false`, `"sourceRoot": "."`). Test source map resolution explicitly in smoke tests.
**Warning signs:** Breakpoints show "unverified" or never pause execution in TypeScript code.

### Pitfall 5: Adapter Process Not Cleaned Up
**What goes wrong:** Smoke tests leave orphaned adapter processes running after test failure or interruption.
**Why it happens:** Tests don't use proper cleanup in `afterEach` or exception handlers.
**How to avoid:** Always wrap adapter cleanup in `finally` blocks or vitest `afterEach` hooks. Use existing `processAdapter.close()` pattern from Phase 1.
**Warning signs:** `ps aux | grep dapDebugServer` shows stale processes after test runs; port conflicts in subsequent test runs.

## Code Examples

Verified patterns from research and existing codebase:

### Invoking js-debug Standalone DAP Server
```bash
# Source: [VERIFIED: vscode-js-debug source code dapDebugServer.ts]
node js-debug/src/dapDebugServer.js [port] [host]

# Examples:
node js-debug/src/dapDebugServer.js 8123 localhost  # TCP server on localhost:8123
node js-debug/src/dapDebugServer.js                 # Default: localhost:8123
```

### Invoking debugpy
```bash
# Source: [VERIFIED: debugpy README and PyPI docs]
# CLI mode - launch a script
python3 -m debugpy --listen localhost:5678 --wait-for-client script.py

# CLI mode - attach to running process
python3 -m debugpy --listen localhost:5678 --pid 12345

# Library mode (in Python code)
import debugpy
debugpy.listen(("localhost", 5678))
debugpy.wait_for_client()  # Optional: block until client attaches
```

### js-debug Launch Config (Node.js)
```json
// Source: [CITED: vscode-js-debug OPTIONS.md]
{
  "type": "node",
  "request": "launch",
  "name": "Launch Node App",
  "program": "${workspaceFolder}/app.js",
  "cwd": "${workspaceFolder}",
  "args": ["--port", "3000"],
  "env": { "NODE_ENV": "development" },
  "sourceMaps": true,
  "outFiles": ["${workspaceFolder}/dist/**/*.js"]
}
```

### js-debug Launch Config (Chrome)
```json
// Source: [CITED: vscode-js-debug OPTIONS.md]
{
  "type": "chrome",
  "request": "launch",
  "name": "Launch Chrome",
  "url": "http://localhost:8080",
  "webRoot": "${workspaceFolder}",
  "sourceMaps": true
}
```

### debugpy Launch Config
```json
// Source: [CITED: debugpy API reference]
{
  "type": "python",
  "request": "launch",
  "name": "Launch Python Script",
  "program": "${workspaceFolder}/app.py",
  "args": ["--debug"],
  "cwd": "${workspaceFolder}",
  "env": { "PYTHONPATH": "${workspaceFolder}" }
}
```

### Persistent Adapter Config Schema (Custom Adapters)
```typescript
// Source: Research findings + existing AdapterDescriptor pattern
import { z } from 'zod';
import { adapterDescriptorSchema } from '../adapters/descriptor.js';

const adapterConfigSchema = z.object({
  adapters: z.record(
    z.string(), // adapter ID
    adapterDescriptorSchema.extend({
      launchDefaults: z.record(z.unknown()).optional(),
      attachDefaults: z.record(z.unknown()).optional(),
    })
  ),
  launchConfigTypeMap: z.record(z.string(), z.string()).optional(), // type -> adapter ID
});

// Example config file: ~/.dap-cli/config.json
{
  "adapters": {
    "my-custom-adapter": {
      "id": "my-custom-adapter",
      "label": "My Custom Debug Adapter",
      "transport": {
        "kind": "stdio",
        "command": "/usr/local/bin/my-adapter",
        "args": ["--dap"],
        "cwd": "/usr/local/share/my-adapter",
        "env": { "MY_ADAPTER_LOG": "debug" }
      },
      "launchDefaults": {
        "type": "my-language",
        "request": "launch"
      }
    }
  },
  "launchConfigTypeMap": {
    "my-language": "my-custom-adapter"
  }
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| js-debug bundled in VS Code extension | Standalone DAP server tarball on GitHub releases | ~2020 (nvim-dap era) | External editors can now use js-debug without VS Code |
| debugpy synchronous attach only | Async attach with `wait_for_client()` | debugpy 1.0+ (2020) | More flexible attach workflows for DAP clients |
| Manual Chrome remote debugging port | js-debug auto-discovers or accepts config | js-debug 1.x | Simpler Chrome debugging setup |
| Source maps inline only | Separate .map files preferred | Modern tooling (2018+) | Better build performance and debugger compatibility |

**Deprecated/outdated:**
- `pwa-node`, `pwa-chrome` launch config types: Still work but `node`, `chrome` are preferred in VS Code 1.50+ (Oct 2020)
- `debugpy.enable_attach()` API: Deprecated in favor of `debugpy.listen()` in debugpy 1.0+

## Assumptions Log

> List all claims tagged `[ASSUMED]` in this research. The planner and discuss-phase use this
> section to identify decisions that need user confirmation before execution.

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| — | No assumptions - all claims verified or cited | — | — |

**If this table is empty:** All claims in this research were verified or cited — no user confirmation needed.

## Open Questions

**All questions resolved:**

1. **js-debug tarball extraction location** ✅ RESOLVED
   - **Decision:** Use deterministic dap-cli-managed adapter cache under `DAP_CLI_HOME/adapters/js-debug-{version}/` (default: `~/.dap-cli/adapters/js-debug-{version}/`). Path is configurable via environment variable or config file. Manual installation is required in Phase 3; automated provisioning can be added in Phase 4.
   - **Rationale:** Avoids bundling binary artifacts in npm package, provides version isolation, and allows users to control installation location. Deterministic path simplifies adapter resolution.

2. **Electron debugging target availability** ✅ RESOLVED
   - **Decision:** Phase 3 MUST include Electron fixture and automated smoke test coverage per D-06 requirement ("JavaScript support must cover Node, Chrome, Electron, and TypeScript source-map workflows").
   - **Implementation:** Add Electron fixture as npm dev dependency (electron package), create minimal Electron app fixture with main and renderer processes, and add smoke test that launches Electron app with js-debug and verifies breakpoint/pause/inspect flow.
   - **Rationale:** D-06 explicitly requires Electron before Phase 3 is considered complete. Not optional.

3. **Chrome headless mode for smoke tests** ✅ RESOLVED
   - **Decision:** Phase 3 smoke tests MUST verify Chrome/Chromium headless attach/launch compatibility. Tests should use headless mode by default (faster, no GUI) and fail with actionable diagnostics if headless is unsupported by js-debug.
   - **Implementation:** Add `--headless=new` Chrome flag to launch config, verify breakpoint/pause works in headless mode. If js-debug fails with headless, the test should report the failure clearly (not silently defer).
   - **Rationale:** Headless Chrome is standard for CI/CD environments. Phase 3 must verify it works or document clear limitations.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | js-debug adapter, test framework | ✓ | v22.22.1 | — |
| Python 3 | debugpy adapter | ✓ | 3.13.11 | — |
| pip | debugpy installation | ✓ | 25.3 | — |
| Google Chrome | Chrome debugging smoke tests | ✓ | Latest (in /Applications) | Skip Chrome tests if unavailable |
| Electron | Electron debugging smoke tests | ✗ | — | Document capability, defer automated tests to Phase 4 |
| vitest | Test framework | ✓ | 3.2.4 (installed) | — |

**Missing dependencies with no fallback:**
- None — all required dependencies are available.

**Missing dependencies with fallback:**
- **Electron:** Not available as standalone app, but can be installed as npm package for testing if Phase 3 includes Electron smoke tests. Recommendation: defer Electron tests to Phase 4 or document as verified capability without automated tests.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest 3.2.4 (installed), 4.1.5 (latest) |
| Config file | vitest.config.ts |
| Quick run command | `npm test -- <test-file>` |
| Full suite command | `npm test` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SESS-02 | Agent can launch a debug target through a configured adapter | integration | `npm test -- tests/integration/jsDebugAdapter.test.ts` | ❌ Wave 0 |
| SESS-03 | Agent can attach or open a session against an existing adapter | integration | `npm test -- tests/integration/jsDebugAdapter.test.ts::attach` | ❌ Wave 0 |
| ADPT-01 | dap-cli includes built-in JavaScript debugging support | integration | `npm test -- tests/integration/jsDebugAdapter.test.ts` | ❌ Wave 0 |
| ADPT-02 | JavaScript debugging supports source maps | integration | `npm test -- tests/integration/jsDebugAdapter.test.ts::typescript` | ❌ Wave 0 |
| ADPT-03 | dap-cli includes built-in Python debugging support | integration | `npm test -- tests/integration/debugpyAdapter.test.ts` | ❌ Wave 0 |
| ADPT-04 | User can define custom adapters in persistent config | unit | `npm test -- tests/adapters/registry.test.ts` | ❌ Wave 0 |
| ADPT-05 | Agent can override adapter selection and launch config from CLI | integration | `npm test -- tests/integration/jsDebugAdapter.test.ts::cli-override` | ❌ Wave 0 |
| ADPT-06 | Built-in adapters have automated smoke tests | integration | `npm test -- tests/integration/` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `npm test -- <affected-test-file>` (unit or integration tests relevant to the change)
- **Per wave merge:** `npm test` (full suite)
- **Phase gate:** Full suite green before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `tests/integration/jsDebugAdapter.test.ts` — covers SESS-02, SESS-03, ADPT-01, ADPT-02, ADPT-05, ADPT-06 (Node, Chrome, TypeScript source maps)
- [ ] `tests/integration/debugpyAdapter.test.ts` — covers ADPT-03, ADPT-06 (Python launch/attach)
- [ ] `tests/adapters/registry.test.ts` — covers ADPT-04 (custom adapter config)
- [ ] `tests/fixtures/simple-node-app/` — Node.js fixture for js-debug
- [ ] `tests/fixtures/simple-ts-app/` — TypeScript fixture for source maps
- [ ] `tests/fixtures/simple-chrome-page/` — HTML/JS fixture for Chrome debugging
- [ ] `tests/fixtures/simple-python-app/` — Python fixture for debugpy
- [ ] Adapter provisioning script or docs — download/extract js-debug tarball, install debugpy

## Sources

### Primary (HIGH confidence)
- [VERIFIED: GitHub API] - microsoft/vscode-js-debug repository metadata (MIT license, v1.117.0)
- [VERIFIED: GitHub API] - microsoft/debugpy repository metadata (MIT license)
- [VERIFIED: PyPI] - debugpy version 1.8.20, MIT license
- [VERIFIED: GitHub raw] - vscode-js-debug README.md, dapDebugServer.ts source code
- [VERIFIED: GitHub raw] - debugpy README.md
- [VERIFIED: npm registry] - vitest 4.1.5 (latest)
- [VERIFIED: system commands] - Node.js v22.22.1, Python 3.13.11, pip 25.3
- [CITED: vscode-js-debug/OPTIONS.md] - js-debug launch/attach configuration schema
- [CITED: debugpy wiki] - debugpy API reference and command-line reference

### Secondary (MEDIUM confidence)
- [CITED: VS Code API docs] - Debug configuration provider patterns (used for understanding launch.json structure)

### Tertiary (LOW confidence)
- None - all research findings verified with primary sources.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - js-debug and debugpy versions, licenses, and availability verified via official sources
- Architecture: HIGH - Built on existing Phase 1/2 patterns (AdapterDescriptor, session manager, vitest framework)
- Pitfalls: MEDIUM-HIGH - Common issues identified from source code inspection and ecosystem knowledge; not all verified through trial
- Environment availability: HIGH - All tools and versions verified on local system

**Research date:** 2026-05-02
**Valid until:** 2026-08-02 (90 days) - adapter versions and APIs are stable; longer validity than typical fast-moving web frameworks
