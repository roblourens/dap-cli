#!/usr/bin/env node

import path from 'node:path';

const scriptIndex = process.argv.indexOf('--script');
const scriptName = scriptIndex === -1 ? 'stopped-on-entry' : process.argv[scriptIndex + 1] ?? 'stopped-on-entry';

const modeIndex = process.argv.indexOf('--mode');
const requestedMode = modeIndex === -1 ? undefined : process.argv[modeIndex + 1];
if (requestedMode !== undefined && requestedMode !== 'launch' && requestedMode !== 'attach') {
	process.stderr.write(`Invalid --mode value: ${requestedMode}\n`);
	process.exit(2);
}

interface DapRequestMessage {
	seq: number;
	type: 'request';
	command: string;
	arguments?: unknown;
}

interface FakeStep {
	command?: string;
	expectedArguments?: Record<string, unknown>;
	success?: boolean;
	message?: string;
	event?: string;
	stderr?: string;
	body?: unknown;
	close?: boolean;
}

const scripts: Record<string, FakeStep[]> = {
	'stopped-on-entry': createLifecycleScript('launch'),
	'attach-stopped': createLifecycleScript('attach'),
	'alias-inspection': createAliasInspectionScript(),
	'expect-conditional-breakpoints': createConditionalBreakpointsScript(),
	'playwright-inspection': createPlaywrightInspectionScript(),
	'execution-control': createExecutionControlScript(),
	'auto-thread-resolve': createAutoThreadResolveScript(),
	'auto-thread-resolve-continue-fails': createAutoThreadResolveContinueFailsScript(),
	'failed-threads': createFailedThreadsScript(),
	'failed-step-out': createFailedStepOutScript(),
	'expect-launch-overrides': createLifecycleScript('launch', { request: 'launch', program: 'flag.js', cwd: 'flag-cwd' }),
	'expect-workspace-launch': createLifecycleScript('launch'),
	'expect-workspace-attach': createLifecycleScript('attach'),
	'expect-compound-launch-member-a': createLifecycleScript('launch'),
	'expect-compound-attach-member-b': createLifecycleScript('attach'),
	'expect-stop-on-entry': createLifecycleScript('launch', { stopOnEntry: true }),
	'expect-attach-overrides': createLifecycleScript('attach', { request: 'attach', port: 4711 }),
	'assert-launch-args': createLifecycleScript('launch'),
	'assert-attach-args': createLifecycleScript('attach'),
	'attach-with-process-event': [
		// Phase 10 plan 03: emits a DAP `process` event after stopped so the
		// helper-process detector can see it and (via the test seam) decide
		// whether ppid==adapterPid.
		{ command: 'initialize', body: { supportsConfigurationDoneRequest: true } },
		{ command: 'attach' },
		{ event: 'initialized' },
		{ command: 'configurationDone' },
		{ event: 'process', body: { name: 'fake-target', systemProcessId: 99999, isLocalProcess: true, startMethod: 'attach' } },
		{ event: 'stopped', body: { reason: 'entry', threadId: 1, allThreadsStopped: true } },
		{ command: 'threads', body: { threads: [{ id: 1, name: 'main' }] } },
		{ command: 'disconnect' },
		{ event: 'terminated' },
		{ close: true },
	],
	'compound-startup-fails-after-initialize': [
		{ command: 'initialize', body: { supportsConfigurationDoneRequest: true } },
		{ command: 'launch', success: false, message: 'compound fixture startup failed' },
	],
	'stop-then-transport-close': [
		// Stop-on-entry, answer one threads request, then close the transport.
		// Used by the stale-session diagnostic test.
		{ command: 'initialize', body: { supportsConfigurationDoneRequest: true } },
		{ command: 'launch' },
		{ event: 'initialized' },
		{ command: 'configurationDone' },
		{ event: 'stopped', body: { reason: 'entry', threadId: 1, allThreadsStopped: true } },
		{ command: 'threads', body: { threads: [{ id: 1, name: 'main' }] } },
		{ close: true },
	],
	'stderr-close': [
		{ stderr: 'fake adapter startup failure' },
		{ close: true },
	],
	'evaluate-auto-frame': [
		// Phase 11 plan 02: paused with one stopped thread; evaluate must
		// auto-resolve frameId to 4242 via stackTrace before sending evaluate.
		{ command: 'initialize', body: { supportsConfigurationDoneRequest: true } },
		{ command: 'launch' },
		{ event: 'initialized' },
		{ command: 'configurationDone' },
		{ event: 'stopped', body: { reason: 'breakpoint', threadId: 1 } },
		{ command: 'stackTrace', expectedArguments: { threadId: 1 }, body: { stackFrames: [{ id: 4242, name: 'f0', line: 1, column: 1 }, { id: 4243, name: 'f1', line: 2, column: 1 }], totalFrames: 2 } },
		{ command: 'evaluate', expectedArguments: { frameId: 4242, expression: 'x' }, body: { result: 'auto', variablesReference: 0 } },
		{ command: 'disconnect' },
		{ event: 'terminated' },
		{ close: true },
	],
	'evaluate-auto-frame-explicit': [
		// Phase 11 plan 02: paused, but the user passes --frame-id 9999
		// explicitly so NO stackTrace must be sent.
		{ command: 'initialize', body: { supportsConfigurationDoneRequest: true } },
		{ command: 'launch' },
		{ event: 'initialized' },
		{ command: 'configurationDone' },
		{ event: 'stopped', body: { reason: 'breakpoint', threadId: 1 } },
		{ command: 'evaluate', expectedArguments: { frameId: 9999, expression: 'x' }, body: { result: 'explicit', variablesReference: 0 } },
		{ command: 'disconnect' },
		{ event: 'terminated' },
		{ close: true },
	],
	'evaluate-auto-frame-all-threads': [
		// Phase 11 plan 02: paused with allThreadsStopped (no threadId), so
		// stoppedThreadIds is empty and the CLI must fall back to threads then
		// stackTrace.
		{ command: 'initialize', body: { supportsConfigurationDoneRequest: true } },
		{ command: 'launch' },
		{ event: 'initialized' },
		{ command: 'configurationDone' },
		{ event: 'stopped', body: { reason: 'pause', allThreadsStopped: true } },
		{ command: 'threads', body: { threads: [{ id: 7, name: 'main' }] } },
		{ command: 'stackTrace', expectedArguments: { threadId: 7 }, body: { stackFrames: [{ id: 4242, name: 'f0', line: 1, column: 1 }], totalFrames: 1 } },
		{ command: 'evaluate', expectedArguments: { frameId: 4242, expression: 'x' }, body: { result: 'all-threads', variablesReference: 0 } },
		{ command: 'disconnect' },
		{ event: 'terminated' },
		{ close: true },
	],
	'evaluate-auto-frame-empty-threads': [
		// Phase 11 plan 02: paused, but threads returns []. CLI must fall back
		// to a no-frame evaluate and emit an "auto-frame failed" hint.
		{ command: 'initialize', body: { supportsConfigurationDoneRequest: true } },
		{ command: 'launch' },
		{ event: 'initialized' },
		{ command: 'configurationDone' },
		{ event: 'stopped', body: { reason: 'pause', allThreadsStopped: true } },
		{ command: 'threads', body: { threads: [] } },
		{ command: 'evaluate', expectedArguments: { expression: 'x' }, body: { result: 'no-frame', variablesReference: 0 } },
		{ command: 'disconnect' },
		{ event: 'terminated' },
		{ close: true },
	],
	'evaluate-auto-frame-not-paused': [
		// Phase 11 plan 02: never emits a stopped event so paused stays
		// undefined. Auto-frame must skip resolution and emit the "session
		// not paused" hint.
		{ command: 'initialize', body: { supportsConfigurationDoneRequest: true } },
		{ command: 'launch' },
		{ event: 'initialized' },
		{ command: 'configurationDone' },
		{ command: 'evaluate', expectedArguments: { expression: 'x' }, body: { result: 'no-frame', variablesReference: 0 } },
		{ command: 'disconnect' },
		{ event: 'terminated' },
		{ close: true },
	],
	'paused-then-continued': [
		// Stops with reason 'entry' (NO allThreadsStopped — threadId is the
		// only stopped thread), waits for `continue`, then emits `continued`.
		// Used by the H-1 paused-projection JSON output test (plan 05-17) to
		// drive the controller through both halves of the stopped/continued
		// cycle through the published CLI envelope.
		{ command: 'initialize', body: { supportsConfigurationDoneRequest: true } },
		{ command: 'launch' },
		{ event: 'initialized' },
		{ command: 'configurationDone' },
		{ event: 'stopped', body: { reason: 'entry', threadId: 1 } },
		{ command: 'continue', body: { allThreadsContinued: true } },
		{ event: 'continued', body: { threadId: 1, allThreadsContinued: true } },
		{ command: 'disconnect' },
		{ event: 'terminated' },
		{ close: true },
	],
	'bp-tracking-failure': [
		// Phase 12 plan 01 controller unit test: success then failure.
		{ command: 'initialize', body: { supportsConfigurationDoneRequest: true } },
		{ command: 'launch' },
		{ event: 'initialized' },
		{ command: 'configurationDone' },
		{ event: 'stopped', body: { reason: 'entry', threadId: 1 } },
		{ command: 'setBreakpoints', body: { breakpoints: [{ id: 1, verified: true, line: 10 }] } },
		{ command: 'setBreakpoints', success: false, message: 'simulated failure' },
		{ command: 'disconnect' },
		{ event: 'terminated' },
		{ close: true },
	],
	'bp-tracking-empty': [
		// Phase 12 plan 01 controller unit test: set then clear via empty list.
		{ command: 'initialize', body: { supportsConfigurationDoneRequest: true } },
		{ command: 'launch' },
		{ event: 'initialized' },
		{ command: 'configurationDone' },
		{ event: 'stopped', body: { reason: 'entry', threadId: 1 } },
		{ command: 'setBreakpoints', body: { breakpoints: [{ id: 1, verified: true, line: 5 }] } },
		{ command: 'setBreakpoints', body: { breakpoints: [] } },
		{ command: 'disconnect' },
		{ event: 'terminated' },
		{ close: true },
	],
	'bp-list-clear': [
		// Phase 12 plan 01: drives setBreakpoints in two sources, then list/clear.
		// Sequence:
		//   1. setBreakpoints A (lines [10, 20])
		//   2. setBreakpoints B (line [30])
		//   3. setBreakpoints (clear A — empty list)
		//   4. setBreakpoints (clear B — empty list, from clear-all)
		{ command: 'initialize', body: { supportsConfigurationDoneRequest: true } },
		{ command: 'launch' },
		{ event: 'initialized' },
		{ command: 'configurationDone' },
		{ event: 'stopped', body: { reason: 'entry', threadId: 1 } },
		{ command: 'setBreakpoints', body: { breakpoints: [{ id: 1, verified: true, line: 10 }, { id: 2, verified: true, line: 20 }] } },
		{ command: 'setBreakpoints', body: { breakpoints: [{ id: 3, verified: true, line: 30 }] } },
		{ command: 'setBreakpoints', body: { breakpoints: [] } },
		{ command: 'setBreakpoints', body: { breakpoints: [] } },
		{ command: 'disconnect' },
		{ event: 'terminated' },
		{ close: true },
	],
	'bp-verify-all': [
		// Phase 12 plan 02: all breakpoints verified — no diagnostic.
		{ command: 'initialize', body: { supportsConfigurationDoneRequest: true, supportsLoadedSourcesRequest: true } },
		{ command: 'launch' },
		{ event: 'initialized' },
		{ command: 'configurationDone' },
		{ event: 'stopped', body: { reason: 'entry', threadId: 1 } },
		{ command: 'setBreakpoints', body: { breakpoints: [{ id: 1, verified: true, line: 10 }] } },
		{ command: 'disconnect' },
		{ event: 'terminated' },
		{ close: true },
	],
	'bp-verify-unverified-zero-sources': [
		// Phase 12 plan 02: unverified bp + 0 loaded sources → wrong-process hint.
		{ command: 'initialize', body: { supportsConfigurationDoneRequest: true, supportsLoadedSourcesRequest: true } },
		{ command: 'launch' },
		{ event: 'initialized' },
		{ command: 'configurationDone' },
		{ event: 'stopped', body: { reason: 'entry', threadId: 1 } },
		{ command: 'setBreakpoints', body: { breakpoints: [{ id: 1, verified: false, line: 10, message: 'no source loaded' }] } },
		{ command: 'loadedSources', body: { sources: [] } },
		{ command: 'disconnect' },
		{ event: 'terminated' },
		{ close: true },
	],
	'bp-verify-unverified-no-match': [
		// Phase 12 plan 02: unverified bp + loaded sources but none match → source-maps hint.
		{ command: 'initialize', body: { supportsConfigurationDoneRequest: true, supportsLoadedSourcesRequest: true } },
		{ command: 'launch' },
		{ event: 'initialized' },
		{ command: 'configurationDone' },
		{ event: 'stopped', body: { reason: 'entry', threadId: 1 } },
		{ command: 'setBreakpoints', body: { breakpoints: [{ id: 1, verified: false, line: 10 }] } },
		{ command: 'loadedSources', body: { sources: [{ path: '/some/other/file.js', name: 'other.js' }] } },
		{ command: 'disconnect' },
		{ event: 'terminated' },
		{ close: true },
	],
	'bp-verify-unverified-match': [
		// Phase 12 plan 02: unverified bp + loaded source whose basename matches → line-numbers hint.
		// The loadedSources response echoes a sentinel basename that matches `bp-verify-source.js`,
		// the integration test will pass --source ending in that basename.
		{ command: 'initialize', body: { supportsConfigurationDoneRequest: true, supportsLoadedSourcesRequest: true } },
		{ command: 'launch' },
		{ event: 'initialized' },
		{ command: 'configurationDone' },
		{ event: 'stopped', body: { reason: 'entry', threadId: 1 } },
		{ command: 'setBreakpoints', body: { breakpoints: [{ id: 1, verified: false, line: 10 }] } },
		{ command: 'loadedSources', body: { sources: [{ path: '/loaded/path/bp-verify-source.js', name: 'bp-verify-source.js' }] } },
		{ command: 'disconnect' },
		{ event: 'terminated' },
		{ close: true },
	],
	'bp-verify-no-loaded-sources-cap': [
		// Phase 12 plan 02: adapter does NOT advertise supportsLoadedSourcesRequest.
		// The CLI must short-circuit the loadedSources probe — the script declares
		// no loadedSources step so an unexpected request would crash the script.
		{ command: 'initialize', body: { supportsConfigurationDoneRequest: true } },
		{ command: 'launch' },
		{ event: 'initialized' },
		{ command: 'configurationDone' },
		{ event: 'stopped', body: { reason: 'entry', threadId: 1 } },
		{ command: 'setBreakpoints', body: { breakpoints: [{ id: 1, verified: false, line: 10 }] } },
		{ command: 'disconnect' },
		{ event: 'terminated' },
		{ close: true },
	],
	'py-evaluate-wrap-import': [
		// Phase 16-01 (PYEVAL-01): asserts the controller wraps a statement-shaped
		// expression on a debugpy-id session. Inbound `evaluate` MUST carry
		// `expression: 'exec("import os")'`.
		{ command: 'initialize', body: { supportsConfigurationDoneRequest: true } },
		{ command: 'launch' },
		{ event: 'initialized' },
		{ command: 'configurationDone' },
		{ event: 'stopped', body: { reason: 'entry', threadId: 1 } },
		{ command: 'evaluate', expectedArguments: { expression: 'exec("import os")' }, body: { result: 'wrapped-ok', variablesReference: 0 } },
		{ command: 'disconnect' },
		{ event: 'terminated' },
		{ close: true },
	],
	'py-evaluate-passthrough-expression': [
		// Phase 16-01: pure expression must NOT be wrapped on debugpy.
		{ command: 'initialize', body: { supportsConfigurationDoneRequest: true } },
		{ command: 'launch' },
		{ event: 'initialized' },
		{ command: 'configurationDone' },
		{ event: 'stopped', body: { reason: 'entry', threadId: 1 } },
		{ command: 'evaluate', expectedArguments: { expression: 'x + 1' }, body: { result: 'passthrough-ok', variablesReference: 0 } },
		{ command: 'disconnect' },
		{ event: 'terminated' },
		{ close: true },
	],
	'py-evaluate-jsdebug-untouched': [
		// Phase 16-01: the wrap path is gated on adapterId === 'debugpy';
		// js-debug must receive the statement verbatim.
		{ command: 'initialize', body: { supportsConfigurationDoneRequest: true } },
		{ command: 'launch' },
		{ event: 'initialized' },
		{ command: 'configurationDone' },
		{ event: 'stopped', body: { reason: 'entry', threadId: 1 } },
		{ command: 'evaluate', expectedArguments: { expression: 'import os' }, body: { result: 'jsdebug-untouched', variablesReference: 0 } },
		{ command: 'disconnect' },
		{ event: 'terminated' },
		{ close: true },
	],
	'py-evaluate-optout': [
		// Phase 16-01: `context: 'no-auto-wrap'` opts out of the wrap AND the
		// token is stripped before forwarding (debugpy would otherwise reject
		// an unknown `context` value).
		{ command: 'initialize', body: { supportsConfigurationDoneRequest: true } },
		{ command: 'launch' },
		{ event: 'initialized' },
		{ command: 'configurationDone' },
		{ event: 'stopped', body: { reason: 'entry', threadId: 1 } },
		{ command: 'evaluate', expectedArguments: { expression: 'import os', context: undefined }, body: { result: 'optout-ok', variablesReference: 0 } },
		{ command: 'disconnect' },
		{ event: 'terminated' },
		{ close: true },
	],
	'pause-without-stopped': [
		// Phase 17 S-08 Bug 2: pause is acked but no `stopped` event arrives.
		// Models the js-debug-bootloader silent-misroute symptom — the
		// adapter says "ok" but the targeted thread never actually halts.
		// The controller should attach a `pause_no_stopped_event` warning to
		// the response so the caller sees a diagnostic instead of an opaque
		// silent success.
		{ command: 'initialize', body: { supportsConfigurationDoneRequest: true } },
		{ command: 'launch' },
		{ event: 'initialized' },
		{ command: 'configurationDone' },
		{ event: 'stopped', body: { reason: 'entry', threadId: 1, allThreadsStopped: true } },
		{ command: 'continue', body: { allThreadsContinued: true } },
		{ event: 'continued', body: { threadId: 1, allThreadsContinued: true } },
		{ command: 'pause' },
		// Intentionally no `stopped` event after pause.
		{ command: 'disconnect' },
		{ event: 'terminated' },
		{ close: true },
	],
	'py-evaluate-syntax-error-fallback': [
		// Phase 16-01: a debugpy `evaluate` returning the SyntaxError shape
		// must be upgraded to the structured `evaluate_requires_exec` envelope
		// by the controller. The expression here is one the heuristic does NOT
		// classify as a statement, so the controller forwards it raw and the
		// adapter rejects with the SyntaxError message.
		{ command: 'initialize', body: { supportsConfigurationDoneRequest: true } },
		{ command: 'launch' },
		{ event: 'initialized' },
		{ command: 'configurationDone' },
		{ event: 'stopped', body: { reason: 'entry', threadId: 1 } },
		{ command: 'evaluate', expectedArguments: { expression: '@@@ not python @@@' }, success: false, message: 'SyntaxError: invalid syntax' },
		{ command: 'disconnect' },
		{ event: 'terminated' },
		{ close: true },
	],
};

