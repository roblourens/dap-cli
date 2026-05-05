import { resolveTargetSession } from './activeSession.js';
import { sessionError } from '../cli/errors.js';
import { createSessionId, projectSessionStatus, projectSessionSummary, REMOVABLE_LIFECYCLES, type OwnedAdapterMetadata, type SessionId, type SessionLifecycle, type SessionRecord, type SessionStatus, type SessionSummary } from './session.js';
import { SessionStore, type SessionStoreData } from './sessionStore.js';

export interface CreateSessionOptions {
  name: string;
  adapter?: string;
  lifecycle?: SessionLifecycle;
  ownedAdapter?: Partial<OwnedAdapterMetadata>;
  makeActive?: boolean;
}

export interface RegisterChildSessionOptions extends CreateSessionOptions {
  parent_session_id: SessionId;
}

export interface SessionManagerOptions {
  dapCliHome?: string | undefined;
  signalProcess?: (pid: number, signal: NodeJS.Signals) => void;
}

/**
 * Plan 05-20 (gap H-4): cleanup MUST be honest about what it actually did.
 * The old `{ cleaned, failed }` envelope conflated "we signaled an adapter"
 * with "we removed a record" with "we did nothing because the record is still
 * live". Hand-driven Sequence A Step 8 evidence: `cleanup` reported
 * `cleaned: [<id>]` but `sessions list` still showed the session.
 *
 * New shape:
 * - `signaledAdapter`: session ids whose owned adapter pid we signaled
 *   (whether SIGTERM succeeded or returned ESRCH because the process was
 *   already dead).
 * - `removedRecords`: session ids whose persisted record was removed.
 * - `keptRunning`: session ids we deliberately did NOT touch (no signal,
 *   no removal) because the lifecycle is still in flight or the adapter
 *   pid is still alive. Each entry carries a structured `reason` so the
 *   caller can decide whether to re-run with `--purge`.
 * - `failed`: signaling failures (non-ESRCH errors). These do NOT also
 *   appear in keptRunning — failed and keptRunning are mutually exclusive.
 */
export type CleanupKeptReason = 'adapter_alive' | 'lifecycle_running' | 'lifecycle_attaching';

export interface CleanupKeptRunning {
  sessionId: string;
  reason: CleanupKeptReason;
}

export interface CleanupResult {
  signaledAdapter: readonly string[];
  removedRecords: readonly string[];
  keptRunning: readonly CleanupKeptRunning[];
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

  /**
   * List sessions. By default, child sessions (records with a non-undefined
   * `parent_session_id`) are filtered out — they are owned by their parent
   * (e.g. js-debug pwa-chrome's bp registry / threads / event stream live on
   * the parent) and cannot be targeted directly from the public CLI. Pass
   * `{ includeChildren: true }` to surface them for diagnostics; their
   * summaries carry `targetable: false`. Plan 05-19 (gap H-3 closure).
   */
  public list(opts: { includeChildren?: boolean } = {}): readonly SessionSummary[] {
    const includeChildren = opts.includeChildren === true;
    const sessions = includeChildren
      ? this.data.sessions
      : this.data.sessions.filter(session => session.parent_session_id === undefined);
    return sessions.map(projectSessionSummary);
  }

  public status(target?: string): SessionStatus {
    return projectSessionStatus(this.target(target, false));
  }

  public async create(options: CreateSessionOptions): Promise<SessionStatus> {
    // Reject collisions with an in-use name. A previous design supported
    // multiple persisted sessions sharing a `--name` and disambiguated at
    // target time (`session_ambiguous`). The product behavior we actually
    // want is simpler: a new session with the same name as an existing
    // non-terminated session is an error. Reuse against terminated/failed
    // records is allowed — closed sessions should not block a new launch.
    // Children (`registerChild`) are exempt: they have their own
    // `parent#cdp-target-id` naming and aren't user-targetable.
    const collision = this.data.sessions.find(
      candidate =>
        candidate.parent_session_id === undefined &&
        candidate.name === options.name &&
        !REMOVABLE_LIFECYCLES.has(candidate.lifecycle),
    );
    if (collision !== undefined) {
      throw sessionError(`Session name already in use: ${options.name}`, {
        code: 'session_name_in_use',
        diagnostics: [
          `Session ${collision.id} (${collision.lifecycle}) is already using the name '${options.name}'.`,
          `Run \`dap-cli close ${options.name}\` to release the name, or relaunch with a different --name.`,
        ],
      });
    }

    const session = this.buildSessionRecord(options);
    this.data = {
      activeSessionId: shouldMakeActive(options.makeActive, this.data.activeSessionId) ? session.id : this.data.activeSessionId,
      sessions: [...this.data.sessions, session],
    };
    await this.persist();
    return projectSessionStatus(session);
  }

