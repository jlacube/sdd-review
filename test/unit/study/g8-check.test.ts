import { mkdtempSync, readFileSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { checkRecord, scanPersonalData } from '../../../scripts/study/g8-check.js';
import { writeSyntheticRecord } from '../../fixtures/study/synthetic.js';

const repoRoot = fileURLToPath(new URL('../../../', import.meta.url));
const dirs: string[] = [];

function freshRecord(): string {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'g8-check-'));
  dirs.push(dir);
  writeSyntheticRecord(dir);
  return dir;
}

afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

function current(dir: string, row: number): string {
  const a = JSON.parse(readFileSync(path.join(dir, 'assignment.json'), 'utf8'));
  const rep = a.replacements.find((x: { row: number }) => x.row === row);
  return rep ? rep.reserve : a.draw[row - 1].participant;
}

function editLog(
  dir: string,
  row: number,
  session: number,
  edit: (log: Record<string, unknown>) => void,
): void {
  const file = path.join(dir, `row-${row}`, `${current(dir, row)}-s${session}`, 'log.json');
  const log = JSON.parse(readFileSync(file, 'utf8'));
  edit(log);
  writeFileSync(file, JSON.stringify(log, null, 2));
}

describe('g8-check-record', () => {
  it('passes a complete record', () => {
    const r = checkRecord(freshRecord(), [1, 2, 3, 4, 5, 6, 7, 8]);
    expect(r.errors).toEqual([]);
    expect(r.checkedSessions).toBe(16);
  });

  it('reports a session without a log or a form', () => {
    const dir = freshRecord();
    unlinkSync(path.join(dir, 'row-1', `${current(dir, 1)}-s1`, 'log.json'));
    unlinkSync(path.join(dir, 'row-2', `${current(dir, 2)}-s2`, 'form.md'));
    const r = checkRecord(dir, [1, 2]);
    expect(r.errors.join('\n')).toMatch(/row-1\/P\d\d-s1: no log\.json/);
    expect(r.errors.join('\n')).toMatch(/row-2\/P\d\d-s2: no form\.md/);
  });

  it('reports a missing release-candidate version and a missing time', () => {
    const dir = freshRecord();
    editLog(dir, 1, 1, (l) => (l.rcVersion = ''));
    editLog(dir, 1, 2, (l) => (l.lastDecision = ''));
    const errors = checkRecord(dir, [1]).errors.join('\n');
    expect(errors).toMatch(/release-candidate version/);
    expect(errors).toMatch(/lastDecision/);
  });

  it('reports a session whose change or method differs from the crossover table', () => {
    const dir = freshRecord();
    editLog(dir, 2, 1, (l) => (l.method = 'assistant'));
    expect(checkRecord(dir, [2]).errors.join('\n')).toMatch(/table of §6 item 5/);
  });

  it('reports sessions of one block on different release candidates', () => {
    const dir = freshRecord();
    editLog(dir, 2, 2, (l) => (l.rcVersion = '1.0.0-rc.2'));
    expect(checkRecord(dir, [1, 2]).errors.join('\n')).toMatch(/same release candidate/);
  });

  it('reports an assistant session without the tutorial', () => {
    const dir = freshRecord();
    editLog(dir, 1, 1, (l) => (l.tutorialDone = false));
    expect(checkRecord(dir, [1]).errors.join('\n')).toMatch(/tutorial/);
  });

  it('reports a form without the decision on the change as a whole', () => {
    const dir = freshRecord();
    const file = path.join(dir, 'row-1', `${current(dir, 1)}-s1`, 'form.md');
    writeFileSync(
      file,
      readFileSync(file, 'utf8').replace(
        /\| Change as a whole \| \w+ \|/,
        '| Change as a whole | |',
      ),
    );
    expect(checkRecord(dir, [1]).errors.join('\n')).toMatch(/change as a whole/);
  });

  it('reports personal data in the record', () => {
    const dir = freshRecord();
    editLog(dir, 1, 1, (l) => (l.notes = 'call back on +33 6 12 34 56 78 or jane@example.org'));
    const errors = checkRecord(dir, [1]).errors.join('\n');
    expect(errors).toMatch(/e-mail address/);
    expect(errors).toMatch(/phone number/);
  });

  it('refuses rows outside 1 to 8', () => {
    expect(() => checkRecord(freshRecord(), [9])).toThrow(/rows 1 to 8/);
  });
});

describe('personal-data scan', () => {
  it('finds e-mail addresses and phone numbers but not timestamps or line ranges', () => {
    expect(scanPersonalData('mail me: a.b@c.io')).toEqual(['e-mail address']);
    expect(scanPersonalData('tel 06 12 34 56 78')).toEqual(['phone number']);
    expect(scanPersonalData('+44 20 7946 0958')).toEqual(['phone number']);
    expect(scanPersonalData('"opened": "2027-02-02T09:00:00+01:00", lines 1200-1260')).toEqual([]);
  });
});

describe('the study is never shipped', () => {
  it('keeps study/ and scripts/ out of the published package files', () => {
    const pkg = JSON.parse(readFileSync(`${repoRoot}package.json`, 'utf8'));
    for (const entry of pkg.files as string[]) expect(entry).not.toMatch(/^(study|scripts|test)/);
  });
});
