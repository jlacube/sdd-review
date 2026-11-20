import type { CurrentRevision, LoadedRevision, RevisionDocuments } from '../store/revisions.js';

/**
 * The event loop of one snapshot (architecture §4.2 items 1 and 3, C001-COMP-002).
 *
 * The orchestrator of the process that runs a snapshot's jobs is its only writer. It handles the
 * snapshot's events (a recorded action, a job result, an intake step) one at a time, in the order
 * they were submitted. After each event it saves the analysis documents as a new revision and makes
 * it current; only then is the event's result delivered to its submitter and announced to the
 * listeners. A result whose revision could not be made current is never shown.
 */

/** What an event is, for the log and for the listeners. */
export type EventKind = 'intake' | 'action' | 'job-result' | 'cancellation';

/** What a handler is given. */
export interface EventContext {
  /** The revision current when the event's turn comes; `null` before the first revision. */
  readonly current: LoadedRevision | null;
  /** The number the revision written after this event will have. */
  readonly revision: number;
  /** Aborted when the event is cancelled; a long handler stops early. */
  readonly signal: AbortSignal;
}

export interface EventOutcome<T> {
  /** What the submitter receives once the revision is current. */
  readonly result: T;
  /** The new analysis documents; the current revision's documents when absent. */
  readonly documents?: RevisionDocuments;
  /** Sequence number of the last record entry applied; the current revision's when absent. */
  readonly appliedSeq?: number;
}

export interface SnapshotEvent<T> {
  readonly kind: EventKind;
  /** Cancels the event: dropped before its turn, its result discarded when it fires while it runs. */
  readonly signal?: AbortSignal;
  run(context: EventContext): Promise<EventOutcome<T>> | EventOutcome<T>;
}

/** Announced after a revision is current. */
export interface ShownRevision {
  readonly snapshotId: string;
  readonly kind: EventKind;
  readonly revision: number;
}

/** The part of the revision store the loop uses (`RevisionStore` fits). */
export interface RevisionSink {
  readCurrent(): CurrentRevision | null;
  load(): Promise<LoadedRevision | null>;
  commit(revision: number, appliedSeq: number, documents: RevisionDocuments): Promise<void>;
}

/** The event was cancelled: nothing of it was saved or shown. */
export class EventCancelled extends Error {
  constructor(readonly eventKind: EventKind) {
    super(`the ${eventKind} event was cancelled`);
    this.name = 'EventCancelled';
  }
}

export interface EventLoopOptions {
  /** Called after each revision is current, before the next event starts. */
  readonly onShown?: (shown: ShownRevision) => void;
}

export class SnapshotEventLoop {
  private tail: Promise<unknown> = Promise.resolve();
  private closed = false;
  private readonly closing = new AbortController();

  constructor(
    readonly snapshotId: string,
    private readonly revisions: RevisionSink,
    private readonly options: EventLoopOptions = {},
  ) {}

  /**
   * Queues an event behind those already submitted. Resolves with the handler's result once the
   * event's revision is current; rejects with the handler's error, with the store's error when the
   * revision cannot be saved, or with `EventCancelled`.
   */
  submit<T>(event: SnapshotEvent<T>): Promise<T> {
    if (this.closed) return Promise.reject(new EventCancelled(event.kind));
    const turn = this.tail.then(() => this.handle(event));
    this.tail = turn.then(
      () => undefined,
      () => undefined,
    );
    return turn;
  }

  /** Resolves when every event submitted so far has finished. */
  idle(): Promise<void> {
    return this.tail.then(() => undefined);
  }

  /** Refuses new events, cancels the queued ones and waits for the running one to finish. */
  async close(): Promise<void> {
    this.closed = true;
    this.closing.abort();
    await this.idle();
  }

  private async handle<T>(event: SnapshotEvent<T>): Promise<T> {
    const cancelled = () => this.closing.signal.aborted || event.signal?.aborted === true;
    if (cancelled()) throw new EventCancelled(event.kind);
    const current = await this.revisions.load();
    const revision = (current?.revision ?? 0) + 1;
    const signal = event.signal ?? new AbortController().signal;
    const outcome = await event.run({ current, revision, signal });
    // Cancelled while it ran: the result was never shown, so it is dropped. A close() lets the
    // event that is running finish, so only the event's own signal counts here.
    if (event.signal?.aborted) throw new EventCancelled(event.kind);
    const documents = outcome.documents ?? current?.documents;
    if (!documents) {
      throw new Error(`the ${event.kind} event changed nothing and no revision exists to carry on`);
    }
    await this.revisions.commit(
      revision,
      outcome.appliedSeq ?? current?.appliedSeq ?? 0,
      documents,
    );
    this.options.onShown?.({ snapshotId: this.snapshotId, kind: event.kind, revision });
    return outcome.result;
  }
}

/** One loop per snapshot in this process: the one writer of that snapshot. */
export class SnapshotLoops {
  private readonly loops = new Map<string, SnapshotEventLoop>();

  constructor(private readonly make: (snapshotId: string) => SnapshotEventLoop) {}

  get(snapshotId: string): SnapshotEventLoop {
    let loop = this.loops.get(snapshotId);
    if (!loop) {
      loop = this.make(snapshotId);
      this.loops.set(snapshotId, loop);
    }
    return loop;
  }

  async closeAll(): Promise<void> {
    await Promise.all([...this.loops.values()].map((loop) => loop.close()));
    this.loops.clear();
  }
}
