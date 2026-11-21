import { createHash } from 'node:crypto';
import { lstat, readFile, readlink } from 'node:fs/promises';
import type { BigIntStats } from 'node:fs';
import { join } from 'node:path';
import type { FileMode, ObjectFormat, TreeEntry } from './port.js';
import { LFS_DRIVER, type CleanFilterCause, type CleanFilterFallback } from './clean-filter.js';
import { indexEntryUpToDate, type IndexCheckOptions } from './index-stat.js';
import { lfsDigest, matchesLfsPointer, type LfsDigest } from './lfs.js';

/**
 * The working-tree comparison of C001-IF-012 §8 (C001-REQ-101, C001-REQ-117) and the index reads
 * of §7 item 1, in process, on top of read-only `ls-files` / `ls-tree` listings.
 *
 * What it guarantees: a path that is under no clean filter is compared by its working-tree bytes
 * (after git's built-in end-of-line conversion) with the blob of the base side, whatever the index
 * records for it: not its stat data, not its blob, not the assume-unchanged, skip-worktree or
 * fsmonitor-valid flags. The index only tells which paths are tracked. A path outside a sparse
 * checkout (skip-worktree entry and no file at the path) is read from its index entry (§8 item 2).
 *
 * Files under a clean filter (§7, C001-T-028) are settled without running the filter: a Git LFS
 * file by the pointer file whose SHA-256 hash and size its working-tree bytes match (§7 item 7),
 * another file by the blob of its index entry while that entry is up to date (§7 items 1 and 2),
 * and otherwise by its working-tree bytes (§7 item 3), which the entry then reports with its cause
 * for notice ERR-INTAKE-009 (§7 item 4).
 */

// ---------------------------------------------------------------------------------------------
// Listings

export function modeFromOctal(octal: string): FileMode | null {
  if (octal === '120000') return 'symlink';
  if (octal === '160000') return 'submodule';
  if (octal === '040000') return null;
  return (Number.parseInt(octal, 8) & 0o111) !== 0 ? 'executable' : 'regular';
}

const utf8 = (latin1: string) => Buffer.from(latin1, 'latin1').toString('utf8');

/** `ls-tree -r -z`: every file of a tree (and gitlink), directories are not listed. */
export function parseTreeListing(output: Buffer): TreeEntry[] {
  const entries: TreeEntry[] = [];
  const text = output.toString('latin1');
  const re = /(\d{6}) (\w+) ([0-9a-f]+)\t([^\0]*)\0/g;
  for (let m = re.exec(text); m; m = re.exec(text)) {
    const mode = modeFromOctal(m[1]!);
    if (mode) entries.push({ path: utf8(m[4]!), mode, blob: m[3]! });
  }
  return entries;
}

export interface IndexStat {
  readonly ctimeSeconds: number;
  readonly ctimeNanoseconds: number;
  readonly mtimeSeconds: number;
  readonly mtimeNanoseconds: number;
  readonly dev: number;
  readonly inode: number;
  readonly uid: number;
  readonly gid: number;
  readonly size: number;
}

/** One index entry, as `ls-files -s --debug -z` prints it (the merged view of a split index). */
export interface IndexEntry {
  readonly path: string;
  readonly mode: FileMode;
  readonly blob: string;
  readonly stage: number;
  readonly assumeUnchanged: boolean;
  readonly skipWorktree: boolean;
  readonly intentToAdd: boolean;
  readonly stat: IndexStat;
}

const CE_VALID = 0x8000;
const CE_INTENT_TO_ADD = 0x20000000;
const CE_SKIP_WORKTREE = 0x40000000;

/**
 * Parses `ls-files -s --debug -z`. The `--debug` fields are read from the text that git prints
 * (the documentation calls the format subject to change; the experiments of C001-T-006 record it
 * for each version tested). A sparse index is expanded by git 2.34 (`ensure_full_index`), so every
 * path below a sparse directory appears as an entry marked skip-worktree.
 */
