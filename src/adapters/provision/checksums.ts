// SOURCE OF RECORD for pinned adapter versions and SHA-256 checksums of their
// release artifacts. Regenerate via `node --experimental-strip-types
// scripts/dev/regen-checksums.ts` and paste the output here by hand (D-21).
// 21-04 adds an architecture test that asserts every hash matches /^[a-f0-9]{64}$/
// — placeholders like '0'.repeat(64) will fail that gate.

export const JS_DEBUG_VERSION = '1.117.0';
export const DEBUGPY_VERSION = '1.8.20';
export const DELVE_VERSION = 'v1.26.3';

export const JS_DEBUG_CHECKSUMS: Record<string, string> = {
  '1.117.0': 'ad8d04ede9d4b75cc290fd5438a65047a06f786d04f604b6112485b36f090772',
};

export type DelvePlatformKey =
  | 'darwin_arm64'
  | 'darwin_amd64'
  | 'linux_amd64'
  | 'linux_arm64'
  | 'windows_amd64';

export const DELVE_CHECKSUMS: Record<string, Record<DelvePlatformKey, string>> = {
  'v1.26.3': {
    darwin_arm64: '7f28483a42f0a911f29b236aa40d24d7099f1b0ec54c56c4d439a6903d478a3d',
    darwin_amd64: '6827a438473167a1e0805b4546e5bf2d53401530f694deb35e41c6e7b46e27c8',
    linux_amd64: 'cdd4d6b2a638d8f26468d82a76b766df594641490bea566629305d90fbccc06e',
    linux_arm64: '5b03fd74895d676c4435bec1aade0863be1489a4be1bb5c9269c6ef389bf5d2d',
    windows_amd64: 'f9e15b8f3628e4c7bfe481011bea458df754d0e75c6ff4ab01c71294165950fd',
  },
};
