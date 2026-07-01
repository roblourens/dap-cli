## ADDED Requirements

### Requirement: Authoritative CI and Release Workflows
The repository SHALL use `.github/workflows/ci.yml` for pull-request and main-branch validation and `.github/workflows/release.yml` for release builds and publication. The existing `.github/workflows/publish.yml` SHALL be removed rather than retained as a second publication path.

`release.yml` SHALL run automatically for stable tags matching `v<major>.<minor>.<patch>`. It SHALL also support `workflow_dispatch` with an explicit tag and a `publish` boolean that defaults to `false`; manual publication SHALL require `publish: true` and an existing matching tag. Pull requests, branch pushes, and dry runs SHALL never publish packages or create a public GitHub Release.

#### Scenario: Push a stable release tag
- **WHEN** a maintainer pushes a valid stable `v<major>.<minor>.<patch>` tag
- **THEN** `.github/workflows/release.yml` runs the complete build, verification, and publication graph
- **AND** no separate workflow can publish the same packages

#### Scenario: Run a manual dry run
- **WHEN** `.github/workflows/release.yml` is dispatched with `publish: false`
- **THEN** it builds, packages, and verifies the requested existing tag
- **AND** it does not publish to npm or create a GitHub Release

#### Scenario: Attempt publication from an untrusted ref
- **WHEN** a pull request, branch ref, missing tag, or mismatched tag requests publication
- **THEN** release validation fails before any registry mutation

### Requirement: Immutable Release Identity
Release validation SHALL require a stable tag in the exact form `v<major>.<minor>.<patch>`, SHALL verify that the tagged commit is reachable from the repository's default branch, and SHALL require the tag version to match the Rust package version and all six npm package versions exactly. The Rust lockfile, npm lockfile, release scripts, package manifests, checksum manifest schema, and toolchain file used by the release SHALL come from that tagged commit.

Pre-release npm versions and dist-tags are outside the initial release contract and SHALL require a reviewed specification update before publication.

#### Scenario: Validate matching release versions
- **WHEN** release validation reads a stable tag, the Rust manifest, and all npm package manifests
- **THEN** every version is identical after removing the tag's leading `v`
- **AND** all subsequent jobs use that immutable tag commit

#### Scenario: Detect release identity drift
- **WHEN** a version differs, the tag commit is not reachable from the default branch, or a release input refers to another commit
- **THEN** the workflow fails before native builds or publication

### Requirement: Pinned Native Build Matrix
The release workflow SHALL build every target on a native-architecture GitHub-hosted runner using this initial matrix:

| Payload | Runner | Build environment | Rust target |
| --- | --- | --- | --- |
| macOS arm64 | `macos-15` | GitHub-hosted runner image | `aarch64-apple-darwin` |
| macOS x64 | `macos-15-intel` | GitHub-hosted runner image | `x86_64-apple-darwin` |
| Linux x64 | `ubuntu-24.04` | GitHub-hosted runner image | `x86_64-unknown-linux-gnu` |
| Linux arm64 | `ubuntu-24.04-arm` | GitHub-hosted runner image | `aarch64-unknown-linux-gnu` |
| Windows x64 | `windows-2022` | statically linked MSVC CRT | `x86_64-pc-windows-msvc` |

The workflow SHALL verify the runner architecture before building, SHALL use the repository's pinned `rust-toolchain.toml`, committed `Cargo.lock`, committed Cargo vendor directory, and source-replacement configuration, and SHALL execute:

`cargo build --manifest-path agent-debug/Cargo.toml --locked --offline --release --target <target>`

Runner labels SHALL NOT use `-latest`, and all workflow actions SHALL be pinned immutably. Replacing a retired runner label with an equivalent native architecture and operating-system generation MAY be treated as pipeline maintenance only when the target, toolchain, and verification contracts remain unchanged.

Before native builds, a GitHub-hosted validation job SHALL run a pinned `cargo-deny` version against a reviewed configuration and pinned advisory snapshot to enforce allowed licenses, sources, duplicate/version policy, bans, and known-vulnerability policy. An exception SHALL be versioned, narrowly scoped, justified, and carry an expiration or removal condition.

#### Scenario: Build every native payload
- **WHEN** the release build matrix runs
- **THEN** five independent jobs compile the five required Rust targets on matching native architectures
- **AND** each job verifies its target binary before artifact upload

