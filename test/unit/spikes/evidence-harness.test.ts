// Unit tests of the pure parts of the C001-T-020 spike harness (spikes/evidence/).
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Hunk } from '../../../src/generated/analysis-results.js';
import { bundleCommands } from '../../../spikes/evidence/bundle/bundle.js';
import {
  addedLinesByFile,
  coverageSummary,
  ecosystemOfPath,
  executedChangedLines,
  isTestPath,
  mergeCoverage,
  mutationHunks,
  riskOrder,
  tierRanges,
  toRanges,
  twoTiers,
  type MutationHunk,
  type PerTestCoverage,
} from '../../../spikes/evidence/changed.js';
import { projectNames } from '../../../spikes/evidence/coverage/inject.js';
import {
  readDotnetResults,
  readNodeLines,
  readPythonResult,
  readTrx,
  relativeTo,
  trackedMethodTestId,
} from '../../../spikes/evidence/coverage/readers.js';
import { evidenceDocument } from '../../../spikes/evidence/documents.js';
import {
  coveredFiles,
  g15Unchanged,
  parseLfsPointer,
} from '../../../spikes/evidence/filtered/covered.js';
import {
  mutantTimeoutMs,
  pytestOutcome,
  pytestPluginArgs,
  recordablePrefix,
} from '../../../spikes/evidence/mutation/python-plan.js';
import {
  convertReport,
  lineRangesToCharSpans,
  reportPath,
  strykerJsConfig,
  strykerJsMutate,
  strykerNetMutate,
  unavailableFor,
} from '../../../spikes/evidence/mutation/stryker.js';
import { parseSpikeEvidenceArgs } from '../../../spikes/evidence/runner.js';
import { developerEnvironment, type SpikeTarget } from '../../../spikes/evidence/session.js';
import { substituteCheckout } from '../../../spikes/evidence/tools.js';
import { fixtureBytes, fileName } from '../../../bench/fixtures/w6-filtered/build.js';

const hunk = (id: string, p: string, added: number[], extra: Partial<Hunk> = {}): Hunk => ({
  hunkId: id,
  contentKey: 'k',
  path: p,
  oldStart: 1,
  oldLines: 0,
  newStart: added[0] ?? 1,
  newLines: added.length,
  changedLines: added.length,
  lines: added.map((n) => ({ kind: 'added', text: `line ${n}`, newNumber: n })) as Hunk['lines'],
  commits: [],
  uncommitted: false,
  isTestHunk: false,
  ...extra,
});

const coverage = (
  tests: Array<[string, 'passed' | 'failed' | 'skipped']>,
  lines: Record<string, Record<number, string[]>>,
): PerTestCoverage => ({
  ecosystem: 'python',
  tests: tests.map(([testId, outcome]) => ({ testId, outcome })),
  lines: new Map(
    Object.entries(lines).map(([p, m]) => [
      p,
      new Map(Object.entries(m).map(([l, t]) => [Number(l), t])),
    ]),
  ),
  loadedOutside: [],
});

