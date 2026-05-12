import { afterEach, describe, expect, test, vi } from 'vitest';
import { CliError, usageError } from '../../src/cli/errors.js';
import { renderHumanFailure, renderHumanSuccess, sanitizeForTerminal } from '../../src/cli/humanOutput.js';
import { resolveOutputMode } from '../../src/cli/outputMode.js';
import { createOutputWriter } from '../../src/cli/outputWriter.js';
import { runCliHuman } from '../helpers/runCli.js';

class MemoryStream {
  public output = '';

  public write(chunk: string): boolean {
    this.output += chunk;
    return true;
  }
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('human output mode resolver', () => {
  test('explicit CLI selection wins over DAP_CLI_HUMAN', () => {
    expect(resolveOutputMode({ cliHuman: true, isStdoutTTY: true, env: { DAP_CLI_HUMAN: '0' } })).toBe('human');
    expect(resolveOutputMode({ cliHuman: false, isStdoutTTY: true, env: { DAP_CLI_HUMAN: '1' } })).toBe('json');
  });

  test('explicit CLI selection wins even when stdout is not a TTY', () => {
    expect(resolveOutputMode({ cliHuman: true, isStdoutTTY: false, env: { DAP_CLI_HUMAN: '0' } })).toBe('human');
    expect(resolveOutputMode({ cliHuman: false, isStdoutTTY: false, env: { DAP_CLI_HUMAN: '1' } })).toBe('json');
  });

  test('DAP_CLI_HUMAN accepts explicit true and false values on a TTY', () => {
    for (const value of ['1', 'true', 'yes', 'on', 'human', ' TRUE ']) {
      expect(resolveOutputMode({ cliHuman: undefined, isStdoutTTY: true, env: { DAP_CLI_HUMAN: value } })).toBe('human');
    }

    for (const value of ['0', 'false', 'no', 'off', 'json', ' JSON ']) {
      expect(resolveOutputMode({ cliHuman: undefined, isStdoutTTY: true, env: { DAP_CLI_HUMAN: value } })).toBe('json');
    }
  });

  test('DAP_CLI_HUMAN defaults to JSON when missing or blank on a TTY', () => {
    expect(resolveOutputMode({ cliHuman: undefined, isStdoutTTY: true, env: {} })).toBe('json');
    expect(resolveOutputMode({ cliHuman: undefined, isStdoutTTY: true, env: { DAP_CLI_HUMAN: '   ' } })).toBe('json');
  });

  test('invalid DAP_CLI_HUMAN values produce a handled usage error on a TTY', () => {
    let thrown: unknown;
    try {
      resolveOutputMode({ cliHuman: undefined, isStdoutTTY: true, env: { DAP_CLI_HUMAN: 'maybe' } });
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(CliError);
    if (!(thrown instanceof CliError)) {
      throw new Error('Expected CliError');
    }
    expect(thrown.code).toBe('invalid_output_mode_env');
    expect(thrown.diagnostics).toContain('Use DAP_CLI_HUMAN=1 for human output or DAP_CLI_HUMAN=0 for JSON output.');
  });

  test('non-TTY stdout returns JSON regardless of DAP_CLI_HUMAN (the headline gate)', () => {
    expect(resolveOutputMode({ cliHuman: undefined, isStdoutTTY: false, env: { DAP_CLI_HUMAN: '1' } })).toBe('json');
    expect(resolveOutputMode({ cliHuman: undefined, isStdoutTTY: false, env: { DAP_CLI_HUMAN: 'human' } })).toBe('json');
    expect(resolveOutputMode({ cliHuman: undefined, isStdoutTTY: false, env: {} })).toBe('json');
    expect(resolveOutputMode({ cliHuman: undefined, isStdoutTTY: false, env: { DAP_CLI_HUMAN: '0' } })).toBe('json');
  });

  test('non-TTY stdout skips env parsing so invalid DAP_CLI_HUMAN does NOT throw (agent-pipeline safety net)', () => {
    expect(() => resolveOutputMode({ cliHuman: undefined, isStdoutTTY: false, env: { DAP_CLI_HUMAN: 'maybe' } })).not.toThrow();
    expect(resolveOutputMode({ cliHuman: undefined, isStdoutTTY: false, env: { DAP_CLI_HUMAN: 'maybe' } })).toBe('json');
  });
});

describe('output writer', () => {
  test('JSON success delegates to the one-envelope JSON writer', () => {
    const stream = new MemoryStream();
    const writer = createOutputWriter({ stream, resolveMode: () => 'json' });

    writer.success({ pid: 123 }, { command: 'status', timestamp: new Date('2026-05-05T00:00:00.000Z') });

    expect(stream.output).toBe('{"ok":true,"data":{"pid":123},"meta":{"command":"status","timestamp":"2026-05-05T00:00:00.000Z"}}\n');
  });

  test('JSON failure delegates to the existing error payload shape', () => {
    const stream = new MemoryStream();
    const writer = createOutputWriter({ stream, resolveMode: () => 'json' });

    writer.failure(usageError('Invalid arguments'), { command: 'launch', timestamp: new Date('2026-05-05T00:00:00.000Z') });

    const envelope = JSON.parse(stream.output) as { ok: false; error: { code: string; category: string; exitCode: number } };
    expect(envelope).toMatchObject({ ok: false, error: { code: 'usage_error', category: 'usage', exitCode: 2 } });
  });

  test('human success uses deterministic text instead of a JSON envelope', () => {
    const stream = new MemoryStream();
    const writer = createOutputWriter({ stream, resolveMode: () => 'human' });

    writer.success({ beta: true, alpha: 1 }, { command: 'status', timestamp: new Date('2026-05-05T00:00:00.000Z') });

    expect(stream.output).toContain('Data:');
    expect(stream.output).toContain('alpha: 1');
    expect(stream.output).toContain('beta: true');
    expect(stream.output).not.toContain('Command:');
    expect(stream.output).not.toContain('Timestamp:');
    expect(stream.output).not.toContain('{"ok":true');
  });

  test('JSON warnings fold into meta.warnings instead of stderr', () => {
    const stream = new MemoryStream();
    const errorStream = new MemoryStream();
    const writer = createOutputWriter({ stream, errorStream, resolveMode: () => 'json' });

    writer.warn('stack: --thread-id not provided; using stopped thread 1');
    writer.warn('breakpoints set: foo');
    writer.success({ ok: 1 }, { command: 'stack', timestamp: new Date('2026-05-05T00:00:00.000Z') });

    expect(errorStream.output).toBe('');
    const envelope = JSON.parse(stream.output) as { meta: { warnings?: string[] } };
    expect(envelope.meta.warnings).toEqual([
      'stack: --thread-id not provided; using stopped thread 1',
      'breakpoints set: foo',
    ]);
  });

  test('JSON warnings fold into meta.warnings on failure envelopes too', () => {
    const stream = new MemoryStream();
    const errorStream = new MemoryStream();
    const writer = createOutputWriter({ stream, errorStream, resolveMode: () => 'json' });

    writer.warn('evaluate: hint');
    writer.failure(usageError('Bad'), { command: 'evaluate', timestamp: new Date('2026-05-05T00:00:00.000Z') });

    expect(errorStream.output).toBe('');
    const envelope = JSON.parse(stream.output) as { ok: false; meta: { warnings?: string[] } };
    expect(envelope.meta.warnings).toEqual(['evaluate: hint']);
  });

  test('JSON envelope omits warnings entirely when none were emitted', () => {
    const stream = new MemoryStream();
    const writer = createOutputWriter({ stream, resolveMode: () => 'json' });

    writer.success({ ok: 1 }, { command: 'status', timestamp: new Date('2026-05-05T00:00:00.000Z') });

    const envelope = JSON.parse(stream.output) as { meta: Record<string, unknown> };
    expect(envelope.meta).not.toHaveProperty('warnings');
  });

  test('human mode keeps emitting warnings to stderr immediately', () => {
    const stream = new MemoryStream();
    const errorStream = new MemoryStream();
    const writer = createOutputWriter({ stream, errorStream, resolveMode: () => 'human' });

    writer.warn('stack: --thread-id not provided; using stopped thread 1');
    writer.success({ ok: 1 }, { command: 'stack', timestamp: new Date('2026-05-05T00:00:00.000Z') });

    expect(errorStream.output).toBe('stack: --thread-id not provided; using stopped thread 1\n');
    expect(stream.output).not.toContain('--thread-id');
  });
});

describe('human failure rendering', () => {
  test('renders only existing structured error fields', () => {
    const error = usageError('Bad input', {
      code: 'bad_input',
      diagnostics: ['first', 'second'],
      sessionId: 'session-1',
      request: { command: 'stackTrace', seq: 7 },
      adapter: { descriptorId: 'fake', pid: 42, stderrTail: ['oops'], logPath: '/tmp/adapter.log' },
      data: { suggestion: 'try again' },
    });

    const output = renderHumanFailure(error, { command: 'stack', timestamp: new Date('2026-05-05T00:00:00.000Z') });

    expect(output).toContain('Error: Bad input');
    expect(output).toContain('Code: bad_input');
    expect(output).toContain('Category: usage');
    expect(output).toContain('Exit code: 2');
    expect(output).toContain('Diagnostics:');
    expect(output).toContain('Session: session-1');
    expect(output).toContain('Request: stackTrace (seq 7)');
    expect(output).toContain('Adapter:');
    expect(output).toContain('Data:');
    expect(output).not.toContain('Command:');
    expect(output).not.toContain('Timestamp:');
  });

  test('sanitizeForTerminal replaces terminal control characters', () => {
    expect(sanitizeForTerminal('safe\ttext\nnext')).toBe('safe\ttext\nnext');
    expect(sanitizeForTerminal('bad\u001B[31mred\u0007\rline\u0085')).toBe('bad?[31mred?\nline?');
  });
});

describe('human CLI test helper', () => {
  test('returns raw stdout without a parsed JSON envelope', async () => {
    const result = await runCliHuman(['--help']);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Usage:');
    expect('envelope' in result).toBe(false);
  });
});

describe('curated human success renderers', () => {
  const timestamp = new Date('2026-05-05T00:00:00.000Z');

  test('sessions renders a table-like block with sanitized fields', () => {
    const output = renderHumanSuccess([
      { id: 's1', name: 'demo\u001B[31m', status: 'running', adapter: 'fake', active: true, parent_session_id: 'parent' },
    ], { command: 'sessions', timestamp });

    expect(output).toContain('Sessions:');
    expect(output).toContain('┌');
    expect(output).toContain('│ ID │ Name      │ Status  │ Adapter │ Active │ Child │');
    expect(output).toContain('│ s1 │ demo?[31m │ running │ fake    │ yes    │ yes   │');
    expect(output).not.toContain('\u001B');
    expect(output).not.toContain('Command:');
    expect(output).not.toContain('Timestamp:');
  });

  test('sessions includes a compact compound column only when compound metadata exists', () => {
    const compoundOutput = renderHumanSuccess([
      { id: 's1', name: 'VS Code/Renderer', status: 'running', adapter: 'fake', compound: { name: 'VS Code', memberName: 'Renderer', stopAll: true, members: ['Renderer', 'Main'] } },
      { id: 's2', name: 'plain', status: 'running', adapter: 'fake' },
    ], { command: 'sessions', timestamp });

    expect(compoundOutput).toContain('│ ID │ Name             │ Status  │ Adapter │ Compound         │');
    expect(compoundOutput).toContain('│ s1 │ VS Code/Renderer │ running │ fake    │ VS Code/Renderer │');
    expect(compoundOutput).toContain('│ s2 │ plain            │ running │ fake    │                  │');

    const plainOutput = renderHumanSuccess([
      { id: 's2', name: 'plain', status: 'running', adapter: 'fake' },
    ], { command: 'sessions', timestamp });
    expect(plainOutput).not.toContain('Compound');
  });

  test('status renders common session and controller fields', () => {
    const output = renderHumanSuccess({
      id: 's1',
      name: 'demo',
      status: 'stopped',
      paused: true,
      stoppedReason: 'breakpoint',
      stoppedThreadIds: [1, 2],
      pid: 123,
      stateDir: '/tmp/state',
    }, { command: 'status', timestamp });

    expect(output).toContain('Status:');
    expect(output).toContain('ID: s1');
    expect(output).toContain('Paused: true');
    expect(output).toContain('Stopped thread IDs: 1, 2');
    expect(output).toContain('PID: 123');
  });

  test('status renders compound metadata when present', () => {
    const output = renderHumanSuccess({
      id: 's1',
      name: 'VS Code/Renderer',
      status: 'running',
      compound: { name: 'VS Code', memberName: 'Renderer', stopAll: true, members: ['Renderer', 'Main'] },
    }, { command: 'status', timestamp });

    expect(output).toContain('Compound: VS Code');
    expect(output).toContain('Compound member: Renderer');
    expect(output).toContain('Compound stop all: yes');
    expect(output).toContain('Compound members: Renderer, Main');
  });

  test('events renders warnings before event rows', () => {
    const output = renderHumanSuccess({
      sessionId: 's1',
      name: 'demo',
      cursor: 9,
      dropped: 1,
      capacity: 100,
      warnings: ['limit_exceeded_capacity: 200 requested'],
      events: [{ event: 'stopped', reason: 'breakpoint\rnext' }],
    }, { command: 'events', timestamp });

    expect(output.indexOf('Warnings:')).toBeLessThan(output.indexOf('│ Event   │ Details'));
    expect(output).toContain('Session: demo (s1)');
    expect(output).toContain('Cursor: 9');
    expect(output).toContain('Dropped: 1');
    expect(output).toContain('stopped');
    expect(output).toContain('breakpoint\nnext');
  });

  test('breakpoints set renders breakpoint rows', () => {
    const output = renderHumanSuccess({
      breakpoints: [
        { line: 12, verified: true },
        { line: 30, verified: false, message: 'bad\u0007line' },
      ],
    }, { command: 'breakpoints set', timestamp });

    expect(output).toContain('Breakpoints:');
    expect(output).toContain('│ Line │ Verified │ Message  │');
    expect(output).toContain('│ 12   │ yes      │          │');
    expect(output).toContain('│ 30   │ no       │ bad?line │');
  });

  test('variables color the value rather than the type when color is forced', () => {
    vi.stubEnv('FORCE_COLOR', '1');

    const output = renderHumanSuccess({
      variables: [{ name: 'count', value: '1', type: 'number', variablesReference: 0 }],
    }, { command: 'variables', timestamp });

    expect(output).toContain('\u001B[1mVariables:\u001B[0m');
    expect(output).toContain('\u001B[36m1    \u001B[0m');
    expect(output).toContain('│ number │');
    expect(output).not.toContain('\u001B[36mnumber');
  });

  test('NO_COLOR suppresses ANSI styling even when color is forced', () => {
    vi.stubEnv('FORCE_COLOR', '1');
    vi.stubEnv('NO_COLOR', '1');

    const output = renderHumanSuccess({
      variables: [{ name: 'count', value: '1', type: 'number', variablesReference: 0 }],
    }, { command: 'variables', timestamp });

    expect(output).toContain('Variables:');
    expect(output).toContain('│ count │ 1     │ number │ 0                   │');
    expect(output).not.toContain('\u001B');
  });

  test('debugging aliases render stable labeled sections', () => {
    expect(renderHumanSuccess({ threads: [{ id: 1, name: 'main' }] }, { command: 'threads', timestamp })).toContain('Threads:');
    expect(renderHumanSuccess({ stackFrames: [{ id: 10, name: 'fn', line: 4, source: { path: '/tmp/app.js' } }] }, { command: 'stack', timestamp })).toContain('Stack:');
    expect(renderHumanSuccess({ scopes: [{ name: 'Local', variablesReference: 7 }] }, { command: 'scopes', timestamp })).toContain('Scopes:');
    expect(renderHumanSuccess({ variables: [{ name: 'x', value: '1', type: 'number' }] }, { command: 'variables', timestamp })).toContain('Variables:');
    expect(renderHumanSuccess({ result: '42', type: 'number', variablesReference: 0 }, { command: 'evaluate', timestamp })).toContain('Evaluate:');
    expect(renderHumanSuccess({ removed: 2, remaining: 1 }, { command: 'cleanup', timestamp })).toContain('Cleanup:');
    expect(renderHumanSuccess({ name: 'demo', status: 'terminated', orphanPids: [123] }, { command: 'close', timestamp })).toContain('Close:');
  });

  test('launch configs renders configuration and compound discovery rows', () => {
    const output = renderHumanSuccess([
      { kind: 'configuration', name: 'Named Fake', type: 'fakeType', request: 'launch' },
      { kind: 'compound', name: 'Compound Fake', configurations: ['Named Fake'], stopAll: false },
    ], { command: 'launch configs', timestamp });

    expect(output).toContain('Launch Configs:');
    expect(output).toContain('│ Kind          │ Name          │ Type     │ Request │ Members    │ Stop all │');
    expect(output).toContain('│ configuration │ Named Fake    │ fakeType │ launch  │            │          │');
    expect(output).toContain('│ compound      │ Compound Fake │          │         │ Named Fake │ no       │');
  });

  test('unknown command results use the generic fallback', () => {
    const output = renderHumanSuccess({ zed: 1 }, { command: 'dap custom', timestamp });

    expect(output).toContain('Data:');
    expect(output).toContain('zed: 1');
    expect(output).not.toContain('Command:');
  });
});