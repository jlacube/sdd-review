import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { countRepositoryLines } from './loc.js';

/** Limits of nfr.md section 0. */
export const LIMITS = {
  maxRepositoryLines: 500_000,
  minChangedLines: 9_000,
  maxChangedLines: 10_000,
  minChangedFiles: 250,
  maxChangedFiles: 300,
} as const;

export const ECOSYSTEMS = {
  typescript: 'bench-ts',
  python: 'bench-py',
  csharp: 'bench-cs',
} as const;

export type Ecosystem = keyof typeof ECOSYSTEMS;

const PERMISSIVE = new Set([
  'MIT',
  'Apache-2.0',
  'BSD-2-Clause',
  'BSD-3-Clause',
  'ISC',
  'Unlicense',
  '0BSD',
  'BlueOak-1.0.0',
  'Zlib',
]);
const FORBIDDEN = /GPL|MPL|SSPL|EUPL|CDDL|EPL|BUSL|CC-BY-NC|Commons-Clause/i;
const HEX40 = /^[0-9a-f]{40}$/;
export const NAMED_FILE_ROLES = ['pull-request-text', 'agent-plan', 'agent-transcript'] as const;

export interface ValidationResult {
  frozen: boolean;
  errors: string[];
  warnings: string[];
}

export interface ValidateOptions {
  /** Repository root: environment files and task description files are relative to it. */
  repoRoot: string;
  /** Directory that holds the reference checkouts (`ref/<name>` below it). */
  benchRoot: string;
  /** Read git data of the checkouts that exist. */
  useGit?: boolean;
}

type Json = Record<string, unknown>;

const isObject = (v: unknown): v is Json =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
const isString = (v: unknown): v is string => typeof v === 'string' && v.trim() !== '';
const isInt = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 0;

/** A licence expression is permissive when no forbidden family occurs and a permitted id does. */
export function licenceIsPermissive(expression: string): boolean {
  if (FORBIDDEN.test(expression)) return false;
  const alternatives = expression
    .replace(/[()]/g, ' ')
    .split(/\s+OR\s+/)
    .map((alt) => alt.split(/\s+AND\s+/).map((id) => id.trim()));
  return alternatives.some((all) => all.every((id) => PERMISSIVE.has(id)));
}

/** Check of one field: an error text, or null when it is well formed. */
type FieldCheck = (value: unknown) => string | null;

const hexCommit: FieldCheck = (v) => (isString(v) && HEX40.test(v) ? null : 'a 40-hex commit id');
const nonEmptyString: FieldCheck = (v) => (isString(v) ? null : 'a non-empty string');

const commitList: FieldCheck = (v) =>
  Array.isArray(v) && v.length > 0 && v.every((c) => isString(c) && HEX40.test(c))
    ? null
    : 'a non-empty list of 40-hex commit ids';

const changeLocation: FieldCheck = (v) =>
  isObject(v) && isString(v.checkout) && isString(v.ref)
    ? null
    : 'an object {checkout, ref} (checkout relative to the bench root)';

const namedFiles: FieldCheck = (v) => {
  if (!Array.isArray(v)) return 'a list of {role, path}';
  const bad = v.find(
    (f) =>
      !isObject(f) ||
      !(NAMED_FILE_ROLES as readonly string[]).includes(f.role as string) ||
      !isString(f.path),
  );
  return bad === undefined
    ? null
    : `entries {role, path} with role in ${NAMED_FILE_ROLES.join(', ')}`;
};

const intake: FieldCheck = (v) =>
  isObject(v) && Array.isArray(v.reviewArguments) && v.reviewArguments.every(isString)
    ? null
    : 'an object {reviewArguments: string[]}';

const sddChange: FieldCheck = (v) =>
  isObject(v) && isString(v.id) && isString(v.path) ? null : 'an object {id, path}';

const CHANGE_FIELDS: Record<string, FieldCheck> = {
  baseCommit: hexCommit,
  headCommit: hexCommit,
  agentCommits: commitList,
  changeLocation,
  changedLines: (v) => (isInt(v) ? null : 'an integer'),
  changedFiles: (v) => (isInt(v) ? null : 'an integer'),
  taskDescriptionFile: nonEmptyString,
  namedFiles,
  intake,
};

