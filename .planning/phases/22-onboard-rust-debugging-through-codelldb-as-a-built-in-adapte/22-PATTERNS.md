# Phase 22: Rust / CodeLLDB Built-In Onboarding - Pattern Map

**Mapped:** 2026-05-28
**Inputs:** `22-CONTEXT.md`, `22-RESEARCH.md`, `22-VALIDATION.md`, `22-ADAPTER-SELECTION.md`, `22-LANGUAGE-ONBOARDING-PRD.md`, `22-SCENARIOS.md`, Phase 20 Go/Delve evidence artifacts, and Phase 21 lazy-provisioning verification/research.
**Files/artifacts classified:** 34 likely new or modified deliverables, including conditional attach and configuration-boundary surfaces.
**Core gate:** No descriptor, provisioner, checksum-table, registry, or setup-adapters product implementation may begin until R-00 and R-01 have recorded passing evidence.

## Planning Boundary: Evidence Before Product Code

Phase 22 differs from the completed Delve onboarding in its native payload boundary. Delve remains the product analog; CodeLLDB product work is now authorized only through the passed released-artifact evidence and its direct official-source local-cache scope.

| Gate | Required output before later implementation | Blocks |
| --- | --- | --- |
| R-00: artifact provenance, licenses, checksums, cache disposition | Phase-owned evidence recording official supported VSIX asset names/digests, complete retained runtime layout, notices/license/provenance conclusion, and allowed platform matrix | `src/adapters/provision/codelldb.ts`, checksum constants, setup-adapters exposure, packaging claims |
| R-01: direct DAP and listener behavior | Phase-owned owned-Rust-binary transcript proving direct CodeLLDB DAP use plus live socket observation proving loopback-only bind with the exact future descriptor invocation | `src/adapters/builtins/codelldb.ts`, registry exposure, all real-adapter product tests |

**Source contract:** `22-CONTEXT.md` lines 27-35 and `22-VALIDATION.md` lines 35-38, 49-52, 58-59. The Phase 22 planner must place R-00/R-01 in a first evidence-only plan and must not schedule gated source edits in parallel.

## File Classification

### Gate And Evidence Artifacts

| New/Modified File or Artifact | Role | Data Flow | Closest Analog | Match Quality |
| --- | --- | --- | --- | --- |
| `22-RESULTS.md` or a dedicated R-00/R-01 gate-results artifact | evidence artifact | batch / file-I/O | `20-EXTERNAL-PROJECT-RESULTS.md` grouped evidence records; `20-RESULTS.md` append-only reruns | role-match; new gate content |
| Phase-owned owned Rust gate target in `tmp/` | scratch fixture | request-response / process execution | `tests/fixtures/simple-go-app/**` concept only | role-match; intentionally not product source in Wave 1 |
| `22-SCENARIOS.md` (finalized after proved behavior) | evidence artifact | batch | `20-SCENARIOS.md` | exact format |
| `22-EXTERNAL-PROJECT-CANDIDATES.md` | evidence artifact | batch / file-I/O | `20-EXTERNAL-PROJECT-CANDIDATES.md` | exact format with Rust safety expansion |
| `22-EXTERNAL-PROJECT-RESULTS.md` | evidence artifact | batch / event-driven | `20-EXTERNAL-PROJECT-RESULTS.md` | exact format with Rust command boundaries |
| `22-RESULTS.md` fresh-agent sections | evidence artifact | batch / transcript audit | `20-RESULTS.md` | exact append-only result/rerun format |
| `22-HARDENING-GAPS.md` | evidence artifact | batch / transform | `20-HARDENING-GAPS.md` | exact classification/closure format |
| `22-UAT.md` | evidence artifact | batch / real CLI smoke | `20-UAT.md` under `## Hand-Driven CLI Smoke` | exact mandatory closure format |

### Product And Configuration Surfaces After Gate Pass

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
| --- | --- | --- | --- | --- |
| `src/adapters/builtins/codelldb.ts` | provider | request-response / spawned server | `src/adapters/builtins/delve.ts` | exact role and transport, gated invocation |
| `src/adapters/registry.ts` | provider | request-response | existing `delve` registration in the same file | exact extension point |
| `src/adapters/provision/codelldb.ts` | service | network + file-I/O + atomic cache | `src/adapters/provision/jsDebug.ts`, `src/adapters/provision/delve.ts`, `src/adapters/provision/extractZip.ts` | exact composition, new payload layout |
| `src/adapters/provision/types.ts` | model | transform | existing `AdapterId` union | exact local edit |
| `src/adapters/provision/index.ts` | service dispatcher | request-response | existing `delve` switch arm | exact local edit |
| `src/adapters/provision/checksums.ts` | config | batch lookup | `DELVE_CHECKSUMS` | exact structure only after R-00 |
| `src/cli/commands/setupAdapters.ts` | command/controller | batch / file-I/O | current `delve` entry, pending classification and consolidated prompt | exact local edit only after R-00 |
| `scripts/dev/regen-checksums.ts` | maintainer utility | network / transform | existing Delve asset list and printed assignments | role-match; gated asset list |
| `src/config/launchConfig.ts` | config | transform | `go: 'delve'` type mapping and pass-through field preservation | exact map addition; CodeLLDB-specific boundary |
| `src/config/programInference.ts` | config | transform | existing extension table and default-type logic | inverse/negative pattern: test absence of `.rs` |
| `src/cli/commands/dapCore.ts` for raw `cargo` typed rejection before native forwarding | controller | transform / request-response | Delve-specific `mapConfigForAdapter` dispatch | required; no direct Cargo analog |

