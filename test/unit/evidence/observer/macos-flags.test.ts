import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, sep } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  classifyFsEvent,
  CREATE_FLAGS,
  FSE,
  FSE_CREATE,
  LOCAL_ONLY_VOLUME_TYPES,
  lossIsPlaced,
  MacosBackend,
  macosBackendFactory,
  type FsEventsApi,
  type FsEventsStream,
  type RawFsEvent,
} from '../../../../src/core/evidence/observer/macos.js';
import { InotifyBackend } from '../../../../src/core/evidence/observer/linux.js';
import {
  Observer,
  type BackendSink,
  type ObserverScope,
} from '../../../../src/core/evidence/observer/observer.js';
import { backendFactoryFor } from '../../../../src/core/evidence/observer/platform.js';
import { WindowsBackend } from '../../../../src/core/evidence/observer/windows.js';
import { ContextualLog } from '../../../../src/core/log/log.js';

/**
 * Mapping of recorded FSEvents flags to causes (C001-T-018, C001-ADR-006 §9, macOS column):
 * `MustScanSubDirs` (also with `UserDropped` or `KernelDropped`) is "events lost" for the named
 * subtree or the whole part, `RootChanged` is "observation interrupted", the replay barrier and
 * the marker barrier of the drain. No real notification: the stream is scripted; the
 * directories walked are real.
 */

class FakeStream implements FsEventsStream {
  /** Batches FSEvents has sent and the run loop has not delivered yet. */
  readonly sent: RawFsEvent[][] = [];
  /** Events on their way from the file system that only arrive with the next marker. */
  readonly queued: RawFsEvent[] = [];
  /** When false, nothing arrives any more, the marker neither (FSEvents stopped delivering). */
  delivers = true;
  closed = false;
  markers = 0;
  constructor(
    readonly paths: readonly string[],
    readonly since: bigint,
    readonly flags: number,
    private readonly deliver: (events: readonly RawFsEvent[]) => void,
    private readonly nextId: () => bigint,
  ) {}
  pump() {
    while (this.sent.length > 0) this.deliver(this.sent.shift()!);
  }
  mark() {
    const path = `${MARKER_DIR}${sep}m${++this.markers}`;
    if (this.delivers) {
      const marker = { path, flags: FSE.ItemCreated | FSE.ItemRemoved | FILE, id: this.nextId() };
      this.sent.push([...this.queued.splice(0), marker]);
    }
    return { path };
  }
  own(path: string) {
    return path === MARKER_DIR || path.startsWith(`${MARKER_DIR}${sep}`);
  }
  close() {
    this.closed = true;
  }
}

class FakeFsEvents implements FsEventsApi {
  readonly streams: FakeStream[] = [];
  nextId = 1000n;
  /** Sent right after start: the end of the replay. */
  historyDone = true;
  refuse: string | null = null;
  readonly volumeTypes = new Map<string, string>();
  currentEventId() {
    return this.nextId;
  }
  open(
    paths: readonly string[],
    since: bigint,
    _latency: number,
    flags: number,
    deliver: (events: readonly RawFsEvent[]) => void,
  ) {
    if (this.refuse) return this.refuse;
    const s = new FakeStream(paths, since, flags, deliver, () => ++this.nextId);
    if (this.historyDone) s.sent.push([{ path: paths[0]!, flags: FSE.HistoryDone, id: 0n }]);
    this.streams.push(s);
    return s;
  }
  fsTypeName(path: string) {
    return this.volumeTypes.get(path) ?? 'apfs';
  }
  /** Queues an event in the stream of a part (0: working tree, 1: repository) for the next flush. */
  queue(stream: number, path: string, flags: number) {
    this.streams[stream]!.queued.push({ path, flags, id: ++this.nextId });
  }
}

const MARKER_DIR = join(tmpdir(), 'sddr-fsevents-fake');
const FILE = FSE.ItemIsFile;
const dirs: string[] = [];
afterEach(() => {
  while (dirs.length > 0) rmSync(dirs.pop()!, { recursive: true, force: true });
});