const script = scripts[scriptName];
if (script === undefined) {
	process.stderr.write(`Unknown fake adapter script: ${scriptName}\n`);
	process.exit(2);
}
const selectedScript = script;

if (requestedMode !== undefined) {
	const validationError = validateScriptForMode(selectedScript, scriptName, requestedMode);
	if (validationError !== undefined) {
		process.stderr.write(`${validationError}\n`);
		// Emit a single output event so the lifecycle has something on the wire,
		// then close stdout so the controller's initialize request rejects with
		// DapTransportClosedError instead of hanging until the handshake timeout.
		writeMessage({ seq: 1, type: 'event', event: 'output', body: { category: 'stderr', output: `${validationError}\n` } });
		writeMessage({ seq: 2, type: 'event', event: 'terminated' });
		process.stdout.end(() => process.exit(2));
	}
}

function validateScriptForMode(steps: FakeStep[], name: string, mode: 'launch' | 'attach'): string | undefined {
	for (const step of steps) {
		if (step.command === 'launch' || step.command === 'attach') {
			if (step.command !== mode) {
				return `Fake adapter script "${name}" expects command "${step.command}" but the request was "${mode}".`;
			}
			return undefined;
		}
	}
	return `Fake adapter script "${name}" has no launch or attach step.`;
}

