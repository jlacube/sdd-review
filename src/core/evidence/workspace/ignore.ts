import { wildmatchToRegex } from '../../git/attributes.js';

/**
 * The snapshot's ignore rules, evaluated in process with git's semantics (C001-ADR-006 §2 "Ignore
 * rules", gitignore(5)): the `.gitignore` files of the snapshot, the repository's `info/exclude`
 * and `core.excludesFile`. The sources are read once at intake and handed in; nothing here reads
 * git or the file system.
 *
 * Precedence, highest first: the `.gitignore` of the deepest directory, then higher ones, then
 * `info/exclude`, then `core.excludesFile`; within one source the last matching line decides. A
 * path below an excluded directory is excluded, whatever a negation says.
 */

export interface IgnoreRule {
  /** The pattern text after unescaping, without `!` and without a trailing `/`. */
  readonly source: string;
  readonly negated: boolean;
  readonly directoryOnly: boolean;
  /** Without a slash, a pattern matches the basename at any depth below its directory. */
  readonly basenameOnly: boolean;
  readonly regex: RegExp;
}

export interface IgnoreFile {
  /** '' for the root (and for `info/exclude` and `core.excludesFile`), else 'a/b'. */
  readonly directory: string;
  readonly rules: readonly IgnoreRule[];
}

export interface IgnoreSource {
  readonly directory: string;
  readonly content: string;
}

export interface IgnoreRuleSources {
  /** The `.gitignore` files of the snapshot, in any order. */
  readonly perDirectory: readonly IgnoreSource[];
  /** `info/exclude` of the common git directory, or null. */
  readonly exclude: string | null;
  /** The file that `core.excludesFile` names, or null. */
  readonly excludesFile: string | null;
  /** `core.ignorecase`. */
  readonly ignoreCase: boolean;
}

/** Trailing spaces are removed unless the last one is escaped with a backslash. */
function trimTrailing(line: string): string {
  let end = line.length;
  while (end > 0 && line[end - 1] === ' ') {
    let backslashes = 0;
    for (let i = end - 2; i >= 0 && line[i] === '\\'; i--) backslashes++;
    if (backslashes % 2 === 1) break;
    end--;
  }
  return line.slice(0, end);
}

/** Parses one ignore file; `directory` is the directory it applies to. */
export function parseIgnoreFile(
  directory: string,
  content: string,
  ignoreCase = false,
): IgnoreFile {
  const rules: IgnoreRule[] = [];
  for (const raw of content.split('\n')) {
    let line = trimTrailing(raw.endsWith('\r') ? raw.slice(0, -1) : raw);
    if (line === '' || line.startsWith('#')) continue;
    let negated = false;
    if (line.startsWith('!')) {
      negated = true;
      line = line.slice(1);
    } else if (line.startsWith('\\!') || line.startsWith('\\#')) {
      line = line.slice(1);
    }
    let directoryOnly = false;
    if (line.endsWith('/') && !line.endsWith('\\/')) {
      directoryOnly = true;
      line = line.slice(0, -1);
    }
    if (line === '') continue;
    const basenameOnly = !line.includes('/');
    const pattern = line.startsWith('/') ? line.slice(1) : line;
    rules.push({
      source: pattern.replace(/\\(.)/g, '$1'),
      negated,
      directoryOnly,
      basenameOnly,
      regex: wildmatchToRegex(pattern, ignoreCase),
    });
  }
  return { directory, rules };
}

type Decision = 'ignored' | 'included' | 'undecided';

function decide(file: IgnoreFile, path: string, isDirectory: boolean): Decision {
  const prefix = file.directory === '' ? '' : `${file.directory}/`;
  if (!path.startsWith(prefix) || path.length === prefix.length) return 'undecided';
  const relative = path.slice(prefix.length);
  const base = relative.slice(relative.lastIndexOf('/') + 1);
  for (let i = file.rules.length - 1; i >= 0; i--) {
    const rule = file.rules[i]!;
    if (rule.directoryOnly && !isDirectory) continue;
    if (!rule.regex.test(rule.basenameOnly ? base : relative)) continue;
    return rule.negated ? 'included' : 'ignored';
  }
  return 'undecided';
}

const depth = (directory: string) => (directory === '' ? 0 : directory.split('/').length);

/** The ignore rules of one snapshot. */
export class IgnoreRules {
  private readonly ordered: readonly IgnoreFile[];
  private readonly cache = new Map<string, boolean>();

  constructor(sources: IgnoreRuleSources) {
    const perDirectory = sources.perDirectory
      .map((s) => parseIgnoreFile(s.directory, s.content, sources.ignoreCase))
      .sort((a, b) => depth(b.directory) - depth(a.directory));
    const global = [
      sources.exclude === null ? null : parseIgnoreFile('', sources.exclude, sources.ignoreCase),
      sources.excludesFile === null
        ? null
        : parseIgnoreFile('', sources.excludesFile, sources.ignoreCase),
    ].filter((f): f is IgnoreFile => f !== null);
    this.ordered = [...perDirectory, ...global];
  }

  private matches(path: string, isDirectory: boolean): boolean {
    for (const file of this.ordered) {
      const d = decide(file, path, isDirectory);
      if (d !== 'undecided') return d === 'ignored';
    }
    return false;
  }

  /** True when a directory on the way to `path`, or `path` itself, is excluded. */
  isIgnored(path: string, isDirectory: boolean): boolean {
    const parts = path.split('/');
    for (let i = 1; i < parts.length; i++) {
      if (this.isIgnoredBelow(parts.slice(0, i).join('/'))) return true;
    }
    return this.matches(path, isDirectory);
  }

  /** True when the directory `path` is excluded, so that everything below it is excluded too. */
  isIgnoredBelow(directory: string): boolean {
    let known = this.cache.get(directory);
    if (known === undefined) {
      const slash = directory.lastIndexOf('/');
      known =
        (slash > 0 && this.isIgnoredBelow(directory.slice(0, slash))) ||
        this.matches(directory, true);
      this.cache.set(directory, known);
    }
    return known;
  }
}

/**
 * The files called `fileName` (`.gitignore`, `.gitattributes`) among the paths of a snapshot, each
 * with its directory and content, sorted by directory.
 */
export async function sourcesNamed(
  fileName: string,
  paths: Iterable<string>,
  read: (path: string) => Promise<Buffer>,
): Promise<IgnoreSource[]> {
  const out: IgnoreSource[] = [];
  const suffix = `/${fileName}`;
  for (const path of paths) {
    if (path !== fileName && !path.endsWith(suffix)) continue;
    const directory = path === fileName ? '' : path.slice(0, -suffix.length);
    out.push({ directory, content: (await read(path)).toString('utf8') });
  }
  return out.sort((a, b) => (a.directory < b.directory ? -1 : a.directory > b.directory ? 1 : 0));
}

/** The `.gitignore` files among the paths of a snapshot, with their content. */
export function gitignoreSources(
  paths: Iterable<string>,
  read: (path: string) => Promise<Buffer>,
): Promise<IgnoreSource[]> {
  return sourcesNamed('.gitignore', paths, read);
}
