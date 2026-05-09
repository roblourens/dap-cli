import { promises as fs } from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { startControllerServer, type ControllerServer } from '../../src/controller/server.js';
import { SessionManager } from '../../src/sessions/sessionManager.js';
import { SessionStore } from '../../src/sessions/sessionStore.js';
import { createProgram } from '../../src/cli/program.js';
import { createCliTestEnv, runCli, runCliHuman, type CliTestEnv } from '../helpers/runCli.js';

let testEnv: CliTestEnv;
let server: ControllerServer | undefined;

beforeEach(async () => {
  testEnv = await createCliTestEnv('dap-cli-session-cli-');
});

afterEach(async () => {
  if (server !== undefined) {
    await server.stop();
    server = undefined;
  }
  await testEnv.cleanup();
});

describe('session CLI commands', () => {
  test('lists sessions and inspects status by name', async () => {
    const manager = await SessionManager.create({ dapCliHome: testEnv.dapCliHome });
    await manager.create({ name: 'demo', lifecycle: 'running' });
    server = await startControllerServer({ dapCliHome: testEnv.dapCliHome });

    const sessions = await runCli(['sessions'], { env: testEnv.env });
    expect(sessions.exitCode).toBe(0);
    const sessionsEnvelope = parseJson(sessions.stdout) as { ok: true; data: Array<{ name: string; status: string }> };
    expect(sessionsEnvelope.ok).toBe(true);
    expect(sessionsEnvelope.data.map(session => ({ name: session.name, status: session.status }))).toEqual([{ name: 'demo', status: 'running' }]);

    const status = await runCli(['status', '--name', 'demo'], { env: testEnv.env });
    expect(status.exitCode).toBe(0);
    const statusEnvelope = parseJson(status.stdout) as { ok: true; data: { name: string; status: string } };
    expect(statusEnvelope.ok).toBe(true);
    expect(statusEnvelope.data.name).toBe('demo');
    expect(statusEnvelope.data.status).toBe('running');
  });

  test('sessions supports human output from the environment', async () => {
    const manager = await SessionManager.create({ dapCliHome: testEnv.dapCliHome });
    await manager.create({ name: 'demo', lifecycle: 'running' });
    server = await startControllerServer({ dapCliHome: testEnv.dapCliHome });

    const result = await runCliHuman(['sessions'], { env: { ...testEnv.env, DAP_CLI_HUMAN: '1' } });

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe('');
    expect(result.stdout).toContain('Sessions:');
    expect(result.stdout).toContain('│ ID');
    expect(result.stdout).toContain('│ Name │ Status');
    expect(result.stdout).toContain('│ demo │ running │ unknown │');
    expect(result.stdout).not.toContain('Command:');
    expect(result.stdout).not.toContain('Timestamp:');
    expect(result.stdout).not.toContain('{"ok":true');
  });

  test('uses active session and closes it deterministically', async () => {
    const manager = await SessionManager.create({ dapCliHome: testEnv.dapCliHome });
    await manager.create({ name: 'demo', lifecycle: 'running' });
    server = await startControllerServer({ dapCliHome: testEnv.dapCliHome });

    await expect(runCli(['use', 'demo'], { env: testEnv.env })).resolves.toMatchObject({ exitCode: 0 });
    const closed = await runCli(['close'], { env: testEnv.env });

    expect(closed.exitCode).toBe(0);
    const closedEnvelope = parseJson(closed.stdout) as { ok: true; data: { name: string } };
    expect(closedEnvelope.ok).toBe(true);
    expect(closedEnvelope.data.name).toBe('demo');

    const sessions = await runCli(['sessions'], { env: testEnv.env });
    const sessionsEnvelope = parseJson(sessions.stdout) as { ok: true; data: unknown[] };
    expect(sessionsEnvelope.ok).toBe(true);
    expect(sessionsEnvelope.data).toEqual([]);
  });

  test('a second session with an in-use name is rejected at create time', async () => {
    // Quick task 260504-rp5: name collisions are blocked upstream by
    // SessionManager.create rather than disambiguated downstream. The CLI
    // surface inherits this behavior — there is no public path to produce
    // two non-terminated sessions sharing a `--name`. The defensive
    // `session_ambiguous` branch in resolveTargetSession remains as a guard
    // for corrupt store contents and is not exercised here.
    const manager = await SessionManager.create({ dapCliHome: testEnv.dapCliHome });
    await manager.create({ name: 'demo', lifecycle: 'running' });
    await expect(manager.create({ name: 'demo', lifecycle: 'running' })).rejects.toMatchObject({
      code: 'session_name_in_use',
      category: 'session',
    });
  });

  test('reusing a name after the previous session terminated succeeds', async () => {
    const manager = await SessionManager.create({ dapCliHome: testEnv.dapCliHome });
    const first = await manager.create({ name: 'demo', lifecycle: 'running' });
    await manager.updateLifecycle(first.id, 'terminated');
    const reused = await manager.create({ name: 'demo', lifecycle: 'running' });
    expect(reused.name).toBe('demo');
    expect(reused.id).not.toBe(first.id);
  });

  test('compound member sessions project metadata in sessions and status output', async () => {
    const manager = await SessionManager.create({ dapCliHome: testEnv.dapCliHome });
    await manager.create({
      name: 'VS Code/Launch VS Code Internal',
      lifecycle: 'running',
      compound: {
        id: 'compound-1',
        name: 'VS Code',
        memberName: 'Launch VS Code Internal',
        stopAll: true,
        members: ['Launch VS Code Internal', 'Attach to Main Process'],
      },
    });
    server = await startControllerServer({ dapCliHome: testEnv.dapCliHome });

    const sessions = await runCli(['sessions'], { env: testEnv.env });
    expect(sessions.exitCode).toBe(0);
    const sessionsEnvelope = parseJson(sessions.stdout) as { ok: true; data: Array<{ name: string; targetable?: boolean; compound?: { name: string; memberName: string; stopAll: boolean; members: string[] } }> };
    expect(sessionsEnvelope.data).toEqual([
      expect.objectContaining({
        name: 'VS Code/Launch VS Code Internal',
        compound: {
          id: 'compound-1',
          name: 'VS Code',
          memberName: 'Launch VS Code Internal',
          stopAll: true,
          members: ['Launch VS Code Internal', 'Attach to Main Process'],
        },
      }),
    ]);
    expect(sessionsEnvelope.data[0]?.targetable).not.toBe(false);

    const status = await runCli(['status', '--name', 'VS Code/Launch VS Code Internal'], { env: testEnv.env });
    expect(status.exitCode, JSON.stringify(status)).toBe(0);
    const statusEnvelope = parseJson(status.stdout) as { ok: true; data: { name: string; compound?: { name: string; memberName: string; stopAll: boolean; members: string[] } } };
    expect(statusEnvelope.data.compound).toMatchObject({ name: 'VS Code', memberName: 'Launch VS Code Internal', stopAll: true });
  });

  test('duplicate live name rejection applies to derived compound member names', async () => {
    const manager = await SessionManager.create({ dapCliHome: testEnv.dapCliHome });
    await manager.create({
      name: 'VS Code/Launch VS Code Internal',
      lifecycle: 'running',
      compound: { id: 'compound-1', name: 'VS Code', memberName: 'Launch VS Code Internal', stopAll: true, members: ['Launch VS Code Internal'] },
    });

    await expect(manager.create({
      name: 'VS Code/Launch VS Code Internal',
      lifecycle: 'running',
      compound: { id: 'compound-2', name: 'VS Code', memberName: 'Launch VS Code Internal', stopAll: true, members: ['Launch VS Code Internal'] },
    })).rejects.toMatchObject({ code: 'session_name_in_use' });
  });

  test('old session store records without compound metadata still load', async () => {
    const store = new SessionStore({ dapCliHome: testEnv.dapCliHome });
    await fs.mkdir(path.dirname(store.path), { recursive: true });
    await fs.writeFile(store.path, `${JSON.stringify({
      sessions: [{
        id: 'sess_old',
        name: 'old-session',
        adapter: 'fake',
        lifecycle: 'running',
        createdAt: '2026-05-06T00:00:00.000Z',
        updatedAt: '2026-05-06T00:00:00.000Z',
        ownedAdapter: { stderrTail: [], startedByDapCli: false },
      }],
    })}\n`, 'utf8');

    await expect(store.read()).resolves.toMatchObject({ sessions: [{ name: 'old-session' }] });
  });

  test('session store records with compound metadata validate and round-trip', async () => {
    const store = new SessionStore({ dapCliHome: testEnv.dapCliHome });
    await store.write({
      sessions: [{
        id: 'sess_compound',
        name: 'VS Code/Renderer',
        adapter: 'fake',
        lifecycle: 'running',
        createdAt: '2026-05-06T00:00:00.000Z',
        updatedAt: '2026-05-06T00:00:00.000Z',
        ownedAdapter: { stderrTail: [], startedByDapCli: false },
        compound: { id: 'compound-1', name: 'VS Code', memberName: 'Renderer', stopAll: true, members: ['Renderer', 'Main'] },
      }],
    });

    await expect(store.read()).resolves.toMatchObject({
      sessions: [{
        name: 'VS Code/Renderer',
        compound: { id: 'compound-1', name: 'VS Code', memberName: 'Renderer', stopAll: true, members: ['Renderer', 'Main'] },
      }],
    });
  });

  test('cleanup leaves sessions empty after terminating an owned adapter', async () => {
    const manager = await SessionManager.create({ dapCliHome: testEnv.dapCliHome });
    // Seed a session that looks like dap-cli started its adapter, but the pid is
    // bogus so SIGTERM gets ESRCH and cleanup treats it as already dead.
    await manager.create({
      name: 'owned-stale',
      lifecycle: 'running',
      ownedAdapter: { startedByDapCli: true, pid: 999_999, stderrTail: [] },
    });
    server = await startControllerServer({ dapCliHome: testEnv.dapCliHome });

    const cleanup = await runCli(['cleanup'], { env: testEnv.env });
    expect(cleanup.exitCode, JSON.stringify(cleanup)).toBe(0);

    const sessions = await runCli(['sessions'], { env: testEnv.env });
    expect(sessions.exitCode).toBe(0);
    const sessionsEnvelope = parseJson(sessions.stdout) as { ok: true; data: unknown[] };
    expect(sessionsEnvelope.data).toEqual([]);
  });

  test('cleanup --purge removes records the manager does not own', async () => {
    const manager = await SessionManager.create({ dapCliHome: testEnv.dapCliHome });
    await manager.create({
      name: 'foreign-stale',
      lifecycle: 'running',
      ownedAdapter: { startedByDapCli: false, stderrTail: [] },
    });
    server = await startControllerServer({ dapCliHome: testEnv.dapCliHome });

    const cleanup = await runCli(['cleanup', '--purge'], { env: testEnv.env });
    expect(cleanup.exitCode, JSON.stringify(cleanup)).toBe(0);

    const sessions = await runCli(['sessions'], { env: testEnv.env });
    const sessionsEnvelope = parseJson(sessions.stdout) as { ok: true; data: unknown[] };
    expect(sessionsEnvelope.data).toEqual([]);
  });

  test('cleanup without --purge leaves records the manager does not own', async () => {
    const manager = await SessionManager.create({ dapCliHome: testEnv.dapCliHome });
    await manager.create({
      name: 'foreign-keep',
      lifecycle: 'running',
      ownedAdapter: { startedByDapCli: false, stderrTail: [] },
    });
    server = await startControllerServer({ dapCliHome: testEnv.dapCliHome });

    const cleanup = await runCli(['cleanup'], { env: testEnv.env });
    expect(cleanup.exitCode, JSON.stringify(cleanup)).toBe(0);

    const sessions = await runCli(['sessions'], { env: testEnv.env });
    const sessionsEnvelope = parseJson(sessions.stdout) as { ok: true; data: Array<{ name: string }> };
    expect(sessionsEnvelope.data.map(s => s.name)).toEqual(['foreign-keep']);
  });

  test('close accepts a positional session id', async () => {
    const manager = await SessionManager.create({ dapCliHome: testEnv.dapCliHome });
    const created = await manager.create({ name: 'positional-demo', lifecycle: 'running' });
    server = await startControllerServer({ dapCliHome: testEnv.dapCliHome });

    const closed = await runCli(['close', created.id], { env: testEnv.env });
    expect(closed.exitCode, JSON.stringify(closed)).toBe(0);
    const closedEnvelope = parseJson(closed.stdout) as { ok: true; data: { id: string } };
    expect(closedEnvelope.data.id).toBe(created.id);

    const sessions = await runCli(['sessions'], { env: testEnv.env });
    const sessionsEnvelope = parseJson(sessions.stdout) as { ok: true; data: unknown[] };
    expect(sessionsEnvelope.data).toEqual([]);
  });

  test('close rejects mismatched positional id and --name', async () => {
    const manager = await SessionManager.create({ dapCliHome: testEnv.dapCliHome });
    await manager.create({ name: 'demo', lifecycle: 'running' });
    server = await startControllerServer({ dapCliHome: testEnv.dapCliHome });

    const result = await runCli(['close', 'demo', '--name', 'other'], { env: testEnv.env });
    expect(result.exitCode).toBe(2); // ExitCode.Usage
    const envelope = parseJson(result.stdout) as { ok: false; error: { category: string } };
    expect(envelope.error.category).toBe('usage');
  });

  // Plan 05-19 (gap H-3): child sessions are hidden by default; --show-children
  // (and --all alias) opt back in. Targeting a child returns a structured
  // child_session_not_targetable error with parent recovery info, not the
  // misleading session_unavailable: No DAP runtime is attached.
  describe('child session listing + targeting (gap H-3)', () => {
    test('sessions hides children by default', async () => {
      const manager = await SessionManager.create({ dapCliHome: testEnv.dapCliHome });
      const parent = await manager.create({ name: 'pwa-parent', lifecycle: 'running' });
      await manager.registerChild({ parent_session_id: parent.id, name: 'pwa-parent#child', lifecycle: 'running' });
      server = await startControllerServer({ dapCliHome: testEnv.dapCliHome });

      const result = await runCli(['sessions'], { env: testEnv.env });
      expect(result.exitCode).toBe(0);
      const envelope = parseJson(result.stdout) as { ok: true; data: Array<{ id: string; name: string; parent_session_id?: string; targetable?: boolean }> };
      expect(envelope.data.map(s => s.name)).toEqual(['pwa-parent']);
      // No targetable: false should leak onto the root summary.
      expect(envelope.data[0]?.targetable).not.toBe(false);
    });

    test('sessions --show-children includes children with targetable: false', async () => {
      const manager = await SessionManager.create({ dapCliHome: testEnv.dapCliHome });
      const parent = await manager.create({ name: 'pwa-parent', lifecycle: 'running' });
      const child = await manager.registerChild({ parent_session_id: parent.id, name: 'pwa-parent#child', lifecycle: 'running' });
      server = await startControllerServer({ dapCliHome: testEnv.dapCliHome });

      const result = await runCli(['sessions', '--show-children'], { env: testEnv.env });
      expect(result.exitCode).toBe(0);
      const envelope = parseJson(result.stdout) as { ok: true; data: Array<{ id: string; name: string; parent_session_id?: string; targetable?: boolean }> };
      expect(envelope.data.map(s => s.id).sort()).toEqual([parent.id, child.id].sort());
      const childRow = envelope.data.find(s => s.id === child.id);
      expect(childRow?.targetable).toBe(false);
      expect(childRow?.parent_session_id).toBe(parent.id);
    });

    test('sessions --all is an alias for --show-children', async () => {
      const manager = await SessionManager.create({ dapCliHome: testEnv.dapCliHome });
      const parent = await manager.create({ name: 'pwa-parent', lifecycle: 'running' });
      const child = await manager.registerChild({ parent_session_id: parent.id, name: 'pwa-parent#child', lifecycle: 'running' });
      server = await startControllerServer({ dapCliHome: testEnv.dapCliHome });

      const result = await runCli(['sessions', '--all'], { env: testEnv.env });
      expect(result.exitCode).toBe(0);
      const envelope = parseJson(result.stdout) as { ok: true; data: Array<{ id: string }> };
      expect(envelope.data.map(s => s.id).sort()).toEqual([parent.id, child.id].sort());
    });

    test('targeting a child by id returns child_session_not_targetable', async () => {
      const manager = await SessionManager.create({ dapCliHome: testEnv.dapCliHome });
      const parent = await manager.create({ name: 'pwa-parent', lifecycle: 'running' });
      const child = await manager.registerChild({ parent_session_id: parent.id, name: 'pwa-parent#child', lifecycle: 'running' });
      server = await startControllerServer({ dapCliHome: testEnv.dapCliHome });

      // status is the cheapest routable surface; gap H-3 calls out events/threads
      // too — they all flow through the same controller-side gate.
      const result = await runCli(['status', '--name', child.id], { env: testEnv.env });
      expect(result.exitCode, JSON.stringify(result)).not.toBe(0);
      const envelope = parseJson(result.stdout) as {
        ok: false;
        error: {
          code: string;
          category: string;
          diagnostics: string[];
          data?: { childSessionId?: string; parentSessionId?: string; parentName?: string };
        };
      };
      expect(envelope.error.code).toBe('child_session_not_targetable');
      expect(envelope.error.category).toBe('session');
      expect(envelope.error.diagnostics.join('\n')).toContain('pwa-parent');
      expect(envelope.error.data).toMatchObject({
        childSessionId: child.id,
        parentSessionId: parent.id,
        parentName: 'pwa-parent',
      });
    });

    test('targeting a child by parent#hex name returns child_session_not_targetable (not session_unavailable)', async () => {
      const manager = await SessionManager.create({ dapCliHome: testEnv.dapCliHome });
      const parent = await manager.create({ name: 'pwa-parent', lifecycle: 'running' });
      await manager.registerChild({ parent_session_id: parent.id, name: 'pwa-parent#abc123', lifecycle: 'running' });
      server = await startControllerServer({ dapCliHome: testEnv.dapCliHome });

      const result = await runCli(['status', '--name', 'pwa-parent#abc123'], { env: testEnv.env });
      expect(result.exitCode, JSON.stringify(result)).not.toBe(0);
      const envelope = parseJson(result.stdout) as { ok: false; error: { code: string } };
      expect(envelope.error.code).toBe('child_session_not_targetable');
    });

    test('targeting a non-existent name still returns session_not_found', async () => {
      const manager = await SessionManager.create({ dapCliHome: testEnv.dapCliHome });
      const parent = await manager.create({ name: 'pwa-parent', lifecycle: 'running' });
      await manager.registerChild({ parent_session_id: parent.id, name: 'pwa-parent#child', lifecycle: 'running' });
      server = await startControllerServer({ dapCliHome: testEnv.dapCliHome });

      const result = await runCli(['status', '--name', 'definitely-not-a-real-session'], { env: testEnv.env });
      expect(result.exitCode).not.toBe(0);
      const envelope = parseJson(result.stdout) as { ok: false; error: { code: string } };
      expect(envelope.error.code).toBe('session_not_found');
    });

    test('use <child-name> also returns child_session_not_targetable', async () => {
      const manager = await SessionManager.create({ dapCliHome: testEnv.dapCliHome });
      const parent = await manager.create({ name: 'pwa-parent', lifecycle: 'running' });
      const child = await manager.registerChild({ parent_session_id: parent.id, name: 'pwa-parent#child', lifecycle: 'running' });
      server = await startControllerServer({ dapCliHome: testEnv.dapCliHome });

      const result = await runCli(['use', child.id], { env: testEnv.env });
      expect(result.exitCode).not.toBe(0);
      const envelope = parseJson(result.stdout) as { ok: false; error: { code: string } };
      expect(envelope.error.code).toBe('child_session_not_targetable');
    });

    // Plan 05-26 (gap H-3a): the new parent-name routing layer adds
    // read-side routing for thread-scoped commands. The 05-19 child gate
    // (`child_session_not_targetable`) MUST still fire when a user
    // explicitly types a child name into a thread-scoped command. The two
    // layers are orthogonal: 05-19 gates direct child targeting at runtime
    // resolution; 05-26 routes parent-name requests to children. Verify
    // both `stack` (alias) and `dap continue` (generated DAP command)
    // surface the gate, since both flow through the same controller-side
    // assertNotChildSession call before any DAP routing.
    test('thread-scoped commands against a child name return child_session_not_targetable (H-3a regression guard)', async () => {
      const manager = await SessionManager.create({ dapCliHome: testEnv.dapCliHome });
      const parent = await manager.create({ name: 'pwa-parent', lifecycle: 'running' });
      await manager.registerChild({ parent_session_id: parent.id, name: 'pwa-parent#abc123', lifecycle: 'running' });
      server = await startControllerServer({ dapCliHome: testEnv.dapCliHome });

      const stack = await runCli(['stack', '--name', 'pwa-parent#abc123', '--thread-id', '1'], { env: testEnv.env });
      expect(stack.exitCode, JSON.stringify(stack)).not.toBe(0);
      const stackEnvelope = parseJson(stack.stdout) as { ok: false; error: { code: string } };
      expect(stackEnvelope.error.code).toBe('child_session_not_targetable');

      const continueResult = await runCli(
        ['dap', 'continue', '--name', 'pwa-parent#abc123', '--json', '{"threadId":1}'],
        { env: testEnv.env },
      );
      expect(continueResult.exitCode, JSON.stringify(continueResult)).not.toBe(0);
      const continueEnvelope = parseJson(continueResult.stdout) as { ok: false; error: { code: string } };
      expect(continueEnvelope.error.code).toBe('child_session_not_targetable');
    });

    // Plan 15-02 (CHILD-ERR-01): the events surface MUST route through the
    // same child-session gate as the other public commands. analysis2.md
    // observed `total: 0` for `events --name <child>`, which implied either
    // a stale build or a bypass of `assertNotChildSession` on the events
    // path. recentEvents already calls resolveRuntime → assertNotChildSession,
    // so these tests primarily lock the behavior in place against future
    // regressions; if any fail, the events.recent path needs to be re-routed
    // through the gate.
    test('events --name <child-id> returns child_session_not_targetable', async () => {
      const manager = await SessionManager.create({ dapCliHome: testEnv.dapCliHome });
      const parent = await manager.create({ name: 'pwa-parent', lifecycle: 'running' });
      const child = await manager.registerChild({ parent_session_id: parent.id, name: 'pwa-parent#child', lifecycle: 'running' });
      server = await startControllerServer({ dapCliHome: testEnv.dapCliHome });

      const result = await runCli(['events', '--name', child.id], { env: testEnv.env });
      expect(result.exitCode, JSON.stringify(result)).not.toBe(0);
      const envelope = parseJson(result.stdout) as {
        ok: false;
        error: {
          code: string;
          category: string;
          data?: { childSessionId?: string; parentSessionId?: string; parentName?: string };
        };
      };
      expect(envelope.error.code).toBe('child_session_not_targetable');
      expect(envelope.error.category).toBe('session');
      expect(envelope.error.data).toMatchObject({
        childSessionId: child.id,
        parentSessionId: parent.id,
        parentName: 'pwa-parent',
      });
    });

    test('events --name <parent#hex> for events also returns child_session_not_targetable', async () => {
      const manager = await SessionManager.create({ dapCliHome: testEnv.dapCliHome });
      const parent = await manager.create({ name: 'pwa-parent', lifecycle: 'running' });
      await manager.registerChild({ parent_session_id: parent.id, name: 'pwa-parent#abc123', lifecycle: 'running' });
      server = await startControllerServer({ dapCliHome: testEnv.dapCliHome });

      const result = await runCli(['events', '--name', 'pwa-parent#abc123'], { env: testEnv.env });
      expect(result.exitCode, JSON.stringify(result)).not.toBe(0);
      const envelope = parseJson(result.stdout) as {
        ok: false;
        error: { code: string; data?: { parentSessionId?: string } };
      };
      expect(envelope.error.code).toBe('child_session_not_targetable');
      expect(envelope.error.data?.parentSessionId).toBe(parent.id);
    });

    test('events --name <unknown> still returns session_not_found', async () => {
      const manager = await SessionManager.create({ dapCliHome: testEnv.dapCliHome });
      const parent = await manager.create({ name: 'pwa-parent', lifecycle: 'running' });
      await manager.registerChild({ parent_session_id: parent.id, name: 'pwa-parent#child', lifecycle: 'running' });
      server = await startControllerServer({ dapCliHome: testEnv.dapCliHome });

      const result = await runCli(['events', '--name', 'definitely-not-a-real-session'], { env: testEnv.env });
      expect(result.exitCode).not.toBe(0);
      const envelope = parseJson(result.stdout) as { ok: false; error: { code: string } };
      expect(envelope.error.code).toBe('session_not_found');
    });
  });

  test('every dap-cli suggestion in error diagnostics parses through commander', async () => {
    // Trigger every diagnostic class we can without spinning up a real adapter,
    // then grep for backtick-wrapped `dap-cli ...` substrings and assert each
    // parses through a fresh commander program. This is the long-term defense
    // against gap-6 (recovery hints whose syntax doesn't match the CLI).
    const manager = await SessionManager.create({ dapCliHome: testEnv.dapCliHome });
    // Quick task 260504-rp5: name collisions are now blocked at create time
    // (`session_name_in_use`) rather than disambiguated downstream, so we
    // can no longer seed the `session_ambiguous` diagnostic via the public
    // API. The remaining triggers still cover three distinct diagnostic
    // classes, which is enough for the >=3 assertion below.
    // Seed a record with no runtime so session_unavailable fires.
    const stale = await manager.create({
      name: 'stale-runtime',
      lifecycle: 'running',
      makeActive: false,
      ownedAdapter: { startedByDapCli: true, pid: 999_999, stderrTail: [] },
    });
    server = await startControllerServer({ dapCliHome: testEnv.dapCliHome });

    const triggers: ReadonlyArray<readonly string[]> = [
      ['threads'],                                     // no_active_session
      ['threads', '--name', 'does-not-exist'],         // session_not_found
      ['threads', '--name', stale.name],               // session_unavailable
    ];

    const seen = new Set<string>();
    for (const args of triggers) {
      const result = await runCli(args, { env: testEnv.env });
      expect(result.exitCode, args.join(' ')).not.toBe(0);
      const envelope = parseJson(result.stdout) as { ok: false; error: { diagnostics: string[] } };
      for (const diagnostic of envelope.error.diagnostics) {
        for (const command of extractDapCliSuggestions(diagnostic)) {
          seen.add(command);
        }
      }
    }

    // Sanity: we must have caught at least one suggestion per relevant diagnostic.
    expect(seen.size, `extracted suggestions: ${[...seen].join(' | ')}`).toBeGreaterThanOrEqual(3);

    for (const command of seen) {
      const tokens = tokenizeSuggestion(command);
      const program = createProgram();
      program.exitOverride();
      // Disable action handlers — we only want to validate parse-shape, not run anything.
      stripActions(program);
      try {
        await program.parseAsync(tokens, { from: 'user' });
      } catch (error) {
        // Commander throws CommanderError with codes like commander.unknownOption /
        // commander.excessArguments / commander.help. Help is fine, parse failures are not.
        const code = isCommanderError(error) ? error.code : '';
        if (code === '' || (code !== 'commander.help' && code !== 'commander.helpDisplayed' && code !== 'commander.version')) {
          throw new Error(`Suggestion "dap-cli ${command}" failed commander parse (${code || 'unknown'}): ${(error as Error).message}`);
        }
      }
    }
  });

  // Plan 05-23 (gap H-8): the JSON envelope returned by `dap-cli close` MUST
  // surface `data.orphanPids` (and a parallel `data.warnings` entry) so users
  // can recover from incomplete teardown without silently leaking processes.
  // Clean teardown returns empty arrays; mocked-orphan teardown enumerates
  // PIDs.
  describe('close JSON envelope (gap H-8)', () => {
    test('clean close returns empty orphanPids and no warnings', async () => {
      server = await startControllerServer({ dapCliHome: testEnv.dapCliHome });

      const launch = await runCli(
        ['launch', '--adapter', 'fake', '--script', 'stopped-on-entry', '--name', 'h8-clean-cli'],
        { env: testEnv.env },
      );
      expect(launch.exitCode, JSON.stringify(launch)).toBe(0);

      const close = await runCli(['close', '--name', 'h8-clean-cli'], { env: testEnv.env });
      expect(close.exitCode, JSON.stringify(close)).toBe(0);
      const closeEnvelope = parseJson(close.stdout) as {
        ok: true;
        data: { name: string; orphanPids: number[]; warnings: string[] };
      };
      expect(closeEnvelope.ok).toBe(true);
      expect(closeEnvelope.data.name).toBe('h8-clean-cli');
      expect(closeEnvelope.data.orphanPids).toEqual([]);
      expect(closeEnvelope.data.warnings).toEqual([]);
    }, 20_000);

    test('close surfaces orphanPids when isProcessAlive keeps reporting alive', async () => {
      const signalledTargets: number[] = [];
      server = await startControllerServer({
        dapCliHome: testEnv.dapCliHome,
        signalProcess: target => { signalledTargets.push(target); },
        isProcessAlive: () => true,
      });

      const launch = await runCli(
        ['launch', '--adapter', 'fake', '--script', 'stopped-on-entry', '--name', 'h8-orphan-cli'],
        { env: testEnv.env },
      );
      expect(launch.exitCode, JSON.stringify(launch)).toBe(0);

      const close = await runCli(['close', '--name', 'h8-orphan-cli'], { env: testEnv.env });
      expect(close.exitCode, JSON.stringify(close)).toBe(0);
      const closeEnvelope = parseJson(close.stdout) as {
        ok: true;
        data: { name: string; orphanPids: number[]; warnings: string[] };
      };
      expect(closeEnvelope.data.orphanPids).toHaveLength(1);
      const orphanPid = closeEnvelope.data.orphanPids[0];
      expect(typeof orphanPid).toBe('number');
      expect(orphanPid).toBeGreaterThan(0);
      expect(closeEnvelope.data.warnings).toEqual([`orphan_processes_remain: ${orphanPid}`]);

      // Cleanup: kill the real fake adapter we held alive via the mock.
      for (const target of signalledTargets) {
        try { process.kill(Math.abs(target), 'SIGKILL'); } catch { /* ignore */ }
      }
    }, 20_000);
  });
});

