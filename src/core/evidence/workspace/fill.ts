import { createHash, randomBytes } from 'node:crypto';
import { mkdir, rm, symlink, unlink, writeFile } from 'node:fs/promises';
import { join, posix } from 'node:path';
import type { FileMode, TreeEntry } from '../../git/port.js';
import { lookupAttribute, parseAttributeFile, type AttributeFile } from '../../git/attributes.js';

/**
 * Filling an evidence workspace (C001-ADR-006 §2 "Fill", C001-IF-013 §2 item 1): the base commit's
 * tree without the files the change deletes, with the snapshot content of every added, modified
 * and renamed file, each with the file mode of its snapshot side and with the line endings that
 * git's built-in checkout conversion gives. No filter, `ident` or encoding conversion runs.
 * Symbolic links are written as links; on Windows, when the process cannot create links, as a
 * regular file holding the target, as a checkout with `core.symlinks=false` does. Submodule paths
 * are empty directories here (C001-T-067 fills them through G-16); link targets that lead into
 * the working tree or the git directory are handled by `WriteSettings.linkTarget` (links.ts).
 */

// ---------------------------------------------------------------------------------------------
// Checkout end-of-line conversion (git 2.45 convert.c)

export interface CheckoutSettings {
  /** `core.autocrlf`. */
  readonly autocrlf: 'true' | 'input' | 'false';
  /** `core.eol`, or null when unset. */
  readonly eol: 'lf' | 'crlf' | 'native' | null;
  /** The native line ending of the git program: CRLF for Git for Windows, LF elsewhere. */
  readonly nativeEol: 'lf' | 'crlf';
}

/** The native line ending of the installed git program on this operating system. */
export const nativeEolOf = (platform: NodeJS.Platform = process.platform): 'lf' | 'crlf' =>
  platform === 'win32' ? 'crlf' : 'lf';

/** The values `lookupAttribute` gives: 'set', 'unset', a value, or null for unspecified. */
export interface EolAttributes {
  readonly text: string | null;
  readonly crlf: string | null;
  readonly eol: string | null;
}

export type CrlfAction =
  'binary' | 'text-input' | 'text-crlf' | 'auto' | 'auto-input' | 'auto-crlf';

type RawAction = CrlfAction | 'text' | 'undefined';

/** `git_path_check_crlf`. */
function checkCrlf(value: string | null): RawAction {
  if (value === 'set') return 'text';
  if (value === 'unset') return 'binary';
  if (value === 'input') return 'text-input';
  if (value === 'auto') return 'auto';
  return 'undefined';
}

/** `text_eol_is_crlf`. */
function textEolIsCrlf(s: CheckoutSettings): boolean {
  if (s.autocrlf === 'true') return true;
  if (s.autocrlf === 'input') return false;
  if (s.eol === 'crlf') return true;
  if (s.eol === 'lf') return false;
  return s.nativeEol === 'crlf';
}

/** `convert_attrs`: the conversion of one path. */
export function crlfAction(attrs: EolAttributes, s: CheckoutSettings): CrlfAction {
  let action = checkCrlf(attrs.text);
  if (action === 'undefined') action = checkCrlf(attrs.crlf);
  if (action !== 'binary') {
    const eol = attrs.eol === 'lf' || attrs.eol === 'crlf' ? attrs.eol : null;
    if (action === 'auto' && eol === 'lf') action = 'auto-input';
    else if (action === 'auto' && eol === 'crlf') action = 'auto-crlf';
    else if (eol === 'lf') action = 'text-input';
    else if (eol === 'crlf') action = 'text-crlf';
  }
  if (action === 'text') action = textEolIsCrlf(s) ? 'text-crlf' : 'text-input';
  if (action === 'undefined') {
    action = s.autocrlf === 'false' ? 'binary' : s.autocrlf === 'true' ? 'auto-crlf' : 'auto-input';
  }
  return action;
}

/** `output_eol`. */
function outputsCrlf(action: CrlfAction, s: CheckoutSettings): boolean {
  if (action === 'text-crlf' || action === 'auto-crlf') return true;
  if (action === 'auto') return textEolIsCrlf(s);
  return false;
}

interface Stats {
  lonecr: number;
  lonelf: number;
  crlf: number;
  nul: number;
  printable: number;
  nonprintable: number;
}

/** `gather_stats`. */
function gatherStats(b: Buffer): Stats {
  const s: Stats = { lonecr: 0, lonelf: 0, crlf: 0, nul: 0, printable: 0, nonprintable: 0 };
  for (let i = 0; i < b.length; i++) {
    const c = b[i]!;
    if (c === 0x0d) {
      if (b[i + 1] === 0x0a) {
        s.crlf++;
        i++;
      } else s.lonecr++;
      continue;
    }
    if (c === 0x0a) {
      s.lonelf++;
      continue;
    }
    if (c === 0x7f) s.nonprintable++;
    else if (c < 32) {
      if (c === 0x08 || c === 0x09 || c === 0x1b || c === 0x0c) s.printable++;
      else {
        if (c === 0) s.nul++;
        s.nonprintable++;
      }
    } else s.printable++;
  }
  if (b.length > 0 && b[b.length - 1] === 0x1a) s.nonprintable--;
  return s;
}

