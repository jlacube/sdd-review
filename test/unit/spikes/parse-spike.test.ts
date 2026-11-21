import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { GitAdapter } from '../../../src/core/git/operations.js';
import { GitProcessRunner } from '../../../src/core/git/process.js';
import { GitAccessChecker } from '../../../src/core/git/program-check.js';
import {
  attributeBatched,
  attributeVersions,
  attributeWithAdapter,
  chainFor,
  parseRangeLog,
} from '../../../spikes/parse/attribution.js';
import {
  evaluate,
  MEMORY_LIMIT_BYTES,
  TIME_LIMIT_MS,
  verdictWord,
} from '../../../spikes/parse/pass-condition.js';
import {
  IdentifierIndex,
  identifiersOf,
  renameCandidates,
  renameSearchSet,
} from '../../../spikes/parse/rename-set.js';
import { phaseTotals } from '../../../spikes/parse/run-once.js';
import { parseSpikeArgs } from '../../../spikes/parse/runner.js';

const GiB = 1024 * 1024 * 1024;
const ok = (wallClockMs: number, peakResidentBytes: number) => ({
  wallClockMs,
  peakResidentBytes,
  ok: true,
});

describe('parse spike: pass condition', () => {
  it('uses the limits of the task: 60 s and 1 GiB, 5 runs', () => {
    expect(TIME_LIMIT_MS).toBe(60_000);
    expect(MEMORY_LIMIT_BYTES).toBe(GiB);
  });

  it('passes when the maxima of 5 runs are within both limits, with the margins', () => {
    const v = evaluate([ok(30_000, 0.5 * GiB), ok(45_000, 0.25 * GiB), ...Array(3).fill(ok(1, 1))]);
    expect(v.pass).toBe(true);
    expect(verdictWord(v)).toBe('pass');
    expect(v.maxWallClockMs).toBe(45_000);
    expect(v.timeMarginMs).toBe(15_000);
    expect(v.timeMarginPct).toBe(25);
    expect(v.maxPeakResidentBytes).toBe(0.5 * GiB);
    expect(v.memoryMarginPct).toBe(50);
  });

  it('counts the limits as inclusive', () => {
    expect(evaluate(Array(5).fill(ok(60_000, GiB))).pass).toBe(true);
  });

  it('misses when one run is over one limit, with a negative margin', () => {
    const time = evaluate([...Array(4).fill(ok(10_000, 1)), ok(60_001, 1)]);
    expect(time.pass).toBe(false);
    expect(time.timePass).toBe(false);
    expect(time.memoryPass).toBe(true);
    expect(time.timeMarginMs).toBe(-1);
    expect(verdictWord(time)).toBe('miss');
    const memory = evaluate([...Array(4).fill(ok(1, 1)), ok(1, GiB + 1)]);
    expect(memory.memoryPass).toBe(false);
    expect(memory.memoryMarginBytes).toBe(-1);
    expect(verdictWord(memory)).toBe('miss');
  });

  it('never passes a failed run, and reports too few runs as incomplete', () => {
    const failed = evaluate([...Array(4).fill(ok(1, 1)), { ...ok(1, 1), ok: false }]);
    expect(failed.failedRuns).toBe(1);
    expect(verdictWord(failed)).toBe('miss');
    const few = evaluate([ok(1, 1)]);
    expect(few.withinLimits).toBe(true);
    expect(few.pass).toBe(false);
    expect(verdictWord(few)).toBe('incomplete');
    expect(() => evaluate([])).toThrow();
  });
});

describe('parse spike: phase totals', () => {
  it('sums phases by prefix', () => {
    expect(
      phaseTotals([
        { name: 'parse-setup', ms: 500 },
        { name: 'git-g07', ms: 100 },
        { name: 'git-g09', ms: 50.04 },
        { name: 'parse-changed', ms: 10 },
        { name: 'extract-changed', ms: 5 },
        { name: 'shutdown', ms: 1 },
      ]),
    ).toEqual({ git: 150, parse: 510, extract: 5, other: 1, work: 666 });
  });
});

