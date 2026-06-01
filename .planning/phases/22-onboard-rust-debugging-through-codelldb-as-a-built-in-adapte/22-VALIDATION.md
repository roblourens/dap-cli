---
phase: 22
slug: onboard-rust-debugging-through-codelldb-as-a-built-in-adapte
status: draft
nyquist_compliant: true
wave_0_complete: false
created: 2026-05-28
---

# Phase 22 - Validation Strategy

> Per-phase validation contract for Rust / CodeLLDB onboarding, including blocking evidence before product implementation.

## Test Infrastructure

| Property | Value |
| --- | --- |
| **Framework** | Vitest `^3.2.4` plus bounded terminal evidence for native adapter and smoke gates |
| **Config file** | `vitest.config.ts` |
| **Quick run command** | `npx vitest run tests/adapters/provision/codelldb.test.ts tests/adapters/provision/concurrent.test.ts tests/adapters/codelldb.test.ts tests/adapters/registry.test.ts tests/config/launchConfig.test.ts tests/config/programInference.test.ts tests/cli/codelldbConfigRouting.test.ts tests/integration/codelldbAdapter.test.ts` (as files are added) |
| **Full suite command** | `npm run check` |
| **Estimated runtime** | Focused suite to be measured after real CodeLLDB integration is implemented; full gate uses actual command completion rather than an assumed bound. |

## Sampling Rate

- **After every product task commit:** Run focused tests for the touched descriptor/provision/config/docs/integration surface.
- **After every implementation plan wave:** Run all CodeLLDB-focused tests plus affected existing setup/config/packaging tests.
- **Before `/gsd-verify-work`:** `npm run check` and all required external/fresh-agent audit artifacts must be complete.
- **At `/gsd-verify-work`:** Because the phase changes provisioning/setup-adapters surfaces, the orchestrator personally runs `dev/smoke/hand-driven-smoke.md` Sequences A and B plus Sequence C steps C1-C6 and records verbatim passing output in `22-UAT.md`; tests and subagents are not substitutes.

## Eleven-Plan Execution Graph

| Wave | Plans | Preconditions | Validation Focus |
| ---: | --- | --- | --- |
| 1 | 22-01 | none | R-00 VSIX provenance/caching disposition and R-01 released-adapter DAP/listener evidence only; no product edits. |
| 2 | 22-02, 22-06 | 22-01 pass | Test-first full-tree provisioning with cold/warm concurrency proof; explicit `lldb` config and all-`cargo`/no-`.rs` boundary. |
| 3 | 22-03, 22-04, 22-05 | 22-01 and 22-02 pass | Gated descriptor/registry, setup/checksum workflow, diagnostics/architecture/packaging safety gates. |
| 4 | 22-07 | 22-01, 22-03 and 22-06 complete | Owned real Rust launch/named-config inspection plus owned attach pass-or-policy-blocker evidence. |
| 5 | 22-08 | 22-01, 22-02, 22-03, 22-06 and 22-07 complete | Evidence-backed docs and Rust fresh-agent reference. |
| 6 | 22-09 | 22-01, 22-07 and 22-08 complete | Screen public Cargo surfaces before isolated subagent debug attempts. |
| 7 | 22-10 | 22-01, 22-08 and 22-09 complete | Fresh-agent JSONL transcript audits, gap classification and audited reruns. |
| 8 | 22-11 | 22-01 through 22-10 complete | Full automated checks and mandatory orchestrator terminal smoke UAT for A, B, and provisioning-applicable C1-C6. |

## Per-Task Verification Map

