# Phase 22 External Rust Project Results

**Recorded:** 2026-06-01
**Authorization checkpoint:** `6f1ff6c` (`22-EXTERNAL-PROJECT-CANDIDATES.md` selected C-01 and C-02 before any public build/debug execution)
**Acceptance state:** Behavioral passes below are retained for Plan 22-10 transcript audit; they are not final accepted evidence until their JSONL records have been audited.

## Isolation And Command Envelope

- Public-project execution was delegated to fresh `gsd-executor` subagents. The orchestrator screened/read sources and built the repository-owned `dist/index.js`, but did not build, launch, or debug either public target.
- Container execution was not viable for this proof because the checksum-verified adapter payload is `codelldb-darwin-arm64`; attempts used the pre-authorized inspected macOS host fallback.
- Clean reruns used exclusive short attempt roots to avoid Unix-domain socket path-length failures and cross-attempt state: `tmp/phase-22-external-rust/attempt-mg-r1` and `tmp/phase-22-external-rust/attempt-it-r1`.
- For each clean rerun, `<env>` means the exact isolated prefix below with `<root>` replaced by that attempt root:

```bash
/usr/bin/env -i HOME=<root>/h CARGO_HOME=<root>/c DAP_CLI_HOME=<root>/d DAP_CLI_ADAPTERS_DIR=<root>/a CARGO_NET_OFFLINE=true RUSTC=/Users/roblou/.rustup/toolchains/stable-aarch64-apple-darwin/bin/rustc PATH=/Users/roblou/.rustup/toolchains/stable-aarch64-apple-darwin/bin:/Users/roblou/.local/state/fnm_multishells/35295_1780269958132/bin:/usr/bin:/bin
```

- Each clean rerun copied only `/Users/roblou/.dap-cli/adapters/codelldb` into `<root>/a/codelldb`, used `/Users/roblou/.rustup/toolchains/stable-aarch64-apple-darwin/bin/cargo`, and drove `/Users/roblou/code/dap-cli/dist/index.js` through the explicit Node executable in `<env>`.
- No selected attempt installed or fetched packages, started services, accessed credentials, attached to a process, or intentionally used non-loopback network activity. Cargo builds were offline; adapter communication was local CodeLLDB/controller traffic only.

## Preliminary Attempts Retained As Non-Accepted Evidence

### EXT-01-minigrep - Successful Behavior In Contaminated Parallel Wave

attempt_id: `EXT-01-minigrep`
subagent_id: `gsd-executor/EXT-01-minigrep`
url: `https://github.com/rust-lang/book`
commit_sha: `05d114287b7d6f6c9253d5242540f00fbd6172ab`
result: fail
cleanup_verified: true
acceptance: `not accepted`; the simultaneously running C-02 agent accidentally copied adapter state into this attempt's root, so isolation attribution is not clean.
transcript_path: `.../debug-logs/d2382087-5292-4d6b-b997-ff66bafdcdfb/runSubagent-gsd-executor-call_Ri0WnkNjBQmpN3OOfsIgifir.jsonl`

Exact selected execution sequence (all build/DAP commands used the reported isolated `/usr/bin/env -i` prefix rooted at `attempt-ext-01-minigrep`; full literal environment and outputs remain in the JSONL transcript):

```bash
git -C /Users/roblou/code/dap-cli/tmp/phase-22-external-rust/rust-book rev-parse HEAD
cp -R /Users/roblou/.dap-cli/adapters/codelldb /Users/roblou/code/dap-cli/tmp/phase-22-external-rust/attempt-ext-01-minigrep/adapters/codelldb
cargo build --locked --offline --bin minigrep
dap-cli start
dap-cli launch --adapter codelldb --type lldb --name external-minigrep --json '{"program":".../listing-12-24/target/debug/minigrep","cwd":".../listing-12-24","args":["duct","poem.txt"],"sourceLanguages":["rust"],"stopOnEntry":true}'
dap-cli breakpoints set --name external-minigrep --source .../listing-12-24/src/lib.rs --line 4
dap-cli continue --name external-minigrep
dap-cli status --name external-minigrep
dap-cli stack --name external-minigrep
dap-cli scopes --name external-minigrep --frame-id 1001
dap-cli variables --name external-minigrep --variables-reference 1019
dap-cli close external-minigrep
dap-cli stop-controller
```

