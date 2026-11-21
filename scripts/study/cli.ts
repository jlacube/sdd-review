/**
 * `npm run study -- <step>`: the G-8 comparison-study commands (C001-T-109; `10-strategy.md` §4).
 * See `study/g8/README.md` for who runs which step and when.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { analyseRecord, renderResults } from './g8-analyse.js';
import {
  createAssignment,
  currentParticipant,
  recordReplacement,
  verifyAssignment,
} from './g8-assign.js';
import { checkRecord, parseRows } from './g8-check.js';
import {
  CHANGES,
  ROW_COUNT,
  ROW_TABLE,
  type Assignment,
  type ChangeLabel,
  type SeededRecord,
  type SessionLog,
} from './g8-model.js';
import { readRecord } from './g8-record.js';
import {
  assertOutsideRepository,
  openSealedList,
  PASSPHRASE_ENV,
  sealList,
  type PlainSealedList,
  type SealedFile,
} from './g8-seal.js';

const here = path.dirname(fileURLToPath(import.meta.url));
export const repoRoot = path.resolve(here, '..', '..');
const studyDir = path.join(repoRoot, 'study', 'g8');
const defaultRecord = path.join(studyDir, 'record');

const USAGE = `usage: npm run study -- <step> [options]

steps (G-8 comparison study, protocol: 60-test-plan.md §6 of CHG-001):
  g8-assign --seed <seed> --participants P01,...,P08 [--reserves P09,P10] [--dry-run]
      seeded draw of the participant rows; writes record/assignment.json (refuses to redraw)
  g8-assign --dry-run
      repeat the recorded draw from its seed and compare with record/assignment.json
  g8-assign --replace-row <n> --reserve <code>
      record that a reserve takes row <n> of a dropped participant from its first session
  g8-new-session --row <n> --session <1|2> [--rc <1.0.0-rc.N>]
      create row-<n>/<participant>-s<k>/ with log.json (change, method from the table) and form.md
  g8-check-record --rows <list>
      every session of the rows has a log, a form, the release-candidate version and a time
  g8-analyse [--input <record dir>] [--out <file>]
      means per method and per change, NFR-006 ratio, NFR-007 difference, raters' agreement;
      writes study/g8/RESULTS.md for the study record, prints for any other --input unless --out
  g8-seal --change <A-D> --in <plaintext list outside the repository>
      encrypt a sealed list into study/g8/sealed/<change>.sealed.json (passphrase: ${PASSPHRASE_ENV})
  g8-unseal --change <A-D> --out <file outside the repository>
      after the last session: decrypt, write the list for the raters, record IDs and kinds in
      record/rating/seeded.json
options for every step: --record <dir> (default study/g8/record)
`;

function parseArgs(argv: string[]): { flags: Map<string, string | true> } {
  const flags = new Map<string, string | true>();
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) throw new Error(`unexpected argument "${a}"`);
    const next = argv[i + 1];
    if (next !== undefined && !next.startsWith('--')) {
      flags.set(a.slice(2), next);
      i++;
    } else {
      flags.set(a.slice(2), true);
    }
  }
  return { flags };
}

function str(flags: Map<string, string | true>, name: string): string | undefined {
  const v = flags.get(name);
  if (v === true) throw new Error(`--${name} needs a value`);
  return v;
}

function codes(v: string | undefined): string[] {
  return v
    ? v
        .split(',')
        .map((x) => x.trim())
        .filter(Boolean)
    : [];
}

/** A path relative to the repository when inside it, absolute otherwise. */
function show(p: string): string {
  const rel = path.relative(repoRoot, p);
  return rel && !rel.startsWith('..') && !path.isAbsolute(rel) ? rel.replace(/\\/g, '/') : p;
}

const json = (v: unknown) => `${JSON.stringify(v, null, 2)}\n`;
const nowIso = () => new Date().toISOString();

function readAssignment(record: string): Assignment {
  const file = path.join(record, 'assignment.json');
  if (!existsSync(file)) throw new Error(`${file} does not exist; run g8-assign first`);
  return JSON.parse(readFileSync(file, 'utf8')) as Assignment;
}

