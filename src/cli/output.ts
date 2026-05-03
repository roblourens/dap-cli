import type { CliError } from './errors.js';

export interface JsonMeta {
  command: string;
  timestamp: string;
}

export interface JsonSuccess<T> {
  ok: true;
  data: T;
  meta: JsonMeta;
}

export interface JsonFailure {
  ok: false;
  error: JsonErrorPayload;
  meta: JsonMeta;
}

export interface JsonErrorPayload {
  code: string;
  category: string;
  message: string;
  exitCode: number;
  diagnostics: readonly string[];
  sessionId?: string;
  request?: {
    command: string;
    seq?: number;
  };
  adapter?: {
    descriptorId?: string;
    pid?: number;
    stderrTail?: readonly string[];
    logPath?: string;
  };
}

export interface JsonMetaInput {
  command: string;
  timestamp?: Date;
}

export interface JsonWritable {
  write(chunk: string): boolean;
}

export function writeJsonSuccess<T>(data: T, meta: JsonMetaInput, stream: JsonWritable = process.stdout): void {
  stream.write(toJsonString({ ok: true, data, meta: createMeta(meta) }));
}

export function writeJsonFailure(error: CliError, meta: JsonMetaInput, stream: JsonWritable = process.stdout): void {
  stream.write(toJsonString({ ok: false, error: toJsonErrorPayload(error), meta: createMeta(meta) }));
}

export function toJsonString(envelope: JsonSuccess<unknown> | JsonFailure): string {
  return `${JSON.stringify(envelope)}\n`;
}

function createMeta(input: JsonMetaInput): JsonMeta {
  return {
    command: input.command,
    timestamp: (input.timestamp ?? new Date()).toISOString(),
  };
}

function toJsonErrorPayload(error: CliError): JsonErrorPayload {
  const payload: JsonErrorPayload = {
    code: error.code,
    category: error.category,
    message: error.message,
    exitCode: error.exitCode,
    diagnostics: error.diagnostics,
  };

  if (error.sessionId !== undefined) {
    payload.sessionId = error.sessionId;
  }
  if (error.request !== undefined) {
    payload.request = error.request;
  }
  if (error.adapter !== undefined) {
    payload.adapter = error.adapter;
  }

  return payload;
}
