# Phase 22 CodeLLDB Blocking Gate Results

**Recorded:** 2026-05-28; superseded decision and completed live proof recorded 2026-05-31
**Approved candidate:** Rust / CodeLLDB `v1.12.2` (`vadimcn.vscode-lldb`)
**Gate scope:** Evidence only. No product implementation is authorized unless both R-00 and R-01 are `result: pass`.

## R-00 - Official VSIX Provenance, License, Checksum, And Caching Disposition

result: pass
cleanup_verified: true

### Decision

The host payload is authentic according to GitHub release digest metadata. The official CodeLLDB macOS arm64 VSIX retains CodeLLDB, LLDB, and Python runtime material and contains no license, notice, copying, copyright, third-party, or legal file path; the exact `vadimcn/lldb-build` archive identified by CodeLLDB's tagged build workflow also contains no license/notice-like path. Those findings are retained below as an upstream packaging/provenance concern.

On 2026-05-31 Rob explicitly approved continuing with the narrower built-in contract that dap-cli downloads the pinned official GitHub Release artifact directly onto the requesting user's machine, verifies its digest, and maintains a local unpacked cache for that user's execution. dap-cli will not bundle this payload in its npm package, mirror or rehost it, or create an offline distributable containing it. Under that contract, missing notice files in the official upstream payload do not block local official-source provisioning. This is not a conclusion about CodeLLDB's legal compliance or authorization for dap-cli redistribution.

### Official Sources And Digest Verification

- CodeLLDB release: `https://github.com/vadimcn/codelldb/releases/tag/v1.12.2`
- Inspected asset: `codelldb-darwin-arm64.vsix`
- GitHub release digest: `sha256:c836b81c6f2da467b5920a376a7bfc849dc4b4d81b19779dedf1c685cb4aa1a0`
- Local verified digest: `c836b81c6f2da467b5920a376a7bfc849dc4b4d81b19779dedf1c685cb4aa1a0`
- CodeLLDB build workflow at tag `v1.12.2` identifies bundled LLDB release: `vadimcn/lldb-build` tag `codelldb/22.x-72`, asset `lldb--aarch64-apple-darwin.zip`.
- Upstream LLDB archive digest from GitHub release metadata: `sha256:54be4617bf88e15f21eba5e95c0b14c4d51156914df61334cf8e199edf589fe6`
- Local verified upstream digest: `54be4617bf88e15f21eba5e95c0b14c4d51156914df61334cf8e199edf589fe6`

Digest procedure:

```bash
gh release view v1.12.2 --repo vadimcn/codelldb --json tagName,url,assets
gh release download v1.12.2 --repo vadimcn/codelldb --pattern 'codelldb-darwin-arm64.vsix' --dir tmp/phase-22-codelldb-gate/approved-artifact --clobber
shasum -a 256 tmp/phase-22-codelldb-gate/approved-artifact/codelldb-darwin-arm64.vsix
unzip -tq tmp/phase-22-codelldb-gate/approved-artifact/codelldb-darwin-arm64.vsix
gh api 'repos/vadimcn/codelldb/contents/.github/workflows/build.yml?ref=v1.12.2' --jq .content | base64 -d
gh release view 'codelldb/22.x-72' --repo vadimcn/lldb-build --json tagName,url,assets
gh release download 'codelldb/22.x-72' --repo vadimcn/lldb-build --pattern 'lldb--aarch64-apple-darwin.zip' --dir tmp/phase-22-codelldb-gate/approved-artifact/lldb-build-source --clobber
shasum -a 256 tmp/phase-22-codelldb-gate/approved-artifact/lldb-build-source/lldb--aarch64-apple-darwin.zip
unzip -tq tmp/phase-22-codelldb-gate/approved-artifact/lldb-build-source/lldb--aarch64-apple-darwin.zip
```

### Extracted Runtime Inventory

Verified VSIX evidence root: `tmp/phase-22-codelldb-gate/approved-artifact/extracted/extension/`

- `package.json` identifies `vscode-lldb`, publisher `vadimcn`, version `1.12.2`, and license field `MIT`.
- `adapter/codelldb` and `adapter/scripts/codelldb/**` provide the native adapter and adapter Python scripts.
- `lldb/bin/lldb`, `lldb/bin/lldb-argdumper`, and `lldb/bin/lldb-server` are included.
- `lldb/lib/liblldb.dylib`, `lldb/lib/libpython312.dylib`, and a bundled `lldb/lib/python3.12/**` runtime are included.
- `lang_support/rust.py` is included.
- Measured retained roots: `adapter/` approximately 5.6 MB, `lldb/` approximately 137 MB, and `lang_support/` approximately 8 KB after extraction.

### License And Provenance Findings

