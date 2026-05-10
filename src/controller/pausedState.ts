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

/**
 * Snapshot of a single child's paused-state inputs. See
 * {@link combineChildPausedStates}.
 */
export interface ChildPausedSnapshot {
  stoppedThreadIds: ReadonlySet<number>;
  allThreadsStopped: boolean;
  knownThreadIds: ReadonlySet<number>;
  lifecycleEnded: boolean;
  lastStoppedReason: string | undefined;
}

/**
 * Combine per-child paused-state snapshots into the parent SessionRecord's
 * paused-state shape. Phase 18 fixes the pre-existing "last child event wins"
 * mirror in `childSessions.ts` that let a sibling's `terminated` clobber a
 * real `stopped` (S-02 root cause). The union here is the contract the
 * parent's status reflects: paused iff ANY non-terminated child is stopped,
 * with `stoppedThreadIds` = union of stopped thread ids across those
 * children, and `stoppedReason` = the most recently observed reason among
 * children that are currently stopped.
 *
 * `allThreadsStopped` snapshots are expanded to the child's `knownThreadIds`
 * at union time so the parent surfaces every paused thread even when the
 * child reported "all stopped" without enumerating ids.
 */
export function combineChildPausedStates(snapshots: Iterable<ChildPausedSnapshot>):
  | { paused: false }
  | { paused: true; stoppedReason: string; stoppedThreadIds: readonly number[] } {
  const stopped = new Set<number>();
  let lastReason: string | undefined;
  for (const snapshot of snapshots) {
    if (snapshot.lifecycleEnded) {
      continue;
    }
    let childContributed = false;
    if (snapshot.allThreadsStopped) {
      for (const id of snapshot.knownThreadIds) {
        stopped.add(id);
        childContributed = true;
      }
    } else {
      for (const id of snapshot.stoppedThreadIds) {
        stopped.add(id);
        childContributed = true;
      }
    }
    if (snapshot.lastStoppedReason !== undefined && childContributed) {
      lastReason = snapshot.lastStoppedReason;
    }
  }
  if (stopped.size === 0) {
    return { paused: false };
  }
  return { paused: true, stoppedReason: lastReason ?? 'unknown', stoppedThreadIds: [...stopped] };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
