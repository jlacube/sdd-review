import { createHash } from 'node:crypto';
import { ReviewError } from '../errors/review-error.js';
import type { ChangedFile as PortFile } from '../git/port.js';
import type { ContextualLog } from '../log/log.js';
import type { ChangeFile } from './change.js';

/**
 * The classification of the changed files that intake takes in (C001-T-026): the empty change
 * stops intake (C001-REQ-107), and a binary file is listed with its path and change type, without
 * hunks and with 0 changed lines (C001-REQ-108), while its snapshot-side bytes are kept like those
 * of a text file (domain model §2.2 `content`, C001-REQ-116), so that the snapshot can fill an
 * evidence workspace (C001-IF-013 §2).
 *
 * Which file is binary is git's own rule, applied by the git access adapter (C001-IF-012 G-07): a
 * NUL byte in the first 8,000 bytes of either side.
 */

/** The bytes the snapshot keeps for a file: its snapshot side; `null` for a deleted file. */
export function snapshotBytes(file: PortFile): Buffer | null {
  if (file.changeType === 'deleted') return null;
  return file.binary ? (file.binaryContent ?? null) : file.currentContent;
}

/** True when a binary file contributes no hunk and no changed line (C001-REQ-108). */
export function hasHunks(file: PortFile): boolean {
  return !file.binary;
}

/**
 * The changed files of the change with the SHA-256 that names each file's snapshot-side content
 * in the store, sorted by path. Stops with ERR-INTAKE-005 when the change holds no difference:
 * nothing is written and no snapshot is created (C001-REQ-107).
 */
export function classifyChange(
  files: readonly PortFile[],
  base: string,
  log?: ContextualLog,
): ChangeFile[] {
  if (files.length === 0) {
    const error = new ReviewError('ERR-INTAKE-005', {
      operation: 'intake',
      inputs: { base },
      params: { hash: base },
      cause: 'the working tree matches the base commit',
    });
    try {
      log?.recordError(error, 'intake');
    } catch {
      /* a failing log never hides the error */
    }
    throw error;
  }
  return [...files]
    .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))
    .map((file) => {
      const bytes = snapshotBytes(file);
      return {
        file,
        contentSha256: bytes === null ? null : createHash('sha256').update(bytes).digest('hex'),
      };
    });
}
