import type { DapEventMessage } from './dapMessages.js';

const defaultEventCacheCapacity = 100;

export interface CachedDapEvent {
  cursor: number;
  receivedAt: string;
  sessionId: string;
  dapSeq: number;
  event: string;
  body?: unknown;
  summary: string;
}

export interface EventCacheSnapshot {
  cursor: number;
  events: readonly CachedDapEvent[];
  droppedBeforeCursor?: number;
  capacity: number;
}

export interface EventCacheRecentOptions {
  afterCursor?: number;
  limit?: number;
}

export class DapEventCache {
  private readonly capacity: number;
  private readonly events: CachedDapEvent[] = [];
  private nextCursor = 1;
  private droppedBeforeCursor = 0;

  public constructor(capacity: number = defaultEventCacheCapacity) {
    if (!Number.isSafeInteger(capacity) || capacity <= 0) {
      throw new RangeError('Event cache capacity must be a positive safe integer.');
    }

    this.capacity = capacity;
  }

  public append(sessionId: string, event: DapEventMessage, receivedAt: Date = new Date()): CachedDapEvent {
    const cachedEvent = createCachedEvent(this.nextCursor, sessionId, event, receivedAt);
    this.nextCursor += 1;
    this.events.push(cachedEvent);

    while (this.events.length > this.capacity) {
      const evicted = this.events.shift();
      if (evicted !== undefined) {
        this.droppedBeforeCursor = evicted.cursor;
      }
    }

    return cachedEvent;
  }

  public recent(options: EventCacheRecentOptions = {}): EventCacheSnapshot {
    const afterCursor = options.afterCursor;
    const filtered = afterCursor === undefined
      ? [...this.events]
      : this.events.filter(event => event.cursor > afterCursor);
    const limited = options.limit === undefined ? filtered : filtered.slice(-options.limit);
    const snapshot: EventCacheSnapshot = {
      cursor: this.nextCursor - 1,
      events: limited,
      capacity: this.capacity,
    };

    if (this.droppedBeforeCursor > 0) {
      return { ...snapshot, droppedBeforeCursor: this.droppedBeforeCursor };
    }

    return snapshot;
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