function tree(): ObserverScope {
  const root = realpathSync.native(mkdtempSync(join(tmpdir(), 'sddr-mac-')));
  dirs.push(root);
  mkdirSync(join(root, 'src', 'cart'), { recursive: true });
  writeFileSync(join(root, 'src', 'cart', 'total.ts'), 'x');
  mkdirSync(join(root, 'node_modules', 'pkg01'), { recursive: true });
  mkdirSync(join(root, '.git', 'refs', 'tags'), { recursive: true });
  writeFileSync(join(root, '.git', 'HEAD'), 'ref: refs/heads/main\n');
  return { root, gitDir: join(root, '.git'), commonGitDir: join(root, '.git') };
}

/** The path FSEvents reports for `rel` below the root (with the separator of the system). */
const at = (scope: ObserverScope, rel: string) => join(scope.root, ...rel.split('/'));

async function start(
  scope: ObserverScope,
  api: FakeFsEvents,
  opts: { log?: ContextualLog; drainTimeoutMs?: number; startTimeoutMs?: number } = {},
) {
  const scheduled: (() => void)[] = [];
  const observer = await Observer.start({
    scope,
    factory: macosBackendFactory({
      api,
      pollMs: 60_000,
      drainTimeoutMs: opts.drainTimeoutMs ?? 200,
      startTimeoutMs: opts.startTimeoutMs ?? 200,
    }),
    log: opts.log,
    schedule: (work) => scheduled.push(work),
  });
  return { observer, scheduled };
}

const WHOLE_WT = { part: 'working-tree', whole: true, count: 0, paths: [] };
const WHOLE_REPO = { part: 'repository', whole: true, count: 0, paths: [] };

describe('flag classification (C001-ADR-006 §9, macOS)', () => {
  it('maps drop and rescan flags to "events lost" and RootChanged to "observation interrupted"', () => {
    expect(classifyFsEvent(FSE.MustScanSubDirs)).toBe('events-lost');
    expect(classifyFsEvent(FSE.MustScanSubDirs | FSE.UserDropped)).toBe('events-lost');
    expect(classifyFsEvent(FSE.MustScanSubDirs | FSE.KernelDropped)).toBe('events-lost');
    expect(classifyFsEvent(FSE.UserDropped)).toBe('events-lost');
    expect(classifyFsEvent(FSE.KernelDropped)).toBe('events-lost');
    expect(classifyFsEvent(FSE.RootChanged)).toBe('observation-interrupted');
    expect(classifyFsEvent(FSE.RootChanged | FSE.MustScanSubDirs)).toBe('observation-interrupted');
    expect(classifyFsEvent(FSE.HistoryDone)).toBe('history-done');
    expect(classifyFsEvent(FSE.Mount)).toBe('mount');
    expect(classifyFsEvent(FSE.Unmount)).toBe('mount');
    expect(classifyFsEvent(FSE.ItemCreated | FILE)).toBe('item');
    expect(classifyFsEvent(FSE.ItemXattrMod | FILE)).toBe('item');
    expect(classifyFsEvent(FSE.EventIdsWrapped)).toBe('ignored');
    // A directory-level event without file detail cannot vouch for any file.
    expect(classifyFsEvent(0)).toBe('events-lost');
  });

  it('places a loss at its subtree only with MustScanSubDirs', () => {
    expect(lossIsPlaced(FSE.MustScanSubDirs)).toBe(true);
    expect(lossIsPlaced(FSE.MustScanSubDirs | FSE.KernelDropped)).toBe(true);
    expect(lossIsPlaced(FSE.UserDropped)).toBe(false);
    expect(lossIsPlaced(FSE.KernelDropped)).toBe(false);
  });

  it('creates streams with file events, no defer and root watching; network and FUSE volumes notify local changes only', () => {
    expect(CREATE_FLAGS).toBe(FSE_CREATE.FileEvents | FSE_CREATE.NoDefer | FSE_CREATE.WatchRoot);
    for (const t of ['smbfs', 'nfs', 'afpfs', 'webdav', 'macfuse']) {
      expect(LOCAL_ONLY_VOLUME_TYPES.has(t)).toBe(true);
    }
    expect(LOCAL_ONLY_VOLUME_TYPES.has('apfs')).toBe(false);
  });
});