let buffer = Buffer.alloc(0);
let cursor = 0;

process.stdin.on('data', (chunk: Buffer) => {
	buffer = Buffer.concat([buffer, chunk]);
	while (true) {
		const message = tryReadMessage();
		if (message === undefined) {
			return;
		}

		const step = selectedScript[cursor];
		cursor += 1;
		if (step === undefined || step.command !== message.command) {
			writeResponse(message, false, `Unexpected command: ${message.command}`);
			process.exit(1);
		}

		if (step.expectedArguments !== undefined && !matchesExpectedArguments(message.arguments, step.expectedArguments)) {
			writeResponse(message, false, `Unexpected arguments for ${message.command}: ${JSON.stringify(message.arguments)}`);
			process.exit(1);
		}

		const validationError = validateDynamicArguments(scriptName, message.command, message.arguments);
		if (validationError !== undefined) {
			writeResponse(message, false, validationError);
			process.exit(1);
		}

		writeResponse(message, step.success ?? true, step.message, step.body);
		flushEvents();
	}
});

flushEvents();

function createLifecycleScript(startCommand: 'launch' | 'attach', expectedStartArguments?: Record<string, unknown>): FakeStep[] {
	const startStep: FakeStep = expectedStartArguments === undefined
		? { command: startCommand }
		: { command: startCommand, expectedArguments: expectedStartArguments };

	return [
		{ command: 'initialize', body: { supportsConfigurationDoneRequest: true } },
		startStep,
		{ event: 'initialized' },
		{ command: 'configurationDone' },
		{ event: 'stopped', body: { reason: 'entry', threadId: 1, allThreadsStopped: true } },
		{ command: 'threads', body: { threads: [{ id: 1, name: 'main' }] } },
		{ command: 'disconnect' },
		{ event: 'terminated' },
		{ close: true },
	];
}

