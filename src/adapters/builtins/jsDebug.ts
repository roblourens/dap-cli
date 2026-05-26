import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { AdapterDescriptor } from '../descriptor.js';
import { getDapCliAdaptersDir } from '../../config/paths.js';
import { resolveAssumeYes } from '../../cli/confirm.js';
import { provisionAdapter } from '../provision/index.js';

export async function createJsDebugDescriptor(jsDebugPath?: string): Promise<AdapterDescriptor> {
  const dapServerPath = jsDebugPath ?? (await resolveDefaultJsDebugPath());
  return {
    id: 'js-debug',
    label: 'JavaScript Debug Adapter (Node, Chrome, Electron)',
    transport: {
      kind: 'server',
      command: process.execPath,
      args: [dapServerPath, '${port}', '127.0.0.1'],
      host: '127.0.0.1',
    },
  };
}

/**
 * Plan 05-21 (gap H-5): inject `trace.logFile` into a js-debug launch/attach
 * config so js-debug writes its built-in DAP/CDP wire trace to a discoverable
 * file. js-debug emits DAP traffic over its socket transport rather than
 * stderr, so the log file `socketAdapter.ts` populates from stderr is
 * legitimately empty for healthy sessions. This sibling trace file gives
 * users a real wire log to inspect when something goes wrong.
 *
 * Behavior:
 * - If `config` is not a plain object, returns it unchanged (let the adapter
 *   reject the malformed config itself).
 * - If the user already provided a `trace` field, leaves it alone — explicit
 *   user config always wins.
 * - Otherwise sets `trace = { stdio: false, logFile: <logDir>/js-debug-trace-<ts>.log }`.
 *
 * The recognized keys inside `trace` were verified against the bundled
 * `dapDebugServer.js` in the provisioned js-debug install: `stdio` (boolean,
 * mirror to stdio) and `logFile` (string, JSON log path). There is no
 * `level` field — verbosity is controlled per-tag via the `trace` object's
 * other keys, but the defaults already include `cdp.send/receive` and
 * `dap.send/receive`, which is what we want for diagnostic capture.
 */
export function applyJsDebugTraceDefaults(config: unknown, logDir: string): unknown {
  if (typeof config !== 'object' || config === null || Array.isArray(config)) {
    return config;
  }
  const record = config as Record<string, unknown>;
  if (record.trace !== undefined) {
    return record;
  }
  return {
    ...record,
    trace: {
      stdio: false,
      logFile: path.join(logDir, `js-debug-trace-${Date.now()}.log`),
    },
  };
}

async function pathExists(candidate: string): Promise<boolean> {
  try {
    await fs.access(candidate);
    return true;
  } catch {
    return false;
  }
}

async function resolveDefaultJsDebugPath(): Promise<string> {
  const env = process.env;
  const adaptersDir = getDapCliAdaptersDir(env);
  const provisionedEntrypoint = path.join(adaptersDir, 'js-debug', 'src', 'dapDebugServer.js');
  const repoEntrypoint = path.join(process.cwd(), 'node_modules', 'vscode-js-debug', 'src', 'dapDebugServer.js');

  if (await pathExists(provisionedEntrypoint)) {
    return provisionedEntrypoint;
  }
  if (await pathExists(repoEntrypoint)) {
    return repoEntrypoint;
  }

  // Binary missing — trigger lazy provisioning (D-17).
  const result = await provisionAdapter('js-debug', {
    env,
    assumeYes: resolveAssumeYes(undefined, env),
    adaptersDir,
  });
  return result.entrypoint;
}