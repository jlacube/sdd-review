import { constants } from 'node:fs';
import {
  copyFile,
  lstat,
  lutimes,
  mkdir,
  readdir,
  readlink,
  realpath,
  stat,
  symlink,
  unlink,
  utimes,
} from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { dirname, join, posix, relative, win32 } from 'node:path';
import { mapLimit } from './fill.js';
import { decideCopiedLink, type LinkDecision, type LinkRules } from './links.js';

/**
 * The copier of C001-ADR-006 §3.1: a copy-on-write clone where source and destination share a file
 * system that supports one, else a parallel byte copy; never a hard link, since a write through one
 * would change the source file (for a workspace, a working-tree file). Modification times are kept.
 * The copier reads the source and writes only below the destination root.
 *
 * Both paths go through Node's `fs.copyFile` (libuv), with no native binding:
 * - clone: `COPYFILE_FICLONE`, which is `clonefile` on APFS and the `FICLONE` ioctl on Btrfs, XFS
 *   and bcachefs, per file; a whole-directory `clonefile` call is not reachable without a native
 *   binding (licence report N-02), so APFS clones file by file;
 * - byte copy: plain `copyFile` (`copy_file_range` or `sendfile` on Linux, `CopyFileW` on Windows,
 *   which block-clones on ReFS and Dev Drive by itself where the system supports it; the copier
 *   does not call the ReFS block-cloning control code itself).
 * Each file is created exclusively (`COPYFILE_EXCL`), so a copy never writes through an existing
 * destination entry. Clone support is detected once per process for each pair of source and
 * destination file systems.
 */

export type CopyMethod = 'clone' | 'byte-copy';

const cloneSupportCache = new Map<string, Promise<CopyMethod>>();

/** Forgets the detected clone support (tests only). */
export function resetCloneSupportCache(): void {
  cloneSupportCache.clear();
}

/**
 * Whether files of `sampleFile`'s file system clone onto the file system of `destDir`: one forced
 * clone of an existing source file into `destDir`, removed at once. Nothing is written beside the
 * source. On Windows the answer is 'byte-copy': Node offers no forced clone there.
 */
export async function cloneSupport(
  sampleFile: string,
  destDir: string,
  platform: NodeJS.Platform = process.platform,
): Promise<CopyMethod> {
  if (platform === 'win32') return 'byte-copy';
  const [s, d] = await Promise.all([
    stat(sampleFile, { bigint: true }),
    stat(destDir, { bigint: true }),
  ]);
  const key = `${s.dev}:${d.dev}`;
  let known = cloneSupportCache.get(key);
  if (!known) {
    known = (async () => {
      const probe = join(
        destDir,
        `.sddr-clone-probe-${process.pid}-${randomBytes(4).toString('hex')}`,
      );
      try {
        await copyFile(
          sampleFile,
          probe,
          constants.COPYFILE_FICLONE_FORCE | constants.COPYFILE_EXCL,
        );
        return 'clone' as const;
      } catch {
        return 'byte-copy' as const;
      } finally {
        await unlink(probe).catch(() => undefined);
      }
    })();
    cloneSupportCache.set(key, known);
  }
  return known;
}

// ---------------------------------------------------------------------------------------------
// Planning

export interface CopyPlanEntry {
  /** Relative to the source root, '/' separators. */
  readonly rel: string;
  readonly kind: 'file' | 'dir' | 'link';
  readonly size: number;
  readonly mtimeMs: number;
  readonly atimeMs: number;
}

export interface CopyPlan {
  readonly sourceRoot: string;
  /** The copied directories and files, relative to the source root ('' for the whole tree). */
  readonly roots: readonly string[];
  readonly entries: readonly CopyPlanEntry[];
  /** Bytes of the regular files: the expected size for the disk-space check. */
  readonly totalBytes: number;
  /** Paths left out (each stands for everything below it). */
  readonly leftOut: readonly string[];
}

