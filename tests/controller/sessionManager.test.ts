import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { PassThrough } from 'node:stream';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { ChildSessionCoordinator } from '../../src/controller/childSessions.js';
import { DapClient, type ReverseRequestResult } from '../../src/protocol/dapClient.js';
import { DapEventCache } from '../../src/protocol/eventCache.js';
import { DapMessageParser, encodeDapMessage } from '../../src/protocol/framing.js';
import type { DapEventMessage, DapProtocolMessage, DapRequestMessage, DapResponseMessage } from '../../src/protocol/dapMessages.js';
import type { DapTransport } from '../../src/protocol/transport.js';
import { SessionManager } from '../../src/sessions/sessionManager.js';
import { createFakeAdapterScript, startFakeSocketAdapter } from '../../src/testing/fakeAdapter.js';

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

  test('rejects creating a session with an in-use name', async () => {
    // Quick task 260504-rp5: name collisions are blocked at create time
    // rather than disambiguated downstream. Reuse against terminated /
    // failed records is allowed (verified separately below).
    const manager = await SessionManager.create({ dapCliHome });
    await manager.create({ name: 'demo', lifecycle: 'running' });
    await expect(manager.create({ name: 'demo', lifecycle: 'running' })).rejects.toMatchObject({
      code: 'session_name_in_use',
      category: 'session',
    });
  });

  test('allows reusing a name after the previous session terminated', async () => {
    const manager = await SessionManager.create({ dapCliHome });
    const first = await manager.create({ name: 'demo', lifecycle: 'running' });
    await manager.updateLifecycle(first.id, 'terminated');
    const reused = await manager.create({ name: 'demo', lifecycle: 'running' });
    expect(reused.id).not.toBe(first.id);
    expect(reused.name).toBe('demo');
    expect(manager.status('demo').id).toBe(reused.id);
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

    const external = await manager.create({ name: 'external', ownedAdapter: { pid: process.pid, startedByDapCli: false, stderrTail: ['external'] } });

    // Plan 05-20 (gap H-4): unowned + non-terminated lifecycle is kept,
    // not removed. Signal-and-remove only happens for dap-cli-owned adapters.
    await expect(manager.cleanupSessions()).resolves.toEqual({
      signaledAdapter: [],
      removedRecords: [],
      keptRunning: [{ sessionId: external.id, reason: 'lifecycle_running' }],
      failed: [],
    });
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

    expect(result.signaledAdapter).toEqual([]);
    expect(result.removedRecords).toEqual([]);
    // Failed and keptRunning are mutually exclusive — signal failures land
    // only in `failed` so the caller has one place to look.
    expect(result.keptRunning).toEqual([]);
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

  test('parent_session_id is omitted from non-child summaries', async () => {
    const manager = await SessionManager.create({ dapCliHome });
    const session = await manager.create({ name: 'standalone' });

    expect(session.parent_session_id).toBeUndefined();
    expect(Object.prototype.hasOwnProperty.call(session, 'parent_session_id')).toBe(false);
    const [listed] = manager.list();
    expect(listed).toBeDefined();
    expect(Object.prototype.hasOwnProperty.call(listed, 'parent_session_id')).toBe(false);
  });

  test('registerChild stamps parent_session_id and is discoverable via listChildren', async () => {
    const manager = await SessionManager.create({ dapCliHome });
    const parent = await manager.create({ name: 'pwa-chrome-parent' });

    const childA = await manager.registerChild({ parent_session_id: parent.id, name: 'pwa-chrome-child-A', lifecycle: 'running' });
    const childB = await manager.registerChild({ parent_session_id: parent.id, name: 'pwa-chrome-child-B', lifecycle: 'running' });

    expect(childA.parent_session_id).toBe(parent.id);
    expect(childB.parent_session_id).toBe(parent.id);

    const children = manager.listChildren(parent.id);
    expect(children.map(child => child.id)).toEqual([childA.id, childB.id]);
    children.forEach(child => {
      expect(child.parent_session_id).toBe(parent.id);
    });

    // The active session must remain the parent — children never steal focus.
    expect(manager.status().id).toBe(parent.id);
  });

  test('listChildren returns [] when no children are registered', async () => {
    const manager = await SessionManager.create({ dapCliHome });
    const parent = await manager.create({ name: 'lonely' });
    expect(manager.listChildren(parent.id)).toEqual([]);
  });

  // Plan 05-19 (gap H-3): list({ includeChildren }) controls whether child
  // sessions appear in the user-facing listing, and projectSessionSummary
  // marks children as `targetable: false` so callers can render the
  // distinction without re-deriving it from parent_session_id.
  test('list() hides child sessions by default and exposes targetable: false on child summaries', async () => {
    const manager = await SessionManager.create({ dapCliHome });
    const parent = await manager.create({ name: 'pwa-chrome-parent' });
    const child = await manager.registerChild({ parent_session_id: parent.id, name: 'pwa#child', lifecycle: 'running' });

    const defaultList = manager.list();
    expect(defaultList.map(s => s.id)).toEqual([parent.id]);
    // Root summary must NOT carry an explicit targetable: false. Either it's
    // absent (preferred) or it's true.
    const rootSummary = defaultList[0];
    expect(rootSummary).toBeDefined();
    if (rootSummary !== undefined) {
      const hasTargetable = Object.prototype.hasOwnProperty.call(rootSummary, 'targetable');
      if (hasTargetable) {
        expect(rootSummary.targetable).toBe(true);
      }
    }

    const explicit = manager.list({ includeChildren: true });
    expect(explicit.map(s => s.id).sort()).toEqual([parent.id, child.id].sort());
    const childSummary = explicit.find(s => s.id === child.id);
    expect(childSummary).toBeDefined();
    expect(childSummary?.targetable).toBe(false);
  });

  test('list({ includeChildren: false }) is equivalent to the no-arg default', async () => {
    const manager = await SessionManager.create({ dapCliHome });
    const parent = await manager.create({ name: 'p' });
    await manager.registerChild({ parent_session_id: parent.id, name: 'p#c', lifecycle: 'running' });
    expect(manager.list()).toEqual(manager.list({ includeChildren: false }));
  });

  test('projectSessionStatus marks child sessions targetable: false', async () => {
    const manager = await SessionManager.create({ dapCliHome });
    const parent = await manager.create({ name: 'p' });
    const child = await manager.registerChild({ parent_session_id: parent.id, name: 'p#c', lifecycle: 'running' });

    const childStatus = manager.status(child.id);
    expect(childStatus.targetable).toBe(false);

    const parentStatus = manager.status(parent.id);
    const hasTargetable = Object.prototype.hasOwnProperty.call(parentStatus, 'targetable');
    if (hasTargetable) {
      expect(parentStatus.targetable).toBe(true);
    }
  });

  test('registerChild with an unknown parent throws parent_not_found', async () => {
    const manager = await SessionManager.create({ dapCliHome });
    await expect(manager.registerChild({ parent_session_id: 'sess_does_not_exist', name: 'orphan' }))
      .rejects.toMatchObject({ code: 'parent_not_found' });
  });

  test('closing a parent cascades close to its registered children', async () => {
    const manager = await SessionManager.create({ dapCliHome });
    const parent = await manager.create({ name: 'pwa-chrome-parent' });
    const child = await manager.registerChild({ parent_session_id: parent.id, name: 'child', lifecycle: 'running' });
    const unrelated = await manager.create({ name: 'unrelated' });

    await manager.closeSession(parent.id);

    expect(manager.list().map(session => session.id)).toEqual([unrelated.id]);
    expect(manager.listChildren(parent.id)).toEqual([]);
    expectErrorCode(() => manager.status(child.id), 'session_not_found');
    expectErrorCode(() => manager.status(parent.id), 'session_not_found');
  });

  describe('updatePausedState (H-1: paused projection)', () => {
    test('paused projection round-trips through projectSessionStatus', async () => {
      const manager = await SessionManager.create({ dapCliHome });
      const session = await manager.create({ name: 'demo', lifecycle: 'running' });

      // Newly-created sessions have no observed paused state.
      expect(session.paused).toBeUndefined();
      expect(session.stoppedReason).toBeUndefined();
      expect(session.stoppedThreadIds).toBeUndefined();

      const paused = await manager.updatePausedState(session.id, {
        paused: true,
        stoppedReason: 'entry',
        stoppedThreadIds: [1],
      });

      expect(paused.paused).toBe(true);
      expect(paused.stoppedReason).toBe('entry');
      expect(paused.stoppedThreadIds).toEqual([1]);

      // Re-fetch to confirm persistence through the manager projection.
      const refetched = manager.status(session.id);
      expect(refetched.paused).toBe(true);
      expect(refetched.stoppedReason).toBe('entry');
      expect(refetched.stoppedThreadIds).toEqual([1]);
    });

    test('paused: false clears stoppedReason and stoppedThreadIds', async () => {
      const manager = await SessionManager.create({ dapCliHome });
      const session = await manager.create({ name: 'demo', lifecycle: 'running' });

      await manager.updatePausedState(session.id, {
        paused: true,
        stoppedReason: 'breakpoint',
        stoppedThreadIds: [7],
      });

      const cleared = await manager.updatePausedState(session.id, { paused: false });

      expect(cleared.paused).toBe(false);
      // stoppedReason / stoppedThreadIds must be omitted (undefined), not
      // stale values from the previous paused state.
      expect(cleared.stoppedReason).toBeUndefined();
      expect(cleared.stoppedThreadIds).toBeUndefined();
      expect(Object.prototype.hasOwnProperty.call(cleared, 'stoppedReason')).toBe(false);
      expect(Object.prototype.hasOwnProperty.call(cleared, 'stoppedThreadIds')).toBe(false);

      // And the explicit `paused: false` MUST be present (not absent), so
      // consumers can tell "we know this isn't paused" from "we don't know".
      expect(Object.prototype.hasOwnProperty.call(cleared, 'paused')).toBe(true);
    });

    test('updatePausedState on a missing target throws session_not_found', async () => {
      const manager = await SessionManager.create({ dapCliHome });
      await manager.create({ name: 'demo' });

      await expect(manager.updatePausedState('does-not-exist', { paused: true, stoppedReason: 'entry' }))
        .rejects.toMatchObject({ code: 'session_not_found' });
    });

    test('paused projection is omitted entirely for never-stopped sessions', async () => {
      const manager = await SessionManager.create({ dapCliHome });
      const session = await manager.create({ name: 'fresh', lifecycle: 'running' });
      const status = manager.status(session.id);

      expect(Object.prototype.hasOwnProperty.call(status, 'paused')).toBe(false);
      expect(Object.prototype.hasOwnProperty.call(status, 'stoppedReason')).toBe(false);
      expect(Object.prototype.hasOwnProperty.call(status, 'stoppedThreadIds')).toBe(false);
    });
  });

  // Phase 11 plan 01 (PAUSED-01): the projected `status` field on
  // SessionSummary/SessionStatus must honor the mirrored `paused` flag for
  // non-terminal lifecycles. Closes the gap where js-debug parent sessions
  // whose `stopped` events arrive on a child runtime mirror `paused: true`
  // onto the parent record but kept reporting status: 'running'.
  describe('paused-state status projection (Phase 11)', () => {
    test('A: paused-from-child-mirror flips status to stopped without bumping lifecycle', async () => {
      const manager = await SessionManager.create({ dapCliHome });
      const session = await manager.create({ name: 'demo', lifecycle: 'running' });

      const paused = await manager.updatePausedState(session.id, {
        paused: true,
        stoppedReason: 'breakpoint',
        stoppedThreadIds: [1],
      });

      expect(paused.status).toBe('stopped');
      expect(paused.paused).toBe(true);
      expect(paused.lifecycle).toBe('running');
    });

    test('B: continued event clears status back to running', async () => {
      const manager = await SessionManager.create({ dapCliHome });
      const session = await manager.create({ name: 'demo', lifecycle: 'running' });

      await manager.updatePausedState(session.id, {
        paused: true,
        stoppedReason: 'breakpoint',
        stoppedThreadIds: [1],
      });
      const resumed = await manager.updatePausedState(session.id, { paused: false });

      expect(resumed.status).toBe('running');
      expect(resumed.paused).toBe(false);
    });

    test('C: terminal lifecycle wins over a stale paused: true', async () => {
      const manager = await SessionManager.create({ dapCliHome });
      const session = await manager.create({ name: 'demo', lifecycle: 'running' });

      await manager.updatePausedState(session.id, {
        paused: true,
        stoppedReason: 'breakpoint',
        stoppedThreadIds: [1],
      });
      const terminated = await manager.updateLifecycle(session.id, 'terminated');

      expect(terminated.status).toBe('terminated');
    });

    test('D: undefined paused leaves lifecycle-derived status untouched', async () => {
      const manager = await SessionManager.create({ dapCliHome });
      const session = await manager.create({ name: 'demo', lifecycle: 'running' });
      const status = manager.status(session.id);

      expect(status.status).toBe('running');
      expect(status.paused).toBeUndefined();
    });

    test('E: list projection reflects paused too', async () => {
      const manager = await SessionManager.create({ dapCliHome });
      const session = await manager.create({ name: 'demo', lifecycle: 'running' });

      await manager.updatePausedState(session.id, {
        paused: true,
        stoppedReason: 'breakpoint',
        stoppedThreadIds: [1],
      });

      const entries = manager.list();
      const entry = entries.find(item => item.id === session.id);
      expect(entry?.status).toBe('stopped');
      expect(entry?.paused).toBe(true);
    });
  });

  // Plan 05-20 (gap H-4): cleanup MUST be honest. Hand-driven Sequence A
  // Step 8 evidence: `cleanup` reported `cleaned: [<id>]` but `sessions list`
  // still showed the session. The new envelope replaces the misleading
  // `cleaned` field with explicit `signaledAdapter` / `removedRecords` /
  // `keptRunning` arrays.
  describe('cleanupSessions honest envelope (H-4)', () => {
    test('plain cleanup removes terminated and lists running in keptRunning', async () => {
      const manager = await SessionManager.create({ dapCliHome, signalProcess: () => undefined });
      const terminated = await manager.create({ name: 'done', lifecycle: 'terminated' });
      const running = await manager.create({ name: 'live', lifecycle: 'running' });

      const result = await manager.cleanupSessions();

      expect(result.signaledAdapter).toEqual([]);
      expect(result.removedRecords).toEqual([terminated.id]);
      expect(result.keptRunning).toEqual([{ sessionId: running.id, reason: 'lifecycle_running' }]);
      expect(result.failed).toEqual([]);

      // The terminated record is gone; the running record remains.
      expect(manager.list().map(s => s.id)).toEqual([running.id]);
    });

    test('plain cleanup signals AND removes owned adapters with dead pid (ESRCH)', async () => {
      const signaled: number[] = [];
      const manager = await SessionManager.create({
        dapCliHome,
        signalProcess: pid => {
          signaled.push(pid);
          const error = new Error('no such process') as NodeJS.ErrnoException;
          error.code = 'ESRCH';
          throw error;
        },
      });
      const owned = await manager.create({
        name: 'owned',
        lifecycle: 'running',
        ownedAdapter: { startedByDapCli: true, pid: 999_999, stderrTail: [] },
      });

      const result = await manager.cleanupSessions();

      expect(signaled).toEqual([999_999]);
      expect(result.signaledAdapter).toEqual([owned.id]);
      expect(result.removedRecords).toEqual([owned.id]);
      expect(result.keptRunning).toEqual([]);
      expect(result.failed).toEqual([]);
    });

    test('plain cleanup classifies attaching lifecycle as lifecycle_attaching', async () => {
      const manager = await SessionManager.create({ dapCliHome });
      const attaching = await manager.create({ name: 'attach', lifecycle: 'attaching' });

      const result = await manager.cleanupSessions();

      expect(result.keptRunning).toEqual([{ sessionId: attaching.id, reason: 'lifecycle_attaching' }]);
      expect(result.removedRecords).toEqual([]);
    });

    test('--purge removes both terminated and running records', async () => {
      const signaled: number[] = [];
      const manager = await SessionManager.create({ dapCliHome, signalProcess: pid => signaled.push(pid) });
      const terminated = await manager.create({ name: 'done', lifecycle: 'terminated' });
      const running = await manager.create({ name: 'live', lifecycle: 'running' });

      const result = await manager.cleanupSessions({ purge: true });

      expect(signaled).toEqual([]);
      expect(result.signaledAdapter).toEqual([]);
      expect([...result.removedRecords].sort()).toEqual([terminated.id, running.id].sort());
      expect(result.keptRunning).toEqual([]);
      expect(result.failed).toEqual([]);
      expect(manager.list()).toEqual([]);
    });

    test('cleanup envelope shape is signaledAdapter/removedRecords/keptRunning/failed (no `cleaned` field)', async () => {
      const manager = await SessionManager.create({ dapCliHome });
      const result = await manager.cleanupSessions();

      expect(Object.prototype.hasOwnProperty.call(result, 'cleaned')).toBe(false);
      expect(Object.keys(result).sort()).toEqual(['failed', 'keptRunning', 'removedRecords', 'signaledAdapter']);
    });
  });
});

