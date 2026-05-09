# Phase 8 External Project Candidates

## Purpose

Track the expanded external-repository hardening sample. Phase 7 fully exercised two external TypeScript/Jest-ish projects; Phase 8 broadens the sample across more project shapes.

## Safety Rules

- Treat all cloned repositories as untrusted input.
- Clone only under `tmp/phase-08-external-projects/`.
- Inspect launch configs and setup scripts before executing project commands.
- Prefer installs with lifecycle scripts disabled.
- Do not run privileged, credentialed, cloud, deploy, Docker daemon, or destructive commands.

## Candidate Ledger

| Candidate | Launch config path | Screen result | Selected for full attempt | Notes |
|-----------|--------------------|---------------|---------------------------|-------|
| `ginpei/vscode-debug-web-demo` | `.vscode.example/launch.json` | selected | yes | Small Express/browser demo. Safe `npm install --ignore-scripts`; launch configs copied into `.vscode/launch.json` in scratch clone. |
| `github/codespaces-models` | `.vscode/launch.json` | selected | yes | Current-file JS/Python sample configs; no sample `.js`/`.py` files in shallow checkout root, and model samples require env/secrets. Useful for `${file}` handling. |
| `microsoft/adaptive-testing` | `development/launch.json` | deferred | no | Legit Microsoft repo; setup likely heavier and lower value after smaller Python candidates exposed current-file/debugpy-type gaps. |
| `ahpalmer/Katas` | `src/python_individual_projects/.vscode/launch.json`, `src/python_individual_projects/roman_numerals/launch.json` | selected | yes | Small Python kata repo. Original current-file config tested, then scratch config adapted to concrete file for debugpy exercise. |
| `satanon2k1/debug-in-docker` | `nodejs/launch.json` | selected | yes | Attach-only Node config depends on external Docker/remote inspector; useful environment-blocked attach diagnostics check. |
| `jobscale/zipcode-jp` | `launch.json` | selected | yes | Node/Chrome project. Safe install with scripts disabled; Node `Program` config attempted. |
| `cortesben/deno-test` | `.vscode/launch.json` | environment-blocked | no | Deno runtime not installed locally, so launch attempt would not be meaningful. Config screened only. |
| `sgeraldes/hidock-next` | `config/ide/vscode/launch.json` | deferred | no | Very large checkout (25k+ files) with Python/Electron apps; deferred because smaller Python candidates covered the same debugpy/current-file surface. |
| `kettleofketchup/pikvm-auto` | `config/vscode/launch.json` | selected | yes | Python/debugpy configs with `${file}`, `${command:pickArgs}`, and `${input:tests_selection}`; useful unsupported-variable coverage. |
| `tregermanhagai/Playwright_Pytest_Demo` | `.vscode/launch.json`, `sample.launch.json` | selected | yes | Small Python Playwright/pytest repo; launch config uses `type: debugpy`; full dependency/browser install avoided. |
| `github/vscode-codeql` | `.vscode/launch.json` | deferred | no | High-signal but large/heavy; not needed for this incremental pass. |
| `ankitects/anki` | `.vscode.dist/launch.json` | deferred | no | High-signal but large/heavy; not needed for this incremental pass. |

## Result

- Candidates screened: 12.
- New external repos attempted: 7.
- Full setup/build/debug depth varied by safety: runnable small projects were launched; secret/cloud/browser-heavy/Docker-dependent configs were classified without unsafe setup.
- Evidence logs are referenced from `08-UAT.md`.
