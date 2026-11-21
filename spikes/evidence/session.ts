// Spike C001-T-020 (spike-grade, never shipped): one evidence session on a benchmark change, built
// only from production code — intake (C001-T-008) into a scratch store (C001-COMP-014), workspace
// preparation with the copier (C001-T-015, C001-T-016), the workspace index, watcher, reset and
// check, the working-tree observer (C001-T-017, C001-T-018) and the command runner (C001-T-019).
// Every step is timed separately for C001-T-021. C001-T-060 and C001-T-065 replace the orchestration.
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Hunk, IntakeDocument } from '../../src/generated/analysis-results.js';
import {
  Observer,
  type BackendFactory,
  type RunObservation,
} from '../../src/core/evidence/observer/observer.js';
import { backendFactoryFor } from '../../src/core/evidence/observer/platform.js';
import type { Injection } from '../../src/core/evidence/runner/environment.js';
import type { RunPriority } from '../../src/core/evidence/runner/priority.js';
import { runInWorkspace, type CommandResult } from '../../src/core/evidence/runner/run-command.js';
import {
  AttributeSet,
  nativeEolOf,
  snapshotEntries,
  type CheckoutSettings,
  type WorkspaceEntry,
} from '../../src/core/evidence/workspace/fill.js';
import { IgnoreRules, sourcesNamed } from '../../src/core/evidence/workspace/ignore.js';
import {
  checkAfterRun,
  watchWorkspace,
  type CheckResult,
  type WorkspaceDifference,
} from '../../src/core/evidence/workspace/index.js';
import {
  prepareWorkspace,
  setState,
  WorkspaceRegistry,
  type PreparedWorkspace,
} from '../../src/core/evidence/workspace/lifetime.js';
import { resolveEvidenceRoot } from '../../src/core/evidence/workspace/root.js';
import { gitReadEnvironment } from '../../src/core/git/environment.js';
import { GitAdapter } from '../../src/core/git/operations.js';
import type { RepositoryLocation } from '../../src/core/git/port.js';
import { takeInChange } from '../../src/core/intake/snapshot.js';
import { ContextualLog } from '../../src/core/log/log.js';
import { RevisionStore } from '../../src/core/store/revisions.js';
import { repositoryKey, StoreLayout } from '../../src/core/store/root.js';
import { SnapshotStore } from '../../src/core/store/snapshots.js';
import { addedLinesByFile } from './changed.js';
import { coveredFiles, type CoveredFile } from './filtered/covered.js';

const here = path.dirname(fileURLToPath(import.meta.url));

/** A benchmark change with what the harness needs from its environment file. */
export interface SpikeTarget {
  readonly id: string;
  readonly ecosystem: 'typescript' | 'python' | 'csharp' | 'fixture';
  /** Absolute path of the reference checkout (its working tree holds the change). */
  readonly checkout: string;
  readonly base: string;
  readonly head: string | null;
  readonly testCommand: string;
  /** Variables of `activeEnvironment` (`<checkout>` substituted) and those that must be unset. */
  readonly envSet: Readonly<Record<string, string>>;
  readonly envUnset: readonly string[];
  /** A directory to put first on PATH (the active virtual environment's scripts). */
  readonly pathPrepend: string | null;
  /**
   * W6 fixture: files under a clean filter get their stored form (the head's blob) at fill, as
   * C001-T-028 will give them; the covered-file spike then copies them (A1.4).
   */
  readonly covered?: boolean;
}

/** The developer's environment of a target: `base` with its activeEnvironment applied. */
export function developerEnvironment(
  target: SpikeTarget,
  base: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform,
): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...base };
  const keyOf = (name: string) =>
    platform === 'win32'
      ? (Object.keys(env).find((k) => k.toUpperCase() === name.toUpperCase()) ?? name)
      : name;
  for (const name of target.envUnset) delete env[keyOf(name)];
  for (const [name, value] of Object.entries(target.envSet)) env[keyOf(name)] = value;
  if (target.pathPrepend) {
    const k = keyOf('PATH');
    env[k] = `${target.pathPrepend}${path.delimiter}${env[k] ?? ''}`;
  }
  return env;
}

