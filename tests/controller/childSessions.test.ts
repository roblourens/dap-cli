import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { PassThrough } from 'node:stream';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { ChildSessionCoordinator } from '../../src/controller/childSessions.js';
import { combineChildPausedStates, derivePausedStateFromStopped } from '../../src/controller/pausedState.js';
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
  /**
   * Commands listed here are received but never get a response. Used by
   * Phase 17 S-08 Bug 1 tests to model a child stuck mid-handshake (e.g.
   * `configurationDone` never returns), which leaves its `readyPromise`
   * pending forever.
   */
  public readonly silent = new Set<string>();
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
    if (this.silent.has(request.command)) {
      // Intentional black hole — emit no response, no event. Models a
      // child whose handshake stalls (Phase 17 S-08 Bug 1).
      return;
    }
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

async function waitForChildRegistration(coordinator: ChildSessionCoordinator, expectedCount = 1): Promise<void> {
  const deadline = Date.now() + 1_000;
  while (Date.now() < deadline) {
    if (coordinator.listChildSessionIds().length >= expectedCount) {
      return;
    }
    await tick(2);
  }
  throw new Error(`Timed out waiting for ${expectedCount} child(ren) to register`);
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

  test('setBreakpoints before child registration replays to new child and returns verified breakpoints', async () => {
    const manager = await SessionManager.create({ dapCliHome });
    const parent = await manager.create({ name: 'pwa-parent', adapter: 'js-debug' });
    const parentEndpoint = new FakeAdapterEndpoint('parent');
    const parentClient = new DapClient(parentEndpoint);
    const childEndpoint = new FakeAdapterEndpoint('child');
    parentEndpoint.responders.set('setBreakpoints', () => ({ breakpoints: [{ id: 1, verified: false, message: 'Unbound breakpoint' }] }));
    childEndpoint.responders.set('setBreakpoints', () => {
      childEndpoint.emitEvent('breakpoint', { reason: 'changed', breakpoint: { id: 1, verified: true, source: { path: '/repo/server.js' }, line: 9 } });
      childEndpoint.emitEvent('breakpoint', { reason: 'changed', breakpoint: { id: 2, verified: true, source: { path: '/repo/server.js' }, line: 18 } });
      return { breakpoints: [] };
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

    try {
      const resultPromise = coordinator.maybeIntercept('setBreakpoints', { source: { path: '/repo/server.js' }, breakpoints: [{ line: 9 }], lines: [9] });
      parentEndpoint.emitReverseRequest('startDebugging', {
        request: 'launch',
        configuration: { __pendingTargetId: 'target-1', type: 'pwa-node' },
      });

      const result = (await resultPromise)?.value as { breakpoints: Array<{ verified: boolean; line?: number; id?: number }>; warnings?: unknown[] };
      expect(result.breakpoints).toEqual([{ id: 1, verified: true, line: 9, source: { path: '/repo/server.js' } }]);
      expect(result.warnings).toBeUndefined();
      const childSetBreakpoints = childEndpoint.receivedRequests.filter(request => request.command === 'setBreakpoints');
      expect(childSetBreakpoints.length).toBeGreaterThanOrEqual(1);
      expect(childSetBreakpoints[0]?.arguments).toMatchObject({ source: { path: '/repo/server.js' }, lines: [9] });
    } finally {
      await coordinator.dispose();
      await parentClient.close();
    }
  });

  test('setBreakpoints with no children falls back to parent for non-js-debug adapters', async () => {
    const manager = await SessionManager.create({ dapCliHome });
    const parent = await manager.create({ name: 'socket-parent', adapter: 'socket-adapter' });
    const parentEndpoint = new FakeAdapterEndpoint('parent');
    const parentClient = new DapClient(parentEndpoint);
    const coordinator = new ChildSessionCoordinator({
      parentSessionId: parent.id,
      parentName: parent.name,
      parentClient,
      adapterId: 'socket-adapter',
      ownedAdapter: { startedByDapCli: true, stderrTail: [] },
      sessionManager: manager,
      parentEventCache: new DapEventCache(),
      openChildTransport: () => Promise.reject(new Error('unexpected child transport')),
    });
    coordinator.attach();

    try {
      const result = await coordinator.maybeIntercept('setBreakpoints', { source: { path: '/repo/server.js' }, breakpoints: [{ line: 9 }], lines: [9] });
      expect(result).toBeUndefined();
      expect(parentEndpoint.receivedRequests.find(request => request.command === 'setBreakpoints')).toBeUndefined();
    } finally {
      await coordinator.dispose();
      await parentClient.close();
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

  // Phase 8 round 3: structured errors for child-routed scopes/variables/source
  // when frameId / variablesReference / sourceReference cannot be resolved.
  // Replaces the previous plain-Error path that surfaced as
  // `controller_unavailable: Run dap-cli start` on the CLI.
  test('routeByFrameId throws frame_not_found with availableFrameIds when no child claims the id', async () => {
    const harness = await createMultiChildHarness([
      [{ id: 1, name: 'main' }],
    ]);
    try {
      await harness.coordinator.maybeIntercept('threads', {});
      const child = harness.childEndpoints[0]!;
      child.responders.set('stackTrace', () => ({ stackFrames: [{ id: 11, name: 'fn', line: 1, column: 1 }] }));
      await harness.coordinator.maybeIntercept('stackTrace', { threadId: 1 });

      let captured: unknown;
      try {
        await harness.coordinator.maybeIntercept('scopes', { frameId: 999 });
      } catch (error) {
        captured = error;
      }
      expect(captured).toBeInstanceOf(CliError);
      const cliError = captured as CliError;
      expect(cliError.code).toBe('frame_not_found');
      expect(cliError.category).toBe('session');
      const data = cliError.data as { requestedFrameId: number; availableFrameIds: Array<{ frameId: number }> };
      expect(data.requestedFrameId).toBe(999);
      expect(data.availableFrameIds.map(a => a.frameId)).toEqual([11]);
    } finally {
      await harness.cleanup();
    }
  });

  test('routeByVariableReference throws variable_reference_not_found with availableVariableReferences', async () => {
    const harness = await createMultiChildHarness([
      [{ id: 1, name: 'main' }],
    ]);
    try {
      await harness.coordinator.maybeIntercept('threads', {});
      const child = harness.childEndpoints[0]!;
      child.responders.set('stackTrace', () => ({ stackFrames: [{ id: 11, name: 'fn', line: 1, column: 1 }] }));
      child.responders.set('scopes', () => ({ scopes: [{ name: 'Locals', variablesReference: 50, expensive: false }] }));
      await harness.coordinator.maybeIntercept('stackTrace', { threadId: 1 });
      await harness.coordinator.maybeIntercept('scopes', { frameId: 11 });

      let captured: unknown;
      try {
        await harness.coordinator.maybeIntercept('variables', { variablesReference: 9999 });
      } catch (error) {
        captured = error;
      }
      expect(captured).toBeInstanceOf(CliError);
      const cliError = captured as CliError;
      expect(cliError.code).toBe('variable_reference_not_found');
      expect(cliError.category).toBe('session');
      const data = cliError.data as { requestedVariablesReference?: number; availableVariableReferences: Array<{ variablesReference: number }> };
      expect(data.requestedVariablesReference).toBe(9999);
      expect(data.availableVariableReferences.map(a => a.variablesReference)).toEqual([50]);
    } finally {
      await harness.cleanup();
    }
  });

  test('routeBySourceReference throws source_reference_not_found with availableSourceReferences', async () => {
    const harness = await createMultiChildHarness([
      [{ id: 1, name: 'main' }],
    ]);
    try {
      await harness.coordinator.maybeIntercept('threads', {});
      const child = harness.childEndpoints[0]!;
      child.responders.set('stackTrace', () => ({ stackFrames: [{ id: 11, name: 'fn', line: 1, column: 1, source: { name: 'eval', sourceReference: 42 } }] }));
      await harness.coordinator.maybeIntercept('stackTrace', { threadId: 1 });

      let captured: unknown;
      try {
        await harness.coordinator.maybeIntercept('source', { source: { sourceReference: 9999 } });
      } catch (error) {
        captured = error;
      }
      expect(captured).toBeInstanceOf(CliError);
      const cliError = captured as CliError;
      expect(cliError.code).toBe('source_reference_not_found');
      expect(cliError.category).toBe('session');
      const data = cliError.data as { requestedSourceReference: number; availableSourceReferences: Array<{ sourceReference: number }> };
      expect(data.requestedSourceReference).toBe(9999);
      expect(data.availableSourceReferences.map(a => a.sourceReference)).toEqual([42]);
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

  // Phase 8 round 4 (GAP-08-04-A): when a child adapter rejects a routed DAP
  // request (e.g. evaluate / setExpression / variables on a frame the adapter
  // claims it can't satisfy), the raw DAP error must propagate out of
  // `maybeIntercept` so that ControllerServer.routeDapRequest can wrap it via
  // toDapCliError into a structured `dap_request_failed` envelope. Previously
  // the wrap was missing on the intercept path and the CLI saw
  // `controller_unavailable: <DAP error message>` (same misleading shape as
  // GAP-08-04 but for the adapter-rejected case rather than the lookup-failed
  // case). The server-side wrap is exercised by the existing `failed-step-out`
  // integration test (errorContracts.test.ts); this test pins the contract
  // that `maybeIntercept` re-throws the error so the wrap can categorize it.
  test('child-rejected DAP requests re-throw raw error so server can wrap as dap_request_failed (GAP-08-04 round 4)', async () => {
    const harness = await createMultiChildHarness([
      [{ id: 1, name: 'main' }],
    ]);
    try {
      await harness.coordinator.maybeIntercept('threads', {});
      const child = harness.childEndpoints[0]!;
      child.responders.set('stackTrace', () => ({ stackFrames: [{ id: 11, name: 'fn', line: 1, column: 1 }] }));
      child.responders.set('scopes', () => ({ scopes: [{ name: 'Locals', variablesReference: 50, expensive: false }] }));
      // Adapter rejects the actual evaluate request with success:false (e.g.
      // user-code threw, ReferenceError on undefined symbol, etc.).
      child.failures.set('evaluate', 'simulated adapter evaluate failure');
      await harness.coordinator.maybeIntercept('stackTrace', { threadId: 1 });
      await harness.coordinator.maybeIntercept('scopes', { frameId: 11 });

      let captured: unknown;
      try {
        await harness.coordinator.maybeIntercept('evaluate', {
          frameId: 11,
          expression: 'thisIsCertainlyUndefined',
          context: 'repl',
        });
      } catch (error) {
        captured = error;
      }

      // The intercept layer rethrows raw — it is NOT a CliError.
      // (If it were a CliError, the server wrap would short-circuit and use
      // it as-is; either way `controller_unavailable` is wrong.)
      expect(captured).toBeInstanceOf(Error);
      expect(captured).not.toBeInstanceOf(CliError);
      // Whatever the message text, it must NOT be the misleading
      // `controller_unavailable` shape — the wrap-or-pass-through MUST
      // surface adapter context, not a "controller is down" hint.
      const message = (captured as Error).message;
      expect(message.toLowerCase()).not.toContain('controller is not available');
      expect(message.toLowerCase()).not.toContain('run `dap-cli start`');
    } finally {
      await harness.cleanup();
    }
  });
});

/**
 * Plan 15-01 (CHILD-VERIFY-01): renderer-side `output` events MUST reach the
 * parent's event cache annotated with `child_session_id`. analysis2.md saw a
 * pwa-chrome agent fail to observe any renderer logpoint output via
 * `dap-cli events --name <parent>`. The mirror path
 * (ChildSessionCoordinator.mirrorChildEvent) is the single chokepoint that
 * makes the observation possible — these tests pin it as a regression guard.
 */
describe('ChildSessionCoordinator output-event mirroring (CHILD-VERIFY-01)', () => {
  test('console-category output from a registered child appears in parent cache with child_session_id', async () => {
    const manager = await SessionManager.create({ dapCliHome });
    const parent = await manager.create({ name: 'pwa-parent', adapter: 'js-debug' });
    const parentEndpoint = new FakeAdapterEndpoint('parent');
    const parentClient = new DapClient(parentEndpoint);
    const childEndpoint = new FakeAdapterEndpoint('child');
    const parentEventCache = new DapEventCache();

    const coordinator = new ChildSessionCoordinator({
      parentSessionId: parent.id,
      parentName: parent.name,
      parentClient,
      adapterId: 'js-debug',
      ownedAdapter: { startedByDapCli: true, stderrTail: [] },
      sessionManager: manager,
      parentEventCache,
      openChildTransport: () => Promise.resolve(childEndpoint),
    });
    coordinator.attach();

    parentEndpoint.emitReverseRequest('startDebugging', {
      request: 'launch',
      configuration: { __pendingTargetId: 'tgt-renderer', type: 'pwa-chrome' },
    });
    await coordinator.awaitPendingChildren();
    await tick(2);

    // Discover the registered child id via the SessionManager — same path
    // production resolveRuntime / sessions --show-children uses.
    const children = manager.list({ includeChildren: true }).filter(s => s.parent_session_id === parent.id);
    expect(children).toHaveLength(1);
    const childId = children[0]!.id;

    // Synthesize the renderer logpoint output the analysis2.md agent
    // expected to see: a `console`-category output event.
    childEndpoint.emitEvent('output', { category: 'console', output: 'hello\n' });
    await tick(2);

    const snapshot = parentEventCache.recent({});
    const outputEvents = snapshot.events.filter(e => e.event === 'output');
    expect(outputEvents).toHaveLength(1);
    const mirrored = outputEvents[0] as { event: string; body?: Record<string, unknown> };
    expect(mirrored.body?.child_session_id).toBe(childId);
    // Mirror MUST preserve the original category and output payload — the
    // analysis2.md agent failure mode would have been silently dropping or
    // rewriting these fields.
    expect(mirrored.body?.category).toBe('console');
    expect(mirrored.body?.output).toBe('hello\n');

    await coordinator.dispose();
    await parentClient.close();
  });

  test('parent-direct cache append does NOT receive child_session_id annotation (negative guard)', async () => {
    // Pins the mirror as a child-only concern: events appended to the parent
    // cache through any non-mirror path (in production: the parent client's
    // own onEvent → recorder pump in server.ts) keep their body untouched.
    // Without this guard, a future change that moved annotation into
    // DapEventCache.append() would silently inject child_session_id into
    // genuine parent events.
    const manager = await SessionManager.create({ dapCliHome });
    const parent = await manager.create({ name: 'pwa-parent', adapter: 'js-debug' });
    const parentEventCache = new DapEventCache();

    const parentEvent: DapEventMessage = {
      seq: 1,
      type: 'event',
      event: 'output',
      body: { category: 'stdout', output: 'parent-direct\n' },
    };
    parentEventCache.append(parent.id, parentEvent);

    const snapshot = parentEventCache.recent({});
    expect(snapshot.events).toHaveLength(1);
    const stored = snapshot.events[0] as { body?: Record<string, unknown> };
    expect(stored.body).toEqual({ category: 'stdout', output: 'parent-direct\n' });
    expect(stored.body && 'child_session_id' in stored.body).toBe(false);
  });
});

/**
 * Phase 18 (PAUSED-UNION-01) — combineChildPausedStates is the helper that
 * composes the parent SessionRecord's paused-state from per-child
 * snapshots. Pinned in isolation here so the union-vs-overwrite contract
 * doesn't have to be re-derived from the integration paths.
 */
describe('combineChildPausedStates (PAUSED-UNION-01)', () => {
  test('all snapshots lifecycleEnded → paused: false', () => {
    const result = combineChildPausedStates([
      {
        stoppedThreadIds: new Set([1, 2]),
        allThreadsStopped: false,
        knownThreadIds: new Set([1, 2]),
        lifecycleEnded: true,
        lastStoppedReason: 'breakpoint',
      },
      {
        stoppedThreadIds: new Set(),
        allThreadsStopped: false,
        knownThreadIds: new Set([3]),
        lifecycleEnded: true,
        lastStoppedReason: undefined,
      },
    ]);
    expect(result).toEqual({ paused: false });
  });

  test('union of stoppedThreadIds across non-terminated children', () => {
    const result = combineChildPausedStates([
      {
        stoppedThreadIds: new Set([1, 2]),
        allThreadsStopped: false,
        knownThreadIds: new Set([1, 2]),
        lifecycleEnded: false,
        lastStoppedReason: 'breakpoint',
      },
      {
        stoppedThreadIds: new Set([3]),
        allThreadsStopped: false,
        knownThreadIds: new Set([3]),
        lifecycleEnded: false,
        lastStoppedReason: 'step',
      },
    ]);
    expect(result.paused).toBe(true);
    expect(result.paused === true && [...result.stoppedThreadIds].sort((a, b) => a - b)).toEqual([1, 2, 3]);
  });

  test('allThreadsStopped expands to knownThreadIds at union time', () => {
    const result = combineChildPausedStates([
      {
        stoppedThreadIds: new Set(),
        allThreadsStopped: true,
        knownThreadIds: new Set([1, 2, 3]),
        lifecycleEnded: false,
        lastStoppedReason: 'pause',
      },
    ]);
    expect(result.paused).toBe(true);
    expect(result.paused === true && [...result.stoppedThreadIds].sort((a, b) => a - b)).toEqual([1, 2, 3]);
    expect(result.paused === true && result.stoppedReason).toBe('pause');
  });

  test('lastStoppedReason is picked from a child currently stopped, not one already continued', () => {
    const result = combineChildPausedStates([
      {
        // Continued — its lastStoppedReason should NOT be picked.
        stoppedThreadIds: new Set(),
        allThreadsStopped: false,
        knownThreadIds: new Set([1]),
        lifecycleEnded: false,
        lastStoppedReason: 'step',
      },
      {
        // Currently stopped — its reason wins.
        stoppedThreadIds: new Set([2]),
        allThreadsStopped: false,
        knownThreadIds: new Set([2]),
        lifecycleEnded: false,
        lastStoppedReason: 'breakpoint',
      },
    ]);
    expect(result.paused).toBe(true);
    expect(result.paused === true && result.stoppedReason).toBe('breakpoint');
  });

  test('no stopped children but some live → paused: false', () => {
    const result = combineChildPausedStates([
      {
        stoppedThreadIds: new Set(),
        allThreadsStopped: false,
        knownThreadIds: new Set([1]),
        lifecycleEnded: false,
        lastStoppedReason: undefined,
      },
    ]);
    expect(result).toEqual({ paused: false });
  });
});

/**
 * Phase 18 (PAUSED-UNION-01) — parent.status.paused is the UNION of every
 * non-terminated child's paused state. The pre-Phase-18 mirror was
 * "last child event wins", which let a sibling's `terminated` clobber a
 * real `stopped` (S-02 root cause: bootloader child terminates after the
 * ext-host child stops; parent flips back to paused=false). These tests
 * pin the union behaviour end-to-end through ChildSessionCoordinator.
 */
describe('ChildSessionCoordinator paused-state union (PAUSED-UNION-01)', () => {
  async function bringUpTwoChildren(): Promise<{
    manager: SessionManager;
    parentId: string;
    childA: FakeAdapterEndpoint;
    childB: FakeAdapterEndpoint;
    coordinator: ChildSessionCoordinator;
    parentClient: DapClient;
  }> {
    const manager = await SessionManager.create({ dapCliHome });
    const parent = await manager.create({ name: 'pwa-multi', adapter: 'js-debug' });
    const parentEndpoint = new FakeAdapterEndpoint('parent');
    const parentClient = new DapClient(parentEndpoint);
    const childA = new FakeAdapterEndpoint('child-A');
    const childB = new FakeAdapterEndpoint('child-B');
    const endpoints = [childA, childB];
    let next = 0;
    const coordinator = new ChildSessionCoordinator({
      parentSessionId: parent.id,
      parentName: parent.name,
      parentClient,
      adapterId: 'js-debug',
      ownedAdapter: { startedByDapCli: true, stderrTail: [] },
      sessionManager: manager,
      parentEventCache: new DapEventCache(),
      openChildTransport: () => {
        const endpoint = endpoints[next];
        next += 1;
        if (endpoint === undefined) {
          throw new Error('no endpoint');
        }
        return Promise.resolve(endpoint);
      },
    });
    coordinator.attach();
    parentEndpoint.emitReverseRequest('startDebugging', {
      request: 'launch',
      configuration: { __pendingTargetId: 'tgt-A', type: 'pwa-node' },
    });
    parentEndpoint.emitReverseRequest('startDebugging', {
      request: 'launch',
      configuration: { __pendingTargetId: 'tgt-B', type: 'pwa-node' },
    });
    await coordinator.awaitPendingChildren();
    await tick(2);
    return { manager, parentId: parent.id, childA, childB, coordinator, parentClient };
  }

  test('two children stopped on different threads → parent.stoppedThreadIds is the union', async () => {
    const { manager, parentId, childA, childB, coordinator, parentClient } = await bringUpTwoChildren();
    try {
      childA.emitEvent('stopped', { reason: 'breakpoint', threadId: 5 });
      await tick(4);
      childB.emitEvent('stopped', { reason: 'step', threadId: 10 });
      await tick(4);

      const status = manager.status(parentId);
      expect(status.paused).toBe(true);
      expect([...(status.stoppedThreadIds ?? [])].sort((a, b) => a - b)).toEqual([5, 10]);
    } finally {
      await coordinator.dispose();
      await parentClient.close();
    }
  });

  test('child stop survives a sibling terminated event (S-02 regression)', async () => {
    const { manager, parentId, childA, childB, coordinator, parentClient } = await bringUpTwoChildren();
    try {
      // Child B is the real target; child A is the bootloader analog that
      // terminates after the real child stops.
      childB.emitEvent('stopped', { reason: 'breakpoint', threadId: 0 });
      await tick(4);
      let status = manager.status(parentId);
      expect(status.paused).toBe(true);
      expect([...(status.stoppedThreadIds ?? [])]).toEqual([0]);

      childA.emitEvent('terminated');
      await tick(4);
      status = manager.status(parentId);
      // The Phase 18 fix: a sibling's terminated MUST NOT clobber the
      // parent's paused state.
      expect(status.paused).toBe(true);
      expect([...(status.stoppedThreadIds ?? [])]).toEqual([0]);

      childB.emitEvent('continued', { threadId: 0, allThreadsContinued: true });
      await tick(4);
      status = manager.status(parentId);
      expect(status.paused).toBe(false);
    } finally {
      await coordinator.dispose();
      await parentClient.close();
    }
  });

  test('single-thread continue does not flip paused while another thread on the same child is still stopped', async () => {
    const { manager, parentId, childA, coordinator, parentClient } = await bringUpTwoChildren();
    try {
      childA.emitEvent('stopped', { reason: 'breakpoint', threadId: 5 });
      await tick(4);
      childA.emitEvent('stopped', { reason: 'breakpoint', threadId: 10 });
      await tick(4);
      childA.emitEvent('continued', { threadId: 5 });
      await tick(4);

      const status = manager.status(parentId);
      expect(status.paused).toBe(true);
      expect([...(status.stoppedThreadIds ?? [])]).toEqual([10]);
    } finally {
      await coordinator.dispose();
      await parentClient.close();
    }
  });
});

/**
 * Phase 18 (PAUSED-ROUTE-01) — findChildOwningThread prefers the child
 * actually paused on the requested thread, not just any child whose cache
 * claims the id. The pre-Phase-18 lookup picked the first cache hit, which
 * routed `stack --thread-id 0` to a dead bootloader after it terminated
 * with thread 0 in its knownThreadIds (the S-02 routing failure mode).
 */
describe('ChildSessionCoordinator paused-first routing (PAUSED-ROUTE-01)', () => {
  test('routeByThreadId prefers the child actually stopped on the thread', async () => {
    const manager = await SessionManager.create({ dapCliHome });
    const parent = await manager.create({ name: 'pwa-route', adapter: 'js-debug' });
    const parentEndpoint = new FakeAdapterEndpoint('parent');
    const parentClient = new DapClient(parentEndpoint);
    const childA = new FakeAdapterEndpoint('child-A');
    const childB = new FakeAdapterEndpoint('child-B');
    // Both children claim thread 0; only child B will emit `stopped` on it.
    childA.responders.set('threads', () => ({ threads: [{ id: 0, name: 'main' }] }));
    childB.responders.set('threads', () => ({ threads: [{ id: 0, name: 'main' }] }));
    childA.failures.set('stackTrace', 'Thread is not paused');
    childB.responders.set('stackTrace', () => ({
      stackFrames: [{ id: 200, name: 'someFn', line: 42, column: 1 }],
      totalFrames: 1,
    }));
    const endpoints = [childA, childB];
    let next = 0;
    const coordinator = new ChildSessionCoordinator({
      parentSessionId: parent.id,
      parentName: parent.name,
      parentClient,
      adapterId: 'js-debug',
      ownedAdapter: { startedByDapCli: true, stderrTail: [] },
      sessionManager: manager,
      parentEventCache: new DapEventCache(),
      openChildTransport: () => {
        const endpoint = endpoints[next];
        next += 1;
        if (endpoint === undefined) {
          throw new Error('no endpoint');
        }
        return Promise.resolve(endpoint);
      },
    });
    coordinator.attach();
    parentEndpoint.emitReverseRequest('startDebugging', {
      request: 'launch',
      configuration: { __pendingTargetId: 'tgt-A', type: 'pwa-node' },
    });
    parentEndpoint.emitReverseRequest('startDebugging', {
      request: 'launch',
      configuration: { __pendingTargetId: 'tgt-B', type: 'pwa-node' },
    });
    await coordinator.awaitPendingChildren();
    await tick(2);

    try {
      // Prime knownThreadIds on both children via aggregateThreads so pass 1
      // (paused-first) is the only thing distinguishing them. Without this,
      // routing would resolve correctly via the cold-path threads fan-out
      // anyway, but pinning pass 1 is the contract this test exists for.
      await coordinator.maybeIntercept('threads', {});
      childB.emitEvent('stopped', { reason: 'breakpoint', threadId: 0 });
      await tick(4);

      const result = await coordinator.maybeIntercept('stackTrace', { threadId: 0 });
      expect(result).toBeDefined();
      const frames = (result!.value as { stackFrames: Array<{ id: number }> }).stackFrames;
      expect(frames).toHaveLength(1);
      expect(frames[0]!.id).toBe(200);
      // And confirm child A was NOT consulted for stackTrace.
      expect(childA.receivedRequests.find(r => r.command === 'stackTrace')).toBeUndefined();
    } finally {
      await coordinator.dispose();
      await parentClient.close();
    }
  });

  test('aggregateThreads excludes terminated child threads', async () => {
    const manager = await SessionManager.create({ dapCliHome });
    const parent = await manager.create({ name: 'pwa-agg', adapter: 'js-debug' });
    const parentEndpoint = new FakeAdapterEndpoint('parent');
    const parentClient = new DapClient(parentEndpoint);
    const childA = new FakeAdapterEndpoint('child-A');
    const childB = new FakeAdapterEndpoint('child-B');
    childA.responders.set('threads', () => ({ threads: [{ id: 1, name: 'bootloader' }] }));
    childB.responders.set('threads', () => ({ threads: [{ id: 2, name: 'main' }] }));
    const endpoints = [childA, childB];
    let next = 0;
    const coordinator = new ChildSessionCoordinator({
      parentSessionId: parent.id,
      parentName: parent.name,
      parentClient,
      adapterId: 'js-debug',
      ownedAdapter: { startedByDapCli: true, stderrTail: [] },
      sessionManager: manager,
      parentEventCache: new DapEventCache(),
      openChildTransport: () => {
        const endpoint = endpoints[next];
        next += 1;
        if (endpoint === undefined) {
          throw new Error('no endpoint');
        }
        return Promise.resolve(endpoint);
      },
    });
    coordinator.attach();
    parentEndpoint.emitReverseRequest('startDebugging', {
      request: 'launch',
      configuration: { __pendingTargetId: 'tgt-A', type: 'pwa-node' },
    });
    parentEndpoint.emitReverseRequest('startDebugging', {
      request: 'launch',
      configuration: { __pendingTargetId: 'tgt-B', type: 'pwa-node' },
    });
    await coordinator.awaitPendingChildren();
    await tick(2);

    try {
      // Both children alive: aggregateThreads sees both.
      let result = await coordinator.maybeIntercept('threads', {});
      let threads = (result!.value as { threads: Array<{ id: number }> }).threads;
      expect(threads.map(t => t.id).sort((a, b) => a - b)).toEqual([1, 2]);

      childA.emitEvent('terminated');
      await tick(2);
      result = await coordinator.maybeIntercept('threads', {});
      threads = (result!.value as { threads: Array<{ id: number }> }).threads;
      expect(threads.map(t => t.id)).toEqual([2]);
    } finally {
      await coordinator.dispose();
      await parentClient.close();
    }
  });
});

/**
 * Phase 17 S-08 Bug 1 (17-S08-FINDINGS.md): if a js-debug child is stuck
 * mid-handshake (e.g. attach to an Electron utility process where
 * `configurationDone` never returns), the previous unbounded
 * `Promise.allSettled([...].readyPromise)` left `setBreakpoints` hanging
 * past the 5s controller IPC budget and the agent saw a misleading
 * `controller_request_timeout`. The bounded variant surfaces a
 * `child_readiness_timeout` warning per still-pending child and proceeds.
 */
describe('ChildSessionCoordinator awaitChildrenReadyBounded (S-08 Bug 1)', () => {
  test('routeSetBreakpointsThroughParent surfaces child_readiness_timeout warning when child handshake stalls', async () => {
    const manager = await SessionManager.create({ dapCliHome });
    const parent = await manager.create({ name: 'pwa-stuck', adapter: 'js-debug' });
    const parentEndpoint = new FakeAdapterEndpoint('parent');
    const parentClient = new DapClient(parentEndpoint);
    const stuckChild = new FakeAdapterEndpoint('stuck-child');
    // Black-hole `configurationDone` so the child's readyPromise never settles.
    stuckChild.silent.add('configurationDone');
    parentEndpoint.responders.set('setBreakpoints', () => ({ breakpoints: [{ id: 1, verified: true, line: 9 }] }));

    const coordinator = new ChildSessionCoordinator({
      parentSessionId: parent.id,
      parentName: parent.name,
      parentClient,
      adapterId: 'js-debug',
      ownedAdapter: { startedByDapCli: true, stderrTail: [] },
      sessionManager: manager,
      parentEventCache: new DapEventCache(),
      openChildTransport: () => Promise.resolve(stuckChild),
      setBreakpointsVerificationTimeoutMs: 50,
      awaitChildrenReadyTimeoutMs: 50,
    });
    coordinator.attach();

    try {
      parentEndpoint.emitReverseRequest('startDebugging', {
        request: 'launch',
        configuration: { __pendingTargetId: 'tgt-stuck', type: 'pwa-node' },
      });
      await waitForChildRegistration(coordinator);

      const intercepted = await coordinator.maybeIntercept('setBreakpoints', { source: { path: '/repo/server.js' }, breakpoints: [{ line: 9 }], lines: [9] });
      const result = intercepted!.value as { breakpoints: Array<unknown>; warnings?: Array<{ sessionId: string; message: string }> };
      expect(result.breakpoints).toBeDefined();
      expect(result.warnings).toBeDefined();
      expect(result.warnings!.some(w => w.message === 'child_readiness_timeout')).toBe(true);
    } finally {
      // Unblock the stalled handshake so dispose() can drain bring-ups.
      await stuckChild.close();
      await coordinator.dispose();
      await parentClient.close();
    }
  });

  test('fanOutSetBreakpoints surfaces child_readiness_timeout warning for non-js-debug stalled child', async () => {
    const manager = await SessionManager.create({ dapCliHome });
    const parent = await manager.create({ name: 'compound-stuck', adapter: 'compound' });
    const parentEndpoint = new FakeAdapterEndpoint('parent');
    const parentClient = new DapClient(parentEndpoint);
    const stuckChild = new FakeAdapterEndpoint('stuck-child');
    stuckChild.silent.add('configurationDone');

    const coordinator = new ChildSessionCoordinator({
      parentSessionId: parent.id,
      parentName: parent.name,
      parentClient,
      adapterId: 'compound',
      ownedAdapter: { startedByDapCli: true, stderrTail: [] },
      sessionManager: manager,
      parentEventCache: new DapEventCache(),
      openChildTransport: () => Promise.resolve(stuckChild),
      awaitChildrenReadyTimeoutMs: 50,
    });
    coordinator.attach();

    try {
      parentEndpoint.emitReverseRequest('startDebugging', {
        request: 'launch',
        configuration: { __pendingTargetId: 'tgt-fan-stuck', type: 'node' },
      });
      await waitForChildRegistration(coordinator);

      const intercepted = await coordinator.maybeIntercept('setBreakpoints', { source: { path: '/repo/server.js' }, breakpoints: [{ line: 9 }], lines: [9] });
      const result = intercepted!.value as { breakpoints: Array<unknown>; warnings?: Array<{ sessionId: string; message: string }> };
      expect(result.warnings).toBeDefined();
      expect(result.warnings!.some(w => w.message === 'child_readiness_timeout')).toBe(true);
    } finally {
      await stuckChild.close();
      await coordinator.dispose();
      await parentClient.close();
    }
  });
});

/**
 * Regression: a js-debug pwa-chrome page session attaching to a Code-OSS
 * Electron renderer acks `initialize`/`configurationDone` and emits
 * `initialized`, but then auto-attaches the renderer's many
 * `waitForDebuggerOnStart` web workers and wedges before answering the page
 * session's `attach`. The previous lifecycle awaited the launch/attach
 * response after `configurationDone`, so the child sat in `attaching` for the
 * full 30s child request timeout and then flipped to `failed` with
 * `DAP request timed out: attach` — breakpoints never bound. Readiness must be
 * gated on `configurationDone`, not on the trailing launch/attach response.
 */
describe('ChildSessionCoordinator readiness does not gate on launch/attach response', () => {
  test('child reaches running once configurationDone is acked even if the attach response never arrives', async () => {
    const manager = await SessionManager.create({ dapCliHome });
    const parent = await manager.create({ name: 'pwa-chrome', adapter: 'js-debug' });
    const parentEndpoint = new FakeAdapterEndpoint('parent');
    const parentClient = new DapClient(parentEndpoint);
    const pageChild = new FakeAdapterEndpoint('page-child');
    // Model the wedged js-debug page session: it answers `initialize` (and so
    // emits `initialized`) and `configurationDone`, but never answers `attach`.
    // A short child request timeout makes the would-be regression surface in
    // ~100ms instead of after the 30s default.
    pageChild.silent.add('attach');
    const parentEventCache = new DapEventCache();

    const coordinator = new ChildSessionCoordinator({
      parentSessionId: parent.id,
      parentName: parent.name,
      parentClient,
      adapterId: 'js-debug',
      ownedAdapter: { startedByDapCli: true, stderrTail: [] },
      sessionManager: manager,
      parentEventCache,
      openChildTransport: () => Promise.resolve(pageChild),
      createChildClient: transport => new DapClient(transport, { requestTimeoutMs: 100 }),
    });
    coordinator.attach();

    try {
      parentEndpoint.emitReverseRequest('startDebugging', {
        request: 'attach',
        configuration: { __pendingTargetId: 'tgt-page', type: 'pwa-chrome' },
      });
      await coordinator.awaitChildrenReady();

      const childId = coordinator.listChildSessionIds()[0];
      expect(childId).toBeDefined();
      // configurationDone was acked → child is usable and must be `running`,
      // NOT `failed` from a timed-out attach response.
      expect(manager.status(childId).lifecycle).toBe('running');
      expect(pageChild.receivedRequests.some(r => r.command === 'configurationDone')).toBe(true);

      // The trailing attach timeout surfaces as a non-fatal warning on the
      // parent (not as a child failure). Wait past the 100ms child timeout.
      await new Promise<void>(resolve => setTimeout(resolve, 160));
      const outputs = parentEventCache.recent().events.filter(e => e.event === 'output');
      expect(outputs.some(e => {
        const body = e.body as { output?: string; child_session_id?: string } | undefined;
        if (body === undefined || body.child_session_id !== childId) {
          return false;
        }
        return (body.output ?? '').includes('attach response not received');
      })).toBe(true);
      // The child stays `running` despite the trailing attach timeout.
      expect(manager.status(childId).lifecycle).toBe('running');
    } finally {
      await pageChild.close();
      await coordinator.dispose();
      await parentClient.close();
    }
  });
});
