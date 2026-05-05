import { describe, expect, test } from 'vitest';
import { DapEventCache } from '../../src/protocol/eventCache.js';

describe('DapEventCache', () => {
  test('assigns monotonically increasing cursors', () => {
    const cache = new DapEventCache(3);

    const first = cache.append('session-1', { seq: 10, type: 'event', event: 'initialized' });
    const second = cache.append('session-1', { seq: 11, type: 'event', event: 'stopped' });

    expect(first.cursor).toBe(1);
    expect(second.cursor).toBe(2);
    expect(cache.recent().cursor).toBe(2);
  });

  test('evicts events beyond capacity and reports dropped count', () => {
    const cache = new DapEventCache(2);

    cache.append('session-1', { seq: 1, type: 'event', event: 'initialized' });
    cache.append('session-1', { seq: 2, type: 'event', event: 'stopped' });
    cache.append('session-1', { seq: 3, type: 'event', event: 'continued' });

    const snapshot = cache.recent();

    expect(snapshot.events.map(event => event.cursor)).toEqual([2, 3]);
    expect(snapshot.droppedBeforeCursor).toBe(1);
    // Two-ring backwards-compat (plan 05-18): single-int constructor sets
    // highPriorityCapacity=N and lowPriorityCapacity=max(10, ceil(N/4)).
    // capacity reports the merged total.
    expect(snapshot.capacity).toBe(2 + 10);
    expect(snapshot.capacityByPriority).toEqual({ high: 2, low: 10 });
  });

  test('filters immediate polling results after a cursor', () => {
    const cache = new DapEventCache(5);

    cache.append('session-1', { seq: 1, type: 'event', event: 'initialized' });
    cache.append('session-1', { seq: 2, type: 'event', event: 'stopped' });
    cache.append('session-1', { seq: 3, type: 'event', event: 'output' });

    const snapshot = cache.recent({ afterCursor: 1 });

    expect(snapshot.events.map(event => event.event)).toEqual(['stopped', 'output']);
    expect(snapshot.cursor).toBe(3);
  });

  test('limits immediate polling results without waiting for future events', () => {
    const cache = new DapEventCache(5);

    cache.append('session-1', { seq: 1, type: 'event', event: 'initialized' });
    cache.append('session-1', { seq: 2, type: 'event', event: 'stopped' });
    cache.append('session-1', { seq: 3, type: 'event', event: 'thread' });

    const snapshot = cache.recent({ limit: 2 });

    expect(snapshot.events.map(event => event.event)).toEqual(['stopped', 'thread']);
    expect(snapshot.cursor).toBe(3);
  });

  test('recent() returns truncatedToCapacity (merged) when limit exceeds capacity', () => {
    const cache = new DapEventCache(5);
    for (let i = 1; i <= 10; i += 1) {
      cache.append('session-1', { seq: i, type: 'event', event: 'output' });
    }

    const snapshot = cache.recent({ limit: 50 });

    // Merged capacity = high(5) + low(max(10, ceil(5/4))=10) = 15.
    expect(snapshot.truncatedToCapacity).toBe(15);
    // 'output' is high-priority by default; high ring capped at 5.
    expect(snapshot.events.length).toBe(5);
    expect(snapshot.capacity).toBe(15);
  });

  test('recent() omits truncatedToCapacity when limit is within capacity', () => {
    const cache = new DapEventCache(5);
    for (let i = 1; i <= 10; i += 1) {
      cache.append('session-1', { seq: i, type: 'event', event: 'output' });
    }

    const snapshot = cache.recent({ limit: 3 });

    expect(snapshot.truncatedToCapacity).toBeUndefined();
    expect(snapshot.events.length).toBe(3);
  });

  test('captures event metadata and summaries', () => {
    const cache = new DapEventCache();
    const received = cache.append('session-2', { seq: 20, type: 'event', event: 'output', body: { category: 'stdout' } }, new Date('2026-05-02T00:00:00.000Z'));

    expect(received).toEqual({
      cursor: 1,
      receivedAt: '2026-05-02T00:00:00.000Z',
      sessionId: 'session-2',
      dapSeq: 20,
      event: 'output',
      body: { category: 'stdout' },
      summary: 'output event seq=20',
    });
  });
});

