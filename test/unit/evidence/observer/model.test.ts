import { mkdtempSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  causeOfInitError,
  causeOfWatchError,
  summariseGaps,
  topMost,
  type IncompleteCause,
  type ObservedPart,
} from '../../../../src/core/evidence/observer/causes.js';
import {
  Observer,
  repositoryBases,
  unavailableBackend,
  workingTreeBase,
  type BackendFactory,
  type BackendSink,
  type ObserverScope,
  type PartBackend,
} from '../../../../src/core/evidence/observer/observer.js';
import { parseEvents } from '../../../../src/core/evidence/observer/linux.js';
import { ContextualLog } from '../../../../src/core/log/log.js';

/**
 * The OS-independent observer model on recorded event sequences (C001-T-017): run windows by
 * event position, the drain contract, cause classification, rebuild and "observation
 * interrupted". No real change notification: a fake backend holds "kernel" events that only its
 * drain delivers, as an inotify queue does.
 */

type Recorded =
  | { kind: 'change'; path: string }
  | { kind: 'gap'; cause: IncompleteCause; path: string | null; detail?: string }
  | { kind: 'resolve'; path: string }
  | { kind: 'failure'; error: unknown };

class FakeBackend implements PartBackend {
  /** Events the operating system holds and the drain has not delivered yet. */
  readonly queue: Recorded[] = [];
  closed = false;
  constructor(
    readonly part: ObservedPart,
    readonly sink: BackendSink,
    private readonly atStart: Recorded[],
    private readonly startFails: boolean,
    private readonly gate: Promise<void> | null,
  ) {}
  async start() {
    if (this.gate) await this.gate;
    if (this.startFails) throw new Error('inotify_init1 failed');
    for (const r of this.atStart) this.deliver(r);
  }
  async drain() {
    while (this.queue.length > 0) this.deliver(this.queue.shift()!);
  }
  async close() {
    this.closed = true;
  }
  deliver(r: Recorded) {
    if (r.kind === 'change') this.sink.change(r.path);
    else if (r.kind === 'gap') this.sink.gap(r.cause, r.path, r.detail ?? 'recorded');
    else if (r.kind === 'resolve') this.sink.resolve(r.path);
    else this.sink.failure(r.error);
  }
}

const SCOPE: ObserverScope = { root: '/w', gitDir: '/w/.git', commonGitDir: '/w/.git' };

interface Harness {
  observer: Observer;
  backends: FakeBackend[];
  latest(part: ObservedPart): FakeBackend;
  /** Rebuilds queued by the observer, run on demand ("low priority"). */
  scheduled: (() => void)[];
  runScheduled(): Promise<void>;
}

async function harness(
  opts: {
    atStart?: Partial<Record<ObservedPart, Recorded[]>>;
    /** Per start of a part, in order: what the backend reports while it starts. */
    perStart?: Partial<Record<ObservedPart, Recorded[][]>>;
    failStarts?: Partial<Record<ObservedPart, number>>;
    /** Per start of a part, in order: a promise the start waits for (a slow rebuild). */
    gates?: Partial<Record<ObservedPart, (Promise<void> | null)[]>>;
    log?: ContextualLog;
  } = {},
): Promise<Harness> {
  const backends: FakeBackend[] = [];
  const scheduled: (() => void)[] = [];
  const starts: Record<ObservedPart, number> = { 'working-tree': 0, repository: 0 };
  const factory: BackendFactory = (part, _scope, sink) => {
    const n = starts[part]++;
    const atStart = opts.perStart?.[part]?.[n] ?? (n === 0 ? (opts.atStart?.[part] ?? []) : []);
    const fails = n < (opts.failStarts?.[part] ?? 0);
    const b = new FakeBackend(part, sink, atStart, fails, opts.gates?.[part]?.[n] ?? null);
    backends.push(b);
    return b;
  };
  const observer = await Observer.start({
    scope: SCOPE,
    factory,
    log: opts.log,
    schedule: (work) => scheduled.push(work),
  });
  return {
    observer,
    backends,
    scheduled,
    latest: (part) => backends.filter((b) => b.part === part).at(-1)!,
    async runScheduled() {
      while (scheduled.length > 0) {
        scheduled.shift()!();
        // Let the rebuild's awaits settle.
        for (let i = 0; i < 10; i++) await Promise.resolve();
        await new Promise((r) => setTimeout(r, 0));
      }
    },
  };
}

const paths = (o: { changed: readonly { path: string }[] }) => o.changed.map((c) => c.path);