export function parseIndexListing(output: Buffer): IndexEntry[] {
  const entries: IndexEntry[] = [];
  const text = output.toString('latin1');
  const re =
    /(\d{6}) ([0-9a-f]+) (\d)\t([^\0]*)\0 {2}ctime: (\d+):(\d+)\n {2}mtime: (\d+):(\d+)\n {2}dev: (\d+)\tino: (\d+)\n {2}uid: (\d+)\tgid: (\d+)\n {2}size: (\d+)\tflags: ([0-9a-f]+)\n/g;
  let last = 0;
  for (let m = re.exec(text); m; m = re.exec(text)) {
    last = re.lastIndex;
    const mode = modeFromOctal(m[1]!);
    if (!mode) continue;
    const flags = Number.parseInt(m[14]!, 16);
    entries.push({
      path: utf8(m[4]!),
      mode,
      blob: m[2]!,
      stage: Number(m[3]),
      assumeUnchanged: (flags & CE_VALID) !== 0,
      skipWorktree: (flags & CE_SKIP_WORKTREE) !== 0,
      intentToAdd: (flags & CE_INTENT_TO_ADD) !== 0,
      stat: {
        ctimeSeconds: Number(m[5]),
        ctimeNanoseconds: Number(m[6]),
        mtimeSeconds: Number(m[7]),
        mtimeNanoseconds: Number(m[8]),
        dev: Number(m[9]),
        inode: Number(m[10]),
        uid: Number(m[11]),
        gid: Number(m[12]),
        size: Number(m[13]),
      },
    });
  }
  if (last !== text.length) {
    throw new Error(
      `git ls-files --debug printed an entry this adapter cannot read at offset ${last}`,
    );
  }
  return entries;
}

/** `ls-files -o --exclude-standard -z`: untracked files not excluded by the ignore rules. */
export function parseUntracked(output: Buffer): string[] {
  return output
    .toString('latin1')
    .split('\0')
    .filter((p) => p !== '' && !p.endsWith('/'))
    .map(utf8);
}

export interface EolInfo {
  readonly index: string;
  readonly worktree: string;
  readonly attr: string;
}

/** `ls-files --eol -z`: the end-of-line analysis and attributes git reports, without any filter. */
export function parseEolListing(output: Buffer): Map<string, EolInfo> {
  const info = new Map<string, EolInfo>();
  for (const record of output.toString('latin1').split('\0')) {
    const tab = record.indexOf('\t');
    if (tab < 0) continue;
    const m = /^i\/(\S*)\s+w\/(\S*)\s+attr\/(.*)$/.exec(record.slice(0, tab));
    if (m)
      info.set(utf8(record.slice(tab + 1)), { index: m[1]!, worktree: m[2]!, attr: m[3]!.trim() });
  }
  return info;
}

/** `config --list --null`: key (section and variable lower-cased by git) to its values. */
export function parseConfigList(output: Buffer): Map<string, string[]> {
  const values = new Map<string, string[]>();
  for (const record of output.toString('utf8').split('\0')) {
    if (record === '') continue;
    const nl = record.indexOf('\n');
    const key = nl < 0 ? record : record.slice(0, nl);
    const value = nl < 0 ? '' : record.slice(nl + 1);
    // A key without a value ("key" alone) is true; mark it by an empty marker value.
    values.set(key, [...(values.get(key) ?? []), nl < 0 ? '\u0000true' : value]);
  }
  return values;
}

export function configBool(values: string[] | undefined, fallback: boolean): boolean {
  const v = values?.[values.length - 1];
  if (v === undefined) return fallback;
  if (v === '\u0000true') return true;
  const s = v.trim().toLowerCase();
  if (['true', 'yes', 'on'].includes(s)) return true;
  if (['false', 'no', 'off', ''].includes(s)) return false;
  const n = Number(s);
  return Number.isNaN(n) ? fallback : n !== 0;
}

// ---------------------------------------------------------------------------------------------
// Content

export function hashBlob(bytes: Buffer, format: ObjectFormat): string {
  return createHash(format).update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
}

/** git's heuristic for "binary": a NUL byte in the first 8000 bytes. */
export function looksBinary(bytes: Buffer): boolean {
  return bytes.subarray(0, 8000).includes(0);
}

type EolAction = 'binary' | 'text' | 'auto' | 'undefined';

function actionOf(attr: string): EolAction {
  if (/(^|\s)-text(\s|$)/.test(attr)) return 'binary';
  if (/(^|\s)text=auto(\s|$)/.test(attr)) return 'auto';
  if (/(^|\s)text(\s|$)/.test(attr)) return 'text';
  return 'undefined';
}

