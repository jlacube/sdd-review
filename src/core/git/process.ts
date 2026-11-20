import { spawn as nodeSpawn, spawnSync, type ChildProcess } from 'node:child_process';
import { gitReadEnvironment } from './environment.js';

/**
 * The git process runner (C001-COMP-003; C001-IF-012 §2; C001-ADR-004 decision item 3 and
 * Amendment 1 A1.3, Amendment 2 A2.1).
 *
 * Every process runs the installed git program directly (no shell), with the hardening profile,
 * the cleaned environment and the repository named explicitly. Only read-only commands run.
 */

/** Where a git process reads: found from a directory (G-01 only), or a named repository. */
export type GitTarget =
  { readonly discoverFrom: string } | { readonly gitDir: string; readonly workTree?: string };

/**
 * `-c` overrides of every call (C001-IF-012 §2 items 2 and 3).
 *
 * `core.fsmonitor=` has an EMPTY value on purpose: on git 2.34 any non-empty value, `false`
 * included, is a program that git starts through the shell (defect D-008, proved by the
 * hostile-repository test).
 */
export const HARDENING_CONFIG: readonly string[] = [
  'core.fsmonitor=',
  'core.untrackedCache=false',
  'protocol.allow=never',
  'credential.helper=',
];

/** Commands that read the object database, references, configuration and file listings. */
export const READ_ONLY_COMMANDS: ReadonlySet<string> = new Set([
  'rev-parse',
  'cat-file',
  'ls-tree',
  'ls-files',
  'merge-base',
  'for-each-ref',
  'show-ref',
  'symbolic-ref',
  'rev-list',
  'log',
  'diff-tree',
  'config',
]);

const FORBIDDEN_ARGUMENT =
  /^--(output|textconv|filters|ext-diff|open-files-in-pager|exec-path|upload-pack|receive-pack)(=|$)/;
/** Options of `log` and `diff-tree` that generate a content diff, which applies textconv drivers. */
const DIFF_CONTENT_OPTION =
  /^(-p|-u|--patch.*|--cc|-c|--combined.*|--stat.*|--numstat|--shortstat|--dirstat.*|--word-diff.*|--color-words.*|-G.*|-S.*|--pickaxe.*|-L.*)$/;
const CONFIG_READ_FLAGS = new Set([
  '--get',
  '--get-all',
  '--get-regexp',
  '--get-urlmatch',
  '--list',
  '-l',
]);
const CONFIG_WRITE_FLAGS = new Set([
  '--add',
  '--unset',
  '--unset-all',
  '--replace-all',
  '--rename-section',
  '--remove-section',
  '--edit',
  '-e',
  '--file',
  '-f',
]);

export class GitCommandRejected extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GitCommandRejected';
  }
}

/** Rejects any operation outside the read-only allowlist (C001-IF-012 §2 item 1). */
export function assertReadOnly(command: string, args: readonly string[]): void {
  if (!READ_ONLY_COMMANDS.has(command)) {
    throw new GitCommandRejected(`git ${command} is not in the read-only allowlist`);
  }
  for (const a of args) {
    if (a.includes('\0')) throw new GitCommandRejected('an argument holds a NUL character');
    if (FORBIDDEN_ARGUMENT.test(a)) {
      throw new GitCommandRejected(
        `git ${command} ${a}: option not allowed (writes or runs a program)`,
      );
    }
  }
  if (command === 'ls-files' && args.some((a) => a === '-m' || a === '--modified')) {
    // Comparing content for the modified list can run a clean filter (C001-ADR-004 A1.2).
    throw new GitCommandRejected('git ls-files --modified is not allowed (may run a clean filter)');
  }
  if (
    (command === 'log' || command === 'diff-tree') &&
    args.some((a) => DIFF_CONTENT_OPTION.test(a))
  ) {
    throw new GitCommandRejected(`git ${command}: content diff options are not allowed (textconv)`);
  }
  if (command === 'config') {
    if (args.some((a) => CONFIG_WRITE_FLAGS.has(a.split('=')[0]!))) {
      throw new GitCommandRejected('git config: only reads are allowed');
    }
    if (!args.some((a) => CONFIG_READ_FLAGS.has(a))) {
      throw new GitCommandRejected('git config: needs --get, --get-all, --get-regexp or --list');
    }
  }
}

