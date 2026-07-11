# AGENTS.md

## Cursor Cloud specific instructions

`dap-cli` is a single TypeScript/Node CLI (no web UI, no server, no database). It drives
Debug Adapter Protocol targets. Standard commands live in `package.json` `scripts` and the
`README.md`; use those as the source of truth. Notes below are only the non-obvious caveats
for this environment.

### Node version (important)
- The repo requires Node `>=22`, but tests assume the same **latest Node 22.x** that CI uses
  (`.github/workflows/publish.yml` → `node-version: '22'`). On Node **< 22.18** the TS type
  stripping runtime emits an `ExperimentalWarning: Type Stripping` on stderr, which breaks
  tests that assert an empty `stderrTail` (e.g. `tests/integration/fakeAdapterCli.test.ts`).
- The base VM image ships an older `node` (22.14) as `/exec-daemon/node`, which is early in
  `PATH`. Setup pins the toolchain by symlinking the nvm-installed Node 22.23.1 into
  `/usr/local/cargo/bin/{node,npm,npx}` (that dir sorts ahead of `/exec-daemon` in `PATH`).
  Verify with `node -v` (should be `v22.23.1`). If a future image loses these symlinks,
  recreate them from `~/.nvm/versions/node/v22.23.1/bin/`.

### Running tests — unset the shell color vars
- The agent shell exports `NO_COLOR=1`, `TERM=dumb`, `FORCE_COLOR=0`. One unit test
  (`tests/cli/humanOutput.test.ts` → "variables color the value ...") forces color and fails
  when `NO_COLOR` is set. Run the suite with those unset:
  `env -u NO_COLOR -u TERM -u FORCE_COLOR npm test` (same for `npm run check`).
- `tests/integration/launchInference.test.ts` is timing-flaky under full parallel load
  (occasionally `running` instead of `stopped`); it passes reliably in isolation. Re-run the
  single file rather than treating a one-off failure as a real break.

### Debug adapters
- Adapters are **not** bundled; they download on demand into `~/.dap-cli/adapters/`.
  `js-debug` (Node/Chrome, the primary/default) is provisioned during setup. Provision more
  with `npm run setup-adapters -- --adapter <js-debug|debugpy|delve|codelldb> --yes`.
- `debugpy` provisioning creates a Python venv, so it needs the `python3-venv` package
  (installed during setup) plus Python 3.
- Playwright Chromium is installed (`~/.cache/ms-playwright`). It is needed even for the
  default test run because `tests/integration/playwrightInterop.test.ts` launches Chromium in
  its `beforeAll` regardless of whether the gated scenario tests run.
- Heavier smokes stay skipped unless their env flags are set: `DAP_CLI_RUN_BROWSER_SMOKES`,
  `DAP_CLI_RUN_CHROME_PLAYWRIGHT_HANDOFF`, `DAP_CLI_RUN_*_ATTACH_SMOKE`, `DAP_CLI_RUN_PACKAGING`.

### Running the CLI
- The CLI talks to a background controller daemon. Start it once with `node dist/index.js start`
  before any `launch`/`attach`; otherwise commands fail with `controller_unavailable`.
  Typical flow: `start` → `launch --yes --program <file> --stop-on-entry` →
  `breakpoints set` → `continue` → `status` → `stack`/`evaluate` → `cleanup`.
