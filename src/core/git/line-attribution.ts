import { histogramDiff } from '../intake/diff/histogram.js';
import type { LineAttribution } from './port.js';

/**
 * The line attribution of G-09 (C001-IF-012 §3, C001-REQ-110) as a pure function of the versions of
 * one file: the base side, the version at every commit of the range (C001-IF-012 G-06), the
 * versions at the boundary commits the range starts from, and the snapshot side.
 *
 * Every comparison uses the histogram diff of the snapshot's hunks (C001-ADR-009 §1, C001-CON-17),
 * so that the added and deleted lines listed are exactly the changed lines of the snapshot's hunks,
 * in the same order, and the result is the same on every machine:
 *  - `added` holds one entry per added line of `histogramDiff(base, current)`, in snapshot order;
 *  - `deleted` holds one entry per deleted line of that diff, in base order.
 *
 * Rules, all fixed:
 *  1. Each version is compared with each of its parents' versions, first parent first (as `git
 *     blame` does). A line found in a parent keeps that parent's origin; a line found in no parent
 *     was added by the commit (or, for the snapshot side, is uncommitted). For a merge commit the
 *     first parent in which a line is found decides, which makes merges deterministic.
 *  2. A base line that a parent holds and the version no longer holds was deleted: by the commit
 *     that had already deleted it in another parent (the merge took that side), else by the
 *     version's own commit (or "uncommitted" for the snapshot side).
 *  3. Line identity along the history can disagree with the direct comparison of the base side
 *     and the snapshot side (a line moved across other edits, a line that also exists on an older
 *     boundary commit). Such a line is attributed to the last edit of the file: "uncommitted" when
 *     the snapshot side differs from HEAD's version, else the newest commit of the range that
 *     changed the file, else "uncommitted".
 */

/** The origin of a line of a version: a base line index (≥ 0), a commit, uncommitted, or unknown. */
type Origin = number | string | null;
const UNKNOWN = -1;

interface State {
  readonly lines: readonly string[];
  readonly origin: readonly Origin[];
  /** Base lines this version no longer holds, with the commit (or null) that deleted them. */
  readonly gone: ReadonlyMap<number, string | null>;
}

/** One commit of the range, oldest first, parents before children (`--topo-order --reverse`). */
export interface HistoryCommit {
  readonly hash: string;
  readonly parents: readonly string[];
  /** The file's lines at this commit (`[]` when absent), or `null` when equal to the first parent's. */
  readonly lines: readonly string[] | null;
}

export interface FileHistory {
  readonly baseLines: readonly string[];
  readonly commits: readonly HistoryCommit[];
  /** The file's lines at each parent that is not a commit of the range. */
  readonly boundary: ReadonlyMap<string, readonly string[]>;
  /** HEAD; a commit of the range, or a boundary commit when the range is empty. */
  readonly head: string;
  readonly currentLines: readonly string[];
}

/** For each line of `b`, the index of the line of `a` it is kept from, or -1 (histogram diff). */
export function keptFrom(a: readonly string[], b: readonly string[]): Int32Array {
  const result = new Int32Array(b.length).fill(-1);
  let i = 0;
  let j = 0;
  for (const edit of histogramDiff(a, b)) {
    while (j < edit.bStart) result[j++] = i++;
    i = edit.aEnd;
    j = edit.bEnd;
  }
  while (j < b.length) result[j++] = i++;
  return result;
}

const sameLines = (a: readonly string[], b: readonly string[]) =>
  a.length === b.length && a.every((line, k) => line === b[k]);

function boundaryState(baseLines: readonly string[], lines: readonly string[]): State {
  const kept = sameLines(baseLines, lines)
    ? Int32Array.from(lines, (_, k) => k)
    : keptFrom(baseLines, lines);
  return { lines, origin: Array.from(kept, (k) => (k >= 0 ? k : UNKNOWN)), gone: new Map() };
}

/** Rules 1 and 2: the state of `lines` made by `by` from its parents' states. */
function step(parents: readonly State[], lines: readonly string[], by: string | null): State {
  const origin: Array<Origin | undefined> = new Array<Origin | undefined>(lines.length);
  for (const parent of parents) {
    const kept = sameLines(parent.lines, lines)
      ? Int32Array.from(lines, (_, k) => k)
      : keptFrom(parent.lines, lines);
    kept.forEach((from, j) => {
      if (origin[j] === undefined && from >= 0) origin[j] = parent.origin[from];
    });
  }
  const complete = Array.from(origin, (o) => (o === undefined ? by : o));
  const present = new Set(complete.filter((o): o is number => typeof o === 'number' && o >= 0));
  const gone = new Map<number, string | null>();
  for (const parent of parents) {
    for (const [i, who] of parent.gone) if (!present.has(i) && !gone.has(i)) gone.set(i, who);
  }
  for (const parent of parents) {
    for (const o of parent.origin) {
      if (typeof o === 'number' && o >= 0 && !present.has(o) && !gone.has(o)) gone.set(o, by);
    }
  }
  return { lines, origin: complete, gone };
}

/** G-09 for one file; see the rules above. */
export function attributeHistory(history: FileHistory): LineAttribution {
  const { baseLines, commits, boundary, head, currentLines } = history;
  const states = new Map<string, State>();
  const stateOf = (hash: string): State => {
    const known = states.get(hash);
    if (known) return known;
    const state = boundaryState(baseLines, boundary.get(hash) ?? []);
    states.set(hash, state);
    return state;
  };
  let lastCommitEdit: string | null = null;
  for (const commit of commits) {
    const parents = commit.parents.map(stateOf);
    const lines = commit.lines ?? parents[0]?.lines ?? [];
    const state =
      commit.lines === null && parents.length === 1
        ? parents[0]!
        : step(parents, lines, commit.hash);
    states.set(commit.hash, state);
    if (parents.length === 0 ? lines.length > 0 : !sameLines(parents[0]!.lines, lines)) {
      lastCommitEdit = commit.hash;
    }
  }
  const headState = stateOf(head);
  const final = step([headState], currentLines, null);
  const lastEdit = !sameLines(headState.lines, currentLines) ? null : lastCommitEdit;

  const added: Array<string | null> = [];
  const deleted: Array<string | null> = [];
  for (const edit of histogramDiff(baseLines, currentLines)) {
    for (let i = edit.aStart; i < edit.aEnd; i++) {
      deleted.push(final.gone.has(i) ? final.gone.get(i)! : lastEdit);
    }
    for (let j = edit.bStart; j < edit.bEnd; j++) {
      const o = final.origin[j];
      added.push(typeof o === 'string' || o === null ? o : lastEdit);
    }
  }
  return { added, deleted };
}
