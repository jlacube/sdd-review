import { execFileSync } from 'node:child_process';
import {
  chmodSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  utimesSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FixtureRepo } from '../../fixtures/builder/fixture-repo.js';
import { GitAdapter } from '../../../src/core/git/operations.js';
import { hashBlob } from '../../../src/core/git/worktree-compare.js';
import { isReviewError, ReviewError } from '../../../src/core/errors/review-error.js';
import { ContextualLog } from '../../../src/core/log/log.js';
import type { ChangedFile } from '../../../src/core/git/port.js';
import { GIT_VERSIONS } from '../../integration/git/support/versions.js';

// C001-IF-012 §3 operations G-01 to G-16 against fixture repositories, in both object formats.
// Runs on the git of PATH, and on the programs named by SDD_GIT_234 and SDD_GIT_LATEST when set.

// Each test builds a repository with a few dozen git processes: slow on Windows.
vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 });

const numbered = (from: number, to: number, tag = '') =>
  Array.from({ length: to - from + 1 }, (_, i) => `line ${from + i}${tag}\n`).join('');

function gitIn(fx: FixtureRepo, args: string[], input?: string): string {
  return execFileSync('git', args, { cwd: fx.dir, env: fx.env(), input, encoding: 'utf8' }).trim();
}

const real = (p: string) => realpathSync.native(p);
const byPath = (files: readonly ChangedFile[]) => new Map(files.map((f) => [f.path, f]));

