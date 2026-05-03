# Phase 3: Built-in and Custom Adapter Support - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md - this log preserves the alternatives considered.

**Date:** 2026-05-03
**Phase:** 3-Built-in and Custom Adapter Support
**Areas discussed:** Launch/attach UX, JavaScript adapter strategy

---

## Launch/Attach UX

| Option | Description | Selected |
|--------|-------------|----------|
| Inline JSON | `launch --adapter js --json '{...}'`; direct DAP shape, simplest for agents. | |
| Config file path | `launch --adapter js --config file.json`; cleaner for large configs. | |
| Both | Support inline JSON and config files, with inline overriding file values. | |

**User's choice:** Freeform: support JSON, named configs from `.vscode/launch.json`, and direct flags for common properties.
**Notes:** This expands the presented options into a three-source model.

| Option | Description | Selected |
|--------|-------------|----------|
| Flags > JSON > named config | Most explicit CLI input wins; named launch config is the base. | yes |
| JSON > flags > named config | Treat JSON as the full override blob, with flags only filling gaps. | |
| Reject mixed sources | Simpler to reason about, but less ergonomic. | |

**User's choice:** Flags > JSON > named config.
**Notes:** Explicit CLI flags win over other sources.

| Option | Description | Selected |
|--------|-------------|----------|
| Infer from type | Use `.vscode/launch.json` `type` such as node/python, with `--adapter` able to override. | |
| Require --adapter | Always explicit, but more typing for common project configs. | |
| Config mapping only | Require dap-cli config to map launch types to adapter ids. | yes |

**User's choice:** Config mapping only.
**Notes:** dap-cli should not infer adapter identity directly from launch config `type` without its own mapping layer.

| Option | Description | Selected |
|--------|-------------|----------|
| Current session summary | sessionId, lifecycle, capabilities, eventCursor; same shape as fake adapter now. | yes |
| Plus resolved config | Also include adapter id and sanitized merged config for debugging. | |
| Minimal id only | Only sessionId/name; agents call status/capabilities next. | |

**User's choice:** Current session summary.
**Notes:** Preserve current successful launch/attach response shape.

---

## JavaScript Adapter Strategy

| Option | Description | Selected |
|--------|-------------|----------|
| Bundle dependency | dap-cli depends on a JS DAP adapter package and launches it directly. | |
| Discover installed adapter | Use a user/project-installed adapter; smaller package, more setup variance. | |
| Configurable command only | Ship no JS dependency; built-in means a default descriptor template. | |

**User's choice:** Freeform: js-debug should be bundled; investigate how to retrieve/bundle it and whether Marketplace VSIX download is technically and legally feasible.
**Notes:** Follow-up research indicated the MIT `microsoft/vscode-js-debug` source/package/build-artifact route is cleaner than relying on Marketplace VSIX download/terms.

| Option | Description | Selected |
|--------|-------------|----------|
| Use js-debug source/package route | Research MIT repo/npm/build artifact path; avoid Marketplace VSIX dependency. | yes |
| Investigate VSIX route first | Plan around downloading/unpacking VSIX if terms and stability check out. | |
| Support both as separate providers | More flexible, but more scope and more legal/packaging surface. | |

**User's choice:** Use js-debug source/package route.
**Notes:** VSIX route remains a possible research fallback only if explicitly reviewed.

| Option | Description | Selected |
|--------|-------------|----------|
| Node only | Fastest reliable baseline: launch a Node script, break, inspect, continue. | |
| Node + browser attach | Also attach to Chrome/Edge CDP; useful, but more moving parts. | |
| Node + TypeScript sourcemap | Launch TS/bundled output and verify source-mapped breakpoint behavior. | |

**User's choice:** Freeform: all are important - Node, Chrome, Electron, and TypeScript source maps.
**Notes:** User wants broad JS coverage in Phase 3.

| Option | Description | Selected |
|--------|-------------|----------|
| Node baseline, others smoke if feasible | Guarantee Node + source maps; plan Chrome/Electron as additional tests if stable. | |
| All required before Phase 3 complete | Node, Chrome, Electron, and TS source maps are all must-pass gates. | yes |
| Split Electron later | Node, Chrome, TS source maps now; Electron deferred if too costly. | |

**User's choice:** All required before Phase 3 complete.
**Notes:** Planning should split work carefully but keep all listed target types inside the phase completion gate.

| Option | Description | Selected |
|--------|-------------|----------|
| Preserve adapter-native config | Pass through js-debug launch/attach config, with dap-cli only layering selection/defaults. | |
| Normalize to dap-cli flags | Hide adapter config differences behind common flags; more design work. | |
| Hybrid | Common flags plus raw adapter-native JSON for advanced cases. | yes |

**User's choice:** User delegated this to the agent.
**Notes:** The agent chose the hybrid approach: preserve js-debug native config and layer dap-cli flags as convenience overrides.

## the agent's Discretion

- Detailed JS config shape: prefer adapter-native config passthrough plus common flags, unless research finds a better established adapter API.

## Deferred Ideas

None.
