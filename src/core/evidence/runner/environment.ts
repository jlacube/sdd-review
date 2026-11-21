import { posix, win32 } from 'node:path';
import type { RepositoryLocation } from '../../git/port.js';
import { REMOVED_GIT_VARIABLES, removeLocatingVariables } from '../../git/environment.js';

/**
 * The environment of an evidence command (C001-IF-013 §1 items 1 and 7, C001-REQ-525,
 * C001-ADR-006 Amendment 1 A1.2, which replaces §5 of that ADR): the developer's environment with
 *
 * - **Removed:** the git repository-locating variables. The list is the one constant of the git
 *   adapter (C001-T-005), so the adapter and the evidence runner never differ; on Windows, names
 *   match whatever their letter case;
 * - **Replaced:** `GIT_CEILING_DIRECTORIES`, set to the parent of the workspace root alone;
 * - **Kept:** every other variable, other `GIT_*` variables included;
 *
 * and the values that the coverage adapters and mutation tools inject (C001-ADR-007 §1), appended
 * or prepended to the developer's value, never replacing it, and never naming a path of the
 * working tree or of the git directory (C001-IF-013 §9 item 1).
 */

/** The "Removed" list of C001-IF-013 §1 item 7, shared with the git adapter. */
export const EVIDENCE_REMOVED_VARIABLES: readonly string[] = REMOVED_GIT_VARIABLES;

/** The one variable that the evidence runner sets, discarding the developer's value. */
export const CEILING_VARIABLE = 'GIT_CEILING_DIRECTORIES';

/** A value given to an evidence command through an environment variable (C001-ADR-007 §1). */
export interface Injection {
  readonly name: string;
  readonly value: string;
  /** Before or after the developer's value; the developer's value is never replaced. */
  readonly position: 'prepend' | 'append';
  /** Between the injected and the developer's value: a path delimiter, or ' ' for options. */
  readonly separator: string;
}

/** An injection that would replace a variable the runner owns or name a protected path. */
export class InjectionRefused extends Error {
  constructor(
    readonly variable: string,
    reason: string,
  ) {
    super(`the injected variable ${variable} ${reason}`);
    this.name = 'InjectionRefused';
  }
}

export interface EvidenceEnvironmentOptions {
  /** The developer's environment; not changed. */
  readonly base: NodeJS.ProcessEnv;
  /** The real path of the workspace root, the command's working directory. */
  readonly workspaceRoot: string;
  /** The real paths that no injected value may name. */
  readonly repository: Pick<RepositoryLocation, 'workTreeRoot' | 'gitDir' | 'commonGitDir'>;
  readonly inject?: readonly Injection[];
  readonly platform?: NodeJS.Platform;
}

/** The value of `GIT_CEILING_DIRECTORIES` for a workspace: the parent of its root. */
export function ceilingFor(workspaceRoot: string, platform: NodeJS.Platform = process.platform) {
  return (platform === 'win32' ? win32 : posix).dirname(workspaceRoot);
}

const caseInsensitiveOn = (platform: NodeJS.Platform) => platform === 'win32';

/** The key of `env` that names `name` on this platform, or undefined. */
function keyOf(env: NodeJS.ProcessEnv, name: string, caseInsensitive: boolean): string | undefined {
  if (!caseInsensitive) return Object.hasOwn(env, name) ? name : undefined;
  const upper = name.toUpperCase();
  return Object.keys(env).find((k) => k.toUpperCase() === upper);
}

const PATH_END = new Set(['', '/', '\\', '"', "'", ' ', '\t', ',', ';', ':', '=']);

/**
 * True when `value` names `protectedPath` or a path below it: an occurrence of the path text
 * followed by the end, a separator or a character that ends a path in a list or an option. On
 * Windows the comparison ignores letter case and treats `/` and `\` alike, so that a file URL
 * (`file:///C:/…`) is recognised too.
 */
export function namesPath(value: string, protectedPath: string, platform: NodeJS.Platform) {
  if (protectedPath === '') return false;
  const fold = (s: string) =>
    platform === 'win32'
      ? s.replace(/\\/g, '/').toLowerCase()
      : platform === 'darwin'
        ? s.toLowerCase()
        : s;
  const haystack = fold(value);
  const needle = fold(protectedPath).replace(/\/+$/, '');
  for (let at = haystack.indexOf(needle); at >= 0; at = haystack.indexOf(needle, at + 1)) {
    const next = haystack.charAt(at + needle.length);
    // On Windows ':' only follows a drive letter, which the needle already holds.
    if (PATH_END.has(next) && !(platform === 'win32' && next === ':')) return true;
  }
  return false;
}

/** Builds the environment of one evidence command; throws InjectionRefused. */
export function buildEvidenceEnvironment(options: EvidenceEnvironmentOptions): NodeJS.ProcessEnv {
  const platform = options.platform ?? process.platform;
  const caseInsensitive = caseInsensitiveOn(platform);
  const env = removeLocatingVariables(options.base, { caseInsensitive });
  const ceilingKey = keyOf(env, CEILING_VARIABLE, caseInsensitive);
  if (ceilingKey !== undefined) delete env[ceilingKey];

  const owned = new Set(
    [...EVIDENCE_REMOVED_VARIABLES, CEILING_VARIABLE].map((n) =>
      caseInsensitive ? n.toUpperCase() : n,
    ),
  );
  const protectedPaths = [
    options.repository.workTreeRoot,
    options.repository.gitDir,
    options.repository.commonGitDir,
  ];
  for (const injection of options.inject ?? []) {
    const name = caseInsensitive ? injection.name.toUpperCase() : injection.name;
    if (owned.has(name)) {
      throw new InjectionRefused(injection.name, 'is removed or set by the evidence runner');
    }
    const named = protectedPaths.find((p) => namesPath(injection.value, p, platform));
    if (named !== undefined) {
      throw new InjectionRefused(
        injection.name,
        `names a path of the working tree or the git directory (${named})`,
      );
    }
    const key = keyOf(env, injection.name, caseInsensitive) ?? injection.name;
    const current = env[key];
    env[key] =
      current === undefined || current === ''
        ? injection.value
        : injection.position === 'prepend'
          ? `${injection.value}${injection.separator}${current}`
          : `${current}${injection.separator}${injection.value}`;
  }

  env[CEILING_VARIABLE] = ceilingFor(options.workspaceRoot, platform);
  return env;
}
