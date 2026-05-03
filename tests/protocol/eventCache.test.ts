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
    expect(snapshot.capacity).toBe(2);
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
