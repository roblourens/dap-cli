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

export interface OwnedAdapterMetadata {
  pid?: number | undefined;
  logPath?: string | undefined;
  stderrTail: readonly string[];
  startedByDapCli: boolean;
}

export interface SessionRecord {
  id: SessionId;
  name: string;
  adapter: string;
  lifecycle: SessionLifecycle;
  createdAt: string;
  updatedAt: string;
  ownedAdapter: OwnedAdapterMetadata;
}

export interface SessionSummary {
  id: SessionId;
  name: string;
  adapter: string;
  lifecycle: SessionLifecycle;
  status: SessionStatusState;
  updatedAt: string;
}

export interface SessionStatus extends SessionSummary {
  logPath?: string;
  stderrTail: readonly string[];
  cleanupActions: readonly string[];
}

export function createSessionId(): SessionId {
  return `sess_${randomBytes(12).toString('base64url')}`;
}

export function projectSessionSummary(session: SessionRecord): SessionSummary {
  return {
    id: session.id,
    name: session.name,
    adapter: session.adapter,
    lifecycle: session.lifecycle,
    status: projectStatusState(session.lifecycle),
    updatedAt: session.updatedAt,
  };
}

export function projectSessionStatus(session: SessionRecord): SessionStatus {
  const summary = projectSessionSummary(session);
  const status: SessionStatus = {
    ...summary,
    stderrTail: session.ownedAdapter.stderrTail,
    cleanupActions: createCleanupActions(session),
  };

  if (session.ownedAdapter.logPath !== undefined) {
    return { ...status, logPath: session.ownedAdapter.logPath };
  }

  return status;
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
