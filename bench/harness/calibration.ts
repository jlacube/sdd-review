import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

/**
 * Calibration corpus of C001-ADR-009 §4 item 1 (C001-T-106): at least 12 agent changes, 4 per deep
 * ecosystem, 2,000 to 10,000 changed lines each, none sharing a commit range or a task description
 * with the benchmark set or the G-8 pool.
 */

export const CORPUS_LIMITS = {
  minChanges: 12,
  minPerEcosystem: 4,
  minChangedLines: 2_000,
  maxChangedLines: 10_000,
} as const;

export const DEEP_ECOSYSTEMS = ['typescript', 'python', 'csharp'] as const;

export interface CorpusChange {
  id: string;
  ecosystem: string;
  repository: string;
  baseCommit: string;
  headCommit: string;
  agentCommits: string[];
  changedLines: number;
  taskDescriptionFile: string;
  testCommand: string;
  environmentFile: string;
  /** Directory of the clone under the bench root (`ref/<name>`). */
  localCheckout?: string;
  /** C001-T-107/T-108: the commit holding the seeded defects, directly on top of headCommit. */
  seedingCommit?: string;
  /** C001-T-107/T-108: the head after seeding (the seeding commit: one commit per change). */
  seededHeadCommit?: string;
  defects?: CorpusDefect[];
}

/** A change of another set (benchmark set, G-8 pool) that the corpus must not overlap. */
export interface OtherChange {
  source: string;
  id: string;
  repository: string;
  baseCommit: string | null;
  headCommit: string | null;
  agentCommits: string[] | null;
  taskDescriptionFile: string | null;
}

export interface CorpusCheck {
  errors: string[];
}

const HEX40 = /^[0-9a-f]{40}$/;

/** Normalised repository identity: a clone URL with or without `.git` and case is the same repository. */
export function repositoryKey(url: string): string {
  return url
    .trim()
    .toLowerCase()
    .replace(/\/+$/, '')
    .replace(/\.git$/, '');
}

/** Hash of a task description, ignoring line endings and surrounding whitespace. */
export function taskDigest(text: string): string {
  return createHash('sha256').update(text.replace(/\r\n/g, '\n').trim()).digest('hex');
}

/** Structural checks of the corpus (sizes, counts per ecosystem, required fields). */
export function validateCorpus(changes: CorpusChange[], repoRoot: string): CorpusCheck {
  const errors: string[] = [];
  if (changes.length < CORPUS_LIMITS.minChanges) {
    errors.push(`corpus: ${changes.length} changes, at least ${CORPUS_LIMITS.minChanges} required`);
  }
  for (const eco of DEEP_ECOSYSTEMS) {
    const n = changes.filter((c) => c.ecosystem === eco).length;
    if (n < CORPUS_LIMITS.minPerEcosystem) {
      errors.push(
        `corpus: ${n} ${eco} changes, at least ${CORPUS_LIMITS.minPerEcosystem} required`,
      );
    }
  }
  const ids = new Set<string>();
  for (const c of changes) {
    if (ids.has(c.id)) errors.push(`${c.id}: duplicate id`);
    ids.add(c.id);
    if (!HEX40.test(c.baseCommit ?? '')) errors.push(`${c.id}: baseCommit is not a commit hash`);
    if (!HEX40.test(c.headCommit ?? '')) errors.push(`${c.id}: headCommit is not a commit hash`);
    if (!Array.isArray(c.agentCommits) || c.agentCommits.length === 0) {
      errors.push(`${c.id}: agentCommits is empty`);
    } else if (c.agentCommits[c.agentCommits.length - 1] !== c.headCommit) {
      errors.push(`${c.id}: the last agent commit is not headCommit`);
    }
    if (!(
      c.changedLines >= CORPUS_LIMITS.minChangedLines &&
      c.changedLines <= CORPUS_LIMITS.maxChangedLines
    )) {
      errors.push(
        `${c.id}: ${c.changedLines} changed lines, outside ${CORPUS_LIMITS.minChangedLines} to ${CORPUS_LIMITS.maxChangedLines}`,
      );
    }
    if (!c.testCommand) errors.push(`${c.id}: testCommand is missing`);
    for (const [field, rel] of [
      ['taskDescriptionFile', c.taskDescriptionFile],
      ['environmentFile', c.environmentFile],
    ] as const) {
      if (!rel || !existsSync(path.join(repoRoot, rel))) {
        errors.push(`${c.id}: ${field} "${rel}" does not exist`);
      }
    }
  }
  return { errors };
}