Evidence: it stopped in public `minigrep::search` at `src/lib.rs:4`, with inspected local `query` equal to `"duct"`. A long scratch `DAP_CLI_HOME=.../dap-home` first caused `controller_unavailable` / `internal_error`; shortening it within the same attempt root to `.../d` worked, identifying a socket-path ergonomics gap.

### EXT-02-itoa - Safety Abort Before Public Execution

attempt_id: `EXT-02-itoa`
subagent_id: `gsd-executor/EXT-02-itoa`
url: `https://github.com/dtolnay/itoa`
commit_sha: `af77385d0daf4d0e949e81f2588be2e44f69f086`
result: blocked
blocker: The fresh agent mistakenly seeded the approved adapter cache under the concurrent `attempt-ext-01-minigrep` root rather than its authorized `attempt-ext-02-itoa` root; it stopped before Cargo build, program launch, or dap-cli debug.
cleanup_verified: false
transcript_path: `.../debug-logs/d2382087-5292-4d6b-b997-ff66bafdcdfb/runSubagent-gsd-executor-call_jTZQ4JYiXcmFBkL8bRGo8xzU.jsonl`

Exact relevant commands/actions: read-only `git -C tmp/phase-22-external-rust/itoa rev-parse HEAD` returned the selected SHA; the agent wrote then removed its permitted owned harness, and mistakenly ran `cp -R /Users/roblou/.dap-cli/adapters/codelldb /Users/roblou/code/dap-cli/tmp/phase-22-external-rust/attempt-ext-01-minigrep/adapters/codelldb`. It executed no Cargo or dap-cli command for this candidate. Its own permitted scratch root was removed, but cleanup is false because it could not remove writes made into the other agent's evidence root.

## Clean Delegated Reruns

### EXT-01-R1-minigrep - Public CLI Binary

attempt_id: `EXT-01-R1-minigrep`
subagent_id: `gsd-executor/EXT-01-R1-minigrep`
url: `https://github.com/rust-lang/book`
commit_sha: `05d114287b7d6f6c9253d5242540f00fbd6172ab`
scenario_class: `R-EXT-01 screened CLI crate binary`
result: pass
cleanup_verified: true
transcript_path: `.../debug-logs/d2382087-5292-4d6b-b997-ff66bafdcdfb/runSubagent-gsd-executor-call_aoOVzHHJWL04Y9CaAMmWbLog.jsonl`

Exact commands under `<env>` rooted at `/Users/roblou/code/dap-cli/tmp/phase-22-external-rust/attempt-mg-r1`:

```bash
/usr/bin/git -C /Users/roblou/code/dap-cli/tmp/phase-22-external-rust/rust-book rev-parse HEAD
/bin/cp -R /Users/roblou/.dap-cli/adapters/codelldb /Users/roblou/code/dap-cli/tmp/phase-22-external-rust/attempt-mg-r1/a/codelldb
<env> /Users/roblou/.rustup/toolchains/stable-aarch64-apple-darwin/bin/cargo build --locked --offline --bin minigrep
<env> node /Users/roblou/code/dap-cli/dist/index.js start
<env> node /Users/roblou/code/dap-cli/dist/index.js launch --adapter codelldb --type lldb --name external-mg-r1 --json '{"program":"/Users/roblou/code/dap-cli/tmp/phase-22-external-rust/rust-book/listings/ch12-an-io-project/listing-12-24/target/debug/minigrep","cwd":"/Users/roblou/code/dap-cli/tmp/phase-22-external-rust/rust-book/listings/ch12-an-io-project/listing-12-24","args":["duct","poem.txt"],"sourceLanguages":["rust"],"stopOnEntry":true}'
<env> node /Users/roblou/code/dap-cli/dist/index.js breakpoints set --name external-mg-r1 --source /Users/roblou/code/dap-cli/tmp/phase-22-external-rust/rust-book/listings/ch12-an-io-project/listing-12-24/src/lib.rs --line 4
<env> node /Users/roblou/code/dap-cli/dist/index.js continue --name external-mg-r1
<env> node /Users/roblou/code/dap-cli/dist/index.js status --name external-mg-r1
<env> node /Users/roblou/code/dap-cli/dist/index.js stack --name external-mg-r1
<env> node /Users/roblou/code/dap-cli/dist/index.js scopes --name external-mg-r1 --frame-id 1001
<env> node /Users/roblou/code/dap-cli/dist/index.js variables --name external-mg-r1 --variables-reference 1019
<env> node /Users/roblou/code/dap-cli/dist/index.js close external-mg-r1
<env> node /Users/roblou/code/dap-cli/dist/index.js stop-controller
```

