import { splitLines } from './line-diff.js';

/**
 * Rename detection of G-07 at 50 % similarity, in process (the diff of git is never run on the
 * working tree, C001-IF-012 §8). Exact renames (same blob hash) come first; inexact ones compare
 * the bytes that the lines of two files share.
 */

export const RENAME_SIMILARITY = 0.5;
/** Beyond this many candidate pairs the inexact search is skipped, as git's rename limit does. */
export const MAX_INEXACT_PAIRS = 1_000_000;

export interface RenameSide {
  readonly path: string;
  readonly hash: string;
  /** A symbolic link is only paired with a symbolic link. */
  readonly symlink: boolean;
  readonly size: number;
  /** The bytes, or null when they are binary or not available (exact matches only). */
  readonly content: Buffer | null;
}

interface Bag {
  readonly lines: Map<string, number>;
  readonly size: number;
}

function bagOf(content: Buffer): Bag {
  const lines = new Map<string, number>();
  for (const line of splitLines(content)) lines.set(line, (lines.get(line) ?? 0) + 1);
  return { lines, size: content.length };
}

function similarity(a: Bag, b: Bag): number {
  let shared = 0;
  const [small, large] = a.lines.size <= b.lines.size ? [a, b] : [b, a];
  for (const [line, count] of small.lines) {
    const other = large.lines.get(line);
    if (other) shared += Math.min(count, other) * line.length;
  }
  return shared / Math.max(a.size, b.size, 1);
}

const basename = (path: string) => path.slice(path.lastIndexOf('/') + 1);

/** Pairs of [deleted path, added path]. */
export function detectRenames(
  deleted: readonly RenameSide[],
  added: readonly RenameSide[],
): Array<readonly [string, string]> {
  const pairs: Array<readonly [string, string]> = [];
  const usedDeleted = new Set<string>();
  const usedAdded = new Set<string>();

  // Exact renames; an empty file is never a rename source or target.
  const byHash = new Map<string, RenameSide[]>();
  for (const d of deleted) {
    if (d.size === 0) continue;
    const key = `${d.symlink}:${d.hash}`;
    byHash.set(key, [...(byHash.get(key) ?? []), d]);
  }
  for (const a of added) {
    if (a.size === 0) continue;
    const candidates = byHash
      .get(`${a.symlink}:${a.hash}`)
      ?.filter((d) => !usedDeleted.has(d.path));
    if (!candidates?.length) continue;
    const source = candidates.find((d) => basename(d.path) === basename(a.path)) ?? candidates[0]!;
    usedDeleted.add(source.path);
    usedAdded.add(a.path);
    pairs.push([source.path, a.path]);
  }

  const sources = deleted.filter((d) => !usedDeleted.has(d.path) && d.content && d.size > 0);
  const targets = added.filter((a) => !usedAdded.has(a.path) && a.content && a.size > 0);
  if (!sources.length || !targets.length || sources.length * targets.length > MAX_INEXACT_PAIRS) {
    return pairs;
  }
  const sourceBags = sources.map((d) => bagOf(d.content!));
  const targetBags = targets.map((a) => bagOf(a.content!));
  const scored: Array<{ s: number; t: number; score: number; sameName: boolean }> = [];
  for (let s = 0; s < sources.length; s++) {
    for (let t = 0; t < targets.length; t++) {
      if (sources[s]!.symlink !== targets[t]!.symlink) continue;
      const score = similarity(sourceBags[s]!, targetBags[t]!);
      if (score >= RENAME_SIMILARITY) {
        scored.push({
          s,
          t,
          score,
          sameName: basename(sources[s]!.path) === basename(targets[t]!.path),
        });
      }
    }
  }
  scored.sort(
    (x, y) =>
      y.score - x.score ||
      Number(y.sameName) - Number(x.sameName) ||
      sources[x.s]!.path.localeCompare(sources[y.s]!.path) ||
      targets[x.t]!.path.localeCompare(targets[y.t]!.path),
  );
  for (const { s, t } of scored) {
    if (usedDeleted.has(sources[s]!.path) || usedAdded.has(targets[t]!.path)) continue;
    usedDeleted.add(sources[s]!.path);
    usedAdded.add(targets[t]!.path);
    pairs.push([sources[s]!.path, targets[t]!.path]);
  }
  return pairs;
}
