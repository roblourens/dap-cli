---
phase: 21-lazy-runtime-provisioning-of-built-in-adapters-js-debug-debu
reviewed: 2026-05-25T00:00:00Z
depth: standard
files_reviewed: 16
files_reviewed_list:
  - src/adapters/provision/index.ts
  - src/adapters/provision/types.ts
  - src/adapters/provision/jsDebug.ts
  - src/adapters/provision/debugpy.ts
  - src/adapters/provision/delve.ts
  - src/adapters/provision/lock.ts
  - src/adapters/provision/atomicInstall.ts
  - src/adapters/provision/http.ts
  - src/adapters/provision/extractTarGz.ts
  - src/adapters/provision/extractZip.ts
  - src/adapters/provision/checksums.ts
  - src/adapters/provision/consent.ts
  - src/adapters/builtins/jsDebug.ts
  - src/adapters/builtins/debugpy.ts
  - src/adapters/builtins/delve.ts
  - src/cli/confirm.ts
  - src/cli/commands/setupAdapters.ts
  - src/cli/errors.ts
  - src/config/paths.ts
findings:
  critical: 0
  warning: 3
  info: 6
  total: 9
status: issues_found
---

# Phase 21: Code Review Report

**Reviewed:** 2026-05-25
**Depth:** standard
**Files Reviewed:** 16 (src/ scope per phase plan SUMMARYs)
**Status:** issues_found (3 Warnings, 6 Info — no Critical; phase is shippable, advisory cleanup recommended)

## Summary

Phase 21 lands the lazy runtime provisioner across three adapters (js-debug, debugpy, delve) plus the `setup-adapters` subcommand. The implementation is well-factored: a per-adapter provisioner orchestrates a stable shape (consent check → confirm → lock → double-check → atomicInstall(populate=download+verify+extract) → write consent marker), with shared primitives for HTTPS download, proxy handling, archive extraction, lockfile serialization, and atomic staging. The error-envelope work from 21-04 surfaces in every failure site as a `provision_*` code with structured diagnostics, and credential sanitization in [src/adapters/provision/http.ts](src/adapters/provision/http.ts) is defense-in-depth correct.

No Critical findings. The three Warnings cluster around defense-in-depth gaps that the per-plan loops did not catch:

1. `extractTarGz.ts` lacks the explicit symlink rejection that D-10/D-11 requires (and that `extractZip.ts` already implements).
2. `delve.ts` reads the entire archive into a Buffer for the SHA-256 (memory-bounded by the ~10MB archive today but inconsistent with the streaming hash in `jsDebug.ts`).
3. `http.ts` registers the optional `onProgress` `data` listener before `pipeline()` subscribes — fragile under future use; currently no caller passes `onProgress`, so it's latent.

The Info findings cover minor consistency issues (order of checksum lookup vs cache check between adapters, undisclosed PyPI fetch in the debugpy confirm copy, etc.) and are safe to defer.

## Warnings

### WR-01: extractTarGz does not reject symlink entries (D-11 defense-in-depth gap)