function validateDynamicArguments(scriptName: string, command: string, actual: unknown): string | undefined {
	if (scriptName === 'assert-launch-args' || scriptName === 'assert-attach-args') {
		return validateAssertArgsScript(scriptName, command, actual);
	}
	if (scriptName !== 'expect-workspace-launch' && scriptName !== 'expect-workspace-attach' && scriptName !== 'expect-compound-launch-member-a' && scriptName !== 'expect-compound-attach-member-b') {
		return undefined;
	}
	if (command !== 'launch' && command !== 'attach') {
		return undefined;
	}
	if (typeof actual !== 'object' || actual === null || Array.isArray(actual)) {
		return `Unexpected arguments for ${command}: ${JSON.stringify(actual)}`;
	}

	const actualRecord = actual as Record<string, unknown>;
	if (scriptName === 'expect-workspace-launch') {
		const program = typeof actualRecord.program === 'string' ? actualRecord.program : '';
		const cwd = typeof actualRecord.cwd === 'string' ? actualRecord.cwd : '';
		if (actualRecord.request !== 'launch' || !program.endsWith('/workspace-launch/from-flag.js') || !cwd.endsWith('/workspace-launch') || actualRecord.customField !== 'json') {
			return `Unexpected arguments for ${command}: ${JSON.stringify(actual)}`;
		}
		return undefined;
	}

	if (scriptName === 'expect-compound-launch-member-a') {
		return validateCompoundLaunchMember(command, actualRecord);
	}

	if (scriptName === 'expect-compound-attach-member-b') {
		return validateCompoundAttachMember(command, actualRecord);
	}

	const program = typeof actualRecord.program === 'string' ? actualRecord.program : '';
	const cwd = typeof actualRecord.cwd === 'string' ? actualRecord.cwd : '';
	if (actualRecord.request !== 'attach' || !program.endsWith('/workspace-attach/worker.js') || !cwd.endsWith('/workspace-attach')) {
		return `Unexpected arguments for ${command}: ${JSON.stringify(actual)}`;
	}
	return undefined;
}

