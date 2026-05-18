import net from 'node:net';
import { PassThrough } from 'node:stream';
import type { DapProtocolMessage, DapRequestMessage, DapResponseMessage } from '../protocol/dapMessages.js';
import { DapMessageParser, encodeDapMessage } from '../protocol/framing.js';
import type { DapTransport } from '../protocol/transport.js';
import type { FakeAdapterScript, FakeAdapterScriptStep } from './dapScript.js';

export function createFakeAdapterScript(name: string): FakeAdapterScript {
  if (name === 'attach-stopped') {
    return createLifecycleScript(name, 'attach');
  }

  if (name === 'stderr-stopped') {
    return {
      name,
      steps: [
        { kind: 'writeStderr', text: 'fake adapter diagnostic' },
        ...createLifecycleScript(name, 'launch').steps,
      ],
    };
  }

  if (name === 'failed-threads') {
    const script = createLifecycleScript(name, 'launch');
    return {
      name,
      steps: script.steps.map(step => step.kind === 'expectRequest' && step.command === 'threads'
        ? { kind: 'expectRequest', command: 'threads', respond: { seq: 6, type: 'response', request_seq: 0, success: false, command: 'threads', message: 'threads failed', body: { error: { format: 'adapter threads detail' } } } }
        : step),
    };
  }

  if (name === 'failed-step-out') {
    return {
      name,
      steps: [
        { kind: 'expectRequest', command: 'initialize', respond: { seq: 1, type: 'response', request_seq: 0, success: true, command: 'initialize', body: { supportsConfigurationDoneRequest: true } } },
        { kind: 'expectRequest', command: 'launch', respond: { seq: 2, type: 'response', request_seq: 0, success: true, command: 'launch' } },
        { kind: 'sendEvent', event: { seq: 3, type: 'event', event: 'initialized' } },
        { kind: 'expectRequest', command: 'configurationDone', respond: { seq: 4, type: 'response', request_seq: 0, success: true, command: 'configurationDone' } },
        { kind: 'sendEvent', event: { seq: 5, type: 'event', event: 'stopped', body: { reason: 'entry', threadId: 1 } } },
        { kind: 'expectRequest', command: 'threads', respond: { seq: 6, type: 'response', request_seq: 0, success: true, command: 'threads', body: { threads: [{ id: 1, name: 'main' }] } } },
        { kind: 'expectRequest', command: 'stepOut', respond: { seq: 7, type: 'response', request_seq: 0, success: false, command: 'stepOut', message: 'Unable to step out' } },
        { kind: 'expectRequest', command: 'disconnect', respond: { seq: 8, type: 'response', request_seq: 0, success: true, command: 'disconnect' } },
        { kind: 'sendEvent', event: { seq: 9, type: 'event', event: 'terminated' } },
      ],
    };
  }

  if (name === 'playwright-inspection') {
    return createPlaywrightInspectionScript(name);
  }

  if (name === 'stderr-close') {
    return {
      name,
      steps: [
        { kind: 'writeStderr', text: 'fake adapter startup failure' },
        { kind: 'closeTransport' },
      ],
    };
  }

  if (name === 'expect-launch-overrides') {
    return createLifecycleScript(name, 'launch', { request: 'launch', program: 'flag.js', cwd: 'flag-cwd' });
  }

  if (name === 'expect-stop-on-entry') {
    return createLifecycleScript(name, 'launch', { stopOnEntry: true });
  }

  if (name === 'expect-attach-overrides') {
    return createLifecycleScript(name, 'attach', { request: 'attach', port: 4711 });
  }

  if (name === 'expect-compound-launch-member-a') {
    return createLifecycleScript(name, 'launch', {
      request: 'launch',
      cleanUp: 'fixture-env',
      cascadeTerminateToConfigurations: true,
    });
  }

  if (name === 'expect-compound-attach-member-b') {
    return createLifecycleScript(name, 'attach', {
      request: 'attach',
      port: 9229,
      cleanUp: 'fixture-env',
      cascadeTerminateToConfigurations: false,
    });
  }

  if (name === 'compound-startup-fails-after-initialize') {
    return {
      name,
      steps: [
        { kind: 'expectRequest', command: 'initialize', respond: { seq: 1, type: 'response', request_seq: 0, success: true, command: 'initialize', body: { supportsConfigurationDoneRequest: true } } },
        { kind: 'expectRequest', command: 'launch', respond: { seq: 2, type: 'response', request_seq: 0, success: false, command: 'launch', message: 'compound fixture startup failed' } },
      ],
    };
  }

  if (name === 'stop-then-transport-close') {
    // Stop-on-entry, answer one threads request, then close the transport.
    // Used to exercise the adapter_transport_closed stale-session diagnostic.
    return {
      name,
      steps: [
        { kind: 'expectRequest', command: 'initialize', respond: { seq: 1, type: 'response', request_seq: 0, success: true, command: 'initialize', body: { supportsConfigurationDoneRequest: true } } },
        { kind: 'expectRequest', command: 'launch', respond: { seq: 2, type: 'response', request_seq: 0, success: true, command: 'launch' } },
        { kind: 'sendEvent', event: { seq: 3, type: 'event', event: 'initialized' } },
        { kind: 'expectRequest', command: 'configurationDone', respond: { seq: 4, type: 'response', request_seq: 0, success: true, command: 'configurationDone' } },
        { kind: 'sendEvent', event: { seq: 5, type: 'event', event: 'stopped', body: { reason: 'breakpoint', threadId: 1 } } },
        { kind: 'expectRequest', command: 'threads', respond: { seq: 6, type: 'response', request_seq: 0, success: true, command: 'threads', body: { threads: [{ id: 1, name: 'main' }] } } },
        { kind: 'closeTransport' },
      ],
    };
  }

  if (name === 'evaluate-auto-frame') {
    // Phase 11 plan 02: paused with one stopped thread; the CLI evaluate
    // handler resolves frameId via stackTrace then fires evaluate. Asserts
    // the inbound evaluate carries arguments.frameId === 4242.
    return {
      name,
      steps: [
        { kind: 'expectRequest', command: 'initialize', respond: { seq: 1, type: 'response', request_seq: 0, success: true, command: 'initialize', body: { supportsConfigurationDoneRequest: true } } },
        { kind: 'expectRequest', command: 'launch', respond: { seq: 2, type: 'response', request_seq: 0, success: true, command: 'launch' } },
        { kind: 'sendEvent', event: { seq: 3, type: 'event', event: 'initialized' } },
        { kind: 'expectRequest', command: 'configurationDone', respond: { seq: 4, type: 'response', request_seq: 0, success: true, command: 'configurationDone' } },
        { kind: 'sendEvent', event: { seq: 5, type: 'event', event: 'stopped', body: { reason: 'breakpoint', threadId: 1 } } },
        { kind: 'expectRequest', command: 'stackTrace', expectedArguments: { threadId: 1 }, respond: { seq: 6, type: 'response', request_seq: 0, success: true, command: 'stackTrace', body: { stackFrames: [{ id: 4242, name: 'f0', line: 1, column: 1 }, { id: 4243, name: 'f1', line: 2, column: 1 }], totalFrames: 2 } } },
        { kind: 'expectRequest', command: 'evaluate', expectedArguments: { frameId: 4242, expression: 'x' }, respond: { seq: 7, type: 'response', request_seq: 0, success: true, command: 'evaluate', body: { result: 'auto', variablesReference: 0 } } },
        { kind: 'expectRequest', command: 'disconnect', respond: { seq: 8, type: 'response', request_seq: 0, success: true, command: 'disconnect' } },
        { kind: 'sendEvent', event: { seq: 9, type: 'event', event: 'terminated' } },
      ],
    };
  }

  if (name === 'evaluate-auto-frame-explicit') {
    // Phase 11 plan 02: paused, but the user passes --frame-id explicitly,
    // so NO stackTrace must be sent — the evaluate goes straight through
    // with the verbatim frameId.
    return {
      name,
      steps: [
        { kind: 'expectRequest', command: 'initialize', respond: { seq: 1, type: 'response', request_seq: 0, success: true, command: 'initialize', body: { supportsConfigurationDoneRequest: true } } },
        { kind: 'expectRequest', command: 'launch', respond: { seq: 2, type: 'response', request_seq: 0, success: true, command: 'launch' } },
        { kind: 'sendEvent', event: { seq: 3, type: 'event', event: 'initialized' } },
        { kind: 'expectRequest', command: 'configurationDone', respond: { seq: 4, type: 'response', request_seq: 0, success: true, command: 'configurationDone' } },
        { kind: 'sendEvent', event: { seq: 5, type: 'event', event: 'stopped', body: { reason: 'breakpoint', threadId: 1 } } },
        { kind: 'expectRequest', command: 'evaluate', expectedArguments: { frameId: 9999, expression: 'x' }, respond: { seq: 6, type: 'response', request_seq: 0, success: true, command: 'evaluate', body: { result: 'explicit', variablesReference: 0 } } },
        { kind: 'expectRequest', command: 'disconnect', respond: { seq: 7, type: 'response', request_seq: 0, success: true, command: 'disconnect' } },
        { kind: 'sendEvent', event: { seq: 8, type: 'event', event: 'terminated' } },
      ],
    };
  }

  if (name === 'evaluate-auto-frame-all-threads') {
    // Phase 11 plan 02: paused with allThreadsStopped (no specific threadId
    // in the stopped body), so stoppedThreadIds is empty and the CLI must
    // fall back to threads → stackTrace → evaluate.
    return {
      name,
      steps: [
        { kind: 'expectRequest', command: 'initialize', respond: { seq: 1, type: 'response', request_seq: 0, success: true, command: 'initialize', body: { supportsConfigurationDoneRequest: true } } },
        { kind: 'expectRequest', command: 'launch', respond: { seq: 2, type: 'response', request_seq: 0, success: true, command: 'launch' } },
        { kind: 'sendEvent', event: { seq: 3, type: 'event', event: 'initialized' } },
        { kind: 'expectRequest', command: 'configurationDone', respond: { seq: 4, type: 'response', request_seq: 0, success: true, command: 'configurationDone' } },
        { kind: 'sendEvent', event: { seq: 5, type: 'event', event: 'stopped', body: { reason: 'pause', allThreadsStopped: true } } },
        { kind: 'expectRequest', command: 'threads', respond: { seq: 6, type: 'response', request_seq: 0, success: true, command: 'threads', body: { threads: [{ id: 7, name: 'main' }] } } },
        { kind: 'expectRequest', command: 'stackTrace', expectedArguments: { threadId: 7 }, respond: { seq: 7, type: 'response', request_seq: 0, success: true, command: 'stackTrace', body: { stackFrames: [{ id: 4242, name: 'f0', line: 1, column: 1 }], totalFrames: 1 } } },
        { kind: 'expectRequest', command: 'evaluate', expectedArguments: { frameId: 4242, expression: 'x' }, respond: { seq: 8, type: 'response', request_seq: 0, success: true, command: 'evaluate', body: { result: 'all-threads', variablesReference: 0 } } },
        { kind: 'expectRequest', command: 'disconnect', respond: { seq: 9, type: 'response', request_seq: 0, success: true, command: 'disconnect' } },
        { kind: 'sendEvent', event: { seq: 10, type: 'event', event: 'terminated' } },
      ],
    };
  }

  if (name === 'evaluate-auto-frame-empty-threads') {
    // Phase 11 plan 02: paused with allThreadsStopped, but threads request
    // returns []. CLI must fall back to a no-frame evaluate and emit an
    // auto-frame failed hint.
    return {
      name,
      steps: [
        { kind: 'expectRequest', command: 'initialize', respond: { seq: 1, type: 'response', request_seq: 0, success: true, command: 'initialize', body: { supportsConfigurationDoneRequest: true } } },
        { kind: 'expectRequest', command: 'launch', respond: { seq: 2, type: 'response', request_seq: 0, success: true, command: 'launch' } },
        { kind: 'sendEvent', event: { seq: 3, type: 'event', event: 'initialized' } },
        { kind: 'expectRequest', command: 'configurationDone', respond: { seq: 4, type: 'response', request_seq: 0, success: true, command: 'configurationDone' } },
        { kind: 'sendEvent', event: { seq: 5, type: 'event', event: 'stopped', body: { reason: 'pause', allThreadsStopped: true } } },
        { kind: 'expectRequest', command: 'threads', respond: { seq: 6, type: 'response', request_seq: 0, success: true, command: 'threads', body: { threads: [] } } },
        { kind: 'expectRequest', command: 'evaluate', expectedArguments: { expression: 'x' }, respond: { seq: 7, type: 'response', request_seq: 0, success: true, command: 'evaluate', body: { result: 'no-frame', variablesReference: 0 } } },
        { kind: 'expectRequest', command: 'disconnect', respond: { seq: 8, type: 'response', request_seq: 0, success: true, command: 'disconnect' } },
        { kind: 'sendEvent', event: { seq: 9, type: 'event', event: 'terminated' } },
      ],
    };
  }

  if (name === 'evaluate-auto-frame-not-paused') {
    // Phase 11 plan 02: launch never emits a stopped event so paused stays
    // undefined. Auto-frame must skip resolution and send evaluate with no
    // frameId, emitting the "session not paused" hint.
    return {
      name,
      steps: [
        { kind: 'expectRequest', command: 'initialize', respond: { seq: 1, type: 'response', request_seq: 0, success: true, command: 'initialize', body: { supportsConfigurationDoneRequest: true } } },
        { kind: 'expectRequest', command: 'launch', respond: { seq: 2, type: 'response', request_seq: 0, success: true, command: 'launch' } },
        { kind: 'sendEvent', event: { seq: 3, type: 'event', event: 'initialized' } },
        { kind: 'expectRequest', command: 'configurationDone', respond: { seq: 4, type: 'response', request_seq: 0, success: true, command: 'configurationDone' } },
        { kind: 'expectRequest', command: 'evaluate', expectedArguments: { expression: 'x' }, respond: { seq: 5, type: 'response', request_seq: 0, success: true, command: 'evaluate', body: { result: 'no-frame', variablesReference: 0 } } },
        { kind: 'expectRequest', command: 'disconnect', respond: { seq: 6, type: 'response', request_seq: 0, success: true, command: 'disconnect' } },
        { kind: 'sendEvent', event: { seq: 7, type: 'event', event: 'terminated' } },
      ],
    };
  }

  if (name === 'paused-then-continued') {
    // Stops with reason 'entry', waits for a `continue` request, then emits a
    // `continued` event. Used by the H-1 paused-projection JSON output test
    // (plan 05-17) to drive the controller through both halves of the
    // stopped/continued cycle.
    return {
      name,
      steps: [
        { kind: 'expectRequest', command: 'initialize', respond: { seq: 1, type: 'response', request_seq: 0, success: true, command: 'initialize', body: { supportsConfigurationDoneRequest: true } } },
        { kind: 'expectRequest', command: 'launch', respond: { seq: 2, type: 'response', request_seq: 0, success: true, command: 'launch' } },
        { kind: 'sendEvent', event: { seq: 3, type: 'event', event: 'initialized' } },
        { kind: 'expectRequest', command: 'configurationDone', respond: { seq: 4, type: 'response', request_seq: 0, success: true, command: 'configurationDone' } },
        { kind: 'sendEvent', event: { seq: 5, type: 'event', event: 'stopped', body: { reason: 'entry', threadId: 1 } } },
        { kind: 'expectRequest', command: 'continue', respond: { seq: 6, type: 'response', request_seq: 0, success: true, command: 'continue', body: { allThreadsContinued: true } } },
        { kind: 'sendEvent', event: { seq: 7, type: 'event', event: 'continued', body: { threadId: 1, allThreadsContinued: true } } },
        { kind: 'expectRequest', command: 'disconnect', respond: { seq: 8, type: 'response', request_seq: 0, success: true, command: 'disconnect' } },
        { kind: 'sendEvent', event: { seq: 9, type: 'event', event: 'terminated' } },
      ],
    };
  }

  return createLifecycleScript(name, 'launch');
}

