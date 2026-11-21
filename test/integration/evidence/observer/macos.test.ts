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
import { afterEach, describe, expect, it } from 'vitest';
import { FixtureRepo } from '../../../fixtures/builder/fixture-repo.js';
import { macosBackendFactory } from '../../../../src/core/evidence/observer/macos.js';
import {
  Observer,
  type ObserverScope,
  type RunObservation,
} from '../../../../src/core/evidence/observer/observer.js';

/**
 * C001-TC-552 (macOS): the FSEvents observer on real working trees (C001-T-018; C001-TS-570,
 * C001-TS-571, C001-TS-577, C001-TS-578 at the observer's level), run on the macOS arm64 and
 * x86-64 CI runners. Causes raised on real FSEvents: an unlistable directory (not readable), the
 * working-tree root renamed (`RootChanged`: observation interrupted). Watch limit is never raised
 * on macOS. Events lost (`MustScanSubDirs`, `UserDropped`, `KernelDropped`) cannot be forced on
 * demand: the flood test accepts it or a complete list, as C001-TS-579 does, and logs which one;
 * the mapping of each flag is tested in test/unit/evidence/observer/macos-flags.test.ts.
 */

const isRoot = process.getuid?.() === 0;

const cleanups: (() => void)[] = [];
afterEach(() => {
  while (cleanups.length > 0) cleanups.pop()!();
});

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
  // FSEvents reports canonical paths (/private/var/... for /var/...).
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
  const observer = await Observer.start({
    scope,
    factory: macosBackendFactory({ pollMs: 20 }),
    schedule: () => undefined,
  });
  cleanups.push(() => void observer.stop());
  return observer;
}

const changedPaths = (r: RunObservation) => r.changed.map((c) => `${c.part}:${c.path}`);

function readEverything(dir: string): void {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    statSync(full);
    if (entry.isDirectory()) readEverything(full);
    else readFileSync(full);
  }
}