interface Stats {
  crlf: number;
  lonecr: number;
  nul: number;
  printable: number;
  nonprintable: number;
}

/** `gather_stats` and `convert_is_binary` of git's convert.c. */
function gatherStats(bytes: Buffer): Stats {
  const s: Stats = { crlf: 0, lonecr: 0, nul: 0, printable: 0, nonprintable: 0 };
  for (let i = 0; i < bytes.length; i++) {
    const c = bytes[i]!;
    if (c === 0x0d) {
      if (bytes[i + 1] === 0x0a) {
        s.crlf++;
        i++;
      } else s.lonecr++;
    } else if (c === 0x0a) {
      continue;
    } else if (c === 0x7f) s.nonprintable++;
    else if (c < 32) {
      if (c === 0x08 || c === 0x09 || c === 0x1b || c === 0x0c) s.printable++;
      else {
        if (c === 0) s.nul++;
        s.nonprintable++;
      }
    } else s.printable++;
  }
  if (bytes.length > 0 && bytes[bytes.length - 1] === 0x1a) s.nonprintable--;
  return s;
}

const isBinaryStats = (s: Stats) => s.lonecr > 0 || s.nul > 0 || s.printable >> 7 < s.nonprintable;

export interface EolSettings {
  readonly autocrlf: 'true' | 'input' | 'false';
}

/**
 * git's built-in end-of-line conversion of a working-tree file into the blob form (`crlf_to_git`):
 * no filter, no `ident`, no encoding conversion. `attr` is what `ls-files --eol` reports for the
 * path, `indexHasCrlf` whether the index blob holds CRLF line endings.
 */
