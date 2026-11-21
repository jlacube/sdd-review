import { execFileSync } from 'node:child_process';
import {
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
import { windowsBackendFactory } from '../../../../src/core/evidence/observer/windows.js';
import {
  Observer,
  type ObserverScope,
  type RunObservation,
} from '../../../../src/core/evidence/observer/observer.js';

/**
 * C001-TC-552 (Windows): the ReadDirectoryChangesW observer on real working trees (C001-T-018;
 * C001-TS-570, C001-TS-571, C001-TS-577, C001-TS-578 at the observer's level). Each Windows cause
 * of the C001-ADR-006 §9 table is raised: an unlistable directory (not readable), a buffer
 * overflow (events lost), the working-tree root renamed and removed (observation interrupted).
 * Watch limit is never raised on Windows. Paths that did not change are never reported.
 */

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
  const root = realpathSync.native(repo.dir);
  cleanups.push(() => {
    try {
      execFileSync('icacls', [join(root, 'data', 'private'), '/remove:d', '*S-1-1-0'], {
        stdio: 'ignore',
      });
    } catch {
      /* not created by this test */
    }
    rmSync(root, { recursive: true, force: true, maxRetries: 5 });
  });
  return { repo, scope: { root, gitDir: join(root, '.git'), commonGitDir: join(root, '.git') } };
}

async function startObserver(scope: ObserverScope): Promise<Observer> {
  const observer = await Observer.start({
    scope,
    factory: windowsBackendFactory({ pollMs: 20 }),
    schedule: () => undefined,
  });
  // Stopped before the fixture is removed (cleanups run last-in, first-out).
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

describe.skipIf(process.platform !== 'win32')(
  'ReadDirectoryChangesW observer (C001-TC-552)',
  () => {
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
      expect(changedPaths(await observer.endRun(next))).toEqual([
        'working-tree:src/offer/rules.ts',
      ]);
    });

    it('a directory moved in from outside the tree: every file in it', async () => {
      const { scope } = fixture();
      const outside = `${scope.root}-outside`;
      mkdirSync(join(outside, 'pkg', 'lib'), { recursive: true });
      writeFileSync(join(outside, 'pkg', 'lib', 'a.js'), 'a');
      writeFileSync(join(outside, 'pkg', 'b.js'), 'b');
      cleanups.push(() => rmSync(outside, { recursive: true, force: true }));
      const observer = await startObserver(scope);
      const run = await observer.beginRun();
      renameSync(join(outside, 'pkg'), join(scope.root, 'vendor-pkg'));
      const result = await observer.endRun(run);
      expect(changedPaths(result)).toEqual([
        'working-tree:vendor-pkg/b.js',
        'working-tree:vendor-pkg/lib/a.js',
      ]);
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

    it('an unlistable directory is "not readable" by its path; no change reported (C001-TS-577)', async () => {
      const { scope } = fixture();
      const priv = join(scope.root, 'data', 'private');
      mkdirSync(priv, { recursive: true });
      writeFileSync(join(priv, 'secret.txt'), 's');
      // Everyone is denied listing the directory.
      execFileSync('icacls', [priv, '/deny', '*S-1-1-0:(RD)'], { stdio: 'ignore' });
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
    });

    it('a git directory that cannot be listed is "not readable" for the whole repository part (C001-TS-577)', async () => {
      const { scope } = fixture();
      execFileSync('icacls', [scope.gitDir, '/deny', '*S-1-1-0:(RD)'], { stdio: 'ignore' });
      cleanups.push(() =>
        execFileSync('icacls', [scope.gitDir, '/remove:d', '*S-1-1-0'], { stdio: 'ignore' }),
      );
      const observer = await startObserver(scope);
      const run = await observer.beginRun();
      readEverything(join(scope.root, 'src'));
      const result = await observer.endRun(run);
      expect(result.changed).toEqual([]);
      expect(result.incomplete).toEqual([
        {
          cause: 'not-readable',
          name: 'not readable',
          parts: [{ part: 'repository', whole: true, count: 0, paths: [] }],
        },
      ]);
    });

    it('a git directory that is missing interrupts the observation of the repository part only', async () => {
      const { scope } = fixture();
      const missing: ObserverScope = { ...scope, gitDir: join(scope.root, 'no-such-git-dir') };
      const observer = await startObserver({ ...missing, commonGitDir: missing.gitDir });
      const run = await observer.beginRun();
      const result = await observer.endRun(run);
      // A missing git directory is gone, not unreadable: the observation of that part is
      // interrupted; the working-tree part is complete.
      expect(result.incomplete).toEqual([
        {
          cause: 'observation-interrupted',
          name: 'observation interrupted',
          parts: [{ part: 'repository', whole: true, count: 0, paths: [] }],
        },
      ]);
    });

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

    it('the working-tree root removed during a run is "observation interrupted" next to its changes (C001-TS-578)', async () => {
      const { scope } = fixture();
      const observer = await startObserver(scope);
      const run = await observer.beginRun();
      writeFileSync(join(scope.root, 'src', 'cart', 'total.ts'), 'export const total = 4;\n');
      rmSync(scope.root, { recursive: true, force: true, maxRetries: 5 });
      const result = await observer.endRun(run);
      expect(changedPaths(result)).toContain('working-tree:src/cart/total.ts');
      const interrupted = result.incomplete.find((c) => c.cause === 'observation-interrupted');
      expect(interrupted?.parts).toContainEqual({
        part: 'working-tree',
        whole: true,
        count: 0,
        paths: [],
      });
    });

    it('a buffer overflow is "events lost" for the whole working tree; a quiet run after the rebuild is clean (C001-TS-579)', async () => {
      const { scope } = fixture();
      const flood = join(scope.root, 'tmp', 'flood');
      mkdirSync(flood, { recursive: true });
      const observer = await startObserver(scope);
      const run = await observer.beginRun();
      // Written synchronously with long names: the observer cannot read meanwhile, so the 64 KiB
      // buffer overflows.
      for (let i = 0; i < 5000; i++) {
        writeFileSync(join(flood, `a-rather-long-file-name-to-fill-the-buffer-${i}.txt`), 'x');
      }
      const result = await observer.endRun(run);
      // The git directory below the root is watched through a handle on the root (C001-ADR-006
      // §9), so that handle overflows too: "whole part of that handle" is the repository part.
      expect(result.incomplete).toEqual([
        {
          cause: 'events-lost',
          name: 'events lost',
          parts: [
            { part: 'working-tree', whole: true, count: 0, paths: [] },
            { part: 'repository', whole: true, count: 0, paths: [] },
          ],
        },
      ]);
      await observer.rebuild('working-tree');
      await observer.rebuild('repository');
      const next = await observer.beginRun();
      expect(await observer.endRun(next)).toEqual({ changed: [], incomplete: [] });
    }, 120_000);
  },
);