function validateCompoundLaunchMember(command: string, actualRecord: Record<string, unknown>): string | undefined {
	const program = typeof actualRecord.program === 'string' ? actualRecord.program : '';
	const cwd = typeof actualRecord.cwd === 'string' ? actualRecord.cwd : '';
	const webRoot = typeof actualRecord.webRoot === 'string' ? actualRecord.webRoot : '';
	const userDataDir = typeof actualRecord.userDataDir === 'string' ? actualRecord.userDataDir : '';
	const runtimeExecutable = typeof actualRecord.runtimeExecutable === 'string' ? actualRecord.runtimeExecutable : '';
	if (
		actualRecord.request !== 'launch' ||
		!program.endsWith('/tests/fixtures/dap-cli-target/index.js') ||
		!cwd.endsWith('/tests/fixtures/dap-cli-target') ||
		!webRoot.endsWith('/tests/fixtures/dap-cli-target/web') ||
		!userDataDir.endsWith('/.dap-cli-fixture/dap-cli-target') ||
		runtimeExecutable !== expectedFixtureRuntimeExecutable() ||
		actualRecord.cleanUp !== process.env.DAP_CLI_COMPOUND_FIXTURE ||
		actualRecord.cascadeTerminateToConfigurations !== true ||
		'preLaunchTask' in actualRecord ||
		'postDebugTask' in actualRecord ||
		'presentation' in actualRecord ||
		'internalConsoleOptions' in actualRecord
	) {
		return `Unexpected arguments for ${command}: ${JSON.stringify(actualRecord)}`;
	}
	return undefined;
}

