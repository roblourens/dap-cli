import { existsSync } from 'node:fs';
import { mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import ts from 'typescript';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import type { DebugProtocol } from '@vscode/debugprotocol';
import { AdapterRegistry } from '../../src/adapters/registry.js';
import { applyJsDebugTraceDefaults } from '../../src/adapters/builtins/jsDebug.js';
import { startProcessAdapter } from '../../src/adapters/processAdapter.js';
import { connectSocketAdapter, startServerSocketAdapter } from '../../src/adapters/socketAdapter.js';
import { DapClient, DapTransportClosedError, type ReverseRequestResult } from '../../src/protocol/dapClient.js';
import type { DapEventMessage } from '../../src/protocol/dapMessages.js';
import type { DapTransport } from '../../src/protocol/transport.js';
import { createCliTestEnv, runCli, type CliTestEnv } from '../helpers/runCli.js';
import { startControllerServer, type ControllerServer } from '../../src/controller/server.js';
import { getDapCliAdaptersDir } from '../../src/config/paths.js';
import { provisionAdapterIntoTempEnv } from '../../src/testing/tempEnv.js';

const jsDebugPath = path.join(getDapCliAdaptersDir(), 'js-debug', 'src', 'bootloader.js');
const localJsDebugPath = path.join(process.cwd(), 'node_modules', 'vscode-js-debug', 'src', 'bootloader.js');
const hasJsDebug = existsSync(jsDebugPath) || existsSync(localJsDebugPath);
const chromePath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const hasChrome = existsSync(chromePath);
const runBrowserSmokes = process.env.DAP_CLI_RUN_BROWSER_SMOKES === '1';
const electronPath = path.join(process.cwd(), 'node_modules', '.bin', 'electron');
const hasElectron = existsSync(electronPath);

let testEnv: CliTestEnv;
let server: ControllerServer | undefined;

beforeEach(async () => {
  testEnv = await createCliTestEnv('dap-cli-js-debug-');
  server = await startControllerServer({ dapCliHome: testEnv.dapCliHome });
});

afterEach(async () => {
  if (server !== undefined) {
    await server.stop();
    server = undefined;
  }
  await testEnv.cleanup();
});

describe('js-debug adapter integration', () => {
  test('resolves js-debug as a provisioned built-in adapter descriptor', () => {
    expect(hasJsDebug, 'js-debug not provisioned - run npm run setup-adapters').toBe(true);
    expect(new AdapterRegistry().listAll()).toContainEqual({ id: 'js-debug', label: 'JavaScript Debug Adapter (Node, Chrome, Electron)', source: 'built-in' });
  }, 30_000);

  test('launches Node.js app with js-debug and verifies breakpoint inspection', async () => {
    const fixture = path.join(process.cwd(), 'tests', 'fixtures', 'simple-node-app', 'index.js');
    await runJsDebugBreakpointSmoke({
      launchArgs: {
        type: 'pwa-node',
        request: 'launch',
        name: 'node-smoke',
        program: fixture,
        args: ['run'],
        console: 'internalConsole',
        stopOnEntry: true,
      },
      sourcePath: fixture,
      breakpointLine: undefined,
      expectedSourcePathSuffix: path.join('simple-node-app', 'index.js'),
      expectedLocalNames: [],
    });
  }, 30_000);

  test('js-debug adapter works under type=module DAP_CLI_HOME', async (ctx) => {
    await writeFile(path.join(testEnv.dapCliHome, 'package.json'), '{"type":"module"}\n', 'utf8');
    try {
      await provisionAdapterIntoTempEnv(testEnv, 'js-debug');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      ctx.skip(`js-debug not provisioned in user DAP_CLI_HOME — ${message}`);
      return;
    }

    const boundaryPath = path.join(testEnv.dapCliHome, 'adapters', 'js-debug', 'package.json');
    await expect(readFile(boundaryPath, 'utf8')).resolves.toBe('{"type":"commonjs"}\n');

    const fixture = path.join(process.cwd(), 'tests', 'fixtures', 'dap-cli-target', 'index.js');
    const launchConfig = {
      type: 'pwa-node',
      request: 'launch',
      name: 'type-module-home-smoke',
      program: fixture,
      console: 'internalConsole',
      stopOnEntry: true,
    } satisfies Record<string, unknown>;

    const launch = await runCli(
      ['launch', '--adapter', 'js-debug', '--name', 'type-module-home-smoke', '--json', JSON.stringify(launchConfig)],
      { env: testEnv.env },
    );
    expect(launch.exitCode, JSON.stringify(launch)).toBe(0);

    try {
      const threads = await runCli(['threads', '--name', 'type-module-home-smoke'], { env: testEnv.env });
      expect(threads.exitCode, JSON.stringify(threads)).toBe(0);
      expect(JSON.stringify(threads.envelope)).not.toContain('Dynamic require of "fs" is not supported');
    } finally {
      await runCli(['close', '--name', 'type-module-home-smoke'], { env: testEnv.env }).catch(() => undefined);
      await runCli(['cleanup', '--purge'], { env: testEnv.env }).catch(() => undefined);
    }
  }, 30_000);

  // Plan 05-26 (gap H-3a): parent-name routing for thread-scoped DAP commands
  // through the controller-driven CLI. Mirrors hand-driven Sequence A
  // Steps 4–6 against the parent name (no --show-children, no child id, no
  // priming `threads` request needed for routing state).
  test('pwa-node parent-name routing: thread-scoped commands resolve to owning child without --show-children', async (ctx) => {
    try {
      await provisionAdapterIntoTempEnv(testEnv, 'js-debug');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      ctx.skip(`js-debug not provisioned in user DAP_CLI_HOME — ${message}`);
      return;
    }
    const fixture = path.join(process.cwd(), 'tests', 'fixtures', 'dap-cli-target', 'index.js');
    const launchConfig = {
      type: 'pwa-node',
      request: 'launch',
      name: 'pwa-node-route-smoke',
      program: fixture,
      console: 'internalConsole',
      stopOnEntry: true,
    } satisfies Record<string, unknown>;

    const launch = await runCli(
      ['launch', '--adapter', 'js-debug', '--name', 'pwa-node-route-smoke', '--json', JSON.stringify(launchConfig)],
      { env: testEnv.env },
    );
    expect(launch.exitCode, JSON.stringify(launch)).toBe(0);

    try {
      // Wait for at least one child to register (js-debug pwa-node spawns a
      // child via startDebugging once the worker process is up). Default
      // sessions list (no --show-children) MUST still show only the parent.
      const deadline = Date.now() + 10_000;
      let parentOnly = false;
      let childCount = 0;
      while (Date.now() < deadline) {
        const showChildren = await runCli(['sessions', '--show-children'], { env: testEnv.env });
        const showEnvelope = showChildren.envelope as { ok: true; data: Array<{ id: string; parent_session_id?: string }> };
        childCount = showEnvelope.data.filter(s => s.parent_session_id !== undefined).length;
        if (childCount >= 1) {
          // Now confirm default-hidden behavior is preserved.
          const defaultList = await runCli(['sessions'], { env: testEnv.env });
          const defaultEnvelope = defaultList.envelope as { ok: true; data: Array<{ name: string; parent_session_id?: string }> };
          parentOnly = defaultEnvelope.data.length === 1 && defaultEnvelope.data[0]?.name === 'pwa-node-route-smoke';
          break;
        }
        await new Promise(resolve => setTimeout(resolve, 250));
      }
      expect(childCount, 'no child sessions registered under pwa-node parent within 10s').toBeGreaterThanOrEqual(1);
      expect(parentOnly, 'default sessions list should show only the parent (05-19 preserved)').toBe(true);

      // 1. threads against parent name — every entry must have sessionName.
      const threads = await runCli(['threads', '--name', 'pwa-node-route-smoke'], { env: testEnv.env });
      expect(threads.exitCode, JSON.stringify(threads)).toBe(0);
      const threadsEnvelope = threads.envelope as { ok: true; data: { threads: Array<{ id: number; name: string; sessionName: string }> } };
      expect(threadsEnvelope.data.threads.length).toBeGreaterThanOrEqual(1);
      for (const entry of threadsEnvelope.data.threads) {
        expect(typeof entry.sessionName, JSON.stringify(entry)).toBe('string');
        expect(entry.sessionName.startsWith('pwa-node-route-smoke#')).toBe(true);
      }
      const threadId = threadsEnvelope.data.threads[0]!.id;

      // 2. stack against parent name + real thread id.
      const stack = await runCli(
        ['stack', '--name', 'pwa-node-route-smoke', '--thread-id', String(threadId)],
        { env: testEnv.env },
      );
      expect(stack.exitCode, JSON.stringify(stack)).toBe(0);
      const stackEnvelope = stack.envelope as { ok: true; data: { stackFrames: unknown[] } };
      expect(stackEnvelope.data.stackFrames.length).toBeGreaterThanOrEqual(1);

      // 3. evaluate against parent name (no --frame-id; adapter resolves from
      // current paused state). The result string should be defined; we do
      // NOT assert its value (both 'function' and 'undefined' are valid
      // depending on whether the entry stop is before or after the function
      // declaration is hoisted).
      const evaluate = await runCli(
        ['evaluate', '--name', 'pwa-node-route-smoke', '--expression', 'typeof dapCliSelfHostDemo'],
        { env: testEnv.env },
      );
      expect(evaluate.exitCode, JSON.stringify(evaluate)).toBe(0);
      const evaluateEnvelope = evaluate.envelope as { ok: true; data: { result: string } };
      expect(typeof evaluateEnvelope.data.result).toBe('string');
      expect(evaluateEnvelope.data.result.length).toBeGreaterThan(0);

      // 4. continue against parent name + real thread id.
      const cont = await runCli(
        ['continue', '--name', 'pwa-node-route-smoke', '--thread-id', String(threadId)],
        { env: testEnv.env },
      );
      expect(cont.exitCode, JSON.stringify(cont)).toBe(0);

      // 5. Negative coverage: child-name targeting still returns
      // child_session_not_targetable (regression guard for plan 05-19).
      const showChildrenAfter = await runCli(['sessions', '--show-children'], { env: testEnv.env });
      const showAfterEnvelope = showChildrenAfter.envelope as { ok: true; data: Array<{ name: string; parent_session_id?: string }> };
      const child = showAfterEnvelope.data.find(s => s.parent_session_id !== undefined);
      if (child !== undefined) {
        const stackChild = await runCli(
          ['stack', '--name', child.name, '--thread-id', String(threadId)],
          { env: testEnv.env },
        );
        expect(stackChild.exitCode).not.toBe(0);
        const childErrEnvelope = stackChild.envelope as { ok: false; error: { code: string } };
        expect(childErrEnvelope.error.code).toBe('child_session_not_targetable');
      }
    } finally {
      await runCli(['close', '--name', 'pwa-node-route-smoke'], { env: testEnv.env }).catch(() => undefined);
      await runCli(['cleanup', '--purge'], { env: testEnv.env }).catch(() => undefined);
    }
  }, 30_000);

  test('launches TypeScript output and verifies source-map breakpoint inspection', async () => {
    const fixture = await createTypeScriptFixture();
    await runJsDebugBreakpointSmoke({
      launchArgs: {
        type: 'pwa-node',
        request: 'launch',
        name: 'ts-smoke',
        program: fixture.programPath,
        cwd: fixture.workspaceDir,
        args: ['run'],
        console: 'internalConsole',
        sourceMaps: true,
        outFiles: [path.join(fixture.workspaceDir, 'dist', '*.js')],
        stopOnEntry: true,
      },
      sourcePath: fixture.sourcePath,
      breakpointLine: undefined,
      expectedSourcePathSuffix: path.join('ts-smoke', 'index.ts'),
      expectedLocalNames: [],
    });
  }, 30_000);

  test.skipIf(!runBrowserSmokes || !hasChrome)('launches Chrome in headless mode and verifies breakpoint inspection', async () => {
    const page = path.join(process.cwd(), 'tests', 'fixtures', 'simple-chrome-page', 'index.html');
    const sourcePath = path.join(process.cwd(), 'tests', 'fixtures', 'simple-chrome-page', 'app.js');
    await runJsDebugBreakpointSmoke({
      launchArgs: {
        type: 'pwa-chrome',
        request: 'launch',
        name: 'chrome-smoke',
        url: `file://${page}`,
        webRoot: path.dirname(page),
        runtimeExecutable: chromePath,
        runtimeArgs: ['--headless=new', '--disable-gpu', '--no-first-run', `--user-data-dir=${path.join(testEnv.dapCliHome, 'chrome-profile')}`],
      },
      sourcePath,
      breakpointLine: 2,
      expectedSourcePathSuffix: path.join('simple-chrome-page', 'app.js'),
      expectedLocalNames: ['left', 'right'],
    });
  }, 30_000);

  test.skipIf(!runBrowserSmokes || !hasChrome)('pwa-chrome attach surfaces ≥1 child session and non-empty threads through the controller', async (ctx) => {
    // Plan 05-04 Task 3 — exercises the ChildSessionCoordinator end-to-end.
    // We start a controller, launch a real headless Chromium pwa-chrome session,
    // poll the controller until at least one child SessionRecord appears, then
    // call `dap.threads` against the parent and assert it is non-empty.

    // Plan 05-08 — self-contained smokes need the user's installed js-debug
    // mirrored into the tmp DAP_CLI_HOME; otherwise the CLI fails immediately
    // with `js_debug_not_found`.
    try {
      await provisionAdapterIntoTempEnv(testEnv, 'js-debug');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      ctx.skip(`js-debug not provisioned in user DAP_CLI_HOME — ${message}`);
      return;
    }
    const page = path.join(process.cwd(), 'tests', 'fixtures', 'simple-chrome-page', 'index.html');
    const launchConfig = {
      type: 'pwa-chrome',
      request: 'launch',
      name: 'chrome-children-smoke',
      url: `file://${page}`,
      runtimeExecutable: chromePath,
      runtimeArgs: ['--headless=new', '--disable-gpu', '--no-first-run', `--user-data-dir=${path.join(testEnv.dapCliHome, 'chrome-profile-children')}`],
    } satisfies Record<string, unknown>;

    const launch = await runCli(['launch', '--adapter', 'js-debug', '--name', 'chrome-children-smoke', '--json', JSON.stringify(launchConfig)], { env: testEnv.env });
    expect(launch.exitCode, JSON.stringify(launch)).toBe(0);
    const launchEnvelope = launch.envelope as { ok: true; data: { sessionId: string; name: string } };
    const parentId = launchEnvelope.data.sessionId;

    try {
      // Poll sessions list until a child appears (parent_session_id === parentId)
      // or 10s timeout elapses. Every poll is a fresh CLI invocation.
      // Plan 05-19 (gap H-3): child sessions are hidden by default; pass
      // --show-children since this is a diagnostic assertion that they
      // registered. They are not targetable directly (targetable: false);
      // the `request threads` call below targets the parent name as
      // required.
      const deadline = Date.now() + 10_000;
      let children: Array<{ id: string; parent_session_id?: string }> = [];
      while (Date.now() < deadline) {
        const list = await runCli(['sessions', '--show-children'], { env: testEnv.env });
        const listEnvelope = list.envelope as { ok: true; data: Array<{ id: string; parent_session_id?: string }> };
        children = listEnvelope.data.filter(entry => entry.parent_session_id === parentId);
        if (children.length > 0) {
          break;
        }
        await new Promise(resolve => setTimeout(resolve, 250));
      }
      expect(children.length, `no child sessions appeared under ${parentId} within 10s`).toBeGreaterThanOrEqual(1);

      const threads = await runCli(['request', 'threads', '--name', 'chrome-children-smoke', '--json', '{}'], { env: testEnv.env });
      expect(threads.exitCode, JSON.stringify(threads)).toBe(0);
      const threadsEnvelope = threads.envelope as { ok: true; data: { threads: Array<{ id: number; name: string }> } };
      expect(threadsEnvelope.data.threads.length, 'expected ≥1 DAP thread once children are registered').toBeGreaterThanOrEqual(1);
    } finally {
      await runCli(['stop', '--name', 'chrome-children-smoke'], { env: testEnv.env }).catch(() => undefined);
    }
  }, 30_000);

  test.skipIf(!runBrowserSmokes || !hasChrome)('runs pwa-chrome breakpoint through the published controller and observes a stopped event', async (ctx) => {
    // Plan 05-22 Task 3 — H-6 BLOCKER regression guard. The existing
    // `runJsDebugBreakpointSmoke` helper installs its own in-test
    // `startDebugging` reverse-request handler AND replays parent
    // setBreakpoints to children mid-handshake — neither of which the
    // production `ChildSessionCoordinator` does. As a result a green
    // browser smoke from that helper does NOT prove the published CLI can
    // drive a pwa-chrome bp to a stopped state. This test goes through the
    // ONLY surface real users have: `runCli` → controller IPC → controller
    // server → ChildSessionCoordinator → js-debug. If H-6 ever regresses
    // (e.g. someone removes the parent-fan-out merge in
    // routeSetBreakpointsThroughParent, or breaks the child→parent paused
    // mirror added in plan 05-25, or breaks the high-priority event-cache
    // ring added in plan 05-18), this test is the canary.
    //
    // Triggering pattern matches dev/smoke/hand-driven-smoke.md Sequence B
    // (post-05-22 docs fix): launch with ?manual so app.js does NOT auto-
    // run, set bp, evaluate calculate(2,3) in the background to trigger
    // the bp, poll events --include stopped. If the breakpoint holds the
    // evaluate past the controller IPC deadline it exits non-zero with
    // controller_request_timeout (exit 7); if `continue` arrives first it
    // can complete successfully. We intentionally do NOT assert that race.
    try {
      await provisionAdapterIntoTempEnv(testEnv, 'js-debug');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      ctx.skip(`js-debug not provisioned in user DAP_CLI_HOME — ${message}`);
      return;
    }

    const fixtureRoot = path.join(process.cwd(), 'tests', 'fixtures', 'simple-chrome-page');
    const pagePath = path.join(fixtureRoot, 'index.html');
    const sourcePath = path.join(fixtureRoot, 'app.js');
    const launchConfig = {
      type: 'pwa-chrome',
      request: 'launch',
      name: 'chrome-h6-regression',
      url: `file://${pagePath}?manual`,
      webRoot: fixtureRoot,
      runtimeExecutable: chromePath,
      runtimeArgs: ['--headless=new', '--disable-gpu', '--no-first-run', `--user-data-dir=${path.join(testEnv.dapCliHome, 'chrome-profile-h6')}`],
    } satisfies Record<string, unknown>;

    const launch = await runCli(['launch', '--adapter', 'js-debug', '--name', 'chrome-h6-regression', '--json', JSON.stringify(launchConfig)], { env: testEnv.env });
    expect(launch.exitCode, JSON.stringify(launch)).toBe(0);

    try {
      // Wait until at least one page child has registered — bp fan-out
      // depends on it.
      const childDeadline = Date.now() + 10_000;
      let pageChildSeen = false;
      while (Date.now() < childDeadline) {
        const list = await runCli(['sessions', '--show-children'], { env: testEnv.env });
        const listEnvelope = list.envelope as { ok: true; data: Array<{ parent_session_id?: string }> };
        if (listEnvelope.data.some(entry => entry.parent_session_id !== undefined)) {
          pageChildSeen = true;
          break;
        }
        await new Promise(resolve => setTimeout(resolve, 200));
      }
      expect(pageChildSeen, 'no page child registered under pwa-chrome parent within 10s').toBe(true);

      // Set the breakpoint through the controller. The page child's
      // verified:true response (line:2, column:18) must be merged into the
      // user-visible response over the parent's "Unbound breakpoint"
      // provisional. This is the H-6 closure invariant.
      const bpResponse = await runCli([
        'breakpoints', 'set',
        '--name', 'chrome-h6-regression',
        '--source', sourcePath,
        '--line', '2',
      ], { env: testEnv.env });
      expect(bpResponse.exitCode, JSON.stringify(bpResponse)).toBe(0);
      const bpEnvelope = bpResponse.envelope as { ok: true; data: { breakpoints: Array<{ verified: boolean; line?: number; source?: { path?: string } }> } };
      const firstBp = bpEnvelope.data.breakpoints[0];
      expect(firstBp, JSON.stringify(bpResponse.envelope)).toBeDefined();
      expect(firstBp?.verified, `bp not verified through controller: ${JSON.stringify(bpResponse.envelope)}`).toBe(true);
      if (firstBp?.source?.path !== undefined) {
        expect(firstBp.source.path.split(path.sep).join('/'), 'verified bp must carry app.js path').toMatch(/simple-chrome-page\/app\.js$/);
      }

      // Trigger the breakpoint by evaluating `calculate(2,3)` in the
      // page's JS context. The evaluate request blocks while the breakpoint
      // is paused. It may time out or complete after the later `continue`;
      // neither outcome is the invariant here, so do not await it yet. Use
      // a fire-and-forget promise so the test can keep polling events.
      const triggered = runCli(['evaluate', '--name', 'chrome-h6-regression', '--expression', 'calculate(2,3)'], { env: testEnv.env })
        .catch(() => undefined);

      // Poll events --include stopped for up to 10s. Plan 05-18's two-ring
      // cache ensures the stopped event is not evicted by loadedSource spam.
      const stopDeadline = Date.now() + 10_000;
      let stoppedEvent: { event: string; body?: unknown } | undefined;
      while (Date.now() < stopDeadline) {
        const events = await runCli(['events', '--name', 'chrome-h6-regression', '--include', 'stopped', '--limit', '100'], { env: testEnv.env });
        const eventsEnvelope = events.envelope as { ok: true; data: { events: Array<{ event: string; body?: unknown }> } };
        stoppedEvent = eventsEnvelope.data.events.find(event => event.event === 'stopped');
        if (stoppedEvent !== undefined) {
          break;
        }
        await new Promise(resolve => setTimeout(resolve, 250));
      }
      expect(stoppedEvent, 'no stopped event observed within 10s of evaluate trigger').toBeDefined();
      const stoppedBody = stoppedEvent?.body as { reason?: unknown } | undefined;
      expect(typeof stoppedBody?.reason === 'string' && /breakpoint/i.test(stoppedBody.reason), `stopped reason did not match /breakpoint/i: ${JSON.stringify(stoppedBody)}`).toBe(true);

      // Stack must resolve through the parent name to the page child and
      // return a frame whose source is app.js. This is the second H-6
      // acceptance criterion.
      const threads = await runCli(['threads', '--name', 'chrome-h6-regression'], { env: testEnv.env });
      const threadsEnvelope = threads.envelope as { ok: true; data: { threads: Array<{ id: number }> } };
      const threadId = threadsEnvelope.data.threads[0]?.id;
      expect(threadId, 'no thread observed while paused').toBeTypeOf('number');

      const stack = await runCli(['stack', '--name', 'chrome-h6-regression', '--thread-id', String(threadId)], { env: testEnv.env });
      const stackEnvelope = stack.envelope as { ok: true; data: { stackFrames: Array<{ name: string; source?: { path?: string } }> } };
      const topFrame = stackEnvelope.data.stackFrames[0];
      expect(topFrame, 'no stack frames returned while paused').toBeDefined();
      expect((topFrame?.source?.path ?? '').split(path.sep).join('/'), 'top frame source must contain simple-chrome-page/app.js').toMatch(/simple-chrome-page\/app\.js$/);

      // Release the bp so teardown can complete cleanly. We do NOT await
      // the triggered evaluate — it has already exited (timeout) by the
      // time we get here.
      await runCli(['continue', '--name', 'chrome-h6-regression', '--thread-id', String(threadId)], { env: testEnv.env }).catch(() => undefined);
      await triggered;
    } finally {
      await runCli(['close', 'chrome-h6-regression'], { env: testEnv.env }).catch(() => undefined);
    }
  }, 60_000);

  test.skipIf(!hasElectron)('launches Electron main process and verifies breakpoint inspection', async () => {
    const fixture = path.join(process.cwd(), 'tests', 'fixtures', 'simple-electron-app', 'main.js');
    await runJsDebugBreakpointSmoke({
      launchArgs: {
        type: 'pwa-node',
        request: 'launch',
        name: 'electron-smoke',
        runtimeExecutable: electronPath,
        program: fixture,
        console: 'internalConsole',
      },
      sourcePath: fixture,
      breakpointLine: 4,
      expectedSourcePathSuffix: path.join('simple-electron-app', 'main.js'),
      expectedLocalNames: [],
    });
  });

  // Plan 05-23 (gap H-8): after `dap-cli close`, the owned-adapter PID must
  // actually be dead. Hand-driven Sequence B left 8 orphan Chromium processes
  // because js-debug never received `terminateDebuggee:true` on disconnect.
  // This is the published-CLI proof that the new terminateRuntime path
  // really kills the adapter (and on POSIX, its process group), not just
  // marks the session terminated.
  test('dap-cli close terminates the js-debug adapter PID (gap H-8)', async (ctx) => {
    try {
      await provisionAdapterIntoTempEnv(testEnv, 'js-debug');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      ctx.skip(`js-debug not provisioned in user DAP_CLI_HOME — ${message}`);
      return;
    }
    const fixture = path.join(process.cwd(), 'tests', 'fixtures', 'dap-cli-target', 'index.js');
    const launchConfig = {
      type: 'pwa-node',
      request: 'launch',
      name: 'h8-close-kill',
      program: fixture,
      console: 'internalConsole',
      stopOnEntry: true,
    } satisfies Record<string, unknown>;

    const launch = await runCli(
      ['launch', '--adapter', 'js-debug', '--name', 'h8-close-kill', '--json', JSON.stringify(launchConfig)],
      { env: testEnv.env },
    );
    expect(launch.exitCode, JSON.stringify(launch)).toBe(0);

    // Capture the adapter PID via the status response's logPath, which is
    // formatted as `<adapterId>-<pid>.log` by `startProcessAdapter`. There
    // is no public surface that returns the PID directly, but logPath is
    // stable + well-tested.
    const status = await runCli(['status', '--name', 'h8-close-kill'], { env: testEnv.env });
    expect(status.exitCode, JSON.stringify(status)).toBe(0);
    const statusEnvelope = status.envelope as { ok: true; data: { logPath?: string } };
    expect(statusEnvelope.data.logPath).toBeDefined();
    const logBasename = path.basename(statusEnvelope.data.logPath ?? '');
    const pidMatch = /-(\d+)\.log$/.exec(logBasename);
    expect(pidMatch, `could not parse adapter PID from logPath ${statusEnvelope.data.logPath}`).not.toBeNull();
    const adapterPid = pidMatch === null ? 0 : Number(pidMatch[1]);
    expect(adapterPid).toBeGreaterThan(0);
    expect(isPidAlive(adapterPid), `adapter PID ${adapterPid} should be alive immediately after launch`).toBe(true);

    const close = await runCli(['close', '--name', 'h8-close-kill'], { env: testEnv.env });
    expect(close.exitCode, JSON.stringify(close)).toBe(0);
    const closeEnvelope = close.envelope as { ok: true; data: { orphanPids: number[]; warnings: string[] } };
    // Clean teardown: orphanPids must be empty. If non-empty, the adapter
    // PID should appear there and the test should still acknowledge the
    // honest disclosure (the success_criteria fallback) — but the
    // *expected* outcome is empty.
    expect(closeEnvelope.data.orphanPids, JSON.stringify(closeEnvelope)).toEqual([]);
    expect(closeEnvelope.data.warnings).toEqual([]);

    // Poll for up to 2s — the OS may take a beat to reap the child after
    // SIGKILL even when our liveness probe says dead.
    const deadline = Date.now() + 2_000;
    let alive = isPidAlive(adapterPid);
    while (alive && Date.now() < deadline) {
      await new Promise(resolve => setTimeout(resolve, 50));
      alive = isPidAlive(adapterPid);
    }
    expect(alive, `adapter PID ${adapterPid} still alive 2s after close`).toBe(false);
  }, 30_000);
});

function isPidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    if (error instanceof Error && 'code' in error && (error as NodeJS.ErrnoException).code === 'ESRCH') {
      return false;
    }
    // EPERM (or any other non-ESRCH error) means the PID exists but we
    // can't signal it — treat as alive so the test fails honestly rather
    // than silently passing on a permission error.
    return true;
  }
}

