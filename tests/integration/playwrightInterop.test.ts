import { createServer, type Server, type ServerResponse } from 'node:http';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import net from 'node:net';
import type { AddressInfo } from 'node:net';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { z } from 'zod';
import { getDapCliAdaptersDir } from '../../src/config/paths.js';
import { startControllerServer, type ControllerServer } from '../../src/controller/server.js';
import { createCliTestEnv, runCli, type CliTestEnv } from '../helpers/runCli.js';
import { provisionAdapterIntoTempEnv } from '../../src/testing/tempEnv.js';

const jsDebugPath = path.join(getDapCliAdaptersDir(), 'js-debug', 'src', 'dapDebugServer.js');
const localJsDebugPath = path.join(process.cwd(), 'node_modules', 'vscode-js-debug', 'src', 'dapDebugServer.js');
const hasJsDebug = existsSync(jsDebugPath) || existsSync(localJsDebugPath);
const runChromePlaywrightHandoff = process.env.DAP_CLI_RUN_CHROME_PLAYWRIGHT_HANDOFF === '1';
const envelopeSchema = z.object({ ok: z.literal(true), data: z.unknown() });
const eventsDataSchema = z.object({ events: z.array(z.object({ event: z.string(), body: z.unknown().optional() })), cursor: z.number() });
const threadsDataSchema = z.object({ threads: z.array(z.object({ id: z.number(), name: z.string() })) });
const stackDataSchema = z.object({ stackFrames: z.array(z.object({ id: z.number(), name: z.string(), source: z.object({ path: z.string().optional() }).optional() })) });
const scopesDataSchema = z.object({ scopes: z.array(z.object({ name: z.string(), variablesReference: z.number() })) });
const variablesDataSchema = z.object({ variables: z.array(z.object({ name: z.string(), value: z.string(), variablesReference: z.number() })) });
const breakpointsSetDataSchema = z.object({
  breakpoints: z.array(z.object({
    verified: z.boolean(),
    message: z.string().optional(),
    source: z.object({ path: z.string().optional() }).optional(),
  })),
  warnings: z.array(z.object({ sessionId: z.string(), message: z.string() })).optional(),
});

let browser: Browser;
let page: Page;
let fixtureServer: Server;
let fixtureUrl: string;
let testEnv: CliTestEnv;
let controller: ControllerServer;

