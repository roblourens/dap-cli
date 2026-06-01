---
phase: 22
plan: 10
status: complete
approved_language: Rust
approved_adapter: CodeLLDB v1.12.2
recorded: 2026-06-01
---

# Phase 22 Hardening Gaps

## Classification Policy

This ledger retains every material failure, detour, or ergonomic finding exposed during screened public-project proof and standalone transcript-audited scenarios. A successful rerun does not remove a prior observation. Classification is limited to the verified Rust/CodeLLDB scope; it does not expand platform support or permit redistribution of CodeLLDB artifacts.

## Resolved Gates And Fixed Boundary

| Gate | Classification | Disposition |
| --- | --- | --- |
| `source-code-license-clarification` | resolved gate | Product support is limited to direct download of the official CodeLLDB release asset into user-local cache; no bundling, mirroring, rehosting, or offline redistribution is accepted. |
| `external-project-source-authorization` | resolved gate | Only the SHA-pinned, screened `minigrep` and `itoa` scenarios were executed, under the authorized offline/isolation envelope. |

Verified platform boundary: official CodeLLDB `v1.12.2` asset on `darwin_arm64` only, with loopback dap-cli/controller communication. No hardening finding broadens this boundary.

## Disposition Summary

| ID | Finding | Classification | Plan 22-10 Disposition |
| --- | --- | --- | --- |
| H-01 | Parallel external attempts crossed scratch-root attribution | Scenario-safety blocker | Resolved by exclusive sequential roots; original evidence remains non-accepted. |
| H-02 | Standalone runner could not seed from user-level adapter cache | Runner/environment blocker | Resolved by workspace-local isolated preseed; blocked transcript retained. |
| H-03 | `--allow-all-tools` denied required setup shell command | Runner-permission blocker | Resolved by standalone execution under `--allow-all`; blocked transcript retained. |
| H-04 | `status.stoppedThreadIds` remains empty at real CodeLLDB stops | Nonblocking product follow-up | Queue for controller/status investigation; events/threads/stack prove current supported workflow. |
| H-05 | Unsupported-platform setup wraps adapter error | Nonblocking diagnostics ergonomics | Queue for possible envelope improvement; nested typed cause is present and verified. |
| H-06 | Long isolated `DAP_CLI_HOME` can exceed controller socket path limits | Final-verification blocker, now fixed | Escalated when `npm run check` reproduced `listen EINVAL`; fixed with a deterministic short Unix-socket fallback and IPC regression coverage. |
| H-07 | CodeLLDB REPL-style Rust identifier evaluation can fail | Nonblocking adapter ergonomics | Keep variables inspection as reliable documented proof; queue evaluation guidance/improvement. |
| H-08 | Stop may not be visible immediately after `continue` | Expected asynchronous workflow | No product gap; documented status polling is required. |
| H-09 | Agent detours in variable refs, named-config inspection, and attach reference lookup | Recovered scenario detours | Retain as audit evidence; no safety/product acceptance impact. |
| H-10 | `itoa` requested line `106` resolves to executable line `107` | Corrected evidence coordinate | Retained in candidate/results ledgers; no code-scope or behavior gap. |

## Blocked And Replaced Evidence

### H-01 - External Scratch-Root Collision

source_attempts: `EXT-01-minigrep`, `EXT-02-itoa`
severity: blocking for those attempts only
status: resolved by rerun

Two delegated external attempts ran concurrently. The `itoa` attempt copied the approved CodeLLDB cache into the minigrep attempt's root rather than its own and stopped before building/debugging public code. Although minigrep demonstrated the expected behavior, attribution of its isolated adapter state was contaminated; neither original attempt is accepted.

resolution_evidence: Clean delegated sequential reruns were recorded in `22-EXTERNAL-PROJECT-RESULTS.md`, and final standalone accepted reruns are `EXT-01-R2-CLI-minigrep` and `EXT-02-R2-CLI-itoa` in `22-RESULTS.md`.

### H-02 - User-Level Adapter Cache Inaccessible To Standalone Run

source_attempt: `FA-R02-CLI`
severity: blocking for that attempt only
status: resolved by rerun

The standalone Copilot CLI transcript at `/Users/roblou/.copilot/session-state/4d6bef05-c171-4353-9cf3-088bc1334aa8/events.jsonl` shows permission denials when the scenario attempted to inspect or copy `/Users/roblou/.dap-cli/adapters/codelldb`. The product setup command was never reached, so this is a runner/environment block rather than a dap-cli failure.

resolution_evidence: The verified local payload was seeded into the scenario's permitted workspace scratch root before a rerun.

### H-03 - Standalone Shell Permission Prevented Product Execution

source_attempt: `FA-R02-CLI-R1`
severity: blocking for that attempt only
status: resolved by rerun

After local preseed, runner option `--allow-all-tools` still denied the exact required `/usr/bin/env -i ... node dist/index.js setup-adapters --adapter codelldb --yes` command twice with `denied-no-approval-rule-and-could-not-request-from-user`. Again, no product command executed.

resolution_evidence: `FA-R02-CLI-R2` ran under `--allow-all` with the same isolated/preseeded shape and returned `status: "cached"` for CodeLLDB `v1.12.2` with no fallback provisioning or residue.

