import { promises as fs, createWriteStream } from 'node:fs';
import path from 'node:path';
import yauzl from 'yauzl';
import { usageError, CliError } from '../../cli/errors.js';

const SYMLINK_MODE = 0o120000;
const UNIX_MODE_MASK = 0o170000;

function isUnsafeFileName(fileName: string): boolean {
  if (path.isAbsolute(fileName)) {
    return true;
  }
  if (/^[A-Za-z]:[\\/]/.test(fileName)) {
    return true;
  }
  return fileName.split(/[\\/]/).includes('..');
}

function isSymlinkEntry(entry: yauzl.Entry): boolean {
  // External file attributes upper 16 bits are the POSIX mode on Unix-format zips.
  const unixMode = (entry.externalFileAttributes >>> 16) & UNIX_MODE_MASK;
  return unixMode === SYMLINK_MODE;
}

function unsafeEntryError(archivePath: string, fileName: string): CliError {
  return usageError('Archive contains unsafe entry path.', {
    code: 'provision_extract_failed',
    diagnostics: [`Entry: ${fileName}`, `Archive: ${archivePath}`],
    data: { archivePath, entry: fileName },
  });
}

function wrapExtractError(archivePath: string, error: unknown): CliError {
  if (error instanceof CliError) {
    return error;
  }
  const message = error instanceof Error ? error.message : String(error);
  return usageError('Archive extraction failed.', {
    code: 'provision_extract_failed',
    diagnostics: [archivePath, message],
    data: { archivePath },
    cause: error,
  });
}

export async function extractZip(archivePath: string, destDir: string): Promise<void> {
  await fs.mkdir(destDir, { recursive: true });
  await new Promise<void>((resolve, reject) => {
    yauzl.open(archivePath, { lazyEntries: true }, (openErr, zip) => {
      if (openErr || zip === undefined) {
        reject(openErr ?? new Error('zip open failed'));
        return;
      }

      const handleError = (err: unknown): void => {
        try {
          zip.close();
        } catch {
          // ignore close errors during failure path
        }
        reject(err);
      };

      zip.on('error', handleError);
      zip.on('end', () => {
        resolve();
      });

      zip.on('entry', (entry: yauzl.Entry) => {
        if (isUnsafeFileName(entry.fileName)) {
          handleError(unsafeEntryError(archivePath, entry.fileName));
          return;
        }
        if (isSymlinkEntry(entry)) {
          handleError(unsafeEntryError(archivePath, entry.fileName));
          return;
        }

        const dest = path.join(destDir, entry.fileName);
        if (entry.fileName.endsWith('/')) {
          fs.mkdir(dest, { recursive: true })
            .then(() => {
              zip.readEntry();
            })
            .catch(handleError);
          return;
        }

        fs.mkdir(path.dirname(dest), { recursive: true })
          .then(() => {
            zip.openReadStream(entry, (readErr, readStream) => {
              if (readErr || readStream === undefined) {
                handleError(readErr ?? new Error('zip read failed'));
                return;
              }
              const out = createWriteStream(dest);
              out.on('finish', () => {
                zip.readEntry();
              });
              out.on('error', handleError);
              readStream.on('error', handleError);
              readStream.pipe(out);
            });
          })
          .catch(handleError);
      });

      zip.readEntry();
    });
  }).catch((error: unknown) => {
    throw wrapExtractError(archivePath, error);
  });
}
