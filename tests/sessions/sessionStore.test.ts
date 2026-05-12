import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { SessionStore } from '../../src/sessions/sessionStore.js';

let dapCliHome: string;
let originalStderrWrite: typeof process.stderr.write;
let stderrCaptured: string;

beforeEach(async () => {
  dapCliHome = await fs.mkdtemp(path.join(os.tmpdir(), 'dap-cli-session-store-'));
  stderrCaptured = '';
  originalStderrWrite = process.stderr.write.bind(process.stderr);
  process.stderr.write = ((chunk: string | Uint8Array) => {
    stderrCaptured += typeof chunk === 'string' ? chunk : chunk.toString();
    return true;
  });
});

afterEach(async () => {
  process.stderr.write = originalStderrWrite;
  await fs.rm(dapCliHome, { recursive: true, force: true });
});

describe('SessionStore.read corrupt-file recovery', () => {
  // Round 6 R6-F regression: a corrupt sessions.json (truncated, junk,
  // hand-edited) used to crash serve-controller with an opaque
  // internal_error/exit-70 and the parent `start` then timed out with a
  // misleading `controller_unavailable`. Heal the bad file by renaming it
  // out of the way so the controller can come up and the user can find
  // the original.
  test('renames corrupt JSON aside and returns empty state', async () => {
    const stateDir = path.join(dapCliHome, 'state');
    await fs.mkdir(stateDir, { recursive: true });
    const storePath = path.join(stateDir, 'sessions.json');
    await fs.writeFile(storePath, 'this is not json {{{', 'utf8');

    const store = new SessionStore({ dapCliHome });
    const data = await store.read();

    expect(data).toEqual({ sessions: [] });
    await expect(fs.access(storePath)).rejects.toMatchObject({ code: 'ENOENT' });
    const siblings = await fs.readdir(stateDir);
    expect(siblings.some(name => name.startsWith('sessions.json.corrupt.') && name.endsWith('.bak'))).toBe(true);
    expect(stderrCaptured).toContain('sessions.json was unparseable');
  });

  test('renames schema-invalid JSON aside and returns empty state', async () => {
    const stateDir = path.join(dapCliHome, 'state');
    await fs.mkdir(stateDir, { recursive: true });
    const storePath = path.join(stateDir, 'sessions.json');
    // Valid JSON but does not match the SessionStore schema (sessions must be array of records).
    await fs.writeFile(storePath, JSON.stringify({ sessions: 'not-an-array' }), 'utf8');

    const store = new SessionStore({ dapCliHome });
    const data = await store.read();

    expect(data).toEqual({ sessions: [] });
    const siblings = await fs.readdir(stateDir);
    expect(siblings.some(name => name.startsWith('sessions.json.corrupt.') && name.endsWith('.bak'))).toBe(true);
  });
});