function createPlaywrightInspectionScript(name: string): FakeAdapterScript {
  return {
    name,
    steps: [
      { kind: 'expectRequest', command: 'initialize', respond: { seq: 1, type: 'response', request_seq: 0, success: true, command: 'initialize', body: { supportsConfigurationDoneRequest: true } } },
      { kind: 'expectRequest', command: 'launch', respond: { seq: 2, type: 'response', request_seq: 0, success: true, command: 'launch' } },
      { kind: 'sendEvent', event: { seq: 3, type: 'event', event: 'initialized' } },
      { kind: 'expectRequest', command: 'configurationDone', respond: { seq: 4, type: 'response', request_seq: 0, success: true, command: 'configurationDone' } },
      { kind: 'sendEvent', event: { seq: 5, type: 'event', event: 'stopped', body: { reason: 'breakpoint', threadId: 1 } } },
      { kind: 'expectRequest', command: 'threads', respond: { seq: 6, type: 'response', request_seq: 0, success: true, command: 'threads', body: { threads: [{ id: 1, name: 'main' }] } } },
      { kind: 'expectRequest', command: 'stackTrace', respond: { seq: 7, type: 'response', request_seq: 0, success: true, command: 'stackTrace', body: { stackFrames: [{ id: 10, name: 'calculate', line: 2, column: 3, source: { name: 'app.js', path: 'tests/fixtures/simple-chrome-page/app.js' } }], totalFrames: 1 } } },
      { kind: 'expectRequest', command: 'scopes', respond: { seq: 8, type: 'response', request_seq: 0, success: true, command: 'scopes', body: { scopes: [{ name: 'Locals', variablesReference: 100, expensive: false }] } } },
      { kind: 'expectRequest', command: 'variables', respond: { seq: 9, type: 'response', request_seq: 0, success: true, command: 'variables', body: { variables: [{ name: 'left', value: '4', variablesReference: 0 }, { name: 'right', value: '6', variablesReference: 0 }, { name: 'result', value: '10', variablesReference: 0 }] } } },
      { kind: 'expectRequest', command: 'continue', respond: { seq: 10, type: 'response', request_seq: 0, success: true, command: 'continue', body: { allThreadsContinued: true } } },
      { kind: 'expectRequest', command: 'disconnect', respond: { seq: 11, type: 'response', request_seq: 0, success: true, command: 'disconnect' } },
      { kind: 'sendEvent', event: { seq: 12, type: 'event', event: 'terminated' } },
    ],
  };
}