| Task ID | Plan | Wave | Obligation | Threat Ref | Secure Behavior | Test Type | Automated Command / Evidence | File State Before Execution | Status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 22-01-01 | 01 | 1 | R-00 asset provenance gate | T-22-01-01, T-22-01-SC | No provisioner/checksum/setup support before acceptable full-payload disposition | evidence blocker | `V-22-01-01` below | create evidence artifact | pending |
| 22-01-02 | 01 | 1 | R-01 DAP/listener gate | T-22-01-02, T-22-01-03 | No descriptor/registry support unless the released adapter is loopback-only and cleans up | evidence blocker | `V-22-01-02` below | create evidence and owned scratch | pending |
| 22-02-01 | 02 | 2 | R-02 provisioning specification and Phase 21 concurrency carry-forward | T-22-02-02, T-22-02-04 | Tests precede production; cold callers demand one atomic full-tree install and warm callers demand valid no-network cache | TDD RED | `node -e "const fs=require('node:fs'); for (const f of ['tests/adapters/provision/codelldb.test.ts','tests/adapters/provision/concurrent.test.ts']) { if (!fs.existsSync(f)) process.exit(1); }" && ! npx vitest run tests/adapters/provision/codelldb.test.ts tests/adapters/provision/concurrent.test.ts` | create CodeLLDB test; extend existing concurrency test | pending |
| 22-02-02 | 02 | 2 | R-02 approved full-tree provision implementation | T-22-02-01, T-22-02-02, T-22-02-03, T-22-02-04 | Consent/checksum/extraction/lock/atomic install satisfy functional and concurrent CodeLLDB specifications | TDD GREEN | `npx vitest run tests/adapters/provision/codelldb.test.ts tests/adapters/provision/concurrent.test.ts tests/adapters/provision/extract.test.ts tests/adapters/provision/errorSnapshots.test.ts tests/architecture/moduleBoundaries.test.ts` | create/extend provision sources after RED | pending |
| 22-03-01 | 03 | 3 | Built-in loopback descriptor | T-22-03-01, T-22-03-02 | Descriptor transcribes only R-01-proved server invocation and approved cached runtime | unit | `npx vitest run tests/adapters/codelldb.test.ts` | create descriptor test/source | pending |
| 22-03-02 | 03 | 3 | Lazy registry discovery | T-22-03-03 | Listing `codelldb` does not download or spawn native runtime | unit | `npx vitest run tests/adapters/registry.test.ts tests/adapters/codelldb.test.ts` | extend registry test/source | pending |
| 22-04-01 | 04 | 3 | Setup/prewarm/status | T-22-04-01, T-22-04-02 | Setup reports cache only for complete approved CodeLLDB runtime trees | CLI/unit | `npx vitest run tests/cli/setupAdaptersCommand.test.ts tests/adapters/provision/codelldb.test.ts` | extend existing setup test/source | pending |
| 22-04-02 | 04 | 3 | Checksum maintenance workflow | T-22-04-03 | Regeneration prints only R-00-approved assets for review and never edits checksums | typecheck/unit | `npm run typecheck -- --pretty false && npx vitest run tests/cli/setupAdaptersCommand.test.ts` | extend maintainer script | pending |
| 22-05-01 | 05 | 3 | R-07 provisioning diagnostics/security boundaries | T-22-05-01, T-22-05-02 | Typed failures, real digests and in-process extraction are locked for CodeLLDB | unit/static | `npx vitest run tests/adapters/provision/errorSnapshots.test.ts tests/architecture/moduleBoundaries.test.ts tests/adapters/provision/codelldb.test.ts` | extend existing tests | pending |
| 22-05-02 | 05 | 3 | Packaged CodeLLDB cache behavior | T-22-05-02, T-22-05-03 | Packed CLI can use a complete staged cache without network and ships no local evidence | packaging | `DAP_CLI_RUN_PACKAGING=1 npx vitest run --no-file-parallelism tests/packaging/` | extend existing packaging tests | pending |
| 22-06-01 | 06 | 2 | R-04/R-05 `lldb` mapping and raw Cargo boundary | T-22-06-01, T-22-06-03 | Native config retains proved fields for explicit `program` with no `cargo`, and the CLI routing path rejects any extension-owned `cargo` before provisioning/forwarding, including `cargo` plus `program` | unit/CLI | `npx vitest run tests/config/launchConfig.test.ts tests/cli/codelldbConfigRouting.test.ts` (both suites must cover `cargo` only and `cargo` plus `program`; config also covers explicit `program` without `cargo`) | extend config tests/source; create CLI routing test | pending |
| 22-06-02 | 06 | 2 | No raw `.rs` inference | T-22-06-02 | Explicit CodeLLDB selection maps to `lldb`; source-only Rust remains rejected | unit | `npx vitest run tests/config/programInference.test.ts tests/config/launchConfig.test.ts` | extend inference tests/source | pending |
| 22-07-01 | 07 | 4 | R-03/R-04/R-05 owned launch/config evidence | T-22-07-01, T-22-07-03 | Owned compiled Rust target stops, exposes inspectable state and cleans up; Cargo limitation is recorded honestly | real integration/evidence | `npx vitest run tests/integration/codelldbAdapter.test.ts tests/config/launchConfig.test.ts tests/config/programInference.test.ts` | create fixture/integration/evidence | pending |
| 22-07-02 | 07 | 4 | R-06 owned attach disposition | T-22-07-02, T-22-07-03 | Attach uses only owned PID under unchanged policy or records cleanup-verified blocker | gated integration/evidence | `V-22-07-02` below | create conditional fixture/evidence | pending |
| 22-08-01 | 08 | 5 | Verified inventory/setup/limitation docs | T-22-08-01, T-22-08-02 | README inventory includes CodeLLDB and setup documentation states payload trust, explicit binary path, Cargo/no-`.rs` and attach disposition only from evidence | docs test | `npx vitest run tests/integration/docsValidation.test.ts` | extend README/docs/test | pending |
| 22-08-02 | 08 | 5 | Rust fresh-agent skill reference | T-22-08-01, T-22-08-SC | Public agent guidance teaches screening and bounded Rust workflow | docs test | `npx vitest run tests/integration/docsValidation.test.ts` | create reference; extend skill/test | pending |
| 22-09-01 | 09 | 6 | Public Cargo candidate screening | T-22-09-01, T-22-09-02 | Ledger precedes all selected public execution and records executable surfaces/isolation | evidence check | `node -e "const s=require('node:fs').readFileSync('.planning/phases/22-onboard-rust-debugging-through-codelldb-as-a-built-in-adapte/22-EXTERNAL-PROJECT-CANDIDATES.md','utf8');for(const t of ['Cargo.toml','Cargo.lock','build.rs','proc-macro','.cargo','launch.json','devcontainer','commit_sha','isolation'])if(!s.includes(t))process.exit(1);"` | create candidate ledger/scratch | pending |
| 22-09-02 | 09 | 6 | Delegated external attempts | T-22-09-01, T-22-09-02, T-22-09-03, T-22-09-04 | Only screened SHA-pinned attempts are delegated under isolation with cleanup evidence | evidence check | `V-22-09-02` below | create result ledger | pending |
| 22-10-01 | 10 | 7 | Fresh-agent first runs | T-22-10-01, T-22-10-SC | Prompts constrain cache/home/Cargo/cleanup and preserve initial outcomes | evidence check | `V-22-10-01` below | update scenarios; create results | pending |
| 22-10-02 | 10 | 7 | JSONL audit and reruns | T-22-10-01, T-22-10-02, T-22-10-03 | No accepted pass without transcript/actual command/cleanup audit; blocking fixes require same-prompt rerun | evidence check | `V-22-10-02` below | create hardening ledger | pending |
| 22-11-01 | 11 | 8 | Full automated and verify-work inputs | T-22-11-01, T-22-11-03 | No UAT begins with failed automation or unexamined hardening blocker | automated/evidence | `npx vitest run tests/adapters/codelldb.test.ts tests/adapters/provision/codelldb.test.ts tests/adapters/provision/concurrent.test.ts tests/adapters/registry.test.ts tests/cli/setupAdaptersCommand.test.ts tests/cli/codelldbConfigRouting.test.ts tests/config/launchConfig.test.ts tests/config/programInference.test.ts tests/integration/codelldbAdapter.test.ts tests/integration/docsValidation.test.ts tests/adapters/provision/errorSnapshots.test.ts tests/architecture/moduleBoundaries.test.ts && DAP_CLI_RUN_PACKAGING=1 npx vitest run --no-file-parallelism tests/packaging/ && npm run check` | create UAT artifact | pending |
| 22-11-02 | 11 | 8 | Mandatory hand-driven CLI smoke | T-22-11-01, T-22-11-02 | Orchestrator personally captures verbatim Sequence A/B and provisioning-applicable Sequence C steps C1-C6 pass output before completion | terminal checkpoint/evidence | `V-22-11-02` below, after live terminal execution | append UAT transcript | pending |

