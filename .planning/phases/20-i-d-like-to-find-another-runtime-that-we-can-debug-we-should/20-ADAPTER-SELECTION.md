# Phase 20 Adapter Selection: Go/Delve

## Decision

Phase 20 integrates **Go** debugging through Delve's native DAP server, `dlv dap`.

| Contract | Value |
| --- | --- |
| Runtime | Go |
| Debug adapter | Delve native DAP mode |
| dap-cli adapter id | `delve` |
| VS Code launch config type | `go` |
| Pinned Delve target | `v1.26.3` |

The built-in dap-cli happy path starts a local adapter server with:

```text
dlv dap --listen=127.0.0.1:${port}
```

That local `dlv dap` contract covers launch and same-machine PID attach. Remote, headless, and multi-client Delve workflows remain outside the built-in adapter contract for this phase; advanced users may model those separately through custom socket descriptors if they choose.

## Why Delve

Delve is the best fit for dap-cli's existing built-in adapter shape. It is a popular Go debugger, it exposes a standalone DAP process, and VS Code Go already treats native Delve DAP as the modern debugging path. That maps cleanly to dap-cli's existing server transport without introducing another orchestration layer.

| Candidate | Fit | Phase 20 disposition |
| --- | --- | --- |
| Go/Delve `dlv dap` | Standalone DAP server, official release binaries, clear launch and local attach model | Selected |
| Microsoft Java Debug Server | Microsoft-run and mature, but official low-level use depends on JDT LS plus an LSP debug-session handshake | Runner-up; defer to a future feasibility spike |
| PowerShell Editor Services | Active and useful, but session discovery plus named-pipe/socket behavior broadens the transport problem | Not selected |

The user's Microsoft preference is preserved as a real selection criterion, not ignored. Java is the strongest Microsoft-owned runner-up, but Delve gives this phase a much cleaner end-to-end implementation and verification path.

## Provisioning Contract

`npm run setup-adapters` must make Delve readiness visible and deterministic:

1. Accept a usable PATH `dlv` when one is already installed.
2. Otherwise provision the official pinned Delve `v1.26.3` release asset under `DAP_CLI_HOME/adapters/delve/`.
3. Report which Delve path won so later debugging evidence is reproducible.
4. Keep asset/platform selection explicit instead of constructing opaque URLs.

Provisioning must document the remote trust boundary. The preferred implementation consumes the official release/checksum material where practical; if checksum consumption is blocked during execution, the setup behavior and docs must state the remaining trust boundary explicitly rather than silently trusting arbitrary downloads.

## Implementation Boundary

The built-in Delve descriptor owns only adapter readiness and local server launch:

- adapter id `delve`;
- localhost-only server transport;
- `dlv dap --listen=127.0.0.1:${port}` arguments;
- typed `delve_not_found` diagnostics with `npm run setup-adapters` guidance.

Later Phase 20 plans own registry wiring, `type: "go"`, `.go` inference, Delve launch payload normalization, Go fixtures, real adapter E2E tests, docs, external-project validation, and agent hardening loops.