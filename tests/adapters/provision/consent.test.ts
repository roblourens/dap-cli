import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { hasConsentMarker, writeConsentMarker } from '../../../src/adapters/provision/consent.js';

describe('consent markers', () => {
  let workDir: string;

  beforeEach(async () => {
    workDir = await fs.mkdtemp(path.join(os.tmpdir(), 'dap-cli-consent-'));
  });

  afterEach(async () => {
    await fs.rm(workDir, { recursive: true, force: true });
  });

  test('hasConsentMarker returns false before write', async () => {
    expect(await hasConsentMarker(workDir, 'js-debug', '1.99.0')).toBe(false);
  });

  test('write then read round-trips', async () => {
    await writeConsentMarker(workDir, 'js-debug', '1.99.0');
    expect(await hasConsentMarker(workDir, 'js-debug', '1.99.0')).toBe(true);
  });

  test('marker is per-version', async () => {
    await writeConsentMarker(workDir, 'js-debug', '1.99.0');
    expect(await hasConsentMarker(workDir, 'js-debug', '2.0.0')).toBe(false);
  });

  test('marker is per-adapter', async () => {
    await writeConsentMarker(workDir, 'js-debug', '1.99.0');
    expect(await hasConsentMarker(workDir, 'debugpy', '1.99.0')).toBe(false);
  });

  test('write is idempotent', async () => {
    await writeConsentMarker(workDir, 'js-debug', '1.99.0');
    await writeConsentMarker(workDir, 'js-debug', '1.99.0');
    expect(await hasConsentMarker(workDir, 'js-debug', '1.99.0')).toBe(true);
  });
});
