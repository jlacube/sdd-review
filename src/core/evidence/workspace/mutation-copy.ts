import { chmod, open, realpath, stat, utimes, type FileHandle } from 'node:fs/promises';
import { join } from 'node:path';
import type { RepositoryLocation } from '../../git/port.js';
import { ReviewError } from '../../errors/review-error.js';
import type { ContextualLog } from '../../log/log.js';
import type { AvailableResult } from './available-paths.js';
import { executeCopy, planCopy, type CopyResult, type LinkOutcome } from './copier.js';
import { mapLimit } from './fill.js';
import type { WorkspaceIndex } from './index.js';
import type { Redirect } from './links.js';
import {
  claimWorkspace,
  freeSpaceOf,
  hasRoomFor,
  removeWorkspace,
  setState,
  type WorkspaceHandle,
  type WorkspaceRegistry,
} from './lifetime.js';
import { realPathOfPossiblyMissing } from './root.js';

/**
 * The mutation copy (C001-ADR-006 §7, C001-IF-013 §2 item 3 "Mutation workspace", "Copy window",
 * "Self-contained copy"; C001-REQ-516). When the check after a test run passes, the test run's
 * workspace `w<nn>` enters the copy window: no run takes it until the copy ends. The copier copies
 * it, ignored paths included, to `m<nn>`, whose root has the same byte length. In every file that
 * the test run created or changed outside the snapshot's files and the copied dependency
 * directories, each occurrence of the test run's workspace root is replaced by the copy's root (in
 * UTF-8, and on Windows also in UTF-16LE, with both separators), so binary files keep their
 * offsets. Links that lead into the test run's workspace, another workspace of the snapshot or the
 * working tree point into the copy; links into the git directory are not created. A failed copy is
 * removed and the mutation evidence of every hunk is unavailable (ERR-EVID-006).
 */

// ---------------------------------------------------------------------------------------------
// Root rewrite

export interface RootPair {
  readonly from: Buffer;
  readonly to: Buffer;
  readonly encoding: 'utf8' | 'utf16le';
}

/**
 * The byte sequences that name the source root, each with its replacement: UTF-8 everywhere; on
 * Windows also with forward slashes, with JSON-escaped backslashes, with either drive-letter case,
 * and each of these in UTF-16LE.
 */
