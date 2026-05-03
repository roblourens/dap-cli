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
        ? { kind: 'expectRequest', command: 'threads', respond: { seq: 6, type: 'response', request_seq: 0, success: false, command: 'threads', message: 'threads failed' } }
        : step),
    };
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

  return createLifecycleScript(name, 'launch');
}

export function createFakeAdapterTransport(script: FakeAdapterScript): DapTransport {
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

export async function startFakeSocketAdapter(script: FakeAdapterScript): Promise<{ port: number; close(): Promise<void> }> {
  const server = net.createServer(socket => {
    socket.on('error', () => undefined);
    runFakeAdapterScript(script, socket, socket, process.stderr);
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
    close: () => new Promise(resolve => server.close(() => resolve())),
  };
}

export function runFakeAdapterScript(script: FakeAdapterScript, input: NodeJS.ReadableStream, output: NodeJS.WritableStream, stderr: NodeJS.WritableStream): void {
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

      const step = remainingSteps.shift();
      if (step?.kind !== 'expectRequest' || step.command !== message.command) {
        writeMessage(output, createResponse(message, false, `Unexpected request: ${message.command}`));
        continue;
      }

      writeResponseAndImmediateSteps(output, stderr, { ...step.respond, request_seq: message.seq }, consumeLeadingNonRequestSteps(remainingSteps));
    }
  });
}

function createLifecycleScript(name: string, mode: 'launch' | 'attach'): FakeAdapterScript {
  return {
    name,
    steps: [
      { kind: 'expectRequest', command: 'initialize', respond: { seq: 1, type: 'response', request_seq: 0, success: true, command: 'initialize', body: { supportsConfigurationDoneRequest: true } } },
      { kind: 'expectRequest', command: mode, respond: { seq: 2, type: 'response', request_seq: 0, success: true, command: mode } },
      { kind: 'sendEvent', event: { seq: 3, type: 'event', event: 'initialized' } },
      { kind: 'expectRequest', command: 'configurationDone', respond: { seq: 4, type: 'response', request_seq: 0, success: true, command: 'configurationDone' } },
      { kind: 'sendEvent', event: { seq: 5, type: 'event', event: 'stopped', body: { reason: 'breakpoint', threadId: 1 } } },
      { kind: 'expectRequest', command: 'threads', respond: { seq: 6, type: 'response', request_seq: 0, success: true, command: 'threads', body: { threads: [{ id: 1, name: 'main' }] } } },
      { kind: 'expectRequest', command: 'disconnect', respond: { seq: 7, type: 'response', request_seq: 0, success: true, command: 'disconnect' } },
      { kind: 'sendEvent', event: { seq: 8, type: 'event', event: 'terminated' } },
    ],
  };
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