export function createFakeAdapterTransport(script: FakeAdapterScript, mode?: 'launch' | 'attach'): DapTransport {
  if (mode !== undefined) {
    validateScriptForMode(script, mode);
  }
  const clientToAdapter = new PassThrough();
  const adapterToClient = new PassThrough();
  runFakeAdapterScript(script, clientToAdapter, adapterToClient, process.stderr);
  return {
    name: script.name,
    readable: adapterToClient,
    writable: clientToAdapter,
    close(): Promise<void> {
      clientToAdapter.end();
      adapterToClient.end();
      return Promise.resolve();
    },
  };
}

export async function startFakeSocketAdapter(script: FakeAdapterScript, mode?: 'launch' | 'attach'): Promise<{ port: number; requests: DapRequestMessage[]; close(): Promise<void> }> {
  if (mode !== undefined) {
    validateScriptForMode(script, mode);
  }
  const requests: DapRequestMessage[] = [];
  const server = net.createServer(socket => {
    socket.on('error', () => undefined);
    runFakeAdapterScript(script, socket, socket, process.stderr, request => requests.push(request));
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      server.off('error', reject);
      resolve();
    });
  });

  const address = server.address();
  if (typeof address !== 'object' || address === null) {
    throw new Error('Fake socket adapter did not bind to a TCP port.');
  }

  return {
    port: address.port,
    requests,
    close: () => new Promise(resolve => server.close(() => resolve())),
  };
}