describe.each(GIT_VERSIONS.filter((v) => v.path !== undefined))(
  'git operations on $label',
  ({ path: gitPath }) => {
    describe.each(['sha1', 'sha256'] as const)('object format %s', (format) => {
      let fx: FixtureRepo;
      let adapter: GitAdapter;
      let scratch: string;
      let b0: string;

      beforeEach(async () => {
        scratch = mkdtempSync(join(tmpdir(), 'sddops-'));
        fx = FixtureRepo.create({ objectFormat: format });
        b0 = fx.commit('B0', {
          files: {
            'src/a.txt': numbered(1, 10),
            'src/b.txt': numbered(1, 8, ' b'),
            'src/c.txt': numbered(1, 6, ' c'),
            'docs/readme.md': '# readme\n',
            'bin.dat': Buffer.from([0, 1, 2, 3]),
          },
        }).hash;
        adapter = new GitAdapter({ gitPath });
        await adapter.discover(fx.dir);
      });
      afterEach(async () => {
        await adapter.close();
        fx.dispose();
        rmSync(scratch, { recursive: true, force: true });
      });

      it('G-01 discover: root, git directories, object format; errors', async () => {
        fx.write('deep/er/file.txt', 'x\n');
        const location = await new GitAdapter({ gitPath }).discover(join(fx.dir, 'deep', 'er'));
        expect(real(location.workTreeRoot)).toBe(real(fx.dir));
        expect(real(location.gitDir)).toBe(real(join(fx.dir, '.git')));
        expect(real(location.commonGitDir)).toBe(real(join(fx.dir, '.git')));
        expect(location.objectFormat).toBe(format);
        expect(b0).toHaveLength(format === 'sha256' ? 64 : 40);
        const outside = mkdtempSync(join(tmpdir(), 'sddout-'));
        try {
          await expect(new GitAdapter({ gitPath }).discover(outside)).rejects.toMatchObject({
            code: 'ERR-INTAKE-001',
          });
        } finally {
          rmSync(outside, { recursive: true, force: true });
        }
      });

      it('G-01 discover: the inside of the .git directory is not a working tree', async () => {
        await expect(
          new GitAdapter({ gitPath }).discover(join(fx.dir, '.git')),
        ).rejects.toMatchObject({ code: 'ERR-INTAKE-001' });
      });

      it('every other operation before discover fails loudly', async () => {
        await expect(new GitAdapter({ gitPath }).head()).rejects.toMatchObject({
          code: 'ERR-CLI-003',
        });
      });

      it('G-02 head: commit and branch, detached, and a repository without a commit', async () => {
        expect(await adapter.head()).toEqual({ commit: b0, branch: 'refs/heads/main' });
        fx.checkout(b0);
        expect(await adapter.head()).toEqual({ commit: b0, branch: null });
        const empty = FixtureRepo.create({ objectFormat: format });
        const other = new GitAdapter({ gitPath });
        try {
          await other.discover(empty.dir);
          await expect(other.head()).rejects.toMatchObject({ code: 'ERR-INTAKE-002' });
        } finally {
          await other.close();
          empty.dispose();
        }
      });

      it('G-03 resolveCommit: accepted forms and refused values', async () => {
        const c1 = fx.commit('C1', { files: { 'src/a.txt': numbered(1, 11) } }).hash;
        fx.branch('feature/x');
        gitIn(fx, ['tag', 'v1', b0]);
        gitIn(fx, ['tag', '-a', 'v2', '-m', 'annotated', b0]);
        expect(await adapter.resolveCommit(c1)).toBe(c1);
        expect(await adapter.resolveCommit(c1.slice(0, 10))).toBe(c1);
        expect(await adapter.resolveCommit('HEAD')).toBe(c1);
        expect(await adapter.resolveCommit('feature/x')).toBe(c1);
        expect(await adapter.resolveCommit('HEAD~1')).toBe(b0);
        expect(await adapter.resolveCommit('HEAD^')).toBe(b0);
        expect(await adapter.resolveCommit('v1')).toBe(b0);
        expect(await adapter.resolveCommit('v2')).toBe(b0);
        for (const bad of [
          '',
          '-x',
          '--output=x',
          'HEAD..main',
          'a\nb',
          'a\u0000b',
          'no-such-ref',
          'HEAD^{tree}',
          `${b0.slice(0, 3)}`,
        ]) {
          const error = await adapter.resolveCommit(bad).catch((e: unknown) => e);
          expect(isReviewError(error), JSON.stringify(bad)).toBe(true);
          expect((error as ReviewError).code, JSON.stringify(bad)).toBe('ERR-INTAKE-003');
        }
      });

      it('G-04 mergeBase: the fork point, and none for unrelated histories', async () => {
        const c1 = fx.commit('C1', { files: { 'src/a.txt': numbered(1, 11) } }).hash;
        gitIn(fx, ['checkout', '-q', '-b', 'topic', b0]);
        const t1 = fx.commit('T1', { files: { 't.txt': 't\n' } }).hash;
        expect(await adapter.mergeBase(c1, t1)).toBe(b0);
        expect(await adapter.mergeBase('main', 'topic')).toBe(b0);
        gitIn(fx, ['checkout', '-q', '--orphan', 'lonely']);
        gitIn(fx, ['rm', '-rf', '-q', '.']);
        const o1 = fx.commit('O1', { files: { 'o.txt': 'o\n' } }).hash;
        expect(await adapter.mergeBase(o1, c1)).toBeNull();
        await expect(adapter.mergeBase('-x', c1)).rejects.toMatchObject({ code: 'ERR-INTAKE-003' });
      });

      it('G-05 upstream: from the branch configuration, none without it', async () => {
        expect(await adapter.upstream('main')).toBeNull();
        gitIn(fx, ['remote', 'add', 'origin', 'https://example.invalid/x.git']);
        gitIn(fx, ['config', 'branch.main.remote', 'origin']);
        gitIn(fx, ['config', 'branch.main.merge', 'refs/heads/main']);
        expect(await adapter.upstream('main')).toBeNull(); // no remote-tracking ref yet
        gitIn(fx, ['update-ref', 'refs/remotes/origin/main', b0]);
        const expected = { ref: 'refs/remotes/origin/main', commit: b0 };
        expect(await adapter.upstream('main')).toEqual(expected);
        expect(await adapter.upstream('refs/heads/main')).toEqual(expected);
        gitIn(fx, ['config', 'branch.local.remote', '.']);
        gitIn(fx, ['config', 'branch.local.merge', 'refs/heads/main']);
        expect(await adapter.upstream('local')).toEqual({ ref: 'refs/heads/main', commit: b0 });
        expect(await adapter.upstream('HEAD')).toBeNull();
      });

      it('G-06 commitsBetween: oldest first, merges included, with author and files', async () => {
        const c1 = fx.commit('C1', { files: { 'src/a.txt': numbered(1, 11) } }).hash;
        gitIn(fx, ['checkout', '-q', '-b', 'topic']);
        const t1 = fx.commit('T1', { files: { 't.txt': 't\n' } }).hash;
        gitIn(fx, ['checkout', '-q', 'main']);
        const c2 = fx.commit('C2', { files: { 'new/x.txt': 'x\n' } }).hash;
        gitIn(fx, ['merge', '--no-ff', '-q', 'topic', '-m', 'merge topic']);
        const m = gitIn(fx, ['rev-parse', 'HEAD']);
        const commits = await adapter.commitsBetween(b0, 'HEAD');
        const order = commits.map((c) => c.hash);
        expect([...order].sort()).toEqual([c1, c2, t1, m].sort());
        expect(order.indexOf(c1)).toBeLessThan(order.indexOf(c2));
        expect(order.indexOf(c1)).toBeLessThan(order.indexOf(t1));
        expect(order.at(-1)).toBe(m);
        const byHash = new Map(commits.map((c) => [c.hash, c]));
        expect(byHash.get(c1)).toMatchObject({
          parents: [b0],
          authorName: 'Fixture Author',
          authorEmail: 'fixture@example.test',
          message: 'C1: commit',
          changedFiles: ['src/a.txt'],
        });
        expect(byHash.get(c1)!.authorTime).toMatch(/^2026-01-01T/);
        expect(byHash.get(m)!.parents).toHaveLength(2);
        expect(byHash.get(m)!.changedFiles).toEqual(['t.txt']);
        expect(await adapter.commitsBetween('HEAD', 'HEAD')).toEqual([]);
      });

      describe('G-07 changeAgainst', () => {
        it('lists staged, unstaged, untracked and deleted changes, and skips ignored files', async () => {
          fx.write('src/a.txt', `${numbered(1, 10)}extra\n`);
          fx.write('src/b.txt', 'staged\n').stage('src/b.txt');
          fx.write('new/staged.txt', 's\n').stage('new/staged.txt');
          fx.write('new/untracked.txt', 'u\n');
          fx.remove('src/c.txt');
          fx.ignore('*.log').write('x.log', 'log\n');
          const files = byPath(await adapter.changeAgainst(b0));
          expect([...files.keys()].sort()).toEqual(
            [
              '.gitignore',
              'new/staged.txt',
              'new/untracked.txt',
              'src/a.txt',
              'src/b.txt',
              'src/c.txt',
            ].sort(),
          );
          const a = files.get('src/a.txt')!;
          expect(a).toMatchObject({ changeType: 'modified', previousPath: null, binary: false });
          expect(a.baseContent!.toString()).toBe(numbered(1, 10));
          expect(a.currentContent!.toString()).toBe(`${numbered(1, 10)}extra\n`);
          expect(a.baseMode).toBe('regular');
          expect(a.currentMode).toBe('regular');
          // the content hash is the blob hash of the repository's object format
          expect(a.contentHash).toBe(gitIn(fx, ['hash-object', 'src/a.txt']));
          expect(a.contentHash).toBe(hashBlob(Buffer.from(`${numbered(1, 10)}extra\n`), format));
          expect(files.get('src/b.txt')!.currentContent!.toString()).toBe('staged\n');
          expect(files.get('new/staged.txt')!.changeType).toBe('added');
          expect(files.get('new/untracked.txt')!.changeType).toBe('added');
          expect(files.get('new/untracked.txt')!.baseContent).toBeNull();
          const c = files.get('src/c.txt')!;
          expect(c).toMatchObject({
            changeType: 'deleted',
            contentHash: null,
            currentContent: null,
          });
          expect(c.baseContent!.toString()).toBe(numbered(1, 6, ' c'));
        });

        it('lists nothing when the working tree equals the base, also after a staged edit was undone', async () => {
          expect(await adapter.changeAgainst(b0)).toEqual([]);
          const original = fx.read('src/a.txt');
          fx.write('src/a.txt', 'edited\n').stage('src/a.txt');
          fx.write('src/a.txt', original);
          expect(await adapter.changeAgainst(b0)).toEqual([]);
        });

        it('compares a commit on HEAD with the working tree, and an unborn base fails', async () => {
          const c1 = fx.commit('C1', { files: { 'src/a.txt': 'one\n' } }).hash;
          expect([...byPath(await adapter.changeAgainst(b0)).keys()]).toEqual(['src/a.txt']);
          expect(await adapter.changeAgainst(c1)).toEqual([]);
          await expect(adapter.changeAgainst('nope')).rejects.toMatchObject({
            code: 'ERR-INTAKE-003',
          });
        });

        it('flags binary files and gives no text for them', async () => {
          fx.write('bin.dat', Buffer.from([0, 9, 9, 9, 9]));
          fx.write('src/a.txt', 'text\n');
          const files = byPath(await adapter.changeAgainst(b0));
          expect(files.get('bin.dat')).toMatchObject({
            binary: true,
            baseContent: null,
            currentContent: null,
          });
          expect(files.get('src/a.txt')!.binary).toBe(false);
        });

        it('detects renames at 50 % similarity, with the previous path', async () => {
          fx.moveInWorkingTree('src/c.txt', 'src/moved/c.txt');
          fx.write('src/moved/c.txt', `${numbered(1, 6, ' c')}added\n`);
          fx.moveInWorkingTree('src/b.txt', 'other/b.txt');
          fx.write('other/b.txt', 'completely different\n');
          const files = byPath(await adapter.changeAgainst(b0));
          expect(files.get('src/moved/c.txt')).toMatchObject({
            changeType: 'renamed',
            previousPath: 'src/c.txt',
          });
          expect(files.has('src/c.txt')).toBe(false);
          expect(files.get('src/moved/c.txt')!.baseContent!.toString()).toBe(numbered(1, 6, ' c'));
          expect(files.get('other/b.txt')!.changeType).toBe('added');
          expect(files.get('src/b.txt')!.changeType).toBe('deleted');
        });

        it('reports an edit hidden by assume-unchanged (git itself does not see it)', async () => {
          gitIn(fx, ['update-index', '--assume-unchanged', 'src/a.txt', 'src/b.txt']);
          fx.write('src/a.txt', `${numbered(1, 10)}hidden\n`);
          fx.remove('src/b.txt');
          // control: the git diff against the working tree does not show them
          expect(gitIn(fx, ['diff', '--name-only', b0])).toBe('');
          const files = byPath(await adapter.changeAgainst(b0));
          expect(files.get('src/a.txt')!.changeType).toBe('modified');
          expect(files.get('src/a.txt')!.currentContent!.toString()).toContain('hidden');
          expect(files.get('src/b.txt')!.changeType).toBe('deleted');
        });

        it('reports an edit of a skip-worktree file that is present', async () => {
          gitIn(fx, ['update-index', '--skip-worktree', 'src/a.txt']);
          fx.write('src/a.txt', 'skip-worktree edit\n');
          const files = byPath(await adapter.changeAgainst(b0));
          expect(files.get('src/a.txt')!.currentContent!.toString()).toBe('skip-worktree edit\n');
        });

        it('reports an edit that keeps size and modification time (forged stat data)', async () => {
          const p = fx.path('src/a.txt');
          const original = readFileSync(p);
          gitIn(fx, ['update-index', '--refresh']);
          const forged = Buffer.from(original.toString().replace('line 3', 'LINE 3'));
          expect(forged.length).toBe(original.length);
          const before = { atime: new Date(), mtime: new Date(Date.now() - 600_000) };
          utimesSync(p, before.atime, before.mtime);
          gitIn(fx, ['add', 'src/a.txt']); // the entry now records the old time stamp
          fx.write('src/a.txt', forged);
          utimesSync(p, before.atime, before.mtime);
          const files = byPath(await adapter.changeAgainst(b0));
          expect(files.get('src/a.txt')!.currentContent!.toString()).toContain('LINE 3');
        });

        it('keeps a skip-worktree file that a program deleted, with its index blob', async () => {
          gitIn(fx, ['update-index', '--skip-worktree', 'src/a.txt']);
          fx.remove('src/a.txt');
          expect([...byPath(await adapter.changeAgainst(b0)).keys()]).toEqual([]);
        });

        it.each([
          ['a cone sparse checkout', ['sparse-checkout', 'init', '--cone']],
          [
            'a cone sparse checkout with a sparse index',
            ['sparse-checkout', 'init', '--cone', '--sparse-index'],
          ],
        ])('reads a path outside %s from its index entry', async (_name, init) => {
          const sp = FixtureRepo.create({ objectFormat: format });
          const other = new GitAdapter({ gitPath });
          try {
            const base = sp.commit('B0', {
              files: {
                'a/x.txt': 'x\n',
                'b/y.txt': 'y\n',
                'b/deep/z.txt': 'z\n',
                'top.txt': 't\n',
              },
            }).hash;
            const c1 = sp.commit('C1', { files: { 'b/y.txt': 'y changed\n' } }).hash;
            try {
              gitIn(sp, init);
              gitIn(sp, ['sparse-checkout', 'set', 'a']);
            } catch {
              return; // this git does not know the option
            }
            expect(() => readFileSync(sp.path('b/y.txt'))).toThrow();
            await other.discover(sp.dir);
            const files = byPath(await other.changeAgainst(base));
            expect([...files.keys()]).toEqual(['b/y.txt']);
            expect(files.get('b/y.txt')!.currentContent!.toString()).toBe('y changed\n');
            expect(files.get('b/y.txt')!.baseContent!.toString()).toBe('y\n');
            expect(await other.changeAgainst(c1)).toEqual([]);
            // an edit inside the cone is compared by its bytes
            sp.write('a/x.txt', 'edited\n');
            expect([...byPath(await other.changeAgainst(c1)).keys()]).toEqual(['a/x.txt']);
          } finally {
            await other.close();
            sp.dispose();
          }
        });

        it('follows the ignore rules: .gitignore, .git/info/exclude and core.excludesFile; tracked files are never ignored', async () => {
          const globalIgnore = join(scratch, 'global-ignore');
          writeFileSync(globalIgnore, '*.global\n');
          fx.setConfig('core.excludesFile', globalIgnore);
          writeFileSync(join(fx.dir, '.git', 'info', 'exclude'), 'secret/\n');
          fx.ignore('src/a.txt'); // a tracked file named by an ignore rule
          fx.write('src/a.txt', 'tracked and ignored, edited\n');
          fx.write('x.global', 'g\n').write('secret/k.txt', 'k\n').write('visible.txt', 'v\n');
          const files = byPath(await adapter.changeAgainst(b0));
          expect([...files.keys()].sort()).toEqual(['.gitignore', 'src/a.txt', 'visible.txt']);
        });

        it('applies end-of-line conversion as git does, and no other conversion', async () => {
          const crlf = (text: string) => text.replace(/\n/g, '\r\n');
          const a = numbered(1, 10);
          // no setting: CRLF bytes differ from the LF blob
          fx.write('src/a.txt', crlf(a));
          expect(byPath(await adapter.changeAgainst(b0)).get('src/a.txt')!.changeType).toBe(
            'modified',
          );
          // core.autocrlf=true: line endings do not count as changes
          fx.setConfig('core.autocrlf', 'true');
          expect(await adapter.changeAgainst(b0)).toEqual([]);
          // a -text attribute turns the conversion off for that path
          fx.attribute('src/a.txt -text');
          expect([...byPath(await adapter.changeAgainst(b0)).keys()]).toContain('src/a.txt');
          fx.remove('.gitattributes');
          // the text attribute converts without core.autocrlf
          fx.setConfig('core.autocrlf', 'false');
          fx.attribute('*.txt text');
          const files = byPath(await adapter.changeAgainst(b0));
          expect([...files.keys()]).toEqual(['.gitattributes']);
        });

        it.skipIf(process.platform === 'win32')(
          'reports mode changes and symbolic links',
          async () => {
            chmodSync(fx.path('src/a.txt'), 0o755);
            fx.setConfig('core.fileMode', 'true');
            symlinkSync('src/a.txt', fx.path('link'));
            const files = byPath(await adapter.changeAgainst(b0));
            expect(files.get('src/a.txt')).toMatchObject({
              changeType: 'modified',
              baseMode: 'regular',
              currentMode: 'executable',
            });
            expect(files.get('link')).toMatchObject({
              changeType: 'added',
              currentMode: 'symlink',
            });
            expect(files.get('link')!.currentContent!.toString()).toBe('src/a.txt');
          },
        );
      });

      it('G-08 readBlob: bytes, none for a missing path or a directory', async () => {
        fx.commit('C1', { files: { 'my dir/with space.txt': 'spaced\n' } });
        expect((await adapter.readBlob(b0, 'src/a.txt'))!.toString()).toBe(numbered(1, 10));
        expect((await adapter.readBlob('HEAD', 'my dir/with space.txt'))!.toString()).toBe(
          'spaced\n',
        );
        expect(await adapter.readBlob(b0, 'my dir/with space.txt')).toBeNull();
        expect(await adapter.readBlob(b0, 'nope.txt')).toBeNull();
        expect(await adapter.readBlob(b0, 'src')).toBeNull();
        expect(await adapter.readBlob(b0, 'bin.dat')).toEqual(Buffer.from([0, 1, 2, 3]));
      });

      describe('G-09 attributeLines', () => {
        it('attributes added and deleted lines to the commit or to "uncommitted"', async () => {
          const c1 = fx.commit('C1', {
            files: { 'src/a.txt': numbered(1, 10).replace('line 2\n', '') + 'added in C1\n' },
          }).hash;
          const c2 = fx.commit('C2', {
            files: { 'src/a.txt': numbered(1, 10).replace(/line (2|9)\n/g, '') },
          }).hash;
          // working tree: line 1 deleted, one line added
          fx.write('src/a.txt', `${numbered(2, 10).replace(/line (2|9)\n/g, '')}uncommitted add\n`);
          const result = await adapter.attributeLines(b0, c2, 'src/a.txt');
          // base lines gone: line 1 (uncommitted), line 2 (C1), line 9 (C2); the line that C1
          // added and C2 deleted is in neither side of the change
          expect(result.deleted).toEqual([null, c1, c2]);
          expect(result.added).toEqual([null]);
        });

        it('follows a file through a rename', async () => {
          gitIn(fx, ['mv', 'src/b.txt', 'src/moved.txt']);
          fx.write('src/moved.txt', `${numbered(1, 8, ' b')}moved add\n`);
          const c1 = fx.commit('C1', {}).hash;
          const result = await adapter.attributeLines(b0, c1, 'src/moved.txt');
          expect(result).toEqual({ added: [c1], deleted: [] });
        });

        it('attributes every line of a new or deleted file to the working tree', async () => {
          fx.write('fresh.txt', 'one\ntwo\n');
          expect(await adapter.attributeLines(b0, 'HEAD', 'fresh.txt')).toEqual({
            added: [null, null],
            deleted: [],
          });
          fx.remove('src/c.txt');
          const gone = await adapter.attributeLines(b0, 'HEAD', 'src/c.txt');
          expect(gone.added).toEqual([]);
          expect(gone.deleted).toEqual(Array(6).fill(null));
        });

        it('has no lines for binary files', async () => {
          fx.write('bin.dat', Buffer.from([0, 7, 7]));
          expect(await adapter.attributeLines(b0, 'HEAD', 'bin.dat')).toEqual({
            added: [],
            deleted: [],
          });
        });
      });

      it('G-10 userIdentity: the repository configuration only; empty or blank is none', async () => {
        const env = {
          ...process.env,
          GIT_AUTHOR_NAME: 'Env Name',
          GIT_COMMITTER_EMAIL: 'env@x.test',
        };
        const withEnv = new GitAdapter({ gitPath, baseEnv: env });
        await withEnv.discover(fx.dir);
        expect(await withEnv.userIdentity()).toEqual({
          name: 'Fixture Author',
          email: 'fixture@example.test',
        });
        fx.setConfig('user.name', '   ').setConfig('user.email', '');
        expect(await withEnv.userIdentity()).toEqual({ name: null, email: null });
        await withEnv.close();
        const isolated = {
          ...process.env,
          GIT_CONFIG_GLOBAL: join(scratch, 'empty-global'),
          GIT_CONFIG_NOSYSTEM: '1',
        };
        gitIn(fx, ['config', '--unset', 'user.name']);
        gitIn(fx, ['config', '--unset', 'user.email']);
        const bare = new GitAdapter({ gitPath, baseEnv: isolated });
        await bare.discover(fx.dir);
        expect(await bare.userIdentity()).toEqual({ name: null, email: null });
        await bare.close();
      });

      it('G-11 attributes: only the .gitattributes files of the commit tree count', async () => {
        const c1 = fx.commit('C1', {
          files: {
            '.gitattributes':
              '*.gen linguist-generated\ngen/** linguist-generated=true\n*.dat filter=lfs\n',
            'lib/.gitattributes': '*.gen -linguist-generated\n',
            'lib/x.gen': 'x\n',
            'gen/a.js': 'a\n',
            'top.gen': 't\n',
          },
        }).hash;
        // decoys: info/attributes, core.attributesFile, an uncommitted .gitattributes
        writeFileSync(join(fx.dir, '.git', 'info', 'attributes'), '*.txt linguist-generated\n');
        const global = join(scratch, 'attrs');
        writeFileSync(global, 'src/** linguist-generated\n');
        fx.setConfig('core.attributesFile', global);
        fx.write('.gitattributes', '* linguist-generated\n');
        const paths = ['lib/x.gen', 'gen/a.js', 'top.gen', 'src/a.txt', 'bin.dat'];
        const generated = await adapter.attributes(c1, paths, 'linguist-generated');
        expect(Object.fromEntries(generated)).toEqual({
          'lib/x.gen': 'unset',
          'gen/a.js': 'true',
          'top.gen': 'set',
          'src/a.txt': null,
          'bin.dat': null,
        });
        expect(
          (await adapter.attributes(c1, ['bin.dat', 'top.gen'], 'filter')).get('bin.dat'),
        ).toBe('lfs');
        expect(
          (await adapter.attributes(b0, ['top.gen'], 'linguist-generated')).get('top.gen'),
        ).toBeNull();
      });

      describe('G-12 workingState', () => {
        it('lists nothing for an unchanged state, and every path that changed since the snapshot', async () => {
          fx.write('src/b.txt', 'one\n');
          fx.write('fresh.txt', 'fresh\n');
          const snapshot = { base: b0, files: await adapter.changeAgainst(b0) };
          expect(await adapter.workingState(snapshot)).toEqual({ head: b0, differing: [] });
          fx.write('src/b.txt', 'two\n'); // same size, new time stamp
          fx.write('src/a.txt', 'brand new edit\n'); // a path that was not in the snapshot
          fx.remove('fresh.txt');
          const state = await adapter.workingState(snapshot);
          expect(state.head).toBe(b0);
          expect(state.differing).toEqual([
            { path: 'fresh.txt', contentHash: null },
            { path: 'src/a.txt', contentHash: hashBlob(Buffer.from('brand new edit\n'), format) },
            { path: 'src/b.txt', contentHash: hashBlob(Buffer.from('two\n'), format) },
          ]);
          fx.write('src/b.txt', 'one\n')
            .write('fresh.txt', 'fresh\n')
            .write('src/a.txt', numbered(1, 10));
          expect((await adapter.workingState(snapshot)).differing).toEqual([]);
        });

        it('reuses kept hashes without hiding an edit that changes the stat data', async () => {
          const late = new GitAdapter({ gitPath, now: () => Date.now() + 3_600_000 });
          await late.discover(fx.dir);
          try {
            fx.write('src/b.txt', 'one\n');
            const snapshot = { base: b0, files: await late.changeAgainst(b0) };
            expect((await late.workingState(snapshot)).differing).toEqual([]);
            expect((await late.workingState(snapshot)).differing).toEqual([]);
            fx.write('src/b.txt', 'two\n');
            expect((await late.workingState(snapshot)).differing.map((d) => d.path)).toEqual([
              'src/b.txt',
            ]);
          } finally {
            await late.close();
          }
        });

        it('reports a HEAD that moved on', async () => {
          const snapshot = { base: b0, files: await adapter.changeAgainst(b0) };
          const c1 = fx.commit('C1', { files: { 'src/a.txt': 'moved\n' } }).hash;
          const state = await adapter.workingState(snapshot);
          expect(state.head).toBe(c1);
          expect(state.differing.map((d) => d.path)).toEqual(['src/a.txt']);
        });
      });

      it('G-13 treeEntries: every file with mode and blob, gitlinks included', async () => {
        const blob = gitIn(fx, ['hash-object', '-w', '--stdin'], 'target');
        gitIn(fx, ['update-index', '--add', '--cacheinfo', `120000,${blob},link`]);
        gitIn(fx, ['update-index', '--add', '--cacheinfo', `160000,${b0},sub`]);
        gitIn(fx, ['update-index', '--chmod=+x', 'src/b.txt']);
        gitIn(fx, ['commit', '-q', '-m', 'modes']);
        const entries = new Map((await adapter.treeEntries('HEAD')).map((e) => [e.path, e]));
        expect(entries.get('link')).toMatchObject({ mode: 'symlink', blob });
        expect(entries.get('sub')).toMatchObject({ mode: 'submodule', blob: b0 });
        expect(entries.get('src/b.txt')!.mode).toBe('executable');
        expect(entries.get('src/a.txt')!.mode).toBe('regular');
        expect(entries.get('src/a.txt')!.blob).toBe(gitIn(fx, ['rev-parse', 'HEAD:src/a.txt']));
        expect([...entries.keys()].sort()).toEqual(
          [
            'bin.dat',
            'docs/readme.md',
            'link',
            'src/a.txt',
            'src/b.txt',
            'src/c.txt',
            'sub',
          ].sort(),
        );
      });

      describe('G-14 defaultBranches', () => {
        it('lists main and master, each only when it exists', async () => {
          expect(await adapter.defaultBranches()).toEqual([{ ref: 'refs/heads/main', commit: b0 }]);
          fx.branch('master');
          expect((await adapter.defaultBranches()).map((d) => d.ref)).toEqual([
            'refs/heads/main',
            'refs/heads/master',
          ]);
        });

        it('puts the default branch of the remote first: origin, or the only remote', async () => {
          gitIn(fx, ['update-ref', 'refs/remotes/origin/develop', b0]);
          gitIn(fx, ['symbolic-ref', 'refs/remotes/origin/HEAD', 'refs/remotes/origin/develop']);
          expect(await adapter.defaultBranches()).toEqual([{ ref: 'refs/heads/main', commit: b0 }]); // no remote configured yet: the symbolic ref alone is not enough
          gitIn(fx, ['remote', 'add', 'origin', 'https://example.invalid/o.git']);
          expect((await adapter.defaultBranches()).map((d) => d.ref)).toEqual([
            'refs/remotes/origin/develop',
            'refs/heads/main',
          ]);
        });

        it('has no remote default with several remotes and none named origin', async () => {
          for (const name of ['r1', 'r2']) {
            gitIn(fx, ['remote', 'add', name, `https://example.invalid/${name}.git`]);
          }
          gitIn(fx, ['update-ref', 'refs/remotes/r1/dev', b0]);
          gitIn(fx, ['symbolic-ref', 'refs/remotes/r1/HEAD', 'refs/remotes/r1/dev']);
          expect((await adapter.defaultBranches()).map((d) => d.ref)).toEqual(['refs/heads/main']);
          gitIn(fx, ['remote', 'remove', 'r2']);
          expect((await adapter.defaultBranches()).map((d) => d.ref)).toEqual([
            'refs/remotes/r1/dev',
            'refs/heads/main',
          ]);
        });

        it('never takes a tag named main', async () => {
          const trunk = FixtureRepo.create({ objectFormat: format, initialBranch: 'trunk' });
          const other = new GitAdapter({ gitPath });
          try {
            const c = trunk.commit('T0', { files: { 'a.txt': 'a\n' } }).hash;
            gitIn(trunk, ['tag', 'main', c]);
            await other.discover(trunk.dir);
            expect(await other.defaultBranches()).toEqual([]);
          } finally {
            await other.close();
            trunk.dispose();
          }
        });
      });

      describe('G-15 indexState', () => {
        const NOW = () => Date.now() / 1000;
        const settle = (rel: string, mtime: number) => {
          // Set the modification time, then record the file again so that the entry holds it.
          utimesSync(fx.path(rel), NOW(), mtime);
          gitIn(fx, ['add', rel]);
        };

        it('gives blob, mode and stat data, up to date only while the stat data match', async () => {
          settle('src/a.txt', NOW() - 3600);
          const state = (await adapter.indexState(['src/a.txt'])).get('src/a.txt')!;
          expect(state).toMatchObject({
            blob: gitIn(fx, ['rev-parse', ':src/a.txt']),
            mode: 'regular',
            upToDate: true,
          });
          expect(state.stat.size).toBe(Buffer.byteLength(numbered(1, 10)));
          // an edit of the same size with a new modification time
          fx.write('src/a.txt', numbered(1, 10).replace('line 1\n', 'LINE 1\n'));
          expect((await adapter.indexState(['src/a.txt'])).get('src/a.txt')!.upToDate).toBe(false);
        });

        it('counts a racy entry as not up to date', async () => {
          settle('src/a.txt', NOW() + 3600);
          expect((await adapter.indexState(['src/a.txt'])).get('src/a.txt')!.upToDate).toBe(false);
        });

        it('ignores the assume-unchanged and skip-worktree flags', async () => {
          settle('src/a.txt', NOW() - 3600);
          settle('src/b.txt', NOW() - 3600);
          gitIn(fx, ['update-index', '--assume-unchanged', 'src/a.txt']);
          gitIn(fx, ['update-index', '--skip-worktree', 'src/b.txt']);
          const unchanged = await adapter.indexState(['src/a.txt', 'src/b.txt']);
          expect(unchanged.get('src/a.txt')!.upToDate).toBe(true);
          expect(unchanged.get('src/b.txt')!.upToDate).toBe(true);
          fx.write('src/a.txt', 'edited under the flag\n');
          fx.write('src/b.txt', 'edited under the flag\n');
          const edited = await adapter.indexState(['src/a.txt', 'src/b.txt']);
          expect(edited.get('src/a.txt')!.upToDate).toBe(false);
          expect(edited.get('src/b.txt')!.upToDate).toBe(false);
        });

        it('has no state for an untracked path or an intent-to-add entry', async () => {
          fx.write('untracked.txt', 'u\n').write('added.txt', 'a\n');
          gitIn(fx, ['add', '-N', 'added.txt']);
          const state = await adapter.indexState(['untracked.txt', 'added.txt', 'absent.txt']);
          expect([...state.values()]).toEqual([null, null, null]);
        });

        it('has no state for a path with a merge conflict (no entry at stage 0)', async () => {
          gitIn(fx, ['checkout', '-q', '-b', 'left']);
          fx.commit('L', { files: { 'src/c.txt': 'left\n' } });
          gitIn(fx, ['checkout', '-q', 'main']);
          fx.commit('R', { files: { 'src/c.txt': 'right\n' } });
          expect(() => gitIn(fx, ['merge', 'left'])).toThrow();
          expect((await adapter.indexState(['src/c.txt'])).get('src/c.txt')).toBeNull();
        });
      });

      describe('G-16 submoduleTree', () => {
        let inner: FixtureRepo;
        let sub: FixtureRepo;
        let innerCommit: string;
        let subCommit: string;
        const allow = ['-c', 'protocol.file.allow=always'];

        beforeEach(async () => {
          inner = FixtureRepo.create({ objectFormat: format });
          innerCommit = inner.commit('I0', { files: { 'inner.txt': 'inner\n' } }).hash;
          sub = FixtureRepo.create({ objectFormat: format });
          sub.commit('S0', { files: { 'lib.txt': 'lib\n', 'dir/x.txt': 'x\n' } });
          gitIn(sub, [...allow, 'submodule', 'add', '-q', inner.dir, 'deps/inner']);
          sub.git('commit', '-q', '-m', 'S1 add inner');
          subCommit = gitIn(sub, ['rev-parse', 'HEAD']);
          gitIn(fx, [...allow, 'submodule', 'add', '-q', sub.dir, 'vendor/sub']);
          gitIn(fx, [...allow, 'submodule', 'update', '--init', '--recursive', '-q']);
          fx.git('commit', '-q', '-m', 'add sub');
        });
        afterEach(() => {
          sub.dispose();
          inner.dispose();
        });

        it('reads the tree and the files of the recorded commit, and nested submodules one level at a time', async () => {
          const location = await adapter.discover(fx.dir);
          const tree = await adapter.submoduleTree(location, 'vendor/sub', subCommit);
          if (!tree.present) throw new Error(`absent: ${tree.cause} ${tree.gitMessage ?? ''}`);
          const entries = new Map(tree.entries.map((e) => [e.path, e]));
          expect(entries.get('lib.txt')!.mode).toBe('regular');
          expect(entries.get('deps/inner')).toMatchObject({ mode: 'submodule', blob: innerCommit });
          expect((await tree.readBlob('dir/x.txt'))!.toString()).toBe('x\n');
          expect(await tree.readBlob('missing.txt')).toBeNull();
          const nested = await adapter.submoduleTree(tree.location, 'deps/inner', innerCommit);
          if (!nested.present)
            throw new Error(`absent: ${nested.cause} ${nested.gitMessage ?? ''}`);
          expect((await nested.readBlob('inner.txt'))!.toString()).toBe('inner\n');
        });

        it('is absent when the commit is not in the repository', async () => {
          const location = await adapter.discover(fx.dir);
          const missing = 'a'.repeat(format === 'sha256' ? 64 : 40);
          expect(await adapter.submoduleTree(location, 'vendor/sub', missing)).toEqual({
            present: false,
            cause: 'commit-not-in-repository',
          });
        });

        it('is absent when there is no local repository', async () => {
          const location = await adapter.discover(fx.dir);
          rmSync(fx.path('.git/modules'), { recursive: true, force: true });
          rmSync(fx.path('vendor/sub/.git'), { recursive: true, force: true });
          expect(await adapter.submoduleTree(location, 'vendor/sub', subCommit)).toEqual({
            present: false,
            cause: 'no-local-repository',
          });
          expect(await adapter.submoduleTree(location, 'not/a/submodule', subCommit)).toMatchObject(
            {
              present: false,
              cause: 'no-local-repository',
            },
          );
        });

        it('refuses a submodule name with a ".." component', async () => {
          const location = await adapter.discover(fx.dir);
          fx.write('.gitmodules', '[submodule "../escape"]\n\tpath = vendor/sub\n\turl = ../x\n');
          expect(await adapter.submoduleTree(location, 'vendor/sub', subCommit)).toEqual({
            present: false,
            cause: 'no-local-repository',
          });
        });

        it('is absent, with git first error line, when git refuses the submodule repository', async () => {
          const location = await adapter.discover(fx.dir);
          const config = fx.path('.git/modules/vendor/sub/config');
          gitIn(fx, ['config', '--file', config, 'core.repositoryformatversion', '1']);
          gitIn(fx, ['config', '--file', config, 'extensions.futureformat', '1']);
          const result = await adapter.submoduleTree(location, 'vendor/sub', subCommit);
          expect(result).toMatchObject({ present: false, cause: 'repository-refused' });
          expect((result as { gitMessage: string }).gitMessage).toMatch(
            /unknown repository extension/,
          );
          // the parent is still readable: a refusal does not stop the command
          expect((await adapter.head()).commit).toBe(gitIn(fx, ['rev-parse', 'HEAD']));
        });
      });

      it('records every error in the contextual log, with its code and operation', async () => {
        const file = join(scratch, 'log', 'errors.jsonl');
        const logged = new GitAdapter({ gitPath, log: new ContextualLog(file) });
        await logged.discover(fx.dir);
        await expect(logged.resolveCommit('-x')).rejects.toMatchObject({ code: 'ERR-INTAKE-003' });
        await expect(
          logged.treeEntries('f'.repeat(format === 'sha256' ? 64 : 40)),
        ).rejects.toMatchObject({
          code: 'ERR-CLI-003',
        });
        await expect(
          logged.discover(mkdtempSync(join(tmpdir(), 'sddnone-'))),
        ).rejects.toMatchObject({ code: 'ERR-INTAKE-001' });
        await logged.close();
        const lines = readFileSync(file, 'utf8')
          .trim()
          .split('\n')
          .map((l) => JSON.parse(l) as { code: string; operation: string });
        expect(lines.map((l) => [l.code, l.operation])).toEqual([
          ['ERR-INTAKE-003', 'resolve-commit'],
          ['ERR-CLI-003', 'tree-entries'],
          ['ERR-INTAKE-001', 'discover'],
        ]);
      });
    });
  },
);
