---
phase: 22-onboard-rust-debugging-through-codelldb-as-a-built-in-adapte
plan: 03
subsystem: adapter-registry
tags: [rust, codelldb, dap, loopback, lazy-built-in]
requires:
  - phase: 22-01
    provides: Live CodeLLDB `--liblldb` and loopback-only `--port` standalone invocation proof.
  - phase: 22-02
    provides: Verified local CodeLLDB runtime entrypoint and full-tree lazy provisioning.
provides:
  - Loopback-only Rust CodeLLDB built-in descriptor copied from the live R-01 process contract.
  - Lazy `codelldb` registry entry that is discoverable without initiating provisioning.
affects: [22-04, 22-06, 22-07, codelldb]
tech-stack:
  added: []
  patterns: [Proof-derived native descriptor, lazy enumeration without downloads]
key-files:
  created: [src/adapters/builtins/codelldb.ts, tests/adapters/codelldb.test.ts]
  modified: [src/adapters/registry.ts, tests/adapters/registry.test.ts]
key-decisions:
  - "Resolve default CodeLLDB only through the approved local provisioner; do not search PATH or silently substitute `lldb-dap`."
  - "Derive `liblldb.dylib` from the same provisioned VSIX tree and bind connections only to `127.0.0.1`."
patterns-established:
  - "Native descriptor arguments are transcribed from live gate evidence and registry listing retains lazy factory behavior."
requirements-completed: []
duration: 3 min
completed: 2026-05-31
---

# Phase 22 Plan 03: CodeLLDB Built-In Descriptor Summary

**Rust CodeLLDB is discoverable as a lazy built-in and starts only through the live-proved bundled-LLDB loopback server invocation.**

## Performance

- **Duration:** approximately 3 min
- **Completed:** 2026-05-31T23:52:25Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments

- Added `createCodeLldbDescriptor` using `codelldb --liblldb <installed sibling> --port ${port}` and `host: '127.0.0.1'` exactly as proved in R-01.
- Added `codelldb` to default built-ins with a Rust-only label while retaining zero-download `listAll()` behavior.
- Covered explicit descriptor construction, lazy provisioning consent fallback, and built-in discovery with focused tests.

## Task Commits

1. **Tasks 1-2 RED tests: Descriptor and lazy discovery contract** - `c23b7ab` (test)
2. **Tasks 1-2 GREEN: Descriptor and registry implementation** - `3f271f8` (feat)

## Decisions Made

- Did not prefer arbitrary locally installed debugger binaries: this phase promises the approved verified CodeLLDB tree, not generic LLDB availability.
- Preserved the existing server adapter lifecycle and port substitution instead of adding CodeLLDB-specific process management.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- VS Code temporarily retained the prior RED registry assertion diagnostic after GREEN tests passed; refreshing diagnostics reported no errors.

## User Setup Required

None - adapter provisioning remains lazy and consent-gated at actual resolution.

## Verification

- `tests/adapters/codelldb.test.ts`, `tests/adapters/registry.test.ts`, and `tests/adapters/provision/codelldb.test.ts`: 16 passed.
- VS Code TypeScript diagnostics for changed descriptor/registry/test files: no errors after refresh.

## Next Phase Readiness

- Ready for Plan 22-04 to expose setup/prewarm reporting and checksum maintenance for the new built-in.

---
*Phase: 22-onboard-rust-debugging-through-codelldb-as-a-built-in-adapte*
*Completed: 2026-05-31*