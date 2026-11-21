import { isAbsolute, relative, sep } from 'node:path';
import { ReviewError } from '../../errors/review-error.js';
import type { ContextualLog } from '../../log/log.js';
import {
  isAtOrBelow,
  summariseGaps,
  type Gap,
  type IncompleteCause,
  type IncompleteCauseReport,
  type ObservedPart,
} from './causes.js';

/**
 * The working-tree observer (C001-IF-013 §9 items 3 and 4, C001-ADR-006 §9): one persistent
 * change-notification observer per process, started before the first evidence run and kept until
 * the process ends. It is OS-independent; a backend per part and operating system (inotify on
 * Linux; FSEvents and ReadDirectoryChangesW in C001-T-018) feeds it changes and gaps.
 *
 * Every change and every gap gets an event position. A run records the position at its start and
 * at its end, each after draining the backends, so its window holds exactly what the mechanism
 * delivered from the start of the command to its end. Changes outside every run window only keep
 * the watch tables current and are not stored. A gap stays open until it is resolved (its
 * directory removed) or the part's backend is rebuilt; a run reports every gap open at any
 * position of its window. A loss (events lost, observation interrupted, observer failure) triggers
 * a rebuild of the part at low priority; while it runs the part is "observation interrupted".
 * There is no fallback comparison after lost events (C001-ADR-006 §9).
 */

// ---------------------------------------------------------------------------------------------
// Scope (C001-ADR-006 §9 "Scope")

/** Absolute paths of the observed repository (C001-IF-012 G-01). */
export interface ObserverScope {
  readonly root: string;
  readonly gitDir: string;
  readonly commonGitDir: string;
}

/**
 * One directory a backend watches, with what it watches below it and what it reports. Paths
 * given to the predicates are relative to `abs`, with `/` separators ('' for `abs` itself).
 */
export interface WatchBase {
  readonly abs: string;
  /** Whether the directory at `rel` is watched (and listed); `abs` itself always is. */
  descend(rel: string): boolean;
  /** The label of a non-directory entry at `rel` in its part, or null when it is not observed. */
  label(rel: string): string | null;
  /** The label of the directory at `rel` for a gap; null stands for the whole part. */
  gapLabel(rel: string): string | null;
}

const toSlash = (p: string) => p.split(sep).join('/');

/** `child` relative to `parent` with `/` separators, or null when it is not below `parent`. */
export function relativeBelow(parent: string, child: string): string | null {
  const rel = relative(parent, child);
  if (rel === '' || rel.startsWith('..') || isAbsolute(rel)) return null;
  return toSlash(rel);
}

/**
 * The working-tree part: every path under the root, ignored paths included, outside the git
 * directory and the common git directory.
 */
export function workingTreeBase(scope: ObserverScope): WatchBase {
  const excluded = [scope.gitDir, scope.commonGitDir]
    .map((dir) => relativeBelow(scope.root, dir))
    .filter((rel): rel is string => rel !== null);
  const inScope = (rel: string) => !excluded.some((ex) => isAtOrBelow(rel, ex));
  return {
    abs: scope.root,
    descend: inScope,
    label: (rel) => (rel !== '' && inScope(rel) ? rel : null),
    gapLabel: (rel) => (rel === '' ? null : rel),
  };
}

const REPOSITORY_FILES = new Set(['index', 'HEAD', 'packed-refs']);
const REF_TREES = ['refs', 'reftable'];

/** Lock files are not reported; their rename onto the target is (C001-ADR-006 §9). */
export const isLockFile = (rel: string) => rel.endsWith('.lock');

/**
 * The repository part: `index`, `HEAD`, `packed-refs`, `refs/` and `reftable/` of the git
 * directory and of the common git directory (once when they are the same). Labels are relative
 * to the common git directory (`HEAD`, `refs/tags/v1`, `worktrees/wt/index` of a linked
 * worktree), or absolute when a git directory lies elsewhere.
 */
export function repositoryBases(scope: ObserverScope): WatchBase[] {
  const dirs = [scope.gitDir];
  if (relative(scope.gitDir, scope.commonGitDir) !== '') dirs.push(scope.commonGitDir);
  return dirs.map((dir) => {
    const prefix = relative(scope.commonGitDir, dir);
    const outside = prefix.startsWith('..') || isAbsolute(prefix);
    const base = outside ? toSlash(dir) : toSlash(prefix);
    const join = (rel: string) => (base === '' ? rel : `${base}/${rel}`);
    const inRefTree = (rel: string) => REF_TREES.some((t) => isAtOrBelow(rel, t));
    return {
      abs: dir,
      descend: (rel) => rel === '' || inRefTree(rel),
      label: (rel) => {
        if (isLockFile(rel)) return null;
        if (REPOSITORY_FILES.has(rel) || (inRefTree(rel) && !REF_TREES.includes(rel))) {
          return join(rel);
        }
        return null;
      },
      gapLabel: (rel) => (rel === '' ? null : join(rel)),
    };
  });
}

