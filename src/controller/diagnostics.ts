import { controllerError, timeoutError, type CliError } from '../cli/errors.js';

export function controllerUnavailable(message = 'dap-cli controller is unavailable.'): CliError {
  return controllerError(message, {
    code: 'controller_unavailable',
    diagnostics: ['Run dap-cli start and retry the command.'],
  });
}

export function staleControllerDiscovery(message = 'dap-cli controller discovery is stale.'): CliError {
  return controllerError(message, {
    code: 'controller_stale_discovery',
    diagnostics: ['Remove stale state with dap-cli cleanup or start a new controller.'],
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
