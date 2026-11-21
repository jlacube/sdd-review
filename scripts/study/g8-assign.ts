/**
 * `npm run study -- g8-assign`: seeded draw of the participant rows of `60-test-plan.md` §6
 * item 5 (C001-T-109, run by the moderator in C001-T-112), and the record of reserves taking the
 * row of a dropped participant (§6 item 4).
 */
import { PARTICIPANT_CODE, ROW_COUNT, type Assignment } from './g8-model.js';
import { seededShuffle } from './g8-random.js';

export const ASSIGN_ALGORITHM =
  'g8-assign-v1: sha256-ctr Fisher-Yates over sorted participant codes';

export interface AssignInput {
  seed: string;
  participants: readonly string[];
  reserves: readonly string[];
  drawnAt: string;
}

function checkCodes(participants: readonly string[], reserves: readonly string[]): void {
  if (participants.length !== ROW_COUNT) {
    throw new Error(`the draw needs exactly ${ROW_COUNT} participants, got ${participants.length}`);
  }
  for (const c of [...participants, ...reserves]) {
    if (!PARTICIPANT_CODE.test(c)) {
      throw new Error(
        `"${c}" is not a participant code (P01, P02, …); names never enter the record`,
      );
    }
  }
  if (new Set(participants).size !== participants.length) {
    throw new Error('participant codes must be distinct');
  }
  for (const r of reserves) {
    if (participants.includes(r)) throw new Error(`reserve ${r} is also a participant`);
  }
  if (new Set(reserves).size !== reserves.length) throw new Error('reserve codes must be distinct');
}

function drawRows(seed: string, sorted: readonly string[]): Assignment['draw'] {
  return seededShuffle(sorted, seed).map((participant, i) => ({ row: i + 1, participant }));
}

export function createAssignment(input: AssignInput): Assignment {
  if (!input.seed.trim()) throw new Error('a non-empty seed is required (--seed <seed>)');
  checkCodes(input.participants, input.reserves);
  const participants = [...input.participants].sort();
  return {
    study: 'G-8',
    algorithm: ASSIGN_ALGORITHM,
    seed: input.seed,
    drawnAt: input.drawnAt,
    participants,
    reserves: [...input.reserves].sort(),
    draw: drawRows(input.seed, participants),
    replacements: [],
    dates: Array.from({ length: ROW_COUNT }, (_, i) => ({
      row: i + 1,
      session1: null,
      session2: null,
    })),
  };
}

/** Repeat the draw from the recorded seed and codes; returns the differences (empty: reproduced). */
export function verifyAssignment(a: Assignment): string[] {
  const problems: string[] = [];
  if (a.algorithm !== ASSIGN_ALGORITHM) {
    problems.push(`recorded algorithm "${a.algorithm}" is not "${ASSIGN_ALGORITHM}"`);
  }
  try {
    checkCodes(a.participants, a.reserves);
  } catch (e) {
    problems.push((e as Error).message);
    return problems;
  }
  const expected = drawRows(a.seed, [...a.participants].sort());
  for (const e of expected) {
    const got = a.draw.find((d) => d.row === e.row);
    if (got?.participant !== e.participant) {
      problems.push(
        `row ${e.row}: recorded ${got?.participant ?? 'nothing'}, the seed gives ${e.participant}`,
      );
    }
  }
  if (a.draw.length !== expected.length) {
    problems.push(`recorded draw has ${a.draw.length} rows, expected ${expected.length}`);
  }
  return problems;
}

/** The participant whose sessions count for a row: the drawn one, or the reserve who replaced them. */
export function currentParticipant(a: Assignment, row: number): string {
  const replaced = a.replacements.filter((r) => r.row === row);
  if (replaced.length > 0) return replaced[replaced.length - 1].reserve;
  const drawn = a.draw.find((d) => d.row === row);
  if (!drawn) throw new Error(`row ${row} is not in the draw`);
  return drawn.participant;
}

export function recordReplacement(
  a: Assignment,
  input: { row: number; reserve: string; recordedAt: string },
): Assignment {
  if (!a.reserves.includes(input.reserve)) {
    throw new Error(`${input.reserve} is not a reserve of the draw (${a.reserves.join(', ')})`);
  }
  if (a.replacements.some((r) => r.reserve === input.reserve)) {
    throw new Error(`reserve ${input.reserve} already took a row`);
  }
  const dropped = currentParticipant(a, input.row);
  return {
    ...a,
    replacements: [
      ...a.replacements,
      { row: input.row, dropped, reserve: input.reserve, recordedAt: input.recordedAt },
    ],
  };
}