### Referenced Verification Commands

`V-22-01-01`

~~~bash
node -e "const fs=require('node:fs');const s=fs.readFileSync('.planning/phases/22-onboard-rust-debugging-through-codelldb-as-a-built-in-adapte/22-GATE-RESULTS.md','utf8');if(!/## R-00/.test(s)||!/^result:\s*(pass|fail|blocked)\s*$/mi.test(s)||!/SHA-256|sha256/i.test(s)||!/license|notice/i.test(s)||!/cache|caching/i.test(s)||!/extension\/adapter\/codelldb/.test(s))process.exit(1);"
~~~

`V-22-01-02`

~~~bash
node -e "const fs=require('node:fs');const s=fs.readFileSync('.planning/phases/22-onboard-rust-debugging-through-codelldb-as-a-built-in-adapte/22-GATE-RESULTS.md','utf8');const r=s.match(/## R-01[\s\S]*?(?=\n## |$)/);if(!r||!/^result:\s*(pass|fail|blocked)\s*$/mi.test(r[0])||!/loopback|127\.0\.0\.1|::1/i.test(r[0])||!/breakpoint/i.test(r[0])||!/stack/i.test(r[0])||!/cleanup_verified/i.test(r[0]))process.exit(1);"
~~~

`V-22-07-02`