describe.skipIf(process.platform !== 'darwin')('FSEvents observer (C001-TC-552)', () => {
  it('reports nothing for a run that only reads the working tree and the repository', async () => {
    const { repo, scope } = fixture();
    const observer = await startObserver(scope);
    const run = await observer.beginRun();
    readEverything(scope.root);
    repo.git('rev-parse', 'HEAD');
    repo.git('log', '--oneline');
    expect(await observer.endRun(run)).toEqual({ changed: [], incomplete: [] });
  });

  it('a change right after the observer starts is not missed (startup barrier)', async () => {
    const { scope } = fixture();
    const observer = await startObserver(scope);
    const run = await observer.beginRun();
    writeFileSync(join(scope.root, 'src', 'cart', 'total.ts'), 'export const total = 2;\n');
    expect(changedPaths(await observer.endRun(run))).toEqual(['working-tree:src/cart/total.ts']);
  });

  it('a developer edit during a run is reported with its path (C001-TS-570)', async () => {
    const { scope } = fixture();
    const observer = await startObserver(scope);
    const run = await observer.beginRun();
    await new Promise((r) => setTimeout(r, 50));
    writeFileSync(join(scope.root, 'src', 'cart', 'total.ts'), 'export const total = 5;\n');
    await new Promise((r) => setTimeout(r, 50));
    expect(await observer.endRun(run)).toEqual({
      changed: [{ part: 'working-tree', path: 'src/cart/total.ts' }],
      incomplete: [],
    });
  });

  it('every new file is counted and named: 0, 1, 10 and 11 files (C001-TS-571)', async () => {
    const { scope } = fixture();
    const observer = await startObserver(scope);
    for (const n of [0, 1, 10, 11]) {
      rmSync(join(scope.root, 'tmp'), { recursive: true, force: true });
      const settle = await observer.beginRun();
      await observer.endRun(settle);
      const run = await observer.beginRun();
      if (n > 0) mkdirSync(join(scope.root, 'tmp'), { recursive: true });
      for (let i = 1; i <= n; i++) {
        writeFileSync(join(scope.root, 'tmp', `f${String(i).padStart(2, '0')}.txt`), 'x');
      }
      const result = await observer.endRun(run);
      expect(result.incomplete).toEqual([]);
      expect(changedPaths(result)).toEqual(
        Array.from(
          { length: n },
          (_, i) => `working-tree:tmp/f${String(i + 1).padStart(2, '0')}.txt`,
        ),
      );
    }
  });

  it('reports files written into a new ignored folder, not the folder (C001-TS-568)', async () => {
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

  it('reports a rewritten, a removed and an ignored file, and a deep new tree', async () => {
    const { scope } = fixture();
    const observer = await startObserver(scope);
    const run = await observer.beginRun();
    writeFileSync(join(scope.root, 'src', 'coupon', 'data.json'), '{"coupons":[1,2,3]}\n');
    rmSync(join(scope.root, 'README.md'));
    writeFileSync(join(scope.root, 'node_modules', 'pkg02', 'index.js'), 'module.exports = 0;\n');
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
    const next = await observer.beginRun();
    writeFileSync(join(scope.root, 'src', 'offer', 'rules.ts'), 'export const rules = [1];\n');
    expect(changedPaths(await observer.endRun(next))).toEqual(['working-tree:src/offer/rules.ts']);
  });

  it('reports a tag and a staged file in the repository part, never a lock file (C001-TS-572)', async () => {
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

  it.skipIf(isRoot)(
    'an unlistable directory is "not readable" by its path; no change reported (C001-TS-577)',
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

  it.skipIf(isRoot)(
    'an unlistable git directory is "not readable" for the whole repository part (C001-TS-577)',
    async () => {
      const { scope } = fixture();
      const mode = statSync(scope.gitDir).mode;
      chmodSync(scope.gitDir, 0o000);
      cleanups.push(() => chmodSync(scope.gitDir, mode));
      const observer = await startObserver(scope);
      const run = await observer.beginRun();
      const result = await observer.endRun(run);
      expect(result.changed).toEqual([]);
      expect(result.incomplete).toEqual([
        {
          cause: 'not-readable',
          name: 'not readable',
          parts: [{ part: 'repository', whole: true, count: 0, paths: [] }],
        },
      ]);
    },
  );

  it('the working-tree root renamed during a run is "observation interrupted" (RootChanged); observation resumes after', async () => {
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

  it('a flood cannot hide a write: events lost for a part holding it, or every path listed (C001-TS-579)', async () => {
    const { scope } = fixture();
    const flood = join(scope.root, 'tmp', 'flood');
    mkdirSync(flood, { recursive: true });
    const observer = await startObserver(scope);
    const run = await observer.beginRun();
    // Written synchronously: the run loop is not run meanwhile, so FSEvents may drop events.
    for (let i = 0; i < 20_000; i++) writeFileSync(join(flood, `f${i}.txt`), 'x');
    writeFileSync(join(scope.root, 'src', 'coupon', 'data.json'), '{"coupons":[9]}\n');
    const result = await observer.endRun(run);
    const lost = result.incomplete.find((c) => c.cause === 'events-lost');
    console.info(
      `FSEvents flood: ${lost ? `events lost (${JSON.stringify(lost.parts)})` : `${result.changed.length} paths listed`}`,
    );
    const target = 'src/coupon/data.json';
    if (lost) {
      // The write is not hidden: it lies in a part reported as lost, or it is listed.
      const wt = lost.parts.find((p) => p.part === 'working-tree');
      const covered =
        wt !== undefined &&
        (wt.whole || wt.paths.some((p) => target === p || target.startsWith(`${p}/`)));
      expect(covered || changedPaths(result).includes(`working-tree:${target}`)).toBe(true);
    } else {
      expect(result.incomplete).toEqual([]);
      expect(result.changed).toHaveLength(20_001);
    }
  }, 120_000);
});
