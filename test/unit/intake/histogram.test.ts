import { describe, expect, it } from 'vitest';
import {
  histogramDiff,
  MAX_OCCURRENCES,
  type Edit,
} from '../../../src/core/intake/diff/histogram.js';

// C001-ADR-009 §1: histogram diff, slider rule, fallback; property tests (the edit script applied to
// the old side gives the new side).

const lines = (text: string): string[] =>
  text
    .split('\n')
    .map((l, i, all) => (i < all.length - 1 ? `${l}\n` : l))
    .filter((l) => l !== '');

function apply(a: readonly string[], b: readonly string[], edits: readonly Edit[]): string[] {
  const out: string[] = [];
  let at = 0;
  for (const e of edits) {
    out.push(...a.slice(at, e.aStart), ...b.slice(e.bStart, e.bEnd));
    at = e.aEnd;
  }
  out.push(...a.slice(at));
  return out;
}

function expectValid(a: readonly string[], b: readonly string[], edits: readonly Edit[]) {
  expect(apply(a, b, edits)).toEqual(b);
  let prev: Edit | undefined;
  for (const e of edits) {
    expect(e.aStart < e.aEnd || e.bStart < e.bEnd).toBe(true);
    if (prev) {
      // not touching: at least one equal line between two edits, on both sides
      expect(e.aStart - prev.aEnd).toBeGreaterThan(0);
      expect(e.bStart - prev.bEnd).toBe(e.aStart - prev.aEnd);
    }
    prev = e;
  }
}

