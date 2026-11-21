import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  BUFFER_SIZE,
  classifyCompletion,
  causeOfIssueError,
  causeOfOpenError,
  comparablePath,
  FILE_ACTION,
  handleBases,
  isWslShare,
  NOTIFY_FILTER,
  PARENT_FILTER,
  parseNotifyRecords,
  WIN32_ERROR,
  windowsBackendFactory,
  type Win32Api,
  type Win32Watch,
} from '../../../../src/core/evidence/observer/windows.js';
import { Observer, type ObserverScope } from '../../../../src/core/evidence/observer/observer.js';
import { ContextualLog } from '../../../../src/core/log/log.js';

/**
 * Mapping of recorded ReadDirectoryChangesW completions to causes (C001-T-018, C001-ADR-006 §9,
 * Windows column): zero bytes and `ERROR_NOTIFY_ENUM_DIR` are "events lost", handle errors and a
 * root renamed or removed are "observation interrupted", a root that cannot be opened or whose
 * first read is rejected is "not readable". No real notification: the Win32 calls are replaced
 * by scripted handles; the directories walked are real.
 */

/** Encodes FILE_NOTIFY_INFORMATION records as the kernel writes them. */
function records(...list: [number, string][]): Buffer {
  const parts = list.map(([action, name]) => {
    const nameBuf = Buffer.from(name, 'utf16le');
    const size = Math.ceil((12 + nameBuf.length) / 4) * 4;
    const b = Buffer.alloc(size);
    b.writeUInt32LE(action, 4);
    b.writeUInt32LE(nameBuf.length, 8);
    nameBuf.copy(b, 12);
    return b;
  });
  for (let i = 0; i < parts.length - 1; i++) parts[i]!.writeUInt32LE(parts[i]!.length, 0);
  return Buffer.concat(parts);
}

type Done = { error: number; data: Buffer };

class FakeWatch implements Win32Watch {
  /** Completions the kernel holds; one is delivered per issued read. */
  readonly completions: Done[] = [];
  issueErrors: number[] = [];
  pending = false;
  final: string | null;
  closed = false;
  issued = 0;
  constructor(
    readonly path: string,
    readonly subtree: boolean,
    readonly filter: number,
  ) {
    this.final = `\\\\?\\${realpathSync.native(path)}`;
  }
  issue() {
    this.issued++;
    const e = this.issueErrors.shift() ?? 0;
    if (e === 0) this.pending = true;
    return e;
  }
  poll() {
    if (!this.pending || this.completions.length === 0) return null;
    this.pending = false;
    return this.completions.shift()!;
  }
  finalPath() {
    return this.final;
  }
  close() {
    this.closed = true;
  }
}

class FakeApi implements Win32Api {
  readonly watches: FakeWatch[] = [];
  readonly openErrors = new Map<string, number>();
  readonly firstIssueErrors = new Map<string, number>();
  open(path: string, subtree: boolean, filter: number): Win32Watch | number {
    const e = this.openErrors.get(path);
    if (e !== undefined) return e;
    const w = new FakeWatch(path, subtree, filter);
    const first = this.firstIssueErrors.get(path);
    if (first !== undefined) w.issueErrors.push(first);
    this.watches.push(w);
    return w;
  }
  /** The working-tree part's subtree handle on `path` (opened first; the repository part's git
   * directory below the root is watched through a second handle on the root). */
  root(path: string): FakeWatch {
    return this.watches.filter((w) => w.subtree && w.path === path)[0]!;
  }
}

const dirs: string[] = [];
afterEach(() => {
  while (dirs.length > 0) rmSync(dirs.pop()!, { recursive: true, force: true });
});

function tree(): ObserverScope {
  const root = realpathSync.native(mkdtempSync(join(tmpdir(), 'sddr-win-')));
  dirs.push(root);
  mkdirSync(join(root, 'src', 'cart'), { recursive: true });
  writeFileSync(join(root, 'src', 'cart', 'total.ts'), 'x');
  mkdirSync(join(root, '.git', 'refs', 'tags'), { recursive: true });
  writeFileSync(join(root, '.git', 'HEAD'), 'ref: refs/heads/main\n');
  return { root, gitDir: join(root, '.git'), commonGitDir: join(root, '.git') };
}

async function start(scope: ObserverScope, api: FakeApi, log?: ContextualLog) {
  const scheduled: (() => void)[] = [];
  const observer = await Observer.start({
    scope,
    factory: windowsBackendFactory({ api, pollMs: 60_000 }),
    log,
    schedule: (work) => scheduled.push(work),
  });
  return { observer, scheduled };
}

const WHOLE_WT = { part: 'working-tree', whole: true, count: 0, paths: [] };
const WHOLE_REPO = { part: 'repository', whole: true, count: 0, paths: [] };

