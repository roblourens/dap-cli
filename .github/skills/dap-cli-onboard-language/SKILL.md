---
name: dap-cli-onboard-language
description: "Use when: fully onboarding an approved built-in language/runtime/debug adapter into dap-cli. Runs research, GSD phase planning, implementation, external repo validation, fresh-agent hardening, JSONL transcript audit, and final verification."
argument-hint: "<approved adapter-selection artifact or language/runtime>"
allowed-tools: Read, Write, Edit, Bash, Glob, Grep, WebFetch, WebSearch, Task, AskUserQuestion, Skill
---

# dap-cli Built-in Language Onboarding

Use this skill after `dap-cli-select-language` has produced explicit approval for a language + debug adapter pair. This skill owns the full automated path after signoff: candidate repo discovery, research, planning, implementation, verification, external-project validation, fresh-agent hardening, and final GSD/UAT closure.

## Non-negotiable gates

1. **Read repo instructions first.** Read `.github/copilot-instructions.md` and `.planning/PROJECT.md` before changing anything. They define the one-dev-branch-per-phase workflow and the final one-squashed-commit-on-main rule.
2. **Require language + adapter approval.** If no approved adapter-selection artifact exists, run `dap-cli-select-language` first or perform the same selection flow and stop for signoff.
3. **Do not weaken GSD.** This skill orchestrates GSD; it does not fork or bypass GSD workflows.
4. **Public repos are untrusted input.** Screen before execution, prefer containers where feasible, and preserve a ledger.
5. **Run real-project verification through subagents.** Assign public-project debug attempts to fresh subagents with bounded scenario prompts; the orchestrator audits and records the truth.
6. **Subagent summaries are not enough.** For every fresh-agent verification run, inspect the corresponding Copilot CLI JSONL transcript under `~/.copilot/session-state/` and use the actual commands/trajectory as the source of truth.
7. **The orchestrator must run final hand smoke.** `/gsd-verify-work` is not complete until the orchestrator personally runs `dev/smoke/hand-driven-smoke.md` Sequence A and Sequence B in a real terminal and records verbatim output in `<NN>-UAT.md` with both results `pass`.

## Required context

Read:

- Approved `ADAPTER-SELECTION.md`.
- `.github/copilot-instructions.md`
- `.planning/PROJECT.md`
- `.planning/ROADMAP.md`
- Phase 20 Go/Delve artifacts:
  - `.planning/phases/20-*/20-ADAPTER-SELECTION.md`
  - `.planning/phases/20-*/20-SCENARIOS.md`
  - `.planning/phases/20-*/20-EXTERNAL-PROJECT-CANDIDATES.md`
  - `.planning/phases/20-*/20-EXTERNAL-PROJECT-RESULTS.md`
  - `.planning/phases/20-*/20-RESULTS.md`
  - `.planning/phases/20-*/20-HARDENING-GAPS.md`
  - `.planning/phases/20-*/20-UAT.md`
- `dap-cli/skills/dap-cli/SKILL.md`
- Relevant existing language reference docs under `dap-cli/skills/dap-cli/references/`.
- Current implementation surfaces:
  - `src/adapters/builtins/`
  - `src/adapters/registry.ts`
  - `src/config/launchConfig.ts`
  - `scripts/setup-adapters.ts`
  - `tests/fixtures/`
  - `tests/integration/`
  - `docs/adapter-setup.md`

## GSD and git workflow

1. Identify or add a phase for the approved onboarding work.
2. Before any GSD phase command, verify `git branch --show-current`.
3. If on `main`, create/switch to `phase-<NN>-<short-slug>` before phase work.
4. After language/adapter signoff, keep going autonomously through planning, execution, and verification unless a safety decision, scope change, or explicit user approval gate blocks progress.
5. Use GSD in order:
   - `/gsd-phase add ...` if the phase does not exist.
   - `/gsd-plan-phase <NN> --prd <path-to-LANGUAGE-ONBOARDING-PRD.md>`.
   - `/gsd-execute-phase <NN>`.
   - `/gsd-verify-work <NN>`.
   - Run review/audit/validation commands when the phase risk warrants them.
6. Let GSD executors commit atomically on the phase branch when they own execution.
7. After `/gsd-verify-work` passes, follow the repo instruction: squash-merge the phase branch into `main` as a single feature commit. Do not push unless Rob explicitly asks.

## Required planning artifacts

