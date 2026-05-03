import { sessionError } from '../cli/errors.js';
import { projectSessionSummary, type SessionRecord } from './session.js';

export interface ResolveTargetSessionOptions {
  explicitSessionId?: string | undefined;
  activeSessionId?: string | undefined;
  sessions: readonly SessionRecord[];
  requireAvailable?: boolean;
}

export function resolveTargetSession(options: ResolveTargetSessionOptions): SessionRecord {
  if (options.sessions.length === 0) {
    throw sessionError('No debug sessions are known.', { code: 'no_sessions', diagnostics: ['Launch or attach a session before targeting one.'] });
  }

  const targetId = options.explicitSessionId ?? options.activeSessionId;
  if (targetId === undefined) {
    throw sessionError('No active debug session is selected.', { code: 'no_active_session', diagnostics: ['Run dap-cli use <name> or pass --name <name>.'] });
  }

  const matches = options.sessions.filter(session => session.id === targetId || session.name === targetId);
  if (matches.length !== 1) {
    throw sessionError(`Session not found: ${targetId}`, { code: 'session_not_found', diagnostics: ['Use dap-cli sessions to list available sessions.'] });
  }

  const session = matches[0];
  if (session === undefined) {
    throw sessionError(`Session not found: ${targetId}`, { code: 'session_not_found', diagnostics: ['Use dap-cli sessions to list available sessions.'] });
  }

  if (options.requireAvailable === true && projectSessionSummary(session).status === 'unavailable') {
    throw sessionError(`Session is unavailable: ${targetId}`, { code: 'session_unavailable', diagnostics: ['Close the stale session or start a new one.'] });
  }

  return session;
}
