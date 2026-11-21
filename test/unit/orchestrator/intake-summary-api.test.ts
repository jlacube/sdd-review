import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { FixtureRepo } from '../../fixtures/builder/fixture-repo.js';
import { buildFxIntake } from '../../fixtures/repos/fx-intake.js';
import { createCoreApi, ReviewError } from '../../../src/core/api/index.js';
import { GitAdapter } from '../../../src/core/git/operations.js';
import { ContextualLog } from '../../../src/core/log/log.js';
import { StoreLayout } from '../../../src/core/store/root.js';
import { SnapshotStore } from '../../../src/core/store/snapshots.js';
import { cleanTempDirs, tempDir } from '../store/helpers.js';

// C001-T-033 through the core API: the intake summary with the test command and the configuration
// source (C001-REQ-114, C001-REQ-426), the moved-on check of `checkMovedOn`, `openReview` and the
// session view (C001-REQ-117), and file content served from the snapshot (C001-REQ-116).

vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 });

const fixtures: FixtureRepo[] = [];
const adapters: GitAdapter[] = [];

afterEach(async () => {
  for (const git of adapters.splice(0)) await git.close();
  for (const fx of fixtures.splice(0)) fx.dispose();
  cleanTempDirs();
});

async function rig(fx: FixtureRepo) {
  const root = tempDir('api33');
  const log = new ContextualLog(join(root, 'log.jsonl'));
  const git = new GitAdapter({ log });
  adapters.push(git);
  const location = await git.discover(fx.dir);
  const ctx = { log, lockPollMs: 5 };
  const store = new SnapshotStore(ctx, new StoreLayout(join(root, 'store'), 'k'.repeat(64)));
  return {
    store,
    api: createCoreApi({ git, store, ctx, repositoryRoot: location.workTreeRoot }),
  };
}

function fixture(config?: unknown): FixtureRepo {
  const fx = buildFxIntake();
  fixtures.push(fx);
  if (config !== undefined) {
    fx.commit('B1', {
      subject: 'B1: review configuration',
      files: { '.sdd-review/config.json': JSON.stringify(config) },
    });
  }
  fx.write('src/cart.ts', `${fx.read('src/cart.ts')}// edited\n`);
  fx.write('src/promo.ts', 'export const promo = 1;\n');
  return fx;
}

describe('intake summary (C001-REQ-114)', () => {
  it('states the test command of the base commit configuration and records its source', async () => {
    const fx = fixture({ formatVersion: 1, tests: { command: 'npm test' } });
    const { api, store } = await rig(fx);
    const base = fx.label('B1').hash;
    const started = await api.startReview({ namedBase: base });
    expect(started.headCommit).toBe(base);
    expect(started.intakeSummary.testCommand).toEqual({
      command: 'npm test',
      origin: 'configuration',
    });
    const intake = await store.readSnapshot(started.snapshotId);
    expect(intake.snapshot.configurationSource).toEqual({
      default: false,
      commit: base,
      path: '.sdd-review/config.json',
      readable: true,
    });
  });

  it('prefers the test command given for the review', async () => {
    const fx = fixture({ formatVersion: 1, tests: { command: 'npm test' } });
    const { api } = await rig(fx);
    const started = await api.startReview({
      namedBase: fx.label('B1').hash,
      testCommand: 'npx jest',
    });
    expect(started.intakeSummary.testCommand).toEqual({ command: 'npx jest', origin: 'developer' });
  });

  it('states no test command and the default configuration source without a file', async () => {
    const fx = fixture();
    const { api, store } = await rig(fx);
    const started = await api.startReview({ namedBase: fx.label('B0').hash });
    expect(started.intakeSummary.testCommand).toBeNull();
    const intake = await store.readSnapshot(started.snapshotId);
    expect(intake.snapshot.configurationSource).toMatchObject({ default: true, readable: true });
  });
});

