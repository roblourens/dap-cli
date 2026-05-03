import { connectSocketTransport } from '../protocol/socketTransport.js';
import type { DapTransport } from '../protocol/transport.js';
import type { AdapterDescriptor } from './descriptor.js';

export interface ConnectedSocketAdapter {
  transport: DapTransport;
  close(): Promise<void>;
}

export async function connectSocketAdapter(adapterId: string, descriptor: Extract<AdapterDescriptor['transport'], { kind: 'socket' }>): Promise<ConnectedSocketAdapter> {
  const transport = await connectSocketTransport({ name: adapterId, host: descriptor.host, port: descriptor.port });
  return {
    transport,
    close: () => transport.close(),
  };
}