describe('completion classification (C001-ADR-006 §9, Windows)', () => {
  it('zero bytes and ERROR_NOTIFY_ENUM_DIR are "events lost"; handle errors interrupt; a cancel ends quietly', () => {
    expect(classifyCompletion(0, 120)).toBe('records');
    expect(classifyCompletion(0, 0)).toBe('events-lost');
    expect(classifyCompletion(WIN32_ERROR.NOTIFY_ENUM_DIR, 0)).toBe('events-lost');
    expect(classifyCompletion(WIN32_ERROR.ACCESS_DENIED, 0)).toBe('interrupted');
    expect(classifyCompletion(64 /* ERROR_NETNAME_DELETED */, 0)).toBe('interrupted');
    expect(classifyCompletion(WIN32_ERROR.OPERATION_ABORTED, 0)).toBe('closed');
    expect(classifyCompletion(WIN32_ERROR.NOTIFY_CLEANUP, 0)).toBe('closed');
  });

  it('a root that cannot be opened is "not readable", one that is gone interrupts; a rejected first read is "not readable"', () => {
    expect(causeOfOpenError(WIN32_ERROR.ACCESS_DENIED)).toBe('not-readable');
    expect(causeOfOpenError(32 /* ERROR_SHARING_VIOLATION */)).toBe('not-readable');
    expect(causeOfOpenError(WIN32_ERROR.FILE_NOT_FOUND)).toBeNull();
    expect(causeOfOpenError(WIN32_ERROR.PATH_NOT_FOUND)).toBeNull();
    expect(causeOfIssueError(true)).toBe('not-readable');
    expect(causeOfIssueError(false)).toBe('observation-interrupted');
  });

  it('recognises WSL shares and compares final paths without prefix or case', () => {
    expect(isWslShare('\\\\wsl$\\Ubuntu\\home\\me\\shop')).toBe(true);
    expect(isWslShare('\\\\wsl.localhost\\Ubuntu\\home')).toBe(true);
    expect(isWslShare('\\\\?\\UNC\\wsl$\\Ubuntu\\home')).toBe(true);
    expect(isWslShare('C:\\work\\shop')).toBe(false);
    expect(isWslShare('\\\\server\\share\\shop')).toBe(false);
    expect(comparablePath('\\\\?\\C:\\Work\\Shop\\')).toBe(comparablePath('c:\\work\\shop'));
    expect(comparablePath('\\\\?\\UNC\\server\\share\\x')).toBe('\\\\server\\share\\x');
  });

  it('parses FILE_NOTIFY_INFORMATION records with UTF-16 names', () => {
    const buf = records([FILE_ACTION.ADDED, 'src\\é.ts'], [FILE_ACTION.RENAMED_NEW_NAME, 'b']);
    expect(parseNotifyRecords(buf, buf.length)).toEqual([
      { action: FILE_ACTION.ADDED, name: 'src\\é.ts' },
      { action: FILE_ACTION.RENAMED_NEW_NAME, name: 'b' },
    ]);
  });

  it('a git directory below the root is watched through the root; one outside through itself', () => {
    const w = join(tmpdir(), 'w');
    const inside = handleBases('repository', {
      root: w,
      gitDir: join(w, '.git'),
      commonGitDir: join(w, '.git'),
    });
    expect(inside.map((b) => [b.handleDir, b.prefix])).toEqual([[w, '.git']]);
    const main = join(tmpdir(), 'main', '.git');
    const outside = handleBases('repository', {
      root: join(tmpdir(), 'wt'),
      gitDir: join(main, 'worktrees', 'wt'),
      commonGitDir: main,
    });
    expect(outside.map((b) => [b.handleDir, b.prefix])).toEqual([
      [join(main, 'worktrees', 'wt'), ''],
      [main, ''],
    ]);
    expect(
      handleBases('working-tree', {
        root: w,
        gitDir: join(w, '.git'),
        commonGitDir: join(w, '.git'),
      }).map((b) => b.handleDir),
    ).toEqual([w]);
    expect(BUFFER_SIZE).toBe(65536);
  });
});

