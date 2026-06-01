# dap-cli - Rust (CodeLLDB)

Notes specific to the built-in `codelldb` adapter. Read this when debugging Rust. The general polling and inspection loop in [SKILL.md](../SKILL.md) still applies.

## Readiness and scope

CodeLLDB support is Rust-focused and pinned to CodeLLDB `v1.12.2`. The verified provisioned asset is the official `codelldb-darwin-arm64.vsix` payload on `darwin_arm64`. dap-cli downloads that artifact directly from its official GitHub Release after consent, verifies its SHA-256, and caches the full local LLDB/Python runtime tree. It does not bundle, mirror, rehost, or promise offline CodeLLDB payload distribution.

```bash
dap-cli setup-adapters --adapter codelldb --yes
```

This built-in is not a general C/C++ or remote-debugging support claim.

## Build first, launch the executable

Rust source is not itself a launchable native program. For owned or already screened code, build a debug executable as an explicit preparation step, then pass that binary to `lldb` / `codelldb`:

```bash
cargo build
dap-cli start
dap-cli launch --adapter codelldb --type lldb --name rust-debug \
  --json '{"program":"/workspace/target/debug/my-app","cwd":"/workspace","sourceLanguages":["rust"]}'
dap-cli breakpoints set --name rust-debug --source /workspace/src/main.rs --line 12
dap-cli continue --name rust-debug
dap-cli status --name rust-debug
dap-cli stack --name rust-debug
dap-cli scopes --name rust-debug --frame-id 10
dap-cli variables --name rust-debug --variables-reference 100
dap-cli evaluate --name rust-debug --expression 'answer'
dap-cli close rust-debug
dap-cli stop-controller
```

For very short binaries, ensure the executable remains alive long enough for native debugger startup and source breakpoint configuration; the verified owned fixture waits before its breakpoint for this reason.

## Named configuration

A named VS Code configuration is supported when it selects a compiled executable directly and contains no `cargo` object:

```json
{
  "type": "lldb",
  "request": "launch",
  "name": "Rust executable",
  "program": "${workspaceFolder}/target/debug/my-app",
  "cwd": "${workspaceFolder}",
  "sourceLanguages": ["rust"]
}
```

```bash
dap-cli launch --config "Rust executable" --name rust-debug
```

## Boundaries and diagnostics

- Do not launch `main.rs` or any raw `.rs` path as `--program`; dap-cli deliberately does not infer Rust debugging from `.rs`. Build first and use the executable path.
- Do not forward a VS Code CodeLLDB `cargo` property to dap-cli. VS Code resolves `cargo` extension-side before native DAP; dap-cli returns `codelldb_cargo_config_unsupported` even if the configuration also contains `program`.
- `provision_arch_unsupported` for CodeLLDB means only verified `darwin_arm64` local provisioning is enabled. Do not substitute an uninspected release asset.
- `provision_checksum_mismatch` or `provision_extract_failed` means the native runtime cannot be trusted or is incomplete. Re-run setup or report the issue; do not bypass integrity checks.

## Owned local PID attach

Owned local PID attach passed on the verified macOS host without changing security policy. Attach only to a local process you own and intentionally started for debugging, using CodeLLDB's native `pid` field:

```bash
dap-cli attach --adapter codelldb --type lldb --name rust-attach \
  --json '{"pid":12345}'
dap-cli request disconnect --name rust-attach --json '{"terminateDebuggee":false}'
```

After disconnect, explicitly terminate only the owned target you started. Do not attach to unrelated processes, change code-signing/ptrace/security policy, or claim remote attach support.

## Public repositories

Before running `cargo build` for a public repository, screen its pinned revision, `Cargo.toml`, `Cargo.lock`, workspace members, `build.rs`, proc-macro crates, `.cargo/` configuration, task files, launch configuration, and any network or credential expectations. Use an isolated home/cache and preserve exact cleanup/transcript evidence for real-project validation.