function validateRepository(
  where: string,
  repo: unknown,
  deep: boolean,
  errors: string[],
  opts: ValidateOptions,
): void {
  if (!isObject(repo)) {
    errors.push(`${where}: missing or not an object`);
    return;
  }
  for (const key of [
    'name',
    'language',
    'repository',
    'licenceFile',
    'testCommand',
    'testWorkingDirectory',
  ]) {
    if (!isString(repo[key])) errors.push(`${where}.${key}: must be a non-empty string`);
  }
  if (hexCommit(repo.commit)) errors.push(`${where}.commit: must be a 40-hex commit id`);
  if (!isString(repo.licence)) errors.push(`${where}.licence: must be an SPDX expression`);
  else if (!licenceIsPermissive(repo.licence)) {
    errors.push(`${where}.licence: ${repo.licence} is not permissive (MIT, Apache-2.0, BSD, ...)`);
  }
  const lc = repo.lineCount;
  if (!isObject(lc) || !isInt(lc.totalLines) || !isInt(lc.sourceLines) || !isString(lc.method)) {
    errors.push(`${where}.lineCount: must be {totalLines, sourceLines, method}`);
  } else if (lc.totalLines > LIMITS.maxRepositoryLines) {
    errors.push(
      `${where}.lineCount.totalLines ${lc.totalLines} exceeds ${LIMITS.maxRepositoryLines}`,
    );
  }
  if (typeof repo.testDurationSeconds !== 'number' || !(repo.testDurationSeconds > 0)) {
    errors.push(`${where}.testDurationSeconds: must be a positive number`);
  }
  if (!isInt(repo.testsPassed) || repo.testsPassed === 0) {
    errors.push(`${where}.testsPassed: must be a positive integer`);
  }
  if (!deep) return;
  if (typeof repo.hasSddWorkspace !== 'boolean')
    errors.push(`${where}.hasSddWorkspace: must be a boolean`);
  if (!isString(repo.benchId)) errors.push(`${where}.benchId: must be a non-empty string`);
  if (!isString(repo.environmentFile)) {
    errors.push(`${where}.environmentFile: must be a non-empty string`);
    return;
  }
  const envPath = path.resolve(opts.repoRoot, repo.environmentFile);
  if (!existsSync(envPath)) {
    errors.push(`${where}.environmentFile: ${repo.environmentFile} does not exist`);
    return;
  }
  validateEnvironment(`${where}.environmentFile`, envPath, repo.benchId, errors);
}

/** Structural check of an environment description (bench/set/environments/<bench-id>.json). */
export function validateEnvironment(
  where: string,
  file: string,
  benchId: unknown,
  errors: string[],
): void {
  let env: unknown;
  try {
    env = JSON.parse(readFileSync(file, 'utf8'));
  } catch (err) {
    errors.push(`${where}: not valid JSON (${(err as Error).message})`);
    return;
  }
  if (!isObject(env)) {
    errors.push(`${where}: not an object`);
    return;
  }
  if (env.schema !== 'sdd-review-benchmark-environment/1')
    errors.push(`${where}.schema: unexpected`);
  if (env.benchId !== benchId)
    errors.push(`${where}.benchId: ${String(env.benchId)} != ${String(benchId)}`);
  const install = env.workingTreeInstall;
  if (
    !isObject(install) ||
    !Array.isArray(install.commands) ||
    !Array.isArray(install.ignoredPaths)
  ) {
    errors.push(`${where}.workingTreeInstall: needs commands[] and ignoredPaths[]`);
  }
  const ws = env.evidenceWorkspace;
  if (
    !isObject(ws) ||
    !Array.isArray(ws.ignoredPathsMadeAvailable) ||
    !Array.isArray(ws.preparationCommands)
  ) {
    errors.push(
      `${where}.evidenceWorkspace: needs ignoredPathsMadeAvailable[] and preparationCommands[]`,
    );
  }
  const active = env.activeEnvironment;
  if (!isObject(active) || !isString(active.description) || !isObject(active.variables)) {
    errors.push(`${where}.activeEnvironment: needs description and variables`);
  }
  const rules = env.isolationRules;
  if (
    !isObject(rules) ||
    rules.projectInstalledEditableFromWorkingTree !== false ||
    rules.projectInstalledAsCopy !== false ||
    rules.workingTreePathOnImportPath !== false
  ) {
    errors.push(
      `${where}.isolationRules: the three nfr.md section 0 rules must be recorded as false`,
    );
  }
  if (!isString(env.testCommand)) errors.push(`${where}.testCommand: must be a non-empty string`);
}

function git(checkout: string, ...args: string[]): string {
  return execFileSync('git', ['-C', checkout, ...args], {
    encoding: 'utf8',
    maxBuffer: 256 * 1024 * 1024,
  });
}

