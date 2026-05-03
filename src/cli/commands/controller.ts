import { spawn } from 'node:child_process';
import type { Command } from 'commander';
import { CliError } from '../errors.js';
import { createControllerClient } from '../../controller/client.js';
import { controllerUnavailable } from '../../controller/diagnostics.js';
import { isControllerAlive, readControllerDiscovery, removeControllerDiscovery, type ControllerDiscovery } from '../../controller/ipc.js';
import { startControllerServer, type ControllerStatus } from '../../controller/server.js';
import { type JsonWritable, writeJsonSuccess } from '../output.js';

interface ControllerStartResult {
  started: boolean;
  pid: number;
  endpoint: ControllerDiscovery['endpoint'];
  stateDir: string;
  logDir: string;
}

export function registerControllerCommands(program: Command, stdout: JsonWritable): void {
  program
    .command('start')
    .description('Start the persistent controller for debug sessions')
    .action(async () => {
      writeJsonSuccess(await startControllerProcess(), { command: 'start' }, stdout);
    });

  program
    .command('status')
    .option('--name <name>', 'session name or id')
    .description('Poll session status (running, stopped, terminated)')
    .addHelpText('after', `

Examples:
  $ dap-cli status
  $ dap-cli status --name demo
`)
    .action(async (options: { name?: string }) => {
      const client = await createControllerClient({ dapCliHome: process.env.DAP_CLI_HOME });
      try {
        const status = await requestSessionOrControllerStatus(client, options.name);
        writeJsonSuccess(status, { command: 'status' }, stdout);
      } finally {
        await client.close();
      }
    });

  program
    .command('stop')
    .option('--name <name>', 'session name or id')
    .description('Stop a debug session, or stop the controller when no session is selected')
    .action(async (options: { name?: string }) => {
      const client = await createControllerClient({ dapCliHome: process.env.DAP_CLI_HOME });
      try {
        const result = await requestSessionOrControllerStop(client, options.name);
        writeJsonSuccess(result, { command: 'stop' }, stdout);
      } finally {
        await client.close();
      }
    });

  program
    .command('serve-controller', { hidden: true })
    .action(async () => {
      const server = await startControllerServer({ dapCliHome: process.env.DAP_CLI_HOME });
      await server.closed;
    });
}

async function requestSessionOrControllerStatus(client: Awaited<ReturnType<typeof createControllerClient>>, name: string | undefined): Promise<unknown> {
  try {
    return await client.request('sessions.status', name === undefined ? undefined : { name });
  } catch (error) {
    if (name === undefined && isMissingSessionSelection(error)) {
      return client.request<ControllerStatus>('controller.status');
    }

    throw error;
  }
}

async function requestSessionOrControllerStop(client: Awaited<ReturnType<typeof createControllerClient>>, name: string | undefined): Promise<unknown> {
  try {
    return await client.request('sessions.stop', name === undefined ? undefined : { name });
  } catch (error) {
    if (name === undefined && isMissingSessionSelection(error)) {
      return client.request<{ stopped: boolean }>('controller.shutdown');
    }

    throw error;
  }
}

function isMissingSessionSelection(error: unknown): boolean {
  return error instanceof CliError && (error.code === 'no_sessions' || error.code === 'no_active_session');
}

async function startControllerProcess(): Promise<ControllerStartResult> {
  const existingDiscovery = await readControllerDiscovery({ dapCliHome: process.env.DAP_CLI_HOME });
  if (existingDiscovery !== undefined) {
    if (await isControllerAlive(existingDiscovery)) {
      return toStartResult(false, existingDiscovery);
    }

    await removeControllerDiscovery({ dapCliHome: process.env.DAP_CLI_HOME });
  }

  const entrypoint = process.env.DAP_CLI_ENTRYPOINT ?? process.argv[1];
  if (entrypoint === undefined || entrypoint.length === 0) {
    throw controllerUnavailable('Unable to resolve dap-cli entrypoint for controller start.');
  }

  const child = spawn(process.execPath, [entrypoint, 'serve-controller'], {
    detached: true,
    env: process.env,
    stdio: 'ignore',
  });
  child.unref();

  const discovery = await waitForControllerDiscovery();
  return toStartResult(true, discovery);
}

async function waitForControllerDiscovery(): Promise<ControllerDiscovery> {
  const deadline = Date.now() + 5_000;

  while (Date.now() < deadline) {
    const discovery = await readControllerDiscovery({ dapCliHome: process.env.DAP_CLI_HOME });
    if (discovery !== undefined && await isControllerAlive(discovery)) {
      return discovery;
    }

    await delay(50);
  }

  throw controllerUnavailable('Timed out waiting for dap-cli controller to start.');
}

function toStartResult(started: boolean, discovery: ControllerDiscovery): ControllerStartResult {
  return {
    started,
    pid: discovery.pid,
    endpoint: discovery.endpoint,
    stateDir: discovery.stateDir,
    logDir: discovery.logDir,
  };
}

async function delay(ms: number): Promise<void> {
  await new Promise(resolve => setTimeout(resolve, ms));
}