interface BreakpointSmokeOptions {
  launchArgs: Record<string, unknown>;
  sourcePath: string;
  breakpointLine: number | undefined;
  expectedSourcePathSuffix: string;
  expectedLocalNames: readonly string[];
}

interface TypeScriptFixture {
  workspaceDir: string;
  sourcePath: string;
  programPath: string;
}

async function runJsDebugBreakpointSmoke(options: BreakpointSmokeOptions): Promise<void> {
  const descriptor = await new AdapterRegistry().resolve('js-debug');

  const logDir = path.join(testEnv.dapCliHome, 'logs');
  await mkdir(logDir, { recursive: true });
  const adapter = descriptor.transport.kind === 'stdio'
    ? startProcessAdapter({ descriptor: descriptor.transport, adapterId: descriptor.id, logDir })
    : descriptor.transport.kind === 'server'
      ? await startServerSocketAdapter(descriptor.id, descriptor.transport, logDir)
      : await connectSocketAdapter(descriptor.id, descriptor.transport);
  const client = new DapClient(adapter.transport, { requestTimeoutMs: 10_000 });

  // js-debug pwa-chrome emits a `startDebugging` reverse request after
  // `configurationDone` and expects the client to open a NEW DAP connection
  // back to the same `dapDebugServer.js` for the page-level child session.
  // Without this handler the page child is never created, the parent's
  // provisional breakpoint never propagates to a real script, and `stopped`
  // never fires (gap #11). Mirrors `ChildSessionCoordinator.installStartDebuggingHandler`
  // in `src/controller/childSessions.ts`. For pwa-node (Node, TS, Electron)
  // smokes this handler is installed but never invoked — those targets do not
  // emit `startDebugging`.
  const openChildTransport = (
    'openChildTransport' in adapter && typeof adapter.openChildTransport === 'function'
  )
    ? adapter.openChildTransport.bind(adapter)
    : undefined;
  const childClients: DapClient[] = [];
  const childTransports: DapTransport[] = [];
  const childDetachers: Array<() => void> = [];
  // Parent setBreakpoints payloads captured for replay against new children.
  // Mirrors `ChildSessionCoordinator.futureChildBreakpoints` — js-debug
  // pwa-chrome's parent owns a provisional bp registry that is *supposed* to
  // propagate to children automatically, but in the raw single-process client
  // path that propagation does not always fire. Replaying against the child
  // between `initialized` and `configurationDone` matches the controller's
  // working pattern in `runChildLifecycle`.
  const parentBreakpointPayloads: unknown[] = [];

  const bringUpChild = async (args: unknown): Promise<ReverseRequestResult> => {
    if (openChildTransport === undefined) {
      return { success: false, message: 'adapter does not expose openChildTransport for js-debug startDebugging.' };
    }
    if (!isRecord(args)) {
      return { success: false, message: 'startDebugging arguments must be an object.' };
    }
    const requestMode: 'launch' | 'attach' = args.request === 'launch' ? 'launch' : 'attach';
    const configuration = isRecord(args.configuration) ? args.configuration : {};
    const childName = `${descriptor.id}-child#${childClients.length + 1}`;
    let childTransport: DapTransport;
    try {
      childTransport = await openChildTransport(childName);
    } catch (error) {
      return { success: false, message: error instanceof Error ? error.message : 'failed to open child transport' };
    }
    const childClient = new DapClient(childTransport, { requestTimeoutMs: 10_000 });
    childClients.push(childClient);
    childTransports.push(childTransport);
    // Recursive: pwa-chrome may nest browser-level → page-level startDebugging.
    childDetachers.push(installStartDebuggingHandler(childClient));

    let initializedSeen = false;
    let resolveInitialized!: () => void;
    const initializedChild = new Promise<void>(resolve => { resolveInitialized = resolve; });
    childClient.onEvent(event => {
      if (event.event === 'initialized' && !initializedSeen) {
        initializedSeen = true;
        resolveInitialized();
      }
    });

    try {
      await childClient.request('initialize', {
        adapterID: 'js-debug',
        clientID: 'dap-cli-tests',
        clientName: 'dap-cli tests',
        columnsStartAt1: true,
        linesStartAt1: true,
        pathFormat: 'path',
      });
    } catch (error) {
      return { success: false, message: error instanceof Error ? error.message : 'child initialize failed' };
    }

    // Run the remainder of the child handshake in the BACKGROUND. js-debug
    // (per `ChildSessionCoordinator.handleStartDebugging`) deadlocks if we
    // hold the `startDebugging` reverse request open while waiting for the
    // child's launch/attach response — that response is itself blocked on
    // configurationDone, which is blocked on the parent doing further work,
    // which is blocked on the parent receiving our reverse-request response.
    // So return `{success: true}` now and let the lifecycle settle on its own.
    void (async () => {
      try {
        const lifecyclePromise = childClient.request(requestMode, configuration);
        lifecyclePromise.catch(() => undefined);
        await initializedChild;
        // Replay any breakpoints the parent already set so this child carries
        // them into configurationDone — mirrors `runChildLifecycle`'s replay
        // loop in `src/controller/childSessions.ts`.
        for (const payload of parentBreakpointPayloads) {
          await childClient.request('setBreakpoints', payload).catch(() => undefined);
        }
        await childClient.request('configurationDone');
        await lifecyclePromise;
      } catch {
        // Failures here surface as the child's `output`/`terminated` events;
        // the test's overall waiter (stoppedOrTerminated) will time out and
        // surface the real assertion failure.
      }
    })();
    return { success: true };
  };

  function installStartDebuggingHandler(targetClient: DapClient): () => void {
    let chain: Promise<unknown> = Promise.resolve();
    return targetClient.onReverseRequest(request => {
      if (request.command !== 'startDebugging') {
        return undefined;
      }
      const work = chain.then(
        () => bringUpChild(request.arguments),
        () => bringUpChild(request.arguments),
      );
      chain = work.then(() => undefined, () => undefined);
      return work;
    });
  }

  const detachParentHandler = installStartDebuggingHandler(client);

  try {
    const initialized = waitForEvent(client, 'initialized');
    await client.request('initialize', {
      adapterID: 'js-debug',
      clientID: 'dap-cli-tests',
      clientName: 'dap-cli tests',
      columnsStartAt1: true,
      linesStartAt1: true,
      pathFormat: 'path',
    });
    // Mirror ControllerServer.startDapSession (plan 05-21, gap H-5):
    // js-debug only writes its DAP/CDP wire trace when `trace.logFile` is set
    // in the launch config. The controller injects this for production callers;
    // this raw-adapter helper bypasses the controller, so apply the same merge
    // here. Required for the trace-file assertions at the bottom of this fn.
    const launchArgs = applyJsDebugTraceDefaults(options.launchArgs, logDir);
    const launch = client.request('launch', launchArgs);
    await initialized;

    if (options.breakpointLine !== undefined) {
      const setBreakpointsArgs = {
        source: { path: options.sourcePath },
        breakpoints: [{ line: options.breakpointLine }],
      };
      // Capture so it can be replayed against children brought up via the
      // `startDebugging` reverse-request handler — see `bringUpChild`.
      parentBreakpointPayloads.push(setBreakpointsArgs);
      const breakpoints = await client.request<DebugProtocol.SetBreakpointsResponse['body']>('setBreakpoints', setBreakpointsArgs);
      expect(breakpoints.breakpoints).toHaveLength(1);
    }

    if (options.breakpointLine === undefined) {
      try {
        await client.request('configurationDone');
        await launch;
      } catch (error) {
        if (!(error instanceof DapTransportClosedError)) {
          throw error;
        }
      }
      await client.request('disconnect', { terminateDebuggee: true }).catch(() => undefined);
      return;
    }

    // Listen on parent + every child brought up via startDebugging. For
    // pwa-chrome the `stopped` event fires on the page child's connection,
    // not the parent's — so we race across the full set and dispatch follow-up
    // requests (stackTrace/scopes/variables/continue) to whichever client
    // actually emitted `stopped`.
    const stoppedOrTerminated = waitForAnyEventAcrossClients(
      () => [client, ...childClients],
      ['stopped', 'terminated'],
      25_000,
    );
    await client.request('configurationDone');
    await launch;
    const { client: stoppedClient, event: stoppedEvent } = await stoppedOrTerminated;
    if (stoppedEvent.event === 'terminated') {
      await client.request('disconnect', { terminateDebuggee: true }).catch(() => undefined);
      return;
    }

    const threadId = await resolveStoppedThreadId(stoppedClient, stoppedEvent);
    const frame = await firstStackFrame(stoppedClient, threadId);
    expect(normalizePath(frame.source?.path ?? '')).toContain(normalizePath(options.expectedSourcePathSuffix));

    const variables = await localVariables(stoppedClient, frame.id);
    for (const expectedName of options.expectedLocalNames) {
      expect(variables.map(variable => variable.name)).toContain(expectedName);
    }

    await stoppedClient.request('continue', { threadId });
    // Disconnect best-effort: by the time we hit `continue`, the page may
    // already have completed and js-debug torn the parent connection down,
    // so the disconnect response can time out. That's fine — the assertions
    // above are what matter.
    await client.request('disconnect', { terminateDebuggee: true }).catch(() => undefined);
  } finally {
    detachParentHandler();
    for (const detach of childDetachers) {
      try { detach(); } catch { /* ignore */ }
    }
    // Close children BEFORE the parent so child transports unregister cleanly
    // before the parent socket goes away (the parent is the "primary"
    // connection from the dapDebugServer's perspective).
    for (const childClient of childClients) {
      await childClient.close().catch(() => undefined);
    }
    for (const childTransport of childTransports) {
      await childTransport.close().catch(() => undefined);
    }
    await client.close().catch(() => undefined);
    await adapter.close().catch(() => undefined);
  }

  // Plan 05-21 (gap H-5): the adapter's own log file must be non-empty —
  // both adapter spawn paths now write a `[dap-cli] adapter <id> started
  // pid=<pid> at <iso>` header line so a 0-byte log unambiguously means
  // "adapter never launched" rather than "adapter ran fine but silent on
  // stderr". For js-debug specifically, `applyJsDebugTraceDefaults` also
  // injects `trace.logFile = <logDir>/js-debug-trace-<ts>.log` — assert at
  // least one such trace file exists and is non-empty so the diagnostic
  // log path actually has DAP/CDP wire data when something goes wrong.
  if ('ownedAdapter' in adapter && adapter.ownedAdapter.logPath !== undefined) {
    const logStat = await stat(adapter.ownedAdapter.logPath);
    expect(logStat.size, `expected adapter log ${adapter.ownedAdapter.logPath} to be non-empty (header line)`).toBeGreaterThan(0);
  }
  const traceEntries = await readdir(logDir).catch(() => [] as string[]);
  const traceFiles = traceEntries.filter(name => name.startsWith('js-debug-trace-') && name.endsWith('.log'));
  expect(traceFiles.length, `expected at least one js-debug-trace-*.log under ${logDir}; saw: ${traceEntries.join(', ')}`).toBeGreaterThan(0);
  let largestTraceSize = 0;
  for (const name of traceFiles) {
    const traceStat = await stat(path.join(logDir, name));
    if (traceStat.size > largestTraceSize) {
      largestTraceSize = traceStat.size;
    }
  }
  expect(largestTraceSize, `expected at least one js-debug-trace-*.log to be non-empty under ${logDir}`).toBeGreaterThan(0);
}

