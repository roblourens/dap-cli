# Phase 22 External Rust Project Candidates

## Purpose And Ordering Record

This ledger was created on 2026-06-01 after R-00/R-01 and owned R-03/R-04 passed, and before any build, test, run, or debug command executes code from a public Rust repository. Candidate discovery and shallow read-only clones under `tmp/phase-22-external-rust/` may be used only to fill the inspection rows below before selection.

## Safety And Isolation Contract

- Treat cloned public source, Cargo metadata, and documentation as untrusted input until screened.
- Before selection, inspect `README`, `Cargo.toml`, `Cargo.lock`, each selected workspace member, `build.rs`, proc-macro dependencies/members, `.cargo/`, task/build/just/make files, `.vscode/launch.json`, devcontainer/setup files, and any network/service/credential/privilege requirements.
- Reject commands that require secrets, cloud/services, elevated privileges, Docker socket access, opaque hooks, unscreened build scripts/proc-macros, broad network access during execution, or install scripts.
- A build/debug attempt may run only the exact screened command listed for a `selected` row and must use a SHA-pinned shallow clone, an isolated `DAP_CLI_HOME`, an isolated `DAP_CLI_ADAPTERS_DIR` seeded from the already verified local CodeLLDB cache, and cleanup of only scenario-owned processes/files.
- Preferred isolation is a non-root container with no host home or Docker socket mounted and network disabled during debug. If the available native macOS CodeLLDB payload cannot run in such a Linux container, the permitted fallback is inspected host execution with fresh temp home/cache, no credentials in the bounded environment, no service startup, no PID attach, and launched scenario-owned targets only.

## Required Screen Fields

Each inspected row must record: `commit_sha`, clone path, scenario class, maintenance/popularity signal, license signal, `README`, `Cargo.toml`, `Cargo.lock`, workspace members, `build.rs`, `proc-macro`, `.cargo`, task/build/just/make scripts, `launch.json`, `devcontainer`, network/services/credentials/privileges, `isolation`, exact allowed build/debug command, and disposition.

## Candidate Ledger

### Candidate C-01: Rust Book `minigrep` final listing

- `disposition`: `selected`; scenario class: public CLI binary using an inspected repository input file.
- `url`: `https://github.com/rust-lang/book`; `commit_sha`: `05d114287b7d6f6c9253d5242540f00fbd6172ab`; shallow clone path: `tmp/phase-22-external-rust/rust-book`; selected crate path: `listings/ch12-an-io-project/listing-12-24`.
- Maintenance/popularity signal: official Rust Book repository at current shallow-cloned `main`; the selected listing is the documented Chapter 12 final executable example. License signal: repository contains `LICENSE-APACHE` and `LICENSE-MIT`.
- `README`: selected listing contains no README; repository README describes building the book with `mdbook`, which is outside this selected listing and is not permitted below.
- `Cargo.toml`: inspected; package `minigrep` edition 2024 with empty `[dependencies]`. `Cargo.lock`: inspected; contains only `minigrep` itself. Workspace members: none for the selected standalone listing.
- `build.rs`: none in the complete selected listing file inventory. `proc-macro`: none possible in its empty dependency/lock inventory. `.cargo`: repository ancestor `.cargo/config.toml` was inspected and sets only `[cargo-new]` author name/email; it does not configure builds, runners, registries, aliases, or network.
- Task/build/just/make scripts: none in the selected listing; the README's repository-level `mdbook` instructions are excluded. `.vscode/launch.json`: none found. `devcontainer` or setup material: none found for the selected execution surface.
- Network/services/credentials/privileges: source inventory is only `Cargo.toml`, `Cargo.lock`, `poem.txt`, `src/main.rs`, and `src/lib.rs`; runtime reads inspected local `poem.txt` and prints matching lines. No service, credential, privilege, install, or network requirement is present.
- `isolation`: selected for inspected host fallback. The approved `codelldb-darwin-arm64` runtime is native to the macOS host and cannot establish the required adapter proof in a non-root Linux container. Use a fresh per-attempt `HOME`, `CARGO_HOME`, `DAP_CLI_HOME`, and `DAP_CLI_ADAPTERS_DIR`; seed only the checksum-verified CodeLLDB runtime already proved in the local cache; invoke the installed local Rust toolchain by explicit path in a bounded environment; do not attach, install, fetch, start services, or inherit credential paths; use only scenario-owned controller/target processes and clean them up.
- Exact allowed build command, from the selected crate directory with the preceding isolated environment active: `cargo build --locked --offline --bin minigrep`.
- Exact allowed debug surface: launch `target/debug/minigrep` only through `dap-cli launch --adapter codelldb --type lldb --name external-minigrep --json '{"program":"<selected-crate>/target/debug/minigrep","cwd":"<selected-crate>","args":["duct","poem.txt"],"sourceLanguages":["rust"],"stopOnEntry":true}'`; set a source breakpoint at `src/lib.rs:4`, continue, collect stopped stack plus scopes/variables or evaluate evidence, then close the named session and stop the scenario-owned controller.
- Selection rationale: deterministic, dependency-free public executable gives the CLI-binary scenario without allowing Cargo to resolve or run third-party code.