const isBinary = (s: Stats) => s.lonecr > 0 || s.nul > 0 || s.printable >> 7 < s.nonprintable;

/** `crlf_to_worktree`: the blob bytes of a regular file as a checkout writes them. */
export function toWorkingTree(bytes: Buffer, attrs: EolAttributes, s: CheckoutSettings): Buffer {
  const action = crlfAction(attrs, s);
  if (bytes.length === 0 || !outputsCrlf(action, s)) return bytes;
  const stats = gatherStats(bytes);
  if (stats.lonelf === 0) return bytes;
  if (action === 'auto' || action === 'auto-input' || action === 'auto-crlf') {
    if (stats.lonecr > 0 || stats.crlf > 0 || isBinary(stats)) return bytes;
  }
  const out = Buffer.allocUnsafe(bytes.length + stats.lonelf);
  let o = 0;
  for (let i = 0; i < bytes.length; i++) {
    const c = bytes[i]!;
    if (c === 0x0a && (i === 0 || bytes[i - 1] !== 0x0d)) out[o++] = 0x0d;
    out[o++] = c;
  }
  return out.subarray(0, o);
}

/**
 * The attributes that decide the line endings of each path: `core.attributesFile` (lowest), the
 * `.gitattributes` files of the snapshot from the root downward, `info/attributes` (highest).
 */
export class AttributeSet {
  private readonly files: readonly AttributeFile[];

  constructor(sources: {
    readonly files: ReadonlyArray<{ readonly directory: string; readonly content: string }>;
    readonly infoAttributes?: string | null;
    readonly globalAttributes?: string | null;
    readonly ignoreCase?: boolean;
  }) {
    const ic = sources.ignoreCase ?? false;
    const depth = (d: string) => (d === '' ? 0 : d.split('/').length);
    const tree = [...sources.files]
      .sort((a, b) => depth(a.directory) - depth(b.directory))
      .map((f) => parseAttributeFile(f.directory, f.content, ic));
    this.files = [
      ...(sources.globalAttributes ? [parseAttributeFile('', sources.globalAttributes, ic)] : []),
      ...tree,
      ...(sources.infoAttributes ? [parseAttributeFile('', sources.infoAttributes, ic)] : []),
    ];
  }

  eolOf(path: string): EolAttributes {
    return {
      text: lookupAttribute(this.files, path, 'text'),
      crlf: lookupAttribute(this.files, path, 'crlf'),
      eol: lookupAttribute(this.files, path, 'eol'),
    };
  }
}

// ---------------------------------------------------------------------------------------------
// The file list

export interface WorkspaceEntry {
  /** Repository-relative, '/' separators. */
  readonly path: string;
  readonly mode: FileMode;
  /** The blob bytes of the snapshot side (for a symbolic link its target); not for a submodule. */
  read(): Promise<Buffer>;
}

/** The members of a snapshot's ChangedFile (C001-IF-008) that the fill needs. */
export interface SnapshotFile {
  readonly path: string;
  readonly oldPath: string | null;
  readonly changeType: 'added' | 'modified' | 'deleted' | 'renamed';
  readonly mode: 'regular' | 'executable' | 'symbolic-link' | null;
  /** SHA-256 of the stored snapshot content; null for a deleted file and a binary file. */
  readonly contentHash: string | null;
}

export interface SnapshotSource {
  /** G-13 of the base commit. */
  readonly baseTree: readonly TreeEntry[];
  readonly changedFiles: readonly SnapshotFile[];
  /** G-08 at the base commit. */
  readBase(path: string): Promise<Buffer | null>;
  /** The snapshot content by its SHA-256 (C001-COMP-014). */
  readSnapshot(sha256: string): Promise<Buffer>;
}

/** Thrown by `read` when a snapshot path has no readable content. */
export class MissingContent extends Error {
  constructor(readonly path: string) {
    super(`the content of ${path} is not available`);
    this.name = 'MissingContent';
  }
}

const byPath = (a: { path: string }, b: { path: string }) =>
  a.path < b.path ? -1 : a.path > b.path ? 1 : 0;

