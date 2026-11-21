import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { FixtureRepo } from '../../../fixtures/builder/fixture-repo.js';
import { linuxBackendFactory } from '../../../../src/core/evidence/observer/linux.js';
import {
  Observer,
  type ObserverScope,
  type RunObservation,
} from '../../../../src/core/evidence/observer/observer.js';

/**
 * C001-TC-551: the inotify observer on real working trees (C001-T-017; C001-TS-568, C001-TS-569,
 * C001-TS-575, C001-TS-576 at the observer's level). Each Linux cause of the C001-ADR-006 §9 table
 * is raised: lowered `max_user_watches` and `max_user_instances` (in a user namespace, so the
 * rest of the machine keeps its limits), an unreadable directory, a renamed root and a queue
 * overflow; paths that did not change are never reported.
 */

const HERE = fileURLToPath(new URL('.', import.meta.url));
const REPO_ROOT = join(HERE, '..', '..', '..', '..');
const isRoot = process.platform === 'linux' && process.getuid?.() === 0;

const cleanups: (() => void)[] = [];
afterEach(() => {
  while (cleanups.length > 0) cleanups.pop()!();
});

/** A committed repository with a few directories, an ignored dependency folder and a tag. */
function fixture(): { repo: FixtureRepo; scope: ObserverScope } {
  const repo = FixtureRepo.create();
  repo.ignore('node_modules/');
  repo.commit('B0', {
    files: {
      'src/cart/total.ts': 'export const total = 1;\n',
      'src/coupon/data.json': '{"coupons":[]}\n',
      'src/coupon/rules.ts': 'export const rules = [];\n',
      'tests/total.test.ts': 'test("x", () => {});\n',
      'README.md': '# shop\n',
    },
  });
  for (let i = 1; i <= 3; i++) {
    repo.write(`node_modules/pkg0${i}/index.js`, `module.exports = ${i};\n`);
  }
  const root = realpathSync.native(repo.dir);
  cleanups.push(() => {
    try {
      chmodSync(join(root, 'data', 'private'), 0o755);
    } catch {
      /* not created by this test */
    }
    rmSync(root, { recursive: true, force: true });
  });
  return { repo, scope: { root, gitDir: join(root, '.git'), commonGitDir: join(root, '.git') } };
}

async function startObserver(scope: ObserverScope): Promise<Observer> {
  const observer = await Observer.start({ scope, factory: linuxBackendFactory({ pollMs: 20 }) });
  cleanups.push(() => void observer.stop());
  return observer;
}

const changedPaths = (r: RunObservation) => r.changed.map((c) => `${c.part}:${c.path}`);

/** Every file and directory of the working tree, read and stat'ed: reads change nothing. */
function readEverything(dir: string): void {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    statSync(full);
    if (entry.isDirectory()) readEverything(full);
    else readFileSync(full);
  }
}

