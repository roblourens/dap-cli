import { existsSync } from 'node:fs';
import path from 'node:path';
import type { AdapterDescriptor } from '../descriptor.js';
import { getDapCliAdaptersDir } from '../../config/paths.js';
import { usageError } from '../../cli/errors.js';

export function createJsDebugDescriptor(jsDebugPath?: string): AdapterDescriptor {
  const dapServerPath = jsDebugPath ?? resolveDefaultJsDebugPath();
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

function resolveDefaultJsDebugPath(): string {
  const candidates = [
    path.join(getDapCliAdaptersDir(), 'js-debug', 'src', 'dapDebugServer.js'),
    path.join(process.cwd(), 'node_modules', 'vscode-js-debug', 'src', 'dapDebugServer.js'),
  ];

  const found = candidates.find(candidate => existsSync(candidate));
  if (found !== undefined) {
    return found;
  }

  throw usageError('js-debug adapter is not installed.', {
    code: 'js_debug_not_found',
    diagnostics: [
      'Run npm run setup-adapters to provision js-debug, or see docs/ADAPTER-SETUP.md for advanced manual provisioning.',
      `Checked: ${candidates.join(', ')}`,
    ],
  });
}