~~~bash
npx vitest run tests/integration/codelldbAdapter.test.ts && node -e "const s=require('node:fs').readFileSync('.planning/phases/22-onboard-rust-debugging-through-codelldb-as-a-built-in-adapte/22-OWNED-RUST-RESULTS.md','utf8');if(!/R-06/.test(s)||!/result:\s*(pass|blocked)/i.test(s)||!/cleanup_verified:\s*true/i.test(s))process.exit(1)"
~~~

`V-22-09-02`

~~~bash
node -e "const fs=require('node:fs');const s=fs.readFileSync('.planning/phases/22-onboard-rust-debugging-through-codelldb-as-a-built-in-adapte/22-EXTERNAL-PROJECT-RESULTS.md','utf8');const attempts=(s.match(/^attempt_id:/gmi)||[]).length;const blockers=(s.match(/^blocker:/gmi)||[]).length;if(attempts+blockers<2||!/(subagent_id:|fresh subagent)/i.test(s)||!/commit_sha:/i.test(s)||!/cleanup_verified:/i.test(s))process.exit(1);"
~~~

`V-22-10-01`

~~~bash
node -e "const fs=require('node:fs');const s=fs.readFileSync('.planning/phases/22-onboard-rust-debugging-through-codelldb-as-a-built-in-adapte/22-SCENARIOS.md','utf8');const r=fs.readFileSync('.planning/phases/22-onboard-rust-debugging-through-codelldb-as-a-built-in-adapte/22-RESULTS.md','utf8');for(const t of ['DAP_CLI_HOME','DAP_CLI_ADAPTERS_DIR','cleanup_verified','cargo','.rs','subagent'])if(!s.includes(t))process.exit(1);if(!/scenario_id:/i.test(r)||!/subagent_id:/i.test(r)||!/cleanup_verified:/i.test(r))process.exit(1);"
~~~

`V-22-10-02`

~~~bash
node -e "const fs=require('node:fs');const r=fs.readFileSync('.planning/phases/22-onboard-rust-debugging-through-codelldb-as-a-built-in-adapte/22-RESULTS.md','utf8');const g=fs.readFileSync('.planning/phases/22-onboard-rust-debugging-through-codelldb-as-a-built-in-adapte/22-HARDENING-GAPS.md','utf8');const passes=r.split(/^scenario_id:/mi).slice(1).filter(x=>/^result:\s*pass\s*$/mi.test(x));if(passes.some(x=>!/^transcript_file:\s*\S+/mi.test(x)||!/^transcript_audit:\s*\S+/mi.test(x)||!/^actual_commands:\s*\S+/mi.test(x)||!/^cleanup_verified:\s*true\s*$/mi.test(x)))process.exit(1);if(!/docs\/skill gap|product bug|environment\/toolchain issue|scenario issue|unsafe\/block|queued follow-up/i.test(g))process.exit(1);"
~~~

`V-22-11-02`

