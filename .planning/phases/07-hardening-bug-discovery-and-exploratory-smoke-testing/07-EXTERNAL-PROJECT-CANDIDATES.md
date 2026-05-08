# Phase 7 External Project Candidates

## Purpose

Exercise dap-cli against real public projects with VS Code launch configurations, not only this repo's curated fixtures. The target is to clone, set up, build/run, and debug a small random-ish sample of projects with `.vscode/launch.json` or equivalent launch config files.

## Safety Rules

- Treat cloned repositories as untrusted input.
- Clone into ignored scratch space only: `tmp/phase-07-external-projects/`.
- Use a fresh `DAP_CLI_HOME` per candidate, for example `tmp/phase-07-external-projects/.dap-cli-home/<slug>`.
- Before running setup/build/run commands, inspect `package.json`, lockfiles, `.vscode/launch.json`, and obvious scripts.
- Do not run `sudo`, credentialed deploy commands, destructive cleanup commands, cloud login flows, or commands requiring secrets.
- If a repo needs databases, Docker, cloud services, unavailable system packages, huge installs, or ambiguous setup, mark it `blocked` and move on.
- Prefer `npm install --ignore-scripts` / `pnpm install --ignore-scripts` for first inspection when possible. If lifecycle scripts are required, inspect them before allowing a normal install.

## Trust Screen

This screen is intentionally coarse. It does not make external code safe, but it separates projects that are reasonable first choices from random exact search hits.

| Repo | Stars | Owner signal | Recency | Setup/run risk | Recommendation |
|------|-------|--------------|---------|----------------|----------------|
| `cdimascio/express-openapi-validator` | ~1000 | Long-running public Node/TypeScript package, MIT, active issues/discussions, many forks. | Active in 2026. | `npm install`/compile/test scripts look normal. Launch config includes attach configs and a `Mocha All` config, but has a hard-coded author-local Node path that must be adapted or treated as a dap-cli config-resolution test. | preferred |
| `visjs/vis-network` | ~3500 | Established `visjs` org project, Apache/MIT, many forks, public docs/homepage. | Active in 2026. | Large repo and heavier install; scripts are ordinary build/test/serve commands. Good real-world project, but maybe expensive. | preferred if install cost is acceptable |
| `descope/node-sdk` | ~60 | Company/org SDK repo, MIT, active, documented homepage. | Active in 2026. | Package scripts look ordinary, but `prepare` runs `husky install`; use `npm install --ignore-scripts` first. Example launch needs `DESCOPE_PROJECT_ID`, so prefer `Debug Jest Tests` or mark example config blocked. | acceptable with script caution |
| `microsoft/adaptive-testing` | ~190 | Microsoft org repo, MIT. | Last push in 2024, metadata updated in 2026. | Python/Jupyter-heavy and may require more environment setup; launch config is simple Python current file plus Chrome localhost. | acceptable fallback, likely setup-heavy |
| `Mark-U20/Employee_Managing_Tool` | 0 | Personal/student-looking repo. | Last pushed 2022. | Depends on MySQL and has no useful scripts. Launch config points at `src/server.js`, which may not match project shape. | demote; screen only if we want random-project coverage |
| `AymSethi/First_Project` | 0 | Personal tiny repo. | Last pushed 2025. | No `package.json`; launch config depends on VS Code `preLaunchTask: live-server: start`, so dap-cli likely cannot run it directly without extra setup. | demote/block for npm install tests |
| `uhuikim/RupangEats_TypeScript` | 0 | Personal project. | Last pushed 2021. | Create React App-era dependencies and normal scripts, but stale and low signal. Chrome config is straightforward if install still works. | demote; use only after preferred projects |

## GitHub Search Queries Used

```text
"configurations" "launch.json" "pwa-node" path:.vscode
"configurations" "launch.json" "node" "program" path:.vscode
"configurations" "launch.json" "pwa-chrome" path:.vscode
"pwa-node" "runtimeExecutable" "program" filename:launch.json
"type": "node" "program": "${workspaceFolder}" filename:launch.json
"type": "python" "program" filename:launch.json
"pwa-chrome" "webRoot" filename:launch.json
```

## Candidate Repositories

These are starter candidates from GitHub code search. Final execution should screen at least three and clone at least two that are safe/reasonable.

