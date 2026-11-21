import type { Notice } from '../../generated/analysis-results.js';
import { lookupError } from '../errors/catalogue.js';
import { fillMessage, ReviewError } from '../errors/review-error.js';
import type { ContextualLog } from '../log/log.js';
import { CLEAN_FILTER_CAUSE_TEXT } from '../git/clean-filter.js';
import type { ChangedFile as PortFile, GitAccessPort } from '../git/port.js';
import { classifyChange } from './classify.js';
import { groupDigits } from './size.js';

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

/** At most this many files are named in notice ERR-INTAKE-009 (C001-REQ-126). */
export const CLEAN_FILTER_NOTICE_LIMIT = 10;

/**
 * Notice ERR-INTAKE-009 (C001-REQ-126, C001-IF-012 §7 item 4): once, when the change lists one or
 * more files under a clean filter that §7 item 3 compared by their working-tree bytes and that the
 * base commit holds at the same path, with their number, their filter drivers and up to 10 of them,
 * each with its cause. A file that a matching Git LFS pointer file or an up-to-date index entry
 * settled (§7 items 2 and 7), and an added file, carries no `cleanFilter` and is not named. `null`
 * when no file qualifies. Logged as a notice through the contextual log (NFR-D-04).
 */
export function cleanFilterNotice(
  files: ReadonlyArray<ChangeFile | PortFile>,
  log?: ContextualLog,
  inputs: Readonly<Record<string, unknown>> = {},
): Notice | null {
  const kept = files
    .map((f) => ('file' in f ? f.file : f))
    .filter((f) => f.cleanFilter !== undefined && f.changeType === 'modified')
    .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  if (kept.length === 0) return null;
  const drivers = [...new Set(kept.map((f) => f.cleanFilter!.driver))].sort();
  const named = kept.slice(0, CLEAN_FILTER_NOTICE_LIMIT);
  const entries = named
    .map((f) => `${f.path} (${CLEAN_FILTER_CAUSE_TEXT[f.cleanFilter!.cause]})`)
    .join(', ');
  const params = { n: groupDigits(kept.length), 'filter drivers': drivers.join(', ') };
  const notice = new ReviewError('ERR-INTAKE-009', {
    operation: 'intake',
    inputs: {
      ...inputs,
      files: kept.length,
      drivers,
      paths: named.map((f) => ({ path: f.path, cause: f.cleanFilter!.cause })),
    },
    params,
    cause: 'files under a clean filter are compared by their working-tree bytes',
  });
  // The list of the catalogue message nests placeholders: it is filled here, verbatim otherwise.
  notice.message = fillMessage(lookupError('ERR-INTAKE-009').message, params).replace(
    /<up to 10 entries: .*?>\)>/,
    () => entries,
  );
  try {
    log?.recordError(notice, 'intake');
  } catch {
    /* a failing log never hides the notice */
  }
  return { code: notice.code, message: notice.message };
}
