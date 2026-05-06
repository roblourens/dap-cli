import { usageError } from './errors.js';

export type OutputMode = 'json' | 'human';

export interface ResolveOutputModeInput {
  cliHuman: boolean | undefined;
  env?: NodeJS.ProcessEnv;
}

const trueValues = new Set(['1', 'true', 'yes', 'on', 'human']);
const falseValues = new Set(['0', 'false', 'no', 'off', 'json']);

export function resolveOutputMode(input: ResolveOutputModeInput): OutputMode {
  if (input.cliHuman === true) {
    return 'human';
  }
  if (input.cliHuman === false) {
    return 'json';
  }

  return parseHumanEnv(input.env ?? process.env) ? 'human' : 'json';
}

function parseHumanEnv(env: NodeJS.ProcessEnv): boolean {
  const rawValue = env.DAP_CLI_HUMAN;
  if (rawValue === undefined) {
    return false;
  }

  const value = rawValue.trim().toLowerCase();
  if (value.length === 0) {
    return false;
  }
  if (trueValues.has(value)) {
    return true;
  }
  if (falseValues.has(value)) {
    return false;
  }

  throw usageError('Invalid DAP_CLI_HUMAN value.', {
    code: 'invalid_output_mode_env',
    diagnostics: ['Use DAP_CLI_HUMAN=1 for human output or DAP_CLI_HUMAN=0 for JSON output.'],
  });
}