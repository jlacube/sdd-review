/**
 * Reading the G-8 record of `study/g8/record/` (layout in `study/g8/README.md`): the assignment,
 * the session folders `row-<n>/<participant>-s<k>/` with `log.json` and `form.md`, the rating
 * sheets and the opened sealed-list record. Shared by `g8-check-record` and `g8-analyse`.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import {
  CAP_MINUTES,
  CHANGES,
  METHODS,
  PARTICIPANT_CODE,
  RATERS,
  ratingFileName,
  sessionId,
  type Assignment,
  type FormDecision,
  type Finding,
  type RatingSheet,
  type SeededRecord,
  type SessionForm,
  type SessionLog,
} from './g8-model.js';

/** Split one Markdown table row into trimmed cells; `\|` stays a literal bar. */
function cells(line: string): string[] | null {
  const t = line.trim();
  if (!t.startsWith('|')) return null;
  const parts = t
    .slice(1, t.endsWith('|') && !t.endsWith('\\|') ? -1 : undefined)
    .split(/(?<!\\)\|/)
    .map((c) => c.trim().replace(/\\\|/g, '|'));
  return parts;
}

function sectionRows(text: string, heading: RegExp): string[][] {
  const rows: string[][] = [];
  let inside = false;
  for (const line of text.split(/\r?\n/)) {
    if (/^#{1,6}\s/.test(line)) {
      inside = heading.test(line);
      continue;
    }
    if (!inside) continue;
    const c = cells(line);
    if (!c || c.every((x) => /^:?-{3,}:?$/.test(x))) continue;
    rows.push(c);
  }
  return rows;
}

/** Parse a session form (`study/g8/forms/session-form.md` filled in). */
export function parseSessionForm(text: string): SessionForm {
  const decisions: FormDecision[] = sectionRows(text, /Decisions/i)
    .filter((c) => c[0] && !/^item$/i.test(c[0]))
    .map((c) => {
      const d = (c[1] ?? '').toLowerCase();
      return {
        item: c[0],
        decision: d.startsWith('accept') ? 'accept' : d.startsWith('reject') ? 'reject' : '',
      };
    });
  const findings: Finding[] = sectionRows(text, /Defects found/i)
    .filter((c) => /^F\d+$/i.test(c[0] ?? ''))
    .map((c) => ({
      id: c[0].toUpperCase(),
      file: c[1] ?? '',
      lines: c[2] ?? '',
      description: c[3] ?? '',
    }))
    .filter((f) => f.file || f.lines || f.description);
  return { decisions, findings };
}

export interface SessionTime {
  /** Opening to last decision, breaks subtracted, in minutes. */
  activeMinutes: number;
  /** What the analysis counts: capped sessions at the cap. */
  countedMinutes: number;
  errors: string[];
  warnings: string[];
}

function parseTime(value: unknown): number | null {
  if (
    typeof value !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?(Z|[+-]\d{2}:\d{2})$/.test(value)
  ) {
    return null;
  }
  const t = Date.parse(value);
  return Number.isNaN(t) ? null : t;
}

/** Review time of a session (`60-test-plan.md` §6 items 7 and 8). */
export function sessionMinutes(log: SessionLog): SessionTime {
  const errors: string[] = [];
  const warnings: string[] = [];
  const opened = parseTime(log.opened);
  const last = parseTime(log.lastDecision);
  if (opened === null) errors.push('opened is not an ISO 8601 time with offset');
  if (last === null) errors.push('lastDecision is not an ISO 8601 time with offset');
  if (opened === null || last === null) {
    return { activeMinutes: NaN, countedMinutes: NaN, errors, warnings };
  }
  if (last <= opened) errors.push('lastDecision is before or at opened');
  const breaks: [number, number][] = [];
  for (const [i, b] of (Array.isArray(log.breaks) ? log.breaks : []).entries()) {
    const s = parseTime(b?.start);
    const e = parseTime(b?.end);
    if (s === null || e === null || e <= s) {
      errors.push(`break ${i + 1} has no valid start and end`);
      continue;
    }
    if (s < opened || e > last) errors.push(`break ${i + 1} lies outside the session`);
    breaks.push([s, e]);
  }
  breaks.sort((x, y) => x[0] - y[0]);
  for (let i = 1; i < breaks.length; i++) {
    if (breaks[i][0] < breaks[i - 1][1]) errors.push('breaks overlap');
  }
  const pause = breaks.reduce((sum, [s, e]) => sum + (e - s), 0);
  const activeMinutes = (last - opened - pause) / 60_000;
  let countedMinutes = Math.min(activeMinutes, CAP_MINUTES);
  if (log.capped) {
    countedMinutes = CAP_MINUTES;
    if (activeMinutes < CAP_MINUTES - 1) {
      warnings.push(
        `marked capped after ${activeMinutes.toFixed(1)} active minutes, under the cap`,
      );
    }
  } else if (activeMinutes > CAP_MINUTES) {
    warnings.push(
      `${activeMinutes.toFixed(1)} active minutes, over the ${CAP_MINUTES}-minute cap but not marked capped; counted at the cap`,
    );
  }
  return { activeMinutes, countedMinutes, errors, warnings };
}

