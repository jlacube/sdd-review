import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync, unlinkSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { analyseRecord, renderResults } from '../../../scripts/study/g8-analyse.js';
import { writeSyntheticRecord } from '../../fixtures/study/synthetic.js';

const fixtureDir = fileURLToPath(
  new URL('../../fixtures/study/synthetic-record/', import.meta.url),
);
const dirs: string[] = [];

function freshRecord(options: Parameters<typeof writeSyntheticRecord>[1] = {}): string {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'g8-record-'));
  dirs.push(dir);
  writeSyntheticRecord(dir, options);
  return dir;
}

afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

function listFiles(root: string, rel = ''): string[] {
  const out: string[] = [];
  for (const name of readdirSync(path.join(root, rel))) {
    const r = rel ? `${rel}/${name}` : name;
    if (statSync(path.join(root, r)).isDirectory()) out.push(...listFiles(root, r));
    else out.push(r);
  }
  return out.sort();
}

describe('g8-analyse on the synthetic record', () => {
  it('computes the per-method means, the C001-NFR-006 ratio and the C001-NFR-007 difference', () => {
    const r = analyseRecord(freshRecord());
    expect(r.errors).toEqual([]);
    expect(r.sessions).toHaveLength(16);
    expect(r.perMethod.assistant).toMatchObject({ n: 8, meanMinutes: 77.5 });
    expect(r.perMethod.diff).toMatchObject({ n: 8, meanMinutes: 155 });
    expect(r.perMethod.assistant.meanShare).toBeCloseTo(46 / 64, 12);
    expect(r.perMethod.diff.meanShare).toBeCloseTo(40 / 64, 12);
    expect(r.ratio).toBe(0.5);
    expect(r.ratioMet).toBe(true);
    expect(r.differencePp).toBeCloseTo(9.375, 9);
    expect(r.differenceMet).toBe(true);
  });

  it('reports per change and method', () => {
    const r = analyseRecord(freshRecord());
    const expected = {
      A: { assistant: [62.5, 13 / 16], diff: [165, 11 / 16] },
      B: { assistant: [72.5, 11 / 16], diff: [145, 11 / 16] },
      C: { assistant: [82.5, 9 / 16], diff: [130, 9 / 16] },
      D: { assistant: [92.5, 13 / 16], diff: [180, 9 / 16] },
    } as const;
    for (const change of ['A', 'B', 'C', 'D'] as const) {
      for (const method of ['assistant', 'diff'] as const) {
        const cell = r.perChange[change][method];
        expect(cell.n).toBe(2);
        expect(cell.meanMinutes).toBeCloseTo(expected[change][method][0], 9);
        expect(cell.meanShare).toBeCloseTo(expected[change][method][1], 9);
      }
    }
  });

  it('counts capped sessions at the cap and subtracts breaks', () => {
    const r = analyseRecord(freshRecord());
    const byKey = (row: number, session: number) =>
      r.sessions.find((s) => s.row === row && s.session === session)!;
    expect(byKey(5, 2)).toMatchObject({ activeMinutes: 200, countedMinutes: 180, capped: true });
    expect(byKey(6, 1)).toMatchObject({ activeMinutes: 180, countedMinutes: 180, capped: true });
    expect(byKey(1, 1)).toMatchObject({ activeMinutes: 60, countedMinutes: 60 });
  });

  it('counts each seeded defect once and no finding outside the sealed list', () => {
    const r = analyseRecord(freshRecord());
    const s = r.sessions.find((x) => x.row === 1 && x.session === 1)!;
    expect(s).toMatchObject({ findings: 8, found: 6, seeded: 8, outside: 1 });
    expect(s.share).toBe(0.75);
    expect(r.outsideFindings).toHaveLength(2);
  });

  it("leaves out the dropped participant's session and names it", () => {
    const r = analyseRecord(freshRecord());
    expect(r.excluded).toHaveLength(1);
    expect(r.excluded[0].reason).toMatch(/replaced/);
    expect(r.sessions.some((s) => s.id === r.excluded[0].id)).toBe(false);
  });

  it("reports the raters' agreement before discussion", () => {
    const r = analyseRecord(freshRecord());
    expect(r.agreement.findings).toBe(89);
    expect(r.agreement.agreed).toBe(85);
    expect(r.agreement.percent).toBeCloseTo(85 / 89, 12);
    expect(r.agreement.kappa).toBeGreaterThan(0.9);
    expect(r.agreement.kappa).toBeLessThan(1);
  });

  it('passes every design item of C001-DOD-018 on a complete record', () => {
    const r = analyseRecord(freshRecord());
    expect(r.design.filter((d) => !d.ok)).toEqual([]);
    expect(r.design.map((d) => d.item).join('\n')).toMatch(/8 participants/);
  });

  it('fails the design item when a sealed list was opened before the last session ended', () => {
    const r = analyseRecord(freshRecord({ openedAt: '2027-02-10T10:00:00+01:00' }));
    const item = r.design.find((d) => /sealed/i.test(d.item))!;
    expect(item.ok).toBe(false);
  });

  it('reports a session without a settled rating sheet and counts no share for it', () => {
    const dir = freshRecord();
    const settled = path.join(dir, 'rating', 'settled');
    unlinkSync(path.join(settled, readdirSync(settled)[0]));
    const r = analyseRecord(dir);
    expect(r.errors.join('\n')).toMatch(/settled rating sheet/);
    expect(r.design.find((d) => /8 participants/.test(d.item))!.ok).toBe(false);
  });

  it('renders RESULTS.md with the numbers, thresholds and design items', () => {
    const text = renderResults(analyseRecord(freshRecord()), { input: 'synthetic-record' });
    expect(text).toMatch(/C001-NFR-006/);
    expect(text).toMatch(/0\.50/);
    expect(text).toMatch(/77\.5/);
    expect(text).toMatch(/155\.0/);
    expect(text).toMatch(/\+9\.4 percentage points/);
    expect(text).toMatch(/met/);
    expect(text).toMatch(/95\.5 %/); // 85 / 89
    expect(text).toMatch(/row-3\/P\d\d-s1: participant P\d\d was replaced by reserve P09/);
  });

  it('matches the committed fixture (rewrite it with write-synthetic-record.ts)', () => {
    const fresh = freshRecord();
    const files = listFiles(fresh);
    expect(listFiles(fixtureDir)).toEqual(files);
    for (const f of files) {
      expect(readFileSync(path.join(fixtureDir, f), 'utf8').replace(/\r\n/g, '\n'), f).toBe(
        readFileSync(path.join(fresh, f), 'utf8'),
      );
    }
  });
});