function validateChange(
  where: string,
  change: Json,
  refs: Json,
  frozen: boolean,
  errors: string[],
  warnings: string[],
  opts: ValidateOptions,
): void {
  const eco = change.ecosystem as string;
  const ref = isObject(refs[eco]) ? (refs[eco] as Json) : null;
  if (!(eco in ECOSYSTEMS))
    errors.push(`${where}.ecosystem: must be one of ${Object.keys(ECOSYSTEMS).join(', ')}`);
  else if (change.id !== ECOSYSTEMS[eco as Ecosystem])
    errors.push(`${where}.id: must be ${ECOSYSTEMS[eco as Ecosystem]}`);
  if (typeof change.hasSddWorkspace !== 'boolean')
    errors.push(`${where}.hasSddWorkspace: must be a boolean`);
  else if (ref && ref.hasSddWorkspace !== change.hasSddWorkspace) {
    errors.push(`${where}.hasSddWorkspace differs from references.${eco}.hasSddWorkspace`);
  }
  if (ref && ref.benchId !== change.id)
    errors.push(`${where}.id differs from references.${eco}.benchId`);

  const fields: Record<string, FieldCheck> = { ...CHANGE_FIELDS };
  for (const [key, check] of Object.entries(fields)) {
    if (!(key in change))
      errors.push(`${where}.${key}: field missing (null while the set is a draft)`);
    else if (change[key] === null) {
      if (frozen) errors.push(`${where}.${key}: null in a frozen set`);
    } else {
      const expected = check(change[key]);
      if (expected) errors.push(`${where}.${key}: must be ${expected}`);
    }
  }
  // The SDD change the agent worked from: set exactly when the change has an SDD workspace.
  if (!('sddChange' in change)) errors.push(`${where}.sddChange: field missing`);
  else if (change.hasSddWorkspace === true) {
    if (change.sddChange === null) {
      if (frozen) errors.push(`${where}.sddChange: null although the change has an SDD workspace`);
    } else {
      const expected = sddChange(change.sddChange);
      if (expected) errors.push(`${where}.sddChange: must be ${expected}`);
    }
  } else if (change.hasSddWorkspace === false && change.sddChange !== null) {
    errors.push(`${where}.sddChange: must be null for a change without an SDD workspace`);
  }

  if (Array.isArray(change.namedFiles) && namedFiles(change.namedFiles) === null) {
    const files = change.namedFiles as Array<{ role: string; path: string }>;
    const pr = files.filter((f) => f.role === 'pull-request-text');
    if (pr.length !== 1) errors.push(`${where}.namedFiles: exactly one pull-request-text file`);
    else if (isString(change.taskDescriptionFile) && pr[0].path !== change.taskDescriptionFile) {
      errors.push(`${where}.namedFiles: the pull-request-text file must be taskDescriptionFile`);
    }
  }
  if (
    isString(change.taskDescriptionFile) &&
    !existsSync(path.resolve(opts.repoRoot, change.taskDescriptionFile))
  ) {
    errors.push(`${where}.taskDescriptionFile: ${change.taskDescriptionFile} does not exist`);
  }
  if (!frozen) return;

  // Frozen: the size band, against the data of the change when the checkout is present.
  const inBand = (n: unknown, lo: number, hi: number) => isInt(n) && n >= lo && n <= hi;
  if (
    change.changedLines !== null &&
    !inBand(change.changedLines, LIMITS.minChangedLines, LIMITS.maxChangedLines)
  ) {
    errors.push(
      `${where}.changedLines: ${String(change.changedLines)} outside ${LIMITS.minChangedLines}-${LIMITS.maxChangedLines}`,
    );
  }
  if (
    change.changedFiles !== null &&
    !inBand(change.changedFiles, LIMITS.minChangedFiles, LIMITS.maxChangedFiles)
  ) {
    errors.push(
      `${where}.changedFiles: ${String(change.changedFiles)} outside ${LIMITS.minChangedFiles}-${LIMITS.maxChangedFiles}`,
    );
  }
  const loc = change.changeLocation;
  if (!opts.useGit || !isObject(loc) || !isString(loc.checkout)) return;
  if (!isString(change.baseCommit) || !isString(change.headCommit)) return;
  const checkout = path.resolve(opts.benchRoot, loc.checkout);
  if (!existsSync(checkout)) {
    warnings.push(
      `${where}: checkout ${checkout} is absent; the size band is not checked against git data`,
    );
    return;
  }
  try {
    const numstat = git(checkout, 'diff', '--numstat', change.baseCommit, change.headCommit)
      .split('\n')
      .filter((l) => l !== '');
    let lines = 0;
    for (const l of numstat) {
      const [added, deleted] = l.split('\t');
      lines += (added === '-' ? 0 : Number(added)) + (deleted === '-' ? 0 : Number(deleted));
    }
    if (!inBand(lines, LIMITS.minChangedLines, LIMITS.maxChangedLines)) {
      errors.push(
        `${where}: git data gives ${lines} changed lines, outside ${LIMITS.minChangedLines}-${LIMITS.maxChangedLines}`,
      );
    }
    if (!inBand(numstat.length, LIMITS.minChangedFiles, LIMITS.maxChangedFiles)) {
      errors.push(
        `${where}: git data gives ${numstat.length} changed files, outside ${LIMITS.minChangedFiles}-${LIMITS.maxChangedFiles}`,
      );
    }
    if (lines !== change.changedLines)
      errors.push(`${where}.changedLines ${String(change.changedLines)} != git data ${lines}`);
    if (numstat.length !== change.changedFiles)
      errors.push(
        `${where}.changedFiles ${String(change.changedFiles)} != git data ${numstat.length}`,
      );
    const range = new Set(
      git(checkout, 'rev-list', `${change.baseCommit}..${change.headCommit}`)
        .split('\n')
        .filter(Boolean),
    );
    for (const c of (change.agentCommits as string[] | null) ?? []) {
      if (!range.has(c)) errors.push(`${where}.agentCommits: ${c} is not in base..head`);
    }
  } catch (err) {
    errors.push(`${where}: git data unreadable (${(err as Error).message.split('\n')[0]})`);
  }
}