describe('parse spike: rename search set', () => {
  it('finds the unchanged snapshot files that mention an old or a new name', () => {
    expect([...identifiersOf('a.b_c($x) + 2y')].sort()).toEqual(['$x', 'a', 'b_c', 'y']);
    const index = new IdentifierIndex();
    index.add('src/a.ts', 'export function newName() {}');
    index.add('src/user.ts', 'import { oldName } from "./a"; oldName();');
    index.add('src/other.ts', 'const unrelated = 1;');
    index.add('src/late.ts', 'newName()');
    expect(index.fileCount).toBe(4);
    const c = renameCandidates(
      {
        symbols: [
          { kind: 'function', name: 'oldName', row: 0 },
          { kind: 'class', name: 'K', row: 1 },
        ],
      },
      {
        symbols: [
          { kind: 'function', name: 'newName', row: 0 },
          { kind: 'class', name: 'K', row: 1 },
        ],
      },
    );
    expect(c).toEqual({ oldNames: ['oldName'], newNames: ['newName'] });
    expect(renameSearchSet(index, [...c.oldNames, ...c.newNames], new Set(['src/a.ts']))).toEqual([
      'src/late.ts',
      'src/user.ts',
    ]);
    expect(renameCandidates(null, null)).toEqual({ oldNames: [], newNames: [] });
  });
});

describe('parse spike: batched G-09, pure parts', () => {
  const log =
    '\x01c1\0\nM\0a.ts\0A\0b.ts\0' + '\x01c2\0\nR087\0a.ts\0x/a2.ts\0' + '\x01c3\0\nD\0b.ts\0';

  it('parses the range log, renames included', () => {
    expect(parseRangeLog(log)).toEqual([
      {
        hash: 'c1',
        entries: [
          { status: 'M', path: 'a.ts', from: null },
          { status: 'A', path: 'b.ts', from: null },
        ],
      },
      { hash: 'c2', entries: [{ status: 'R', path: 'x/a2.ts', from: 'a.ts' }] },
      { hash: 'c3', entries: [{ status: 'D', path: 'b.ts', from: null }] },
    ]);
  });

  it('follows a file back through a rename to its base path', () => {
    const commits = parseRangeLog(log);
    expect(chainFor('x/a2.ts', commits)).toEqual({
      basePath: 'a.ts',
      steps: [
        { hash: 'c1', status: 'M', path: 'a.ts' },
        { hash: 'c2', status: 'R', path: 'x/a2.ts' },
      ],
    });
    expect(chainFor('b.ts', commits)).toEqual({
      basePath: null,
      steps: [
        { hash: 'c1', status: 'A', path: 'b.ts' },
        { hash: 'c3', status: 'D', path: 'b.ts' },
      ],
    });
    expect(chainFor('untouched.ts', commits)).toEqual({ basePath: 'untouched.ts', steps: [] });
  });

  it('attributes added and deleted lines to the version that made them', () => {
    const b = (s: string) => Buffer.from(s);
    const r = attributeVersions(b('one\ntwo\n'), [
      { by: 'c1', bytes: b('one\ntwo\nthree\n') },
      { by: null, bytes: b('one\nthree\nfour\n') },
    ]);
    expect(r).toEqual({ added: ['c1', null], deleted: [null] });
    expect(attributeVersions(b('a\0b'), [{ by: null, bytes: b('c') }])).toEqual({
      added: [],
      deleted: [],
    });
  });
});