describe('changed lines, tiers and risk order', () => {
  it('assigns ecosystems and recognises test files', () => {
    expect(ecosystemOfPath('src/a.ts')).toBe('typescript-javascript');
    expect(ecosystemOfPath('src/a.d.ts')).toBe('other');
    expect(ecosystemOfPath('pkg/m.py')).toBe('python');
    expect(ecosystemOfPath('src/X.cs')).toBe('csharp-dotnet');
    expect(ecosystemOfPath('README.md')).toBe('other');
    expect(isTestPath('test/a.spec.ts')).toBe(true);
    expect(isTestPath('src/a.test.ts')).toBe(true);
    expect(isTestPath('tests/test_x.py')).toBe(true);
    expect(isTestPath('src/FluentValidation.Tests/X.cs')).toBe(true);
    expect(isTestPath('src/FluentValidation/Validators/X.cs')).toBe(false);
    expect(isTestPath('faker/providers/x.py')).toBe(false);
  });

  it('collects added lines and merges them into ranges', () => {
    const added = addedLinesByFile([hunk('h1', 'a.py', [5, 6, 7]), hunk('h2', 'a.py', [10, 12])]);
    expect(added.get('a.py')).toEqual([5, 6, 7, 10, 12]);
    expect(toRanges([7, 5, 6, 10, 12, 12])).toEqual([
      [5, 7],
      [10, 10],
      [12, 12],
    ]);
  });

  it('keeps only lines executed by passing tests', () => {
    const added = new Map([['a.py', [1, 2, 3]]]);
    const cov = coverage(
      [
        ['t1', 'passed'],
        ['t2', 'failed'],
      ],
      { 'a.py': { 1: ['t1'], 2: ['t2'], 3: ['t1', 't2'] } },
    );
    expect(executedChangedLines(added, cov).get('a.py')).toEqual([1, 3]);
    expect(coverageSummary(added, cov)).toMatchObject({
      tests: { passed: 1, failed: 1, skipped: 0 },
      addedLines: 3,
      addedLinesExecutedByPassingTests: 2,
    });
  });

  it('builds mutation hunks in descending risk, ties by path and line, without test files', () => {
    const hunks = [
      hunk('a', 'src/b.py', [1, 2]),
      hunk('b', 'src/a.py', [1, 2]),
      hunk('c', 'src/a.py', [10, 11, 12]),
      hunk('t', 'tests/test_a.py', [1, 2, 3, 4]),
    ];
    const executed = new Map([
      ['src/a.py', [1, 2, 10, 11, 12]],
      ['src/b.py', [1, 2]],
      ['tests/test_a.py', [1, 2, 3, 4]],
    ]);
    expect(mutationHunks(hunks, executed, 'python').map((h) => h.hunkId)).toEqual(['c', 'b', 'a']);
    expect(
      riskOrder([
        { risk: 1, path: 'b', firstLine: 1 },
        { risk: 1, path: 'a', firstLine: 9 },
        { risk: 1, path: 'a', firstLine: 2 },
      ]),
    ).toEqual([
      { risk: 1, path: 'a', firstLine: 2 },
      { risk: 1, path: 'a', firstLine: 9 },
      { risk: 1, path: 'b', firstLine: 1 },
    ]);
  });

  it('splits two tiers at 25 % of the candidate mutants', () => {
    const h = (id: string, n: number): MutationHunk => ({
      hunkId: id,
      path: `${id}.py`,
      firstLine: 1,
      lines: Array.from({ length: n }, (_, i) => i + 1),
      risk: n,
    });
    const [first, rest] = twoTiers([h('a', 10), h('b', 10), h('c', 10), h('d', 10)]);
    expect(first.map((x) => x.hunkId)).toEqual(['a']);
    expect(rest.map((x) => x.hunkId)).toEqual(['b', 'c', 'd']);
    expect(twoTiers([h('a', 1)])).toEqual([[h('a', 1)], []]);
    expect(tierRanges([h('a', 3)]).get('a.py')).toEqual([[1, 3]]);
  });
});