describe.skipIf(process.platform !== 'linux')('inotify observer (C001-TC-551)', () => {
  it('reports nothing for a run that only reads the working tree and the repository', async () => {
    const { repo, scope } = fixture();
    const observer = await startObserver(scope);
    const run = await observer.beginRun();
    readEverything(scope.root);
    repo.git('rev-parse', 'HEAD');
    repo.git('log', '--oneline');
    expect(await observer.endRun(run)).toEqual({ changed: [], incomplete: [] });
  });

  it('reports files written into a new ignored folder, not the folder, and nothing unchanged (C001-TS-568)', async () => {
    const { scope } = fixture();
    const observer = await startObserver(scope);
    const run = await observer.beginRun();
    mkdirSync(join(scope.root, 'reports'));
    writeFileSync(join(scope.root, 'reports', 'total.csv'), 'total\n');
    writeFileSync(join(scope.root, 'reports', 'vat.csv'), 'vat\n');
    const result = await observer.endRun(run);
    expect(changedPaths(result)).toEqual([
      'working-tree:reports/total.csv',
      'working-tree:reports/vat.csv',
    ]);
    expect(result.incomplete).toEqual([]);
  });

  it('reports a rewritten, a removed and an ignored file, and a whole new tree found by listing', async () => {
    const { scope } = fixture();
    const observer = await startObserver(scope);
    const run = await observer.beginRun();
    writeFileSync(join(scope.root, 'src', 'coupon', 'data.json'), '{"coupons":[1,2,3]}\n');
    rmSync(join(scope.root, 'README.md'));
    writeFileSync(join(scope.root, 'node_modules', 'pkg02', 'index.js'), 'module.exports = 0;\n');
    // A deep tree created at once: what is created before its directories are watched is found
    // by listing them.
    mkdirSync(join(scope.root, 'tmp', 'a', 'b', 'c'), { recursive: true });
    writeFileSync(join(scope.root, 'tmp', 'a', 'b', 'c', 'deep.txt'), 'x');
    const result = await observer.endRun(run);
    expect(changedPaths(result)).toEqual([
      'working-tree:README.md',
      'working-tree:node_modules/pkg02/index.js',
      'working-tree:src/coupon/data.json',
      'working-tree:tmp/a/b/c/deep.txt',
    ]);
    expect(result.incomplete).toEqual([]);
  });

  it('a directory moved within the tree: its old path and the files at the new one', async () => {
    const { scope } = fixture();
    const observer = await startObserver(scope);
    const run = await observer.beginRun();
    renameSync(join(scope.root, 'src', 'coupon'), join(scope.root, 'src', 'offer'));
    const result = await observer.endRun(run);
    expect(changedPaths(result)).toEqual([
      'working-tree:src/coupon',
      'working-tree:src/offer/data.json',
      'working-tree:src/offer/rules.ts',
    ]);
    // Files changed under the new path after the move are still seen.
    const next = await observer.beginRun();
    writeFileSync(join(scope.root, 'src', 'offer', 'rules.ts'), 'export const rules = [1];\n');
    expect(changedPaths(await observer.endRun(next))).toEqual(['working-tree:src/offer/rules.ts']);
  });

  it('reports a tag and a staged file in the repository part, never a lock file or an object (C001-TS-572)', async () => {
    const { repo, scope } = fixture();
    const observer = await startObserver(scope);
    const run = await observer.beginRun();
    repo.git('tag', 'pwned');
    writeFileSync(join(scope.root, 'src', 'cart', 'total.ts'), 'export const total = 2;\n');
    repo.git('add', 'src/cart/total.ts');
    const result = await observer.endRun(run);
    expect(changedPaths(result)).toEqual([
      'working-tree:src/cart/total.ts',
      'repository:index',
      'repository:refs/tags/pwned',
    ]);
    expect(result.incomplete).toEqual([]);
  });

  it('packing the refs is reported as packed-refs, never as a lock file', async () => {
    const { repo, scope } = fixture();
    repo.git('tag', 'v1');
    const observer = await startObserver(scope);
    const run = await observer.beginRun();
    repo.git('pack-refs', '--all');
    const result = await observer.endRun(run);
    const paths = changedPaths(result);
    expect(paths).toContain('repository:packed-refs');
    expect(paths.every((p) => p.startsWith('repository:'))).toBe(true);
    expect(paths.some((p) => p.endsWith('.lock'))).toBe(false);
  });

  it.skipIf(isRoot)(
    'an unreadable directory is "not readable" by its path; no change reported (C001-TS-577)',
    async () => {
      const { scope } = fixture();
      mkdirSync(join(scope.root, 'data', 'private'), { recursive: true });
      writeFileSync(join(scope.root, 'data', 'private', 'secret.txt'), 's');
      chmodSync(join(scope.root, 'data', 'private'), 0o000);
      const observer = await startObserver(scope);
      const run = await observer.beginRun();
      readEverything(join(scope.root, 'src'));
      const result = await observer.endRun(run);
      expect(result.changed).toEqual([]);
      expect(result.incomplete).toEqual([
        {
          cause: 'not-readable',
          name: 'not readable',
          parts: [{ part: 'working-tree', whole: false, count: 1, paths: ['data/private'] }],
        },
      ]);
    },
  );

  it('the working-tree root renamed during a run is "observation interrupted"; observation resumes after', async () => {
    const { scope } = fixture();
    const observer = await startObserver(scope);
    const run = await observer.beginRun();
    renameSync(scope.root, `${scope.root}-moved`);
    renameSync(`${scope.root}-moved`, scope.root);
    const result = await observer.endRun(run);
    expect(result.changed).toEqual([]);
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
    await observer.rebuild('working-tree');
    await observer.rebuild('repository');
    const next = await observer.beginRun();
    writeFileSync(join(scope.root, 'src', 'cart', 'total.ts'), 'export const total = 3;\n');
    expect(await observer.endRun(next)).toEqual({
      changed: [{ part: 'working-tree', path: 'src/cart/total.ts' }],
      incomplete: [],
    });
  });

  it('a new folder flooded before it is watched: every file is found by listing it (C001-TS-579)', async () => {
    const { scope } = fixture();
    const observer = await startObserver(scope);
    const run = await observer.beginRun();
    const flood = join(scope.root, 'tmp', 'flood');
    mkdirSync(flood, { recursive: true });
    for (let i = 0; i < 20_000; i++) writeFileSync(join(flood, `f${i}.txt`), 'x');
    writeFileSync(join(scope.root, 'src', 'coupon', 'data.json'), '{"coupons":[9]}\n');
    const result = await observer.endRun(run);
    // C001-TS-579 accepts either outcome; here the folder's creation is the only queued event.
    if (result.incomplete.length === 0) {
      expect(result.changed).toHaveLength(20_001);
    } else {
      expect(result.incomplete.map((c) => c.cause)).toEqual(['events-lost']);
    }
  }, 120_000);

  it('a queue overflow is "events lost" for the whole working tree; unchanged paths are not listed after the rebuild (C001-TS-576, C001-TS-579)', async () => {
    const { scope } = fixture();
    const maxQueued = Number(readFileSync('/proc/sys/fs/inotify/max_queued_events', 'utf8'));
    // The folder exists and is watched before the run: every file created in it queues events.
    const flood = join(scope.root, 'tmp', 'flood');
    mkdirSync(flood, { recursive: true });
    const observer = await startObserver(scope);
    const run = await observer.beginRun();
    // Written synchronously: the observer cannot read the queue meanwhile, so it overflows.
    for (let i = 0; i < maxQueued + 500; i++) writeFileSync(join(flood, `f${i}.txt`), 'x');
    const result = await observer.endRun(run);
    expect(result.incomplete).toEqual([
      {
        cause: 'events-lost',
        name: 'events lost',
        parts: [{ part: 'working-tree', whole: true, count: 0, paths: [] }],
      },
    ]);
    // The rebuild after the loss (scheduled at low priority) completes; then a quiet run is clean.
    await observer.rebuild('working-tree');
    const next = await observer.beginRun();
    expect(await observer.endRun(next)).toEqual({ changed: [], incomplete: [] });
  }, 120_000);
});

