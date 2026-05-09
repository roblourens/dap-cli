import type { Command } from 'commander';
import { CliError, internalError, usageError } from './errors.js';
import { ExitCode } from './exitCodes.js';
import type { JsonWritable } from './output.js';
import { createOutputWriter } from './outputWriter.js';
import { createProgram, getProgramHumanOption } from './program.js';
import { resolveOutputMode } from './outputMode.js';

export interface CliStreams {
  stdout: JsonWritable;
  stderr: JsonWritable;
}

export async function main(args: readonly string[], program: Command | undefined = undefined, streams: CliStreams = process): Promise<ExitCode> {
  const command = getCommandName(args);
  const activeProgram = program ?? createProgram({ stdout: streams.stdout, stderr: streams.stderr });
  const output = createOutputWriter({
    stream: streams.stdout,
    errorStream: streams.stderr,
    resolveMode: () => resolveOutputMode({ cliHuman: getProgramHumanOption(activeProgram), env: process.env }),
  });

  activeProgram.configureOutput({
    writeOut: chunk => { streams.stdout.write(chunk); },
    writeErr: chunk => { streams.stderr.write(chunk); },
  });

  try {
    await activeProgram.parseAsync([...args], { from: 'user' });
    return ExitCode.Success;
  } catch (error) {
    if (isCommanderHelp(error)) {
      return ExitCode.Success;
    }

    if (error instanceof CliError) {
      const cliError = selectRenderableError(error, activeProgram);
      output.failure(cliError, { command });
      return cliError.exitCode;
    }

    if (isCommanderError(error)) {
      const cliError = selectRenderableError(usageError(error.message, {
        code: 'usage_error',
        diagnostics: [error.message],
      }), activeProgram);
      output.failure(cliError, { command });
      return cliError.exitCode;
    }

    const cliError = selectRenderableError(internalError('Unexpected internal error', {
      code: 'internal_error',
      diagnostics: ['The command failed unexpectedly.'],
    }), activeProgram);
    output.failure(cliError, { command });
    return cliError.exitCode;
  }
}

function selectRenderableError(error: CliError, program: Command): CliError {
  try {
    resolveOutputMode({ cliHuman: getProgramHumanOption(program), env: process.env });
    return error;
  } catch (modeError) {
    if (modeError instanceof CliError) {
      return modeError;
    }
    throw modeError;
  }
}

function isCommanderError(error: unknown): error is Error {
  return error instanceof Error && error.name === 'CommanderError';
}

function isCommanderHelp(error: unknown): boolean {
  return isCommanderError(error) && 'code' in error && error.code === 'commander.helpDisplayed';
}

function getCommandName(args: readonly string[]): string {
  const commandParts = args
    .filter(arg => !arg.startsWith('-') && !arg.startsWith('{') && !arg.startsWith('['))
    .slice(0, 2);

  return commandParts.length > 0 ? commandParts.join(' ') : 'dap-cli';
}
