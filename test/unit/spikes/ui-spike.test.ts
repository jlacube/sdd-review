import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { SpikeFile, SpikeHunk } from '../../../spikes/ui/app/dataset.js';
import {
  buildContextRows,
  buildHunkRows,
  groupIndexOfKey,
  splitLines,
} from '../../../spikes/ui/app/model.js';
import { groupsByDirectory, largestChange } from '../../../spikes/ui/prepare.js';
import { uiSpikeMarkdown, type UiSpikeReport } from '../../../spikes/ui/report.js';
import { parseSpikeUiArgs } from '../../../spikes/ui/runner.js';
import { MIN_ACTIONS, scriptSession } from '../../../spikes/ui/session.js';
import {
  evaluate,
  NFR_003,
  percentile,
  summarise,
  verdictOf,
  type ActionTiming,
} from '../../../spikes/ui/stats.js';
import { syntheticDataset } from '../../../spikes/ui/synthetic.js';

const timing = (seq: number, ms: number, type: ActionTiming['type'] = 'open'): ActionTiming => ({
  seq,
  type,
  variant: `${type}-x`,
  ms,
  timedOut: false,
});

describe('C001-T-023 percentiles (nearest rank)', () => {
  it('returns a measured value at rank ceil(p/100 * n)', () => {
    const values = Array.from({ length: 100 }, (_, i) => i + 1); // 1..100
    expect(percentile(values, 95)).toBe(95);
    expect(percentile(values, 50)).toBe(50);
    expect(percentile(values, 100)).toBe(100);
    expect(percentile([7], 95)).toBe(7);
  });

  it('does not depend on input order and rounds the rank up', () => {
    expect(percentile([30, 10, 20], 50)).toBe(20); // ceil(1.5) = 2nd
    expect(percentile([5, 1, 4, 2, 3], 95)).toBe(5); // ceil(4.75) = 5th
    const twenty = Array.from({ length: 20 }, (_, i) => i + 1);
    expect(percentile(twenty, 95)).toBe(19); // ceil(19) = 19th
  });

  it('gives NaN for no values and rejects p outside (0, 100]', () => {
    expect(percentile([], 95)).toBeNaN();
    expect(() => percentile([1], 0)).toThrow(RangeError);
    expect(() => percentile([1], 101)).toThrow(RangeError);
  });
});

describe('C001-T-023 pass or miss against C001-NFR-003', () => {
  it('passes at the thresholds, inclusive, and misses above either', () => {
    expect(NFR_003).toEqual({ p95Ms: 200, maxMs: 1000 });
    expect(verdictOf(200, 1000)).toBe('pass');
    expect(verdictOf(200.1, 500)).toBe('miss');
    expect(verdictOf(150, 1000.1)).toBe('miss');
    expect(verdictOf(10, 10, 1)).toBe('miss'); // a timed-out action is a miss
  });

  it('decides on the whole session; one slow action over 1 s is a miss', () => {
    const fast = Array.from({ length: 499 }, (_, i) => timing(i + 1, 20));
    expect(evaluate(fast).overall.verdict).toBe('pass');
    const withSlow = [...fast, timing(500, 1200, 'move')];
    const e = evaluate(withSlow);
    expect(e.overall.p95Ms).toBe(20);
    expect(e.overall.maxMs).toBe(1200);
    expect(e.overall.verdict).toBe('miss');
    expect(e.byType.move.verdict).toBe('miss');
    expect(e.byType.open.verdict).toBe('pass');
    expect(e.byType.scroll.verdict).toBe('no-data');
  });

  it('misses when more than 5 % of the actions take over 200 ms', () => {
    const t = Array.from({ length: 100 }, (_, i) => timing(i + 1, i < 94 ? 50 : 250));
    expect(summarise(t).p95Ms).toBe(250);
    expect(summarise(t).verdict).toBe('miss');
    const ok = Array.from({ length: 100 }, (_, i) => timing(i + 1, i < 95 ? 50 : 250));
    expect(summarise(ok).p95Ms).toBe(50);
    expect(summarise(ok).verdict).toBe('pass');
  });

  it('summarises count, mean, p50 and timeouts', () => {
    const s = summarise([timing(1, 10), timing(2, 20), { ...timing(3, 30), timedOut: true }]);
    expect(s).toMatchObject({ count: 3, meanMs: 20, p50Ms: 20, maxMs: 30, timedOut: 1 });
    expect(s.verdict).toBe('miss');
  });
});

