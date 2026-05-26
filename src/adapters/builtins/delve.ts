import { promises as fs } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import type { AdapterDescriptor } from '../descriptor.js';
import { usageError } from '../../cli/errors.js';
import { getDapCliAdaptersDir } from '../../config/paths.js';
import { resolveAssumeYes } from '../../cli/confirm.js';
import { provisionAdapter } from '../provision/index.js';

export async function createDelveDescriptor(delvePath?: string): Promise<AdapterDescriptor> {
  const resolvedDelvePath = delvePath ?? (await resolveDefaultDelvePath());
  assertSupportedProvisionedDelveToolchain(resolvedDelvePath);
  const toolchainEnvironment = createGoToolchainEnvironment();

  return {
    id: 'delve',
    label: 'Go Debug Adapter (Delve)',
    transport: {
      kind: 'server',
      command: resolvedDelvePath,
      args: ['dap', '--listen=127.0.0.1:${port}'],
      host: '127.0.0.1',
      ...(toolchainEnvironment === undefined ? {} : { env: toolchainEnvironment }),
    },
  };
}

function createGoToolchainEnvironment(): Record<string, string> | undefined {
  const goToolchain = process.env.GOTOOLCHAIN;
  return goToolchain === undefined || goToolchain.length === 0 ? undefined : { GOTOOLCHAIN: goToolchain };
}

async function pathExists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

async function resolveDefaultDelvePath(env: NodeJS.ProcessEnv = process.env): Promise<string> {
  // 1. Honor a usable PATH `dlv` first to respect user-managed installs.
  if (delveIsUsable('dlv')) {
    return 'dlv';
  }

  // 2. Honor an already-provisioned binary at the canonical adapters location.
  const provisionedDelve = getProvisionedDelvePath(env);
  if ((await pathExists(provisionedDelve)) && delveIsUsable(provisionedDelve)) {
    return provisionedDelve;
  }

  // 3. Lazily provision via the shared adapter installer.
  const adaptersDir = getDapCliAdaptersDir(env);
  const result = await provisionAdapter('delve', {
    env,
    assumeYes: resolveAssumeYes(undefined, env),
    adaptersDir,
  });
  return result.entrypoint;
}

function getProvisionedDelvePath(env: NodeJS.ProcessEnv = process.env): string {
  return path.join(getDapCliAdaptersDir(env), 'delve', process.platform === 'win32' ? 'dlv.exe' : 'dlv');
}

function delveIsUsable(command: string): boolean {
  const result = spawnSync(command, ['version'], { encoding: 'utf8' });
  return result.status === 0;
}

function assertSupportedProvisionedDelveToolchain(delvePath: string): void {
  const delveVersion = readCommandVersion(delvePath, ['version'], /Version:\s*v?([0-9]+\.[0-9]+\.[0-9]+)/i);
  if (delveVersion !== '1.26.3') {
    return;
  }

  const goVersion = readCommandVersion('go', ['version'], /go version go([0-9]+\.[0-9]+(?:\.[0-9]+)?)/i);
  if (goVersion === undefined || compareNumericVersions(goVersion, '1.24.0') >= 0) {
    return;
  }

  throw usageError('Provisioned Delve is incompatible with the active Go toolchain.', {
    code: 'delve_go_version_incompatible',
    diagnostics: [
      `Delve ${delveVersion} requires Go 1.24+ for debuggee builds; current \`go\` is ${goVersion}.`,
      'Use `GOTOOLCHAIN=go1.24.0` for the dap-cli launch, or update the active Go installation.',
      'Run `go version` in the same shell/environment used for dap-cli to confirm the effective toolchain.',
    ],
  });
}

function readCommandVersion(command: string, args: readonly string[], pattern: RegExp): string | undefined {
  const result = spawnSync(command, [...args], { encoding: 'utf8' });
  if (result.status !== 0) {
    return undefined;
  }

  const output = `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
  return pattern.exec(output)?.[1];
}

function compareNumericVersions(left: string, right: string): number {
  const leftParts = left.split('.').map(part => Number.parseInt(part, 10));
  const rightParts = right.split('.').map(part => Number.parseInt(part, 10));
  const width = Math.max(leftParts.length, rightParts.length);
  for (let index = 0; index < width; index += 1) {
    const leftPart = leftParts[index] ?? 0;
    const rightPart = rightParts[index] ?? 0;
    if (leftPart !== rightPart) {
      return leftPart - rightPart;
    }
  }

  return 0;
}
