import { rmSync } from 'node:fs';
import {
  mkdir,
  open,
  readdir,
  readFile,
  rename,
  rm,
  rmdir,
  stat,
  statfs,
  writeFile,
} from 'node:fs/promises';
import { join } from 'node:path';
import type { ContextualLog } from '../../log/log.js';
import {
  AttributeSet,
  directoriesOf,
  fillWorkspace,
  materialise,
  MissingContent,
  UnsafeEntryPath,
  type CheckoutSettings,
  type FillResult,
  type WorkspaceEntry,
} from './fill.js';
import { WorkspaceIndex, type Rewriter } from './index.js';
import { failPreparation } from './root.js';

/**
 * Lifetime of evidence workspaces (C001-ADR-006 §1 "Layout", "Lifetime", "Disk space";
 * C001-IF-013 §2 items 3 and 6): `<evidence root>/<repository key: 16 hex>/<snapshot key: 12
 * hex>/` holds run workspaces `w00` to `w99` and mutation copies `m00` to `m99`, each with a
 * sibling `<name>.aux/` for the files the core gives a run and a sibling `<name>.owner` naming the
 * owning process, its start time and the state. Workspaces are removed when their process ends;
 * a process that opens a snapshot sweeps the workspaces whose owner no longer runs.
 */

// ---------------------------------------------------------------------------------------------
// Layout

const HEX64 = /^[0-9a-f]{64}$/;
const SNAPSHOT_ID = /^s-[0-9a-f]{64}$/;

export interface WorkspaceKeys {
  readonly repository: string;
  readonly snapshot: string;
}

/** The directory keys from the store's repository key and a snapshot ID. */
export function workspaceKeys(repositoryKey: string, snapshotId: string): WorkspaceKeys {
  if (!HEX64.test(repositoryKey)) throw new Error(`not a repository key: ${repositoryKey}`);
  if (!SNAPSHOT_ID.test(snapshotId)) throw new Error(`not a snapshot ID: ${snapshotId}`);
  return { repository: repositoryKey.slice(0, 16), snapshot: snapshotId.slice(2, 14) };
}

export type WorkspaceKind = 'run' | 'mutation';

export interface WorkspaceNames {
  readonly name: string;
  readonly aux: string;
  readonly owner: string;
}

export function workspaceNames(kind: WorkspaceKind, number: number): WorkspaceNames {
  if (!Number.isInteger(number) || number < 0 || number > 99) {
    throw new Error(`workspace number out of range: ${number}`);
  }
  const name = `${kind === 'run' ? 'w' : 'm'}${String(number).padStart(2, '0')}`;
  return { name, aux: `${name}.aux`, owner: `${name}.owner` };
}

const NAME = /^([wm])(\d\d)(\.aux|\.owner|\.owner\.tmp-[0-9a-f]+)?$/;

// ---------------------------------------------------------------------------------------------
// Owner files and states

export type WorkspaceState = 'preparing' | 'free' | 'in-run' | 'copying' | 'mutation';

const STATES: readonly WorkspaceState[] = ['preparing', 'free', 'in-run', 'copying', 'mutation'];

const TRANSITIONS: Record<WorkspaceKind, Partial<Record<WorkspaceState, WorkspaceState[]>>> = {
  // The copy window (C001-IF-013 §2 item 3) starts when the check after a test run passes.
  run: {
    preparing: ['free'],
    free: ['in-run', 'copying'],
    'in-run': ['free', 'copying'],
    copying: ['free'],
  },
  // A mutation copy is never reset for another run; it is removed when mutation testing ends.
  mutation: { preparing: ['mutation'] },
};

export function canTransition(
  kind: WorkspaceKind,
  from: WorkspaceState,
  to: WorkspaceState,
): boolean {
  return TRANSITIONS[kind][from]?.includes(to) ?? false;
}

export interface OwnerRecord {
  readonly formatVersion: 1;
  readonly pid: number;
  /** The owning process's start time; with the pid it tells a reused process ID apart. */
  readonly startedAt: string;
  readonly kind: WorkspaceKind;
  readonly state: WorkspaceState;
  readonly updatedAt: string;
}