/**
 * Fails when a corpus change shares a commit range or a task description with another set: the
 * same repository and the same base or head commit, any agent commit in common, or a task
 * description with the same file or the same text.
 */
export function checkOverlap(
  changes: CorpusChange[],
  others: OtherChange[],
  readText: (rel: string) => string | null,
): CorpusCheck {
  const errors: string[] = [];
  const digestOf = (rel: string | null): string | null => {
    if (!rel) return null;
    const text = readText(rel);
    return text === null ? null : taskDigest(text);
  };
  for (const c of changes) {
    const cDigest = digestOf(c.taskDescriptionFile);
    const cCommits = new Set(c.agentCommits);
    for (const o of others) {
      const where = `${c.id} and ${o.source} ${o.id}`;
      if (repositoryKey(c.repository) === repositoryKey(o.repository)) {
        if (o.baseCommit && o.baseCommit === c.baseCommit && o.headCommit === c.headCommit) {
          errors.push(`${where}: same commit range ${c.baseCommit}..${c.headCommit}`);
        } else if (o.headCommit && o.headCommit === c.headCommit) {
          errors.push(`${where}: same head commit ${c.headCommit}`);
        }
        const shared = (o.agentCommits ?? []).filter((h) => cCommits.has(h));
        if (shared.length > 0) {
          errors.push(`${where}: ${shared.length} agent commit(s) in common (${shared[0]})`);
        }
      }
      if (o.taskDescriptionFile && o.taskDescriptionFile === c.taskDescriptionFile) {
        errors.push(`${where}: same task description file ${c.taskDescriptionFile}`);
      } else {
        const oDigest = digestOf(o.taskDescriptionFile);
        if (cDigest && oDigest && cDigest === oDigest) {
          errors.push(`${where}: same task description text`);
        }
      }
    }
  }
  return { errors };
}

interface BenchmarkSetFile {
  references: Record<string, { repository: string }>;
  benchmarkChanges: Array<{
    id: string;
    ecosystem: string;
    baseCommit: string | null;
    headCommit: string | null;
    agentCommits: string[] | null;
    taskDescriptionFile: string | null;
  }>;
}

/** The benchmark changes of bench/set/benchmark-set.json as overlap candidates. */
export function benchmarkChanges(set: BenchmarkSetFile): OtherChange[] {
  return set.benchmarkChanges.map((b) => ({
    source: 'benchmark set',
    id: b.id,
    repository: set.references[b.ecosystem]?.repository ?? '',
    baseCommit: b.baseCommit,
    headCommit: b.headCommit,
    agentCommits: b.agentCommits,
    taskDescriptionFile: b.taskDescriptionFile,
  }));
}

/** The G-8 pool record `study/g8/pool.json` (C001-T-110) as overlap candidates, once it exists. */
export function poolChanges(pool: unknown): OtherChange[] {
  const entries = (pool as { changes?: unknown[] } | null)?.changes;
  if (!Array.isArray(entries)) return [];
  return entries.map((raw, i) => {
    const e = raw as Partial<OtherChange> & { id?: string };
    return {
      source: 'G-8 pool',
      id: e.id ?? `#${i + 1}`,
      repository: e.repository ?? '',
      baseCommit: e.baseCommit ?? null,
      headCommit: e.headCommit ?? null,
      agentCommits: e.agentCommits ?? null,
      taskDescriptionFile: e.taskDescriptionFile ?? null,
    };
  });
}

export interface CalibrationRunResult {
  changes: number;
  checkedAgainst: number;
  poolPresent: boolean;
  errors: string[];
}

