---
phase: 21
date: 2026-05-25
domain: packaging / runtime provisioning / cross-platform CLI install
confidence: HIGH
---

# Phase 21: Lazy Runtime Provisioning of Built-in Adapters — Research

## Project Constraints (from copilot-instructions.md)

- Hand-driven CLI smoke (`dev/smoke/hand-driven-smoke.md` Sequence A & B) is **mandatory** for every `/gsd-verify-work` round. Phase 21 must extend this doc with a fresh-machine consent-prompt scenario; tests-pass is not sufficient evidence.
- Verbatim captured output of every smoke step goes into `21-UAT.md` under a `## Hand-Driven CLI Smoke` heading.
- GSD workflow tooling is used; commits and PRs follow project conventions.

## User Constraints (from CONTEXT.md)

### Locked Decisions
D-01 (lazy dispatch in `AdapterRegistry.resolve`), D-02 (per-adapter only), D-03..D-06 (consent prompt with `--yes` / `DAP_CLI_ASSUME_YES=1` / non-TTY fast-fail), D-07 (`~/.dap-cli/adapters/<id>/`), D-08 (per-adapter lockfile + staged extract + atomic rename), D-09 (clean up tmp on failure), D-10 (logic moves into `src/adapters/provision/`), D-11 (NO shell-out to `tar`/`unzip`), D-12 (`DAP_CLI_ADAPTERS_DIR` override), D-13/D-14 (`dap-cli setup-adapters` subcommand with `--adapter`, `--yes`), D-15 (specific failure surfaces: network/proxy/rate-limit/python3/arch/cache), D-16 (README + adapter-setup.md updates).

### the agent's Discretion
- Exact lockfile mechanism (`proper-lockfile` vs atomic `fs.mkdir`) — research recommends below.
- Exact archive extraction library — research recommends below.
- SHA-256 checksum verification — research recommends below.
- Progress UI shape (stderr only, never stdout).

### Deferred Ideas (OUT OF SCOPE)
- Adapter version self-update (`dap-cli adapters update`).
- Mirror / private-registry support beyond `DAP_CLI_ADAPTERS_DIR`.
- Custom adapter auto-install.
- Signed-archive / Sigstore attestation.

## Goal

Make built-in adapters (js-debug, debugpy, delve) install on first use from any install path (`npm i -g`, `npx`, agent-skill plugin) without the user running a separate setup step. Honor explicit user consent before any network call, be safe under concurrent invocations, and surface failures (network, proxy, rate-limit, missing python3, unsupported arch, unwritable cache) in errors the user can act on without reading source.

---

## Key Findings

### 1. Archive extraction in-process (D-11) — `tar@7.x` + `yauzl@3.x`

**Recommendation:** Use the npm `tar` package (isaacs/node-tar) for `.tar.gz` (js-debug + non-Windows delve), and `yauzl` for `.zip` (Windows delve). Both are pure-JS, no native compilation, install on every Node 22+ platform without prebuilds.

**Verified:**

| Package | Version | Downloads/wk | License | Repo | Deps |
|---|---|---|---|---|---|
| `tar` | 7.5.15 | 90.2M | BlueOak-1.0.0 | github.com/isaacs/node-tar | 5 (all isaacs-maintained: minipass, minizlib, chownr, yallist, @isaacs/fs-minipass) |
| `yauzl` | 3.3.1 | 41.6M | MIT | github.com/thejoshwolfe/yauzl | 2 (buffer-crc32, pend) |

**Why these:**
- `tar` is the de-facto Node tar lib (used by npm itself, isaacs/Isaac Z. Schlueter maintains both). Unpacked size ~2.3MB. Streams the extract — no buffering the whole archive in memory.
- `yauzl` is the standard random-access ZIP reader; `extract-zip@2.0.1` is a wrapper around it (adds `debug` + `get-stream` for ~0 functional gain in our usage). Use `yauzl` directly to keep the dep tree narrow.

**Alternative considered:** `extract-zip` (2.0.1, 27M dl/wk, BSD-2). Slightly nicer API but pulls in `debug` + `get-stream`. Reject — yauzl directly is 30 lines.

**Sketch — js-debug extract:**

```ts
// src/adapters/provision/extractTarGz.ts
import { createReadStream } from 'node:fs';
import * as tar from 'tar';

export async function extractTarGz(archivePath: string, destDir: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    createReadStream(archivePath)
      .on('error', reject)
      .pipe(tar.x({ cwd: destDir, strict: true }))
      .on('error', reject)
      .on('finish', resolve);
  });
}
```

**Sketch — delve windows extract:**

```ts
// src/adapters/provision/extractZip.ts
import { promises as fs } from 'node:fs';
import { createWriteStream } from 'node:fs';
import path from 'node:path';
import yauzl from 'yauzl';

export function extractZip(archivePath: string, destDir: string): Promise<void> {
  return new Promise((resolve, reject) => {
    yauzl.open(archivePath, { lazyEntries: true }, (err, zip) => {
      if (err || zip === undefined) { reject(err ?? new Error('zip open failed')); return; }
      zip.readEntry();
      zip.on('entry', (entry) => {
        const dest = path.join(destDir, entry.fileName);
        if (entry.fileName.endsWith('/')) {
          fs.mkdir(dest, { recursive: true }).then(() => zip.readEntry()).catch(reject);
          return;
        }
        zip.openReadStream(entry, (rerr, readStream) => {
          if (rerr || readStream === undefined) { reject(rerr ?? new Error('zip read failed')); return; }
          fs.mkdir(path.dirname(dest), { recursive: true })
            .then(() => {
              const out = createWriteStream(dest);
              readStream.pipe(out);
              out.on('finish', () => zip.readEntry());
              out.on('error', reject);
            })
            .catch(reject);
        });
      });
      zip.on('end', resolve);
      zip.on('error', reject);
    });
  });
}
```

**Confidence: HIGH** — both packages have multi-year history, isaacs maintains tar. `[VERIFIED: npm registry]` via `npm view`.

---

### 2. Cross-platform lockfile (D-08) — `proper-lockfile@4.x`

**Recommendation:** Use `proper-lockfile@4.1.2`. Handles stale-lock detection (compromised PID), retries with backoff, cross-platform (no `flock(2)`), MIT licensed, 14.6M dl/wk. Deps: `graceful-fs`, `retry`, `signal-exit` (all stable, well-known).

**Why not zero-dep `fs.mkdir`:** Atomic-directory is workable but you have to hand-roll stale-lock detection (PID check, mtime threshold, signal-exit hook). proper-lockfile does this correctly and has been in production for a decade.

