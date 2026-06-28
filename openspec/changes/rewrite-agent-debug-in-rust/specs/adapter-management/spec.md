## ADDED Requirements

### Requirement: Built-In and Custom Adapter Registry
`agent-debug` SHALL register exactly the built-in adapter IDs `js-debug`, `debugpy`, `delve`, and `codelldb`. It SHALL load optional custom adapter configuration from `$AGENT_DEBUG_HOME/config/adapters.json`, where `AGENT_DEBUG_HOME` defaults to `~/.agent-debug`. The JSON root MAY contain `adapters`, a map of custom descriptors, and `launchConfigTypeMap`, a string-to-adapter-ID map. Invalid JSON or descriptors SHALL fail with `invalid_config`.

Each descriptor SHALL contain a non-empty `id` matching `[A-Za-z0-9._-]+`, a non-empty `label`, a transport descriptor, and optional object-valued `launchDefaults` and `attachDefaults`. Built-in IDs SHALL take precedence over custom descriptors with colliding IDs for resolution and listing.

#### Scenario: Resolve a built-in adapter
- **WHEN** a caller selects `js-debug`, `debugpy`, `delve`, or `codelldb`
- **THEN** the registry resolves the built-in descriptor

#### Scenario: Resolve a custom adapter
- **GIVEN** a valid custom descriptor is present in `~/.agent-debug/config/adapters.json`
- **WHEN** its descriptor ID is selected
- **THEN** the registry resolves that custom descriptor

#### Scenario: Prefer a built-in collision
- **GIVEN** a custom descriptor uses a built-in ID
- **WHEN** that ID is resolved or listed
- **THEN** the built-in adapter wins
- **AND** the colliding custom descriptor is not exposed as a second entry

#### Scenario: Report an unknown adapter
- **WHEN** an ID matches neither a built-in nor custom descriptor
- **THEN** resolution fails with `adapter_not_found`

### Requirement: Local-Only Adapter Transports
Adapter descriptors SHALL support only `stdio`, `socket`, and `server` transports. A `stdio` transport SHALL contain a non-empty local command, an argument array, and optional `cwd` and string-valued `env`. A `socket` transport SHALL contain host exactly `127.0.0.1` and a positive integer port. A `server` transport SHALL contain a non-empty local command, an argument array, host exactly `127.0.0.1`, and optional `cwd` and string-valued `env`; `${port}` in server arguments SHALL be replaced with a dynamically allocated loopback port. No descriptor SHALL authorize a remote or wildcard listener.

#### Scenario: Start a stdio adapter
- **WHEN** a valid stdio descriptor is selected
- **THEN** `agent-debug` starts the configured local executable with its exact arguments, working directory, and environment additions
- **AND** exchanges DAP over the process's standard streams

#### Scenario: Connect to a socket adapter
- **WHEN** a valid socket descriptor is selected
- **THEN** `agent-debug` connects only to `127.0.0.1:<port>`

#### Scenario: Start a server adapter
- **WHEN** a valid server descriptor is selected
- **THEN** `agent-debug` allocates a loopback port
- **AND** substitutes that port for every `${port}` token
- **AND** connects only to `127.0.0.1`

#### Scenario: Reject a remote transport
- **WHEN** a socket or server descriptor names any host other than `127.0.0.1`
- **THEN** adapter configuration fails with `invalid_config`

### Requirement: Lazy Built-In Provisioning and Cache Layout
Built-in adapter payloads SHALL be provisioned lazily when first resolved. `agent-debug` SHALL check the complete local cache before prompting or using the network and SHALL provision only the requested built-in adapter. The default cache root SHALL be `~/.agent-debug/adapters`; non-empty `AGENT_DEBUG_ADAPTERS_DIR` SHALL override both cache reads and writes.

