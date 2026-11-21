import { spawn as nodeSpawn, type ChildProcess, type SpawnOptions } from 'node:child_process';
import { existsSync, realpathSync, statSync } from 'node:fs';
import { constants as osConstants, setPriority } from 'node:os';
import { win32 } from 'node:path';
import { ReviewError } from '../../errors/review-error.js';
import type { RepositoryLocation } from '../../git/port.js';
import type { ContextualLog } from '../../log/log.js';
import type { WorkspaceHandle } from '../workspace/lifetime.js';
import { isWithin, realPathOfPossiblyMissing, type CompareOptions } from '../workspace/root.js';
import { buildEvidenceEnvironment, InjectionRefused, type Injection } from './environment.js';
import { lowPriorityPrelude, WindowsJob, type RunPriority } from './priority.js';

/**
 * Runs one evidence command — a test command, a mutation tool or a bundle command — in an evidence
 * workspace (C001-IF-013 §1, C001-REQ-521, C001-REQ-525, C001-CON-22):
 *
 * - the working directory is the root of a workspace that a run has taken, never the working
 *   tree, the git directory or a directory that holds either (checked on real paths before
 *   anything starts);
 * - the shell is `/bin/sh -c` on macOS and Linux and `cmd.exe /d /s /c` on Windows, the latter
 *   taken from the system directory so that a `cmd.exe` of the workspace never runs;
 * - the environment is the developer's, changed as `environment.ts` states;
 * - standard output and standard error are captured up to 1 MiB each, the rest counted and
 *   flagged as truncated, never left unread (a full pipe would block the command);
 * - cancellation and the optional time limit end the whole process tree: on Linux and macOS the
 *   command leads a process group of its own, which gets SIGTERM and, after a grace period,
 *   SIGKILL, and the result is given only once no process of the group is left; on Windows every
 *   process of the command is in a job object, ended after `taskkill /T /F` has ended the tree it
 *   can still walk. A process that leaves its group (`setsid`) or, on Windows, was started before
 *   the job held its parent is outside this; it can write only in its workspace (§1 item 3).
 *
 * Refusals and a shell that cannot start are ERR-EVID-002, recorded in the contextual log. The
 * run's ending (exited, cancelled, timed out) is a result, which the job of each run turns into
 * its notice (ERR-EVID-003, ERR-EVID-004, ERR-EVID-006).
 */

export const MAX_STREAM_BYTES = 1024 * 1024;
const DEFAULT_KILL_GRACE_MS = 2000;
/** After the command's own process ended, how long its streams may stay open (a process it left). */
const DEFAULT_DRAIN_MS = 2000;
const GROUP_GONE_WAIT_MS = 5000;
const POLL_MS = 25;

export type RunWorkspace = Pick<WorkspaceHandle, 'root' | 'kind' | 'state'>;

export type SpawnSeam = (
  file: string,
  args: readonly string[],
  options: SpawnOptions,
) => ChildProcess;

export interface RunCommandOptions {
  /** The command text, run unchanged. */
  readonly command: string;
  /** The workspace that the run has taken (state in-run, or mutation for a mutation copy). */
  readonly workspace: RunWorkspace;
  /** The developer's repository: its working tree and git directories are refused. */
  readonly repository: Pick<RepositoryLocation, 'workTreeRoot' | 'gitDir' | 'commonGitDir'>;
  /** The developer's environment; default `process.env`. */
  readonly env?: NodeJS.ProcessEnv;
  /** Values of the coverage adapters and mutation tools (C001-ADR-007 §1). */
  readonly inject?: readonly Injection[];
  /** `low` for mutation processes (C001-ADR-006 §8). */
  readonly priority?: RunPriority;
  readonly signal?: AbortSignal;
  /** Ends the process tree after this many milliseconds (ending `timed-out`). */
  readonly timeoutMs?: number;
  /** Bytes kept per stream; default 1 MiB (C001-IF-013 §1 item 2). */
  readonly maxStreamBytes?: number;
  /** Between SIGTERM and SIGKILL on Linux and macOS; default 2 s. */
  readonly killGraceMs?: number;
  readonly drainMs?: number;
  readonly log?: Pick<ContextualLog, 'recordError'>;
  /** The operation named in the log; default `evidence-command`. */
  readonly operation?: string;
  /** Test seam: replaces `child_process.spawn`. */
  readonly spawn?: SpawnSeam;
}