#### Scenario: Detect an unexpected build host
- **WHEN** a runner reports an architecture that does not match its matrix entry
- **THEN** that job fails before invoking Cargo

#### Scenario: Build while crates.io is unavailable
- **WHEN** release Cargo builds run without registry network access
- **THEN** the committed lockfile, vendor directory, and source replacement provide every required crate
- **AND** Cargo does not contact crates.io or an unreviewed git source

#### Scenario: Detect a disallowed dependency
- **WHEN** the dependency gate finds a prohibited source, license, duplicate, ban, or unapproved advisory
- **THEN** the release fails before native builds

### Requirement: Versioned Release Tooling Surface
Cross-platform release logic SHALL live in `scripts/release.mjs` and SHALL expose deterministic `validate`, `stage-platform`, `assemble`, `verify`, and `publish` subcommands. The root `package.json` SHALL expose these operations as `release:validate`, `release:stage-platform`, `release:assemble`, `release:verify`, and `release:publish`.

The workflow MAY invoke Cargo and operating-system inspection commands directly, but package layout, checksum generation, release-manifest generation, npm tarball creation, registry-integrity comparison, and publication ordering SHALL be implemented once in `scripts/release.mjs` rather than duplicated in Bash, PowerShell, or workflow YAML. Release tooling SHALL use a pinned Node.js 22 patch release and a pinned npm version that supports trusted publishing. Node.js remains release/install tooling and SHALL NOT become part of the installed CLI invocation path.

#### Scenario: Run release assembly on another host
- **WHEN** a developer or CI job runs the documented root release scripts with the same input artifacts
- **THEN** the scripts produce the same package layout, manifest schema, and publication order without relying on a Unix-only shell

#### Scenario: Invoke the installed product
- **WHEN** release tooling has assembled and installed `@roblourens/agent-debug`
- **THEN** invoking `agent-debug` does not execute `scripts/release.mjs`, Node.js, or npm

### Requirement: Immutable Native Artifact Contract
Each native build job SHALL stage exactly one executable plus `artifact.json` and `SHA256SUMS` under `release/native/<rust-target>/`. `artifact.json` SHALL record schema version, package version, git tag, full commit SHA, Rust target, runner label, runner architecture, operating-system version, Rust toolchain, executable filename, executable size, and SHA-256 digest.

Each staged directory SHALL be uploaded as a uniquely named immutable workflow artifact with a bounded retention period of 14 days. GitHub artifact upload digest validation and a GitHub build-provenance attestation for the executable SHALL be required. npm assembly SHALL consume only artifacts downloaded from the current release workflow run and SHALL reject a target, version, commit, filename, size, or checksum mismatch.

#### Scenario: Hand off a native build
- **WHEN** a matrix build succeeds
- **THEN** its executable, metadata, checksum, upload digest, and build-provenance attestation identify the same tagged source and target

#### Scenario: Detect substituted or stale build output
- **WHEN** npm assembly receives an artifact from another commit, version, target, or checksum
- **THEN** assembly fails before creating npm tarballs

### Requirement: GitHub-Hosted Execution and Performance Matrix
Every native build job SHALL execute its exact release artifact and run core CLI/controller smoke tests on the same pinned GitHub-hosted runner before upload. Release automation SHALL use no self-hosted runners and SHALL make no older operating-system, kernel, or libc compatibility claim beyond those GitHub-hosted validation environments.

The `macos-15` arm64 job SHALL run the release-blocking absolute startup benchmark defined by `distribution-performance`. The other four GitHub-hosted jobs SHALL run their stored native regression checks. An unavailable GitHub-hosted runner or failed execution/performance gate SHALL block publication rather than being skipped.

#### Scenario: Verify every native payload
- **WHEN** a release candidate reaches native execution validation
- **THEN** each of the five artifacts runs on its pinned GitHub-hosted build runner
- **AND** core CLI and controller smoke tests pass there

#### Scenario: Run the release performance gate
- **WHEN** the macOS arm64 candidate is built on `macos-15`
- **THEN** that exact artifact runs the absolute startup benchmark
- **AND** publication remains blocked until the distribution-performance budgets pass

### Requirement: Prepublication npm Registry Verification
After all native artifacts pass their GitHub-hosted execution and performance gates, one GitHub-hosted `ubuntu-24.04` assembly job SHALL create the five platform-package tarballs and the meta-package tarball from those exact artifacts. The job SHALL emit a versioned `release-manifest.json` containing every raw executable digest, npm tarball digest and integrity value, package name, package version, target, source commit, and artifact-attestation reference.