/** `npm run bench -- calibration --check-overlap` */
export function runCalibrationCheck(repoRoot: string): CalibrationRunResult {
  const read = (rel: string): string | null => {
    const file = path.join(repoRoot, rel);
    return existsSync(file) ? readFileSync(file, 'utf8') : null;
  };
  const corpus = JSON.parse(read('bench/calibration/corpus.json') ?? '{"changes":[]}') as {
    changes: CorpusChange[];
  };
  const set = JSON.parse(read('bench/set/benchmark-set.json') ?? 'null') as BenchmarkSetFile;
  const poolText = read('study/g8/pool.json');
  const others = [...benchmarkChanges(set), ...poolChanges(poolText ? JSON.parse(poolText) : null)];
  const errors = [
    ...validateCorpus(corpus.changes, repoRoot).errors,
    ...checkOverlap(corpus.changes, others, read).errors,
  ];
  return {
    changes: corpus.changes.length,
    checkedAgainst: others.length,
    poolPresent: poolText !== null,
    errors,
  };
}

/** The six kinds of seeded defects of `30-nfr/nfr.md` §3 item 3, in its order. */
export const DEFECT_KINDS = [
  'wrong-logic',
  'unrequested-behaviour',
  'missing-requested-behaviour',
  'architecture-violation',
  'test-not-checking-subject',
  'security-weakness',
] as const;

export type DefectKind = (typeof DEFECT_KINDS)[number];

/** At least 8 seeded defects per seeded change (C001-ADR-009 §4 item 1). */
export const MIN_SEEDED_DEFECTS = 8;

/** A seeded or noticed defect; lines are 1-based and inclusive, in the seeded head version. */
export interface CorpusDefect {
  id: string;
  file: string;
  lines: [number, number];
  kind: string;
  description: string;
  origin: 'seeded' | 'noticed';
  testsCatchIt: boolean | null;
}

/** The files of a change at its seeded head and the lines the change touches. */
export interface ChangeSource {
  /** Number of lines of the file at the seeded head, or null when the file does not exist there. */
  lineCount(file: string): number | null;
  /**
   * New-side lines changed by the change (base..seeded head: agent commits and seeding commit) in
   * the file. A pure deletion counts the lines on both sides of the point where lines were removed.
   */
  changedLines(file: string): Set<number>;
}

export interface ChangeDefectReport {
  id: string;
  /** `git` when files and lines were checked against the clone, else `structural`. */
  checkedWith: 'git' | 'structural';
  seeded: number;
  noticed: number;
  /** Seeded defects per kind. */
  kinds: Record<DefectKind, number>;
}

export interface DefectValidation {
  reports: ChangeDefectReport[];
  /** Changes without seededHeadCommit (not seeded yet). */
  pending: string[];
  errors: string[];
  warnings: string[];
}

const isPositiveInt = (n: unknown): n is number => Number.isInteger(n) && (n as number) >= 1;

function isRepositoryPath(file: unknown): file is string {
  return (
    typeof file === 'string' &&
    file !== '' &&
    !file.includes('\\') &&
    !file.startsWith('/') &&
    !/^[A-Za-z]:/.test(file) &&
    !file.split('/').includes('..')
  );
}

/**
 * Validates the recorded defects of one seeded change: at least 8 seeded defects covering the six
 * kinds and well-formed records; with a source, each file present at the seeded head and its lines
 * inside the file and inside lines the change touches.
 */
