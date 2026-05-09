# Phase 8 Plan 1 Summary

## Result

Executed the external project hardening expansion. The pass screened 12 candidates and attempted 7 new external repositories, exceeding the minimum plan target of 10 screened and 5 attempted.

## Repositories Attempted

- `ginpei/vscode-debug-web-demo` at `ddc5db3bb5d7168e5d77f09e8e159995dd9358e1`: safe install passed; `Server` and `Client` listed; `Server` launched; plain JS breakpoints stayed unbound; running-thread `stack` diagnostics were misleading.
- `jobscale/zipcode-jp` at `020240023a9457c18d8d59cc0fe53dbf7d53320a`: safe install passed; `Chrome` and `Program` listed; `Program` launched; plain JS breakpoints stayed unbound and the session terminated quickly.
- `ahpalmer/Katas` at `21f40ba6f3b0b04871fd8d9df0e6bacbda1b60eb`: original current-file config listed and rejected `${file}` as unsupported; adapted scratch `type: python` config launched and verified breakpoints, stack, continue, and stopped events.
- `github/codespaces-models` at `d1ce83390e5071b2a93d15ad728426df2833a6bb`: JS/Python current-file configs listed; both rejected `${file}` as unsupported; model samples require env/secrets so no unsafe setup was run.
- `satanon2k1/debug-in-docker` at `56101e1e7d4d4384574871ce3c9e7d118988978a`: attach config listed; attach failed because no remote inspector was listening; dap-cli surfaced adapter stderr and log path.
- `kettleofketchup/pikvm-auto` at `6fe39e7f990d3a17883701fe7b945da81196f0ba`: debugpy configs listed; current-file/command/input variables rejected with structured usage diagnostics.
- `tregermanhagai/Playwright_Pytest_Demo` at `5a9ff84c8c28f5337c4da4cbb959ae8d70e6a67d`: `Debug Pytest` listed; launch failed because `type: debugpy` is not mapped.

## Bugs Found

- `GAP-08-01`: `type: debugpy` launch configs list but cannot launch.
- `GAP-08-02`: Running-thread inspection reports `controller_unavailable` and tells the user to run `dap-cli start`.
- `GAP-08-03`: Real JS pwa-node launch configs leave breakpoints unbound with little guidance.

## Evidence

- `08-UAT.md`
- `08-EXTERNAL-PROJECT-CANDIDATES.md`
- `tmp/phase-08-clone-screen.log`
- `tmp/phase-08-ginpei-rerun.log`
- `tmp/phase-08-jobscale.log`
- `tmp/phase-08-katas.log`
- `tmp/phase-08-katas-rerun.log`
- `tmp/phase-08-codespaces-models.log`
- `tmp/phase-08-debug-in-docker.log`
- `tmp/phase-08-python-config-blockers.log`

## Follow-Up

Completed in `08-02-PLAN.md`: GAP-08-01 through GAP-08-03 are closed with focused compatibility and diagnostics fixes.

## Verification

- `node .github/get-shit-done/bin/gsd-tools.cjs verify plan-structure .planning/phases/08-external-project-hardening-expansion/08-01-PLAN.md`
- `node .github/get-shit-done/bin/gsd-tools.cjs validate consistency`
- `git diff --check`

## Self-Check: PASSED
