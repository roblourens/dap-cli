import { createWriteStream } from 'node:fs';
import { promises as fs } from 'node:fs';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import path from 'node:path';
import { fetch, ProxyAgent, type Dispatcher } from 'undici';
import { usageError, CliError } from '../../cli/errors.js';

export interface DownloadOptions {
  readonly url: string;
  readonly destPath: string;
  readonly onProgress?: (bytesRead: number, totalBytes: number | undefined) => void;
  /** Injected for tests; defaults to process.env. */
  readonly env?: NodeJS.ProcessEnv;
}

interface ProxyResolution {
  readonly dispatcher: Dispatcher | undefined;
  readonly proxyUrl: string | undefined;
}

const LOCAL_HOSTS = new Set(['127.0.0.1', 'localhost', '::1']);

function pickProxyEnv(env: NodeJS.ProcessEnv, protocol: string): string | undefined {
  if (protocol === 'https:') {
    return env.HTTPS_PROXY ?? env.https_proxy;
  }
  return env.HTTP_PROXY ?? env.http_proxy;
}

function matchesNoProxy(host: string, noProxy: string | undefined): boolean {
  if (noProxy === undefined || noProxy.length === 0) {
    return false;
  }
  const normalized = host.toLowerCase();
  for (const raw of noProxy.split(',')) {
    const pattern = raw.trim().toLowerCase();
    if (pattern.length === 0) {
      continue;
    }
    if (pattern === '*') {
      return true;
    }
    const stripped = pattern.startsWith('.') ? pattern.slice(1) : pattern;
    if (normalized === stripped || normalized.endsWith(`.${stripped}`)) {
      return true;
    }
  }
  return false;
}

function resolveProxy(targetUrl: URL, env: NodeJS.ProcessEnv): ProxyResolution {
  const proxyUrl = pickProxyEnv(env, targetUrl.protocol);
  if (proxyUrl === undefined || proxyUrl.length === 0) {
    return { dispatcher: undefined, proxyUrl: undefined };
  }
  if (matchesNoProxy(targetUrl.hostname, env.NO_PROXY ?? env.no_proxy)) {
    return { dispatcher: undefined, proxyUrl: undefined };
  }
  return { dispatcher: new ProxyAgent(proxyUrl), proxyUrl };
}

function isLocalHost(host: string): boolean {
  return LOCAL_HOSTS.has(host.toLowerCase());
}

/**
 * Strip credentials and query strings from a URL for safe inclusion in
 * diagnostic strings. Defense-in-depth: our adapter URLs never carry tokens
 * today, but future contributors might. `user:pass@` in proxy URLs (T-21-04-02)
 * MUST never leak into stderr.
 */
function sanitizeUrl(raw: string): string {
  try {
    const parsed = new URL(raw);
    parsed.username = '';
    parsed.password = '';
    parsed.search = '';
    parsed.hash = '';
    return parsed.toString();
  } catch {
    return raw.split('?')[0]?.split('#')[0] ?? raw;
  }
}

function rateLimitError(url: string, retryAfter: string | null): CliError {
  const safeUrl = sanitizeUrl(url);
  return usageError('GitHub rate limit exceeded.', {
    code: 'provision_rate_limited',
    diagnostics: [
      `URL: ${safeUrl}`,
      retryAfter !== null && retryAfter.length > 0 ? `Retry after epoch ${retryAfter}.` : 'Retry-After header not provided.',
      'Set `GITHUB_TOKEN` to raise the GitHub API rate limit.',
    ],
    data: { url: safeUrl, status: 403, retryAfter: retryAfter ?? undefined },
  });
}

function networkError(url: string, status: number, statusText: string): CliError {
  const safeUrl = sanitizeUrl(url);
  return usageError('Adapter download failed.', {
    code: 'provision_network_error',
    diagnostics: [`URL: ${safeUrl}`, `HTTP ${status} ${statusText}`],
    data: { url: safeUrl, status, statusText },
  });
}

function networkCauseError(url: string, code: string | undefined, message: string, cause?: unknown): CliError {
  const safeUrl = sanitizeUrl(url);
  return usageError('Adapter download failed.', {
    code: 'provision_network_error',
    diagnostics: [`URL: ${safeUrl}`, code !== undefined ? `Cause: ${code}` : `Cause: ${message}`],
    data: { url: safeUrl, causeCode: code },
    cause,
  });
}

