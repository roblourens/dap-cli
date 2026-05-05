import type { DapEventMessage } from './dapMessages.js';

/**
 * Default total cache capacity preserved from plan 01-05 (100). The two-ring
 * implementation (plan 05-18, gap H-2) splits this into a high-priority ring
 * and a smaller low-priority ring; new code should pass explicit capacities.
 */
const defaultLegacyCapacity = 100;

/**
 * Default low-priority event names. Some adapters emit very frequent
 * `loadedSource` events (source-discovery notifications) that can overwhelm
 * a bounded cache and evict critical events like `stopped`. Routing such
 * names to a separate ring caps the noise without losing observability of
 * state changes. Callers can override via `lowPriorityEventNames`.
 */
const defaultLowPriorityEventNames: ReadonlySet<string> = new Set(['loadedSource']);

export interface CachedDapEvent {
  cursor: number;
  receivedAt: string;
  sessionId: string;
  dapSeq: number;
  event: string;
  body?: unknown;
  summary: string;
}

export interface EventCacheCapacityByPriority {
  high: number;
  low: number;
}

export interface EventCacheSnapshot {
  cursor: number;
  events: readonly CachedDapEvent[];
  droppedBeforeCursor?: number;
  capacity: number;
  capacityByPriority: EventCacheCapacityByPriority;
  truncatedToCapacity?: number;
}

export interface EventCacheRecentOptions {
  afterCursor?: number;
  limit?: number;
}

/**
 * Plan 05-18 (gap H-2): explicit constructor opts replace the legacy single
 * integer capacity. The two-ring split prevents low-priority `loadedSource`
 * spam from evicting critical events (`stopped`, `thread`, `output`,
 * `terminated`, `breakpoint`, `startDebugging`, ...).
 *
 * Defaults: highPriorityCapacity 200, lowPriorityCapacity 50, low-priority
 * event names `{ 'loadedSource' }`. The legacy single-int constructor still
 * works (treats N as highPriorityCapacity; lowPriorityCapacity defaults to
 * `Math.max(10, Math.ceil(N / 4))`).
 */
export interface DapEventCacheOptions {
  highPriorityCapacity?: number;
  lowPriorityCapacity?: number;
  lowPriorityEventNames?: ReadonlySet<string>;
}

interface PriorityRing {
  events: CachedDapEvent[];
  capacity: number;
  droppedBeforeCursor: number;
}

export class DapEventCache {
  private readonly highRing: PriorityRing;
  private readonly lowRing: PriorityRing;
  private readonly lowPriorityEventNames: ReadonlySet<string>;
  private nextCursor = 1;

  public constructor(optsOrCapacity: DapEventCacheOptions | number = defaultLegacyCapacity) {
    let highCap: number;
    let lowCap: number;
    let lowNames: ReadonlySet<string>;
    if (typeof optsOrCapacity === 'number') {
      validateCapacity(optsOrCapacity, 'capacity');
      highCap = optsOrCapacity;
      lowCap = Math.max(10, Math.ceil(optsOrCapacity / 4));
      lowNames = defaultLowPriorityEventNames;
    } else {
      highCap = optsOrCapacity.highPriorityCapacity ?? 200;
      lowCap = optsOrCapacity.lowPriorityCapacity ?? 50;
      validateCapacity(highCap, 'highPriorityCapacity');
      validateCapacity(lowCap, 'lowPriorityCapacity');
      lowNames = optsOrCapacity.lowPriorityEventNames ?? defaultLowPriorityEventNames;
    }

    this.highRing = { events: [], capacity: highCap, droppedBeforeCursor: 0 };
    this.lowRing = { events: [], capacity: lowCap, droppedBeforeCursor: 0 };
    this.lowPriorityEventNames = lowNames;
  }

  public append(sessionId: string, event: DapEventMessage, receivedAt: Date = new Date()): CachedDapEvent {
    const cachedEvent = createCachedEvent(this.nextCursor, sessionId, event, receivedAt);
    this.nextCursor += 1;
    const ring = this.lowPriorityEventNames.has(event.event) ? this.lowRing : this.highRing;
    ring.events.push(cachedEvent);

    while (ring.events.length > ring.capacity) {
      const evicted = ring.events.shift();
      if (evicted !== undefined) {
        ring.droppedBeforeCursor = evicted.cursor;
      }
    }

    return cachedEvent;
  }

  public recent(options: EventCacheRecentOptions = {}): EventCacheSnapshot {
    // Merge both rings preserving cursor order. Each ring is already sorted
    // by cursor (append-only), so a two-finger merge would suffice; concat +
    // sort is simpler and bounded by (highCap + lowCap), so the cost is fine.
    const merged = [...this.highRing.events, ...this.lowRing.events];
    merged.sort((a, b) => a.cursor - b.cursor);

    const afterCursor = options.afterCursor;
    const filtered = afterCursor === undefined
      ? merged
      : merged.filter(event => event.cursor > afterCursor);
    const limited = options.limit === undefined ? filtered : filtered.slice(-options.limit);

    const capacityByPriority: EventCacheCapacityByPriority = {
      high: this.highRing.capacity,
      low: this.lowRing.capacity,
    };
    const mergedCapacity = capacityByPriority.high + capacityByPriority.low;
    const snapshot: EventCacheSnapshot = {
      cursor: this.nextCursor - 1,
      events: limited,
      capacity: mergedCapacity,
      capacityByPriority,
    };

    // Report the highest evicted cursor across either ring. If both rings
    // have evicted, MAX captures the latest cursor at or below which data
    // may be missing. (Plan worded this as MIN, but MIN collapses to 0
    // whenever one ring is untouched — which is the common case for
    // loadedSource-heavy sessions. MAX is the only value that lets
    // a poller detect any eviction at all.)
    const maxDropped = Math.max(this.highRing.droppedBeforeCursor, this.lowRing.droppedBeforeCursor);
    if (maxDropped > 0) {
      snapshot.droppedBeforeCursor = maxDropped;
    }

    if (options.limit !== undefined && options.limit > mergedCapacity) {
      snapshot.truncatedToCapacity = mergedCapacity;
    }

    return snapshot;
  }
}

function validateCapacity(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new RangeError(`Event cache ${label} must be a positive safe integer.`);
  }
}

function createCachedEvent(cursor: number, sessionId: string, event: DapEventMessage, receivedAt: Date): CachedDapEvent {
  const cachedEvent: CachedDapEvent = {
    cursor,
    receivedAt: receivedAt.toISOString(),
    sessionId,
    dapSeq: event.seq,
    event: event.event,
    summary: `${event.event} event seq=${event.seq}`,
  };

  if ('body' in event) {
    return { ...cachedEvent, body: event.body };
  }

  return cachedEvent;
}