// ---------------------------------------------------------------------------------------------
// Backends

/** What a backend reports to the model; every call gets the next event position. */
export interface BackendSink {
  /** A path of the part was created, changed or removed (a moved-away directory: its path). */
  change(path: string): void;
  /**
   * A part of the scope is not observed from now on, until resolved or rebuilt. `path` null is
   * the whole part. "events lost" and "observation interrupted" trigger a rebuild of the part.
   */
  gap(cause: IncompleteCause, path: string | null, detail: string): void;
  /** The directory at `path` is gone: gaps at or below it end here. */
  resolve(path: string): void;
  /** The backend failed: the whole part is "observation interrupted" and it is rebuilt. */
  failure(error: unknown): void;
}

export interface PartBackend {
  /** Sets up the watches of the part; gaps found on the way go to the sink. Never rejects. */
  start(): Promise<void>;
  /** Delivers every event the operating system holds for the part (the drain of §9). */
  drain(): Promise<void>;
  close(): Promise<void>;
}

export type BackendFactory = (
  part: ObservedPart,
  scope: ObserverScope,
  sink: BackendSink,
) => PartBackend;

/** A backend for an operating system without an observer yet: the whole part is interrupted. */
export function unavailableBackend(reason: string): BackendFactory {
  return (_part, _scope, sink) => ({
    async start() {
      sink.gap('observation-interrupted', null, reason);
    },
    async drain() {},
    async close() {},
  });
}

// ---------------------------------------------------------------------------------------------
// The model

export interface ChangedPath {
  readonly part: ObservedPart;
  readonly path: string;
}

/** What the observer established for one run (inputs of ERR-EVID-009 and ERR-EVID-010). */
export interface RunObservation {
  /** Every path created, changed or removed in the run's window, sorted, each once. */
  readonly changed: readonly ChangedPath[];
  /** The parts not observed for the whole run, by cause; empty when observation was complete. */
  readonly incomplete: readonly IncompleteCauseReport[];
}

export interface RunWindow {
  readonly id: number;
  /** Events after this position belong to the run. */
  readonly start: number;
}

export interface ObserverOptions {
  readonly scope: ObserverScope;
  readonly factory: BackendFactory;
  readonly log?: ContextualLog;
  /** Runs low-priority work (rebuilds) later; a timer by default. Tests pass their own. */
  readonly schedule?: (work: () => void) => void;
}

interface GapRecord extends Gap {
  readonly id: number;
  readonly generation: number;
  readonly opened: number;
  closed: number | null;
  /** For the gap a rebuild opens: the loss that triggered it. */
  readonly causedBy: number | null;
}

interface PartState {
  readonly part: ObservedPart;
  generation: number;
  backend: PartBackend | null;
  rebuilding: Promise<void> | null;
  /** The current backend finished its start. */
  started: boolean;
}

const PARTS: readonly ObservedPart[] = ['working-tree', 'repository'];
const PART_RANK: Readonly<Record<ObservedPart, number>> = { 'working-tree': 0, repository: 1 };
const OPERATION = 'working-tree-observer';

export class Observer {
  private position = 0;
  private nextGapId = 1;
  private nextRunId = 1;
  private readonly gaps: GapRecord[] = [];
  private changes: { pos: number; part: ObservedPart; path: string }[] = [];
  private readonly runs = new Map<number, RunWindow>();
  private readonly parts: Record<ObservedPart, PartState>;
  private readonly logged = new Set<string>();
  private stopped = false;

  private constructor(private readonly options: ObserverOptions) {
    this.parts = {
      'working-tree': {
        part: 'working-tree',
        generation: 0,
        backend: null,
        rebuilding: null,
        started: false,
      },
      repository: {
        part: 'repository',
        generation: 0,
        backend: null,
        rebuilding: null,
        started: false,
      },
    };
  }

  /** Starts the observer: both parts watched before it resolves. Never rejects. */
  static async start(options: ObserverOptions): Promise<Observer> {
    const observer = new Observer(options);
    await Promise.all(PARTS.map((part) => observer.startBackend(observer.parts[part])));
    return observer;
  }

  /** The current event position (for tests and diagnostics). */
  get currentPosition(): number {
    return this.position;
  }

  /**
   * Starts a run window: drains the backends, so that what happened before the command starts is
   * outside it, then records the position. Call it right before the command starts.
   */
  async beginRun(): Promise<RunWindow> {
    for (const part of PARTS) this.retryBroken(this.parts[part]);
    await this.drainAll();
    const window: RunWindow = { id: this.nextRunId++, start: this.position };
    this.runs.set(window.id, window);
    return window;
  }

