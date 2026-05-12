import { CliError } from './errors.js';
import type { JsonMetaInput, JsonWritable } from './output.js';
import { writeJsonFailure, writeJsonSuccess } from './output.js';
import type { OutputMode } from './outputMode.js';
import { renderHumanFailure, renderHumanSuccess } from './humanOutput.js';

export interface OutputWriter {
  success<T>(data: T, meta: JsonMetaInput): void;
  failure(error: CliError, meta: JsonMetaInput): void;
  warn(message: string): void;
}

export interface CreateOutputWriterOptions {
  stream?: JsonWritable;
  errorStream?: JsonWritable;
  resolveMode: () => OutputMode;
}

export function createOutputWriter(options: CreateOutputWriterOptions): OutputWriter {
  const stream = options.stream ?? process.stdout;
  const errorStream = options.errorStream ?? process.stderr;
  const pendingWarnings: string[] = [];

  const drainWarnings = (): string[] => {
    const drained = pendingWarnings.slice();
    pendingWarnings.length = 0;
    return drained;
  };

  const withWarnings = (meta: JsonMetaInput): JsonMetaInput => {
    const drained = drainWarnings();
    if (drained.length === 0) {
      return meta;
    }
    const existing = meta.warnings ?? [];
    return { ...meta, warnings: [...existing, ...drained] };
  };

  return {
    success<T>(data: T, meta: JsonMetaInput): void {
      if (options.resolveMode() === 'human') {
        drainWarnings();
        stream.write(renderHumanSuccess(data, meta));
        return;
      }

      writeJsonSuccess(data, withWarnings(meta), stream);
    },
    failure(error: CliError, meta: JsonMetaInput): void {
      let mode: OutputMode;
      try {
        mode = options.resolveMode();
      } catch (modeError) {
        if (modeError instanceof CliError) {
          writeJsonFailure(modeError, withWarnings(meta), stream);
          return;
        }
        throw modeError;
      }

      if (mode === 'human') {
        drainWarnings();
        stream.write(renderHumanFailure(error, meta));
        return;
      }

      writeJsonFailure(error, withWarnings(meta), stream);
    },
    warn(message: string): void {
      let mode: OutputMode;
      try {
        mode = options.resolveMode();
      } catch {
        // If mode resolution throws (e.g. invalid env), fall back to stderr so we don't lose the warning.
        errorStream.write(`${message}\n`);
        return;
      }
      if (mode === 'json') {
        pendingWarnings.push(message);
        return;
      }
      errorStream.write(`${message}\n`);
    },
  };
}