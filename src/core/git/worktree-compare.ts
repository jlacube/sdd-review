import { createHash } from 'node:crypto';
import { lstat, readFile, readlink } from 'node:fs/promises';
import type { BigIntStats } from 'node:fs';
import { join } from 'node:path';
import type { FileMode, ObjectFormat, TreeEntry } from './port.js';

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
 * Files under a clean filter (§7, C001-T-028) are not settled here: they are compared by their
 * working-tree bytes too (§7 item 3), which is the fallback that §7 gives and what C001-T-028
 * refines for Git LFS files and for up-to-date entries.
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

const NS = 1_000_000_000n;
const U32 = 0xffffffffn;

export function statKey(s: WorkingStat): string {
  return [s.kind, s.size, s.mtimeNs, s.ctimeNs, s.ino, s.uid, s.gid, s.mode & 0o111].join(':');
}

export interface IndexCheckOptions {
  /** `core.fileMode`; false means the executable bit does not count. */
  readonly fileMode: boolean;
  /** `core.symlinks`; false means a symbolic link entry is a plain file in the working tree. */
  readonly symlinks: boolean;
  /** The modification time of the index file, in nanoseconds, for the racy test. */
  readonly indexMtimeNs: bigint;
}

/** §7 item 1: whether an index entry is up to date for the file's stat data; reads no content. */
export function indexEntryUpToDate(
  entry: IndexEntry,
  st: WorkingStat | null,
  options: IndexCheckOptions,
): boolean {
  if (!st || entry.stage !== 0 || entry.intentToAdd) return false;
  const typeOk =
    entry.mode === 'symlink'
      ? st.kind === 'symlink' || (st.kind === 'file' && !options.symlinks)
      : entry.mode === 'submodule'
        ? st.kind === 'directory'
        : st.kind === 'file';
  if (!typeOk) return false;
  if (entry.mode !== 'submodule' && (st.size & U32) !== BigInt(entry.stat.size)) return false;
  if ((st.ino & U32) !== BigInt(entry.stat.inode)) return false;
  if ((st.uid & U32) !== BigInt(entry.stat.uid) || (st.gid & U32) !== BigInt(entry.stat.gid)) {
    return false;
  }
  const timeOk = (ns: bigint, seconds: number, nanos: number) =>
    (ns / NS) % (1n << 32n) === BigInt(seconds) && (nanos === 0 || ns % NS === BigInt(nanos));
  if (!timeOk(st.mtimeNs, entry.stat.mtimeSeconds, entry.stat.mtimeNanoseconds)) return false;
  if (!timeOk(st.ctimeNs, entry.stat.ctimeSeconds, entry.stat.ctimeNanoseconds)) return false;
  if (options.fileMode && entry.mode !== 'symlink') {
    const executable = (st.mode & 0o100) !== 0;
    if (executable !== (entry.mode === 'executable')) return false;
  }
  // Racy: the entry's modification time is not earlier than the index file's.
  const entryMtimeNs = BigInt(entry.stat.mtimeSeconds) * NS + BigInt(entry.stat.mtimeNanoseconds);
  return entryMtimeNs < options.indexMtimeNs;
}

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

    const { mode, symlinkLike } = workingMode(st, idx ?? base, input.settings);
    const key = statKey(st);
    let hash = input.reuse ? input.cache.get(path, key) : undefined;
    let bytes: Buffer | null = null;
    if (hash === undefined) {
      // The stat data were read above, before the content (time-stamp rule, §8 item 3).
      const info = async () => (await input.eolInfo()).get(path);
      bytes = await readWorkingBytes(abs, st, symlinkLike, info, input.settings);
      hash = hashBlob(bytes, input.format);
      input.cache.keep(path, st, hash, startedAt);
    }
    const differs = !base || base.blob !== hash || base.mode !== mode;
    // A reused hash (G-12) has no bytes: the callers that keep content never reuse.
    if (!differs || !input.keepContent) bytes = null;
    return {
      path,
      base: base ? { mode: base.mode, blob: base.blob } : null,
      current: { mode, hash, bytes },
      outsideSparse: false,
      differs,
    };
  });
}
