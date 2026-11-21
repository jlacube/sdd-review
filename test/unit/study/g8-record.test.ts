import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parseSessionForm, sessionMinutes } from '../../../scripts/study/g8-record.js';
import type { SessionLog } from '../../../scripts/study/g8-model.js';

const repoRoot = fileURLToPath(new URL('../../../', import.meta.url));

function log(over: Partial<SessionLog> = {}): SessionLog {
  return {
    participant: 'P01',
    row: 1,
    session: 1,
    change: 'A',
    method: 'assistant',
    rcVersion: '1.0.0-rc.1',
    tutorialDone: true,
    opened: '2027-02-02T09:00:00+01:00',
    lastDecision: '2027-02-02T10:00:00+01:00',
    breaks: [],
    capped: false,
    notes: '',
    ...over,
  };
}

describe('session form', () => {
  it('reads the decisions and the filled finding rows, ignoring empty template rows', () => {
    const form = parseSessionForm(
      [
        '# G-8 session form',
        '',
        '## 1. Decisions',
        '',
        '| Item | Decision (accept / reject) | Reason (optional) |',
        '| --- | --- | --- |',
        '| Change as a whole | Reject | two defects |',
        '| B1: export to CSV | accept | |',
        '| B2: <requested behaviour> | | |',
        '',
        '## 2. Defects found',
        '',
        '| ID | File | Lines | What is wrong |',
        '| --- | --- | --- | --- |',
        '| F1 | src/a.ts | 10-12 | off by one in the loop \\| bound |',
        '| F2 | | | test asserts nothing |',
        '| F3 | | | |',
      ].join('\n'),
    );
    expect(form.decisions).toEqual([
      { item: 'Change as a whole', decision: 'reject' },
      { item: 'B1: export to CSV', decision: 'accept' },
      { item: 'B2: <requested behaviour>', decision: '' },
    ]);
    expect(form.findings).toEqual([
      { id: 'F1', file: 'src/a.ts', lines: '10-12', description: 'off by one in the loop | bound' },
      { id: 'F2', file: '', lines: '', description: 'test asserts nothing' },
    ]);
  });

  it('parses the blank template in study/g8/forms/ to no decision and no finding', () => {
    const text = readFileSync(`${repoRoot}study/g8/forms/session-form.md`, 'utf8');
    const form = parseSessionForm(text);
    expect(form.findings).toEqual([]);
    expect(form.decisions[0]).toEqual({ item: 'Change as a whole', decision: '' });
  });
});

describe('review time of a session', () => {
  it('is wall-clock time from opening to last decision', () => {
    expect(sessionMinutes(log())).toMatchObject({ activeMinutes: 60, countedMinutes: 60 });
  });

  it('subtracts breaks', () => {
    const t = sessionMinutes(
      log({
        lastDecision: '2027-02-02T10:15:00+01:00',
        breaks: [
          { start: '2027-02-02T09:30:00+01:00', end: '2027-02-02T09:40:00+01:00' },
          { start: '2027-02-02T09:50:00+01:00', end: '2027-02-02T09:55:00+01:00' },
        ],
      }),
    );
    expect(t).toMatchObject({ activeMinutes: 60, countedMinutes: 60, errors: [] });
  });

  it('counts a capped session at the cap', () => {
    const t = sessionMinutes(log({ lastDecision: '2027-02-02T12:20:00+01:00', capped: true }));
    expect(t).toMatchObject({ activeMinutes: 200, countedMinutes: 180, errors: [] });
  });

  it('counts a session over the cap at the cap and says it was not marked capped', () => {
    const t = sessionMinutes(log({ lastDecision: '2027-02-02T12:20:00+01:00' }));
    expect(t.countedMinutes).toBe(180);
    expect(t.warnings.join()).toMatch(/not marked capped/);
  });

  it('refuses breaks outside the session, overlapping breaks and a reversed session', () => {
    expect(
      sessionMinutes(
        log({ breaks: [{ start: '2027-02-02T08:30:00+01:00', end: '2027-02-02T09:10:00+01:00' }] }),
      ).errors.join(),
    ).toMatch(/outside the session/);
    expect(
      sessionMinutes(
        log({
          breaks: [
            { start: '2027-02-02T09:10:00+01:00', end: '2027-02-02T09:30:00+01:00' },
            { start: '2027-02-02T09:20:00+01:00', end: '2027-02-02T09:40:00+01:00' },
          ],
        }),
      ).errors.join(),
    ).toMatch(/overlap/);
    expect(
      sessionMinutes(log({ lastDecision: '2027-02-02T08:00:00+01:00' })).errors.join(),
    ).toMatch(/before/);
    expect(sessionMinutes(log({ opened: 'yesterday' })).errors.join()).toMatch(/opened/);
  });
});
