import { randomBytes } from 'node:crypto';

export type SessionId = string;

export type SessionLifecycle =
  | 'created'
  | 'adapterStarting'
  | 'transportOpen'
  | 'initializing'
  | 'initialized'
  | 'launching'
  | 'attaching'
  | 'configuring'
  | 'running'
  | 'stopped'
  | 'terminating'
  | 'terminated'
  | 'disconnected'
  | 'failed';

export type SessionStatusState = 'running' | 'stopped' | 'terminated' | 'unavailable' | 'failed';

/**
 * Lifecycles that represent a session that has finished or failed and whose
 * record is eligible for cleanup. Quick task 260504-rp5 also uses this set
 * to decide when a session name is considered "in use" vs. available for
 * reuse, and which records to deprioritize when resolving a target by name.
 */
export const REMOVABLE_LIFECYCLES: ReadonlySet<SessionLifecycle> = new Set([
  'terminated',
  'disconnected',
  'failed',
]);

export interface OwnedAdapterMetadata {
  pid?: number | undefined;
  logPath?: string | undefined;
  stderrTail: readonly string[];
  startedByDapCli: boolean;
}

export interface CompoundSessionMetadata {
  id: string;
  name: string;
  memberName: string;
  stopAll: boolean;
  members: readonly string[];
}

export interface SessionRecord {
  id: SessionId;
  name: string;
  adapter: string;
  lifecycle: SessionLifecycle;
  createdAt: string;
  updatedAt: string;
  ownedAdapter: OwnedAdapterMetadata;
  parent_session_id?: SessionId;
  compound?: CompoundSessionMetadata;
  // Hand-driven gap H-1 (plan 05-17): mirror DAP `stopped`/`continued` event
  // state so `dap-cli status` can report paused-vs-running without polling
  // events. Absence (undefined) means "unknown"; explicit `false` means
  // "we observed continued/terminated and know this is not paused".
  paused?: boolean;
  stoppedReason?: string;
  stoppedThreadIds?: readonly number[];
}

export interface SessionSummary {
  id: SessionId;
  name: string;
  adapter: string;
  lifecycle: SessionLifecycle;
  status: SessionStatusState;
  updatedAt: string;
  parent_session_id?: SessionId;
  compound?: CompoundSessionMetadata;
  // Plan 05-19 (gap H-3): explicit `targetable: false` is set on child
  // sessions because the parent owns the bp registry, threads, and event
  // stream in js-debug pwa-chrome. Absence === targetable. Children stay
  // visible (with --show-children) for diagnostics; targeting them via
  // --name returns child_session_not_targetable, not session_unavailable.
  targetable?: boolean;
  // Hand-driven gap H-1c (round 3): mirror the paused projection on the
  // list view too so `sessions` can show paused state per session at a
  // glance, not just `status` for a single session. Same semantics as
  // SessionRecord.paused (absent === unknown, false === observed running).
  paused?: boolean;
  stoppedReason?: string;
  stoppedThreadIds?: readonly number[];
}

export interface SessionStatus extends SessionSummary {
  logPath?: string;
  stderrTail: readonly string[];
  cleanupActions: readonly string[];
  // SessionSummary already declares `targetable?: boolean` (plan 05-19);
  // it surfaces here too because projectSessionStatus spreads the summary.
  // Mirrored from SessionRecord — see SessionRecord for semantics (gap H-1).
  paused?: boolean;
  stoppedReason?: string;
  stoppedThreadIds?: readonly number[];
}

export function createSessionId(): SessionId {
  return `sess_${randomBytes(12).toString('base64url')}`;
}

export function projectSessionSummary(session: SessionRecord): SessionSummary {
  const summary: SessionSummary = {
    id: session.id,
    name: session.name,
    adapter: session.adapter,
    lifecycle: session.lifecycle,
    status: projectSummaryStatus(session),
    updatedAt: session.updatedAt,
  };
  let result = session.parent_session_id !== undefined
    ? { ...summary, parent_session_id: session.parent_session_id, targetable: false }
    : summary;
  // Hand-driven gap H-1c (round 3): mirror paused projection into the
  // list view too. Conditional spread so absent === unknown.
  if (session.paused !== undefined) {
    result = { ...result, paused: session.paused };
  }
  if (session.stoppedReason !== undefined) {
    result = { ...result, stoppedReason: session.stoppedReason };
  }
  if (session.stoppedThreadIds !== undefined) {
    result = { ...result, stoppedThreadIds: session.stoppedThreadIds };
  }
  if (session.compound !== undefined) {
    result = { ...result, compound: session.compound };
  }
  return result;
}

export function projectSessionStatus(session: SessionRecord): SessionStatus {
  // Hand-driven gap H-1c (round 3): paused fields are projected by
  // projectSessionSummary now, so they flow through here automatically.
  const summary = projectSessionSummary(session);
  let status: SessionStatus = {
    ...summary,
    stderrTail: session.ownedAdapter.stderrTail,
    cleanupActions: createCleanupActions(session),
  };

  if (session.ownedAdapter.logPath !== undefined) {
    status = { ...status, logPath: session.ownedAdapter.logPath };
  }

  return status;
}

// Phase 11 plan 01: status reflects mirrored `paused` for non-terminal lifecycles
// so child-event mirrors (js-debug pwa-node/pwa-chrome) project status: 'stopped'
// even though parent lifecycle stays 'running'. Terminal lifecycles always win.
function projectSummaryStatus(session: SessionRecord): SessionStatusState {
  const fromLifecycle = projectStatusState(session.lifecycle);
  if (fromLifecycle === 'failed' || fromLifecycle === 'terminated') {
    return fromLifecycle;
  }
  if (session.paused === true) {
    return 'stopped';
  }
  return fromLifecycle;
}

function projectStatusState(lifecycle: SessionLifecycle): SessionStatusState {
  if (lifecycle === 'failed') {
    return 'failed';
  }

  if (lifecycle === 'stopped') {
    return 'stopped';
  }

  if (lifecycle === 'terminated' || lifecycle === 'disconnected') {
    return 'terminated';
  }

  if (lifecycle === 'created') {
    return 'unavailable';
  }

  return 'running';
}

function createCleanupActions(session: SessionRecord): readonly string[] {
  if (!session.ownedAdapter.startedByDapCli) {
    return ['Adapter process is not owned by dap-cli; close the session state without signaling the process.'];
  }

  if (session.ownedAdapter.pid === undefined) {
    return ['No owned adapter pid is available; close stale session state.'];
  }

  return [`Signal owned adapter pid ${session.ownedAdapter.pid} if cleanup is required.`];
}