export function runFakeAdapterScript(script: FakeAdapterScript, input: NodeJS.ReadableStream, output: NodeJS.WritableStream, stderr: NodeJS.WritableStream, onRequest?: (request: DapRequestMessage) => void): void {
  const parser = new DapMessageParser();
  const remainingSteps = [...script.steps];

  for (const step of consumeLeadingNonRequestSteps(remainingSteps)) {
    executeNonRequestStep(step, output, stderr);
  }

  input.on('data', (chunk: Buffer) => {
    for (const message of parser.push(chunk)) {
      if (message.type !== 'request') {
        continue;
      }
      onRequest?.(message);

      const step = remainingSteps.shift();
      if (step?.kind !== 'expectRequest' || step.command !== message.command) {
        writeMessage(output, createResponse(message, false, `Unexpected request: ${message.command}`));
        continue;
      }

      if (step.expectedArguments !== undefined && !matchesExpectedArguments(message.arguments, step.expectedArguments)) {
        writeMessage(output, createResponse(message, false, `Unexpected arguments for ${message.command}: ${JSON.stringify(message.arguments)}`));
        continue;
      }

      writeResponseAndImmediateSteps(output, stderr, { ...step.respond, request_seq: message.seq }, consumeLeadingNonRequestSteps(remainingSteps));
    }
  });
}