function expectErrorCode(callback: () => unknown, code: string): void {
  try {
    callback();
  } catch (error) {
    expect(error).toMatchObject({ code });
    if (code === 'session_ambiguous') {
      expect(String((error as { diagnostics: readonly string[] }).diagnostics.join('\n'))).toContain('sess_');
      expect(String((error as { diagnostics: readonly string[] }).diagnostics.join('\n'))).toContain('Use one of these session IDs');
    }
    return;
  }

  throw new Error(`Expected error code ${code}.`);
}

/**
 * Minimal DapTransport-shaped fake that auto-responds to every request the
 * client writes. Used to drive ChildSessionCoordinator tests without
 * spinning up a real adapter.
 */
class FakeAdapterEndpoint implements DapTransport {
  public readonly name: string;
  public readonly readable = new PassThrough();
  public readonly writable = new PassThrough();
  public readonly receivedRequests: DapRequestMessage[] = [];
  public readonly receivedResponses: DapResponseMessage[] = [];
  public readonly responses = new Map<string, ReverseRequestResult | ((req: DapRequestMessage) => ReverseRequestResult)>();
  private readonly parser = new DapMessageParser();
  private serverSeq = 1000;
  private closed = false;

  public constructor(name = 'fake-endpoint') {
    this.name = name;
    this.writable.on('data', (chunk: Buffer) => {
      for (const message of this.parser.push(chunk)) {
        if (message.type === 'request') {
          this.receivedRequests.push(message);
          this.autoRespond(message);
        } else if (message.type === 'response') {
          this.receivedResponses.push(message);
        }
      }
    });
  }

