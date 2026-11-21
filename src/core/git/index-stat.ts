import { stat } from 'node:fs/promises';
import { join } from 'node:path';
import type { IndexEntry, WorkingStat } from './worktree-compare.js';

/**
 * The up-to-date rule of C001-IF-012 §7 item 1 (C001-REQ-126, C001-REQ-127), for files under a
 * clean filter other than Git LFS files (G-07, G-12, G-15). The test reads the index and the
 * file's stat data only and compares no content, so it runs no filter (§2 item 2).
 *
 * Hardened against git's own settings (CR-37): every field below is compared whatever
 * `core.checkStat` and `core.trustctime` say, and the assume-unchanged and skip-worktree flags are
 * ignored. On Windows the working-tree values are those Git for Windows records (`workingStat`):
 * the last-write time as modification time, the creation time as change time, and zero as inode,
 * user and group numbers; the residual Windows limit of §7 item 8 (a same-size edit with its
 * modification time set back) follows from those values and is accepted (Q-nonlfs-01).
 */

export interface IndexCheckOptions {
  /** `core.fileMode`; false means the executable bit does not count. */
  readonly fileMode: boolean;
  /** `core.symlinks`; false means a symbolic link entry is a plain file in the working tree. */
  readonly symlinks: boolean;
  /** The modification time of the index file, in nanoseconds, for the racy test. */
  readonly indexMtimeNs: bigint;
}

const NS = 1_000_000_000n;
const U32 = 0xffffffffn;

/**
 * §7 item 1: whether an index entry is up to date for the file's stat data.
 * - the entry is at stage 0 and not marked intent-to-add;
 * - file type, size, modification time, change time, inode, user and group numbers equal, and the
 *   executable bit unless `core.fileMode` is false; times to the second, and to the nanosecond
 *   when the entry records a nanosecond part other than zero;
 * - the entry is not racy: the modification time it records is earlier than the index file's.
 *   An entry that records no nanosecond part is compared with the index file's time to the second,
 *   as git does without nanosecond time stamps, so a same-second entry always counts as racy.
 */
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
  return !isRacy(entry, options.indexMtimeNs);
}

/** A racy entry: its recorded modification time is not earlier than the index file's. */
export function isRacy(entry: IndexEntry, indexMtimeNs: bigint): boolean {
  if (entry.stat.mtimeNanoseconds === 0) {
    return BigInt(entry.stat.mtimeSeconds) >= indexMtimeNs / NS;
  }
  const entryMtimeNs = BigInt(entry.stat.mtimeSeconds) * NS + BigInt(entry.stat.mtimeNanoseconds);
  return entryMtimeNs >= indexMtimeNs;
}

/**
 * The modification time of the index file of the working tree (the index file in the git
 * directory of G-01), in nanoseconds; 0 when there is none, which makes every entry racy.
 */
export async function indexFileMtimeNs(gitDir: string): Promise<bigint> {
  const st = await stat(join(gitDir, 'index'), { bigint: true }).catch(() => null);
  return st?.mtimeNs ?? 0n;
}