export function parseOwner(text: string): OwnerRecord | null {
  try {
    const o = JSON.parse(text) as Partial<OwnerRecord>;
    if (
      o.formatVersion !== 1 ||
      !Number.isInteger(o.pid) ||
      typeof o.startedAt !== 'string' ||
      (o.kind !== 'run' && o.kind !== 'mutation') ||
      !STATES.includes(o.state as WorkspaceState) ||
      typeof o.updatedAt !== 'string'
    ) {
      return null;
    }
    return o as OwnerRecord;
  } catch {
    return null;
  }
}

export interface ProcessIdentity {
  readonly pid: number;
  readonly startedAt: string;
}

/** This process, with its start time taken once. */
export const THIS_PROCESS: ProcessIdentity = {
  pid: process.pid,
  startedAt: new Date(Math.round(Date.now() - process.uptime() * 1000)).toISOString(),
};

/** True while the operating system knows the process ID (EPERM: it exists, owned by another user). */
export function processExists(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'EPERM';
  }
}

/**
 * Whether the owner of a workspace still runs. For this process's own ID the start time decides,
 * so a workspace left by an earlier process with the same ID is swept. For another ID a running
 * process keeps the workspace, which errs on the side of keeping.
 */
export function isOwnerAlive(
  owner: OwnerRecord,
  self: ProcessIdentity = THIS_PROCESS,
  exists: (pid: number) => boolean = processExists,
): boolean {
  if (owner.pid === self.pid) return owner.startedAt === self.startedAt;
  return exists(owner.pid);
}

// ---------------------------------------------------------------------------------------------
// Disk space

/** Free space must cover the expected size with 20 % margin (C001-ADR-006 §1). */
export function hasRoomFor(expectedBytes: number, freeBytes: bigint): boolean {
  return freeBytes * 5n >= BigInt(Math.ceil(expectedBytes)) * 6n;
}

/** Free bytes available to this user on the file system of `dir`. */
export async function freeSpaceOf(dir: string): Promise<bigint> {
  const s = await statfs(dir, { bigint: true });
  return s.bavail * s.bsize;
}

// ---------------------------------------------------------------------------------------------
// Workspace handles

export interface WorkspaceHandle {
  readonly kind: WorkspaceKind;
  readonly number: number;
  /** The snapshot's directory under the evidence root. */
  readonly snapshotDir: string;
  /** The workspace root: the working directory of every command run in it. */
  readonly root: string;
  readonly auxDir: string;
  readonly ownerFile: string;
  state: WorkspaceState;
}

async function writeOwnerAtomic(handle: WorkspaceHandle, state: WorkspaceState): Promise<void> {
  const record: OwnerRecord = {
    formatVersion: 1,
    pid: THIS_PROCESS.pid,
    startedAt: THIS_PROCESS.startedAt,
    kind: handle.kind,
    state,
    updatedAt: new Date().toISOString(),
  };
  const tmp = `${handle.ownerFile}.tmp-${process.pid.toString(16)}`;
  await writeFile(tmp, `${JSON.stringify(record)}\n`, { mode: 0o600 });
  for (let attempt = 0; ; attempt++) {
    try {
      await rename(tmp, handle.ownerFile);
      return;
    } catch (error) {
      // Windows refuses a rename onto a file another process is reading; retry briefly.
      if (attempt >= 20 || (error as NodeJS.ErrnoException).code !== 'EPERM') throw error;
      await new Promise((r) => setTimeout(r, 25));
    }
  }
}

/** Moves a workspace to `to`; an invalid transition is a programming error. */
export async function setState(handle: WorkspaceHandle, to: WorkspaceState): Promise<void> {
  if (!canTransition(handle.kind, handle.state, to)) {
    throw new Error(`workspace ${handle.root}: no transition from ${handle.state} to ${to}`);
  }
  await writeOwnerAtomic(handle, to);
  handle.state = to;
}

