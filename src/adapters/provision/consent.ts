import path from 'node:path';
import { promises as fs } from 'node:fs';

function markerPath(adaptersDir: string, adapterId: string, version: string): string {
  return path.join(adaptersDir, adapterId, `.consent-${version}`);
}

export async function hasConsentMarker(adaptersDir: string, adapterId: string, version: string): Promise<boolean> {
  try {
    await fs.stat(markerPath(adaptersDir, adapterId, version));
    return true;
  } catch {
    return false;
  }
}

export async function writeConsentMarker(adaptersDir: string, adapterId: string, version: string): Promise<void> {
  const filePath = markerPath(adaptersDir, adapterId, version);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${new Date().toISOString()}\n`, { flag: 'w' });
}
