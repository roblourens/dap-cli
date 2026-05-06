import { CliError } from './errors.js';
import type { JsonMetaInput, JsonWritable } from './output.js';
import { writeJsonFailure, writeJsonSuccess } from './output.js';
import type { OutputMode } from './outputMode.js';
import { renderHumanFailure, renderHumanSuccess } from './humanOutput.js';

export interface OutputWriter {
  success<T>(data: T, meta: JsonMetaInput): void;
  failure(error: CliError, meta: JsonMetaInput): void;
}

export interface CreateOutputWriterOptions {
  stream?: JsonWritable;
  resolveMode: () => OutputMode;
}

export function createOutputWriter(options: CreateOutputWriterOptions): OutputWriter {
  const stream = options.stream ?? process.stdout;

  return {
    success<T>(data: T, meta: JsonMetaInput): void {
      if (options.resolveMode() === 'human') {
        stream.write(renderHumanSuccess(data, meta));
        return;
      }

      writeJsonSuccess(data, meta, stream);
    },
    failure(error: CliError, meta: JsonMetaInput): void {
      let mode: OutputMode;
      try {
        mode = options.resolveMode();
      } catch (modeError) {
        if (modeError instanceof CliError) {
          writeJsonFailure(modeError, meta, stream);
          return;
        }
        throw modeError;
      }

      if (mode === 'human') {
        stream.write(renderHumanFailure(error, meta));
        return;
      }

      writeJsonFailure(error, meta, stream);
    },
  };
}