export interface PlanOptions {
  /** Paths left out with everything below them (C001-ADR-006 §3.2). */
  readonly exclude?: (rel: string) => boolean;
  /** Paths not copied because the destination already has them (snapshot files). */
  readonly skip?: (rel: string) => boolean;
  readonly concurrency?: number;
}

const abs = (root: string, rel: string) => (rel === '' ? root : join(root, ...rel.split('/')));
const child = (dir: string, name: string) => (dir === '' ? name : `${dir}/${name}`);

/**
 * Lists what a copy of `roots` below `sourceRoot` takes, without following links. Sockets, pipes
 * and devices are not copied.
 */
export async function planCopy(
  sourceRoot: string,
  roots: readonly string[],
  options: PlanOptions = {},
): Promise<CopyPlan> {
  const entries: CopyPlanEntry[] = [];
  const leftOut: string[] = [];
  let totalBytes = 0;
  const concurrency = options.concurrency ?? 32;

  const visit = async (rel: string): Promise<string | null> => {
    if (rel !== '' && options.exclude?.(rel)) {
      leftOut.push(rel);
      return null;
    }
    const st = await lstat(abs(sourceRoot, rel));
    const kind = st.isSymbolicLink()
      ? 'link'
      : st.isDirectory()
        ? 'dir'
        : st.isFile()
          ? 'file'
          : null;
    if (kind === null) return null;
    if (kind !== 'dir' && options.skip?.(rel)) return null;
    if (rel !== '' || kind !== 'dir') {
      entries.push({
        rel,
        kind,
        size: kind === 'file' ? st.size : 0,
        mtimeMs: st.mtimeMs,
        atimeMs: st.atimeMs,
      });
    }
    if (kind === 'file') totalBytes += st.size;
    return kind === 'dir' ? rel : null;
  };
  let level = (await mapLimit(roots, concurrency, visit)).filter((r): r is string => r !== null);
  while (level.length > 0) {
    const children: string[] = [];
    for (const dir of level) {
      for (const name of await readdir(abs(sourceRoot, dir))) children.push(child(dir, name));
    }
    level = (await mapLimit(children, concurrency, visit)).filter((r): r is string => r !== null);
  }
  entries.sort((a, b) => (a.rel < b.rel ? -1 : a.rel > b.rel ? 1 : 0));
  return { sourceRoot, roots, entries, totalBytes, leftOut };
}

// ---------------------------------------------------------------------------------------------
// Copying

export interface LinkOutcome {
  readonly path: string;
  readonly decision: LinkDecision;
  /** True when a Windows file link could not be created and the target's bytes were copied. */
  readonly copiedAsFile?: boolean;
}

export interface CopyResult {
  readonly method: CopyMethod;
  readonly files: number;
  readonly bytes: number;
  readonly links: readonly LinkOutcome[];
  readonly durationMs: number;
}

export interface CopyOptions {
  /** How links are retargeted (C001-ADR-006 §4, §7 item 3). */
  readonly rules: LinkRules;
  readonly platform?: NodeJS.Platform;
  /** Whether the process can create symbolic links (Windows: Developer Mode or a privilege). */
  readonly symlinks?: boolean;
  readonly concurrency?: number;
  /** Test seam: replaces `fs.promises.copyFile`, for example to simulate a full disk. */
  readonly copyFile?: typeof copyFile;
}

