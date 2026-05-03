import { spawn } from 'node:child_process';
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
  close(): Promise<void>;
}

export interface StartProcessAdapterOptions {
  descriptor: Extract<AdapterDescriptor['transport'], { kind: 'stdio' }>;
  adapterId: string;
  logDir: string;
}

export function startProcessAdapter(options: StartProcessAdapterOptions): StartedProcessAdapter {
  const child = spawn(options.descriptor.command, options.descriptor.args, {
    cwd: options.descriptor.cwd,
    env: options.descriptor.env === undefined ? process.env : { ...process.env, ...options.descriptor.env },
    stdio: ['pipe', 'pipe', 'pipe'],
    shell: false,
  });
  const stderrTail: string[] = [];
  const logPath = path.join(options.logDir, `${options.adapterId}-${child.pid ?? process.pid}.log`);
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

  return {
    transport: createStdioTransport({ name: options.adapterId, child }),
    ownedAdapter: {
      pid: child.pid,
      logPath,
      stderrTail,
      startedByDapCli: true,
    },
    close(): Promise<void> {
      child.stdin.end();
      child.kill('SIGTERM');
      return new Promise(resolve => {
        logStream.end(() => resolve());
      });
    },
  };
}

function appendStderrTail(stderrTail: string[], text: string): void {
  for (const line of text.split(/\r?\n/).filter(value => value.length > 0)) {
    stderrTail.push(line);
    while (stderrTail.length > stderrTailLimit) {
      stderrTail.shift();
    }
  }
}