A cache hit SHALL require both the adapter's complete expected runtime entrypoints and a zero-byte `.consent-<version>` marker under its adapter directory. Missing runtime files or a missing version marker SHALL make the entry pending. Custom adapters SHALL always remain user-managed and SHALL never enter the provisioning path.

#### Scenario: Reuse a complete cache
- **GIVEN** the pinned adapter runtime and matching consent marker are complete
- **WHEN** the built-in adapter is resolved
- **THEN** it is returned from cache
- **AND** no prompt or network request occurs

#### Scenario: Provision only the selected adapter
- **GIVEN** multiple built-in adapters are absent
- **WHEN** one adapter is selected for launch or attach
- **THEN** only that adapter is considered for provisioning

#### Scenario: Use an overridden cache
- **WHEN** `AGENT_DEBUG_ADAPTERS_DIR` names a non-empty path
- **THEN** all cache checks, locks, staging directories, consent markers, and final installs use that path

#### Scenario: Treat a partial cache as pending
- **WHEN** either a required runtime entrypoint or the pinned-version consent marker is missing
- **THEN** the adapter is not treated as cached
- **AND** repair requires the normal consent flow

#### Scenario: Resolve a custom adapter
- **WHEN** a custom adapter descriptor is selected
- **THEN** `agent-debug` uses the descriptor directly
- **AND** never downloads, installs, repairs, or writes a consent marker for it

### Requirement: Provisioning Consent
`agent-debug` SHALL NOT download or install an adapter without affirmative per-version consent. Consent MAY come from an interactive `y`, `--yes`/`-y`, or `AGENT_DEBUG_ASSUME_YES=1`. Prompts SHALL be written to stderr, default to no, name the adapter, pinned version, source or destination as applicable, and SHALL create the version marker only after a complete successful install.

#### Scenario: Accept interactive consent
- **GIVEN** stdin is a TTY and no pre-consent is set
- **WHEN** the user answers `y`
- **THEN** provisioning proceeds
- **AND** a `.consent-<version>` marker is written only after successful installation

#### Scenario: Decline interactive consent
- **WHEN** the user answers no or accepts the default answer
- **THEN** provisioning fails with `provision_consent_declined`
- **AND** no network or installation step follows

#### Scenario: Pre-consent with a flag
- **WHEN** `--yes` or `-y` is supplied
- **THEN** pending adapters may be provisioned without an interactive prompt

#### Scenario: Pre-consent with the environment
- **WHEN** `AGENT_DEBUG_ASSUME_YES=1`
- **THEN** it is equivalent to `--yes`

#### Scenario: Fail fast without a TTY
- **GIVEN** stdin is not a TTY
- **AND** neither command-line nor environment pre-consent is present
- **WHEN** provisioning is required
- **THEN** the command fails before network access with `provision_consent_required`
- **AND** diagnostics recommend `--yes`, `-y`, or `AGENT_DEBUG_ASSUME_YES=1`

#### Scenario: Re-prompt after a version change
- **GIVEN** consent exists for an older adapter version
- **WHEN** a newer pinned version is required
- **THEN** the older marker does not authorize the new version

### Requirement: Pinned Adapter Evidence
The initial Rust implementation SHALL use these exact pinned versions and verified inputs:

| Adapter | Version | Verified input |
| --- | --- | --- |
| `js-debug` | `1.117.0` | Official GitHub `v1.117.0` `js-debug-dap-v1.117.0.tar.gz` |
| `debugpy` | `1.8.20` | `pip install debugpy==1.8.20` inside an isolated virtual environment |
| `delve` | `v1.26.3` | Official GitHub platform archive |
| `codelldb` | `v1.12.2` | Official `codelldb-darwin-arm64.vsix`, on `darwin_arm64` only |

The embedded SHA-256 evidence SHALL be:

| Adapter input | SHA-256 |
| --- | --- |
| js-debug `1.117.0` | `ad8d04ede9d4b75cc290fd5438a65047a06f786d04f604b6112485b36f090772` |
| Delve `v1.26.3` `darwin_arm64` | `7f28483a42f0a911f29b236aa40d24d7099f1b0ec54c56c4d439a6903d478a3d` |
| Delve `v1.26.3` `darwin_amd64` | `6827a438473167a1e0805b4546e5bf2d53401530f694deb35e41c6e7b46e27c8` |
| Delve `v1.26.3` `linux_amd64` | `cdd4d6b2a638d8f26468d82a76b766df594641490bea566629305d90fbccc06e` |
| Delve `v1.26.3` `linux_arm64` | `5b03fd74895d676c4435bec1aade0863be1489a4be1bb5c9269c6ef389bf5d2d` |
| Delve `v1.26.3` `windows_amd64` | `f9e15b8f3628e4c7bfe481011bea458df754d0e75c6ff4ab01c71294165950fd` |
| CodeLLDB `v1.12.2` `darwin_arm64` | `c836b81c6f2da467b5920a376a7bfc849dc4b4d81b19779dedf1c685cb4aa1a0` |

#### Scenario: Provision a pinned release
- **WHEN** a built-in adapter needs installation
- **THEN** `agent-debug` acquires exactly the pinned version for the detected supported platform
- **AND** never silently upgrades to a newer release

#### Scenario: Encounter an unsupported asset
- **WHEN** no verified pinned asset exists for the detected adapter/platform pair
- **THEN** provisioning fails with `provision_arch_unsupported`
- **AND** structured data lists the detected and supported platform keys

### Requirement: Versioned Built-In Adapter Manifests
The repository SHALL contain one reviewed manifest per built-in adapter version. A manifest SHALL define the official source, platform key, archive or package format, checksum or allowed package hashes, extraction root, required runtime paths, executable permissions, adapter command, arguments, transport kind, loopback readiness behavior, consent marker, and cache-validation rules.

The initial manifests SHALL encode:

| Adapter | Source and layout | Adapter process |
| --- | --- | --- |
| js-debug `1.117.0` | `https://github.com/microsoft/vscode-js-debug/releases/download/v1.117.0/js-debug-dap-v1.117.0.tar.gz`; tar.gz with one leading directory stripped; require `src/dapDebugServer.js` and `src/bootloader.js`; write `package.json` containing `{"type":"commonjs"}` | server transport; command is the resolved js-debug Node host; arguments are `<install>/src/dapDebugServer.js`, `${port}`, `127.0.0.1` |
| debugpy `1.8.20` | approved wheels and SHA-256 hashes from official PyPI metadata; install into `venv`; require the platform venv Python and successful `import debugpy` reporting `1.8.20` | stdio transport; command is the venv Python; arguments are `-m`, `debugpy.adapter` |
| Delve `v1.26.3` | `https://github.com/go-delve/delve/releases/download/v1.26.3/dlv_1.26.3_<platform>.<tar.gz|zip>`; require `dlv` or `dlv.exe` | server transport; command is `dlv`; arguments are `dap`, `--listen=127.0.0.1:${port}` |
| CodeLLDB `v1.12.2` | `https://github.com/vadimcn/codelldb/releases/download/v1.12.2/codelldb-darwin-arm64.vsix`; zip; require `extension/adapter/codelldb`, `extension/adapter/scripts/codelldb/__init__.py`, `extension/lldb/bin/lldb`, `lldb-argdumper`, `lldb-server`, `extension/lldb/lib/liblldb.dylib`, `libpython312.dylib`, `extension/lldb/lib/python3.12/os.py`, `extension/lang_support/rust.py`, and `extension/package.json` | server transport; command is `extension/adapter/codelldb`; arguments are `--liblldb`, `<install>/extension/lldb/lib/liblldb.dylib`, `--port`, `${port}` |

#### Scenario: Validate a cached built-in
- **WHEN** a built-in adapter is resolved from cache
- **THEN** `agent-debug` validates it against the complete versioned manifest
- **AND** a missing required file, wrong version, unsafe path, or invalid executable permission makes the cache incomplete

