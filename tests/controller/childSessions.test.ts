import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { PassThrough } from 'node:stream';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { ChildSessionCoordinator } from '../../src/controller/childSessions.js';
import { derivePausedStateFromStopped } from '../../src/controller/pausedState.js';
import { DapClient } from '../../src/protocol/dapClient.js';
import { CliError } from '../../src/cli/errors.js';
import { DapEventCache } from '../../src/protocol/eventCache.js';
import { DapMessageParser, encodeDapMessage } from '../../src/protocol/framing.js';
import type { DapEventMessage, DapProtocolMessage, DapRequestMessage, DapResponseMessage } from '../../src/protocol/dapMessages.js';
import type { DapTransport } from '../../src/protocol/transport.js';
import { SessionManager } from '../../src/sessions/sessionManager.js';

let dapCliHome: string;

beforeEach(async () => {
  dapCliHome = await fs.mkdtemp(path.join(os.tmpdir(), 'dap-cli-childsessions-'));
});

afterEach(async () => {
  // maxRetries handles a brief race with in-flight `void`-ed paused-state
  // persists from the mirror handler when an event arrives in the same tick
  // as test teardown.
  await fs.rm(dapCliHome, { recursive: true, force: true, maxRetries: 5, retryDelay: 20 });
});

describe('derivePausedStateFromStopped', () => {
  test('coerces unknown body to safe defaults', () => {
    const result = derivePausedStateFromStopped({ reason: 42, threadId: 'abc' });
    expect(result).toEqual({ paused: true, stoppedReason: 'unknown', stoppedThreadIds: [] });
  });

  test('honors a string reason and integer threadId', () => {
    const result = derivePausedStateFromStopped({ reason: 'entry', threadId: 7 });
    expect(result).toEqual({ paused: true, stoppedReason: 'entry', stoppedThreadIds: [7] });
  });

  test('allThreadsStopped: true forces stoppedThreadIds to []', () => {
    const result = derivePausedStateFromStopped({ reason: 'pause', threadId: 5, allThreadsStopped: true });
    expect(result).toEqual({ paused: true, stoppedReason: 'pause', stoppedThreadIds: [] });
  });

  test('non-object body is treated as empty', () => {
    const result = derivePausedStateFromStopped(null);
    expect(result).toEqual({ paused: true, stoppedReason: 'unknown', stoppedThreadIds: [] });
  });
});

/**
 * Minimal DapTransport-shaped fake that auto-responds to every request the
 * client writes. Mirrors the helper in tests/controller/sessionManager.test.ts
 * so the child-mirror unit tests can drive a real `ChildSessionCoordinator`
 * against synthetic child events without spinning up a real adapter.
 */