Create or preserve these in the phase directory, with the phase number prefix when applicable:

| Artifact | Purpose |
| --- | --- |
| `<NN>-ADAPTER-SELECTION.md` | Approved language/adapter decision, runner-up rationale, process/transport/provisioning contract. |
| `<NN>-LANGUAGE-ONBOARDING-PRD.md` | Input to `/gsd-plan-phase --prd`; captures goals, non-goals, implementation surfaces, acceptance criteria, and safety requirements. |
| `<NN>-SCENARIOS.md` | Fixture, launch-config, attach, negative diagnostic, docs-only, external repo, and fresh-agent scenario prompts. |
| `<NN>-EXTERNAL-PROJECT-CANDIDATES.md` | Public repo screening ledger before any external project command runs. |
| `<NN>-EXTERNAL-PROJECT-RESULTS.md` | SHA-pinned real-repo debug attempts with exact commands and evidence. |
| `<NN>-RESULTS.md` | Fresh-agent scenario results and reruns. |
| `<NN>-HARDENING-GAPS.md` | Agent confusion, docs gaps, product bugs, environment issues, scenario issues, queued follow-ups, and rerun status. |
| `<NN>-UAT.md` | GSD verify-work record, including mandatory hand-driven smoke transcripts. |

`<NN>-LANGUAGE-ONBOARDING-PRD.md` must include:

```text
approved_language:
approved_adapter:
built_in_adapter_contract:
provisioning_contract:
launch_config_contract:
implementation_surfaces:
public_repo_safety_requirements:
container_or_sandbox_plan:
fresh_agent_verification_requirements:
acceptance_criteria:
non_goals:
```

## Implementation checklist

The phase plan must account for each surface, or explicitly explain why it is not needed:

- Built-in adapter descriptor under `src/adapters/builtins/`.
- Adapter registration in `src/adapters/registry.ts`.
- Deterministic provisioning/readiness in `scripts/setup-adapters.ts`.
- VS Code `launch.json` type mapping in `src/config/launchConfig.ts`.
- Program extension or config inference in the config layer.
- CLI flag/config mapping only when the language truly needs a stable first-class flag.
- Repo-owned fixtures under `tests/fixtures/`.
- Real adapter integration tests under `tests/integration/`.
- Failure diagnostics that are typed and actionable.
- Docs in `docs/adapter-setup.md`.
- Agent-facing reference docs under `dap-cli/skills/dap-cli/references/<language-adapter>.md`.
- Updates to `dap-cli/skills/dap-cli/SKILL.md` if the general skill should point to the new language reference.

## Public repo candidate workflow

Start this workflow only after Rob has approved the language + adapter. The selection skill should not have done specific candidate repo discovery.

Do this before running public repo commands:

1. Search for maintained, popular repos in the language. Prefer repos with `.vscode/launch.json`, active releases, visible tests/examples, and no required external services.
2. Clone shallowly only under ignored scratch space:

   ```text
   tmp/phase-<NN>-external-<language>/<repo-slug>
   ```

3. Record repo URL, local path, default branch, exact commit SHA, popularity signal, license if relevant, and whether a `launch.json` exists.
4. Inspect README, manifests, Makefiles/task files, package scripts, launch configs, devcontainers, and setup docs before executing anything.
5. Reject or block flows needing credentials, cloud accounts, Docker/databases not explicitly approved, privileged execution, curl-pipe installers, opaque hooks, heavyweight generators, or non-local network traffic.
6. Use an isolated `DAP_CLI_HOME` per attempt.
7. Prefer containerized execution when feasible; otherwise use the host fallback in a phase-owned scratch directory with a clean environment.
8. Convert selected attempts into subagent scenario prompts. The orchestrator should not directly drive public-project debug attempts except to reproduce or diagnose a specific gap after the subagent run.
9. Record exact commands and cleanup evidence in `<NN>-EXTERNAL-PROJECT-RESULTS.md`, based on the subagent report plus the JSONL transcript audit.

Candidate ledger rows must include:

```text
candidate_id:
repo_url:
shallow_clone_path:
commit_sha:
popularity_signal:
launch_json_signal:
screen_notes:
safety_concerns:
status: selected|screened|screened-caution|rejected|blocked
target_scenario_class:
why_it_diversifies_the_set:
```

## Container and sandbox workflow

Research and document whether the language onboarding can run external validation in a container. Prefer a container when it makes the public-project run safer and reproducible.