async function createTypeScriptFixture(): Promise<TypeScriptFixture> {
  const workspaceDir = path.join(testEnv.dapCliHome, 'ts-smoke');
  const distDir = path.join(workspaceDir, 'dist');
  const sourcePath = path.join(workspaceDir, 'index.ts');
  const programPath = path.join(distDir, 'index.js');
  const source = `interface Greeting {\n  name: string;\n  message: string;\n}\n\nfunction createGreeting(name: string): Greeting {\n  const message = \`Hello, ${'${name}'}!\`;\n  return { name, message };\n}\n\nfunction sum(left: number, right: number): number {\n  const result = left + right;\n  return result;\n}\n\nif (process.argv[2] === 'run') {\n  createGreeting('TypeScript');\n  sum(4, 5);\n}\n`;
  const transpiled = ts.transpileModule(source, {
    fileName: 'index.ts',
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      sourceMap: true,
      target: ts.ScriptTarget.ES2020,
    },
  });

  await mkdir(distDir, { recursive: true });
  await writeFile(sourcePath, source, 'utf8');
  await writeFile(programPath, transpiled.outputText, 'utf8');
  await writeFile(path.join(distDir, 'index.js.map'), transpiled.sourceMapText ?? '', 'utf8');

  return { workspaceDir, sourcePath, programPath };
}

