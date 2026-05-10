<!-- GSD Configuration — managed by get-shit-done installer -->
# Instructions for GSD

- Use the get-shit-done skill when the user asks for GSD or uses a `gsd-*` command.
- Treat `/gsd-...` or `gsd-...` as command invocations and load the matching file from `.github/skills/gsd-*`.
- When a command says to spawn a subagent, prefer a matching custom agent from `.github/agents`.
- Do not apply GSD workflows unless the user explicitly asks for them.
- After completing any `gsd-*` command (or any deliverable it triggers: feature, bug fix, tests, docs, etc.), ALWAYS: (1) offer the user the next step by prompting via `ask_user`; repeat this feedback loop until the user explicitly indicates they are done.
<!-- /GSD Configuration -->

# Repo verification rules (apply to ALL agents in this workspace)

This repo ships a CLI that ultimately gets used by humans typing commands at
their terminal. Test-suite green is necessary but **not sufficient** evidence
that the work is done. Test harnesses wrap the CLI; humans don't.

**Hard rule for every `/gsd-verify-work` round:**

1. The agent itself MUST execute `dev/smoke/hand-driven-smoke.md` Sequence A and
   Sequence B in a real terminal using `run_in_terminal`. Not a subagent —
   the orchestrator agent runs the commands so it sees the live output.
2. The verbatim captured output of every step goes into the phase's
   `<phase>-UAT.md` under a `## Hand-Driven CLI Smoke` heading.
3. The UAT is NOT eligible to be marked `status: complete` until that section
   exists with both sequences recorded `result: pass`. If a step's output
   doesn't match the expected verbatim signal in the doc, it's a gap — file
   it and run normal gap-closure, do NOT explain it away.
4. "Tests pass" is not a substitute for this. "Smoke scripts pass" is not a
   substitute for this. The published `./bin/dap-cli` binary, invoked by hand,
   is the contract.
5. If the user asks "did you drive it by hand?" the only acceptable answers
   are: (a) "yes, here's the captured output in UAT.md" or (b) "no, I'll do
   it now" — never a list of indirect evidence.

This rule overrides any conflicting brevity / efficiency heuristic.
