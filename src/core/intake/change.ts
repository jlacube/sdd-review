import { ReviewError } from '../errors/review-error.js';
import type { ContextualLog } from '../log/log.js';
import type { ChangedFile as PortFile, GitAccessPort } from '../git/port.js';
import { classifyChange } from './classify.js';

/**
 * The change of a review: every difference between the base commit and the working tree (C001-REQ-101),
 * as the git access port reports it (C001-IF-012 G-07). The base commit is chosen in `base.ts`.
 */

/** Records a ReviewError in the log and throws it; a failing log never hides the error. */
export function fail(log: ContextualLog | undefined, error: ReviewError): never {
  try {
    log?.recordError(error, error.context.operation);
  } catch {
    /* the error itself is what matters */
  }
  throw error;
}

/** One changed file with the hash that names its snapshot-side content. */
export interface ChangeFile {
  readonly file: PortFile;
  /**
   * SHA-256 of the snapshot-side bytes, text or binary (domain model §2.2 `content`): the name of
   * the content blob in the store. `null` for a deleted file.
   */
  readonly contentSha256: string | null;
}

/**
 * The changed files against the base commit, sorted by path, classified by `classify.ts`:
 * ERR-INTAKE-005 when nothing differs (C001-REQ-107), binary files kept without hunks
 * (C001-REQ-108).
 */
export async function computeChange(
  git: GitAccessPort,
  base: string,
  log?: ContextualLog,
): Promise<ChangeFile[]> {
  return classifyChange(await git.changeAgainst(base), base, log);
}
