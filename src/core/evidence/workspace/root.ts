import { chmodSync, existsSync, mkdirSync, realpathSync } from 'node:fs';
import { homedir, tmpdir as osTmpdir } from 'node:os';
import { posix, resolve, win32 } from 'node:path';
import type { RepositoryLocation } from '../../git/port.js';
import { ReviewError } from '../../errors/review-error.js';
import type { ContextualLog } from '../../log/log.js';

/**
 * The evidence root (C001-ADR-006 §1, C001-IF-013 §2 item 2, C001-CON-22): the directory under
 * which every evidence workspace lies. Per operating system, with the OS temporary directory as the
 * fallback; each candidate must lie outside the working-tree root, the git directory and the common
 * git directory, below none of them, compared on real paths. Nothing is created before a
 * candidate has passed the check, so a refused candidate leaves no directory in the repository.
 */

export interface PreparationFailure {
  readonly operation: string;
  readonly command?: string;
  readonly cause: string;
  readonly inputs?: Readonly<Record<string, unknown>>;
}

/**
 * ERR-EVID-002 (no evidence workspace can be prepared), recorded in the contextual log and thrown.
 * A failing log never hides the error.
 */
export function failPreparation(
  log: ContextualLog | undefined,
  failure: PreparationFailure,
): never {
  const error = new ReviewError('ERR-EVID-002', {
    operation: failure.operation,
    inputs: failure.inputs,
    params: { command: failure.command ?? '', cause: failure.cause },
    cause: failure.cause,
  });
  try {
    log?.recordError(error, failure.operation);
  } catch {
    /* the error itself is what matters */
  }
  throw error;
}

export interface RootPlatform {
  readonly platform: NodeJS.Platform;
  readonly env: NodeJS.ProcessEnv;
  readonly home: string;
  readonly tmpdir: string;
}

/** The candidates in the order they are tried: the per-OS root, then the temporary directory. */
export function evidenceRootCandidates(p: RootPlatform): string[] {
  if (p.platform === 'win32') {
    const local = p.env.LOCALAPPDATA;
    const base = local && local.length > 0 ? local : win32.join(p.home, 'AppData', 'Local');
    // The short name keeps workspace paths below the 260-character limit of some tools.
    return [win32.join(base, 'sddr'), win32.join(p.tmpdir, 'sddr')];
  }
  if (p.platform === 'darwin') {
    return [
      posix.join(p.home, 'Library', 'Caches', 'sdd-review'),
      posix.join(p.tmpdir, 'sdd-review'),
    ];
  }
  const xdg = p.env.XDG_CACHE_HOME;
  // The XDG base directory specification ignores a relative value.
  const cache = xdg && posix.isAbsolute(xdg) ? xdg : posix.join(p.home, '.cache');
  return [posix.join(cache, 'sdd-review'), posix.join(p.tmpdir, 'sdd-review')];
}

export type ProtectedKind = 'working tree' | 'git directory' | 'common git directory';

export interface Conflict {
  readonly kind: ProtectedKind;
  /** The protected directory the candidate lies in, as given. */
  readonly path: string;
}

export interface CompareOptions {
  /** True on Windows and macOS, whose default file systems ignore letter case. */
  readonly caseInsensitive: boolean;
  readonly separator: '/' | '\\';
}

const normalise = (path: string, o: CompareOptions) => {
  let p = o.separator === '\\' ? path.replace(/\//g, '\\') : path;
  while (p.length > 1 && p.endsWith(o.separator) && !/^[A-Za-z]:\\$/.test(p)) p = p.slice(0, -1);
  return o.caseInsensitive ? p.toLowerCase() : p;
};

/** True when `inner` is `outer` or lies below it; both real paths. */
export function isWithin(inner: string, outer: string, o: CompareOptions): boolean {
  const a = normalise(inner, o);
  const b = normalise(outer, o);
  if (a === b) return true;
  return a.startsWith(b.endsWith(o.separator) ? b : b + o.separator);
}

/**
 * The first protected directory that the real path `candidate` lies in or equals, or null. The
 * protected paths must be real paths too. A bare repository has no working tree ('').
 */
export function containmentConflict(
  candidate: string,
  repository: Pick<RepositoryLocation, 'workTreeRoot' | 'gitDir' | 'commonGitDir'>,
  options: CompareOptions,
): Conflict | null {
  const protectedPaths: Array<[ProtectedKind, string]> = [
    ['working tree', repository.workTreeRoot],
    ['git directory', repository.gitDir],
    ['common git directory', repository.commonGitDir],
  ];
  for (const [kind, path] of protectedPaths) {
    if (path && isWithin(candidate, path, options)) return { kind, path };
  }
  return null;
}

/** The real path of `path`, whose last components may not exist yet. */
export function realPathOfPossiblyMissing(path: string, platform = process.platform): string {
  const join = platform === 'win32' ? win32.join : posix.join;
  const missing: string[] = [];
  let at = resolve(path);
  while (!existsSync(at)) {
    const parent = resolve(at, '..');
    if (parent === at) break;
    missing.unshift(at.slice(parent.length).replace(/^[\\/]+/, ''));
    at = parent;
  }
  const real = existsSync(at) ? realpathSync.native(at) : at;
  return missing.length === 0 ? real : join(real, ...missing);
}

export interface ResolveRootOptions extends Partial<RootPlatform> {
  readonly repository: Pick<RepositoryLocation, 'workTreeRoot' | 'gitDir' | 'commonGitDir'>;
  readonly log?: ContextualLog;
  /** The command the workspace is prepared for, named by ERR-EVID-002. */
  readonly command?: string;
}

/**
 * Resolves, checks and creates the evidence root; returns its real path. ERR-EVID-002 when neither
 * candidate passes the check or can be created.
 */
export function resolveEvidenceRoot(options: ResolveRootOptions): string {
  const platform = options.platform ?? process.platform;
  const compare: CompareOptions = {
    caseInsensitive: platform === 'win32' || platform === 'darwin',
    separator: platform === 'win32' ? '\\' : '/',
  };
  const real = (p: string) => (p ? realPathOfPossiblyMissing(p, platform) : '');
  const repository = {
    workTreeRoot: real(options.repository.workTreeRoot),
    gitDir: real(options.repository.gitDir),
    commonGitDir: real(options.repository.commonGitDir),
  };
  const candidates = evidenceRootCandidates({
    platform,
    env: options.env ?? process.env,
    home: options.home ?? homedir(),
    tmpdir: options.tmpdir ?? osTmpdir(),
  });
  const refusals: string[] = [];
  for (const candidate of candidates) {
    const before = containmentConflict(real(candidate), repository, compare);
    if (before) {
      refusals.push(`${candidate} lies in the ${before.kind} ${before.path}`);
      continue;
    }
    try {
      mkdirSync(candidate, { recursive: true, mode: 0o700 });
      if (platform !== 'win32') chmodSync(candidate, 0o700);
    } catch (error) {
      refusals.push(`${candidate} cannot be created (${(error as Error).message})`);
      continue;
    }
    // Checked again on the created directory: a link created in between cannot move it inside.
    const created = realpathSync.native(candidate);
    const after = containmentConflict(created, repository, compare);
    if (after) {
      refusals.push(`${candidate} lies in the ${after.kind} ${after.path}`);
      continue;
    }
    return created;
  }
  return failPreparation(options.log, {
    operation: 'resolve-evidence-root',
    command: options.command,
    cause: `no evidence root outside the repository: ${refusals.join('; ')}`,
    inputs: { candidates },
  });
}