| ID | Repo | Launch config path found | Why candidate | Initial status |
|----|------|--------------------------|---------------|----------------|
| EXT-CAND-01 | `cdimascio/express-openapi-validator` | `launch.json` | Popular active Node/TypeScript package; good real-world Mocha/attach coverage. | status: preferred |
| EXT-CAND-02 | `visjs/vis-network` | `launch.json` | Popular active browser/library project; good real-world Mocha/debug coverage, though heavier. | status: preferred-if-install-cost-ok |
| EXT-CAND-03 | `descope/node-sdk` | `.vscode/launch.json.default` | Legit org SDK repo; useful Jest config, but install scripts and credentialed example require caution. | status: acceptable-with-caution |
| EXT-CAND-04 | `microsoft/adaptive-testing` | `development/launch.json` | Legit Microsoft repo with Python and Chrome launch configs; likely setup-heavy. | status: acceptable-fallback |
| EXT-CAND-05 | `uhuikim/RupangEats_TypeScript` | `.vscode/launch.json` | Exact `.vscode/launch.json` hit with normal CRA scripts, but personal, stale, and 0-star. | status: demoted |
| EXT-CAND-06 | `Mark-U20/Employee_Managing_Tool` | `.vscode/launch.json` | Exact `.vscode/launch.json` hit, but personal, stale, 0-star, MySQL-dependent, and launch config may not match project shape. | status: demoted |
| EXT-CAND-07 | `AymSethi/First_Project` | `.vscode/launch.json` | Exact `.vscode/launch.json` hit, but tiny personal repo with no `package.json`; not suitable for npm install coverage. | status: blocked-for-npm-install |

## Execution Procedure

For each selected candidate:

1. Clone shallowly:
   ```bash
   mkdir -p tmp/phase-07-external-projects
   git clone --depth 1 https://github.com/<owner>/<repo>.git tmp/phase-07-external-projects/<slug>
   cd tmp/phase-07-external-projects/<slug>
   git rev-parse HEAD
   ```
2. Inspect before executing:
   ```bash
   find . -maxdepth 3 \( -path './.vscode/launch.json' -o -name 'launch.json' -o -name 'package.json' -o -name 'pyproject.toml' -o -name 'requirements.txt' \) -print
   cat package.json 2>/dev/null || true
   cat .vscode/launch.json 2>/dev/null || cat launch.json 2>/dev/null || true
   ```
3. Set up/build/run only if safe. Record exact commands in `07-UAT.md`.
4. Use dap-cli from the dap-cli repo against the clone:
   ```bash
   DAP_CLI_HOME="$PWD/../.dap-cli-home/<slug>" /Users/roblou/code/dap-cli/dist/index.js launch --workspace "$PWD" --list-configs
   DAP_CLI_HOME="$PWD/../.dap-cli-home/<slug>" /Users/roblou/code/dap-cli/dist/index.js launch --workspace "$PWD" --config "<config name>" --name "ext-<slug>"
   ```
5. Set at least two breakpoints in different files/locations when the project has suitable source files:
   ```bash
   DAP_CLI_HOME="..." /Users/roblou/code/dap-cli/dist/index.js breakpoints set --name "ext-<slug>" --source "<file>" --line <line>
   DAP_CLI_HOME="..." /Users/roblou/code/dap-cli/dist/index.js threads --name "ext-<slug>"
   DAP_CLI_HOME="..." /Users/roblou/code/dap-cli/dist/index.js stack --name "ext-<slug>" --thread-id <id>
   DAP_CLI_HOME="..." /Users/roblou/code/dap-cli/dist/index.js scopes --name "ext-<slug>" --frame-id <id>
   DAP_CLI_HOME="..." /Users/roblou/code/dap-cli/dist/index.js variables --name "ext-<slug>" --variables-reference <ref>
   DAP_CLI_HOME="..." /Users/roblou/code/dap-cli/dist/index.js evaluate --name "ext-<slug>" --frame-id <id> --expression "<expr>"
   DAP_CLI_HOME="..." /Users/roblou/code/dap-cli/dist/index.js continue --name "ext-<slug>" --thread-id <id>
   ```
6. Cleanup:
   ```bash
   DAP_CLI_HOME="..." /Users/roblou/code/dap-cli/dist/index.js close "ext-<slug>" || true
   DAP_CLI_HOME="..." /Users/roblou/code/dap-cli/dist/index.js cleanup --purge || true
   DAP_CLI_HOME="..." /Users/roblou/code/dap-cli/dist/index.js stop-controller || true
   ```

## Result Ledger

| Candidate | Screened | Cloned | Setup | Build/run | Debug configs | Breakpoints | Result | Evidence |
|-----------|----------|--------|-------|-----------|---------------|-------------|--------|----------|
| EXT-CAND-01 | yes | yes | pass | pass | listed/launched | unbound | result: issue | 07-UAT.md `## External Projects`, `GAP-07-02` |
| EXT-CAND-02 | yes | no | pending | pending | pending | pending | result: deferred-large-install | 07-UAT.md `## External Projects` |
| EXT-CAND-03 | yes | yes | pass | pass | listed/launched | unbound/raced | result: issue | 07-UAT.md `## External Projects`, `GAP-07-02` |
| EXT-CAND-04 | yes | no | pending | pending | pending | pending | result: acceptable-fallback | 07-UAT.md `## External Projects` |
| EXT-CAND-05 | yes | no | pending | pending | pending | pending | result: demoted | 07-UAT.md `## External Projects` |
| EXT-CAND-06 | yes | no | pending | pending | pending | pending | result: demoted | 07-UAT.md `## External Projects` |
| EXT-CAND-07 | yes | no | blocked | blocked | pending | pending | result: blocked-for-npm-install | 07-UAT.md `## External Projects` |