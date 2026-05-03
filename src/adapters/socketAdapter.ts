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
}

export interface StartedServerSocketAdapter extends ConnectedSocketAdapter {
  ownedAdapter: OwnedAdapterMetadata;
}

export async function connectSocketAdapter(adapterId: string, descriptor: Extract<AdapterDescriptor['transport'], { kind: 'socket' }>): Promise<ConnectedSocketAdapter> {
  const transport = await connectSocketTransport({ name: adapterId, host: descriptor.host, port: descriptor.port });
  return {
    transport,
    close: () => transport.close(),
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

  child.stderr.on('data', (chunk: Buffer) => {
    const text = chunk.toString('utf8');
    logStream.write(text);
    appendStderrTail(stderrTail, text);
  });

  child.on('error', error => {
    const text = error.message;
    logStream.write(`${text}\n`);
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