### Product Verification And Documentation After Gate Pass

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
| --- | --- | --- | --- | --- |
| `tests/adapters/codelldb.test.ts` | test | request-response | `tests/adapters/delve.test.ts` | exact transport test after R-01 |
| `tests/adapters/registry.test.ts` | test | request-response | existing `includes delve as a lazy built-in adapter` test | exact local edit |
| `tests/adapters/provision/codelldb.test.ts` | test | network + file-I/O | `tests/adapters/provision/delve.test.ts` plus ZIP extraction tests | exact composition |
| `tests/helpers/buildFakeAdapterTarball.ts` | test utility | file-I/O / archive generation | synthetic js-debug tree plus stored ZIP builder | exact composition for nested VSIX fixture |
| `tests/helpers/fakeReleaseServer.ts` | test utility | request-response | `delveArchiveHandler` | exact extension for VSIX URL |
| `tests/cli/setupAdaptersCommand.test.ts` | test | batch / request-response | current Delve setup status/partial failure assertions | exact local edit |
| `tests/architecture/moduleBoundaries.test.ts` | test | file-I/O / validation | D-10/D-11/D-21 checks | exact extension to CodeLLDB checksums |
| `tests/packaging/publishedTarball.test.ts`, `tests/packaging/npxCache.test.ts` | test | package / process / cache | Phase 21 provisioner and cache shipping gates | role-match if CodeLLDB packaging behavior needs direct proof |
| `tests/config/launchConfig.test.ts` | test | transform | Go type/field retention tests | exact local addition with Rust fields/Cargo boundary |
| `tests/config/programInference.test.ts` | test | transform | `.go` inference test and unsupported extension test | inverse/negative pattern for `.rs` |
| `tests/integration/codelldbAdapter.test.ts` | test | request-response / event-driven | `tests/integration/delveAdapter.test.ts` | exact DAP sequence, runtime-specific args |
| `tests/fixtures/simple-rust-app/**` | fixture | process / stopped-state | `tests/fixtures/simple-go-app/**` | role-match, explicit compiled output |
| `tests/fixtures/simple-rust-attach/**` if safe attach is proved | fixture | event-driven / PID lifecycle | `tests/fixtures/simple-go-attach/**` | conditional role-match; CodeLLDB uses `pid` |
| `docs/adapter-setup.md` | docs | reference / transform | existing setup/provisioning and Delve troubleshooting sections | exact documentation location |
| `dap-cli/skills/dap-cli/references/rust-codelldb.md` | docs | agent workflow / request-response | `dap-cli/skills/dap-cli/references/go-delve.md` | exact role with different configuration limits |
| `dap-cli/skills/dap-cli/SKILL.md` | docs index | reference | existing Go reference link pattern | exact local edit |
| `tests/integration/docsValidation.test.ts` | test | file-I/O / validation | Phase 20 Go/Delve docs block | exact local edit |

## Pattern Assignments

### Wave 1: `22-RESULTS.md` R-00/R-01 Evidence (artifact, batch/file-I-O)

**Analog:** `20-EXTERNAL-PROJECT-RESULTS.md` lines 7-77 for exact evidence records, combined with the append-only truth pattern in `20-RESULTS.md` lines 7-157.

**Copy the grouped-record discipline, not the Go content:**

```text
attempt_id: GO-EXT-02
repo_url: https://github.com/google/go-cmp
result: pass
commit_sha: 34c9473539b8d7c62273a8f4acb27c0c32295330
scenario_class: package test debugging through Delve `mode: "test"`
debug_config: {...}
breakpoint: `cmp/compare.go:96`
exact_commands: ...
evidence: ...
product_docs_gap: ...
cleanup_verified: true
```

**Phase 22 assignment:** R-00 and R-01 records need standalone `result: pass|fail|blocked`, exact commands/evidence paths, cleanup status, and a product-implementation disposition. R-00 must state the supported platform assets, SHA-256 values, extracted entrypoint/runtime layout, notices/licenses, bundled native/runtime provenance, and cache/distribution conclusion. R-01 must state the released artifact invocation, owned Rust target, DAP stop/inspection/cleanup evidence, and observed listening address.