function validateCompoundAttachMember(command: string, actualRecord: Record<string, unknown>): string | undefined {
	const program = typeof actualRecord.program === 'string' ? actualRecord.program : '';
	const cwd = typeof actualRecord.cwd === 'string' ? actualRecord.cwd : '';
	const webRoot = typeof actualRecord.webRoot === 'string' ? actualRecord.webRoot : '';
	const userDataDir = typeof actualRecord.userDataDir === 'string' ? actualRecord.userDataDir : '';
	if (
		actualRecord.request !== 'attach' ||
		actualRecord.port !== 9229 ||
		!program.endsWith('/tests/fixtures/dap-cli-target/index.js') ||
		!cwd.endsWith('/tests/fixtures/dap-cli-target') ||
		!webRoot.endsWith('/tests/fixtures/dap-cli-target/web') ||
		!userDataDir.endsWith('/.dap-cli-fixture/dap-cli-target') ||
		actualRecord.cleanUp !== process.env.DAP_CLI_COMPOUND_FIXTURE ||
		actualRecord.cascadeTerminateToConfigurations !== false ||
		'serverReadyAction' in actualRecord
	) {
		return `Unexpected arguments for ${command}: ${JSON.stringify(actualRecord)}`;
	}
	return undefined;
}

function expectedFixtureRuntimeExecutable(): string {
	if (process.platform === 'darwin') {
		return `${process.cwd()}/tests/fixtures/dap-cli-target/bin/mac-runtime`;
	}
	if (process.platform === 'win32') {
		return `${process.cwd()}\\tests\\fixtures\\dap-cli-target\\bin\\windows-runtime.exe`;
	}
	return `${process.cwd()}/tests/fixtures/dap-cli-target/bin/linux-runtime`;
}