/** Validate a parsed benchmark-set.json. A draft is valid only while `frozen` is false. */
export function validateSet(set: unknown, opts: ValidateOptions): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (!isObject(set))
    return { frozen: false, errors: ['benchmark-set.json: not an object'], warnings };
  if (set.schema !== 'sdd-review-benchmark-set/1')
    errors.push('schema: must be sdd-review-benchmark-set/1');
  if (typeof set.frozen !== 'boolean') errors.push('frozen: must be a boolean');
  const frozen = set.frozen === true;
  if (frozen && !isString(set.frozenAt)) errors.push('frozenAt: a frozen set records its date');
  if (!frozen)
    warnings.push('the set is a draft (frozen: false): benchmark-change fields may be null');

  const refs = isObject(set.references) ? set.references : {};
  if (!isObject(set.references)) errors.push('references: missing');
  for (const eco of Object.keys(ECOSYSTEMS)) {
    validateRepository(`references.${eco}`, refs[eco], true, errors, opts);
    const r = refs[eco];
    if (isObject(r) && r.benchId !== ECOSYSTEMS[eco as Ecosystem]) {
      errors.push(`references.${eco}.benchId: must be ${ECOSYSTEMS[eco as Ecosystem]}`);
    }
  }
  validateRepository('outsideDeepEcosystems', set.outsideDeepEcosystems, false, errors, opts);

  const changes = Array.isArray(set.benchmarkChanges) ? set.benchmarkChanges : [];
  if (!Array.isArray(set.benchmarkChanges)) errors.push('benchmarkChanges: must be a list');
  for (const eco of Object.keys(ECOSYSTEMS)) {
    if (!changes.some((c) => isObject(c) && c.ecosystem === eco)) {
      errors.push(`benchmarkChanges: no change for ${eco}`);
    }
  }
  changes.forEach((c, i) => {
    if (!isObject(c)) errors.push(`benchmarkChanges[${i}]: not an object`);
    else
      validateChange(
        `benchmarkChanges[${i}] (${String(c.id)})`,
        c,
        refs,
        frozen,
        errors,
        warnings,
        opts,
      );
  });
  const flags = changes.filter(isObject).map((c) => c.hasSddWorkspace);
  if (!flags.includes(true))
    errors.push('benchmarkChanges: at least one change must have an SDD workspace');
  if (!flags.includes(false))
    errors.push('benchmarkChanges: at least one change must have no SDD workspace');

  if (frozen && opts.useGit) {
    for (const eco of Object.keys(ECOSYSTEMS)) {
      const r = refs[eco];
      if (!isObject(r) || !isString(r.localCheckout)) continue;
      const dir = path.resolve(opts.benchRoot, r.localCheckout);
      if (!existsSync(dir)) {
        warnings.push(
          `references.${eco}: checkout ${dir} is absent; the line count is not re-measured`,
        );
        continue;
      }
      const total = countRepositoryLines(dir).totalLines;
      if (total > LIMITS.maxRepositoryLines)
        errors.push(
          `references.${eco}: ${total} lines measured, over ${LIMITS.maxRepositoryLines}`,
        );
    }
  }
  return { frozen, errors, warnings };
}

/** Read and validate the set file. */
export function validateSetFile(file: string, opts: ValidateOptions): ValidationResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(file, 'utf8'));
  } catch (err) {
    return { frozen: false, errors: [`${file}: ${(err as Error).message}`], warnings: [] };
  }
  return validateSet(parsed, opts);
}
