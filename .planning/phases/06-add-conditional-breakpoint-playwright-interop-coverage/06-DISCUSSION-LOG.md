# Phase 06: Add Conditional Breakpoint Playwright Interop Coverage - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-05
**Phase:** 06-add-conditional-breakpoint-playwright-interop-coverage
**Areas discussed:** User-facing breakpoint shape

---

## Gray Areas Offered

| Area | Description | Selected |
|------|-------------|----------|
| User-facing breakpoint shape | Should Phase 6 stay coverage-only using raw DAP JSON, or add ergonomic alias flags like condition/hitCondition/logMessage? | ✓ |
| Interop scenario shape | Should conditional coverage use the simple JS page, the TypeScript/source-map button page, or the real VS Code chat flow? | |
| Conditional semantics to prove | Which behavior matters most: false condition does not pause, true condition pauses, hit-count thresholds, or logpoints? | |
| Verification bar | Should this be automated-only, docs-only plus hand smoke, or both automated same-browser coverage and hand-driven transcript? | |

---

## User-Facing Breakpoint Shape

### Question 1

| Option | Description | Selected |
|--------|-------------|----------|
| Add alias flags | Add `--condition`, `--hit-condition`, and likely `--log-message` to the friendly command; best for agent/human workflows. | ✓ |
| Coverage-only | Use generated/raw `setBreakpoints` JSON in tests/docs; smallest implementation change. | |
| You decide | Planner chooses based on implementation risk after research. | |

**User's choice:** Add alias flags
**Notes:** Phase 6 should be a small user-facing command improvement plus coverage, not only an invisible test path.

### Question 2

| Option | Description | Selected |
|--------|-------------|----------|
| Apply to all lines | One condition/hit/log value is copied to every requested breakpoint; simple and predictable. | ✓ |
| Require one line | Reject condition/hit/log flags unless exactly one `--line` is provided; avoids accidental broad conditions. | |
| You decide | Planner chooses the least surprising shape during implementation. | |

**User's choice:** Apply to all lines
**Notes:** Multi-line breakpoint requests remain valid with shared metadata.

### Question 3

| Option | Description | Selected |
|--------|-------------|----------|
| Condition | `--condition <expr>` pauses only when expression is true. | ✓ |
| Hit condition | `--hit-condition <expr>` pauses on adapter-supported counts such as `>= 3`. | ✓ |
| Log message | `--log-message <text>` creates logpoints instead of stop points. | ✓ |
| Only condition | Keep the phase tightly focused on true/false conditional pauses. | |

**User's choice:** Condition, hit condition, and log message
**Notes:** The alias should expose the common DAP breakpoint metadata trio.

### Question 4

| Option | Description | Selected |
|--------|-------------|----------|
| Send and surface adapter result | Pass fields through and report verified/message from adapter; matches current DAP-first style and avoids capability guesswork. | |
| Pre-check capabilities | Reject early if initialize capabilities do not advertise support; more protective but adds policy. | |
| You decide | Planner chooses based on existing capability patterns. | ✓ |

**User's choice:** You decide
**Notes:** Research/planning should decide capability policy, with a stated bias toward the existing DAP-first pass-through style unless local patterns say otherwise.

---

## the agent's Discretion

- Exact capability-gating behavior for conditional/logpoint fields.
- Exact automated scenario shape for proving Playwright interop.
- Exact verification split between alias payload tests, real js-debug/browser tests, and docs.

## Deferred Ideas

None.