function validateAssertArgsScript(_scriptName: string, command: string, actual: unknown): string | undefined {
	if (command !== 'launch' && command !== 'attach') {
		return undefined;
	}
	const expectRaw = process.env.DAP_CLI_FAKE_EXPECT_ARGS;
	if (expectRaw === undefined) {
		return undefined;
	}
	let expected: Record<string, unknown>;
	try {
		const parsed: unknown = JSON.parse(expectRaw);
		if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
			return `DAP_CLI_FAKE_EXPECT_ARGS must be a JSON object.`;
		}
		expected = parsed as Record<string, unknown>;
	} catch {
		return `DAP_CLI_FAKE_EXPECT_ARGS is not valid JSON.`;
	}
	if (typeof actual !== 'object' || actual === null || Array.isArray(actual)) {
		return `Unexpected arguments for ${command}: ${JSON.stringify(actual)}`;
	}
	const actualRecord = actual as Record<string, unknown>;
	for (const [key, value] of Object.entries(expected)) {
		if (JSON.stringify(actualRecord[key]) !== JSON.stringify(value)) {
			return `Argument mismatch for ${command}.${key}: expected ${JSON.stringify(value)}, got ${JSON.stringify(actualRecord[key])}`;
		}
	}
	return undefined;
}

function matchesExpectedArguments(actual: unknown, expected: Record<string, unknown>): boolean {
	if (typeof actual !== 'object' || actual === null) {
		return false;
	}

	const actualRecord = actual as Record<string, unknown>;
	return Object.entries(expected).every(([key, value]) => JSON.stringify(actualRecord[key]) === JSON.stringify(value));
}

function createFailedThreadsScript(): FakeStep[] {
	return createLifecycleScript('launch').map(step => step.command === 'threads'
		? { command: 'threads', success: false, message: 'threads failed', body: { error: { format: 'adapter threads detail' } } }
		: step);
}

function createFailedStepOutScript(): FakeStep[] {
	return [
		...createLifecycleScript('launch').slice(0, 5),
		{ command: 'threads', body: { threads: [{ id: 1, name: 'main' }] } },
		{ command: 'stepOut', success: false, message: 'Unable to step out' },
		{ command: 'disconnect' },
		{ event: 'terminated' },
		{ close: true },
	];
}

function createAliasInspectionScript(): FakeStep[] {
	return [
		...createLifecycleScript('launch').slice(0, 5),
		{ command: 'threads', body: { threads: [{ id: 1, name: 'main' }] } },
		{ command: 'setBreakpoints', body: { breakpoints: [{ id: 1, verified: true, line: 5 }] } },
		{ command: 'threads', body: { threads: [{ id: 1, name: 'main' }] } },
		{ command: 'stackTrace', body: { stackFrames: [{ id: 10, name: 'main', line: 5, column: 1, source: { path: 'app.ts' } }], totalFrames: 1 } },
		{ command: 'scopes', body: { scopes: [{ name: 'Local', variablesReference: 100, expensive: false }] } },
		{ command: 'variables', body: { variables: [{ name: 'value', value: '1', variablesReference: 0 }] } },
		{ command: 'source', body: { content: 'const value = 1;\n', mimeType: 'text/typescript' } },
		{ command: 'evaluate', body: { result: '2', variablesReference: 0 } },
		{ command: 'disconnect' },
		{ event: 'terminated' },
		{ close: true },
	];
}

function createConditionalBreakpointsScript(): FakeStep[] {
	return [
		...createLifecycleScript('launch').slice(0, 5),
		{
			command: 'setBreakpoints',
			expectedArguments: {
				source: { path: path.resolve('app.js') },
				lines: [5, 9],
				breakpoints: [
					{ line: 5, condition: 'left > 3', hitCondition: '2', logMessage: 'left={left}' },
					{ line: 9, condition: 'left > 3', hitCondition: '2', logMessage: 'left={left}' },
				],
			},
			body: { breakpoints: [{ id: 1, verified: true, line: 5 }, { id: 2, verified: true, line: 9 }] },
		},
		{ command: 'disconnect' },
		{ event: 'terminated' },
		{ close: true },
	];
}

function createPlaywrightInspectionScript(): FakeStep[] {
	return [
		...createLifecycleScript('launch').slice(0, 5),
		{ command: 'threads', body: { threads: [{ id: 1, name: 'main' }] } },
		{ command: 'stackTrace', body: { stackFrames: [{ id: 10, name: 'calculate', line: 2, column: 3, source: { name: 'app.js', path: 'tests/fixtures/simple-chrome-page/app.js' } }], totalFrames: 1 } },
		{ command: 'scopes', body: { scopes: [{ name: 'Locals', variablesReference: 100, expensive: false }] } },
		{ command: 'variables', body: { variables: [{ name: 'left', value: '4', variablesReference: 0 }, { name: 'right', value: '6', variablesReference: 0 }, { name: 'result', value: '10', variablesReference: 0 }] } },
		{ command: 'continue', body: { allThreadsContinued: true } },
		{ command: 'disconnect' },
		{ event: 'terminated' },
		{ close: true },
	];
}

