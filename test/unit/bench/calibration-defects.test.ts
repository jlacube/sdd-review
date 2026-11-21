import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  countLines,
  DEFECT_KINDS,
  gitChangeSource,
  parseChangedLines,
  runDefectValidation,
  validateChangeDefects,
  type ChangeSource,
  type CorpusChange,
  type CorpusDefect,
} from '../../../bench/harness/calibration.js';

// Not imported from bench/harness/cli.ts: importing it runs the CLI. Same paths as cli.ts.
const repoRoot = fileURLToPath(new URL('../../../', import.meta.url));
const benchRoot = process.env.SDD_BENCH_ROOT ?? path.resolve(repoRoot, '..', 'sdd-bench');

const h = (c: string) => c.repeat(40);

function defect(n: number, over: Partial<CorpusDefect> = {}): CorpusDefect {
  return {
    id: `D${String(n).padStart(2, '0')}`,
    file: 'src/a.cs',
    lines: [n, n],
    kind: DEFECT_KINDS[n % DEFECT_KINDS.length]!,
    description: 'Something is wrong.',
    origin: 'seeded',
    testsCatchIt: false,
    ...over,
  };
}

function seededChange(over: Partial<CorpusChange> = {}): CorpusChange {
  return {
    id: 'calib-cs-1',
    ecosystem: 'csharp',
    repository: 'https://github.com/x/repo.git',
    baseCommit: h('a'),
    headCommit: h('b'),
    agentCommits: [h('c'), h('b')],
    changedLines: 3_000,
    taskDescriptionFile: 'tasks/one.md',
    testCommand: 'dotnet test',
    environmentFile: 'env/one.json',
    seedingCommit: h('d'),
    seededHeadCommit: h('d'),
    defects: [1, 2, 3, 4, 5, 6, 7, 8].map((n) => defect(n)),
    ...over,
  };
}

/** src/a.cs has 20 lines, lines 1 to 12 changed by the change. */
const source: ChangeSource = {
  lineCount: (file) => (file === 'src/a.cs' ? 20 : null),
  changedLines: (file) =>
    file === 'src/a.cs' ? new Set(Array.from({ length: 12 }, (_, i) => i + 1)) : new Set(),
};

describe('seeded defect validation', () => {
  it('accepts 8 seeded defects covering the six kinds and reports the coverage', () => {
    const { report, errors } = validateChangeDefects(seededChange(), source);
    expect(errors).toEqual([]);
    expect(report).toMatchObject({ seeded: 8, noticed: 0, checkedWith: 'git' });
    expect(Object.values(report.kinds).reduce((a, b) => a + b, 0)).toBe(8);
    expect(DEFECT_KINDS.every((k) => report.kinds[k] >= 1)).toBe(true);
  });

  it('rejects fewer than 8 seeded defects; noticed defects do not count', () => {
    const defects = [
      ...[1, 2, 3, 4, 5, 6, 7].map((n) => defect(n)),
      defect(8, { origin: 'noticed' }),
    ];
    const { report, errors } = validateChangeDefects(seededChange({ defects }), source);
    expect(report.noticed).toBe(1);
    expect(errors.join('\n')).toContain('7 seeded defects, at least 8 required');
  });

  it('rejects a change missing a kind', () => {
    const defects = [1, 2, 3, 4, 5, 6, 7, 8].map((n) =>
      defect(n, { kind: n === 6 ? 'security-weakness' : DEFECT_KINDS[n % 6]! }),
    );
    const errors = validateChangeDefects(seededChange({ defects }), source).errors;
    expect(errors.join('\n')).toContain(`no seeded defect of kind ${DEFECT_KINDS[0]}`);
  });

  it('rejects malformed records', () => {
    const defects = [
      ...[1, 2, 3, 4, 5, 6, 7, 8].map((n) => defect(n)),
      defect(9, { id: 'D01' }),
      defect(10, { kind: 'typo' }),
      defect(11, { lines: [5, 3] }),
      defect(12, { file: 'src\\a.cs' }),
      defect(13, { origin: 'other' as 'seeded' }),
      defect(14, { description: ' ' }),
      defect(15, { testsCatchIt: 'yes' as unknown as boolean }),
    ];
    const errors = validateChangeDefects(seededChange({ defects }), null).errors.join('\n');
    expect(errors).toContain('D01: duplicate id');
    expect(errors).toContain('kind "typo"');
    expect(errors).toContain('D11: lines must be');
    expect(errors).toContain('not a repository-relative path');
    expect(errors).toContain('origin must be seeded or noticed');
    expect(errors).toContain('description is missing');
    expect(errors).toContain('testsCatchIt must be');
  });

  it('checks files and lines against the change when a source is given', () => {
    const defects = [
      ...[1, 2, 3, 4, 5, 6, 7, 8].map((n) => defect(n)),
      defect(9, { file: 'src/missing.cs' }),
      defect(10, { lines: [18, 25] }),
      defect(11, { lines: [11, 14] }),
    ];
    const errors = validateChangeDefects(seededChange({ defects }), source).errors.join('\n');
    expect(errors).toContain('src/missing.cs does not exist at the seeded head');
    expect(errors).toContain('beyond the 20 lines');
    expect(errors).toContain('line(s) 13, 14 not changed by the change');
    // Structural mode cannot see these.
    expect(validateChangeDefects(seededChange({ defects }), null).errors).toEqual([]);
  });

  it('requires the seeded head to be the seeding commit, outside agentCommits', () => {
    const errors = validateChangeDefects(
      seededChange({ seededHeadCommit: h('e'), agentCommits: [h('d'), h('b')] }),
      null,
    ).errors.join('\n');
    expect(errors).toContain('seededHeadCommit is not the seeding commit');
    expect(errors).toContain('listed among agentCommits');
  });
});

