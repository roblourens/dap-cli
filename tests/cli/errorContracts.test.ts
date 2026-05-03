import { describe, expect, test } from 'vitest';
import { Command } from 'commander';
import { ExitCode } from '../../src/cli/exitCodes.js';
import { adapterError, controllerError, dapError, internalError, sessionError, timeoutError, usageError } from '../../src/cli/errors.js';
import { writeJsonFailure } from '../../src/cli/output.js';
import { main } from '../../src/cli/main.js';

class MemoryStream {
  public readonly chunks: string[] = [];

  public write(chunk: string): boolean {
    this.chunks.push(chunk);
    return true;
  }

  public get output(): string {
    return this.chunks.join('');
  }
}

describe('CLI error contracts', () => {
  test('all handled error factories produce stable categories, exit codes, and diagnostics', () => {
    const cases = [
      { error: usageError('Bad input'), category: 'usage', exitCode: ExitCode.Usage },
      { error: controllerError('Controller unavailable'), category: 'controller', exitCode: ExitCode.Controller },
      { error: sessionError('No active session'), category: 'session', exitCode: ExitCode.Session },
      { error: dapError('DAP request failed'), category: 'dap', exitCode: ExitCode.Dap },
      { error: adapterError('Adapter failed'), category: 'adapter', exitCode: ExitCode.Adapter },
      { error: timeoutError('Timed out'), category: 'timeout', exitCode: ExitCode.Timeout },
      { error: internalError('Unexpected failure'), category: 'internal', exitCode: ExitCode.Internal },
    ] as const;

    for (const testCase of cases) {
      expect(testCase.error.category).toBe(testCase.category);
      expect(testCase.error.exitCode).toBe(testCase.exitCode);
      expect(testCase.error.code.length).toBeGreaterThan(0);
      expect(testCase.error.diagnostics.length).toBeGreaterThan(0);
    }
  });

  test('failure JSON contains machine-readable error payload and command metadata', () => {
    const stream = new MemoryStream();
    const error = controllerError('Controller unavailable', {
      code: 'controller_unavailable',
      diagnostics: ['Run dap-cli start first.'],
    });

    writeJsonFailure(error, { command: 'status' }, stream);

    const envelope = JSON.parse(stream.output) as {
      ok: false;
      error: { code: string; category: string; exitCode: number; message: string; diagnostics: string[] };
      meta: { command: string; timestamp: string };
    };

    expect(envelope.ok).toBe(false);
    expect(envelope.error.code).toBe('controller_unavailable');
    expect(envelope.error.category).toBe('controller');
    expect(envelope.error.exitCode).toBe(ExitCode.Controller);
    expect(envelope.error.message).toBe('Controller unavailable');
    expect(envelope.error.diagnostics).toEqual(['Run dap-cli start first.']);
    expect(envelope.meta.command).toBe('status');
    expect(envelope.meta.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  test('failure JSON includes optional session, request, and adapter diagnostics', () => {
    const stream = new MemoryStream();

    writeJsonFailure(dapError('threads failed', {
      code: 'dap_request_failed',
      diagnostics: ['Inspect adapter diagnostics and session state.'],
      sessionId: 'sess_demo',
      request: { command: 'threads', seq: 4 },
      adapter: {
        descriptorId: 'fake',
        pid: 123,
        stderrTail: ['adapter stderr'],
        logPath: '/tmp/fake.log',
      },
    }), { command: 'request' }, stream);

    const envelope = JSON.parse(stream.output) as {
      ok: false;
      error: {
        sessionId: string;
        request: { command: string; seq: number };
        adapter: { descriptorId: string; pid: number; stderrTail: string[]; logPath: string };
      };
    };

    expect(envelope.error.sessionId).toBe('sess_demo');
    expect(envelope.error.request).toEqual({ command: 'threads', seq: 4 });
    expect(envelope.error.adapter).toEqual({ descriptorId: 'fake', pid: 123, stderrTail: ['adapter stderr'], logPath: '/tmp/fake.log' });
  });

  test('internal errors do not serialize stack traces by default', () => {
    const stream = new MemoryStream();

    writeJsonFailure(internalError('Unexpected failure'), { command: 'launch' }, stream);

    expect(stream.output).not.toContain('at ');
    expect(stream.output).not.toContain('Error:');
  });

  test('main maps unexpected command errors to internal JSON with empty stderr', async () => {
    const stdout = new MemoryStream();
    const stderr = new MemoryStream();
    const program = new Command();
    program.exitOverride();
    program.command('boom').action(() => {
      throw new Error('exploded with stack');
    });

    const exitCode = await main(['boom'], program, { stdout, stderr });
    const envelope = JSON.parse(stdout.output) as { ok: false; error: { category: string; exitCode: number; message: string } };

    expect(exitCode).toBe(ExitCode.Internal);
    expect(stderr.output).toBe('');
    expect(envelope.ok).toBe(false);
    expect(envelope.error.category).toBe('internal');
    expect(envelope.error.exitCode).toBe(ExitCode.Internal);
    expect(envelope.error.message).toBe('Unexpected internal error');
    expect(stdout.output).not.toContain('exploded with stack');
  });
});