describe('Stryker configuration and reports', () => {
  it('writes StrykerJS line ranges and configuration', () => {
    const ranges = new Map<string, Array<[number, number]>>([
      ['src/b.ts', [[3, 4]]],
      [
        'src/a.ts',
        [
          [1, 1],
          [7, 9],
        ],
      ],
    ]);
    expect(strykerJsMutate(ranges)).toEqual(['src/a.ts:1-1', 'src/a.ts:7-9', 'src/b.ts:3-4']);
    const c = strykerJsConfig({
      ranges,
      concurrency: 7,
      jsonReport: 'r.json',
      plugins: ['p'],
      testRunner: 'jest',
    });
    expect(c).toMatchObject({
      coverageAnalysis: 'perTest',
      inPlace: true,
      incremental: false,
      concurrency: 7,
    });
  });

  it('converts line ranges to Stryker.NET character spans (D-012)', () => {
    const text = '\ufeffab\r\ncde\r\n\r\nf';
    // Without BOM: "ab\r\ncde\r\n\r\nf"; line 1 = 0..1, line 2 = 4..6, line 3 empty at 9, line 4 = 11.
    expect(lineRangesToCharSpans(text, [[1, 1]])).toEqual([[0, 1]]);
    expect(lineRangesToCharSpans(text, [[2, 4]])).toEqual([[4, 11]]);
    expect(lineRangesToCharSpans(text, [[3, 3]])).toEqual([[9, 9]]);
    expect(lineRangesToCharSpans(text, [[9, 9]])).toEqual([]);
    expect(strykerNetMutate('Validators/X.cs', [[4, 11]])).toEqual(['**/Validators/X.cs{4..11}']);
  });

  it('converts mutation-testing reports to MutationResult and fills unavailable hunks', () => {
    const hunks: MutationHunk[] = [
      { hunkId: 'h1', path: 'src/a.ts', firstLine: 2, lines: [2, 3], risk: 2 },
      { hunkId: 'h2', path: 'src/b.ts', firstLine: 9, lines: [9], risk: 1 },
    ];
    const report = {
      files: {
        'src/a.ts': {
          mutants: [
            { status: 'Killed', replacement: '-', location: { start: { line: 2 } } },
            { status: 'Survived', mutatorName: 'Eq', location: { start: { line: 3 } } },
            { status: 'Ignored', location: { start: { line: 3 } } },
            { status: 'Timeout', location: { start: { line: 40 } } },
          ],
        },
        'C:/ws/w00/src/c.ts': {
          mutants: [{ status: 'NoCoverage', location: { start: { line: 1 } } }],
        },
      },
    };
    const results = convertReport(report, hunks, 'C:\\ws\\w00');
    expect(results).toEqual([
      { hunkId: 'h1', line: 2, mutation: '-', outcome: 'killed' },
      { hunkId: 'h1', line: 3, mutation: 'Eq', outcome: 'survived' },
    ]);
    expect(unavailableFor(hunks, results, 'tool failed')).toEqual([
      { hunkId: 'h2', unavailable: 'tool failed' },
    ]);
    expect(reportPath('C:\\WS\\w00\\src\\x.cs', 'C:\\ws\\w00')).toBe('src/x.cs');
    expect(reportPath('./src/x.ts', 'C:\\ws\\w00')).toBe('src/x.ts');
  });
});

describe('Python runner plan', () => {
  it('keeps the -p plugins of the test command', () => {
    expect(
      pytestPluginArgs(
        'python -m pytest -q -p no:cacheprovider -p faker.contrib.pytest.plugin --deselect a::b -pxdist',
      ),
    ).toEqual(['-p', 'faker.contrib.pytest.plugin', '-p', 'xdist']);
  });

  it('maps pytest exits to outcomes and computes timeouts', () => {
    expect(pytestOutcome('exited', 0)).toBe('survived');
    expect(pytestOutcome('exited', 1)).toBe('killed');
    expect(pytestOutcome('exited', 2)).toBe('killed');
    expect(pytestOutcome('exited', 5)).toBe('error');
    expect(pytestOutcome('timed-out', null)).toBe('timeout');
    expect(pytestOutcome('cancelled', null)).toBe('error');
    expect(mutantTimeoutMs([100, undefined, 400])).toBe(11_000);
  });

  it('records hunks only once every riskier hunk is complete', () => {
    const pending = new Map([
      ['a', 0],
      ['b', 1],
      ['c', 0],
    ]);
    expect(recordablePrefix(['a', 'b', 'c'], pending, new Set())).toEqual(['a']);
    pending.set('b', 0);
    expect(recordablePrefix(['a', 'b', 'c'], pending, new Set(['a']))).toEqual(['b', 'c']);
  });
});

