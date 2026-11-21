import { randomBytes } from 'node:crypto';
import { watch, type FSWatcher } from 'node:fs';
import { lstat, mkdir, readdir, readFile, readlink, rm, writeFile, unlink } from 'node:fs/promises';
import { dirname, join, sep } from 'node:path';
import { ReviewError } from '../../errors/review-error.js';
import type { ContextualLog } from '../../log/log.js';
import { sha256, writeMaterialised, type Materialised, type WrittenEntry } from './fill.js';
import type { IgnoreRules } from './ignore.js';

/**
 * The workspace index, the workspace check and the reset (C001-ADR-006 §2 "Index" and "Reset and
 * check", C001-IF-013 §2 item 3 and §3). After the fill the index keeps, per path, the size,
 * modification time, change time, file ID and SHA-256 of what the fill gave it. During a run a
 * recursive watcher on the workspace records touched paths; after the run only those paths are
 * compared with the index (stat, then SHA-256). When the watcher reports lost events, a full walk
 * replaces it, which hashes only where the stat data differ or are racy. The reset rewrites
 * differing snapshot paths and removes extra paths that the ignore rules do not exclude.
 */

export type RecordKind = 'file' | 'symlink' | 'dir';

export interface IndexRecord {
  readonly kind: RecordKind;
  readonly size: bigint;
  readonly mtimeNs: bigint;
  readonly ctimeNs: bigint;
  readonly ino: bigint;
  readonly executable: boolean;
  /** SHA-256 of a file's bytes or of a link's target as read back; null for a directory. */
  readonly sha256: string | null;
  /** When the record was taken; a modification time this close to it is racy. */
  readonly recordedAtNs: bigint;
}

export interface ObservedEntry {
  readonly kind: RecordKind | 'other';
  readonly size: bigint;
  readonly mtimeNs: bigint;
  readonly ctimeNs: bigint;
  readonly ino: bigint;
  readonly executable: boolean;
}

export interface CompareOptions {
  /** Compare the executable bit (not on Windows, where git records none). */
  readonly posixModes: boolean;
  /**
   * Compare the change time. C001-ADR-006 §2 names it for POSIX; Node also reports the NTFS
   * ChangeTime on Windows, which no time-setting call of a program resets, so it is compared there
   * too: a same-size rewrite with the modification time set back is still hashed.
   */
  readonly useCtime: boolean;
}

export const compareOptionsFor = (
  platform: NodeJS.Platform = process.platform,
): CompareOptions => ({
  posixModes: platform !== 'win32',
  useCtime: true,
});

/** Modification times within this window of the record time are racy (git's racy-clean rule). */
const RACY_NS = 2_000_000_000n;

export type StatVerdict = 'same' | 'hash' | 'content' | 'mode' | 'kind';

/**
 * Compares a recorded entry with what `lstat` observes now. 'hash' means the stat data cannot
 * settle it and the content must be hashed.
 */
export function compareStat(
  rec: IndexRecord,
  obs: ObservedEntry,
  options: CompareOptions,
): StatVerdict {
  if (obs.kind !== rec.kind) return 'kind';
  if (rec.kind === 'dir') return 'same';
  if (options.posixModes && rec.kind === 'file' && obs.executable !== rec.executable) return 'mode';
  if (obs.size !== rec.size) return 'content';
  const racy = rec.mtimeNs + RACY_NS >= rec.recordedAtNs;
  const same =
    !racy &&
    obs.mtimeNs === rec.mtimeNs &&
    obs.ino === rec.ino &&
    (!options.useCtime || obs.ctimeNs === rec.ctimeNs);
  return same ? 'same' : 'hash';
}

/** Repository-relative paths, sorted, with the paths below a directory found by binary search. */
export class SortedPaths {
  readonly list: readonly string[];

  constructor(paths: Iterable<string>) {
    this.list = [...paths].sort();
  }

  /** Every path strictly below `directory` ('' for the root). */
  below(directory: string): string[] {
    if (directory === '') return [...this.list];
    const prefix = `${directory}/`;
    let lo = 0;
    let hi = this.list.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (this.list[mid]! < prefix) lo = mid + 1;
      else hi = mid;
    }
    const out: string[] = [];
    for (let i = lo; i < this.list.length && this.list[i]!.startsWith(prefix); i++) {
      out.push(this.list[i]!);
    }
    return out;
  }
}

/**
 * The paths the check compares for a set of touched paths: each touched path, and every indexed
 * path below it (a removed or renamed directory reports only itself).
 */