/** Field checks of a session log against the folder it sits in. */
export function validateLog(
  log: unknown,
  where: { row: number; participant: string; session: number },
): string[] {
  const errors: string[] = [];
  if (typeof log !== 'object' || log === null) return ['log.json is not a JSON object'];
  const l = log as Partial<SessionLog>;
  if (l.participant !== where.participant) {
    errors.push(
      `participant "${String(l.participant)}" differs from the folder (${where.participant})`,
    );
  }
  if (l.row !== where.row)
    errors.push(`row ${String(l.row)} differs from the folder (${where.row})`);
  if (l.session !== where.session) {
    errors.push(`session ${String(l.session)} differs from the folder (${where.session})`);
  }
  if (!CHANGES.includes(l.change as never))
    errors.push(`change "${String(l.change)}" is not A to D`);
  if (!METHODS.includes(l.method as never)) {
    errors.push(`method "${String(l.method)}" is not "assistant" or "diff"`);
  }
  if (typeof l.capped !== 'boolean') errors.push('capped is not true or false');
  if (!Array.isArray(l.breaks)) errors.push('breaks is not a list');
  return errors;
}

export interface SessionEntry {
  id: string;
  row: number;
  participant: string;
  session: 1 | 2;
  dir: string;
  log: SessionLog | null;
  form: SessionForm | null;
  problems: string[];
}

export type RowRatings = Partial<Record<(typeof RATERS)[number] | 'settled', RatingSheet>>;

export interface RecordData {
  root: string;
  assignment: Assignment | null;
  sessions: SessionEntry[];
  ratings: Map<string, RowRatings>;
  seeded: SeededRecord | null;
  problems: string[];
}

function readJson<T>(file: string, problems: string[], label: string): T | null {
  if (!existsSync(file)) return null;
  try {
    return JSON.parse(readFileSync(file, 'utf8')) as T;
  } catch (e) {
    problems.push(`${label}: not valid JSON (${(e as Error).message})`);
    return null;
  }
}

/** Read everything under a record root; problems are collected, not thrown. */
export function readRecord(root: string): RecordData {
  const problems: string[] = [];
  if (!existsSync(root) || !statSync(root).isDirectory()) {
    throw new Error(`record folder not found: ${root}`);
  }
  const assignment = readJson<Assignment>(
    path.join(root, 'assignment.json'),
    problems,
    'assignment.json',
  );
  const sessions: SessionEntry[] = [];
  for (const rowName of readdirSync(root).sort()) {
    const m = /^row-([1-8])$/.exec(rowName);
    if (!m) continue;
    const row = Number(m[1]);
    const rowDir = path.join(root, rowName);
    if (!statSync(rowDir).isDirectory()) continue;
    for (const name of readdirSync(rowDir).sort()) {
      const sm = /^(.+)-s([12])$/.exec(name);
      if (!sm || !PARTICIPANT_CODE.test(sm[1])) {
        problems.push(`${rowName}/${name}: not a session folder <participant code>-s<1|2>`);
        continue;
      }
      const participant = sm[1];
      const session = Number(sm[2]) as 1 | 2;
      const dir = path.join(rowDir, name);
      const id = sessionId(row, participant, session);
      const entryProblems: string[] = [];
      const logRaw = readJson<unknown>(path.join(dir, 'log.json'), entryProblems, `${id}/log.json`);
      let log: SessionLog | null = null;
      if (logRaw !== null) {
        const errs = validateLog(logRaw, { row, participant, session });
        entryProblems.push(...errs.map((e) => `${id}/log.json: ${e}`));
        log = logRaw as SessionLog;
      }
      const formFile = path.join(dir, 'form.md');
      const form = existsSync(formFile) ? parseSessionForm(readFileSync(formFile, 'utf8')) : null;
      sessions.push({ id, row, participant, session, dir, log, form, problems: entryProblems });
    }
  }
  const ratings = new Map<string, RowRatings>();
  for (const s of sessions) {
    const r: RowRatings = {};
    for (const who of [...RATERS, 'settled'] as const) {
      const sheet = readJson<RatingSheet>(
        path.join(root, 'rating', who, ratingFileName(s.id)),
        problems,
        `rating/${who}/${ratingFileName(s.id)}`,
      );
      if (sheet) r[who] = sheet;
    }
    ratings.set(s.id, r);
  }
  const seeded = readJson<SeededRecord>(
    path.join(root, 'rating', 'seeded.json'),
    problems,
    'rating/seeded.json',
  );
  return { root, assignment, sessions, ratings, seeded, problems };
}
