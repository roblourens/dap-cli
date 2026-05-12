import { describe, expect, test } from 'vitest';
import { main } from '../../src/cli/main.js';

const HELP_CATEGORIES: ReadonlyArray<{ heading: string; commands: readonly string[] }> = [
  { heading: 'Controller lifecycle', commands: ['start', 'status', 'stop', 'stop-controller'] },
  { heading: 'Sessions', commands: ['sessions', 'use', 'detach', 'close', 'cleanup'] },
  { heading: 'Launch & attach', commands: ['launch', 'attach'] },
  { heading: 'Breakpoints', commands: ['breakpoints'] },
  { heading: 'Paused-state inspection', commands: ['threads', 'stack', 'scopes', 'variables', 'source', 'evaluate'] },
  { heading: 'Execution control', commands: ['continue', 'pause', 'next', 'step-in', 'step-out'] },
  { heading: 'DAP protocol escape hatches', commands: ['dap', 'request', 'capabilities', 'events'] },
];

class MemoryStream {
  public readonly chunks: string[] = [];
  public readonly isTTY = false;

  public write(chunk: string): boolean {
    this.chunks.push(chunk);
    return true;
  }

  public get output(): string {
    return this.chunks.join('');
  }
}

function envelopeLines(text: string): string[] {
  return text.split('\n').filter(line => line.startsWith('{"ok":false'));
}

describe('dap-cli help command', () => {
  test('emits no JSON envelope: bare help', async () => {
    const stdout = new MemoryStream();
    const stderr = new MemoryStream();

    const exitCode = await main(['help'], undefined, { stdout, stderr });

    expect(exitCode).toBe(0);
    expect(envelopeLines(stdout.output)).toHaveLength(0);
    expect(envelopeLines(stderr.output)).toHaveLength(0);
    expect(stdout.output).toContain('Usage: dap-cli');
  });

  test('emits no JSON envelope: help with one segment', async () => {
    const stdout = new MemoryStream();
    const stderr = new MemoryStream();

    const exitCode = await main(['help', 'breakpoints'], undefined, { stdout, stderr });

    expect(exitCode).toBe(0);
    expect(envelopeLines(stdout.output)).toHaveLength(0);
    expect(envelopeLines(stderr.output)).toHaveLength(0);
    expect(stdout.output).toContain('Usage: dap-cli breakpoints');
  });

  test('emits no JSON envelope: --help flag still clean', async () => {
    const stdout = new MemoryStream();
    const stderr = new MemoryStream();

    const exitCode = await main(['--help'], undefined, { stdout, stderr });

    expect(exitCode).toBe(0);
    expect(envelopeLines(stdout.output)).toHaveLength(0);
    expect(envelopeLines(stderr.output)).toHaveLength(0);
  });

  test('drills into nested subcommands', async () => {
    const stdout = new MemoryStream();
    const stderr = new MemoryStream();

    const exitCode = await main(['help', 'breakpoints', 'set'], undefined, { stdout, stderr });

    expect(exitCode).toBe(0);
    expect(stdout.output).toContain('Usage: dap-cli breakpoints set [options]');
    expect(stdout.output).toContain('--source <path>');
  });

  test('unknown drill-down path emits usage_error envelope', async () => {
    const stdout = new MemoryStream();
    const stderr = new MemoryStream();

    const exitCode = await main(['help', 'breakpoints', 'bogus'], undefined, { stdout, stderr });

    expect(exitCode).toBeGreaterThanOrEqual(2);

    // The usage_error envelope is written through the same writer as other failures;
    // depending on output mode it lands on stdout or stderr. Find the single envelope
    // line on either stream.
    const envelopes = [
      ...envelopeLines(stdout.output),
      ...envelopeLines(stderr.output),
    ];
    expect(envelopes).toHaveLength(1);

    const parsed = JSON.parse(envelopes[0]!) as {
      ok: false;
      error: { code: string; message: string };
    };
    expect(parsed.error.code).toBe('usage_error');
    expect(parsed.error.message).toContain('bogus');
  });

  test('categories: every locked heading appears in dap-cli help output', async () => {
    const stdout = new MemoryStream();
    const stderr = new MemoryStream();

    const exitCode = await main(['help'], undefined, { stdout, stderr });

    expect(exitCode).toBe(0);
    for (const { heading } of HELP_CATEGORIES) {
      expect(stdout.output, `missing heading: ${heading}`).toContain(heading);
    }
  });

  test('categories: each public top-level command appears under its assigned heading', async () => {
    const stdout = new MemoryStream();
    const stderr = new MemoryStream();

    const exitCode = await main(['help'], undefined, { stdout, stderr });
    expect(exitCode).toBe(0);

    const text = stdout.output;
    // Find each heading's offset; commands must appear between this heading
    // and the next category heading (or end-of-text).
    const offsets = HELP_CATEGORIES.map(({ heading }) => {
      const idx = text.indexOf(heading);
      expect(idx, `heading not found: ${heading}`).toBeGreaterThanOrEqual(0);
      return { heading, start: idx };
    }).sort((a, b) => a.start - b.start);

    for (let i = 0; i < offsets.length; i++) {
      const { heading, start } = offsets[i]!;
      const end = i + 1 < offsets.length ? offsets[i + 1]!.start : text.length;
      const section = text.slice(start, end);
      const expected = HELP_CATEGORIES.find(c => c.heading === heading)!.commands;
      for (const cmd of expected) {
        // Match the command name as it appears in commander's help output:
        // two-space indent, name, then a space (or option marker, or end).
        const pattern = new RegExp(`^  ${cmd.replace(/[-/]/g, '\\$&')}(\\s|$|\\[)`, 'm');
        expect(section, `command "${cmd}" missing under "${heading}"`).toMatch(pattern);
      }
    }
  });

  test('categories: serve-controller is hidden from help', async () => {
    const stdout = new MemoryStream();
    const stderr = new MemoryStream();

    const exitCode = await main(['help'], undefined, { stdout, stderr });

    expect(exitCode).toBe(0);
    expect(stdout.output).not.toContain('serve-controller');
  });

  test('categories: drill-down regression — help breakpoints set still works', async () => {
    const stdout = new MemoryStream();
    const stderr = new MemoryStream();

    const exitCode = await main(['help', 'breakpoints', 'set'], undefined, { stdout, stderr });

    expect(exitCode).toBe(0);
    expect(stdout.output).toContain('Usage: dap-cli breakpoints set [options]');
  });
});