**File:** [src/adapters/provision/extractTarGz.ts:10-26](src/adapters/provision/extractTarGz.ts#L10-L26)

**Issue:** D-10/D-11 in [21-CONTEXT.md](.planning/phases/21-lazy-runtime-provisioning-of-built-in-adapters-js-debug-debu/21-CONTEXT.md) explicitly requires in-process extraction with "zip-slip and symlink rejection" for both archive formats. `extractZip.ts` implements an explicit `isSymlinkEntry` guard (POSIX mode `0o120000` on external attrs) and the test suite verifies it ([tests/adapters/provision/extract.test.ts:233](tests/adapters/provision/extract.test.ts#L233)). `extractTarGz.ts` relies entirely on `tar.x({ strict: true, ... })`, which only escalates *warnings* to errors. The `tar` package's defaults reject zip-slip paths (paths containing `..` or absolute paths, via the default `preservePaths: false`), so the zip-slip half of D-11 is implicitly covered — but the package *does* extract symlink entries by default, and there is no test asserting otherwise for tar.gz. A malicious or compromised js-debug / delve release archive containing a symlink pointing outside the staging dir would land that symlink on disk.

This is defense-in-depth, not a known exploit: today both archives go through SHA-256 checksum verification before extraction (`jsDebug.ts:107-127`, `delve.ts:142-162`), so a tampered archive would be caught upstream. But the SHA verification is the *only* line of defense — losing it (e.g., a future contributor adds an unpinned adapter or the checksum table drifts) re-exposes the symlink class entirely.

**Fix:** Use the `tar` package's `filter` option to reject symlink/hardlink entries explicitly, mirroring `extractZip.ts`:

```ts
const extract = tar.x({
  cwd: destDir,
  strict: true,
  strip: options.strip ?? 0,
  filter: (_path, entry) => {
    if (entry.type === 'SymbolicLink' || entry.type === 'Link') {
      throw usageError('Archive contains unsafe entry path.', {
        code: 'provision_extract_failed',
        diagnostics: [`Entry: ${entry.path}`, `Archive: ${archivePath}`, `Type: ${entry.type}`],
        data: { archivePath, entry: entry.path, entryType: entry.type },
      });
    }
    return true;
  },
});
```

Add a matching `tests/adapters/provision/extract.test.ts` case that builds a tar.gz containing a symlink and asserts `provision_extract_failed`.

### WR-02: delve.ts SHA-256 buffers entire archive (inconsistent with jsDebug.ts streaming hash)

**File:** [src/adapters/provision/delve.ts:78-81](src/adapters/provision/delve.ts#L78-L81)

**Issue:** `computeSha256` in `delve.ts` reads the full archive into memory via `fs.readFile(filePath)` before hashing:

```ts
async function computeSha256(filePath: string): Promise<string> {
  const buffer = await fs.readFile(filePath);
  return createHash('sha256').update(buffer).digest('hex');
}
```

`jsDebug.ts:31-39` already implements the streaming form correctly with `createReadStream` + incremental `hash.update(chunk)`. For today's delve archive (~10MB) this is harmless, but it is (a) inconsistent with the sibling provisioner and (b) a latent ceiling if a future adapter ships a larger archive (e.g., debug-symbol-laden builds). The streaming version uses bounded memory regardless of archive size.

**Fix:** Replace `computeSha256` with the streaming form from `jsDebug.ts` (or, better, lift `fileSha256` from `jsDebug.ts` into a shared helper in `src/adapters/provision/checksums.ts` or a new `hash.ts` and call it from both provisioners). The shared helper would also keep the two provisioners in lockstep for future hash algorithm changes.

### WR-03: http.ts onProgress listener races pipeline subscription

**File:** [src/adapters/provision/http.ts:209-218](src/adapters/provision/http.ts#L209-L218)

**Issue:**

```ts
const body = Readable.fromWeb(response.body as Parameters<typeof Readable.fromWeb>[0]);
if (onProgress !== undefined) {
  body.on('data', (chunk: Buffer | string) => {
    bytesRead += typeof chunk === 'string' ? Buffer.byteLength(chunk) : chunk.length;
    onProgress(bytesRead, total);
  });
}

try {
  await pipeline(body, createWriteStream(options.destPath));
}
```

Attaching a `'data'` listener to a Node `Readable` switches the stream into flowing mode immediately. In flowing mode, chunks are emitted as soon as I/O delivers them. `pipeline()` then subscribes the write stream as a second consumer. In practice the I/O tick happens *after* both subscriptions are in place (so no chunks are lost today), but the ordering is fragile — any future change that yields between the `body.on('data', ...)` registration and the `pipeline()` call (e.g., adding an `await` to compute headers, or wrapping the listener in something async) would drop bytes silently and the write stream would receive a truncated download. The truncated file would then fail SHA-256 verification, which is a noisy enough failure mode that this is latent rather than active.

Currently no call site passes `onProgress` (the provisioners call `downloadToFile({ url, destPath, env })` only), so this is dead-code latent risk, not a present-day bug. Flagged because the safe pattern is essentially free.

**Fix:** Use a `Transform` (or `PassThrough` with `'data'`) inside the `pipeline()` so the progress callback is part of the pipeline rather than a side-channel listener:

```ts
const progress = new Transform({
  transform(chunk: Buffer, _enc, cb) {
    bytesRead += chunk.length;
    onProgress?.(bytesRead, total);
    cb(null, chunk);
  },
});
await pipeline(body, progress, createWriteStream(options.destPath));
```

This makes the listener part of the data path, eliminating the race entirely.

## Info

### IN-01: delve.ts checksum lookup precedes cache check (inconsistent with jsDebug.ts)

**File:** [src/adapters/provision/delve.ts:88-105](src/adapters/provision/delve.ts#L88-L105)

**Issue:** `provisionDelve` looks up the checksum *before* checking the consent marker / cache. If a future code change ever drops a platform from `DELVE_CHECKSUMS` while a user has an old cached install for that platform, the cached path would throw `provision_checksum_mismatch` even though the cached binary is fine. `jsDebug.ts` does this in the opposite (correct) order: cache check first, checksum lookup second. Today both adapters have full coverage in `checksums.ts`, so this is a code-shape inconsistency rather than a live bug.

**Fix:** Reorder `provisionDelve` to check the consent marker / entrypoint existence first, then look up `expectedSha` only on cache miss. Matches `jsDebug.ts:51-69`.

### IN-02: debugpy confirm prompt does not mention PyPI network fetch

**File:** [src/adapters/provision/debugpy.ts:59-67](src/adapters/provision/debugpy.ts#L59-L67)

**Issue:** The confirm copy for debugpy says "Requires python3 (>=3.8) on PATH" and "Creates an isolated venv and pip-installs debugpy" — both true, but the user does not see that pip will hit PyPI. By contrast, the js-debug prompt explicitly names the source URL (`details: [\`Source: ${url}\`]`) and the delve prompt names the GitHub release asset. D-03 says "clear summary of what will be downloaded ... source URL". For debugpy that source is PyPI (or `PIP_INDEX_URL` if overridden).

**Fix:** Add `'Downloads debugpy from PyPI (https://pypi.org/) via pip.'` to the `details` array. If `env.PIP_INDEX_URL` is set, surface that too so corporate mirrors are visible.

### IN-03: delve.ts archive cleanup happens outside try block scope

**File:** [src/adapters/provision/delve.ts:128-188](src/adapters/provision/delve.ts#L128-L188)

**Issue:** `archivePath` is declared before the `try` and cleaned in the matching `finally`. If `fs.mkdir(adaptersDir, { recursive: true })` or `downloadToFile` throws before the archive file is created, the `finally` calls `fs.rm(archivePath, { force: true })` on a path that never existed. `{ force: true }` makes this a no-op (no error), so this is correct in practice, just slightly noisy in spirit. `jsDebug.ts` wraps cleanup tightly around just the download + extract path; `delve.ts` is broader.

**Fix:** Optional. Move the `archivePath` cleanup into a `finally` that only spans the download step (after `archivePath` is first used), matching `jsDebug.ts:103-141`. Low priority.

### IN-04: atomicInstall.ts brief rm→rename window relies on caller lock discipline

**File:** [src/adapters/provision/atomicInstall.ts:88-96](src/adapters/provision/atomicInstall.ts#L88-L96)

**Issue:** Between `fs.rm(canonical, ...)` and `fs.rename(staging, canonical)` there is a window where the canonical directory does not exist. The function comment correctly states "Caller is responsible for holding the adapter install lock before invoking this" and every call site does so. The window is invisible to *write* paths (they all serialize on the same lockfile), but *read* paths (e.g., a parallel `dap-cli launch` that hits `pathExists(provisionedEntrypoint)` in `builtins/jsDebug.ts`) can observe a transient false. Today the readers fall through to lazy provisioning, which would then block on the lock and re-check after acquisition — so the system self-corrects.

`fs.rename` over a populated directory is unreliable on Windows (and explicitly disallowed for non-empty dirs on some FS configurations), which is why rm-first is necessary. The right-but-noisier alternative is `rename(canonical, .old.<pid>) → rename(staging, canonical) → rm(.old)`, which preserves an old-installation atomic swap but adds complexity. Not worth refactoring.

**Fix:** None recommended. Worth a one-line comment in `atomicInstall.ts` documenting that readers may briefly observe a missing canonical dir and that the consent-marker re-check inside `withAdapterLock` is the correctness mechanism that closes the loop.

### IN-05: consent.ts marker write does not fsync

**File:** [src/adapters/provision/consent.ts:18-22](src/adapters/provision/consent.ts#L18-L22)

**Issue:** `writeConsentMarker` writes the marker file with `fs.writeFile` (no fsync). If the machine crashes between writing the marker and the OS flushing, on next boot the marker may be missing even though the install directory was renamed into place (also unflushed, but `fs.rename` is more likely to be metadata-journaled and survive). The result is a re-prompt on next launch, which is harmless and arguably correct ("if we're not sure consent was recorded, re-ask"). Not worth fixing.

**Fix:** None. Documenting for completeness.

### IN-06: setupAdapters.ts error path falls back to `'internal_error'` for non-CliError throws

**File:** [src/cli/commands/setupAdapters.ts:131-149](src/cli/commands/setupAdapters.ts#L131-L149)

**Issue:** When `provisionAdapter` throws a non-`CliError` (which shouldn't happen given the error-envelope work in 21-04, but defensively...), the catch block records `code: 'internal_error'` and uses `err.message` as both the message and the sole diagnostic. This is fine, but the outer aggregator then re-throws `provision_setup_failed` with `data: { adapters: result.adapters }`, so the underlying `internal_error` detail is preserved in `data` rather than in the outer diagnostics. Operators reading JSON output will find it; humans reading the formatted message will see `Adapter setup failed for: <id> (internal_error)` and not much else.

**Fix:** Optional. Include the first 1-2 inner-error diagnostics in the outer `usageError`'s `diagnostics` array for human-readable surfaces. Low priority.

---

_Reviewed: 2026-05-25_
_Reviewer: gsd-code-reviewer (phase-level coherence pass; per-plan loops already executed)_
_Depth: standard_
