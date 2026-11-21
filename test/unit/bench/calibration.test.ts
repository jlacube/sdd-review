import { describe, expect, it } from 'vitest';
import {
  checkOverlap,
  poolChanges,
  repositoryKey,
  runCalibrationCheck,
  taskDigest,
  validateCorpus,
  type CorpusChange,
  type OtherChange,
} from '../../../bench/harness/calibration.js';
import { fileURLToPath } from 'node:url';

// Not imported from bench/harness/cli.ts: importing it runs the CLI.
const repoRoot = fileURLToPath(new URL('../../../', import.meta.url));

const h = (c: string) => c.repeat(40);

function change(over: Partial<CorpusChange> = {}): CorpusChange {
  return {
    id: 'calib-ts-1',
    ecosystem: 'typescript',
    repository: 'https://github.com/x/repo.git',
    baseCommit: h('a'),
    headCommit: h('b'),
    agentCommits: [h('c'), h('b')],
    changedLines: 3_000,
    taskDescriptionFile: 'tasks/one.md',
    testCommand: 'npm test',
    environmentFile: 'env/one.json',
    ...over,
  };
}

function other(over: Partial<OtherChange> = {}): OtherChange {
  return {
    source: 'benchmark set',
    id: 'bench-ts',
    repository: 'https://github.com/x/repo',
    baseCommit: h('d'),
    headCommit: h('e'),
    agentCommits: [h('f'), h('e')],
    taskDescriptionFile: 'tasks/bench.md',
    ...over,
  };
}

const texts: Record<string, string> = {
  'tasks/one.md': '# One\r\nfeature one\r\n',
  'tasks/bench.md': '# Bench\nanother feature\n',
  'tasks/copy.md': '# One\nfeature one\n',
};
const read = (rel: string) => texts[rel] ?? null;

describe('overlap check', () => {
  it('passes for disjoint changes', () => {
    expect(checkOverlap([change()], [other()], read).errors).toEqual([]);
  });

  it('fails on the same commit range in the same repository', () => {
    const errors = checkOverlap(
      [change()],
      [other({ baseCommit: h('a'), headCommit: h('b') })],
      read,
    ).errors;
    expect(errors.join()).toContain('same commit range');
  });

  it('fails on a shared agent commit', () => {
    const errors = checkOverlap([change()], [other({ agentCommits: [h('c')] })], read).errors;
    expect(errors.join()).toContain('agent commit(s) in common');
  });

  it('ignores commit coincidences in another repository', () => {
    const errors = checkOverlap(
      [change()],
      [other({ repository: 'https://github.com/y/other', agentCommits: [h('c')] })],
      read,
    ).errors;
    expect(errors).toEqual([]);
  });

  it('fails on the same task description file or the same text', () => {
    expect(
      checkOverlap(
        [change()],
        [other({ taskDescriptionFile: 'tasks/one.md' })],
        read,
      ).errors.join(),
    ).toContain('same task description file');
    expect(
      checkOverlap(
        [change()],
        [other({ taskDescriptionFile: 'tasks/copy.md' })],
        read,
      ).errors.join(),
    ).toContain('same task description text');
  });

  it('normalises repositories and task text', () => {
    expect(repositoryKey('https://GitHub.com/X/Repo.git/')).toBe(
      repositoryKey('https://github.com/x/repo'),
    );
    expect(taskDigest('a\r\nb\n')).toBe(taskDigest('a\nb'));
  });

  it('reads the G-8 pool record when it exists', () => {
    expect(poolChanges(null)).toEqual([]);
    expect(poolChanges({ changes: [{ id: 'A', repository: 'r' }] })[0]).toMatchObject({
      source: 'G-8 pool',
      id: 'A',
    });
  });
});

describe('corpus validation', () => {
  const twelve = ['typescript', 'python', 'csharp'].flatMap((eco) =>
    [1, 2, 3, 4].map((n) =>
      change({
        id: `${eco}-${n}`,
        ecosystem: eco,
        taskDescriptionFile: 'package.json',
        environmentFile: 'package.json',
      }),
    ),
  );

  it('accepts 12 changes, 4 per deep ecosystem, in the size band', () => {
    expect(validateCorpus(twelve, repoRoot).errors).toEqual([]);
  });

  it('rejects too few changes per ecosystem and sizes outside the band', () => {
    const errors = validateCorpus(
      [{ ...twelve[0]!, id: 'x', changedLines: 1_999 }, ...twelve.slice(2)],
      repoRoot,
    ).errors.join('\n');
    expect(errors).toContain('at least 12 required');
    expect(errors).toContain('outside 2000 to 10000');
  });

  it('rejects a record whose last agent commit is not the head', () => {
    const errors = validateCorpus([{ ...twelve[0]!, agentCommits: [h('c')] }], repoRoot).errors;
    expect(errors.join()).toContain('last agent commit is not headCommit');
  });
});

describe('committed corpus', () => {
  it('passes the overlap check against the frozen benchmark set', () => {
    const result = runCalibrationCheck(repoRoot);
    expect(result.errors).toEqual([]);
    expect(result.changes).toBeGreaterThanOrEqual(12);
    expect(result.checkedAgainst).toBeGreaterThanOrEqual(3);
  });
});
