import { resolveTargetSession } from './activeSession.js';
import { createSessionId, projectSessionStatus, projectSessionSummary, type OwnedAdapterMetadata, type SessionLifecycle, type SessionRecord, type SessionStatus, type SessionSummary } from './session.js';
import { SessionStore, type SessionStoreData } from './sessionStore.js';

export interface CreateSessionOptions {
  name: string;
  adapter?: string;
  lifecycle?: SessionLifecycle;
  ownedAdapter?: Partial<OwnedAdapterMetadata>;
  makeActive?: boolean;
}

export interface SessionManagerOptions {
  dapCliHome?: string | undefined;
  signalProcess?: (pid: number, signal: NodeJS.Signals) => void;
}

export interface CleanupResult {
  cleaned: readonly string[];
  failed: readonly SessionCleanupFailure[];
}

export interface SessionCleanupFailure {
  sessionId: string;
  logPath?: string;
  stderrTail: readonly string[];
  actions: readonly string[];
  message: string;
}

export class SessionManager {
  private data: SessionStoreData = { sessions: [] };

  private constructor(private readonly store: SessionStore, private readonly signalProcess: (pid: number, signal: NodeJS.Signals) => void) {}

  public static async create(options: SessionManagerOptions = {}): Promise<SessionManager> {
    const manager = new SessionManager(new SessionStore({ dapCliHome: options.dapCliHome }), options.signalProcess ?? ((pid, signal) => process.kill(pid, signal)));
    manager.data = await manager.store.read();
    return manager;
  }

  public list(): readonly SessionSummary[] {
    return this.data.sessions.map(projectSessionSummary);
  }

  public status(target?: string): SessionStatus {
    return projectSessionStatus(this.target(target, false));
  }

  public async create(options: CreateSessionOptions): Promise<SessionStatus> {
    const now = new Date().toISOString();
    const session: SessionRecord = {
      id: createSessionId(),
      name: options.name,
      adapter: options.adapter ?? 'unknown',
      lifecycle: options.lifecycle ?? 'created',
      createdAt: now,
      updatedAt: now,
      ownedAdapter: {
        stderrTail: options.ownedAdapter?.stderrTail ?? [],
        startedByDapCli: options.ownedAdapter?.startedByDapCli ?? false,
        ...optionalOwnedAdapterFields(options.ownedAdapter),
      },
    };
    this.data = {
      activeSessionId: shouldMakeActive(options.makeActive, this.data.activeSessionId) ? session.id : this.data.activeSessionId,
      sessions: [...this.data.sessions, session],
    };
    await this.persist();
    return projectSessionStatus(session);
  }

  public async targetSession(target: string): Promise<SessionStatus> {
    const session = this.target(target, false);
    this.data = { ...this.data, activeSessionId: session.id };
    await this.persist();
    return projectSessionStatus(session);
  }

  public async updateLifecycle(target: string, lifecycle: SessionLifecycle): Promise<SessionStatus> {
    const session = this.target(target, false);
    const updated = { ...session, lifecycle, updatedAt: new Date().toISOString() };
    await this.replaceSession(updated);
    return projectSessionStatus(updated);
  }

  public async stopSession(target?: string): Promise<SessionStatus> {
    return this.transition(target, 'terminated');
  }

  public async detachSession(target?: string): Promise<SessionStatus> {
    return this.transition(target, 'disconnected');
  }

  public async closeSession(target?: string): Promise<SessionStatus> {
    const session = this.target(target, false);
    this.data = {
      activeSessionId: this.data.activeSessionId === session.id ? undefined : this.data.activeSessionId,
      sessions: this.data.sessions.filter(candidate => candidate.id !== session.id),
    };
    await this.persist();
    return projectSessionStatus(session);
  }

  public cleanupSessions(): Promise<CleanupResult> {
    const cleaned: string[] = [];
    const failed: SessionCleanupFailure[] = [];

    for (const session of this.data.sessions) {
      const adapter = session.ownedAdapter;
      if (adapter.startedByDapCli === true && adapter.pid !== undefined) {
        try {
          this.signalProcess(adapter.pid, 'SIGTERM');
          cleaned.push(session.id);
        } catch (error) {
          if (isNodeError(error) && error.code === 'ESRCH') {
            cleaned.push(session.id);
            continue;
          }

          failed.push(createCleanupFailure(session, error));
        }
      }
    }

    return Promise.resolve({ cleaned, failed });
  }

  private target(target: string | undefined, requireAvailable: boolean): SessionRecord {
    return resolveTargetSession({
      explicitSessionId: target,
      activeSessionId: this.data.activeSessionId,
      sessions: this.data.sessions,
      requireAvailable,
    });
  }

  private async transition(target: string | undefined, lifecycle: SessionLifecycle): Promise<SessionStatus> {
    const session = this.target(target, false);
    const updated = { ...session, lifecycle, updatedAt: new Date().toISOString() };
    await this.replaceSession(updated);
    return projectSessionStatus(updated);
  }

  private async replaceSession(updated: SessionRecord): Promise<void> {
    this.data = {
      ...this.data,
      sessions: this.data.sessions.map(session => session.id === updated.id ? updated : session),
    };
    await this.persist();
  }

  private async persist(): Promise<void> {
    await this.store.write(this.data);
  }
}

function shouldMakeActive(makeActive: boolean | undefined, activeSessionId: string | undefined): boolean {
  if (makeActive !== undefined) {
    return makeActive;
  }

  return activeSessionId === undefined;
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error;
}

function optionalOwnedAdapterFields(adapter: Partial<OwnedAdapterMetadata> | undefined): Partial<OwnedAdapterMetadata> {
  const fields: Partial<OwnedAdapterMetadata> = {};
  if (adapter?.pid !== undefined) {
    fields.pid = adapter.pid;
  }
  if (adapter?.logPath !== undefined) {
    fields.logPath = adapter.logPath;
  }
  return fields;
}

function createCleanupFailure(session: SessionRecord, error: unknown): SessionCleanupFailure {
  const failure: SessionCleanupFailure = {
    sessionId: session.id,
    stderrTail: session.ownedAdapter.stderrTail,
    actions: ['Check the adapter process manually and then run dap-cli close for this session.'],
    message: error instanceof Error ? error.message : 'Cleanup failed.',
  };

  if (session.ownedAdapter.logPath !== undefined) {
    return { ...failure, logPath: session.ownedAdapter.logPath };
  }

  return failure;
}
