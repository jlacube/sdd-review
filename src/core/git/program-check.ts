import { statSync } from 'node:fs';
import { delimiter, isAbsolute, join } from 'node:path';
import { ReviewError } from '../errors/review-error.js';
import { gitReadEnvironment } from './environment.js';
import { buildGitArguments, captureText, type CaptureResult, type GitExec } from './process.js';

export type { CaptureResult, GitExec } from './process.js';

/**
 * The check of the git program and the repository (C001-IF-012 §6, C001-REQ-125, C001-ADR-004
 * A1.1): run once per process, before the first git read of a command. Each failure is an
 * ERR-INTAKE-008 whose message names the cause.
 */

export const MINIMUM_GIT = { major: 2, minor: 34 } as const;

export type GitFailureKind =
  'not-found' | 'cannot-start' | 'no-readable-version' | 'too-old' | 'repository-refused';

export interface GitProgram {
  readonly path: string;
  readonly version: string;
  readonly major: number;
  readonly minor: number;
}

export interface ResolveOptions {
  readonly platform?: NodeJS.Platform;
  /** Test seam: whether a path is a file. */
  readonly isFile?: (path: string) => boolean;
}

function defaultIsFile(path: string): boolean {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
}

/**
 * The first `git` of PATH, as an absolute path. Relative and empty PATH entries are skipped, so
 * neither the current directory nor the repository directory is ever searched (C001-ADR-004).
 */
export function resolveGitOnPath(
  env: NodeJS.ProcessEnv,
  options: ResolveOptions = {},
): string | undefined {
  const platform = options.platform ?? process.platform;
  const isFile = options.isFile ?? defaultIsFile;
  const windows = platform === 'win32';
  const key = Object.keys(env).find((k) => (windows ? k.toUpperCase() === 'PATH' : k === 'PATH'));
  const value = key ? env[key] : undefined;
  if (!value) return undefined;
  const names = windows ? ['git.exe', 'git.com', 'git'] : ['git'];
  for (const dir of value.split(delimiter)) {
    if (!dir || !isAbsolute(dir)) continue;
    for (const name of names) {
      const candidate = join(dir, name);
      if (isFile(candidate)) return candidate;
    }
  }
  return undefined;
}

/** The version of the text `git --version` prints, when it holds at least two numbers. */
export function parseGitVersion(
  text: string,
): { major: number; minor: number; text: string } | undefined {
  const m = /^git version (\d+)\.(\d+)/.exec(text.trim());
  if (!m) return undefined;
  return { major: Number(m[1]), minor: Number(m[2]), text: text.trim() };
}

/** The first error of git's output: its first line and the indented lines that continue it. */
export function firstErrorEntry(stderr: string): string {
  const lines = stderr.split(/\r?\n/);
  const start = lines.findIndex((l) => l.trim() !== '');
  if (start < 0) return '';
  const entry = [lines[start]!.trim()];
  for (let i = start + 1; i < lines.length && /^[ \t]+\S/.test(lines[i]!); i++) {
    entry.push(lines[i]!.trim());
  }
  return entry.join(' ');
}

export class GitUnusableError extends ReviewError {
  constructor(
    readonly failure: GitFailureKind,
    directory: string,
    text: string,
    cause?: unknown,
  ) {
    super('ERR-INTAKE-008', {
      operation: 'git-check',
      inputs: { directory, failure },
      params: { directory },
      cause: cause ?? text,
    });
    this.name = 'GitUnusableError';
    this.message = `Cannot read the repository at "${directory}" with git: ${text}.`;
  }
}

