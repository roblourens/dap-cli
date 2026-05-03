import { describe, expect, test } from 'vitest';
import { DapClient } from '../../src/protocol/dapClient.js';
import { DapLifecycleController } from '../../src/protocol/lifecycle.js';
import { createFakeAdapterScript, createFakeAdapterTransport, startFakeSocketAdapter } from '../../src/testing/fakeAdapter.js';
import { connectSocketTransport } from '../../src/protocol/socketTransport.js';

describe('fake adapter harness', () => {
  test('drives a launch lifecycle and request over in-memory transport', async () => {
    const transport = createFakeAdapterTransport(createFakeAdapterScript('stopped-on-entry'));
    const client = new DapClient(transport, { requestTimeoutMs: 1_000 });
    const lifecycle = new DapLifecycleController(client);

    const result = await lifecycle.start({ mode: 'launch' });
    const threads = await client.request('threads');

    expect(result.capabilities).toEqual({ supportsConfigurationDoneRequest: true });
    expect(lifecycle.state.lifecycle).toBe('stopped');
    expect(threads).toEqual({ threads: [{ id: 1, name: 'main' }] });

    await lifecycle.disconnect();
    await client.close();
  });

  test('drives a launch lifecycle over socket transport', async () => {
    const server = await startFakeSocketAdapter(createFakeAdapterScript('stopped-on-entry'));
    const transport = await connectSocketTransport({ name: 'fake-socket', host: '127.0.0.1', port: server.port });
    const client = new DapClient(transport, { requestTimeoutMs: 1_000 });
    const lifecycle = new DapLifecycleController(client);

    try {
      await lifecycle.start({ mode: 'launch' });
      expect(lifecycle.state.lifecycle).toBe('stopped');
    } finally {
      await client.close();
      await server.close();
    }
  });
});