**Sketch — provision serialization:**

```ts
// src/adapters/provision/lock.ts
import { promises as fs } from 'node:fs';
import path from 'node:path';
import lockfile from 'proper-lockfile';

export async function withAdapterLock<T>(
  adaptersDir: string,
  adapterId: string,
  fn: () => Promise<T>,
): Promise<T> {
  await fs.mkdir(adaptersDir, { recursive: true });
  // Lock target must exist; create a sentinel file we lock against.
  const sentinel = path.join(adaptersDir, `.${adapterId}.lock-target`);
  await fs.writeFile(sentinel, '', { flag: 'a' });

  const release = await lockfile.lock(sentinel, {
    retries: { retries: 60, minTimeout: 500, maxTimeout: 2000, factor: 1 },
    stale: 5 * 60 * 1000,   // 5 min — longer than any plausible download
    realpath: false,
  });
  try {
    return await fn();
  } finally {
    await release();
  }
}
```

**Failure mode:** If `lockfile.lock` exhausts retries (~60 retries × ~1.5s ≈ 90s wait), throw a structured error with code `provision_lock_timeout` and diagnostic `Another dap-cli process is provisioning <adapter>; if no other process is running, delete <sentinel> and retry.`

**Important:** The lock is **acquire-or-wait**. The second process waits, then re-checks whether the canonical install now exists (it usually will, because the winner just finished). Pattern:

```ts
await withAdapterLock(adaptersDir, 'js-debug', async () => {
  if (await isAdapterInstalled('js-debug')) return; // winner already did it
  await provisionJsDebug();
});
```

**Confidence: HIGH** — `[VERIFIED: npm registry]`, package is mature and widely used.

---

### 3. HTTP download — Node 22 fetch + undici ProxyAgent

**Findings:**
- Node 22's built-in `fetch` is backed by `undici`. **It does NOT honor `HTTP_PROXY`/`HTTPS_PROXY`/`NO_PROXY` env vars by default.** This is intentional per the Node maintainers — the runtime can't safely default to using a proxy without breaking existing apps.
- Workaround: import `ProxyAgent` from `undici` (bundled — no extra dep), construct it from the env var, and pass it as `{ dispatcher }` on the fetch call.

**Sketch:**

```ts
// src/adapters/provision/http.ts
import { ProxyAgent, type Dispatcher } from 'undici';

function resolveDispatcher(targetUrl: string): Dispatcher | undefined {
  const url = new URL(targetUrl);
  const proxyUrl = url.protocol === 'https:'
    ? process.env.HTTPS_PROXY ?? process.env.https_proxy
    : process.env.HTTP_PROXY ?? process.env.http_proxy;
  if (proxyUrl === undefined || proxyUrl.length === 0) return undefined;
  if (matchesNoProxy(url.host, process.env.NO_PROXY ?? process.env.no_proxy)) return undefined;
  return new ProxyAgent(proxyUrl);
}

export async function downloadToFile(url: string, destPath: string, onProgress?: (bytes: number, total: number | undefined) => void): Promise<void> {
  const dispatcher = resolveDispatcher(url);
  const response = await fetch(url, dispatcher ? { dispatcher } : undefined);
  if (!response.ok) throw httpError(url, response);
  const total = parseContentLength(response.headers.get('content-length'));
  // ...stream response.body to destPath, calling onProgress on each chunk
}

function httpError(url: string, response: Response): CliError {
  if (response.status === 403 && response.headers.get('x-ratelimit-remaining') === '0') {
    const retryAfter = response.headers.get('x-ratelimit-reset');
    return usageError('GitHub rate limit exceeded.', {
      code: 'provision_rate_limited',
      diagnostics: [`Retry after epoch ${retryAfter ?? 'unknown'}.`, 'Set GITHUB_TOKEN to raise the rate limit.'],
    });
  }
  // ...other status codes
}
```

**`undici` is bundled in Node 22** — `import { ProxyAgent } from 'undici'` works with no `package.json` change. `[VERIFIED: Node 22 docs]`.

**DNS / connection failures:** Native `fetch` throws a `TypeError` with `cause` set to a `NodeError`. Inspect `error.cause.code` (`ENOTFOUND`, `ECONNREFUSED`, `ETIMEDOUT`) and map to `provision_network_error` with the specific cause in diagnostics. When a proxy env var was set and the request failed, emit `provision_proxy_error` and name the proxy URL.

**Rate limit detection:** GitHub returns HTTP 403 with `X-RateLimit-Remaining: 0` and `X-RateLimit-Reset` (epoch seconds). Distinguish from generic 403 by header presence.

