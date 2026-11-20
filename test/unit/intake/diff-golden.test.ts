import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { cutHunks } from '../../../src/core/intake/hunks.js';

// C001-ADR-009 follow-up: the golden diff corpus. Each folder of diff-golden/ holds old.txt, new.txt
// and the expected hunks. The files are LF files (.gitattributes), so every operating system reads the
// same bytes and must cut the same hunks. A change of expected.json is a change of the hunk output
// of the release: a release-note item.

const corpus = join(dirname(fileURLToPath(import.meta.url)), 'diff-golden');
const cases = readdirSync(corpus, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();

interface ExpectedHunk {
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  lines: string[];
}

describe('golden diff corpus', () => {
  it('covers the cases of C001-ADR-009', () => {
    for (const name of [
      'moved-block',
      'repeated-lines-insert',
      'whitespace-indent-only',
      'no-final-newline-added',
      'empty-old',
      'empty-new',
      'large-block-insert',
      'slider-eof',
    ]) {
      expect(cases).toContain(name);
    }
  });

  it.each(cases)('%s', (name) => {
    const dir = join(corpus, name);
    const oldBytes = readFileSync(join(dir, 'old.txt'));
    const newBytes = readFileSync(join(dir, 'new.txt'));
    // The fixture files must reach every operating system with LF line ends.
    expect(oldBytes.includes(13)).toBe(false);
    expect(newBytes.includes(13)).toBe(false);
    const expected = JSON.parse(readFileSync(join(dir, 'expected.json'), 'utf8')) as ExpectedHunk[];
    const actual = cutHunks('f.txt', oldBytes, newBytes).map((h) => ({
      oldStart: h.oldStart,
      oldLines: h.oldLines,
      newStart: h.newStart,
      newLines: h.newLines,
      lines: h.lines.map((l) => `${l.kind === 'added' ? '+' : '-'}${l.text}`),
    }));
    expect(actual).toEqual(expected);

    // Applying the hunks to old.txt gives new.txt (C001-ADR-009 property).
    const oldLines = oldBytes.toString('utf8').split('\n');
    if (oldLines.at(-1) === '') oldLines.pop();
    const out: string[] = [];
    let at = 0;
    for (const h of actual) {
      const start = h.oldLines > 0 ? h.oldStart - 1 : h.oldStart;
      out.push(...oldLines.slice(at, start));
      out.push(...h.lines.filter((l) => l.startsWith('+')).map((l) => l.slice(1)));
      at = start + h.oldLines;
    }
    out.push(...oldLines.slice(at));
    const newLines = newBytes.toString('utf8').split('\n');
    if (newLines.at(-1) === '') newLines.pop();
    expect(out).toEqual(newLines);
  });
});