/**
 * Claims a workspace number in `snapshotDir` by creating its owner file exclusively (state
 * preparing), so that two processes never take the same number; then creates the workspace and
 * its aux directory. For a mutation copy, `number` is the number of the run workspace it copies.
 */
export async function claimWorkspace(
  snapshotDir: string,
  kind: WorkspaceKind,
  number?: number,
): Promise<WorkspaceHandle> {
  await mkdir(snapshotDir, { recursive: true, mode: 0o700 });
  const candidates = number === undefined ? [...Array(100).keys()] : [number];
  for (const n of candidates) {
    const names = workspaceNames(kind, n);
    const ownerFile = join(snapshotDir, names.owner);
    let file;
    try {
      file = await open(ownerFile, 'wx', 0o600);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'EEXIST') continue;
      throw error;
    }
    const handle: WorkspaceHandle = {
      kind,
      number: n,
      snapshotDir,
      root: join(snapshotDir, names.name),
      auxDir: join(snapshotDir, names.aux),
      ownerFile,
      state: 'preparing',
    };
    try {
      const record: OwnerRecord = {
        formatVersion: 1,
        pid: THIS_PROCESS.pid,
        startedAt: THIS_PROCESS.startedAt,
        kind,
        state: 'preparing',
        updatedAt: new Date().toISOString(),
      };
      await file.writeFile(`${JSON.stringify(record)}\n`);
    } finally {
      await file.close();
    }
    // A directory left without an owner file by a crash is stale; start empty.
    await rm(handle.root, { recursive: true, force: true, maxRetries: 3 });
    await rm(handle.auxDir, { recursive: true, force: true, maxRetries: 3 });
    await mkdir(handle.root, { mode: 0o700 });
    await mkdir(handle.auxDir, { mode: 0o700 });
    return handle;
  }
  throw new Error(`every ${kind} workspace number of ${snapshotDir} is taken`);
}

async function removeNamed(snapshotDir: string, names: WorkspaceNames): Promise<string | null> {
  try {
    await rm(join(snapshotDir, names.name), { recursive: true, force: true, maxRetries: 5 });
    await rm(join(snapshotDir, names.aux), { recursive: true, force: true, maxRetries: 5 });
    // The owner file goes last: a removal that fails half-way is still found by the next sweep.
    await rm(join(snapshotDir, names.owner), { force: true, maxRetries: 5 });
    return null;
  } catch (error) {
    return (error as Error).message;
  }
}

export interface RemovalResult {
  readonly removed: boolean;
  /** Why the removal failed (for example a handle held by a left-over build server on Windows). */
  readonly cause: string | null;
}

/**
 * Removes a workspace, its aux directory and then its owner file. A failed removal is not an error
 * of any run: the next sweep retries it (C001-ADR-006 §1).
 */
export async function removeWorkspace(handle: WorkspaceHandle): Promise<RemovalResult> {
  const cause = await removeNamed(handle.snapshotDir, workspaceNames(handle.kind, handle.number));
  return { removed: cause === null, cause };
}

/**
 * The workspaces of this process, removed when it ends: `removeAll` for an orderly close, and a
 * synchronous removal on the process's `exit` event for everything still tracked.
 */
export class WorkspaceRegistry {
  private readonly handles = new Set<WorkspaceHandle>();
  private hooked = false;

  track(handle: WorkspaceHandle): void {
    this.handles.add(handle);
    if (!this.hooked) {
      this.hooked = true;
      process.once('exit', () => this.removeAllSync());
    }
  }

  async release(handle: WorkspaceHandle): Promise<RemovalResult> {
    this.handles.delete(handle);
    return removeWorkspace(handle);
  }

  async removeAll(): Promise<RemovalResult[]> {
    const all = [...this.handles];
    this.handles.clear();
    return Promise.all(all.map((h) => removeWorkspace(h)));
  }