  public emit(message: DapProtocolMessage): void {
    if (this.closed) {
      return;
    }
    this.readable.write(encodeDapMessage(message));
  }

  public emitReverseRequest(command: string, args: unknown): number {
    const seq = this.serverSeq;
    this.serverSeq += 1;
    this.emit({ seq, type: 'request', command, arguments: args });
    return seq;
  }

  public emitEvent(event: string, body?: unknown): void {
    const seq = this.serverSeq;
    this.serverSeq += 1;
    const message: DapEventMessage = body === undefined
      ? { seq, type: 'event', event }
      : { seq, type: 'event', event, body };
    this.emit(message);
  }

  public close(): Promise<void> {
    this.closed = true;
    this.readable.emit('close');
    return Promise.resolve();
  }

  private autoRespond(request: DapRequestMessage): void {
    const lookup = this.responses.get(request.command);
    const resolved = typeof lookup === 'function' ? lookup(request) : (lookup ?? { success: true });
    const seq = this.serverSeq;
    this.serverSeq += 1;
    const response: DapResponseMessage = {
      seq,
      type: 'response',
      request_seq: request.seq,
      success: resolved.success,
      command: request.command,
    };
    if (resolved.body !== undefined) {
      response.body = resolved.body;
    }
    if (resolved.message !== undefined) {
      response.message = resolved.message;
    }
    this.emit(response);
    // Mirror real DAP adapters: emit `initialized` after responding to
    // `initialize` so the client can proceed with launch/attach + configurationDone.
    if (request.command === 'initialize') {
      this.emitEvent('initialized');
    }
  }
}

async function tick(times = 1): Promise<void> {
  for (let i = 0; i < times; i += 1) {
    await new Promise<void>(resolve => setImmediate(resolve));
  }
}