## Product And Workflow Findings

### H-04 - Empty `stoppedThreadIds` For Real CodeLLDB Stops

source_attempts: `FA-R03-CLI`, `FA-R04-CLI`, `FA-R06-CLI`, `EXT-01-R2-CLI-minigrep`, `EXT-02-R2-CLI-itoa`
severity: nonblocking
status: queued follow-up

At verified CodeLLDB breakpoint stops, `status` reported `stoppedThreadIds: []` even while stopped events or explicit `threads` requests supplied the thread required for stack and variable inspection. This weakens status ergonomics, but did not prevent any supported workflow or meaningful proof.

recommended_follow_up: Investigate whether controller paused-state population should retain the stopped thread from CodeLLDB events or query threads before returning stopped status.

### H-05 - Unsupported-Platform Diagnosis Is Nested

source_attempt: `FA-R05-R07-CLI`
severity: nonblocking
status: queued follow-up

Unsupported `linux_x64` CodeLLDB setup correctly failed before installation, but the top-level code was `provision_setup_failed` while the adapter-specific `provision_arch_unsupported` cause appeared nested beneath it. The typed cause is available; users or agents need one additional inspection step.

recommended_follow_up: Decide whether `setup-adapters --adapter <id>` should surface a sole adapter's typed provisioning failure directly while retaining aggregate setup behavior for multiple adapters.

### H-06 - Controller Socket Path Length Under Long Isolation Roots

source_attempt: `EXT-01-minigrep` preliminary delegated attempt
severity: blocking once reproduced by final automated verification
status: fixed during Plan 22-11 verification

A long scratch `DAP_CLI_HOME=.../dap-home` first produced `controller_unavailable` / `internal_error`; shortening the same attempt state root to `.../d` succeeded. Clean and accepted standalone attempts deliberately used short isolated roots. During Plan 22-11, the full `npm run check` gate independently reproduced the same root cause as five `tests/integration/evaluateAutoFrame.test.ts` failures: `listen EINVAL` at an overlong `<DAP_CLI_HOME>/state/controller.sock` endpoint.

resolution_evidence: `src/controller/ipc.ts` now retains the in-state socket for portable-length paths and resolves overlong Unix endpoints to a deterministic short hashed socket under the operating-system temporary directory. `tests/controller/controllerIpc.test.ts` covers long `DAP_CLI_HOME` connectivity; targeted controller IPC, evaluate-auto-frame, and self-hosting tests passed after the fix.

### H-07 - Rust Identifier Evaluation Through CodeLLDB REPL Context

source_attempt: `EXT-01-R1-minigrep` preliminary delegated attempt
severity: nonblocking
status: queued follow-up

An optional `evaluate --context repl --expression query` request failed with `internal_error` because CodeLLDB interpreted the Rust identifier as an LLDB command. Required locals proof succeeded through `scopes` and `variables`; accepted standalone public proof did not depend on REPL evaluation.

recommended_follow_up: Prefer variables inspection in Rust documentation and consider clearer guidance or adapter-specific evaluation context behavior.

### H-08 - Continue/Inspection Requires Polling

source_attempts: `FA-R04-CLI`, `EXT-02-R2-CLI-itoa`
severity: expected behavior
status: documented; no fix required for Plan 22-10

Named launch attempted stack inspection before the asynchronously reached breakpoint was observable and received `thread_not_paused`. The accepted `itoa` transcript similarly saw running status immediately after `continue` before a later poll exposed the breakpoint stop. Both recovered through the workflow documented in the dap-cli skill: continue, poll status/events, then inspect with fresh references.

## Recovered Agent Detours

| Source Scenario | Detour | Recovery | Safety Effect |
| --- | --- | --- | --- |
| `FA-R03-CLI` | Used incorrect initial `variablesReference` (`1003`) and got no locals. | Reacquired Local scope reference (`1018`) and proved `answer = 42`. | None. |
| `FA-R04-CLI` | Requested `stack` before post-continue stop became visible. | Polled status/events and retried at verified stop. | None. |
| `FA-R06-CLI` | Looked under an incorrect in-repo reference path and consulted command help. | Used supported attach flow and signaled only owned PID `11283`. | None. |
| `EXT-02-R2-CLI-itoa` | Inspected once before breakpoint stop became observable. | Polled to stop, then proved public frame and `i = 128`. | None. |

## Evidence Coordinate Correction

### H-10 - `itoa` Executable Line Correction

source_attempts: `EXT-02-R1-itoa`, `EXT-02-R2-CLI-itoa`
severity: nonblocking
status: corrected and verified

The original preliminary request at public line `104` was not executable. The candidate ledger was corrected to request line `106`, which CodeLLDB verifies and resolves to executable source line `107` in `itoa::Buffer::format`. The accepted standalone transcript reproduces that corrected behavior with inspected local `i = 128`.

## Completion Decision

blocking_gaps_remaining: none
result: pass

The accepted standalone transcript set proves setup readiness, explicit and named Rust launch, rejected surfaces, owned attach lifecycle, documentation discoverability, and two screened public-code behaviors without crossing the authorized execution boundary. Queued findings are real and retained, but none requires product, documentation, or skill rework before Plan 22-10 closes and final Phase 22 verification begins.
