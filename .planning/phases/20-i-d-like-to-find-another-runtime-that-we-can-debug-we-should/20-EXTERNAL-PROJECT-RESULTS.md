# Phase 20 External Go Project Results

## Result Contract

Each attempt below preserves the required external-validation fields and uses one of the permitted result labels. Every attempt ran from a shallow clone recorded in `20-EXTERNAL-PROJECT-CANDIDATES.md`, with a phase-owned `DAP_CLI_HOME`, `GOTOOLCHAIN=go1.24.0`, and explicit controller/session cleanup.

## Result Ledger

### Attempt GO-EXT-01

attempt_id: GO-EXT-01
repo_url: https://github.com/golang/example
result: pass
commit_sha: 7f05d217867b2af52b0a28c6d1c91df97e1b5b39
scenario_class: package launch through Delve `mode: "debug"`
debug_config: `{"mode":"debug","program":".../golang-example/hello","cwd":".../golang-example/hello","dlvCwd":".../golang-example/hello","args":["Copilot"]}`
breakpoint: `hello/hello.go:71`
exact_commands: `npm run setup-adapters`; `node dist/index.js start`; `node dist/index.js launch --adapter delve --type go --name phase20-hello --stop-on-entry --json <config>`; `breakpoints set`; `continue`; `status`; `stack --thread-id 1`; `evaluate --expression name`; `continue`; `close`; `cleanup --purge`; `stop-controller`.
evidence: The isolated `DAP_CLI_HOME` first returned typed `delve_not_found`, then `npm run setup-adapters` provisioned pinned Delve `v1.26.3`. After `dap-cli start`, launching `golang-example/hello` with `args: ["Copilot"]` paused on entry, breakpoint `hello.go:71` verified, `continue` stopped with `reason: "breakpoint"`, explicit `stack --thread-id 1` reported `main.main` at `hello.go:71`, and `evaluate --expression name` returned `"Copilot"`. The initial stack shortcut also emitted the useful `thread_id_required` diagnostic while five goroutines were visible, after which the explicit stopped thread completed the inspection.
product_docs_gap: none; the setup and launch recovery followed documented adapter guidance.
cleanup_verified: true

### Attempt GO-EXT-02

attempt_id: GO-EXT-02
repo_url: https://github.com/google/go-cmp
result: pass
commit_sha: 34c9473539b8d7c62273a8f4acb27c0c32295330
scenario_class: package test debugging through Delve `mode: "test"`
debug_config: `{"mode":"test","program":".../google-go-cmp/cmp","cwd":".../google-go-cmp/cmp","dlvCwd":".../google-go-cmp/cmp"}`
breakpoint: `cmp/compare.go:96`
exact_commands: `npm run setup-adapters`; `node dist/index.js start`; `launch --adapter delve --type go --name phase20-go-cmp-test --stop-on-entry --json <config>`; `breakpoints set`; `continue`; `events`; `status`; `threads`; `stack --thread-id 526`; `evaluate --expression x`; `scopes`; `variables`; `continue`; `close`; `cleanup --purge`; `stop-controller`.
evidence: The isolated cache provisioned Delve `v1.26.3`, `dap-cli launch` built tests for `google-go-cmp/cmp`, and breakpoint `compare.go:96` verified. Event cursor `6` recorded the real `reason: "breakpoint"` stop on thread `526`; `stack --thread-id 526` reported `cmp.Equal` at `compare.go:96` over `compare_test.go`, then `scopes --frame-id 1000` and `variables --variables-reference 1000` exposed locals `x`, `y`, `opts`, and `~r0`. A direct `evaluate --expression x` returned Delve `dap_request_failed`, so the attempt used standard DAP local inspection rather than treating the rejected evaluator expression as fabricated evidence.
product_docs_gap: Plan 20-06 can decide whether Go/Delve guidance should explicitly prefer scopes/variables when a real-project evaluator expression is rejected.
cleanup_verified: true

### Attempt GO-EXT-03

