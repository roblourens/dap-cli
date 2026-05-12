import { describe, expect, test } from 'vitest';
import { main } from '../../src/cli/main.js';

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

    const parsed = JSON.parse(envelopes[0]) as {
      ok: false;
      error: { code: string; message: string };
    };
    expect(parsed.error.code).toBe('usage_error');
    expect(parsed.error.message).toContain('bogus');
  });
});
