import { createRequire } from 'node:module';
import { Command } from 'commander';
import type { JsonWritable } from './output.js';
import { resolveOutputMode } from './outputMode.js';
import { createOutputWriter } from './outputWriter.js';
import { registerControllerCommands } from './commands/controller.js';
import { registerDapAliasCommands } from './commands/dapAliases.js';
import { registerDapCoreCommands } from './commands/dapCore.js';
import { registerGeneratedDapCommands } from './commands/dapGenerated.js';
import { registerSessionCommands } from './commands/sessions.js';

const require = createRequire(import.meta.url);
const packageJson: unknown = require('../../package.json');

export interface ProgramOptions {
  stdout?: JsonWritable;
  stderr?: JsonWritable;
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
