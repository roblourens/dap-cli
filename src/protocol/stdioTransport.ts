import type { ChildProcessWithoutNullStreams } from 'node:child_process';
import type { DapTransport } from './transport.js';

export interface StdioTransportOptions {
  name: string;
  child: ChildProcessWithoutNullStreams;
}

export function createStdioTransport(options: StdioTransportOptions): DapTransport {
  return {
    name: options.name,
    readable: options.child.stdout,
    writable: options.child.stdin,
    close(): Promise<void> {
      options.child.stdin.end();
      return Promise.resolve();
    },
  };
}