**Hard stop:** Unlike later external attempts, either R-00 or R-01 being `fail` or `blocked` prevents all product surfaces listed below from being implemented. This is the primary planning dependency, not a documentation follow-up.

---

### `src/adapters/builtins/codelldb.ts` and `tests/adapters/codelldb.test.ts` (provider/test, spawned server)

**Analog:** `src/adapters/builtins/delve.ts` lines 10-25 and `tests/adapters/delve.test.ts` lines 7-21.

**Descriptor pattern to copy only after R-01 passes:**

```typescript
export async function createDelveDescriptor(delvePath?: string): Promise<AdapterDescriptor> {
  const resolvedDelvePath = delvePath ?? (await resolveDefaultDelvePath());
  assertSupportedProvisionedDelveToolchain(resolvedDelvePath);
  const toolchainEnvironment = createGoToolchainEnvironment();

  return {
    id: 'delve',
    label: 'Go Debug Adapter (Delve)',
    transport: {
      kind: 'server',
      command: resolvedDelvePath,
      args: ['dap', '--listen=127.0.0.1:${port}'],
      host: '127.0.0.1',
      ...(toolchainEnvironment === undefined ? {} : { env: toolchainEnvironment }),
    },
  };
}
```

**Test pattern to copy:**

```typescript
test('creates a localhost-only Delve DAP server descriptor', async () => {
  const descriptor = await createDelveDescriptor('/tmp/dlv');

  expect(descriptor).toEqual({
    id: 'delve',
    label: 'Go Debug Adapter (Delve)',
    transport: {
      kind: 'server',
      command: '/tmp/dlv',
      args: ['dap', '--listen=127.0.0.1:${port}'],
      host: '127.0.0.1',
    },
  });
});
```

**CodeLLDB adaptation:** The command path and arguments must be copied from the recorded released-artifact R-01 transcript, not inferred from tagged source or a planning sketch. The descriptor may use `kind: 'server'` and `host: '127.0.0.1'` only after the exact invocation is shown live to listen solely on loopback.

**Supporting server lifecycle source:** `src/adapters/socketAdapter.ts` lines 37-94 allocates a localhost port, substitutes `${port}`, spawns without a shell, logs stderr, retries connection, and terminates the owned adapter on close/failure. CodeLLDB should feed that existing lifecycle rather than introduce a separate server runner.

**Pitfalls:**

- Source-level evidence that CodeLLDB uses `Ipv4Addr::LOCALHOST` is a probe rationale, not a passed R-01 socket gate.
- Do not model remote or wildcard listener variants; those are outside Phase 22.
- Do not copy Delve's Go toolchain check or its PATH preference unless CodeLLDB evidence identifies an equivalent required local-override contract.

---

### `src/adapters/registry.ts` (provider, request-response)

**Analog:** `src/adapters/registry.ts` lines 35-52 and 67-80.

```typescript
this.builtInAdapters.set('delve', {
  id: 'delve',
  label: 'Go Debug Adapter (Delve)',
  create: () => createDelveDescriptor(),
});

public async resolve(id: string): Promise<AdapterDescriptor> {
  const builtInAdapter = this.builtInAdapters.get(id);
  if (builtInAdapter !== undefined) {
    return builtInAdapter.create();
  }
  // ...custom adapter and adapter_not_found handling...
}
```

**CodeLLDB adaptation:** Add `codelldb` as another lazy built-in factory only after the descriptor and provision path are allowed by R-00/R-01. Mirror `tests/adapters/registry.test.ts` lines 55-65 so listing a built-in does not resolve or download it.

---

### `src/adapters/provision/codelldb.ts` (service, network/file-I/O/atomic cache)

**Primary analogs:**

- `src/adapters/provision/delve.ts` lines 34-68, 85-195 for platform selection, pinned digest, consent, lock, download, validation, install, and marker.
- `src/adapters/provision/jsDebug.ts` lines 15-48, 51-157 for a payload with multiple required entrypoints rather than one executable.
- `src/adapters/provision/extractZip.ts` lines 9-107 and `src/adapters/provision/atomicInstall.ts` lines 45-101 for safe ZIP extraction and canonical install promotion.

**Platform/checksum/consent/lock skeleton from Delve** (lines 85-181):

