import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { SessionManager } from '../../src/sessions/sessionManager.js';

let dapCliHome: string;

beforeEach(async () => {
  dapCliHome = await fs.mkdtemp(path.join(os.tmpdir(), 'dap-cli-sessions-'));
});

afterEach(async () => {
  await fs.rm(dapCliHome, { recursive: true, force: true });
});

describe('SessionManager', () => {
  test('creates, lists, statuses, and targets sessions', async () => {
    const manager = await SessionManager.create({ dapCliHome });

    const created = await manager.create({ name: 'demo', adapter: 'fake', lifecycle: 'running' });
    expect(created.id).toMatch(/^sess_[A-Za-z0-9_-]+$/);
    expect(created.status).toBe('running');

    expect(manager.list()).toEqual([expect.objectContaining({ id: created.id, name: 'demo', status: 'running' })]);
    expect(manager.status().id).toBe(created.id);
    await expect(manager.targetSession('demo')).resolves.toMatchObject({ id: created.id, name: 'demo' });
  });

  test('explicit selection wins over active session selection', async () => {
    const manager = await SessionManager.create({ dapCliHome });
    const first = await manager.create({ name: 'first', lifecycle: 'running' });
    const second = await manager.create({ name: 'second', lifecycle: 'stopped' });

    expect(manager.status().id).toBe(first.id);
    expect(manager.status('second').id).toBe(second.id);
  });

  test('reports no sessions errors', async () => {
    const manager = await SessionManager.create({ dapCliHome });

    expectErrorCode(() => manager.status(), 'no_sessions');
  });

  test('clearing active session leaves remaining sessions untargeted', async () => {
    const manager = await SessionManager.create({ dapCliHome });
    const first = await manager.create({ name: 'first' });
    await manager.create({ name: 'second' });

    await manager.closeSession(first.id);

    expectErrorCode(() => manager.status(), 'no_active_session');
    expectErrorCode(() => manager.status('missing'), 'session_not_found');
  });

  test('cleanup never signals unowned adapter processes', async () => {
    const signaled: number[] = [];
    const manager = await SessionManager.create({ dapCliHome, signalProcess: pid => signaled.push(pid) });

    await manager.create({ name: 'external', ownedAdapter: { pid: process.pid, startedByDapCli: false, stderrTail: ['external'] } });

    await expect(manager.cleanupSessions()).resolves.toEqual({ cleaned: [], failed: [] });
    expect(signaled).toEqual([]);
  });

  test('cleanup diagnostics include session details when owned process signaling fails', async () => {
    const manager = await SessionManager.create({
      dapCliHome,
      signalProcess: () => {
        throw new Error('no permission');
      },
    });

    const session = await manager.create({
      name: 'owned',
      ownedAdapter: { pid: process.pid, startedByDapCli: true, logPath: path.join(dapCliHome, 'adapter.log'), stderrTail: ['tail'] },
    });

    const result = await manager.cleanupSessions();

    expect(result.cleaned).toEqual([]);
    expect(result.failed).toHaveLength(1);
    const failure = result.failed[0];
    expect(failure).toBeDefined();
    if (failure === undefined) {
      throw new Error('Expected cleanup failure.');
    }
    expect(failure.sessionId).toBe(session.id);
    expect(failure.logPath).toBe(path.join(dapCliHome, 'adapter.log'));
    expect(failure.stderrTail).toEqual(['tail']);
    expect(failure.actions.length).toBeGreaterThan(0);
    expect(failure.message).toBe('no permission');
  });
});

function expectErrorCode(callback: () => unknown, code: string): void {
  try {
    callback();
  } catch (error) {
    expect(error).toMatchObject({ code });
    return;
  }

  throw new Error(`Expected error code ${code}.`);
}
