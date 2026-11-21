import { createRequire } from 'node:module';
import { realpathSync } from 'node:fs';
import { lstat } from 'node:fs/promises';
import { basename, dirname } from 'node:path';
import type { IncompleteCause, ObservedPart } from './causes.js';
import {
  relativeBelow,
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
 * The ReadDirectoryChangesW observer (C001-ADR-006 §9, Windows 11 column): one directory handle
 * with subtree notification per watch base (the working-tree root; the git directory and the
 * common git directory, also when they lie outside the root), a 64 KiB buffer, overlapped reads
 * polled without blocking: on a timer between runs, and until no read returns data on each drain.
 *
 * Causes:
 * - not readable: the root handle cannot be opened, the first read is rejected by the file system,
 *   the root lies on a `\\wsl$` share, or a directory below it cannot be listed;
 * - watch limit: never raised (one handle per root);
 * - events lost: a completion with zero bytes (the buffer overflowed) or `ERROR_NOTIFY_ENUM_DIR`,
 *   for the whole part of that handle;
 * - observation interrupted: a read fails after a root is moved or removed, the root is renamed or
 *   removed in its parent (watched without subtree for the directory names, because a handle
 *   follows its directory and reports nothing when the directory itself is renamed), or the
 *   handle's final path no longer is the root at a drain.
 *
 * The calls go through koffi (MIT, docs/compliance/licence-and-version-report.md N-01, N-02).
 */

export const FILE_ACTION = {
  ADDED: 1,
  REMOVED: 2,
  MODIFIED: 3,
  RENAMED_OLD_NAME: 4,
  RENAMED_NEW_NAME: 5,
} as const;

export const WIN32_ERROR = {
  INVALID_FUNCTION: 1,
  FILE_NOT_FOUND: 2,
  PATH_NOT_FOUND: 3,
  ACCESS_DENIED: 5,
  NOT_SUPPORTED: 50,
  INVALID_PARAMETER: 87,
  DIRECTORY: 267,
  NOTIFY_CLEANUP: 745,
  OPERATION_ABORTED: 995,
  IO_INCOMPLETE: 996,
  NOTIFY_ENUM_DIR: 1022,
} as const;

const FILE_NOTIFY_CHANGE = {
  FILE_NAME: 0x1,
  DIR_NAME: 0x2,
  ATTRIBUTES: 0x4,
  SIZE: 0x8,
  LAST_WRITE: 0x10,
  CREATION: 0x40,
  SECURITY: 0x100,
} as const;

/** What the subtree handle of a root reports; reads (last access) are left out. */
export const NOTIFY_FILTER =
  FILE_NOTIFY_CHANGE.FILE_NAME |
  FILE_NOTIFY_CHANGE.DIR_NAME |
  FILE_NOTIFY_CHANGE.ATTRIBUTES |
  FILE_NOTIFY_CHANGE.SIZE |
  FILE_NOTIFY_CHANGE.LAST_WRITE |
  FILE_NOTIFY_CHANGE.CREATION |
  FILE_NOTIFY_CHANGE.SECURITY;

/** What the handle on a root's parent reports: directory names only, without subtree. */
export const PARENT_FILTER = FILE_NOTIFY_CHANGE.DIR_NAME;

/** The buffer of each handle (C001-ADR-006 §9: 64 KiB, also the limit of network shares). */
export const BUFFER_SIZE = 64 * 1024;

export interface NotifyRecord {
  readonly action: number;
  /** The name relative to the watched directory, with `\` separators. */
  readonly name: string;
}

/** Parses `FILE_NOTIFY_INFORMATION` records. */
export function parseNotifyRecords(buf: Buffer, length: number): NotifyRecord[] {
  const out: NotifyRecord[] = [];
  let off = 0;
  while (off + 12 <= length) {
    const next = buf.readUInt32LE(off);
    const action = buf.readUInt32LE(off + 4);
    const nameLength = buf.readUInt32LE(off + 8);
    const end = Math.min(off + 12 + nameLength, length);
    out.push({ action, name: buf.toString('utf16le', off + 12, end) });
    if (next === 0) break;
    off += next;
  }
  return out;
}

/** What a completed read means (C001-ADR-006 §9, Windows column). */
export type CompletionKind = 'records' | 'events-lost' | 'interrupted' | 'closed';

/**
 * Classifies a completed read by its error code and byte count: zero bytes without an error is
 * a buffer overflow and `ERROR_NOTIFY_ENUM_DIR` the same loss, both "events lost"; a cancelled
 * read or a closed handle ends quietly; any other error is a handle error, "observation
 * interrupted".
 */
export function classifyCompletion(error: number, bytes: number): CompletionKind {
  if (error === 0) return bytes === 0 ? 'events-lost' : 'records';
  if (error === WIN32_ERROR.NOTIFY_ENUM_DIR) return 'events-lost';
  if (error === WIN32_ERROR.OPERATION_ABORTED || error === WIN32_ERROR.NOTIFY_CLEANUP) {
    return 'closed';
  }
  return 'interrupted';
}

/**
 * The cause for a root handle that cannot be opened: null when the root is gone (the observation
 * is then interrupted), else "not readable" (C001-ADR-006 §9: a root handle that cannot be
 * opened counts as not readable, never as a watch limit).
 */
export function causeOfOpenError(code: number): IncompleteCause | null {
  if (
    code === WIN32_ERROR.FILE_NOT_FOUND ||
    code === WIN32_ERROR.PATH_NOT_FOUND ||
    code === WIN32_ERROR.DIRECTORY
  ) {
    return null;
  }
  return 'not-readable';
}

/** The cause when a read cannot be issued: the first one is rejected by the file system. */
export function causeOfIssueError(first: boolean): IncompleteCause {
  return first ? 'not-readable' : 'observation-interrupted';
}

/** A path on a WSL share, which raises no change notification for changes made on Linux. */
export function isWslShare(path: string): boolean {
  return /^\\\\(\?\\UNC\\)?(wsl\$|wsl\.localhost)\\/i.test(path);
}

/** A path as compared with the final path of a handle: no `\\?\` prefix, no case. */
export function comparablePath(path: string): string {
  let p = path;
  if (/^\\\\\?\\UNC\\/i.test(p)) p = `\\\\${p.slice(8)}`;
  else if (p.startsWith('\\\\?\\')) p = p.slice(4);
  return p.replace(/[\\/]+$/, '').toLowerCase();
}

/** One directory handle with an overlapped read; replaced in tests. */
export interface Win32Watch {
  /** Issues the next read; 0, or the Win32 error code when it cannot be issued. */
  issue(): number;
  /** Without blocking: null while the read is pending, else its error code and data. */
  poll(): { readonly error: number; readonly data: Buffer } | null;
  /** The handle's final path (`GetFinalPathNameByHandleW`), or null when it cannot be read. */
  finalPath(): string | null;
  close(): void;
}

export interface Win32Api {
  /** Opens a directory for change notification; the Win32 error code on failure. */
  open(path: string, subtree: boolean, filter: number): Win32Watch | number;
}

let win32: Win32Api | null = null;

/** Binds kernel32 through koffi on first use. Throws when it cannot be loaded. */
export function loadWin32(): Win32Api {
  if (win32) return win32;
  const require = createRequire(import.meta.url);
  const koffi = require('koffi') as typeof import('koffi');
  const k32 = koffi.load('kernel32.dll');
  const CreateFileW = k32.func(
    'intptr_t __stdcall CreateFileW(const char16_t *name, uint32_t access, uint32_t share, void *sa, uint32_t disposition, uint32_t flags, intptr_t template)',
  );
  const ReadDirectoryChangesW = k32.func(
    'int __stdcall ReadDirectoryChangesW(intptr_t h, void *buf, uint32_t len, int subtree, uint32_t filter, void *returned, void *overlapped, void *routine)',
  );
  const GetOverlappedResult = k32.func(
    'int __stdcall GetOverlappedResult(intptr_t h, void *overlapped, _Out_ uint32_t *bytes, int wait)',
  );
  const GetLastError = k32.func('uint32_t __stdcall GetLastError()');
  const CancelIoEx = k32.func('int __stdcall CancelIoEx(intptr_t h, void *overlapped)');
  const CloseHandle = k32.func('int __stdcall CloseHandle(intptr_t h)');
  const GetFinalPathNameByHandleW = k32.func(
    'uint32_t __stdcall GetFinalPathNameByHandleW(intptr_t h, _Out_ char16_t *buf, uint32_t size, uint32_t flags)',
  );
  const FILE_LIST_DIRECTORY = 0x1;
  const SHARE_ALL = 0x1 | 0x2 | 0x4; // read, write, delete: the developer may move or remove it
  const OPEN_EXISTING = 3;
  const FILE_FLAG_BACKUP_SEMANTICS = 0x02000000;
  const FILE_FLAG_OVERLAPPED = 0x40000000;
  const OVERLAPPED_SIZE = 32; // 64-bit: Internal, InternalHigh, Offset/Pointer, hEvent

  win32 = {
    open(path, subtree, filter) {
      const handle = Number(
        CreateFileW(
          path,
          FILE_LIST_DIRECTORY,
          SHARE_ALL,
          null,
          OPEN_EXISTING,
          FILE_FLAG_BACKUP_SEMANTICS | FILE_FLAG_OVERLAPPED,
          0,
        ),
      );
      if (handle === -1) return GetLastError() as number;
      // Native memory: the kernel writes into it after the call returns, so it must not move.
      const buf = koffi.alloc('uint8', BUFFER_SIZE);
      const ov = koffi.alloc('uint8', OVERLAPPED_SIZE);
      const ovView = new Uint8Array(koffi.view(ov, OVERLAPPED_SIZE));
      let pending = false;
      let closed = false;
      const nameBuf = new Uint16Array(1024);
      return {
        issue() {
          ovView.fill(0);
          const ok = ReadDirectoryChangesW(
            handle,
            buf,
            BUFFER_SIZE,
            subtree ? 1 : 0,
            filter,
            null,
            ov,
            null,
          );
          if (!ok) return GetLastError() as number;
          pending = true;
          return 0;
        },
        poll() {
          if (!pending) return null;
          const bytes = [0];
          const ok = GetOverlappedResult(handle, ov, bytes, 0);
          if (!ok) {
            const error = GetLastError() as number;
            if (error === WIN32_ERROR.IO_INCOMPLETE) return null;
            pending = false;
            return { error, data: Buffer.alloc(0) };
          }
          pending = false;
          const n = bytes[0]!;
          // Copied: the next read reuses the buffer while the records are still being handled.
          const data = Buffer.from(new Uint8Array(koffi.view(buf, BUFFER_SIZE), 0, n));
          return { error: 0, data };
        },
        finalPath() {
          const n = GetFinalPathNameByHandleW(handle, nameBuf, nameBuf.length, 0) as number;
          if (n === 0 || n >= nameBuf.length) return null;
          return Buffer.from(nameBuf.buffer, 0, n * 2).toString('utf16le');
        },
        close() {
          if (closed) return;
          closed = true;
          if (pending) {
            // The read must end before its memory is freed.
            CancelIoEx(handle, ov);
            GetOverlappedResult(handle, ov, [0], 1);
            pending = false;
          }
          CloseHandle(handle);
          koffi.free(buf);
          koffi.free(ov);
        },
      };
    },
  };
  return win32;
}

/**
 * A watch base with the directory its handle is opened on: the base itself, or the working-tree
 * root for a git directory below it (C001-ADR-006 §9: handles on the working-tree root and on git
 * directories outside it). A handle on a directory below the root would keep the developer from
 * renaming or removing the root while it is open.
 */
export interface HandleBase {
  readonly base: WatchBase;
  /** The directory the handle is opened on. */
  readonly handleDir: string;
  /** The base's path relative to `handleDir` with `/` separators; '' when they are the same. */
  readonly prefix: string;
}

/** Handle bases of a part: a git directory below the root is watched through the root. */
export function handleBases(part: ObservedPart, scope: ObserverScope): HandleBase[] {
  if (part === 'working-tree') {
    return [{ base: workingTreeBase(scope), handleDir: scope.root, prefix: '' }];
  }
  return repositoryBases(scope).map((base) => {
    const below = relativeBelow(scope.root, base.abs);
    return below === null
      ? { base, handleDir: base.abs, prefix: '' }
      : { base, handleDir: scope.root, prefix: below };
  });
}

interface BaseState {
  readonly base: WatchBase;
  readonly handleDir: string;
  readonly prefix: string;
  readonly name: string;
  expected: string | null;
  watch: Win32Watch | null;
  parent: Win32Watch | null;
  /** Directories known in this base (walked, created or moved in), relative paths. */
  readonly dirs: Set<string>;
  /** The handle no longer observes the root; its events are no longer handled. */
  dead: boolean;
}

export interface WindowsOptions {
  readonly api?: Win32Api;
  /** How often the handles are polled between drains; default 100 ms. */
  readonly pollMs?: number;
}

const errorText = (code: number) => `Win32 error ${code}`;

/** The ReadDirectoryChangesW backend of one part, over one or more watch bases. */
export class WindowsBackend implements PartBackend {
  private readonly api: Win32Api | null;
  private readonly loadError: unknown;
  private readonly states: BaseState[];
  private readonly queue: SerialQueue;
  private timer: NodeJS.Timeout | null = null;
  private closed = false;

  constructor(
    bases: readonly HandleBase[],
    private readonly sink: BackendSink,
    private readonly options: WindowsOptions = {},
  ) {
    let api: Win32Api | null = null;
    let loadError: unknown = null;
    try {
      api = options.api ?? loadWin32();
    } catch (error) {
      loadError = error;
    }
    this.api = api;
    this.loadError = loadError;
    this.states = bases.map(({ base, handleDir, prefix }) => ({
      base,
      handleDir,
      prefix,
      name: basename(handleDir),
      expected: null,
      watch: null,
      parent: null,
      dirs: new Set<string>(),
      dead: false,
    }));
    this.queue = new SerialQueue(sink, () => this.closed);
  }

  async start(): Promise<void> {
    if (!this.api) {
      this.sink.gap(
        'observation-interrupted',
        null,
        `ReadDirectoryChangesW unavailable: ${String((this.loadError as Error)?.message ?? this.loadError)}`,
      );
      return;
    }
    // Each handle's first read is issued before the walk: from then on every change is recorded,
    // so changes made while the walk lists the tree, or right after start, are not missed.
    for (const state of this.states) this.open(state, this.api);
    await this.queue.enqueue(async () => {
      for (const state of this.states) {
        if (state.dead) continue;
        await walkTree(state.base, '', this.sink, {
          report: false,
          onDirectory: (rel) => state.dirs.add(rel),
          stopped: () => this.closed,
        });
      }
    });
    if (this.closed) return;
    this.timer = setInterval(() => {
      if (!this.queue.busy) void this.queue.enqueue(() => this.pump());
    }, this.options.pollMs ?? 100);
    this.timer.unref();
  }

  drain(): Promise<void> {
    if (this.closed || !this.api) return Promise.resolve();
    return this.queue.enqueue(() => this.pump());
  }

  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    if (this.timer) clearInterval(this.timer);
    await this.queue.idle();
    for (const state of this.states) {
      state.watch?.close();
      state.parent?.close();
      state.watch = null;
      state.parent = null;
    }
  }

  // -------------------------------------------------------------------------------------------

  private open(state: BaseState, api: Win32Api): void {
    const abs = state.handleDir;
    if (isWslShare(abs)) {
      this.sink.gap('not-readable', null, `${abs}: a \\\\wsl$ share raises no change notification`);
      state.dead = true;
      return;
    }
    try {
      state.expected = realpathSync.native(abs);
    } catch {
      state.expected = null;
    }
    const watch = api.open(abs, true, NOTIFY_FILTER);
    if (typeof watch === 'number') {
      const cause = causeOfOpenError(watch);
      this.sink.gap(
        cause ?? 'observation-interrupted',
        null,
        `CreateFileW ${abs}: ${errorText(watch)}`,
      );
      state.dead = true;
      return;
    }
    const issued = watch.issue();
    if (issued !== 0) {
      watch.close();
      this.sink.gap(
        causeOfIssueError(true),
        null,
        `ReadDirectoryChangesW ${abs}: ${errorText(issued)} (the file system rejects the call)`,
      );
      state.dead = true;
      return;
    }
    state.watch = watch;
    const parentDir = dirname(abs);
    if (parentDir !== abs) {
      const parent = api.open(parentDir, false, PARENT_FILTER);
      if (typeof parent !== 'number') {
        if (parent.issue() === 0) state.parent = parent;
        else parent.close();
      }
      // Without the parent's handle a rename of the root is still found by the final-path check
      // at each drain, unless it is undone before the next drain.
    }
  }

  private interrupted(state: BaseState, detail: string): void {
    if (state.dead) return;
    state.dead = true;
    this.sink.gap('observation-interrupted', null, `${detail}: ${state.handleDir}`);
  }

  /** Reads every completed read of every handle until each one is pending. */
  private async pump(): Promise<void> {
    for (const state of this.states) {
      await this.pumpRoot(state);
      this.pumpParent(state);
      if (!state.dead && state.watch && state.expected !== null) {
        const final = state.watch.finalPath();
        if (final !== null && comparablePath(final) !== comparablePath(state.expected)) {
          this.interrupted(state, `the root was moved to ${final}`);
        }
      }
    }
  }

  private async pumpRoot(state: BaseState): Promise<void> {
    for (;;) {
      if (this.closed || state.dead || !state.watch) return;
      const done = state.watch.poll();
      if (done === null) return;
      const kind = classifyCompletion(done.error, done.data.length);
      if (kind === 'closed') return;
      if (kind === 'interrupted') {
        this.interrupted(state, `ReadDirectoryChangesW: ${errorText(done.error)}`);
        return;
      }
      if (kind === 'events-lost') {
        this.sink.gap(
          'events-lost',
          null,
          done.error === 0
            ? `ReadDirectoryChangesW buffer overflow (zero bytes): ${state.handleDir}`
            : `ReadDirectoryChangesW ERROR_NOTIFY_ENUM_DIR: ${state.handleDir}`,
        );
      }
      // The next read is issued before the records are handled: the handle keeps recording.
      const records = kind === 'records' ? parseNotifyRecords(done.data, done.data.length) : [];
      const issued = state.watch.issue();
      for (const record of records) await this.handle(state, record);
      if (issued !== 0) {
        this.interrupted(state, `ReadDirectoryChangesW: ${errorText(issued)}`);
        return;
      }
    }
  }

  private pumpParent(state: BaseState): void {
    for (;;) {
      if (this.closed || state.dead || !state.parent) return;
      const done = state.parent.poll();
      if (done === null) return;
      const kind = classifyCompletion(done.error, done.data.length);
      if (kind === 'closed') return;
      if (kind === 'interrupted') {
        this.interrupted(state, `parent directory handle: ${errorText(done.error)}`);
        return;
      }
      if (kind === 'events-lost') {
        // Whether the root was renamed in that time cannot be told.
        this.sink.gap(
          'events-lost',
          null,
          `ReadDirectoryChangesW overflow on the parent of ${state.handleDir}`,
        );
      } else {
        const gone = parseNotifyRecords(done.data, done.data.length).find(
          (r) =>
            (r.action === FILE_ACTION.REMOVED || r.action === FILE_ACTION.RENAMED_OLD_NAME) &&
            r.name.toLowerCase() === state.name.toLowerCase(),
        );
        if (gone) {
          this.interrupted(
            state,
            gone.action === FILE_ACTION.REMOVED ? 'the root was removed' : 'the root was renamed',
          );
          return;
        }
      }
      if (state.parent.issue() !== 0) {
        this.interrupted(state, 'the parent directory handle failed');
        return;
      }
    }
  }

  private async handle(state: BaseState, record: NotifyRecord): Promise<void> {
    const base = state.base;
    let rel = record.name.split('\\').join('/');
    if (state.prefix !== '') {
      if (rel === state.prefix) {
        // The git directory itself, seen from the root's handle.
        if (
          record.action === FILE_ACTION.REMOVED ||
          record.action === FILE_ACTION.RENAMED_OLD_NAME
        ) {
          this.interrupted(state, `the git directory ${base.abs} was moved or removed`);
        }
        return;
      }
      if (!rel.startsWith(`${state.prefix}/`)) return;
      rel = rel.slice(state.prefix.length + 1);
    }
    if (rel === '') return;
    const descend = base.descend(rel);
    const label = base.label(rel);
    if (!descend && label === null) return;
    switch (record.action) {
      case FILE_ACTION.ADDED:
      case FILE_ACTION.RENAMED_NEW_NAME: {
        if (descend) {
          const st = await lstat(absOf(base, rel)).catch(() => null);
          if (st?.isDirectory()) {
            // Created or moved in: what is in it raised no event of its own when it was moved.
            await walkTree(base, rel, this.sink, {
              report: true,
              onDirectory: (d) => state.dirs.add(d),
              stopped: () => this.closed,
            });
            return;
          }
        }
        if (label !== null) this.sink.change(label);
        return;
      }
      case FILE_ACTION.REMOVED:
      case FILE_ACTION.RENAMED_OLD_NAME: {
        if (state.dirs.has(rel)) {
          for (const d of [...state.dirs]) {
            if (d === rel || d.startsWith(`${rel}/`)) state.dirs.delete(d);
          }
          const gap = base.gapLabel(rel);
          if (gap !== null && descend) {
            this.sink.resolve(gap);
            // A moved-away directory stands for its content, which raised no event of its own.
            // A removed one was emptied first: its content was reported as it was removed.
            if (record.action === FILE_ACTION.RENAMED_OLD_NAME) this.sink.change(gap);
          }
          return;
        }
        if (label !== null) this.sink.change(label);
        return;
      }
      default:
        // FILE_ACTION_MODIFIED: a directory's own times and attributes are not changes of a path.
        if (state.dirs.has(rel)) return;
        if (label !== null) this.sink.change(label);
    }
  }
}

/** The backend factory for Windows: one ReadDirectoryChangesW handle per watch base. */
export function windowsBackendFactory(options: WindowsOptions = {}): BackendFactory {
  return (part: ObservedPart, scope: ObserverScope, sink: BackendSink) =>
    new WindowsBackend(handleBases(part, scope), sink, options);
}
