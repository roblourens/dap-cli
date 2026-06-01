import path from 'node:path';
import type { AdapterDescriptor } from '../descriptor.js';
import { getDapCliAdaptersDir } from '../../config/paths.js';
import { resolveAssumeYes } from '../../cli/confirm.js';
import { provisionAdapter } from '../provision/index.js';

export async function createCodeLldbDescriptor(codelldbPath?: string): Promise<AdapterDescriptor> {
  const entrypoint = codelldbPath ?? (await resolveDefaultCodeLldbPath());
  const libLldbPath = path.join(path.dirname(entrypoint), '..', 'lldb', 'lib', 'liblldb.dylib');
  return {
    id: 'codelldb',
    label: 'Rust Debug Adapter (CodeLLDB)',
    transport: {
      kind: 'server',
      command: entrypoint,
      args: ['--liblldb', libLldbPath, '--port', '${port}'],
      host: '127.0.0.1',
    },
  };
}

async function resolveDefaultCodeLldbPath(env: NodeJS.ProcessEnv = process.env): Promise<string> {
  const result = await provisionAdapter('codelldb', {
    env,
    assumeYes: resolveAssumeYes(undefined, env),
    adaptersDir: getDapCliAdaptersDir(env),
  });
  return result.entrypoint;
}