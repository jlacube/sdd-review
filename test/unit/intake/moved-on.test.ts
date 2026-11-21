import { utimesSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { FixtureRepo } from '../../fixtures/builder/fixture-repo.js';
import { buildFxIntake } from '../../fixtures/repos/fx-intake.js';
import { GitAdapter } from '../../../src/core/git/operations.js';
import { ContextualLog } from '../../../src/core/log/log.js';
import { StoreLayout } from '../../../src/core/store/root.js';
import { SnapshotStore } from '../../../src/core/store/snapshots.js';
import { takeInChange } from '../../../src/core/intake/snapshot.js';
import { MovedOnChecker, movedOnNoticeOf } from '../../../src/core/intake/moved-on.js';
import type { IntakeDocument } from '../../../src/generated/analysis-results.js';
import { cleanTempDirs, loggedCodes, tempDir } from '../store/helpers.js';

// C001-TC-117 (unit level): the moved-on check of C001-REQ-117 on a real repository, git port and
// store — C001-TS-138 (edited file), C001-TS-139 (new commit), C001-TS-140 (nothing moved),
// C001-TS-150 (edited and restored with a later modification time); plus the notice text.

vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 });

interface Rig {
  readonly fx: FixtureRepo;
  readonly logFile: string;
  readonly intake: IntakeDocument;
  checker(): MovedOnChecker;
}

const adapters: GitAdapter[] = [];
const repos: FixtureRepo[] = [];

/** fx-intake with HEAD at C2 and an uncommitted edit of src/cart.ts; a snapshot naming B0. */
async function rig(): Promise<Rig> {
  const fx = buildFxIntake();
  repos.push(fx);
  fx.commit('C1', { subject: 'C1', files: { 'src/cart.ts': `${fx.read('src/cart.ts')}// c1\n` } });
  fx.commit('C2', { subject: 'C2', files: { 'src/util.ts': `${fx.read('src/util.ts')}// c2\n` } });
  fx.write('src/cart.ts', `${fx.read('src/cart.ts')}// uncommitted\n`);
  const dir = tempDir('movedon');
  const logFile = join(dir, 'log.jsonl');
  const log = new ContextualLog(logFile);
  const git = new GitAdapter({ log });
  adapters.push(git);
  const location = await git.discover(fx.dir);
  const store = new SnapshotStore(
    { log, lockPollMs: 5 },
    new StoreLayout(join(dir, 'root'), 'k'.repeat(64)),
  );
  const result = await takeInChange(
    { git, store, log, repositoryRoot: location.workTreeRoot },
    { namedBase: fx.label('B0').hash },
  );
  if (result.status !== 'created') throw new Error('no snapshot created');
  return {
    fx,
    logFile,
    intake: result.intake,
    checker: () =>
      new MovedOnChecker({
        git,
        readContent: (id, sha) => store.readBlob(id, sha),
        objectFormat: async () => location.objectFormat,
        log,
      }),
  };
}

afterEach(async () => {
  for (const git of adapters.splice(0)) await git.close();
  for (const fx of repos.splice(0)) fx.dispose();
  cleanTempDirs();
});