function assign(flags: Map<string, string | true>, record: string): number {
  const file = path.join(record, 'assignment.json');
  const replaceRow = str(flags, 'replace-row');
  if (replaceRow !== undefined) {
    const reserve = str(flags, 'reserve');
    if (!reserve) throw new Error('--replace-row needs --reserve <code>');
    const updated = recordReplacement(readAssignment(record), {
      row: Number(replaceRow),
      reserve,
      recordedAt: nowIso(),
    });
    writeFileSync(file, json(updated));
    const r = updated.replacements[updated.replacements.length - 1];
    console.log(
      `g8-assign: row ${r.row}: ${r.reserve} replaces ${r.dropped}, from the first session`,
    );
    return 0;
  }
  const dryRun = flags.get('dry-run') === true;
  const seed = str(flags, 'seed');
  const participants = codes(str(flags, 'participants'));
  if (dryRun && participants.length === 0) {
    const recorded = readAssignment(record);
    if (seed !== undefined && seed !== recorded.seed) {
      console.log(
        `g8-assign --dry-run: FAILED: recorded seed is "${recorded.seed}", not "${seed}"`,
      );
      return 1;
    }
    const problems = verifyAssignment(recorded);
    for (const p of problems) console.log(`error: ${p}`);
    console.log(
      problems.length === 0
        ? `g8-assign --dry-run: ok (seed "${recorded.seed}" reproduces the recorded draw)`
        : 'g8-assign --dry-run: FAILED',
    );
    return problems.length === 0 ? 0 : 1;
  }
  if (seed === undefined) throw new Error('--seed <seed> is required');
  const a = createAssignment({
    seed,
    participants,
    reserves: codes(str(flags, 'reserves')),
    drawnAt: nowIso(),
  });
  for (const d of a.draw) {
    const [s1, s2] = ROW_TABLE[d.row - 1];
    console.log(
      `row ${d.row}: ${d.participant}  first ${s1.change} with ${s1.method}, then ${s2.change} with ${s2.method}`,
    );
  }
  if (dryRun) {
    console.log('g8-assign --dry-run: nothing written');
    return 0;
  }
  if (existsSync(file)) {
    throw new Error(
      `${file} exists: the draw is made once (use --dry-run to check it, --replace-row for a reserve)`,
    );
  }
  mkdirSync(record, { recursive: true });
  writeFileSync(file, json(a));
  console.log(`g8-assign: written ${show(file)}; fill in the session dates there`);
  return 0;
}

function newSession(flags: Map<string, string | true>, record: string): number {
  const row = Number(str(flags, 'row'));
  const session = Number(str(flags, 'session'));
  if (!Number.isInteger(row) || row < 1 || row > ROW_COUNT) throw new Error('--row takes 1 to 8');
  if (session !== 1 && session !== 2) throw new Error('--session takes 1 or 2');
  const participant = currentParticipant(readAssignment(record), row);
  const planned = ROW_TABLE[row - 1][session - 1];
  const dir = path.join(record, `row-${row}`, `${participant}-s${session}`);
  if (existsSync(dir)) throw new Error(`${dir} exists`);
  mkdirSync(dir, { recursive: true });
  const log: SessionLog = {
    participant,
    row,
    session: planned.session,
    change: planned.change,
    method: planned.method,
    rcVersion: str(flags, 'rc') ?? '',
    tutorialDone: planned.method === 'assistant' ? false : null,
    opened: '',
    lastDecision: '',
    breaks: [],
    capped: false,
    notes: '',
  };
  writeFileSync(path.join(dir, 'log.json'), json(log));
  writeFileSync(
    path.join(dir, 'form.md'),
    readFileSync(path.join(studyDir, 'forms', 'session-form.md'), 'utf8'),
  );
  console.log(`g8-new-session: ${show(dir)} (change ${planned.change}, ${planned.method})`);
  return 0;
}

function check(flags: Map<string, string | true>, record: string): number {
  const rows = str(flags, 'rows');
  if (!rows) throw new Error('--rows <list> is required, e.g. --rows 1,2');
  const r = checkRecord(record, parseRows(rows));
  for (const w of r.warnings) console.log(`warning: ${w}`);
  for (const e of r.errors) console.log(`error: ${e}`);
  console.log(
    `g8-check-record: ${r.errors.length === 0 ? 'ok' : 'FAILED'} (rows ${rows}, ${r.checkedSessions} sessions, ${r.errors.length} errors, ${r.warnings.length} warnings)`,
  );
  return r.errors.length === 0 ? 0 : 1;
}

function analyse(flags: Map<string, string | true>): number {
  const input = path.resolve(str(flags, 'input') ?? defaultRecord);
  const outFlag = str(flags, 'out');
  const isStudyRecord = input === path.resolve(defaultRecord);
  const out = outFlag
    ? path.resolve(outFlag)
    : isStudyRecord
      ? path.join(studyDir, 'RESULTS.md')
      : null;
  const result = analyseRecord(input);
  const text = renderResults(result, {
    input: show(input) || '.',
    generatedAt: nowIso(),
  });
  if (out) {
    writeFileSync(out, text);
    console.log(`g8-analyse: written ${show(out)}`);
  } else {
    console.log(text);
  }
  const ok = result.errors.length === 0 && result.design.every((d) => d.ok);
  console.log(
    `g8-analyse: ${ok ? 'complete record' : 'INCOMPLETE record'}; ratio ${
      result.ratio?.toFixed(2) ?? '—'
    } (NFR-006 ${result.ratioMet === null ? '—' : result.ratioMet ? 'met' : 'missed'}), difference ${
      result.differencePp?.toFixed(1) ?? '—'
    } points (NFR-007 ${result.differenceMet === null ? '—' : result.differenceMet ? 'met' : 'missed'})`,
  );
  return ok ? 0 : 1;
}

