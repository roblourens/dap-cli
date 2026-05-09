// Phase 10 plan 03 (DIAG-01): best-effort detector that catches
// js-debug helper-process attaches even on code paths that bypass
// 10-01's auto-route (--adapter / --json invocations without --config).
//
// When js-debug spawns a helper process during a misrouted launch, the
// helper's OS-reported parent PID equals the dapDebugServer adapter PID.
// On every DAP `process` event from a js-debug attach session, the
// detector resolves `body.systemProcessId`'s ppid via `ps` and, if it
// matches the adapter PID, injects a synthetic `dapCli.helperProcessWarning`
// event into the session's event cache.
//
// Synthetic events use `seq: -1`. DAP guarantees positive sequence numbers
// from adapters, so this prefix is unambiguously dap-cli-internal.

import { execFile } from 'node:child_process';
import type { DapEventMessage } from '../protocol/dapMessages.js';

export interface HelperProcessDetectorOptions {
  sessionId: string;
  adapterId: string;
  adapterPid: number | undefined;
  mode: 'launch' | 'attach';
  eventCache: { append(sessionId: string, event: DapEventMessage): unknown };
  lookupPpid?: (pid: number) => Promise<number | undefined>;
}

export interface HelperProcessDetector {
  handleEvent(event: DapEventMessage): void;
  dispose(): void;
}

export interface HelperProcessWarningBody {
  code: 'helper_process_detected';
  helperPid: number;
  adapterPid: number;
  sessionId: string;
  hint: string;
}

export const helperProcessWarningEventName = 'dapCli.helperProcessWarning';

const helperHint = 'Likely attached to an adapter-spawned helper process; you probably meant `dap-cli attach`, not `dap-cli launch`.';

export function createHelperProcessDetector(options: HelperProcessDetectorOptions): HelperProcessDetector {
  const lookup = options.lookupPpid ?? defaultLookupPpid;
  const fired = new Set<string>();
  let disposed = false;

  return {
    handleEvent(event: DapEventMessage): void {
      if (disposed) {
        return;
      }
      if (options.mode !== 'attach') {
        return;
      }
      if (options.adapterId !== 'js-debug') {
        return;
      }
      if (options.adapterPid === undefined) {
        return;
      }
      if (event.event !== 'process') {
        return;
      }
      const body = event.body;
      if (typeof body !== 'object' || body === null) {
        return;
      }
      const systemProcessId = (body as { systemProcessId?: unknown }).systemProcessId;
      if (typeof systemProcessId !== 'number' || !Number.isInteger(systemProcessId) || systemProcessId <= 0) {
        return;
      }
      const adapterPid = options.adapterPid;
      const key = `${options.sessionId}:${systemProcessId}`;
      if (fired.has(key)) {
        return;
      }
      fired.add(key);

      void lookup(systemProcessId).then(
        ppid => {
          if (disposed) {
            return;
          }
          if (ppid === undefined || ppid !== adapterPid) {
            return;
          }
          const warningBody: HelperProcessWarningBody = {
            code: 'helper_process_detected',
            helperPid: systemProcessId,
            adapterPid,
            sessionId: options.sessionId,
            hint: helperHint,
          };
          options.eventCache.append(options.sessionId, {
            type: 'event',
            seq: -1,
            event: helperProcessWarningEventName,
            body: warningBody,
          });
        },
        () => {
          // Lookup failures are silent — best-effort diagnostic.
        },
      );
    },
    dispose(): void {
      disposed = true;
      fired.clear();
    },
  };
}

const psLookupTimeoutMs = 1000;

export function defaultLookupPpid(pid: number): Promise<number | undefined> {
  if (process.platform === 'win32') {
    return Promise.resolve(undefined);
  }
  if (!Number.isInteger(pid) || pid <= 0) {
    return Promise.resolve(undefined);
  }

  return new Promise(resolve => {
    execFile('ps', ['-o', 'ppid=', '-p', String(pid)], { timeout: psLookupTimeoutMs }, (error, stdout) => {
      if (error !== null) {
        resolve(undefined);
        return;
      }
      const trimmed = stdout.trim();
      if (trimmed.length === 0) {
        resolve(undefined);
        return;
      }
      const parsed = Number.parseInt(trimmed, 10);
      if (!Number.isFinite(parsed) || parsed <= 0) {
        resolve(undefined);
        return;
      }
      resolve(parsed);
    });
  });
}
