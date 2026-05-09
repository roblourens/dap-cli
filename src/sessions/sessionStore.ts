import { promises as fs } from 'node:fs';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { z } from 'zod';
import { getDapCliStateDir } from '../config/paths.js';
import type { SessionId, SessionRecord } from './session.js';

export interface SessionStoreData {
  activeSessionId?: SessionId | undefined;
  sessions: readonly SessionRecord[];
}

export interface SessionStoreOptions {
  dapCliHome?: string | undefined;
}

const ownedAdapterSchema = z.object({
  pid: z.number().int().positive().optional(),
  logPath: z.string().min(1).optional(),
  stderrTail: z.array(z.string()),
  startedByDapCli: z.boolean(),
});

const compoundSessionMetadataSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  memberName: z.string().min(1),
  stopAll: z.boolean(),
  members: z.array(z.string().min(1)),
});

const sessionRecordSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  adapter: z.string().min(1),
  lifecycle: z.enum(['created', 'adapterStarting', 'transportOpen', 'initializing', 'initialized', 'launching', 'attaching', 'configuring', 'running', 'stopped', 'terminating', 'terminated', 'disconnected', 'failed']),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
  ownedAdapter: ownedAdapterSchema,
  // Plan 05-04 (child sessions) — js-debug pwa-chrome multi-process
  // children carry their parent's id so the controller can route requests
  // and so 'sessions list' can hide them by default (plan 05-19, gap H-3).
  parent_session_id: z.string().min(1).optional(),
  compound: compoundSessionMetadataSchema.optional(),
  // Plan 05-17 (gap H-1) — paused projection mirrors DAP stopped/continued
  // events onto persisted SessionRecord state. Optional; absence === unknown.
  paused: z.boolean().optional(),
  stoppedReason: z.string().min(1).optional(),
  stoppedThreadIds: z.array(z.number().int()).optional(),
});

const sessionStoreSchema = z.object({
  activeSessionId: z.string().min(1).optional(),
  sessions: z.array(sessionRecordSchema),
});

export class SessionStore {
  private readonly storePath: string;

  public constructor(options: SessionStoreOptions = {}) {
    const env = options.dapCliHome === undefined ? process.env : { ...process.env, DAP_CLI_HOME: options.dapCliHome };
    this.storePath = path.join(getDapCliStateDir(env), 'sessions.json');
  }

  public get path(): string {
    return this.storePath;
  }

  public async read(): Promise<SessionStoreData> {
    try {
      const raw = await fs.readFile(this.storePath, 'utf8');
      const parsed = sessionStoreSchema.parse(JSON.parse(raw));
      // zod's `.optional()` produces `T | undefined`, but SessionRecord uses
      // `exactOptionalPropertyTypes: true` strict optional shape (`key?: T`,
      // never `T | undefined`). Strip undefined keys so the schema output
      // assigns cleanly without a cast or widening the record type.
      return {
        ...(parsed.activeSessionId !== undefined ? { activeSessionId: parsed.activeSessionId } : {}),
        sessions: parsed.sessions.map(stripUndefinedKeys) as readonly SessionRecord[],
      };
    } catch (error) {
      if (isNodeError(error) && error.code === 'ENOENT') {
        return { sessions: [] };
      }

      // Round 6 R6-F: a corrupt or junk sessions.json (truncated write,
      // hand-edited, partial disk failure) previously crashed
      // `serve-controller` with an opaque internal_error/exit-70 and the
      // parent `start` then timed out with `controller_unavailable` — the
      // user had no idea their state file was the cause. Rename the bad
      // file out of the way and continue with empty state so the user is
      // self-healing; emit a one-line warning to stderr so the move is
      // discoverable.
      if (error instanceof SyntaxError || error instanceof z.ZodError) {
        const backupPath = `${this.storePath}.corrupt.${new Date().toISOString().replace(/[:.]/g, '-')}.bak`;
        try {
          await fs.rename(this.storePath, backupPath);
          process.stderr.write(`dap-cli: sessions.json was unparseable; moved to ${backupPath} and continuing with empty state.\n`);
        } catch {
          // If rename fails (e.g. permissions), still return empty so the
          // controller can come up; the next write will overwrite.
        }
        return { sessions: [] };
      }

      throw error;
    }
  }

  public async write(data: SessionStoreData): Promise<void> {
    await fs.mkdir(path.dirname(this.storePath), { recursive: true });
    const validated = sessionStoreSchema.parse(data);
    const tempPath = `${this.storePath}.${process.pid}.${randomUUID()}.tmp`;
    await fs.writeFile(tempPath, `${JSON.stringify(validated, null, 2)}\n`, 'utf8');
    await fs.rename(tempPath, this.storePath);
  }
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error;
}

function stripUndefinedKeys<T extends object>(value: T): T {
  const result: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(value)) {
    if (val !== undefined) {
      result[key] = val;
    }
  }
  return result as T;
}
