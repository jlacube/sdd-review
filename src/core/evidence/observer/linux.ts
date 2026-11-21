import { createRequire } from 'node:module';
import type { Dirent } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import {
  causeOfInitError,
  causeOfWatchError,
  LOCAL_ONLY_FILE_SYSTEMS,
  type ObservedPart,
} from './causes.js';
import {
  repositoryBases,
  workingTreeBase,
  type BackendFactory,
  type BackendSink,
  type ObserverScope,
  type PartBackend,
  type WatchBase,
} from './observer.js';

/**
 * The inotify observer (C001-ADR-006 §9, Linux column): one inotify instance per part, one watch
 * per directory. A directory created or moved in during observation is watched, then listed, and
 * what the listing finds is reported as created. Directories on a file system that notifies local
 * changes only (by `statfs` type) are "not readable"; ENOSPC on a watch and EMFILE on the instance
 * are "watch limit"; `IN_Q_OVERFLOW` is "events lost" for the whole part; `IN_DELETE_SELF`,
 * `IN_MOVE_SELF`, `IN_UNMOUNT` or `IN_IGNORED` on a root are "observation interrupted". The queue
 * is read without blocking: on a timer between runs, and until empty on each drain.
 *
 * Node.js's `fs.watch` reports neither overflows nor refused watches, so the system calls go
 * through koffi (MIT, confirmed in docs/compliance/licence-and-version-report.md N-01, N-02).
 */

// inotify(7) constants (identical on x86-64 and arm64).
export const IN = {
  MODIFY: 0x2,
  ATTRIB: 0x4,
  MOVED_FROM: 0x40,
  MOVED_TO: 0x80,
  CREATE: 0x100,
  DELETE: 0x200,
  DELETE_SELF: 0x400,
  MOVE_SELF: 0x800,
  UNMOUNT: 0x2000,
  Q_OVERFLOW: 0x4000,
  IGNORED: 0x8000,
  ONLYDIR: 0x01000000,
  DONT_FOLLOW: 0x02000000,
  ISDIR: 0x40000000,
  NONBLOCK: 0o4000,
  CLOEXEC: 0o2000000,
} as const;

const WATCH_MASK =
  IN.MODIFY |
  IN.ATTRIB |
  IN.MOVED_FROM |
  IN.MOVED_TO |
  IN.CREATE |
  IN.DELETE |
  IN.DELETE_SELF |
  IN.MOVE_SELF |
  IN.ONLYDIR |
  IN.DONT_FOLLOW;

export interface InotifyEvent {
  readonly wd: number;
  readonly mask: number;
  readonly cookie: number;
  /** The entry name; '' for an event on the watched directory itself. */
  readonly name: string;
}

/** Parses `struct inotify_event` records (16-byte header, NUL-padded name). */
export function parseEvents(buf: Buffer, length: number): InotifyEvent[] {
  const out: InotifyEvent[] = [];
  let off = 0;
  while (off + 16 <= length) {
    const wd = buf.readInt32LE(off);
    const mask = buf.readUInt32LE(off + 4);
    const cookie = buf.readUInt32LE(off + 8);
    const len = buf.readUInt32LE(off + 12);
    let end = off + 16;
    const stop = Math.min(off + 16 + len, length);
    while (end < stop && buf[end] !== 0) end++;
    out.push({ wd, mask, cookie, name: buf.toString('utf8', off + 16, end) });
    off += 16 + len;
  }
  return out;
}

/** The libc calls the observer uses; replaced in tests. */
export interface Libc {
  inotifyInit(): number;
  addWatch(fd: number, path: string, mask: number): number;
  rmWatch(fd: number, wd: number): number;
  read(fd: number, buf: Buffer): number;
  close(fd: number): number;
  /** `statfs` f_type of a path, or null when it fails. */
  fsType(path: string): number | null;
  /** The errno name of the last failed call (for example 'ENOSPC'). */
  errnoName(): string;
}

let libc: Libc | null = null;