attempt_id: GO-EXT-03
repo_url: https://github.com/tidwall/gjson
result: pass
commit_sha: 7d8b3821e9d2acf35e8a226b63fcf801078e9b96
scenario_class: package test debugging through Delve `mode: "test"`
debug_config: `{"mode":"test","program":".../tidwall-gjson","cwd":".../tidwall-gjson","dlvCwd":".../tidwall-gjson"}`
breakpoint: `gjson.go:2131`
exact_commands: `npm run setup-adapters`; `node dist/index.js start`; `launch --adapter delve --type go --name phase20-gjson-test --stop-on-entry --json <config>`; `breakpoints set`; `continue`; `events`; `status`; `threads`; `stack --thread-id 34`; `evaluate --expression path`; `scopes`; `variables`; `continue`; `close`; `cleanup --purge`; `stop-controller`.
evidence: The isolated cache provisioned Delve `v1.26.3`, `dap-cli launch` built tests for `tidwall-gjson`, and breakpoint `gjson.go:2131` verified. Event cursor `6` recorded `reason: "breakpoint"` on thread `34`; `stack --thread-id 34` reported `gjson.Get` at `gjson.go:2131`, then `scopes --frame-id 1000` and `variables --variables-reference 1000` exposed locals including `path: "zzzz"` and the input `json`. A direct `evaluate --expression path` returned Delve `dap_request_failed`, so this attempt likewise retained scopes/variables output as the inspectable paused-state proof.
product_docs_gap: Same evaluator-versus-locals follow-up candidate as GO-EXT-02; no launch/test transport failure found.
cleanup_verified: true

### Attempt GO-EXT-04

attempt_id: GO-EXT-04
repo_url: https://github.com/rakyll/hey
result: pass
commit_sha: 5626f79b8698df6daf9b25799c9805c6acc96740
scenario_class: symbol-friendly prebuilt CLI binary through Delve `mode: "exec"`
debug_config: `{"mode":"exec","program":".../.dap-cli-home/rakyll-hey/bin/hey-debug","cwd":".../rakyll-hey","dlvCwd":".../rakyll-hey"}`
breakpoint: `hey.go:114`
exact_commands: `npm run setup-adapters`; `go build -gcflags=all="-N -l" -o <phase-home>/bin/hey-debug .`; `node dist/index.js start`; `launch --adapter delve --type go --name phase20-hey-exec --stop-on-entry --json <config>`; `breakpoints set`; `continue`; `events`; `status`; `threads`; `stack --thread-id 1`; `scopes`; `variables`; `continue`; `close`; `cleanup --purge`; `stop-controller`.
evidence: The isolated cache provisioned Delve `v1.26.3`. `go build -gcflags=all="-N -l"` created a phase-owned `hey-debug` binary; dependency downloads were ordinary Go module fetches only. Exec-mode launch produced a local process event for that binary, breakpoint `hey.go:114` verified, event cursor `5` recorded `reason: "breakpoint"` on thread `1`, and `stack --thread-id 1` reported `main.main` at `hey.go:114`. Locals inspection returned `hs` from `variables --variables-reference 1000`. After continue, the no-URL CLI invocation exited by printing usage text; no HTTP benchmark target was contacted.
product_docs_gap: none beyond the existing exec-mode guidance to keep debug symbols with `-N -l`.
cleanup_verified: true

## Summary

| Attempt | Scenario class | Result | Cleanup |
| --- | --- | --- | --- |
| GO-EXT-01 | package launch | pass | true |
| GO-EXT-02 | package tests | pass | true |
| GO-EXT-03 | package tests | pass | true |
| GO-EXT-04 | exec/prebuilt binary | pass | true |

- Selected external attempts completed: 4.
- Distinct public repositories fully attempted: 4.
- Permitted non-pass labels were not needed; safety-blocked subtrees and screened-but-unused candidates remain documented in `20-EXTERNAL-PROJECT-CANDIDATES.md`.
- The direct-evaluate failures in GO-EXT-02 and GO-EXT-03 are preserved as observed adapter behavior, not hidden. Both attempts still demonstrated verified breakpoint binding, stopped event capture, stack inspection, and live locals through DAP scopes/variables.