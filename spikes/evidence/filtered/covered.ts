// Spike C001-T-020 (spike-grade): fill and reset of files under a clean filter for W6
// (C001-ADR-006 A1.4 to A1.6, C001-IF-013 §2 item 1). The production code comes with C001-T-028 and
// C001-T-067; this spike follows the order of A1.4 with the production copier and G-15:
// - Git LFS file: copy with the copier of §3.1 applied to one file, then SHA-256 hash and size of
//   the copy against the pointer file's `oid` and `size`; on a mismatch the stored form.
// - File under another filter: G-15 before the copy (up to date, entry records the snapshot-side
//   blob), copy, G-15 after (still up to date, same blob, same stat data); else the stored form.
// G-15 is read for all covered files at once before the copies and once after them (the order per
// file is kept: before < copy < after). A reset (A1.5) re-copies only files in their stored form;
// a file holding its copy whose stat data are unchanged is not copied again.
import { createHash } from 'node:crypto';
import { lstat, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { lookupAttribute, parseAttributeFile } from '../../../src/core/git/attributes.js';
import type { GitAccessPort, IndexEntryState, TreeEntry } from '../../../src/core/git/port.js';
import { executeCopy, planCopy } from '../../../src/core/evidence/workspace/copier.js';

export interface CoveredFile {
  readonly path: string;
  /** The filter driver: `lfs` or another name. */
  readonly driver: string;
  /** The snapshot-side blob (G-13 of the head, or the index entry recorded at intake). */
  readonly blob: string;
  readonly executable: boolean;
}

/** Files of the snapshot whose `filter` attribute is set, from its `.gitattributes` files. */
export function coveredFiles(
  tree: readonly TreeEntry[],
  attributeSources: ReadonlyArray<{ directory: string; content: string }>,
): CoveredFile[] {
  const depth = (d: string) => (d === '' ? 0 : d.split('/').length);
  const files = [...attributeSources]
    .sort((a, b) => depth(a.directory) - depth(b.directory))
    .map((f) => parseAttributeFile(f.directory, f.content));
  const out: CoveredFile[] = [];
  for (const e of tree) {
    if (e.mode !== 'regular' && e.mode !== 'executable') continue;
    const driver = lookupAttribute(files, e.path, 'filter');
    if (driver && driver !== 'set' && driver !== 'unset') {
      out.push({ path: e.path, driver, blob: e.blob, executable: e.mode === 'executable' });
    }
  }
  return out;
}

/** The `oid` and `size` of a Git LFS pointer file, or null when the bytes are not one. */
export function parseLfsPointer(bytes: Buffer): { oid: string; size: number } | null {
  if (bytes.length > 1024) return null;
  const text = bytes.toString('utf8');
  if (!text.startsWith('version https://git-lfs.github.com/spec/v1\n')) return null;
  const oid = /^oid sha256:([0-9a-f]{64})$/m.exec(text)?.[1];
  const size = /^size (\d+)$/m.exec(text)?.[1];
  return oid && size ? { oid, size: Number(size) } : null;
}

/** Same blob, up to date, same stat data (A1.4, "File under another filter"). */
export function g15Unchanged(
  before: IndexEntryState | null,
  after: IndexEntryState | null,
  blob: string,
): boolean {
  if (!before || !after) return false;
  if (!before.upToDate || !after.upToDate || before.blob !== blob || after.blob !== blob)
    return false;
  const a = before.stat;
  const b = after.stat;
  return (
    a.size === b.size &&
    a.mtimeSeconds === b.mtimeSeconds &&
    a.mtimeNanoseconds === b.mtimeNanoseconds &&
    a.ctimeSeconds === b.ctimeSeconds &&
    a.ctimeNanoseconds === b.ctimeNanoseconds &&
    a.inode === b.inode
  );
}

export type CoveredContent = 'copy' | 'stored';

export interface CoveredRecord {
  readonly path: string;
  readonly driver: string;
  readonly content: CoveredContent;
  readonly cause: string | null;
  readonly bytes: number;
}

export interface CoveredPassTimings {
  totalMs: number;
  g15BeforeMs: number;
  copyMs: number;
  hashMs: number;
  g15AfterMs: number;
  storedFormMs: number;
  statCheckMs: number;
  files: number;
  copied: number;
  stored: number;
  skippedUnchanged: number;
  bytesCopied: number;
}

interface Kept {
  content: CoveredContent;
  size: bigint;
  mtimeNs: bigint;
  ino: bigint;
}

const ms = (t0: number) => performance.now() - t0;
const sha256 = (b: Buffer) => createHash('sha256').update(b).digest('hex');

/** The covered files of one workspace and what each holds; `pass` is a fill or a reset. */
export class CoveredWorkspace {
  private readonly kept = new Map<string, Kept>();
  readonly records = new Map<string, CoveredRecord>();

  constructor(
    private readonly git: GitAccessPort,
    private readonly workTreeRoot: string,
    private readonly workspaceRoot: string,
    private readonly files: readonly CoveredFile[],
    /** The stored form (snapshot-side blob) of a covered file. */
    private readonly storedForm: (file: CoveredFile) => Promise<Buffer>,
  ) {}

  /**
   * One pass: at fill (`reset` false) every covered file; at a reset only the files in their
   * stored form and those whose kept copy no longer has its stat data.
   */
  async pass(reset: boolean): Promise<CoveredPassTimings> {
    const t: CoveredPassTimings = {
      totalMs: 0,
      g15BeforeMs: 0,
      copyMs: 0,
      hashMs: 0,
      g15AfterMs: 0,
      storedFormMs: 0,
      statCheckMs: 0,
      files: this.files.length,
      copied: 0,
      stored: 0,
      skippedUnchanged: 0,
      bytesCopied: 0,
    };
    const total = performance.now();
    let todo = [...this.files];
    if (reset) {
      const t0 = performance.now();
      const keep: CoveredFile[] = [];
      for (const f of todo) {
        const k = this.kept.get(f.path);
        if (k?.content === 'copy') {
          const st = await lstat(this.wsPath(f), { bigint: true }).catch(() => null);
          if (st && st.size === k.size && st.mtimeNs === k.mtimeNs && st.ino === k.ino) {
            t.skippedUnchanged++;
            continue;
          }
        }
        keep.push(f);
      }
      t.statCheckMs = ms(t0);
      todo = keep;
    }
    const others = todo.filter((f) => f.driver !== 'lfs');
    let t0 = performance.now();
    const before =
      others.length > 0 ? await this.git.indexState(others.map((f) => f.path)) : new Map();
    t.g15BeforeMs = ms(t0);
    const copied: CoveredFile[] = [];
    for (const f of todo) {
      if (f.driver !== 'lfs') {
        const b = before.get(f.path) ?? null;
        if (!b || !b.upToDate || b.blob !== f.blob) {
          await this.writeStored(f, b ? 'not up to date in the index' : 'no index entry', t);
          continue;
        }
      }
      t0 = performance.now();
      const ok = await this.copyOne(f);
      t.copyMs += ms(t0);
      if (!ok) {
        await this.writeStored(f, 'no working-tree file', t);
        continue;
      }
      if (f.driver === 'lfs') {
        t0 = performance.now();
        const pointer = parseLfsPointer(await this.storedForm(f));
        const copy = await readFile(this.wsPath(f));
        const match =
          pointer !== null && copy.length === pointer.size && sha256(copy) === pointer.oid;
        t.hashMs += ms(t0);
        if (!match) {
          await this.writeStored(
            f,
            pointer ? 'hash or size differs from the pointer file' : 'not a pointer file',
            t,
          );
          continue;
        }
        await this.keepCopy(f, copy.length, t);
      } else copied.push(f);
    }
    t0 = performance.now();
    const after =
      copied.length > 0 ? await this.git.indexState(copied.map((f) => f.path)) : new Map();
    t.g15AfterMs = ms(t0);
    for (const f of copied) {
      if (g15Unchanged(before.get(f.path) ?? null, after.get(f.path) ?? null, f.blob)) {
        const st = await lstat(this.wsPath(f), { bigint: true });
        await this.keepCopy(f, Number(st.size), t);
      } else await this.writeStored(f, 'changed in the index during the copy', t);
    }
    t.totalMs = ms(total);
    for (const k of Object.keys(t) as Array<keyof CoveredPassTimings>) {
      if (k.endsWith('Ms')) t[k] = Math.round(t[k] * 10) / 10;
    }
    return t;
  }

  private wsPath(f: CoveredFile): string {
    return path.join(this.workspaceRoot, ...f.path.split('/'));
  }

  /** The copier of C001-ADR-006 §3.1 applied to one file: clone where supported, else bytes. */
  private async copyOne(f: CoveredFile): Promise<boolean> {
    let plan;
    try {
      plan = await planCopy(this.workTreeRoot, [f.path], { concurrency: 1 });
    } catch {
      return false;
    }
    if (!plan.entries.some((e) => e.rel === f.path && e.kind === 'file')) return false;
    await rm(this.wsPath(f), { force: true });
    await executeCopy(plan, this.workspaceRoot, {
      rules: {
        platform: process.platform,
        forbidden: [],
        redirects: [],
        realPath: (p) => p,
        destinationRoot: this.workspaceRoot,
      },
      concurrency: 1,
    });
    return true;
  }

  private async keepCopy(f: CoveredFile, bytes: number, t: CoveredPassTimings): Promise<void> {
    const st = await lstat(this.wsPath(f), { bigint: true });
    this.kept.set(f.path, { content: 'copy', size: st.size, mtimeNs: st.mtimeNs, ino: st.ino });
    this.records.set(f.path, {
      path: f.path,
      driver: f.driver,
      content: 'copy',
      cause: null,
      bytes,
    });
    t.copied++;
    t.bytesCopied += bytes;
  }

  private async writeStored(f: CoveredFile, cause: string, t: CoveredPassTimings): Promise<void> {
    const t0 = performance.now();
    const bytes = await this.storedForm(f);
    await rm(this.wsPath(f), { force: true });
    await writeFile(this.wsPath(f), bytes, { mode: f.executable ? 0o777 : 0o666 });
    t.storedFormMs += ms(t0);
    this.kept.set(f.path, { content: 'stored', size: 0n, mtimeNs: 0n, ino: 0n });
    this.records.set(f.path, {
      path: f.path,
      driver: f.driver,
      content: 'stored',
      cause,
      bytes: bytes.length,
    });
    t.stored++;
  }
}