```typescript
export async function provisionDelve(ctx: ProvisionContext): Promise<ProvisionResult> {
  const { env, assumeYes, adaptersDir, stdin, stderr } = ctx;
  const asset = resolveDelveAsset(env);
  const installRoot = path.join(adaptersDir, 'delve');
  const entrypoint = path.join(installRoot, asset.executableName);

  const expectedSha = DELVE_CHECKSUMS[DELVE_VERSION]?.[asset.platformKey];
  if (expectedSha === undefined) {
    throw usageError(`No pinned SHA-256 for delve ${DELVE_VERSION} on ${asset.platformKey}.`, {
      code: 'provision_checksum_mismatch',
      diagnostics: [/* ... */],
      data: { adapterId: 'delve', version: DELVE_VERSION, platform: asset.platformKey },
    });
  }

  if ((await hasConsentMarker(adaptersDir, 'delve', DELVE_VERSION)) && (await exists(entrypoint))) {
    return { adapterId: 'delve', version: DELVE_VERSION, installRoot, entrypoint, fromCache: true };
  }

  await confirm({ assumeYes, question: `Install delve ${DELVE_VERSION} into ${installRoot}/ (~10MB)?`, /* ... */ });
  await withAdapterLock(adaptersDir, 'delve', async () => {
    // ...under-lock cache re-check, download and SHA-256 verification...
    await atomicInstall({
      adaptersDir,
      adapterId: 'delve',
      expectedEntrypoints: [asset.executableName],
      populate: async stagingDir => { /* extract verified archive */ },
    });
    await writeConsentMarker(adaptersDir, 'delve', DELVE_VERSION);
  });
  // ...ProvisionResult...
}
```

**Multi-entrypoint cache test from js-debug** (lines 15-48):

```typescript
const ENTRYPOINTS = ['src/dapDebugServer.js', 'src/bootloader.js'] as const;

async function entrypointsExist(installRoot: string): Promise<boolean> {
  for (const rel of ENTRYPOINTS) {
    try {
      await fs.access(path.join(installRoot, rel));
    } catch {
      return false;
    }
  }
  return true;
}
```

**Atomic promotion pattern** (`atomicInstall.ts` lines 66-101):

```typescript
export async function atomicInstall(options: AtomicInstallOptions): Promise<string> {
  // ...mkdir canonical parent and sibling staging dir...
  try {
    await populate(staging);
    await verifyEntrypoints(staging, expectedEntrypoints);
    await fs.rm(canonical, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    await fs.rename(staging, canonical);
    return canonical;
  } catch (error) {
    await fs.rm(staging, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }).catch(() => undefined);
    throw error;
  }
}
```

**Safe VSIX extraction pattern** (`extractZip.ts` lines 9-24, 46-78):

```typescript
function isUnsafeFileName(fileName: string): boolean {
  if (path.isAbsolute(fileName)) {
    return true;
  }
  if (/^[A-Za-z]:[\\/]/.test(fileName)) {
    return true;
  }
  return fileName.split(/[\\/]/).includes('..');
}

// During entry traversal:
if (isUnsafeFileName(entry.fileName) || isSymlinkEntry(entry)) {
  handleError(unsafeEntryError(archivePath, entry.fileName));
  return;
}
```

**CodeLLDB adaptation:** Use one validated platform VSIX matrix and install the entire required extracted tree. R-00 research already observed at least `extension/adapter/codelldb`, `extension/lldb/bin/lldb-server`, `extension/lldb/lib/liblldb.dylib`, bundled Python/scripts, and `extension/lang_support/rust.py`; the final expected entrypoint/runtime set belongs in the passed R-00 result and in synthetic-tree tests. Never reduce the cache to the adapter executable alone.

**Pitfalls:**

- Do not write any CodeLLDB checksum/support matrix before the R-00 notice/provenance/caching conclusion is accepted.
- Do not reimplement archive extraction or download/network/proxy/locking behavior; reuse the Phase 21 shared modules.
- Choose existing `provision_*` errors where accurate. Add a CodeLLDB-specific typed error only for a genuinely distinct proven condition.

---

### Provision Dispatcher, Types, Checksums, Setup Action, And Maintainer Tooling (service/config/command)

**Analogs:** `src/adapters/provision/types.ts` lines 4-20; `src/adapters/provision/index.ts` lines 1-17; `src/adapters/provision/checksums.ts` lines 7-28; `src/cli/commands/setupAdapters.ts` lines 17-23, 51-65, 81-153, 156-190; `scripts/dev/regen-checksums.ts` lines 1-77.

**Minimal union/dispatcher extension pattern:**

```typescript
export type AdapterId = 'js-debug' | 'debugpy' | 'delve';

export async function provisionAdapter(id: AdapterId, ctx: ProvisionContext): Promise<ProvisionResult> {
  switch (id) {
    case 'js-debug':
      return provisionJsDebug(ctx);
    case 'debugpy':
      return provisionDebugpy(ctx);
    case 'delve':
      return provisionDelve(ctx);
  }
}
```

**Setup aggregation pattern** (`setupAdapters.ts` lines 81-137):

```typescript
const targets: readonly AdapterId[] = opts.adapter !== undefined ? [opts.adapter] : ALL_ADAPTERS;
// Classify pending vs cached BEFORE the consolidated prompt.
const pending: AdapterId[] = [];
for (const id of targets) {
  const version = ADAPTER_VERSIONS[id];
  const cached =
    (await hasConsentMarker(adaptersDir, id, version)) &&
    (await pathExists(expectedEntrypoint(adaptersDir, id)));
  if (!cached) {
    pending.push(id);
  }
}
// ...one prompt, then provisionAdapter(id, { ...innerCtxBase, assumeYes: true })...
```