/** The paths of a workspace with their modes and content readers, sorted by path. */
export function snapshotEntries(source: SnapshotSource): WorkspaceEntry[] {
  const entries = new Map<string, WorkspaceEntry>();
  for (const t of source.baseTree) {
    entries.set(t.path, {
      path: t.path,
      mode: t.mode,
      read: async () => {
        const bytes = await source.readBase(t.path);
        if (bytes === null) throw new MissingContent(t.path);
        return bytes;
      },
    });
  }
  for (const f of source.changedFiles) {
    if (f.changeType === 'renamed' && f.oldPath) entries.delete(f.oldPath);
    if (f.changeType === 'deleted') {
      entries.delete(f.path);
      continue;
    }
    const hash = f.contentHash;
    entries.set(f.path, {
      path: f.path,
      mode: f.mode === 'symbolic-link' ? 'symlink' : (f.mode ?? 'regular'),
      read: async () => {
        // A binary file's content is not in the snapshot store (C001-T-008); see the task report.
        if (hash === null) throw new MissingContent(f.path);
        return source.readSnapshot(hash);
      },
    });
  }
  return [...entries.values()].sort(byPath);
}

/**
 * True when `path` can be written below a workspace root: relative, no empty, `.` or `..`
 * component, no `.git` component (git refuses to check one out), no backslash or drive colon.
 */
export function isSafeEntryPath(path: string): boolean {
  if (path === '' || path.startsWith('/') || path.includes('\\') || path.includes('\0')) {
    return false;
  }
  if (/^[A-Za-z]:/.test(path)) return false;
  return path
    .split('/')
    .every((c) => c !== '' && c !== '.' && c !== '..' && c.toLowerCase() !== '.git');
}

// ---------------------------------------------------------------------------------------------
// Writing

let symlinkSupport: Promise<boolean> | undefined;

/**
 * Whether this process can create symbolic links, tested once per process in `probeDir` (only on
 * Windows, where creating one needs Developer Mode or a privilege).
 */
export function canCreateSymlinks(probeDir: string, platform = process.platform): Promise<boolean> {
  if (platform !== 'win32') return Promise.resolve(true);
  symlinkSupport ??= (async () => {
    const probe = join(probeDir, `.symlink-probe-${process.pid}-${randomBytes(4).toString('hex')}`);
    try {
      await symlink('target', probe, 'file');
      await unlink(probe);
      return true;
    } catch {
      return false;
    }
  })();
  return symlinkSupport;
}

/** What one entry becomes on disk. */
export type Materialised =
  | { readonly kind: 'file'; readonly bytes: Buffer; readonly executable: boolean }
  | { readonly kind: 'symlink'; readonly target: string; readonly directory: boolean }
  | { readonly kind: 'dir' };

export interface WriteSettings {
  readonly checkout: CheckoutSettings;
  readonly attributes: AttributeSet;
  /** False writes a symbolic link as a regular file holding its target. */
  readonly symlinks: boolean;
  /** The directories of the snapshot, to give a Windows link its directory type. */
  readonly directories: ReadonlySet<string>;
  /**
   * Maps the target of a symbolic link of the snapshot (C001-ADR-006 §4: a target under the
   * working-tree root gets its equivalent under the workspace root; one in the git directory
   * throws). Without it the target is written as the blob gives it.
   */
  readonly linkTarget?: LinkTargetMapper;
}

/**
 * The target a snapshot link at `path` gets for the blob text `target`, with the snapshot path it
 * leads to (null when none), which gives a Windows link its directory type.
 */
export type LinkTargetMapper = (
  path: string,
  target: string,
) => { readonly target: string; readonly leadsTo: string | null };

/** The directories that the paths of `entries` need. */
export function directoriesOf(entries: Iterable<{ path: string; mode: FileMode }>): Set<string> {
  const dirs = new Set<string>();
  for (const e of entries) {
    if (e.mode === 'submodule') dirs.add(e.path);
    for (let i = e.path.indexOf('/'); i > 0; i = e.path.indexOf('/', i + 1)) {
      dirs.add(e.path.slice(0, i));
    }
  }
  return dirs;
}

/** Reads one entry and gives the bytes, link or directory the workspace holds for it. */
export async function materialise(entry: WorkspaceEntry, s: WriteSettings): Promise<Materialised> {
  if (entry.mode === 'submodule') return { kind: 'dir' };
  const bytes = await entry.read();
  if (entry.mode === 'symlink') {
    const original = bytes.toString('utf8');
    const mapped = s.linkTarget?.(entry.path, original) ?? {
      target: original,
      leadsTo: posix.normalize(posix.join(posix.dirname(entry.path), original)),
    };
    if (!s.symlinks) {
      const text = mapped.target === original ? bytes : Buffer.from(mapped.target, 'utf8');
      return { kind: 'file', bytes: text, executable: false };
    }
    const directory = mapped.leadsTo !== null && s.directories.has(mapped.leadsTo);
    return { kind: 'symlink', target: mapped.target, directory };
  }
  return {
    kind: 'file',
    bytes: toWorkingTree(bytes, s.attributes.eolOf(entry.path), s.checkout),
    executable: entry.mode === 'executable',
  };
}

