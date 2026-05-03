#!/usr/bin/env node

const scriptIndex = process.argv.indexOf('--script');
const scriptName = scriptIndex === -1 ? 'stopped-on-entry' : process.argv[scriptIndex + 1] ?? 'stopped-on-entry';

interface DapRequestMessage {
	seq: number;
	type: 'request';
	command: string;
}

interface FakeStep {
	command?: string;
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
	'execution-control': createExecutionControlScript(),
	'failed-threads': createFailedThreadsScript(),
	'stderr-close': [
		{ stderr: 'fake adapter startup failure' },
		{ close: true },
	],
};

const script = scripts[scriptName];
if (script === undefined) {
	process.stderr.write(`Unknown fake adapter script: ${scriptName}\n`);
	process.exit(2);
}
const selectedScript = script;

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

		writeResponse(message, step.success ?? true, step.message, step.body);
		flushEvents();
	}
});

flushEvents();

function createLifecycleScript(startCommand: 'launch' | 'attach'): FakeStep[] {
	return [
		{ command: 'initialize', body: { supportsConfigurationDoneRequest: true } },
		{ command: startCommand },
		{ event: 'initialized' },
		{ command: 'configurationDone' },
		{ event: 'stopped', body: { reason: 'entry', threadId: 1, allThreadsStopped: true } },
		{ command: 'threads', body: { threads: [{ id: 1, name: 'main' }] } },
		{ command: 'disconnect' },
		{ event: 'terminated' },
		{ close: true },
	];
}

function createFailedThreadsScript(): FakeStep[] {
	return createLifecycleScript('launch').map(step => step.command === 'threads'
		? { command: 'threads', success: false, message: 'threads failed' }
		: step);
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
