import { promises as fs } from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { startControllerServer, type ControllerServer } from '../../src/controller/server.js';
import { createCliTestEnv, runCli, type CliTestEnv } from '../helpers/runCli.js';

interface JsonEnvelope<T> {
  ok: true;
  data: T;
  meta: { command: string; timestamp: string };
}

interface JsonFailureEnvelope {
  ok: false;
  error: {
    code: string;
    category: string;
    exitCode: number;
    diagnostics: string[];
    data?: Record<string, unknown>;
  };
  meta: { command: string; timestamp: string };
}

let testEnv: CliTestEnv;
let server: ControllerServer | undefined;

beforeEach(async () => {
  testEnv = await createCliTestEnv('dap-cli-launch-inference-');
  server = await startControllerServer({ dapCliHome: testEnv.dapCliHome });
});

afterEach(async () => {
  if (server !== undefined) {
    await server.stop();
    server = undefined;
  }
  await testEnv.cleanup();
});

describe('launch adapter inference', () => {
  test('--type only resolves adapter via custom launchConfigTypeMap', async () => {
    await writeAdapterConfig(testEnv.dapCliHome, {
      adapters: {
        'infer-fake': createCustomFakeDescriptor('infer-fake', 'stopped-on-entry'),
      },
      launchConfigTypeMap: { 'infer-type': 'infer-fake' },
    });

    const start = await runCli(['start'], { env: testEnv.env });
    expect(start.exitCode).toBe(0);

    const launch = await runCli([
      'launch',
      '--type', 'infer-type',
      '--json', '{}',
      '--name', 'typeonly',
    ], { env: testEnv.env });

    expect(launch.exitCode, JSON.stringify(launch)).toBe(0);
    const envelope = parseEnvelope<{ sessionId: string; lifecycle: string }>(launch.stdout);
    expect(envelope.data.lifecycle).toBe('stopped');

    const capabilities = await runCli(['capabilities', '--name', 'typeonly'], { env: testEnv.env });
    const capEnvelope = parseEnvelope<{ adapterId: string }>(capabilities.stdout);
    expect(capEnvelope.data.adapterId).toBe('infer-fake');
  });

  test('explicit --adapter wins over an unmapped --type', async () => {
    await writeAdapterConfig(testEnv.dapCliHome, {
      adapters: {
        'infer-fake': createCustomFakeDescriptor('infer-fake', 'stopped-on-entry'),
      },
    });

    const start = await runCli(['start'], { env: testEnv.env });
    expect(start.exitCode).toBe(0);

    const launch = await runCli([
      'launch',
      '--adapter', 'infer-fake',
      '--type', 'some-other-unmapped',
      '--name', 'explicit',
    ], { env: testEnv.env });

    expect(launch.exitCode, JSON.stringify(launch)).toBe(0);
    const envelope = parseEnvelope<{ sessionId: string; lifecycle: string }>(launch.stdout);
    expect(envelope.data.lifecycle).toBe('stopped');

    const capabilities = await runCli(['capabilities', '--name', 'explicit'], { env: testEnv.env });
    const capEnvelope = parseEnvelope<{ adapterId: string }>(capabilities.stdout);
    expect(capEnvelope.data.adapterId).toBe('infer-fake');
  });

  test('unsupported program extension fails with adapter_inference_failed', async () => {
    const start = await runCli(['start'], { env: testEnv.env });
    expect(start.exitCode).toBe(0);

    const launch = await runCli([
      'launch',
      '--program', '/tmp/foo.unknown',
      '--name', 'infer-fail',
    ], { env: testEnv.env });

    expect(launch.exitCode).toBe(2);
    const failure = launch.envelope as unknown as JsonFailureEnvelope;
    expect(failure.ok).toBe(false);
    expect(failure.error.code).toBe('adapter_inference_failed');
    expect(failure.error.data?.extension).toBe('.unknown');
  });

  test('all-absent defaults to fake adapter', async () => {
    const start = await runCli(['start'], { env: testEnv.env });
    expect(start.exitCode).toBe(0);

    const launch = await runCli([
      'launch',
      '--name', 'allabsent',
    ], { env: testEnv.env });

    expect(launch.exitCode, JSON.stringify(launch)).toBe(0);
    const envelope = parseEnvelope<{ sessionId: string; lifecycle: string }>(launch.stdout);
    expect(envelope.data.lifecycle).toBe('stopped');

    const capabilities = await runCli(['capabilities', '--name', 'allabsent'], { env: testEnv.env });
    const capEnvelope = parseEnvelope<{ adapterId: string }>(capabilities.stdout);
    expect(capEnvelope.data.adapterId).toBe('fake');
  });
});

function parseEnvelope<T>(stdout: string): JsonEnvelope<T> {
  const text = stdout.trim();
  return JSON.parse(text) as JsonEnvelope<T>;
}

function createCustomFakeDescriptor(id: string, script: string, defaults: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id,
    label: id,
    transport: {
      kind: 'stdio',
      command: process.execPath,
      args: ['--experimental-strip-types', path.join(process.cwd(), 'tests', 'fixtures', 'fake-adapter-entry.ts'), '--script', script],
    },
    ...defaults,
  };
}

async function writeAdapterConfig(dapCliHome: string, config: Record<string, unknown>): Promise<void> {
  const configDir = path.join(dapCliHome, 'config');
  await fs.mkdir(configDir, { recursive: true });
  await fs.writeFile(path.join(configDir, 'adapters.json'), `${JSON.stringify(config, null, 2)}\n`, 'utf8');
}