#### Scenario: Start a built-in adapter
- **WHEN** a validated built-in descriptor is started
- **THEN** its command, arguments, transport, loopback host, and readiness behavior come from the reviewed manifest

### Requirement: Integrity Verification and Safe Extraction
Every downloaded js-debug, Delve, and CodeLLDB archive SHALL be SHA-256 verified against the embedded table before extraction or execution. debugpy SHALL be installed only from approved wheel filenames and SHA-256 hashes recorded in its manifest; source distributions SHALL NOT be built or installed. Pip SHALL use hash enforcement and no dependency resolution for the locked debugpy artifact. Archive extraction SHALL be implemented in-process without invoking system `tar`, `unzip`, or `gzip`.

Extractors SHALL reject absolute paths, Windows drive-prefixed paths, `..` traversal components, and symbolic-link entries. Missing required runtime entrypoints SHALL be an extraction failure. Archive and staging paths SHALL stay under the adapter cache root.

#### Scenario: Verify a matching archive
- **WHEN** a downloaded archive's SHA-256 matches the pinned value
- **THEN** extraction may proceed

#### Scenario: Reject a checksum mismatch
- **WHEN** a downloaded archive's SHA-256 differs from the pinned value
- **THEN** provisioning fails with `provision_checksum_mismatch`
- **AND** error data identifies adapter, version, sanitized URL, expected hash, and actual hash
- **AND** the payload is never executed or promoted

#### Scenario: Reject a traversal entry
- **WHEN** an archive contains an absolute, drive-prefixed, parent-traversing, or symlink entry
- **THEN** provisioning fails with `provision_extract_failed`
- **AND** no file is written outside the staging directory

#### Scenario: Reject an incomplete runtime
- **WHEN** extraction completes without every required entrypoint
- **THEN** provisioning fails with `provision_extract_failed`
- **AND** diagnostics identify a missing entrypoint

#### Scenario: Install debugpy in isolation
- **WHEN** debugpy provisioning succeeds
- **THEN** `agent-debug` creates a private virtual environment under the debugpy cache
- **AND** installs exactly an approved hash-locked `debugpy==1.8.20` wheel without dependencies or modification of the user's global Python environment

#### Scenario: Mirror serves a modified debugpy wheel
- **WHEN** `PIP_INDEX_URL` serves a file whose name or SHA-256 is not in the approved debugpy manifest
- **THEN** pip hash enforcement SHALL reject the artifact
- **AND** provisioning SHALL fail with `provision_pip_install_failed`

#### Scenario: No approved wheel exists
- **WHEN** the selected Python interpreter and platform have no approved debugpy wheel in the manifest
- **THEN** provisioning SHALL fail without building a source distribution
- **AND** diagnostics SHALL identify the unsupported interpreter/platform pair

### Requirement: Atomic Installation and Permissions
Provisioning SHALL populate a sibling `.<id>.tmp.<pid>.<random>/` staging directory, verify the complete runtime, write and flush the versioned consent marker as the final staging step, and atomically rename the complete directory to `<cache-root>/<id>/`. A failed or interrupted install SHALL never expose a partially installed canonical directory. Under the adapter lock, an existing canonical directory that fails manifest or consent validation SHALL be atomically moved to a bounded quarantine name or removed before promotion. Temporary archives, handled staging directories, and bounded old quarantine entries SHALL be cleaned up.

On POSIX, extracted native executables that must be launched directly, including Delve and CodeLLDB entrypoints, SHALL have mode `0755`. Configuration, consent markers, archives, lock sentinels, and cache contents SHALL be created without granting permissions broader than the invoking user's umask, and provisioning SHALL NOT make cache files world-writable. Filesystem failures `EACCES`, `EROFS`, `ENOSPC`, and `EPERM` during cache creation, locking, staging, or promotion SHALL map to `provision_cache_unwritable`.