function mulberry32(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('histogramDiff', () => {
  it('gives no edit for equal sequences and for two empty ones', () => {
    expect(histogramDiff([], [])).toEqual([]);
    expect(histogramDiff(['a\n', 'b\n'], ['a\n', 'b\n'])).toEqual([]);
  });

  it('gives one insertion or one deletion against an empty side', () => {
    expect(histogramDiff([], ['a\n', 'b\n'])).toEqual([{ aStart: 0, aEnd: 0, bStart: 0, bEnd: 2 }]);
    expect(histogramDiff(['a\n', 'b\n'], [])).toEqual([{ aStart: 0, aEnd: 2, bStart: 0, bEnd: 0 }]);
  });

  it('treats a missing final line feed as a difference', () => {
    expect(histogramDiff(['a\n', 'b'], ['a\n', 'b\n'])).toEqual([
      { aStart: 1, aEnd: 2, bStart: 1, bEnd: 2 },
    ]);
  });

  it('ignores no whitespace', () => {
    expect(histogramDiff(['a\n', ' b\n'], ['a\n', 'b\n'])).toHaveLength(1);
    expect(histogramDiff(['a \n'], ['a\n'])).toHaveLength(1);
  });

  it('keeps a moved block whole instead of aligning on its closing braces', () => {
    const f1 = ['function one() {\n', '  alpha();\n', '}\n', '\n'];
    const f2 = ['function two() {\n', '  beta();\n', '}\n', '\n'];
    const f3 = ['function three() {\n', '  gamma();\n', '}\n'];
    const a = [...f1, ...f2, ...f3];
    const b = [...f2, ...f1, ...f3];
    const edits = histogramDiff(a, b);
    expectValid(a, b, edits);
    // one block leaves and the same block arrives: two edits, each of whole definitions
    expect(edits).toHaveLength(2);
    for (const e of edits)
      expect((e.aEnd - e.aStart) % 4 === 0 && (e.bEnd - e.bStart) % 4 === 0).toBe(true);
  });

  describe('slider rule', () => {
    it('places a function appended after another as blank line, header, body, closing brace', () => {
      const a = lines('function a() {\n  x();\n}\n');
      const b = lines('function a() {\n  x();\n}\n\nfunction b() {\n  y();\n}\n');
      expect(histogramDiff(a, b)).toEqual([{ aStart: 3, aEnd: 3, bStart: 3, bEnd: 7 }]);
    });

    it('slides a run to where the following line is least indented', () => {
      const a = lines('f() {\n  if (a) {\n    one();\n  }\n}\n');
      const b = lines('f() {\n  if (a) {\n    one();\n  }\n  if (c) {\n    three();\n  }\n}\n');
      const edits = histogramDiff(a, b);
      expectValid(a, b, edits);
      // the whole block, not "  }", "  if (c) {", "    three();" (followed by an indented line)
      expect(edits).toEqual([{ aStart: 4, aEnd: 4, bStart: 4, bEnd: 7 }]);
    });

    it('sends a tie between equally indented positions to the lowest one', () => {
      const a = lines('if (a) {\n  one();\n}\nif (b) {\n  two();\n}\n');
      const b = lines('if (a) {\n  one();\n}\nif (c) {\n  three();\n}\nif (b) {\n  two();\n}\n');
      const edits = histogramDiff(a, b);
      expectValid(a, b, edits);
      expect(edits).toEqual([{ aStart: 2, aEnd: 2, bStart: 2, bEnd: 5 }]);
    });

    it('sends remaining ties to the lowest position', () => {
      const a = lines('x\n');
      const b = lines('x\nx\nx\n');
      expect(histogramDiff(a, b)).toEqual(
        [{ aStart: 1, aEnd: 1, bStart: 1, bEnd: 3 }].map((e) => e),
      );
    });

    it('lets the end of the file count as smaller than any line', () => {
      const a = lines('a\n');
      const b = lines('a\na\n');
      // ties between before-the-first and after-the-last "a": the end of file wins
      expect(histogramDiff(a, b)).toEqual([{ aStart: 1, aEnd: 1, bStart: 1, bEnd: 2 }]);
    });

    it('slides a deletion the same way', () => {
      const a = lines('function a() {\n  x();\n}\n\nfunction b() {\n  y();\n}\n');
      const b = lines('function a() {\n  x();\n}\n');
      expect(histogramDiff(a, b)).toEqual([{ aStart: 3, aEnd: 7, bStart: 3, bEnd: 3 }]);
    });

    it('takes the indentation of the next non-blank line for a blank line', () => {
      const a = lines('{\n  p;\n}\n');
      // the run [ "  q;", "" ] can slide up or down; the blank after takes the indentation of "}"
      const b = lines('{\n  p;\n  q;\n\n}\n');
      const edits = histogramDiff(a, b);
      expectValid(a, b, edits);
      expect(edits).toHaveLength(1);
    });
  });

  describe('fallback to Myers', () => {
    it(`is used when every shared line occurs more than ${MAX_OCCURRENCES} times`, () => {
      const a = Array.from({ length: 100 }, () => 'a\n');
      const b = [...a.slice(0, 30), 'b\n', ...a.slice(30, 70), 'c\n', ...a.slice(70)];
      const edits = histogramDiff(a, b);
      expectValid(a, b, edits);
      expect(edits).toHaveLength(2);
      expect(edits.map((e) => e.bEnd - e.bStart)).toEqual([1, 1]);
    });
  });

  describe('properties', () => {
    const alphabet = ['}\n', '\n', 'a\n', 'b\n', 'c\n', '  d\n', '  e\n', 'f', 'if (x) {\n', 'g\n'];

    it('applies to the new side, with non-touching ordered edits, for random sequences', () => {
      const random = mulberry32(20261120);
      for (let round = 0; round < 400; round++) {
        const size = (limit: number) => Math.floor(random() * limit);
        const pick = () => alphabet[size(alphabet.length)]!;
        const a = Array.from({ length: size(40) }, pick);
        const b = a.slice();
        for (let k = size(6); k > 0; k--) {
          const at = size(b.length + 1);
          if (random() < 0.5) b.splice(at, size(4));
          else b.splice(at, 0, ...Array.from({ length: size(4) + 1 }, pick));
        }
        expectValid(a, b, histogramDiff(a, b));
      }
    });

    it('is a function of the two sequences alone', () => {
      const a = Array.from({ length: 500 }, (_, i) => `line ${i % 37}\n`);
      const b = a.filter((_, i) => i % 7 !== 3).concat(['tail\n']);
      expect(histogramDiff(a, b)).toEqual(histogramDiff([...a], [...b]));
    });

    it('handles a large block and a large number of edits quickly', () => {
      const a = Array.from({ length: 20000 }, (_, i) => `row ${i}\n`);
      const b = a.map((l, i) => (i % 100 === 0 ? `changed ${i}\n` : l));
      const start = Date.now();
      const edits = histogramDiff(a, b);
      expectValid(a, b, edits);
      expect(edits).toHaveLength(200);
      expect(Date.now() - start).toBeLessThan(5000);
    });
  });
});
