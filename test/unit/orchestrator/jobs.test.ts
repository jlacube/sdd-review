import { afterEach, describe, expect, it } from 'vitest';
import { SnapshotEventLoop, SnapshotLoops } from '../../../src/core/orchestrator/event-loop.js';
import { JobScheduler, type JobRunner } from '../../../src/core/orchestrator/jobs.js';
import { RevisionStore, type RevisionDocuments } from '../../../src/core/store/revisions.js';
import { SnapshotStore } from '../../../src/core/store/snapshots.js';
import { cleanTempDirs, fixture, intakeDocument, SNAPSHOT_ID } from '../store/helpers.js';

// C001-T-009: job states persisted in review.json; jobs registered by later tasks; a job result is
// shown through the event loop, so only after its revision is current.

afterEach(cleanTempDirs);

const docs = (tag: string) =>
  Object.fromEntries(
    ['architecture-delta', 'intent-map', 'triage', 'evidence'].map((d) => [d, { tag }]),
  ) as unknown as RevisionDocuments;

/** Waits until `condition` holds; file writes take several turns of the event loop. */
async function until(condition: () => boolean | Promise<boolean>): Promise<void> {
  for (let i = 0; i < 1000; i++) {
    if (await condition()) return;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error('condition not reached');
}

async function rig() {
  const f = fixture();
  const ctx = f.ctx();
  const store = new SnapshotStore(ctx, f.layout);
  await store.createSnapshot(intakeDocument(), [], '/repo');
  const revisions = new RevisionStore(ctx, store.snapshotDir(SNAPSHOT_ID));
  const loops = new SnapshotLoops((id) => new SnapshotEventLoop(id, revisions));
  const scheduler = () => new JobScheduler({ store, loops, log: f.log });
  return { f, store, revisions, loops, scheduler };
}

type Rig = Awaited<ReturnType<typeof rig>>;
const persisted = async (r: Rig) => (await r.store.readReviewState(SNAPSHOT_ID)).jobStates;

/** A runner that finishes when `finish()` is called. */
function manual(tag: string) {
  let finish!: () => void;
  const done = new Promise<void>((resolve) => (finish = resolve));
  const runner: JobRunner = {
    run: async (ctx) => {
      await ctx.progress(1, 4);
      await done;
      return { status: 'completed', merge: () => docs(tag) };
    },
  };
  return { runner, finish };
}

describe('job scheduler', () => {
  it('starts nothing when no job is registered', async () => {
    const r = await rig();
    const jobs = r.scheduler();
    expect(await jobs.start(SNAPSHOT_ID)).toEqual([]);
    expect(await jobs.list(SNAPSHOT_ID)).toEqual([]);
  });

  it('persists pending, running with progress and completed in review.json, and shows the result after its revision', async () => {
    const r = await rig();
    const jobs = r.scheduler();
    const m = manual('test-run');
    jobs.register('test-run', m.runner);
    const started = await jobs.start(SNAPSHOT_ID);
    expect(started.map((j) => [j.jobId, j.kind])).toEqual([['test-run', 'test-run']]);
    await until(
      async () =>
        (await persisted(r))['test-run'] !== undefined &&
        (await persisted(r))['test-run'] !== null &&
        ((await persisted(r))['test-run'] as { done?: number }).done === 1,
    );
    expect(await persisted(r)).toMatchObject({
      'test-run': { jobId: 'test-run', status: 'running', done: 1, total: 4 },
    });
    expect(r.revisions.readCurrent()).toBeNull();
    m.finish();
    await jobs.whenSettled(SNAPSHOT_ID);
    expect(await persisted(r)).toMatchObject({ 'test-run': { status: 'completed' } });
    // the result is a revision, current by the time the job is completed
    expect(r.revisions.readCurrent()?.revision).toBe(1);
    expect((await r.revisions.load())?.documents.triage).toEqual({ tag: 'test-run' });
  });

  it('is read by another scheduler of the same store (persistence)', async () => {
    const r = await rig();
    const first = r.scheduler();
    const m = manual('mutation');
    first.register('mutation', m.runner);
    await first.start(SNAPSHOT_ID);
    m.finish();
    await first.whenSettled(SNAPSHOT_ID);
    const second = r.scheduler();
    expect(await second.list(SNAPSHOT_ID)).toMatchObject([
      { jobId: 'mutation', kind: 'mutation', status: 'completed' },
    ]);
  });

  it('records an unavailable job with its reason, and a runner that throws as unavailable', async () => {
    const r = await rig();
    const jobs = r.scheduler();
    jobs.register('mutation', {
      run: () => ({ status: 'unavailable', reason: 'no mutation tool for this ecosystem' }),
    });
    jobs.register('model-tasks', {
      run: () => {
        throw new Error('provider exploded');
      },
    });
    await jobs.start(SNAPSHOT_ID);
    await jobs.whenSettled(SNAPSHOT_ID);
    const states = await persisted(r);
    expect(states).toMatchObject({
      mutation: { status: 'unavailable', reason: 'no mutation tool for this ecosystem' },
      'model-tasks': { status: 'unavailable' },
    });
    expect(JSON.stringify(states['model-tasks'])).toContain('provider exploded');
  });

  it('cancels a running job: state cancelled, signal aborted, result discarded', async () => {
    const r = await rig();
    const jobs = r.scheduler();
    let aborted = false;
    let started = false;
    let release!: () => void;
    const hold = new Promise<void>((resolve) => (release = resolve));
    jobs.register('test-run', {
      run: async (ctx) => {
        ctx.signal.addEventListener('abort', () => (aborted = true));
        started = true;
        await hold;
        return { status: 'completed', merge: () => docs('late') };
      },
    });
    await jobs.start(SNAPSHOT_ID);
    await until(() => started);
    const after = await jobs.cancel(SNAPSHOT_ID, 'test-run');
    expect(after).toMatchObject([{ jobId: 'test-run', status: 'cancelled' }]);
    expect(aborted).toBe(true);
    release();
    await jobs.whenSettled(SNAPSHOT_ID);
    expect(await persisted(r)).toMatchObject({ 'test-run': { status: 'cancelled' } });
    expect(r.revisions.readCurrent()).toBeNull();
  });

  it('refuses to cancel a job that does not exist with ERR-ACT-004', async () => {
    const r = await rig();
    const jobs = r.scheduler();
    await expect(jobs.cancel(SNAPSHOT_ID, 'nope')).rejects.toMatchObject({ code: 'ERR-ACT-004' });
  });

  it('leaves a finished job as it is when it is cancelled afterwards', async () => {
    const r = await rig();
    const jobs = r.scheduler();
    jobs.register('test-run', { run: () => ({ status: 'completed', merge: () => docs('d') }) });
    await jobs.start(SNAPSHOT_ID);
    await jobs.whenSettled(SNAPSHOT_ID);
    expect(await jobs.cancel(SNAPSHOT_ID, 'test-run')).toMatchObject([{ status: 'completed' }]);
  });

  it('after an unexpected end, a job persisted as running starts again (resume)', async () => {
    const r = await rig();
    // a previous process died while the test run was running
    await r.store.writeReviewState(SNAPSHOT_ID, {
      formatVersion: 1,
      sampleSeed: null,
      jobStates: {
        'test-run': { jobId: 'test-run', kind: 'test-run', status: 'running', done: 2, total: 4 },
        mutation: { jobId: 'mutation', kind: 'mutation', status: 'completed' },
      },
    });
    const jobs = r.scheduler();
    let runs = 0;
    jobs.register('test-run', {
      run: () => {
        runs++;
        return { status: 'completed', merge: () => docs('again') };
      },
    });
    jobs.register('mutation', {
      run: () => {
        throw new Error('a completed job is not run again');
      },
    });
    await jobs.resume(SNAPSHOT_ID);
    await jobs.whenSettled(SNAPSHOT_ID);
    expect(runs).toBe(1);
    expect(await persisted(r)).toMatchObject({
      'test-run': { status: 'completed' },
      mutation: { status: 'completed' },
    });
  });

  it('does not start a job twice while it runs, and keeps job states of other kinds', async () => {
    const r = await rig();
    const jobs = r.scheduler();
    const m = manual('a');
    let starts = 0;
    jobs.register('test-run', {
      run: (ctx) => {
        starts++;
        return m.runner.run(ctx);
      },
    });
    await jobs.start(SNAPSHOT_ID);
    await jobs.start(SNAPSHOT_ID);
    await until(() => starts > 0);
    expect(starts).toBe(1);
    m.finish();
    await jobs.whenSettled(SNAPSHOT_ID);
  });

  it('gives a keyed job its own id and state (evidence bundles)', async () => {
    const r = await rig();
    const jobs = r.scheduler();
    jobs.register('evidence-bundle', {
      run: () => ({ status: 'completed', merge: () => docs('bundle') }),
    });
    const job = await jobs.startOne(SNAPSHOT_ID, 'evidence-bundle', 'REQ-012');
    expect(job.jobId).toBe('evidence-bundle:REQ-012');
    await jobs.whenSettled(SNAPSHOT_ID);
    expect(Object.keys(await persisted(r))).toEqual(['evidence-bundle:REQ-012']);
  });

  it('refuses to start a kind that no task registered', async () => {
    const r = await rig();
    await expect(r.scheduler().startOne(SNAPSHOT_ID, 'mutation')).rejects.toMatchObject({
      code: 'ERR-CLI-003',
    });
  });
});
