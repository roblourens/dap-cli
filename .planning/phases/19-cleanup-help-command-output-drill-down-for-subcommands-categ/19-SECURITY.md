---
phase: 19
slug: cleanup-help-command-output-drill-down-for-subcommands-categ
status: verified
threats_open: 0
asvs_level: 1
created: 2026-05-12
---

# Phase 19 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| user shell → dap-cli argv | `help <path...>` segments are user-controlled but only used for in-process tree lookup and string interpolation into a help/usage envelope. No new code paths reachable by argv. | command-name strings (untrusted) |

---

## Threat Register

| Threat ID | Category | Component | Disposition | Mitigation | Status |
|-----------|----------|-----------|-------------|------------|--------|
| T-19-01 | Information Disclosure | custom `help` command in `src/cli/program.ts` | accept | Help output is intentionally public; no session ids, secrets, or filesystem state are rendered. | closed |
| T-19-02 | Tampering / Injection | unknown-path error message interpolating `segments` into the envelope (`src/cli/program.ts:82`) | mitigate | Interpolation flows only into the `Error.message` of a synthetic `CommanderError(code='commander.unknownCommand', exitCode=2)`, which is rendered through the existing failure writer in `src/cli/outputWriter.ts` (JSON-encoded, no shell/eval/template expansion). Regression covered by `tests/cli/helpCommand.test.ts` "unknown drill-down path emits usage_error envelope" — asserts `JSON.parse` succeeds and `error.code === "usage_error"`. Hand-driven smoke (Test 4 in 19-UAT.md) confirms a single well-formed envelope on stdout with exit 2. | closed |
| T-19-03 | Denial of Service | variadic `help` walker over `Command.commands` | accept | Subcommand tree is statically registered at module init and shallow (max depth 2 today: `breakpoints set`); walker is O(segments × siblings) with no recursion or unbounded I/O. | closed |
| T-19-04 | Information Disclosure | help output category groupings via `helpGroup()` | accept | Only renders public command names and descriptions that were already public; no hidden commands are exposed (`serve-controller` remains hidden — verified by Test 5 in 19-UAT.md and by 19-02 plan verification step). | closed |

*Status: open · closed*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| R-19-01 | T-19-01 | Help output is the documented public surface of the CLI. | Rob | 2026-05-12 |
| R-19-03 | T-19-03 | Static, shallow command tree (depth 2) and synchronous in-process walker; no realistic DoS amplification from a local CLI invocation. | Rob | 2026-05-12 |
| R-19-04 | T-19-04 | Categorization only re-groups already-public commands; the hidden `serve-controller` remains hidden via commander's `.hidden()`. | Rob | 2026-05-12 |

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-05-12 | 4 | 4 | 0 | /gsd-secure-phase 19 (Copilot) |

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-05-12