class FakeAdapterEndpoint implements DapTransport {
  public readonly name: string;
  public readonly readable = new PassThrough();
  public readonly writable = new PassThrough();
  public readonly receivedRequests: DapRequestMessage[] = [];
  public readonly receivedResponses: DapResponseMessage[] = [];
  /**
   * Per-command response overrides. When the endpoint receives a request whose
   * `command` matches a registered handler, the handler's return value becomes
   * the response `body` (success:true). Used by H-3a routing tests to seed
   * deterministic `threads` lists for individual children.
   */
  public readonly responders = new Map<string, (request: DapRequestMessage) => unknown>();
  public readonly failures = new Map<string, string>();
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
    const seq = this.serverSeq;
    this.serverSeq += 1;
    const responder = this.responders.get(request.command);
    const failureMessage = this.failures.get(request.command);
    if (failureMessage !== undefined) {
      this.emit({ seq, type: 'response', request_seq: request.seq, success: false, command: request.command, message: failureMessage });
      return;
    }
    const body = responder?.(request);
    const response: DapResponseMessage = body === undefined
      ? { seq, type: 'response', request_seq: request.seq, success: true, command: request.command }
      : { seq, type: 'response', request_seq: request.seq, success: true, command: request.command, body };
    this.emit(response);
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

describe('ChildSessionCoordinator paused-state mirroring (H-1a/H-1b)', () => {
  test('mirrors child stopped event onto parent paused state', async () => {
    const manager = await SessionManager.create({ dapCliHome });
    const parent = await manager.create({ name: 'pwa-node', adapter: 'js-debug' });
    const parentEndpoint = new FakeAdapterEndpoint('parent');
    const parentClient = new DapClient(parentEndpoint);
    const childEndpoint = new FakeAdapterEndpoint('child');

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

    parentEndpoint.emitReverseRequest('startDebugging', {
      request: 'launch',
      configuration: { __pendingTargetId: 'tgt-1', type: 'pwa-node' },
    });
    await coordinator.awaitPendingChildren();
    await tick(2);

    childEndpoint.emitEvent('stopped', { reason: 'entry', threadId: 1 });
    await tick(4);

    const parentStatus = manager.status(parent.id);
    expect(parentStatus.paused).toBe(true);
    expect(parentStatus.stoppedReason).toBe('entry');
    expect(parentStatus.stoppedThreadIds).toEqual([1]);

    await coordinator.dispose();
    await parentClient.close();
  });

  test('clears parent paused state on child continued event', async () => {
    const manager = await SessionManager.create({ dapCliHome });
    const parent = await manager.create({ name: 'pwa-node', adapter: 'js-debug' });
    const parentEndpoint = new FakeAdapterEndpoint('parent');
    const parentClient = new DapClient(parentEndpoint);
    const childEndpoint = new FakeAdapterEndpoint('child');

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

    parentEndpoint.emitReverseRequest('startDebugging', {
      request: 'launch',
      configuration: { type: 'pwa-node' },
    });
    await coordinator.awaitPendingChildren();
    await tick(2);

    childEndpoint.emitEvent('stopped', { reason: 'breakpoint', threadId: 3 });
    await tick(4);
    childEndpoint.emitEvent('continued', { threadId: 3 });
    await tick(4);

    const parentStatus = manager.status(parent.id);
    expect(parentStatus.paused).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(parentStatus, 'stoppedReason')).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(parentStatus, 'stoppedThreadIds')).toBe(false);

    await coordinator.dispose();
    await parentClient.close();
  });

  test('child terminated event clears parent paused state', async () => {
    const manager = await SessionManager.create({ dapCliHome });
    const parent = await manager.create({ name: 'pwa-node', adapter: 'js-debug' });
    const parentEndpoint = new FakeAdapterEndpoint('parent');
    const parentClient = new DapClient(parentEndpoint);
    const childEndpoint = new FakeAdapterEndpoint('child');

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

    parentEndpoint.emitReverseRequest('startDebugging', {
      request: 'launch',
      configuration: { type: 'pwa-node' },
    });
    await coordinator.awaitPendingChildren();
    await tick(2);

    childEndpoint.emitEvent('stopped', { reason: 'step', threadId: 2 });
    await tick(4);
    childEndpoint.emitEvent('terminated');
    await tick(4);

    const parentStatus = manager.status(parent.id);
    expect(parentStatus.paused).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(parentStatus, 'stoppedReason')).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(parentStatus, 'stoppedThreadIds')).toBe(false);

    await coordinator.dispose();
    await parentClient.close();
  });
});

/**
 * Plan 05-26 (gap H-3a): parent-name routing for thread-scoped DAP commands.
 * The coordinator routes by REAL child thread ids (no synthetic remap),
 * augments `threads` with `sessionName`, and surfaces a structured
 * `thread_id_required` error when a routable command omits `--thread-id`
 * against a multi-child parent.
 */