Minimum container requirements:

- No host home mount.
- No Docker socket mount.
- Non-root user when practical.
- Mount only phase-owned scratch and the target clone.
- Read-only source mount where practical, with explicit writable build/cache directories.
- Network off during debug execution unless the scenario explicitly needs localhost-only traffic.
- Explicit CPU/memory/time limits where available.
- No secrets or inherited credential environment.

If the adapter/debuggee cannot run in a container, document why and use a fallback safety plan: shallow clone, inspected commands only, isolated `DAP_CLI_HOME`, clean env, bounded PATH, no credentialed services, and exact cleanup.

## Fresh-agent scenario loop

After implementation and docs are in place, run fresh-agent scenarios from `<NN>-SCENARIOS.md`. Each scenario should be assigned to a subagent with:

- The exact docs/skills to read first.
- A phase-owned scratch root.
- An isolated `DAP_CLI_HOME`.
- The target fixture or screened public repo path.
- Safety constraints.
- Required breakpoint/stack/scopes/evaluate evidence.
- Cleanup requirements.

Each subagent must report exactly:

```text
result: pass|fail|blocked
what_worked: ...
what_didnt: ...
agent_confusion: ...
dap_cli_ergonomic_issues: ...
evidence: ...
cleanup_verified: true|false
```

### JSONL transcript audit

Do not trust the subagent report as the final truth. For each scenario:

1. Locate the corresponding Copilot CLI JSONL transcript under `~/.copilot/session-state/`.
   - Correlate by scenario id, subagent/task name, cwd, prompt text, and start/end time.
   - If multiple files match, inspect enough metadata to identify the right one.
   - If no transcript can be found, mark the scenario audit `blocked` and do not claim the scenario passed.
2. Extract the actual command trajectory:
   - commands run;
   - command failures;
   - wrong turns or unsafe attempted commands;
   - retries;
   - cleanup commands;
   - final evidence-producing commands.
3. Compare transcript truth against the subagent's report.
4. If the subagent says "everything was fine" but the transcript shows confusion, wrong commands, hidden failures, unsafe attempts, or avoidable detours, record those in `<NN>-HARDENING-GAPS.md`.
5. Classify each finding:
   - docs/skill gap;
   - product bug;
   - environment/toolchain issue;
   - scenario issue;
   - queued follow-up.
6. Fix product/docs/skill gaps in the same phase when they affect the onboarding success bar.
7. Rerun the same scenario prompt where practical and append rerun evidence to `<NN>-RESULTS.md`; never overwrite the original failed/confused result.

`<NN>-RESULTS.md` entries must include:

```text
scenario_id:
subagent_id:
transcript_file:
result: pass|fail|blocked
reported_summary:
transcript_audit:
actual_commands:
wrong_turns:
what_worked:
what_didnt:
agent_confusion:
dap_cli_ergonomic_issues:
evidence:
cleanup_verified: true|false
```

## Verification bar

The phase is not complete until all applicable evidence exists:

- Automated unit/integration tests for setup, descriptor behavior, launch config mapping, inference, diagnostics, and real adapter E2E behavior.
- Real adapter sessions prove breakpoints, stopped state, stack, scopes/variables, evaluate or documented fallback, continue/close, and cleanup.
- External project validation covers multiple screened repos or records explicit safety/environment blockers.
- Fresh-agent scenarios have report contracts, JSONL transcript audits, and reruns for fixed gaps.
- `<NN>-HARDENING-GAPS.md` has no unexamined failures. Queued follow-ups are allowed only when explicitly non-blocking and documented.
- `dap-cli/skills/dap-cli/references/<language-adapter>.md` gives a fresh agent enough guidance to succeed without code archaeology.
- `/gsd-verify-work <NN>` includes the mandatory hand-driven smoke section in `<NN>-UAT.md`, with Sequence A and Sequence B `result: pass`.

When verification exposes a gap, do not explain it away. Create or update gap-closure work, run `/gsd-execute-phase <NN> --gaps-only` if appropriate, rerun the failed verification, and append the new evidence.

## Completion output

At the end, report:

- Approved language + adapter.
- Phase branch and final main commit if created.
- Key shipped files/surfaces.
- Automated test commands run.
- External repo attempts and results.
- Fresh-agent scenarios, transcript audit status, and reruns.
- UAT hand-smoke artifact path and pass status.
- Any explicitly queued follow-up.