  removeAllSync(): void {
    for (const h of this.handles) {
      for (const p of [h.root, h.auxDir, h.ownerFile]) {
        try {
          rmSync(p, { recursive: true, force: true, maxRetries: 2 });
        } catch {
          /* the next sweep retries */
        }
      }
    }
    this.handles.clear();
  }
}

// ---------------------------------------------------------------------------------------------
// Sweep

export interface SweepOptions {
  readonly self?: ProcessIdentity;
  readonly exists?: (pid: number) => boolean;
  /** An owner file that cannot be parsed is young (being written) below this age; default 60 s. */
  readonly unreadableGraceMs?: number;
}

export interface SweepResult {
  readonly removed: readonly string[];
  readonly kept: readonly string[];
  /** Workspaces whose removal failed; retried at the next sweep. */
  readonly failed: ReadonlyArray<{ readonly path: string; readonly cause: string }>;
}

/**
 * Removes every workspace of one snapshot directory whose owner process no longer runs, and every
 * workspace or aux directory without an owner file (C001-IF-013 §2 item 6). Removes the snapshot
 * directory when it ends empty.
 */
export async function sweepSnapshotDir(
  snapshotDir: string,
  options: SweepOptions = {},
): Promise<SweepResult> {
  const removed: string[] = [];
  const kept: string[] = [];
  const failed: Array<{ path: string; cause: string }> = [];
  let names: string[];
  try {
    names = await readdir(snapshotDir);
  } catch {
    return { removed, kept, failed };
  }
  const bases = new Map<string, { kind: WorkspaceKind; number: number }>();
  for (const n of names) {
    const m = NAME.exec(n);
    if (m)
      bases.set(`${m[1]}${m[2]}`, {
        kind: m[1] === 'w' ? 'run' : 'mutation',
        number: Number(m[2]),
      });
  }
  for (const [base, { kind, number }] of bases) {
    const wn = workspaceNames(kind, number);
    const ownerPath = join(snapshotDir, wn.owner);
    let alive: boolean;
    try {
      const owner = parseOwner(await readFile(ownerPath, 'utf8'));
      if (owner) {
        alive = isOwnerAlive(owner, options.self, options.exists);
      } else {
        const age = Date.now() - (await stat(ownerPath)).mtimeMs;
        alive = age < (options.unreadableGraceMs ?? 60_000);
      }
    } catch {
      alive = false; // no owner file: left by a crash between claim steps, or half removed
    }
    const path = join(snapshotDir, base);
    if (alive) {
      kept.push(path);
      continue;
    }
    for (const n of names) {
      if (n.startsWith(`${wn.owner}.tmp-`)) await rm(join(snapshotDir, n), { force: true });
    }
    const cause = await removeNamed(snapshotDir, wn);
    if (cause === null) removed.push(path);
    else failed.push({ path, cause });
  }
  try {
    await rmdir(snapshotDir);
  } catch {
    /* not empty, or gone */
  }
  return { removed, kept, failed };
}

/** The sweep on open of a snapshot (C001-ADR-006 §1 "Lifetime"). */
export function sweepSnapshot(
  evidenceRoot: string,
  repositoryKey: string,
  snapshotId: string,
  options: SweepOptions = {},
): Promise<SweepResult> {
  const keys = workspaceKeys(repositoryKey, snapshotId);
  return sweepSnapshotDir(join(evidenceRoot, keys.repository, keys.snapshot), options);
}