export function rootVariants(source: string, copy: string, platform: NodeJS.Platform): RootPair[] {
  if (source === copy) throw new Error('the roots of a workspace and its copy must differ');
  if (Buffer.byteLength(source) !== Buffer.byteLength(copy)) {
    throw new Error(`the roots ${source} and ${copy} differ in byte length`);
  }
  const forms: Array<[string, string]> = [[source, copy]];
  if (platform === 'win32') {
    const fwd = (s: string) => s.replace(/\\/g, '/');
    const json = (s: string) => s.replace(/\\/g, '\\\\');
    forms.push([fwd(source), fwd(copy)], [json(source), json(copy)]);
    for (const [s, c] of [...forms]) {
      if (/^[A-Za-z]:/.test(s)) {
        const swap = (x: string) =>
          (x[0] === x[0]!.toUpperCase() ? x[0]!.toLowerCase() : x[0]!.toUpperCase()) + x.slice(1);
        forms.push([swap(s), swap(c)]);
      }
    }
  }
  const encodings: Array<RootPair['encoding']> =
    platform === 'win32' ? ['utf8', 'utf16le'] : ['utf8'];
  const seen = new Set<string>();
  const out: RootPair[] = [];
  for (const encoding of encodings) {
    for (const [s, c] of forms) {
      const from = Buffer.from(s, encoding);
      const key = `${encoding}:${from.toString('hex')}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ from, to: Buffer.from(c, encoding), encoding });
    }
  }
  return out;
}

interface Match {
  readonly at: number;
  readonly pair: RootPair;
}

function matchesInWindow(buf: Buffer, pairs: readonly RootPair[], limit: number): Match[] {
  const out: Match[] = [];
  for (const pair of pairs) {
    let at = buf.indexOf(pair.from);
    while (at !== -1 && at < limit) {
      pair.to.copy(buf, at);
      out.push({ at, pair });
      at = buf.indexOf(pair.from, at + pair.from.length);
    }
  }
  return out;
}

/**
 * Replaces, in place, every occurrence of a root that starts before `limit`; returns how many.
 * Equal lengths keep every offset.
 */
export function replaceInWindow(buf: Buffer, pairs: readonly RootPair[], limit: number): number {
  return matchesInWindow(buf, pairs, limit).length;
}

/** A file read and written at positions; the size does not change. */
export interface RandomAccess {
  readonly size: number;
  read(position: number, length: number): Promise<Buffer>;
  write(position: number, data: Buffer): Promise<void>;
}

const CHUNK = 4 * 1024 * 1024;

/**
 * Rewrites the roots in a file of any size in windows of `chunk` bytes that overlap by one root
 * length less one byte, writing only the replaced ranges; returns the number of replacements.
 */
export async function rewriteRandomAccess(
  file: RandomAccess,
  pairs: readonly RootPair[],
  chunk = CHUNK,
): Promise<number> {
  const longest = Math.max(1, ...pairs.map((p) => p.from.length));
  let count = 0;
  for (let offset = 0; offset < file.size; offset += chunk) {
    const length = Math.min(chunk + longest - 1, file.size - offset);
    const buf = await file.read(offset, length);
    const matches = matchesInWindow(buf, pairs, Math.min(chunk, length));
    for (const m of matches) await file.write(offset + m.at, m.pair.to);
    count += matches.length;
  }
  return count;
}

/**
 * Rewrites the roots in one file of the copy and keeps its modification time and mode. The file
 * is opened for writing only when it names the root; a read-only file is made writable for that
 * time.
 */
export async function rewriteFileRoots(path: string, pairs: readonly RootPair[]): Promise<number> {
  const before = await stat(path);
  const reader = await open(path, 'r');
  let writer: FileHandle | null = null;
  let madeWritable = false;
  let count: number;
  try {
    count = await rewriteRandomAccess(
      {
        size: before.size,
        async read(position, length) {
          const buf = Buffer.alloc(length);
          const { bytesRead } = await reader.read(buf, 0, length, position);
          return buf.subarray(0, bytesRead);
        },
        async write(position, data) {
          if (writer === null) {
            try {
              writer = await open(path, 'r+');
            } catch (error) {
              const code = (error as NodeJS.ErrnoException).code;
              if (code !== 'EACCES' && code !== 'EPERM') throw error;
              await chmod(path, (before.mode & 0o7777) | 0o200);
              madeWritable = true;
              writer = await open(path, 'r+');
            }
          }
          await writer.write(data, 0, data.length, position);
        },
      },
      pairs,
    );
  } finally {
    await reader.close();
    await (writer as FileHandle | null)?.close();
    if (madeWritable) await chmod(path, before.mode & 0o7777);
  }
  if (count > 0) await utimes(path, before.atime, before.mtime);
  return count;
}

// ---------------------------------------------------------------------------------------------
// Copy window

const windows = new WeakMap<WorkspaceHandle, Promise<void>>();

/**
 * Resolves when the copy window of a run workspace ends; at once when it is in none. A run of the
 * snapshot that needs this workspace while no other is free waits for it (C001-IF-013 §2 item 3).
 */
export function copyWindowEnd(handle: WorkspaceHandle): Promise<void> {
  return windows.get(handle) ?? Promise.resolve();
}

// ---------------------------------------------------------------------------------------------
// The copy

export interface MutationTarget {
  /** Repository-relative path of the hunk's file. */
  readonly path: string;
  /** First changed line of the hunk. */
  readonly line: number;
}

export interface MutationCopySource {
  /** The test run's workspace; its check after the run has passed. */
  readonly handle: WorkspaceHandle;
  readonly index: WorkspaceIndex;
  /** What the preparation made available, to leave unchanged dependency files unscanned. */
  readonly available?: AvailableResult | null;
}

export interface MutationCopyOptions {
  readonly source: MutationCopySource;
  readonly repository: Pick<RepositoryLocation, 'workTreeRoot' | 'gitDir' | 'commonGitDir'>;
  /** Roots of the snapshot's other evidence workspaces, whose links also point into the copy. */
  readonly otherWorkspaceRoots?: readonly string[];
  /** The hunks mutation testing is to take: each gets ERR-EVID-006 when the copy fails. */
  readonly hunks: readonly MutationTarget[];
  readonly registry?: WorkspaceRegistry;
  readonly log?: ContextualLog;
  readonly platform?: NodeJS.Platform;
  readonly symlinks?: boolean;
  readonly concurrency?: number;
  /** Test seams. */
  readonly freeSpace?: (dir: string) => Promise<bigint>;
  readonly copyFile?: Parameters<typeof executeCopy>[2]['copyFile'];
}

export interface MutationCopy {
  readonly handle: WorkspaceHandle;
  readonly copy: CopyResult;
  /** Files whose roots were rewritten, with the number of replacements. */
  readonly rewritten: ReadonlyArray<{ readonly path: string; readonly count: number }>;
  readonly links: readonly LinkOutcome[];
  /** From the start of the copy window to its end (counts in C001-NFR-018 (b)). */
  readonly durationMs: number;
}

export type MutationCopyResult =
  | { readonly ok: true; readonly copy: MutationCopy }
  | {
      readonly ok: false;
      readonly cause: string;
      /** One ERR-EVID-006 per hunk, each recorded in the log. */
      readonly notices: readonly ReviewError[];
    };

function copyFailed(
  options: MutationCopyOptions,
  cause: string,
  inputs: Record<string, unknown>,
): ReviewError[] {
  const reason = `the copy of the test run's workspace could not be made: ${cause}`;
  const targets: Array<MutationTarget | null> =
    options.hunks.length > 0 ? [...options.hunks] : [null];
  return targets.map((t) => {
    const error = new ReviewError('ERR-EVID-006', {
      operation: 'mutation-copy',
      inputs: { ...inputs, hunk: t ? `${t.path}:${t.line}` : null },
      params: { path: t?.path ?? '*', line: t?.line ?? '*', reason },
      cause,
    });
    try {
      options.log?.recordError(error, 'mutation-copy');
    } catch {
      /* the notice itself is what matters */
    }
    return error;
  });
}

const unchangedSince = (
  available: AvailableResult | null | undefined,
  rel: string,
  size: number,
  mtimeMs: number,
) => {
  const rec = available?.files.get(rel);
  return rec !== undefined && rec.size === size && Math.abs(rec.mtimeMs - mtimeMs) < 1;
};

/**
 * Makes the mutation copy of a test run's workspace. The source is in the copy window from the
 * start to the end of this call and free again afterwards, whether the copy succeeds or fails.
 * Never throws for a failed copy: the result carries the cause and the ERR-EVID-006 notices.
 */
export async function makeMutationCopy(options: MutationCopyOptions): Promise<MutationCopyResult> {
  const started = performance.now();
  const platform = options.platform ?? process.platform;
  const source = options.source.handle;
  await setState(source, 'copying');
  let endWindow!: () => void;
  windows.set(source, new Promise<void>((r) => (endWindow = r)));
  let copyHandle: WorkspaceHandle | null = null;
  const inputs: Record<string, unknown> = { workspace: source.root, number: source.number };
  try {
    const sourceRoot = await realpath(source.root);
    const plan = await planCopy(sourceRoot, [''], { concurrency: options.concurrency });
    // Checked before anything of the copy exists, so lack of space leaves nothing behind.
    const free = await (options.freeSpace ?? freeSpaceOf)(source.snapshotDir);
    if (!hasRoomFor(plan.totalBytes, free)) {
      throw new Error(
        `not enough disk space for the mutation copy: ${plan.totalBytes} bytes and 20 % margin needed, ${free} bytes free`,
      );
    }
    copyHandle = await claimWorkspace(source.snapshotDir, 'mutation', source.number);
    options.registry?.track(copyHandle);
    const copyRoot = await realpath(copyHandle.root);
    const pairs = rootVariants(sourceRoot, copyRoot, platform);
    const real = (p: string) => (p ? realPathOfPossiblyMissing(p, platform) : '');
    const redirects: Redirect[] = [
      { root: sourceRoot, label: 'workspace' },
      ...(options.otherWorkspaceRoots ?? []).map((r) => ({
        root: real(r),
        label: 'workspace' as const,
      })),
      ...(options.repository.workTreeRoot
        ? [{ root: real(options.repository.workTreeRoot), label: 'working-tree' as const }]
        : []),
    ];
    const copy = await executeCopy(plan, copyRoot, {
      rules: {
        platform,
        forbidden: [real(options.repository.gitDir), real(options.repository.commonGitDir)],
        redirects,
        destinationRoot: copyRoot,
        realPath: real,
      },
      platform,
      symlinks: options.symlinks,
      concurrency: options.concurrency,
      copyFile: options.copyFile,
    });
    // Files the test run created or changed: not a snapshot path, not an unchanged copy of a
    // dependency file made available at preparation.
    const candidates = plan.entries.filter(
      (e) =>
        e.kind === 'file' &&
        options.source.index.get(e.rel) === undefined &&
        !unchangedSince(options.source.available, e.rel, e.size, e.mtimeMs),
    );
    const counts = await mapLimit(candidates, options.concurrency ?? 16, (e) =>
      rewriteFileRoots(join(copyRoot, ...e.rel.split('/')), pairs),
    );
    const rewritten = candidates
      .map((e, i) => ({ path: e.rel, count: counts[i]! }))
      .filter((r) => r.count > 0);
    await setState(copyHandle, 'mutation');
    return {
      ok: true,
      copy: {
        handle: copyHandle,
        copy,
        rewritten,
        links: copy.links,
        durationMs: performance.now() - started,
      },
    };
  } catch (error) {
    let cause = (error as Error).message ?? String(error);
    if (copyHandle !== null) {
      const removal = options.registry
        ? await options.registry.release(copyHandle)
        : await removeWorkspace(copyHandle);
      if (!removal.removed)
        cause += `; the partial copy is removed at the next sweep (${removal.cause})`;
    }
    return { ok: false, cause, notices: copyFailed(options, cause, inputs) };
  } finally {
    await setState(source, 'free');
    endWindow();
    windows.delete(source);
  }
}