/** The full argument list: global options and overrides, the repository, then the command. */
export function buildGitArguments(
  command: string,
  args: readonly string[],
  target: GitTarget,
): string[] {
  const argv = ['--no-pager', '--no-optional-locks'];
  for (const entry of HARDENING_CONFIG) argv.push('-c', entry);
  if ('gitDir' in target) {
    argv.push(`--git-dir=${target.gitDir}`);
    if (target.workTree !== undefined) argv.push(`--work-tree=${target.workTree}`);
  }
  argv.push(command, ...args);
  return argv;
}

function workingDirectory(target: GitTarget): string {
  if ('discoverFrom' in target) return target.discoverFrom;
  return target.workTree ?? target.gitDir;
}

// ---------------------------------------------------------------------------------------------

export type SpawnFn = (
  file: string,
  args: readonly string[],
  options: {
    cwd?: string;
    env: NodeJS.ProcessEnv;
    stdio: ['pipe', 'pipe', 'pipe'];
    windowsHide: boolean;
  },
) => ChildProcess;

export type CaptureResult =
  | { readonly kind: 'exited'; readonly status: number | null; stdout: string; stderr: string }
  | { readonly kind: 'not-started'; readonly reason: string };

export type GitExec = (
  file: string,
  args: readonly string[],
  options: { cwd?: string; env: NodeJS.ProcessEnv },
) => Promise<CaptureResult>;

export class GitStartError extends Error {
  constructor(
    readonly reason: string,
    cause?: unknown,
  ) {
    super(`git could not be started: ${reason}`, { cause });
    this.name = 'GitStartError';
  }
}

export class GitOutputLimitError extends Error {
  constructor(readonly limit: number) {
    super(`git output exceeded ${limit} bytes`);
    this.name = 'GitOutputLimitError';
  }
}

export class GitAbortError extends Error {
  constructor() {
    super('git process cancelled');
    this.name = 'AbortError';
  }
}

export interface RunResult {
  readonly status: number | null;
  readonly stdout: Buffer;
  readonly stderr: string;
}

export interface RunnerOptions {
  /** Absolute path of the git program (C001-IF-012 §6). */
  readonly gitPath: string;
  /** The developer's environment; default `process.env`. */
  readonly baseEnv?: NodeJS.ProcessEnv;
  /** Bound of the standard output of one command; default 256 MiB. */
  readonly maxOutputBytes?: number;
  /** Test seam: replaces `child_process.spawn`. */
  readonly spawn?: SpawnFn;
}

export interface RunOptions {
  readonly target: GitTarget;
  readonly signal?: AbortSignal;
}

export interface BatchObject {
  readonly oid: string;
  readonly type: string;
  readonly size: number;
  readonly content: Buffer;
}

const DEFAULT_MAX_OUTPUT = 256 * 1024 * 1024;

/** Kills a process and, on Windows, its children (cmd\git.exe starts the real git). */
export function killTree(child: ChildProcess): void {
  if (process.platform === 'win32' && child.pid !== undefined) {
    spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], {
      stdio: 'ignore',
      windowsHide: true,
    });
  }
  child.kill('SIGKILL');
}

/** The default executor of the program check: starts the program, no shell, bounded output. */
export const captureText: GitExec = (file, args, options) =>
  new Promise<CaptureResult>((resolve) => {
    let child: ChildProcess;
    try {
      child = nodeSpawn(file, [...args], {
        cwd: options.cwd,
        env: options.env,
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
      });
    } catch (error) {
      resolve({ kind: 'not-started', reason: (error as Error).message });
      return;
    }
    let stdout = '';
    let stderr = '';
    child.stdout!.on('data', (d: Buffer) => {
      if (stdout.length < 1 << 20) stdout += d.toString('utf8');
    });
    child.stderr!.on('data', (d: Buffer) => {
      if (stderr.length < 1 << 20) stderr += d.toString('utf8');
    });
    child.once('error', (error) => resolve({ kind: 'not-started', reason: error.message }));
    child.once('close', (status) => resolve({ kind: 'exited', status, stdout, stderr }));
  });

export class GitProcessRunner {
  private readonly live = new Set<ChildProcess>();
  private readonly spawnFn: SpawnFn;
  private readonly maxOutput: number;

