import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { AdapterRegistry } from '../../src/adapters/registry.js';
import type { AdapterDescriptor } from '../../src/adapters/descriptor.js';
import { createCliTestEnv, type CliTestEnv } from '../helpers/runCli.js';
import { provisionAdapterIntoTempEnv } from '../../src/testing/tempEnv.js';

const builtInAdapter: AdapterDescriptor = {
  id: 'test-built-in',
  label: 'Test built-in adapter',
  transport: { kind: 'stdio', command: process.execPath, args: [] },
};

const customAdapter: AdapterDescriptor = {
  id: 'custom',
  label: 'Custom adapter',
  transport: { kind: 'socket', host: '127.0.0.1', port: 4711 },
};

describe('AdapterRegistry', () => {
  test('resolves built-in adapters before custom adapters', async () => {
    const registry = new AdapterRegistry({
      includeDefaultBuiltIns: false,
      builtInAdapters: [builtInAdapter],
      config: {
        adapters: {
          'test-built-in': { ...customAdapter, id: 'test-built-in', label: 'Custom shadow' },
        },
      },
    });

    expect(await registry.resolve('test-built-in')).toBe(builtInAdapter);
  });

  test('resolves custom adapters from config', async () => {
    const registry = new AdapterRegistry({ includeDefaultBuiltIns: false, config: { adapters: { custom: customAdapter } } });

    expect(await registry.resolve('custom')).toEqual(customAdapter);
  });

  test('lists built-in and custom adapters', () => {
    const registry = new AdapterRegistry({ includeDefaultBuiltIns: false, builtInAdapters: [builtInAdapter], config: { adapters: { custom: customAdapter } } });

    expect(registry.listAll()).toEqual([
      { id: 'custom', label: 'Custom adapter', source: 'custom' },
      { id: 'test-built-in', label: 'Test built-in adapter', source: 'built-in' },
    ]);
  });

  test('reports adapter_not_found for unknown adapters', async () => {
    const registry = new AdapterRegistry({ includeDefaultBuiltIns: false });

    await expect(registry.resolve('missing')).rejects.toMatchObject({ code: 'adapter_not_found' });
  });

  test('includes js-debug as a lazy built-in adapter', () => {
    const registry = new AdapterRegistry();

    expect(registry.listAll()).toContainEqual({ id: 'js-debug', label: 'JavaScript Debug Adapter (Node, Chrome, Electron)', source: 'built-in' });
  });

  test('includes delve as a lazy built-in adapter', () => {
    const registry = new AdapterRegistry();

    expect(registry.listAll()).toContainEqual({ id: 'delve', label: 'Go Debug Adapter (Delve)', source: 'built-in' });
  });

  describe('with provisioned debugpy cache', () => {
    let testEnv: CliTestEnv;
    let previousDapCliHome: string | undefined;

    beforeEach(async (ctx) => {
      testEnv = await createCliTestEnv('dap-cli-registry-');
      try {
        await provisionAdapterIntoTempEnv(testEnv, 'debugpy');
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        ctx.skip(`debugpy not provisioned in user DAP_CLI_HOME — ${message}`);
        return;
      }
      previousDapCliHome = process.env.DAP_CLI_HOME;
      process.env.DAP_CLI_HOME = testEnv.dapCliHome;
    });

    afterEach(async () => {
      if (previousDapCliHome === undefined) {
        delete process.env.DAP_CLI_HOME;
      } else {
        process.env.DAP_CLI_HOME = previousDapCliHome;
      }
      previousDapCliHome = undefined;
      await testEnv.cleanup();
    });

    test('includes debugpy as a built-in adapter', async () => {
      const registry = new AdapterRegistry();
      const descriptor = await registry.resolve('debugpy');

      expect(descriptor.id).toBe('debugpy');
      expect(descriptor.label).toBe('Python Debug Adapter (debugpy)');
      expect(descriptor.transport.kind).toBe('stdio');
      if (descriptor.transport.kind !== 'stdio') {
        throw new Error('Expected debugpy to use stdio transport.');
      }
      expect(descriptor.transport.command.length).toBeGreaterThan(0);
      expect(descriptor.transport.args).toEqual(['-m', 'debugpy.adapter']);
    });
  });
});