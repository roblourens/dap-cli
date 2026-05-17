# Phase 20 External Go Project Candidates

## Purpose

Screen real public Go repositories before any external project command is executed, then choose a small diversified set for Delve validation beyond repo-owned fixtures.

## Safety Rules

- Treat every cloned repository as untrusted input.
- Clone shallowly only under ignored scratch space: `tmp/phase-20-external-go-projects/`.
- Inspect `README.md`, `go.mod`, Makefiles/task files, `.vscode/launch.json`, and shell-looking setup guidance before running project commands.
- Reject or block commands needing credentials, cloud accounts, Docker/databases, privileged execution, curl-pipe installers, opaque hooks, or heavyweight generators.
- Use only repo-owned scratch `DAP_CLI_HOME` directories for debug attempts and remove/close only phase-owned sessions or processes.

## Screen Procedure

The Phase 20 pool was shallow-cloned into `tmp/phase-20-external-go-projects/<slug>`. Screening inspected repository SHAs, manifests, readmes, and Makefiles before selecting any attempt target. No Makefile install/lint/deploy target was executed during screening.

## Candidate Ledger

| ID | Repo URL | Shallow clone path | Screen notes | Status | Target scenario class | Why it diversifies the set |
| --- | --- | --- | --- | --- | --- | --- |
| GO-CAND-01 | `https://github.com/golang/example` | `tmp/phase-20-external-go-projects/golang-example` | SHA `7f05d217867b2af52b0a28c6d1c91df97e1b5b39`; use only small `hello`/`helloserver` modules. Root README also points to App Engine; `ragserver` README requires Docker/vector DB/API key, so those subtrees are blocked. | selected | small package launch | Official compact examples with isolated safe modules; tests Delve package-directory launch without using cloud/Docker subtrees. |
| GO-CAND-02 | `https://github.com/google/go-cmp` | `tmp/phase-20-external-go-projects/google-go-cmp` | SHA `34c9473539b8d7c62273a8f4acb27c0c32295330`; pure-Go library, `go 1.21`, no risky setup surfaced in manifest/readme screen. | selected | Go test debugging | Mature library tests exercise `mode: "test"` on a nontrivial real package. |
| GO-CAND-03 | `https://github.com/tidwall/gjson` | `tmp/phase-20-external-go-projects/tidwall-gjson` | SHA `7d8b3821e9d2acf35e8a226b63fcf801078e9b96`; pure-Go JSON parser, `go 1.23`, README includes APIs/benchmarks but no required services. | selected | Go test debugging | Smaller parser test surface gives a second external test-mode attempt with straightforward locals. |
| GO-CAND-04 | `https://github.com/tidwall/sjson` | `tmp/phase-20-external-go-projects/tidwall-sjson` | SHA `fde34f72caab2ccda6093fc00307fc25c0c9644c`; pure-Go JSON mutation library, `go 1.14`, safe test candidate. | screened | Go test debugging | Backup low-risk test-mode repo if a selected test target becomes unsuitable. |
| GO-CAND-05 | `https://github.com/google/uuid` | `tmp/phase-20-external-go-projects/google-uuid` | SHA `2d3c2a9cc518326daf99a383f07c4d3c44317e4d`; manifest/readme screen found a small package repo without mandatory services. | screened | Go test debugging | Alternate package-test target with different domain from JSON/parser libraries. |
| GO-CAND-06 | `https://github.com/spf13/cobra-cli` | `tmp/phase-20-external-go-projects/spf13-cobra-cli` | SHA `1d434876c3a75eb70df49df15019b8ba7ef0ffd2`; CLI repo is appealing, but Makefile warns about `curl ... | sh` lint installation and `make test` depends on extra tools. Do not execute those hooks. | screened-caution | small CLI launch | Candidate for direct `go`/Delve launch only if selected later; records an explicit untrusted-hook screen. |
| GO-CAND-07 | `https://github.com/rakyll/hey` | `tmp/phase-20-external-go-projects/rakyll-hey` | SHA `5626f79b8698df6daf9b25799c9805c6acc96740`; `go 1.24.0`; Makefile cross-build targets are unnecessary; README contains bearer-token sample text, so use no network benchmark request. | selected | exec/prebuilt debug-binary flow | Real CLI suitable for local symbol-friendly `mode: "exec"` validation without performing load tests. |
| GO-CAND-08 | `https://github.com/gorilla/mux` | `tmp/phase-20-external-go-projects/gorilla-mux` | SHA `db9d1d0073d27a0a2d9a8c1bc52aa0af4374d265`; README has localhost examples and fake token snippets; Makefile install/lint targets use `go install`, so do not run them. | screened | safe localhost service or tests | Backup service-shaped repo if a localhost server scenario is needed later; prefer tests over copied README servers. |

## Selection Notes

- Selected full-attempt candidates: GO-CAND-01, GO-CAND-02, GO-CAND-03, and GO-CAND-07.
- The selected four cover package launch, test-mode debugging across two distinct package shapes, and symbol-friendly exec/prebuilt binary flow.
- No safe `.vscode/launch.json` `type: "go"` candidate was confirmed during this screen. The candidate pool records that absence rather than inventing a named-config attempt.
- Every selected candidate remains untrusted; execution in `20-EXTERNAL-PROJECT-RESULTS.md` may still downgrade a candidate to blocked if inspected source/commands expose a new safety or environment issue.