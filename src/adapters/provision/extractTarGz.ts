import { createReadStream } from 'node:fs';
import * as tar from 'tar';
import { usageError } from '../../cli/errors.js';

export interface ExtractTarGzOptions {
  /** Number of leading path components to strip from each archive entry. Defaults to 0. */
  readonly strip?: number;
}

export async function extractTarGz(
  archivePath: string,
  destDir: string,
  options: ExtractTarGzOptions = {},
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const source = createReadStream(archivePath);
    const extract = tar.x({
      cwd: destDir,
      strict: true,
      strip: options.strip ?? 0,
    });
    source.on('error', reject);
    extract.on('error', reject);
    extract.on('finish', resolve);
    source.pipe(extract);
  }).catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    throw usageError('Archive extraction failed.', {
      code: 'provision_extract_failed',
      diagnostics: [archivePath, message],
      data: { archivePath },
      cause: error,
    });
  });
}