Before public publication, each entry in a five-platform GitHub-hosted runner matrix matching the native build hosts SHALL start its own loopback-only ephemeral npm registry and publish the same six candidate tarballs into that isolated registry. Each entry SHALL install the meta package from its registry through local, global, and `npx` paths, verify the selected payload digest, run core CLI/controller smoke tests, prove core invocation succeeds after Node.js is removed from `PATH`, and separately verify the structured js-debug missing-Node error. Public npm publication SHALL depend on every prepublication package job.

#### Scenario: Validate the assembled npm release
- **WHEN** all six candidate tarballs are available
- **THEN** each supported platform installs the meta package from the ephemeral registry
- **AND** each installation selects and runs the expected native artifact

#### Scenario: Detect a packaging-only defect
- **WHEN** an install hook, optional dependency, checksum manifest, command link, or package metadata is incorrect
- **THEN** prepublication validation fails without changing the public npm registry

### Requirement: Durable Candidate Bundle and Recovery Source
After prepublication verification passes and before public npm mutation, a job with narrowly scoped `contents: write` SHALL create or update a draft GitHub Release for the immutable tag. The draft SHALL contain the exact six verified npm tarballs, `release-manifest.json`, and aggregate `SHA256SUMS`. Draft assets SHALL be treated as immutable recovery inputs: an existing asset with matching digest is reused, while an existing asset with a different digest fails the release.

The npm publication job SHALL publish the exact tarballs downloaded from that draft and SHALL verify them against the draft manifest immediately before registry mutation. If any package version for the release already exists publicly, a fresh workflow run SHALL recover only from the matching draft bundle and SHALL NOT rebuild or reassemble candidate tarballs for that version.

If partial public platform-package publication exists but the matching draft bundle is missing, expired, deleted, or inconsistent, the workflow SHALL refuse to publish another package or the meta package under that version. Recovery SHALL use a new patch version; already published orphan platform versions remain immutable and SHALL be recorded in release diagnostics.

#### Scenario: Recover a partial platform publication
- **WHEN** some platform packages were published and a later job failed
- **THEN** a rerun downloads the original matching tarballs from the draft GitHub Release
- **AND** it publishes only missing packages without rebuilding the release

#### Scenario: Lose the durable recovery bundle
- **WHEN** partial public publication exists but the matching draft assets cannot be verified
- **THEN** the workflow refuses same-version recovery
- **AND** remediation requires a new version

### Requirement: npm Trusted-Publisher Bootstrap
Before the first automated product release, a maintainer SHALL perform a one-time bootstrap for all six scoped npm package names. The bootstrap SHALL publish a metadata-only `0.0.0-bootstrap.0` version under the non-default `bootstrap` dist-tag using interactive maintainer authentication, configure each package's trusted publisher to the exact repository and `.github/workflows/release.yml` filename, and then configure publishing access to disallow reusable write tokens.

Normal release workflows SHALL NOT contain `NPM_TOKEN` or another long-lived npm credential. The npm publication job SHALL run on GitHub-hosted `ubuntu-24.04`, SHALL have `id-token: write`, and SHALL use the pinned npm trusted-publishing client. Bootstrap publication is a documented one-time repository-owner action and SHALL NOT be repeated for normal releases.

#### Scenario: Publish after trusted-publisher bootstrap
- **WHEN** the release job invokes npm publication for any of the six package names
- **THEN** npm authenticates the exact release workflow through OIDC
- **AND** npm records provenance without a reusable automation token

#### Scenario: Trusted publisher is absent or mismatched
- **WHEN** npm cannot authenticate the repository and exact workflow filename
- **THEN** publication fails with bootstrap remediation
- **AND** the workflow does not fall back to a stored npm token

### Requirement: Ordered and Idempotent npm Publication
The release script SHALL publish the five platform packages before the meta package. Before publishing each tarball, it SHALL query the registry for that exact package version. If the version is absent, it SHALL publish the already verified tarball. If the version exists with the same registry integrity as the local tarball, it SHALL treat that package as already completed. If the version exists with different integrity, it SHALL stop permanently and SHALL NOT publish or overwrite another package.