describe('ReadDirectoryChangesW backend on recorded completions: never silently clean', () => {
  it('opens one subtree handle on the root per part and a directory-name handle on its parent', async () => {
    const scope = tree();
    const api = new FakeApi();
    const { observer } = await start(scope, api);
    const subtree = api.watches.filter((w) => w.subtree);
    expect(subtree.map((w) => w.path)).toEqual([scope.root, scope.root]);
    expect(subtree.every((w) => w.filter === NOTIFY_FILTER)).toBe(true);
    const parents = api.watches.filter((w) => !w.subtree);
    expect(parents.every((w) => w.path === dirname(scope.root) && w.filter === PARENT_FILTER)).toBe(
      true,
    );
    await observer.stop();
    expect(api.watches.every((w) => w.closed)).toBe(true);
  });

  it('reports file records of each part; lock files, objects and directory times are not reported', async () => {
    const scope = tree();
    const api = new FakeApi();
    const { observer } = await start(scope, api);
    const run = await observer.beginRun();
    const [wt, repo] = api.watches.filter((w) => w.subtree);
    const batch = records(
      [FILE_ACTION.MODIFIED, 'src\\cart\\total.ts'],
      [FILE_ACTION.MODIFIED, 'src\\cart'],
      [FILE_ACTION.ADDED, '.git\\refs\\tags\\v1.lock'],
      [FILE_ACTION.RENAMED_OLD_NAME, '.git\\refs\\tags\\v1.lock'],
      [FILE_ACTION.RENAMED_NEW_NAME, '.git\\refs\\tags\\v1'],
      [FILE_ACTION.ADDED, '.git\\objects\\ab\\cdef'],
    );
    wt!.completions.push({ error: 0, data: batch });
    repo!.completions.push({ error: 0, data: batch });
    expect(await observer.endRun(run)).toEqual({
      changed: [
        { part: 'working-tree', path: 'src/cart/total.ts' },
        { part: 'repository', path: 'refs/tags/v1' },
      ],
      incomplete: [],
    });
    await observer.stop();
  });

  it('the drain reads until no read returns data, reissuing after each completion', async () => {
    const scope = tree();
    const api = new FakeApi();
    const { observer } = await start(scope, api);
    const wt = api.root(scope.root);
    const run = await observer.beginRun();
    for (let i = 0; i < 5; i++) {
      wt.completions.push({ error: 0, data: records([FILE_ACTION.ADDED, `f${i}.txt`]) });
    }
    const result = await observer.endRun(run);
    expect(result.changed.map((c) => c.path)).toEqual([
      'f0.txt',
      'f1.txt',
      'f2.txt',
      'f3.txt',
      'f4.txt',
    ]);
    await observer.stop();
  });

  it('a completion with zero bytes (buffer overflow) is "events lost" for the whole part, logged as ERR-EVID-010', async () => {
    const scope = tree();
    const logDir = mkdtempSync(join(tmpdir(), 'sddr-winlog-'));
    dirs.push(logDir);
    const log = new ContextualLog(join(logDir, 'log.jsonl'));
    const api = new FakeApi();
    const { observer, scheduled } = await start(scope, api, log);
    const run = await observer.beginRun();
    api.root(scope.root).completions.push({ error: 0, data: Buffer.alloc(0) });
    const result = await observer.endRun(run);
    expect(result.changed).toEqual([]);
    expect(result.incomplete).toEqual([
      { cause: 'events-lost', name: 'events lost', parts: [WHOLE_WT] },
    ]);
    expect(scheduled.length).toBeGreaterThan(0); // the part is rebuilt
    const lines = readFileSync(join(logDir, 'log.jsonl'), 'utf8').trim().split('\n');
    expect(lines.some((l) => l.includes('ERR-EVID-010') && l.includes('events-lost'))).toBe(true);
    await observer.stop();
  });

  it('ERROR_NOTIFY_ENUM_DIR is "events lost" for the whole part; changes delivered before still count', async () => {
    const scope = tree();
    const api = new FakeApi();
    const { observer } = await start(scope, api);
    const run = await observer.beginRun();
    const wt = api.root(scope.root);
    wt.completions.push({ error: 0, data: records([FILE_ACTION.MODIFIED, 'src\\cart\\total.ts']) });
    wt.completions.push({ error: WIN32_ERROR.NOTIFY_ENUM_DIR, data: Buffer.alloc(0) });
    const result = await observer.endRun(run);
    expect(result.changed).toEqual([{ part: 'working-tree', path: 'src/cart/total.ts' }]);
    expect(result.incomplete).toEqual([
      { cause: 'events-lost', name: 'events lost', parts: [WHOLE_WT] },
    ]);
    await observer.stop();
  });

  it('a handle error after the root is removed is "observation interrupted", also for the git directory below it', async () => {
    const scope = tree();
    const api = new FakeApi();
    const { observer } = await start(scope, api);
    const run = await observer.beginRun();
    api
      .root(scope.root)
      .completions.push({ error: WIN32_ERROR.ACCESS_DENIED, data: Buffer.alloc(0) });
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

  it('a read that can no longer be issued is "observation interrupted"', async () => {
    const scope = tree();
    const api = new FakeApi();
    const { observer } = await start(scope, api);
    const run = await observer.beginRun();
    const wt = api.root(scope.root);
    wt.issueErrors.push(WIN32_ERROR.ACCESS_DENIED);
    wt.completions.push({ error: 0, data: records([FILE_ACTION.REMOVED, 'src\\cart\\total.ts']) });
    const result = await observer.endRun(run);
    expect(result.changed).toEqual([{ part: 'working-tree', path: 'src/cart/total.ts' }]);
    expect(result.incomplete.map((c) => c.cause)).toEqual(['observation-interrupted']);
    await observer.stop();
  });

  it('the root renamed in its parent is "observation interrupted"', async () => {
    const scope = tree();
    const api = new FakeApi();
    const { observer } = await start(scope, api);
    const run = await observer.beginRun();
    const name = basename(scope.root);
    for (const w of api.watches.filter((x) => !x.subtree)) {
      w.completions.push({
        error: 0,
        data: records(
          [FILE_ACTION.RENAMED_OLD_NAME, name.toUpperCase()],
          [FILE_ACTION.RENAMED_NEW_NAME, `${name}-moved`],
        ),
      });
    }
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

  it('a final path that is no longer the root at a drain is "observation interrupted"', async () => {
    const scope = tree();
    const api = new FakeApi();
    const { observer } = await start(scope, api);
    const run = await observer.beginRun();
    api.root(scope.root).final = `\\\\?\\${scope.root}-moved`;
    const result = await observer.endRun(run);
    expect(result.incomplete.map((c) => c.cause)).toEqual(['observation-interrupted']);
    await observer.stop();
  });

  it('the git directory renamed, seen from the root handle, interrupts the repository part', async () => {
    const scope = tree();
    const api = new FakeApi();
    const { observer } = await start(scope, api);
    const run = await observer.beginRun();
    const [, repo] = api.watches.filter((w) => w.subtree);
    repo!.completions.push({ error: 0, data: records([FILE_ACTION.RENAMED_OLD_NAME, '.git']) });
    const result = await observer.endRun(run);
    expect(result.incomplete).toEqual([
      { cause: 'observation-interrupted', name: 'observation interrupted', parts: [WHOLE_REPO] },
    ]);
    await observer.stop();
  });

  it('a root that cannot be opened is "not readable" for the whole part; a missing one interrupts', async () => {
    const scope = tree();
    const api = new FakeApi();
    api.openErrors.set(scope.root, WIN32_ERROR.ACCESS_DENIED);
    const { observer } = await start(scope, api);
    const run = await observer.beginRun();
    const result = await observer.endRun(run);
    expect(result.incomplete).toEqual([
      { cause: 'not-readable', name: 'not readable', parts: [WHOLE_WT, WHOLE_REPO] },
    ]);
    await observer.stop();

    const api2 = new FakeApi();
    api2.openErrors.set(scope.root, WIN32_ERROR.FILE_NOT_FOUND);
    const second = await start(scope, api2);
    const run2 = await second.observer.beginRun();
    expect((await second.observer.endRun(run2)).incomplete.map((c) => c.cause)).toEqual([
      'observation-interrupted',
    ]);
    await second.observer.stop();
  });

  it('a first read that the file system rejects is "not readable" for the whole part', async () => {
    const scope = tree();
    const api = new FakeApi();
    api.firstIssueErrors.set(scope.root, WIN32_ERROR.INVALID_FUNCTION);
    const { observer } = await start(scope, api);
    const run = await observer.beginRun();
    expect((await observer.endRun(run)).incomplete).toEqual([
      { cause: 'not-readable', name: 'not readable', parts: [WHOLE_WT, WHOLE_REPO] },
    ]);
    await observer.stop();
  });

  it('a root on a \\\\wsl$ share is "not readable" for the whole part without opening a handle', async () => {
    const api = new FakeApi();
    const scope: ObserverScope = {
      root: '\\\\wsl$\\Ubuntu\\home\\me\\shop',
      gitDir: '\\\\wsl$\\Ubuntu\\home\\me\\shop\\.git',
      commonGitDir: '\\\\wsl$\\Ubuntu\\home\\me\\shop\\.git',
    };
    const { observer } = await start(scope, api);
    const run = await observer.beginRun();
    expect((await observer.endRun(run)).incomplete).toEqual([
      { cause: 'not-readable', name: 'not readable', parts: [WHOLE_WT, WHOLE_REPO] },
    ]);
    expect(api.watches).toHaveLength(0);
    await observer.stop();
  });

  it('the Win32 binding missing leaves every part interrupted', async () => {
    const scope = tree();
    const api = {
      open: () => {
        throw new Error('kernel32 not available');
      },
    } as unknown as Win32Api;
    const { observer } = await start(scope, api as FakeApi);
    const run = await observer.beginRun();
    expect((await observer.endRun(run)).incomplete.map((c) => c.cause)).toEqual([
      'observation-interrupted',
    ]);
    await observer.stop();
  });
});
