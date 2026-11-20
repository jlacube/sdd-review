import type { components } from '../../generated/openapi.js';
import { ReviewError } from '../errors/review-error.js';
import type { ContextualLog } from '../log/log.js';
import type { LoadedRevision, RevisionDocuments } from '../store/revisions.js';
import type { SnapshotStore } from '../store/snapshots.js';
import { EventCancelled, type SnapshotLoops } from './event-loop.js';

/**
 * Background jobs of a snapshot (architecture §4.2, C001-COMP-002): the test run, mutation
 * testing, model tasks and evidence bundle runs that publish their results as later revisions.
 * This file is the scheduler; the jobs themselves are registered by their tasks (C001-T-043 and
 * later) with `register`.
 *
 * Job states are persisted in `review.json` (`jobStates`) so that a reopened review lists them and
 * starts again the jobs an unexpected end interrupted. A job result is delivered through the
 * snapshot's event loop, so it is shown only after its revision is current; the job is `completed`
 * only after that.
 */

export type Job = components['schemas']['Job'];
export type JobKind = Job['kind'];
export type JobStatus = Job['status'];

/** A job as persisted: the listed fields, and the key of a job that exists once per key. */
export interface JobState extends Job {
  readonly key?: string;
}

const isLive = (status: JobStatus) => status === 'pending' || status === 'running';

export interface JobContext {
  readonly snapshotId: string;
  readonly jobId: string;
  readonly key: string | undefined;
  /** Aborted when the job is cancelled. */
  readonly signal: AbortSignal;
  /** Persists the progress shown in the job list. */
  progress(done: number, total: number): Promise<void>;
}

export type JobOutcome =
  | {
      readonly status: 'completed';
      /** The analysis documents with this job's result merged in, from the current revision's. */
      merge(current: LoadedRevision | null): RevisionDocuments;
      readonly appliedSeq?: number;
    }
  | { readonly status: 'unavailable'; readonly reason: string };

export interface JobRunner {
  run(context: JobContext): Promise<JobOutcome> | JobOutcome;
}

export interface JobSchedulerDeps {
  readonly store: SnapshotStore;
  readonly loops: SnapshotLoops;
  readonly log?: Pick<ContextualLog, 'recordError'>;
}

interface Running {
  readonly controller: AbortController;
  readonly done: Promise<void>;
}

const isJobState = (value: unknown): value is JobState =>
  typeof value === 'object' &&
  value !== null &&
  typeof (value as JobState).jobId === 'string' &&
  typeof (value as JobState).kind === 'string' &&
  typeof (value as JobState).status === 'string';

export class JobScheduler {
  private readonly runners = new Map<JobKind, JobRunner>();
  private readonly running = new Map<string, Running>();
  private readonly writes = new Map<string, Promise<unknown>>();

  constructor(private readonly deps: JobSchedulerDeps) {}

  /** A later task registers the runner of its kind of job. */
  register(kind: JobKind, runner: JobRunner): void {
    this.runners.set(kind, runner);
  }

  /** Every job of the snapshot, as persisted, in the order they were first started. */
  async list(snapshotId: string): Promise<JobState[]> {
    const { jobStates } = await this.deps.store.readReviewState(snapshotId);
    return Object.values(jobStates).filter(isJobState);
  }

  /**
   * Starts the registered kinds that have no job yet; a job that ended (completed, unavailable,
   * cancelled) is not started again, and a running one is not started twice.
   */
  async start(snapshotId: string): Promise<JobState[]> {
    const known = new Map((await this.list(snapshotId)).map((job) => [job.jobId, job]));
    for (const kind of this.runners.keys()) {
      const existing = known.get(kind);
      if (existing || this.running.has(runKey(snapshotId, kind))) continue;
      await this.startOne(snapshotId, kind);
    }
    return this.list(snapshotId);
  }

  /**
   * Starts one job, whatever its earlier state (an evidence bundle run is started on request).
   * The job id is the kind, or `kind:key` for a kind that exists once per key.
   */
  async startOne(snapshotId: string, kind: JobKind, key?: string): Promise<JobState> {
    const runner = this.runners.get(kind);
    if (!runner) {
      throw new ReviewError('ERR-CLI-003', {
        operation: 'start-job',
        inputs: { snapshotId, kind },
        params: { operation: 'start-job', cause: `no job of kind ${kind} is registered` },
        cause: `no job of kind ${kind} is registered`,
      });
    }
    const jobId = key === undefined ? kind : `${kind}:${key}`;
    const id = runKey(snapshotId, jobId);
    const live = this.running.get(id);
    if (live) {
      return (await this.list(snapshotId)).find((job) => job.jobId === jobId) as JobState;
    }
    const pending: JobState = {
      jobId,
      kind,
      status: 'pending',
      ...(key === undefined ? {} : { key }),
    };
    await this.update(snapshotId, jobId, () => pending);
    const controller = new AbortController();
    const done = this.execute(snapshotId, pending, runner, controller).finally(() => {
      this.running.delete(id);
    });
    this.running.set(id, { controller, done });
    return pending;
  }

