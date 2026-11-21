import { readFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { afterEach, beforeAll, afterAll, describe, expect, it, vi } from 'vitest';
import { FixtureRepo } from '../../fixtures/builder/fixture-repo.js';
import { buildFxIntake } from '../../fixtures/repos/fx-intake.js';
import {
  CORE_OPERATIONS,
  createCore,
  createCoreApi,
  NotImplementedError,
  type CoreApi,
} from '../../../src/core/api/index.js';
import { ReviewError } from '../../../src/core/errors/review-error.js';
import { GitAdapter } from '../../../src/core/git/operations.js';
import { ContextualLog } from '../../../src/core/log/log.js';
import { RevisionStore } from '../../../src/core/store/revisions.js';
import { StoreLayout } from '../../../src/core/store/root.js';
import { SnapshotStore } from '../../../src/core/store/snapshots.js';
import { cleanTempDirs, tempDir } from '../store/helpers.js';

// C001-IF-003 §3 and §4 over a real fixture repository: intake -> store -> first revision, and the
// session read back. The other operations are stubs until their tasks.

vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 });

const NOW = new Date('2026-11-20T10:00:00.000Z');

/** Every operation of §3 and §4 of C001-IF-003, by name. */
const SECTION_3 = [
  'startReview',
  'runStaticAnalysis',
  'startJobs',
  'listJobs',
  'cancelJob',
  'openReview',
  'listReviews',
  'getSession',
  'checkMovedOn',
  'getIntakeSummary',
  'getArchitectureDelta',
  'getComponent',
  'getIntentMap',
  'getIntent',
  'getWalkthrough',
  'getEvidenceBundle',
  'getHunk',
  'getFileContent',
  'getReadingQueue',
  'getCoverageStatement',
  'getDecisionStatus',
  'getRecord',
  'exportResults',
  'validateConfiguration',
];
const SECTION_4 = [
  'markRead',
  'markIntentRead',
  'reopenHunk',
  'moveHunk',
  'createIntent',
  'rejectOrphanHunk',
  'setTestJudgement',
  'reportDefect',
  'setAttentionBudget',
  'addBundleCommand',
  'confirmBundleCommand',
  'giveVerdict',
  'runEvidenceBundle',
];

describe('operations of C001-IF-003', () => {
  it('exports exactly the operations of §3 and §4', () => {
    expect([...CORE_OPERATIONS].sort()).toEqual([...SECTION_3, ...SECTION_4].sort());
  });
});