describe('run windows by event position and the drain', () => {
  it('reports a change delivered during the window, and the drain at the end delivers queued ones', async () => {
    const h = await harness();
    const wt = h.latest('working-tree');
    const run = await h.observer.beginRun();
    wt.deliver({ kind: 'change', path: 'reports/total.csv' });
    // Still in the "kernel" queue when the command ends: the drain must deliver it in the window.
    wt.queue.push({ kind: 'change', path: 'reports/vat.csv' });
    const result = await h.observer.endRun(run);
    expect(paths(result)).toEqual(['reports/total.csv', 'reports/vat.csv']);
    expect(result.incomplete).toEqual([]);
  });

  it('leaves out what happened before the run starts and after it ends', async () => {
    const h = await harness();
    const wt = h.latest('working-tree');
    wt.deliver({ kind: 'change', path: 'before-delivered.txt' });
    // Queued before the command started but not read yet: the drain at the start places it before.
    wt.queue.push({ kind: 'change', path: 'before-queued.txt' });
    const run = await h.observer.beginRun();
    wt.queue.push({ kind: 'change', path: 'during.txt' });
    const result = await h.observer.endRun(run);
    wt.deliver({ kind: 'change', path: 'after.txt' });
    expect(paths(result)).toEqual(['during.txt']);
  });

  it('reports nothing for a run in which nothing changed and every part was observed', async () => {
    const h = await harness();
    const run = await h.observer.beginRun();
    const result = await h.observer.endRun(run);
    expect(result).toEqual({ changed: [], incomplete: [] });
  });

  it('reports each path once, sorted, working tree before repository', async () => {
    const h = await harness();
    const run = await h.observer.beginRun();
    h.latest('repository').deliver({ kind: 'change', path: 'refs/tags/pwned' });
    for (const p of ['b.txt', 'a.txt', 'b.txt'])
      h.latest('working-tree').deliver({ kind: 'change', path: p });
    const result = await h.observer.endRun(run);
    expect(result.changed).toEqual([
      { part: 'working-tree', path: 'a.txt' },
      { part: 'working-tree', path: 'b.txt' },
      { part: 'repository', path: 'refs/tags/pwned' },
    ]);
  });

  it('keeps overlapping windows apart', async () => {
    const h = await harness();
    const wt = h.latest('working-tree');
    const mutation = await h.observer.beginRun();
    wt.deliver({ kind: 'change', path: 'one.txt' });
    const bundle = await h.observer.beginRun();
    wt.deliver({ kind: 'change', path: 'two.txt' });
    const bundleResult = await h.observer.endRun(bundle);
    wt.deliver({ kind: 'change', path: 'three.txt' });
    const mutationResult = await h.observer.endRun(mutation);
    expect(paths(bundleResult)).toEqual(['two.txt']);
    expect(paths(mutationResult)).toEqual(['one.txt', 'three.txt', 'two.txt']);
  });
});

