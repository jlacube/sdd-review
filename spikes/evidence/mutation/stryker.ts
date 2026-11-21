// Spike C001-T-020 (spike-grade): the parts of the StrykerJS and Stryker.NET runs that are pure —
// configuration from the tiers, Stryker.NET character spans (licence report D-012), and the
// conversion of the mutation-testing report to MutationResult (C001-ADR-007 §1 "Results").
// C001-T-062 replaces this.
import path from 'node:path';
import type { MutationResult } from '../../../src/generated/analysis-results.js';
import { hunkOfLine, type MutationHunk } from '../changed.js';

// ---------------------------------------------------------------------------------------------
// StrykerJS

export interface StrykerJsConfigInput {
  /** Repository path → line ranges of the tier. */
  readonly ranges: ReadonlyMap<string, ReadonlyArray<readonly [number, number]>>;
  readonly concurrency: number;
  /** Absolute path of the JSON report to write. */
  readonly jsonReport: string;
  /** Plugin module names or absolute paths (the runner plugin). */
  readonly plugins: readonly string[];
  readonly testRunner: 'jest' | 'vitest' | 'mocha' | 'tap';
}

/** `mutate` entries with line ranges (StrykerJS 4.6.0 and later, licence report S-02). */
export function strykerJsMutate(
  ranges: ReadonlyMap<string, ReadonlyArray<readonly [number, number]>>,
): string[] {
  const out: string[] = [];
  for (const [p, rs] of [...ranges].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) {
    for (const [s, e] of rs) out.push(`${p}:${s}-${e}`);
  }
  return out;
}

/** The StrykerJS configuration of one tier, written to `<workspace>.aux/` (C001-ADR-007 §3). */
export function strykerJsConfig(input: StrykerJsConfigInput): Record<string, unknown> {
  return {
    $schema: './node_modules/@stryker-mutator/core/schema/stryker-schema.json',
    testRunner: input.testRunner,
    plugins: [...input.plugins],
    coverageAnalysis: 'perTest',
    mutate: strykerJsMutate(input.ranges),
    inPlace: true,
    incremental: false,
    concurrency: input.concurrency,
    reporters: ['json', 'progress'],
    jsonReporter: { fileName: input.jsonReport.split(path.sep).join('/') },
    cleanTempDir: 'always',
    disableTypeChecks: true,
    timeoutMS: 10000,
    logLevel: 'info',
  };
}

// ---------------------------------------------------------------------------------------------
// Stryker.NET

/**
 * Line ranges as Stryker.NET character spans `{first..last}` (licence report M-04, D-012): the
 * index of the first character of the first line through the index of the last character of
 * the last line, in UTF-16 code units of the decoded text without a byte-order mark.
 */
export function lineRangesToCharSpans(
  text: string,
  ranges: ReadonlyArray<readonly [number, number]>,
): Array<[number, number]> {
  const body = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const starts = [0];
  for (let i = 0; i < body.length; i++) if (body[i] === '\n') starts.push(i + 1);
  const lineEnd = (line: number) => {
    // Last character of the line, excluding its line ending.
    const next = line < starts.length ? starts[line]! - 1 : body.length;
    let end = next - 1;
    if (end >= 0 && body[end] === '\r') end--;
    return Math.max(end, starts[line - 1]!);
  };
  const out: Array<[number, number]> = [];
  for (const [s, e] of ranges) {
    if (s < 1 || s > starts.length) continue;
    const last = Math.min(e, starts.length);
    out.push([starts[s - 1]!, lineEnd(last)]);
  }
  return out;
}

export interface StrykerNetConfigInput {
  /** Project under test, as Stryker.NET's `project` option. */
  readonly project: string;
  /** Test projects, relative to the directory Stryker.NET runs in. */
  readonly testProjects: readonly string[];
  /** Mutate patterns with spans, e.g. `**\/Validators/X.cs{120..480}`. */
  readonly mutate: readonly string[];
  readonly concurrency: number;
  readonly targetFramework: string | null;
}

