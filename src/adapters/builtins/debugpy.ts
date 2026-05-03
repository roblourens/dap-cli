import type { AdapterDescriptor } from '../descriptor.js';

export function createDebugpyDescriptor(pythonPath = 'python3'): AdapterDescriptor {
  return {
    id: 'debugpy',
    label: 'Python Debug Adapter (debugpy)',
    transport: {
      kind: 'stdio',
      command: pythonPath,
      args: ['-m', 'debugpy.adapter'],
    },
  };
}