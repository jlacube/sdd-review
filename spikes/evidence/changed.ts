// Spike C001-T-020 (spike-grade, never shipped): pure helpers over the snapshot's hunks and the
// per-test coverage that the prototype adapters produce. C001-T-057 to C001-T-065 replace them.
import type { Hunk } from '../../src/generated/analysis-results.js';

export type SpikeEcosystem = 'typescript-javascript' | 'python' | 'csharp-dotnet' | 'other';

const TS_JS = /\.(?:[cm]?[jt]s|[jt]sx)$/i;

/** The deep ecosystem of a path by its extension (C001-T-036 assigns it in the product). */
export function ecosystemOfPath(path: string): SpikeEcosystem {
  if (path.endsWith('.d.ts')) return 'other';
  if (TS_JS.test(path)) return 'typescript-javascript';
  if (/\.py$/i.test(path)) return 'python';
  if (/\.cs$/i.test(path)) return 'csharp-dotnet';
  return 'other';
}

/**
 * Whether a path is a test file, by naming convention. Spike stand-in for `Hunk.isTestHunk`
 * (C001-T-054): test files get per-test coverage but are not mutated.
 */
export function isTestPath(path: string): boolean {
  const p = path.replace(/\\/g, '/');
  const base = p.slice(p.lastIndexOf('/') + 1);
  return (
    /(^|\/)(tests?|__tests__|spec|specs)\//i.test(p) ||
    /\.(test|spec)\.[cm]?[jt]sx?$/i.test(base) ||
    /^test_.*\.py$|_test\.py$|^conftest\.py$/i.test(base) ||
    /Tests?\.cs$/.test(base) ||
    /(^|\/)[^/]*\.Tests?\//.test(p)
  );
}

/** Added line numbers (snapshot side) per path, sorted. */
export function addedLinesByFile(hunks: readonly Hunk[]): Map<string, number[]> {
  const out = new Map<string, number[]>();
  for (const h of hunks) {
    const lines = out.get(h.path) ?? [];
    for (const l of h.lines)
      if (l.kind === 'added' && l.newNumber !== undefined) lines.push(l.newNumber);
    out.set(h.path, lines);
  }
  for (const [p, lines] of out)
    out.set(
      p,
      [...new Set(lines)].sort((a, b) => a - b),
    );
  return out;
}