describe('core API over a fixture repository', () => {
  let fx: FixtureRepo;
  let base: string;
  beforeAll(() => {
    fx = buildFxIntake();
    base = fx.label('B0').hash;
    fx.write('src/cart.ts', `${fx.read('src/cart.ts')}// edited\n`);
  });
  afterAll(() => fx.dispose());

  const opened: GitAdapter[] = [];
  afterEach(async () => {
    for (const git of opened.splice(0)) await git.close();
    cleanTempDirs();
  });

  async function rig(root = tempDir('api')) {
    const log = new ContextualLog(join(root, 'log.jsonl'));
    const git = new GitAdapter({ log });
    opened.push(git);
    const location = await git.discover(fx.dir);
    const layout = new StoreLayout(join(root, 'store'), 'k'.repeat(64));
    const ctx = { log, lockPollMs: 5, now: () => NOW };
    const store = new SnapshotStore(ctx, layout);
    const api = createCoreApi({
      git,
      store,
      ctx,
      repositoryRoot: location.workTreeRoot,
      now: () => NOW,
    });
    return { api, store, root };
  }

  it('startReview takes the change in, stores it and saves the first revision (C001-REQ-913 flow)', async () => {
    const { api, store } = await rig();
    const started = await api.startReview({ namedBase: base });
    expect(started.reopened).toBe(false);
    expect(started.snapshotId).toMatch(/^s-[0-9a-f]{64}$/);
    expect(started.intakeSummary.changedFiles).toBeGreaterThan(0);
    expect(started.notices).toEqual([]);
    expect((await store.listReviews()).map((r) => r.snapshotId)).toEqual([started.snapshotId]);

    const session = await api.getSession(started.snapshotId);
    expect(session).toMatchObject({
      snapshotId: started.snapshotId,
      revision: 1,
      staticAnalysisComplete: false,
      providerStatus: { mode: 'model-free', providerName: null, contentSentOffMachine: false },
      movedOn: null,
      jobs: [],
    });
    expect(await api.getIntakeSummary(started.snapshotId)).toEqual(started.intakeSummary);
    expect((await api.listReviews()).map((r) => r.snapshotId)).toEqual([started.snapshotId]);
  });

  it('startReview of the same change reopens it and writes no second revision', async () => {
    const { api } = await rig();
    const first = await api.startReview({ namedBase: base });
    const again = await api.startReview({ namedBase: base });
    expect(again.snapshotId).toBe(first.snapshotId);
    expect(again.reopened).toBe(true);
    expect(again.intakeSummary).toEqual(first.intakeSummary);
    expect((await api.getSession(first.snapshotId)).revision).toBe(1);
  });

  it('a failing startReview returns its catalogue code and changes no state', async () => {
    const { api, store } = await rig();
    await expect(api.startReview({ namedBase: 'no-such-commit-anywhere' })).rejects.toMatchObject({
      code: 'ERR-INTAKE-003',
    });
    expect(await store.listReviews()).toEqual([]);
  });

  it('exportResults writes the six files of C001-IF-001 and refuses an unwritable directory (ERR-CLI-002)', async () => {
    const { api, root } = await rig();
    const { snapshotId } = await api.startReview({ namedBase: base });
    const out = join(root, 'exported');
    const { files } = await api.exportResults(snapshotId, out);
    expect(files.map((f) => basename(f)).sort()).toEqual([
      'architecture-delta.json',
      'evidence.json',
      'intake.json',
      'intent-map.json',
      'review-record.jsonl',
      'triage.json',
    ]);
    const intent = JSON.parse(readFileSync(join(out, 'intent-map.json'), 'utf8')) as {
      snapshotId: string;
      orphanHunkIds: string[];
    };
    expect(intent.snapshotId).toBe(snapshotId);
    expect(intent.orphanHunkIds.length).toBeGreaterThan(0);
    expect(readFileSync(join(out, 'review-record.jsonl'), 'utf8').endsWith('\n')).toBe(true);

    await expect(api.exportResults(snapshotId, files[0] as string)).rejects.toMatchObject({
      code: 'ERR-CLI-002',
    });
    await expect(api.exportResults(`s-${'e'.repeat(64)}`, out)).rejects.toMatchObject({
      code: 'ERR-STORE-004',
    });
  });

  it('getSession and getIntakeSummary of an unknown or malformed snapshot ID return ERR-STORE-004', async () => {
    const { api } = await rig();
    for (const id of [`s-${'f'.repeat(64)}`, '../../etc', '']) {
      await expect(api.getSession(id)).rejects.toMatchObject({ code: 'ERR-STORE-004' });
      await expect(api.getIntakeSummary(id)).rejects.toMatchObject({ code: 'ERR-STORE-004' });
    }
  });

  it('lists and cancels jobs through the scheduler: none registered yet', async () => {
    const { api } = await rig();
    const { snapshotId } = await api.startReview({ namedBase: base });
    expect(await api.startJobs(snapshotId)).toEqual([]);
    expect(await api.listJobs(snapshotId)).toEqual([]);
    await expect(api.cancelJob(snapshotId, 'test-run')).rejects.toMatchObject({
      code: 'ERR-ACT-004',
    });
  });

  describe('operations whose task is later', () => {
    const SNAPSHOT = `s-${'a'.repeat(64)}`;
    const calls: Array<[keyof CoreApi, (api: CoreApi) => Promise<unknown>]> = [
      ['runStaticAnalysis', (a) => a.runStaticAnalysis(SNAPSHOT)],
      ['checkMovedOn', (a) => a.checkMovedOn(SNAPSHOT)],
      ['getArchitectureDelta', (a) => a.getArchitectureDelta(SNAPSHOT)],
      ['getComponent', (a) => a.getComponent(SNAPSHOT, 'c')],
      ['getIntentMap', (a) => a.getIntentMap(SNAPSHOT)],
      ['getIntent', (a) => a.getIntent(SNAPSHOT, 'i')],
      ['getWalkthrough', (a) => a.getWalkthrough(SNAPSHOT, 'i')],
      ['getEvidenceBundle', (a) => a.getEvidenceBundle(SNAPSHOT, 'i')],
      ['getHunk', (a) => a.getHunk(SNAPSHOT, 'h')],
      ['getFileContent', (a) => a.getFileContent(SNAPSHOT, 'p', 'base')],
      ['getReadingQueue', (a) => a.getReadingQueue(SNAPSHOT)],
      ['getCoverageStatement', (a) => a.getCoverageStatement(SNAPSHOT)],
      ['getDecisionStatus', (a) => a.getDecisionStatus(SNAPSHOT)],
      ['getRecord', (a) => a.getRecord(SNAPSHOT)],
      ['markRead', (a) => a.markRead(SNAPSHOT, ['h'])],
      ['markIntentRead', (a) => a.markIntentRead(SNAPSHOT, 'i')],
      ['reopenHunk', (a) => a.reopenHunk(SNAPSHOT, 'h')],
      ['moveHunk', (a) => a.moveHunk(SNAPSHOT, 'h', { orphan: true })],
      ['createIntent', (a) => a.createIntent(SNAPSHOT, 'n', ['h'])],
      ['rejectOrphanHunk', (a) => a.rejectOrphanHunk(SNAPSHOT, 'h', 'r')],
      ['setTestJudgement', (a) => a.setTestJudgement(SNAPSHOT, 'i', 'expresses')],
      ['reportDefect', (a) => a.reportDefect(SNAPSHOT, 'h', 't')],
      ['setAttentionBudget', (a) => a.setAttentionBudget(SNAPSHOT, 30)],
      ['addBundleCommand', (a) => a.addBundleCommand(SNAPSHOT, 'i', 'npm test')],
      ['confirmBundleCommand', (a) => a.confirmBundleCommand(SNAPSHOT, 'i', 'c')],
      ['giveVerdict', (a) => a.giveVerdict(SNAPSHOT, 'i', { kind: 'sign' })],
      ['runEvidenceBundle', (a) => a.runEvidenceBundle(SNAPSHOT, 'i')],
    ];

    it('lists every stub exactly once and leaves out only the implemented operations', () => {
      const implemented = [
        'startReview',
        'startJobs',
        'listJobs',
        'cancelJob',
        'listReviews',
        'openReview',
        'getSession',
        'getIntakeSummary',
        'exportResults',
        'validateConfiguration',
      ];
      expect(calls.map(([name]) => name).sort()).toEqual(
        CORE_OPERATIONS.filter((name) => !implemented.includes(name)).sort(),
      );
    });

    it.each(calls)('%s rejects with a typed not-implemented ERR-CLI-003', async (name, call) => {
      const { api } = await rig();
      const error = await call(api).catch((e: unknown) => e);
      expect(error).toBeInstanceOf(NotImplementedError);
      expect(error).toBeInstanceOf(ReviewError);
      expect((error as NotImplementedError).code).toBe('ERR-CLI-003');
      expect((error as NotImplementedError).operation).toBe(name);
      expect((error as NotImplementedError).message).toContain(name);
    });

    it('changes no state', async () => {
      const { api, store } = await rig();
      await api.giveVerdict(SNAPSHOT, 'i', { kind: 'sign' }).catch(() => undefined);
      expect(await store.listReviews()).toEqual([]);
    });
  });
});

