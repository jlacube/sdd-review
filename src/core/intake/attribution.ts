import type { ChangeCommit, Hunk } from '../../generated/analysis-results.js';
import { ReviewError } from '../errors/review-error.js';
import type { GitAccessPort } from '../git/port.js';
import type { ContextualLog } from '../log/log.js';
import { fail, type ChangeFile } from './change.js';

/**
 * Hunk attribution (C001-REQ-110, domain model §2.4): for each hunk, the commits between the base
 * commit and HEAD that added or deleted its changed lines, and whether it holds uncommitted
 * changed lines. The lines are attributed by the git access port (C001-IF-012 G-09), which compares
 * versions with the histogram diff of the hunks (C001-ADR-009 §1) and is deterministic for merges
 * (`src/core/git/line-attribution.ts`). It is given the snapshot's two sides of each file, so its
 * added and deleted lines are those of the hunks, in the same order: the hunks of a file take them
 * in file order. A hunk's commits are listed in the order of the commits of the change (oldest
 * first).
 */

/** How many files are attributed at the same time. */
const PARALLEL_FILES = 8;

export interface AttributionInput {
  readonly base: string;
  readonly head: string;
  /** The commits of the change, oldest first (`readChangeCommits`). */
  readonly commits: readonly ChangeCommit[];
  readonly files: readonly ChangeFile[];
  /** The hunks of the snapshot, as cut from `files`. */
  readonly hunks: readonly Hunk[];
}

/** The hunks with `commits` and `uncommitted` filled, in the order given. */
export async function attributeHunks(
  git: GitAccessPort,
  input: AttributionInput,
  log?: ContextualLog,
): Promise<Hunk[]> {
  const { base, head, files, hunks } = input;
  if (hunks.length === 0) return [];
  // The base commit is HEAD: every changed line is uncommitted and no commit is between them.
  if (base === head) return hunks.map((h) => ({ ...h, commits: [], uncommitted: true }));

  const rank = new Map(input.commits.map((c, k) => [c.hash, k]));
  const byPath = new Map<string, Hunk[]>();
  for (const hunk of hunks) {
    const list = byPath.get(hunk.path) ?? [];
    list.push(hunk);
    byPath.set(hunk.path, list);
  }
  const fileOf = new Map(files.map((f) => [f.file.path, f.file]));
  const filled = new Map<string, Pick<Hunk, 'commits' | 'uncommitted'>>();

  const attributeFile = async (path: string, fileHunks: readonly Hunk[]) => {
    const file = fileOf.get(path);
    const lines = file
      ? await git.attributeLines(base, head, path, {
          basePath: file.previousPath ?? path,
          baseContent: file.baseContent,
          currentContent: file.currentContent,
        })
      : null;
    const deletedCount = fileHunks.reduce((n, h) => n + h.oldLines, 0);
    const addedCount = fileHunks.reduce((n, h) => n + h.newLines, 0);
    if (!lines || lines.deleted.length !== deletedCount || lines.added.length !== addedCount) {
      fail(
        log,
        new ReviewError('ERR-CLI-003', {
          operation: 'attribute-hunks',
          inputs: { base, head, path },
          params: {
            operation: 'attribute-hunks',
            cause: `the line attribution of "${path}" does not match its hunks`,
          },
        }),
      );
    }
    let d = 0;
    let a = 0;
    for (const hunk of fileHunks) {
      const by = [
        ...lines.deleted.slice(d, (d += hunk.oldLines)),
        ...lines.added.slice(a, (a += hunk.newLines)),
      ];
      const commits = [...new Set(by.filter((c): c is string => c !== null))].sort(
        (x, y) => (rank.get(x) ?? rank.size) - (rank.get(y) ?? rank.size) || (x < y ? -1 : 1),
      );
      filled.set(hunk.hunkId, { commits, uncommitted: by.includes(null) });
    }
  };

  const queue = [...byPath.entries()];
  const workers = Array.from({ length: Math.min(PARALLEL_FILES, queue.length) }, async () => {
    for (let next = queue.shift(); next; next = queue.shift()) await attributeFile(...next);
  });
  await Promise.all(workers);
  return hunks.map((h) => ({ ...h, ...filled.get(h.hunkId)! }));
}
