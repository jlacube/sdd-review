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