function extractDapCliSuggestions(diagnostic: string): string[] {
  // Backtick-wrapped: `dap-cli ...` — the canonical, machine-extractable form.
  const matches: string[] = [];
  const regex = /`dap-cli ([^`]+)`/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(diagnostic)) !== null) {
    if (match[1] !== undefined) {
      matches.push(match[1].trim());
    }
  }
  return matches;
}

function tokenizeSuggestion(command: string): string[] {
  // Split on whitespace; placeholders like <id>, <name> stay as-is and commander
  // accepts them as positional arguments / option values.
  return command.split(/\s+/).filter(token => token.length > 0);
}

function stripActions(program: { commands: ReadonlyArray<{ commands?: ReadonlyArray<unknown> }> }): void {
  // Replace each command's action with a no-op so parseAsync doesn't trigger
  // network calls or controller IPC during the meta-test.
  const visit = (cmd: unknown): void => {
    const c = cmd as { _actionHandler?: unknown; action?: (handler: () => void) => unknown; commands?: ReadonlyArray<unknown> };
    if (typeof c.action === 'function') {
      c.action(() => undefined);
    }
    if (Array.isArray(c.commands)) {
      for (const sub of c.commands) {
        visit(sub);
      }
    }
  };
  for (const cmd of program.commands) {
    visit(cmd);
  }
}

function isCommanderError(error: unknown): error is { code: string; message: string } {
  return error instanceof Error && 'code' in error && typeof (error as { code: unknown }).code === 'string';
}

function parseJson(text: string): unknown {
  return JSON.parse(text) as unknown;
}
