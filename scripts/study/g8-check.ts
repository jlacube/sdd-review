/**
 * `npm run study -- g8-check-record --rows <list>`: after each session block (C001-T-113 to
 * C001-T-116, and C001-T-102 for all rows), checks that every session of the rows has a log, a
 * form, the release-candidate version and a time, that change and method follow the table of
 * `60-test-plan.md` §6 item 5, and that the record holds no personal data.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { currentParticipant } from './g8-assign.js';
import { RC_VERSION, ROW_COUNT, ROW_TABLE } from './g8-model.js';
import { readRecord, sessionMinutes } from './g8-record.js';

/** Personal data that must not enter the record (heuristic: e-mail addresses and phone numbers). */
const PERSONAL_DATA: { label: string; pattern: RegExp }[] = [
  { label: 'e-mail address', pattern: /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/ },
  {
    label: 'phone number',
    pattern:
      /(?:(?<![\w:])(?:\+|00)\d{1,3}[ .-]?\d(?:[ .-]?\d){7,}(?!\d))|(?:\b0[1-9](?:[ .-]?\d{2}){4}\b)/,
  },
];

export function scanPersonalData(text: string): string[] {
  return PERSONAL_DATA.filter((p) => p.pattern.test(text)).map((p) => p.label);
}

function filesUnder(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) out.push(...filesUnder(p));
    else out.push(p);
  }
  return out;
}

export interface CheckResult {
  errors: string[];
  warnings: string[];
  checkedSessions: number;
}

export function parseRows(list: string): number[] {
  const rows = list.split(',').map((x) => Number(x.trim()));
  if (rows.some((r) => !Number.isInteger(r)))
    throw new Error(`--rows: "${list}" is not a list of row numbers`);
  return rows;
}

export function checkRecord(root: string, rows: readonly number[]): CheckResult {
  if (rows.length === 0 || rows.some((r) => !Number.isInteger(r) || r < 1 || r > ROW_COUNT)) {
    throw new Error(`--rows takes rows 1 to ${ROW_COUNT}, e.g. --rows 1,2`);
  }
  const data = readRecord(root);
  const errors = [...data.problems];
  const warnings: string[] = [];
  let checkedSessions = 0;
  if (!data.assignment) {
    return {
      errors: [...errors, 'assignment.json is missing (run g8-assign first)'],
      warnings,
      checkedSessions,
    };
  }
  const rcVersions = new Map<string, string[]>();
  for (const row of rows) {
    const participant = currentParticipant(data.assignment, row);
    const dates = data.assignment.dates.find((d) => d.row === row);
    const days: string[] = [];
    for (const planned of ROW_TABLE[row - 1]) {
      const id = `row-${row}/${participant}-s${planned.session}`;
      const entry = data.sessions.find(
        (s) => s.row === row && s.participant === participant && s.session === planned.session,
      );
      if (!entry) {
        errors.push(`${id}: no session folder`);
        continue;
      }
      checkedSessions++;
      errors.push(...entry.problems);
      if (!entry.log) errors.push(`${id}: no log.json`);
      if (!entry.form) errors.push(`${id}: no form.md`);
      if (entry.form && entry.form.decisions[0]?.decision === '') {
        errors.push(`${id}: the form has no decision on the change as a whole`);
      }
      if (entry.form && entry.form.decisions.slice(1).some((d) => d.decision === '')) {
        warnings.push(`${id}: a requested behaviour in the form has no decision`);
      }
      const log = entry.log;
      if (!log) continue;
      if (typeof log.rcVersion !== 'string' || !RC_VERSION.test(log.rcVersion)) {
        errors.push(`${id}: no release-candidate version (1.0.0-rc.<n>) in log.json`);
      } else {
        rcVersions.set(log.rcVersion, [...(rcVersions.get(log.rcVersion) ?? []), id]);
      }
      if (log.change !== planned.change || log.method !== planned.method) {
        errors.push(
          `${id}: logged change ${log.change} with ${log.method}; the table of §6 item 5 says ${planned.change} with ${planned.method}`,
        );
      }
      if (log.method === 'assistant' && log.tutorialDone !== true) {
        errors.push(`${id}: no tutorial logged before the assistant session (§6 item 6)`);
      }
      const time = sessionMinutes(log);
      errors.push(...time.errors.map((e) => `${id}: ${e}`));
      warnings.push(...time.warnings.map((w) => `${id}: ${w}`));
      if (typeof log.opened === 'string') days.push(log.opened.slice(0, 10));
      const planned_date = planned.session === 1 ? dates?.session1 : dates?.session2;
      if (planned_date && typeof log.opened === 'string' && !log.opened.startsWith(planned_date)) {
        warnings.push(`${id}: held ${log.opened.slice(0, 10)}, planned ${planned_date}`);
      }
    }
    if (days.length === 2) {
      const gap = (Date.parse(days[1]) - Date.parse(days[0])) / 86_400_000;
      if (gap < 1)
        warnings.push(`row ${row}: the two sessions are not on different days in row order`);
      if (gap > 7) warnings.push(`row ${row}: the two sessions are ${gap} days apart (at most 7)`);
    }
  }
  if (rcVersions.size > 1) {
    errors.push(
      `the sessions do not all run on the same release candidate: ${[...rcVersions.entries()]
        .map(([v, ids]) => `${v} (${ids.join(', ')})`)
        .join('; ')}`,
    );
  }
  for (const file of filesUnder(root)) {
    const found = scanPersonalData(readFileSync(file, 'utf8'));
    for (const label of found) {
      errors.push(
        `${path.relative(root, file).replace(/\\/g, '/')}: looks like personal data (${label}); personal data stays with the moderator`,
      );
    }
  }
  return { errors, warnings, checkedSessions };
}