export interface CapturedStream {
  readonly bytes: Buffer;
  readonly truncated: boolean;
  /** Every byte the command wrote to the stream, kept or not. */
  readonly totalBytes: number;
}

export type RunEnding = 'exited' | 'cancelled' | 'timed-out';

export interface CommandResult {
  readonly ending: RunEnding;
  /** The exit status; null when the process ended by a signal or never started. */
  readonly exitCode: number | null;
  readonly signal: NodeJS.Signals | null;
  readonly stdout: CapturedStream;
  readonly stderr: CapturedStream;
  /** The real path of the working directory the command ran in. */
  readonly workingDirectory: string;
  readonly pid: number | null;
  readonly startedAt: Date;
  readonly durationMs: number;
}

// ---------------------------------------------------------------------------------------------
// Checks and shell

const compareOptionsOf = (platform: NodeJS.Platform): CompareOptions => ({
  caseInsensitive: platform === 'win32' || platform === 'darwin',
  separator: platform === 'win32' ? '\\' : '/',
});

/**
 * Why `dir` cannot be the working directory of an evidence command, or null: it must exist, and
 * its real path must lie neither in nor above the working tree, the git directory or the common
 * git directory (C001-CON-22, C001-IF-013 §9 item 1).
 */
export function checkWorkingDirectory(
  dir: string,
  repository: Pick<RepositoryLocation, 'workTreeRoot' | 'gitDir' | 'commonGitDir'>,
  platform: NodeJS.Platform = process.platform,
): string | null {
  if (!existsSync(dir) || !statSync(dir).isDirectory()) {
    return `the working directory ${dir} does not exist`;
  }
  const real = realpathSync.native(dir);
  const options = compareOptionsOf(platform);
  const protectedPaths: Array<[string, string]> = [
    ['working tree', repository.workTreeRoot],
    ['git directory', repository.gitDir],
    ['common git directory', repository.commonGitDir],
  ];
  for (const [kind, path] of protectedPaths) {
    if (!path) continue;
    const protectedReal = realPathOfPossiblyMissing(path, platform);
    if (isWithin(real, protectedReal, options)) {
      return `the working directory ${dir} lies in the ${kind} ${path}`;
    }
    if (isWithin(protectedReal, real, options)) {
      return `the working directory ${dir} holds the ${kind} ${path}`;
    }
  }
  return null;
}

export interface ShellInvocation {
  readonly file: string;
  readonly args: readonly string[];
  readonly windowsVerbatimArguments: boolean;
}

function systemRootOf(env: NodeJS.ProcessEnv): string {
  const key = Object.keys(env).find((k) => k.toUpperCase() === 'SYSTEMROOT');
  const value = key === undefined ? undefined : env[key];
  return value && win32.isAbsolute(value) ? value : 'C:\\Windows';
}

/** The shell and its arguments for `command` (C001-IF-013 §1 item 1). */
export function shellInvocation(
  command: string,
  priority: RunPriority,
  platform: NodeJS.Platform,
  env: NodeJS.ProcessEnv,
): ShellInvocation {
  if (platform === 'win32') {
    // As Node.js runs `shell: true`: the quotes around the command are what /s strips.
    return {
      file: win32.join(systemRootOf(env), 'System32', 'cmd.exe'),
      args: ['/d', '/s', '/c', `"${command}"`],
      windowsVerbatimArguments: true,
    };
  }
  const args =
    priority === 'low'
      ? ['-c', lowPriorityPrelude(platform), 'sddr-evidence', command]
      : ['-c', command];
  return { file: '/bin/sh', args, windowsVerbatimArguments: false };
}