describe('C001-T-023 scripted session', () => {
  it('is reproducible, starts with an open and has at least 200 actions', () => {
    const a = scriptSession(500, 23, 8);
    expect(a).toEqual(scriptSession(500, 23, 8));
    expect(a).toHaveLength(500);
    expect(a[0]!.type).toBe('open');
    expect(a.map((s) => s.seq)).toEqual(Array.from({ length: 500 }, (_, i) => i));
    expect(() => scriptSession(MIN_ACTIONS - 1, 1, 8)).toThrow(RangeError);
  });

  it('mixes open, scroll, mark and move actions on both lists', () => {
    const steps = scriptSession(500, 23, 8);
    for (const type of ['open', 'scroll', 'mark', 'move'] as const) {
      expect(steps.filter((s) => s.type === type).length).toBeGreaterThan(40);
    }
    expect(steps.some((s) => s.variant.startsWith('scroll-hunks'))).toBe(true);
    expect(steps.some((s) => s.variant.startsWith('scroll-context'))).toBe(true);
  });

  it('names only existing groups in move keys', () => {
    const keys = scriptSession(500, 5, 3)
      .filter((s) => s.type === 'move')
      .map((s) => groupIndexOfKey(s.key!));
    expect(new Set(keys)).toEqual(new Set([0, 1, 2]));
    expect(groupIndexOfKey('0')).toBe(9);
    expect(groupIndexOfKey('x')).toBeNull();
  });
});

const hunk = (id: string, p: Partial<SpikeHunk>): SpikeHunk => ({
  hunkId: id,
  path: 'a.ts',
  oldStart: 1,
  oldLines: 0,
  newStart: 1,
  newLines: 0,
  lines: [],
  ...p,
});

describe('C001-T-023 row models', () => {
  it('groups hunks under their group with a header row each', () => {
    const hunks = [
      hunk('h1', { lines: [{ kind: 'added', text: 'x' }] }),
      hunk('h2', {
        lines: [
          { kind: 'deleted', text: 'y' },
          { kind: 'added', text: 'z' },
        ],
      }),
    ];
    const groups = [
      { id: 'a', name: 'A' },
      { id: 'b', name: 'B' },
    ];
    const m = buildHunkRows(hunks, groups, { h1: 'b', h2: 'a' });
    expect(m.rows.map((r) => r.kind)).toEqual([
      'group',
      'hunk',
      'line',
      'line',
      'group',
      'hunk',
      'line',
    ]);
    expect(m.order).toEqual(['h2', 'h1']);
    expect(m.headerIndex.get('h1')).toBe(5);
    expect(new Set(m.rows.map((r) => r.key)).size).toBe(m.rows.length);
  });

  it('shows the file with added lines marked and deleted lines in place', () => {
    const file: SpikeFile = {
      path: 'a.ts',
      changeType: 'modified',
      binary: false,
      side: 'new',
      text: 'one\ntwo\nthree\n',
    };
    const replace = hunk('r', {
      oldStart: 2,
      oldLines: 1,
      newStart: 2,
      newLines: 1,
      lines: [
        { kind: 'deleted', text: 'old two' },
        { kind: 'added', text: 'two' },
      ],
    });
    const del = hunk('d', {
      oldStart: 5,
      oldLines: 1,
      newStart: 3,
      newLines: 0,
      lines: [{ kind: 'deleted', text: 'gone' }],
    });
    const m = buildContextRows(file, [replace, del]);
    expect(m.rows.map((r) => [r.number, r.mark, r.text])).toEqual([
      [1, 'none', 'one'],
      [null, 'deleted', 'old two'],
      [2, 'added', 'two'],
      [3, 'none', 'three'],
      [null, 'deleted', 'gone'],
    ]);
    expect(m.hunkRowIndex.get('r')).toBe(1);
    expect(m.hunkRowIndex.get('d')).toBe(4);
  });

  it('shows a deleted file on its old side and a binary file as one row', () => {
    const old: SpikeFile = {
      path: 'a',
      changeType: 'deleted',
      binary: false,
      side: 'old',
      text: 'a\r\nb',
    };
    expect(buildContextRows(old, [hunk('x', {})]).rows.map((r) => r.mark)).toEqual([
      'deleted',
      'deleted',
    ]);
    const bin: SpikeFile = {
      path: 'b',
      changeType: 'added',
      binary: true,
      side: 'new',
      text: null,
    };
    expect(buildContextRows(bin, [hunk('y', {})]).rows).toHaveLength(1);
    expect(splitLines('a\n\nb\n')).toEqual(['a', '', 'b']);
  });
});

