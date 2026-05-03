import type { Command } from 'commander';
import { createControllerClient } from '../../controller/client.js';
import { type JsonWritable, writeJsonSuccess } from '../output.js';

export function registerSessionCommands(program: Command, stdout: JsonWritable): void {
  program
    .command('sessions')
    .description('List known debug sessions')
    .action(async () => {
      await withController(stdout, 'sessions', async client => client.request('sessions.list'));
    });

  program
    .command('use')
    .argument('<name>', 'session name or id')
    .description('Set the active debug session')
    .action(async (name: string) => {
      await withController(stdout, 'use', async client => client.request('sessions.target', { name }));
    });

  program
    .command('detach')
    .option('--name <name>', 'session name or id')
    .description('Detach from a debug session')
    .action(async (options: { name?: string }) => {
      await withController(stdout, 'detach', async client => client.request('sessions.detach', createNameParams(options.name)));
    });

  program
    .command('close')
    .option('--name <name>', 'session name or id')
    .description('Close a debug session')
    .action(async (options: { name?: string }) => {
      await withController(stdout, 'close', async client => client.request('sessions.close', createNameParams(options.name)));
    });

  program
    .command('cleanup')
    .option('--force', 'allow cleanup of stale session state')
    .description('Clean up stale session state')
    .action(async () => {
      await withController(stdout, 'cleanup', async client => client.request('sessions.cleanup'));
    });
}

async function withController<T>(stdout: JsonWritable, command: string, callback: (client: Awaited<ReturnType<typeof createControllerClient>>) => Promise<T>): Promise<void> {
  const client = await createControllerClient({ dapCliHome: process.env.DAP_CLI_HOME });
  try {
    writeJsonSuccess(await callback(client), { command }, stdout);
  } finally {
    await client.close();
  }
}

function createNameParams(name: string | undefined): { name?: string } {
  return name === undefined ? {} : { name };
}