function proxyError(url: string, proxyUrl: string, code: string | undefined, message: string, cause?: unknown): CliError {
  const safeUrl = sanitizeUrl(url);
  const safeProxy = sanitizeUrl(proxyUrl);
  return usageError('Adapter download failed through configured proxy.', {
    code: 'provision_proxy_error',
    diagnostics: [
      `URL: ${safeUrl}`,
      `Proxy: ${safeProxy}`,
      code !== undefined ? `Cause: ${code}` : `Cause: ${message}`,
      'Verify `HTTPS_PROXY` is correct or set `NO_PROXY=github.com` to bypass.',
    ],
    data: { url: safeUrl, proxyUrl: safeProxy, causeCode: code },
    cause,
  });
}

interface NodeFetchCause {
  readonly code?: string;
  readonly message?: string;
}

function extractCause(error: unknown): NodeFetchCause | undefined {
  if (error instanceof Error && 'cause' in error) {
    const cause = (error as Error & { cause?: unknown }).cause;
    if (cause !== undefined && cause !== null && typeof cause === 'object') {
      const codeValue = (cause as { code?: unknown }).code;
      const messageValue = (cause as { message?: unknown }).message;
      const result: { code?: string; message?: string } = {};
      if (typeof codeValue === 'string') {
        result.code = codeValue;
      }
      if (typeof messageValue === 'string') {
        result.message = messageValue;
      }
      return result;
    }
  }
  return undefined;
}

export async function downloadToFile(options: DownloadOptions): Promise<void> {
  const env = options.env ?? process.env;
  let target: URL;
  try {
    target = new URL(options.url);
  } catch {
    throw usageError('Invalid download URL.', {
      code: 'provision_network_error',
      diagnostics: [`URL: ${sanitizeUrl(options.url)}`, 'URL could not be parsed.'],
      data: { url: sanitizeUrl(options.url) },
    });
  }

  if (target.protocol !== 'https:' && !(target.protocol === 'http:' && isLocalHost(target.hostname))) {
    throw usageError('Refusing non-HTTPS download URL.', {
      code: 'provision_network_error',
      diagnostics: [`URL: ${sanitizeUrl(options.url)}`, 'Downloads must use https:// (http://localhost is allowed for tests).'],
      data: { url: sanitizeUrl(options.url) },
    });
  }

  const { dispatcher, proxyUrl } = resolveProxy(target, env);

  await fs.mkdir(path.dirname(options.destPath), { recursive: true });

  let response: Response;
  try {
    response = await fetch(options.url, dispatcher !== undefined ? { dispatcher } : undefined);
  } catch (error) {
    const cause = extractCause(error);
    const message = error instanceof Error ? error.message : String(error);
    if (proxyUrl !== undefined) {
      throw proxyError(options.url, proxyUrl, cause?.code, cause?.message ?? message, error);
    }
    throw networkCauseError(options.url, cause?.code, cause?.message ?? message, error);
  }

  if (!response.ok) {
    if (response.status === 403 && response.headers.get('x-ratelimit-remaining') === '0') {
      throw rateLimitError(options.url, response.headers.get('x-ratelimit-reset'));
    }
    throw networkError(options.url, response.status, response.statusText);
  }

  if (response.body === null) {
    throw usageError('Adapter download returned an empty body.', {
      code: 'provision_network_error',
      diagnostics: [`URL: ${sanitizeUrl(options.url)}`],
      data: { url: sanitizeUrl(options.url) },
    });
  }

  const contentLengthHeader = response.headers.get('content-length');
  const totalBytes = contentLengthHeader !== null ? Number.parseInt(contentLengthHeader, 10) : undefined;
  const total = Number.isFinite(totalBytes) ? totalBytes : undefined;

  let bytesRead = 0;
  const onProgress = options.onProgress;
  const body = Readable.fromWeb(response.body as Parameters<typeof Readable.fromWeb>[0]);
  if (onProgress !== undefined) {
    body.on('data', (chunk: Buffer | string) => {
      bytesRead += typeof chunk === 'string' ? Buffer.byteLength(chunk) : chunk.length;
      onProgress(bytesRead, total);
    });
  }

  try {
    await pipeline(body, createWriteStream(options.destPath));
  } catch (error) {
    await fs.rm(options.destPath, { force: true }).catch(() => undefined);
    const message = error instanceof Error ? error.message : String(error);
    throw usageError('Adapter download stream failed.', {
      code: 'provision_network_error',
      diagnostics: [`URL: ${sanitizeUrl(options.url)}`, message],
      data: { url: sanitizeUrl(options.url) },
      cause: error,
    });
  }
}