export function convertEol(
  bytes: Buffer,
  attr: string,
  indexHasCrlf: boolean,
  settings: EolSettings,
): Buffer {
  let action = actionOf(attr);
  if (action === 'undefined' && settings.autocrlf !== 'false') action = 'auto';
  if (action === 'binary' || action === 'undefined' || bytes.length === 0) return bytes;
  const stats = gatherStats(bytes);
  if (stats.crlf === 0) return bytes;
  if (action === 'auto' && (isBinaryStats(stats) || indexHasCrlf)) return bytes;
  const out = Buffer.allocUnsafe(bytes.length - stats.crlf);
  let o = 0;
  for (let i = 0; i < bytes.length; i++) {
    if (bytes[i] === 0x0d && bytes[i + 1] === 0x0a) continue;
    out[o++] = bytes[i]!;
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// Stat data (§7 item 1) and the hash reuse of G-12 (§8 item 3)

/** The working-tree file's stat values as Git for Windows records them, or the system's. */
export interface WorkingStat {
  readonly kind: 'file' | 'symlink' | 'directory' | 'other';
  readonly mode: number;
  readonly size: bigint;
  readonly mtimeNs: bigint;
  /** Change time; on Windows the creation time, as Git for Windows records it. */
  readonly ctimeNs: bigint;
  readonly ino: bigint;
  readonly uid: bigint;
  readonly gid: bigint;
}

export function workingStat(
  st: BigIntStats,
  platform: NodeJS.Platform = process.platform,
): WorkingStat {
  const windows = platform === 'win32';
  const kind = st.isSymbolicLink()
    ? 'symlink'
    : st.isFile()
      ? 'file'
      : st.isDirectory()
        ? 'directory'
        : 'other';
  return {
    kind,
    mode: Number(st.mode),
    size: st.size,
    mtimeNs: st.mtimeNs,
    ctimeNs: windows ? st.birthtimeNs : st.ctimeNs,
    ino: windows ? 0n : st.ino,
    uid: windows ? 0n : st.uid,
    gid: windows ? 0n : st.gid,
  };
}

export function statKey(s: WorkingStat): string {
  return [s.kind, s.size, s.mtimeNs, s.ctimeNs, s.ino, s.uid, s.gid, s.mode & 0o111].join(':');
}

// The up-to-date rule of §7 item 1 lives in `index-stat.ts`; re-exported for existing callers.
export { indexEntryUpToDate, type IndexCheckOptions } from './index-stat.js';

export const HASH_KEEP_MARGIN_MS = 3000;

interface CachedHash {
  readonly key: string;
  readonly hash: string;
}

/**
 * The hashes G-07 and G-12 keep for G-12 (§8 item 3): in memory only, with the stat data read
 * before the content, and only for a file whose modification time and change time are both three
 * seconds or more older than the start of the read (the time-stamp rule).
 */
export class HashCache {
  private readonly entries = new Map<string, CachedHash>();

  get(path: string, key: string): string | undefined {
    const hit = this.entries.get(path);
    return hit && hit.key === key ? hit.hash : undefined;
  }

  keep(path: string, st: WorkingStat, hash: string, startedAtMs: number): void {
    const newest = Number(st.mtimeNs > st.ctimeNs ? st.mtimeNs : st.ctimeNs) / 1e6;
    if (startedAtMs - newest >= HASH_KEEP_MARGIN_MS) {
      this.entries.set(path, { key: statKey(st), hash });
    } else {
      this.entries.delete(path);
    }
  }

  get size(): number {
    return this.entries.size;
  }
}

// ---------------------------------------------------------------------------------------------
// The comparison

export interface ScanSide {
  readonly mode: FileMode;
  readonly hash: string;
  /** The bytes, kept only for a side that differs from the base side when asked for. */
  readonly bytes: Buffer | null;
}

export interface ScanEntry {
  readonly path: string;
  readonly base: { readonly mode: FileMode; readonly blob: string } | null;
  readonly current: ScanSide | null;
  readonly outsideSparse: boolean;
  /** Whether the current side differs from the base side in content or file mode. */
  readonly differs: boolean;
  /**
   * Set for a file under a clean filter that §7 item 3 compared by its working-tree bytes, that
   * differs and that the base side holds at the same path: what notice ERR-INTAKE-009 names.
   */
  readonly cleanFilter?: CleanFilterFallback;
}

/** The file mode of a working-tree file as git records it (core.fileMode, core.symlinks). */
export function workingMode(
  st: WorkingStat,
  reference: { readonly mode: FileMode } | null | undefined,
  settings: { readonly fileMode: boolean; readonly symlinks: boolean },
): { mode: FileMode; symlinkLike: boolean } {
  const symlinkLike =
    st.kind === 'symlink' ||
    (st.kind === 'file' && !settings.symlinks && reference?.mode === 'symlink');
  if (symlinkLike) return { mode: 'symlink', symlinkLike };
  if (!settings.fileMode && (reference?.mode === 'regular' || reference?.mode === 'executable')) {
    return { mode: reference.mode, symlinkLike };
  }
  return { mode: (st.mode & 0o100) !== 0 ? 'executable' : 'regular', symlinkLike };
}

/**
 * The bytes of a working-tree file as they are compared with a blob: the target of a symbolic
 * link, or the file's bytes after git's built-in end-of-line conversion. Runs no filter.
 */
export async function readWorkingBytes(
  abs: string,
  st: WorkingStat,
  symlinkLike: boolean,
  eol: () => Promise<EolInfo | undefined>,
  settings: EolSettings,
): Promise<Buffer> {
  const raw =
    st.kind === 'symlink' ? Buffer.from(await readlink(abs), 'utf8') : await readFile(abs);
  return convertWorkingBytes(raw, symlinkLike, eol, settings);
}

/** The blob form of bytes read from the working tree: git's built-in end-of-line conversion. */
export async function convertWorkingBytes(
  raw: Buffer,
  symlinkLike: boolean,
  eol: () => Promise<EolInfo | undefined>,
  settings: EolSettings,
): Promise<Buffer> {
  if (symlinkLike || !raw.includes(0x0d)) return raw;
  const info = await eol();
  return convertEol(
    raw,
    info?.attr ?? '',
    info?.index === 'crlf' || info?.index === 'mixed',
    settings,
  );
}

export interface ScanInput {
  readonly workTree: string;
  readonly format: ObjectFormat;
  readonly baseTree: ReadonlyMap<string, TreeEntry>;
  readonly index: readonly IndexEntry[];
  readonly untracked: readonly string[];
  readonly eolInfo: () => Promise<ReadonlyMap<string, EolInfo>>;
  readonly settings: EolSettings & { readonly fileMode: boolean; readonly symlinks: boolean };
  readonly readBlob: (oid: string) => Promise<Buffer | null>;
  readonly cache: HashCache;
  /** G-12: reuse a kept hash while the stat data are unchanged. G-07 never reuses (§8 item 3). */
  readonly reuse: boolean;
  readonly keepContent: boolean;
  /**
   * §7: the clean-filter driver of a path, from the base commit's `.gitattributes` files and the
   * effective configuration (`clean-filter.ts`); `null` for a path under no clean filter. Without
   * it every path is compared as under no clean filter.
   */
  readonly cleanFilter?: (path: string) => string | null;
  /** §7 item 1: the settings and the index file's time for the up-to-date rule. */
  readonly indexCheck?: IndexCheckOptions;
  /** Test seam: the clock of the time-stamp rule. */
  readonly now?: () => number;
  readonly concurrency?: number;
}

async function mapLimit<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const worker = async () => {
    for (;;) {
      const i = next++;
      if (i >= items.length) return;
      results[i] = await fn(items[i]!);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

/** The prefix of a kept Git LFS digest in the hash cache: `lfs:<sha256>:<size>:<blob hash>`. */
const LFS_TAG = 'lfs:';

function parseLfsTag(value: string | undefined): { digest: LfsDigest; hash: string } | null {
  if (!value?.startsWith(LFS_TAG)) return null;
  const [sha256, size, hash] = value.slice(LFS_TAG.length).split(':');
  return sha256 && size && hash ? { digest: { sha256, size: Number(size) }, hash } : null;
}

const isAbsent = (error: unknown) =>
  typeof error === 'object' &&
  error !== null &&
  ['ENOENT', 'ENOTDIR'].includes((error as { code?: string }).code ?? '');

/**
 * Compares every path of the base tree, of the index and every untracked file that the ignore
 * rules do not exclude, with the base tree, by working-tree bytes (§8 item 1) or, outside a sparse
 * checkout, by the index entry (§8 item 2). Submodule (gitlink) paths are not files and are left
 * out.
 */
export async function scanWorkingTree(input: ScanInput): Promise<ScanEntry[]> {
  const startedAt = (input.now ?? Date.now)();
  const indexByPath = new Map<string, IndexEntry>();
  const tracked = new Set<string>();
  const gitlinks = new Set<string>();
  for (const e of input.index) {
    if (e.mode === 'submodule') {
      gitlinks.add(e.path);
      continue;
    }
    tracked.add(e.path);
    if (e.stage === 0) indexByPath.set(e.path, e);
  }
  const paths = new Set<string>(tracked);
  for (const [path, entry] of input.baseTree) {
    if (entry.mode === 'submodule') gitlinks.add(path);
    else paths.add(path);
  }
  for (const p of input.untracked) paths.add(p);
  for (const g of gitlinks) paths.delete(g);

  const ordered = [...paths].sort();
  return mapLimit(ordered, input.concurrency ?? 32, async (path): Promise<ScanEntry> => {
    const baseEntry = input.baseTree.get(path);
    const base = baseEntry && baseEntry.mode !== 'submodule' ? baseEntry : null;
    const idx = indexByPath.get(path);
    const abs = join(input.workTree, ...path.split('/'));

    let st: WorkingStat | null = null;
    try {
      st = workingStat(await lstat(abs, { bigint: true }));
    } catch (error) {
      if (!isAbsent(error)) throw error;
    }
    const present = st !== null && (st.kind === 'file' || st.kind === 'symlink');

    // §8 item 2: skip-worktree entry and no file or symbolic link at the path.
    if (idx && idx.skipWorktree && !present) {
      const mode = idx.mode;
      const differs = !base || base.blob !== idx.blob || base.mode !== mode;
      const bytes = differs && input.keepContent ? await input.readBlob(idx.blob) : null;
      return {
        path,
        base: base ? { mode: base.mode, blob: base.blob } : null,
        current: { mode, hash: idx.blob, bytes },
        outsideSparse: true,
        differs,
      };
    }
    if (!st || !present) {
      return {
        path,
        base: base ? { mode: base.mode, blob: base.blob } : null,
        current: null,
        outsideSparse: false,
        differs: base !== null,
      };
    }

    const file: WorkingStat = st;
    const { mode, symlinkLike } = workingMode(file, idx ?? base, input.settings);
    const baseSide = base ? { mode: base.mode, blob: base.blob } : null;
    const info = async () => (await input.eolInfo()).get(path);
    const plain = async (fallback?: CleanFilterCause, driver?: string): Promise<ScanEntry> => {
      const key = statKey(file);
      const cached = input.reuse ? input.cache.get(path, key) : undefined;
      let hash = cached?.startsWith(LFS_TAG) ? undefined : cached;
      let bytes: Buffer | null = null;
      if (hash === undefined) {
        // The stat data were read above, before the content (time-stamp rule, §8 item 3).
        bytes = await readWorkingBytes(abs, file, symlinkLike, info, input.settings);
        hash = hashBlob(bytes, input.format);
        input.cache.keep(path, file, hash, startedAt);
      }
      const differs = !base || base.blob !== hash || base.mode !== mode;
      // A reused hash (G-12) has no bytes: the callers that keep content never reuse.
      if (!differs || !input.keepContent) bytes = null;
      return {
        path,
        base: baseSide,
        current: { mode, hash, bytes },
        outsideSparse: false,
        differs,
        ...(fallback && driver && differs && base
          ? { cleanFilter: { driver, cause: fallback } }
          : {}),
      };
    };
    // A blob of the object database taken as the snapshot side (§7 items 2 and 7).
    const fromBlob = (oid: string, blob: Buffer | null): ScanEntry => {
      const differs = !base || base.blob !== oid || base.mode !== mode;
      return {
        path,
        base: baseSide,
        current: { mode, hash: oid, bytes: differs && input.keepContent ? blob : null },
        outsideSparse: false,
        differs,
      };
    };

    // §7: git applies a filter to regular files only, never to a symbolic link.
    const driver =
      file.kind === 'file' && !symlinkLike ? (input.cleanFilter?.(path) ?? null) : null;
    if (driver === null) return plain();

    if (driver === LFS_DRIVER) {
      // §7 item 7: the SHA-256 hash and size of the bytes as they are, no stat data, no index flag.
      const key = statKey(file);
      const cached = input.reuse ? parseLfsTag(input.cache.get(path, key)) : null;
      let digest: LfsDigest;
      let hash: string;
      let bytes: Buffer | null = null;
      if (cached) {
        ({ digest, hash } = cached);
      } else {
        const raw = await readFile(abs);
        digest = lfsDigest(raw);
        bytes = await convertWorkingBytes(raw, false, info, input.settings);
        hash = hashBlob(bytes, input.format);
        input.cache.keep(
          path,
          file,
          `${LFS_TAG}${digest.sha256}:${digest.size}:${hash}`,
          startedAt,
        );
      }
      if (base) {
        if (base.blob === hash || matchesLfsPointer(digest, await input.readBlob(base.blob))) {
          return fromBlob(base.blob, null);
        }
      }
      if (idx && !idx.intentToAdd && idx.blob !== base?.blob) {
        const indexBlob = await input.readBlob(idx.blob);
        if (indexBlob !== null && matchesLfsPointer(digest, indexBlob)) {
          return fromBlob(idx.blob, indexBlob);
        }
      }
      // §7 item 3: the working-tree bytes.
      const differs = !base || base.blob !== hash || base.mode !== mode;
      return {
        path,
        base: baseSide,
        current: { mode, hash, bytes: differs && input.keepContent ? bytes : null },
        outsideSparse: false,
        differs,
        ...(differs && base ? { cleanFilter: { driver, cause: 'no-matching-lfs-pointer' } } : {}),
      };
    }

    // §7 items 1 and 2: another filter, from the index blob while the entry is up to date.
    if (!idx || idx.intentToAdd) {
      return plain(tracked.has(path) && !idx ? 'not-up-to-date' : 'no-index-entry', driver);
    }
    if (!input.indexCheck || !indexEntryUpToDate(idx, file, input.indexCheck)) {
      return plain('not-up-to-date', driver);
    }
    const indexBlob = await input.readBlob(idx.blob);
    if (indexBlob === null) return plain('index-blob-missing', driver);
    return fromBlob(idx.blob, indexBlob);
  });
}