  /**
   * Cancels a job: ERR-ACT-004 when the snapshot has no such job. A job that ended stays as it
   * is. The result of a cancelled job is discarded even when its runner returns one.
   */
  async cancel(snapshotId: string, jobId: string): Promise<JobState[]> {
    const jobs = await this.list(snapshotId);
    const job = jobs.find((j) => j.jobId === jobId);
    if (!job) {
      throw new ReviewError('ERR-ACT-004', {
        operation: 'cancel-job',
        inputs: { snapshotId, jobId },
        params: { kind: 'job', value: jobId, 'snapshot-id': snapshotId },
      });
    }
    if (isLive(job.status)) {
      this.running.get(runKey(snapshotId, jobId))?.controller.abort();
      await this.update(snapshotId, jobId, (prev) =>
        prev && isLive(prev.status) ? { ...prev, status: 'cancelled' } : prev,
      );
    }
    return this.list(snapshotId);
  }

  /**
   * After a reopen (architecture §4.2 item 4): a job persisted as pending or running that no run of
   * this process holds is started again, from the start.
   */
  async resume(snapshotId: string): Promise<JobState[]> {
    for (const job of await this.list(snapshotId)) {
      if (!isLive(job.status) || this.running.has(runKey(snapshotId, job.jobId))) continue;
      if (this.runners.has(job.kind)) await this.startOne(snapshotId, job.kind, job.key);
    }
    return this.list(snapshotId);
  }

  /** Resolves when no job of the snapshot is running in this process. */
  async whenSettled(snapshotId: string): Promise<void> {
    const prefix = `${snapshotId}\u0000`;
    for (;;) {
      const live = [...this.running.entries()].filter(([id]) => id.startsWith(prefix));
      if (live.length === 0) return;
      await Promise.all(live.map(([, run]) => run.done));
    }
  }

  private async execute(
    snapshotId: string,
    job: JobState,
    runner: JobRunner,
    controller: AbortController,
  ): Promise<void> {
    const { jobId } = job;
    const { signal } = controller;
    const live = (prev: JobState | undefined) => prev !== undefined && isLive(prev.status);
    try {
      await this.update(snapshotId, jobId, (prev) =>
        live(prev) ? { ...(prev as JobState), status: 'running' } : prev,
      );
      if (signal.aborted) return;
      let outcome: JobOutcome;
      try {
        outcome = await runner.run({
          snapshotId,
          jobId,
          key: job.key,
          signal,
          progress: (done, total) =>
            this.update(snapshotId, jobId, (prev) =>
              prev && prev.status === 'running' ? { ...prev, done, total } : prev,
            ),
        });
      } catch (error) {
        if (signal.aborted) return;
        this.record(error, jobId);
        outcome = { status: 'unavailable', reason: describe(error) };
      }
      if (signal.aborted) return;
      if (outcome.status === 'completed') {
        const { merge, appliedSeq } = outcome;
        try {
          await this.deps.loops.get(snapshotId).submit({
            kind: 'job-result',
            signal,
            run: (context) => ({
              result: undefined,
              documents: merge(context.current),
              ...(appliedSeq === undefined ? {} : { appliedSeq }),
            }),
          });
        } catch (error) {
          if (error instanceof EventCancelled) return;
          // Its revision did not become current, so nothing of it was shown.
          this.record(error, jobId);
          outcome = { status: 'unavailable', reason: describe(error) };
        }
      }
      await this.finish(snapshotId, jobId, outcome);
    } catch (error) {
      // The job state itself could not be saved (ERR-STORE-001): the job lists as it was persisted.
      this.record(error, jobId);
    }
  }

  private finish(snapshotId: string, jobId: string, outcome: JobOutcome): Promise<void> {
    return this.update(snapshotId, jobId, (prev) => {
      if (!prev || !isLive(prev.status)) return prev; // cancelled meanwhile
      if (outcome.status === 'unavailable') {
        return { ...prev, status: 'unavailable', reason: outcome.reason };
      }
      return { ...prev, status: 'completed', reason: null };
    });
  }

  /** Read-modify-write of one job state, one at a time per snapshot (`review.json` has no lock). */
  private update(
    snapshotId: string,
    jobId: string,
    change: (previous: JobState | undefined) => JobState | undefined,
  ): Promise<void> {
    const before = this.writes.get(snapshotId) ?? Promise.resolve();
    const next = before
      .catch(() => undefined)
      .then(async () => {
        const state = await this.deps.store.readReviewState(snapshotId);
        const previous = state.jobStates[jobId];
        const updated = change(isJobState(previous) ? previous : undefined);
        if (updated === undefined || updated === previous) return;
        await this.deps.store.writeReviewState(snapshotId, {
          ...state,
          jobStates: { ...state.jobStates, [jobId]: updated },
        });
      });
    this.writes.set(snapshotId, next);
    return next;
  }

  private record(error: unknown, jobId: string): void {
    try {
      this.deps.log?.recordError(error, 'run-job', { jobId });
    } catch {
      /* logging never changes the state of a job */
    }
  }
}

const runKey = (snapshotId: string, jobId: string) => `${snapshotId}\u0000${jobId}`;
const describe = (error: unknown) => (error instanceof Error ? error.message : String(error));