export function validateChangeDefects(
  change: CorpusChange,
  source: ChangeSource | null,
): { report: ChangeDefectReport; errors: string[] } {
  const errors: string[] = [];
  const where = change.id;
  const kinds = Object.fromEntries(DEFECT_KINDS.map((k) => [k, 0])) as Record<DefectKind, number>;
  const defects = Array.isArray(change.defects) ? change.defects : [];
  if (!Array.isArray(change.defects)) errors.push(`${where}: defects is missing`);
  if (!HEX40.test(change.seedingCommit ?? '')) {
    errors.push(`${where}: seedingCommit is not a commit hash`);
  }
  if (!HEX40.test(change.seededHeadCommit ?? '')) {
    errors.push(`${where}: seededHeadCommit is not a commit hash`);
  } else if (change.seedingCommit !== change.seededHeadCommit) {
    errors.push(`${where}: seededHeadCommit is not the seeding commit (one commit per change)`);
  }
  if (change.seedingCommit && (change.agentCommits ?? []).includes(change.seedingCommit)) {
    errors.push(`${where}: the seeding commit is listed among agentCommits`);
  }

  const ids = new Set<string>();
  let seeded = 0;
  let noticed = 0;
  for (const [i, d] of defects.entries()) {
    const named = typeof d?.id === 'string' && d.id !== '';
    const at = `${where} defect ${named ? d.id : `#${i + 1}`}`;
    if (!named) errors.push(`${at}: id is missing`);
    else if (ids.has(d.id)) errors.push(`${at}: duplicate id`);
    else ids.add(d.id);
    if (d.origin === 'seeded') seeded++;
    else if (d.origin === 'noticed') noticed++;
    else errors.push(`${at}: origin must be seeded or noticed`);
    if ((DEFECT_KINDS as readonly string[]).includes(d.kind)) {
      if (d.origin === 'seeded') kinds[d.kind as DefectKind]++;
    } else {
      errors.push(`${at}: kind "${String(d.kind)}" is not one of ${DEFECT_KINDS.join(', ')}`);
    }
    if (typeof d.description !== 'string' || d.description.trim() === '') {
      errors.push(`${at}: description is missing`);
    }
    if (!(d.testsCatchIt === true || d.testsCatchIt === false || d.testsCatchIt === null)) {
      errors.push(`${at}: testsCatchIt must be true, false or null`);
    }
    const fileOk = isRepositoryPath(d.file);
    if (!fileOk) errors.push(`${at}: file "${String(d.file)}" is not a repository-relative path`);
    const lines = d.lines;
    const linesOk =
      Array.isArray(lines) &&
      lines.length === 2 &&
      isPositiveInt(lines[0]) &&
      isPositiveInt(lines[1]) &&
      lines[0] <= lines[1];
    if (!linesOk) errors.push(`${at}: lines must be [start, end] with 1 <= start <= end`);
    if (!source || !fileOk || !linesOk) continue;
    const count = source.lineCount(d.file);
    if (count === null) {
      errors.push(`${at}: ${d.file} does not exist at the seeded head`);
      continue;
    }
    if (lines[1] > count) {
      errors.push(`${at}: lines ${lines[0]}-${lines[1]} beyond the ${count} lines of ${d.file}`);
      continue;
    }
    const changed = source.changedLines(d.file);
    const outside: number[] = [];
    for (let n = lines[0]; n <= lines[1]; n++) if (!changed.has(n)) outside.push(n);
    if (outside.length > 0) {
      const shown = outside.slice(0, 5).join(', ') + (outside.length > 5 ? ', ...' : '');
      errors.push(`${at}: ${d.file} line(s) ${shown} not changed by the change`);
    }
  }
  if (seeded < MIN_SEEDED_DEFECTS) {
    errors.push(`${where}: ${seeded} seeded defects, at least ${MIN_SEEDED_DEFECTS} required`);
  }
  const missing = DEFECT_KINDS.filter((k) => kinds[k] === 0);
  if (missing.length > 0) errors.push(`${where}: no seeded defect of kind ${missing.join(', ')}`);
  return {
    report: { id: where, checkedWith: source ? 'git' : 'structural', seeded, noticed, kinds },
    errors,
  };
}

/**
 * New-side changed lines per file from the output of `git diff -U0`. A hunk `+c,0` (a pure deletion
 * after line c) counts lines c and c + 1.
 */