Compiled executable/config: selected `listing-12-24/target/debug/minigrep`; native launch used explicit compiled program/cwd, arguments `duct poem.txt`, `sourceLanguages: ["rust"]`, and `stopOnEntry: true`.

Breakpoint/inspection evidence: `breakpoints set` returned line `4`, `verified: true`, `Resolved locations: 2`; `status` returned `adapter: "codelldb"`, `paused: true`, `stoppedReason: "breakpoint"`; top stack frame was `minigrep::search` at the selected public `src/lib.rs:4`; local variables showed `query: "duct"` and `results: size=0`.

Issues retained: an optional `evaluate --context repl --expression query` attempt produced `internal_error` because CodeLLDB interpreted `query` as a debugger command. This did not affect the required variables proof and should be audited as an ergonomics finding.

Cleanup: named-session close returned no orphan PIDs or warnings; controller stop returned `stopped: true`; final state inventory contained `sessions.json` and no controller socket.

### EXT-02-R1-itoa - Public Library Through Owned Example

attempt_id: `EXT-02-R1-itoa`
subagent_id: `gsd-executor/EXT-02-R1-itoa`
url: `https://github.com/dtolnay/itoa`
commit_sha: `af77385d0daf4d0e949e81f2588be2e44f69f086`
scenario_class: `R-EXT-02 screened pure library example`
result: pass
cleanup_verified: true
transcript_path: `.../debug-logs/d2382087-5292-4d6b-b997-ff66bafdcdfb/runSubagent-gsd-executor-call_FHLEIXCU4ahd7djGyrvHP6Zo.jsonl`

Owned harness content under `/Users/roblou/code/dap-cli/tmp/phase-22-external-rust/attempt-it-r1/probe`:

```toml
[package]
name = "itoa_probe"
version = "0.1.0"
edition = "2021"

[dependencies]
itoa = { path = "/Users/roblou/code/dap-cli/tmp/phase-22-external-rust/itoa", default-features = false }
```

```rust
use std::thread;
use std::time::Duration;

fn main() {
    thread::sleep(Duration::from_millis(500));
    let formatted = itoa::Buffer::new().format(128u64).to_owned();
    println!("{formatted}");
}
```

Exact commands under `<env>` rooted at `/Users/roblou/code/dap-cli/tmp/phase-22-external-rust/attempt-it-r1`:

```bash
git -C /Users/roblou/code/dap-cli/tmp/phase-22-external-rust/itoa rev-parse HEAD
cp -R /Users/roblou/.dap-cli/adapters/codelldb /Users/roblou/code/dap-cli/tmp/phase-22-external-rust/attempt-it-r1/a/codelldb
<env> /Users/roblou/.rustup/toolchains/stable-aarch64-apple-darwin/bin/cargo build --offline
<env> node /Users/roblou/code/dap-cli/dist/index.js start
<env> node /Users/roblou/code/dap-cli/dist/index.js launch --adapter codelldb --type lldb --name external-it-r1 --json '{"program":"/Users/roblou/code/dap-cli/tmp/phase-22-external-rust/attempt-it-r1/probe/target/debug/itoa_probe","cwd":"/Users/roblou/code/dap-cli/tmp/phase-22-external-rust/attempt-it-r1/probe","sourceLanguages":["rust"],"stopOnEntry":true}'
<env> node /Users/roblou/code/dap-cli/dist/index.js breakpoints set --name external-it-r1 --source /Users/roblou/code/dap-cli/tmp/phase-22-external-rust/itoa/src/lib.rs --line 104
<env> node /Users/roblou/code/dap-cli/dist/index.js continue --name external-it-r1
<env> node /Users/roblou/code/dap-cli/dist/index.js status --name external-it-r1
<env> node /Users/roblou/code/dap-cli/dist/index.js events --name external-it-r1 --after-cursor 0 --limit 30
<env> node /Users/roblou/code/dap-cli/dist/index.js close external-it-r1
<env> node /Users/roblou/code/dap-cli/dist/index.js launch --adapter codelldb --type lldb --name external-it-r1 --json '{"program":"/Users/roblou/code/dap-cli/tmp/phase-22-external-rust/attempt-it-r1/probe/target/debug/itoa_probe","cwd":"/Users/roblou/code/dap-cli/tmp/phase-22-external-rust/attempt-it-r1/probe","sourceLanguages":["rust"],"stopOnEntry":true}'
<env> node /Users/roblou/code/dap-cli/dist/index.js breakpoints set --name external-it-r1 --source /Users/roblou/code/dap-cli/tmp/phase-22-external-rust/itoa/src/lib.rs --line 106
<env> node /Users/roblou/code/dap-cli/dist/index.js continue --name external-it-r1
<env> node /Users/roblou/code/dap-cli/dist/index.js status --name external-it-r1
<env> node /Users/roblou/code/dap-cli/dist/index.js threads --name external-it-r1
<env> node /Users/roblou/code/dap-cli/dist/index.js stack --name external-it-r1 --thread-id 6294623
<env> node /Users/roblou/code/dap-cli/dist/index.js scopes --name external-it-r1 --frame-id 1001
<env> node /Users/roblou/code/dap-cli/dist/index.js variables --name external-it-r1 --variables-reference 1018
<env> node /Users/roblou/code/dap-cli/dist/index.js close external-it-r1
<env> node /Users/roblou/code/dap-cli/dist/index.js stop-controller
```

Compiled executable/config: owned `probe/target/debug/itoa_probe`, compiled offline with only selected path dependency `itoa` and `default-features = false`; native launch used the explicit compiled program/cwd, `sourceLanguages: ["rust"]`, and `stopOnEntry: true`.

Breakpoint/inspection evidence: requested line 104 returned `verified: false` and the first launch exited normally printing `128`; this identified the candidate-ledger location error. The bounded retry in the same inspected method requested line 106, returned `verified: true` resolving to line 107, and stopped with `stoppedReason: "breakpoint"`. Stack showed public `itoa::Buffer::format` at `src/lib.rs:107`, with caller `itoa_probe::main`; locals showed `i` of type `unsigned long` with value `128`.

Issues retained: the initial candidate-ledger line was documentation rather than executable source and has been corrected in the candidate ledger without broadening code scope. The agent also observed that launch could report running before a status poll showed its stop-at-entry state.

Cleanup: close returned no orphan PIDs or warnings; controller stop returned `stopped: true`; post-cleanup state had no live sessions and no controller socket; read-only `git status` in the public clone was blank.

## Plan 22-10 Audit Inputs

- Audit all four subagent JSONL records, retaining the first-wave scratch collision, long socket path failure, failed `repl` evaluate request, and itoa non-executable line correction as explicit findings or classified non-product issues.
- Accept behavioral pass claims only after confirming the clean rerun transcripts contain the declared SHA verification, isolated environment, selected-only build/debug commands, public-source stop, meaningful variable evidence, and cleanup.