/** Maps the facts of a failed check to its error text (no process is started). */
export function gitUnusable(
  failure: GitFailureKind,
  directory: string,
  facts: {
    path?: string;
    version?: string;
    printed?: string;
    status?: number | null;
    reason?: string;
    gitMessage?: string;
  } = {},
): GitUnusableError {
  const at = `"${facts.path ?? ''}"`;
  let text: string;
  switch (failure) {
    case 'not-found':
      text = 'the git program was not found on PATH';
      break;
    case 'cannot-start':
      text = `the git program at ${at} could not be started (${facts.reason ?? 'unknown reason'})`;
      break;
    case 'no-readable-version': {
      const status = facts.status ? `, exit status ${facts.status}` : '';
      text = `git at ${at} printed no readable version ("${facts.printed ?? ''}"${status}); version 2.34 or later is required`;
      break;
    }
    case 'too-old':
      text = `git ${facts.version} at ${at} is older than 2.34, the oldest supported version`;
      break;
    case 'repository-refused':
      text = `git ${facts.version} at ${at} refused to open the repository (${facts.gitMessage ?? ''})`;
      break;
  }
  return new GitUnusableError(failure, directory, text);
}

export interface CheckerOptions {
  readonly env?: NodeJS.ProcessEnv;
  readonly platform?: NodeJS.Platform;
  readonly isFile?: (path: string) => boolean;
  /** Test seam: replaces the start of a process. */
  readonly exec?: GitExec;
}

export interface CheckResult {
  readonly program: GitProgram;
  /** False when git finds no repository at or above the directory (G-01: ERR-INTAKE-001). */
  readonly repositoryFound: boolean;
}

/** Checks the program once per process, and the repository named by each call. */
export class GitAccessChecker {
  private programResult: Promise<GitProgram> | undefined;

  constructor(private readonly options: CheckerOptions = {}) {}

  /** The program check alone (not found, cannot start, no readable version, too old). */
  program(directory: string): Promise<GitProgram> {
    this.programResult ??= this.checkProgram(directory);
    return this.programResult;
  }

  /** The program check, then the repository check at or above the directory. */
  async check(directory: string): Promise<CheckResult> {
    const program = await this.program(directory);
    const run = this.options.exec ?? captureText;
    const env = gitReadEnvironment(this.options.env ?? process.env);
    const argv = buildGitArguments('rev-parse', ['--git-dir'], { discoverFrom: directory });
    const result = await run(program.path, argv, { cwd: directory, env });
    if (result.kind === 'not-started') {
      throw gitUnusable('cannot-start', directory, { path: program.path, reason: result.reason });
    }
    if (result.status === 0) return { program, repositoryFound: true };
    if (/not a git repository/i.test(result.stderr)) return { program, repositoryFound: false };
    throw gitUnusable('repository-refused', directory, {
      path: program.path,
      version: program.version,
      gitMessage: firstErrorEntry(result.stderr) || `exit status ${result.status}`,
    });
  }

  private async checkProgram(directory: string): Promise<GitProgram> {
    const env = this.options.env ?? process.env;
    const path = resolveGitOnPath(env, {
      platform: this.options.platform,
      isFile: this.options.isFile,
    });
    if (!path) throw gitUnusable('not-found', directory);
    const run = this.options.exec ?? captureText;
    const result: CaptureResult = await run(path, ['--version'], {
      env: gitReadEnvironment(env),
    });
    if (result.kind === 'not-started') {
      throw gitUnusable('cannot-start', directory, { path, reason: result.reason });
    }
    const printed = result.stdout.trim();
    const version = result.status === 0 ? parseGitVersion(printed) : undefined;
    if (!version) {
      throw gitUnusable('no-readable-version', directory, {
        path,
        printed,
        status: result.status,
      });
    }
    const number = /(\d+(?:\.\d+)+)/.exec(printed)?.[1] ?? `${version.major}.${version.minor}`;
    if (
      version.major < MINIMUM_GIT.major ||
      (version.major === MINIMUM_GIT.major && version.minor < MINIMUM_GIT.minor)
    ) {
      throw gitUnusable('too-old', directory, { path, version: number });
    }
    return { path, version: number, major: version.major, minor: version.minor };
  }
}