// Plan 05-18 (gap H-2): two-ring priority segregation prevents loadedSource
// spam from evicting critical events.
describe('DapEventCache two-ring priority segregation (plan 05-18, gap H-2)', () => {
  test('flooding 1000 loadedSource events does not evict any high-priority event', () => {
    const cache = new DapEventCache({ highPriorityCapacity: 200, lowPriorityCapacity: 50 });

    cache.append('s', { seq: 1, type: 'event', event: 'stopped', body: { reason: 'entry', threadId: 1 } });
    cache.append('s', { seq: 2, type: 'event', event: 'thread', body: { reason: 'started', threadId: 1 } });

    for (let i = 3; i <= 1002; i += 1) {
      cache.append('s', { seq: i, type: 'event', event: 'loadedSource' });
    }

    const snapshot = cache.recent({ limit: 5000 });
    const stopped = snapshot.events.find(e => e.event === 'stopped');
    const thread = snapshot.events.find(e => e.event === 'thread');

    expect(stopped).toBeDefined();
    expect(thread).toBeDefined();
    // Low ring capped at 50 — only 50 of the 1000 loadedSource events survive.
    const loadedSourceEvents = snapshot.events.filter(e => e.event === 'loadedSource');
    expect(loadedSourceEvents.length).toBe(50);
  });

  test('treats stopped/thread/output/terminated/breakpoint/startDebugging as high priority by default', () => {
    const cache = new DapEventCache({ highPriorityCapacity: 20, lowPriorityCapacity: 2 });

    const highNames = ['stopped', 'thread', 'output', 'terminated', 'breakpoint', 'startDebugging', 'continued', 'initialized', 'capabilities', 'exited', 'module', 'process'];
    let seq = 1;
    for (const name of highNames) {
      cache.append('s', { seq: seq++, type: 'event', event: name });
    }
    // Pad low ring beyond its capacity to confirm high-priority events are unaffected.
    for (let i = 0; i < 20; i += 1) {
      cache.append('s', { seq: seq++, type: 'event', event: 'loadedSource' });
    }

    const snapshot = cache.recent({ limit: 1000 });
    for (const name of highNames) {
      expect(snapshot.events.some(e => e.event === name), `expected high-priority event '${name}' to survive`).toBe(true);
    }
  });

  test('merged recent() returns events in cursor order regardless of which ring they came from', () => {
    const cache = new DapEventCache({ highPriorityCapacity: 100, lowPriorityCapacity: 100 });

    cache.append('s', { seq: 1, type: 'event', event: 'stopped' });        // cursor 1, high
    cache.append('s', { seq: 2, type: 'event', event: 'loadedSource' });   // cursor 2, low
    cache.append('s', { seq: 3, type: 'event', event: 'thread' });         // cursor 3, high
    cache.append('s', { seq: 4, type: 'event', event: 'loadedSource' });   // cursor 4, low
    cache.append('s', { seq: 5, type: 'event', event: 'output' });         // cursor 5, high

    const snapshot = cache.recent();
    expect(snapshot.events.map(e => e.cursor)).toEqual([1, 2, 3, 4, 5]);
  });

  test('backwards-compat constructor: new DapEventCache(50) routes loadedSource into a smaller low ring', () => {
    const cache = new DapEventCache(50);

    // legacy ctor: highCap=50, lowCap=max(10, ceil(50/4)) = max(10, 13) = 13
    for (let i = 1; i <= 100; i += 1) {
      cache.append('s', { seq: i, type: 'event', event: 'loadedSource' });
    }
    const snapshot = cache.recent({ limit: 9999 });
    const loaded = snapshot.events.filter(e => e.event === 'loadedSource');
    expect(loaded.length).toBe(13);
    expect(snapshot.capacity).toBe(50 + 13);
    expect(snapshot.capacityByPriority).toEqual({ high: 50, low: 13 });
  });

  test('custom lowPriorityEventNames overrides the default set', () => {
    const cache = new DapEventCache({
      highPriorityCapacity: 100,
      lowPriorityCapacity: 2,
      lowPriorityEventNames: new Set(['module']),
    });

    // 'loadedSource' is now HIGH priority (not in custom low set).
    for (let i = 1; i <= 50; i += 1) {
      cache.append('s', { seq: i, type: 'event', event: 'loadedSource' });
    }
    // 'module' is LOW priority (custom).
    for (let i = 51; i <= 60; i += 1) {
      cache.append('s', { seq: i, type: 'event', event: 'module' });
    }

    const snapshot = cache.recent({ limit: 9999 });
    const loaded = snapshot.events.filter(e => e.event === 'loadedSource');
    const modules = snapshot.events.filter(e => e.event === 'module');
    expect(loaded.length).toBe(50); // all survive in high ring
    expect(modules.length).toBe(2);  // low ring capped at 2
  });

  test('low-priority eviction reports highest evicted cursor across rings', () => {
    const cache = new DapEventCache({ highPriorityCapacity: 100, lowPriorityCapacity: 2 });

    cache.append('s', { seq: 1, type: 'event', event: 'loadedSource' });
    cache.append('s', { seq: 2, type: 'event', event: 'loadedSource' });
    cache.append('s', { seq: 3, type: 'event', event: 'loadedSource' });
    cache.append('s', { seq: 4, type: 'event', event: 'stopped' });

    const snapshot = cache.recent();
    // High ring evicted nothing; low ring evicted cursor 1.
    // droppedBeforeCursor reports the highest cursor evicted from any ring.
    expect(snapshot.droppedBeforeCursor).toBe(1);
    expect(snapshot.events.find(e => e.event === 'stopped')).toBeDefined();
  });

  test('rejects invalid capacity options', () => {
    expect(() => new DapEventCache({ highPriorityCapacity: 0 })).toThrow(RangeError);
    expect(() => new DapEventCache({ lowPriorityCapacity: -1 })).toThrow(RangeError);
    expect(() => new DapEventCache({ highPriorityCapacity: 1.5 })).toThrow(RangeError);
  });
});