The meta package SHALL be published only after all five exact platform versions are visible from the public registry and their integrity values match `release-manifest.json`. Publication SHALL use public access and npm provenance. A rerun after partial platform-package publication SHALL safely complete the missing packages and then publish the meta package.

#### Scenario: Publish a fresh version
- **WHEN** none of the six package versions exists
- **THEN** all five platform packages are published and verified first
- **AND** the meta package is published last

#### Scenario: Recover from partial publication
- **WHEN** a prior run published some matching platform packages and then failed
- **THEN** a rerun verifies and skips matching existing versions
- **AND** it publishes only the missing packages

#### Scenario: Detect an immutable-version collision
- **WHEN** the registry already contains the requested version with different integrity
- **THEN** the release fails without overwriting, unpublishing, or continuing to the meta package

### Requirement: Public-Registry Verification Before GitHub Release
After the meta package becomes visible, a five-entry GitHub-hosted matrix SHALL install `@roblourens/agent-debug@<version>` from the public npm registry through local, global, and `npx` paths and SHALL repeat the native payload identity and core command checks. Registry propagation retries SHALL be bounded and SHALL distinguish temporary absence from integrity mismatch.

Only after public-registry verification passes SHALL the workflow remove the six npm tarballs from the matching draft GitHub Release and publish that release. The public release SHALL retain `release-manifest.json` and `SHA256SUMS`, link the six npm packages and workflow provenance, and SHALL NOT attach unsupported standalone native archives. A rerun SHALL verify and reuse an existing matching public release or repair missing matching evidence, but SHALL fail if existing evidence conflicts with the release manifest. If publication has not reached the meta package, no public GitHub Release SHALL be created. If a defect is found after the meta package is published, recovery SHALL use a new patch version rather than mutating or unpublishing the released version.

#### Scenario: Complete a successful release
- **WHEN** all public npm installation checks pass
- **THEN** the workflow creates the GitHub Release for the immutable tag
- **AND** the release evidence identifies the exact published package and executable digests

#### Scenario: Fail before meta-package publication
- **WHEN** any build, execution, performance, package, or platform-package gate fails before the meta package is published
- **THEN** no public GitHub Release is created
- **AND** the meta package version remains unpublished

#### Scenario: Find a defect after publication
- **WHEN** the public meta package exists and subsequent verification exposes a defect
- **THEN** the published version is left immutable
- **AND** remediation requires a new version

### Requirement: Least-Privilege Release Security
Workflow-level permissions SHALL default to `contents: read`. Only native build jobs that generate attestations MAY add `id-token: write` and `attestations: write`; only the npm publication job MAY add `id-token: write`; and only the draft-bundle and final GitHub Release jobs MAY add `contents: write`.

All actions SHALL be pinned to full commit SHAs, and dependency update automation SHALL be configured to propose reviewed pin updates. The release workflow SHALL use a per-tag concurrency group with cancellation disabled, SHALL reject `pull_request_target` and untrusted fork execution, and SHALL never force-push, move, or recreate a release tag.

#### Scenario: Inspect release credentials
- **WHEN** the workflow graph is reviewed
- **THEN** build, test, packaging, publication, and GitHub Release jobs each have only their required permissions
- **AND** no long-lived npm publishing secret is available

#### Scenario: Start two runs for one tag
- **WHEN** duplicate release runs target the same tag
- **THEN** the per-tag concurrency policy serializes them without cancelling an in-progress publication

### Requirement: Initial Signing and Standalone-Asset Scope
The initial npm-only distribution SHALL rely on SHA-256 manifests, GitHub artifact attestations, and npm trusted-publishing provenance. It SHALL NOT claim Apple notarization, Apple code signing, Windows Authenticode signing, or support for standalone executable downloads. The GitHub Release SHALL not attach raw executable archives.

Adding a standalone binary distribution channel or claiming platform signing/notarization SHALL require a reviewed specification update that defines key custody, signing runners, verification, rotation, revocation, and release-failure behavior.

#### Scenario: Inspect an initial release
- **WHEN** a user reviews the npm-only release evidence
- **THEN** checksums and provenance are present
- **AND** documentation does not claim that the executable is platform-signed or notarized

#### Scenario: Propose standalone native downloads
- **WHEN** an implementation attempts to attach raw native archives to a GitHub Release
- **THEN** the release is blocked until signing and standalone-distribution requirements are reviewed
