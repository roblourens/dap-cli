import { describe, expect, test, vi } from 'vitest';
import { createHelperProcessDetector, helperProcessWarningEventName } from '../../src/sessions/helperProcessDetection.js';
import type { DapEventMessage } from '../../src/protocol/dapMessages.js';

interface FakeEventCache {
  append: ReturnType<typeof vi.fn>;
}

function makeEventCache(): FakeEventCache {
  return { append: vi.fn() };
}

function processEvent(systemProcessId: unknown): DapEventMessage {
  return { type: 'event', seq: 1, event: 'process', body: { systemProcessId } as unknown as Record<string, unknown> };
}

async function flushMicrotasks(): Promise<void> {
  // The detector's lookupPpid call is fire-and-forget; we need a few
  // microtask flushes for `then(...)` chains to settle.
  for (let i = 0; i < 5; i += 1) {
    await Promise.resolve();
  }
}

describe('createHelperProcessDetector', () => {
  test('emits helper_process_detected when ppid matches adapter pid', async () => {
    const eventCache = makeEventCache();
    const lookupPpid = vi.fn().mockResolvedValue(4242);
    const detector = createHelperProcessDetector({
      sessionId: 'sess_a',
      adapterId: 'js-debug',
      adapterPid: 4242,
      mode: 'attach',
      eventCache,
      lookupPpid,
    });

    detector.handleEvent(processEvent(99999));
    await flushMicrotasks();

    expect(lookupPpid).toHaveBeenCalledExactlyOnceWith(99999);
    expect(eventCache.append).toHaveBeenCalledTimes(1);
    const [sessionId, event] = eventCache.append.mock.calls[0]!;
    expect(sessionId).toBe('sess_a');
    expect(event).toEqual({
      type: 'event',
      seq: -1,
      event: helperProcessWarningEventName,
      body: {
        code: 'helper_process_detected',
        helperPid: 99999,
        adapterPid: 4242,
        sessionId: 'sess_a',
        hint: expect.stringContaining('helper process'),
      },
    });
  });

  test('does not emit when ppid differs', async () => {
    const eventCache = makeEventCache();
    const detector = createHelperProcessDetector({
      sessionId: 'sess_b',
      adapterId: 'js-debug',
      adapterPid: 4242,
      mode: 'attach',
      eventCache,
      lookupPpid: vi.fn().mockResolvedValue(9999),
    });

    detector.handleEvent(processEvent(99999));
    await flushMicrotasks();

    expect(eventCache.append).not.toHaveBeenCalled();
  });

  test('short-circuits on launch mode', async () => {
    const eventCache = makeEventCache();
    const lookupPpid = vi.fn().mockResolvedValue(4242);
    const detector = createHelperProcessDetector({
      sessionId: 'sess_c',
      adapterId: 'js-debug',
      adapterPid: 4242,
      mode: 'launch',
      eventCache,
      lookupPpid,
    });

    detector.handleEvent(processEvent(99999));
    await flushMicrotasks();

    expect(lookupPpid).not.toHaveBeenCalled();
    expect(eventCache.append).not.toHaveBeenCalled();
  });

  test('short-circuits on non-js-debug adapter', async () => {
    const eventCache = makeEventCache();
    const lookupPpid = vi.fn().mockResolvedValue(4242);
    const detector = createHelperProcessDetector({
      sessionId: 'sess_d',
      adapterId: 'debugpy',
      adapterPid: 4242,
      mode: 'attach',
      eventCache,
      lookupPpid,
    });

    detector.handleEvent(processEvent(99999));
    await flushMicrotasks();

    expect(lookupPpid).not.toHaveBeenCalled();
    expect(eventCache.append).not.toHaveBeenCalled();
  });

  test('short-circuits when adapterPid is undefined', async () => {
    const eventCache = makeEventCache();
    const lookupPpid = vi.fn().mockResolvedValue(4242);
    const detector = createHelperProcessDetector({
      sessionId: 'sess_e',
      adapterId: 'js-debug',
      adapterPid: undefined,
      mode: 'attach',
      eventCache,
      lookupPpid,
    });

    detector.handleEvent(processEvent(99999));
    await flushMicrotasks();

    expect(lookupPpid).not.toHaveBeenCalled();
    expect(eventCache.append).not.toHaveBeenCalled();
  });

  test('short-circuits on non-process event', async () => {
    const eventCache = makeEventCache();
    const lookupPpid = vi.fn().mockResolvedValue(4242);
    const detector = createHelperProcessDetector({
      sessionId: 'sess_f',
      adapterId: 'js-debug',
      adapterPid: 4242,
      mode: 'attach',
      eventCache,
      lookupPpid,
    });

    detector.handleEvent({ type: 'event', seq: 1, event: 'stopped', body: { reason: 'breakpoint' } });
    await flushMicrotasks();

    expect(lookupPpid).not.toHaveBeenCalled();
  });

  test('short-circuits on missing/invalid systemProcessId', async () => {
    const eventCache = makeEventCache();
    const lookupPpid = vi.fn().mockResolvedValue(4242);
    const detector = createHelperProcessDetector({
      sessionId: 'sess_g',
      adapterId: 'js-debug',
      adapterPid: 4242,
      mode: 'attach',
      eventCache,
      lookupPpid,
    });

    detector.handleEvent({ type: 'event', seq: 1, event: 'process', body: { name: 'no-pid' } });
    detector.handleEvent(processEvent('not-a-number'));
    detector.handleEvent(processEvent(0));
    detector.handleEvent(processEvent(-5));
    await flushMicrotasks();

    expect(lookupPpid).not.toHaveBeenCalled();
    expect(eventCache.append).not.toHaveBeenCalled();
  });

  test('already-fired guard: only one append per (session, helperPid)', async () => {
    const eventCache = makeEventCache();
    const lookupPpid = vi.fn().mockResolvedValue(4242);
    const detector = createHelperProcessDetector({
      sessionId: 'sess_h',
      adapterId: 'js-debug',
      adapterPid: 4242,
      mode: 'attach',
      eventCache,
      lookupPpid,
    });

    detector.handleEvent(processEvent(99999));
    detector.handleEvent(processEvent(99999));
    await flushMicrotasks();

    expect(lookupPpid).toHaveBeenCalledTimes(1);
    expect(eventCache.append).toHaveBeenCalledTimes(1);
  });

  test('lookupPpid rejection produces no append and no unhandled rejection', async () => {
    const eventCache = makeEventCache();
    const detector = createHelperProcessDetector({
      sessionId: 'sess_i',
      adapterId: 'js-debug',
      adapterPid: 4242,
      mode: 'attach',
      eventCache,
      lookupPpid: vi.fn().mockRejectedValue(new Error('boom')),
    });

    detector.handleEvent(processEvent(99999));
    await flushMicrotasks();

    expect(eventCache.append).not.toHaveBeenCalled();
  });

  test('lookupPpid resolving undefined produces no append', async () => {
    const eventCache = makeEventCache();
    const detector = createHelperProcessDetector({
      sessionId: 'sess_j',
      adapterId: 'js-debug',
      adapterPid: 4242,
      mode: 'attach',
      eventCache,
      lookupPpid: vi.fn().mockResolvedValue(undefined),
    });

    detector.handleEvent(processEvent(99999));
    await flushMicrotasks();

    expect(eventCache.append).not.toHaveBeenCalled();
  });

  test('dispose() prevents subsequent appends from in-flight lookups', async () => {
    const eventCache = makeEventCache();
    let resolvePpid: (value: number) => void = () => undefined;
    const lookupPpid = vi.fn(() => new Promise<number>(resolve => {
      resolvePpid = resolve;
    }));
    const detector = createHelperProcessDetector({
      sessionId: 'sess_k',
      adapterId: 'js-debug',
      adapterPid: 4242,
      mode: 'attach',
      eventCache,
      lookupPpid,
    });

    detector.handleEvent(processEvent(99999));
    detector.dispose();
    resolvePpid(4242);
    await flushMicrotasks();

    expect(eventCache.append).not.toHaveBeenCalled();
  });
});
