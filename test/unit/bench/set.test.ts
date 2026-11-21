import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { licenceIsPermissive, validateSet, validateSetFile } from '../../../bench/harness/set.js';

const repoRoot = path.resolve('.');
const setFile = path.join(repoRoot, 'bench', 'set', 'benchmark-set.json');
type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const CHANGE_FIELDS = [
  'sddChange',
  'baseCommit',
  'headCommit',
  'agentCommits',
  'changeLocation',
  'changedLines',
  'changedFiles',
  'taskDescriptionFile',
  'namedFiles',
  'intake',
];
/** The committed set turned back into a draft: not frozen, every benchmark-change field null. */
const draft = (): Json => {
  const set = JSON.parse(readFileSync(setFile, 'utf8'));
  set.frozen = false;
  set.frozenAt = null;
  for (const change of set.benchmarkChanges) for (const f of CHANGE_FIELDS) change[f] = null;
  return set;
};
const check = (set: unknown, benchRoot = tmpdir(), useGit = false) =>
  validateSet(set, { repoRoot, benchRoot, useGit });

let bench: string;
let base = '';
let head = '';
let agentCommits: string[] = [];

function git(dir: string, ...args: string[]): string {
  return execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8' }).trim();
}

/** A repository whose base..head change adds `files` files of `linesEach` lines. */
function makeChange(dir: string, files: number, linesEach: number): void {
  mkdirSync(dir, { recursive: true });
  git(dir, 'init', '-q');
  git(dir, 'config', 'user.email', 'bench@example.invalid');
  git(dir, 'config', 'user.name', 'bench');
  git(dir, 'config', 'commit.gpgsign', 'false');
  git(dir, 'config', 'core.autocrlf', 'false');
  writeFileSync(path.join(dir, 'seed.txt'), 'seed\n');
  git(dir, 'add', '.');
  git(dir, 'commit', '-q', '-m', 'base');
  base = git(dir, 'rev-parse', 'HEAD');
  agentCommits = [];
  for (let half = 0; half < 2; half++) {
    for (let i = half * (files / 2); i < (half + 1) * (files / 2); i++) {
      writeFileSync(path.join(dir, `f${i}.txt`), 'line\n'.repeat(linesEach));
    }
    git(dir, 'add', '.');
    git(dir, 'commit', '-q', '-m', `agent ${half}`);
    agentCommits.push(git(dir, 'rev-parse', 'HEAD'));
  }
  head = git(dir, 'rev-parse', 'HEAD');
}

function frozenSet(checkout: string): Json {
  const set = draft();
  set.frozen = true;
  set.frozenAt = '2026-11-20';
  set.benchmarkChanges.forEach((c: Json, i: number) => {
    c.baseCommit = base;
    c.headCommit = head;
    c.agentCommits = agentCommits;
    c.changeLocation = { checkout, ref: 'main' };
    c.changedLines = 9360;
    c.changedFiles = 260;
    c.taskDescriptionFile = 'package.json';
    c.namedFiles = [{ role: 'pull-request-text', path: 'package.json' }];
    c.intake = { reviewArguments: ['--base', base] };
    c.sddChange = c.hasSddWorkspace ? { id: 'CHG-900', path: '.sdd/900-x' } : null;
    void i;
  });
  return set;
}

beforeAll(() => {
  bench = mkdtempSync(path.join(tmpdir(), 'sdd-bench-set-'));
  makeChange(path.join(bench, 'ref', 'change'), 260, 36);
});
afterAll(() => rmSync(bench, { recursive: true, force: true }));

describe('benchmark-set.json as committed', () => {
  it('is a valid draft (frozen: false) or a valid frozen set', () => {
    const result = validateSetFile(setFile, {
      repoRoot,
      benchRoot: path.join(repoRoot, '..', 'sdd-bench'),
    });
    expect(result.errors).toEqual([]);
  });

  it('keeps the shape that the fixture builder reads: references.<ecosystem>.{repository, commit}', () => {
    const set = draft();
    for (const eco of ['typescript', 'python', 'csharp']) {
      expect(typeof set.references[eco].repository).toBe('string');
      expect(set.references[eco].commit).toMatch(/^[0-9a-f]{40}$/);
    }
  });

  it('has one change per deep ecosystem, with and without an SDD workspace', () => {
    const flags = draft().benchmarkChanges.map((c: Json) => [c.id, c.hasSddWorkspace]);
    expect(flags).toEqual([
      ['bench-ts', true],
      ['bench-py', false],
      ['bench-cs', false],
    ]);
  });
});

describe('draft mode', () => {
  it('allows null benchmark-change fields while frozen is false', () => {
    const result = check(draft());
    expect(result.frozen).toBe(false);
    expect(result.errors).toEqual([]);
  });

  it('rejects null benchmark-change fields once frozen is true', () => {
    const set = draft();
    set.frozen = true;
    set.frozenAt = '2026-11-20';
    const result = check(set);
    expect(result.errors.some((e) => e.includes('baseCommit: null in a frozen set'))).toBe(true);
    expect(result.errors.some((e) => e.includes('intake: null in a frozen set'))).toBe(true);
  });

  it('requires the frozen flag to be a boolean', () => {
    const set = draft();
    delete set.frozen;
    expect(check(set).errors).toContain('frozen: must be a boolean');
  });
});

