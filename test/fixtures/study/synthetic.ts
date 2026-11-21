/**
 * Synthetic G-8 record for the analysis tests (C001-T-109). Invented numbers, invented codes; no
 * real participant. The committed copy in `synthetic-record/` is written by
 * `npx tsx test/fixtures/study/write-synthetic-record.ts` and checked against this generator by
 * test/unit/study/g8-analyse.test.ts.
 *
 * Designed values (counted sessions, minutes and seeded defects found out of 8):
 *   review assistant:      60 65 70 75 80 85 90 95  → mean 77.5 min; found 46/64
 *   standard diff review: 140 150 160 170 180 180 120 140 → mean 155 min; found 40/64
 * Two diff sessions are capped (one 200 active minutes, one exactly 180), one assistant session
 * has a 15-minute break, row 3's first participant dropped after one session and was replaced
 * by reserve P09, one session has a duplicate finding and two sessions have findings outside the
 * sealed list. Rater 2 disagrees with rater 1 on 4 of 89 findings before discussion.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { createAssignment, recordReplacement } from '../../../scripts/study/g8-assign.js';
import {
  DEFECT_KINDS,
  ROW_TABLE,
  ratingFileName,
  sessionId,
  type ChangeLabel,
  type RatingSheet,
  type SeededRecord,
  type SessionLog,
} from '../../../scripts/study/g8-model.js';

interface Plan {
  minutes: number;
  found: number;
  breakMinutes?: number;
  capped?: boolean;
  /** Extra findings: 'dup' matches the first defect again, 'outside' matches none. */
  extra?: ('dup' | 'outside')[];
}

/** Row n: [first session, second session], methods and changes from `ROW_TABLE`. */
const PLAN: [Plan, Plan][] = [
  [
    { minutes: 60, found: 6, breakMinutes: 15, extra: ['dup', 'outside'] },
    { minutes: 140, found: 5 },
  ],
  [
    { minutes: 150, found: 6 },
    { minutes: 65, found: 7 },
  ],
  [
    { minutes: 70, found: 5 },
    { minutes: 160, found: 6 },
  ],
  [
    { minutes: 170, found: 5 },
    { minutes: 75, found: 6 },
  ],
  [
    { minutes: 80, found: 4 },
    { minutes: 200, found: 4, capped: true, extra: ['outside'] },
  ],
  [
    { minutes: 180, found: 5, breakMinutes: 30, capped: true },
    { minutes: 85, found: 5 },
  ],
  [
    { minutes: 90, found: 6 },
    { minutes: 120, found: 4 },
  ],
  [
    { minutes: 140, found: 5 },
    { minutes: 95, found: 7 },
  ],
];

/** Findings rater 2 labels differently from rater 1 (session ID by row and session, finding). */
const RATER_2_DIFFERS: { row: number; session: 1 | 2; finding: string; label: string }[] = [
  { row: 1, session: 1, finding: 'F8', label: 'A-08' },
  { row: 2, session: 1, finding: 'F1', label: 'B-02' },
  { row: 5, session: 2, finding: 'F5', label: 'D-05' },
  { row: 8, session: 2, finding: 'F7', label: 'outside' },
];

export interface SyntheticOptions {
  /** When the seeder opened the sealed lists (default: after the last session). */
  openedAt?: string;
}

const pad = (n: number) => String(n).padStart(2, '0');

function at(day: number, minutesAfterMidnight: number): string {
  const h = Math.floor(minutesAfterMidnight / 60);
  const m = minutesAfterMidnight % 60;
  return `2027-02-${pad(day)}T${pad(h)}:${pad(m)}:00+01:00`;
}

function write(file: string, content: string): void {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, content);
}

const json = (v: unknown) => `${JSON.stringify(v, null, 2)}\n`;

function formText(findings: { id: string; description: string }[], accept: boolean): string {
  return [
    '# G-8 session form (synthetic)',
    '',
    '## 1. Decisions',
    '',
    '| Item | Decision (accept / reject) | Reason (optional) |',
    '| --- | --- | --- |',
    `| Change as a whole | ${accept ? 'accept' : 'reject'} | |`,
    '| B1: synthetic requested behaviour one | accept | |',
    '| B2: synthetic requested behaviour two | reject | |',
    '',
    '## 2. Defects found',
    '',
    '| ID | File | Lines | What is wrong |',
    '| --- | --- | --- | --- |',
    ...findings.map((f) => `| ${f.id} | src/file-${f.id}.ts | 10-12 | ${f.description} |`),
    '',
  ].join('\n');
}