export function expandTouched(touched: Iterable<string>, indexed: SortedPaths): Set<string> {
  const out = new Set<string>();
  for (const raw of touched) {
    const p = normaliseRelative(raw);
    if (p === null) continue;
    out.add(p);
    for (const below of indexed.below(p)) out.add(below);
  }
  return out;
}

/** A watcher path as a repository-relative path; null for the root or a path outside it. */
export function normaliseRelative(path: string): string | null {
  const p = path
    .replace(/\\/g, '/')
    .replace(/^\.\/+/, '')
    .replace(/\/+$/, '');
  if (p === '' || p === '.' || p.startsWith('../') || p === '..' || p.startsWith('/')) return null;
  return p;
}

// ---------------------------------------------------------------------------------------------
// The index on disk

const abs = (root: string, path: string) => (path === '' ? root : join(root, ...path.split('/')));

async function observe(absPath: string): Promise<ObservedEntry | null> {
  try {
    const st = await lstat(absPath, { bigint: true });
    const kind: ObservedEntry['kind'] = st.isFile()
      ? 'file'
      : st.isSymbolicLink()
        ? 'symlink'
        : st.isDirectory()
          ? 'dir'
          : 'other';
    return {
      kind,
      size: st.size,
      mtimeNs: st.mtimeNs,
      ctimeNs: st.ctimeNs,
      ino: st.ino,
      executable: (st.mode & 0o100n) !== 0n,
    };
  } catch (error) {
    if (['ENOENT', 'ENOTDIR'].includes((error as NodeJS.ErrnoException).code ?? '')) return null;
    throw error;
  }
}

async function contentHash(absPath: string, kind: RecordKind): Promise<string | null> {
  if (kind === 'dir') return null;
  if (kind === 'symlink') return sha256(await readlink(absPath));
  return sha256(await readFile(absPath));
}

const nowNs = () => BigInt(Date.now()) * 1_000_000n;

async function recordOf(absPath: string, knownSha: string | null): Promise<IndexRecord> {
  const obs = await observe(absPath);
  if (obs === null || obs.kind === 'other') throw new Error(`${absPath} was not written`);
  return {
    ...obs,
    kind: obs.kind,
    sha256: knownSha ?? (await contentHash(absPath, obs.kind)),
    recordedAtNs: nowNs(),
  };
}

export type DifferenceKind = 'changed' | 'mode' | 'removed' | 'added';

export interface WorkspaceDifference {
  readonly path: string;
  readonly kind: DifferenceKind;
}

export interface CheckResult {
  readonly clean: boolean;
  readonly differences: readonly WorkspaceDifference[];
  /** 'touched' when only touched paths were compared, 'full' after a full walk. */
  readonly scope: 'touched' | 'full';
  /** How many indexed paths were compared. */
  readonly compared: number;
}

export type CheckScope =
  { readonly kind: 'touched'; readonly paths: Iterable<string> } | { readonly kind: 'full' };

export interface CheckOptions {
  readonly ignore: IgnoreRules;
  /** Extra paths that may exist, for example those matching `tests.coverageReports`. */
  readonly allowExtra?: (path: string) => boolean;
  readonly platform?: NodeJS.Platform;
}

/** Rewrites one snapshot path: what the fill would give it now (C001-IF-013 §2 item 3). */
export type Rewriter = (path: string) => Promise<Materialised>;

/** The index of one workspace: every snapshot path and the directories the fill created. */
export class WorkspaceIndex {
  private readonly records: Map<string, IndexRecord>;
  private readonly sorted: SortedPaths;
  readonly directories: ReadonlySet<string>;

  private constructor(
    readonly root: string,
    records: Map<string, IndexRecord>,
    directories: ReadonlySet<string>,
  ) {
    this.records = records;
    this.sorted = new SortedPaths(records.keys());
    this.directories = directories;
  }

  /** Records what the fill wrote. Submodule paths are directory records. */
  static async build(
    root: string,
    written: readonly WrittenEntry[],
    directories: Iterable<string>,
    concurrency = 32,
  ): Promise<WorkspaceIndex> {
    const records = new Map<string, IndexRecord>();
    let next = 0;
    const worker = async () => {
      for (;;) {
        const i = next++;
        if (i >= written.length) return;
        const w = written[i]!;
        records.set(w.path, await recordOf(abs(root, w.path), w.sha256));
      }
    };
    await Promise.all(Array.from({ length: Math.min(concurrency, written.length) }, worker));
    return new WorkspaceIndex(root, records, new Set(directories));
  }

  get size(): number {
    return this.records.size;
  }

