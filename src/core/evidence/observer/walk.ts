import type { Dirent } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { causeOfWatchError } from './causes.js';
import type { BackendSink, WatchBase } from './observer.js';

/**
 * The directory walk of the subtree backends (FSEvents, ReadDirectoryChangesW). Their change
 * notification covers a whole tree with one stream or handle, so the walk only lists: a directory
 * that cannot be listed, or that lies on a file system that notifies local changes only, is "not
 * readable" by its path (C001-ADR-006 §9 table). A directory that appears during observation is
 * walked with `report`, and every entry the listing finds is reported as created, since a
 * directory moved in from elsewhere raises one event for itself and none for its content.
 */

export interface WalkOptions {
  /** Reports every non-directory entry found as created. */
  readonly report: boolean;
  /** Called for each directory the walk descends into (listed or not). */
  readonly onDirectory?: (rel: string) => void;
  /** The name of a file system that notifies local changes only, or null (default: none). */
  readonly localOnly?: (abs: string) => string | null;
  /** The walk stops when this returns true (the backend was closed). */
  readonly stopped: () => boolean;
  /** Directories listed at the same time; default 8, 1 with `report`. */
  readonly concurrency?: number;
}

const joinRel = (dir: string, name: string) => (dir === '' ? name : `${dir}/${name}`);

/** The absolute path of `rel` below the base. */
export const absOf = (base: WatchBase, rel: string): string =>
  rel === '' ? base.abs : join(base.abs, ...rel.split('/'));

/** Walks the directory at `rel` of `base` and every directory below it that the base descends. */
export async function walkTree(
  base: WatchBase,
  rel: string,
  sink: BackendSink,
  options: WalkOptions,
): Promise<void> {
  const pending = [rel];
  options.onDirectory?.(rel);
  const concurrency = options.report ? 1 : (options.concurrency ?? 8);

  const one = async (dirRel: string): Promise<void> => {
    const abs = absOf(base, dirRel);
    const gap = base.gapLabel(dirRel);
    const local = options.localOnly?.(abs) ?? null;
    if (local !== null) {
      sink.gap('not-readable', gap, `file system ${local} notifies local changes only`);
      return;
    }
    let entries: Dirent[];
    try {
      entries = await readdir(abs, { withFileTypes: true });
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      const cause = causeOfWatchError(code);
      if (cause === null) {
        // Gone before it could be listed; its parent reports the removal. A root that is gone
        // ends the observation.
        if (dirRel === '') sink.gap('observation-interrupted', null, `${abs}: ${code}`);
        return;
      }
      sink.gap(cause === 'watch-limit' ? 'not-readable' : cause, gap, `readdir: ${code}`);
      return;
    }
    for (const entry of entries) {
      const childRel = joinRel(dirRel, entry.name);
      if (entry.isDirectory()) {
        if (!base.descend(childRel)) continue;
        options.onDirectory?.(childRel);
        pending.push(childRel);
      } else if (options.report) {
        const label = base.label(childRel);
        if (label !== null) sink.change(label);
      }
    }
  };

  const worker = async () => {
    for (;;) {
      if (options.stopped()) return;
      const next = pending.pop();
      if (next === undefined) return;
      await one(next);
    }
  };
  // Workers that find the stack empty end; the last one still listing refills it, so the walk
  // runs until every worker has ended with an empty stack.
  while (pending.length > 0 && !options.stopped()) {
    await Promise.all(Array.from({ length: concurrency }, worker));
  }
}

/** A queue that runs a backend's work one task at a time; a task that throws fails the backend. */
export class SerialQueue {
  private chain: Promise<void> = Promise.resolve();
  busy = false;
  failed = false;

  constructor(
    private readonly sink: BackendSink,
    private readonly closed: () => boolean,
  ) {}

  enqueue(task: () => Promise<void>): Promise<void> {
    const run = async () => {
      if (this.closed() || this.failed) return;
      this.busy = true;
      try {
        await task();
      } catch (error) {
        this.failed = true;
        this.sink.failure(error);
      } finally {
        this.busy = false;
      }
    };
    const next = this.chain.then(run, run);
    this.chain = next;
    return next;
  }

  /** Resolves when every queued task has ended. */
  idle(): Promise<void> {
    return this.chain.catch(() => undefined);
  }
}