function writeSession(
  root: string,
  input: {
    row: number;
    participant: string;
    session: 1 | 2;
    change: ChangeLabel;
    method: 'assistant' | 'diff';
    day: number;
    plan: Plan;
  },
): { id: string; labels: string[] } {
  const { row, participant, session, change, method, day, plan } = input;
  const start = session === 1 ? 9 * 60 : 14 * 60;
  const breakMinutes = plan.breakMinutes ?? 0;
  const log: SessionLog = {
    participant,
    row,
    session,
    change,
    method,
    rcVersion: '1.0.0-rc.1',
    tutorialDone: method === 'assistant' ? true : null,
    opened: at(day, start),
    lastDecision: at(day, start + plan.minutes + breakMinutes),
    breaks:
      breakMinutes > 0
        ? [{ start: at(day, start + 30), end: at(day, start + 30 + breakMinutes) }]
        : [],
    capped: plan.capped ?? false,
    notes: '',
  };
  const labels: string[] = [];
  for (let k = 1; k <= plan.found; k++) labels.push(`${change}-${pad(k)}`);
  for (const e of plan.extra ?? []) labels.push(e === 'dup' ? `${change}-01` : 'outside');
  const findings = labels.map((_, i) => ({
    id: `F${i + 1}`,
    description: `synthetic finding ${i + 1}`,
  }));
  const dir = path.join(root, `row-${row}`, `${participant}-s${session}`);
  write(path.join(dir, 'log.json'), json(log));
  write(path.join(dir, 'form.md'), formText(findings, plan.found < 6));
  return { id: sessionId(row, participant, session), labels };
}

/** Write the synthetic record into `root` (the layout of `study/g8/record/`). */
export function writeSyntheticRecord(root: string, options: SyntheticOptions = {}): void {
  const participants = ['P01', 'P02', 'P03', 'P04', 'P05', 'P06', 'P07', 'P08'];
  let assignment = createAssignment({
    seed: 'synthetic-record',
    participants,
    reserves: ['P09', 'P10'],
    drawnAt: '2027-01-11T10:00:00+01:00',
  });
  assignment = recordReplacement(assignment, {
    row: 3,
    reserve: 'P09',
    recordedAt: '2027-02-02T18:00:00+01:00',
  });
  assignment.dates = assignment.dates.map((d) => ({
    row: d.row,
    session1: `2027-02-${pad(1 + d.row)}`,
    session2: `2027-02-${pad(3 + d.row)}`,
  }));
  write(path.join(root, 'assignment.json'), json(assignment));

  // The dropped participant of row 3: first session logged, not counted.
  const dropped = assignment.draw[2].participant;
  const droppedPlan = ROW_TABLE[2][0];
  writeSession(root, {
    row: 3,
    participant: dropped,
    session: 1,
    change: droppedPlan.change,
    method: droppedPlan.method,
    day: 1,
    plan: { minutes: 30, found: 8 },
  });

  const rated: {
    id: string;
    change: ChangeLabel;
    row: number;
    session: 1 | 2;
    labels: string[];
  }[] = [];
  for (let row = 1; row <= 8; row++) {
    const participant = row === 3 ? 'P09' : assignment.draw[row - 1].participant;
    for (const planned of ROW_TABLE[row - 1]) {
      const plan = PLAN[row - 1][planned.session - 1];
      const day = planned.session === 1 ? 1 + row : 3 + row;
      const s = writeSession(root, {
        row,
        participant,
        session: planned.session,
        change: planned.change,
        method: planned.method,
        day,
        plan,
      });
      rated.push({ ...s, change: planned.change, row, session: planned.session });
    }
  }

  for (const r of rated) {
    const settled: RatingSheet = {
      session: r.id,
      change: r.change,
      rater: 'settled',
      completedAt: '2027-02-22T16:00:00+01:00',
      matches: r.labels.map((label, i) => ({ finding: `F${i + 1}`, defect: label })),
    };
    const rater1: RatingSheet = {
      ...settled,
      rater: 'rater-1',
      completedAt: '2027-02-19T17:00:00+01:00',
    };
    const rater2: RatingSheet = {
      ...settled,
      rater: 'rater-2',
      completedAt: '2027-02-20T12:00:00+01:00',
      matches: settled.matches.map((m) => {
        const d = RATER_2_DIFFERS.find(
          (x) => x.row === r.row && x.session === r.session && x.finding === m.finding,
        );
        return d ? { ...m, defect: d.label } : m;
      }),
    };
    const name = ratingFileName(r.id);
    write(path.join(root, 'rating', 'rater-1', name), json(rater1));
    write(path.join(root, 'rating', 'rater-2', name), json(rater2));
    write(path.join(root, 'rating', 'settled', name), json(settled));
  }

  const seeded: SeededRecord = { changes: {} };
  for (const change of ['A', 'B', 'C', 'D'] as const) {
    seeded.changes[change] = {
      openedAt: options.openedAt ?? '2027-02-15T10:00:00+01:00',
      defects: Array.from({ length: 8 }, (_, i) => ({
        id: `${change}-${pad(i + 1)}`,
        kind: DEFECT_KINDS[i % DEFECT_KINDS.length],
      })),
    };
  }
  write(path.join(root, 'rating', 'seeded.json'), json(seeded));
}