function waitForEvent(client: DapClient, eventName: string): Promise<DapEventMessage> {
  return waitForAnyEvent(client, [eventName]);
}

function waitForAnyEvent(client: DapClient, eventNames: readonly string[]): Promise<DapEventMessage> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      dispose();
      reject(new Error(`Timed out waiting for DAP event '${eventNames.join(' or ')}'.`));
    }, 10_000);
    const dispose = client.onEvent(event => {
      if (!eventNames.includes(event.event)) {
        return;
      }

      clearTimeout(timeout);
      dispose();
      resolve(event);
    });
  });
}

/**
 * Race for `eventNames` across a dynamic set of {@link DapClient}s. The
 * `clientsAccessor` is re-polled on a short interval so clients that are
 * brought up AFTER the waiter starts (e.g. js-debug pwa-chrome page-level
 * children created via the `startDebugging` reverse-request handler) are
 * automatically subscribed. Used by {@link runJsDebugBreakpointSmoke} so the
 * `stopped` event — which fires on the page child's connection, not the
 * parent's — is observed regardless of which client emits it.
 */
function waitForAnyEventAcrossClients(
  clientsAccessor: () => readonly DapClient[],
  eventNames: readonly string[],
  timeoutMs: number,
): Promise<{ client: DapClient; event: DapEventMessage }> {
  return new Promise((resolve, reject) => {
    const subscribed = new Set<DapClient>();
    const disposers: Array<() => void> = [];
    let settled = false;
    const subscribe = (): void => {
      for (const candidate of clientsAccessor()) {
        if (subscribed.has(candidate)) {
          continue;
        }
        subscribed.add(candidate);
        const dispose = candidate.onEvent(event => {
          if (settled) return;
          if (!eventNames.includes(event.event)) return;
          settled = true;
          cleanup();
          resolve({ client: candidate, event });
        });
        disposers.push(dispose);
      }
    };
    const interval = setInterval(subscribe, 50);
    const timeout = setTimeout(() => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new Error(`Timed out waiting for DAP event '${eventNames.join(' or ')}' across ${subscribed.size} client(s).`));
    }, timeoutMs);
    const cleanup = (): void => {
      clearInterval(interval);
      clearTimeout(timeout);
      for (const dispose of disposers) {
        try { dispose(); } catch { /* ignore */ }
      }
    };
    subscribe();
  });
}

