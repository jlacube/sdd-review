import { afterEach, describe, expect, it, vi } from 'vitest';
import { FixtureRepo } from '../../fixtures/builder/fixture-repo.js';
import { GitAdapter } from '../../../src/core/git/operations.js';
import { attributeHistory, keptFrom } from '../../../src/core/git/line-attribution.js';
import { attributeHunks } from '../../../src/core/intake/attribution.js';
import { readChangeCommits } from '../../../src/core/intake/commits.js';
import { computeChange } from '../../../src/core/intake/change.js';
import { cutHunks, identifyHunks } from '../../../src/core/intake/hunks.js';
import type { Hunk } from '../../../src/generated/analysis-results.js';
import { isReviewError } from '../../../src/core/errors/review-error.js';

// C001-TC-110 (unit): C001-REQ-109 and C001-REQ-110 — the commits of the change and the attribution
// of each hunk to the commits that changed its lines (C001-IF-012 G-06, G-09), on linear
// histories, merges and uncommitted edits.

vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 });

const L = (...texts: string[]) => texts.map((t) => `${t}\n`);

describe('attributeHistory (pure)', () => {
  it('keptFrom maps each kept line to its old index and new lines to -1', () => {
    expect([...keptFrom(L('a', 'b', 'c'), L('a', 'x', 'c', 'd'))]).toEqual([0, -1, 2, -1]);
  });

  it('linear history: each line goes to the commit that added or deleted it, the rest is uncommitted', () => {
    const base = L('a', 'b', 'c', 'd');
    const r = attributeHistory({
      baseLines: base,
      boundary: new Map([['B', base]]),
      commits: [
        { hash: 'C1', parents: ['B'], lines: L('a', 'c', 'd', 'e') }, // deletes b, adds e
        { hash: 'C2', parents: ['C1'], lines: null }, // does not touch the file
        { hash: 'C3', parents: ['C2'], lines: L('a', 'c', 'e', 'f') }, // deletes d, adds f
      ],
      head: 'C3',
      currentLines: L('c', 'e', 'f', 'g'), // deletes a, adds g
    });
    // base order of deleted lines: a (uncommitted), b (C1), d (C3)
    expect(r.deleted).toEqual([null, 'C1', 'C3']);
    // snapshot order of added lines: e (C1), f (C3), g (uncommitted)
    expect(r.added).toEqual(['C1', 'C3', null]);
  });

  it('a line added by one commit and modified by a later one goes to the later one', () => {
    const base = L('x');
    const r = attributeHistory({
      baseLines: base,
      boundary: new Map([['B', base]]),
      commits: [
        { hash: 'C1', parents: ['B'], lines: L('x', 'p', 'q', 'r') },
        { hash: 'C2', parents: ['C1'], lines: L('x', 'p', 'Q', 'r') },
      ],
      head: 'C2',
      currentLines: L('x', 'p', 'Q', 'r'),
    });
    expect(r).toEqual({ added: ['C1', 'C2', 'C1'], deleted: [] });
  });

  it('merges: a line found in a parent keeps that parent origin, first parent first', () => {
    const base = L('a', 'b', 'c');
    const r = attributeHistory({
      baseLines: base,
      boundary: new Map([['B', base]]),
      commits: [
        { hash: 'T1', parents: ['B'], lines: L('a', 'b', 'c', 'side') },
        { hash: 'M1', parents: ['B'], lines: L('main', 'a', 'c') }, // deletes b, adds main
        { hash: 'M2', parents: ['M1', 'T1'], lines: L('main', 'a', 'c', 'side', 'fix') },
      ],
      head: 'M2',
      currentLines: L('main', 'a', 'c', 'side', 'fix'),
    });
    expect(r.added).toEqual(['M1', 'T1', 'M2']);
    // b: kept by T1, deleted by M1; the merge takes M1's side
    expect(r.deleted).toEqual(['M1']);
  });

  it('merges are deterministic: the same history in another commit order gives the same result', () => {
    const base = L('a', 'b');
    const history = (order: 'ab' | 'ba') => {
      const x = { hash: 'X', parents: ['B'], lines: L('a', 'b', 'x') };
      const y = { hash: 'Y', parents: ['B'], lines: L('y', 'a', 'b') };
      const m = { hash: 'M', parents: ['X', 'Y'], lines: L('y', 'a', 'b', 'x') };
      return attributeHistory({
        baseLines: base,
        boundary: new Map([['B', base]]),
        commits: order === 'ab' ? [x, y, m] : [y, x, m],
        head: 'M',
        currentLines: L('y', 'a', 'b', 'x'),
      });
    };
    expect(history('ab')).toEqual(history('ba'));
    expect(history('ab')).toEqual({ added: ['Y', 'X'], deleted: [] });
  });

  it('a base line that both merge parents keep and the merge drops goes to the merge commit', () => {
    const base = L('a', 'b');
    const r = attributeHistory({
      baseLines: base,
      boundary: new Map([['B', base]]),
      commits: [
        { hash: 'X', parents: ['B'], lines: L('a', 'b', 'x') },
        { hash: 'M', parents: ['X', 'B'], lines: L('a', 'x') },
      ],
      head: 'M',
      currentLines: L('a', 'x'),
    });
    expect(r).toEqual({ added: ['X'], deleted: ['M'] });
  });

  it('an empty range (base commit is HEAD) makes every changed line uncommitted', () => {
    const base = L('a', 'b');
    expect(
      attributeHistory({
        baseLines: base,
        boundary: new Map([['H', base]]),
        commits: [],
        head: 'H',
        currentLines: L('a', 'c'),
      }),
    ).toEqual({ added: [null], deleted: [null] });
  });

  it('a line the history keeps but the direct comparison moves goes to the last edit of the file', () => {
    // C1 moves "b" below "c"; the history keeps one of them as base line, the direct diff of base
    // and snapshot cannot, so the disagreeing line goes to C1, the last commit that changed the file.
    const base = L('a', 'b', 'c');
    const r = attributeHistory({
      baseLines: base,
      boundary: new Map([['B', base]]),
      commits: [{ hash: 'C1', parents: ['B'], lines: L('a', 'c', 'b') }],
      head: 'C1',
      currentLines: L('a', 'c', 'b'),
    });
    expect(r.added.every((c) => c === 'C1')).toBe(true);
    expect(r.deleted.every((c) => c === 'C1')).toBe(true);
    expect(r.added.length + r.deleted.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------------------------
// Through the git port on fixture repositories

const adapters: GitAdapter[] = [];
const repos: FixtureRepo[] = [];

afterEach(async () => {
  for (const a of adapters.splice(0)) await a.close();
  for (const r of repos.splice(0)) r.dispose();
});

async function open(fx: FixtureRepo): Promise<GitAdapter> {
  const git = new GitAdapter();
  await git.discover(fx.dir);
  adapters.push(git);
  return git;
}

function fixture(): FixtureRepo {
  const fx = FixtureRepo.create();
  repos.push(fx);
  fx.commit('B0', {
    files: {
      'src/a.ts': L('a1', 'a2', 'a3', 'a4', 'a5', 'a6').join(''),
      'src/b.ts': L('b1', 'b2', 'b3').join(''),
      'src/c.ts': L('c1', 'c2', 'c3', 'c4').join(''),
    },
  });
  return fx;
}

/** Intake's steps up to attribution: change, commits, hunks, attribution. */
async function attributed(git: GitAdapter, base: string, head: string): Promise<Hunk[]> {
  const files = await computeChange(git, base);
  const hunks = files.flatMap((f) =>
    f.file.binary
      ? []
      : identifyHunks('s-test', cutHunks(f.file.path, f.file.baseContent, f.file.currentContent)),
  );
  const commits = await readChangeCommits(git, base, head);
  return attributeHunks(git, { base, head, commits, files, hunks });
}

const summary = (fx: FixtureRepo, hunks: Hunk[]) => {
  const labelOf = new Map(fx.recordedLabels.map((l) => [l.hash, l.label]));
  return hunks.map((h) => ({
    path: h.path,
    at: [h.oldStart, h.newStart],
    commits: h.commits.map((c) => labelOf.get(c) ?? c),
    uncommitted: h.uncommitted,
  }));
};

describe('readChangeCommits', () => {
  it('lists the commits oldest first with subject and message, and none when the base is HEAD', async () => {
    const fx = fixture();
    const c1 = fx.commit('C1', {
      message: 'Add cart totals\n\nBody line.',
      author: { name: 'Agent Bot', email: 'agent@example.test' },
      date: '2026-11-16T09:00:00Z',
      files: { 'src/a.ts': L('a1', 'x').join('') },
    });
    const git = await open(fx);
    const commits = await readChangeCommits(git, fx.label('B0').hash, c1.hash);
    expect(commits).toEqual([
      {
        hash: c1.hash,
        parents: [fx.label('B0').hash],
        authorName: 'Agent Bot',
        authorEmail: 'agent@example.test',
        authorTime: expect.any(String),
        subject: 'Add cart totals',
        message: 'Add cart totals\n\nBody line.',
        changedFiles: ['src/a.ts'],
      },
    ]);
    expect(Date.parse(commits[0]!.authorTime)).toBe(Date.parse('2026-11-16T09:00:00Z'));
    expect(await readChangeCommits(git, c1.hash, c1.hash)).toEqual([]);
  });
});

describe('attributeHunks', () => {
  it('linear history: commits per hunk in commit order, uncommitted lines flagged', async () => {
    const fx = fixture();
    fx.commit('C1', {
      files: { 'src/a.ts': L('a1', 'new1', 'a2', 'a3', 'a4', 'a5', 'a6').join('') },
    });
    fx.commit('C2', {
      files: {
        'src/a.ts': L('a1', 'new1', 'new2', 'a2', 'a3', 'a4', 'a5', 'a6').join(''),
        'src/c.ts': L('c1', 'c4').join(''), // deletes c2, c3
      },
    });
    // uncommitted: a5 changed in a.ts, a new line in b.ts
    fx.write('src/a.ts', L('a1', 'new1', 'new2', 'a2', 'a3', 'a4', 'A5', 'a6').join(''));
    fx.write('src/b.ts', L('b1', 'b2', 'b3', 'wt').join(''));
    const git = await open(fx);
    const hunks = await attributed(git, fx.label('B0').hash, fx.label('C2').hash);
    expect(summary(fx, hunks)).toEqual([
      { path: 'src/a.ts', at: [1, 2], commits: ['C1', 'C2'], uncommitted: false },
      { path: 'src/a.ts', at: [5, 7], commits: [], uncommitted: true },
      { path: 'src/b.ts', at: [3, 4], commits: [], uncommitted: true },
      { path: 'src/c.ts', at: [2, 1], commits: ['C2'], uncommitted: false },
    ]);
  });

  it('a hunk mixing committed and uncommitted lines records both', async () => {
    const fx = fixture();
    fx.commit('C1', { files: { 'src/b.ts': L('b1', 'b2', 'b3', 'k1', 'k2').join('') } });
    fx.write('src/b.ts', L('b1', 'b2', 'b3', 'k1', 'k2', 'w1').join(''));
    const git = await open(fx);
    const hunks = await attributed(git, fx.label('B0').hash, fx.label('C1').hash);
    expect(summary(fx, hunks)).toEqual([
      { path: 'src/b.ts', at: [3, 4], commits: ['C1'], uncommitted: true },
    ]);
  });

  it('merges: lines from both branches go to the commits of their branch, deterministically', async () => {
    const fx = fixture();
    fx.git('checkout', '-q', '-b', 'topic');
    fx.commit('T1', {
      files: { 'src/a.ts': L('a1', 'a2', 'a3', 'a4', 'a5', 'a6', 'topic').join('') },
    });
    fx.checkout('main');
    fx.commit('M1', {
      files: { 'src/a.ts': L('main', 'a1', 'a2', 'a3', 'a4', 'a5', 'a6').join('') },
    });
    fx.commit('M2', { files: { 'src/b.ts': L('b1', 'b3').join('') } }); // deletes b2
    fx.merge('M3', 'topic', 'Merge topic');
    const git = await open(fx);
    const base = fx.label('B0').hash;
    const head = fx.label('M3').hash;
    const first = summary(fx, await attributed(git, base, head));
    expect(first).toEqual([
      { path: 'src/a.ts', at: [0, 1], commits: ['M1'], uncommitted: false },
      { path: 'src/a.ts', at: [6, 8], commits: ['T1'], uncommitted: false },
      { path: 'src/b.ts', at: [2, 1], commits: ['M2'], uncommitted: false },
    ]);
    // A second adapter (no cache) gives the same result.
    expect(summary(fx, await attributed(await open(fx), base, head))).toEqual(first);
  });

  it('a merge that resolves a conflict attributes the resolved line to the merge commit', async () => {
    const fx = fixture();
    fx.git('checkout', '-q', '-b', 'topic');
    fx.commit('T1', { files: { 'src/b.ts': L('b1', 'topic', 'b3').join('') } });
    fx.checkout('main');
    fx.commit('M1', { files: { 'src/b.ts': L('b1', 'main', 'b3').join('') } });
    // conflicting merge, resolved by hand
    try {
      fx.git('merge', '-q', 'topic');
    } catch {
      /* the conflict is expected */
    }
    fx.write('src/b.ts', L('b1', 'resolved', 'b3').join(''));
    fx.stage('src/b.ts');
    fx.git('commit', '-q', '--no-edit');
    const merge = fx.git('rev-parse', 'HEAD');
    const git = await open(fx);
    const hunks = await attributed(git, fx.label('B0').hash, merge);
    expect(hunks.map((h) => ({ commits: h.commits, uncommitted: h.uncommitted }))).toEqual([
      // b2 deleted by M1 (first parent), "resolved" added by the merge
      { commits: [fx.label('M1').hash, merge], uncommitted: false },
    ]);
  });

  it('follows a committed rename and an uncommitted rename', async () => {
    const fx = fixture();
    fx.commit('C1', {
      deletes: ['src/a.ts'],
      files: { 'src/moved.ts': L('a1', 'a2', 'a3', 'a4', 'a5', 'a6', 'c1 add').join('') },
    });
    fx.moveInWorkingTree('src/c.ts', 'src/renamed.ts');
    fx.write('src/renamed.ts', L('c1', 'c2', 'c3', 'c4', 'wt add').join(''));
    const git = await open(fx);
    const hunks = await attributed(git, fx.label('B0').hash, fx.label('C1').hash);
    expect(summary(fx, hunks)).toEqual([
      { path: 'src/moved.ts', at: [6, 7], commits: ['C1'], uncommitted: false },
      { path: 'src/renamed.ts', at: [4, 5], commits: [], uncommitted: true },
    ]);
  });

  it('with the base commit at HEAD every hunk is uncommitted and has no commit', async () => {
    const fx = fixture();
    fx.write('src/a.ts', L('a1', 'x').join(''));
    const git = await open(fx);
    const head = fx.label('B0').hash;
    const hunks = await attributed(git, head, head);
    expect(hunks.length).toBeGreaterThan(0);
    expect(hunks.every((h) => h.uncommitted && h.commits.length === 0)).toBe(true);
  });

  it('refuses with ERR-CLI-003 when the port gives lines that do not match the hunks', async () => {
    const fx = fixture();
    fx.commit('C1', { files: { 'src/a.ts': L('a1', 'x').join('') } });
    const git = await open(fx);
    const base = fx.label('B0').hash;
    const head = fx.label('C1').hash;
    const files = await computeChange(git, base);
    const hunks = files.flatMap((f) =>
      identifyHunks('s', cutHunks(f.file.path, f.file.baseContent, f.file.currentContent)),
    );
    const broken = Object.create(git) as GitAdapter;
    broken.attributeLines = async () => ({ added: [], deleted: [] });
    const error = await attributeHunks(broken, { base, head, commits: [], files, hunks }).catch(
      (e: unknown) => e,
    );
    expect(isReviewError(error) && error.code).toBe('ERR-CLI-003');
  });
});
