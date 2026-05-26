import { ExitCode } from './exitCodes.js';

export type CliErrorCategory = 'usage' | 'controller' | 'session' | 'dap' | 'adapter' | 'timeout' | 'internal';

export interface CliErrorOptions {
  code?: string;
  diagnostics?: readonly string[];
  sessionId?: string;
  request?: CliErrorRequestContext;
  adapter?: CliErrorAdapterContext;
  // Plan 05-19 (gap H-3): structured machine-readable recovery data so JSON
  // consumers can act on errors like child_session_not_targetable without
  // string-parsing diagnostics. Kept generic; specific shapes live with
  // their error sites.
  data?: Readonly<Record<string, unknown>>;
  cause?: unknown;
}

export interface CliErrorRequestContext {
  command: string;
  seq?: number;
}

export interface CliErrorAdapterContext {
  descriptorId?: string;
  pid?: number;
  stderrTail?: readonly string[];
  logPath?: string;
}

export class CliError extends Error {
  public readonly code: string;
  public readonly category: CliErrorCategory;
  public readonly exitCode: ExitCode;
  public readonly diagnostics: readonly string[];
  public readonly sessionId: string | undefined;
  public readonly request: CliErrorRequestContext | undefined;
  public readonly adapter: CliErrorAdapterContext | undefined;
  public readonly data: Readonly<Record<string, unknown>> | undefined;

  public constructor(message: string, category: CliErrorCategory, exitCode: ExitCode, options: CliErrorOptions = {}) {
    super(message, options.cause !== undefined ? { cause: options.cause } : undefined);
    this.name = 'CliError';
    this.code = options.code ?? `${category}_error`;
    this.category = category;
    this.exitCode = exitCode;
    this.diagnostics = normalizeDiagnostics(message, options.diagnostics);
    this.sessionId = options.sessionId;
    this.request = options.request;
    this.adapter = options.adapter;
    this.data = options.data;
  }
}

export function usageError(message: string, options?: CliErrorOptions): CliError {
  return new CliError(message, 'usage', ExitCode.Usage, options);
}

export function controllerError(message: string, options?: CliErrorOptions): CliError {
  return new CliError(message, 'controller', ExitCode.Controller, options);
}

export function sessionError(message: string, options?: CliErrorOptions): CliError {
  return new CliError(message, 'session', ExitCode.Session, options);
}

export function dapError(message: string, options?: CliErrorOptions): CliError {
  return new CliError(message, 'dap', ExitCode.Dap, options);
}

export function adapterError(message: string, options?: CliErrorOptions): CliError {
  return new CliError(message, 'adapter', ExitCode.Adapter, options);
}

export function timeoutError(message: string, options?: CliErrorOptions): CliError {
  return new CliError(message, 'timeout', ExitCode.Timeout, options);
}

export function internalError(message: string, options?: CliErrorOptions): CliError {
  return new CliError(message, 'internal', ExitCode.Internal, options);
}

export function toInternalCliError(error: unknown): CliError {
  if (error instanceof CliError) {
    return error;
  }

  return internalError('Unexpected internal error', {
    code: 'internal_error',
    diagnostics: ['The command failed unexpectedly. Re-run with diagnostics enabled after controller logging is available.'],
  });
}

function normalizeDiagnostics(message: string, diagnostics: readonly string[] | undefined): readonly string[] {
  const normalized = diagnostics?.filter(diagnostic => diagnostic.trim().length > 0) ?? [];

  return normalized.length > 0 ? normalized : [message];
}