describe('adapter readers', () => {
  it('maps paths below a root, case-insensitively on request', () => {
    expect(relativeTo('C:\\ws\\w00', 'c:/WS/w00/src/a.ts', true)).toBe('src/a.ts');
    expect(relativeTo('/ws/w00', '/ws/w001/a.ts', false)).toBeNull();
  });

  it('reads the Node preload lines', () => {
    const text = [
      JSON.stringify({
        kind: 'test',
        testId: 't1',
        outcome: 'passed',
        lines: { '/ws/src/a.ts': [3, 4] },
      }),
      JSON.stringify({
        kind: 'test',
        testId: 't2',
        outcome: 'failed',
        failureMessage: 'x',
        lines: { '/ws/src/a.ts': [4] },
      }),
      JSON.stringify({ kind: 'outside', file: '/wt/src/a.ts' }),
      '{"cut',
    ].join('\n');
    const r = readNodeLines(text, '/ws', false);
    expect(r.tests.map((t) => [t.testId, t.outcome])).toEqual([
      ['t1', 'passed'],
      ['t2', 'failed'],
    ]);
    expect(r.lines.get('src/a.ts')?.get(4)).toEqual(['t1', 't2']);
    expect(r.loadedOutside).toEqual(['/wt/src/a.ts']);
  });

  it('reads the pytest plugin result and drops the empty context', () => {
    const r = readPythonResult(
      {
        interpreter: '/venv/bin/python',
        tests: [{ nodeid: 'tests/t.py::a', outcome: 'passed', duration: 0.25 }],
        lines: { '/ws/pkg/m.py': { '3': ['', 'tests/t.py::a'] } },
      },
      '/ws',
      false,
    );
    expect(r.tests[0]).toMatchObject({ testId: 'tests/t.py::a', durationMs: 250 });
    expect(r.lines.get('pkg/m.py')?.get(3)).toEqual(['tests/t.py::a']);
    expect(r.interpreter).toBe('/venv/bin/python');
  });

  it('joins OpenCover tracked methods with TRX results', () => {
    expect(trackedMethodTestId('System.Void Ns.C/Inner::M(System.Int32)')).toBe('Ns.C+Inner.M');
    const openCover = `<CoverageSession><Modules><Module hash="x"><Files>
      <File uid="1" fullPath="C:\\ws\\w00\\src\\Ops.cs" /></Files>
      <SequencePoint vc="2" sl="10" el="11" fileid="1"><TrackedMethodRefs><TrackedMethodRef uid="7" vc="1" /></TrackedMethodRefs></SequencePoint>
      <SequencePoint vc="1" sl="20" el="20" fileid="1" />
      <TrackedMethods><TrackedMethod uid="7" token="1" name="System.Void T.OpsTests::Clamp(System.Int32)" strategy="[Theory]" /></TrackedMethods>
      </Module></Modules></CoverageSession>`;
    const trx = `<TestRun><TestDefinitions>
      <UnitTest name="a" id="g1"><TestMethod className="T.OpsTests" name="Clamp (abc)" /></UnitTest>
      <UnitTest name="b" id="g2"><TestMethod className="T.OpsTests" name="Clamp (def)" /></UnitTest>
      </TestDefinitions><Results>
      <UnitTestResult testId="g1" outcome="Passed" duration="00:00:00.0100000" />
      <UnitTestResult testId="g2" outcome="Failed" duration="00:00:01.5"><Output><ErrorInfo><Message>boom &amp; more</Message></ErrorInfo></Output></UnitTestResult>
      </Results></TestRun>`;
    expect(readTrx(trx)).toEqual([
      { testId: 'T.OpsTests.Clamp', outcome: 'failed', durationMs: 1510, message: undefined },
    ]);
    const r = readDotnetResults([openCover], [trx], 'C:\\ws\\w00', true);
    expect(r.lines.get('src/Ops.cs')?.get(10)).toEqual(['T.OpsTests.Clamp']);
    expect(r.lines.get('src/Ops.cs')?.get(11)).toEqual(['T.OpsTests.Clamp']);
    expect(r.lines.get('src/Ops.cs')?.has(20)).toBe(false);
    expect(r.unmatchedTrackedTests).toBe(0);
    expect(projectNames(['src/A/A.csproj', 'src/B.Tests/B.Tests.csproj', 'x.cs'])).toEqual([
      'A',
      'B.Tests',
    ]);
  });

  it('merges coverage parts; a test failing in one part fails', () => {
    const a = coverage([['t', 'passed']], { 'a.py': { 1: ['t'] } });
    const b = coverage([['t', 'failed']], { 'a.py': { 1: ['u'], 2: ['t'] } });
    const m = mergeCoverage([a, b]);
    expect(m.tests).toEqual([{ testId: 't', outcome: 'failed' }]);
    expect(m.lines.get('a.py')?.get(1)).toEqual(['t', 'u']);
  });
});