/**
 * Runs the child under a user namespace whose inotify limits are set by `setup` (shell commands
 * run as the namespace's root). Unprivileged first; with passwordless sudo when unprivileged user
 * namespaces are restricted (Ubuntu 24.04 AppArmor). null when neither works.
 */
function inNamespace(setup: string, scope: ObserverScope): string | null {
  const script = `${setup} && exec "$0" --import tsx "$1" "$2"`;
  const args = [process.execPath, join(HERE, 'child.ts'), JSON.stringify(scope)];
  const attempts: [string, string[]][] = [
    ['unshare', ['--user', '--map-root-user', 'sh', '-c', script, ...args]],
    ['sudo', ['-n', 'unshare', '--user', '--map-root-user', 'sh', '-c', script, ...args]],
  ];
  for (const [cmd, cmdArgs] of attempts) {
    const res = spawnSync(cmd, cmdArgs, { cwd: REPO_ROOT, encoding: 'utf8', timeout: 60_000 });
    if (res.status === 0 && res.stdout.trim().startsWith('{')) return res.stdout;
  }
  return null;
}

/** Whether a user namespace with lowered inotify limits can be made here. */
function canLowerLimits(): boolean {
  if (process.platform !== 'linux') return false;
  const probe = 'echo 64 > /proc/sys/user/max_inotify_watches && echo ok';
  for (const [cmd, args] of [
    ['unshare', ['--user', '--map-root-user', 'sh', '-c', probe]],
    ['sudo', ['-n', 'unshare', '--user', '--map-root-user', 'sh', '-c', probe]],
  ] as [string, string[]][]) {
    const res = spawnSync(cmd, args, { encoding: 'utf8', timeout: 20_000 });
    if (res.status === 0 && res.stdout.includes('ok')) return true;
  }
  return false;
}

