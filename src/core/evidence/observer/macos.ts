import { createRequire } from 'node:module';
import { mkdtempSync, realpathSync, rmSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { lstat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, sep } from 'node:path';
import type { ObservedPart } from './causes.js';
import {
  repositoryBases,
  workingTreeBase,
  type BackendFactory,
  type BackendSink,
  type ObserverScope,
  type PartBackend,
  type WatchBase,
} from './observer.js';
import { absOf, SerialQueue, walkTree } from './walk.js';

/**
 * The FSEvents observer (C001-ADR-006 §9, macOS column): one FSEvents stream per part over its
 * watch bases (the working-tree root; the git directory and the common git directory), with
 * file-level events (`kFSEventStreamCreateFlagFileEvents`), no deferral of the first event
 * (`NoDefer`) and root watching (`WatchRoot`, without which `RootChanged` is never sent).
 *
 * Driving FSEvents from Node.js: the stream is scheduled on the run loop of the Node.js main
 * thread (`FSEventStreamScheduleWithRunLoop` on `CFRunLoopGetCurrent()`), which libuv never runs.
 * The backend runs it itself without waiting (`CFRunLoopRunInMode(mode, 0, true)`): on a timer
 * between runs and on each drain. FSEvents then calls the callback on the main thread, inside that
 * call, so no second thread and no cross-thread callback is involved (a dispatch queue would call
 * the koffi callback from a GCD thread, which koffi relays to the event loop; a blocking flush on
 * the main thread would then deadlock).
 *
 * Startup barrier: the stream starts from the event ID current just before it is created, not
 * from "now", so FSEvents replays from its event store whatever happened while the stream was
 * being registered; the start waits for `HistoryDone`. Changes made right after the observer
 * started are therefore delivered, which `fs.watch` (stream from "now") does not guarantee.
 *
 * Drain (the marker barrier): each stream also watches a private marker directory of its own (in
 * the temporary directory). A drain writes and removes a marker file there, asks FSEvents to flush
 * (`FSEventStreamFlushAsync`) and runs the run loop until the marker's event has been delivered.
 * FSEvents assigns event IDs in the order the file system reports changes and delivers a stream's
 * events in that order, so every change made before the marker has been delivered by then. The ID
 * `FSEventStreamFlushAsync` returns is no barrier: it only covers events fseventsd has already
 * queued for the client, not changes still on their way from the kernel (the first version of
 * this backend waited for it and ended most drains before the run's events arrived).
 * `FSEventStreamFlushSync` is not used: it blocks until delivery, which here needs the very run
 * loop the blocked thread would have to run. A marker that cannot be written, or is not delivered
 * while nothing else is within the drain timeout, means FSEvents "stops delivering events before
 * the command ends": events lost for the whole part.
 *
 * Causes:
 * - not readable: a directory that cannot be listed (at start, or created during observation), a
 *   volume of type smbfs, nfs, afpfs, webdav or a FUSE file system (`statfs` f_fstypename);
 * - watch limit: never raised (FSEvents has no per-watch limit);
 * - events lost: `MustScanSubDirs` (also with `UserDropped` or `KernelDropped`) for the named
 *   subtree as the top-most path, the whole part when it is a root or outside the bases;
 *   `UserDropped` or `KernelDropped` alone, and an event without item flags, for the whole part
 *   or the named directory; a drain whose marker is not delivered;
 * - observation interrupted: `RootChanged`, a stream that cannot be created or started, a history
 *   replay that does not complete, an observer failure.
 *
 * The calls go through koffi (MIT, docs/compliance/licence-and-version-report.md N-01, N-02).
 */

/** FSEventStreamEventFlags (FSEvents.h). */
export const FSE = {
  MustScanSubDirs: 0x1,
  UserDropped: 0x2,
  KernelDropped: 0x4,
  EventIdsWrapped: 0x8,
  HistoryDone: 0x10,
  RootChanged: 0x20,
  Mount: 0x40,
  Unmount: 0x80,
  ItemCreated: 0x100,
  ItemRemoved: 0x200,
  ItemInodeMetaMod: 0x400,
  ItemRenamed: 0x800,
  ItemModified: 0x1000,
  ItemFinderInfoMod: 0x2000,
  ItemChangeOwner: 0x4000,
  ItemXattrMod: 0x8000,
  ItemIsFile: 0x10000,
  ItemIsDir: 0x20000,
  ItemIsSymlink: 0x40000,
  OwnEvent: 0x80000,
  ItemIsHardlink: 0x100000,
  ItemIsLastHardlink: 0x200000,
  ItemCloned: 0x400000,
} as const;

/** FSEventStreamCreateFlags (FSEvents.h). */
export const FSE_CREATE = {
  NoDefer: 0x2,
  WatchRoot: 0x4,
  FileEvents: 0x10,
} as const;

export const CREATE_FLAGS = FSE_CREATE.FileEvents | FSE_CREATE.NoDefer | FSE_CREATE.WatchRoot;

const ITEM_CHANGE =
  FSE.ItemCreated |
  FSE.ItemRemoved |
  FSE.ItemInodeMetaMod |
  FSE.ItemRenamed |
  FSE.ItemModified |
  FSE.ItemFinderInfoMod |
  FSE.ItemChangeOwner |
  FSE.ItemXattrMod |
  FSE.ItemCloned;

/** One event as the stream's callback receives it. */
export interface RawFsEvent {
  readonly path: string;
  readonly flags: number;
  readonly id: bigint;
}

/** What an event means for the observer (C001-ADR-006 §9, macOS column). */
export type FsEventKind =
  'observation-interrupted' | 'events-lost' | 'history-done' | 'mount' | 'item' | 'ignored';

/**
 * Classifies an event by its flags. A loss or an interruption wins over the item flags it may
 * carry. An event without any flag is a directory-level event (something changed below the path
 * without file-level detail): it cannot vouch for any file, so it counts as lost events.
 */
export function classifyFsEvent(flags: number): FsEventKind {
  if (flags & FSE.RootChanged) return 'observation-interrupted';
  if (flags & (FSE.MustScanSubDirs | FSE.UserDropped | FSE.KernelDropped)) return 'events-lost';
  if (flags & FSE.HistoryDone) return 'history-done';
  if (flags & (FSE.Mount | FSE.Unmount)) return 'mount';
  if (flags & ITEM_CHANGE) return 'item';
  if (flags === 0) return 'events-lost';
  return 'ignored'; // EventIdsWrapped, OwnEvent and type flags without a change
}

/** Whether a loss can be placed at the event's path (`MustScanSubDirs`), or covers the part. */
export const lossIsPlaced = (flags: number): boolean =>
  (flags & FSE.MustScanSubDirs) !== 0 || flags === 0;

/** Volume types (f_fstypename) that notify local changes only, or none (C001-ADR-006 §9). */
export const LOCAL_ONLY_VOLUME_TYPES: ReadonlySet<string> = new Set([
  'smbfs',
  'nfs',
  'afpfs',
  'webdav',
  'macfuse',
  'osxfuse',
  'fusefs',
  'fuse',
]);

/** A started stream; replaced in tests. */
export interface FsEventsStream {
  /** Runs the run loop once without waiting: delivers the batches FSEvents has sent. */
  pump(): void;
  /**
   * The drain barrier: writes (and removes) a marker file in the stream's own directory, which
   * the stream also watches, then asks FSEvents to flush (`FSEventStreamFlushAsync`). Returns the
   * marker's path as FSEvents reports it, or the reason as an error when it cannot be written.
   * FSEvents delivers a stream's events in event-ID order, so once the marker's event has been
   * delivered, so has every event that happened before the marker was written.
   */
  mark(): { path: string } | { error: string };
  /** Whether an event path lies in the stream's own marker directory. */
  own(path: string): boolean;
  close(): void;
}

export interface FsEventsApi {
  /** `FSEventsGetCurrentEventId()`. */
  currentEventId(): bigint;
  /**
   * Creates a stream over `paths` from event `since`, schedules it on this thread's run loop and
   * starts it; the reason as text when FSEvents refuses.
   */
  open(
    paths: readonly string[],
    since: bigint,
    latency: number,
    flags: number,
    deliver: (events: readonly RawFsEvent[]) => void,
  ): FsEventsStream | string;
  /** The volume type of a path (`statfs` f_fstypename), or null when it cannot be read. */
  fsTypeName(path: string): string | null;
}

let fsevents: FsEventsApi | null = null;

/** Binds CoreFoundation, CoreServices and libc through koffi on first use. Throws when it cannot. */
export function loadFsEvents(): FsEventsApi {
  if (fsevents) return fsevents;
  const require = createRequire(import.meta.url);
  const koffi = require('koffi') as typeof import('koffi');
  const cf = koffi.load('/System/Library/Frameworks/CoreFoundation.framework/CoreFoundation');
  const cs = koffi.load('/System/Library/Frameworks/CoreServices.framework/CoreServices');
  const libc = koffi.load('/usr/lib/libSystem.B.dylib');

  const CFStringCreateWithCString = cf.func(
    'void *CFStringCreateWithCString(void *alloc, const char *str, uint32_t encoding)',
  );
  const CFArrayCreate = cf.func(
    'void *CFArrayCreate(void *alloc, void *values, intptr_t count, void *callbacks)',
  );
  const CFRelease = cf.func('void CFRelease(void *ref)');
  const CFRunLoopGetCurrent = cf.func('void *CFRunLoopGetCurrent()');
  const CFRunLoopRunInMode = cf.func(
    'int32_t CFRunLoopRunInMode(void *mode, double seconds, uint8_t returnAfterSourceHandled)',
  );
  const typeArrayCallBacks = cf.symbol('kCFTypeArrayCallBacks');
  const defaultMode = koffi.decode(cf.symbol('kCFRunLoopDefaultMode'), 'void *') as bigint;

  const Callback = koffi.proto(
    'void SddrFSEventStreamCallback(void *stream, void *info, size_t count, void *paths, void *flags, void *ids)',
  );
  const FSEventsGetCurrentEventId = cs.func('uint64_t FSEventsGetCurrentEventId()');
  const FSEventStreamCreate = cs.func(
    'void *FSEventStreamCreate(void *alloc, void *callback, void *context, void *paths, uint64_t since, double latency, uint32_t flags)',
  );
  const FSEventStreamScheduleWithRunLoop = cs.func(
    'void FSEventStreamScheduleWithRunLoop(void *stream, void *runLoop, void *mode)',
  );
  const FSEventStreamUnscheduleFromRunLoop = cs.func(
    'void FSEventStreamUnscheduleFromRunLoop(void *stream, void *runLoop, void *mode)',
  );
  const FSEventStreamStart = cs.func('uint8_t FSEventStreamStart(void *stream)');
  const FSEventStreamFlushAsync = cs.func('uint64_t FSEventStreamFlushAsync(void *stream)');
  const FSEventStreamStop = cs.func('void FSEventStreamStop(void *stream)');
  const FSEventStreamInvalidate = cs.func('void FSEventStreamInvalidate(void *stream)');
  const FSEventStreamRelease = cs.func('void FSEventStreamRelease(void *stream)');

  // struct statfs with 64-bit inodes: `statfs$INODE64` on x86-64, `statfs` on arm64;
  // f_fstypename (char[16]) at offset 72 of 2168 bytes.
  const statfs = libc.func(process.arch === 'x64' ? 'statfs$INODE64' : 'statfs', 'int', [
    'const char *',
    'void *',
  ]);
  const statBuf = Buffer.alloc(2168);

  const kCFStringEncodingUTF8 = 0x08000100;

  fsevents = {
    currentEventId: () => BigInt(FSEventsGetCurrentEventId() as number | bigint),
    open(watched, since, latency, flags, deliver) {
      // The stream's own marker directory, watched with the bases (see `mark`).
      let markerDir: string;
      try {
        markerDir = realpathSync.native(mkdtempSync(join(tmpdir(), 'sddr-fsevents-')));
      } catch (error) {
        return `cannot create the marker directory: ${(error as Error).message}`;
      }
      const removeMarkerDir = () => rmSync(markerDir, { recursive: true, force: true });
      const paths = [...watched, markerDir];
      const strings = paths.map(
        (p) => CFStringCreateWithCString(null, p, kCFStringEncodingUTF8) as bigint | null,
      );
      const releaseStrings = () => {
        for (const s of strings) if (s) CFRelease(s);
      };
      if (strings.some((s) => !s)) {
        releaseStrings();
        removeMarkerDir();
        return 'CFStringCreateWithCString failed';
      }
      const values = koffi.alloc('void *', paths.length);
      koffi.encode(values, koffi.array('void *', paths.length), strings);
      const array = CFArrayCreate(null, values, paths.length, typeArrayCallBacks) as bigint | null;
      // The array retains the strings (kCFTypeArrayCallBacks).
      releaseStrings();
      koffi.free(values);
      if (!array) {
        removeMarkerDir();
        return 'CFArrayCreate failed';
      }

      const callback = koffi.register(
        (
          _s: unknown,
          _i: unknown,
          count: number | bigint,
          pathsPtr: bigint,
          flagsPtr: bigint,
          idsPtr: bigint,
        ) => {
          const n = Number(count);
          const events: RawFsEvent[] = [];
          for (let i = 0; i < n; i++) {
            events.push({
              path: koffi.decode(pathsPtr, i * 8, 'const char *') as string,
              flags: koffi.decode(flagsPtr, i * 4, 'uint32_t') as number,
              id: BigInt(koffi.decode(idsPtr, i * 8, 'uint64_t') as number | bigint),
            });
          }
          // Called on this thread inside CFRunLoopRunInMode: only collect, never throw.
          try {
            deliver(events);
          } catch {
            /* the backend handles the events after the run loop returns */
          }
        },
        koffi.pointer(Callback),
      );
      const stream = FSEventStreamCreate(null, callback, null, array, since, latency, flags) as
        bigint | null;
      CFRelease(array);
      if (!stream) {
        koffi.unregister(callback);
        removeMarkerDir();
        return 'FSEventStreamCreate failed';
      }
      const runLoop = CFRunLoopGetCurrent() as bigint;
      FSEventStreamScheduleWithRunLoop(stream, runLoop, defaultMode);
      if (!FSEventStreamStart(stream)) {
        FSEventStreamUnscheduleFromRunLoop(stream, runLoop, defaultMode);
        FSEventStreamInvalidate(stream);
        FSEventStreamRelease(stream);
        koffi.unregister(callback);
        removeMarkerDir();
        return 'FSEventStreamStart failed';
      }
      let closed = false;
      let markers = 0;
      const markerPrefix = `${markerDir}${sep}`;
      return {
        pump() {
          if (closed) return;
          // Each call handles at most one source; loop while one was handled (1 = finished,
          // 3 = timed out, 4 = handled a source).
          for (let i = 0; i < 64; i++) {
            if ((CFRunLoopRunInMode(defaultMode, 0, 1) as number) !== 4) break;
          }
        },
        mark() {
          if (closed) return { error: 'stream closed' };
          const path = join(markerDir, `m${++markers}`);
          try {
            writeFileSync(path, '');
            unlinkSync(path);
          } catch (error) {
            return { error: `cannot write the marker ${path}: ${(error as Error).message}` };
          }
          FSEventStreamFlushAsync(stream);
          return { path };
        },
        own(path) {
          return path === markerDir || path.startsWith(markerPrefix);
        },
        close() {
          if (closed) return;
          closed = true;
          FSEventStreamStop(stream);
          FSEventStreamInvalidate(stream);
          FSEventStreamRelease(stream);
          koffi.unregister(callback);
          removeMarkerDir();
        },
      };
    },
    fsTypeName(path) {
      if ((statfs(path, statBuf) as number) !== 0) return null;
      const end = statBuf.indexOf(0, 72);
      return statBuf.toString('utf8', 72, end < 0 || end > 88 ? 88 : end);
    },
  };
  return fsevents;
}

export interface MacosOptions {
  readonly api?: FsEventsApi;
  /** How often the run loop is run between drains; default 100 ms. */
  readonly pollMs?: number;
  /** FSEvents latency in seconds; default 0.05. */
  readonly latency?: number;
  /** How long a drain waits for the marker without any event delivered; default 5,000 ms. */
  readonly drainTimeoutMs?: number;
  /** How long the start waits for `HistoryDone`; default 5,000 ms. */
  readonly startTimeoutMs?: number;
}

interface BaseState {
  readonly base: WatchBase;
  /** The canonical path FSEvents reports events under (`/private/var/...` for `/var/...`). */
  real: string | null;
  /** Device and inode of the root at start: a root moved or removed no longer matches. */
  identity: string | null;
  /** The root no longer is where it was: reported once. */
  moved: boolean;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Device and inode of a path, or null when it cannot be read. */
function identityOf(path: string): string | null {
  try {
    const st = statSync(path, { bigint: true });
    return `${st.dev}:${st.ino}`;
  } catch {
    return null;
  }
}

/** `path` is `dir` or lies below it (case-insensitive as a fallback, as in `locate`). */
function atOrBelow(path: string, dir: string): boolean {
  for (const [p, d] of [
    [path, dir],
    [path.toLowerCase(), dir.toLowerCase()],
  ] as const) {
    if (p === d || p.startsWith(d.endsWith(sep) ? d : `${d}${sep}`)) return true;
  }
  return false;
}

/**
 * The started backends of this process. A directory moved or removed is reported by the stream
 * that watches its parent, which is not always the stream of the base below it: the git directory
 * inside the working tree moves with the working-tree root, which only the working-tree stream
 * sees. Every backend with a base at or below a moved directory is told.
 */
const liveBackends = new Set<MacosBackend>();

/** The FSEvents backend of one part, over one or more watch bases. */
export class MacosBackend implements PartBackend {
  private readonly api: FsEventsApi | null;
  private readonly loadError: unknown;
  private readonly states: BaseState[];
  private readonly queue: SerialQueue;
  private stream: FsEventsStream | null = null;
  private readonly delivered: RawFsEvent[] = [];
  /** The marker the current drain waits for, and whether it has been delivered. */
  private marker: string | null = null;
  private markerSeen = false;
  private historyDone = false;
  private timer: NodeJS.Timeout | null = null;
  private closed = false;

  constructor(
    bases: readonly WatchBase[],
    private readonly sink: BackendSink,
    private readonly options: MacosOptions = {},
  ) {
    let api: FsEventsApi | null = null;
    let loadError: unknown = null;
    try {
      api = options.api ?? loadFsEvents();
    } catch (error) {
      loadError = error;
    }
    this.api = api;
    this.loadError = loadError;
    this.states = bases.map((base) => ({ base, real: null, identity: null, moved: false }));
    this.queue = new SerialQueue(sink, () => this.closed);
  }

  async start(): Promise<void> {
    const api = this.api;
    if (!api) {
      this.sink.gap(
        'observation-interrupted',
        null,
        `FSEvents unavailable: ${String((this.loadError as Error)?.message ?? this.loadError)}`,
      );
      return;
    }
    for (const state of this.states) {
      try {
        state.real = realpathSync.native(state.base.abs);
        state.identity = identityOf(state.real);
      } catch (error) {
        const code = (error as NodeJS.ErrnoException).code;
        this.sink.gap(
          code === 'ENOENT' || code === 'ENOTDIR' ? 'observation-interrupted' : 'not-readable',
          null,
          `${state.base.abs}: ${code}`,
        );
      }
    }
    const live = this.states.filter((s) => s.real !== null);
    if (live.length === 0) return;
    const since = api.currentEventId();
    const stream = api.open(
      live.map((s) => s.real!),
      since,
      this.options.latency ?? 0.05,
      CREATE_FLAGS,
      (events) => this.delivered.push(...events),
    );
    if (typeof stream === 'string') {
      this.sink.gap('observation-interrupted', null, stream);
      return;
    }
    this.stream = stream;
    liveBackends.add(this);
    await this.queue.enqueue(async () => {
      // The startup barrier: the replay from `since` ends with HistoryDone.
      const deadline = Date.now() + (this.options.startTimeoutMs ?? 5000);
      while (!this.historyDone && !this.closed) {
        stream.pump();
        await this.handleDelivered();
        if (this.historyDone) break;
        if (Date.now() > deadline) {
          this.sink.gap(
            'observation-interrupted',
            null,
            'FSEvents did not complete the replay since the start (no HistoryDone)',
          );
          break;
        }
        await sleep(5);
      }
      for (const state of live) {
        await walkTree(state.base, '', this.sink, {
          report: false,
          localOnly: (abs) => this.localOnly(abs),
          stopped: () => this.closed,
        });
      }
    });
    if (this.closed) return;
    this.timer = setInterval(() => {
      if (!this.queue.busy) {
        void this.queue.enqueue(async () => {
          this.stream?.pump();
          await this.handleDelivered();
        });
      }
    }, this.options.pollMs ?? 100);
    this.timer.unref();
  }

  drain(): Promise<void> {
    if (this.closed || !this.stream) return Promise.resolve();
    return this.queue.enqueue(() => this.drainStream());
  }

  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    liveBackends.delete(this);
    if (this.timer) clearInterval(this.timer);
    await this.queue.idle();
    this.stream?.close();
    this.stream = null;
  }

  // -------------------------------------------------------------------------------------------

  private localOnly(abs: string): string | null {
    const type = this.api?.fsTypeName(abs) ?? null;
    return type !== null && LOCAL_ONLY_VOLUME_TYPES.has(type) ? type : null;
  }

  /**
   * The drain barrier: writes a marker in the stream's own directory and runs the run loop until
   * the marker's event has been delivered; every event before it has been delivered by then. A
   * marker that cannot be written, or is not delivered while nothing else is (within the drain
   * timeout), is "events lost" for the whole part: the drain never ends clean on a guess.
   */
  private async drainStream(): Promise<void> {
    const stream = this.stream;
    if (!stream) return;
    const marked = stream.mark();
    if ('error' in marked) {
      this.sink.gap('events-lost', null, `FSEvents drain barrier failed: ${marked.error}`);
    } else {
      this.marker = marked.path;
      this.markerSeen = false;
      const timeout = this.options.drainTimeoutMs ?? 5000;
      let deadline = Date.now() + timeout;
      for (;;) {
        stream.pump();
        const progressed = this.delivered.length > 0;
        await this.handleDelivered();
        if (this.markerSeen || this.closed) break;
        if (progressed) deadline = Date.now() + timeout;
        else if (Date.now() > deadline) {
          this.sink.gap(
            'events-lost',
            null,
            `FSEvents stopped delivering events: the drain marker ${marked.path} was not delivered`,
          );
          break;
        }
        await sleep(1);
      }
      this.marker = null;
    }
    // Events without an event ID (RootChanged, Mount, Unmount) are not ordered with the marker:
    // the run loop gets one more turn for them, and each root is checked where it was.
    await sleep(2);
    stream.pump();
    await this.handleDelivered();
    this.checkRoots();
  }

  /**
   * A directory at `path` was moved (renamed away or back) or removed: each base at or below it
   * was not where it was watched for a while, which FSEvents does not always report with
   * `RootChanged` (a root renamed and renamed back is reported only as a rename of the root).
   */
  private rootMoved(path: string, detail: string): void {
    for (const state of this.states) {
      if (state.real === null || state.moved || !atOrBelow(state.real, path)) continue;
      state.moved = true;
      this.sink.gap('observation-interrupted', null, `the root ${state.real} was moved: ${detail}`);
    }
  }

  /** A root that is no longer the directory watched from the start interrupts the observation. */
  private checkRoots(): void {
    for (const state of this.states) {
      if (state.real === null || state.identity === null || state.moved) continue;
      if (identityOf(state.real) !== state.identity) {
        state.moved = true;
        this.sink.gap(
          'observation-interrupted',
          null,
          `the root ${state.real} was moved or removed`,
        );
      }
    }
  }

  /**
   * The base an event path lies in, and its path relative to it with `/` separators ('' for the
   * base itself). FSEvents paths use `/`, the separator of macOS (`sep`).
   */
  private locate(path: string): { state: BaseState; rel: string } | null {
    let p = path;
    while (p.length > 1 && p.endsWith(sep)) p = p.slice(0, -1);
    let best: { state: BaseState; rel: string } | null = null;
    let bestLength = -1;
    for (const caseless of [false, true]) {
      const cmp = caseless ? p.toLowerCase() : p;
      for (const state of this.states) {
        if (state.real === null) continue;
        const real = caseless ? state.real.toLowerCase() : state.real;
        if (real.length <= bestLength) continue;
        if (cmp === real) best = { state, rel: '' };
        else if (cmp.startsWith(`${real}${sep}`)) {
          best = {
            state,
            rel: p
              .slice(real.length + 1)
              .split(sep)
              .join('/'),
          };
        } else continue;
        bestLength = real.length;
      }
      // Case only matters on a case-sensitive volume; a case-insensitive match is the fallback.
      if (best) return best;
    }
    return null;
  }

  private async handleDelivered(): Promise<void> {
    while (this.delivered.length > 0) {
      const event = this.delivered.shift()!;
      if (this.stream?.own(event.path)) {
        // The marker directory: a marker's event is the barrier; a loss there may cover any path.
        if (event.path === this.marker) this.markerSeen = true;
        const kind = classifyFsEvent(event.flags);
        if (kind !== 'events-lost' && kind !== 'observation-interrupted') continue;
      }
      await this.handle(event);
    }
  }

  private async handle(event: RawFsEvent): Promise<void> {
    const kind = classifyFsEvent(event.flags);
    const flagText = `flags 0x${event.flags.toString(16)}`;
    switch (kind) {
      case 'history-done':
        this.historyDone = true;
        return;
      case 'ignored':
        return;
      case 'observation-interrupted':
        this.sink.gap(
          'observation-interrupted',
          null,
          `FSEvents RootChanged (${flagText}): ${event.path}`,
        );
        return;
      case 'events-lost': {
        const at = lossIsPlaced(event.flags) ? this.locate(event.path) : null;
        const label = at === null || at.rel === '' ? null : at.state.base.gapLabel(at.rel);
        if (at !== null && at.rel !== '' && label !== null && !at.state.base.descend(at.rel)) {
          return; // a subtree outside the observed scope (for example .git/objects)
        }
        this.sink.gap('events-lost', label, `FSEvents ${flagText}: ${event.path}`);
        return;
      }
      default:
        break;
    }
    if (event.flags & FSE.ItemIsDir && event.flags & (FSE.ItemRenamed | FSE.ItemRemoved)) {
      let p = event.path;
      while (p.length > 1 && p.endsWith(sep)) p = p.slice(0, -1);
      for (const backend of liveBackends) {
        if (!backend.closed) backend.rootMoved(p, `FSEvents ${flagText}: ${event.path}`);
      }
    }
    const at = this.locate(event.path);
    if (at === null || at.rel === '') return;
    const { state, rel } = at;
    const base = state.base;
    if (kind === 'mount') {
      // A volume mounted or unmounted below the root: the directory shows other content.
      if (!base.descend(rel)) return;
      const label = base.gapLabel(rel);
      if (label !== null) this.sink.change(label);
      if (event.flags & FSE.Mount) {
        await walkTree(base, rel, this.sink, {
          report: false,
          localOnly: (abs) => this.localOnly(abs),
          stopped: () => this.closed,
        });
      }
      return;
    }
    if (event.flags & FSE.ItemIsDir) {
      if (!base.descend(rel)) return;
      const st = await lstat(absOf(base, rel)).catch(() => null);
      if (st?.isDirectory()) {
        // Created or moved in: what is in it raised no event of its own when it was moved.
        if (event.flags & (FSE.ItemCreated | FSE.ItemRenamed)) {
          await walkTree(base, rel, this.sink, {
            report: true,
            localOnly: (abs) => this.localOnly(abs),
            stopped: () => this.closed,
          });
        }
        return; // a directory's own metadata is not a change of a path
      }
      if (event.flags & (FSE.ItemRemoved | FSE.ItemRenamed)) {
        const label = base.gapLabel(rel);
        if (label === null) return;
        this.sink.resolve(label);
        // A moved-away directory stands for its content, which raised no event of its own.
        if (event.flags & FSE.ItemRenamed) this.sink.change(label);
      }
      return;
    }
    const label = base.label(rel);
    if (label !== null) this.sink.change(label);
  }
}

/** The backend factory for macOS: one FSEvents stream per part. */
export function macosBackendFactory(options: MacosOptions = {}): BackendFactory {
  return (part: ObservedPart, scope: ObserverScope, sink: BackendSink) =>
    new MacosBackend(
      part === 'working-tree' ? [workingTreeBase(scope)] : repositoryBases(scope),
      sink,
      options,
    );
}