describe('ChildSessionCoordinator parent-name thread routing (H-3a)', () => {
  interface Harness {
    coordinator: ChildSessionCoordinator;
    parentClient: DapClient;
    parentEndpoint: FakeAdapterEndpoint;
    childEndpoints: FakeAdapterEndpoint[];
    childNames: string[];
    parentId: string;
    cleanup: () => Promise<void>;
  }

  async function createMultiChildHarness(childThreadLists: ReadonlyArray<ReadonlyArray<{ id: number; name: string }>>): Promise<Harness> {
    const manager = await SessionManager.create({ dapCliHome });
    const parent = await manager.create({ name: 'pwa-parent', adapter: 'js-debug' });
    const parentEndpoint = new FakeAdapterEndpoint('parent');
    const parentClient = new DapClient(parentEndpoint);
    const childEndpoints: FakeAdapterEndpoint[] = childThreadLists.map((threads, index) => {
      const endpoint = new FakeAdapterEndpoint(`child-${index}`);
      // Seed a deterministic threads response so aggregateThreads / live
      // refresh paths return the expected ids per child.
      endpoint.responders.set('threads', () => ({ threads: [...threads] }));
      return endpoint;
    });
    let nextChild = 0;
    const coordinator = new ChildSessionCoordinator({
      parentSessionId: parent.id,
      parentName: parent.name,
      parentClient,
      adapterId: 'js-debug',
      ownedAdapter: { startedByDapCli: true, stderrTail: [] },
      sessionManager: manager,
      parentEventCache: new DapEventCache(),
      openChildTransport: () => {
        const endpoint = childEndpoints[nextChild];
        if (endpoint === undefined) {
          throw new Error(`No child endpoint for index ${nextChild}`);
        }
        nextChild += 1;
        return Promise.resolve(endpoint);
      },
    });
    coordinator.attach();

    for (let i = 0; i < childThreadLists.length; i += 1) {
      parentEndpoint.emitReverseRequest('startDebugging', {
        request: 'launch',
        configuration: { __pendingTargetId: `tgt-${i}`, type: 'pwa-node' },
      });
    }
    await coordinator.awaitPendingChildren();
    await tick(2);

    const childNames = childEndpoints.map((_, index) => `${parent.name}#tgt-${index}`);

    return {
      coordinator,
      parentClient,
      parentEndpoint,
      childEndpoints,
      childNames,
      parentId: parent.id,
      cleanup: async () => {
        await coordinator.dispose();
        await parentClient.close();
      },
    };
  }

  test('aggregateThreads returns real child ids with sessionName', async () => {
    const harness = await createMultiChildHarness([
      [{ id: 1, name: 'main-A' }],
      [{ id: 1, name: 'main-B' }, { id: 2, name: 'worker-B' }],
    ]);
    try {
      const result = await harness.coordinator.maybeIntercept('threads', {});
      expect(result).toBeDefined();
      const value = result!.value as { threads: Array<{ id: number; name: string; sessionName: string }> };
      expect(value.threads).toHaveLength(3);
      // Real ids preserved (id:1 appears twice — disambiguated by sessionName).
      const ids = value.threads.map(t => t.id).sort();
      expect(ids).toEqual([1, 1, 2]);
      const sessionNames = new Set(value.threads.map(t => t.sessionName));
      expect(sessionNames.size).toBe(2);
      for (const name of sessionNames) {
        expect(name.startsWith(`${'pwa-parent'}#`)).toBe(true);
      }
    } finally {
      await harness.cleanup();
    }
  });

  test('routeByThreadId with undefined threadId throws thread_id_required with availableThreads', async () => {
    const harness = await createMultiChildHarness([
      [{ id: 1, name: 'main-A' }, { id: 2, name: 'worker-A' }],
    ]);
    try {
      // Prime knownThreadIds via aggregateThreads so listAvailableThreads has
      // entries to surface in the error payload.
      await harness.coordinator.maybeIntercept('threads', {});
      await expect(harness.coordinator.maybeIntercept('continue', {}))
        .rejects.toMatchObject({
          code: 'thread_id_required',
          category: 'session',
        });
      // Verify error data shape via a separate catch so we can assert on `data`.
      let captured: unknown;
      try {
        await harness.coordinator.maybeIntercept('continue', {});
      } catch (error) {
        captured = error;
      }
      expect(captured).toBeInstanceOf(CliError);
      const cliError = captured as CliError;
      expect(cliError.data).toBeDefined();
      const available = (cliError.data as { availableThreads: Array<{ sessionName: string; sessionId: string; threadId: number }> }).availableThreads;
      expect(available.map(a => a.threadId).sort()).toEqual([1, 2]);
      for (const entry of available) {
        expect(typeof entry.sessionName).toBe('string');
        expect(typeof entry.sessionId).toBe('string');
      }
    } finally {
      await harness.cleanup();
    }
  });

  test('routeByThreadId forwards continue to the owning child unchanged (real id)', async () => {
    const harness = await createMultiChildHarness([
      [{ id: 1, name: 'main-A' }],
      [{ id: 7, name: 'worker-B' }],
    ]);
    try {
      await harness.coordinator.maybeIntercept('threads', {});
      const childB = harness.childEndpoints[1]!;
      childB.responders.set('continue', () => ({ allThreadsContinued: false }));
      const result = await harness.coordinator.maybeIntercept('continue', { threadId: 7 });
      expect(result).toBeDefined();
      // Confirm the request actually hit child B with the unchanged threadId.
      const continueRequest = childB.receivedRequests.find(r => r.command === 'continue');
      expect(continueRequest).toBeDefined();
      expect((continueRequest!.arguments as { threadId: number }).threadId).toBe(7);
      // And NOT child A.
      const childA = harness.childEndpoints[0]!;
      expect(childA.receivedRequests.find(r => r.command === 'continue')).toBeUndefined();
    } finally {
      await harness.cleanup();
    }
  });

  test('routeByThreadId maps child not-paused stackTrace failures to thread_not_paused', async () => {
    const harness = await createMultiChildHarness([
      [{ id: 7, name: 'main' }],
    ]);
    try {
      await harness.coordinator.maybeIntercept('threads', {});
      const child = harness.childEndpoints[0]!;
      child.failures.set('stackTrace', 'Thread is not paused');

      let captured: unknown;
      try {
        await harness.coordinator.maybeIntercept('stackTrace', { threadId: 7 });
      } catch (error) {
        captured = error;
      }

      expect(captured).toBeInstanceOf(CliError);
      expect(captured).toMatchObject({
        code: 'thread_not_paused',
        category: 'dap',
        message: 'Thread is not paused.',
      });
      expect((captured as CliError).diagnostics).toEqual([
        'Poll `dap-cli events --name pwa-parent --include stopped` until a stopped event appears, then retry. Use --stop-on-entry on launch to pause immediately.',
      ]);
    } finally {
      await harness.cleanup();
    }
  });

  test('child scopes and variables not-paused failures map to thread_not_paused', async () => {
    const harness = await createMultiChildHarness([
      [{ id: 7, name: 'main' }],
    ]);
    try {
      await harness.coordinator.maybeIntercept('threads', {});
      const child = harness.childEndpoints[0]!;
      child.responders.set('stackTrace', () => ({ stackFrames: [{ id: 200, name: 'main', line: 1, column: 1 }] }));
      child.responders.set('scopes', () => ({ scopes: [{ name: 'Locals', variablesReference: 300, expensive: false }] }));

      await harness.coordinator.maybeIntercept('stackTrace', { threadId: 7 });
      await harness.coordinator.maybeIntercept('scopes', { frameId: 200 });

      child.failures.set('scopes', 'Thread is not paused');
      let scopesCaptured: unknown;
      try {
        await harness.coordinator.maybeIntercept('scopes', { frameId: 200 });
      } catch (error) {
        scopesCaptured = error;
      }
      expect(scopesCaptured).toMatchObject({ code: 'thread_not_paused', category: 'dap', message: 'Thread is not paused.' });

      child.failures.set('variables', 'Thread is not paused');
      let variablesCaptured: unknown;
      try {
        await harness.coordinator.maybeIntercept('variables', { variablesReference: 300 });
      } catch (error) {
        variablesCaptured = error;
      }
      expect(variablesCaptured).toMatchObject({ code: 'thread_not_paused', category: 'dap', message: 'Thread is not paused.' });
    } finally {
      await harness.cleanup();
    }
  });

  test('routeByThreadId resolves an unknown id via live `threads` refresh', async () => {
    // Child A initially reports no threads; later registers thread 99 via a
    // `thread` event; routing must find it without an explicit aggregateThreads
    // priming call.
    const harness = await createMultiChildHarness([
      [],
    ]);
    try {
      const childA = harness.childEndpoints[0]!;
      childA.responders.set('continue', () => ({ allThreadsContinued: true }));
      // Simulate a worker spawned mid-session: `thread started` event seeds
      // knownThreadIds without going through aggregateThreads.
      childA.emitEvent('thread', { reason: 'started', threadId: 99 });
      await tick(2);
      const result = await harness.coordinator.maybeIntercept('continue', { threadId: 99 });
      expect(result).toBeDefined();
      const continueRequest = childA.receivedRequests.find(r => r.command === 'continue');
      expect(continueRequest).toBeDefined();
      expect((continueRequest!.arguments as { threadId: number }).threadId).toBe(99);
    } finally {
      await harness.cleanup();
    }
  });

  test('routeByThreadId throws thread_not_owned with availableThreads when no child claims the id', async () => {
    const harness = await createMultiChildHarness([
      [{ id: 1, name: 'main-A' }],
    ]);
    try {
      await harness.coordinator.maybeIntercept('threads', {});
      let captured: unknown;
      try {
        await harness.coordinator.maybeIntercept('continue', { threadId: 999 });
      } catch (error) {
        captured = error;
      }
      expect(captured).toBeInstanceOf(CliError);
      const cliError = captured as CliError;
      expect(cliError.code).toBe('thread_not_owned');
      const data = cliError.data as { requestedThreadId: number; availableThreads: Array<{ threadId: number }> };
      expect(data.requestedThreadId).toBe(999);
      expect(data.availableThreads.map(a => a.threadId)).toEqual([1]);
    } finally {
      await harness.cleanup();
    }
  });

  test('goto is in ROUTABLE_COMMANDS and routes via routeByThreadId', async () => {
    const harness = await createMultiChildHarness([
      [{ id: 5, name: 'main-A' }],
    ]);
    try {
      await harness.coordinator.maybeIntercept('threads', {});
      const childA = harness.childEndpoints[0]!;
      childA.responders.set('goto', () => undefined);
      const result = await harness.coordinator.maybeIntercept('goto', { threadId: 5, targetId: 42 });
      expect(result).toBeDefined();
      const gotoRequest = childA.receivedRequests.find(r => r.command === 'goto');
      expect(gotoRequest).toBeDefined();
      expect((gotoRequest!.arguments as { threadId: number; targetId: number })).toEqual({ threadId: 5, targetId: 42 });
    } finally {
      await harness.cleanup();
    }
  });

  test('setVariable is in ROUTABLE_COMMANDS and routes via routeByVariableReference', async () => {
    const harness = await createMultiChildHarness([
      [{ id: 1, name: 'main-A' }],
      [{ id: 1, name: 'main-B' }],
    ]);
    try {
      // Seed scopes on child B by routing a scopes request first (a frame
      // owned by child B). Easier: directly drive a stackTrace -> scopes
      // chain on child B.
      const childB = harness.childEndpoints[1]!;
      childB.responders.set('stackTrace', () => ({ stackFrames: [{ id: 200, name: 'fn', line: 1, column: 1 }] }));
      childB.responders.set('scopes', () => ({ scopes: [{ name: 'Locals', variablesReference: 300, expensive: false }] }));
      childB.responders.set('setVariable', () => ({ value: 'updated' }));
      // Prime threads so routeByThreadId resolves to child B (id:1 is
      // ambiguous; iteration order returns child A first — use a unique id).
      // Simpler: emit a unique known thread id on B and route via that.
      childB.emitEvent('thread', { reason: 'started', threadId: 77 });
      await tick(2);
      // Seed frameIds on child B.
      await harness.coordinator.maybeIntercept('stackTrace', { threadId: 77 });
      // Seed variableReferences on child B.
      await harness.coordinator.maybeIntercept('scopes', { frameId: 200 });
      const result = await harness.coordinator.maybeIntercept('setVariable', { variablesReference: 300, name: 'x', value: 'updated' });
      expect(result).toBeDefined();
      const setVarRequest = childB.receivedRequests.find(r => r.command === 'setVariable');
      expect(setVarRequest).toBeDefined();
      // Confirm child A did NOT receive the request.
      const childA = harness.childEndpoints[0]!;
      expect(childA.receivedRequests.find(r => r.command === 'setVariable')).toBeUndefined();
    } finally {
      await harness.cleanup();
    }
  });

  test('thread exited event removes the id from knownThreadIds', async () => {
    const harness = await createMultiChildHarness([[]]);
    try {
      const childA = harness.childEndpoints[0]!;
      childA.emitEvent('thread', { reason: 'started', threadId: 11 });
      await tick(2);
      // Confirm visible via listAvailableThreads (indirectly via error data).
      let firstCaptured: unknown;
      try {
        await harness.coordinator.maybeIntercept('continue', {});
      } catch (error) {
        firstCaptured = error;
      }
      expect((firstCaptured as CliError).data).toMatchObject({
        availableThreads: [expect.objectContaining({ threadId: 11 })],
      });
      childA.emitEvent('thread', { reason: 'exited', threadId: 11 });
      await tick(2);
      let secondCaptured: unknown;
      try {
        await harness.coordinator.maybeIntercept('continue', {});
      } catch (error) {
        secondCaptured = error;
      }
      expect((secondCaptured as CliError).data).toMatchObject({ availableThreads: [] });
    } finally {
      await harness.cleanup();
    }
  });
});