describe('structure of the references', () => {
  it('rejects a repository over 500,000 lines', () => {
    const set = draft();
    set.references.python.lineCount.totalLines = 500_001;
    expect(check(set).errors.join('\n')).toContain('exceeds 500000');
  });

  it('rejects a non-permissive licence, and accepts the permissive ones', () => {
    const set = draft();
    set.references.typescript.licence = 'GPL-3.0-only';
    expect(check(set).errors.join('\n')).toContain('references.typescript.licence');
    expect(licenceIsPermissive('MIT')).toBe(true);
    expect(licenceIsPermissive('MIT OR Apache-2.0')).toBe(true);
    expect(licenceIsPermissive('Apache-2.0')).toBe(true);
    expect(licenceIsPermissive('BSD-3-Clause')).toBe(true);
    for (const bad of [
      'GPL-3.0-only',
      'LGPL-2.1',
      'AGPL-3.0',
      'MPL-2.0',
      'SSPL-1.0',
      'MIT AND GPL-2.0',
      'Proprietary',
    ]) {
      expect(licenceIsPermissive(bad)).toBe(false);
    }
  });

  it('rejects a commit that is not a 40-hex id and a missing environment file', () => {
    const set = draft();
    set.references.csharp.commit = 'main';
    set.references.python.environmentFile = 'bench/set/environments/nope.json';
    const errors = check(set).errors.join('\n');
    expect(errors).toContain('references.csharp.commit');
    expect(errors).toContain(
      'references.python.environmentFile: bench/set/environments/nope.json does not exist',
    );
  });

  it('requires one change with and one without an SDD workspace', () => {
    const set = draft();
    set.references.typescript.hasSddWorkspace = false;
    set.benchmarkChanges[0].hasSddWorkspace = false;
    expect(check(set).errors).toContain(
      'benchmarkChanges: at least one change must have an SDD workspace',
    );
    const set2 = draft();
    set2.references.python.hasSddWorkspace = true;
    set2.references.csharp.hasSddWorkspace = true;
    set2.benchmarkChanges[1].hasSddWorkspace = true;
    set2.benchmarkChanges[2].hasSddWorkspace = true;
    expect(check(set2).errors).toContain(
      'benchmarkChanges: at least one change must have no SDD workspace',
    );
  });

  it('requires the outside-ecosystem repository', () => {
    const set = draft();
    delete set.outsideDeepEcosystems;
    expect(check(set).errors.join('\n')).toContain('outsideDeepEcosystems');
  });
});

describe('frozen mode against git data', () => {
  it('accepts a change of 9,360 lines over 260 files', () => {
    const set = frozenSet('ref/change');
    const result = check(set, bench, true);
    expect(result.errors).toEqual([]);
    expect(result.frozen).toBe(true);
  });

  it('rejects a recorded size that differs from the git data', () => {
    const set = frozenSet('ref/change');
    set.benchmarkChanges[0].changedLines = 9400;
    expect(check(set, bench, true).errors.join('\n')).toContain(
      'changedLines 9400 != git data 9360',
    );
  });

  it('rejects a change outside the size band, from the git data', () => {
    const small = path.join(bench, 'ref', 'small');
    const savedBase = base;
    const savedHead = head;
    const savedCommits = agentCommits;
    makeChange(small, 20, 30);
    const set = frozenSet('ref/small');
    set.benchmarkChanges.forEach((c: Json) => {
      c.changedLines = 600;
      c.changedFiles = 20;
    });
    const errors = check(set, bench, true).errors.join('\n');
    expect(errors).toContain('outside 9000-10000');
    expect(errors).toContain('outside 250-300');
    base = savedBase;
    head = savedHead;
    agentCommits = savedCommits;
  });

  it('rejects recorded sizes outside the band even without the checkout', () => {
    const set = frozenSet('ref/absent');
    set.benchmarkChanges[1].changedLines = 8999;
    set.benchmarkChanges[2].changedFiles = 301;
    const result = check(set, bench, true);
    expect(result.errors.join('\n')).toContain('changedLines: 8999 outside 9000-10000');
    expect(result.errors.join('\n')).toContain('changedFiles: 301 outside 250-300');
    expect(result.warnings.join('\n')).toContain('is absent');
  });

  it('rejects an agent commit that is not between base and head', () => {
    const set = frozenSet('ref/change');
    set.benchmarkChanges[0].agentCommits = [base];
    expect(check(set, bench, true).errors.join('\n')).toContain('is not in base..head');
  });

  it('requires an SDD change exactly for the change with an SDD workspace', () => {
    const set = frozenSet('ref/change');
    set.benchmarkChanges[0].sddChange = null;
    set.benchmarkChanges[1].sddChange = { id: 'CHG-1', path: '.sdd/x' };
    const errors = check(set, bench, true).errors.join('\n');
    expect(errors).toContain('although the change has an SDD workspace');
    expect(errors).toContain('must be null for a change without an SDD workspace');
  });

  it('names no file other than the pull-request text, agent plan and transcript', () => {
    const set = frozenSet('ref/change');
    set.benchmarkChanges[0].namedFiles = [
      { role: 'pull-request-text', path: 'package.json' },
      { role: 'source-file', path: 'x.ts' },
    ];
    expect(check(set, bench, true).errors.join('\n')).toContain('namedFiles');
  });
});
