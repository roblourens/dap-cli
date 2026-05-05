import { spawn, type ChildProcess } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { connectSocketTransport } from '../protocol/socketTransport.js';
import type { DapTransport } from '../protocol/transport.js';
import type { OwnedAdapterMetadata } from '../sessions/session.js';
import type { AdapterDescriptor } from './descriptor.js';

export interface ConnectedSocketAdapter {
  transport: DapTransport;
  close(): Promise<void>;
  /**
   * Open an additional DAP transport to the same adapter endpoint.
   *
   * pwa-chrome / pwa-node js-debug adapters serve their dapDebugServer over a
   * TCP socket that accepts multiple concurrent DAP connections — one per child
   * session in the parent/child multiplexing model. Plan 05-04 uses this to
   * bring up child sessions without spawning a second adapter process.
   */
  openChildTransport?(name: string): Promise<DapTransport>;
}

export interface StartedServerSocketAdapter extends ConnectedSocketAdapter {
  ownedAdapter: OwnedAdapterMetadata;
}

export async function connectSocketAdapter(adapterId: string, descriptor: Extract<AdapterDescriptor['transport'], { kind: 'socket' }>): Promise<ConnectedSocketAdapter> {
  const transport = await connectSocketTransport({ name: adapterId, host: descriptor.host, port: descriptor.port });
  return {
    transport,
    close: () => transport.close(),
    openChildTransport: name => connectSocketTransport({ name, host: descriptor.host, port: descriptor.port }),
  };
}

export async function startServerSocketAdapter(adapterId: string, descriptor: Extract<AdapterDescriptor['transport'], { kind: 'server' }>, logDir: string): Promise<StartedServerSocketAdapter> {
  const port = await getFreePort(descriptor.host);
  const args = descriptor.args.map(arg => arg === '${port}' ? String(port) : arg);
  const child = spawn(descriptor.command, args, {
    cwd: descriptor.cwd,
    env: descriptor.env === undefined ? process.env : { ...process.env, ...descriptor.env },
    stdio: ['ignore', 'ignore', 'pipe'],
    shell: false,
  });
  const stderrTail: string[] = [];
  const logPath = path.join(logDir, `${adapterId}-${child.pid ?? process.pid}.log`);
  const logStream = createWriteStream(logPath, { flags: 'a' });

  // Plan 05-21 (gap H-5): write a header line so a 0-byte log file
  // unambiguously means "we never started the adapter". js-debug in
  // particular emits its DAP traffic over its socket transport — not
  // stderr — so without this header the log file is genuinely empty
  // for healthy sessions. js-debug's own DAP/CDP trace is wired
  // separately via `applyJsDebugTraceDefaults` in `builtins/jsDebug.ts`.
  logStream.write(`[dap-cli] adapter ${adapterId} started pid=${child.pid ?? 'unknown'} at ${new Date().toISOString()}\n`);

  child.stderr.on('data', (chunk: Buffer) => {
    const text = chunk.toString('utf8');
    logStream.write(text);
    appendStderrTail(stderrTail, text);
  });

  child.on('error', error => {
    const text = error.message;
    logStream.write(`[dap-cli] adapter ${adapterId} spawn error: ${text}\n`);
    appendStderrTail(stderrTail, text);
  });

  try {
    const transport = await connectWithRetry(adapterId, descriptor.host, port);
    return {
      transport,
      ownedAdapter: {
        pid: child.pid,
        logPath,
        stderrTail,
        startedByDapCli: true,
      },
      openChildTransport: name => connectSocketTransport({ name, host: descriptor.host, port }),
      async close(): Promise<void> {
        await transport.close();
        await terminateChild(child);
        await new Promise<void>(resolve => {
          logStream.end(() => resolve());
        });
      },
    };
  } catch (error) {
    await terminateChild(child);
    await new Promise<void>(resolve => {
      logStream.end(() => resolve());
    });
    throw error;
  }
}

async function connectWithRetry(adapterId: string, host: '127.0.0.1', port: number): Promise<DapTransport> {
  const deadline = Date.now() + 5_000;
  let lastError: unknown;

  while (Date.now() < deadline) {
    try {
      return await connectSocketTransport({ name: adapterId, host, port, timeoutMs: 500 });
    } catch (error) {
      lastError = error;
      await delay(50);
    }
  }

  throw lastError instanceof Error ? lastError : new Error('Timed out connecting DAP server adapter.');
}

function getFreePort(host: '127.0.0.1'): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, host, () => {
      const address = server.address();
      server.close(() => {
        if (typeof address === 'object' && address !== null) {
          resolve(address.port);
          return;
        }

        reject(new Error('Failed to allocate a local adapter server port.'));
      });
    });
  });
}

async function terminateChild(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) {
    return;
  }

  child.kill('SIGTERM');
  if (await waitForExit(child, 100)) {
    return;
  }

  child.kill('SIGKILL');
  await waitForExit(child, 100);
}

function waitForExit(child: ChildProcess, timeoutMs: number): Promise<boolean> {
  if (child.exitCode !== null || child.signalCode !== null) {
    return Promise.resolve(true);
  }

  return new Promise(resolve => {
    const timer = setTimeout(() => {
      child.off('exit', onExit);
      resolve(false);
    }, timeoutMs);
    const onExit = (): void => {
      clearTimeout(timer);
      resolve(true);
    };
    child.once('exit', onExit);
  });
}

function appendStderrTail(stderrTail: string[], text: string): void {
  for (const line of text.split(/\r?\n/).filter(value => value.length > 0)) {
    stderrTail.push(line);
    while (stderrTail.length > 100) {
      stderrTail.shift();
    }
  }
}

async function delay(ms: number): Promise<void> {
  await new Promise(resolve => setTimeout(resolve, ms));
}
