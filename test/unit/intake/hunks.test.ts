import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { contentKeyOf, cutHunks, hunkIdOf, identifyHunks } from '../../../src/core/intake/hunks.js';

// Hunk identity: domain model §3.

const buf = (text: string) => Buffer.from(text, 'utf8');
const sha = (text: string) => createHash('sha256').update(text, 'utf8').digest('hex');

describe('cutHunks', () => {
  it('cuts maximal runs of changed lines with no context, deleted lines first', () => {
    const hunks = cutHunks('src/a.ts', buf('a\nb\nc\nd\ne\n'), buf('a\nB\nC\nd\nE\nF\n'));
    expect(hunks.map((h) => [h.oldStart, h.oldLines, h.newStart, h.newLines])).toEqual([
      [2, 2, 2, 2],
      [5, 1, 5, 2],
    ]);
    expect(hunks[0]!.lines).toEqual([
      { kind: 'deleted', text: 'b', oldNumber: 2 },
      { kind: 'deleted', text: 'c', oldNumber: 3 },
      { kind: 'added', text: 'B', newNumber: 2 },
      { kind: 'added', text: 'C', newNumber: 3 },
    ]);
  });

  it('uses the line before the hunk as the start of a side without lines', () => {
    const [added] = cutHunks('f', buf('a\nb\n'), buf('a\nx\nb\n'));
    expect([added!.oldStart, added!.oldLines, added!.newStart, added!.newLines]).toEqual([
      1, 0, 2, 1,
    ]);
    const [atTop] = cutHunks('f', buf('a\n'), buf('x\na\n'));
    expect([atTop!.oldStart, atTop!.oldLines]).toEqual([0, 0]);
  });

  it('treats an absent side as an empty file and an empty file as no lines', () => {
    expect(cutHunks('f', null, buf('a\nb\n'))).toHaveLength(1);
    expect(cutHunks('f', buf('a\nb\n'), null)[0]!.oldLines).toBe(2);
    expect(cutHunks('f', Buffer.alloc(0), Buffer.alloc(0))).toEqual([]);
    expect(cutHunks('f', null, Buffer.alloc(0))).toEqual([]);
  });

  it('gives no hunk for equal content', () => {
    expect(cutHunks('f', buf('a\n'), buf('a\n'))).toEqual([]);
  });

  it('shows UTF-8 text without the line feed', () => {
    const [hunk] = cutHunks('f', buf('café\n'), buf('café ✓\n'));
    expect(hunk!.lines.map((l) => l.text)).toEqual(['café', 'café ✓']);
  });
});

describe('hunk content key', () => {
  it('hashes the path and the changed lines with their markers, without line numbers', () => {
    const [hunk] = cutHunks('src/a.ts', buf('a\nb\n'), buf('a\nB\n'));
    expect(hunk!.contentKey).toBe(sha('src/a.ts\n-b\n+B\n'));
  });

  it('is the same after a shift of position and differs for another path or line', () => {
    const [here] = cutHunks('p', buf('a\nb\nc\n'), buf('a\nX\nc\n'));
    const [shifted] = cutHunks('p', buf('q\nq\na\nb\nc\n'), buf('q\nq\na\nX\nc\n'));
    const [otherPath] = cutHunks('q', buf('a\nb\nc\n'), buf('a\nX\nc\n'));
    const [otherLine] = cutHunks('p', buf('a\nb\nc\n'), buf('a\nY\nc\n'));
    expect(shifted!.oldStart).toBe(here!.oldStart + 2);
    expect(shifted!.contentKey).toBe(here!.contentKey);
    expect(otherPath!.contentKey).not.toBe(here!.contentKey);
    expect(otherLine!.contentKey).not.toBe(here!.contentKey);
  });

  it('marks a line without final line feed', () => {
    const [noEol] = cutHunks('p', buf('a\nb'), buf('a\nb\n'));
    expect(noEol!.contentKey).toBe(sha('p\n-b\n\\ No newline at end of file\n+b\n'));
    expect(contentKeyOf('p', [{ kind: 'added', text: 'x', eol: true }])).toBe(sha('p\n+x\n'));
  });
});

describe('hunk ID', () => {
  const key = 'k'.repeat(64);

  it('is h- and 16 hex digits and depends on snapshot, path, both starts and the content key', () => {
    const id = hunkIdOf('s-1', 'p', 3, 4, key);
    expect(id).toMatch(/^h-[0-9a-f]{16}$/);
    expect(hunkIdOf('s-1', 'p', 3, 4, key)).toBe(id);
    for (const other of [
      hunkIdOf('s-2', 'p', 3, 4, key),
      hunkIdOf('s-1', 'q', 3, 4, key),
      hunkIdOf('s-1', 'p', 5, 4, key),
      hunkIdOf('s-1', 'p', 3, 5, key),
      hunkIdOf('s-1', 'p', 3, 4, 'j'.repeat(64)),
    ]) {
      expect(other).not.toBe(id);
    }
  });

  it('gives the hunks of a file distinct IDs and the fields of the schema', () => {
    const cut = cutHunks('p', buf('a\nb\nc\nd\n'), buf('A\nb\nc\nD\n'));
    const hunks = identifyHunks(`s-${'1'.repeat(64)}`, cut);
    expect(new Set(hunks.map((h) => h.hunkId)).size).toBe(2);
    expect(hunks[0]).toMatchObject({
      path: 'p',
      changedLines: 2,
      commits: [],
      uncommitted: false,
      isTestHunk: false,
    });
  });
});
