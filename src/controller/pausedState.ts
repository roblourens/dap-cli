/**
 * Project a DAP `stopped` event body into the shape SessionManager.updatePausedState
 * expects. Coerces untrusted adapter input (T-05-17-01): reason becomes a string,
 * threadId is only honored when it's an integer. When `allThreadsStopped` is true
 * (or no specific threadId is reported), `stoppedThreadIds` is `[]`.
 *
 * Extracted from `server.ts` (plan 05-25) so both the parent-direct event handler
 * (`server.ts`, debugpy / fake adapter) and the child-mirror handler
 * (`childSessions.ts`, js-debug pwa-node / pwa-chrome) share one coercion contract.
 */
export function derivePausedStateFromStopped(body: unknown): { paused: true; stoppedReason: string; stoppedThreadIds: readonly number[] } {
  const record = isRecord(body) ? body : undefined;
  const reasonRaw = record?.reason;
  const stoppedReason = typeof reasonRaw === 'string' ? reasonRaw : 'unknown';
  const allThreadsStopped = record?.allThreadsStopped === true;
  const threadIdRaw = record?.threadId;
  const stoppedThreadIds: readonly number[] = !allThreadsStopped && typeof threadIdRaw === 'number' && Number.isInteger(threadIdRaw)
    ? [threadIdRaw]
    : [];
  return { paused: true, stoppedReason, stoppedThreadIds };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
