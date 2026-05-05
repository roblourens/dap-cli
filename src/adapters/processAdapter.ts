import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import path from 'node:path';
import type { OwnedAdapterMetadata } from '../sessions/session.js';
import { createStdioTransport } from '../protocol/stdioTransport.js';
import type { DapTransport } from '../protocol/transport.js';
import type { AdapterDescriptor } from './descriptor.js';

const stderrTailLimit = 100;

export interface StartedProcessAdapter {
  transport: DapTransport;
  ownedAdapter: OwnedAdapterMetadata;
  /**
   * Plan 05-23 Task 1.5 (gap H-8 cascade): on POSIX, stdio adapters are
   * spawned with `detached: true` so the child becomes the leader of a new
   * process group whose pgid equals its pid. `terminateRuntime` signals the
   * negative pgid so SIGTERM/SIGKILL cascade to subprocesses (e.g. the
   * Chromium tree js-debug pwa-chrome spawns under itself). On Windows or
   * when `detached:true` is unsupported by the platform, this is undefined
   * and terminate falls back to per-PID signaling.
   */
  processGroupId?: number;
  close(): Promise<void>;
}

export interface StartProcessAdapterOptions {
  descriptor: Extract<AdapterDescriptor['transport'], { kind: 'stdio' }>;
  adapterId: string;
  logDir: string;
}

export function startProcessAdapter(options: StartProcessAdapterOptions): StartedProcessAdapter {
  // Plan 05-23 Task 1.5 (gap H-8): detached:true makes the child the leader
  // of its own process group on POSIX. We deliberately do NOT call
  // child.unref() — we still want the child's exit to be observable to the
  // parent controller for cleanup accounting.
  const detached = process.platform !== 'win32';
  const child = spawn(options.descriptor.command, options.descriptor.args, {
    cwd: options.descriptor.cwd,
    env: options.descriptor.env === undefined ? process.env : { ...process.env, ...options.descriptor.env },
    stdio: ['pipe', 'pipe', 'pipe'],
    shell: false,
    detached,
  });
  const processGroupId = detached && typeof child.pid === 'number' ? child.pid : undefined;
  const stderrTail: string[] = [];
  const logPath = path.join(options.logDir, `${options.adapterId}-${child.pid ?? process.pid}.log`);
  const logStream = createWriteStream(logPath, { flags: 'a' });

  // Plan 05-21 (gap H-5): write a header line so a 0-byte log file
  // unambiguously means "we never started the adapter" rather than
  // "the adapter ran fine but said nothing on stderr".
  logStream.write(`[dap-cli] adapter ${options.adapterId} started pid=${child.pid ?? 'unknown'} at ${new Date().toISOString()}\n`);

  child.stderr.on('data', (chunk: Buffer) => {
    const text = chunk.toString('utf8');
    logStream.write(text);
    appendStderrTail(stderrTail, text);
  });

  child.on('error', error => {
    const text = error.message;
    logStream.write(`[dap-cli] adapter ${options.adapterId} spawn error: ${text}\n`);
    appendStderrTail(stderrTail, text);
  });

  const adapter: StartedProcessAdapter = {
    transport: createStdioTransport({ name: options.adapterId, child }),
    ownedAdapter: {
      pid: child.pid,
      logPath,
      stderrTail,
      startedByDapCli: true,
    },
    async close(): Promise<void> {
      child.stdin.end();
      await terminateChild(child);
      await new Promise<void>(resolve => {
        logStream.end(() => resolve());
      });
    },
  };
  if (processGroupId !== undefined) {
    adapter.processGroupId = processGroupId;
  }
  return adapter;
}

async function terminateChild(child: ChildProcessWithoutNullStreams): Promise<void> {
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

function waitForExit(child: ChildProcessWithoutNullStreams, timeoutMs: number): Promise<boolean> {
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
    while (stderrTail.length > stderrTailLimit) {
      stderrTail.shift();
    }
  }
}
