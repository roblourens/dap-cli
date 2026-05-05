import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

let cachedBuildId: string | undefined;

/**
 * Compute a deterministic build identifier for the current dap-cli install.
 *
 * Strategy:
 * - Resolve `package.json` by walking up from this module and read its `version`.
 * - If `dist/index.js` exists alongside `package.json`, encode its mtime + size
 *   into the id (so prod-style installs from the same build produce identical ids
 *   across CLI and controller processes).
 * - Otherwise (development / tests via tsx / vitest) fall back to the package
 *   version only — every process in the same source tree agrees on the id, so
 *   the controller-reuse handshake does NOT trip during ordinary dev workflows.
 *
 * The result is cached per process; callers may invoke this repeatedly.
 */
export async function computeBuildId(): Promise<string> {
  if (cachedBuildId !== undefined) {
    return cachedBuildId;
  }

  const envOverride = process.env.DAP_CLI_BUILD_ID;
  if (envOverride !== undefined && envOverride.length > 0) {
    cachedBuildId = envOverride;
    return cachedBuildId;
  }

  const here = path.dirname(fileURLToPath(import.meta.url));
  const pkgPath = await findPackageJson(here);
  let version = '0.0.0';
  let pkgDir = here;
  if (pkgPath !== undefined) {
    pkgDir = path.dirname(pkgPath);
    try {
      const raw = await fs.readFile(pkgPath, 'utf8');
      const parsed = JSON.parse(raw) as { version?: unknown };
      if (typeof parsed.version === 'string' && parsed.version.length > 0) {
        version = parsed.version;
      }
    } catch {
      // keep default version
    }
  }

  const distPath = path.join(pkgDir, 'dist', 'index.js');
  try {
    const stat = await fs.stat(distPath);
    cachedBuildId = `${version}:dist:${stat.mtimeMs}:${stat.size}`;
  } catch {
    cachedBuildId = `${version}:src`;
  }

  return cachedBuildId;
}

/** Test-only: clear the cached build id so subsequent calls recompute. */
export function resetCachedBuildIdForTesting(): void {
  cachedBuildId = undefined;
}

async function findPackageJson(startDir: string): Promise<string | undefined> {
  let dir = startDir;
  for (let depth = 0; depth < 8; depth += 1) {
    const candidate = path.join(dir, 'package.json');
    try {
      await fs.access(candidate);
      return candidate;
    } catch {
      const parent = path.dirname(dir);
      if (parent === dir) {
        return undefined;
      }
      dir = parent;
    }
  }
  return undefined;
}