  constructor(private readonly options: RunnerOptions) {
    this.spawnFn = options.spawn ?? ((file, args, o) => nodeSpawn(file, [...args], o));
    this.maxOutput = options.maxOutputBytes ?? DEFAULT_MAX_OUTPUT;
  }

  /** The number of git processes that this runner started and that have not ended. */
  get liveProcessCount(): number {
    return this.live.size;
  }

  /** The environment every process of this runner gets (Amendment 2, A2.1). */
  environment(): NodeJS.ProcessEnv {
    return gitReadEnvironment(this.options.baseEnv ?? process.env);
  }

  /** Runs one read-only git command and collects its output. */
  run(command: string, args: readonly string[], options: RunOptions): Promise<RunResult> {
    try {
      assertReadOnly(command, args);
    } catch (error) {
      return Promise.reject(error as Error);
    }
    const argv = buildGitArguments(command, args, options.target);
    const cwd = workingDirectory(options.target);
    return new Promise<RunResult>((resolve, reject) => {
      if (options.signal?.aborted) {
        reject(new GitAbortError());
        return;
      }
      const child = this.start(argv, cwd, reject);
      if (!child) return;
      const out: Buffer[] = [];
      let outBytes = 0;
      let err = '';
      let pending: Error | undefined;
      const stop = (error: Error) => {
        pending ??= error;
        killTree(child);
      };
      const onAbort = () => stop(new GitAbortError());
      options.signal?.addEventListener('abort', onAbort, { once: true });
      child.stdin!.on('error', () => undefined);
      child.stdin!.end();
      child.stdout!.on('data', (d: Buffer) => {
        outBytes += d.length;
        if (outBytes > this.maxOutput) stop(new GitOutputLimitError(this.maxOutput));
        else out.push(d);
      });
      child.stderr!.on('data', (d: Buffer) => {
        if (err.length < 1 << 20) err += d.toString('utf8');
      });
      child.once('error', (error) => {
        pending ??= new GitStartError(error.message, error);
      });
      child.once('close', (status) => {
        options.signal?.removeEventListener('abort', onAbort);
        this.live.delete(child);
        if (pending) reject(pending);
        else resolve({ status, stdout: Buffer.concat(out), stderr: err });
      });
    });
  }

  /** Starts the one long-lived `cat-file --batch` process of a review (C001-ADR-004 item 2). */
  batch(target: GitTarget, options: { maxObjectBytes?: number } = {}): CatFileBatch {
    assertReadOnly('cat-file', ['--batch']);
    const argv = buildGitArguments('cat-file', ['--batch'], target);
    return new CatFileBatch(
      (onError) => this.start(argv, workingDirectory(target), onError),
      (child) => this.live.delete(child),
      options.maxObjectBytes ?? this.maxOutput,
    );
  }

  /** Cancels every process that this runner started and waits until none is left. */
  async cancelAll(): Promise<void> {
    const children = [...this.live];
    const ended = children.map(
      (c) =>
        new Promise<void>((resolve) =>
          c.exitCode !== null ? resolve() : c.once('close', () => resolve()),
        ),
    );
    for (const c of children) killTree(c);
    await Promise.all(ended);
  }

  private start(
    argv: string[],
    cwd: string,
    onError: (error: Error) => void,
  ): ChildProcess | undefined {
    try {
      const child = this.spawnFn(this.options.gitPath, argv, {
        cwd,
        env: this.environment(),
        stdio: ['pipe', 'pipe', 'pipe'],
        windowsHide: true,
      });
      this.live.add(child);
      return child;
    } catch (error) {
      onError(new GitStartError((error as Error).message, error));
      return undefined;
    }
  }
}

interface PendingRead {
  readonly resolve: (value: BatchObject | null) => void;
  readonly reject: (error: Error) => void;
}

/** A persistent `git cat-file --batch`: one request at a time in order, bounded object size. */
export class CatFileBatch {
  private child: ChildProcess | undefined;
  private readonly queue: PendingRead[] = [];
  private parts: Buffer[] = [];
  private len = 0;
  private skipRemaining = 0;
  private header: { oid: string; type: string; size: number; skip: boolean } | undefined;
  private failure: Error | undefined;
  private stderr = '';
  private readonly exited: Promise<void>;