  /**
   * Ends a run window after the command's process ended: drains the backends, records the end
   * position and returns what was observed in between.
   */
  async endRun(window: RunWindow): Promise<RunObservation> {
    await this.drainAll();
    const end = this.position;
    this.runs.delete(window.id);
    const start = window.start;

    const seen = new Set<string>();
    const changed: ChangedPath[] = [];
    for (const c of this.changes) {
      if (c.pos <= start || c.pos > end) continue;
      const key = `${c.part}\0${c.path}`;
      if (seen.has(key)) continue;
      seen.add(key);
      changed.push({ part: c.part, path: c.path });
    }
    changed.sort(
      (a, b) =>
        PART_RANK[a.part] - PART_RANK[b.part] || (a.path < b.path ? -1 : a.path > b.path ? 1 : 0),
    );

    const inWindow = this.gaps.filter(
      (g) => g.opened <= end && (g.closed === null || g.closed > start),
    );
    const ids = new Set(inWindow.map((g) => g.id));
    // The rebuild after a loss that the run already reports adds nothing for that run.
    const reported = inWindow.filter((g) => g.causedBy === null || !ids.has(g.causedBy));
    this.trim();
    return { changed, incomplete: summariseGaps(reported) };
  }

  /** Rebuilds the backend of a part (also after a loss, at low priority). */
  rebuild(part: ObservedPart): Promise<void> {
    return this.rebuildPart(this.parts[part], null);
  }

  /** Stops the observer; runs still open see the rest of their window as interrupted. */
  async stop(): Promise<void> {
    if (this.stopped) return;
    this.stopped = true;
    for (const part of PARTS) {
      const state = this.parts[part];
      state.generation++;
      // Stopping is no failure: the gap is recorded for open runs, not logged.
      this.openGap(state, 'observation-interrupted', null, 'the observer was stopped', null, {
        quiet: true,
      });
      const backend = state.backend;
      state.backend = null;
      await backend?.close().catch((error: unknown) => this.logFailure(part, error));
    }
  }

  // -------------------------------------------------------------------------------------------

  private sinkFor(state: PartState, generation: number): BackendSink {
    const current = () => !this.stopped && state.generation === generation;
    return {
      change: (path) => {
        if (!current()) return;
        const pos = ++this.position;
        if (this.runs.size > 0) this.changes.push({ pos, part: state.part, path });
      },
      gap: (cause, path, detail) => {
        if (!current()) return;
        const gap = this.openGap(state, cause, path, detail, null);
        // Events lost always call for a rebuild. An interruption found while the backend starts
        // (a missing root) does not, or the rebuild would loop; beginRun retries such a part.
        if (cause === 'events-lost' || (cause === 'observation-interrupted' && state.started)) {
          this.scheduleRebuild(state, gap.id);
        }
        // The working-tree root moved or removed takes a git directory below it along, although
        // the watches of the repository part, which follow their directories, see no event.
        if (
          state.part === 'working-tree' &&
          cause === 'observation-interrupted' &&
          path === null &&
          state.started &&
          this.gitDirBelowRoot()
        ) {
          const repo = this.parts.repository;
          const mirrored = this.openGap(
            repo,
            cause,
            null,
            `${detail} (git directory below it)`,
            null,
          );
          this.scheduleRebuild(repo, mirrored.id);
        }
      },
      resolve: (path) => {
        if (!current()) return;
        const pos = ++this.position;
        for (const g of this.gaps) {
          if (g.part !== state.part || g.closed !== null || g.path === null) continue;
          if (g.generation === generation && isAtOrBelow(g.path, path)) g.closed = pos;
        }
      },
      failure: (error) => {
        if (!current()) return;
        const detail = `observer failure: ${error instanceof Error ? error.message : String(error)}`;
        const gap = this.openGap(state, 'observation-interrupted', null, detail, null, { error });
        if (state.started) this.scheduleRebuild(state, gap.id);
      },
    };
  }

  private gitDirBelowRoot(): boolean {
    const { root, gitDir, commonGitDir } = this.options.scope;
    return relativeBelow(root, gitDir) !== null || relativeBelow(root, commonGitDir) !== null;
  }

  private openGap(
    state: PartState,
    cause: IncompleteCause,
    path: string | null,
    detail: string,
    causedBy: number | null,
    extra: { readonly error?: unknown; readonly quiet?: boolean } = {},
  ): GapRecord {
    const gap: GapRecord = {
      id: this.nextGapId++,
      generation: state.generation,
      part: state.part,
      cause,
      path,
      detail,
      opened: ++this.position,
      closed: null,
      causedBy,
    };
    this.gaps.push(gap);
    if (!extra.quiet) this.logGap(gap, extra.error);
    return gap;
  }