**CodeLLDB adaptation:** Only after R-00 add `codelldb` to the union, dispatcher, version/checksum source of record, setup selection/list/reporting, and checksum regeneration input. `expectedEntrypoint` must reflect the passed VSIX layout rather than a guessed executable path. If multiple runtime entries are necessary to recognize a healthy cache, consider using the provisioner's full-entrypoint validation rather than allowing setup reporting to claim cached from one insufficient file.

**Test analogs:** `tests/cli/setupAdaptersCommand.test.ts` lines 173-247 tests partial success and consolidated non-TTY prompt; `tests/architecture/moduleBoundaries.test.ts` lines 129-245 pins source ownership, in-process extraction, `provision_*` naming and real checksum values.

---

### `src/config/launchConfig.ts`, `src/config/programInference.ts`, And Conditional `src/cli/commands/dapCore.ts` (config/controller, transform)

**Analogs:** `src/config/launchConfig.ts` lines 51-59 and 231-240; `src/config/programInference.ts` lines 18-29, 31-65, 68-85; `src/cli/commands/dapCore.ts` lines 372-395; tests in `tests/config/launchConfig.test.ts` lines 39-45, 233-273 and `tests/config/programInference.test.ts` lines 50-55, 95-101, 126-137.

**Type-map pattern to copy:**

```typescript
export const launchConfigTypeMap: Record<string, string> = {
  node: 'js-debug',
  'pwa-node': 'js-debug',
  chrome: 'js-debug',
  'pwa-chrome': 'js-debug',
  python: 'debugpy',
  debugpy: 'debugpy',
  go: 'delve',
};
```

Add `lldb: 'codelldb'` after the gated adapter exists. Preserve ordinary launch JSON resolution of `program`, `cwd`, `args`, `env`, `sourceLanguages`, and source-map/source-related fields only where R-01 proves native CodeLLDB accepts them.

**The deliberate non-copy pattern:**

```typescript
const extensionTable: Record<string, { adapterId: string; type: string }> = {
  '.py': { adapterId: 'debugpy', type: 'python' },
  '.go': { adapterId: 'delve', type: 'go' },
  // JavaScript/TypeScript/browser entries...
};
```

Do **not** add `.rs` to this table. Instead extend `tests/config/programInference.test.ts` with a negative assertion that a raw `.rs` path continues to yield `adapter_inference_failed` unless the user supplies an explicit adapter/type/config and compiled binary. Rust source is not a directly launchable executable.

**Native Cargo boundary:** `22-RESEARCH.md` line 63 establishes that VS Code CodeLLDB resolves `cargo` in its extension layer before native DAP; standalone native launch arguments do not include `cargo`. Do not copy Go package/test normalization or preserve/forward raw `cargo` as a supported flow. Plan 22-06 must reject it through the existing `mapConfigForAdapter` dispatch in `dapCore.ts`, including when `program` is also present; any future Cargo resolver requires separate approval, proof, and tests.

**Pitfalls:**

- The Phase 22 context mentions `cargo` among fields to investigate; research narrows it to an unsupported direct-adapter boundary absent a new approved resolver. Plans must follow the researched native contract.
- CodeLLDB attach uses `pid` according to the official schema cited in research, not Delve's `processId`; do not copy Go attach configuration keys.

---

### `tests/adapters/provision/codelldb.test.ts` And Test Helpers (test, network/file-I-O)

**Analogs:** `tests/adapters/provision/delve.test.ts` lines 17-55, 81-223; `tests/helpers/buildFakeAdapterTarball.ts` lines 23-53 and 76-166; `tests/helpers/fakeReleaseServer.ts` lines 91-150; `tests/adapters/provision/extract.test.ts` lines 164-248; `tests/adapters/provision/concurrent.test.ts` lines 51-126.

**Provision test arrangement to copy from Delve:**

```typescript
const result = await provisionDelve({
  env: {
    DAP_CLI_PROVISION_RELEASE_BASE_URL: server.url,
    DAP_CLI_PROVISION_DELVE_PLATFORM_OVERRIDE: PLATFORM_KEY,
  },
  assumeYes: true,
  adaptersDir,
});

expect(result.fromCache).toBe(false);
expect(await fs.readFile(result.entrypoint, 'utf8')).toContain('fake-dlv');
await fs.access(path.join(adaptersDir, 'delve', `.consent-${DELVE_VERSION}`));
expect(server.hitCount()).toBe(1);
```

**CodeLLDB adaptation:** Add a synthetic stored-mode VSIX ZIP builder that carries the smallest proved CodeLLDB tree from R-00, for example nested `extension/adapter/...`, `extension/lldb/...`, scripts and Rust support entries as required. Tests should cover cold install, warm no-network cache, checksum mismatch with no canonical install, consent decline/non-TTY with no download, supported/unsupported assets, nested ZIP extraction, and concurrent single-download behavior.