### Candidate C-02: `dtolnay/itoa`

- `disposition`: `selected`; scenario class: public pure-library logic called by a small owned example binary.
- `url`: `https://github.com/dtolnay/itoa`; `commit_sha`: `af77385d0daf4d0e949e81f2588be2e44f69f086`; shallow clone path: `tmp/phase-22-external-rust/itoa`; selected member path: repository root library only.
- Maintenance/popularity signal: README publishes the crates.io/docs.rs/GitHub project and the inspected manifest is version `1.0.18`; CI metadata exercises current stable/beta/nightly/MSRV builds. License signal: manifest declares `MIT OR Apache-2.0`, with both license files present.
- `README`: inspected; documents pure `Buffer::format` use and no runtime setup. `Cargo.toml`: inspected; normal dependency `no-panic` is optional only; `criterion` occurs only under dev dependencies for benchmark/test-oriented repository commands. `Cargo.lock`: absent from the inspected library repository. Workspace members: none; `fuzz/Cargo.toml` exists outside the selected root-library build path and is excluded.
- `build.rs`: none in the complete repository inventory. `proc-macro`: selected root library with `default-features = false` does not activate optional `no-panic` and has no normal dependency to compile; no proc-macro is permitted. `.cargo`: none found. Task/build/just/make scripts: none found. `.vscode/launch.json`: none found. `devcontainer` or setup material: none found.
- Network/services/credentials/privileges: inspected library source is in `src/lib.rs` and `src/u128_ext.rs`; it performs integer formatting only. Repository CI, benches, tests, and fuzz crate are informative but excluded from commands. No selected code requires network, services, credentials, privileges, or filesystem data.
- `isolation`: selected for the same inspected macOS host fallback as C-01. Use a fresh per-attempt `HOME`, `CARGO_HOME`, `DAP_CLI_HOME`, and `DAP_CLI_ADAPTERS_DIR`; seed only the verified local CodeLLDB runtime; disable Cargo network; launch only an owned harness process and remove its scratch output/controller after evidence capture.
- Exact allowed owned harness manifest: create only under the attempt scratch directory with `[package] name = "itoa_probe", version = "0.1.0", edition = "2021"` and `[dependencies] itoa = { path = "<clone>/itoa", default-features = false }`. Exact allowed harness source: a `main` that optionally sleeps before `let formatted = itoa::Buffer::new().format(128u64).to_owned();`, prints `formatted`, and contains no I/O other than stdout.
- Exact allowed build command, from the owned harness directory with the preceding isolated environment active: `cargo build --offline` (the only selected public compile path is `itoa` root with default features disabled; do not invoke its tests, benches, fuzz member, CI, or optional features).
- Exact allowed debug surface: launch the owned `target/debug/itoa_probe` only through `dap-cli launch --adapter codelldb --type lldb --name external-itoa --json '{"program":"<owned-harness>/target/debug/itoa_probe","cwd":"<owned-harness>","sourceLanguages":["rust"],"stopOnEntry":true}'`; set a source breakpoint at public `itoa/src/lib.rs:106` (CodeLLDB may resolve the first executable statement at line 107), continue, collect stopped stack plus scopes/variables or evaluate evidence, then close the named session and stop the scenario-owned controller. This line value corrects the initially recorded `:104`, which the first bounded attempt proved is documentation immediately above the same inspected `Buffer::format` method rather than executable code; the selected public-code surface did not change.
- Selection rationale: executes real public library implementation through a prescribed example while avoiding the repository's unneeded dev dependencies, benchmark workflow, fuzz member, and optional macro dependency.

### Screened But Not Selected Suggestions

- `unicode-rs/unicode-width`: retained as an un-cloned backup suggestion only; no row is selected and no command is authorized because two diversified candidates already satisfy this plan without expanding the inspected surface.
- `rust-lang/glob`: retained as an un-cloned backup suggestion only; not selected because the suggested test route advertises dev dependencies and filesystem-oriented cases while C-01/C-02 are narrower.

## Execution Log

- 2026-06-01: Ledger and isolation boundary created before public Rust clone contents are executed. `build/test/run/debug` count against public candidates at creation time: zero.
- 2026-06-01: Made SHA-pinned shallow read-only clones for C-01 and C-02 under `tmp/phase-22-external-rust/`; inspection used file enumeration and reads only. No clone contents were built, tested, run, or debugged before the two `selected` records above were completed.
- 2026-06-01: During delegated C-02 execution, the originally requested `itoa/src/lib.rs:104` returned `verified: false`; source inspection and a bounded retry in the already selected method established executable declaration line 106 resolving to statement line 107. The location correction above records that evidence gap without authorizing another dependency, target, feature, or repository command.