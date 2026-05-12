import { createRequire } from 'node:module';
import { Command } from 'commander';
import type { JsonWritable } from './output.js';
import type { OutputWriter } from './outputWriter.js';
import { resolveOutputMode } from './outputMode.js';
import { createOutputWriter } from './outputWriter.js';
import { registerControllerCommands } from './commands/controller.js';
import { registerDapAliasCommands } from './commands/dapAliases.js';
import { registerDapCoreCommands } from './commands/dapCore.js';
import { registerGeneratedDapCommands } from './commands/dapGenerated.js';
import { registerSessionCommands } from './commands/sessions.js';

const require = createRequire(import.meta.url);
// Path is resolved relative to the bundled dist/index.js, not this source file.
const packageJson: unknown = require('../package.json');

export interface ProgramOptions {
  stdout?: JsonWritable;
  stderr?: JsonWritable;
}

const PROGRAM_OUTPUT_WRITER = Symbol('dap-cli.programOutputWriter');

export function getProgramOutputWriter(program: Command): OutputWriter | undefined {
  return (program as unknown as Record<symbol, OutputWriter | undefined>)[PROGRAM_OUTPUT_WRITER];
}

export function createProgram(options: ProgramOptions = {}): Command {
  const program = new Command();
  const stdout = options.stdout ?? process.stdout;
  const stderr = options.stderr ?? process.stderr;
  const output = createOutputWriter({
    stream: stdout,
    errorStream: stderr,
    resolveMode: () => resolveOutputMode({ cliHuman: getProgramHumanOption(program), isStdoutTTY: stdout.isTTY === true, env: process.env }),
  });
  (program as unknown as Record<symbol, OutputWriter>)[PROGRAM_OUTPUT_WRITER] = output;

  program
    .name('dap-cli')
    .description('A Debug Adapter Protocol CLI for agents. Control debug sessions from shell commands.')
    .version(getPackageVersion(packageJson))
    .option('--human', 'render human-readable output (default when stdout is a TTY and DAP_CLI_HUMAN is set)')
    .option('--no-human', 'render machine-readable JSON output even if DAP_CLI_HUMAN is set or stdout is a TTY')
    .showHelpAfterError()
    .exitOverride();

  registerControllerCommands(program, output);
  registerSessionCommands(program, output);
  registerDapCoreCommands(program, output);
  registerGeneratedDapCommands(program, output);
  registerDapAliasCommands(program, output);

  // Replace commander's default `help [command]` with a variadic walker so
  // `dap-cli help breakpoints set` drills into the subcommand tree (per D-02).
  program.helpCommand(false);
  program
    .command('help [command...]')
    .description('Display help for a command. Pass multiple words to drill into subcommands (e.g. `dap-cli help breakpoints set`).')
    .action((commandPath: string[] | undefined) => {
      const segments = Array.isArray(commandPath) ? commandPath : [];
      if (segments.length === 0) {
        program.outputHelp();
        return;
      }
      let current: Command = program;
      const matched: string[] = [];
      for (const segment of segments) {
        const next = current.commands.find(child => child.name() === segment);
        if (!next) {
          const knownPath = matched.length === 0 ? 'dap-cli' : `dap-cli ${matched.join(' ')}`;
          const requestedPath = `dap-cli ${segments.join(' ')}`;
          const message = `Unknown help target: ${requestedPath}. \`${segment}\` is not a subcommand of \`${knownPath}\`.`;
          // Render the parent's help so the user sees what IS available, then
          // fail through commander's exitOverride so main.ts emits a real
          // usage_error envelope (NOT a help-dispatch one).
          current.outputHelp({ error: true });
          const error = new Error(message);
          error.name = 'CommanderError';
          (error as Error & { code: string; exitCode: number }).code = 'commander.unknownCommand';
          (error as Error & { code: string; exitCode: number }).exitCode = 2;
          throw error;
        }
        matched.push(segment);
        current = next;
      }
      current.outputHelp();
    });

  program.addHelpText('after', `

Examples:
  $ dap-cli start
  $ dap-cli launch --adapter js-debug --program ./app.js
  $ dap-cli status
  $ dap-cli events --after-cursor 0
  $ dap-cli threads
  $ dap-cli stack --thread-id 1
`);

  return program;
}

export function getProgramHumanOption(program: Command): boolean | undefined {
  const options: unknown = program.opts();
  if (typeof options !== 'object' || options === null || !('human' in options)) {
    return undefined;
  }

  const value = options.human;
  return typeof value === 'boolean' ? value : undefined;
}

function getPackageVersion(rawPackageJson: unknown): string {
  if (typeof rawPackageJson === 'object' && rawPackageJson !== null && 'version' in rawPackageJson) {
    const version = rawPackageJson.version;
    if (typeof version === 'string') {
      return version;
    }
  }

  return '0.0.0';
}