/** Binds libc through koffi on first use. Throws when it cannot be loaded. */
export function loadLibc(): Libc {
  if (libc) return libc;
  const require = createRequire(import.meta.url);
  const koffi = require('koffi') as typeof import('koffi');
  const lib = koffi.load('libc.so.6');
  const init1 = lib.func('int inotify_init1(int flags)');
  const add = lib.func('int inotify_add_watch(int fd, const char *path, uint32_t mask)');
  const rm = lib.func('int inotify_rm_watch(int fd, int wd)');
  const read = lib.func('intptr_t read(int fd, void *buf, size_t count)');
  const close = lib.func('int close(int fd)');
  const statfs = lib.func('int statfs(const char *path, void *buf)');
  const names = new Map<number, string>();
  for (const [name, value] of Object.entries(koffi.os.errno)) {
    if (!names.has(value)) names.set(value, name);
  }
  // struct statfs is 120 bytes on x86-64 and arm64; f_type is its first (long) member.
  const statBuf = Buffer.alloc(256);
  libc = {
    inotifyInit: () => init1(IN.NONBLOCK | IN.CLOEXEC) as number,
    addWatch: (fd, path, mask) => add(fd, path, mask) as number,
    rmWatch: (fd, wd) => rm(fd, wd) as number,
    read: (fd, buf) => Number(read(fd, buf, buf.length)),
    close: (fd) => close(fd) as number,
    fsType: (path) => {
      if ((statfs(path, statBuf) as number) !== 0) return null;
      return Number(statBuf.readBigInt64LE(0) & 0xffffffffn);
    },
    errnoName: () => {
      const n = koffi.errno();
      return names.get(n) ?? `errno ${n}`;
    },
  };
  return libc;
}

interface Watched {
  readonly base: number;
  rel: string;
}

const joinRel = (dir: string, name: string) => (dir === '' ? name : `${dir}/${name}`);
const isAtOrBelow = (p: string, a: string) => a === '' || p === a || p.startsWith(`${a}/`);

export interface InotifyOptions {
  readonly libc?: Libc;
  /** How often the queue is read between drains; default 100 ms. */
  readonly pollMs?: number;
  /** Directories listed at the same time during the initial walk; default 8. */
  readonly concurrency?: number;
}

/** The inotify backend of one part, over one or more watch bases. */
export class InotifyBackend implements PartBackend {
  private fd = -1;
  private readonly libc: Libc | null;
  private readonly loadError: unknown;
  private readonly wds = new Map<number, Watched>();
  private readonly byPath: Map<string, number>[];
  private readonly buf = Buffer.alloc(64 * 1024);
  private chain: Promise<void> = Promise.resolve();
  private busy = false;
  private timer: NodeJS.Timeout | null = null;
  private closed = false;
  private failed = false;

  constructor(
    private readonly bases: readonly WatchBase[],
    private readonly sink: BackendSink,
    private readonly options: InotifyOptions = {},
  ) {
    this.byPath = bases.map(() => new Map());
    let lib: Libc | null = null;
    let loadError: unknown = null;
    try {
      lib = options.libc ?? loadLibc();
    } catch (error) {
      loadError = error;
    }
    this.libc = lib;
    this.loadError = loadError;
  }

  async start(): Promise<void> {
    if (!this.libc) {
      this.sink.gap(
        'observation-interrupted',
        null,
        `inotify unavailable: ${String((this.loadError as Error)?.message ?? this.loadError)}`,
      );
      return;
    }
    const fd = this.libc.inotifyInit();
    if (fd < 0) {
      const code = this.libc.errnoName();
      this.sink.gap(causeOfInitError(code), null, `inotify_init1: ${code}`);
      return;
    }
    this.fd = fd;
    await this.enqueue(async () => {
      for (let b = 0; b < this.bases.length; b++) await this.watchTree(b, '', false);
    });
    if (this.closed) return;
    this.timer = setInterval(() => {
      if (!this.busy) void this.enqueue(() => this.pump()).catch(() => undefined);
    }, this.options.pollMs ?? 100);
    this.timer.unref();
  }