**Archive security tests already reusable:** `extract.test.ts` rejects `../` paths, absolute paths, Windows drive paths, symlinks and corrupt ZIPs. A CodeLLDB provisioner should exercise this shared extractor rather than duplicate those path checks in its own file.

---

### `tests/integration/codelldbAdapter.test.ts` And Rust Fixtures (test/fixture, request-response/event-driven)

**Analog:** `tests/integration/delveAdapter.test.ts` lines 17-45, 67-159, 176-244, 334-343; fixture role analogs under `tests/fixtures/simple-go-app/` and `tests/fixtures/simple-go-attach/`.

**DAP smoke sequence to copy** (`delveAdapter.test.ts` lines 176-244):

```typescript
const descriptor = await new AdapterRegistry().resolve('delve');
if (descriptor.transport.kind !== 'server') {
  throw new Error('Expected Delve to use server transport.');
}
const adapter = await startServerSocketAdapter(descriptor.id, descriptor.transport, logDir);
const client = new DapClient(adapter.transport, { requestTimeoutMs: 60_000 });

const initialized = waitForEvent(client, 'initialized');
await client.request('initialize', { adapterID: 'go', /* standard DAP client fields */ });
const start = client.request(options.startRequest, options.startArgs);
await initialized;
const breakpoints = await client.request('setBreakpoints', { /* real source line */ });
expect(breakpoints.breakpoints[0]?.verified).toBe(true);
await client.request('configurationDone');
// wait for stopped -> stack -> scopes/variables -> optional evaluate
await client.request('continue', { threadId });
await client.request('disconnect', { terminateDebuggee: options.terminateDebuggeeOnDisconnect ?? true });
```

**CodeLLDB adaptation:** Build a minimal owned Rust binary with debug symbols explicitly, pass its executable `program` to native CodeLLDB, stop at a deterministic Rust source line, inspect stack and locals through scopes/variables, and attempt evaluate only as evidence permits. This is the direct product verification extension of R-01, not a raw Cargo or `.rs` launch.

**Attach assignment:** Only add an owned Rust attach scenario if live platform evidence says it can be run without weakening host policy. Use CodeLLDB's proved `pid` request shape and assert detach/survival/explicit final cleanup if that is the adapter contract; otherwise write the permitted platform-policy blocker to evidence rather than forcing a test.

**Pitfalls:**

- Treat scopes/variables as the stable inspection proof and evaluate as optional/documented fallback, matching Phase 20's honest handling of rejected evaluation.
- Compile the Rust fixture as an explicit preparation step; do not execute any public Cargo project in repository-owned integration tests.

---

### Documentation And Docs Validation (docs/test, reference/file-I-O)

**Analogs:** `docs/adapter-setup.md` lines 7-100, 129-186, 232-248, 307-331; `dap-cli/skills/dap-cli/references/go-delve.md` lines 5-117; `tests/integration/docsValidation.test.ts` lines 6-29 and 70-83.

**Docs validation pattern to copy:**

```typescript
const docsToValidate = [
  'README.md',
  'dap-cli/skills/dap-cli/references/agent-workflows.md',
  'dap-cli/skills/dap-cli/references/go-delve.md',
  'docs/playwright-interop.md',
  'docs/adapter-setup.md',
];

describe('Phase 20 docs (Go / Delve)', () => {
  test('adapter setup docs retain Delve provisioning and attach diagnostics', async () => {
    const content = await fs.readFile(path.join(process.cwd(), 'docs/adapter-setup.md'), 'utf8');
    expect(content).toContain('Delve');
    expect(content).toContain('delve_not_found');
    expect(content).toContain('processId');
  });
});
```

**CodeLLDB adaptation:** Add `rust-codelldb.md` to validated public command examples and assert durable truth about the proved adapter id/type, setup path, explicit compiled-binary workflow, supported `sourceLanguages`/source mappings if proved, Cargo limitation, `.rs` non-inference, safe attach policy/result, and scopes/variables fallback. Extend `docs/adapter-setup.md` only after R-00 can truthfully state the downloaded payload, version, platform coverage and cache/provenance behavior.

**Documentation trap:** Do not copy the Go statement that source extension inference is convenient. Rust documentation should explicitly state the opposite: compile first and target the binary, or use only a separately proved config flow.

---

### External Screening, Fresh-Agent Hardening, And UAT Artifacts (artifacts, batch/audit)

**Analogs:**

