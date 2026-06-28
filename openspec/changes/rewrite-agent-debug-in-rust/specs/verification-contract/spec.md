## ADDED Requirements

### Requirement: Clean-Room Source Boundary
The TypeScript implementation source SHALL be deleted before Rust implementation begins. Implementation MAY use the reviewed OpenSpec artifacts and preserved tests, fixtures, and manual documentation, but SHALL NOT use git history or deleted source as implementation references.

#### Scenario: Begin Rust implementation
- **WHEN** implementation of the Rust replacement starts
- **THEN** the TypeScript implementation source has already been deleted
- **AND** implementers use only the permitted clean-room inputs

#### Scenario: Encounter missing behavioral detail
- **WHEN** a behavior is not defined by OpenSpec or the preserved verification assets
- **THEN** the implementation resolves the gap without consulting git history or deleted source

### Requirement: Specification Precedence
The reviewed OpenSpec requirements SHALL define the replacement product contract and SHALL override behavior, names, assertions, or assumptions in preserved assets that reflect legacy drift.

#### Scenario: Preserved test conflicts with OpenSpec
- **WHEN** a preserved test, fixture, helper, or manual document conflicts with an OpenSpec requirement
- **THEN** the asset is adapted or replaced to conform to OpenSpec
- **AND** the legacy behavior is not treated as authoritative

### Requirement: Versioned Verification Coverage Manifest
The clean-room handoff SHALL create a versioned coverage manifest that records each preserved test file, helper, fixture group, and smoke scenario; the behavior it covers; and its retain/adapt, port, replace, or retire disposition. The initial dated survey evidence is 63 `*.test.ts` files, 109 total files under `tests/`, 568 textual `test()` or `it()` declarations, and 3 files under `dev/smoke/`, but those counts SHALL remain historical evidence rather than permanent acceptance targets.

#### Scenario: Accept the clean-room handoff
- **WHEN** the TypeScript source deletion boundary is established
- **THEN** every preserved verification asset is represented in the coverage manifest
- **AND** the manifest records the initial survey counts and date for audit history

#### Scenario: Migrate or replace tests
- **WHEN** files and test counts change during the Rust rewrite
- **THEN** the coverage manifest is updated with the new location and disposition
- **AND** release acceptance checks behavior coverage rather than preserving historical file counts

### Requirement: Classified Test Migration
The verification plan SHALL classify tests by migration strategy without claiming that all TypeScript tests run unchanged. It SHALL retain or adapt black-box subprocess tests and fixtures, port pure logic, state, and protocol tests to Rust, and replace TypeScript module-boundary and build-specific tests with Rust-appropriate verification.

#### Scenario: Classify an existing test
- **WHEN** a preserved test is evaluated for the Rust rewrite
- **THEN** it is assigned an explicit retain/adapt, port, replace, or intentionally retire disposition
- **AND** its disposition is justified by the behavior it verifies rather than by its original language

### Requirement: Functional Helper Preservation
Setup helpers and fake-release helpers SHALL be preserved functionally, but MAY be rewritten or reorganized for the Rust implementation and native packaging model.

#### Scenario: Migrate a preserved helper
- **WHEN** a setup or fake-release helper depends on TypeScript-specific modules or build output
- **THEN** replacement verification provides equivalent observable setup or fake-release behavior
- **AND** it does not require preserving the original module boundary

### Requirement: Test-Only Fake Adapter
Deterministic fake-adapter coverage SHALL use a test-only fixture or helper that is not registered as a public built-in adapter and does not add public launch or attach options.

#### Scenario: Run deterministic DAP tests
- **WHEN** protocol, lifecycle, controller, or CLI tests require a fake adapter
- **THEN** the test harness starts the private fixture through an internal test seam
- **AND** public `agent-debug` help, adapter listing, launch inference, and setup commands do not expose a fake adapter

### Requirement: Gated External Integration Tests
Tests that require real debug adapters or browsers SHALL remain environment-gated and SHALL run in designated CI or release jobs with their required external dependencies.

#### Scenario: Run the default local test suite
- **WHEN** the enabling environment variables for real-adapter or browser tests are absent
- **THEN** those tests do not attempt external adapter or browser execution

#### Scenario: Run designated integration validation
- **WHEN** the enabling environment variables and dependencies are present in a designated job
- **THEN** the applicable real-adapter and browser tests execute against the native product

### Requirement: Installed npm Binary Verification
Packaging verification SHALL install `@roblourens/agent-debug` through its npm distribution path and SHALL execute the installed native binary rather than a workspace build artifact.

#### Scenario: Validate npm packaging
- **WHEN** the packaging test installs a produced npm package on a supported target
- **THEN** it invokes the installed `agent-debug` executable
- **AND** it verifies that the executable is the expected native payload and does not invoke a Node.js CLI wrapper

### Requirement: Hand-Driven Smoke Verification
Every verification round SHALL hand-drive the adapted Sequence A and Sequence B from the preserved smoke documentation against the native executable. Sequence C SHALL also be hand-driven whenever provisioning behavior changes.

#### Scenario: Complete a standard verification round
- **WHEN** a verification round is performed
- **THEN** a human-driven terminal run of adapted Sequence A and Sequence B is captured as verification evidence

#### Scenario: Verify a provisioning change
- **WHEN** adapter provisioning behavior changes
- **THEN** the verification round also captures a human-driven terminal run of adapted Sequence C

### Requirement: Release Acceptance Gates
Release acceptance SHALL include every gate defined by `release-pipeline`, the distribution performance gates, cross-platform CI for every supported binary target, native Rust tests, migrated behavioral verification, packaging verification, and the required hand-driven smoke sequences.

#### Scenario: Accept a release candidate
- **WHEN** a release candidate is evaluated
- **THEN** all required verification categories pass
- **AND** each supported macOS, Linux, and Windows binary target has cross-platform CI evidence
- **AND** the startup performance budgets and baseline-improvement requirement pass

### Requirement: Irreversible Implementation Boundary
The TypeScript implementation deletion SHALL NOT be rolled back during implementation as a means of recovering behavior, passing tests, or completing the Rust rewrite.

#### Scenario: Rust implementation encounters a regression
- **WHEN** verification exposes missing or incorrect behavior
- **THEN** the Rust implementation, OpenSpec, or permitted verification assets are corrected
- **AND** deleted TypeScript implementation source is not restored