/** Sorted, disjoint inclusive ranges of consecutive numbers. */
export function toRanges(lines: Iterable<number>): Array<[number, number]> {
  const sorted = [...new Set(lines)].sort((a, b) => a - b);
  const out: Array<[number, number]> = [];
  for (const n of sorted) {
    const last = out[out.length - 1];
    if (last && n === last[1] + 1) last[1] = n;
    else out.push([n, n]);
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// Per-test coverage, common to the three prototype adapters

export type TestOutcome = 'passed' | 'failed' | 'skipped';

export interface SpikeTest {
  readonly testId: string;
  readonly outcome: TestOutcome;
  /** Duration in milliseconds when the adapter reports it. */
  readonly durationMs?: number;
  readonly failureMessage?: string;
}

export interface PerTestCoverage {
  readonly ecosystem: SpikeEcosystem;
  readonly tests: readonly SpikeTest[];
  /** Repository path → line → IDs of the tests that executed it. */
  readonly lines: ReadonlyMap<string, ReadonlyMap<number, readonly string[]>>;
  /** Snapshot files executed from outside the workspace (load monitor; ERR-EVID-008/011). */
  readonly loadedOutside: readonly string[];
  /** The interpreter that ran the tests (Python), mapped by the mutation runner. */
  readonly interpreter?: string;
}

/** Merges per-test coverage of several processes or ecosystems. */
export function mergeCoverage(parts: readonly PerTestCoverage[]): PerTestCoverage {
  const tests = new Map<string, SpikeTest>();
  const lines = new Map<string, Map<number, Set<string>>>();
  const outside = new Set<string>();
  let interpreter: string | undefined;
  for (const part of parts) {
    for (const t of part.tests) {
      const prev = tests.get(t.testId);
      // A test reported twice (a theory's rows, a retry) fails when one report failed.
      if (!prev || t.outcome === 'failed') tests.set(t.testId, t);
    }
    for (const [path, byLine] of part.lines) {
      const target = lines.get(path) ?? new Map<number, Set<string>>();
      for (const [line, ids] of byLine) {
        const set = target.get(line) ?? new Set<string>();
        for (const id of ids) set.add(id);
        target.set(line, set);
      }
      lines.set(path, target);
    }
    for (const f of part.loadedOutside) outside.add(f);
    interpreter ??= part.interpreter;
  }
  return {
    ecosystem: parts[0]?.ecosystem ?? 'other',
    tests: [...tests.values()],
    lines: new Map(
      [...lines].map(([p, m]) => [p, new Map([...m].map(([l, s]) => [l, [...s].sort()]))]),
    ),
    loadedOutside: [...outside].sort(),
    interpreter,
  };
}

/** Per path, the added lines that at least one passing test executed. */
export function executedChangedLines(
  added: ReadonlyMap<string, readonly number[]>,
  coverage: PerTestCoverage,
): Map<string, number[]> {
  const passing = new Set(
    coverage.tests.filter((t) => t.outcome === 'passed').map((t) => t.testId),
  );
  const out = new Map<string, number[]>();
  for (const [path, lines] of added) {
    const byLine = coverage.lines.get(path);
    if (!byLine) continue;
    const hit = lines.filter((l) => (byLine.get(l) ?? []).some((id) => passing.has(id)));
    if (hit.length > 0) out.set(path, hit);
  }
  return out;
}

/** The passing tests that executed `line` of `path`. */
export function coveringPassingTests(
  coverage: PerTestCoverage,
  path: string,
  line: number,
): string[] {
  const passing = new Set(
    coverage.tests.filter((t) => t.outcome === 'passed').map((t) => t.testId),
  );
  return (coverage.lines.get(path)?.get(line) ?? []).filter((id) => passing.has(id));
}

/** Summary counts for a report: tests by outcome, changed files and lines with per-test data. */
export function coverageSummary(
  added: ReadonlyMap<string, readonly number[]>,
  coverage: PerTestCoverage,
): {
  tests: Record<TestOutcome, number>;
  changedFiles: number;
  changedFilesWithData: number;
  addedLines: number;
  addedLinesExecutedByPassingTests: number;
} {
  const tests: Record<TestOutcome, number> = { passed: 0, failed: 0, skipped: 0 };
  for (const t of coverage.tests) tests[t.outcome]++;
  const executed = executedChangedLines(added, coverage);
  let addedLines = 0;
  for (const l of added.values()) addedLines += l.length;
  let hit = 0;
  for (const l of executed.values()) hit += l.length;
  return {
    tests,
    changedFiles: added.size,
    changedFilesWithData: [...added.keys()].filter((p) => coverage.lines.has(p)).length,
    addedLines,
    addedLinesExecutedByPassingTests: hit,
  };
}

// ---------------------------------------------------------------------------------------------
// Mutation targets: risk order and the two tiers (C001-ADR-007 §1 "Risk order")

export interface MutationHunk {
  readonly hunkId: string;
  readonly path: string;
  readonly firstLine: number;
  /** The hunk's added lines executed by passing tests. */
  readonly lines: readonly number[];
  /** Risk score; the spike has no C001-COMP-010 yet and uses the hunk's changed lines. */
  readonly risk: number;
}

/** Hunks of non-test deep-ecosystem files of `ecosystem` with executed changed lines. */
export function mutationHunks(
  hunks: readonly Hunk[],
  executed: ReadonlyMap<string, readonly number[]>,
  ecosystem: SpikeEcosystem,
): MutationHunk[] {
  const out: MutationHunk[] = [];
  for (const h of hunks) {
    if (ecosystemOfPath(h.path) !== ecosystem || isTestPath(h.path)) continue;
    const hit = new Set(executed.get(h.path) ?? []);
    const lines = h.lines
      .filter((l) => l.kind === 'added' && l.newNumber !== undefined && hit.has(l.newNumber))
      .map((l) => l.newNumber!);
    if (lines.length === 0) continue;
    out.push({
      hunkId: h.hunkId,
      path: h.path,
      firstLine: h.newStart,
      lines,
      risk: h.changedLines,
    });
  }
  return riskOrder(out);
}

/** Descending risk, ties by path and first line (C001-TS-539). */
export function riskOrder<T extends { risk: number; path: string; firstLine: number }>(
  hunks: readonly T[],
): T[] {
  return [...hunks].sort(
    (a, b) =>
      b.risk - a.risk ||
      (a.path < b.path ? -1 : a.path > b.path ? 1 : 0) ||
      a.firstLine - b.firstLine,
  );
}

/**
 * The two tiers: the riskiest hunks holding the first 25 % of the candidate mutants, then the
 * rest. `estimate` gives a hunk's candidate mutant count (by default its executed lines).
 */
export function twoTiers<T extends MutationHunk>(
  ordered: readonly T[],
  estimate: (h: T) => number = (h) => h.lines.length,
): [T[], T[]] {
  const total = ordered.reduce((s, h) => s + estimate(h), 0);
  const first: T[] = [];
  let acc = 0;
  for (const h of ordered) {
    if (first.length > 0 && acc >= total * 0.25) break;
    first.push(h);
    acc += estimate(h);
  }
  return [first, ordered.slice(first.length)];
}

/** Line ranges per path of a tier, merged. */
export function tierRanges(tier: readonly MutationHunk[]): Map<string, Array<[number, number]>> {
  const lines = new Map<string, number[]>();
  for (const h of tier) lines.set(h.path, [...(lines.get(h.path) ?? []), ...h.lines]);
  return new Map([...lines].map(([p, l]) => [p, toRanges(l)]));
}

/** The hunk holding `line` of `path`, or null. */
export function hunkOfLine(
  hunks: readonly MutationHunk[],
  path: string,
  line: number,
): MutationHunk | null {
  return hunks.find((h) => h.path === path && h.lines.includes(line)) ?? null;
}