/**
 * Walk a script and assert that the first launch/attach `expectRequest` matches the
 * requested lifecycle mode. Throws synchronously on mismatch so callers can fail fast
 * before opening any DAP transport.
 */
export function validateScriptForMode(script: FakeAdapterScript, mode: 'launch' | 'attach'): void {
  for (const step of script.steps) {
    if (step.kind !== 'expectRequest') {
      continue;
    }
    if (step.command === 'launch' || step.command === 'attach') {
      if (step.command !== mode) {
        throw new Error(`Fake adapter script "${script.name}" expects command "${step.command}" but the request was "${mode}".`);
      }
      return;
    }
  }
  throw new Error(`Fake adapter script "${script.name}" has no launch or attach step.`);
}

function createLifecycleScript(name: string, mode: 'launch' | 'attach', expectedStartArguments?: Record<string, unknown>): FakeAdapterScript {
  const startStep: FakeAdapterScriptStep = expectedStartArguments === undefined
    ? { kind: 'expectRequest', command: mode, respond: { seq: 2, type: 'response', request_seq: 0, success: true, command: mode } }
    : { kind: 'expectRequest', command: mode, expectedArguments: expectedStartArguments, respond: { seq: 2, type: 'response', request_seq: 0, success: true, command: mode } };

  return {
    name,
    steps: [
      { kind: 'expectRequest', command: 'initialize', respond: { seq: 1, type: 'response', request_seq: 0, success: true, command: 'initialize', body: { supportsConfigurationDoneRequest: true } } },
      startStep,
      { kind: 'sendEvent', event: { seq: 3, type: 'event', event: 'initialized' } },
      { kind: 'expectRequest', command: 'configurationDone', respond: { seq: 4, type: 'response', request_seq: 0, success: true, command: 'configurationDone' } },
      { kind: 'sendEvent', event: { seq: 5, type: 'event', event: 'stopped', body: { reason: 'breakpoint', threadId: 1 } } },
      { kind: 'expectRequest', command: 'threads', respond: { seq: 6, type: 'response', request_seq: 0, success: true, command: 'threads', body: { threads: [{ id: 1, name: 'main' }] } } },
      { kind: 'expectRequest', command: 'disconnect', respond: { seq: 7, type: 'response', request_seq: 0, success: true, command: 'disconnect' } },
      { kind: 'sendEvent', event: { seq: 8, type: 'event', event: 'terminated' } },
    ],
  };
}