// ---------------------------------------------------------------------------------------------
// Timings

export interface StepTimings {
  /** Reset before the run (C001-IF-013 §2 item 3). */
  resetMs: number;
  /** Starting the workspace watcher. */
  watchStartMs: number;
  /** Observer window start (drain and position). */
  observeBeginMs: number;
  /** runInWorkspace: shell start, the command, the drain of its streams. */
  commandMs: number;
  /** Observer window end (drain) and the result. */
  observeEndMs: number;
  /** Watcher drain (marker) and stop. */
  watchStopMs: number;
  /** The check after the run (touched paths, or a full walk). */
  checkMs: number;
  /** Owner-file state switches (in-run, free). */
  stateMs: number;
  totalMs: number;
}

export interface StepResult {
  readonly command: CommandResult;
  readonly check: CheckResult;
  readonly observation: RunObservation;
  readonly watcherLost: string | null;
  readonly timings: StepTimings;
}

export interface WorkspaceRun {
  readonly prepared: PreparedWorkspace;
  /** The differences of the last check, which the next reset uses (C001-IF-013 §3 item 1). */
  differences: readonly WorkspaceDifference[];
}

const ms = (t0: number) => Math.round((performance.now() - t0) * 10) / 10;

/** The observer backend of this OS (C001-T-017, C001-T-018). */
function backendFactory(): { factory: BackendFactory; note: string | null } {
  const factory = backendFactoryFor();
  const supported = ['linux', 'darwin', 'win32'].includes(process.platform);
  return { factory, note: supported ? null : `no observer backend for ${process.platform}` };
}

// ---------------------------------------------------------------------------------------------
// The session

export interface IntakeTiming {
  readonly intakeMs: number;
  readonly entriesMs: number;
  readonly observerStartMs: number;
}

export class EvidenceSession {
  private constructor(
    readonly target: SpikeTarget,
    readonly scratch: string,
    readonly git: GitAdapter,
    readonly location: RepositoryLocation,
    readonly log: ContextualLog,
    readonly store: SnapshotStore,
    readonly snapshotId: string,
    readonly intake: IntakeDocument,
    readonly entries: readonly WorkspaceEntry[],
    readonly attributes: AttributeSet,
    readonly ignore: IgnoreRules,
    readonly checkout: CheckoutSettings,
    readonly evidenceRoot: string,
    readonly registry: WorkspaceRegistry,
    readonly repoKey: string,
    readonly observer: Observer,
    readonly observerNote: string | null,
    readonly env: NodeJS.ProcessEnv,
    readonly timing: IntakeTiming,
    /** Files under a clean filter (W6 fixture only). */
    readonly covered: readonly CoveredFile[],
  ) {}

