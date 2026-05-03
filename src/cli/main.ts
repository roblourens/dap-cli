import type { Command } from 'commander';
import { CliError, internalError, usageError } from './errors.js';
import { ExitCode } from './exitCodes.js';
import type { JsonWritable } from './output.js';
import { writeJsonFailure } from './output.js';
import { createProgram } from './program.js';

export interface CliStreams {
  stdout: JsonWritable;
  stderr: JsonWritable;
}

export async function main(args: readonly string[], program: Command | undefined = undefined, streams: CliStreams = process): Promise<ExitCode> {
  const command = getCommandName(args);
  const activeProgram = program ?? createProgram({ stdout: streams.stdout });

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
      writeJsonFailure(error, { command }, streams.stdout);
      return error.exitCode;
    }

    if (isCommanderError(error)) {
      const cliError = usageError(error.message, {
        code: 'usage_error',
        diagnostics: [error.message],
      });
      writeJsonFailure(cliError, { command }, streams.stdout);
      return cliError.exitCode;
    }

    const cliError = internalError('Unexpected internal error', {
      code: 'internal_error',
      diagnostics: ['The command failed unexpectedly.'],
    });
    writeJsonFailure(cliError, { command }, streams.stdout);
    return cliError.exitCode;
  }
}

function isCommanderError(error: unknown): error is Error {
  return error instanceof Error && error.name === 'CommanderError';
}

function isCommanderHelp(error: unknown): boolean {
  return isCommanderError(error) && 'code' in error && error.code === 'commander.helpDisplayed';
}

function getCommandName(args: readonly string[]): string {
  const commandParts = args.filter(arg => !arg.startsWith('-')).slice(0, 2);

  return commandParts.length > 0 ? commandParts.join(' ') : 'dap-cli';
}