describe('Playwright interop', () => {
  beforeAll(async () => {
    testEnv = await createCliTestEnv('dap-cli-playwright-interop-');
    if (hasJsDebug) {
      try {
        await provisionAdapterIntoTempEnv(testEnv, 'js-debug');
      } catch {
        // Best-effort: gated handoff test will skip if provisioning failed.
      }
    }
    controller = await startControllerServer({ dapCliHome: testEnv.dapCliHome });
    fixtureServer = await startFixtureServer(path.join(process.cwd(), 'tests', 'fixtures', 'simple-chrome-page'));
    fixtureUrl = `http://127.0.0.1:${readPort(fixtureServer)}/index.html`;
    browser = await chromium.launch({ headless: true });
    page = await browser.newPage();
  });

  afterAll(async () => {
    await page?.close().catch(() => undefined);
    await browser?.close().catch(() => undefined);
    await runCli(['cleanup'], { env: testEnv.env }).catch(() => undefined);
    await controller?.stop().catch(() => undefined);
    await new Promise<void>(resolve => fixtureServer?.close(() => resolve()));
    await testEnv?.cleanup().catch(() => undefined);
  });

  test('coordinates Playwright browser action with dap-cli polling and inspection', async () => {
    const launch = await runCli(['launch', '--adapter', 'fake', '--script', 'playwright-inspection', '--name', 'web-demo'], { env: testEnv.env });
    expect(launch.exitCode, JSON.stringify(launch)).toBe(0);

    await page.goto(fixtureUrl);
    await expectResultText('5');
    const calculated = await page.evaluate('calculate(4, 6)');
    expect(calculated).toBe(10);
    await expectResultText('10');

    const status = await runCli(['status', '--name', 'web-demo'], { env: testEnv.env });
    expect(status.exitCode, JSON.stringify(status)).toBe(0);
    expect(readStringField(status.envelope, 'status')).toBe('stopped');

    const events = await runCli(['events', '--name', 'web-demo', '--after-cursor', '0', '--limit', '20'], { env: testEnv.env });
    expect(readEnvelopeData(events.envelope, eventsDataSchema).events.map(event => event.event)).toContain('stopped');

    const threads = await runCli(['threads', '--name', 'web-demo'], { env: testEnv.env });
    const threadId = readEnvelopeData(threads.envelope, threadsDataSchema).threads[0]?.id;
    expect(threadId).toBe(1);

    const stack = await runCli(['stack', '--thread-id', String(threadId), '--name', 'web-demo'], { env: testEnv.env });
    const frameId = readEnvelopeData(stack.envelope, stackDataSchema).stackFrames[0]?.id;
    expect(frameId).toBe(10);

    const scopes = await runCli(['scopes', '--frame-id', String(frameId), '--name', 'web-demo'], { env: testEnv.env });
    const variablesReference = readEnvelopeData(scopes.envelope, scopesDataSchema).scopes[0]?.variablesReference;
    expect(variablesReference).toBe(100);

    const variables = await runCli(['variables', '--variables-reference', String(variablesReference), '--name', 'web-demo'], { env: testEnv.env });
    expect(readEnvelopeData(variables.envelope, variablesDataSchema).variables).toEqual([
      { name: 'left', value: '4', variablesReference: 0 },
      { name: 'right', value: '6', variablesReference: 0 },
      { name: 'result', value: '10', variablesReference: 0 },
    ]);

    const continued = await runCli(['continue', '--thread-id', String(threadId), '--name', 'web-demo'], { env: testEnv.env });
    expect(continued.exitCode, JSON.stringify(continued)).toBe(0);

    const stopped = await runCli(['stop', '--name', 'web-demo'], { env: testEnv.env });
    expect(stopped.exitCode, JSON.stringify(stopped)).toBe(0);
  });

  test.skipIf(!runChromePlaywrightHandoff || !hasJsDebug)('coordinates Playwright with the same Chromium target attached by js-debug', async (ctx) => {
    // STRICT same-browser handoff coverage. Closes UAT gaps 1 & 2. Backed by
    // controller machinery from plans 05-03 (DapClient.onReverseRequest +
    // SessionManager parent/child) and 05-04 (ChildSessionCoordinator). A
    // missing stop, an unverified breakpoint, or a missing local is a HARD
    // FAILURE here — there is no diagnostic-only branch.
    //
    // Plan 05-09: stage js-debug into the tmp DAP_CLI_HOME via
    // provisionAdapterIntoTempEnv so this gated smoke is self-contained;
    // skip cleanly if the user has not run `npm run setup-adapters`.
    try {
      await provisionAdapterIntoTempEnv(testEnv, 'js-debug');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      ctx.skip(`js-debug not provisioned in user DAP_CLI_HOME — ${message}`);
      return;
    }
    const debugPort = await getFreePort();
    const profileDir = path.join(testEnv.dapCliHome, 'chrome-playwright-profile');
    let realContext: BrowserContext | undefined;

    try {
      const fixtureRoot = path.join(process.cwd(), 'tests', 'fixtures', 'simple-chrome-page');
      const pagePath = path.join(fixtureRoot, 'index.html');
      const manualFixtureUrl = `file://${pagePath}?manual=1`;
      const sourcePath = path.join(fixtureRoot, 'app.js');
      realContext = await chromium.launchPersistentContext(profileDir, {
        headless: true,
        args: ['--disable-gpu', '--no-first-run', `--remote-debugging-port=${debugPort}`],
      });
      const realPage = realContext.pages()[0] ?? await realContext.newPage();
      await realPage.goto(manualFixtureUrl);
      await expect.poll(async () => realPage.locator('#result').textContent()).toBe('waiting');

      const attach = await runCli([
        'attach',
        '--adapter', 'js-debug',
        '--json', JSON.stringify({
          type: 'pwa-chrome',
          request: 'attach',
          name: 'chrome-playwright-handoff',
          address: '127.0.0.1',
          port: debugPort,
          urlFilter: 'file://*simple-chrome-page/index.html*',
          targetSelection: 'automatic',
          webRoot: fixtureRoot,
          __dapCliInitialBreakpoints: [{ source: { path: sourcePath }, breakpoints: [{ line: 2 }] }],
        }),
        '--name', 'chrome-playwright-handoff',
      ], { env: testEnv.env });
      expect(attach.exitCode, JSON.stringify(attach)).toBe(0);

      // Wait for children to come up — controller polls until threads is non-empty.
      await expect.poll(async () => {
        const attachedThreads = await runCli(['threads', '--name', 'chrome-playwright-handoff'], { env: testEnv.env });
        return readEnvelopeData(attachedThreads.envelope, threadsDataSchema).threads.length;
      }, { timeout: 10_000 }).toBeGreaterThan(0);

      // Re-issue setBreakpoints now that children are up; the controller fans
      // it out, awaits per-child readiness, and aggregates verified flags.
      // Plan 05-09: per-child failures surface as `warnings` on the response —
      // if no breakpoints came back, dump them to make the failure
      // diagnosable instead of asserting `undefined.verified`.
      const sessionsBeforeBp = await runCli(['sessions'], { env: testEnv.env });
      const bpResponse = await runCli([
        'breakpoints', 'set',
        '--source', sourcePath,
        '--line', '2',
        '--name', 'chrome-playwright-handoff',
      ], { env: testEnv.env });
      expect(bpResponse.exitCode, JSON.stringify(bpResponse)).toBe(0);
      const bpData = readEnvelopeData(bpResponse.envelope, breakpointsSetDataSchema);
      const firstBp = bpData.breakpoints[0];
      expect(
        firstBp,
        `expected ≥1 breakpoint in setBreakpoints response; warnings=${JSON.stringify(bpData.warnings ?? [])}; sessions=${sessionsBeforeBp.stdout}`,
      ).toBeDefined();
      expect(
        firstBp?.verified,
        `breakpoint not verified: ${firstBp?.message ?? '(no message)'} | warnings=${JSON.stringify(bpData.warnings ?? [])}`,
      ).toBe(true);
      if (firstBp?.source?.path !== undefined) {
        expect(normalizePath(firstBp.source.path)).toMatch(/simple-chrome-page\/app\.js$/);
      }

      await realPage.evaluate('setTimeout("calculate(7, 8)", 0)');
      const stopped = await waitForStoppedEvent('chrome-playwright-handoff');
      expect(stopped, 'Expected breakpoint stopped event from the initial pre-configurationDone breakpoint.').toBeDefined();
      expect(readStoppedReason(stopped?.body)).toBe('breakpoint');

      const threads = await runCli(['threads', '--name', 'chrome-playwright-handoff'], { env: testEnv.env });
      const threadIds = readEnvelopeData(threads.envelope, threadsDataSchema).threads;
      expect(threadIds.length, 'expected non-empty threads while stopped').toBeGreaterThan(0);
      const threadId = threadIds[0]?.id;
      // js-debug pwa-chrome can legitimately surface a thread with id=0 (the
      // page-level session uses session-internal counters that aren't required
      // to be positive). DAP only requires `id` to be an integer. Same lesson
      // applied to frameId below.
      expect(threadId, `expected first thread to have a numeric id; threads=${JSON.stringify(threadIds)}`).toBeTypeOf('number');

      const stack = await runCli(['stack', '--thread-id', String(threadId), '--name', 'chrome-playwright-handoff'], { env: testEnv.env });
      const frame = readEnvelopeData(stack.envelope, stackDataSchema).stackFrames[0];
      const frameId = frame?.id;
      // js-debug uses 0-based frame ids (the topmost frame is id=0). DAP spec
      // does not require positive ids; only that the id is a number. Asserting
      // `> 0` was an incorrect adapter assumption baked in when the test was
      // written. See 05-15-SUMMARY.md (deviation: corrected wrong assertion).
      expect(frameId, `expected stack to have a frame; stack=${JSON.stringify(stack.envelope)}`).toBeTypeOf('number');
      expect(normalizePath(frame?.source?.path ?? '')).toMatch(/simple-chrome-page\/app\.js$/);

      const scopes = await runCli(['scopes', '--frame-id', String(frameId), '--name', 'chrome-playwright-handoff'], { env: testEnv.env });
      const variablesReference = readEnvelopeData(scopes.envelope, scopesDataSchema).scopes[0]?.variablesReference;
      expect(variablesReference).toBeGreaterThan(0);

      const variables = await runCli(['variables', '--variables-reference', String(variablesReference), '--name', 'chrome-playwright-handoff'], { env: testEnv.env });
      const localVars = readEnvelopeData(variables.envelope, variablesDataSchema).variables;
      const variableNames = localVars.map(variable => variable.name);
      expect(variableNames, 'local scope must contain `left`').toContain('left');
      expect(variableNames, 'local scope must contain `right`').toContain('right');
      expect(localVars.find(v => v.name === 'left')?.value).toBe('7');
      expect(localVars.find(v => v.name === 'right')?.value).toBe('8');

      const continued = await runCli(['continue', '--thread-id', String(threadId), '--name', 'chrome-playwright-handoff'], { env: testEnv.env });
      expect(continued.exitCode, JSON.stringify(continued)).toBe(0);
      await expect.poll(async () => realPage.locator('#result').textContent()).toBe('15');
    } finally {
      await runCli(['stop', '--name', 'chrome-playwright-handoff'], { env: testEnv.env }).catch(() => undefined);
      await realContext?.close().catch(() => undefined);
    }
  }, 45_000);

  test.skipIf(!runChromePlaywrightHandoff || !hasJsDebug)('coordinates Playwright with conditional breakpoints through js-debug', async (ctx) => {
    try {
      await provisionAdapterIntoTempEnv(testEnv, 'js-debug');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      ctx.skip(`js-debug not provisioned in user DAP_CLI_HOME — ${message}`);
      return;
    }
    const debugPort = await getFreePort();
    const profileDir = path.join(testEnv.dapCliHome, 'chrome-conditional-profile');
    let realContext: BrowserContext | undefined;

    try {
      const fixtureRoot = path.join(process.cwd(), 'tests', 'fixtures', 'simple-chrome-page');
      const pagePath = path.join(fixtureRoot, 'index.html');
      const manualFixtureUrl = `file://${pagePath}?manual=1`;
      const sourcePath = path.join(fixtureRoot, 'app.js');
      realContext = await chromium.launchPersistentContext(profileDir, {
        headless: true,
        args: ['--disable-gpu', '--no-first-run', `--remote-debugging-port=${debugPort}`],
      });
      const realPage = realContext.pages()[0] ?? await realContext.newPage();
      await realPage.goto(manualFixtureUrl);
      await expect.poll(async () => realPage.locator('#result').textContent()).toBe('waiting');

      const attach = await runCli([
        'attach',
        '--adapter', 'js-debug',
        '--json', JSON.stringify({
          type: 'pwa-chrome',
          request: 'attach',
          name: 'chrome-conditional-breakpoint',
          address: '127.0.0.1',
          port: debugPort,
          urlFilter: 'file://*simple-chrome-page/index.html*',
          targetSelection: 'automatic',
          webRoot: fixtureRoot,
        }),
        '--name', 'chrome-conditional-breakpoint',
      ], { env: testEnv.env });
      expect(attach.exitCode, JSON.stringify(attach)).toBe(0);

      await expect.poll(async () => {
        const attachedThreads = await runCli(['threads', '--name', 'chrome-conditional-breakpoint'], { env: testEnv.env });
        return readEnvelopeData(attachedThreads.envelope, threadsDataSchema).threads.length;
      }, { timeout: 10_000 }).toBeGreaterThan(0);

      const bpResponse = await runCli([
        'breakpoints', 'set',
        '--source', sourcePath,
        '--line', '2',
        '--condition', 'left === 7 && right === 8',
        '--name', 'chrome-conditional-breakpoint',
      ], { env: testEnv.env });
      expect(bpResponse.exitCode, JSON.stringify(bpResponse)).toBe(0);
      const bpData = readEnvelopeData(bpResponse.envelope, breakpointsSetDataSchema);
      expect(bpData.breakpoints[0]?.verified, `conditional breakpoint not verified: ${JSON.stringify(bpData)}`).toBe(true);

      const beforeFalse = await readEventsSnapshot('chrome-conditional-breakpoint');
      await realPage.evaluate('setTimeout("calculate(1, 2)", 0)');
      await expect.poll(async () => realPage.locator('#result').textContent()).toBe('3');
      const falseStopped = await waitForStoppedEvent('chrome-conditional-breakpoint', 1_000, beforeFalse.cursor);
      expect(falseStopped, 'false conditional path must not stop at the breakpoint').toBeUndefined();

      const beforeTrue = await readEventsSnapshot('chrome-conditional-breakpoint');
      await realPage.evaluate('setTimeout("calculate(7, 8)", 0)');
      const stopped = await waitForStoppedEvent('chrome-conditional-breakpoint', 10_000, beforeTrue.cursor);
      expect(stopped, 'true conditional path must stop at the breakpoint').toBeDefined();
      expect(readStoppedReason(stopped?.body)).toBe('breakpoint');

      const threads = await runCli(['threads', '--name', 'chrome-conditional-breakpoint'], { env: testEnv.env });
      const threadIds = readEnvelopeData(threads.envelope, threadsDataSchema).threads;
      expect(threadIds.length, 'expected non-empty threads while stopped').toBeGreaterThan(0);
      const threadId = threadIds[0]?.id;
      expect(threadId, `expected first thread to have a numeric id; threads=${JSON.stringify(threadIds)}`).toBeTypeOf('number');

      const stack = await runCli(['stack', '--thread-id', String(threadId), '--name', 'chrome-conditional-breakpoint'], { env: testEnv.env });
      const frame = readEnvelopeData(stack.envelope, stackDataSchema).stackFrames[0];
      const frameId = frame?.id;
      expect(frameId, `expected stack to have a frame; stack=${JSON.stringify(stack.envelope)}`).toBeTypeOf('number');
      expect(normalizePath(frame?.source?.path ?? '')).toMatch(/simple-chrome-page\/app\.js$/);

      const scopes = await runCli(['scopes', '--frame-id', String(frameId), '--name', 'chrome-conditional-breakpoint'], { env: testEnv.env });
      const variablesReference = readEnvelopeData(scopes.envelope, scopesDataSchema).scopes[0]?.variablesReference;
      expect(variablesReference).toBeGreaterThan(0);

      const variables = await runCli(['variables', '--variables-reference', String(variablesReference), '--name', 'chrome-conditional-breakpoint'], { env: testEnv.env });
      const localVars = readEnvelopeData(variables.envelope, variablesDataSchema).variables;
      expect(localVars.find(v => v.name === 'left')?.value).toBe('7');
      expect(localVars.find(v => v.name === 'right')?.value).toBe('8');

      const continued = await runCli(['continue', '--thread-id', String(threadId), '--name', 'chrome-conditional-breakpoint'], { env: testEnv.env });
      expect(continued.exitCode, JSON.stringify(continued)).toBe(0);
      await expect.poll(async () => realPage.locator('#result').textContent()).toBe('15');
    } finally {
      await runCli(['close', 'chrome-conditional-breakpoint'], { env: testEnv.env }).catch(() => undefined);
      await realContext?.close().catch(() => undefined);
    }
  }, 45_000);
});