#### Scenario: Promote a complete install
- **WHEN** staging, verification, and permission setup all succeed
- **THEN** the consent marker is written and flushed inside staging
- **AND** the complete staging directory is atomically promoted to the canonical adapter directory

#### Scenario: Fail before promotion
- **WHEN** population or entrypoint verification fails
- **THEN** the canonical adapter directory is not left half-installed
- **AND** handled staging artifacts are removed

#### Scenario: Recover an incomplete canonical directory
- **WHEN** the canonical adapter directory exists but fails manifest or consent validation
- **THEN** the provisioner handles it under the adapter lock
- **AND** quarantines or removes it before atomically promoting a complete staging directory

#### Scenario: Set executable permissions
- **WHEN** a POSIX native adapter executable is installed
- **THEN** it is executable with mode `0755`
- **AND** unrelated cache files are not made executable or world-writable

#### Scenario: Report an unwritable cache
- **WHEN** cache operations fail with `EACCES`, `EROFS`, `ENOSPC`, or `EPERM`
- **THEN** provisioning fails with `provision_cache_unwritable`
- **AND** diagnostics identify the cache path and recommend `AGENT_DEBUG_ADAPTERS_DIR`

### Requirement: Per-Adapter Provisioning Locks
Installation SHALL be serialized by a per-adapter sibling lock sentinel `<cache-root>/.<id>.lock-target`. The lock SHALL contain owner PID, process creation identity, random nonce, and renewable lease timestamp. The owner SHALL renew the lease during downloads, extraction, venv creation, and pip installation. After acquiring the lock, the provisioner SHALL re-check for a complete cache before downloading. Lock acquisition SHALL wait no longer than 90 seconds. Age alone SHALL NOT permit lock stealing; automatic recovery SHALL require a dead owner or mismatched process creation identity. Different adapter IDs SHALL not share one global install lock.

#### Scenario: Race to install one adapter
- **GIVEN** two processes request the same missing adapter
- **WHEN** one process acquires the lock first
- **THEN** the other waits
- **AND** re-checks the cache after acquiring the lock
- **AND** avoids a duplicate download when the first install completed

#### Scenario: Time out on a live lock
- **WHEN** the same adapter lock remains unavailable for 90 seconds
- **THEN** provisioning fails with `provision_lock_timeout`
- **AND** diagnostics identify the adapter and sentinel path

#### Scenario: Preserve a long-running live install
- **WHEN** installation exceeds five minutes but the owner identity is live and continues renewing its lease
- **THEN** another process SHALL NOT steal the lock

#### Scenario: Recover an abandoned lock
- **WHEN** the lock owner is dead or the PID creation identity no longer matches
- **THEN** the lock MAY be replaced safely

#### Scenario: Provision different adapters concurrently
- **WHEN** two processes provision different adapter IDs
- **THEN** each uses its own lock sentinel

### Requirement: Network, Proxy, Token, and Index Handling
Release downloads SHALL require HTTPS, except loopback HTTP used by tests. They SHALL honor `HTTPS_PROXY`/`https_proxy` for HTTPS, `HTTP_PROXY`/`http_proxy` for HTTP, and `NO_PROXY`/`no_proxy` for exact hosts, leading-dot suffixes, subdomains, and `*`. GitHub requests SHALL attach `GITHUB_TOKEN` as `Authorization: Bearer <token>` only for GitHub hosts. debugpy installation SHALL inherit `PIP_INDEX_URL`.

Every URL rendered in diagnostics or structured data SHALL have user information, passwords, query strings, and fragments removed. Tokens and proxy credentials SHALL never appear in stdout, stderr, logs, or error data.

#### Scenario: Download through a proxy
- **WHEN** the applicable proxy variable is set and the target does not match `NO_PROXY`
- **THEN** the download uses that proxy