function passphrase(): string {
  const p = process.env[PASSPHRASE_ENV];
  if (!p) throw new Error(`set the passphrase in the environment variable ${PASSPHRASE_ENV}`);
  return p;
}

function changeFlag(flags: Map<string, string | true>): ChangeLabel {
  const c = str(flags, 'change');
  if (!CHANGES.includes(c as ChangeLabel)) throw new Error('--change takes A, B, C or D');
  return c as ChangeLabel;
}

function seal(flags: Map<string, string | true>): number {
  const change = changeFlag(flags);
  const input = str(flags, 'in');
  if (!input) throw new Error('--in <plaintext list> is required');
  assertOutsideRepository(input, repoRoot);
  const list = JSON.parse(readFileSync(input, 'utf8')) as PlainSealedList;
  if (list.change !== change) throw new Error(`${input} is the list of change ${list.change}`);
  const sealed = sealList(list, passphrase());
  const out = path.join(studyDir, 'sealed', `${change}.sealed.json`);
  if (existsSync(out)) throw new Error(`${out} exists; a sealed list is written once`);
  mkdirSync(path.dirname(out), { recursive: true });
  writeFileSync(out, json(sealed));
  console.log(
    `g8-seal: written ${show(out)} (${list.defects.length} defects, seeded HEAD ${list.seededHead}); keep the passphrase and the plaintext outside the repository`,
  );
  return 0;
}

function unseal(flags: Map<string, string | true>, record: string): number {
  const change = changeFlag(flags);
  const out = str(flags, 'out');
  if (!out) throw new Error('--out <file outside the repository> is required');
  assertOutsideRepository(out, repoRoot);
  const data = readRecord(record);
  const a = data.assignment;
  if (!a) throw new Error('assignment.json is missing: the sessions have not run');
  const missing: string[] = [];
  for (let row = 1; row <= ROW_COUNT; row++) {
    const p = currentParticipant(a, row);
    for (const s of [1, 2] as const) {
      const entry = data.sessions.find(
        (x) => x.row === row && x.participant === p && x.session === s,
      );
      if (!entry?.log?.lastDecision) missing.push(`row-${row}/${p}-s${s}`);
    }
  }
  if (missing.length > 0) {
    throw new Error(
      `the sealed lists stay sealed until every session has ended; not yet logged: ${missing.join(', ')}`,
    );
  }
  const sealed = JSON.parse(
    readFileSync(path.join(studyDir, 'sealed', `${change}.sealed.json`), 'utf8'),
  ) as SealedFile;
  const list = openSealedList(sealed, passphrase());
  mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
  writeFileSync(out, json(list));
  const seededFile = path.join(record, 'rating', 'seeded.json');
  const seeded: SeededRecord = existsSync(seededFile)
    ? (JSON.parse(readFileSync(seededFile, 'utf8')) as SeededRecord)
    : { changes: {} };
  if (seeded.changes[change]) throw new Error(`${seededFile} already records change ${change}`);
  seeded.changes[change] = {
    openedAt: nowIso(),
    defects: list.defects.map((d) => ({ id: d.id, kind: d.kind })),
  };
  mkdirSync(path.dirname(seededFile), { recursive: true });
  writeFileSync(seededFile, json(seeded));
  console.log(
    `g8-unseal: change ${change} opened; list for the raters at ${out}; IDs and kinds recorded in ${show(seededFile)}`,
  );
  return 0;
}

export function main(argv: string[]): number {
  const [step, ...rest] = argv;
  if (!step || step === '--help' || step === 'help') {
    console.log(USAGE);
    return step ? 0 : 2;
  }
  try {
    const { flags } = parseArgs(rest);
    const record = path.resolve(str(flags, 'record') ?? defaultRecord);
    switch (step) {
      case 'g8-assign':
        return assign(flags, record);
      case 'g8-new-session':
        return newSession(flags, record);
      case 'g8-check-record':
        return check(flags, record);
      case 'g8-analyse':
        return analyse(flags);
      case 'g8-seal':
        return seal(flags);
      case 'g8-unseal':
        return unseal(flags, record);
      default:
        console.error(`unknown step "${step}"\n\n${USAGE}`);
        return 2;
    }
  } catch (e) {
    console.error(`${step}: ${(e as Error).message}`);
    return 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  process.exitCode = main(process.argv.slice(2));
}