  get(path: string): IndexRecord | undefined {
    return this.records.get(path);
  }

  paths(): readonly string[] {
    return this.sorted.list;
  }

  /**
   * Compares the workspace with the index (C001-IF-013 §3 item 1): the touched paths only, or a
   * full walk. Paths whose content matches although the stat changed get fresh stat data.
   */
  async check(scope: CheckScope, options: CheckOptions): Promise<CheckResult> {
    const cmp = compareOptionsFor(options.platform);
    const differences = new Map<string, DifferenceKind>();
    const allowed = (path: string, isDir: boolean) =>
      options.ignore.isIgnored(path, isDir) || (options.allowExtra?.(path) ?? false);
    let compared = 0;

    // A touched path is always hashed when its stat data agree: the watcher says it was written,
    // and a write can keep size and times; only the full walk relies on stat data alone.
    const compareIndexed = async (path: string, rec: IndexRecord, touched: boolean) => {
      compared++;
      const a = abs(this.root, path);
      const obs = await observe(a);
      if (obs === null) {
        differences.set(path, 'removed');
        return;
      }
      let verdict = compareStat(rec, obs, cmp);
      if (verdict === 'same' && touched && rec.kind !== 'dir') verdict = 'hash';
      if (verdict === 'same') return;
      if (verdict === 'mode') differences.set(path, 'mode');
      else if (verdict === 'content' || verdict === 'kind') differences.set(path, 'changed');
      else {
        const hash = await contentHash(a, rec.kind);
        if (hash !== rec.sha256) differences.set(path, 'changed');
        else this.records.set(path, { ...rec, ...obs, kind: rec.kind, recordedAtNs: nowNs() });
      }
    };

    /** Lists `directory` and reports what in it is neither indexed nor allowed. */
    const findExtras = async (directory: string, onlyUnknown: boolean): Promise<void> => {
      let names: string[];
      try {
        names = await readdir(abs(this.root, directory));
      } catch {
        return;
      }
      for (const name of names) {
        const path = directory === '' ? name : `${directory}/${name}`;
        if (this.records.has(path)) {
          const rec = this.records.get(path)!;
          // A submodule path is an indexed directory whose content the snapshot fixes (empty).
          if (rec.kind === 'dir') await findExtras(path, onlyUnknown);
          continue;
        }
        const obs = await observe(abs(this.root, path));
        if (obs === null) continue;
        if (obs.kind === 'dir') {
          if (this.directories.has(path)) {
            if (!onlyUnknown) await findExtras(path, onlyUnknown);
          } else if (!options.ignore.isIgnoredBelow(path)) {
            await findExtras(path, false);
          }
          continue;
        }
        if (!allowed(path, false)) differences.set(path, 'added');
      }
    };

    if (scope.kind === 'full') {
      for (const [path, rec] of this.records) await compareIndexed(path, rec, false);
      await findExtras('', false);
    } else {
      for (const path of expandTouched(scope.paths, this.sorted)) {
        const rec = this.records.get(path);
        if (rec) {
          await compareIndexed(path, rec, true);
          continue;
        }
        const obs = await observe(abs(this.root, path));
        if (obs === null) continue;
        if (obs.kind === 'dir') {
          if (this.directories.has(path)) await findExtras(path, true);
          else if (!options.ignore.isIgnoredBelow(path)) await findExtras(path, false);
          continue;
        }
        if (!allowed(path, false)) differences.set(path, 'added');
      }
    }
    const list = [...differences]
      .map(([path, kind]) => ({ path, kind }))
      .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
    return { clean: list.length === 0, differences: list, scope: scope.kind, compared };
  }

  /**
   * The reset before a run (C001-IF-013 §2 item 3): removes extra paths, then writes every
   * differing snapshot path again with `rewrite` and records it. `differences` is the result of the
   * check after the previous run, which is the check before this one (§3 item 1).
   */
  async reset(differences: readonly WorkspaceDifference[], rewrite: Rewriter): Promise<void> {
    const added = differences.filter((d) => d.kind === 'added').map((d) => d.path);
    // Deepest first, so that a directory goes after what was found in it.
    for (const path of added.sort((a, b) => b.length - a.length)) {
      await rm(abs(this.root, path), { recursive: true, force: true, maxRetries: 3 });
    }
    for (const d of differences) {
      if (d.kind === 'added') continue;
      const a = abs(this.root, d.path);
      const m = await rewrite(d.path);
      await mkdir(dirname(a), { recursive: true });
      const hash = await writeMaterialised(a, m, true);
      this.records.set(d.path, await recordOf(a, hash));
    }
  }
}

