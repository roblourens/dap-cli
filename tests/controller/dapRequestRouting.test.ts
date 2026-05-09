import path from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { createControllerClient, type ControllerClient } from '../../src/controller/client.js';
import { startControllerServer, type ControllerServer } from '../../src/controller/server.js';
import { createTempDapCliEnv, type TempDapCliEnv } from '../../src/testing/tempEnv.js';

let tempEnv: TempDapCliEnv;
let server: ControllerServer | undefined;
let client: ControllerClient | undefined;

beforeEach(async () => {
  tempEnv = await createTempDapCliEnv('dap-cli-pyeval-routing-');
  server = await startControllerServer({ dapCliHome: tempEnv.dapCliHome });
  client = await createControllerClient({ dapCliHome: tempEnv.dapCliHome });
});

afterEach(async () => {
  if (client !== undefined) {
    await client.close();
    client = undefined;
  }
  if (server !== undefined) {
    await server.stop();
    server = undefined;
  }
  await tempEnv.cleanup();
});

async function startScriptedSession(name: string, script: string, adapterId: 'debugpy' | 'js-debug'): Promise<void> {
  await client!.request('dap.start', {
    mode: 'launch',
    name,
    descriptor: {
      id: adapterId,
      label: `Fake ${adapterId} adapter (Phase 16-01 routing test)`,
      transport: {
        kind: 'stdio',
        command: process.execPath,
        args: ['--experimental-strip-types', path.join(process.cwd(), 'tests', 'fixtures', 'fake-adapter-entry.ts'), '--script', script, '--mode', 'launch'],
      },
    },
  });
}

interface EvaluateBody {
  result: string;
  variablesReference: number;
}

interface CliErrorEnvelope {
  code: string;
  message: string;
  category: string;
  data?: { exec_form?: unknown; original_expression?: unknown };
  adapter?: { descriptorId?: string };
}

// Phase 16-01 (PYEVAL-01): controller-side auto-wrap of statement-shaped Python on
// debugpy `evaluate`, with a SyntaxError-fallback that upgrades the error envelope
// to `evaluate_requires_exec`.
describe('routeDapRequest — Python evaluate auto-wrap (Phase 16-01)', () => {
  test('debugpy + statement: controller wraps args.expression with exec("...")', async () => {
    await startScriptedSession('py-wrap', 'py-evaluate-wrap-import', 'debugpy');
    const response = await client!.request<EvaluateBody>('dap.request', {
      command: 'evaluate',
      args: { expression: 'import os' },
      name: 'py-wrap',
    });
    expect(response.result).toBe('wrapped-ok');
  });

  test('debugpy + pure expression: controller forwards args.expression unchanged', async () => {
    await startScriptedSession('py-passthrough', 'py-evaluate-passthrough-expression', 'debugpy');
    const response = await client!.request<EvaluateBody>('dap.request', {
      command: 'evaluate',
      args: { expression: 'x + 1' },
      name: 'py-passthrough',
    });
    expect(response.result).toBe('passthrough-ok');
  });

  test('non-debugpy adapter: statement is forwarded verbatim (wrap path skipped)', async () => {
    await startScriptedSession('jsdebug', 'py-evaluate-jsdebug-untouched', 'js-debug');
    const response = await client!.request<EvaluateBody>('dap.request', {
      command: 'evaluate',
      args: { expression: 'import os' },
      name: 'jsdebug',
    });
    expect(response.result).toBe('jsdebug-untouched');
  });

  test('opt-out via context "no-auto-wrap": expression unchanged AND context token stripped', async () => {
    await startScriptedSession('optout', 'py-evaluate-optout', 'debugpy');
    const response = await client!.request<EvaluateBody>('dap.request', {
      command: 'evaluate',
      args: { expression: 'import os', context: 'no-auto-wrap' },
      name: 'optout',
    });
    expect(response.result).toBe('optout-ok');
  });

  test('SyntaxError on debugpy evaluate is upgraded to evaluate_requires_exec envelope', async () => {
    await startScriptedSession('syntax-fallback', 'py-evaluate-syntax-error-fallback', 'debugpy');
    let captured: CliErrorEnvelope | undefined;
    try {
      await client!.request('dap.request', {
        command: 'evaluate',
        args: { expression: '@@@ not python @@@' },
        name: 'syntax-fallback',
      });
    } catch (error: unknown) {
      captured = error as CliErrorEnvelope;
    }
    expect(captured).toBeDefined();
    expect(captured!.code).toBe('evaluate_requires_exec');
    expect(captured!.category).toBe('dap');
    expect(captured!.data?.exec_form).toBe('exec("@@@ not python @@@")');
    expect(captured!.data?.original_expression).toBe('@@@ not python @@@');
    expect(captured!.adapter?.descriptorId).toBe('debugpy');
  });
});
