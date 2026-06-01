import path from 'node:path';
import { promises as fs } from 'node:fs';
import type { Command} from 'commander';
import { Option } from 'commander';
import { provisionAdapter, type AdapterId, type ProvisionContext } from '../../adapters/provision/index.js';
import { isCodeLldbRuntimeReady } from '../../adapters/provision/codelldb.js';
import {
  DEBUGPY_VERSION,
  DELVE_VERSION,
  JS_DEBUG_VERSION,
  CODELLDB_VERSION,
} from '../../adapters/provision/checksums.js';
import { hasConsentMarker } from '../../adapters/provision/consent.js';
import { getDapCliAdaptersDir } from '../../config/paths.js';
import { confirm, resolveAssumeYes } from '../confirm.js';
import { CliError, usageError } from '../errors.js';
import type { OutputWriter } from '../outputWriter.js';

const ALL_ADAPTERS: readonly AdapterId[] = ['js-debug', 'debugpy', 'delve', 'codelldb'];

const ADAPTER_VERSIONS: Readonly<Record<AdapterId, string>> = {
  'js-debug': JS_DEBUG_VERSION,
  'debugpy': DEBUGPY_VERSION,
  'delve': DELVE_VERSION,
  'codelldb': CODELLDB_VERSION,
};

export interface SetupAdaptersOptions {
  readonly adapter?: AdapterId;
  readonly assumeYes: boolean;
  readonly env: NodeJS.ProcessEnv;
  readonly stdin?: NodeJS.ReadStream;
  readonly stderr?: NodeJS.WriteStream;
  readonly stdout?: NodeJS.WriteStream;
  readonly output?: OutputWriter;
}

export interface SetupAdapterEntry {
  readonly id: AdapterId;
  readonly version: string;
  readonly status: 'installed' | 'cached' | 'failed';
  readonly installRoot?: string;
  readonly error?: {
    readonly code: string;
    readonly message: string;
    readonly diagnostics: readonly string[];
  };
}

export interface SetupAdaptersResult {
  readonly adapters: readonly SetupAdapterEntry[];
}

function expectedEntrypoint(adaptersDir: string, id: AdapterId): string {
  switch (id) {
    case 'js-debug':
      return path.join(adaptersDir, 'js-debug', 'src', 'dapDebugServer.js');
    case 'debugpy':
      return path.join(
        adaptersDir,
        'debugpy',
        process.platform === 'win32'
          ? path.join('venv', 'Scripts', 'python.exe')
          : path.join('venv', 'bin', 'python'),
      );
    case 'delve':
      return path.join(adaptersDir, 'delve', process.platform === 'win32' ? 'dlv.exe' : 'dlv');
    case 'codelldb':
      return path.join(adaptersDir, 'codelldb', 'extension', 'adapter', 'codelldb');
  }
}

async function pathExists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

function isAdapterId(value: string): value is AdapterId {
  return value === 'js-debug' || value === 'debugpy' || value === 'delve' || value === 'codelldb';
}

async function isRuntimeReady(adaptersDir: string, id: AdapterId): Promise<boolean> {
  return id === 'codelldb'
    ? isCodeLldbRuntimeReady(path.join(adaptersDir, id))
    : pathExists(expectedEntrypoint(adaptersDir, id));
}