async function expectResultText(expectedText: string): Promise<void> {
  await expect.poll(async () => page.locator('#result').textContent()).toBe(expectedText);
}

async function startFixtureServer(root: string): Promise<Server> {
  const server = createServer((request, response) => {
    void serveFixtureRequest(root, request.url, response);
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve());
  });
  return server;
}

async function serveFixtureRequest(root: string, url: string | undefined, response: ServerResponse): Promise<void> {
  const requestUrl = url === undefined || url === '/' ? '/index.html' : url;
  const pathname = new URL(requestUrl, 'http://127.0.0.1').pathname;
  const filePath = path.join(root, path.normalize(pathname).replace(/^[/\\]+/, ''));
  try {
    const content = await readFile(filePath);
    response.writeHead(200, { 'content-type': contentType(filePath) });
    response.end(content);
  } catch {
    response.writeHead(404);
    response.end('not found');
  }
}

function readPort(server: { address(): string | AddressInfo | null }): number {
  const address = server.address();
  if (typeof address === 'object' && address !== null) {
    return address.port;
  }

  throw new Error('Fixture server did not expose a TCP port.');
}

function contentType(filePath: string): string {
  if (filePath.endsWith('.html')) {
    return 'text/html';
  }
  if (filePath.endsWith('.js')) {
    return 'text/javascript';
  }
  return 'text/plain';
}