  drain(): Promise<void> {
    if (this.fd < 0 || this.closed) return Promise.resolve();
    return this.enqueue(() => this.pump());
  }

  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    if (this.timer) clearInterval(this.timer);
    await this.chain.catch(() => undefined);
    if (this.fd >= 0) this.libc?.close(this.fd);
    this.fd = -1;
    this.wds.clear();
  }

  /** Number of directories watched (for tests and diagnostics). */
  get watchCount(): number {
    return this.wds.size;
  }

  // -------------------------------------------------------------------------------------------

  private enqueue(task: () => Promise<void>): Promise<void> {
    const run = async () => {
      if (this.closed || this.failed) return;
      this.busy = true;
      try {
        await task();
      } catch (error) {
        this.failed = true;
        this.sink.failure(error);
      } finally {
        this.busy = false;
      }
    };
    const next = this.chain.then(run, run);
    this.chain = next;
    return next;
  }

  /** Reads and handles events until the queue is empty. */
  private async pump(): Promise<void> {
    const lib = this.libc!;
    for (;;) {
      if (this.closed) return;
      const n = lib.read(this.fd, this.buf);
      if (n < 0) {
        const code = lib.errnoName();
        if (code === 'EAGAIN' || code === 'EWOULDBLOCK') return;
        if (code === 'EINTR') continue;
        throw new Error(`read from inotify: ${code}`);
      }
      if (n === 0) return;
      for (const event of parseEvents(this.buf, n)) await this.handle(event);
    }
  }

  private async handle(event: InotifyEvent): Promise<void> {
    if (event.mask & IN.Q_OVERFLOW) {
      this.sink.gap('events-lost', null, 'inotify queue overflow (IN_Q_OVERFLOW)');
      return;
    }
    const watched = this.wds.get(event.wd);
    if (!watched) return; // a watch removed before its queued events were read
    const base = this.bases[watched.base]!;

    if (event.name === '') {
      const isRoot = watched.rel === '';
      if (event.mask & IN.IGNORED) {
        this.forget(event.wd);
        if (isRoot) this.interrupted(watched, 'IN_IGNORED on a root');
        return;
      }
      if (isRoot && event.mask & (IN.DELETE_SELF | IN.MOVE_SELF | IN.UNMOUNT)) {
        const flag =
          event.mask & IN.UNMOUNT
            ? 'IN_UNMOUNT'
            : event.mask & IN.MOVE_SELF
              ? 'IN_MOVE_SELF'
              : 'IN_DELETE_SELF';
        this.interrupted(watched, `${flag} on a root`);
        return;
      }
      if (event.mask & IN.UNMOUNT) {
        // A file system unmounted below the root: the directory now shows other content.
        const rel = watched.rel;
        this.removeSubtree(watched.base, rel);
        const label = base.gapLabel(rel);
        if (label !== null) this.sink.change(label);
        await this.watchTree(watched.base, rel, true);
      }
      return; // other self-events of a subdirectory are reported through its parent
    }

    const rel = joinRel(watched.rel, event.name);
    if (event.mask & IN.ISDIR) {
      if (event.mask & (IN.CREATE | IN.MOVED_TO)) {
        if (base.descend(rel)) await this.watchTree(watched.base, rel, true);
      } else if (event.mask & (IN.MOVED_FROM | IN.DELETE)) {
        this.removeSubtree(watched.base, rel);
        const label = base.gapLabel(rel);
        if (label !== null && base.descend(rel)) {
          this.sink.resolve(label);
          // A moved-away directory stands for its content, which raised no event of its own.
          // A removed one was empty: its content was reported as it was removed.
          if (event.mask & IN.MOVED_FROM) this.sink.change(label);
        }
      }
      // A directory's own attribute changes are not changes of a path of the scope.
      return;
    }
    const label = base.label(rel);
    if (label !== null) this.sink.change(label);
  }

  private interrupted(watched: Watched, detail: string): void {
    this.sink.gap('observation-interrupted', null, `${detail}: ${this.bases[watched.base]!.abs}`);
  }

  private forget(wd: number): void {
    const w = this.wds.get(wd);
    if (!w) return;
    this.wds.delete(wd);
    if (this.byPath[w.base]!.get(w.rel) === wd) this.byPath[w.base]!.delete(w.rel);
  }

  /** Removes the watches at and below `rel`; their queued events are then dropped. */
  private removeSubtree(base: number, rel: string): void {
    const map = this.byPath[base]!;
    for (const [path, wd] of [...map]) {
      if (!isAtOrBelow(path, rel)) continue;
      map.delete(path);
      this.wds.delete(wd);
      this.libc!.rmWatch(this.fd, wd);
    }
  }

  /**
   * Watches the directory at `rel` and every directory below it that the base descends into:
   * each directory is watched, then listed. With `report`, every non-directory entry the
   * listing finds is reported as created (a directory that appeared during observation).
   */
  private async watchTree(baseIndex: number, rel: string, report: boolean): Promise<void> {
    const base = this.bases[baseIndex]!;
    const lib = this.libc!;
    const pending = [rel];
    const concurrency = report ? 1 : (this.options.concurrency ?? 8);

    const one = async (dirRel: string): Promise<void> => {
      const abs = dirRel === '' ? base.abs : join(base.abs, ...dirRel.split('/'));
      const gap = base.gapLabel(dirRel);
      const type = lib.fsType(abs);
      const local = type === null ? undefined : LOCAL_ONLY_FILE_SYSTEMS.get(type);
      if (local !== undefined) {
        this.sink.gap('not-readable', gap, `file system ${local} notifies local changes only`);
        return;
      }
      // A root given through a symbolic link is followed; links below it are not.
      const mask = dirRel === '' ? WATCH_MASK & ~IN.DONT_FOLLOW : WATCH_MASK;
      const wd = lib.addWatch(this.fd, abs, mask);
      if (wd < 0) {
        const code = lib.errnoName();
        const cause = causeOfWatchError(code);
        if (cause === null) {
          // Gone before it could be watched. A root that is gone ends the observation.
          if (dirRel === '') this.sink.gap('observation-interrupted', null, `${abs}: ${code}`);
          return;
        }
        this.sink.gap(cause, gap, `inotify_add_watch: ${code}`);
        return;
      }
      this.wds.set(wd, { base: baseIndex, rel: dirRel });
      this.byPath[baseIndex]!.set(dirRel, wd);

      let entries: Dirent[];
      try {
        entries = await readdir(abs, { withFileTypes: true });
      } catch (error) {
        const code = (error as NodeJS.ErrnoException).code;
        const cause = causeOfWatchError(code);
        if (cause !== null) this.sink.gap(cause, gap, `readdir: ${code}`);
        return;
      }
      for (const entry of entries) {
        const childRel = joinRel(dirRel, entry.name);
        if (entry.isDirectory()) {
          if (!base.descend(childRel)) continue;
          if (entry.name.includes('�')) {
            // A name that is not valid UTF-8 cannot be passed back to inotify_add_watch.
            this.sink.gap('not-readable', base.gapLabel(childRel), 'name is not valid UTF-8');
            continue;
          }
          pending.push(childRel);
        } else if (report) {
          const label = base.label(childRel);
          if (label !== null) this.sink.change(label);
        }
      }
    };

    const worker = async () => {
      for (;;) {
        if (this.closed) return;
        const next = pending.pop();
        if (next === undefined) return;
        await one(next);
      }
    };
    // Workers that find the stack empty end; the last one still listing refills it, so the walk
    // runs until every worker has ended with an empty stack.
    while (pending.length > 0 && !this.closed) {
      await Promise.all(Array.from({ length: concurrency }, worker));
    }
  }
}

/** The backend factory for Linux: one inotify instance per part. */
export function linuxBackendFactory(options: InotifyOptions = {}): BackendFactory {
  return (part: ObservedPart, scope: ObserverScope, sink: BackendSink) =>
    new InotifyBackend(
      part === 'working-tree' ? [workingTreeBase(scope)] : repositoryBases(scope),
      sink,
      options,
    );
}
