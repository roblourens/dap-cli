import * as readline from 'node:readline/promises';
import { usageError } from './errors.js';

export interface ConfirmOptions {
  readonly question: string;
  readonly details?: readonly string[];
  readonly assumeYes: boolean;
  readonly stdin?: NodeJS.ReadStream;
  readonly stderr?: NodeJS.WriteStream;
}

export async function confirm(options: ConfirmOptions): Promise<true> {
  if (options.assumeYes) {
    return true;
  }

  const stdin = options.stdin ?? process.stdin;
  const stderr = options.stderr ?? process.stderr;

  if (stdin.isTTY !== true) {
    throw usageError('Confirmation required but stdin is not a TTY.', {
      code: 'provision_consent_required',
      diagnostics: [
        options.question,
        'Re-run with `--yes` / `-y` or set `DAP_CLI_ASSUME_YES=1` to pre-consent.',
      ],
      data: { question: options.question },
    });
  }

  stderr.write(`\n${options.question}\n`);
  for (const line of options.details ?? []) {
    stderr.write(`  ${line}\n`);
  }
  stderr.write('Proceed? [y/N] ');

  const rl = readline.createInterface({ input: stdin, output: stderr, terminal: false });
  try {
    const answer = (await rl.question('')).trim().toLowerCase();
    if (answer === 'y' || answer === 'yes') {
      return true;
    }
    throw usageError('User declined provisioning consent.', {
      code: 'provision_consent_declined',
      diagnostics: ['Re-run with `--yes` to pre-consent.'],
      data: { question: options.question },
    });
  } finally {
    rl.close();
  }
}

export function resolveAssumeYes(cliYes: boolean | undefined, env: NodeJS.ProcessEnv): boolean {
  if (cliYes === true) {
    return true;
  }
  const value = env.DAP_CLI_ASSUME_YES;
  return value === '1' || value === 'true';
}