describe('incomplete observation: never silently clean', () => {
  it('an overflow during the run is "events lost" for the whole part, with no change listed', async () => {
    const h = await harness();
    const run = await h.observer.beginRun();
    h.latest('working-tree').queue.push({ kind: 'gap', cause: 'events-lost', path: null });
    const result = await h.observer.endRun(run);
    expect(result.changed).toEqual([]);
    expect(result.incomplete).toEqual([
      {
        cause: 'events-lost',
        name: 'events lost',
        parts: [{ part: 'working-tree', whole: true, count: 0, paths: [] }],
      },
    ]);
  });

  it('the rebuild after an in-run loss adds no second cause to that run, and the next run is clean', async () => {
    const h = await harness();
    const run = await h.observer.beginRun();
    h.latest('working-tree').deliver({ kind: 'gap', cause: 'events-lost', path: null });
    expect(h.scheduled).toHaveLength(1);
    await h.runScheduled(); // rebuilt while the run goes on
    const result = await h.observer.endRun(run);
    expect(result.incomplete.map((c) => c.cause)).toEqual(['events-lost']);
    expect(h.backends.filter((b) => b.part === 'working-tree')).toHaveLength(2);
    expect(h.backends[0]!.closed).toBe(true);

    const next = await h.observer.beginRun();
    expect(await h.observer.endRun(next)).toEqual({ changed: [], incomplete: [] });
  });

  it('a run that starts while the rebuild after a loss is not complete is "observation interrupted"', async () => {
    let release = () => {};
    const slow = new Promise<void>((r) => (release = r));
    const h = await harness({ gates: { 'working-tree': [null, slow] } });
    h.latest('working-tree').deliver({ kind: 'gap', cause: 'events-lost', path: null });
    // Loss between runs; the rebuild walk is still going when the next run starts and ends.
    await h.runScheduled();
    const run = await h.observer.beginRun();
    const result = await h.observer.endRun(run);
    release();
    expect(result.incomplete).toEqual([
      {
        cause: 'observation-interrupted',
        name: 'observation interrupted',
        parts: [{ part: 'working-tree', whole: true, count: 0, paths: [] }],
      },
    ]);
  });

  it('a loss between runs whose rebuild completed affects no later run', async () => {
    const h = await harness();
    h.latest('repository').deliver({ kind: 'gap', cause: 'events-lost', path: null });
    await h.runScheduled();
    const run = await h.observer.beginRun();
    expect(await h.observer.endRun(run)).toEqual({ changed: [], incomplete: [] });
  });

  it('watch limit at the start: 12 directories refused, top-most paths, count 12 (C001-TS-575)', async () => {
    const refused: Recorded[] = Array.from({ length: 12 }, (_, i) => ({
      kind: 'gap' as const,
      cause: 'watch-limit' as const,
      path: `node_modules/pkg${String(i + 1).padStart(2, '0')}`,
    }));
    const h = await harness({ atStart: { 'working-tree': refused } });
    const run = await h.observer.beginRun();
    const result = await h.observer.endRun(run);
    expect(result.changed).toEqual([]);
    expect(result.incomplete).toHaveLength(1);
    const [report] = result.incomplete;
    expect(report!.name).toBe('watch limit');
    expect(report!.parts[0]).toMatchObject({ part: 'working-tree', whole: false, count: 12 });
    expect(report!.parts[0]!.paths.slice(0, 10)).toHaveLength(10);
    // A persistent gap is not a loss: no rebuild is queued for it.
    expect(h.scheduled).toHaveLength(0);
  });

  it('an unreadable git directory is "not readable" for the whole repository part (C001-TS-577)', async () => {
    const denied: Recorded[] = [{ kind: 'gap', cause: 'not-readable', path: null }];
    // Each start of the repository part finds the git directory unreadable (beginRun retries it).
    const h = await harness({ perStart: { repository: [denied, denied, denied] } });
    const run = await h.observer.beginRun();
    const result = await h.observer.endRun(run);
    expect(result.incomplete).toEqual([
      {
        cause: 'not-readable',
        name: 'not readable',
        parts: [{ part: 'repository', whole: true, count: 0, paths: [] }],
      },
    ]);
  });

  it('a directory not readable is reported while it exists, and no longer once it is removed', async () => {
    const h = await harness({
      atStart: { 'working-tree': [{ kind: 'gap', cause: 'not-readable', path: 'data/private' }] },
    });
    const wt = h.latest('working-tree');
    const during = await h.observer.beginRun();
    wt.deliver({ kind: 'resolve', path: 'data' });
    const duringResult = await h.observer.endRun(during);
    expect(duringResult.incomplete[0]!.parts[0]!.paths).toEqual(['data/private']);
    const later = await h.observer.beginRun();
    expect((await h.observer.endRun(later)).incomplete).toEqual([]);
  });

  it('a renamed root interrupts the run; changes seen before still count (both notices)', async () => {
    const h = await harness();
    const wt = h.latest('working-tree');
    const run = await h.observer.beginRun();
    wt.deliver({ kind: 'change', path: 'src/cart/total.ts' });
    wt.deliver({ kind: 'gap', cause: 'observation-interrupted', path: null });
    const result = await h.observer.endRun(run);
    expect(paths(result)).toEqual(['src/cart/total.ts']);
    // The git directory lies below the root, so the repository part is interrupted with it.
    expect(result.incomplete).toEqual([
      {
        cause: 'observation-interrupted',
        name: 'observation interrupted',
        parts: [
          { part: 'working-tree', whole: true, count: 0, paths: [] },
          { part: 'repository', whole: true, count: 0, paths: [] },
        ],
      },
    ]);
    expect(h.scheduled).toHaveLength(2);
  });

  it('an observer failure is "observation interrupted", logged as a ReviewError, and rebuilt', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'sddr-observer-'));
    try {
      const logFile = join(dir, 'log.jsonl');
      const h = await harness({ log: new ContextualLog(logFile) });
      const run = await h.observer.beginRun();
      h.latest('working-tree').deliver({ kind: 'failure', error: new Error('read: EBADF') });
      await h.runScheduled();
      const result = await h.observer.endRun(run);
      expect(result.incomplete.map((c) => c.cause)).toEqual(['observation-interrupted']);
      const lines = readFileSync(logFile, 'utf8')
        .trim()
        .split('\n')
        .map((l) => JSON.parse(l));
      expect(lines[0]).toMatchObject({
        code: 'ERR-EVID-010',
        operation: 'working-tree-observer',
        level: 'notice',
        inputs: { part: 'working-tree', cause: 'observation-interrupted' },
      });
      expect(lines[0].cause).toContain('EBADF');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('logs the first gap of a persistent cause per backend, not each of thousands', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'sddr-observer-'));
    try {
      const logFile = join(dir, 'log.jsonl');
      const refused: Recorded[] = Array.from({ length: 50 }, (_, i) => ({
        kind: 'gap' as const,
        cause: 'watch-limit' as const,
        path: `d${i}`,
      }));
      await harness({ log: new ContextualLog(logFile), atStart: { 'working-tree': refused } });
      expect(existsSync(logFile)).toBe(true);
      expect(readFileSync(logFile, 'utf8').trim().split('\n')).toHaveLength(1);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('a backend that cannot start leaves the part interrupted while the retries fail', async () => {
    const h = await harness({ failStarts: { 'working-tree': 2 } });
    const first = await h.observer.beginRun();
    const firstResult = await h.observer.endRun(first);
    expect(firstResult.incomplete.map((c) => c.cause)).toEqual(['observation-interrupted']);
    // beginRun retried the part once; the third start succeeds.
    expect(h.backends.filter((b) => b.part === 'working-tree')).toHaveLength(2);
    const second = await h.observer.beginRun();
    expect(await h.observer.endRun(second)).toEqual({ changed: [], incomplete: [] });
  });

  it('a root missing at start does not rebuild in a loop; beginRun retries once per run', async () => {
    const missing: Recorded[] = [{ kind: 'gap', cause: 'observation-interrupted', path: null }];
    const h = await harness({ perStart: { 'working-tree': [missing, missing, []] } });
    expect(h.scheduled).toHaveLength(0);
    const run = await h.observer.beginRun();
    expect((await h.observer.endRun(run)).incomplete.map((c) => c.cause)).toEqual([
      'observation-interrupted',
    ]);
    expect(h.scheduled).toHaveLength(0);
  });

  it('events of a replaced backend are ignored', async () => {
    const h = await harness();
    const old = h.latest('working-tree');
    old.deliver({ kind: 'gap', cause: 'events-lost', path: null });
    await h.runScheduled();
    const run = await h.observer.beginRun();
    old.deliver({ kind: 'change', path: 'stale.txt' });
    old.deliver({ kind: 'gap', cause: 'events-lost', path: null });
    expect(await h.observer.endRun(run)).toEqual({ changed: [], incomplete: [] });
  });

  it('stopping the observer during a run interrupts both parts for that run', async () => {
    const h = await harness();
    const run = await h.observer.beginRun();
    await h.observer.stop();
    const result = await h.observer.endRun(run);
    expect(result.incomplete).toEqual([
      {
        cause: 'observation-interrupted',
        name: 'observation interrupted',
        parts: [
          { part: 'working-tree', whole: true, count: 0, paths: [] },
          { part: 'repository', whole: true, count: 0, paths: [] },
        ],
      },
    ]);
  });

  it('a backend that is unavailable on this system leaves every run interrupted', async () => {
    const observer = await Observer.start({
      scope: SCOPE,
      factory: unavailableBackend('no observer for this system'),
      schedule: () => undefined,
    });
    const run = await observer.beginRun();
    const result = await observer.endRun(run);
    expect(result.incomplete[0]!.cause).toBe('observation-interrupted');
  });
});

