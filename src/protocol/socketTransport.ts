import net from 'node:net';
import type { DapTransport } from './transport.js';

export interface SocketTransportOptions {
  name: string;
  socket: net.Socket;
}

export interface ConnectSocketTransportOptions {
  name: string;
  host: '127.0.0.1';
  port: number;
  timeoutMs?: number;
}

export function createSocketTransport(options: SocketTransportOptions): DapTransport {
  return {
    name: options.name,
    readable: options.socket,
    writable: options.socket,
    close(): Promise<void> {
      if (options.socket.closed) {
        return Promise.resolve();
      }
      return new Promise(resolve => {
        options.socket.once('close', resolve);
        if (!options.socket.destroyed) {
          options.socket.end();
          options.socket.destroy();
        }
      });
    },
  };
}

export async function connectSocketTransport(options: ConnectSocketTransportOptions): Promise<DapTransport> {
  const socket = await new Promise<net.Socket>((resolve, reject) => {
    const client = net.createConnection({ host: options.host, port: options.port });
    const timeout = setTimeout(() => {
      client.destroy();
      reject(new Error('Timed out connecting DAP socket transport.'));
    }, options.timeoutMs ?? 5_000);

    client.once('connect', () => {
      clearTimeout(timeout);
      resolve(client);
    });
    client.once('error', error => {
      clearTimeout(timeout);
      reject(error);
    });
  });

  return createSocketTransport({ name: options.name, socket });
}
