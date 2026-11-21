// Spike C001-T-014: G-09 (line attribution) for every changed file of a change.
//
// The adapter's `attributeLines` runs `git log --follow` and `git config --list` per file, about
// 120 ms per file on Windows (spikes/parse-speed-memory/RESULTS.md). Two read paths are measured:
//
// - `batched` (default): ONE `git log -M --name-status` over the whole range, the per-file chain
//   through renames derived from it, every blob read through the persistent `cat-file --batch`
//   process of the adapter (G-08 `readBlob`, pipelined), the working-tree version taken from the
//   G-07 result, and the adapter's line matching. Same semantics as G-09; one git spawn.
// - `adapter`: the adapter's `attributeLines` per file, `concurrency` calls at a time.
import type { ChangedFile, GitAccessPort, LineAttribution } from '../../src/core/git/port.js';
import { matchLines, splitLines } from '../../src/core/git/line-diff.js';
import { looksBinary } from '../../src/core/git/worktree-compare.js';

export interface RangeEntry {
  /** First letter of the git status: A, M, D, R, T, ... */
  readonly status: string;
  readonly path: string;
  /** The path before a rename. */
  readonly from: string | null;
}

export interface RangeCommit {
  readonly hash: string;
  readonly entries: readonly RangeEntry[];
}

/**
 * Parses `git log --reverse -M -z --name-status --format=%x01%H <range>`: commits oldest first.
 */
export function parseRangeLog(stdout: string): RangeCommit[] {
  const commits: RangeCommit[] = [];
  for (const chunk of stdout.split('\x01').slice(1)) {
    const [hash, ...rest] = chunk.split('\0');
    const tokens = rest.map((t) => t.replace(/^\n+/, '')).filter(Boolean);
    const entries: RangeEntry[] = [];
    for (let i = 0; i < tokens.length;) {
      const status = tokens[i]!;
      if (status.startsWith('R') || status.startsWith('C')) {
        entries.push({ status: status[0]!, from: tokens[i + 1]!, path: tokens[i + 2]! });
        i += 3;
      } else {
        entries.push({ status: status[0]!, from: null, path: tokens[i + 1]! });
        i += 2;
      }
    }
    if (hash) commits.push({ hash: hash.trim(), entries });
  }
  return commits;
}

export interface Chain {
  /** The path of the file at the base commit, or null when a commit of the range added it. */
  readonly basePath: string | null;
  /** The commits that touched the file, oldest first, with its path after each. */
  readonly steps: ReadonlyArray<{ hash: string; status: string; path: string }>;
}

/** Follows one final path back through the commits of the range (what `--follow` gives G-09). */
export function chainFor(path: string, commits: readonly RangeCommit[]): Chain {
  const steps: Array<{ hash: string; status: string; path: string }> = [];
  let current = path;
  let basePath: string | null = path;
  for (let i = commits.length - 1; i >= 0; i--) {
    const commit = commits[i]!;
    const entry = commit.entries.find((e) => e.path === current);
    if (!entry) continue;
    steps.push({ hash: commit.hash, status: entry.status, path: current });
    if (entry.status === 'A') {
      basePath = null;
      break;
    }
    if (entry.from) current = entry.from;
    basePath = current;
  }
  steps.reverse();
  return { basePath, steps };
}

/** The line walk of G-09 over a file's versions (the algorithm of the adapter). */
export function attributeVersions(
  baseBytes: Buffer | null,
  versions: ReadonlyArray<{ by: string | null; bytes: Buffer }>,
): LineAttribution {
  if ((baseBytes && looksBinary(baseBytes)) || versions.some((v) => looksBinary(v.bytes))) {
    return { added: [], deleted: [] };
  }
  interface Line {
    readonly text: string;
    readonly baseIndex: number;
    readonly by: string | null;
  }
  let current: Line[] = (baseBytes ? splitLines(baseBytes) : []).map((text, baseIndex) => ({
    text,
    baseIndex,
    by: null,
  }));
  const deletedBy = new Map<number, string | null>();
  for (const version of versions) {
    const next = splitLines(version.bytes);
    const matched = matchLines(
      current.map((l) => l.text),
      next,
    );
    const kept = new Set<number>();
    const updated: Line[] = next.map((text, j) => {
      const from = matched[j]!;
      if (from >= 0) {
        kept.add(from);
        return current[from]!;
      }
      return { text, baseIndex: -1, by: version.by };
    });
    current.forEach((line, i) => {
      if (!kept.has(i) && line.baseIndex >= 0) deletedBy.set(line.baseIndex, version.by);
    });
    current = updated;
  }
  return {
    added: current.filter((l) => l.baseIndex < 0).map((l) => l.by),
    deleted: [...deletedBy.entries()].sort((a, b) => a[0] - b[0]).map(([, by]) => by),
  };
}

export interface AttributionTotals {
  readonly files: number;
  readonly addedLines: number;
  readonly deletedLines: number;
  readonly uncommittedLines: number;
  readonly gitSpawns: number;
}

const sum = (results: LineAttribution[]) => ({
  addedLines: results.reduce((n, r) => n + r.added.length, 0),
  deletedLines: results.reduce((n, r) => n + r.deleted.length, 0),
  uncommittedLines: results.reduce(
    (n, r) =>
      n + r.added.filter((b) => b === null).length + r.deleted.filter((b) => b === null).length,
    0,
  ),
});

/** Batched G-09 for the given changed files; `rangeLog` runs the one `git log` of the range. */
export async function attributeBatched(
  git: Pick<GitAccessPort, 'readBlob'>,
  rangeLog: () => Promise<string>,
  base: string,
  files: readonly ChangedFile[],
): Promise<AttributionTotals> {
  const commits = parseRangeLog(await rangeLog());
  const results = await Promise.all(
    files.map(async (f) => {
      const chain = chainFor(f.path, commits);
      const [baseBytes, ...stepBytes] = await Promise.all([
        chain.basePath ? git.readBlob(base, chain.basePath) : Promise.resolve(null),
        ...chain.steps.map((s) =>
          s.status === 'D' ? Promise.resolve(null) : git.readBlob(s.hash, s.path),
        ),
      ]);
      const versions = chain.steps.map((s, i) => ({
        by: s.hash as string | null,
        bytes: stepBytes[i] ?? Buffer.alloc(0),
      }));
      versions.push({ by: null, bytes: f.currentContent ?? Buffer.alloc(0) });
      return attributeVersions(baseBytes, versions);
    }),
  );
  return { files: files.length, ...sum(results), gitSpawns: 1 };
}

/** The adapter's G-09 per file, `concurrency` at a time. */
export async function attributeWithAdapter(
  git: Pick<GitAccessPort, 'attributeLines'>,
  base: string,
  head: string,
  files: readonly ChangedFile[],
  concurrency: number,
): Promise<AttributionTotals> {
  const results: LineAttribution[] = new Array(files.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.max(1, concurrency) }, async () => {
      while (next < files.length) {
        const i = next++;
        results[i] = await git.attributeLines(base, head, files[i]!.path);
      }
    }),
  );
  // About two git processes per file (log --follow, config --list), RESULTS.md of C001-T-006.
  return { files: files.length, ...sum(results), gitSpawns: files.length * 2 };
}
