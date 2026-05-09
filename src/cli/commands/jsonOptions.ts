import { usageError } from '../errors.js';

export function parseJsonOption(value: string): unknown {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    throw usageError('Invalid JSON argument.', { code: 'invalid_json' });
  }
}

export function parseJsonRecordOption(value: string): Record<string, unknown> {
  const parsed = parseJsonOption(value);
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw usageError('JSON argument must be an object.', { code: 'invalid_json' });
  }
  return parsed as Record<string, unknown>;
}