function matchesExpectedArguments(actual: unknown, expected: Record<string, unknown>): boolean {
  if (typeof actual !== 'object' || actual === null) {
    return false;
  }

  const actualRecord = actual as Record<string, unknown>;
  return Object.entries(expected).every(([key, value]) => JSON.stringify(actualRecord[key]) === JSON.stringify(value));
}

function consumeLeadingNonRequestSteps(steps: FakeAdapterScriptStep[]): FakeAdapterScriptStep[] {
  const consumed: FakeAdapterScriptStep[] = [];
  while (steps[0] !== undefined && steps[0].kind !== 'expectRequest') {
    const step = steps.shift();
    if (step !== undefined) {
      consumed.push(step);
    }
  }
  return consumed;
}

function executeNonRequestStep(step: FakeAdapterScriptStep, output: NodeJS.WritableStream, stderr: NodeJS.WritableStream): void {
  if (step.kind === 'sendEvent') {
    writeMessage(output, step.event);
    return;
  }

  if (step.kind === 'writeStderr') {
    stderr.write(`${step.text}\n`);
    return;
  }

  if (step.kind === 'closeTransport') {
    output.end();
  }
}

function writeResponseAndImmediateSteps(output: NodeJS.WritableStream, stderr: NodeJS.WritableStream, response: DapResponseMessage, steps: readonly FakeAdapterScriptStep[]): void {
  const frames: Buffer[] = [encodeDapMessage(response)];
  for (const step of steps) {
    if (step.kind === 'sendEvent') {
      frames.push(encodeDapMessage(step.event));
    } else {
      output.write(Buffer.concat(frames));
      frames.length = 0;
      executeNonRequestStep(step, output, stderr);
    }
  }

  if (frames.length > 0) {
    output.write(Buffer.concat(frames));
  }
}

function writeMessage(output: NodeJS.WritableStream, message: DapProtocolMessage): void {
  output.write(encodeDapMessage(message));
}

function createResponse(request: DapRequestMessage, success: boolean, message: string): DapResponseMessage {
  return {
    seq: 999,
    type: 'response',
    request_seq: request.seq,
    success,
    command: request.command,
    message,
  };
}