- Tagged CodeLLDB source `LICENSE` contains the MIT license and copyright notice for Vadim Chugunov, with the condition that the notice and permission statement be included in copies or substantial portions.
- The verified CodeLLDB VSIX returned no path matching `license`, `notice`, `copying`, `copyright`, `third`, or `legal`.
- The verified `lldb-build` archive returned no path matching the same license/notice terms while containing `liblldb.dylib`, `lldb-server`, LLDB Python modules, `libpython312.dylib`, and Python standard-library content.
- The CodeLLDB build workflow proves the provenance link to `vadimcn/lldb-build` release `codelldb/22.x-72`, but does not by itself provide the missing bundled-runtime notice disposition in the downloaded archives.

### Supported Platform Conclusion

- Inspected and accepted platform for official-source local provisioning: `darwin-arm64` on this host, asset `codelldb-darwin-arm64.vsix`, SHA-256 `c836b81c6f2da467b5920a376a7bfc849dc4b4d81b19779dedf1c685cb4aa1a0`.
- Other published assets (`darwin-x64`, `linux-*`, `win32-x64`, and bootstrap) were not downloaded or authorized; they must not be added to the supported provisioner matrix without their own evidence and explicit disposition.

### Caching Disposition

`pass with scope constraint`: The verified `darwin-arm64` payload may be used by a CodeLLDB provisioner only as a direct official-source download and local user cache. Implementation must preserve the full runtime tree, verify the pinned digest before extraction, retain the provenance evidence in this artifact, and must not bundle, rehost, mirror, or advertise offline redistribution of CodeLLDB. Product plans remain blocked until R-01 independently proves the standalone DAP and loopback-only process contract.

### Follow-up Notice Investigation - 2026-05-31

result: recorded-nonblocking-concern

The missing archive notices could not be repaired as a bounded dap-cli *redistribution* adjustment based on official evidence currently available. Static inspection of the verified macOS arm64 VSIX found that the retained non-system native libraries are `extension/lldb/lib/liblldb.dylib` and `extension/lldb/lib/libpython312.dylib`; the adapter binary also contains a compiled Rust dependency closure recorded in CodeLLDB's tagged `Cargo.lock`. CodeLLDB's tagged `LICENSE` supplies its MIT notice, but its VSIX does not contain it or a third-party notice manifest.

The official CodeLLDB build workflow downloads LLDB release `vadimcn/lldb-build` tag `codelldb/22.x-72`. That tagged build repository pins a `vadimcn/llvm-project` submodule at `d47122c3f495f85e1ab195540eb72598dfcaa73f` and constructs its Python runtime from `python-build-standalone` CPython `3.12.7+20241016` inputs. It copies selected Python standard-library and native runtime output into the released LLDB archive, but the verified archive contains no bundled notices. LLVM and CPython have authoritative upstream license texts, but assembling only those plus CodeLLDB's MIT file would not account for the adapter's compiled Rust dependency closure or certify the complete repackaged tree.

Static evidence commands (the adapter was not executed):

```bash
find tmp/phase-22-codelldb-gate/approved-artifact/extracted/extension -type f \( -iname '*license*' -o -iname '*notice*' -o -iname '*copying*' -o -iname '*copyright*' -o -iname '*third*' -o -iname '*legal*' \) -print | sort
otool -L tmp/phase-22-codelldb-gate/approved-artifact/extracted/extension/adapter/codelldb tmp/phase-22-codelldb-gate/approved-artifact/extracted/extension/lldb/lib/liblldb.dylib tmp/phase-22-codelldb-gate/approved-artifact/extracted/extension/lldb/lib/libpython312.dylib
gh api 'repos/vadimcn/codelldb/contents/LICENSE?ref=v1.12.2' --jq .content | base64 -d
gh api 'repos/vadimcn/codelldb/contents/Cargo.lock?ref=v1.12.2' --jq .content | base64 -d
gh release view 'codelldb/22.x-72' --repo vadimcn/lldb-build --json tagName,targetCommitish,url,publishedAt,assets
gh api 'repos/vadimcn/lldb-build/contents/llvm-project?ref=codelldb/22.x-72' --jq '{name,path,sha,submodule_git_url,type}'
gh api 'repos/vadimcn/lldb-build/contents/.github/workflows/build.yml?ref=codelldb/22.x-72' --jq .content | base64 -d
gh api 'repos/vadimcn/lldb-build/contents/lldb_build/python.py?ref=codelldb/22.x-72' --jq .content | base64 -d
```

Disposition: this remains a useful follow-up for any future bundling, mirroring, offline distribution, or broader platform expansion, but is nonblocking for the explicitly approved direct official-source local-cache contract above.

### Evidence Paths And Cleanup

