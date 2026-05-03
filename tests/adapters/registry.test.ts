import { describe, expect, test } from 'vitest';
import { AdapterRegistry } from '../../src/adapters/registry.js';
import type { AdapterDescriptor } from '../../src/adapters/descriptor.js';

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
  test('resolves built-in adapters before custom adapters', () => {
    const registry = new AdapterRegistry({
      includeDefaultBuiltIns: false,
      builtInAdapters: [builtInAdapter],
      config: {
        adapters: {
          'test-built-in': { ...customAdapter, id: 'test-built-in', label: 'Custom shadow' },
        },
      },
    });

    expect(registry.resolve('test-built-in')).toBe(builtInAdapter);
  });

  test('resolves custom adapters from config', () => {
    const registry = new AdapterRegistry({ includeDefaultBuiltIns: false, config: { adapters: { custom: customAdapter } } });

    expect(registry.resolve('custom')).toEqual(customAdapter);
  });

  test('lists built-in and custom adapters', () => {
    const registry = new AdapterRegistry({ includeDefaultBuiltIns: false, builtInAdapters: [builtInAdapter], config: { adapters: { custom: customAdapter } } });

    expect(registry.listAll()).toEqual([
      { id: 'custom', label: 'Custom adapter', source: 'custom' },
      { id: 'test-built-in', label: 'Test built-in adapter', source: 'built-in' },
    ]);
  });

  test('reports adapter_not_found for unknown adapters', () => {
    const registry = new AdapterRegistry({ includeDefaultBuiltIns: false });

    expect(catchErrorCode(() => registry.resolve('missing'))).toBe('adapter_not_found');
  });

  test('includes js-debug as a lazy built-in adapter', () => {
    const registry = new AdapterRegistry();

    expect(registry.listAll()).toContainEqual({ id: 'js-debug', label: 'JavaScript Debug Adapter (Node, Chrome, Electron)', source: 'built-in' });
  });

  test('includes debugpy as a built-in adapter', () => {
    const registry = new AdapterRegistry();

    expect(registry.resolve('debugpy')).toEqual({
      id: 'debugpy',
      label: 'Python Debug Adapter (debugpy)',
      transport: { kind: 'stdio', command: 'python3', args: ['-m', 'debugpy.adapter'] },
    });
  });
});

function catchErrorCode(callback: () => unknown): string | undefined {
  try {
    callback();
  } catch (error: unknown) {
    return error instanceof Error && 'code' in error && typeof error.code === 'string' ? error.code : undefined;
  }

  return undefined;
}