import path from 'node:path';
import { usageError } from '../cli/errors.js';
import { resolveAdapterIdFromType } from './launchConfig.js';

export interface InferAdapterAndTypeArgs {
  adapter?: string | undefined;
  type?: string | undefined;
  program?: string | undefined;
  customTypeMap?: Record<string, string> | undefined;
}

export interface InferAdapterAndTypeResult {
  adapterId: string;
  type: string | undefined;
  inferred: { adapter: boolean; type: boolean };
}

const extensionTable: Record<string, { adapterId: string; type: string }> = {
  '.py': { adapterId: 'debugpy', type: 'python' },
  '.go': { adapterId: 'delve', type: 'go' },
  '.js': { adapterId: 'js-debug', type: 'pwa-node' },
  '.mjs': { adapterId: 'js-debug', type: 'pwa-node' },
  '.cjs': { adapterId: 'js-debug', type: 'pwa-node' },
  '.ts': { adapterId: 'js-debug', type: 'pwa-node' },
  '.mts': { adapterId: 'js-debug', type: 'pwa-node' },
  '.cts': { adapterId: 'js-debug', type: 'pwa-node' },
  '.html': { adapterId: 'js-debug', type: 'pwa-chrome' },
  '.htm': { adapterId: 'js-debug', type: 'pwa-chrome' },
};

export function inferAdapterAndType(args: InferAdapterAndTypeArgs): InferAdapterAndTypeResult {
  const { adapter, type, program, customTypeMap } = args;

  if (adapter !== undefined && type !== undefined) {
    return { adapterId: adapter, type, inferred: { adapter: false, type: false } };
  }

  if (adapter !== undefined) {
    const inferredType = defaultTypeForAdapter(adapter, program);
    return {
      adapterId: adapter,
      type: inferredType,
      inferred: { adapter: false, type: inferredType !== undefined },
    };
  }

  if (type !== undefined) {
    const adapterId = resolveAdapterIdFromType(type, customTypeMap);
    return { adapterId, type, inferred: { adapter: true, type: false } };
  }

  if (program !== undefined) {
    const extension = path.extname(program).toLowerCase();
    const match = extensionTable[extension];
    if (match === undefined) {
      throw usageError(`Cannot infer adapter from program extension '${extension}'. Pass --adapter or --type explicitly.`, {
        code: 'adapter_inference_failed',
        diagnostics: [`No adapter mapping is configured for program extension '${extension}'.`, 'Pass --adapter or --type explicitly.'],
        data: { program, extension },
      });
    }
    return { adapterId: match.adapterId, type: match.type, inferred: { adapter: true, type: true } };
  }

  return { adapterId: 'fake', type: undefined, inferred: { adapter: false, type: false } };
}

function defaultTypeForAdapter(adapterId: string, program: string | undefined): string | undefined {
  if (adapterId === 'js-debug') {
    if (program !== undefined) {
      const ext = path.extname(program).toLowerCase();
      if (ext === '.html' || ext === '.htm') {
        return 'pwa-chrome';
      }
    }
    return 'pwa-node';
  }
  if (adapterId === 'debugpy') {
    return 'python';
  }
  if (adapterId === 'delve') {
    return 'go';
  }
  if (adapterId === 'codelldb') {
    return 'lldb';
  }
  return undefined;
}
