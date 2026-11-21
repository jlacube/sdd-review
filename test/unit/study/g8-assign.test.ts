import { describe, expect, it } from 'vitest';
import {
  ASSIGN_ALGORITHM,
  createAssignment,
  currentParticipant,
  recordReplacement,
  verifyAssignment,
} from '../../../scripts/study/g8-assign.js';
import { seededShuffle, seededUniform } from '../../../scripts/study/g8-random.js';

const participants = ['P08', 'P01', 'P02', 'P03', 'P04', 'P05', 'P06', 'P07'];
const reserves = ['P09', 'P10'];
const at = '2027-01-04T09:00:00+01:00';

describe('seeded random draw', () => {
  it('gives the same sequence for the same seed and another for another seed', () => {
    const a = seededUniform('seed-1', 20);
    expect(seededUniform('seed-1', 20)).toEqual(a);
    expect(seededUniform('seed-2', 20)).not.toEqual(a);
    for (const x of a) expect(x >= 0 && x < 1).toBe(true);
  });

  it('shuffles into a permutation of its input', () => {
    const items = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
    const shuffled = seededShuffle(items, 'some seed');
    expect([...shuffled].sort()).toEqual(items);
    expect(seededShuffle(items, 'some seed')).toEqual(shuffled);
    expect(items).toEqual(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']);
  });

  it('puts each item in each position about equally often over many seeds', () => {
    const counts = Array.from({ length: 4 }, () => [0, 0, 0, 0]);
    const runs = 4000;
    for (let i = 0; i < runs; i++) {
      const s = seededShuffle([0, 1, 2, 3], `seed-${i}`);
      s.forEach((item, pos) => counts[item][pos]++);
    }
    for (const row of counts) for (const c of row) expect(Math.abs(c - runs / 4)).toBeLessThan(120);
  });
});

describe('g8-assign', () => {
  it('draws one participant per row of the crossover table and records seed and draw', () => {
    const a = createAssignment({ seed: 'dice-4-1-6-2', participants, reserves, drawnAt: at });
    expect(a.algorithm).toBe(ASSIGN_ALGORITHM);
    expect(a.seed).toBe('dice-4-1-6-2');
    expect(a.participants).toEqual([...participants].sort());
    expect(a.draw.map((d) => d.row)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(a.draw.map((d) => d.participant).sort()).toEqual([...participants].sort());
    expect(a.replacements).toEqual([]);
    expect(a.dates).toHaveLength(8);
  });

  it('does not depend on the order the participant codes are given in', () => {
    const a = createAssignment({ seed: 's', participants, reserves, drawnAt: at });
    const b = createAssignment({
      seed: 's',
      participants: [...participants].reverse(),
      reserves,
      drawnAt: at,
    });
    expect(b.draw).toEqual(a.draw);
  });

  it('refuses anything but 8 distinct participant codes and pseudonymous codes only', () => {
    expect(() =>
      createAssignment({ seed: 's', participants: participants.slice(1), reserves, drawnAt: at }),
    ).toThrow(/8 participants/);
    expect(() =>
      createAssignment({
        seed: 's',
        participants: [...participants.slice(1), 'P01'],
        reserves,
        drawnAt: at,
      }),
    ).toThrow(/distinct/);
    expect(() =>
      createAssignment({
        seed: 's',
        participants: [...participants.slice(1), 'Alice'],
        reserves,
        drawnAt: at,
      }),
    ).toThrow(/participant code/);
    expect(() =>
      createAssignment({ seed: 's', participants, reserves: ['P01'], drawnAt: at }),
    ).toThrow(/reserve/);
    expect(() => createAssignment({ seed: '', participants, reserves, drawnAt: at })).toThrow(
      /seed/,
    );
  });

  it('reproduces a recorded draw from its seed and detects an edited draw (--dry-run)', () => {
    const a = createAssignment({ seed: 'abc', participants, reserves, drawnAt: at });
    expect(verifyAssignment(a)).toEqual([]);
    const edited = structuredClone(a);
    [edited.draw[0].participant, edited.draw[1].participant] = [
      edited.draw[1].participant,
      edited.draw[0].participant,
    ];
    expect(verifyAssignment(edited).join('\n')).toMatch(/row 1/);
  });

  it('records a reserve taking the row of a dropped participant, keeping the draw', () => {
    const a = createAssignment({ seed: 'abc', participants, reserves, drawnAt: at });
    const dropped = a.draw[2].participant;
    const b = recordReplacement(a, { row: 3, reserve: 'P09', recordedAt: at });
    expect(b.draw).toEqual(a.draw);
    expect(b.replacements).toEqual([{ row: 3, dropped, reserve: 'P09', recordedAt: at }]);
    expect(currentParticipant(b, 3)).toBe('P09');
    expect(currentParticipant(b, 4)).toBe(a.draw[3].participant);
    expect(verifyAssignment(b)).toEqual([]);
    expect(() => recordReplacement(b, { row: 4, reserve: 'P09', recordedAt: at })).toThrow(
      /already/,
    );
    expect(() => recordReplacement(b, { row: 4, reserve: 'P01', recordedAt: at })).toThrow(
      /reserve/,
    );
  });
});
