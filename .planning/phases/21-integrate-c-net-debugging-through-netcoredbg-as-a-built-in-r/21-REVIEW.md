---
phase: 21-integrate-c-net-debugging-through-netcoredbg-as-a-built-in-r
reviewed: 2026-05-23T00:00:00Z
depth: standard
files_reviewed: 24
files_reviewed_list:
  - dap-cli/skills/dap-cli/SKILL.md
  - dap-cli/skills/dap-cli/references/csharp-netcoredbg.md
  - docs/adapter-setup.md
  - scripts/setup-adapters.ts
  - src/adapters/builtins/netCoreDbg.ts
  - src/adapters/registry.ts
  - src/config/launchConfig.ts
  - src/config/programInference.ts
  - src/controller/ipc.ts
  - tests/adapters/delve.test.ts
  - tests/adapters/netCoreDbg.test.ts
  - tests/config/programInference.test.ts
  - tests/controller/controllerIpc.test.ts
  - tests/fixtures/simple-csharp-app/Program.cs
  - tests/fixtures/simple-csharp-app/simple-csharp-app.csproj
  - tests/fixtures/simple-csharp-attach/Program.cs
  - tests/fixtures/simple-csharp-attach/simple-csharp-attach.csproj
  - tests/fixtures/simple-csharp-short-lived/Program.cs
  - tests/fixtures/simple-csharp-short-lived/simple-csharp-short-lived.csproj
  - tests/integration/docsValidation.test.ts
  - tests/integration/launchAttachAutoRoute.test.ts
  - tests/integration/launchInference.test.ts
  - tests/integration/netCoreDbgAdapter.test.ts
  - tests/integration/setupAdapters.test.ts
findings:
  critical: 2
  warning: 2
  info: 0
  total: 4
status: findings
---

# Phase 21: Code Review Report

**Reviewed:** 2026-05-23T00:00:00Z  
**Depth:** standard  
**Files Reviewed:** 24  
**Status:** findings

## Summary

Reviewed NetCoreDbg setup, descriptor registration, launch inference/config handling, controller IPC fallback, C# fixtures, integration tests, and documentation. The implementation has several high-signal issues around setup security/correctness and test reliability.

## Critical Issues

### CR-01:  Predictable archive path in shared temp directory can overwrite arbitrary files via symlinkBLOCKER 

**File:** `scripts/setup-adapters.ts:210-213`

**Issue:** NetCoreDbg archives are written to a predictable path in the shared OS temp directory:

```ts
const archivePath = path.join(tmpdir(), asset.archiveName);
...
await fs.writeFile(archivePath, archiveBytes);
```

Because the filename is fixed, a local attacker or stale symlink at `/tmp/netcoredbg-linux-amd64.tar.gz` / equivalent can cause `writeFile` to follow the symlink and overwrite another file writable by the user. This is a setup-time data loss/security risk. The same pattern also exists for other adapters, but the reviewed NetCoreDbg path is directly affected.

**Fix:**

Create a private temporary directory with `fs.mkdtemp`, write the archive inside it, and remove it afterward:

```ts
const tempDir = await fs.mkdtemp(path.join(tmpdir(), 'dap-cli-netcoredbg-'));
try {
  const archivePath = path.join(tempDir, asset.archiveName);
  await fs.writeFile(archivePath, archiveBytes, { flag: 'wx' });
  extractNetCoreDbgArchive(asset, archivePath, netCoreDbgDir);
} finally {
  await fs.rm(tempDir, { recursive: true, force: true });
}
```

### CR-02:  Windows NetCoreDbg setup advertises a supported asset but extraction depends on `unzip`BLOCKER 

**File:** `scripts/setup-adapters.ts:278-283`, `scripts/setup-adapters.ts:304-308`

**Issue:** `resolveNetCoreDbgAsset` declares `win32/x64` support with `netcoredbg-win64.zip`, but extraction always shells out to `unzip` for zip archives:

```ts
const extraction = asset.archiveKind === 'zip'
  ? spawnSync('unzip', ['-q', archivePath, '-d', netCoreDbgDir], { encoding: 'utf8' })
  : spawnSync('tar', ['xzf', archivePath, '-C', netCoreDbgDir], { encoding: 'utf8' });
```

A clean Windows environment does not reliably provide an `unzip` executable, so the built-in setup path can fail on a platform the code explicitly claims to support.

**Fix:** Use a cross-platform zip extraction path, or dispatch to a Windows-native extractor:

```ts
if (asset.archiveKind === 'zip' && process.platform === 'win32') {
  const extraction = spawnSync('powershell.exe', [
    '-NoProfile',
    '-Command',
    'Expand-Archive',
    '-LiteralPath', archivePath,
    '-DestinationPath', netCoreDbgDir,
    '-Force',
  ], { encoding: 'utf8' });
  ...
}
```

Preferably avoid shelling out and use a vetted zip library with path traversal protections.

## Warnings

### WR-01:  Unix socket path fallback uses string length instead of byte lengthWARNING 

**File:** `src/controller/ipc.ts:156-158`

**Issue:** Long Unix socket fallback is based on JavaScript string length:

```ts
if (socketPath.length > maxUnixSocketPathLength) {
  return { kind: 'tcp', host: '127.0.0.1', port: 0 };
}
```

Unix socket limits are byte limits. A path containing multi-byte characters can have `socketPath.length <= 100` but exceed the OS byte limit, causing `server.listen(socketPath)` to fail instead of falling back to TCP.

**Fix:**

```ts
if (Buffer.byteLength(socketPath, 'utf8') > maxUnixSocketPathLength) {
  return { kind: 'tcp', host: '127.0.0.1', port: 0 };
}
```

### WR-02:  NetCoreDbg integration smoke says PATH/cache but only checks PATHWARNING 

**File:** `tests/integration/netCoreDbgAdapter.test.ts:249-261`

**Issue:** The test helper reports cache support in its failure message:

```ts
throw new Error('BLOCKED: netcoredbg is unavailable on PATH/cache; real NetCoreDbg launch coverage cannot be claimed.');
```

But the check only runs:

```ts
const result = spawnSync('netcoredbg', ['--version'], { encoding: 'utf8' });
```

This blocks real smoke coverage when NetCoreDbg has been provisioned into `DAP_CLI_HOME/adapters/netcoredbg`, which is a supported runtime path used by `createNetCoreDbgDescriptor`.

**Fix:** Resolve through the same descriptor path as production, or explicitly check the provisioned cache location before failing:

```ts
const descriptor = createNetCoreDbgDescriptor();
if (descriptor.transport.kind !== 'stdio') {
  throw new Error('Expected stdio NetCoreDbg descriptor.');
}
const result = spawnSync(descriptor.transport.command, ['--version'], { encoding: 'utf8' });
```

---

_Reviewed: 2026-05-23T00:00:00Z_  
_Reviewer: the agent (gsd-code-reviewer)_  
_Depth: standard_