#### Scenario: Bypass a proxy
- **WHEN** the target host matches `NO_PROXY`, including a suffix-domain match
- **THEN** the download connects directly

#### Scenario: Report a proxy failure
- **WHEN** the configured proxy is unreachable or refuses the request
- **THEN** provisioning fails with `provision_proxy_error`
- **AND** the sanitized target and proxy URLs are available for recovery

#### Scenario: Authenticate a GitHub request
- **WHEN** `GITHUB_TOKEN` is set and the request host is GitHub
- **THEN** the request uses a bearer authorization header
- **AND** the token is not sent to non-GitHub hosts

#### Scenario: Detect GitHub rate limiting
- **WHEN** GitHub returns status 403 with `X-RateLimit-Remaining: 0`
- **THEN** provisioning fails with `provision_rate_limited`
- **AND** diagnostics recommend `GITHUB_TOKEN` and expose the reset value when present

#### Scenario: Use a Python package index mirror
- **WHEN** `PIP_INDEX_URL` is set during debugpy provisioning
- **THEN** the isolated pip process inherits it

#### Scenario: Redact a diagnostic URL
- **WHEN** a target or proxy URL contains credentials, a query, or a fragment
- **THEN** none of those sensitive components appear in diagnostics or structured data

### Requirement: Setup-Adapters Batch Results
`agent-debug setup-adapters` SHALL target all four built-ins by default and SHALL accept `--adapter` only for one of the four built-in IDs. Before prompting, it SHALL classify each target as pending or cached. A multi-adapter invocation SHALL issue one consolidated prompt naming every pending adapter and version.

The result data SHALL be `{ "adapters": SetupAdapterEntry[] }`, where every entry contains `id`, `version`, and `status` equal to `installed`, `cached`, or `failed`; successful entries include `installRoot`, and failed entries include `error: { "code": string, "message": string, "diagnostics": string[] }`. Processing SHALL continue after an individual provisioning failure. If any entry failed, the command SHALL fail with `provision_setup_failed` and include the complete partial result in `error.data.adapters`.

#### Scenario: Pre-warm all adapters
- **WHEN** `agent-debug setup-adapters --yes` is invoked without `--adapter`
- **THEN** the result contains exactly one entry for each built-in adapter

#### Scenario: Pre-warm one adapter
- **WHEN** `--adapter js-debug` is supplied
- **THEN** the result contains only the js-debug entry

#### Scenario: Avoid prompting for warm entries
- **WHEN** all targeted adapters are complete and consented
- **THEN** every entry has status `cached`
- **AND** no prompt or network request occurs

#### Scenario: Prompt once for pending entries
- **GIVEN** multiple target adapters are pending
- **WHEN** interactive consent is required
- **THEN** one stderr prompt names every pending adapter and pinned version

#### Scenario: Return partial results
- **GIVEN** one adapter fails and later adapters can still be processed
- **WHEN** setup completes
- **THEN** successful adapters report `installed` or `cached`
- **AND** failed adapters report `failed` with their underlying code and diagnostics
- **AND** the command fails with `provision_setup_failed`
- **AND** `error.data.adapters` contains every per-adapter result

### Requirement: CLI-Owned Provisioning Flow
The invoking CLI process SHALL resolve configuration, obtain consent, and complete any required provisioning before requesting the persistent controller to start a session. The CLI SHALL send the controller only a descriptor and built-in manifest identity for a completed cache. The controller SHALL never prompt and SHALL independently revalidate the manifest version, consent marker, required paths, permissions, and cache-root containment before spawning the adapter.

#### Scenario: Provision during launch
- **GIVEN** a selected built-in adapter is missing
- **WHEN** the user invokes launch or attach
- **THEN** the CLI uses its own stdin and stderr to obtain consent and provision the adapter
- **AND** no session-start IPC request is sent until provisioning completes