const limitsAvailable = canLowerLimits();
// On CI the watch-limit causes must be raised, never skipped (C001-T-017 "Done when").
const requireLimits = process.env.CI === 'true';

describe.skipIf(process.platform !== 'linux' || (!limitsAvailable && !requireLimits))(
  'inotify observer under lowered limits (C001-TC-551, C001-TS-575)',
  () => {
    /** Directories each part watches: the working tree outside .git, and the repository part. */
    function directories(scope: ObserverScope): { workingTree: string[]; repository: string[] } {
      const walk = (abs: string, rel: string, out: string[], skip: (r: string) => boolean) => {
        out.push(rel);
        for (const e of readdirSync(abs, { withFileTypes: true })) {
          const r = rel === '' ? e.name : `${rel}/${e.name}`;
          if (e.isDirectory() && !skip(r)) walk(join(abs, e.name), r, out, skip);
        }
        return out;
      };
      const workingTree = walk(scope.root, '', [], (r) => r === '.git');
      const repository = [''];
      walk(join(scope.gitDir, 'refs'), 'refs', repository, () => false);
      return { workingTree, repository };
    }

    it('lowered max_user_watches: refused directories are "watch limit" and cover every directory not watched', () => {
      expect(limitsAvailable, 'no user namespace with lowered inotify limits').toBe(true);
      const { scope } = fixture();
      for (let i = 4; i <= 12; i++) {
        const dir = join(scope.root, 'node_modules', `pkg${String(i).padStart(2, '0')}`);
        mkdirSync(join(dir, 'lib'), { recursive: true });
        writeFileSync(join(dir, 'lib', 'index.js'), '');
      }
      const dirs = directories(scope);
      const total = dirs.workingTree.length + dirs.repository.length;
      const limit = total - 12;
      const out = inNamespace(`echo ${limit} > /proc/sys/user/max_inotify_watches`, scope);
      expect(out, 'child under lowered limit').not.toBeNull();
      const result = JSON.parse(out!) as RunObservation;
      expect(result.changed).toEqual([]);
      const causes = result.incomplete.map((c) => c.cause);
      expect(causes).toEqual(['watch-limit']);
      // Every directory not watched lies at or below a reported path; exactly `limit` were watched.
      const reported = result.incomplete[0]!.parts.flatMap((p) =>
        p.paths.map((path) => ({ part: p.part, path })),
      );
      const covered = (part: string, rel: string) =>
        reported.some((r) => r.part === part && (rel === r.path || rel.startsWith(`${r.path}/`)));
      const notWatched =
        dirs.workingTree.filter((d) => d !== '' && covered('working-tree', d)).length +
        dirs.repository.filter((d) => d !== '' && covered('repository', d)).length;
      expect(notWatched).toBe(total - limit);
      expect(result.incomplete[0]!.parts.every((p) => !p.whole)).toBe(true);
    });

    it('lowered max_user_instances: no inotify instance is "watch limit" for both whole parts', () => {
      expect(limitsAvailable, 'no user namespace with lowered inotify limits').toBe(true);
      const { scope } = fixture();
      const out = inNamespace('echo 0 > /proc/sys/user/max_inotify_instances', scope);
      expect(out, 'child under lowered limit').not.toBeNull();
      const result = JSON.parse(out!) as RunObservation;
      expect(result.changed).toEqual([]);
      const watchLimit = result.incomplete.find((c) => c.cause === 'watch-limit');
      expect(watchLimit?.parts).toEqual([
        { part: 'working-tree', whole: true, count: 0, paths: [] },
        { part: 'repository', whole: true, count: 0, paths: [] },
      ]);
    });
  },
);