  public async registerChild(options: RegisterChildSessionOptions): Promise<SessionStatus> {
    const parent = this.data.sessions.find(candidate => candidate.id === options.parent_session_id);
    if (parent === undefined) {
      throw sessionError(`Parent session not found: ${options.parent_session_id}`, {
        code: 'parent_not_found',
        diagnostics: [
          `No session with id ${options.parent_session_id} is registered.`,
          'Open the parent session before registering child sessions against it.',
        ],
      });
    }
    const child: SessionRecord = {
      ...this.buildSessionRecord(options),
      parent_session_id: options.parent_session_id,
    };
    // Child registration never steals active focus from the parent — children are
    // implementation detail of pwa-chrome multiplexing, not user-targeted sessions.
    this.data = {
      ...this.data,
      sessions: [...this.data.sessions, child],
    };
    await this.persist();
    return projectSessionStatus(child);
  }

  public listChildren(parentId: SessionId): readonly SessionSummary[] {
    return this.data.sessions
      .filter(session => session.parent_session_id === parentId)
      .map(projectSessionSummary);
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

  /**
   * Mirror DAP `stopped`/`continued`/`terminated` event state onto the
   * persisted SessionRecord so `dap-cli status` can report paused-vs-running
   * without polling events. Hand-driven gap H-1 closure (plan 05-17, see
   * `.planning/phases/05-.../05-UAT.md`).
   *
   * - `paused: true` sets the optional `stoppedReason` and `stoppedThreadIds`
   *   when provided (overwriting any previous values).
   * - `paused: false` clears `stoppedReason` and `stoppedThreadIds` to
   *   undefined so consumers can tell "we know this isn't paused" from
   *   "we don't know" (the latter is `paused === undefined`).
   */
  public async updatePausedState(
    target: string,
    state: { paused: boolean; stoppedReason?: string; stoppedThreadIds?: readonly number[] },
  ): Promise<SessionStatus> {
    const session = this.target(target, false);
    const updated: SessionRecord = { ...session, paused: state.paused, updatedAt: new Date().toISOString() };
    // Always clear the supporting fields first; only re-set them when paused.
    delete (updated as { stoppedReason?: string }).stoppedReason;
    delete (updated as { stoppedThreadIds?: readonly number[] }).stoppedThreadIds;
    if (state.paused) {
      if (state.stoppedReason !== undefined) {
        updated.stoppedReason = state.stoppedReason;
      }
      if (state.stoppedThreadIds !== undefined) {
        updated.stoppedThreadIds = state.stoppedThreadIds;
      }
    }
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
    const childIds = this.data.sessions
      .filter(candidate => candidate.parent_session_id === session.id)
      .map(child => child.id);
    const removedIds = new Set<string>([session.id, ...childIds]);
    this.data = {
      activeSessionId: removedIds.has(this.data.activeSessionId ?? '') ? undefined : this.data.activeSessionId,
      sessions: this.data.sessions.filter(candidate => !removedIds.has(candidate.id)),
    };
    await this.persist();
    return projectSessionStatus(session);
  }

  public async cleanupSessions(options: { purge?: boolean } = {}): Promise<CleanupResult> {
    const signaledAdapter: string[] = [];
    const removedRecords: string[] = [];
    const keptRunning: CleanupKeptRunning[] = [];
    const failed: SessionCleanupFailure[] = [];
    const removed = new Set<string>();
    const purge = options.purge === true;

    for (const session of this.data.sessions) {
      const adapter = session.ownedAdapter;
      const owned = adapter.startedByDapCli === true && adapter.pid !== undefined;
      const isRemovableLifecycle = REMOVABLE_LIFECYCLES.has(session.lifecycle);

      if (purge) {
        // --purge: signal owned adapters and remove every record regardless
        // of lifecycle (matches prior --purge semantics so cleanup is a
        // hard reset). Signal failures still go to `failed` and skip
        // record removal so the user can investigate.
        if (owned) {
          const signalOutcome = this.signalOwnedAdapter(session, adapter.pid as number);
          if (signalOutcome === 'failed_other') {
            failed.push(createCleanupFailure(session, this.lastSignalError));
            continue;
          }
          signaledAdapter.push(session.id);
        }
        removedRecords.push(session.id);
        removed.add(session.id);
        continue;
      }

      // Plain cleanup: only act on sessions that are safe to reclaim.
      if (owned) {
        // Owned: try to signal — on success or ESRCH (already dead) we
        // also remove the record. The adapter is dap-cli-owned so killing
        // it is in scope. Non-ESRCH errors land in `failed` (no removal).
        const signalOutcome = this.signalOwnedAdapter(session, adapter.pid as number);
        if (signalOutcome === 'failed_other') {
          failed.push(createCleanupFailure(session, this.lastSignalError));
          continue;
        }
        signaledAdapter.push(session.id);
        removedRecords.push(session.id);
        removed.add(session.id);
        continue;
      }

      // Unowned: only remove the record if the lifecycle says it's done.
      // Otherwise keep it and surface a structured reason so the caller
      // can decide whether to re-run with --purge.
      if (isRemovableLifecycle) {
        removedRecords.push(session.id);
        removed.add(session.id);
        continue;
      }

      keptRunning.push({ sessionId: session.id, reason: this.deriveKeptReason(session) });
    }

    if (removed.size > 0) {
      const remaining = this.data.sessions.filter(session => !removed.has(session.id));
      const activeSessionId = this.data.activeSessionId !== undefined && removed.has(this.data.activeSessionId)
        ? undefined
        : this.data.activeSessionId;
      this.data = activeSessionId === undefined
        ? { sessions: remaining }
        : { activeSessionId, sessions: remaining };
      await this.persist();
    }

    return { signaledAdapter, removedRecords, keptRunning, failed };
  }

  private lastSignalError: unknown = undefined;

  /**
   * Returns:
   *  - 'signaled' on success
   *  - 'esrch' when the kernel says the process no longer exists
   *  - 'failed_other' on any other error (and stashes the error in
   *    `lastSignalError` so the caller can attach it to a CleanupFailure)
   *
   * Plan 05-20: extracted from cleanupSessions so both the --purge and
   * plain paths share one signaling contract.
   */
  private signalOwnedAdapter(session: SessionRecord, pid: number): 'signaled' | 'esrch' | 'failed_other' {
    try {
      this.signalProcess(pid, 'SIGTERM');
      this.lastSignalError = undefined;
      return 'signaled';
    } catch (error) {
      if (isNodeError(error) && error.code === 'ESRCH') {
        this.lastSignalError = undefined;
        return 'esrch';
      }
      this.lastSignalError = error;
      return 'failed_other';
    }
  }

  private deriveKeptReason(session: SessionRecord): CleanupKeptReason {
    if (session.lifecycle === 'attaching') {
      return 'lifecycle_attaching';
    }
    return 'lifecycle_running';
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

  private buildSessionRecord(options: CreateSessionOptions): SessionRecord {
    const now = new Date().toISOString();
    return {
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
    actions: [`Check the adapter process manually and then run \`dap-cli close ${session.id}\` for this session.`],
    message: error instanceof Error ? error.message : 'Cleanup failed.',
  };

  if (session.ownedAdapter.logPath !== undefined) {
    return { ...failure, logPath: session.ownedAdapter.logPath };
  }

  return failure;
}