/** Copies the entries of `plan` below `destRoot`, which exists. */
export async function executeCopy(
  plan: CopyPlan,
  destRoot: string,
  options: CopyOptions,
): Promise<CopyResult> {
  const started = performance.now();
  const platform = options.platform ?? process.platform;
  const copy = options.copyFile ?? copyFile;
  const concurrency = options.concurrency ?? 16;
  const files = plan.entries.filter((e) => e.kind === 'file');
  const dirs = plan.entries.filter((e) => e.kind === 'dir');
  const links = plan.entries.filter((e) => e.kind === 'link');
  const method =
    files.length === 0
      ? 'byte-copy'
      : await cloneSupport(abs(plan.sourceRoot, files[0]!.rel), destRoot, platform);

  for (const root of plan.roots) {
    const parent = root.includes('/') ? root.slice(0, root.lastIndexOf('/')) : '';
    if (parent !== '') await mkdir(abs(destRoot, parent), { recursive: true });
  }
  for (const d of dirs) await mkdir(abs(destRoot, d.rel), { recursive: true });

  const flags = constants.COPYFILE_EXCL | (method === 'clone' ? constants.COPYFILE_FICLONE : 0);
  let bytes = 0;
  await mapLimit(files, concurrency, async (f) => {
    const target = abs(destRoot, f.rel);
    await copy(abs(plan.sourceRoot, f.rel), target, flags);
    await utimes(target, f.atimeMs / 1000, f.mtimeMs / 1000);
    bytes += f.size;
  });

  const outcomes = await mapLimit(links, concurrency, (l) =>
    copyLink(plan, l, destRoot, { ...options, platform, copyFile: copy }),
  );

  // Directory times last, deepest first, once nothing more is written in them.
  for (const d of [...dirs].reverse()) {
    await utimes(abs(destRoot, d.rel), d.atimeMs / 1000, d.mtimeMs / 1000).catch(() => undefined);
  }
  return {
    method,
    files: files.length,
    bytes,
    links: outcomes,
    durationMs: performance.now() - started,
  };
}

function copiedRootOf(plan: CopyPlan, rel: string): string {
  let best = '';
  for (const r of plan.roots) {
    if ((r === '' || rel === r || rel.startsWith(`${r}/`)) && r.length >= best.length) best = r;
  }
  return best;
}

async function copyLink(
  plan: CopyPlan,
  entry: CopyPlanEntry,
  destRoot: string,
  options: CopyOptions & { platform: NodeJS.Platform; copyFile: typeof copyFile },
): Promise<LinkOutcome> {
  const source = abs(plan.sourceRoot, entry.rel);
  const dest = abs(destRoot, entry.rel);
  const rawTarget = await readlink(source);
  const finalTarget = await realpath(source).catch(() => null);
  const isDir =
    finalTarget !== null && (await stat(finalTarget).catch(() => null))?.isDirectory() === true;
  const decision = decideCopiedLink(
    {
      linkPath: entry.rel,
      rawTarget,
      finalTarget,
      sourceRoot: plan.sourceRoot,
      copiedRoot: copiedRootOf(plan, entry.rel),
    },
    options.rules,
  );
  if (decision.action === 'drop') return { path: entry.rel, decision };
  const win = options.platform === 'win32';
  const path = win ? win32 : posix;
  const absoluteTarget =
    decision.action === 'keep'
      ? path.resolve(path.dirname(dest), decision.target)
      : decision.absolute;
  if (win) {
    if (isDir) {
      // A junction needs no privilege; it takes an absolute target.
      await symlink(absoluteTarget, dest, 'junction');
    } else {
      const text = decision.action === 'keep' ? decision.target : absoluteTarget;
      try {
        await symlink(text, dest, 'file');
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'EPERM' || options.symlinks === true)
          throw error;
        // No right to create a file link: the bytes of what it leads to, never a hard link.
        const from = (await stat(absoluteTarget).catch(() => null))?.isFile()
          ? absoluteTarget
          : finalTarget;
        if (from === null)
          return {
            path: entry.rel,
            decision: {
              action: 'drop',
              reason: 'a dangling file link cannot be created without the right to create links',
            },
          };
        await options.copyFile(from, dest, constants.COPYFILE_EXCL);
        return { path: entry.rel, decision, copiedAsFile: true };
      }
    }
  } else {
    const text =
      decision.action === 'keep'
        ? decision.target
        : decision.place === 'outside'
          ? decision.absolute
          : relative(dirname(dest), decision.absolute) || '.';
    await symlink(text, dest);
  }
  await lutimes(dest, entry.atimeMs / 1000, entry.mtimeMs / 1000).catch(() => undefined);
  return { path: entry.rel, decision };
}
