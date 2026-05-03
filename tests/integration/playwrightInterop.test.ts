import { createServer, type Server, type ServerResponse } from 'node:http';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { chromium, type Browser, type Page } from '@playwright/test';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { z } from 'zod';
import { startControllerServer, type ControllerServer } from '../../src/controller/server.js';
import { createCliTestEnv, runCli, type CliTestEnv } from '../helpers/runCli.js';

const envelopeSchema = z.object({ ok: z.literal(true), data: z.unknown() });
const eventsDataSchema = z.object({ events: z.array(z.object({ event: z.string() })) });
const threadsDataSchema = z.object({ threads: z.array(z.object({ id: z.number(), name: z.string() })) });
const stackDataSchema = z.object({ stackFrames: z.array(z.object({ id: z.number(), name: z.string() })) });
const scopesDataSchema = z.object({ scopes: z.array(z.object({ name: z.string(), variablesReference: z.number() })) });
const variablesDataSchema = z.object({ variables: z.array(z.object({ name: z.string(), value: z.string(), variablesReference: z.number() })) });

let browser: Browser;
let page: Page;
let fixtureServer: Server;
let fixtureUrl: string;
let testEnv: CliTestEnv;
let controller: ControllerServer;

describe('Playwright interop', () => {
  beforeAll(async () => {
    testEnv = await createCliTestEnv('dap-cli-playwright-interop-');
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
  const filePath = path.join(root, path.normalize(requestUrl).replace(/^[/\\]+/, ''));
  try {
    const content = await fs.readFile(filePath);
    response.writeHead(200, { 'content-type': contentType(filePath) });
    response.end(content);
  } catch {
    response.writeHead(404);
    response.end('not found');
  }
}

function readPort(server: Server): number {
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