export function parseChangedLines(diff: string): Map<string, Set<number>> {
  const out = new Map<string, Set<number>>();
  let current: Set<number> | null = null;
  for (const raw of diff.split('\n')) {
    const line = raw.replace(/\r$/, '');
    if (line.startsWith('+++ ')) {
      const target = line.slice(4);
      if (target === '/dev/null') {
        current = null;
        continue;
      }
      const file = target.replace(/^"?b\//, '').replace(/"$/, '');
      current = out.get(file) ?? new Set<number>();
      out.set(file, current);
      continue;
    }
    const m = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/.exec(line);
    if (!m || !current) continue;
    const start = Number(m[1]);
    const count = m[2] === undefined ? 1 : Number(m[2]);
    if (count === 0) {
      if (start >= 1) current.add(start);
      current.add(start + 1);
    } else {
      for (let n = start; n < start + count; n++) current.add(n);
    }
  }
  return out;
}

function git(checkout: string, ...args: string[]): string {
  return execFileSync('git', ['-C', checkout, ...args], {
    encoding: 'utf8',
    maxBuffer: 256 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

/** Number of lines of a text (a last line without a newline counts). */
export function countLines(text: string): number {
  if (text === '') return 0;
  return text.split('\n').length - (text.endsWith('\n') ? 1 : 0);
}

/**
 * A ChangeSource read from a clone, after checking that the seeding commit sits directly on
 * headCommit. Throws when the clone lacks the commits.
 */
export function gitChangeSource(checkout: string, change: CorpusChange): ChangeSource {
  const head = change.seededHeadCommit ?? '';
  const parent = git(checkout, 'rev-parse', `${change.seedingCommit ?? ''}^`).trim();
  if (parent !== change.headCommit) {
    throw new Error(`the parent of seedingCommit is ${parent}, not headCommit`);
  }
  const changed = parseChangedLines(
    git(checkout, 'diff', '-U0', '--no-color', '--no-ext-diff', change.baseCommit, head),
  );
  const counts = new Map<string, number | null>();
  return {
    lineCount(file) {
      if (!counts.has(file)) {
        let n: number | null;
        try {
          n = countLines(git(checkout, 'show', `${head}:${file}`));
        } catch {
          n = null;
        }
        counts.set(file, n);
      }
      return counts.get(file) ?? null;
    },
    changedLines: (file) => changed.get(file) ?? new Set<number>(),
  };
}

/**
 * `npm run bench -- calibration --validate-corpus`: the recorded defects of each change that lists
 * seededHeadCommit, against its clone under benchRoot when present, structurally otherwise.
 */
export function runDefectValidation(repoRoot: string, benchRoot: string): DefectValidation {
  const corpus = JSON.parse(
    readFileSync(path.join(repoRoot, 'bench', 'calibration', 'corpus.json'), 'utf8'),
  ) as { seeder?: unknown; changes: CorpusChange[] };
  const result: DefectValidation = { reports: [], pending: [], errors: [], warnings: [] };
  const anySeeded = corpus.changes.some((c) => c.seededHeadCommit !== undefined);
  if (anySeeded && (typeof corpus.seeder !== 'string' || corpus.seeder.trim() === '')) {
    result.errors.push('corpus: the seeder is not named');
  }
  for (const change of corpus.changes) {
    if (change.seededHeadCommit === undefined) {
      if (Array.isArray(change.defects) && change.defects.length > 0) {
        result.errors.push(`${change.id}: defects are listed but seededHeadCommit is missing`);
      }
      result.pending.push(change.id);
      continue;
    }
    let source: ChangeSource | null = null;
    const checkout = change.localCheckout ? path.resolve(benchRoot, change.localCheckout) : null;
    if (!checkout || !existsSync(checkout)) {
      result.warnings.push(
        `${change.id}: clone ${checkout ?? '(no localCheckout)'} is absent; structural checks only`,
      );
    } else if (HEX40.test(change.seededHeadCommit) && HEX40.test(change.seedingCommit ?? '')) {
      try {
        source = gitChangeSource(checkout, change);
      } catch (err) {
        const message = (err as Error).message.split('\n')[0];
        result.errors.push(`${change.id}: git data unreadable (${message})`);
      }
    }
    const { report, errors } = validateChangeDefects(change, source);
    result.reports.push(report);
    result.errors.push(...errors);
  }
  return result;
}
