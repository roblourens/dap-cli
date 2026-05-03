import { Command } from 'commander';
import type { JsonWritable } from './output.js';
import { registerControllerCommands } from './commands/controller.js';
import { registerDapAliasCommands } from './commands/dapAliases.js';
import { registerDapCoreCommands } from './commands/dapCore.js';
import { registerGeneratedDapCommands } from './commands/dapGenerated.js';
import { registerSessionCommands } from './commands/sessions.js';

export interface ProgramOptions {
  stdout?: JsonWritable;
}

export function createProgram(options: ProgramOptions = {}): Command {
  const program = new Command();
  const stdout = options.stdout ?? process.stdout;

  program
    .name('dap-cli')
    .description('Agent-facing Debug Adapter Protocol CLI')
    .showHelpAfterError()
    .exitOverride();

  registerControllerCommands(program, stdout);
  registerSessionCommands(program, stdout);
  registerDapCoreCommands(program, stdout);
  registerGeneratedDapCommands(program, stdout);
  registerDapAliasCommands(program, stdout);

  return program;
}
