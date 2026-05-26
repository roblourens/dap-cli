import * as http from 'node:http';
import { promises as fs } from 'node:fs';
import path from 'node:path';

export interface FakeReleaseHandler {
  /** Returns true to claim this request. */
  readonly match: (req: http.IncomingMessage) => boolean;
  readonly respond: (req: http.IncomingMessage, res: http.ServerResponse) => Promise<void> | void;
}

export interface FakeReleaseServer {
  readonly url: string;
  readonly host: string;
  readonly port: number;
  hitCount(): number;
  hitsByPath(): ReadonlyMap<string, number>;
  close(): Promise<void>;
}

export async function startFakeReleaseServer(handlers: readonly FakeReleaseHandler[]): Promise<FakeReleaseServer> {
  let hits = 0;
  const hitsByPath = new Map<string, number>();
  const server = http.createServer((req, res) => {
    hits += 1;
    const url = req.url ?? '';
    hitsByPath.set(url, (hitsByPath.get(url) ?? 0) + 1);
    void (async () => {
      try {
        for (const handler of handlers) {
          if (handler.match(req)) {
            await handler.respond(req, res);
            return;
          }
        }
        res.statusCode = 404;
        res.end();
      } catch (error) {
        if (!res.headersSent) {
          res.statusCode = 500;
        }
        res.end();
         
        console.error('FakeReleaseServer handler error:', error);
      }
    })();
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      server.off('error', reject);
      resolve();
    });
  });
  const address = server.address();
  if (address === null || typeof address === 'string') {
    throw new Error('FakeReleaseServer failed to bind');
  }
  const port = address.port;
  const host = `127.0.0.1:${port}`;
  return {
    url: `http://${host}`,
    host,
    port,
    hitCount: () => hits,
    hitsByPath: () => new Map(hitsByPath),
    close: () => new Promise<void>(resolve => server.close(() => { resolve(); })),
  };
}

export function serveBuffer(body: Buffer, headers: Record<string, string> = {}): FakeReleaseHandler['respond'] {
  return (_req, res) => {
    res.statusCode = 200;
    res.setHeader('Content-Length', String(body.length));
    for (const [name, value] of Object.entries(headers)) {
      res.setHeader(name, value);
    }
    res.end(body);
  };
}

export function serveStatus(status: number, headers: Record<string, string> = {}, body: Buffer | string = ''): FakeReleaseHandler['respond'] {
  return (_req, res) => {
    res.statusCode = status;
    for (const [name, value] of Object.entries(headers)) {
      res.setHeader(name, value);
    }
    res.end(body);
  };
}

export async function readFileBuffer(filePath: string): Promise<Buffer> {
  return fs.readFile(filePath);
}

export function joinUrl(base: string, ...parts: string[]): string {
  return parts.reduce((acc, part) => acc.replace(/\/$/, '') + '/' + part.replace(/^\//, ''), base);
}

// --- Adapter-specific handler builders --------------------------------------
// These keep test wiring DRY: every provisioner test points its release base
// URL at the FakeReleaseServer and registers the relevant handler(s).

export interface JsDebugTarballHandlerOptions {
  readonly version: string;
  readonly archivePath: string;
}

/** Match the canonical js-debug release URL path for the given version. */
export function jsDebugTarballHandler(options: JsDebugTarballHandlerOptions): FakeReleaseHandler {
  const expectedPath = `/microsoft/vscode-js-debug/releases/download/v${options.version}/js-debug-dap-v${options.version}.tar.gz`;
  return {
    match: req => req.url === expectedPath,
    respond: async (_req, res) => {
      const body = await fs.readFile(options.archivePath);
      res.statusCode = 200;
      res.setHeader('Content-Length', String(body.length));
      res.setHeader('Content-Type', 'application/gzip');
      res.end(body);
    },
  };
}

export interface DelveArchiveHandlerOptions {
  readonly version: string;
  readonly platformKey: string;
  readonly ext: 'tar.gz' | 'zip';
  readonly archivePath: string;
}

/** Match the canonical delve release URL path for the given version+platform. */
export function delveArchiveHandler(options: DelveArchiveHandlerOptions): FakeReleaseHandler {
  const bareVersion = options.version.replace(/^v/, '');
  const expectedPath = `/go-delve/delve/releases/download/${options.version}/dlv_${bareVersion}_${options.platformKey}.${options.ext}`;
  return {
    match: req => req.url === expectedPath,
    respond: async (_req, res) => {
      const body = await fs.readFile(options.archivePath);
      res.statusCode = 200;
      res.setHeader('Content-Length', String(body.length));
      res.setHeader('Content-Type', options.ext === 'zip' ? 'application/zip' : 'application/gzip');
      res.end(body);
    },
  };
}

export interface FixedStatusHandlerOptions {
  readonly pathPattern: string | RegExp;
  readonly status: number;
  readonly headers?: Record<string, string>;
  readonly body?: Buffer | string;
}

/** Always reply with a fixed status code for URLs matching the pattern. */
export function fixedStatusHandler(options: FixedStatusHandlerOptions): FakeReleaseHandler {
  const matches = (url: string): boolean => {
    if (typeof options.pathPattern === 'string') {
      return url === options.pathPattern;
    }
    return options.pathPattern.test(url);
  };
  return {
    match: req => matches(req.url ?? ''),
    respond: (_req, res) => {
      res.statusCode = options.status;
      for (const [name, value] of Object.entries(options.headers ?? {})) {
        res.setHeader(name, value);
      }
      res.end(options.body ?? '');
    },
  };
}

// Silences unused-import noise when this helper is consumed selectively.
export const __FAKE_RELEASE_SERVER_HELPER__ = {
  startFakeReleaseServer,
  serveBuffer,
  serveStatus,
  readFileBuffer,
  joinUrl,
  jsDebugTarballHandler,
  delveArchiveHandler,
  fixedStatusHandler,
  path,
};