describe('MovedOnChecker (C001-REQ-117)', () => {
  it('gives no notice while the working tree and HEAD match the snapshot (C001-TS-140)', async () => {
    const r = await rig();
    const checker = r.checker();
    expect(await checker.check(r.intake)).toBeNull();
    expect(checker.lastResult(r.intake.snapshot.snapshotId)).toBeNull();
  });

  it('names a file edited after intake and states that HEAD did not move (C001-TS-138)', async () => {
    const r = await rig();
    r.fx.write('src/order.ts', `${r.fx.read('src/order.ts')}// later\n`);
    const notice = await r.checker().check(r.intake);
    expect(notice).not.toBeNull();
    expect(notice!.filesDiffering).toEqual(['src/order.ts']);
    expect(notice!.headMoved).toBe(false);
    expect(notice!.currentHead).toBeUndefined();
    expect(notice!.notice.code).toBe('ERR-INTAKE-007');
    expect(notice!.notice.message).toBe(
      `The working tree has moved on since snapshot ${r.intake.snapshot.snapshotId}: 1 files differ (src/order.ts). This review still shows the snapshot.`,
    );
    expect(loggedCodes(r.logFile)).toContain('ERR-INTAKE-007');
  });

  it('names a file of the change edited again after intake', async () => {
    const r = await rig();
    r.fx.write('src/cart.ts', `${r.fx.read('src/cart.ts')}// again\n`);
    expect((await r.checker().check(r.intake))!.filesDiffering).toEqual(['src/cart.ts']);
  });

  it('names a file of the change deleted after intake', async () => {
    const r = await rig();
    r.fx.remove('src/cart.ts');
    expect((await r.checker().check(r.intake))!.filesDiffering).toEqual(['src/cart.ts']);
  });

  it('states that HEAD moved from C2 to C3 and names the file C3 changed (C001-TS-139)', async () => {
    const r = await rig();
    const cart = r.fx.read('src/cart.ts');
    const c3 = r.fx.commit('C3', {
      subject: 'C3',
      files: { 'src/order.ts': `${r.fx.read('src/order.ts')}// c3\n` },
    });
    // The commit took the uncommitted edit of src/cart.ts with it; the working tree still holds it.
    expect(r.fx.read('src/cart.ts')).toBe(cart);
    const notice = await r.checker().check(r.intake);
    expect(notice!.filesDiffering).toEqual(['src/order.ts']);
    expect(notice!.headMoved).toBe(true);
    expect(notice!.currentHead).toBe(c3.hash);
    expect(notice!.notice.message).toContain(
      `; HEAD moved from ${r.fx.label('C2').hash} to ${c3.hash}. This review`,
    );
  });

  it('gives no notice for a file restored byte for byte with a later modification time (C001-TS-150)', async () => {
    const r = await rig();
    const checker = r.checker();
    expect(await checker.check(r.intake)).toBeNull();
    const original = r.fx.read('src/cart.ts');
    r.fx.write('src/cart.ts', `${original}// edit\n`);
    expect((await checker.check(r.intake))!.filesDiffering).toEqual(['src/cart.ts']);
    r.fx.write('src/cart.ts', original);
    const later = new Date(Date.now() + 3_600_000);
    utimesSync(r.fx.path('src/cart.ts'), later, later);
    expect(await checker.check(r.intake)).toBeNull();
  });

  it('keeps the result of the last check for the session view', async () => {
    const r = await rig();
    const checker = r.checker();
    r.fx.write('docs/api.md', '# API v2\n');
    const notice = await checker.check(r.intake);
    expect(checker.lastResult(r.intake.snapshot.snapshotId)).toEqual(notice);
  });
});

describe('movedOnNoticeOf', () => {
  const intake = {
    snapshot: { snapshotId: 's-1', headCommit: 'a'.repeat(40) },
  } as unknown as IntakeDocument;

  it('is null when nothing differs and HEAD stayed', () => {
    expect(movedOnNoticeOf(intake, { head: 'a'.repeat(40), differing: [] })).toBeNull();
  });

  it('writes the catalogue message with every differing file and the HEAD part', () => {
    const notice = movedOnNoticeOf(intake, {
      head: 'b'.repeat(40),
      differing: [
        { path: 'a.ts', contentHash: null },
        { path: 'b.ts', contentHash: 'c'.repeat(40) },
      ],
    });
    expect(notice).toEqual({
      filesDiffering: ['a.ts', 'b.ts'],
      headMoved: true,
      currentHead: 'b'.repeat(40),
      notice: {
        code: 'ERR-INTAKE-007',
        count: 2,
        message: `The working tree has moved on since snapshot s-1: 2 files differ (a.ts, b.ts); HEAD moved from ${'a'.repeat(40)} to ${'b'.repeat(40)}. This review still shows the snapshot.`,
      },
    });
  });

  it('states HEAD moving alone, with no file differing', () => {
    const notice = movedOnNoticeOf(intake, { head: 'b'.repeat(40), differing: [] });
    expect(notice!.filesDiffering).toEqual([]);
    expect(notice!.notice.message).toContain('0 files differ (none); HEAD moved from');
  });
});