~~~bash
node -e "const s=require('node:fs').readFileSync('.planning/phases/22-onboard-rust-debugging-through-codelldb-as-a-built-in-adapte/22-UAT.md','utf8');const smoke=(s.match(/## Hand-Driven CLI Smoke[\s\S]*/)||[''])[0];const block=(id,next)=>{const m=smoke.match(new RegExp('- id:\\s*'+id+'\\b[\\s\\S]*?(?=\\n\\s*- id:\\s*'+next+'\\b|$)','i'));return m?m[0]:'';};const a=block('A','B');const b=block('B','C');const c=block('C','Z');if(!/result:\s*pass/i.test(a)||!/captured_output:\s*\|/i.test(a)||!/result:\s*pass/i.test(b)||!/captured_output:\s*\|/i.test(b))process.exit(1);for(const step of ['C1','C2','C3','C4','C5','C6']){const m=c.match(new RegExp('- step:\\s*'+step+'\\b[\\s\\S]*?(?=\\n\\s*- step:\\s*C[1-6]\\b|$)','i'));if(!m||!/result:\s*pass/i.test(m[0])||!/captured_output:\s*\|/i.test(m[0]))process.exit(1);}"
~~~

## Wave 0 Requirements

- [ ] `22-GATE-RESULTS.md` records R-00 and R-01 evidence before source implementation starts; both must be `result: pass` before Plans 22-02 through 22-11 proceed.
- [ ] A minimal phase-owned Rust spike target exists for released-artifact DAP and socket observation without executing public project code.
- [ ] Plans explicitly block descriptor/provisioner implementation on R-00/R-01 pass rather than scheduling those edits in parallel.
- [ ] Plan 22-02 creates failing `codelldb` provisioning tests and adds CodeLLDB cold/warm cases to `tests/adapters/provision/concurrent.test.ts` before implementing the provisioner.
- [ ] Later product tasks create missing descriptor/config/integration/docs tests before claiming their behavior complete.

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
| --- | --- | --- | --- |
| Bundled asset provenance/license/caching conclusion | R-00 | Legal/provenance judgment and release payload inventory cannot be inferred from a unit test. | Inspect approved official platform VSIX assets and upstream bundled-runtime notices/provenance; record checksums, paths and conclusion before provisioner code. |
| Released adapter direct DAP plus loopback socket | R-01 | The security property is the actual native executable's live bind and launch behavior. | Run only the approved extracted artifact in phase-owned scratch against an owned Rust binary; capture its socket binding and DAP inspection/cleanup output. |
| Public crate safety and scenario execution | External validation | Public Cargo code is untrusted and its execution decision requires screening. | Record candidate ledger first, run only selected bounded flows through subagents with isolated homes/cache, then audit JSONL transcripts. |
| Final hand-driven smoke | UAT | Repository instructions require the orchestrator's live published-CLI output, and provisioning edits make Sequence C applicable. | Follow `dev/smoke/hand-driven-smoke.md` Sequences A and B plus Sequence C steps C1-C6 in a real terminal; paste verbatim passing output into `22-UAT.md` and do not mark `status: complete` until all pass. |

## Security Threat References

| Threat Ref | Threat | Required Control |
| --- | --- | --- |
| T-22-01 | Substituted or legally unsuitable VSIX/native runtime payload | Official pinned SHA-256 verification and recorded bundled license/provenance/caching approval before provisioning. |
| T-22-02 | CodeLLDB listener exposed outside loopback | Live released-artifact socket evidence; do not implement descriptor on wildcard exposure. |
| T-22-03 | Archive traversal, incomplete runtime or cache race | Existing safe ZIP extraction, lock and atomic full-tree installation patterns with tests. |
| T-22-04 | Attach to unintended process or policy escalation | Owned process only; do not modify host security policy; allow blocker outcome. |
| T-22-05 | Execution of untrusted public Cargo build scripts/proc macros | Pre-execution screening, bounded isolated environment, transcript audit and exact cleanup. |

## Validation Sign-Off

- [x] All planned capability groups have automated checks or explicit manual blocker/evidence tasks.
- [x] Product implementation is ordered after blocking transport/provenance evidence.
- [x] No watch-mode flags are required.
- [x] The final mandatory hand-smoke gate explicitly requires A, B, and provisioning-applicable C1-C6 before UAT completion.
- [x] `nyquist_compliant: true` is set in frontmatter.

**Approval:** ready for plan-checker review; execution remains gated by R-00 and R-01.