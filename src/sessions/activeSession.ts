import { sessionError } from '../cli/errors.js';
import { projectSessionSummary, REMOVABLE_LIFECYCLES, type SessionRecord } from './session.js';

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
    throw sessionError('No active debug session is selected.', { code: 'no_active_session', diagnostics: ['Run `dap-cli use <name>` or pass --name <name>.'] });
  }

  const allMatches = options.sessions.filter(session => session.id === targetId || session.name === targetId);
  if (allMatches.length === 0) {
    throw sessionError(`Session not found: ${targetId}`, { code: 'session_not_found', diagnostics: ['Use `dap-cli sessions` to list available sessions.'] });
  }

  // When the target is a name (not an id), prefer live records over
  // terminated ones so a re-launched same-named session shadows its
  // terminated predecessor. Quick task 260504-rp5 also blocks creating two
  // live sessions with the same name (`session_name_in_use`), so the
  // narrowed set should be at most one in normal operation. If no live
  // matches exist, fall back to all matches so the user can still close a
  // terminated session by name.
  const isIdMatch = allMatches.some(session => session.id === targetId);
  const liveMatches = allMatches.filter(session => !REMOVABLE_LIFECYCLES.has(session.lifecycle));
  const matches = isIdMatch ? allMatches : (liveMatches.length > 0 ? liveMatches : allMatches);

  if (matches.length > 1) {
    throw sessionError(`Session name is ambiguous: ${targetId}`, { code: 'session_ambiguous', diagnostics: createAmbiguousSessionDiagnostics(targetId, matches) });
  }

  const session = matches[0];
  if (session === undefined) {
    throw sessionError(`Session not found: ${targetId}`, { code: 'session_not_found', diagnostics: ['Use `dap-cli sessions` to list available sessions.'] });
  }

  if (options.requireAvailable === true && projectSessionSummary(session).status === 'unavailable') {
    throw sessionError(`Session is unavailable: ${targetId}`, { code: 'session_unavailable', diagnostics: ['Close the stale session or start a new one.'] });
  }

  return session;
}

function createAmbiguousSessionDiagnostics(targetId: string, matches: readonly SessionRecord[]): readonly string[] {
  // Defensive guard. As of the duplicate-name reversal (quick task
  // 260504-rp5), `SessionManager.create` rejects name collisions with
  // `session_name_in_use`, so this branch should not be reachable through
  // the public CLI. If it ever fires, the underlying state is already
  // wrong; the diagnostic just helps the operator pick a session id.
  return [
    `Multiple sessions match '${targetId}':`,
    ...matches.map(session => {
      const summary = projectSessionSummary(session);
      return `- ${summary.id} ${summary.name} ${summary.status}`;
    }),
    'Use one of these session IDs with --name.',
  ];
}