/** Sweeps every snapshot directory of one repository. */
export async function sweepRepository(
  evidenceRoot: string,
  repositoryKey: string,
  options: SweepOptions = {},
): Promise<SweepResult> {
  if (!HEX64.test(repositoryKey)) throw new Error(`not a repository key: ${repositoryKey}`);
  const dir = join(evidenceRoot, repositoryKey.slice(0, 16));
  const out = {
    removed: [] as string[],
    kept: [] as string[],
    failed: [] as SweepResult['failed'][number][],
  };
  let names: string[];
  try {
    names = await readdir(dir);
  } catch {
    return out;
  }
  for (const n of names.filter((x) => /^[0-9a-f]{12}$/.test(x))) {
    const r = await sweepSnapshotDir(join(dir, n), options);
    out.removed.push(...r.removed);
    out.kept.push(...r.kept);
    out.failed.push(...r.failed);
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// Preparation

export interface PrepareOptions {
  /** The real path of the evidence root (`resolveEvidenceRoot`). */
  readonly evidenceRoot: string;
  /** The store's repository key (SHA-256 of the common git directory, C001-ADR-005). */
  readonly repositoryKey: string;
  readonly snapshotId: string;
  readonly entries: readonly WorkspaceEntry[];
  readonly checkout: CheckoutSettings;
  readonly attributes: AttributeSet;
  readonly registry?: WorkspaceRegistry;
  readonly log?: ContextualLog;
  /** The command the workspace is prepared for, named by ERR-EVID-002. */
  readonly command?: string;
  /** Test seams. */
  readonly freeSpace?: (dir: string) => Promise<bigint>;
  readonly symlinks?: boolean;
  readonly concurrency?: number;
}

export interface PreparedWorkspace {
  readonly handle: WorkspaceHandle;
  readonly index: WorkspaceIndex;
  readonly fill: FillResult;
  /** Writes one snapshot path again, as the fill did (the reset of C001-IF-013 §2 item 3). */
  readonly rewrite: Rewriter;
}

function causeOf(error: unknown): string {
  if (error instanceof MissingContent)
    return `the snapshot content of ${error.path} is not available`;
  if (error instanceof UnsafeEntryPath) return error.message;
  return (error as Error).message ?? String(error);
}

/**
 * Prepares a run workspace of a snapshot: claims a number, checks disk space against the expected
 * size before writing, fills it, records the index and sets it free. Any failure removes what was
 * written and is ERR-EVID-002 with its cause.
 */
export async function prepareWorkspace(options: PrepareOptions): Promise<PreparedWorkspace> {
  const keys = workspaceKeys(options.repositoryKey, options.snapshotId);
  const snapshotDir = join(options.evidenceRoot, keys.repository, keys.snapshot);
  let handle: WorkspaceHandle;
  try {
    handle = await claimWorkspace(snapshotDir, 'run');
  } catch (error) {
    return failPreparation(options.log, {
      operation: 'prepare-workspace',
      command: options.command,
      cause: `no workspace can be created: ${causeOf(error)}`,
      inputs: { snapshotId: options.snapshotId, snapshotDir },
    });
  }
  options.registry?.track(handle);
  let tooLittle: string | null = null;
  try {
    const fill = await fillWorkspace(handle.root, options.entries, {
      checkout: options.checkout,
      attributes: options.attributes,
      symlinks: options.symlinks,
      concurrency: options.concurrency,
      beforeWrite: async (total) => {
        const free = await (options.freeSpace ?? freeSpaceOf)(handle.root);
        if (!hasRoomFor(total, free)) {
          tooLittle = `not enough disk space for the evidence workspace: ${total} bytes and 20 % margin needed, ${free} bytes free`;
          throw new Error(tooLittle);
        }
      },
    });
    const directories = directoriesOf(options.entries);
    const index = await WorkspaceIndex.build(handle.root, fill.written, directories);
    await setState(handle, 'free');
    const byPath = new Map(options.entries.map((e) => [e.path, e]));
    const settings = {
      checkout: options.checkout,
      attributes: options.attributes,
      symlinks: !fill.symlinksAsFiles,
      directories,
    };
    const rewrite: Rewriter = async (path) => {
      const entry = byPath.get(path);
      if (!entry) throw new Error(`${path} is not a path of the snapshot`);
      return materialise(entry, settings);
    };
    return { handle, index, fill, rewrite };
  } catch (error) {
    if (options.registry) await options.registry.release(handle);
    else await removeWorkspace(handle);
    return failPreparation(options.log, {
      operation: 'prepare-workspace',
      command: options.command,
      cause: tooLittle ?? causeOf(error),
      inputs: { snapshotId: options.snapshotId, workspace: handle.root },
    });
  }
}