describe('covered files (W6)', () => {
  it('parses Git LFS pointer files', () => {
    const oid = 'a'.repeat(64);
    expect(
      parseLfsPointer(
        Buffer.from(`version https://git-lfs.github.com/spec/v1\noid sha256:${oid}\nsize 12\n`),
      ),
    ).toEqual({ oid, size: 12 });
    expect(parseLfsPointer(Buffer.from('plain content'))).toBeNull();
  });

  it('finds the files under a clean filter from .gitattributes', () => {
    const tree = [
      { path: 'w6/lfs/a.bin', mode: 'regular' as const, blob: 'b1' },
      { path: 'w6/filtered/s.dat', mode: 'regular' as const, blob: 'b2' },
      { path: 'w6/other.txt', mode: 'regular' as const, blob: 'b3' },
    ];
    const covered = coveredFiles(tree, [
      { directory: 'w6', content: 'lfs/*.bin filter=lfs -text\nfiltered/*.dat filter=sddr-b64\n' },
    ]);
    expect(covered.map((c) => [c.path, c.driver])).toEqual([
      ['w6/lfs/a.bin', 'lfs'],
      ['w6/filtered/s.dat', 'sddr-b64'],
    ]);
  });

  it('accepts a copy only when G-15 is unchanged around it', () => {
    const st = {
      size: 1,
      mtimeSeconds: 2,
      mtimeNanoseconds: 3,
      ctimeSeconds: 4,
      ctimeNanoseconds: 5,
      inode: 0,
      uid: 0,
      gid: 0,
    };
    const e = { blob: 'b', mode: 'regular' as const, upToDate: true, stat: st };
    expect(g15Unchanged(e, e, 'b')).toBe(true);
    expect(g15Unchanged(e, { ...e, stat: { ...st, mtimeSeconds: 9 } }, 'b')).toBe(false);
    expect(g15Unchanged(e, { ...e, upToDate: false }, 'b')).toBe(false);
    expect(g15Unchanged(e, e, 'other')).toBe(false);
    expect(g15Unchanged(null, e, 'b')).toBe(false);
  });

  it('generates deterministic fixture bytes and names', () => {
    expect(fixtureBytes('lfs', 0, 64).equals(fixtureBytes('lfs', 0, 64))).toBe(true);
    expect(fixtureBytes('lfs', 0, 64).equals(fixtureBytes('lfs', 1, 64))).toBe(false);
    expect(fileName('filtered', 4)).toBe('w6-fixture/filtered/secret-005.dat');
  });
});