  constructor(
    start: (onError: (error: Error) => void) => ChildProcess | undefined,
    private readonly forget: (child: ChildProcess) => void,
    private readonly maxObjectBytes: number,
  ) {
    let done!: () => void;
    this.exited = new Promise<void>((resolve) => (done = resolve));
    this.child = start((error) => {
      this.failure = error;
    });
    const child = this.child;
    if (!child) {
      done();
      return;
    }
    child.stdin!.on('error', () => undefined);
    child.stdout!.on('data', (d: Buffer) => this.onData(d));
    child.stderr!.on('data', (d: Buffer) => {
      if (this.stderr.length < 1 << 20) this.stderr += d.toString('utf8');
    });
    child.once('error', (error) => this.fail(new GitStartError(error.message, error)));
    child.once('close', (status) => {
      this.forget(child);
      this.fail(
        new Error(`git cat-file --batch ended (status ${status ?? 'none'}): ${this.stderr.trim()}`),
      );
      done();
    });
  }

  /** The process id of the git process, when it started. */
  get pid(): number | undefined {
    return this.child?.pid;
  }

  /** Reads one object by id or by `<commit>:<path>`; null when git reports it missing. */
  read(object: string): Promise<BatchObject | null> {
    return new Promise((resolve, reject) => {
      if (this.failure) return reject(this.failure);
      if (/[\r\n\0]/.test(object))
        return reject(new GitCommandRejected('object name holds a line break'));
      this.queue.push({ resolve, reject });
      this.child!.stdin!.write(`${object}\n`);
    });
  }

  /** Ends the process by closing its input and waits until it has exited. */
  async close(): Promise<void> {
    this.child?.stdin?.end();
    await this.exited;
  }

  /** Cancellation: kills the process (and its children on Windows) and waits for its exit. */
  async cancel(): Promise<void> {
    if (this.child) killTree(this.child);
    await this.exited;
  }

  private fail(error: Error): void {
    this.failure ??= error;
    for (const p of this.queue.splice(0)) p.reject(this.failure);
  }

  private flatten(): Buffer {
    if (this.parts.length !== 1) this.parts = [Buffer.concat(this.parts)];
    return this.parts[0] ?? Buffer.alloc(0);
  }

  private consume(n: number): void {
    this.parts = [this.flatten().subarray(n)];
    this.len -= n;
  }

  private onData(chunk: Buffer): void {
    this.parts.push(chunk);
    this.len += chunk.length;
    for (;;) {
      if (!this.header) {
        if (this.len === 0) return;
        const flat = this.flatten();
        const eol = flat.indexOf(0x0a);
        if (eol < 0) return;
        const line = flat.subarray(0, eol).toString('utf8');
        this.consume(eol + 1);
        const pending = this.queue[0];
        if (!pending) return;
        const missing = /^(.*) (missing|ambiguous)$/.exec(line);
        if (missing) {
          this.queue.shift();
          if (missing[2] === 'missing') pending.resolve(null);
          else pending.reject(new Error(`ambiguous object name: ${missing[1]}`));
          continue;
        }
        const m = /^(\S+) (\S+) (\d+)$/.exec(line);
        if (!m) {
          this.queue.shift();
          pending.reject(new Error(`unexpected cat-file header: ${line}`));
          continue;
        }
        const size = Number(m[3]);
        this.header = { oid: m[1]!, type: m[2]!, size, skip: size > this.maxObjectBytes };
        this.skipRemaining = size + 1;
      }
      const header = this.header;
      if (header.skip) {
        // Over the bound: the bytes are dropped as they arrive, never held.
        const drop = Math.min(this.len, this.skipRemaining);
        if (drop > 0) this.consume(drop);
        this.skipRemaining -= drop;
        if (this.skipRemaining > 0) return;
        this.header = undefined;
        this.queue.shift()?.reject(new GitOutputLimitError(this.maxObjectBytes));
        continue;
      }
      const need = header.size + 1;
      if (this.len < need) return;
      const content = Buffer.from(this.flatten().subarray(0, header.size));
      this.consume(need);
      this.header = undefined;
      this.queue
        .shift()
        ?.resolve({ oid: header.oid, type: header.type, size: header.size, content });
    }
  }
}