describe('cause classification and summary', () => {
  it('maps errno names to causes (C001-ADR-006 §9, Linux)', () => {
    expect(causeOfWatchError('ENOSPC')).toBe('watch-limit');
    expect(causeOfWatchError('EACCES')).toBe('not-readable');
    expect(causeOfWatchError('EPERM')).toBe('not-readable');
    expect(causeOfWatchError('ENOENT')).toBeNull();
    expect(causeOfWatchError('ENOTDIR')).toBeNull();
    expect(causeOfInitError('EMFILE')).toBe('watch-limit');
    expect(causeOfInitError('ENFILE')).toBe('observation-interrupted');
  });

  it('keeps top-most paths: a directory stands for everything below it', () => {
    expect(topMost(['a/b', 'a', 'a-b', 'c/d', 'c/d/e', 'a/b/c'])).toEqual(['a', 'a-b', 'c/d']);
  });

  it('reports each cause apart, in the order of §9 item 4; a whole part covers its paths', () => {
    const summary = summariseGaps([
      { cause: 'observation-interrupted', part: 'working-tree', path: null, detail: '' },
      { cause: 'not-readable', part: 'working-tree', path: 'x/y', detail: '' },
      { cause: 'not-readable', part: 'working-tree', path: 'x', detail: '' },
      { cause: 'events-lost', part: 'repository', path: 'refs', detail: '' },
      { cause: 'events-lost', part: 'repository', path: null, detail: '' },
    ]);
    expect(summary).toEqual([
      {
        cause: 'not-readable',
        name: 'not readable',
        parts: [{ part: 'working-tree', whole: false, count: 1, paths: ['x'] }],
      },
      {
        cause: 'events-lost',
        name: 'events lost',
        parts: [{ part: 'repository', whole: true, count: 0, paths: [] }],
      },
      {
        cause: 'observation-interrupted',
        name: 'observation interrupted',
        parts: [{ part: 'working-tree', whole: true, count: 0, paths: [] }],
      },
    ]);
  });
});