**Confidence: HIGH for fetch+ProxyAgent, MEDIUM for retry-after handling** (header presence is documented but exact format requires the implementer to read GitHub's current docs at fix time).

---

### 4. SHA-256 checksum verification (research question)

**Recommendation: YES, verify, with embedded constants. Worth the maintenance cost.**

**The two options:**

| Approach | Trust | Maintenance |
|---|---|---|
| Embed expected SHA-256 in published CLI source | Strong — checksum is signed by npm publishing key alongside the code that uses it | Bump constant on every adapter version bump |
| Fetch a `SHASUMS256.txt` from GitHub alongside the archive | Weak — same-source compromise (an attacker who can poison the archive can poison the checksums file) | None |

The maintenance cost is small: adapter versions are pinned in code anyway (`jsDebugVersion = '1.117.0'` etc. in [scripts/setup-adapters.ts](scripts/setup-adapters.ts#L10)), so a constants table next to them is one extra string per bump.

**Sketch:**

```ts
// src/adapters/provision/checksums.ts
export const ADAPTER_CHECKSUMS = {
  'js-debug@1.117.0': {
    'js-debug-dap-v1.117.0.tar.gz': 'sha256:<verified once at version-bump time>',
  },
  'delve@v1.26.3': {
    'dlv_1.26.3_darwin_arm64.tar.gz': 'sha256:...',
    'dlv_1.26.3_darwin_amd64.tar.gz': 'sha256:...',
    // ...per-platform
  },
} as const;
// debugpy is not in this table — it's installed via pip, which has its own hashing.
```

**Pip:** Use `pip install --require-hashes` or `pip install debugpy==1.8.20 --hash=sha256:...` to get equivalent verification for free. PyPI publishes a JSON API that returns per-wheel hashes.

**Confidence: MEDIUM** — recommendation is sound but actual checksum values must be filled in at implementation time by downloading and hashing the pinned artifacts. The version-bump runbook needs a one-line "regenerate checksums" step.

---

### 5. Confirmation prompt (D-03..D-06) — built-in `readline/promises`

**Recommendation:** Zero-dep. Use Node's built-in `readline/promises.createInterface()`. Prompts on **stderr**, reads from stdin. Detect TTY on both.

**Why not `prompts` / `@inquirer/prompts`:** Both work, but neither adds anything beyond what `readline/promises` provides for a single Y/N. `@inquirer/prompts` adds ~27 MB unpacked. `prompts` is lighter (~75KB) but still a dep for a 30-line helper.

**Sketch — `src/cli/confirm.ts` (new file):**

```ts
import * as readline from 'node:readline/promises';
import { usageError, type CliError } from './errors.js';

export interface ConfirmOptions {
  question: string;
  details?: readonly string[];
  /** When true, return true immediately and skip prompting. */
  assumeYes: boolean;
  /** Override for testing. */
  stdin?: NodeJS.ReadStream;
  stderr?: NodeJS.WriteStream;
}

export async function confirm(options: ConfirmOptions): Promise<true> {
  if (options.assumeYes) return true;

  const stdin = options.stdin ?? process.stdin;
  const stderr = options.stderr ?? process.stderr;

  if (stdin.isTTY !== true) {
    throw usageError('Confirmation required but stdin is not a TTY.', {
      code: 'provision_consent_required',
      diagnostics: [
        options.question,
        'Re-run with `--yes` / `-y` or set DAP_CLI_ASSUME_YES=1 to pre-consent.',
      ],
    });
  }

  stderr.write(`\n${options.question}\n`);
  for (const line of options.details ?? []) stderr.write(`  ${line}\n`);
  stderr.write('Proceed? [y/N] ');

  const rl = readline.createInterface({ input: stdin, output: stderr, terminal: false });
  try {
    const answer = (await rl.question('')).trim().toLowerCase();
    if (answer === 'y' || answer === 'yes') return true;
    throw usageError('User declined provisioning consent.', {
      code: 'provision_consent_declined',
      diagnostics: ['Re-run with `--yes` to pre-consent.'],
    });
  } finally {
    rl.close();
  }
}

export function resolveAssumeYes(cliYes: boolean | undefined, env: NodeJS.ProcessEnv): boolean {
  if (cliYes === true) return true;
  const envVal = env.DAP_CLI_ASSUME_YES;
  return envVal === '1' || envVal === 'true';
}
```

**Wiring:**
- Add `--yes, -y` as a **program-level** option in [src/cli/program.ts](src/cli/program.ts#L48) (mirror the existing `--human` pattern), so it's available to `launch`, `attach`, and `setup-adapters` without per-command duplication. `commander` propagates global options via `program.opts()`.
- Per-adapter-version consent marker file: `~/.dap-cli/adapters/<id>/.consent-<version>` (zero-byte sentinel). Provisioner writes it after first successful install. Subsequent runs check for it and skip the prompt (D-05). Wiping the adapter dir invalidates consent (correct behavior — re-install is re-prompt).

**Confidence: HIGH** — `readline/promises` is a stable Node API, the prompt-to-stderr pattern is what `gh auth login` and `npm` use.

---

### 6. Atomic install layout (D-08, D-09)

**Sketch:**

```ts
// src/adapters/provision/atomicInstall.ts
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';

export interface AtomicInstallOptions {
  adaptersDir: string;
  adapterId: string;
  /** Called with the staging dir; must populate it with the final-layout files. */
  populate(stagingDir: string): Promise<void>;
  /** Files that MUST exist inside the canonical dir after rename — corruption check. */
  expectedEntrypoints: readonly string[];
}

export async function atomicInstallAdapter(opts: AtomicInstallOptions): Promise<void> {
  const canonical = path.join(opts.adaptersDir, opts.adapterId);
  const staging = path.join(opts.adaptersDir, `.${opts.adapterId}.tmp.${process.pid}.${randomBytes(4).toString('hex')}`);

  await fs.mkdir(staging, { recursive: true });
  try {
    await opts.populate(staging);
    for (const rel of opts.expectedEntrypoints) {
      await fs.access(path.join(staging, rel)); // throws if missing
    }
    // Remove the old canonical (if present) AFTER staging is validated.
    await fs.rm(canonical, { recursive: true, force: true });
    await fs.rename(staging, canonical);
  } catch (err) {
    await fs.rm(staging, { recursive: true, force: true }).catch(() => undefined);
    throw err;
  }
}
```

**Cross-platform notes:**
- `fs.rename` between two paths under the same parent directory (`adaptersDir`) is atomic on POSIX and Windows (NTFS). EXDEV (across volumes) cannot happen here because staging and canonical share `adaptersDir`.
- On Windows, `fs.rm` on an old canonical can fail with EBUSY if a previous process has files open. Mitigation: `{ recursive: true, force: true, maxRetries: 5, retryDelay: 100 }` — same pattern as [src/testing/tempEnv.ts](src/testing/tempEnv.ts#L24).

**Corruption detection on read:** Descriptor factories (`createJsDebugDescriptor` etc.) currently check `existsSync(entrypoint)` ([src/adapters/builtins/jsDebug.ts](src/adapters/builtins/jsDebug.ts#L62)). Extend to verify ALL expected entrypoints (e.g., for js-debug: `src/dapDebugServer.js` AND `src/bootloader.js`). If any are missing in the canonical install, treat as "not provisioned" and trigger re-provision via the same lock+install flow.

**Confidence: HIGH.**

---

### 7. debugpy venv specifics (D-15)

**Findings:**
- `getDapCliVenvPythonPath()` returns `~/.dap-cli/venv/bin/python3` (POSIX) or `~/.dap-cli/venv/Scripts/python.exe` (Windows) — see [src/config/paths.ts](src/config/paths.ts#L28).
- debugpy 1.8.20 requires Python **3.8+** (per debugpy README on PyPI). The pinned version in [scripts/setup-adapters.ts](scripts/setup-adapters.ts#L11) is `1.8.20`.
- Venv create: `python3 -m venv <venvDir>`. Then `<venv>/bin/pip install debugpy==1.8.20`.
- On Debian/Ubuntu, `python3` may exist but `python3-venv` may not (apt split). The `venv` command fails with a specific error pointing the user at `apt install python3-venv`. Surface this hint when venv create fails on linux.

**Error mapping:**

```ts
function pythonInstallHint(): string {
  switch (process.platform) {
    case 'darwin': return 'Install Python: `brew install python` (Homebrew) or download from https://www.python.org/downloads/';
    case 'linux':  return 'Install Python: `apt install python3 python3-venv` (Debian/Ubuntu) or your distro equivalent.';
    case 'win32':  return 'Install Python from https://www.python.org/downloads/windows/ — ensure "Add to PATH" is checked.';
    default:       return 'Install Python 3.8+ from https://www.python.org/downloads/';
  }
}
```

Error code: `provision_python3_missing`. Distinguish from "python3 exists but venv module is broken" (`provision_python3_venv_unavailable`) — the latter prints the captured stderr from the venv command.

**Pre-built debugpy wheel without system python?** Investigated briefly: debugpy ships native extensions per Python ABI (`debugpy._vendored.pydevd._pydevd_bundle` includes C extensions compiled per Python version). Bundling a Python runtime + debugpy is doable (PyOxidizer, ~25MB+) but is its own engineering project. **Defer.** The current "needs python3" baseline is acceptable; the error must just be clear.

**Confidence: HIGH for venv flow, MEDIUM for bundled-python decision (deferral is the practical call).**

---

### 8. Delve binary download per OS/arch (D-15)

The existing platform matrix in [scripts/setup-adapters.ts](scripts/setup-adapters.ts#L182) is **correct and complete** for `v1.26.3`:

| OS | Arch | Asset | Kind |
|---|---|---|---|
| darwin | arm64 | `dlv_1.26.3_darwin_arm64.tar.gz` | tar.gz |
| darwin | x64 | `dlv_1.26.3_darwin_amd64.tar.gz` | tar.gz |
| linux | arm64 | `dlv_1.26.3_linux_arm64.tar.gz` | tar.gz |
| linux | x64 | `dlv_1.26.3_linux_amd64.tar.gz` | tar.gz |
| win32 | x64 | `dlv_1.26.3_windows_amd64.zip` | zip |

URL pattern: `https://github.com/go-delve/delve/releases/download/v1.26.3/<asset>`. Verified against the existing working code.

**Unsupported platforms** (e.g., `linux/ppc64`, `win32/arm64`): emit `provision_arch_unsupported` with the detected `<platform>/<arch>` and the recovery hint `Install delve manually with` go install github.com/go-delve/delve/cmd/dlv@v1.26.3` `and put` dlv `on PATH.`

After extract, `chmod 0o755` on the non-Windows binary (already in existing code at line 173).

**Confidence: HIGH** — directly verified against working production code.

---

### 9. Pre-publish verification (D-16)

**Recommendation:** A vitest integration test gated by `DAP_CLI_RUN_PACKAGING=1`, plus a `prepublishOnly` script hook.

**The test:**

```ts
// tests/packaging/publishedTarball.test.ts
test('packed tarball contains provisioner code and not setup-adapters script', async () => {
  const tmpDir = await fs.mkdtemp(...);
  // npm pack writes <name>-<version>.tgz to cwd
  execSync('npm pack --pack-destination ' + tmpDir, { cwd: REPO_ROOT });
  const tgz = (await fs.readdir(tmpDir)).find(f => f.endsWith('.tgz'));
  await extractTarGz(path.join(tmpDir, tgz), tmpDir);
  // package/ is the npm convention
  const pkgDir = path.join(tmpDir, 'package');
  // Positive: provisioner is in dist/
  await fs.access(path.join(pkgDir, 'dist', 'index.js'));
  // Grep dist for the function name that must be present
  const distSrc = await fs.readFile(path.join(pkgDir, 'dist', 'index.js'), 'utf8');
  expect(distSrc).toMatch(/provisionJsDebug|atomicInstallAdapter/);
  // Negative: no scripts/setup-adapters.ts leaks into the tarball
  const allFiles = await walk(pkgDir);
  expect(allFiles).not.toContain(expect.stringMatching(/scripts\/setup-adapters/));
});
```

**`prepublishOnly` already runs `npm run check`** ([package.json](package.json#L51)). Add a `check:pack` script and chain it in:

```json
"check:pack": "DAP_CLI_RUN_PACKAGING=1 vitest run tests/packaging/publishedTarball.test.ts",
"check": "npm run typecheck && npm run lint && npm test && npm run build && npm run check:pack"
```

**Confidence: HIGH.**

---

### 10. Testing strategy

**`FakeReleaseServer` fixture:**

```ts
// tests/helpers/fakeReleaseServer.ts
import * as http from 'node:http';
import { promises as fs } from 'node:fs';
import path from 'node:path';

export interface FakeReleaseHandler {
  /** Path including query, e.g. `/microsoft/vscode-js-debug/releases/download/v1.117.0/js-debug-dap-v1.117.0.tar.gz`. */
  match: (req: http.IncomingMessage) => boolean;
  /** Either a path to a fixture file, or a handler returning body+status. */
  respond: (req: http.IncomingMessage, res: http.ServerResponse) => Promise<void>;
}

export async function startFakeReleaseServer(handlers: FakeReleaseHandler[]): Promise<{ url: string; close: () => Promise<void> }> {
  const server = http.createServer(async (req, res) => {
    for (const h of handlers) {
      if (h.match(req)) { await h.respond(req, res); return; }
    }
    res.statusCode = 404; res.end();
  });
  await new Promise<void>(r => server.listen(0, '127.0.0.1', r));
  const port = (server.address() as { port: number }).port;
  return {
    url: `http://127.0.0.1:${port}`,
    close: () => new Promise<void>(r => server.close(() => r())),
  };
}
```

The provisioner already needs URL injection for testability — either pass `releaseBaseUrl` through the provisioner options, or read an env var `DAP_CLI_PROVISION_RELEASE_BASE_URL` consulted only in test/dev. Prefer the env-var route to keep the production signature clean.

**Fake tarballs:** Generate at test setup, not committed. Use `tar.c({ cwd: ..., file: ... })` to pack a tiny synthetic tree (`src/dapDebugServer.js` stub + `src/bootloader.js` stub for js-debug; a dummy `dlv` binary for delve) into the temp dir. ~30 lines of helper code.

**Test matrix (must all be automated):**

| Scenario | Mechanism |
|---|---|
| Cold-cache install, success | FakeReleaseServer serves canned tarball |
| Warm-cache no-op | Pre-populate dir + entrypoints, assert no HTTP request |
| Concurrent install (two processes racing) | Spawn two `child_process.fork()` of a tiny test runner, both call provisioner — assert only ONE download (server hit counter) |
| Consent prompt: yes | Spawn provisioner as subprocess with PTY (use `node-pty` or write "y\n" to stdin), assert install completes |
| Consent: decline | Write "n\n", assert `provision_consent_declined` |
| `--yes` bypass | Pass flag, assert no stderr prompt |
| `DAP_CLI_ASSUME_YES=1` | Env var, assert no prompt |
| Non-TTY without consent | Pipe stdin from `/dev/null`, assert `provision_consent_required` fast-fail (no hang) |
| `DAP_CLI_ADAPTERS_DIR` override | Set to a pre-populated dir, assert it's used and no download attempted |
| Corrupt cache → re-provision | Delete entrypoint from canonical dir, run again, assert re-download |
| Network failure | FakeReleaseServer refuses connection or returns 500, assert `provision_network_error` |
| Rate limit | Handler returns 403 + `X-RateLimit-Remaining: 0`, assert `provision_rate_limited` with retry-after |
| Missing python3 (debugpy) | Mock `spawn('python3', ...)` failure or run in a container without python3 — assert `provision_python3_missing` |
| Unsupported arch (delve) | Stub `process.arch` via test seam — assert `provision_arch_unsupported` |
| Cache unwritable | Set `DAP_CLI_ADAPTERS_DIR` to `/dev/null/cant` or chmod 0 a parent — assert `provision_cache_unwritable` |

**npx cache test (the contract test the user called out):**

```ts
// tests/packaging/npxCache.test.ts — gated by DAP_CLI_RUN_PACKAGING=1
test('two npx invocations do not re-download the adapter', async () => {
  const tmpRoot = await fs.mkdtemp(...);
  execSync('npm pack --pack-destination ' + tmpRoot, { cwd: REPO_ROOT });
  const tgz = (await fs.readdir(tmpRoot)).find(f => f.endsWith('.tgz'));
  const projectDir = path.join(tmpRoot, 'consumer');
  await fs.mkdir(projectDir, { recursive: true });
  await fs.writeFile(path.join(projectDir, 'package.json'), JSON.stringify({ name: 'consumer', version: '0.0.0' }));
  execSync(`npm install ${path.join(tmpRoot, tgz)}`, { cwd: projectDir });

  const fakeReleases = await startFakeReleaseServer([/* js-debug handler */]);
  const dapCliHome = path.join(tmpRoot, 'home');
  const env = {
    ...process.env,
    DAP_CLI_HOME: dapCliHome,
    DAP_CLI_PROVISION_RELEASE_BASE_URL: fakeReleases.url,
    DAP_CLI_ASSUME_YES: '1',
  };
  // First invocation: should download
  execSync('npx dap-cli setup-adapters --adapter js-debug', { cwd: projectDir, env });
  const firstHits = fakeReleases.hitCount;
  expect(firstHits).toBeGreaterThan(0);
  // Second invocation: should NOT re-download
  execSync('npx dap-cli setup-adapters --adapter js-debug', { cwd: projectDir, env });
  expect(fakeReleases.hitCount).toBe(firstHits);
});
```

(This uses `setup-adapters` rather than `launch` to keep the test small and not require a real debug target.)

**Confidence: HIGH.**

---

### 11. Plan decomposition recommendation

Six plans, ordered for safe incremental landing:

| # | Plan | Scope |
|---|---|---|
| 21-01 | **Provisioner scaffold + consent + locking** | Move logic skeleton into `src/adapters/provision/`. Add `withAdapterLock`, `atomicInstallAdapter`, `downloadToFile` (with ProxyAgent + rate-limit detection), `confirm()` helper, `--yes`/`DAP_CLI_ASSUME_YES` plumbing. Convert `AdapterRegistry.resolve` to async (or add a new `resolveProvisioned()` async method — see Open Q O-1). |
| 21-02 | **Per-adapter provisioners** | `provisionJsDebug.ts`, `provisionDebugpy.ts`, `provisionDelve.ts`. Each has its own URL, expected entrypoints, archive type, post-extract steps (chmod, package.json boundary for js-debug, venv+pip for debugpy). Wire descriptor factories to call them when binary missing. Include the SHA-256 checksum table. |
| 21-03 | **`dap-cli setup-adapters` subcommand** | `src/cli/commands/setupAdapters.ts`. `--adapter <id>` and `--yes`. README/docs reference points here. The dev npm script becomes `node dist/index.js setup-adapters`. |
| 21-04 | **Failure-surface diagnostics** | Map every error case (D-15) to a structured `CliError` code with actionable diagnostics. Add the new codes (`provision_consent_required`, `provision_consent_declined`, `provision_network_error`, `provision_proxy_error`, `provision_rate_limited`, `provision_python3_missing`, `provision_arch_unsupported`, `provision_cache_unwritable`, `provision_lock_timeout`). Snapshot tests for error envelopes. |
| 21-05 | **Tests: FakeReleaseServer + concurrent + npx-cache + pre-publish check** | Test matrix from §10. Includes the `check:pack` integration test. |
| 21-06 | **Docs + smoke extension** | README install section rewrite (consent prompt, `--yes`, `DAP_CLI_ADAPTERS_DIR`). `docs/adapter-setup.md` update. `dev/smoke/hand-driven-smoke.md` extension: new fresh-machine sequence that wipes `~/.dap-cli/`, runs `npx`, observes prompt, answers yes, confirms install. |

**Rationale for boundaries:** 21-01 lands the cross-cutting scaffolding. 21-02 ships actual functionality but reuses scaffold. 21-03 is independent (new CLI command). 21-04 is largely text changes + tests. 21-05 is the test-only plan that proves the contract. 21-06 is doc-only and is the LAST plan because the hand-driven smoke depends on everything else working.

**Could be three plans (js-debug, debugpy, delve) instead of one (21-02):** Reject. The duplication between them is mostly identical glue around the shared `atomicInstallAdapter`; one plan keeps the abstraction clean.

---

## Open Questions

**O-1. `AdapterRegistry.resolve` sync→async migration.** Lazy provisioning is inherently async (download + extract + prompt). `resolve()` is currently sync ([src/adapters/registry.ts](src/adapters/registry.ts#L68)) and called from already-async functions in `src/cli/commands/dapCore.ts` (lines 246, 291) — so making it `async` is mechanically safe. But:
- Test seams at [tests/integration/jsDebugAdapter.test.ts](tests/integration/jsDebugAdapter.test.ts#L568) etc. call `new AdapterRegistry().resolve('js-debug')` synchronously. Those tests are leaning on the pre-provisioned `~/.dap-cli` cache and will keep working if `resolve()` becomes async (just need an `await`). Migration is mechanical.
- Decision: convert `resolve()` to `async`. Don't add a parallel `resolveProvisioned()` — having two methods is a footgun (someone will call the sync one and silently bypass provisioning).
- **Confirm:** OK with the sync→async migration? It touches ~6 call sites (all already async).

**O-2. Should the `--yes` flag also live on `launch` / `attach`, or ONLY on `setup-adapters`?** CONTEXT.md D-06 says all three. Confirm that's still correct vs. "force users to pre-provision with `setup-adapters --yes` and keep `launch`/`attach` consent-only." The agent-skill use case strongly favors the former (one flag, all commands).

**O-3. Lockfile timeout value.** Sketch uses 90 seconds. A cold js-debug download is ~5-10s on a fast connection, debugpy pip-install is ~15s, delve is ~2s. A 90s ceiling is comfortable for any single adapter. Confirm.

**O-4. Where do per-adapter consent markers live?** Recommended: `~/.dap-cli/adapters/<id>/.consent-<version>` (sentinel file inside the adapter dir). Alternative: a single `~/.dap-cli/consents.json`. Sentinel is simpler and self-cleaning (wiping the adapter dir invalidates consent, which is correct). Confirm.

**O-5. Checksum maintenance discipline.** Embedded SHA-256 constants must be regenerated on every adapter version bump. Add a `scripts/dev/regen-checksums.ts` helper that downloads each pinned artifact and prints the table? Or fail loudly at build time if the table is stale? Recommend the helper script; loud-fail at build time only works if we have a known-good baseline to compare against.

---

## Implementation Approach

### Directory layout (new files)

```
src/adapters/provision/
  index.ts                  # public API: provisionAdapter(id, opts)
  lock.ts                   # withAdapterLock()
  atomicInstall.ts          # atomicInstallAdapter()
  http.ts                   # downloadToFile() + ProxyAgent + error mapping
  extractTarGz.ts           # tar wrapper
  extractZip.ts             # yauzl wrapper
  checksums.ts              # ADAPTER_CHECKSUMS table
  consent.ts                # consent marker read/write helpers
  jsDebug.ts                # provisionJsDebug()
  debugpy.ts                # provisionDebugpy()
  delve.ts                  # provisionDelve()

src/cli/
  confirm.ts                # confirm() + resolveAssumeYes()
  commands/setupAdapters.ts # `dap-cli setup-adapters [--adapter id] [--yes]`

tests/adapters/provision/
  jsDebug.test.ts
  debugpy.test.ts
  delve.test.ts
  lock.test.ts
  http.test.ts
  consent.test.ts

tests/helpers/
  fakeReleaseServer.ts

tests/packaging/
  publishedTarball.test.ts  # `npm pack` + content check
  npxCache.test.ts          # contract test: two npx invocations, one download
```

### Provisioner public API (`src/adapters/provision/index.ts`)

```ts
export interface ProvisionAdapterOptions {
  adaptersDir?: string;       // defaults to getDapCliAdaptersDir()
  assumeYes: boolean;         // from --yes / DAP_CLI_ASSUME_YES
  releaseBaseUrl?: string;    // test seam (DAP_CLI_PROVISION_RELEASE_BASE_URL)
  stderr?: NodeJS.WriteStream;
  stdin?: NodeJS.ReadStream;
}

export async function provisionAdapter(adapterId: 'js-debug' | 'debugpy' | 'delve', options: ProvisionAdapterOptions): Promise<void>;
```

Each per-adapter provisioner is structured identically:

```ts
async function provisionJsDebug(opts: ResolvedOptions): Promise<void> {
  if (await isAlreadyInstalled('js-debug', opts)) return;

  await withAdapterLock(opts.adaptersDir, 'js-debug', async () => {
    if (await isAlreadyInstalled('js-debug', opts)) return; // re-check inside lock

    await confirm({
      assumeYes: opts.assumeYes,
      stdin: opts.stdin, stderr: opts.stderr,
      question: `dap-cli will download js-debug v${jsDebugVersion} (~10 MB) from GitHub.`,
      details: [
        `Source: ${jsDebugUrl()}`,
        `Install location: ${path.join(opts.adaptersDir, 'js-debug')}`,
        `Checksum: SHA-256 (verified)`,
      ],
    });

    await atomicInstallAdapter({
      adaptersDir: opts.adaptersDir,
      adapterId: 'js-debug',
      expectedEntrypoints: ['src/dapDebugServer.js', 'src/bootloader.js'],
      async populate(stagingDir) {
        const archivePath = path.join(stagingDir, '..', `js-debug.${process.pid}.tar.gz`);
        await downloadToFile(jsDebugUrl(), archivePath, progressReporter(opts.stderr, 'js-debug'));
        await verifyChecksum(archivePath, ADAPTER_CHECKSUMS[`js-debug@${jsDebugVersion}`][jsDebugAssetName]);
        await extractTarGz(archivePath, stagingDir);
        // js-debug ships with no top-level package.json; we add one for module-type isolation.
        await fs.writeFile(path.join(stagingDir, 'package.json'), '{"type":"commonjs"}\n');
        await fs.unlink(archivePath).catch(() => undefined);
      },
    });

    await writeConsentMarker(opts.adaptersDir, 'js-debug', jsDebugVersion);
  });
}
```

### Descriptor factory wiring (existing files, minimal edit)

```ts
// src/adapters/builtins/jsDebug.ts — change resolveDefaultJsDebugPath signature to async,
// or move the resolve to a new async wrapper. Recommendation: change the factory to be async.

export async function createJsDebugDescriptor(jsDebugPath?: string): Promise<AdapterDescriptor> {
  const dapServerPath = jsDebugPath ?? await ensureJsDebugInstalled();
  return { /* ...same as today... */ };
}

async function ensureJsDebugInstalled(): Promise<string> {
  const candidates = [
    path.join(getDapCliAdaptersDir(), 'js-debug', 'src', 'dapDebugServer.js'),
    path.join(process.cwd(), 'node_modules', 'vscode-js-debug', 'src', 'dapDebugServer.js'),
  ];
  for (const c of candidates) if (await pathExists(c)) return c;

  // Trigger lazy provision. assumeYes is read from process.env here because
  // the descriptor factory doesn't have access to commander options — the
  // program-level --yes handler sets DAP_CLI_ASSUME_YES=1 before reaching this point.
  await provisionAdapter('js-debug', {
    assumeYes: resolveAssumeYes(undefined, process.env),
  });

  return path.join(getDapCliAdaptersDir(), 'js-debug', 'src', 'dapDebugServer.js');
}
```

The pattern of "global `--yes` sets `DAP_CLI_ASSUME_YES=1` in process.env, descriptor factory reads from env" keeps the factory signature minimal and avoids passing options through five layers. This is the same pattern `--human` uses for output mode.

### `AdapterRegistry.resolve` change

```ts
// Before: public resolve(id: string): AdapterDescriptor
// After:  public async resolve(id: string): Promise<AdapterDescriptor>
```

The `create()` factory in `BuiltInAdapterFactory` also becomes `() => Promise<AdapterDescriptor>`. The 6 call sites (`dapCore.ts` lines 246/291, three test files, registry.test.ts) get an `await` added.

### Package.json changes

```json
"dependencies": {
  // existing:
  "@vscode/debugprotocol": "^1.68.0",
  "commander": "^14.0.1",
  "jsonc-parser": "^3.3.1",
  "zod": "^4.1.12",
  // new:
  "proper-lockfile": "^4.1.2",
  "tar": "^7.5.15",
  "yauzl": "^3.3.1"
},
"devDependencies": {
  "@types/proper-lockfile": "^4.1.4",
  "@types/yauzl": "^2.10.3"
}
```

Total runtime dep weight added: ~3 MB unpacked (tar ~2.3MB, proper-lockfile + transitive ~500KB, yauzl ~150KB). Acceptable for a CLI that already pulls in commander + zod.

### README and docs changes (D-16)

**README.md install section rewrite:**

```markdown
## Install the CLI

\`\`\`bash
npm install -g @roblourens/dap-cli
dap-cli --version
\`\`\`

The first time you debug with an adapter, dap-cli asks for confirmation and downloads it to `~/.dap-cli/adapters/`. You can pre-install everything up front:

\`\`\`bash
dap-cli setup-adapters --yes        # install all built-in adapters
dap-cli setup-adapters --adapter js-debug --yes   # only js-debug
\`\`\`

For non-interactive use (CI, agents), pass `--yes` or set `DAP_CLI_ASSUME_YES=1`. To point dap-cli at a pre-populated adapter cache (Docker images, monorepo mirrors), set `DAP_CLI_ADAPTERS_DIR=/path/to/adapters`.
```

---

## Package Legitimacy Audit

slopcheck not available in this research session. All packages independently verified via npm registry + GitHub repo inspection + download counts.

| Package | Registry | Age | Downloads/wk | Source Repo | Verdict | Disposition |
|---|---|---|---|---|---|---|
| `tar` | npm | 15 yrs | 90.2M | github.com/isaacs/node-tar | OK (maintained by isaacs, npm CLI uses it) | Approved |
| `yauzl` | npm | 10 yrs | 41.6M | github.com/thejoshwolfe/yauzl | OK (thejoshwolfe, MIT) | Approved |
| `proper-lockfile` | npm | 9 yrs | 14.6M | github.com/moxystudio/node-proper-lockfile | OK | Approved |
| `@types/proper-lockfile` | npm | (DefinitelyTyped) | (DT) | github.com/DefinitelyTyped/DefinitelyTyped | OK | Approved (dev-only) |
| `@types/yauzl` | npm | (DefinitelyTyped) | (DT) | github.com/DefinitelyTyped/DefinitelyTyped | OK | Approved (dev-only) |

**No suspicious packages. No packages removed.** All recommended packages are top-tier, multi-year history, MIT/BlueOak/BSD licensed.

---

## Security Domain

| ASVS Category | Applies | Standard Control |
|---|---|---|
| V2 Authentication | no | — (no user accounts in CLI) |
| V3 Session Management | no | — |
| V4 Access Control | no | — |
| V5 Input Validation | yes | URL validation before fetch; archive path traversal prevention (yauzl entries can be relative paths like `../../../etc/passwd` — must validate `entry.fileName` does not escape `destDir`) |
| V6 Cryptography | yes | SHA-256 verification of downloaded archives; never hand-roll hash logic — use `node:crypto`'s `createHash('sha256')` |
| V10 Malicious Code | yes | Pinned dependency versions + slopcheck-style legitimacy audit (above); embedded checksums to detect upstream tampering |
| V12 Files & Resources | yes | Staged extract + atomic rename prevents half-written canonical state; reject zip entries with absolute paths or `..` segments; explicit `fs.chmod` only on platforms where it's meaningful |
| V14 Configuration | yes | Cache location overridable via env var (D-12) but defaults to `~/.dap-cli/` — no automatic write to system paths |

### Threat Patterns for This Phase

| Pattern | STRIDE | Mitigation |
|---|---|---|
| Zip-slip (archive entry escapes dest dir via `../`) | Tampering | Validate every `entry.fileName`: must be relative, must not contain `..` segments. `tar` package has `strict: true` for this; `yauzl` requires manual check |
| Compromised upstream release | Tampering | SHA-256 verification against embedded checksums (§4) |
| MITM on download | Information disclosure / Tampering | HTTPS-only fetch; reject non-https URLs |
| Race condition during concurrent install | Tampering | Per-adapter lockfile (§2) |
| Half-written canonical install if process killed | Repudiation / Tampering | Staged extract + atomic rename (§6); corruption-check on read |
| Consent bypass via env var injection | Elevation of Privilege | Document `DAP_CLI_ASSUME_YES` clearly; CI / agent callers are expected to set it explicitly (this IS the bypass, not a vulnerability) |
| Symlink in archive points outside cache | Tampering | tar `strict: true` rejects symlinks that escape; explicitly disable symlink extraction for zip |

---

## Validation Architecture

### Test Framework
| Property | Value |
|---|---|
| Framework | vitest 3.2.4 |
| Config | [vitest.config.ts](vitest.config.ts) |
| Quick run | `npm test` (or `vitest run <path>`) |
| Full suite | `npm run check` (typecheck + lint + test + build + check:pack) |

### Must-Have → Test Map (derived from CONTEXT.md decisions, since no REQUIREMENTS.md entries exist)

| Decision | Behavior | Test Type | Automated Command |
|---|---|---|---|
| D-01 | First `resolve(id)` with missing binary triggers provision | unit | `vitest run tests/adapters/provision/jsDebug.test.ts -t "first resolve provisions"` |
| D-02 | Resolving js-debug does not touch debugpy/delve | unit | `vitest run tests/adapters/registry.test.ts -t "no side effect on other adapters"` |
| D-03 | Prompt printed to stderr, never stdout | unit | `vitest run tests/cli/confirm.test.ts -t "stderr only"` |
| D-04 | Per-adapter consent | unit | `vitest run tests/adapters/provision/consent.test.ts -t "per adapter"` |
| D-05 | Per-version consent marker | unit | `vitest run tests/adapters/provision/consent.test.ts -t "version marker"` |
| D-06 | Non-TTY without `--yes`/env → fast-fail | unit | `vitest run tests/cli/confirm.test.ts -t "non-tty fails fast"` |
| D-07 | Install lands in `~/.dap-cli/adapters/<id>/` | unit | covered by atomicInstall tests |
| D-08 | Concurrent invocations: only one download | integration | `vitest run tests/adapters/provision/lock.test.ts -t "concurrent"` (uses `child_process.fork`) |
| D-09 | Failure during staging leaves no partial canonical | unit | `vitest run tests/adapters/provision/jsDebug.test.ts -t "no partial on failure"` |
| D-10 | Logic in `src/adapters/provision/` (not `scripts/`) | architecture | `vitest run tests/architecture/moduleBoundaries.test.ts` (extend existing) |
| D-11 | No `spawnSync('tar', ...)` / `spawnSync('unzip', ...)` in src/ | architecture | grep-style assertion in moduleBoundaries test |
| D-12 | `DAP_CLI_ADAPTERS_DIR` honored | unit | `vitest run tests/adapters/provision/jsDebug.test.ts -t "DAP_CLI_ADAPTERS_DIR"` |
| D-13/D-14 | `dap-cli setup-adapters` subcommand works | integration | `vitest run tests/cli/setupAdaptersCommand.test.ts` |
| D-15 (network) | Network failure → `provision_network_error` | unit | FakeReleaseServer returns 500 |
| D-15 (proxy) | Failed proxy → `provision_proxy_error` | unit | bad HTTPS_PROXY env |
| D-15 (rate-limit) | 403 + headers → `provision_rate_limited` | unit | FakeReleaseServer canned response |
| D-15 (python3) | Missing python3 → `provision_python3_missing` | unit | mock spawn |
| D-15 (arch) | Unsupported arch → `provision_arch_unsupported` | unit | stub process.arch |
| D-15 (cache) | Unwritable cache → `provision_cache_unwritable` | unit | chmod 0 a parent |
| D-16 | README mentions consent + `--yes` + `DAP_CLI_ADAPTERS_DIR` | docs | grep test in `tests/docs/` |
| **Contract** | npx invocations re-use cache (no re-download) | smoke (gated) | `DAP_CLI_RUN_PACKAGING=1 vitest run tests/packaging/npxCache.test.ts` |
| **Contract** | Published tarball contains provisioner code | smoke (gated) | `DAP_CLI_RUN_PACKAGING=1 vitest run tests/packaging/publishedTarball.test.ts` |
| **Contract** | Fresh-machine `npx dap-cli launch` produces working session | hand-driven | `dev/smoke/hand-driven-smoke.md` new Sequence C, captured into `21-UAT.md` |

### Sampling Rate
- **Per task commit:** `vitest run tests/adapters/provision tests/cli/confirm.test.ts tests/cli/setupAdaptersCommand.test.ts`
- **Per wave merge:** `npm test`
- **Phase gate:** `npm run check` (includes new `check:pack`) — must be green before `/gsd-verify-work`
- **`/gsd-verify-work`:** Hand-driven Sequence A + B + new Sequence C captured into `21-UAT.md` (mandatory per `.github/copilot-instructions.md`)

### Wave 0 Gaps
- [ ] `tests/helpers/fakeReleaseServer.ts` — shared test fixture
- [ ] `tests/helpers/buildFakeAdapterTarball.ts` — generates synthetic tar.gz/zip from a tree, used by FakeReleaseServer
- [ ] `tests/adapters/provision/` — new test directory
- [ ] `tests/packaging/` — new test directory (gated by `DAP_CLI_RUN_PACKAGING=1`)
- [ ] `tests/architecture/moduleBoundaries.test.ts` — extend with "no shell-out to tar/unzip in src/" assertion
- [ ] No framework install needed (vitest is already configured).

---

## Sources

### Primary (HIGH confidence)
- npm registry: `tar@7.5.15`, `yauzl@3.3.1`, `proper-lockfile@4.1.2`, `prompts@2.4.2`, `@inquirer/prompts@8.4.3` (verified via `npm view`)
- npm download counts via `https://api.npmjs.org/downloads/point/last-week/<pkg>` (week of 2026-05-18)
- Existing codebase: [scripts/setup-adapters.ts](scripts/setup-adapters.ts), [src/adapters/builtins/*.ts](src/adapters/builtins/), [src/cli/errors.ts](src/cli/errors.ts), [src/config/paths.ts](src/config/paths.ts), [src/testing/tempEnv.ts](src/testing/tempEnv.ts), [src/cli/program.ts](src/cli/program.ts) — all directly read

### Secondary (MEDIUM confidence)
- Node 22 `fetch` proxy behavior — based on undici docs / well-known Node behavior (env var not auto-honored)
- GitHub rate-limit response shape — based on GitHub API docs; exact field names should be re-verified at implementation time
- debugpy 1.8.20 Python 3.8+ requirement — from PyPI / debugpy README

---

## Metadata

**Confidence breakdown:**
- Archive extraction (tar/yauzl): HIGH — verified packages, sketch code
- Lockfile (proper-lockfile): HIGH — verified package, established pattern
- HTTP/proxy: MEDIUM-HIGH — undici ProxyAgent is the documented approach but implementer should test against a real proxy
- Checksum approach: MEDIUM — recommendation is sound but actual SHA-256 values must be generated at implementation
- Consent prompt: HIGH — readline/promises is stable Node API
- Atomic install: HIGH — standard staging + rename pattern
- debugpy venv: HIGH — pattern is already working in scripts/setup-adapters.ts
- Delve platform matrix: HIGH — directly verified against working code
- Pre-publish check: HIGH — straightforward npm pack inspection
- Testing strategy: HIGH — FakeReleaseServer pattern is standard

**Research date:** 2026-05-25
**Valid until:** 2026-06-25 (stable ecosystem, slow-moving)

## RESEARCH COMPLETE