describe('FSEvents backend on recorded events: never silently clean', () => {
  it('starts each stream from the event ID before its creation and waits for the replay', async () => {
    const scope = tree();
    const api = new FakeFsEvents();
    const { observer } = await start(scope, api);
    expect(api.streams.map((s) => s.paths)).toEqual([[scope.root], [scope.gitDir]]);
    expect(api.streams.every((s) => s.since === 1000n && s.flags === CREATE_FLAGS)).toBe(true);
    const run = await observer.beginRun();
    expect(await observer.endRun(run)).toEqual({ changed: [], incomplete: [] });
    await observer.stop();
    expect(api.streams.every((s) => s.closed)).toBe(true);
  });

  it('a replay that never completes is "observation interrupted" for the part', async () => {
    const scope = tree();
    const api = new FakeFsEvents();
    api.historyDone = false;
    const { observer } = await start(scope, api, { startTimeoutMs: 20 });
    const run = await observer.beginRun();
    const result = await observer.endRun(run);
    expect(result.incomplete.map((c) => c.cause)).toEqual(['observation-interrupted']);
    await observer.stop();
  });

  it('reports file events of each part; directories, lock files and objects are not reported', async () => {
    const scope = tree();
    const api = new FakeFsEvents();
    const { observer } = await start(scope, api);
    const run = await observer.beginRun();
    api.queue(0, at(scope, 'src/cart/total.ts'), FSE.ItemModified | FILE);
    api.queue(0, at(scope, 'src/cart'), FSE.ItemInodeMetaMod | FSE.ItemIsDir);
    api.queue(0, at(scope, '.git/index'), FSE.ItemModified | FILE);
    api.queue(1, at(scope, '.git/index.lock'), FSE.ItemCreated | FSE.ItemRenamed | FILE);
    api.queue(1, at(scope, '.git/index'), FSE.ItemRenamed | FILE);
    api.queue(1, at(scope, '.git/objects/ab/cdef'), FSE.ItemCreated | FILE);
    expect(await observer.endRun(run)).toEqual({
      changed: [
        { part: 'working-tree', path: 'src/cart/total.ts' },
        { part: 'repository', path: 'index' },
      ],
      incomplete: [],
    });
    await observer.stop();
  });

  it('a directory moved in is listed; one moved away stands for its content', async () => {
    const scope = tree();
    const api = new FakeFsEvents();
    const { observer } = await start(scope, api);
    const run = await observer.beginRun();
    mkdirSync(join(scope.root, 'vendor', 'lib'), { recursive: true });
    writeFileSync(join(scope.root, 'vendor', 'lib', 'a.js'), 'a');
    api.queue(0, at(scope, 'vendor'), FSE.ItemRenamed | FSE.ItemIsDir);
    api.queue(0, at(scope, 'gone'), FSE.ItemRenamed | FSE.ItemIsDir);
    api.queue(0, at(scope, 'removed'), FSE.ItemRemoved | FSE.ItemIsDir);
    expect((await observer.endRun(run)).changed.map((c) => c.path)).toEqual([
      'gone',
      'vendor/lib/a.js',
    ]);
    await observer.stop();
  });

  it('MustScanSubDirs below the root is "events lost" for that subtree as the top-most path', async () => {
    const scope = tree();
    const api = new FakeFsEvents();
    const { observer, scheduled } = await start(scope, api);
    const run = await observer.beginRun();
    api.queue(
      0,
      `${at(scope, 'node_modules/pkg01')}${sep}`,
      FSE.MustScanSubDirs | FSE.KernelDropped,
    );
    const result = await observer.endRun(run);
    expect(result.changed).toEqual([]);
    expect(result.incomplete).toEqual([
      {
        cause: 'events-lost',
        name: 'events lost',
        parts: [{ part: 'working-tree', whole: false, count: 1, paths: ['node_modules/pkg01'] }],
      },
    ]);
    expect(scheduled.length).toBeGreaterThan(0); // the part is rebuilt
    await observer.stop();
  });

  it('MustScanSubDirs on the root, or with a path outside the bases, is "events lost" for the whole part', async () => {
    for (const path of [(s: ObserverScope) => `${s.root}${sep}`, () => sep]) {
      const scope = tree();
      const api = new FakeFsEvents();
      const { observer } = await start(scope, api);
      const run = await observer.beginRun();
      api.queue(0, path(scope), FSE.MustScanSubDirs | FSE.UserDropped);
      expect((await observer.endRun(run)).incomplete).toEqual([
        { cause: 'events-lost', name: 'events lost', parts: [WHOLE_WT] },
      ]);
      await observer.stop();
    }
  });

  it('UserDropped or KernelDropped without a rescan path is "events lost" for the whole part', async () => {
    const scope = tree();
    const api = new FakeFsEvents();
    const { observer } = await start(scope, api);
    const run = await observer.beginRun();
    api.queue(1, at(scope, '.git/refs'), FSE.KernelDropped);
    expect((await observer.endRun(run)).incomplete).toEqual([
      { cause: 'events-lost', name: 'events lost', parts: [WHOLE_REPO] },
    ]);
    await observer.stop();
  });

  it('a rescan of a subtree outside the observed scope (.git/objects in the working tree) is not a loss', async () => {
    const scope = tree();
    const api = new FakeFsEvents();
    const { observer } = await start(scope, api);
    const run = await observer.beginRun();
    api.queue(0, at(scope, '.git/objects'), FSE.MustScanSubDirs);
    expect(await observer.endRun(run)).toEqual({ changed: [], incomplete: [] });
    await observer.stop();
  });

  it('RootChanged is "observation interrupted" for the whole part, logged as ERR-EVID-010', async () => {
    const scope = tree();
    const logDir = mkdtempSync(join(tmpdir(), 'sddr-maclog-'));
    dirs.push(logDir);
    const log = new ContextualLog(join(logDir, 'log.jsonl'));
    const api = new FakeFsEvents();
    const { observer } = await start(scope, api, { log });
    const run = await observer.beginRun();
    api.queue(0, at(scope, 'src/cart/total.ts'), FSE.ItemModified | FILE);
    api.queue(0, scope.root, FSE.RootChanged);
    const result = await observer.endRun(run);
    expect(result.changed).toEqual([{ part: 'working-tree', path: 'src/cart/total.ts' }]);
    expect(result.incomplete).toEqual([
      {
        cause: 'observation-interrupted',
        name: 'observation interrupted',
        parts: [WHOLE_WT, WHOLE_REPO],
      },
    ]);
    const lines = readFileSync(join(logDir, 'log.jsonl'), 'utf8').trim().split('\n');
    expect(
      lines.some((l) => l.includes('ERR-EVID-010') && l.includes('observation-interrupted')),
    ).toBe(true);
    await observer.stop();
  });

  it('a root replaced by another directory, without any RootChanged event, is "observation interrupted" at the drain', async () => {
    const scope = tree();
    const api = new FakeFsEvents();
    const { observer } = await start(scope, api);
    const run = await observer.beginRun();
    renameSync(scope.root, `${scope.root}-moved`);
    dirs.push(`${scope.root}-moved`);
    mkdirSync(join(scope.root, '.git'), { recursive: true });
    const result = await observer.endRun(run);
    expect(result.incomplete).toEqual([
      {
        cause: 'observation-interrupted',
        name: 'observation interrupted',
        parts: [WHOLE_WT, WHOLE_REPO],
      },
    ]);
    await observer.stop();
  });

  it('a drain whose marker is not delivered is "events lost" (FSEvents stopped delivering)', async () => {
    const scope = tree();
    const api = new FakeFsEvents();
    const { observer } = await start(scope, api, { drainTimeoutMs: 20 });
    const run = await observer.beginRun();
    api.streams[0]!.delivers = false;
    api.queue(0, at(scope, 'src/cart/total.ts'), FSE.ItemModified | FILE);
    const result = await observer.endRun(run);
    expect(result.changed).toEqual([]);
    expect(result.incomplete).toEqual([
      { cause: 'events-lost', name: 'events lost', parts: [WHOLE_WT] },
    ]);
    await observer.stop();
  });

  it('the drain waits for its marker: events still on their way when it starts are in the run', async () => {
    const scope = tree();
    const api = new FakeFsEvents();
    const { observer } = await start(scope, api);
    const run = await observer.beginRun();
    // Nothing has reached the stream yet when the drain starts; the change arrives before the marker.
    api.queue(0, at(scope, 'src/cart/total.ts'), FSE.ItemModified | FILE);
    expect(await observer.endRun(run)).toEqual({
      changed: [{ part: 'working-tree', path: 'src/cart/total.ts' }],
      incomplete: [],
    });
    await observer.stop();
  });

  it('marker files are never reported; a loss in the marker directory is "events lost" for the part', async () => {
    const scope = tree();
    const api = new FakeFsEvents();
    const { observer } = await start(scope, api);
    const run = await observer.beginRun();
    api.streams[0]!.queued.push({
      path: join(MARKER_DIR, 'm99'),
      flags: FSE.ItemCreated | FILE,
      id: ++api.nextId,
    });
    expect(await observer.endRun(run)).toEqual({ changed: [], incomplete: [] });
    const lossy = await observer.beginRun();
    api.streams[0]!.queued.push({
      path: MARKER_DIR,
      flags: FSE.MustScanSubDirs | FSE.UserDropped,
      id: ++api.nextId,
    });
    expect((await observer.endRun(lossy)).incomplete).toEqual([
      { cause: 'events-lost', name: 'events lost', parts: [WHOLE_WT] },
    ]);
    await observer.stop();
  });

  it('a directory that cannot be listed or lies on a network volume is "not readable" by its path', async () => {
    const scope = tree();
    const api = new FakeFsEvents();
    api.volumeTypes.set(join(scope.root, 'node_modules', 'pkg01'), 'smbfs');
    const { observer } = await start(scope, api);
    const run = await observer.beginRun();
    expect((await observer.endRun(run)).incomplete).toEqual([
      {
        cause: 'not-readable',
        name: 'not readable',
        parts: [{ part: 'working-tree', whole: false, count: 1, paths: ['node_modules/pkg01'] }],
      },
    ]);
    await observer.stop();
  });

  it('a stream that FSEvents refuses is "observation interrupted"; a missing root too', async () => {
    const scope = tree();
    const api = new FakeFsEvents();
    api.refuse = 'FSEventStreamCreate failed';
    const { observer } = await start(scope, api);
    const run = await observer.beginRun();
    expect((await observer.endRun(run)).incomplete.map((c) => c.cause)).toEqual([
      'observation-interrupted',
    ]);
    await observer.stop();

    const missing = { ...scope, root: join(scope.root, 'nope') };
    const second = await start(missing, new FakeFsEvents());
    const run2 = await second.observer.beginRun();
    const result2 = await second.observer.endRun(run2);
    expect(result2.incomplete).toEqual([
      { cause: 'observation-interrupted', name: 'observation interrupted', parts: [WHOLE_WT] },
    ]);
    await second.observer.stop();
  });
});

describe('platform switch', () => {
  const scope: ObserverScope = { root: '/w', gitDir: '/w/.git', commonGitDir: '/w/.git' };
  const sink: BackendSink = { change() {}, gap() {}, resolve() {}, failure() {} };

  it('picks inotify on Linux, FSEvents on macOS and ReadDirectoryChangesW on Windows', () => {
    expect(backendFactoryFor('linux')('working-tree', scope, sink)).toBeInstanceOf(InotifyBackend);
    expect(backendFactoryFor('darwin')('working-tree', scope, sink)).toBeInstanceOf(MacosBackend);
    expect(backendFactoryFor('win32')('repository', scope, sink)).toBeInstanceOf(WindowsBackend);
  });

  it('leaves both parts interrupted on any other operating system', async () => {
    const observer = await Observer.start({
      scope,
      factory: backendFactoryFor('aix'),
      schedule: () => undefined,
    });
    const run = await observer.beginRun();
    expect((await observer.endRun(run)).incomplete).toEqual([
      {
        cause: 'observation-interrupted',
        name: 'observation interrupted',
        parts: [WHOLE_WT, WHOLE_REPO],
      },
    ]);
    await observer.stop();
  });
});
