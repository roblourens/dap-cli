import { afterEach, describe, expect, test, vi } from 'vitest';
import { main } from '../../src/cli/main.js';
import { getDapCliHome, getDapCliLogDir, getDapCliStateDir } from '../../src/config/paths.js';
import { toJsonString, writeJsonFailure, writeJsonSuccess } from '../../src/cli/output.js';
import { usageError } from '../../src/cli/errors.js';

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

describe('JSON output contract', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  test('success envelopes contain data and command metadata', () => {
    const stream = new MemoryStream();

    writeJsonSuccess({ pid: 123 }, { command: 'status' }, stream);

    expect(stream.output.endsWith('\n')).toBe(true);
    expect(stream.output.trim().split('\n')).toHaveLength(1);

    const envelope = JSON.parse(stream.output) as {
      ok: true;
      data: { pid: number };
      meta: { command: string; timestamp: string };
    };

    expect(envelope.ok).toBe(true);
    expect(envelope.data).toEqual({ pid: 123 });
    expect(envelope.meta.command).toBe('status');
    expect(envelope.meta.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  test('handled failures write one JSON object to stdout-shaped streams', () => {
    const stream = new MemoryStream();
    const error = usageError('Invalid arguments');

    writeJsonFailure(error, { command: 'launch' }, stream);

    expect(stream.output.endsWith('\n')).toBe(true);
    expect(stream.output.trim().split('\n')).toHaveLength(1);

    const envelope = JSON.parse(stream.output) as {
      ok: false;
      error: { code: string; category: string; exitCode: number; diagnostics: string[] };
      meta: { command: string; timestamp: string };
    };

    expect(envelope.ok).toBe(false);
    expect(envelope.error.code).toBe('usage_error');
    expect(envelope.error.category).toBe('usage');
    expect(envelope.error.exitCode).toBe(2);
    expect(envelope.error.diagnostics.length).toBeGreaterThan(0);
    expect(envelope.meta.command).toBe('launch');
  });

  test('toJsonString returns a single newline-terminated JSON object', () => {
    const json = toJsonString({ ok: true, data: { ready: true }, meta: { command: 'start', timestamp: '2026-05-02T00:00:00.000Z' } });

    expect(json).toBe('{"ok":true,"data":{"ready":true},"meta":{"command":"start","timestamp":"2026-05-02T00:00:00.000Z"}}\n');
  });

  test('main maps handled command failures to stdout JSON and empty stderr', async () => {
    const stdout = new MemoryStream();
    const stderr = new MemoryStream();

    const exitCode = await main(['status'], undefined, { stdout, stderr });

    expect(exitCode).toBe(3);
    expect(stderr.output).toBe('');

    const envelope = JSON.parse(stdout.output) as {
      ok: false;
      error: { code: string; category: string; exitCode: number; diagnostics: string[] };
      meta: { command: string };
    };

    expect(envelope.ok).toBe(false);
    expect(envelope.error.code).toBe('controller_unavailable');
    expect(envelope.error.category).toBe('controller');
    expect(envelope.error.exitCode).toBe(3);
    expect(envelope.error.diagnostics.length).toBeGreaterThan(0);
    expect(envelope.meta.command).toBe('status');
  });

  test('DAP_CLI_HOME controls state and log directories', () => {
    vi.stubEnv('DAP_CLI_HOME', '/tmp/dap-cli-test-home');

    expect(getDapCliHome()).toBe('/tmp/dap-cli-test-home');
    expect(getDapCliStateDir()).toBe('/tmp/dap-cli-test-home/state');
    expect(getDapCliLogDir()).toBe('/tmp/dap-cli-test-home/logs');
  });

  test('default state and log directories live under ~/.dap-cli', () => {
    expect(getDapCliHome({})).toMatch(/[/\\]\.dap-cli$/);
    expect(getDapCliStateDir({})).toMatch(/[/\\]\.dap-cli[/\\]state$/);
    expect(getDapCliLogDir({})).toMatch(/[/\\]\.dap-cli[/\\]logs$/);
  });
});