- `20-EXTERNAL-PROJECT-CANDIDATES.md` lines 7-34 for screening-first ledger and safety exclusions.
- `20-EXTERNAL-PROJECT-RESULTS.md` lines 7-77 for per-attempt SHA, exact commands, evidence, docs gaps and cleanup.
- `20-SCENARIOS.md` lines 12-22 and scenario blocks for the fixed report contract and bounded prompt structure.
- `20-RESULTS.md` lines 5-157 for retained initial outcomes and appended reruns.
- `20-HARDENING-GAPS.md` for `classification`, `source_scenarios`, `status`, `finding`, `repair`, and `rerun_audit` records.
- `20-UAT.md` lines 109-170 for the historical `## Hand-Driven CLI Smoke` Sequence A/B capture; Phase 22 must extend this shape with Sequence C steps C1-C6 because it changes provisioning/setup-adapters surfaces.

**Candidate ledger adaptation:** Rust screening must occur after R-00 through R-04 repo-owned passes. Add checks for `Cargo.toml`, lockfile, `build.rs`, proc-macro/workspace members, `.cargo/`, task/build files, `.vscode/launch.json`, devcontainers, setup commands and any network/credential/service requirements before any candidate is built or debugged.

**External result discipline:** Record exact SHA-pinned command trajectories, binary/config used, real breakpoint/source line, scopes/variables or evaluate evidence, isolated `DAP_CLI_HOME` and `DAP_CLI_ADAPTERS_DIR`, network/isolation disposition, and cleanup. Do not overwrite an unsafe, blocked or confusing initial attempt with a clean rerun.

**Fresh-agent/transcript discipline:** `22-SCENARIOS.md` already requires a transcript audit before accepting a pass. `22-RESULTS.md` should add transcript identity and actual commands/wrong turns to the Phase 20 result format because the Phase 22 onboarding skill elevates JSONL audit to a mandatory truth source.

**UAT assignment:** Because Phase 22 changes `src/adapters/provision/**` and `src/cli/commands/setupAdapters.ts`, `22-UAT.md` must contain verbatim orchestrator-run Sequence A and Sequence B output plus every Sequence C step C1-C6 under `## Hand-Driven CLI Smoke`, with all applicable evidence `pass`, before the phase can be called complete. Automated tests or subagent summaries are not a replacement.

## Shared Patterns

### Existing Provisioning Safety Surface

**Sources:** `src/adapters/provision/atomicInstall.ts` lines 45-101; `src/adapters/provision/extractZip.ts` lines 9-107; `src/adapters/provision/lock.ts` lines 22-145; `src/adapters/provision/http.ts` lines 64-232.

**Apply to:** CodeLLDB provisioning, setup reporting, unit/packaging tests.

Reuse the existing consent marker, per-adapter lock, staged install and verified entrypoints, safe ZIP extraction, HTTPS/local-test-server restriction, URL sanitization, proxy shaping, and `provision_*` diagnostics. The new work should supply only CodeLLDB's approved asset matrix, expected retained tree, entrypoint/runtime readiness behavior and tests.

### Existing Server Adapter Lifecycle

**Sources:** `src/adapters/builtins/delve.ts` lines 10-25; `src/adapters/socketAdapter.ts` lines 37-133.

**Apply to:** CodeLLDB descriptor and real integration tests, after R-01.

The existing server adapter type is already loopback-constrained and owns allocated ports, `${port}` substitution, spawn logging, readiness retries, close and child termination. The missing fact is whether the released CodeLLDB binary fits it securely; R-01 supplies that fact.

### Configuration Is Pass-Through Unless A Native Boundary Requires Work

**Sources:** `src/config/launchConfig.ts` lines 51-59, 231-240; `src/cli/commands/dapCore.ts` lines 372-395; `22-RESEARCH.md` line 63.

**Apply to:** `type: "lldb"`, native Rust launch fields, and Cargo handling.

Use the type-map extension for `lldb`. Do not invent config translation unless native direct-DAP proof requires it; the currently known exception is that raw CodeLLDB VS Code `cargo` config is extension-owned and must not be advertised as direct adapter behavior.

### Honest Stopped-State Evidence

**Sources:** `tests/integration/delveAdapter.test.ts` lines 176-244, 334-343; `20-EXTERNAL-PROJECT-RESULTS.md` lines 23-49, 77; `dap-cli/skills/dap-cli/references/go-delve.md` lines 97-117.

**Apply to:** R-01, repo-owned Rust integration, public-crate evidence, Rust reference docs.

Prove breakpoint binding, stopped event, stack and locals. If evaluate is unreliable, preserve that result and use scopes/variables; do not turn a valid fallback into a fabricated evaluate success.

## No Direct Analog Or Do-Not-Copy Areas

