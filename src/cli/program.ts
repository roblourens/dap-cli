import { createRequire } from 'node:module';
import { Command } from 'commander';
import type { JsonWritable } from './output.js';
import { registerControllerCommands } from './commands/controller.js';
import { registerDapAliasCommands } from './commands/dapAliases.js';
import { registerDapCoreCommands } from './commands/dapCore.js';
import { registerGeneratedDapCommands } from './commands/dapGenerated.js';
import { registerSessionCommands } from './commands/sessions.js';

const require = createRequire(import.meta.url);
const packageJson: unknown = require('../../package.json');

export interface ProgramOptions {
  stdout?: JsonWritable;
}

export function createProgram(options: ProgramOptions = {}): Command {
  const program = new Command();
  const stdout = options.stdout ?? process.stdout;

  program
    .name('dap-cli')
    .description('A Debug Adapter Protocol CLI for agents. Control debug sessions from shell commands.')
    .version(getPackageVersion(packageJson))
    .showHelpAfterError()
    .exitOverride();

  registerControllerCommands(program, stdout);
  registerSessionCommands(program, stdout);
  registerDapCoreCommands(program, stdout);
  registerGeneratedDapCommands(program, stdout);
  registerDapAliasCommands(program, stdout);

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

function getPackageVersion(rawPackageJson: unknown): string {
  if (typeof rawPackageJson === 'object' && rawPackageJson !== null && 'version' in rawPackageJson) {
    const version = rawPackageJson.version;
    if (typeof version === 'string') {
      return version;
    }
  }

  return '0.0.0';
}