function createExecutionControlScript(): FakeStep[] {
	return [
		...createLifecycleScript('launch').slice(0, 5),
		{ command: 'continue', body: { allThreadsContinued: true } },
		{ event: 'continued', body: { threadId: 1, allThreadsContinued: true } },
		{ command: 'pause' },
		{ event: 'stopped', body: { reason: 'pause', threadId: 1, allThreadsStopped: true } },
		{ command: 'next' },
		{ event: 'stopped', body: { reason: 'step', threadId: 1, allThreadsStopped: true } },
		{ command: 'stepIn' },
		{ event: 'stopped', body: { reason: 'step', threadId: 1, allThreadsStopped: true } },
		{ command: 'stepOut' },
		{ event: 'stopped', body: { reason: 'step', threadId: 1, allThreadsStopped: true } },
		{ command: 'disconnect' },
		{ event: 'terminated' },
		{ close: true },
	];
}

function createAutoThreadResolveScript(): FakeStep[] {
	// Session is paused-on-entry with a single thread (id=1); auto-resolve
	// should pick it for `continue`/`stack` even when --thread-id is omitted.
	// The stopped event uses allThreadsStopped:true, so stoppedThreadIds is
	// empty by design; auto-resolve falls back to the threads list.
	return [
		...createLifecycleScript('launch').slice(0, 5),
		// stack: auto-resolve threads, then stackTrace.
		{ command: 'threads', body: { threads: [{ id: 1, name: 'main' }] } },
		{ command: 'stackTrace', expectedArguments: { threadId: 1, levels: 1 }, body: { stackFrames: [{ id: 10, name: 'main', line: 1, column: 1 }], totalFrames: 1 } },
		// continue: auto-resolve threads, then continue.
		{ command: 'threads', body: { threads: [{ id: 1, name: 'main' }] } },
		{ command: 'continue', expectedArguments: { threadId: 1 }, body: { allThreadsContinued: true } },
		{ event: 'continued', body: { threadId: 1, allThreadsContinued: true } },
		{ command: 'disconnect' },
		{ event: 'terminated' },
		{ close: true },
	];
}

function createAutoThreadResolveContinueFailsScript(): FakeStep[] {
	// Same paused-on-entry single-thread shape as auto-thread-resolve, but the
	// continue request returns success:false. Lets the integration suite assert
	// that the auto-resolve warning emitted by the CLI survives into the failure
	// envelope's meta.warnings instead of being dropped.
	return [
		...createLifecycleScript('launch').slice(0, 5),
		{ command: 'threads', body: { threads: [{ id: 1, name: 'main' }] } },
		{ command: 'continue', expectedArguments: { threadId: 1 }, success: false, message: 'simulated continue failure' },
		{ command: 'disconnect' },
		{ event: 'terminated' },
		{ close: true },
	];
}

function flushEvents(): void {
	while (true) {
		const step = selectedScript[cursor];
		if (step === undefined || step.command !== undefined) {
			return;
		}

		cursor += 1;
		if (step.stderr !== undefined) {
			process.stderr.write(`${step.stderr}\n`);
			continue;
		}
		if (step.event !== undefined) {
			writeMessage({ seq: 1_000 + cursor, type: 'event', event: step.event, body: step.body });
			continue;
		}

		if (step.close === true) {
			process.exit(0);
		}
	}
}

function tryReadMessage(): DapRequestMessage | undefined {
	const headerEnd = buffer.indexOf('\r\n\r\n');
	if (headerEnd === -1) {
		return undefined;
	}

	const header = buffer.subarray(0, headerEnd).toString('ascii');
	const match = /^Content-Length: (\d+)$/im.exec(header);
	if (match === null) {
		throw new Error('Missing Content-Length header.');
	}

	const contentLength = Number.parseInt(match[1] ?? '', 10);
	const bodyStart = headerEnd + 4;
	const bodyEnd = bodyStart + contentLength;
	if (buffer.length < bodyEnd) {
		return undefined;
	}

	const message = JSON.parse(buffer.subarray(bodyStart, bodyEnd).toString('utf8')) as DapRequestMessage;
	buffer = buffer.subarray(bodyEnd);
	return message;
}

function writeResponse(request: DapRequestMessage, success: boolean, message?: string, body?: unknown): void {
	writeMessage({ seq: 2_000 + cursor, type: 'response', request_seq: request.seq, command: request.command, success, message, body });
}

function writeMessage(message: unknown): void {
	const content = Buffer.from(JSON.stringify(message), 'utf8');
	process.stdout.write(Buffer.concat([Buffer.from(`Content-Length: ${content.length}\r\n\r\n`, 'ascii'), content]));
}
