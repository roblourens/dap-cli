import { controllerError, dapError, timeoutError, type CliError } from '../cli/errors.js';

export function controllerUnavailable(message = 'dap-cli controller is unavailable.'): CliError {
  return controllerError(message, {
    code: 'controller_unavailable',
    diagnostics: ['Run `dap-cli start` and retry the command.'],
  });
}

export function staleControllerDiscovery(message = 'dap-cli controller discovery is stale.'): CliError {
  return controllerError(message, {
    code: 'controller_stale_discovery',
    // Plan 05-20 (gap H-4): plain cleanup-without-purge only touches
    // per-session records, not the controller discovery file. Steer the
    // user at the right recovery surface (`stop-controller`) rather than
    // at a no-op cleanup.
    diagnostics: ['Remove stale state with `dap-cli stop-controller` or start a new controller.'],
  });
}

export function malformedControllerJson(message = 'Malformed controller JSON request.'): CliError {
  return controllerError(message, {
    code: 'controller_malformed_json',
    diagnostics: ['Controller IPC requests must be newline-delimited JSON objects.'],
  });
}

export function controllerRequestTimeout(message = 'Timed out waiting for dap-cli controller response.'): CliError {
  return timeoutError(message, {
    code: 'controller_request_timeout',
    diagnostics: ['Check whether the controller process is still healthy.'],
  });
}

/**
 * Plan 05-20 (gap H-7): paused-state-required DAP requests (stackTrace,
 * scopes, variables) get a structured `thread_not_paused` error when the
 * controller can prove the thread isn't paused (via the H-1 paused
 * projection). The recovery hint must NEVER suggest `dap-cli start` for
 * this case — the controller is already running; the issue is that the
 * caller invoked a paused-only DAP request against a running thread.
 */
export function threadNotPaused(options: { sessionId?: string; sessionName?: string; command?: string } = {}): CliError {
  const nameRef = options.sessionName ?? '<name>';
  return dapError('Thread is not paused.', {
    code: 'thread_not_paused',
    diagnostics: [
      `Poll \`dap-cli events --name ${nameRef} --include stopped\` until a stopped event appears, then retry. Use --stop-on-entry on launch to pause immediately.`,
    ],
    ...(options.sessionId !== undefined ? { sessionId: options.sessionId } : {}),
    ...(options.command !== undefined ? { request: { command: options.command } } : {}),
  });
}

export function breakpointBindingGuidance(options: { sourcePath?: string | undefined; adapterId?: string | undefined } = {}): string[] {
  if (options.adapterId !== 'js-debug' && options.adapterId !== undefined) {
    return [];
  }

  const diagnostics = [
    'Breakpoint verification timed out. Check the js-debug trace log for source-map resolution details.',
  ];
  if (options.sourcePath?.endsWith('.ts') === true || options.sourcePath?.endsWith('.tsx') === true) {
    diagnostics.push('TypeScript source breakpoints usually require `sourceMaps: true` and an `outFiles` glob that matches emitted JavaScript, for example `"outFiles": ["${workspaceFolder}/dist/**/*.js"]`.');
    diagnostics.push('If the launch uses ts-node, make sure source maps are enabled for the runtime; if it uses Jest, prefer `--runInBand --no-coverage` while debugging.');
  }
  return diagnostics;
}