  /** Intake of the change in the checkout's working tree against its base, into a scratch store. */
  static async open(target: SpikeTarget): Promise<EvidenceSession> {
    const scratch = mkdtempSync(path.join(tmpdir(), 'sddr-spike-ev-'));
    const env = developerEnvironment(target);
    const git = new GitAdapter({ baseEnv: env });
    try {
      let t0 = performance.now();
      const location = await git.discover(target.checkout);
      const log = new ContextualLog(path.join(scratch, 'log.jsonl'));
      const repoKey = repositoryKey(location.commonGitDir);
      const store = new SnapshotStore(
        { log },
        new StoreLayout(path.join(scratch, 'store'), repoKey),
      );
      const intake = await takeInChange(
        { git, store, log, repositoryRoot: location.workTreeRoot },
        { namedBase: target.base },
      );
      const doc = await store.readSnapshot(intake.snapshotId);
      const intakeMs = ms(t0);
      t0 = performance.now();
      const base = doc.snapshot.baseCommit.hash;
      let entries = snapshotEntries({
        baseTree: await git.treeEntries(base),
        changedFiles: doc.snapshot.changedFiles.map((f) => ({
          path: f.path,
          oldPath: f.oldPath ?? null,
          changeType: f.changeType,
          mode: f.mode ?? null,
          contentHash: f.contentHash ?? null,
        })),
        readBase: (p) => git.readBlob(base, p),
        readSnapshot: (hash) => store.readBlob(intake.snapshotId, hash),
      });
      const byPath = new Map(entries.map((e) => [e.path, e]));
      const read = (p: string) => byPath.get(p)!.read();
      const paths = entries.filter((e) => e.mode !== 'submodule').map((e) => e.path);
      const attributeSources = await sourcesNamed('.gitattributes', paths, read);
      const attributes = new AttributeSet({ files: attributeSources });
      let covered: CoveredFile[] = [];
      if (target.covered) {
        const head = await git.resolveCommit('HEAD');
        covered = coveredFiles(await git.treeEntries(head), attributeSources);
        const set = new Set(covered.map((c) => c.path));
        entries = entries.map((e) =>
          set.has(e.path)
            ? {
                path: e.path,
                mode: e.mode,
                read: async () => {
                  const b = await git.readBlob(head, e.path);
                  if (b === null) throw new Error(`no blob for ${e.path} at ${head}`);
                  return b;
                },
              }
            : e,
        );
      }
      const ignore = new IgnoreRules({
        perDirectory: await sourcesNamed('.gitignore', paths, read),
        exclude: null,
        excludesFile: null,
        ignoreCase: process.platform === 'win32',
      });
      const checkout = await checkoutSettings(target.checkout, env);
      const entriesMs = ms(t0);
      t0 = performance.now();
      const evidenceRoot = resolveEvidenceRoot({ repository: location, log });
      const { factory, note } = backendFactory();
      const observer = await Observer.start({
        scope: {
          root: location.workTreeRoot,
          gitDir: location.gitDir,
          commonGitDir: location.commonGitDir,
        },
        factory,
        log,
      });
      const observerStartMs = ms(t0);
      return new EvidenceSession(
        target,
        scratch,
        git,
        location,
        log,
        store,
        intake.snapshotId,
        doc,
        entries,
        attributes,
        ignore,
        checkout,
        evidenceRoot,
        new WorkspaceRegistry(),
        repoKey,
        observer,
        note,
        env,
        { intakeMs, entriesMs, observerStartMs },
        covered,
      );
    } catch (error) {
      await git.close();
      rmSync(scratch, { recursive: true, force: true, maxRetries: 3 });
      throw error;
    }
  }

  get hunks(): readonly Hunk[] {
    return this.intake.hunks;
  }

  /** Added lines per changed path (snapshot side). */
  addedLines(): Map<string, number[]> {
    return addedLinesByFile(this.intake.hunks);
  }

  /** Paths of the snapshot (every workspace file). */
  snapshotPaths(): string[] {
    return this.entries.filter((e) => e.mode !== 'submodule').map((e) => e.path);
  }

  /** Prepares a run workspace with the ignored paths made available (W1: preparation time). */
  async prepare(): Promise<{ run: WorkspaceRun; durationMs: number }> {
    const t0 = performance.now();
    const prepared = await prepareWorkspace({
      evidenceRoot: this.evidenceRoot,
      repositoryKey: this.repoKey,
      snapshotId: this.snapshotId,
      entries: this.entries,
      checkout: this.checkout,
      attributes: this.attributes,
      registry: this.registry,
      log: this.log,
      command: this.target.testCommand,
      repository: this.location,
      ignore: this.ignore,
    });
    return { run: { prepared, differences: [] }, durationMs: ms(t0) };
  }