describe('C001-T-023 synthetic change and preparation helpers', () => {
  it('builds a consistent synthetic change of the asked size', () => {
    const d = syntheticDataset(1000);
    expect(d.hunks.reduce((n, h) => n + h.lines.length, 0)).toBe(1000);
    for (const f of d.files) {
      const hs = d.hunks.filter((h) => h.path === f.path);
      const lines = splitLines(f.text!);
      for (const h of hs) {
        const added = h.lines.filter((l) => l.kind === 'added').map((l) => l.text);
        expect(lines.slice(h.newStart - 1, h.newStart - 1 + h.newLines)).toEqual(added);
      }
    }
    expect(Object.keys(d.assignment)).toHaveLength(d.hunks.length);
  });

  it('groups by leading directory into at most ten groups', () => {
    const hunks = Array.from({ length: 30 }, (_, i) => ({
      hunkId: `h${i}`,
      path: `d${i % 15}/x/f.ts`,
      lines: [1],
    }));
    const { groups, assignment } = groupsByDirectory(hunks);
    expect(groups).toHaveLength(10);
    expect(groups[9]!.name).toBe('Other');
    expect(Object.values(assignment).every((g) => groups.some((x) => x.id === g))).toBe(true);
    expect(groupsByDirectory([{ hunkId: 'a', path: 'f.ts', lines: [] }]).groups).toHaveLength(2);
  });

  it('picks the largest benchmark change and parses the runner arguments', () => {
    const setFile = fileURLToPath(
      new URL('../../../bench/set/benchmark-set.json', import.meta.url),
    );
    const changes = [
      { id: 'a', changedLines: 5 },
      { id: 'b', changedLines: 9 },
    ] as Parameters<typeof largestChange>[0];
    expect(largestChange(changes).id).toBe('b');
    const def = parseSpikeUiArgs([], setFile);
    expect(def.targets).toHaveLength(1);
    expect(def.options.browsers).toEqual(['chrome', 'edge', 'firefox']);
    expect(def.options.actions).toBe(500);
    expect(def.options.headless).toBe(false);
    const syn = parseSpikeUiArgs(
      [
        '--synthetic',
        '800',
        '--browser',
        'edge',
        '--actions',
        '200',
        '--headless',
        '--channel',
        'edge=msedge-beta',
      ],
      setFile,
    );
    expect(syn.targets[0]).toMatchObject({ benchId: null, syntheticLines: 800 });
    expect(syn.options).toMatchObject({ browsers: ['edge'], actions: 200, headless: true });
    expect(syn.options.channels.edge).toBe('msedge-beta');
    expect(() => parseSpikeUiArgs(['--actions', '199'], setFile)).toThrow(/at least 200/);
    expect(() => parseSpikeUiArgs(['--browser', 'safari'], setFile)).toThrow(/unknown browser/);
    expect(() => parseSpikeUiArgs(['nope'], setFile)).toThrow(/no benchmark change/);
  });
});

describe('C001-T-023 report', () => {
  it('states pass or miss and the per-type table', () => {
    const actions = [timing(1, 12), timing(2, 30, 'scroll'), timing(3, 250, 'mark')];
    const report: UiSpikeReport = {
      schema: 'sdd-review-ui-spike/1',
      task: 'C001-T-023',
      benchId: 'bench-ts',
      startedAt: '2026-11-21T10:00:00.000Z',
      host: {
        os: 'win32',
        release: '10',
        cpu: 'cpu',
        logicalCpus: 8,
        totalMemBytes: 2 ** 34,
        node: 'v22',
      },
      browser: {
        kind: 'edge',
        channel: 'msedge',
        version: '142.0',
        userAgent: 'UA',
        headless: false,
        viewport: { width: 1600, height: 900 },
      },
      dataset: {
        source: 'benchmark',
        changedLines: 9884,
        files: 264,
        hunks: 900,
        groups: 10,
        hunkListRows: 10794,
        largestFileContextRows: 1200,
      },
      session: { actions: 3, seed: 23, pauseMs: 250 },
      threshold: NFR_003,
      result: 'miss',
      error: null,
      pageReadyMs: 420,
      evaluation: evaluate(actions),
      cspViolations: [],
      actions,
    };
    const md = uiSpikeMarkdown(report);
    expect(md).toContain('**Result: MISS**');
    expect(md).toContain('| **all (C001-NFR-003)** | 3 |');
    expect(md).toContain('| mark | 1 |');
    expect(md).toContain('| move | 0 | — |');
    expect(md).toContain('version 142.0, headed');
  });
});

describe('C001-T-023 settle check of a virtualised list', () => {
  /** A scroll container stand-in: rows of 20 px from `firstRow`, an area of `height` px at y 100. */
  function list(opts: {
    count: number;
    rendered: number;
    firstRow?: number;
    height: number;
    scrollTop?: number;
  }) {
    const top = 100;
    const scrollTop = opts.scrollTop ?? 0;
    const first = opts.firstRow ?? 0;
    const rows = Array.from({ length: opts.rendered }, (_, i) => ({
      getBoundingClientRect: () => ({
        top: top - scrollTop + (first + i) * 20,
        bottom: top - scrollTop + (first + i + 1) * 20,
      }),
    }));
    return {
      querySelectorAll: () => rows,
      getBoundingClientRect: () => ({ top }),
      clientTop: 0,
      scrollTop,
      clientHeight: opts.height,
      // A browser never reports a scrollHeight below clientHeight.
      scrollHeight: Math.max(opts.height, opts.count * 20),
      dataset: { count: String(opts.count) },
    } as unknown as HTMLElement;
  }

  it('settles on a list shorter than its area once every row is rendered', async () => {
    const { covered } = await import('../../../spikes/ui/app/timing.js');
    expect(covered(list({ count: 12, rendered: 12, height: 800 }))).toBe(true);
    expect(covered(list({ count: 0, rendered: 0, height: 800 }))).toBe(true);
  });

  it('settles on a long list only when the rendered rows span the visible area', async () => {
    const { covered } = await import('../../../spikes/ui/app/timing.js');
    expect(
      covered(list({ count: 1000, rendered: 56, firstRow: 92, height: 800, scrollTop: 2000 })),
    ).toBe(true);
    expect(
      covered(list({ count: 1000, rendered: 20, firstRow: 100, height: 800, scrollTop: 2000 })),
    ).toBe(false);
  });
});
