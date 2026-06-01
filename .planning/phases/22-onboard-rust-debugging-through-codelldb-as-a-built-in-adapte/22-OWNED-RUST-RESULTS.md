# Phase 22 Owned Rust Results

**Recorded:** 2026-06-01
**Adapter:** verified official CodeLLDB `v1.12.2` darwin-arm64 local cache
**Scope:** repository-owned dependency-free Rust fixtures only; no public Cargo project or security-policy change was executed.

## Runtime Preparation

result: pass
cleanup_verified: true

- The product prewarm path installed the R-00-approved official VSIX directly to the local user cache:

```bash
npm run setup-adapters -- --adapter codelldb --yes
```

- Both owned fixtures contain only a local package declaration and empty `[dependencies]`; Cargo-generated lockfiles list only the fixture package itself.
- Each integration run stages the cached adapter into an isolated temporary `DAP_CLI_HOME` and deletes that temporary home on completion.

## R-03 - Owned Explicit Rust Binary Launch

result: pass
cleanup_verified: true

- Fixture: `tests/fixtures/simple-rust-app`, compiled explicitly with Cargo debug defaults into the isolated test temp directory.
- Native launch shape: `type: 'lldb'`, explicit compiled `program`, fixture `cwd`, and `sourceLanguages: ['rust']`; no `cargo` configuration is passed to DAP.
- Asserted behavior: real source breakpoint at `src/main.rs:9`, stack frame sourced from `main.rs`, local variable `answer`, evaluation result containing `42`, continue, disconnect, and adapter teardown.

## R-04 - Named `type: "lldb"` Configuration

result: pass
cleanup_verified: true

- The integration test writes a temporary `.vscode/launch.json` containing an explicit compiled Rust `program`, resolves `type: 'lldb'` to `codelldb`, retains native Rust fields, and executes the same real breakpoint/inspection lifecycle as R-03.
- Asserted behavior: source stop, local `answer`, evaluation result `42`, resume, disconnect, and teardown all pass through the verified CodeLLDB runtime.

## R-05 - Raw Cargo Boundary

result: pass
cleanup_verified: true

- `tests/cli/codelldbConfigRouting.test.ts` routes both a `cargo`-only named configuration and a `cargo` plus explicit `program` named configuration through `dap-cli launch --config`.
- Both return typed usage error `codelldb_cargo_config_unsupported` with explicit-built-binary recovery before provisioning or controller start; no Cargo execution or native forwarding occurs.

## R-06 - Owned Local PID Attach Lifecycle

result: pass
cleanup_verified: true

- Fixture: `tests/fixtures/simple-rust-attach`, an owned long-running dependency-free Rust binary.
- Attach shape: CodeLLDB native `pid` for that fixture process only; no permissions, signing, or host security policy were changed.
- Initial attempt evidence retained: attach was accepted, but the source breakpoint was initially reported pending while the already-running process was paused; the initial strict immediate-verification assertion failed at `breakpoints[0].verified`.
- Adjusted proof criterion: attach may initially report the breakpoint pending only if it subsequently stops in the owned source frame and exposes the expected state. The rerun stopped at `src/main.rs:10`, inspected `answer` with evaluation result containing `15`, disconnected with `terminateDebuggee: false`, confirmed the target remained alive, then explicitly terminated and awaited only that owned PID.

Successful execution output:

```text
RUN  v3.2.4 /Users/roblou/code/dap-cli

✓ tests/integration/codelldbAdapter.test.ts (3 tests) 14362ms
  ✓ CodeLLDB adapter integration > launches an owned Rust executable and inspects breakpoint state  7182ms
  ✓ CodeLLDB adapter integration > launches the owned Rust executable resolved from a named lldb configuration  4855ms
  ✓ CodeLLDB adapter integration > attaches only to an owned Rust PID without terminating it on disconnect  2324ms

Test Files  1 passed (1)
Tests       3 passed (3)
```

Cleanup-verification rerun:

```bash
DAP_CLI_RUN_CODELLDB_ATTACH_SMOKE=1 npx vitest run tests/integration/codelldbAdapter.test.ts && pgrep -fl 'simple-rust-(app|attach)|extension/adapter/codelldb' || true
```

The rerun passed all three tests; `pgrep` printed no remaining owned Rust target or CodeLLDB process.

## R-07 - Negative Diagnostics Ownership

result: pass
cleanup_verified: true

- Negative provisioning/tree/platform diagnostics are covered by Plans 22-02 and 22-05.
- Cargo/no-`.rs` configuration diagnostics are covered by Plan 22-06.
- This runtime evidence adds no new failure code or unsafe fallback path.