/** `mutate` patterns: the path relative to the project directory, with each span. */
export function strykerNetMutate(
  relativeToProject: string,
  spans: ReadonlyArray<readonly [number, number]>,
): string[] {
  const p = relativeToProject.split(path.sep).join('/');
  return spans.map(([s, e]) => `**/${p}{${s}..${e}}`);
}

/** The Stryker.NET configuration file of one tier (C001-ADR-007 §3). */
export function strykerNetConfig(input: StrykerNetConfigInput): Record<string, unknown> {
  const config: Record<string, unknown> = {
    project: input.project,
    'test-projects': [...input.testProjects],
    mutate: [...input.mutate],
    'coverage-analysis': 'perTest',
    concurrency: input.concurrency,
    reporters: ['json', 'progress'],
    'disable-bail': false,
  };
  if (input.targetFramework) config['target-framework'] = input.targetFramework;
  return { 'stryker-config': config };
}

// ---------------------------------------------------------------------------------------------
// Report conversion

interface ReportMutant {
  readonly id?: string;
  readonly mutatorName?: string;
  readonly replacement?: string;
  readonly status: string;
  readonly location: { readonly start: { readonly line: number; readonly column?: number } };
}

export interface MutationTestingReport {
  readonly files: Readonly<Record<string, { readonly mutants: readonly ReportMutant[] }>>;
}

type Outcome = 'killed' | 'survived' | 'no-coverage' | 'timeout' | 'error';

const STATUS: Readonly<Record<string, Outcome>> = {
  Killed: 'killed',
  Survived: 'survived',
  NoCoverage: 'no-coverage',
  Timeout: 'timeout',
  CompileError: 'error',
  RuntimeError: 'error',
};

/** A report file key as a repository path (StrykerJS writes relative, Stryker.NET absolute). */
export function reportPath(key: string, workspaceRoot: string): string {
  const k = key.replace(/\\/g, '/');
  const root = workspaceRoot.replace(/\\/g, '/').replace(/\/+$/, '');
  const abs = /^[A-Za-z]:\//.test(k) || k.startsWith('/');
  if (!abs) return k.replace(/^\.\//, '');
  const lowerK = k.toLowerCase();
  const lowerRoot = `${root.toLowerCase()}/`;
  return lowerK.startsWith(lowerRoot) ? k.slice(lowerRoot.length) : k;
}

/**
 * MutationResult entries from a mutation-testing report: Killed → killed, Survived → survived,
 * NoCoverage → no-coverage, Timeout → timeout, CompileError and RuntimeError → error; Ignored and
 * Pending are dropped. Only mutants on a line of a target hunk are kept.
 */
export function convertReport(
  report: MutationTestingReport,
  hunks: readonly MutationHunk[],
  workspaceRoot: string,
): MutationResult[] {
  const out: MutationResult[] = [];
  for (const [key, file] of Object.entries(report.files ?? {})) {
    const p = reportPath(key, workspaceRoot);
    for (const m of file.mutants ?? []) {
      const outcome = STATUS[m.status];
      if (!outcome) continue;
      const line = m.location.start.line;
      const hunk = hunkOfLine(hunks, p, line);
      if (!hunk) continue;
      out.push({
        hunkId: hunk.hunkId,
        line,
        mutation: m.replacement ?? m.mutatorName ?? '?',
        outcome,
      });
    }
  }
  return out;
}

/** Hunks of a tier that got no result: unavailable with `reason` (C001-REQ-516). */
export function unavailableFor(
  tier: readonly MutationHunk[],
  results: readonly MutationResult[],
  reason: string,
): MutationResult[] {
  const seen = new Set(results.map((r) => r.hunkId));
  return tier
    .filter((h) => !seen.has(h.hunkId))
    .map((h) => ({ hunkId: h.hunkId, unavailable: reason }));
}
