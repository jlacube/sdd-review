/**
 * The environment of the adapter's git processes (C001-ADR-004 Amendment 2, C001-T-005).
 *
 * Every git process starts with the repository-locating variables removed, so that a review
 * started from a git hook (which sets a temporary `GIT_INDEX_FILE`) or from a shell that sets
 * `GIT_DIR` reads the repository it names and not another one (C001-RISK-005).
 */

/**
 * The "Removed" list of C001-IF-013 §1 item 7: the variables that `git rev-parse
 * --local-env-vars` of git 2.45.1 prints, except the command-line configuration variables, plus
 * `GIT_NAMESPACE` and `GIT_QUARANTINE_PATH`. One list for the adapter and the evidence runner
 * (C001-T-019).
 */
export const REMOVED_GIT_VARIABLES: readonly string[] = [
  'GIT_DIR',
  'GIT_WORK_TREE',
  'GIT_IMPLICIT_WORK_TREE',
  'GIT_COMMON_DIR',
  'GIT_INDEX_FILE',
  'GIT_OBJECT_DIRECTORY',
  'GIT_ALTERNATE_OBJECT_DIRECTORIES',
  'GIT_GRAFT_FILE',
  'GIT_SHALLOW_FILE',
  'GIT_CONFIG',
  'GIT_REPLACE_REF_BASE',
  'GIT_NO_REPLACE_OBJECTS',
  'GIT_PREFIX',
  'GIT_NAMESPACE',
  'GIT_QUARANTINE_PATH',
];

/**
 * The variables of the hardening profile (C001-ADR-004 decision item 3). `LC_ALL=C` makes git's
 * messages stable so that the program check can recognise "not a git repository". No variable
 * here sets git configuration or `safe.directory` (C001-IF-012 §6: a refusal is never overridden).
 */
export const GIT_HARDENING_ENVIRONMENT: Readonly<Record<string, string>> = {
  GIT_OPTIONAL_LOCKS: '0',
  GIT_TERMINAL_PROMPT: '0',
  GIT_PAGER: 'cat',
  // git 2.44 and later: no lazy fetch of a missing object of a partial clone.
  GIT_NO_LAZY_FETCH: '1',
  LC_ALL: 'C',
};

export interface EnvironmentOptions {
  /** Match variable names whatever their letter case; the default is true on Windows. */
  readonly caseInsensitive?: boolean;
}

function dropNames(
  env: NodeJS.ProcessEnv,
  names: readonly string[],
  caseInsensitive: boolean,
): NodeJS.ProcessEnv {
  const wanted = new Set(caseInsensitive ? names.map((n) => n.toUpperCase()) : names);
  const out: NodeJS.ProcessEnv = {};
  for (const [name, value] of Object.entries(env)) {
    if (!wanted.has(caseInsensitive ? name.toUpperCase() : name)) out[name] = value;
  }
  return out;
}

/** The given environment without the variables of the "Removed" list; the input is not changed. */
export function removeLocatingVariables(
  env: NodeJS.ProcessEnv,
  options: EnvironmentOptions = {},
): NodeJS.ProcessEnv {
  return dropNames(env, REMOVED_GIT_VARIABLES, options.caseInsensitive ?? isWindows());
}

/**
 * The environment of one git process: the developer's environment without the locating
 * variables, with the hardening variables. Every other variable is kept (Amendment 2, A2.1).
 */
export function gitReadEnvironment(
  base: NodeJS.ProcessEnv = process.env,
  options: EnvironmentOptions = {},
): NodeJS.ProcessEnv {
  const caseInsensitive = options.caseInsensitive ?? isWindows();
  const cleaned = dropNames(
    removeLocatingVariables(base, { caseInsensitive }),
    Object.keys(GIT_HARDENING_ENVIRONMENT),
    caseInsensitive,
  );
  return { ...cleaned, ...GIT_HARDENING_ENVIRONMENT };
}

function isWindows(): boolean {
  return process.platform === 'win32';
}