  /** Logs each loss and failure, and the first gap of each other cause per backend generation. */
  private logGap(gap: GapRecord, error?: unknown): void {
    const once = gap.cause === 'not-readable' || gap.cause === 'watch-limit';
    const key = `${gap.part}\0${gap.cause}\0${gap.generation}`;
    if (once && this.logged.has(key)) return;
    this.logged.add(key);
    const reviewError = new ReviewError('ERR-EVID-010', {
      operation: OPERATION,
      inputs: { part: gap.part, cause: gap.cause, path: gap.path ?? '(whole part)' },
      cause: error ?? gap.detail,
    });
    this.writeLog(reviewError);
  }

  private logFailure(part: ObservedPart, error: unknown): void {
    this.writeLog(
      new ReviewError('ERR-EVID-010', {
        operation: OPERATION,
        inputs: { part, cause: 'observation-interrupted' },
        cause: error,
      }),
    );
  }

  private writeLog(error: ReviewError): void {
    try {
      this.options.log?.recordError(error, OPERATION);
    } catch {
      /* the gap itself is what the run reports */
    }
  }

  private async startBackend(state: PartState): Promise<void> {
    const generation = state.generation;
    state.started = false;
    const sink = this.sinkFor(state, generation);
    try {
      state.backend = this.options.factory(state.part, this.options.scope, sink);
      await state.backend.start();
    } catch (error) {
      // A backend that cannot start leaves the part interrupted; beginRun retries it.
      if (!this.stopped && state.generation === generation) {
        const detail = `observer failure: ${error instanceof Error ? error.message : String(error)}`;
        this.openGap(state, 'observation-interrupted', null, detail, null, { error });
      }
    }
    if (state.generation === generation) state.started = true;
  }

  /**
   * Rebuilds the part later, unless a rebuild after this point has already replaced the backend.
   * A rebuild in progress is awaited first: a loss during its start needs another one.
   */
  private scheduleRebuild(state: PartState, causedBy: number): void {
    if (this.stopped) return;
    const generation = state.generation;
    const schedule = this.options.schedule ?? ((work) => void setTimeout(work, 100).unref());
    const work = async () => {
      if (state.rebuilding) await state.rebuilding;
      if (this.stopped || state.generation !== generation) return;
      await this.rebuildPart(state, causedBy);
    };
    schedule(() => void work());
  }

  private rebuildPart(state: PartState, causedBy: number | null): Promise<void> {
    if (this.stopped) return Promise.resolve();
    if (state.rebuilding) return state.rebuilding;
    const run = async () => {
      state.generation++;
      const marker = this.openGap(
        state,
        'observation-interrupted',
        null,
        'the observer of this part is being rebuilt',
        causedBy,
        { quiet: true },
      );
      // The old backend's gaps end where the rebuild starts; the new one reports its own.
      for (const g of this.gaps) {
        if (g.part === state.part && g.closed === null && g.id !== marker.id)
          g.closed = marker.opened;
      }
      const old = state.backend;
      state.backend = null;
      await old?.close().catch((error: unknown) => this.logFailure(state.part, error));
      if (this.stopped) return;
      await this.startBackend(state);
      if (marker.closed === null) marker.closed = ++this.position;
    };
    state.rebuilding = run().finally(() => {
      state.rebuilding = null;
    });
    return state.rebuilding;
  }

  /**
   * A part whose current backend left the whole part unobserved since its start (a missing or
   * unreadable root, a refused instance, a failure) is rebuilt in the background; not awaited, so
   * a run that starts before it completes reports the part. Events lost already have their
   * rebuild scheduled.
   */
  private retryBroken(state: PartState): void {
    if (state.rebuilding || this.stopped) return;
    const broken = this.gaps.some(
      (g) =>
        g.part === state.part &&
        g.closed === null &&
        g.path === null &&
        g.cause !== 'events-lost' &&
        g.generation === state.generation &&
        g.causedBy === null,
    );
    if (broken) void this.rebuildPart(state, null);
  }

  private async drainAll(): Promise<void> {
    await Promise.all(
      PARTS.map(async (part) => {
        const state = this.parts[part];
        const backend = state.backend;
        if (!backend) return;
        try {
          await backend.drain();
        } catch (error) {
          this.sinkFor(state, state.generation).failure(error);
        }
      }),
    );
  }

  /** Forgets changes and closed gaps that no open run window can still contain. */
  private trim(): void {
    let oldest = Infinity;
    for (const w of this.runs.values()) oldest = Math.min(oldest, w.start);
    if (oldest === Infinity) this.changes = [];
    else this.changes = this.changes.filter((c) => c.pos > oldest);
    for (let i = this.gaps.length - 1; i >= 0; i--) {
      const g = this.gaps[i]!;
      if (g.closed !== null && (oldest === Infinity || g.closed <= oldest)) this.gaps.splice(i, 1);
    }
  }
}
