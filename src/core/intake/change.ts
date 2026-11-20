import { createHash } from 'node:crypto';
import { ReviewError } from '../errors/review-error.js';
import type { ContextualLog } from '../log/log.js';
import type { ChangedFile as PortFile, GitAccessPort } from '../git/port.js';

/**
 * The change of a review: every difference between the base commit and the working tree (C001-REQ-101),
 * as the git access port reports it (C001-IF-012 G-07), and the base commit named by the developer
 * (C001-REQ-102). The default base rules are C001-T-025.
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

export interface ResolvedBase {
  /** The base commit: the merge base of the named commit and HEAD. */
  readonly base: string;
  readonly head: string;
}

/**
 * C001-REQ-102: the merge base of the named commit and HEAD. ERR-INTAKE-003 (from the port) when the
 * value names no commit, ERR-INTAKE-004 when the commit has no common ancestor with HEAD.
 */
export async function resolveNamedBase(
  git: GitAccessPort,
  value: string,
  log?: ContextualLog,
): Promise<ResolvedBase> {
  const head = (await git.head()).commit;
  const named = await git.resolveCommit(value);
  const base = await git.mergeBase(named, head);
  if (base === null) {
    fail(
      log,
      new ReviewError('ERR-INTAKE-004', {
        operation: 'intake',
        inputs: { value },
        params: { value },
      }),
    );
  }
  return { base, head };
}

/** One changed file with the hash that names its snapshot-side content. */
export interface ChangeFile {
  readonly file: PortFile;
  /**
   * SHA-256 of the snapshot-side bytes: the name of the content blob in the store. `null` for a
   * deleted file and for a binary file, whose content is not kept (C001-REQ-108).
   */
  readonly contentSha256: string | null;
}

const byPath = (a: PortFile, b: PortFile) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0);

/**
 * The changed files against the base commit, sorted by path. ERR-INTAKE-005 when nothing differs: no
 * snapshot document can describe an empty change (C001-REQ-107; the other empty-change rules and
 * the size warning are C001-T-026).
 */
export async function computeChange(
  git: GitAccessPort,
  base: string,
  log?: ContextualLog,
): Promise<ChangeFile[]> {
  const files = [...(await git.changeAgainst(base))].sort(byPath);
  if (files.length === 0) {
    fail(
      log,
      new ReviewError('ERR-INTAKE-005', {
        operation: 'intake',
        inputs: { base },
        params: { hash: base },
      }),
    );
  }
  return files.map((file) => ({
    file,
    contentSha256:
      file.binary || file.currentContent === null
        ? null
        : createHash('sha256').update(file.currentContent).digest('hex'),
  }));
}