export async function runSetupAdaptersAction(opts: SetupAdaptersOptions): Promise<SetupAdaptersResult> {
  const targets: readonly AdapterId[] = opts.adapter !== undefined ? [opts.adapter] : ALL_ADAPTERS;
  const adaptersDir = getDapCliAdaptersDir(opts.env);
  await fs.mkdir(adaptersDir, { recursive: true });

  // Classify pending vs cached BEFORE the consolidated prompt so D-14 holds:
  // a single confirm() names every adapter that will actually be installed.
  const pending: AdapterId[] = [];
  for (const id of targets) {
    const version = ADAPTER_VERSIONS[id];
    const cached =
      (await hasConsentMarker(adaptersDir, id, version)) &&
      (await isRuntimeReady(adaptersDir, id));
    if (!cached) {
      pending.push(id);
    }
  }

  if (pending.length > 0 && !opts.assumeYes) {
    const pendingDescription = pending.map(id => `${id} ${ADAPTER_VERSIONS[id]}`).join(', ');
    await confirm({
      assumeYes: false,
      question: `Install ${pending.length} adapter${pending.length === 1 ? '' : 's'} (${pendingDescription}) into ${adaptersDir}/?`,
      ...(opts.stdin === undefined ? {} : { stdin: opts.stdin }),
      ...(opts.stderr === undefined ? {} : { stderr: opts.stderr }),
    });
  }

  // Outer prompt answered yes (or pre-consent) — suppress per-adapter prompts.
  const innerCtxBase: Omit<ProvisionContext, 'assumeYes'> = {
    env: opts.env,
    adaptersDir,
    ...(opts.stdin === undefined ? {} : { stdin: opts.stdin }),
    ...(opts.stderr === undefined ? {} : { stderr: opts.stderr }),
  };

  const entries: SetupAdapterEntry[] = [];
  for (const id of targets) {
    const version = ADAPTER_VERSIONS[id];
    try {
      const result = await provisionAdapter(id, { ...innerCtxBase, assumeYes: true });
      const entry: SetupAdapterEntry = {
        id,
        version: result.version,
        status: result.fromCache ? 'cached' : 'installed',
        installRoot: result.installRoot,
      };
      entries.push(entry);
      if (opts.output !== undefined) {
        const verb = result.fromCache ? 'already cached' : 'installed';
        opts.output.warn(`${id} ${result.version}: ${verb} (${result.installRoot})`);
      }
    } catch (err) {
      const cliError = err instanceof CliError ? err : null;
      const code = cliError?.code ?? 'internal_error';
      const message = err instanceof Error ? err.message : String(err);
      entries.push({
        id,
        version,
        status: 'failed',
        error: {
          code,
          message,
          diagnostics: cliError?.diagnostics ?? [message],
        },
      });
      if (opts.output !== undefined) {
        opts.output.warn(`${id} ${version}: FAILED (${code})`);
      }
    }
  }

  return { adapters: entries };
}

export function registerSetupAdaptersCommand(program: Command, output: OutputWriter): void {
  program
    .command('setup-adapters')
    .helpGroup('Adapters')
    .description('Install or update built-in debug adapters (js-debug, debugpy, delve, codelldb) into ~/.dap-cli/adapters/')
    .addOption(
      new Option('--adapter <id>', 'install only the named adapter')
        .choices(['js-debug', 'debugpy', 'delve', 'codelldb']),
    )
    .action(async (cmdOpts: { adapter?: string }) => {
      const adapterId = cmdOpts.adapter !== undefined && isAdapterId(cmdOpts.adapter)
        ? cmdOpts.adapter
        : undefined;
      const assumeYes = resolveAssumeYes(undefined, process.env);
      const result = await runSetupAdaptersAction({
        ...(adapterId === undefined ? {} : { adapter: adapterId }),
        assumeYes,
        env: process.env,
        stdin: process.stdin,
        stderr: process.stderr,
        stdout: process.stdout,
        output,
      });

      const failed = result.adapters.filter(a => a.status === 'failed');
      if (failed.length > 0) {
        const failedNames = failed.map(a => `${a.id} (${a.error?.code ?? 'internal_error'})`).join(', ');
        throw usageError(`Adapter setup failed for: ${failedNames}`, {
          code: 'provision_setup_failed',
          diagnostics: failed.flatMap(a => a.error?.diagnostics ?? []),
          data: { adapters: result.adapters },
        });
      }
      output.success(result, { command: 'setup-adapters' });
    });
}
