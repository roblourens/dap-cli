# Documentation layout conventions

Where things live in this repo, and why. Future phases that touch documentation should follow this layout instead of re-deriving it.

## Audiences

Four distinct audiences, four distinct locations:

| Audience | Location | Purpose |
|---|---|---|
| Human evaluating whether to install dap-cli | `README.md` (root) | Pitch, install, quick taste, links to deeper material |
| Human using the installed tool | `docs/` | Reference material for users — setup, interop patterns, anything a person reads to learn the tool |
| Agent driving the tool | `skills/dap-cli/SKILL.md` + `skills/dap-cli/references/` | Command surface, polling loop, gotchas, language-specific notes. The repo IS the plugin |
| Contributor / release verification | `dev/` | Hand-driven smoke sequences, dev-only workflows, anything that exists to validate a release rather than teach a user |

A piece of content belongs in **exactly one** of these locations. If you find yourself wanting to put the same thing in two of them, pick the audience that's most likely to need it and link from the other.

## Rules

- **Lowercase filenames in user-facing folders.** `docs/adapter-setup.md`, not `docs/ADAPTER-SETUP.md`. Internal `.planning/` artifacts can keep their existing all-caps convention.
- **The root README is short.** It exists to get a human from "what is this" to "I've installed it" to "I see how it works." Deeper material lives in `docs/` or the SKILL.
- **The SKILL is for agents, not humans.** Examples-first, minimal philosophy. Mirror playwright-cli's structure: quick start → commands grouped by category → worked examples → gotchas → links to language-specific references at the end.
- **`docs/` is not a dumping ground for dev artifacts.** Smoke sequences, release verification scripts, internal validation docs go under `dev/`. If a doc references a phase number, a UAT, or a `/gsd-*` command, it probably belongs in `dev/` or `.planning/`, not `docs/`.
- **One source of truth per fact.** Don't duplicate command syntax between README and SKILL. The README shows a "taste"; the SKILL is the canonical reference for agents. Link, don't copy.

## Plugin distribution

The repo follows the [Open Plugins](https://open-plugins.com/) spec as a **single-plugin repository** — the repo root is the plugin directory. No marketplace file, no nested plugin folder, no per-vendor manifests.

- `.plugin/plugin.json` — vendor-neutral manifest at the repo root
- `skills/dap-cli/SKILL.md` — the skill the agent loads
- `skills/dap-cli/references/` — language- and workflow-specific reference material the SKILL links to on demand

Plugin install from any conformant host points at `roblourens/dap-cli` directly. There is no separate "plugin folder" inside the repo to install from.

## Why this got written

The first pass of this repo accumulated docs in `docs/` of every kind — user-facing, agent-facing, and dev-only verification scripts — with all-caps filenames. Splitting them into four buckets by audience, getting the SKILL out of `~/.copilot/skills/` and into a versioned plugin, and adopting the Open Plugins single-repo layout happened ad-hoc across several conversations rather than as a planned phase. This note exists so future phases inherit the result without re-litigating it.