describe('runner arguments, environment and documents', () => {
  it('parses the measurement, W6 and dry-run forms', () => {
    expect(parseSpikeEvidenceArgs(['bench-ts', 'w2'])).toMatchObject({
      mode: 'measure',
      target: 'bench-ts',
      label: 'W2',
    });
    expect(
      parseSpikeEvidenceArgs(['bench-py', 'W4', '--state', 'during', '--workers', '3']),
    ).toMatchObject({
      state: 'during',
      workers: 3,
    });
    expect(parseSpikeEvidenceArgs(['--dry-run']).mode).toBe('dry-run');
    expect(parseSpikeEvidenceArgs(['w6', '--state', 'stored'])).toMatchObject({
      mode: 'w6',
      label: 'W6',
      state: 'stored',
    });
    expect(
      parseSpikeEvidenceArgs([
        'W3',
        '--repo',
        '.',
        '--base',
        'abc',
        '--eco',
        'py',
        '--test-command',
        'pytest',
      ]).manual,
    ).toMatchObject({ eco: 'py', base: 'abc', testCommand: 'pytest' });
    expect(() => parseSpikeEvidenceArgs(['bench-ts', 'W9'])).toThrow(/unknown label/);
    expect(() => parseSpikeEvidenceArgs(['bench-ts', 'W4', '--state', 'never'])).toThrow(/during/);
    expect(() => parseSpikeEvidenceArgs(['bench-ts', 'W1', '--workers', '0'])).toThrow(/positive/);
    expect(() => parseSpikeEvidenceArgs(['w6', '--state', 'odd'])).toThrow(/copy or stored/);
  });

  it('applies the active environment of a benchmark change', () => {
    const target: SpikeTarget = {
      id: 'x',
      ecosystem: 'python',
      checkout: '/c',
      base: 'b',
      head: null,
      testCommand: 't',
      envSet: { VIRTUAL_ENV: '/c/.venv' },
      envUnset: ['PYTHONPATH'],
      pathPrepend: '/c/.venv/bin',
    };
    const env = developerEnvironment(target, { PATH: '/usr/bin', PYTHONPATH: '/x' }, 'linux');
    expect(env.PYTHONPATH).toBeUndefined();
    expect(env.VIRTUAL_ENV).toBe('/c/.venv');
    expect(env.PATH).toBe(`/c/.venv/bin${path.delimiter}/usr/bin`);
    expect(substituteCheckout('<checkout>/.venv', '/r')).toBe('/r/.venv');
  });

  it('builds the evidence document with test runs, mutation results and bundles', () => {
    const doc = evidenceDocument('s-1', {
      testCommand: 'npm test',
      coverage: coverage([['t', 'passed']], { 'a.py': { 1: ['t'] } }),
      mutationResults: [{ hunkId: 'h', unavailable: 'x' }],
      bundleRuns: [],
      bundleCommands: [{ commandId: 'c01', command: 'node -e 0' }],
    });
    expect(doc).toMatchObject({
      document: 'evidence',
      snapshotId: 's-1',
      mutationResults: [{ hunkId: 'h' }],
    });
    expect((doc.testRuns as Array<{ coverage: unknown[] }>)[0]!.coverage).toEqual([
      { path: 'a.py', line: 1, tests: ['t'] },
    ]);
  });

  it('gives 10 fixed-text bundle commands that print their text', () => {
    const specs = bundleCommands();
    expect(specs).toHaveLength(10);
    const out = execFileSync(process.execPath, [...specs[0]!.args], { encoding: 'utf8' });
    expect(out).toBe(specs[0]!.expected);
  });
});

describe('Python mutation engine', () => {
  const python = process.platform === 'win32' ? 'python' : 'python3';
  let available = true;
  try {
    execFileSync(python, ['--version'], { stdio: 'ignore' });
  } catch {
    available = false;
  }
  it.skipIf(!available)('has every operator of C001-ADR-007 §3 and applies a mutant', () => {
    const out = execFileSync(
      python,
      [path.resolve('spikes/evidence/mutation/python/sddr_mutate.py'), 'selftest'],
      { encoding: 'utf8' },
    );
    expect(JSON.parse(out)).toMatchObject({ ok: true });
  });
});