- Retained evidence is confined to ignored scratch at `tmp/phase-22-codelldb-gate/approved-artifact/`.
- No public Rust repository was cloned, built, or run.
- After Rob approved direct official-source local caching on 2026-05-31, the verified native CodeLLDB process was run only against the phase-owned Rust target for R-01 below.
- No product, test, documentation, skill, or Phase 20 selection file was modified by this gate task.

## R-01 - Standalone Released-Artifact DAP And Live Loopback Proof

result: pass
cleanup_verified: true

### Decision

The R-00-approved `darwin-arm64` artifact runs as a standalone DAP TCP server with the full extracted VSIX tree and its bundled `liblldb.dylib`. Live socket inspection proved that `--port 47117` binds only to `127.0.0.1`. Against a phase-owned compiled Rust executable, direct DAP verified a source breakpoint at `src/main.rs:10`, stopped state, stack trace, local variable inspection (`answer = 42`), evaluate (`answer` -> `42`), continue, disconnect, and process cleanup.

### Released Adapter Invocation And Listener Evidence

Approved extracted entrypoint invocation:

```bash
tmp/phase-22-codelldb-gate/approved-artifact/extracted/extension/adapter/codelldb \
	--liblldb tmp/phase-22-codelldb-gate/approved-artifact/extracted/extension/lldb/lib/liblldb.dylib \
	--port 47117
```

Live socket check before the DAP client connected:

```text
COMMAND    PID   USER   FD   TYPE  DEVICE SIZE/OFF NODE NAME
codelldb 33400 roblou    9u  IPv4   ...       0t0  TCP 127.0.0.1:47117 (LISTEN)
```

This is the descriptor process contract: the provisioned full-tree adapter entrypoint is launched with its runtime-relative bundled `liblldb` path and a dap-cli-allocated port, and dap-cli connects on host `127.0.0.1` only.

### Owned Rust Target And Direct DAP Transcript

Owned scratch target: `tmp/phase-22-codelldb-gate/owned-rust/target/debug/codelldb-owned-proof`, built by:

```bash
cargo build --manifest-path tmp/phase-22-codelldb-gate/owned-rust/Cargo.toml
node tmp/phase-22-codelldb-gate/probe.mjs 47117
```

Successful direct-DAP output:

```text
connected: {"host":"127.0.0.1","port":47117}
initialize: {"success":true,"supportsConfigurationDoneRequest":true}
initialized: {"received":true}
breakpoints: {"breakpoints":[{"id":1,"line":10,"message":"Resolved locations: 0","verified":true}]}
stopped: {"allThreadsStopped":true,"hitBreakpointIds":[1],"reason":"breakpoint","threadId":5597709}
stack: [{"name":"codelldb_owned_proof::main","line":10,"source":"/Users/roblou/code/dap-cli/tmp/phase-22-codelldb-gate/owned-rust/src/main.rs"},{"name":"core::ops::function::FnOnce::call_once","line":250,"source":"/Users/roblou/.rustup/toolchains/stable-aarch64-apple-darwin/lib/rustlib/src/rust/library/core/src/ops/function.rs"}]
scopes: [{"name":"Local","variablesReference":1017},{"name":"Static","variablesReference":1018},{"name":"Global","variablesReference":1019},{"name":"Registers","variablesReference":1020}]
variables: [{"name":"answer","value":"42"}]
evaluate: {"result":"42","type":"int","variablesReference":0}
continued: {"allThreadsContinued":true,"threadId":0}
launch: {"success":true,"program":"/Users/roblou/code/dap-cli/tmp/phase-22-codelldb-gate/owned-rust/target/debug/codelldb-owned-proof"}
disconnect: {"success":true}
```

### Probe Retry Disposition

The initial owned target was too short-lived for CodeLLDB's launch/attach handshake and produced `attach failed (attached to process, but could not pause execution; attach failed)`. The same VSIX-bundled LLDB launched and stopped that target successfully, isolating the issue to timing rather than runtime installation or host permission. The owned target was then made deterministic by sleeping for two seconds before the breakpoint; the direct CodeLLDB rerun passed as recorded above. Later integration fixtures must retain a comparable readiness window rather than relying on a process that can exit before debugger attachment completes.

### Cleanup Evidence

After the passing disconnect, the CodeLLDB async terminal completed with exit code `0`; subsequent `pgrep` and `lsof -nP -iTCP:47117 -sTCP:LISTEN` checks returned no adapter, owned debuggee, or listening socket.

### Stop Disposition

R-00 and R-01 both pass for the scoped `darwin-arm64` direct official-source local-cache contract. Plans 22-02 through 22-11 are authorized to proceed against that one-platform evidence and must not substitute an adapter, weaken loopback binding, expand to uninspected CodeLLDB assets, or claim bundling/mirroring/offline redistribution support.