  /**
   * One command in a run workspace with everything the core adds (C001-IF-013 §8 items 1 and 2):
   * reset by the last check, watcher, observer window, the command, observer drain, watcher drain,
   * check after the run. Each step is timed.
   */
  async runStep(
    run: WorkspaceRun,
    command: string,
    options: {
      readonly inject?: readonly Injection[];
      readonly priority?: RunPriority;
      readonly timeoutMs?: number;
      /** Paths a check may find besides the snapshot (coverage reports). */
      readonly allowExtra?: (p: string) => boolean;
    } = {},
  ): Promise<StepResult> {
    const total = performance.now();
    const handle = run.prepared.handle;
    let t0 = performance.now();
    await setState(handle, 'in-run');
    let stateMs = ms(t0);
    t0 = performance.now();
    await run.prepared.index.reset(run.differences, run.prepared.rewrite);
    const resetMs = ms(t0);
    t0 = performance.now();
    const watcher = watchWorkspace(handle.root);
    const watchStartMs = ms(t0);
    t0 = performance.now();
    const window = await this.observer.beginRun();
    const observeBeginMs = ms(t0);
    t0 = performance.now();
    const result = await runInWorkspace({
      command,
      workspace: handle,
      repository: this.location,
      env: this.env,
      inject: options.inject,
      priority: options.priority,
      timeoutMs: options.timeoutMs,
      log: this.log,
    });
    const commandMs = ms(t0);
    t0 = performance.now();
    const observation = await this.observer.endRun(window);
    const observeEndMs = ms(t0);
    t0 = performance.now();
    const touched = await watcher.stop();
    const watchStopMs = ms(t0);
    t0 = performance.now();
    const check = await checkAfterRun(run.prepared.index, touched, {
      ignore: this.ignore,
      allowExtra: options.allowExtra,
    });
    const checkMs = ms(t0);
    run.differences = check.differences;
    t0 = performance.now();
    await setState(handle, 'free');
    stateMs += ms(t0);
    return {
      command: result,
      check,
      observation,
      watcherLost: touched.lost ? touched.cause : null,
      timings: {
        resetMs,
        watchStartMs,
        observeBeginMs,
        commandMs,
        observeEndMs,
        watchStopMs,
        checkMs,
        stateMs,
        totalMs: ms(total),
      },
    };
  }

  /** The revision store of the snapshot (C001-COMP-014). */
  revisions(): RevisionStore {
    return new RevisionStore({ log: this.log }, this.store.snapshotDir(this.snapshotId));
  }

  /**
   * Writes the spike's runtime files to `<evidence root>/runtime/spike-evidence/` (C001-ADR-006
   * §1 "Runtime files"); returns that directory.
   */
  installRuntime(): string {
    const dir = path.join(this.evidenceRoot, 'runtime', 'spike-evidence');
    rmSync(dir, { recursive: true, force: true });
    mkdirSync(dir, { recursive: true });
    cpSync(path.join(here, 'coverage', 'node'), path.join(dir, 'node'), { recursive: true });
    cpSync(path.join(here, 'coverage', 'dotnet'), path.join(dir, 'dotnet'), { recursive: true });
    mkdirSync(path.join(dir, 'python'), { recursive: true });
    for (const [from, name] of [
      [path.join(here, 'coverage', 'python', 'sitecustomize.py'), 'sitecustomize.py'],
      [path.join(here, 'coverage', 'python', 'sddr_pytest.py'), 'sddr_pytest.py'],
      [path.join(here, 'mutation', 'python', 'sddr_mutate.py'), 'sddr_mutate.py'],
    ] as const) {
      cpSync(from, path.join(dir, 'python', name));
    }
    return dir;
  }

  async close(): Promise<void> {
    await this.observer.stop();
    await this.registry.removeAll();
    await this.git.close();
    rmSync(this.scratch, { recursive: true, force: true, maxRetries: 3 });
  }
}

/** core.autocrlf and core.eol, read with the hardened git environment (C001-T-005). */
async function checkoutSettings(
  checkout: string,
  env: NodeJS.ProcessEnv,
): Promise<CheckoutSettings> {
  const { execFileSync } = await import('node:child_process');
  const gitEnv = gitReadEnvironment(env);
  const get = (key: string) => {
    try {
      return execFileSync('git', ['-C', checkout, 'config', '--get', key], {
        env: gitEnv,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      })
        .trim()
        .toLowerCase();
    } catch {
      return null;
    }
  };
  const autocrlf = get('core.autocrlf');
  const eol = get('core.eol');
  return {
    autocrlf: autocrlf === 'true' || autocrlf === 'input' ? autocrlf : 'false',
    eol: eol === 'lf' || eol === 'crlf' || eol === 'native' ? eol : null,
    nativeEol: nativeEolOf(),
  };
}

/** Real path of a workspace root (the attribution root of the adapters). */
export const realRoot = (p: string) => realpath(p);

/** Reads a JSON file. */
export const readJson = <T>(file: string): T => JSON.parse(readFileSync(file, 'utf8')) as T;

export const fileExists = existsSync;