| Concern | Role | Data Flow | Why No Direct Copy Exists | Planner Disposition |
| --- | --- | --- | --- | --- |
| R-00 complete bundled CodeLLDB VSIX license/provenance/caching conclusion | evidence / security | file-I/O / decision | Existing adapters did not ship this observed LLDB + Python + Rust-support VSIX tree with unresolved notices | First plan, evidence-only; blocker before any provisioner/checksum support |
| R-01 live released CodeLLDB socket observation and direct DAP spike | evidence / security | process / request-response | Delve descriptor is already implemented; CodeLLDB invocation and exposure have not been proved live | First plan, evidence-only; blocker before descriptor/registry |
| Full CodeLLDB VSIX runtime expected-entrypoint list | service/config | archive / file-I/O | R-00 has observed candidates but not accepted the retained/support layout | Derive from R-00, then encode in provisioner/tests |
| Raw VS Code CodeLLDB `cargo` configuration | config/controller | transform | Upstream extension resolves `cargo`; native standalone DAP schema omits it | Explicitly unsupported/documented unless separately approved resolver work is planned and proved |
| `.rs` program inference | config | transform | Existing `.go` behavior is the wrong semantic model for compiled Rust binaries | Do not implement; add negative regression coverage |
| Owned CodeLLDB attach | test/evidence | event-driven / PID lifecycle | Native field and platform policy differ from Delve (`pid`, not `processId`) | Prove safely on owned process or record permitted platform blocker |

## Planner Pitfalls Checklist

- R-00/R-01 are a control-flow gate: any plan that edits descriptor/provisioner source before they pass is incorrectly ordered.
- The CodeLLDB platform VSIX is a runtime tree, not a single executable archive; expected cache entries and provenance must cover retained LLDB/Python/scripts/Rust-support assets.
- `type: "lldb" -> codelldb` is appropriate; `.rs -> codelldb` is explicitly forbidden by the locked decision.
- A raw `cargo` launch object is not presently native-DAP supported; never claim it works because VS Code documents it.
- Listener safety is a live released-binary property, not a conclusion that may be copied from upstream source.
- Public Rust crates can execute `build.rs` and proc macros during preparation; create/screen the candidate ledger before running any of them.
- CodeLLDB attach, if retained, must use an owned PID and unchanged platform policy; do not copy Delve's `processId` shape.
- Preserve failures, confusion and reruns in evidence artifacts; never polish away the first recorded result.
- Final completion still requires the orchestrator's verbatim published-CLI hand smoke for Sequences A and B plus provisioning-applicable Sequence C steps C1-C6 in `22-UAT.md`; UAT cannot reach `status: complete` until all pass.

## Metadata

**Analog search scope:** Phase 20 evidence artifacts and pattern map; Phase 21 research/verification; `src/adapters`, `src/config`, `src/cli/commands`, `scripts/dev`, `tests/adapters`, `tests/cli`, `tests/config`, `tests/helpers`, `tests/integration`, `tests/architecture`, `tests/packaging`, `tests/fixtures`, `docs`, and `dap-cli/skills/dap-cli`.

**Strong implementation analogs used:** Delve server descriptor/real integration, js-debug multi-entrypoint provisioner, Delve platform/checksum provisioner, shared ZIP/atomic-install safety utilities, and Phase 21 setup/packaging/docs contracts.

**Workspace safety note:** The existing unstaged Phase 20 `20-ADAPTER-SELECTION.md` change was read as precedent only and was not modified. This pattern-mapping pass writes only this `22-PATTERNS.md` artifact and executes no public repository code.

## PATTERN MAPPING COMPLETE

**Phase:** 22 - Rust / CodeLLDB Built-In Onboarding
**Files/artifacts classified:** 34
**Analogs found:** 28 direct or composition-level assignments; 6 intentionally new or do-not-copy gated concerns.

### Coverage

- Exact local extension or evidence-format analogs: registry/dispatcher/setup/type map/docs validation/evidence ledgers/UAT.
- Exact-composition analogs: CodeLLDB provisioner and tests combine Phase 21 ZIP/atomic safety with Delve platform/checksum behavior and js-debug multi-file cache validation.
- Conditional analogs: descriptor and real adapter integration may copy Delve server/DAP structure only after R-01 passes.
- No-direct-analog blockers: VSIX bundled-runtime disposition, direct live transport proof, native Cargo boundary, no `.rs` inference, and platform-safe attach.

### Key Patterns Identified

- Plan R-00/R-01 first and stop on blocker; product implementation is downstream of evidence.
- Reuse Phase 21 provisioning primitives and Delve's localhost server ownership boundary rather than introducing new installer or transport mechanics.
- Make explicit compiled-Rust-binary debugging the first supported contract, with scopes/variables as durable inspection evidence and honest documentation of Cargo/evaluate/attach limits.
- Reuse Phase 20's auditable candidate/result/gap/UAT artifact formats, strengthened with required JSONL transcript audit for fresh-agent claims.

### File Created

`.planning/phases/22-onboard-rust-debugging-through-codelldb-as-a-built-in-adapte/22-PATTERNS.md`

### Ready For Planning

The planner can now build a gate-first Phase 22 plan using these concrete analogs and explicit stop conditions for every security- or contract-sensitive CodeLLDB boundary.