describe('ChildSessionCoordinator', () => {
  test('does nothing for adapters that never send startDebugging', async () => {
    const manager = await SessionManager.create({ dapCliHome });
    const parent = await manager.create({ name: 'fake-parent', adapter: 'fake' });
    const parentEndpoint = new FakeAdapterEndpoint('parent');
    const parentClient = new DapClient(parentEndpoint);
    const childEndpoint = new FakeAdapterEndpoint('child');
    let openChildCalls = 0;
    const coordinator = new ChildSessionCoordinator({
      parentSessionId: parent.id,
      parentName: parent.name,
      parentClient,
      adapterId: 'fake',
      ownedAdapter: { startedByDapCli: true, stderrTail: [] },
      sessionManager: manager,
      parentEventCache: new DapEventCache(),
      openChildTransport: () => {
        openChildCalls += 1;
        return Promise.resolve(childEndpoint);
      },
    });
    coordinator.attach();

    // Parent emits a runInTerminal reverse request — coordinator should not handle it,
    // letting DapClient's built-in handler run (or fall through to the legacy failure
    // when no fallback is registered).
    parentEndpoint.emitReverseRequest('someUnrelatedCommand', { arg: 1 });
    await tick(2);

    expect(openChildCalls).toBe(0);
    expect(manager.listChildren(parent.id)).toEqual([]);
    expect(coordinator.hasChildren()).toBe(false);

    await coordinator.dispose();
    await parentClient.close();
  });

  test('startDebugging brings up an attach child and registers it under the parent', async () => {
    const manager = await SessionManager.create({ dapCliHome });
    const parent = await manager.create({ name: 'pwa', adapter: 'pwa-chrome' });
    const parentEndpoint = new FakeAdapterEndpoint('parent');
    const parentClient = new DapClient(parentEndpoint);
    const childEndpoint = new FakeAdapterEndpoint('child');
    childEndpoint.responses.set('initialize', { success: true, body: { supportsConfigurationDoneRequest: true } });

    const coordinator = new ChildSessionCoordinator({
      parentSessionId: parent.id,
      parentName: parent.name,
      parentClient,
      adapterId: 'pwa-chrome',
      ownedAdapter: { startedByDapCli: true, stderrTail: [] },
      sessionManager: manager,
      parentEventCache: new DapEventCache(),
      openChildTransport: () => Promise.resolve(childEndpoint),
    });
    coordinator.attach();

    parentEndpoint.emitReverseRequest('startDebugging', {
      request: 'attach',
      configuration: { __pendingTargetId: 'tgt-1', type: 'pwa-chrome' },
    });

    await coordinator.awaitPendingChildren();
    await tick(2);

    const children = manager.listChildren(parent.id);
    expect(children).toHaveLength(1);
    expect(children[0]?.name).toBe('pwa#tgt-1');
    expect(children[0]?.parent_session_id).toBe(parent.id);

    expect(childEndpoint.receivedRequests.map(req => req.command)).toEqual(
      expect.arrayContaining(['initialize', 'attach', 'configurationDone']),
    );
    const attachRequest = childEndpoint.receivedRequests.find(req => req.command === 'attach');
    expect(attachRequest?.arguments).toMatchObject({ __pendingTargetId: 'tgt-1', type: 'pwa-chrome' });

    // Parent received a success response for the reverse request before configurationDone
    // would have completed. The first response on the parent endpoint must be ok.
    expect(parentEndpoint.receivedResponses[0]).toMatchObject({
      command: 'startDebugging',
      success: true,
    });

    await coordinator.dispose();
    await parentClient.close();
  });

  test('launch path forwards launch instead of attach', async () => {
    const manager = await SessionManager.create({ dapCliHome });
    const parent = await manager.create({ name: 'pwa', adapter: 'pwa-chrome' });
    const parentEndpoint = new FakeAdapterEndpoint();
    const parentClient = new DapClient(parentEndpoint);
    const childEndpoint = new FakeAdapterEndpoint();

    const coordinator = new ChildSessionCoordinator({
      parentSessionId: parent.id,
      parentName: parent.name,
      parentClient,
      adapterId: 'pwa-chrome',
      ownedAdapter: { startedByDapCli: true, stderrTail: [] },
      sessionManager: manager,
      parentEventCache: new DapEventCache(),
      openChildTransport: () => Promise.resolve(childEndpoint),
    });
    coordinator.attach();

    parentEndpoint.emitReverseRequest('startDebugging', {
      request: 'launch',
      configuration: { type: 'pwa-chrome', url: 'http://example.com' },
    });
    await coordinator.awaitPendingChildren();
    await tick(2);

    expect(childEndpoint.receivedRequests.map(req => req.command)).toContain('launch');
    expect(childEndpoint.receivedRequests.map(req => req.command)).not.toContain('attach');

    await coordinator.dispose();
    await parentClient.close();
  });

  test('multiple startDebugging requests create distinct children', async () => {
    const manager = await SessionManager.create({ dapCliHome });
    const parent = await manager.create({ name: 'pwa', adapter: 'pwa-chrome' });
    const parentEndpoint = new FakeAdapterEndpoint();
    const parentClient = new DapClient(parentEndpoint);
    const endpoints: FakeAdapterEndpoint[] = [];
    const coordinator = new ChildSessionCoordinator({
      parentSessionId: parent.id,
      parentName: parent.name,
      parentClient,
      adapterId: 'pwa-chrome',
      ownedAdapter: { startedByDapCli: true, stderrTail: [] },
      sessionManager: manager,
      parentEventCache: new DapEventCache(),
      openChildTransport: name => {
        const endpoint = new FakeAdapterEndpoint(name);
        endpoints.push(endpoint);
        return Promise.resolve(endpoint);
      },
    });
    coordinator.attach();

    parentEndpoint.emitReverseRequest('startDebugging', { request: 'attach', configuration: { __pendingTargetId: 'tgt-1' } });
    parentEndpoint.emitReverseRequest('startDebugging', { request: 'attach', configuration: { __pendingTargetId: 'tgt-2' } });
    await coordinator.awaitPendingChildren();
    await tick(2);

    const children = manager.listChildren(parent.id);
    expect(children).toHaveLength(2);
    expect(children.map(c => c.name).sort()).toEqual(['pwa#tgt-1', 'pwa#tgt-2']);
    expect(new Set(children.map(c => c.id)).size).toBe(2);
    expect(endpoints).toHaveLength(2);

    await coordinator.dispose();
    await parentClient.close();
  });

  test('attach failure marks child failed and surfaces a diagnostic event into the parent cache', async () => {
    const manager = await SessionManager.create({ dapCliHome });
    const parent = await manager.create({ name: 'pwa', adapter: 'pwa-chrome' });
    const parentEndpoint = new FakeAdapterEndpoint();
    const parentClient = new DapClient(parentEndpoint);
    const childEndpoint = new FakeAdapterEndpoint();
    childEndpoint.responses.set('attach', { success: false, message: 'attach refused' });
    const parentCache = new DapEventCache();

    const coordinator = new ChildSessionCoordinator({
      parentSessionId: parent.id,
      parentName: parent.name,
      parentClient,
      adapterId: 'pwa-chrome',
      ownedAdapter: { startedByDapCli: true, stderrTail: [] },
      sessionManager: manager,
      parentEventCache: parentCache,
      openChildTransport: () => Promise.resolve(childEndpoint),
    });
    coordinator.attach();

    parentEndpoint.emitReverseRequest('startDebugging', { request: 'attach', configuration: { __pendingTargetId: 'tgt-fail' } });
    await coordinator.awaitPendingChildren();
    await tick(4);

    // Parent still sees the child (failure is observable, not silent removal).
    const children = manager.listChildren(parent.id);
    expect(children).toHaveLength(1);
    expect(children[0]?.lifecycle).toBe('failed');

    // Parent event cache contains the synthetic stderr output naming the child.
    const events = parentCache.recent().events;
    const synthetic = events.find(event => event.event === 'output');
    expect(synthetic).toBeDefined();
    expect(JSON.stringify(synthetic?.body)).toContain('attach refused');

    await coordinator.dispose();
    await parentClient.close();
  });

  test('threads command aggregates across children with namespaced parent ids', async () => {
    const manager = await SessionManager.create({ dapCliHome });
    const parent = await manager.create({ name: 'pwa', adapter: 'pwa-chrome' });
    const parentEndpoint = new FakeAdapterEndpoint();
    const parentClient = new DapClient(parentEndpoint);
    const childEndpoints: FakeAdapterEndpoint[] = [];
    const coordinator = new ChildSessionCoordinator({
      parentSessionId: parent.id,
      parentName: parent.name,
      parentClient,
      adapterId: 'pwa-chrome',
      ownedAdapter: { startedByDapCli: true, stderrTail: [] },
      sessionManager: manager,
      parentEventCache: new DapEventCache(),
      openChildTransport: name => {
        const endpoint = new FakeAdapterEndpoint(name);
        endpoint.responses.set('threads', { success: true, body: { threads: [{ id: 1, name: `${name}-main` }] } });
        childEndpoints.push(endpoint);
        return Promise.resolve(endpoint);
      },
    });
    coordinator.attach();

    parentEndpoint.emitReverseRequest('startDebugging', { request: 'attach', configuration: { __pendingTargetId: 'a' } });
    parentEndpoint.emitReverseRequest('startDebugging', { request: 'attach', configuration: { __pendingTargetId: 'b' } });
    await coordinator.awaitPendingChildren();
    await tick(2);

    const intercepted = await coordinator.maybeIntercept('threads', undefined);
    expect(intercepted).toBeDefined();
    const threadsResult = intercepted?.value as { threads: Array<{ id: number; name: string; sessionName: string }> };
    expect(threadsResult.threads).toHaveLength(2);
    // Plan 05-26 (H-3a): aggregateThreads now returns REAL child thread ids
    // unchanged. Both children report id:1 — the user disambiguates via the
    // new `sessionName` field, not via a synthetic counter remap.
    expect(threadsResult.threads.every(t => t.id === 1)).toBe(true);
    expect(new Set(threadsResult.threads.map(t => t.sessionName)).size).toBe(2);

    await coordinator.dispose();
    await parentClient.close();
  });

  test('threads command returns nothing intercepted when no children exist', async () => {
    const manager = await SessionManager.create({ dapCliHome });
    const parent = await manager.create({ name: 'pwa', adapter: 'pwa-chrome' });
    const parentEndpoint = new FakeAdapterEndpoint();
    const parentClient = new DapClient(parentEndpoint);
    const coordinator = new ChildSessionCoordinator({
      parentSessionId: parent.id,
      parentName: parent.name,
      parentClient,
      adapterId: 'pwa-chrome',
      ownedAdapter: { startedByDapCli: true, stderrTail: [] },
      sessionManager: manager,
      parentEventCache: new DapEventCache(),
      openChildTransport: () => Promise.resolve(new FakeAdapterEndpoint()),
    });
    coordinator.attach();

    expect(await coordinator.maybeIntercept('threads', undefined)).toBeUndefined();
    expect(await coordinator.maybeIntercept('stackTrace', { threadId: 1 })).toBeUndefined();

    await coordinator.dispose();
    await parentClient.close();
  });

  test('stackTrace routes to the originating child using real child thread ids', async () => {
    const manager = await SessionManager.create({ dapCliHome });
    const parent = await manager.create({ name: 'pwa', adapter: 'pwa-chrome' });
    const parentEndpoint = new FakeAdapterEndpoint();
    const parentClient = new DapClient(parentEndpoint);
    let childCount = 0;
    const childEndpoints: FakeAdapterEndpoint[] = [];
    const coordinator = new ChildSessionCoordinator({
      parentSessionId: parent.id,
      parentName: parent.name,
      parentClient,
      adapterId: 'pwa-chrome',
      ownedAdapter: { startedByDapCli: true, stderrTail: [] },
      sessionManager: manager,
      parentEventCache: new DapEventCache(),
      openChildTransport: name => {
        childCount += 1;
        const endpoint = new FakeAdapterEndpoint(name);
        const thisChildIndex = childCount;
        // Plan 05-26 (H-3a): each child reports a UNIQUE real thread id so the
        // router can deterministically resolve to the owning child without
        // synthetic remap. Child 1 owns thread 11, child 2 owns thread 22.
        const childThreadId = 10 * thisChildIndex + thisChildIndex;
        endpoint.responses.set('threads', { success: true, body: { threads: [{ id: childThreadId, name: `${name}-main` }] } });
        endpoint.responses.set('stackTrace', req => ({
          success: true,
          body: {
            stackFrames: [{ id: 100 + thisChildIndex, name: `frame-${thisChildIndex}`, line: 1, column: 1, source: { name: 'app.js' } }],
            totalFrames: 1,
            // Echo back the threadId we received so the test can assert it was
            // forwarded UNCHANGED (real-id routing, no remap).
            forwardedThreadId: (req.arguments as { threadId?: number })?.threadId,
          },
        }));
        childEndpoints.push(endpoint);
        return Promise.resolve(endpoint);
      },
    });
    coordinator.attach();

    parentEndpoint.emitReverseRequest('startDebugging', { request: 'attach', configuration: { __pendingTargetId: 'a' } });
    parentEndpoint.emitReverseRequest('startDebugging', { request: 'attach', configuration: { __pendingTargetId: 'b' } });
    await coordinator.awaitPendingChildren();
    await tick(2);

    const threads = (await coordinator.maybeIntercept('threads', undefined))?.value as { threads: Array<{ id: number; name: string; sessionName: string }> };
    expect(threads.threads).toHaveLength(2);
    expect(threads.threads.map(t => t.id).sort((a, b) => a - b)).toEqual([11, 22]);

    // Route to child 2 by its real thread id; assert threadId was forwarded
    // unchanged and the response came from frame-2 (child 2's stack).
    const stackResult = (await coordinator.maybeIntercept('stackTrace', { threadId: 22 }))?.value as {
      stackFrames: Array<{ id: number; name: string }>;
      forwardedThreadId: number;
    };
    expect(stackResult.forwardedThreadId).toBe(22);
    expect(stackResult.stackFrames[0]?.name).toBe('frame-2');

    await coordinator.dispose();
    await parentClient.close();
  });

  test('stackTrace with an unknown thread id throws', async () => {
    const manager = await SessionManager.create({ dapCliHome });
    const parent = await manager.create({ name: 'pwa', adapter: 'pwa-chrome' });
    const parentEndpoint = new FakeAdapterEndpoint();
    const parentClient = new DapClient(parentEndpoint);
    const coordinator = new ChildSessionCoordinator({
      parentSessionId: parent.id,
      parentName: parent.name,
      parentClient,
      adapterId: 'pwa-chrome',
      ownedAdapter: { startedByDapCli: true, stderrTail: [] },
      sessionManager: manager,
      parentEventCache: new DapEventCache(),
      openChildTransport: name => {
        const endpoint = new FakeAdapterEndpoint(name);
        endpoint.responses.set('threads', { success: true, body: { threads: [{ id: 1, name: 'main' }] } });
        return Promise.resolve(endpoint);
      },
    });
    coordinator.attach();
    parentEndpoint.emitReverseRequest('startDebugging', { request: 'attach', configuration: { __pendingTargetId: 'a' } });
    await coordinator.awaitPendingChildren();
    await tick(2);

    await expect(coordinator.maybeIntercept('stackTrace', { threadId: 9999 })).rejects.toThrow('No child session owns thread 9999');

    await coordinator.dispose();
    await parentClient.close();
  });

  test('setBreakpoints fans out to every child and aggregates verified flags', async () => {
    const manager = await SessionManager.create({ dapCliHome });
    const parent = await manager.create({ name: 'pwa', adapter: 'fake-multi-process' });
    const parentEndpoint = new FakeAdapterEndpoint();
    const parentClient = new DapClient(parentEndpoint);
    const verifiedByChild = [false, true];
    const childCallSites: unknown[][] = [];
    let childIdx = -1;
    const coordinator = new ChildSessionCoordinator({
      parentSessionId: parent.id,
      parentName: parent.name,
      parentClient,
      adapterId: 'fake-multi-process',
      ownedAdapter: { startedByDapCli: true, stderrTail: [] },
      sessionManager: manager,
      parentEventCache: new DapEventCache(),
      openChildTransport: name => {
        childIdx += 1;
        const localIdx = childIdx;
        const endpoint = new FakeAdapterEndpoint(name);
        endpoint.responses.set('setBreakpoints', req => {
          childCallSites.push([localIdx, req.arguments]);
          return {
            success: true,
            body: { breakpoints: [{ id: localIdx + 1, line: 10, verified: verifiedByChild[localIdx] ?? false }] },
          };
        });
        return Promise.resolve(endpoint);
      },
    });
    coordinator.attach();
    parentEndpoint.emitReverseRequest('startDebugging', { request: 'attach', configuration: { __pendingTargetId: 'a' } });
    parentEndpoint.emitReverseRequest('startDebugging', { request: 'attach', configuration: { __pendingTargetId: 'b' } });
    await coordinator.awaitPendingChildren();
    await tick(2);

    const result = (await coordinator.maybeIntercept('setBreakpoints', { source: { path: 'foo.js' }, breakpoints: [{ line: 10 }] }))?.value as {
      breakpoints: Array<{ verified: boolean; line: number }>;
    };
    expect(result.breakpoints).toHaveLength(1);
    // ANY child verified → aggregated verified
    expect(result.breakpoints[0]?.verified).toBe(true);
    expect(childCallSites).toHaveLength(2);

    await coordinator.dispose();
    await parentClient.close();
  });

  test('setBreakpoints fan-out preserves conditional metadata for every child', async () => {
    const manager = await SessionManager.create({ dapCliHome });
    const parent = await manager.create({ name: 'pwa', adapter: 'fake-multi-process' });
    const parentEndpoint = new FakeAdapterEndpoint();
    const parentClient = new DapClient(parentEndpoint);
    const childEndpoints: FakeAdapterEndpoint[] = [];
    const coordinator = new ChildSessionCoordinator({
      parentSessionId: parent.id,
      parentName: parent.name,
      parentClient,
      adapterId: 'fake-multi-process',
      ownedAdapter: { startedByDapCli: true, stderrTail: [] },
      sessionManager: manager,
      parentEventCache: new DapEventCache(),
      openChildTransport: name => {
        const endpoint = new FakeAdapterEndpoint(name);
        endpoint.responses.set('setBreakpoints', { success: true, body: { breakpoints: [{ id: 1, line: 10, verified: true }] } });
        childEndpoints.push(endpoint);
        return Promise.resolve(endpoint);
      },
    });
    coordinator.attach();
    parentEndpoint.emitReverseRequest('startDebugging', { request: 'attach', configuration: { __pendingTargetId: 'a' } });
    parentEndpoint.emitReverseRequest('startDebugging', { request: 'attach', configuration: { __pendingTargetId: 'b' } });
    await coordinator.awaitPendingChildren();
    await tick(2);

    const result = (await coordinator.maybeIntercept('setBreakpoints', {
      source: { path: 'foo.js' },
      breakpoints: [{ line: 10, condition: 'left > 3', hitCondition: '2', logMessage: 'left={left}' }],
    }))?.value as { breakpoints: Array<{ verified: boolean; line: number }> };

    expect(result.breakpoints[0]?.verified).toBe(true);
    expect(childEndpoints).toHaveLength(2);
    for (const endpoint of childEndpoints) {
      const setBreakpointRequest = endpoint.receivedRequests.find(req => req.command === 'setBreakpoints');
      expect(setBreakpointRequest?.arguments).toMatchObject({
        source: { path: 'foo.js' },
        breakpoints: [{ line: 10, condition: 'left > 3', hitCondition: '2', logMessage: 'left={left}' }],
      });
    }

    await coordinator.dispose();
    await parentClient.close();
  });

  test('child events are mirrored into the parent event cache with child_session_id annotation', async () => {
    const manager = await SessionManager.create({ dapCliHome });
    const parent = await manager.create({ name: 'pwa', adapter: 'pwa-chrome' });
    const parentEndpoint = new FakeAdapterEndpoint();
    const parentClient = new DapClient(parentEndpoint);
    const parentCache = new DapEventCache();
    let childEndpointRef: FakeAdapterEndpoint | undefined;
    const coordinator = new ChildSessionCoordinator({
      parentSessionId: parent.id,
      parentName: parent.name,
      parentClient,
      adapterId: 'pwa-chrome',
      ownedAdapter: { startedByDapCli: true, stderrTail: [] },
      sessionManager: manager,
      parentEventCache: parentCache,
      openChildTransport: name => {
        const endpoint = new FakeAdapterEndpoint(name);
        childEndpointRef = endpoint;
        return Promise.resolve(endpoint);
      },
    });
    coordinator.attach();

    parentEndpoint.emitReverseRequest('startDebugging', { request: 'attach', configuration: { __pendingTargetId: 'a' } });
    await coordinator.awaitPendingChildren();
    await tick(2);

    childEndpointRef?.emitEvent('stopped', { reason: 'breakpoint', threadId: 1 });
    await tick(8);

    const cached = parentCache.recent().events;
    const stoppedEvent = cached.find(event => event.event === 'stopped');
    expect(stoppedEvent).toBeDefined();
    expect(stoppedEvent?.body).toMatchObject({ reason: 'breakpoint', threadId: 1 });
    expect((stoppedEvent?.body as Record<string, unknown>)?.child_session_id).toMatch(/^sess_/);

    await coordinator.dispose();
    await parentClient.close();
  });

  test('initial breakpoints registered on the coordinator replay to js-debug children during runChildLifecycle', async () => {
    // Real pwa-node targets can create their child session after the parent
    // returns provisional unbound breakpoints. Replay pending payloads during
    // child bring-up so early source breakpoints bind before configurationDone.
    const manager = await SessionManager.create({ dapCliHome });
    const parent = await manager.create({ name: 'pwa', adapter: 'js-debug' });
    const parentEndpoint = new FakeAdapterEndpoint();
    const parentClient = new DapClient(parentEndpoint);
    const childEndpoints: FakeAdapterEndpoint[] = [];
    const coordinator = new ChildSessionCoordinator({
      parentSessionId: parent.id,
      parentName: parent.name,
      parentClient,
      adapterId: 'js-debug',
      ownedAdapter: { startedByDapCli: true, stderrTail: [] },
      sessionManager: manager,
      parentEventCache: new DapEventCache(),
      openChildTransport: name => {
        const endpoint = new FakeAdapterEndpoint(name);
        childEndpoints.push(endpoint);
        return Promise.resolve(endpoint);
      },
    });
    coordinator.attach();

    coordinator.registerInitialBreakpoints([{ source: { path: 'app.js' }, breakpoints: [{ line: 7 }] }]);

    parentEndpoint.emitReverseRequest('startDebugging', { request: 'attach', configuration: { __pendingTargetId: 'a' } });
    await coordinator.awaitPendingChildren();
    await tick(4);

    const setBpRequest = childEndpoints[0]?.receivedRequests.find(req => req.command === 'setBreakpoints');
    expect(setBpRequest?.arguments, 'child must receive pending setBreakpoints from runChildLifecycle for js-debug').toEqual({
      source: { path: 'app.js' },
      breakpoints: [{ line: 7 }],
    });

    await coordinator.dispose();
    await parentClient.close();
  });

  test('setBreakpoints surfaces per-child errors as warnings instead of swallowing them', async () => {
    // Plan 05-09 — gap #11. When a child's setBreakpoints rejects, the
    // aggregated response must carry a `warnings` array (with sessionId +
    // message) so the caller sees what went wrong instead of an empty
    // success.
    const manager = await SessionManager.create({ dapCliHome });
    const parent = await manager.create({ name: 'pwa', adapter: 'fake-multi-process' });
    const parentEndpoint = new FakeAdapterEndpoint();
    const parentClient = new DapClient(parentEndpoint);
    let childIdx = -1;
    const coordinator = new ChildSessionCoordinator({
      parentSessionId: parent.id,
      parentName: parent.name,
      parentClient,
      adapterId: 'fake-multi-process',
      ownedAdapter: { startedByDapCli: true, stderrTail: [] },
      sessionManager: manager,
      parentEventCache: new DapEventCache(),
      openChildTransport: name => {
        childIdx += 1;
        const localIdx = childIdx;
        const endpoint = new FakeAdapterEndpoint(name);
        if (localIdx === 0) {
          endpoint.responses.set('setBreakpoints', { success: true, body: { breakpoints: [{ id: 1, line: 10, verified: true }] } });
        } else {
          endpoint.responses.set('setBreakpoints', { success: false, message: 'boom' });
        }
        return Promise.resolve(endpoint);
      },
    });
    coordinator.attach();
    parentEndpoint.emitReverseRequest('startDebugging', { request: 'attach', configuration: { __pendingTargetId: 'a' } });
    parentEndpoint.emitReverseRequest('startDebugging', { request: 'attach', configuration: { __pendingTargetId: 'b' } });
    await coordinator.awaitPendingChildren();
    await tick(2);

    const result = (await coordinator.maybeIntercept('setBreakpoints', { source: { path: 'foo.js' }, breakpoints: [{ line: 10 }] }))?.value as {
      breakpoints: Array<{ verified: boolean; line: number }>;
      warnings?: Array<{ sessionId: string; message: string }>;
    };

    expect(result.breakpoints.length).toBeGreaterThanOrEqual(1);
    expect(result.breakpoints[0]?.verified).toBe(true);
    expect(result.warnings, 'warnings array must be present when a child fails').toBeDefined();
    expect(result.warnings).toHaveLength(1);
    const warning = result.warnings?.[0];
    expect(warning?.message).toContain('boom');
    expect(warning?.sessionId).toMatch(/^sess_/);

    await coordinator.dispose();
    await parentClient.close();
  });

  test('awaitChildrenReady waits for handshake to finish before resolving', async () => {
    // Plan 05-09 — readiness gating. awaitChildrenReady must block until each
    // child has completed configurationDone and reached lifecycle 'running'.
    const manager = await SessionManager.create({ dapCliHome });
    const parent = await manager.create({ name: 'pwa', adapter: 'pwa-chrome' });
    const parentEndpoint = new FakeAdapterEndpoint();
    const parentClient = new DapClient(parentEndpoint);
    const coordinator = new ChildSessionCoordinator({
      parentSessionId: parent.id,
      parentName: parent.name,
      parentClient,
      adapterId: 'pwa-chrome',
      ownedAdapter: { startedByDapCli: true, stderrTail: [] },
      sessionManager: manager,
      parentEventCache: new DapEventCache(),
      openChildTransport: name => Promise.resolve(new FakeAdapterEndpoint(name)),
    });
    coordinator.attach();
    parentEndpoint.emitReverseRequest('startDebugging', { request: 'attach', configuration: { __pendingTargetId: 'a' } });

    await coordinator.awaitChildrenReady();

    const children = manager.listChildren(parent.id);
    expect(children).toHaveLength(1);
    expect(children[0]?.lifecycle).toBe('running');

    await coordinator.dispose();
    await parentClient.close();
  });

  test('nested startDebugging from a child registers a grandchild flat under the same parent', async () => {
    // pwa-chrome's session model nests parent -> browser-level wrapper ->
    // page-level session. The coordinator must observe startDebugging
    // reverse requests on every child it brings up, not just the parent --
    // otherwise the grandchild that owns the parsed scripts is invisible
    // and setBreakpoints fan-out misses it.
    const manager = await SessionManager.create({ dapCliHome });
    const parent = await manager.create({ name: 'pwa', adapter: 'pwa-chrome' });
    const parentEndpoint = new FakeAdapterEndpoint('parent');
    const parentClient = new DapClient(parentEndpoint);

    const wrapperEndpoint = new FakeAdapterEndpoint('wrapper');
    wrapperEndpoint.responses.set('initialize', { success: true, body: { supportsConfigurationDoneRequest: true } });
    const pageEndpoint = new FakeAdapterEndpoint('page');
    pageEndpoint.responses.set('initialize', { success: true, body: { supportsConfigurationDoneRequest: true } });

    const openCalls: string[] = [];
    let openIndex = 0;
    const coordinator = new ChildSessionCoordinator({
      parentSessionId: parent.id,
      parentName: parent.name,
      parentClient,
      adapterId: 'pwa-chrome',
      ownedAdapter: { startedByDapCli: true, stderrTail: [] },
      sessionManager: manager,
      parentEventCache: new DapEventCache(),
      openChildTransport: name => {
        openCalls.push(name);
        const endpoint = openIndex === 0 ? wrapperEndpoint : pageEndpoint;
        openIndex += 1;
        return Promise.resolve(endpoint);
      },
    });
    coordinator.attach();

    // 1) Parent emits startDebugging -> wrapper child is brought up.
    parentEndpoint.emitReverseRequest('startDebugging', {
      request: 'attach',
      configuration: { __pendingTargetId: 'browser-1', type: 'pwa-chrome' },
    });
    await coordinator.awaitPendingChildren();
    await tick(2);

    expect(coordinator.listChildSessionIds()).toHaveLength(1);

    // 2) Wrapper child emits its OWN startDebugging -> page-level grandchild
    // must be registered flat under the same parent (not under the wrapper).
    wrapperEndpoint.emitReverseRequest('startDebugging', {
      request: 'attach',
      configuration: { __pendingTargetId: 'page-1', type: 'pwa-chrome' },
    });
    await coordinator.awaitPendingChildren();
    await tick(2);

    expect(coordinator.listChildSessionIds()).toHaveLength(2);

    const children = manager.listChildren(parent.id);
    expect(children).toHaveLength(2);
    // Both grandchildren must have the original parent as parent_session_id;
    // we do not nest sessions under intermediate wrappers in our model.
    for (const child of children) {
      expect(child.parent_session_id).toBe(parent.id);
    }
    expect(children.map(c => c.name).sort()).toEqual(['pwa#browser-1', 'pwa#page-1']);

    expect(openCalls).toEqual(['pwa#browser-1', 'pwa#page-1']);

    // The page-level grandchild actually received the attach reverse-request
    // configuration -- proving the same coordinator handled it.
    const pageAttach = pageEndpoint.receivedRequests.find(req => req.command === 'attach');
    expect(pageAttach?.arguments).toMatchObject({ __pendingTargetId: 'page-1', type: 'pwa-chrome' });

    await coordinator.dispose();
    await parentClient.close();
  });

  test('setBreakpoints for js-debug routes to parent and verifies via breakpoint event', async () => {
    // Plan 05-15 — gap #11 closure (handoff smoke half). Direct DAP trace
    // proved js-debug pwa-chrome's parent owns the provisional bp registry
    // and propagates internally. The coordinator must route setBreakpoints
    // to the parent client (not fan out), then wait for the parent's
    // `breakpoint` event with `verified: true` to flip the provisional
    // response into a verified one.
    const manager = await SessionManager.create({ dapCliHome });
    const parent = await manager.create({ name: 'pwa', adapter: 'js-debug' });
    const parentEndpoint = new FakeAdapterEndpoint('parent');
    const parentClient = new DapClient(parentEndpoint);
    const childEndpoint = new FakeAdapterEndpoint('child');

    parentEndpoint.responses.set('setBreakpoints', () => {
      // Mirror the trace: provisional response then a follow-up breakpoint
      // event with verified: true. Schedule the event AFTER the response so
      // the coordinator's request promise resolves first.
      setImmediate(() => parentEndpoint.emitEvent('breakpoint', {
        reason: 'changed',
        breakpoint: { id: 42, verified: true, line: 2, source: { path: 'app.js' } },
      }));
      return {
        success: true,
        body: { breakpoints: [{ id: 42, verified: false, message: 'breakpoint.provisionalBreakpoint', line: 2 }] },
      };
    });

    const coordinator = new ChildSessionCoordinator({
      parentSessionId: parent.id,
      parentName: parent.name,
      parentClient,
      adapterId: 'js-debug',
      ownedAdapter: { startedByDapCli: true, stderrTail: [] },
      sessionManager: manager,
      parentEventCache: new DapEventCache(),
      openChildTransport: () => Promise.resolve(childEndpoint),
    });
    coordinator.attach();
    parentEndpoint.emitReverseRequest('startDebugging', { request: 'attach', configuration: { __pendingTargetId: 'a' } });
    await coordinator.awaitPendingChildren();
    await tick(2);

    const result = (await coordinator.maybeIntercept('setBreakpoints', { source: { path: 'app.js' }, breakpoints: [{ line: 2 }] }))?.value as {
      breakpoints: Array<{ verified: boolean; line: number; id?: number }>;
      warnings?: Array<{ sessionId: string; message: string; diagnostics?: string[] }>;
    };

    expect(result.breakpoints).toHaveLength(1);
    expect(result.breakpoints[0]?.verified, 'parent breakpoint event must flip verified to true').toBe(true);
    expect(result.warnings, 'no warnings expected on the verified happy path').toBeUndefined();

    // Parent received exactly one setBreakpoints request — we must always
    // update the parent's provisional bp registry (per direct DAP trace).
    const parentSetBp = parentEndpoint.receivedRequests.filter(req => req.command === 'setBreakpoints');
    expect(parentSetBp).toHaveLength(1);

    await coordinator.dispose();
    await parentClient.close();
  });

  test('setBreakpoints for js-debug merges parent provisional with page child verified response (H-6 closure regression)', async () => {
    // Plan 05-22 — H-6 BLOCKER closure. Direct DAP trace evidence
    // (.planning/phases/05-.../05-22-trace/jsdebug-trace.txt) confirms the
    // working pwa-chrome breakpoint flow:
    //   conn 0 (parent wrapper) — setBreakpoints ⇒ verified:false "Unbound breakpoint"
    //   conn 1 (page child)     — setBreakpoints ⇒ verified:true line:2 column:18
    //   conn 1 (page child)     — event breakpoint reason:changed verified:true
    //   conn 1 (page child)     — event stopped reason:breakpoint
    //
    // The user-visible response under `dap-cli breakpoints set` MUST surface
    // verified:true (sourced from the page child's index-aligned response)
    // with the page child's enriched fields (line, column, source). The
    // existing `routeSetBreakpointsThroughParent` does this via
    // `childVerifiedByIndex`. This regression test pins the behavior so a
    // future refactor cannot silently re-break H-6.
    const manager = await SessionManager.create({ dapCliHome });
    const parent = await manager.create({ name: 'pwa', adapter: 'js-debug' });
    const parentEndpoint = new FakeAdapterEndpoint('parent');
    const parentClient = new DapClient(parentEndpoint);
    const childEndpoint = new FakeAdapterEndpoint('child');

    parentEndpoint.responses.set('setBreakpoints', {
      success: true,
      body: { breakpoints: [{ id: 1, verified: false, message: 'Unbound breakpoint' }] },
    });
    childEndpoint.responses.set('setBreakpoints', {
      success: true,
      body: {
        breakpoints: [{
          id: 0,
          verified: true,
          source: { name: 'app.js', path: '/abs/app.js', sourceReference: 0 },
          line: 2,
          column: 18,
        }],
      },
    });

    const coordinator = new ChildSessionCoordinator({
      parentSessionId: parent.id,
      parentName: parent.name,
      parentClient,
      adapterId: 'js-debug',
      ownedAdapter: { startedByDapCli: true, stderrTail: [] },
      sessionManager: manager,
      parentEventCache: new DapEventCache(),
      openChildTransport: () => Promise.resolve(childEndpoint),
      setBreakpointsVerificationTimeoutMs: 50,
    });
    coordinator.attach();
    parentEndpoint.emitReverseRequest('startDebugging', { request: 'attach', configuration: { __pendingTargetId: 'a' } });
    await coordinator.awaitPendingChildren();
    await tick(2);

    const result = (await coordinator.maybeIntercept('setBreakpoints', {
      source: { path: '/abs/app.js' },
      breakpoints: [{ line: 2 }],
    }))?.value as {
      breakpoints: Array<{ verified: boolean; line?: number; column?: number; source?: { path?: string }; message?: string }>;
      warnings?: Array<{ sessionId: string; message: string }>;
    };

    expect(result.breakpoints).toHaveLength(1);
    const bp = result.breakpoints[0]!;
    expect(bp.verified, 'page child verified:true must win over parent verified:false').toBe(true);
    expect(bp.line, 'merged response carries the page child line').toBe(2);
    expect(bp.column, 'merged response carries the page child column').toBe(18);
    expect(bp.source?.path, 'merged response carries the page child source.path').toBe('/abs/app.js');
    // Provisional "Unbound breakpoint" message MUST be dropped on the
    // verified path — it'd be misleading to surface to the user.
    expect(bp.message, 'provisional message must be dropped on verified merge').toBeUndefined();
    expect(result.warnings, 'no warnings expected when verification succeeds via child').toBeUndefined();

    // Parent received exactly one setBreakpoints (provisional registry update).
    const parentSetBp = parentEndpoint.receivedRequests.filter(req => req.command === 'setBreakpoints');
    expect(parentSetBp).toHaveLength(1);
    // Page child received exactly one setBreakpoints (the fan-out from the
    // user request — NOT a runChildLifecycle replay, which would be a
    // 05-15 regression).
    const childSetBp = childEndpoint.receivedRequests.filter(req => req.command === 'setBreakpoints');
    expect(childSetBp).toHaveLength(1);

    await coordinator.dispose();
    await parentClient.close();
  });

  test('setBreakpoints for js-debug preserves conditional metadata on parent and child routes', async () => {
    const manager = await SessionManager.create({ dapCliHome });
    const parent = await manager.create({ name: 'pwa', adapter: 'js-debug' });
    const parentEndpoint = new FakeAdapterEndpoint('parent');
    const parentClient = new DapClient(parentEndpoint);
    const childEndpoint = new FakeAdapterEndpoint('child');

    parentEndpoint.responses.set('setBreakpoints', {
      success: true,
      body: { breakpoints: [{ id: 1, verified: false, message: 'Unbound breakpoint' }] },
    });
    childEndpoint.responses.set('setBreakpoints', {
      success: true,
      body: {
        breakpoints: [{
          id: 0,
          verified: true,
          source: { name: 'app.js', path: '/abs/app.js', sourceReference: 0 },
          line: 2,
          column: 18,
        }],
      },
    });

    const coordinator = new ChildSessionCoordinator({
      parentSessionId: parent.id,
      parentName: parent.name,
      parentClient,
      adapterId: 'js-debug',
      ownedAdapter: { startedByDapCli: true, stderrTail: [] },
      sessionManager: manager,
      parentEventCache: new DapEventCache(),
      openChildTransport: () => Promise.resolve(childEndpoint),
      setBreakpointsVerificationTimeoutMs: 50,
    });
    coordinator.attach();
    parentEndpoint.emitReverseRequest('startDebugging', { request: 'attach', configuration: { __pendingTargetId: 'a' } });
    await coordinator.awaitPendingChildren();
    await tick(2);

    const breakpointArguments = {
      source: { path: '/abs/app.js' },
      breakpoints: [{ line: 2, condition: 'left > 3', hitCondition: '2', logMessage: 'left={left}' }],
    };
    const result = (await coordinator.maybeIntercept('setBreakpoints', breakpointArguments))?.value as {
      breakpoints: Array<{ verified: boolean; line?: number; column?: number; source?: { path?: string }; message?: string }>;
      warnings?: Array<{ sessionId: string; message: string }>;
    };

    expect(result.breakpoints[0]?.verified).toBe(true);
    expect(result.breakpoints[0]?.message).toBeUndefined();
    expect(result.warnings).toBeUndefined();

    const parentSetBp = parentEndpoint.receivedRequests.filter(req => req.command === 'setBreakpoints');
    expect(parentSetBp).toHaveLength(1);
    expect(parentSetBp[0]?.arguments).toMatchObject(breakpointArguments);

    const childSetBp = childEndpoint.receivedRequests.filter(req => req.command === 'setBreakpoints');
    expect(childSetBp).toHaveLength(1);
    expect(childSetBp[0]?.arguments).toMatchObject(breakpointArguments);

    await coordinator.dispose();
    await parentClient.close();
  });

  test('setBreakpoints for js-debug surfaces verification_timeout when no breakpoint event arrives', async () => {
    // Plan 05-15 — gap #11 closure. If the parent returns provisional but
    // never emits a verifying `breakpoint` event within the timeout, the
    // coordinator must surface `warnings: [{sessionId, message:
    // 'verification_timeout'}]` so callers see a diagnostic instead of
    // assuming the breakpoint is verified.
    const manager = await SessionManager.create({ dapCliHome });
    const parent = await manager.create({ name: 'pwa', adapter: 'js-debug' });
    const parentEndpoint = new FakeAdapterEndpoint('parent');
    const parentClient = new DapClient(parentEndpoint);
    const childEndpoint = new FakeAdapterEndpoint('child');

    parentEndpoint.responses.set('setBreakpoints', {
      success: true,
      body: { breakpoints: [{ id: 99, verified: false, message: 'breakpoint.provisionalBreakpoint', line: 2 }] },
    });
    // NOTE: no follow-up `breakpoint` event — verification will time out.

    const coordinator = new ChildSessionCoordinator({
      parentSessionId: parent.id,
      parentName: parent.name,
      parentClient,
      adapterId: 'js-debug',
      ownedAdapter: { startedByDapCli: true, stderrTail: [] },
      sessionManager: manager,
      parentEventCache: new DapEventCache(),
      openChildTransport: () => Promise.resolve(childEndpoint),
      setBreakpointsVerificationTimeoutMs: 50,
    });
    coordinator.attach();
    parentEndpoint.emitReverseRequest('startDebugging', { request: 'attach', configuration: { __pendingTargetId: 'a' } });
    await coordinator.awaitPendingChildren();
    await tick(2);

    const result = (await coordinator.maybeIntercept('setBreakpoints', { source: { path: 'app.js' }, breakpoints: [{ line: 2 }] }))?.value as {
      breakpoints: Array<{ verified: boolean; line: number; id?: number }>;
      warnings?: Array<{ sessionId: string; message: string }>;
    };

    expect(result.breakpoints).toHaveLength(1);
    expect(result.breakpoints[0]?.verified, 'verified must remain false on timeout').toBe(false);
    expect(result.warnings, 'warnings must be present on verification timeout').toBeDefined();
    expect(result.warnings).toEqual([{
      sessionId: parent.id,
      message: 'verification_timeout',
      diagnostics: [
        'Breakpoint verification timed out. Check the js-debug trace log for source-map resolution details.',
        'For JavaScript source breakpoints, confirm the source path is the file actually loaded by the debuggee. Use `dap-cli stack` after a stopped event to compare reported frame source paths with the requested breakpoint path.',
        'If the process exits quickly or the module is loaded after launch, retry with `stopOnEntry: true` or set the breakpoint after the child session appears in `dap-cli sessions --show-children`.',
      ],
    }]);

    await coordinator.dispose();
    await parentClient.close();
  });
});