describe('changed lines from git diff -U0', () => {
  it('reads new-side ranges, single lines and pure deletions', () => {
    const diff = [
      'diff --git a/x.py b/x.py',
      '--- a/x.py',
      '+++ b/x.py',
      '@@ -1,2 +1,3 @@',
      '@@ -10 +11 @@ def f():',
      '@@ -20,2 +21,0 @@',
      'diff --git a/gone.py b/gone.py',
      '--- a/gone.py',
      '+++ /dev/null',
      '@@ -1,4 +0,0 @@',
      'diff --git a/new.py b/new.py',
      '--- /dev/null',
      '+++ b/new.py',
      '@@ -0,0 +1,2 @@',
    ].join('\n');
    const lines = parseChangedLines(diff);
    expect([...lines.get('x.py')!].sort((a, b) => a - b)).toEqual([1, 2, 3, 11, 21, 22]);
    expect(lines.has('gone.py')).toBe(false);
    expect([...lines.get('new.py')!]).toEqual([1, 2]);
  });

  it('counts lines with and without a final newline', () => {
    expect(countLines('')).toBe(0);
    expect(countLines('a\nb\n')).toBe(2);
    expect(countLines('a\nb')).toBe(2);
  });
});

describe('git source', () => {
  let dir = '';
  const run = (...args: string[]) =>
    execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8' }).trim();
  const commit = (message: string) => {
    run('add', '-A');
    run('-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-q', '-m', message);
    return run('rev-parse', 'HEAD');
  };
  let base = '';
  let head = '';
  let seeding = '';

  beforeAll(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'calib-defects-'));
    run('init', '-q');
    run('config', 'core.autocrlf', 'false');
    writeFileSync(path.join(dir, 'old.txt'), 'one\ntwo\nthree\nfour\n');
    base = commit('base');
    writeFileSync(path.join(dir, 'old.txt'), 'one\nTWO\nthree\nfour\n');
    writeFileSync(path.join(dir, 'new.txt'), 'a\nb\nc\n');
    head = commit('agent');
    writeFileSync(path.join(dir, 'new.txt'), 'a\nB\nc\n');
    seeding = commit('seeding');
  });
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  it('reads the files at the seeded head and the lines changed since the base', () => {
    const change = seededChange({
      baseCommit: base,
      headCommit: head,
      agentCommits: [head],
      seedingCommit: seeding,
      seededHeadCommit: seeding,
    });
    const src = gitChangeSource(dir, change);
    expect(src.lineCount('new.txt')).toBe(3);
    expect(src.lineCount('absent.txt')).toBeNull();
    expect([...src.changedLines('old.txt')]).toEqual([2]);
    expect([...src.changedLines('new.txt')]).toEqual([1, 2, 3]);
  });

  it('rejects a seeding commit that is not directly on the head', () => {
    const change = seededChange({
      baseCommit: base,
      headCommit: base,
      agentCommits: [base],
      seedingCommit: seeding,
      seededHeadCommit: seeding,
    });
    expect(() => gitChangeSource(dir, change)).toThrow('not headCommit');
  });
});

describe('committed corpus', () => {
  it('passes the defect validation (git when the clones are present)', () => {
    const result = runDefectValidation(repoRoot, benchRoot);
    expect(result.errors).toEqual([]);
    expect(result.reports.length + result.pending.length).toBeGreaterThanOrEqual(12);
  });
});
