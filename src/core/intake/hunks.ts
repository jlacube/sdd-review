import { createHash } from 'node:crypto';
import type { Hunk, HunkLine } from '../../generated/analysis-results.js';
import { splitLines } from '../git/line-diff.js';
import { histogramDiff } from './diff/histogram.js';

/**
 * Hunks of one file and their identity (domain model §3, C001-ADR-009 §1). A hunk is a maximal run
 * of consecutive changed lines, with no context (domain model §2.4): one edit of the histogram
 * diff.
 */

/** A hunk before it has an identifier (the identifier needs the snapshot ID). */
export interface CutHunk {
  readonly path: string;
  readonly oldStart: number;
  readonly oldLines: number;
  readonly newStart: number;
  readonly newLines: number;
  readonly lines: [HunkLine, ...HunkLine[]];
  readonly contentKey: string;
}

const sha256Hex = (text: string) => createHash('sha256').update(text, 'utf8').digest('hex');

/** The text of a line as the review shows it: UTF-8, without its line feed. */
function display(line: string): string {
  const text = line.endsWith('\n') ? line.slice(0, -1) : line;
  return Buffer.from(text, 'latin1').toString('utf8');
}

/**
 * Hunk content key (domain model §3): SHA-256 of the path and the changed lines with their `+` or
 * `-` marker, line numbers excluded. Canonical text: the path and a line feed, then for every
 * changed line its marker, its text and a line feed; a line that had no final line feed in the
 * file is followed by the line `\ No newline at end of file`, so that adding or removing a final
 * line feed changes the key. Deleted lines come first, as in the hunk.
 */
export function contentKeyOf(path: string, lines: ReadonlyArray<HunkLine & { eol: boolean }>) {
  let text = `${path}\n`;
  for (const line of lines) {
    text += `${line.kind === 'added' ? '+' : '-'}${line.text}\n`;
    if (!line.eol) text += '\\ No newline at end of file\n';
  }
  return sha256Hex(text);
}

/** Hunk ID (domain model §3): `h-` and the first 16 hex digits of the SHA-256 of the identity. */
export function hunkIdOf(
  snapshotId: string,
  path: string,
  oldStart: number,
  newStart: number,
  contentKey: string,
): string {
  const identity = JSON.stringify([snapshotId, path, oldStart, newStart, contentKey]);
  return `h-${sha256Hex(identity).slice(0, 16)}`;
}

/**
 * The hunks of one text file, in file order. A missing side (added or deleted file) is `null`;
 * `Buffer.alloc(0)` is an empty file, which has no lines. Start lines follow the unified diff
 * convention: 1-based, and for a side without lines the line before the hunk (0 at the top).
 */
export function cutHunks(path: string, base: Buffer | null, current: Buffer | null): CutHunk[] {
  const a = base ? splitLines(base) : [];
  const b = current ? splitLines(current) : [];
  return histogramDiff(a, b).map((edit) => {
    const detailed: Array<HunkLine & { eol: boolean }> = [];
    for (let i = edit.aStart; i < edit.aEnd; i++) {
      detailed.push({
        kind: 'deleted',
        text: display(a[i]!),
        oldNumber: i + 1,
        eol: a[i]!.endsWith('\n'),
      });
    }
    for (let j = edit.bStart; j < edit.bEnd; j++) {
      detailed.push({
        kind: 'added',
        text: display(b[j]!),
        newNumber: j + 1,
        eol: b[j]!.endsWith('\n'),
      });
    }
    const oldLines = edit.aEnd - edit.aStart;
    const newLines = edit.bEnd - edit.bStart;
    return {
      path,
      oldStart: oldLines > 0 ? edit.aStart + 1 : edit.aStart,
      oldLines,
      newStart: newLines > 0 ? edit.bStart + 1 : edit.bStart,
      newLines,
      lines: detailed.map(({ eol: _eol, ...line }) => line) as CutHunk['lines'],
      contentKey: contentKeyOf(path, detailed),
    };
  });
}

/**
 * The hunk records of a snapshot for one file. Attribution to commits, test hunks and move partners
 * are filled by later tasks (C001-T-027, C001-T-047 and the test-hunk rule): `commits` is empty,
 * `uncommitted` and `isTestHunk` are false until then.
 */
export function identifyHunks(snapshotId: string, cut: readonly CutHunk[]): Hunk[] {
  return cut.map((hunk) => ({
    hunkId: hunkIdOf(snapshotId, hunk.path, hunk.oldStart, hunk.newStart, hunk.contentKey),
    contentKey: hunk.contentKey,
    path: hunk.path,
    oldStart: hunk.oldStart,
    oldLines: hunk.oldLines,
    newStart: hunk.newStart,
    newLines: hunk.newLines,
    changedLines: hunk.oldLines + hunk.newLines,
    lines: hunk.lines,
    commits: [],
    uncommitted: false,
    isTestHunk: false,
  })) as Hunk[];
}
