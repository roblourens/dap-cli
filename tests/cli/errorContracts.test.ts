import { afterEach, describe, expect, test } from 'vitest';
import { Command } from 'commander';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { startControllerServer, type ControllerServer } from '../../src/controller/server.js';
import { ExitCode } from '../../src/cli/exitCodes.js';
import { adapterError, controllerError, dapError, internalError, sessionError, timeoutError, usageError } from '../../src/cli/errors.js';
import { threadNotPaused } from '../../src/controller/diagnostics.js';
import { writeJsonFailure } from '../../src/cli/output.js';
import { main } from '../../src/cli/main.js';
import { createCliTestEnv, runCli, type CliTestEnv } from '../helpers/runCli.js';

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
  let testEnv: CliTestEnv | undefined;
  let server: ControllerServer | undefined;

  afterEach(async () => {
    if (server !== undefined) {
      await server.stop();
      server = undefined;
    }
    if (testEnv !== undefined) {
      await testEnv.cleanup();
      testEnv = undefined;
    }
  });

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

  test('failure JSON preserves ambiguous session diagnostics', () => {
    const stream = new MemoryStream();

    writeJsonFailure(sessionError('Session name is ambiguous: demo', {
      code: 'session_ambiguous',
      diagnostics: ['Multiple sessions match demo:', '- sess_one demo running', '- sess_two demo stopped', 'Use one of these session IDs with --name.'],
    }), { command: 'status demo' }, stream);

    const envelope = JSON.parse(stream.output) as {
      ok: false;
      error: { code: string; category: string; exitCode: number; diagnostics: string[] };
    };

    expect(envelope.error.code).toBe('session_ambiguous');
    expect(envelope.error.category).toBe('session');
    expect(envelope.error.exitCode).toBe(ExitCode.Session);
    expect(envelope.error.diagnostics.join('\n')).toContain('sess_one');
    expect(envelope.error.diagnostics.join('\n')).toContain('Use one of these session IDs');
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

  // Plan 05-20 (gap H-7): paused-state-required DAP requests against an
  // unpaused thread MUST return a structured `thread_not_paused` error,
  // NOT the misleading `controller_unavailable: Run dap-cli start` hint.
  describe('thread_not_paused (gap H-7)', () => {
    test('threadNotPaused factory returns structured dap error with the right code and diagnostic', () => {
      const error = threadNotPaused({ sessionId: 'sess_test', sessionName: 'demo', command: 'stackTrace' });

      expect(error.code).toBe('thread_not_paused');
      expect(error.category).toBe('dap');
      expect(error.message).toBe('Thread is not paused.');
      expect(error.sessionId).toBe('sess_test');
      expect(error.request).toEqual({ command: 'stackTrace' });

      const joined = error.diagnostics.join('\n');
      expect(joined).toContain('dap-cli events');
      expect(joined).toContain('--include stopped');
      expect(joined).toContain('--name demo');
      expect(joined).toContain('--stop-on-entry');

      // The recovery hint MUST NEVER tell the caller to run `dap-cli start` —
      // the controller is already running; the issue is purely a stale
      // request against a running thread.
      expect(joined).not.toContain('dap-cli start');
    });

    test('threadNotPaused without context still produces a usable diagnostic', () => {
      const error = threadNotPaused();

      expect(error.code).toBe('thread_not_paused');
      expect(error.message).toBe('Thread is not paused.');
      expect(error.diagnostics.join('\n')).toContain('--name <name>');
    });

    test('failure JSON for thread_not_paused never suggests running dap-cli start', () => {
      const stream = new MemoryStream();
      writeJsonFailure(threadNotPaused({ sessionName: 'demo', command: 'stackTrace' }), { command: 'stack' }, stream);

      const envelope = JSON.parse(stream.output) as { ok: false; error: { code: string; diagnostics: string[] } };
      expect(envelope.error.code).toBe('thread_not_paused');
      expect(envelope.error.diagnostics.join('\n')).not.toContain('dap-cli start');
    });
  });

  test('step-out adapter failure preserves DAP error category', async () => {
    testEnv = await createCliTestEnv('dap-cli-step-out-error-');
    server = await startControllerServer({ dapCliHome: testEnv.dapCliHome });

    const launch = await runCli(['launch', '--adapter', 'fake', '--script', 'failed-step-out', '--name', 'step-out-demo'], { env: testEnv.env });
    expect(launch.exitCode, JSON.stringify(launch)).toBe(0);

    const threads = await runCli(['threads', '--name', 'step-out-demo'], { env: testEnv.env });
    expect(threads.exitCode, JSON.stringify(threads)).toBe(0);

    const result = await runCli(['step-out', '--name', 'step-out-demo', '--thread-id', '1'], { env: testEnv.env });

    expect(result.exitCode).toBe(ExitCode.Dap);
    expect(result.envelope).toMatchObject({
      ok: false,
      error: {
        code: 'dap_request_failed',
        category: 'dap',
        message: 'Unable to step out',
      },
    });
    if (!result.envelope.ok) {
      expect(result.envelope.error.category).not.toBe('controller');
      expect(result.envelope.error.code).not.toBe('controller_unavailable');
      expect(result.envelope.error.diagnostics.join('\n')).not.toContain('dap-cli start');
    }
  });

  // Plan 05-20 (gap H-4 audit): no source file under src/controller/ or
  // src/sessions/ may tell the user to `dap-cli cleanup` without `--purge`.
  // Plain `cleanup` only removes records for terminated/disconnected/failed
  // sessions; sites that fire while a session is still running need to
  // recommend `--purge` (or `stop-controller` for the discovery file). This
  // test is intentionally narrow — CLI help text in src/cli/commands/ may
  // legitimately reference plain `cleanup` and is excluded.
  describe('cleanup recovery hint audit (gap H-4)', () => {
    const repoRoot = path.resolve(process.cwd());
    const auditedRoots = ['src/controller', 'src/sessions'];

    async function collectTsFiles(dir: string): Promise<string[]> {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      const out: string[] = [];
      for (const entry of entries) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          out.push(...await collectTsFiles(full));
        } else if (entry.isFile() && full.endsWith('.ts')) {
          out.push(full);
        }
      }
      return out;
    }

    test('no audited file references `dap-cli cleanup` without --purge', async () => {
      const offenders: string[] = [];
      for (const root of auditedRoots) {
        const dir = path.join(repoRoot, root);
        const files = await collectTsFiles(dir);
        for (const file of files) {
          const text = await fs.readFile(file, 'utf8');
          // Match `dap-cli cleanup` NOT followed by ` --purge`.
          // \b ensures we don't match `dap-cli cleanup-something-else`.
          const regex = /dap-cli cleanup\b(?! --purge)/g;
          let match: RegExpExecArray | null;
          while ((match = regex.exec(text)) !== null) {
            const lineNumber = text.slice(0, match.index).split('\n').length;
            offenders.push(`${path.relative(repoRoot, file)}:${lineNumber}`);
          }
        }
      }
      expect(offenders).toEqual([]);
    });
  });
});