async function resolveStoppedThreadId(client: DapClient, event: DapEventMessage): Promise<number> {
  const body = isRecord(event.body) ? event.body : undefined;
  if (typeof body?.threadId === 'number') {
    return body.threadId;
  }

  const threads = await client.request<DebugProtocol.ThreadsResponse['body']>('threads');
  const threadId = threads.threads[0]?.id;
  if (threadId === undefined) {
    throw new Error('Adapter stopped without reporting any threads.');
  }

  return threadId;
}

async function firstStackFrame(client: DapClient, threadId: number): Promise<DebugProtocol.StackFrame> {
  const stack = await client.request<DebugProtocol.StackTraceResponse['body']>('stackTrace', { threadId, startFrame: 0, levels: 5 });
  const frame = stack.stackFrames[0];
  if (frame === undefined) {
    throw new Error('Adapter stopped without reporting a stack frame.');
  }

  return frame;
}

async function localVariables(client: DapClient, frameId: number): Promise<DebugProtocol.Variable[]> {
  const scopes = await client.request<DebugProtocol.ScopesResponse['body']>('scopes', { frameId });
  const localScope = scopes.scopes.find(scope => scope.name.toLowerCase().includes('local')) ?? scopes.scopes[0];
  if (localScope === undefined || localScope.variablesReference === 0) {
    return [];
  }

  const variables = await client.request<DebugProtocol.VariablesResponse['body']>('variables', { variablesReference: localScope.variablesReference });
  return variables.variables;
}

function normalizePath(value: string): string {
  return value.split(path.sep).join('/');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}