describe('parse spike: batched G-09 equals the adapter on a repository', () => {
  let dir: string;
  let base: string;
  const adapter = new GitAdapter();
  const env = {
    ...process.env,
    GIT_AUTHOR_NAME: 'T',
    GIT_AUTHOR_EMAIL: 't@example.test',
    GIT_COMMITTER_NAME: 'T',
    GIT_COMMITTER_EMAIL: 't@example.test',
  };
  const git = (...args: string[]) =>
    execFileSync('git', args, { cwd: dir, env, encoding: 'utf8' }).trim();
  const write = (p: string, s: string) => {
    mkdirSync(path.dirname(path.join(dir, p)), { recursive: true });
    writeFileSync(path.join(dir, p), s);
  };

  beforeAll(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'sdd-parse-spike-g09-'));
    git('init', '-q');
    git('config', 'core.autocrlf', 'false');
    write('a.ts', 'export const a = 1;\nexport const b = 2;\nexport const c = 3;\n');
    write('b.py', 'def f():\n    return 1\n');
    write('gone.cs', 'class Gone {}\n');
    git('add', '-A');
    git('commit', '-qm', 'base');
    base = git('rev-parse', 'HEAD');
    write('a.ts', 'export const a = 1;\nexport const b = 20;\nexport const c = 3;\n');
    write('new.ts', 'export const n = 1;\n');
    git('add', '-A');
    git('commit', '-qm', 'one');
    mkdirSync(path.join(dir, 'src'));
    git('mv', 'a.ts', 'src/a.ts');
    git('rm', '-q', 'gone.cs');
    git('commit', '-qm', 'two');
    write('b.py', 'def f():\n    return 2\n');
  });
  afterAll(async () => {
    await adapter.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it('gives the same totals with one git log as with one adapter call per file', async () => {
    const location = await adapter.discover(dir);
    const head = git('rev-parse', 'HEAD');
    const files = (await adapter.changeAgainst(base)).filter((f) => !f.binary);
    expect(files.map((f) => f.path)).toEqual(['b.py', 'gone.cs', 'new.ts', 'src/a.ts']);
    const program = await new GitAccessChecker().program(dir);
    const runner = new GitProcessRunner({ gitPath: program.path });
    const rangeLog = async () =>
      (
        await runner.run(
          'log',
          ['--reverse', '-M', '-z', '--name-status', '--format=%x01%H', `${base}..${head}`],
          { target: { gitDir: location.gitDir, workTree: location.workTreeRoot } },
        )
      ).stdout.toString('utf8');
    const batched = await attributeBatched(adapter, rangeLog, base, files);
    const perFile = await attributeWithAdapter(adapter, base, head, files, 2);
    expect({ ...batched, gitSpawns: 0 }).toEqual({ ...perFile, gitSpawns: 0 });
    expect(batched).toMatchObject({
      files: 4,
      addedLines: 3,
      deletedLines: 3,
      uncommittedLines: 2,
    });
  });
});

describe('parse spike: runner arguments', () => {
  it('reads a hand-named repository with defaults of 5 runs', () => {
    const { targets, options } = parseSpikeArgs(
      ['--repo', '.', '--base', 'abc', '--workers', '3', '--g09', 'adapter'],
      'unused',
      'unused',
    );
    expect(targets).toEqual([
      { id: 'custom', repo: path.resolve('.'), base: 'abc', head: 'HEAD', ref: null },
    ]);
    expect(options).toMatchObject({ runs: 5, workers: 3, heapMb: 256, g09: 'adapter' });
  });

  it('resolves benchmark changes from the frozen set', () => {
    const { targets } = parseSpikeArgs(
      ['all', '--runs', '1'],
      path.resolve('bench', 'set', 'benchmark-set.json'),
      path.resolve('..', 'sdd-bench'),
    );
    expect(targets.map((t) => t.id)).toEqual(['bench-ts', 'bench-py', 'bench-cs']);
    expect(targets[0]!.repo).toBe(path.resolve('..', 'sdd-bench', 'ref', 'class-validator'));
  });

  it('refuses unknown options, bad numbers and unknown changes', () => {
    const set = path.resolve('bench', 'set', 'benchmark-set.json');
    expect(() => parseSpikeArgs(['bench-ts', '--cold', 'x'], set, '.')).toThrow(/unknown option/);
    expect(() => parseSpikeArgs(['bench-ts', '--runs', '0'], set, '.')).toThrow(/positive/);
    expect(() => parseSpikeArgs(['bench-zz'], set, '.')).toThrow(/unknown benchmark change/);
    expect(() => parseSpikeArgs([], set, '.')).toThrow(/name a benchmark change/);
  });
});
