import { createHash } from 'node:crypto';
import { readFileSync, utimesSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { FixtureRepo } from '../../fixtures/builder/fixture-repo.js';
import { binaryBytes, buildFxCrypt, buildFxLfs, filterCalls } from '../../fixtures/repos/fx-lfs.js';
import { GitAdapter } from '../../../src/core/git/operations.js';

// C001-T-028: G-07 and G-12 on files under a clean filter (C001-IF-012 §7) with the real git
// program and the filter stub of `fx-lfs` / `fx-crypt`, which logs every call: no filter runs, a
// Git LFS file is settled by its pointer files, another file by an up-to-date index entry. The
// G-12 cases are the git side of C001-TS-177 and C001-TS-188 (their moved-on notice is C001-T-033).

const repos: FixtureRepo[] = [];
const adapters: GitAdapter[] = [];
afterEach(async () => {
  for (const a of adapters.splice(0)) await a.close();
  for (const r of repos.splice(0)) r.dispose();
});

async function open(repo: FixtureRepo): Promise<GitAdapter> {
  repos.push(repo);
  const git = new GitAdapter({ baseEnv: repo.env() });
  adapters.push(git);
  await git.discover(repo.dir);
  return git;
}

const indexHash = (repo: FixtureRepo) =>
  createHash('sha256')
    .update(readFileSync(join(repo.dir, '.git', 'index')))
    .digest('hex');

describe('files under a clean filter (§7)', () => {
  it('leaves checked-out filtered files out of the change and runs no filter', async () => {
    const repo = buildFxCrypt();
    const git = await open(repo);
    repo.write('src/cart.ts', `${repo.read('src/cart.ts')}// edited\n`);
    const calls = filterCalls(repo)!.length;
    const index = indexHash(repo);
    const files = await git.changeAgainst(repo.label('B0').hash);
    expect(files.map((f) => f.path)).toEqual(['src/cart.ts']);
    expect(filterCalls(repo)!.length).toBe(calls);
    expect(indexHash(repo)).toBe(index);
  }, 60_000);

  it('reports the cause of each file compared by its working-tree bytes', async () => {
    const repo = buildFxCrypt();
    const git = await open(repo);
    repo.write('assets/model.bin', binaryBytes(3000, 7));
    const later = new Date(Date.now() + 3_600_000);
    utimesSync(repo.path('secrets/app.env'), later, later);
    const files = await git.changeAgainst(repo.label('B0').hash);
    const by = new Map(files.map((f) => [f.path, f]));
    expect(by.get('assets/model.bin')!.cleanFilter).toEqual({
      driver: 'lfs',
      cause: 'no-matching-lfs-pointer',
    });
    expect(by.get('assets/model.bin')!.binaryContent).toEqual(binaryBytes(3000, 7));
    expect(by.get('secrets/app.env')!.cleanFilter).toEqual({
      driver: 'crypt',
      cause: 'not-up-to-date',
    });
    expect(by.has('secrets/db.env')).toBe(false);
  }, 60_000);

  it('G-12: staging a Git LFS file after intake makes it differ (C001-TS-188)', async () => {
    const repo = buildFxLfs();
    const git = await open(repo);
    const base = repo.label('B0').hash;
    repo.write('assets/model.bin', binaryBytes(3000, 7));
    const files = await git.changeAgainst(base);
    expect((await git.workingState({ base, files })).differing).toEqual([]);
    repo.stage('assets/model.bin');
    const pointer = repo.git('rev-parse', ':assets/model.bin');
    expect((await git.workingState({ base, files })).differing).toEqual([
      { path: 'assets/model.bin', contentHash: pointer },
    ]);
  }, 60_000);

  it('G-12: a later index refresh makes a file of a racy entry differ (C001-TS-177)', async () => {
    const repo = buildFxCrypt();
    const git = await open(repo);
    const base = repo.label('B0').hash;
    // The entry of app.env racy: the index file in the second its entry records.
    const out = repo.git('ls-files', '-s', '--debug', '--', 'secrets/app.env');
    const mtime = Number(/mtime: (\d+):/.exec(out)![1]);
    utimesSync(join(repo.dir, '.git', 'index'), mtime, mtime);
    const files = await git.changeAgainst(base);
    expect(files.find((f) => f.path === 'secrets/app.env')?.cleanFilter?.cause).toBe(
      'not-up-to-date',
    );
    expect((await git.workingState({ base, files })).differing).toEqual([]);
    repo.git('status', '--porcelain'); // git refreshes its index (runs the filter)
    const state = await git.workingState({ base, files });
    expect(state.differing.map((d) => d.path)).toEqual(['secrets/app.env']);
    expect(state.differing[0]!.contentHash).toBe(repo.git('rev-parse', `${base}:secrets/app.env`));
  }, 60_000);
});