describe('moved-on check (C001-REQ-117)', () => {
  it('is none for an unchanged working tree, and names an edit made after intake', async () => {
    const fx = fixture();
    const { api } = await rig(fx);
    const { snapshotId } = await api.startReview({ namedBase: fx.label('B0').hash });
    expect(await api.checkMovedOn(snapshotId)).toBeNull();
    expect((await api.getSession(snapshotId)).movedOn).toBeNull();

    fx.write('src/order.ts', `${fx.read('src/order.ts')}// later\n`);
    const notice = await api.checkMovedOn(snapshotId);
    expect(notice).toMatchObject({ filesDiffering: ['src/order.ts'], headMoved: false });
    // The session view shows the last check; it does not run one at each poll.
    expect((await api.getSession(snapshotId)).movedOn).toEqual(notice);
  });

  it('runs when a review is resumed: openReview gives the notice in the session', async () => {
    const fx = fixture();
    const first = await rig(fx);
    const { snapshotId } = await first.api.startReview({ namedBase: fx.label('B0').hash });
    fx.commit('C3', { subject: 'C3', files: { 'src/util.ts': 'export const util = 0;\n' } });
    // A new process: a core with no earlier check and no kept hashes.
    const second = createCoreApi({
      git: adapters[0]!,
      store: first.store,
      ctx: { log: new ContextualLog(join(tempDir('api33log'), 'log.jsonl')) },
      repositoryRoot: fx.dir,
    });
    const session = await second.openReview(snapshotId);
    expect(session.movedOn?.headMoved).toBe(true);
    expect(session.movedOn?.currentHead).toBe(fx.label('C3').hash);
    expect(session.movedOn?.filesDiffering).toEqual(['src/util.ts']);
    expect(session.movedOn?.notice.code).toBe('ERR-INTAKE-007');
  });

  it('refuses an unknown snapshot with ERR-STORE-004', async () => {
    const { api } = await rig(fixture());
    await expect(api.checkMovedOn(`s-${'a'.repeat(64)}`)).rejects.toMatchObject({
      code: 'ERR-STORE-004',
    });
  });
});

describe('getFileContent (C001-REQ-116)', () => {
  it('serves the snapshot side from the snapshot, not the working tree', async () => {
    const fx = fixture();
    const { api } = await rig(fx);
    const { snapshotId } = await api.startReview({ namedBase: fx.label('B0').hash });
    const recorded = fx.read('src/cart.ts');
    fx.write('src/cart.ts', 'export const cart = 0;\n');
    fx.remove('src/promo.ts');
    expect(await api.getFileContent(snapshotId, 'src/cart.ts', 'snapshot')).toEqual({
      path: 'src/cart.ts',
      side: 'snapshot',
      binary: false,
      text: recorded,
    });
    expect((await api.getFileContent(snapshotId, 'src/promo.ts', 'snapshot')).text).toBe(
      'export const promo = 1;\n',
    );
  });

  it('serves the base side from the base commit, and none for an added file', async () => {
    const fx = fixture();
    const { api } = await rig(fx);
    const { snapshotId } = await api.startReview({ namedBase: fx.label('B0').hash });
    expect((await api.getFileContent(snapshotId, 'src/cart.ts', 'base')).text).toBe(
      'export const cart = (n: number) => n * 2;\n',
    );
    expect((await api.getFileContent(snapshotId, 'src/promo.ts', 'base')).text).toBeNull();
  });

  it('refuses a path the change does not hold with ERR-ACT-004', async () => {
    const fx = fixture();
    const { api } = await rig(fx);
    const { snapshotId } = await api.startReview({ namedBase: fx.label('B0').hash });
    const error = await api
      .getFileContent(snapshotId, 'src/util.ts', 'snapshot')
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ReviewError);
    expect((error as ReviewError).code).toBe('ERR-ACT-004');
    expect((error as ReviewError).message).toBe(
      `No changed file "src/util.ts" in review ${snapshotId}.`,
    );
  });
});