async function getFreePort(): Promise<number> {
  const server = net.createServer();
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve());
  });
  const port = readPort(server);
  await new Promise<void>(resolve => server.close(() => resolve()));
  return port;
}

async function waitForStoppedEvent(name: string, timeoutMs = 10_000, afterCursor = 0): Promise<{ event: string; body?: unknown } | undefined> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const snapshot = await readEventsSnapshot(name, afterCursor);
    const stopped = snapshot.events.find(event => event.event === 'stopped');
    if (stopped !== undefined) {
      return stopped;
    }
    await delay(100);
  }

  return undefined;
}

async function readEventsSnapshot(name: string, afterCursor = 0): Promise<z.infer<typeof eventsDataSchema>> {
  const events = await runCli(['events', '--name', name, '--include', 'stopped', '--after-cursor', String(afterCursor), '--limit', '50'], { env: testEnv.env });
  return readEnvelopeData(events.envelope, eventsDataSchema);
}

function readStoppedReason(body: unknown): string | undefined {
  if (typeof body !== 'object' || body === null || !('reason' in body)) {
    return undefined;
  }

  const reason = (body as { reason?: unknown }).reason;
  return typeof reason === 'string' ? reason : undefined;
}

function readEnvelopeData<T>(envelope: unknown, schema: z.ZodType<T>): T {
  const parsedEnvelope = envelopeSchema.safeParse(envelope);
  if (!parsedEnvelope.success) {
    throw new Error(`Expected success envelope: ${JSON.stringify(envelope)}`);
  }

  return schema.parse(parsedEnvelope.data.data);
}

function readStringField(envelope: unknown, field: string): string {
  const data = readEnvelopeData(envelope, z.record(z.string(), z.unknown()));
  const value = data[field];
  if (typeof value !== 'string') {
    throw new Error(`Expected string field '${field}': ${JSON.stringify(data)}`);
  }

  return value;
}

function normalizePath(value: string): string {
  return value.split(path.sep).join('/');
}