#### Scenario: Start from a completed cache
- **WHEN** the CLI sends a built-in descriptor to the controller
- **THEN** the controller revalidates the referenced cache against the same manifest
- **AND** rejects a changed, incomplete, unsafe, or out-of-root cache before spawning

#### Scenario: Provision compound members
- **WHEN** a compound uses one or more missing built-in adapters
- **THEN** the CLI resolves and provisions every member before sending the transactional compound start request
- **AND** the controller never blocks waiting for interactive consent

### Requirement: Provisioning Error Catalogue
Built-in provisioning SHALL emit exactly these 13 underlying `provision_*` error codes, each with a human-readable `diagnostics` array and structured `data` appropriate to the failure:

1. `provision_consent_required`
2. `provision_consent_declined`
3. `provision_network_error`
4. `provision_proxy_error`
5. `provision_rate_limited`
6. `provision_checksum_mismatch`
7. `provision_python3_missing`
8. `provision_python3_venv_unavailable`
9. `provision_pip_install_failed`
10. `provision_arch_unsupported`
11. `provision_cache_unwritable`
12. `provision_lock_timeout`
13. `provision_extract_failed`

`provision_setup_failed` SHALL be only the batch command's aggregate error and SHALL NOT replace or count among the 13 underlying codes.

#### Scenario: Snapshot an underlying provisioning failure
- **WHEN** any provisioning failure is rendered as structured output
- **THEN** its code is one of the exact 13 codes
- **AND** diagnostics provide a concrete recovery action
- **AND** data contains no secret

#### Scenario: Preserve an underlying code in batch setup
- **WHEN** `setup-adapters` catches an underlying provisioning failure
- **THEN** the failed entry retains that exact code
- **AND** the outer command uses `provision_setup_failed`

### Requirement: Provisioning Security Boundary
`agent-debug` SHALL provision built-ins only from their specified official source and pinned input. It SHALL NOT execute an archive before integrity and path validation, SHALL NOT follow archive symlinks, SHALL NOT invoke shell extraction utilities, and SHALL NOT bundle, mirror, or rehost CodeLLDB. A pre-staged cache SHALL be accepted only when its required runtime files and matching consent marker are complete.

#### Scenario: Inspect the npm distribution
- **WHEN** the installed `@roblourens/agent-debug` package is examined
- **THEN** it contains no redistributed built-in adapter payload
- **AND** especially contains no CodeLLDB VSIX or extracted runtime

#### Scenario: Lose access to the official CodeLLDB source
- **GIVEN** no complete CodeLLDB cache exists
- **WHEN** the official release cannot be reached
- **THEN** provisioning fails
- **AND** does not silently use a mirror or unverified substitute

#### Scenario: Use a complete pre-staged cache
- **WHEN** an eligible adapter cache contains every required runtime file and the exact consent marker
- **THEN** it is used without network access

#### Scenario: Reject an unconsented pre-staged payload
- **WHEN** runtime files exist but the matching consent marker does not
- **THEN** the payload is not silently trusted
- **AND** the normal consent flow applies

### Requirement: Secret-Safe Diagnostics and Logs
Adapter startup, provisioning, launch configuration, and process diagnostics SHALL NOT write complete environment maps or unredacted credential-bearing values to stdout, stderr, state, or logs. Values associated with names containing `password`, `passwd`, `token`, `secret`, `authorization`, `cookie`, or `key` case-insensitively SHALL be redacted when diagnostic context is rendered. Command arguments and launch fields SHALL be logged only through a bounded, redacted representation.

#### Scenario: Launch configuration contains a secret
- **WHEN** a launch configuration or adapter environment contains `API_TOKEN`, `password`, or another sensitive key
- **THEN** logs and structured diagnostics replace its value with a redaction marker
- **AND** the original value is still passed to the intended child process when required

#### Scenario: Adapter failure includes arguments
- **WHEN** adapter startup fails after receiving command arguments or environment additions
- **THEN** diagnostics expose only bounded redacted representations
- **AND** never expose the complete environment map
