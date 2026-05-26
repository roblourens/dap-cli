#!/usr/bin/env node
// Maintainer helper (D-21). Downloads each pinned adapter artifact, computes
// SHA-256, and prints a TypeScript snippet to stdout. Deliberately does NOT
// mutate src/adapters/provision/checksums.ts so that the diff is reviewed by a
// human during the version-bump PR.
//
// Usage:
//   node --experimental-strip-types scripts/dev/regen-checksums.ts > /tmp/checksums.txt
//   # then paste the values into src/adapters/provision/checksums.ts

import { createHash } from 'node:crypto';
import { Buffer } from 'node:buffer';
// Dynamic import keeps this maintainer script self-contained at runtime
// (`node --experimental-strip-types`) without forcing the whole repo to enable
// `allowImportingTsExtensions`.
// @ts-expect-error -- TS5097: .ts extension is required at runtime here
const { JS_DEBUG_VERSION, DELVE_VERSION } = await import('../../src/adapters/provision/checksums.ts');

interface Asset {
  readonly label: string;
  readonly key: string;
  readonly url: string;
}

async function sha256OfUrl(url: string): Promise<string> {
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} ${res.statusText} for ${url}`);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  return createHash('sha256').update(buf).digest('hex');
}

function buildAssets(): Asset[] {
  const delveBare = DELVE_VERSION.replace(/^v/, '');
  return [
    {
      label: `js-debug ${JS_DEBUG_VERSION}`,
      key: `JS_DEBUG_CHECKSUMS['${JS_DEBUG_VERSION}']`,
      url: `https://github.com/microsoft/vscode-js-debug/releases/download/v${JS_DEBUG_VERSION}/js-debug-dap-v${JS_DEBUG_VERSION}.tar.gz`,
    },
    {
      label: `delve ${DELVE_VERSION} darwin_arm64`,
      key: `DELVE_CHECKSUMS['${DELVE_VERSION}'].darwin_arm64`,
      url: `https://github.com/go-delve/delve/releases/download/${DELVE_VERSION}/dlv_${delveBare}_darwin_arm64.tar.gz`,
    },
    {
      label: `delve ${DELVE_VERSION} darwin_amd64`,
      key: `DELVE_CHECKSUMS['${DELVE_VERSION}'].darwin_amd64`,
      url: `https://github.com/go-delve/delve/releases/download/${DELVE_VERSION}/dlv_${delveBare}_darwin_amd64.tar.gz`,
    },
    {
      label: `delve ${DELVE_VERSION} linux_amd64`,
      key: `DELVE_CHECKSUMS['${DELVE_VERSION}'].linux_amd64`,
      url: `https://github.com/go-delve/delve/releases/download/${DELVE_VERSION}/dlv_${delveBare}_linux_amd64.tar.gz`,
    },
    {
      label: `delve ${DELVE_VERSION} linux_arm64`,
      key: `DELVE_CHECKSUMS['${DELVE_VERSION}'].linux_arm64`,
      url: `https://github.com/go-delve/delve/releases/download/${DELVE_VERSION}/dlv_${delveBare}_linux_arm64.tar.gz`,
    },
    {
      label: `delve ${DELVE_VERSION} windows_amd64`,
      key: `DELVE_CHECKSUMS['${DELVE_VERSION}'].windows_amd64`,
      url: `https://github.com/go-delve/delve/releases/download/${DELVE_VERSION}/dlv_${delveBare}_windows_amd64.zip`,
    },
  ];
}

async function main(): Promise<void> {
  const assets = buildAssets();
  process.stdout.write('// Paste these values into src/adapters/provision/checksums.ts\n\n');
  for (const asset of assets) {
    process.stderr.write(`computing: ${asset.label}\n`);
    const hex = await sha256OfUrl(asset.url);
    process.stdout.write(`${asset.key}: '${hex}',\n`);
  }
}

main().catch((err: unknown) => {
   
  console.error(err);
  process.exit(1);
});