export const sha256 = (bytes: Uint8Array | string) =>
  createHash('sha256').update(bytes).digest('hex');

/** Size of what `materialise` gives, for the disk-space check. */
export const sizeOf = (m: Materialised) =>
  m.kind === 'file' ? m.bytes.length : m.kind === 'symlink' ? Buffer.byteLength(m.target) : 0;

/**
 * Writes one materialised entry at `abs`, replacing whatever is there. Regular files get the
 * permissions a checkout gives (0666 or 0777 less the umask). Returns the SHA-256 of a file's bytes.
 */
export async function writeMaterialised(
  abs: string,
  m: Materialised,
  replace: boolean,
): Promise<string | null> {
  if (replace) await rm(abs, { recursive: true, force: true, maxRetries: 3 });
  if (m.kind === 'dir') {
    await mkdir(abs, { recursive: true });
    return null;
  }
  if (m.kind === 'symlink') {
    await symlink(m.target, abs, m.directory ? 'dir' : 'file');
    return null;
  }
  await writeFile(abs, m.bytes, { mode: m.executable ? 0o777 : 0o666 });
  return sha256(m.bytes);
}

/** Runs `fn` over `items` with at most `limit` at a time. */
export async function mapLimit<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const worker = async () => {
    for (;;) {
      const i = next++;
      if (i >= items.length) return;
      results[i] = await fn(items[i]!, i);
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, worker));
  return results;
}

export interface WrittenEntry {
  readonly path: string;
  readonly kind: Materialised['kind'];
  /** SHA-256 of a regular file's bytes; null for a link or a directory. */
  readonly sha256: string | null;
}

export interface FillOptions extends Omit<WriteSettings, 'directories' | 'symlinks'> {
  /** Override of the per-process link test; default: `canCreateSymlinks`. */
  readonly symlinks?: boolean;
  /** Parallel reads and writes; default 16. */
  readonly concurrency?: number;
  /**
   * Called with the total size once every entry is read and before anything is written: the
   * disk-space check of C001-ADR-006 §1. Rejecting stops the fill with nothing written.
   */
  readonly beforeWrite?: (totalBytes: number) => Promise<void>;
  /** Content kept in memory between reading and writing; beyond it entries are read again. */
  readonly memoryBudgetBytes?: number;
}

export interface FillResult {
  readonly written: readonly WrittenEntry[];
  readonly totalBytes: number;
  readonly symlinksAsFiles: boolean;
  /** Fill time in milliseconds (C001-RISK-012: fill time per workspace). */
  readonly durationMs: number;
}

/** Thrown when an entry path could leave the workspace or name git metadata. */
export class UnsafeEntryPath extends Error {
  constructor(readonly path: string) {
    super(`the snapshot path ${JSON.stringify(path)} cannot be written in a workspace`);
    this.name = 'UnsafeEntryPath';
  }
}

/**
 * Fills the empty directory `root` with `entries`. Reads everything first (so the disk-space
 * check runs before any write), creates the directories, then writes files in parallel.
 */
export async function fillWorkspace(
  root: string,
  entries: readonly WorkspaceEntry[],
  options: FillOptions,
): Promise<FillResult> {
  const started = performance.now();
  for (const e of entries) if (!isSafeEntryPath(e.path)) throw new UnsafeEntryPath(e.path);
  const symlinks = options.symlinks ?? (await canCreateSymlinks(join(root, '..')));
  const settings: WriteSettings = {
    checkout: options.checkout,
    attributes: options.attributes,
    symlinks,
    directories: directoriesOf(entries),
    linkTarget: options.linkTarget,
  };
  const concurrency = options.concurrency ?? 16;
  const budget = options.memoryBudgetBytes ?? 512 * 1024 * 1024;
  let kept = 0;
  let total = 0;
  const held = await mapLimit(entries, concurrency, async (entry) => {
    const m = await materialise(entry, settings);
    const size = sizeOf(m);
    total += size;
    if (m.kind === 'file' && kept + size > budget) return null;
    kept += size;
    return m;
  });
  await options.beforeWrite?.(total);
  for (const dir of [...settings.directories].sort()) {
    await mkdir(join(root, ...dir.split('/')), { recursive: true });
  }
  const written = await mapLimit(entries, concurrency, async (entry, i) => {
    const m = held[i] ?? (await materialise(entry, settings));
    held[i] = null;
    const hash = await writeMaterialised(join(root, ...entry.path.split('/')), m, false);
    return { path: entry.path, kind: m.kind, sha256: hash };
  });
  return {
    written,
    totalBytes: total,
    symlinksAsFiles: !symlinks,
    durationMs: performance.now() - started,
  };
}