// Plan 05-23 (gap H-8): the controller-level teardown path must (a) send DAP
// `disconnect` with `terminateDebuggee:true`, (b) signal the adapter PID (or
// process group on POSIX, Task 1.5) when the adapter doesn't exit on its
// own, and (c) honestly report `orphanPids`/`warnings` when SIGKILL fails
// to take. These tests drive the controller end-to-end via a real fake
// adapter spawned over stdio; signalProcess + isProcessAlive are mocked so
// the test can simulate "process refuses to die" without leaving real
// processes behind.
describe('ControllerServer.terminateRuntime (H-8)', () => {
  test.each([
    { method: 'sessions.stop' as const, mode: 'launch' as const, script: 'stopped-on-entry', sessionName: 'disconnect-stop-demo', terminateDebuggee: true },
    { method: 'sessions.detach' as const, mode: 'attach' as const, script: 'attach-stopped', sessionName: 'disconnect-detach-demo', terminateDebuggee: false },
  ])('$method sends shaped disconnect args', async ({ method, mode, script, sessionName, terminateDebuggee }) => {
    const { startControllerServer } = await import('../../src/controller/server.js');
    const { createControllerClient } = await import('../../src/controller/client.js');
    const fakeAdapter = await startFakeSocketAdapter(createFakeAdapterScript(script), mode);
    const server = await startControllerServer({ dapCliHome });

    try {
      const client = await createControllerClient({ dapCliHome, timeoutMs: 30_000 });
      try {
        await client.request('dap.start', {
          mode,
          name: sessionName,
          use: true,
          descriptor: {
            id: `fake-${mode}-disconnect`,
            label: `fake-${mode}-disconnect`,
            transport: { kind: 'socket', host: '127.0.0.1', port: fakeAdapter.port },
          },
        });

        await expect(client.request(method, { name: sessionName })).resolves.toMatchObject({
          name: sessionName,
          status: 'terminated',
        });
        expect(fakeAdapter.requests
          .filter(request => request.command === 'disconnect')
          .map(request => request.arguments)).toEqual([{ terminateDebuggee }]);
      } finally {
        await client.close();
      }
    } finally {
      await server.stop().catch(() => undefined);
      await fakeAdapter.close();
    }
  }, 20_000);

  test('sessions.close on a fake-adapter session reports orphanPids when isProcessAlive stays true', async () => {
    const { startControllerServer } = await import('../../src/controller/server.js');
    const { createControllerClient } = await import('../../src/controller/client.js');
    const fakeAdapterEntry = path.join(process.cwd(), 'tests', 'fixtures', 'fake-adapter-entry.ts');

    // Mock signalProcess to record what we tried to signal, and
    // isProcessAlive to ALWAYS return true so the runtime can never observe
    // the real fake adapter exiting. This is the failure-mode the orphanPids
    // disclosure exists for.
    const signalCalls: Array<{ target: number; signal: NodeJS.Signals }> = [];
    const server = await startControllerServer({
      dapCliHome,
      signalProcess: (target, signal) => {
        signalCalls.push({ target, signal });
      },
      isProcessAlive: () => true,
    });

    try {
      const client = await createControllerClient({ dapCliHome, timeoutMs: 30_000 });
      try {
        const startResult = await client.request<{ sessionId: string; name: string }>('dap.start', {
          mode: 'launch',
          name: 'h8-orphan-demo',
          use: true,
          descriptor: {
            id: 'fake',
            label: 'fake',
            transport: {
              kind: 'stdio',
              command: process.execPath,
              args: ['--experimental-strip-types', fakeAdapterEntry, '--script', 'stopped-on-entry', '--mode', 'launch'],
            },
          },
        });
        expect(startResult.name).toBe('h8-orphan-demo');

        const closeResult = await client.request<{ name: string; orphanPids: number[]; warnings: string[] }>('sessions.close', { name: 'h8-orphan-demo' });
        expect(closeResult.name).toBe('h8-orphan-demo');
        expect(closeResult.orphanPids).toHaveLength(1);
        expect(closeResult.orphanPids[0]).toBeGreaterThan(0);
        expect(closeResult.warnings).toEqual([`orphan_processes_remain: ${closeResult.orphanPids[0]}`]);

        // signalProcess must have been invoked at least once (SIGTERM, then
        // SIGKILL since isProcessAlive keeps reporting true). Because the
        // adapter was spawned with detached:true on POSIX, the target should
        // be the NEGATIVE pgid (Task 1.5 cascade). On Windows it's the
        // positive pid. Tolerate both so the test runs cross-platform.
        expect(signalCalls.length).toBeGreaterThanOrEqual(1);
        const signals = signalCalls.map(call => call.signal);
        expect(signals).toContain('SIGTERM');
        if (process.platform !== 'win32') {
          // POSIX: every signal target should be the negative pgid form
          // (process.kill(-pgid, sig)) so SIGKILL cascades through the
          // adapter's child tree.
          expect(signalCalls.every(call => call.target < 0), `expected all signal targets to be negative pgids on POSIX, saw: ${JSON.stringify(signalCalls)}`).toBe(true);
        }
      } finally {
        await client.close();
      }

      // Best-effort: kill the real fake adapter we held alive in the test by
      // mocking isProcessAlive. Without this the post-test rm of dapCliHome
      // could race with a lingering child writing its log.
      for (const call of signalCalls) {
        try { process.kill(Math.abs(call.target), 'SIGKILL'); } catch { /* ignore */ }
      }
    } finally {
      await server.stop().catch(() => undefined);
    }
  }, 20_000);

  test('sessions.close returns empty orphanPids and no warnings on a clean teardown', async () => {
    const { startControllerServer } = await import('../../src/controller/server.js');
    const { createControllerClient } = await import('../../src/controller/client.js');
    const fakeAdapterEntry = path.join(process.cwd(), 'tests', 'fixtures', 'fake-adapter-entry.ts');

    const server = await startControllerServer({ dapCliHome });
    try {
      const client = await createControllerClient({ dapCliHome, timeoutMs: 30_000 });
      try {
        await client.request('dap.start', {
          mode: 'launch',
          name: 'h8-clean-demo',
          use: true,
          descriptor: {
            id: 'fake',
            label: 'fake',
            transport: {
              kind: 'stdio',
              command: process.execPath,
              args: ['--experimental-strip-types', fakeAdapterEntry, '--script', 'stopped-on-entry', '--mode', 'launch'],
            },
          },
        });

        const closeResult = await client.request<{ name: string; orphanPids: number[]; warnings: string[] }>('sessions.close', { name: 'h8-clean-demo' });
        expect(closeResult.name).toBe('h8-clean-demo');
        expect(closeResult.orphanPids).toEqual([]);
        expect(closeResult.warnings).toEqual([]);
      } finally {
        await client.close();
      }
    } finally {
      await server.stop().catch(() => undefined);
    }
  }, 20_000);
});

