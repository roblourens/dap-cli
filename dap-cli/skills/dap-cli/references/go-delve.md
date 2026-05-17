# dap-cli - Go (Delve)

Notes specific to the built-in `delve` adapter. Read this when debugging Go. The general loop in [SKILL.md](../SKILL.md) still applies.

## Readiness and compatibility

Run setup before a real Delve session:

```bash
npm run setup-adapters
```

The built-in adapter prefers a usable `dlv` on `PATH`; otherwise setup provisions pinned Delve `v1.26.3` under `DAP_CLI_HOME/adapters/delve`. Delve `v1.26.3` expects Go 1.24 or newer debuggee builds. Do not paper over Delve's compatibility refusal with `--check-go-version=false`; use a supported Go toolchain.

## Launch a Go package

Package directories do not have a `.go` extension, so be explicit about `--adapter delve --type go`:

```bash
dap-cli launch --adapter delve --type go --name go-debug \
  --json '{"mode":"debug","program":"/workspace/my-go-module","cwd":"/workspace/my-go-module","dlvCwd":"/workspace/my-go-module"}'
dap-cli status --name go-debug
```

For a short-lived program, add `--stop-on-entry` before installing follow-up breakpoints. Otherwise the debuggee can exit before a fresh agent gets from `launch` to `breakpoints set`.

For `--program main.go`, dap-cli can infer adapter `delve` and type `go` from the `.go` extension. Use explicit adapter/type flags for package directories and when a command must stay obvious to a fresh reader.

`cwd` is the debuggee working directory. `dlvCwd` is Delve's build working directory; set it to the module directory for `mode: "debug"` and `mode: "test"` package builds.

## Test and exec modes

Use `mode: "test"` to debug package tests:

```bash
dap-cli launch --adapter delve --type go --name go-test \
  --json '{"mode":"test","program":"/workspace/my-go-module","cwd":"/workspace/my-go-module","dlvCwd":"/workspace/my-go-module"}'
```

Short test binaries can finish just as quickly as short commands. Use `--stop-on-entry` when you need time to set source breakpoints after launch.

Use `mode: "exec"` for a prebuilt binary. Build with symbols first:

```bash
go build -gcflags=all="-N -l" -o /tmp/my-go-app /workspace/my-go-module
dap-cli launch --adapter delve --type go --name go-exec \
  --json '{"mode":"exec","program":"/tmp/my-go-app","cwd":"/workspace/my-go-module","dlvCwd":"/workspace/my-go-module"}'
```

Without `-gcflags=all="-N -l"`, optimized binaries can make source lines, stack frames, locals, and expression evaluation disappointing or misleading.
Use `--stop-on-entry` for short-lived binaries when follow-up breakpoint commands would otherwise race normal process exit.

## Safe local PID attach

Attach only to a same-machine process you own and intend to debug:

```bash
dap-cli attach --adapter delve --type go --name go-attach \
  --json '{"mode":"local","processId":12345}'
```

The Phase 20 attach verification disconnects with DAP `terminateDebuggee: false`, observes that the target process survives disconnect, then separately cleans up the test-owned child. Do not improvise broad process cleanup when scripting local PID attach.

```bash
dap-cli request disconnect --name go-attach --json '{"terminateDebuggee":false}'
```

## Inspect after a breakpoint hits

Set a breakpoint before continuing into the code you need, then reacquire IDs from the stopped state:

```bash
dap-cli breakpoints set --name go-debug --source /workspace/my-go-module/main.go --line 12
dap-cli continue --name go-debug
dap-cli status --name go-debug
dap-cli threads --name go-debug
dap-cli stack --name go-debug
dap-cli scopes --name go-debug --frame-id 10
dap-cli variables --name go-debug --variables-reference 100
dap-cli evaluate --name go-debug --expression 'left + right'
```

After any resume or step, poll `status` again and reacquire stack/scopes/variables IDs. Never reuse references from an earlier stop.
If Delve rejects a real-project `evaluate` request with `dap_request_failed`, keep the stop and inspect `scopes` plus `variables` for paused locals before deciding the value is unavailable.

## Negative diagnostics

- `delve_not_found`: run `npm run setup-adapters`, or put a compatible `dlv` on `PATH`.
- Go-version launch failure: Delve `v1.26.3` expects Go 1.24+; select a supported Go toolchain rather than disabling the check.
- Package build fails from the wrong directory: pass `cwd` and `dlvCwd` pointing at the module that owns `go.mod`.
- `mode: "exec"` has poor source/locals behavior: rebuild the binary with `go build -gcflags=all="-N -l"`.
- Attach rejects or stops the wrong thing: re-check `processId`, confirm the PID belongs to your own local Go process, and avoid remote/headless Delve shapes with the built-in local adapter.