// ---------------------------------------------------------------------------------------------
// The workspace watcher

export interface TouchedPaths {
  readonly paths: ReadonlySet<string>;
  /**
   * True when the watcher cannot vouch for the paths: an event without a name (Windows buffer
   * overflow), a watcher error (for example the inotify watch limit), no recursive watching, or
   * events not drained in time. The check then walks the whole workspace.
   */
  readonly lost: boolean;
  readonly cause: string | null;
}

export interface WorkspaceWatcher {
  /** Drains the events of the run and stops watching. */
  stop(): Promise<TouchedPaths>;
}

export interface WatchOptions {
  /** How long `stop` waits for its drain marker; default 2 s. */
  readonly drainTimeoutMs?: number;
  /** Test seam: replaces `fs.watch`. */
  readonly watchFn?: typeof watch;
}

const BARRIER = '.sddr-drain-';

/**
 * Starts a recursive watcher on the workspace root. `stop` drains it: it writes a marker file in
 * the root and waits until the watcher reports it, so every event the run caused before has been
 * delivered (inotify, FSEvents and ReadDirectoryChangesW deliver in order), then removes the
 * marker, which is never reported as touched.
 */
export function watchWorkspace(root: string, options: WatchOptions = {}): WorkspaceWatcher {
  const touched = new Set<string>();
  let lost: string | null = null;
  let barrierName: string | null = null;
  let barrierSeen: (() => void) | null = null;
  let watcher: FSWatcher | null = null;
  try {
    watcher = (options.watchFn ?? watch)(root, { recursive: true, persistent: false });
    watcher.on('change', (_event, filename) => {
      if (filename === null || filename === undefined) {
        lost ??= 'an event without a path name (events lost)';
        return;
      }
      const name = (typeof filename === 'string' ? filename : filename.toString('utf8'))
        .split(sep)
        .join('/');
      if (barrierName !== null && name === barrierName) {
        barrierSeen?.();
        return;
      }
      if (name.startsWith(BARRIER)) return;
      const p = normaliseRelative(name);
      if (p !== null) touched.add(p);
    });
    watcher.on('error', (error: Error) => {
      lost ??= `watcher error: ${error.message}`;
    });
  } catch (error) {
    lost = `no recursive watcher: ${(error as Error).message}`;
  }
  return {
    async stop() {
      if (watcher !== null && lost === null) {
        barrierName = `${BARRIER}${randomBytes(6).toString('hex')}`;
        const marker = join(root, barrierName);
        const seen = new Promise<boolean>((resolve) => {
          barrierSeen = () => resolve(true);
          setTimeout(() => resolve(false), options.drainTimeoutMs ?? 2000).unref();
        });
        try {
          await writeFile(marker, '');
          if (!(await seen)) lost ??= 'the events of the run were not drained in time';
        } catch (error) {
          lost ??= `the drain marker cannot be written: ${(error as Error).message}`;
        } finally {
          await unlink(marker).catch(() => undefined);
        }
      }
      watcher?.close();
      return { paths: touched, lost: lost !== null, cause: lost };
    },
  };
}

/**
 * The check after a run: the touched paths the watcher recorded, or a full walk when it lost
 * events (C001-ADR-006 §2).
 */
export function checkAfterRun(
  index: WorkspaceIndex,
  touched: TouchedPaths,
  options: CheckOptions,
): Promise<CheckResult> {
  return index.check(
    touched.lost ? { kind: 'full' } : { kind: 'touched', paths: touched.paths },
    options,
  );
}

// ---------------------------------------------------------------------------------------------
// Notice

/**
 * ERR-EVID-005 for a failed check (C001-IF-013 §3 item 2), recorded in the log. It is a notice:
 * the caller records no result of the run and shows it as discarded.
 */
export function workspaceMismatch(
  log: ContextualLog | undefined,
  run: { readonly command: string; readonly snapshotId: string },
  result: CheckResult,
): ReviewError {
  const paths = result.differences.map((d) => d.path);
  const error = new ReviewError('ERR-EVID-005', {
    operation: 'workspace-check',
    inputs: { command: run.command, snapshotId: run.snapshotId, paths: paths.slice(0, 10) },
    params: {
      command: run.command,
      n: paths.length,
      'snapshot-id': run.snapshotId,
      list: paths.slice(0, 10).join(', ') + (paths.length > 10 ? ', …' : ''),
    },
  });
  try {
    log?.recordError(error, 'workspace-check');
  } catch {
    /* the notice itself is what matters */
  }
  return error;
}