/** One captured stream, bounded. */
export class OutputCapture {
  private readonly chunks: Buffer[] = [];
  private kept = 0;
  private total = 0;

  constructor(private readonly limit: number = MAX_STREAM_BYTES) {}

  push(chunk: Buffer): void {
    this.total += chunk.length;
    const room = this.limit - this.kept;
    if (room <= 0) return;
    const part = chunk.length <= room ? chunk : chunk.subarray(0, room);
    this.chunks.push(part);
    this.kept += part.length;
  }

  result(): CapturedStream {
    return {
      bytes: Buffer.concat(this.chunks, this.kept),
      truncated: this.total > this.kept,
      totalBytes: this.total,
    };
  }
}

// ---------------------------------------------------------------------------------------------
// Process trees

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

interface ProcessTree {
  /** Ends every process of the tree; resolves once none is left (as far as can be known). */
  terminate(graceMs: number): Promise<void>;
  /** At the end of the analysis core's process: ends the tree at once, synchronously. */
  killNow(): void;
  /** Releases what the tree holds after the run. */
  release(): void;
}

function groupAlive(pgid: number): boolean {
  try {
    process.kill(-pgid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'EPERM';
  }
}

function signalGroup(pgid: number, signal: NodeJS.Signals): void {
  try {
    process.kill(-pgid, signal);
  } catch {
    /* ESRCH: the group is gone */
  }
}

/** Linux and macOS: the command leads its own process group (spawned detached, `setsid`). */
function posixGroup(pgid: number): ProcessTree {
  return {
    async terminate(graceMs) {
      if (!groupAlive(pgid)) return;
      signalGroup(pgid, 'SIGTERM');
      for (const end = Date.now() + graceMs; Date.now() < end;) {
        await sleep(POLL_MS);
        if (!groupAlive(pgid)) return;
      }
      signalGroup(pgid, 'SIGKILL');
      for (const end = Date.now() + GROUP_GONE_WAIT_MS; Date.now() < end;) {
        if (!groupAlive(pgid)) return;
        await sleep(POLL_MS);
      }
    },
    killNow: () => signalGroup(pgid, 'SIGKILL'),
    release: () => undefined,
  };
}

function taskkillTree(pid: number, systemRoot: string): Promise<void> {
  return new Promise((resolve) => {
    let child: ChildProcess;
    try {
      child = nodeSpawn(
        win32.join(systemRoot, 'System32', 'taskkill.exe'),
        ['/pid', String(pid), '/T', '/F'],
        { stdio: 'ignore', windowsHide: true },
      );
    } catch {
      resolve();
      return;
    }
    const timer = setTimeout(() => {
      child.kill();
      resolve();
    }, 10_000);
    const done = () => {
      clearTimeout(timer);
      resolve();
    };
    child.once('error', done);
    child.once('close', done);
  });
}

/** Windows: the job object holds the tree; `taskkill /T` covers what it does not hold. */
function windowsTree(pid: number, job: WindowsJob | null, systemRoot: string): ProcessTree {
  return {
    async terminate() {
      await taskkillTree(pid, systemRoot);
      job?.terminate();
    },
    killNow() {
      job?.terminate();
    },
    release: () => job?.close(),
  };
}

const liveTrees = new Set<ProcessTree>();
let exitHookInstalled = false;

/** No process of an evidence command outlives an orderly end of the analysis core. */
function track(tree: ProcessTree): void {
  if (!exitHookInstalled) {
    exitHookInstalled = true;
    process.once('exit', () => {
      for (const t of liveTrees) t.killNow();
    });
  }
  liveTrees.add(tree);
}

// ---------------------------------------------------------------------------------------------
// The run

function fail(
  options: RunCommandOptions,
  cause: string,
  inputs: Record<string, unknown>,
  error?: unknown,
): never {
  const operation = options.operation ?? 'evidence-command';
  const reviewError = new ReviewError('ERR-EVID-002', {
    operation,
    inputs: { command: options.command, ...inputs },
    params: { command: options.command, cause },
    cause: error ?? cause,
  });
  try {
    options.log?.recordError(reviewError, operation);
  } catch {
    /* the error itself is what matters */
  }
  throw reviewError;
}

/** A degraded but working run (no job object): logged, the run goes on. */
function logDegraded(options: RunCommandOptions, cause: string, inputs: Record<string, unknown>) {
  const operation = options.operation ?? 'evidence-command';
  try {
    options.log?.recordError(
      new ReviewError('ERR-CLI-003', {
        operation,
        inputs: { command: options.command, ...inputs },
        params: { operation, cause },
        cause,
      }),
      operation,
    );
  } catch {
    /* logging never fails the run */
  }
}

const emptyStream = (): CapturedStream => ({
  bytes: Buffer.alloc(0),
  truncated: false,
  totalBytes: 0,
});

/** Runs `options.command` in its workspace; see the module comment. */
export async function runInWorkspace(options: RunCommandOptions): Promise<CommandResult> {
  const platform = process.platform;
  const root = options.workspace.root;
  const expected = options.workspace.kind === 'mutation' ? 'mutation' : 'in-run';
  if (options.workspace.state !== expected) {
    fail(
      options,
      `the workspace ${root} is not taken by a run (state ${options.workspace.state})`,
      { workspace: root },
    );
  }
  const refusal = checkWorkingDirectory(root, options.repository, platform);
  if (refusal) fail(options, refusal, { workspace: root });
  const cwd = realpathSync.native(root);
  const priority = options.priority ?? 'normal';

  let env: NodeJS.ProcessEnv;
  try {
    env = buildEvidenceEnvironment({
      base: options.env ?? process.env,
      workspaceRoot: cwd,
      repository: {
        workTreeRoot: options.repository.workTreeRoot
          ? realPathOfPossiblyMissing(options.repository.workTreeRoot, platform)
          : '',
        gitDir: realPathOfPossiblyMissing(options.repository.gitDir, platform),
        commonGitDir: realPathOfPossiblyMissing(options.repository.commonGitDir, platform),
      },
      inject: options.inject,
      platform,
    });
  } catch (error) {
    if (error instanceof InjectionRefused) fail(options, error.message, { workspace: cwd }, error);
    throw error;
  }

  const startedAt = new Date();
  if (options.signal?.aborted) {
    return {
      ending: 'cancelled',
      exitCode: null,
      signal: null,
      stdout: emptyStream(),
      stderr: emptyStream(),
      workingDirectory: cwd,
      pid: null,
      startedAt,
      durationMs: 0,
    };
  }

  const isWindows = platform === 'win32';
  let job: WindowsJob | null = null;
  if (isWindows) {
    try {
      job = WindowsJob.create(priority === 'low');
    } catch (error) {
      logDegraded(options, `no job object for the command: ${(error as Error).message}`, {
        workspace: cwd,
      });
    }
  }

  const shell = shellInvocation(options.command, priority, platform, env);
  const spawnFn: SpawnSeam = options.spawn ?? ((f, a, o) => nodeSpawn(f, [...a], o));
  let child: ChildProcess;
  try {
    child = spawnFn(shell.file, shell.args, {
      cwd,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
      // Linux and macOS: a process group of its own, so that cancellation reaches the tree.
      detached: !isWindows,
      windowsHide: true,
      windowsVerbatimArguments: shell.windowsVerbatimArguments,
    });
  } catch (error) {
    job?.close();
    fail(options, (error as Error).message, { workspace: cwd, shell: shell.file }, error);
  }

  // Into the job at once, before the shell has started anything.
  if (isWindows && child.pid !== undefined) {
    if (job) {
      try {
        job.assign(child.pid);
      } catch (error) {
        logDegraded(options, (error as Error).message, { workspace: cwd, pid: child.pid });
        job.close();
        job = null;
      }
    }
    if (!job && priority === 'low') {
      try {
        // Inherited by the processes it starts (CreateProcess, below-normal creator).
        setPriority(child.pid, osConstants.priority.PRIORITY_BELOW_NORMAL);
      } catch (error) {
        logDegraded(options, `priority not lowered: ${(error as Error).message}`, {
          workspace: cwd,
        });
      }
    }
  }

  const stdout = new OutputCapture(options.maxStreamBytes ?? MAX_STREAM_BYTES);
  const stderr = new OutputCapture(options.maxStreamBytes ?? MAX_STREAM_BYTES);
  child.stdout?.on('data', (d: Buffer) => stdout.push(d));
  child.stderr?.on('data', (d: Buffer) => stderr.push(d));

  // A shell that cannot start (for example ENOENT) is reported before any 'spawn' event.
  try {
    await new Promise<void>((resolve, reject) => {
      if (child.pid !== undefined) {
        resolve();
        return;
      }
      child.once('spawn', () => resolve());
      child.once('error', reject);
    });
  } catch (error) {
    job?.close();
    fail(options, (error as Error).message, { workspace: cwd, shell: shell.file }, error);
  }

  // Started: a later 'error' (for example a failed signal) must not end the core's process.
  child.on('error', () => undefined);
  const pid = child.pid!;
  const tree = isWindows ? windowsTree(pid, job, systemRootOf(env)) : posixGroup(pid);
  track(tree);

  return new Promise<CommandResult>((resolve) => {
    let ending: RunEnding = 'exited';
    let exit: { code: number | null; signal: NodeJS.Signals | null } | null = null;
    let closed = false;
    let terminating: Promise<void> | null = null;
    let terminated = false;
    let finished = false;
    let drainTimer: NodeJS.Timeout | undefined;
    let limitTimer: NodeJS.Timeout | undefined;

    const finish = () => {
      if (finished || !exit || !closed || (terminating && !terminated)) return;
      finished = true;
      clearTimeout(drainTimer);
      clearTimeout(limitTimer);
      options.signal?.removeEventListener('abort', onAbort);
      liveTrees.delete(tree);
      tree.release();
      resolve({
        ending,
        exitCode: exit.code,
        signal: exit.signal,
        stdout: stdout.result(),
        stderr: stderr.result(),
        workingDirectory: cwd,
        pid,
        startedAt,
        durationMs: Date.now() - startedAt.getTime(),
      });
    };

    const stop = (why: RunEnding) => {
      if (finished || terminating) return;
      // After the command's own process ended, only processes it left remain: end them too.
      if (!exit) ending = why;
      terminating = tree
        .terminate(options.killGraceMs ?? DEFAULT_KILL_GRACE_MS)
        .catch(() => undefined)
        .then(() => {
          terminated = true;
          finish();
        });
    };
    const onAbort = () => stop('cancelled');

    child.once('exit', (code, signal) => {
      exit = { code, signal };
      if (!closed) {
        drainTimer = setTimeout(() => {
          // A process the command left holds the streams open; the run has ended.
          child.stdout?.destroy();
          child.stderr?.destroy();
          closed = true;
          finish();
        }, options.drainMs ?? DEFAULT_DRAIN_MS);
      }
      finish();
    });
    child.once('close', (code, signal) => {
      exit ??= { code, signal };
      closed = true;
      finish();
    });

    options.signal?.addEventListener('abort', onAbort, { once: true });
    if (options.signal?.aborted) onAbort();
    if (options.timeoutMs !== undefined) {
      limitTimer = setTimeout(() => stop('timed-out'), options.timeoutMs);
    }
  });
}
