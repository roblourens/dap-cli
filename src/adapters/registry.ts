import type { AdapterDescriptor } from './descriptor.js';
import { loadAdapterConfig, type AdapterConfig } from './config.js';
import { createDebugpyDescriptor } from './builtins/debugpy.js';
import { createDelveDescriptor } from './builtins/delve.js';
import { createJsDebugDescriptor } from './builtins/jsDebug.js';
import { usageError } from '../cli/errors.js';

export interface AdapterRegistryEntry {
  id: string;
  label: string;
  source: 'built-in' | 'custom';
}

export interface AdapterRegistryOptions {
  builtInAdapters?: readonly AdapterDescriptor[];
  config?: AdapterConfig;
  includeDefaultBuiltIns?: boolean;
}

export interface CreateAdapterRegistryOptions {
  dapCliHome?: string;
  builtInAdapters?: readonly AdapterDescriptor[];
  includeDefaultBuiltIns?: boolean;
}

interface BuiltInAdapterFactory {
  id: string;
  label: string;
  create(): AdapterDescriptor | Promise<AdapterDescriptor>;
}

export class AdapterRegistry {
  private readonly builtInAdapters = new Map<string, BuiltInAdapterFactory>();
  private readonly customAdapters = new Map<string, AdapterDescriptor>();

  public constructor(options: AdapterRegistryOptions = {}) {
    if (options.includeDefaultBuiltIns !== false) {
      this.builtInAdapters.set('js-debug', {
        id: 'js-debug',
        label: 'JavaScript Debug Adapter (Node, Chrome, Electron)',
        create: () => createJsDebugDescriptor(),
      });
      this.builtInAdapters.set('debugpy', {
        id: 'debugpy',
        label: 'Python Debug Adapter (debugpy)',
        create: () => createDebugpyDescriptor(),
      });
      this.builtInAdapters.set('delve', {
        id: 'delve',
        label: 'Go Debug Adapter (Delve)',
        create: () => createDelveDescriptor(),
      });
    }

    for (const descriptor of options.builtInAdapters ?? []) {
      this.builtInAdapters.set(descriptor.id, {
        id: descriptor.id,
        label: descriptor.label,
        create: () => descriptor,
      });
    }

    for (const descriptor of Object.values(options.config?.adapters ?? {})) {
      this.customAdapters.set(descriptor.id, descriptor);
    }
  }

  public async resolve(id: string): Promise<AdapterDescriptor> {
    const builtInAdapter = this.builtInAdapters.get(id);
    if (builtInAdapter !== undefined) {
      return builtInAdapter.create();
    }

    const customAdapter = this.customAdapters.get(id);
    if (customAdapter !== undefined) {
      return customAdapter;
    }

    throw usageError(`Adapter '${id}' was not found.`, {
      code: 'adapter_not_found',
      diagnostics: [`No built-in or custom adapter is configured with id '${id}'.`],
    });
  }

  public listAll(): AdapterRegistryEntry[] {
    const entries: AdapterRegistryEntry[] = [];
    for (const descriptor of this.builtInAdapters.values()) {
      entries.push({ id: descriptor.id, label: descriptor.label, source: 'built-in' });
    }
    for (const descriptor of this.customAdapters.values()) {
      if (!this.builtInAdapters.has(descriptor.id)) {
        entries.push({ id: descriptor.id, label: descriptor.label, source: 'custom' });
      }
    }

    return entries.sort((left, right) => left.id.localeCompare(right.id));
  }
}

export async function createAdapterRegistry(options: CreateAdapterRegistryOptions = {}): Promise<AdapterRegistry> {
  const config = await loadAdapterConfig(options.dapCliHome);
  return new AdapterRegistry({
    ...(options.builtInAdapters === undefined ? {} : { builtInAdapters: options.builtInAdapters }),
    ...(options.includeDefaultBuiltIns === undefined ? {} : { includeDefaultBuiltIns: options.includeDefaultBuiltIns }),
    config,
  });
}