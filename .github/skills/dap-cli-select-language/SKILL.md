---
name: dap-cli-select-language
description: "Use when: choosing the next language/runtime/debug adapter for dap-cli. Produces an adapter-selection packet and stops for explicit language + adapter signoff before candidate repo research, implementation planning, or GSD execution."
argument-hint: "[language/runtime hint, adapter hint, or discovery goal]"
allowed-tools: Read, Write, Bash, Glob, Grep, WebFetch, WebSearch, AskUserQuestion, Task
---

# dap-cli Language and Adapter Selection

Use this skill as the first step when Rob wants dap-cli to support another built-in language/runtime/debug adapter.

This skill is intentionally **selection-only**. It researches candidate languages, candidate debug adapters, and high-level verification/sandbox feasibility, then asks Rob to approve the exact language + adapter pair. Do not find candidate public repos, implement, run `/gsd-plan-phase`, or start full execution from this skill.

## Required context

Read these before deciding:

- `.github/copilot-instructions.md`
- `.planning/PROJECT.md`
- `.planning/ROADMAP.md`
- Phase 20 Go/Delve artifacts, especially:
  - `.planning/phases/20-*/20-ADAPTER-SELECTION.md`
  - `.planning/phases/20-*/20-SCENARIOS.md`
  - `.planning/phases/20-*/20-EXTERNAL-PROJECT-CANDIDATES.md`
  - `.planning/phases/20-*/20-RESULTS.md`
  - `.planning/phases/20-*/20-HARDENING-GAPS.md`
- `dap-cli/skills/dap-cli/SKILL.md`
- Existing language references under `dap-cli/skills/dap-cli/references/`
- Current adapter/config surfaces:
  - `src/adapters/builtins/`
  - `src/adapters/registry.ts`
  - `src/config/launchConfig.ts`
  - `scripts/setup-adapters.ts`
  - `docs/adapter-setup.md`

## Selection criteria

Evaluate every language/debug-adapter candidate against the same rubric:

| Criterion | What to check |
| --- | --- |
| DAP fit | Native DAP support, launch/attach coverage, breakpoint/stack/scopes/evaluate behavior, and compatibility with dap-cli's request model. |
| Process model | Prefer a standalone adapter process or local server that dap-cli can own. Avoid adapters that require a hidden IDE/LSP handshake unless that complexity is accepted explicitly. |
| Transport fit | Prefer stdio or localhost TCP. Reject remote/cloud-only flows for the built-in happy path. |
| Provisioning | Can setup be deterministic, pinned, documented, and reasonably safe on macOS/Linux? Are checksums/signatures available? |
| Maintenance | Active releases, current docs, issue health, and support for current language versions. |
| Ownership/popularity | Official or broadly adopted adapters are preferred. Microsoft-owned is a positive signal, not a reason to pick a bad fit. |
| VS Code ecosystem | Existing `launch.json` usage, stable `type` value, and examples in real projects. |
| Implementation surface | Built-in descriptor, setup, registry, launch-config mapping, inference, fixtures, integration tests, docs, and agent reference work required. |
| Verification feasibility | Can fresh agents plausibly debug repo-owned fixtures and later-screened real projects with credible evidence? |
| Safety | Can public-project validation be done without credentials, privileged execution, cloud accounts, broad network actions, or opaque install scripts? |

## Public repo research boundary

Do **not** search for or screen specific public repositories in this skill. Rob wants to sign off on the language and debug adapter before spending the larger effort on candidate repo discovery.

Only record the kind of repos the later onboarding skill should look for, such as:

- Popular and maintained, not random low-star examples.
- Well configured for debugging, especially repos with `.vscode/launch.json` containing the candidate debug `type`.
- Small enough for repeatable debug scenarios, or with isolated subpackages/examples/tests.
- Suitable for diversified scenario classes: CLI, library tests, small service, attach target, and launch-config flow.

The output should be a feasibility sketch, not a candidate ledger:

```text
likely_repo_shapes:
launch_json_search_terms:
expected_safety_concerns:
expected_scenario_classes:
```

The later `dap-cli-onboard-language` skill owns candidate repo discovery, shallow cloning, screening, and public-project execution after approval.

## Container and sandbox research

Every selection packet must include a safety section answering:

- Can the candidate language/debuggee run inside a container for external-project verification?
- Is there an official language image or devcontainer pattern?
- Can dap-cli and the adapter run inside the same container, or should dap-cli run on the host while the debuggee runs in a container?
- Which commands require network, and can dependency fetch be separated from debug execution?
- What is the fallback if Docker/container execution is unavailable?

Recommended container posture for later execution:

- No host home mount.
- No Docker socket mount.
- Non-root user when practical.
- Phase-owned scratch volume only.
- Read-only source mount where practical, with explicit writable build/cache dirs.
- Network disabled during debug execution unless the scenario explicitly requires localhost-only traffic.
- Explicit CPU/memory/time limits when the runtime supports them.
- No credentials, cloud accounts, privileged flags, curl-pipe installers, or opaque hooks.

Call out that Docker is not a perfect sandbox because the daemon is privileged; it is a useful containment layer, not permission to skip screening.

## Output artifact

Write a selection packet before asking for signoff. If a phase already exists, write it in that phase directory as `<NN>-ADAPTER-SELECTION.md`. If no phase exists yet, write it under:

```text
.planning/language-onboarding/<YYYYMMDD>-<language-or-discovery-slug>/ADAPTER-SELECTION.md
```

Use this structure:

```markdown
# dap-cli Adapter Selection: <Language>/<Adapter>

## Recommendation

| Contract | Value |
| --- | --- |
| Runtime/language | |
| Debug adapter | |
| dap-cli adapter id | |
| VS Code launch config type | |
| Adapter version/pin strategy | |
| Process/transport model | |
| Provisioning strategy | |

## Why this choice

## Candidate comparison

| Candidate | Fit | Risks | Disposition |
| --- | --- | --- | --- |

## Later public repo validation sketch

## Container/sandbox feasibility

## Implementation surface preview

## Verification preview

## Open questions

## Approval

status: pending
approved_language:
approved_adapter:
approved_by:
approved_at:
notes:
```

## Signoff gate

After writing the packet, ask Rob to choose exactly one option with `AskUserQuestion`:

- Approve the recommended language + adapter.
- Pick a named runner-up from the packet.
- Request more research.
- Stop without choosing.

When approved, update the packet's `## Approval` section with `status: approved`, the chosen language, adapter, and timestamp. Then stop and tell Rob the approved pair and the artifact path. Do not proceed to implementation; the next skill is `dap-cli-onboard-language`.

If no candidate is strong enough, say so plainly, write `status: no-recommendation`, explain the blocker, and stop.