describe('reopen and snapshot history (C001-T-034: C001-REQ-118, C001-REQ-119)', () => {
  let fx: FixtureRepo;
  let base: string;
  beforeAll(() => {
    fx = buildFxIntake();
    base = fx.label('B0').hash;
  });
  afterAll(() => fx.dispose());

  const opened: Array<{ close(): Promise<void> }> = [];
  afterEach(async () => {
    for (const item of opened.splice(0)) await item.close();
    cleanTempDirs();
  });

  let clock = 0;
  const tick = () => new Date(Date.parse('2026-11-20T10:00:00.000Z') + 1000 * clock++);

  async function rig(root = tempDir('api-reopen')) {
    const log = new ContextualLog(join(root, 'log.jsonl'));
    const git = new GitAdapter({ log });
    opened.push(git);
    const location = await git.discover(fx.dir);
    const layout = new StoreLayout(join(root, 'store'), 'k'.repeat(64));
    const ctx = { log, lockPollMs: 5, now: tick };
    const store = new SnapshotStore(ctx, layout);
    const core = createCore({ git, store, ctx, repositoryRoot: location.workTreeRoot, now: tick });
    opened.push(core);
    return { core, api: core.api, store, root };
  }

  /** An analysis result delivered as a revision, as a job delivers it. */
  async function deliverIntentMap(
    core: Awaited<ReturnType<typeof rig>>['core'],
    snapshotId: string,
    intentMap: Record<string, unknown>,
  ) {
    await core.loops.get(snapshotId).submit({
      kind: 'job-result',
      run: ({ current }) => ({
        result: undefined,
        documents: { ...current!.documents, 'intent-map': intentMap },
      }),
    });
  }

  it('an intake of an existing snapshot reopens it with its current revision and submits no event', async () => {
    fx.write('src/util.ts', `${fx.read('src/util.ts')}// reopen\n`);
    const { core, api, store } = await rig();
    const first = await api.startReview({ namedBase: base });
    const recorded = { document: 'intent-map', snapshotId: first.snapshotId, intents: ['kept'] };
    await deliverIntentMap(core, first.snapshotId, recorded);
    const createdIndex = (await store.listReviews())[0];

    const submit = vi.spyOn(core.loops.get(first.snapshotId), 'submit');
    for (let i = 0; i < 2; i++) {
      const again = await api.startReview({ namedBase: base });
      expect(again).toMatchObject({ snapshotId: first.snapshotId, reopened: true });
      expect(again.intakeSummary).toEqual(first.intakeSummary);
    }
    expect(submit).not.toHaveBeenCalled();
    expect((await api.getSession(first.snapshotId)).revision).toBe(2);
    const current = await new RevisionStore(
      { log: new ContextualLog(join(tempDir('log'), 'l.jsonl')) },
      store.snapshotDir(first.snapshotId),
    ).load();
    expect(current?.documents['intent-map']).toEqual(recorded);
    const [listed] = await api.listReviews();
    expect(listed?.createdAt).toBe(createdIndex?.createdAt);
    expect(listed!.lastOpenedAt > createdIndex!.lastOpenedAt).toBe(true);
    fx.write('src/util.ts', 'export const util = (s: string) => s.trim();\n');
  });

  it('a new snapshot keeps every earlier snapshot, its record and its results, and listReviews names each record file', async () => {
    const { api, store } = await rig();
    fx.write('src/order.ts', `${fx.read('src/order.ts')}// s1\n`);
    const s1 = await api.startReview({ namedBase: base });
    await store
      .record(s1.snapshotId)
      .append([
        { kind: 'read-mark', surface: 'cli', user: { name: 'a', email: 'a@b' }, hunkIds: ['h-1'] },
      ] as never);
    const recordBefore = readFileSync(store.record(s1.snapshotId).file);
    const s1Folder = store.snapshotDir(s1.snapshotId);
    const snapshotBefore = readFileSync(join(s1Folder, 'snapshot.json'));

    fx.write('src/order.ts', `${fx.read('src/order.ts')}// s2\n`);
    const s2 = await api.startReview({ namedBase: base });
    expect(s2.snapshotId).not.toBe(s1.snapshotId);
    expect(s2.reopened).toBe(false);

    const listed = await api.listReviews();
    expect(listed.map((r) => r.snapshotId)).toEqual([s1.snapshotId, s2.snapshotId]);
    for (const review of listed) {
      expect(review.recordFile).toBe(store.record(review.snapshotId).file);
      expect(review.decisionStatus).toBeNull();
    }
    expect(readFileSync(store.record(s1.snapshotId).file).equals(recordBefore)).toBe(true);
    expect(readFileSync(join(s1Folder, 'snapshot.json')).equals(snapshotBefore)).toBe(true);
    expect((await api.getSession(s1.snapshotId)).revision).toBe(1);
    fx.write('src/order.ts', 'export const order = () => [1, 2, 3];\n');
  });

  it('openReview reopens a stored review without intake and refuses an unknown one (ERR-STORE-004)', async () => {
    fx.write('src/cart.ts', `${fx.read('src/cart.ts')}// open\n`);
    const { core, api } = await rig();
    const { snapshotId } = await api.startReview({ namedBase: base });
    const before = (await api.listReviews())[0]!;
    const submit = vi.spyOn(core.loops.get(snapshotId), 'submit');
    const session = await api.openReview(snapshotId);
    expect(session).toMatchObject({ snapshotId, revision: 1 });
    expect(submit).not.toHaveBeenCalled();
    const after = (await api.listReviews())[0]!;
    expect(after.lastOpenedAt > before.lastOpenedAt).toBe(true);

    for (const id of [`s-${'f'.repeat(64)}`, '../x', '']) {
      await expect(api.openReview(id)).rejects.toMatchObject({ code: 'ERR-STORE-004' });
    }
    expect((await api.listReviews()).map((r) => r.snapshotId)).toEqual([snapshotId]);
    fx.write('src/cart.ts', 'export const cart = (n: number) => n * 2;\n');
  });
});
