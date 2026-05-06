import type { Command } from 'commander';
import { createControllerClient } from '../../controller/client.js';
import { usageError } from '../errors.js';
import type { OutputWriter } from '../outputWriter.js';

export function registerSessionCommands(program: Command, output: OutputWriter): void {
  program
    .command('sessions')
    .description('List known debug sessions (child sessions are hidden by default; use --show-children to include them)')
    .option('--show-children', 'include child sessions (e.g. js-debug pwa-chrome page-level children) in the listing')
    .option('--all', 'alias for --show-children')
    .action(async (options: { showChildren?: boolean; all?: boolean }) => {
      const includeChildren = options.showChildren === true || options.all === true;
      await withController(output, 'sessions', async client => client.request('sessions.list', { includeChildren }));
    });

  program
    .command('use')
    .argument('<name>', 'session name or id')
    .description('Set the active debug session')
    .action(async (name: string) => {
      await withController(output, 'use', async client => client.request('sessions.target', { name }));
    });

  program
    .command('detach')
    .option('--name <name>', 'session name or id')
    .description('Detach from a debug session')
    .action(async (options: { name?: string }) => {
      await withController(output, 'detach', async client => client.request('sessions.detach', createNameParams(options.name)));
    });

  program
    .command('close')
    .argument('[name]', 'session name or id (positional, optional)')
    .option('--name <name>', 'session name or id')
    .description('Close a debug session')
    .action(async (positional: string | undefined, options: { name?: string }) => {
      if (positional !== undefined && options.name !== undefined && positional !== options.name) {
        throw usageError('Provide --name OR positional id, not both.');
      }
      const target = positional ?? options.name;
      // Hand-driven gap H-8b (round 3): the controller's close handler runs
      // terminateRuntime which waits up to ~6s (1s exit + 200ms SIGTERM +
      // 200ms SIGKILL plus a `disconnect` round-trip that can stretch to
      // the DAP client's 5s timeout when an adapter is wedged). The default
      // IPC client timeout is 5s, so close was returning controller_request_timeout
      // exit 7 even though the underlying cascade finished cleanly. Give close
      // a 60s ceiling so the command surfaces the real outcome (orphanPids etc.)
      // instead of a misleading timeout. Other commands keep the 5s default.
      await withController(output, 'close', async client => client.request('sessions.close', createNameParams(target)), { timeoutMs: closeControllerRequestTimeoutMs });
    });

  program
    .command('cleanup')
    .option('--force', 'alias for --purge (legacy)')
    .option('--purge', 'also remove records for sessions dap-cli does not own')
    .description('Clean up stale session state')
    .action(async (options: { force?: boolean; purge?: boolean }) => {
      const purge = options.purge === true || options.force === true;
      await withController(output, 'cleanup', async client => client.request('sessions.cleanup', { purge }));
    });
}

async function withController<T>(output: OutputWriter, command: string, callback: (client: Awaited<ReturnType<typeof createControllerClient>>) => Promise<T>, options: { timeoutMs?: number } = {}): Promise<void> {
  const client = await createControllerClient({ dapCliHome: process.env.DAP_CLI_HOME, ...(options.timeoutMs !== undefined ? { timeoutMs: options.timeoutMs } : {}) });
  try {
    output.success(await callback(client), { command });
  } finally {
    await client.close();
  }
}

const closeControllerRequestTimeoutMs = 60_000;

function createNameParams(name: string | undefined): { name?: string } {
  return name === undefined ? {} : { name };
}
