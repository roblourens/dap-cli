import { PassThrough } from 'node:stream';
import { describe, expect, test } from 'vitest';
import { confirm, resolveAssumeYes } from '../../src/cli/confirm.js';
import { CliError } from '../../src/cli/errors.js';

function makeTTYStream(): NodeJS.ReadStream {
  const stream = new PassThrough();
  Object.defineProperty(stream, 'isTTY', { value: true });
  return stream as unknown as NodeJS.ReadStream;
}

function makeNonTTYStream(): NodeJS.ReadStream {
  const stream = new PassThrough();
  Object.defineProperty(stream, 'isTTY', { value: false });
  return stream as unknown as NodeJS.ReadStream;
}

function makeWriteStream(): { stream: NodeJS.WriteStream; chunks: string[] } {
  const chunks: string[] = [];
  const pt = new PassThrough();
  pt.on('data', (chunk: Buffer | string) => {
    chunks.push(typeof chunk === 'string' ? chunk : chunk.toString('utf8'));
  });
  return { stream: pt as unknown as NodeJS.WriteStream, chunks };
}

describe('resolveAssumeYes', () => {
  test('cliYes true wins regardless of env', () => {
    expect(resolveAssumeYes(true, {})).toBe(true);
    expect(resolveAssumeYes(true, { DAP_CLI_ASSUME_YES: '0' })).toBe(true);
  });

  test('DAP_CLI_ASSUME_YES=1 enables', () => {
    expect(resolveAssumeYes(undefined, { DAP_CLI_ASSUME_YES: '1' })).toBe(true);
  });

  test('DAP_CLI_ASSUME_YES=true enables', () => {
    expect(resolveAssumeYes(undefined, { DAP_CLI_ASSUME_YES: 'true' })).toBe(true);
  });

  test('DAP_CLI_ASSUME_YES=0 does not enable', () => {
    expect(resolveAssumeYes(undefined, { DAP_CLI_ASSUME_YES: '0' })).toBe(false);
  });

  test('unset env returns false', () => {
    expect(resolveAssumeYes(undefined, {})).toBe(false);
    expect(resolveAssumeYes(false, {})).toBe(false);
  });
});

describe('confirm', () => {
  test('assumeYes returns true with no stderr output', async () => {
    const { stream: stderr, chunks } = makeWriteStream();
    const result = await confirm({
      question: 'Download adapter?',
      assumeYes: true,
      stderr,
      stdin: makeTTYStream(),
    });
    expect(result).toBe(true);
    expect(chunks.join('')).toBe('');
  });

  test('non-TTY without assumeYes throws provision_consent_required with recovery hints', async () => {
    const { stream: stderr } = makeWriteStream();
    const error = await confirm({
      question: 'Download adapter?',
      assumeYes: false,
      stdin: makeNonTTYStream(),
      stderr,
    }).then(
      () => undefined,
      (err: unknown) => err,
    );

    expect(error).toBeInstanceOf(CliError);
    const cliError = error as CliError;
    expect(cliError.code).toBe('provision_consent_required');
    const diagnosticsText = cliError.diagnostics.join('\n');
    expect(diagnosticsText).toContain('--yes');
    expect(diagnosticsText).toContain('DAP_CLI_ASSUME_YES=1');
    expect(diagnosticsText).toContain('Download adapter?');
  });

  test('TTY answering "y" returns true and writes prompt only to stderr', async () => {
    const stdin = makeTTYStream();
    const { stream: stderr, chunks } = makeWriteStream();
    const promise = confirm({
      question: 'Download adapter?',
      details: ['from https://example/foo.tar.gz'],
      assumeYes: false,
      stdin,
      stderr,
    });
    (stdin as unknown as PassThrough).write('y\n');
    (stdin as unknown as PassThrough).end();
    const result = await promise;
    expect(result).toBe(true);
    const stderrText = chunks.join('');
    expect(stderrText).toContain('Download adapter?');
    expect(stderrText).toContain('from https://example/foo.tar.gz');
    expect(stderrText).toContain('Proceed? [y/N]');
  });

  test('TTY answering empty (default no) throws provision_consent_declined', async () => {
    const stdin = makeTTYStream();
    const { stream: stderr } = makeWriteStream();
    const promise = confirm({
      question: 'Download adapter?',
      assumeYes: false,
      stdin,
      stderr,
    });
    (stdin as unknown as PassThrough).write('\n');
    (stdin as unknown as PassThrough).end();
    const error = await promise.then(
      () => undefined,
      (err: unknown) => err,
    );
    expect(error).toBeInstanceOf(CliError);
    const cliError = error as CliError;
    expect(cliError.code).toBe('provision_consent_declined');
    expect(cliError.diagnostics.join('\n')).toContain('--yes');
  });

  test('TTY answering "n" throws provision_consent_declined', async () => {
    const stdin = makeTTYStream();
    const { stream: stderr } = makeWriteStream();
    const promise = confirm({
      question: 'Download adapter?',
      assumeYes: false,
      stdin,
      stderr,
    });
    (stdin as unknown as PassThrough).write('n\n');
    (stdin as unknown as PassThrough).end();
    const error = await promise.then(
      () => undefined,
      (err: unknown) => err,
    );
    expect(error).toBeInstanceOf(CliError);
    expect((error as CliError).code).toBe('provision_consent_declined');
  });

  test('TTY answering "yes" (long form) returns true', async () => {
    const stdin = makeTTYStream();
    const { stream: stderr } = makeWriteStream();
    const promise = confirm({
      question: 'Download adapter?',
      assumeYes: false,
      stdin,
      stderr,
    });
    (stdin as unknown as PassThrough).write('YES\n');
    (stdin as unknown as PassThrough).end();
    await expect(promise).resolves.toBe(true);
  });
});
