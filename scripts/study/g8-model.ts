/**
 * G-8 comparison study (C001-T-109): constants and record types shared by the study commands.
 * The protocol is `60-test-plan.md` §6 of CHG-001; `10-spec/30-nfr/nfr.md` §3 stays the rule.
 * Nothing here is shipped: `study/` and `scripts/` are outside package.json `files`.
 */

export type Method = 'assistant' | 'diff';
export type ChangeLabel = 'A' | 'B' | 'C' | 'D';

export const CHANGES: readonly ChangeLabel[] = ['A', 'B', 'C', 'D'];
export const METHODS: readonly Method[] = ['assistant', 'diff'];
export const METHOD_NAMES: Record<Method, string> = {
  assistant: 'review assistant',
  diff: 'standard diff review',
};

/** Session cap of `nfr.md` §3 item 7: a capped session counts at the cap. */
export const CAP_MINUTES = 180;
/** Participants of `nfr.md` §3 item 1 and the rows of `60-test-plan.md` §6 item 5. */
export const ROW_COUNT = 8;
/** At least 8 seeded defects per change (`nfr.md` §3 item 3). */
export const MIN_DEFECTS_PER_CHANGE = 8;
/** C001-NFR-006 threshold: ratio of mean review times at most 0.50. */
export const NFR_006_MAX_RATIO = 0.5;
/** C001-NFR-007 threshold: found-share difference at least 0 percentage points. */
export const NFR_007_MIN_DIFFERENCE_PP = 0;

/** The six defect kinds of `nfr.md` §3 item 3. */
export const DEFECT_KINDS = [
  'wrong-logic',
  'unrequested-behaviour',
  'requested-behaviour-missing',
  'architecture-violation',
  'test-not-checking-subject',
  'security-weakness',
] as const;
export type DefectKind = (typeof DEFECT_KINDS)[number];

export interface PlannedSession {
  session: 1 | 2;
  change: ChangeLabel;
  method: Method;
}

/** The counterbalanced crossover table of `60-test-plan.md` §6 item 5, row 1 to row 8. */
export const ROW_TABLE: readonly (readonly [PlannedSession, PlannedSession])[] = [
  [
    { session: 1, change: 'A', method: 'assistant' },
    { session: 2, change: 'B', method: 'diff' },
  ],
  [
    { session: 1, change: 'B', method: 'diff' },
    { session: 2, change: 'A', method: 'assistant' },
  ],
  [
    { session: 1, change: 'B', method: 'assistant' },
    { session: 2, change: 'A', method: 'diff' },
  ],
  [
    { session: 1, change: 'A', method: 'diff' },
    { session: 2, change: 'B', method: 'assistant' },
  ],
  [
    { session: 1, change: 'C', method: 'assistant' },
    { session: 2, change: 'D', method: 'diff' },
  ],
  [
    { session: 1, change: 'D', method: 'diff' },
    { session: 2, change: 'C', method: 'assistant' },
  ],
  [
    { session: 1, change: 'D', method: 'assistant' },
    { session: 2, change: 'C', method: 'diff' },
  ],
  [
    { session: 1, change: 'C', method: 'diff' },
    { session: 2, change: 'D', method: 'assistant' },
  ],
];

/** Participant codes are the only participant identity in the repository. */
export const PARTICIPANT_CODE = /^P\d{2}$/;
/** Release-candidate versions the sessions run on (`75-rollout.md`: `1.0.0-rc.<n>`). */
export const RC_VERSION = /^\d+\.\d+\.\d+-rc\.\d+$/;
/** Seeded defect IDs: change label, dash, two digits (`A-01`). */
export const DEFECT_ID = /^[A-D]-\d{2}$/;
/** Label a rater gives a finding that matches no seeded defect. */
export const OUTSIDE = 'outside';
export const RATERS = ['rater-1', 'rater-2'] as const;
export type Rater = (typeof RATERS)[number];

/** `study/g8/record/assignment.json` (C001-T-112). */
export interface Assignment {
  study: 'G-8';
  algorithm: string;
  seed: string;
  drawnAt: string;
  /** The participant codes the draw ran over, sorted. */
  participants: string[];
  reserves: string[];
  /** The draw itself; never edited after the draw. Row n is draw[n - 1]. */
  draw: { row: number; participant: string }[];
  /** Replacements of `60-test-plan.md` §6 item 4: a reserve takes the row from its first session. */
  replacements: { row: number; dropped: string; reserve: string; recordedAt: string }[];
  /** Planned session dates (YYYY-MM-DD) per row, filled by the moderator; null until scheduled. */
  dates: { row: number; session1: string | null; session2: string | null }[];
}

/** `row-<n>/<participant>-s<k>/log.json`: the moderator session log (`60-test-plan.md` §6 item 8). */
export interface SessionLog {
  participant: string;
  row: number;
  session: 1 | 2;
  change: ChangeLabel;
  method: Method;
  rcVersion: string;
  /** Tutorial on the practice change held directly before the session (assistant sessions). */
  tutorialDone: boolean | null;
  /** ISO 8601 with offset: change opened. */
  opened: string;
  /** ISO 8601 with offset: the participant's last decision (or the cap). */
  lastDecision: string;
  breaks: { start: string; end: string }[];
  /** The moderator stopped the session at the 3-hour cap. */
  capped: boolean;
  notes: string;
}

/** One finding the participant wrote into the session form. */
export interface Finding {
  id: string;
  file: string;
  lines: string;
  description: string;
}

export interface FormDecision {
  item: string;
  decision: 'accept' | 'reject' | '';
}

export interface SessionForm {
  decisions: FormDecision[];
  findings: Finding[];
}

/** `rating/<rater>/<row>-<participant>-s<k>.json` and `rating/settled/…`. */
export interface RatingSheet {
  session: string;
  change: ChangeLabel;
  rater: Rater | 'settled';
  completedAt: string;
  matches: { finding: string; defect: string; note?: string }[];
}

/** `rating/seeded.json`: IDs and kinds of the opened sealed lists, written by `g8-unseal`. */
export interface SeededRecord {
  changes: Partial<
    Record<ChangeLabel, { openedAt: string; defects: { id: string; kind: string }[] }>
  >;
}

/** The session ID used in rating sheet names and reports: `row-1/P03-s1`. */
export function sessionId(row: number, participant: string, session: number): string {
  return `row-${row}/${participant}-s${session}`;
}

/** File name of a rating sheet for a session ID. */
export function ratingFileName(id: string): string {
  return `${id.replace('/', '-')}.json`;
}
