import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { startControllerServer, type ControllerServer } from '../../src/controller/server.js';
import { SessionManager } from '../../src/sessions/sessionManager.js';
import { createCliTestEnv, runCli, type CliTestEnv } from '../helpers/runCli.js';

let testEnv: CliTestEnv;
let server: ControllerServer | undefined;

beforeEach(async () => {
  testEnv = await createCliTestEnv('dap-cli-session-cli-');
});

afterEach(async () => {
  if (server !== undefined) {
    await server.stop();
    server = undefined;
  }
  await testEnv.cleanup();
});

describe('session CLI commands', () => {
  test('lists sessions and inspects status by name', async () => {
    const manager = await SessionManager.create({ dapCliHome: testEnv.dapCliHome });
    await manager.create({ name: 'demo', lifecycle: 'running' });
    server = await startControllerServer({ dapCliHome: testEnv.dapCliHome });

    const sessions = await runCli(['sessions'], { env: testEnv.env });
    expect(sessions.exitCode).toBe(0);
    const sessionsEnvelope = parseJson(sessions.stdout) as { ok: true; data: Array<{ name: string; status: string }> };
    expect(sessionsEnvelope.ok).toBe(true);
    expect(sessionsEnvelope.data.map(session => ({ name: session.name, status: session.status }))).toEqual([{ name: 'demo', status: 'running' }]);

    const status = await runCli(['status', '--name', 'demo'], { env: testEnv.env });
    expect(status.exitCode).toBe(0);
    const statusEnvelope = parseJson(status.stdout) as { ok: true; data: { name: string; status: string } };
    expect(statusEnvelope.ok).toBe(true);
    expect(statusEnvelope.data.name).toBe('demo');
    expect(statusEnvelope.data.status).toBe('running');
  });

  test('uses active session and closes it deterministically', async () => {
    const manager = await SessionManager.create({ dapCliHome: testEnv.dapCliHome });
    await manager.create({ name: 'demo', lifecycle: 'running' });
    server = await startControllerServer({ dapCliHome: testEnv.dapCliHome });

    await expect(runCli(['use', 'demo'], { env: testEnv.env })).resolves.toMatchObject({ exitCode: 0 });
    const closed = await runCli(['close'], { env: testEnv.env });

    expect(closed.exitCode).toBe(0);
    const closedEnvelope = parseJson(closed.stdout) as { ok: true; data: { name: string } };
    expect(closedEnvelope.ok).toBe(true);
    expect(closedEnvelope.data.name).toBe('demo');

    const sessions = await runCli(['sessions'], { env: testEnv.env });
    const sessionsEnvelope = parseJson(sessions.stdout) as { ok: true; data: unknown[] };
    expect(sessionsEnvelope.ok).toBe(true);
    expect(sessionsEnvelope.data).toEqual([]);
  });
});

function parseJson(text: string): unknown {
  return JSON.parse(text) as unknown;
}
