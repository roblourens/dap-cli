#!/usr/bin/env node --experimental-transform-types
// Dev wrapper around `dap-cli setup-adapters` (D-13). Real provisioning lives
// in src/adapters/provision; this exists so `npm run setup-adapters` keeps
// working without a prior `npm run build`. The hook maps `./x.js` imports in
// src/ to their `.ts` siblings (Node 22's --experimental-strip-types does not).
import { register } from 'node:module';
register('./dev/strip-types-resolve-loader.mjs', import.meta.url);

const { runSetupAdaptersAction } = await import('../src/cli/commands/setupAdapters.ts');
const { resolveAssumeYes } = await import('../src/cli/confirm.ts');

const args = process.argv.slice(2);
const raw = args[args.indexOf('--adapter') + 1];
const adapter = raw === 'js-debug' || raw === 'debugpy' || raw === 'delve' ? raw : undefined;
const assumeYes = resolveAssumeYes(args.includes('--yes') || args.includes('-y'), process.env);

try {
  const result = await runSetupAdaptersAction({
    ...(adapter !== undefined ? { adapter } : {}),
    assumeYes, env: process.env,
    stdin: process.stdin, stderr: process.stderr, stdout: process.stdout,
  });
  process.exitCode = result.adapters.some(a => a.status === 'failed') ? 1 : 0;
} catch (err) {
  process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
  process.exitCode = 1;
}
