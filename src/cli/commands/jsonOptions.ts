import { usageError } from '../errors.js';

export function parseJsonOption(value: string): unknown {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    throw usageError('Invalid JSON argument.', { code: 'invalid_json' });
  }
}