describe('scope (C001-ADR-006 §9)', () => {
  it('the working-tree part is every path under the root outside the git directories', () => {
    const base = workingTreeBase({
      root: join('/w'),
      gitDir: join('/w/.git/worktrees/x'),
      commonGitDir: join('/w/.git'),
    });
    expect(base.descend('')).toBe(true);
    expect(base.descend('node_modules/pkg')).toBe(true);
    expect(base.descend('.git')).toBe(false);
    expect(base.descend('.git/refs')).toBe(false);
    expect(base.label('.gitignore')).toBe('.gitignore');
    expect(base.label('.git/index')).toBeNull();
    expect(base.label('Cargo.lock')).toBe('Cargo.lock');
    expect(base.gapLabel('')).toBeNull();
  });

  it('a linked worktree keeps its .git file in scope', () => {
    const base = workingTreeBase({
      root: join('/wt'),
      gitDir: join('/main/.git/worktrees/wt'),
      commonGitDir: join('/main/.git'),
    });
    expect(base.label('.git')).toBe('.git');
  });

  it('the repository part: index, HEAD, packed-refs and refs; lock files left out', () => {
    const [base, ...rest] = repositoryBases(SCOPE);
    expect(rest).toHaveLength(0);
    expect(base!.label('index')).toBe('index');
    expect(base!.label('HEAD')).toBe('HEAD');
    expect(base!.label('packed-refs')).toBe('packed-refs');
    expect(base!.label('refs/tags/pwned')).toBe('refs/tags/pwned');
    expect(base!.label('reftable/tables.list')).toBe('reftable/tables.list');
    expect(base!.label('index.lock')).toBeNull();
    expect(base!.label('refs/heads/main.lock')).toBeNull();
    expect(base!.label('ORIG_HEAD')).toBeNull();
    expect(base!.label('objects/ab/cdef')).toBeNull();
    expect(base!.descend('refs/heads')).toBe(true);
    expect(base!.descend('objects')).toBe(false);
    expect(base!.gapLabel('')).toBeNull();
  });

  it('a linked worktree watches its git directory and the common one, labelled from the common one', () => {
    const bases = repositoryBases({
      root: join('/wt'),
      gitDir: join('/main/.git/worktrees/wt'),
      commonGitDir: join('/main/.git'),
    });
    expect(bases).toHaveLength(2);
    expect(bases[0]!.label('HEAD')).toBe('worktrees/wt/HEAD');
    expect(bases[1]!.label('HEAD')).toBe('HEAD');
    expect(bases[1]!.label('refs/heads/main')).toBe('refs/heads/main');
  });
});

describe('inotify event records', () => {
  it('parses headers and NUL-padded names, including the self-event without a name', () => {
    const rec = (wd: number, mask: number, name: string) => {
      const padded = name === '' ? 0 : Math.ceil((Buffer.byteLength(name) + 1) / 16) * 16;
      const b = Buffer.alloc(16 + padded);
      b.writeInt32LE(wd, 0);
      b.writeUInt32LE(mask, 4);
      b.writeUInt32LE(0, 8);
      b.writeUInt32LE(padded, 12);
      b.write(name, 16, 'utf8');
      return b;
    };
    const buf = Buffer.concat([rec(1, 0x100, 'total.csv'), rec(-1, 0x4000, ''), rec(2, 0x400, '')]);
    expect(parseEvents(buf, buf.length)).toEqual([
      { wd: 1, mask: 0x100, cookie: 0, name: 'total.csv' },
      { wd: -1, mask: 0x4000, cookie: 0, name: '' },
      { wd: 2, mask: 0x400, cookie: 0, name: '' },
    ]);
  });
});
