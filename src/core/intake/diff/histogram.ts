import { matchLines } from '../../git/line-diff.js';

/**
 * The diff of the hunks of a snapshot (C001-ADR-009 §1, C001-CON-17): histogram diff with one fixed
 * slider rule, written in the analysis core from the published description of JGit's
 * `HistogramDiff` (BSD-3-Clause, EDL-1.0); no code of git's `xdiff` or of JGit is used.
 *
 * Lines are compared as the strings given, byte for byte: no whitespace is ignored, and a line
 * without its final line feed differs from the same line with it (as in git). The result is a
 * function of the two sequences alone, so every operating system and every run gives the same
 * edits. Tie-breaks, all fixed:
 *  - anchor: among the lines of the second sequence that occur at most 64 times in the first
 *    sequence's region, the candidate with the longest common run wins; a candidate whose rarest
 *    line is rarer than the best so far also wins (as in JGit); remaining ties go to the lowest
 *    position in the second sequence, then in the first;
 *  - a region in which every line that both sides share occurs more than 64 times in the first
 *    side goes to Myers' algorithm (`matchLines`, which bounds the edit distance);
 *  - the slider rule places each pure insertion or deletion, see `slideEdits`.
 */

/** A changed region: lines `aStart..aEnd` of the old side replaced by `bStart..bEnd` of the new. */
export interface Edit {
  readonly aStart: number;
  readonly aEnd: number;
  readonly bStart: number;
  readonly bEnd: number;
}

/** Lines that occur more often than this in a region are no anchors (JGit's `maxChainLength`). */
export const MAX_OCCURRENCES = 64;

interface Region {
  as: number;
  ae: number;
  bs: number;
  be: number;
}

function intern(a: readonly string[], b: readonly string[]): [Int32Array, Int32Array] {
  const ids = new Map<string, number>();
  const of = (line: string): number => {
    let id = ids.get(line);
    if (id === undefined) {
      id = ids.size;
      ids.set(line, id);
    }
    return id;
  };
  return [Int32Array.from(a, of), Int32Array.from(b, of)];
}

/** The edits that turn `a` into `b`, in order, none empty, none touching another. */
export function histogramDiff(a: readonly string[], b: readonly string[]): Edit[] {
  const [ia, ib] = intern(a, b);
  const raw: Edit[] = [];
  const stack: Region[] = [{ as: 0, ae: ia.length, bs: 0, be: ib.length }];
  while (stack.length > 0) {
    const region = stack.pop()!;
    let { as, ae, bs, be } = region;
    while (as < ae && bs < be && ia[as] === ib[bs]) {
      as++;
      bs++;
    }
    while (as < ae && bs < be && ia[ae - 1] === ib[be - 1]) {
      ae--;
      be--;
    }
    if (as === ae && bs === be) continue;
    if (as === ae || bs === be) {
      raw.push({ aStart: as, aEnd: ae, bStart: bs, bEnd: be });
      continue;
    }

    const positions = new Map<number, number[]>();
    for (let i = as; i < ae; i++) {
      const id = ia[i]!;
      const list = positions.get(id);
      if (list) list.push(i);
      else positions.set(id, [i]);
    }
    let hasCommon = false;
    let lowest = MAX_OCCURRENCES + 1;
    let bestLength = 0;
    let bestA = 0;
    let bestB = 0;
    for (let at = bs; at < be;) {
      const list = positions.get(ib[at]!);
      if (!list) {
        at++;
        continue;
      }
      hasCommon = true;
      const count = list.length;
      if (count > MAX_OCCURRENCES || count > lowest) {
        at++;
        continue;
      }
      let next = at + 1;
      for (const start of list) {
        let s = start;
        let t = at;
        let rarest = count;
        while (s > as && t > bs && ia[s - 1] === ib[t - 1]) {
          s--;
          t--;
          rarest = Math.min(rarest, positions.get(ia[s]!)!.length);
        }
        let e = start + 1;
        let f = at + 1;
        while (e < ae && f < be && ia[e] === ib[f]) {
          rarest = Math.min(rarest, positions.get(ia[e]!)!.length);
          e++;
          f++;
        }
        if (f > next) next = f;
        if (e - s > bestLength || rarest < lowest) {
          bestLength = e - s;
          bestA = s;
          bestB = t;
          lowest = rarest;
        }
      }
      at = next;
    }

    if (bestLength > 0) {
      // The right part is pushed first so that the left part is resolved first: edits come out in order.
      stack.push({ as: bestA + bestLength, ae, bs: bestB + bestLength, be });
      stack.push({ as, ae: bestA, bs, be: bestB });
    } else if (hasCommon) {
      raw.push(...myersEdits(a, b, as, ae, bs, be));
    } else {
      raw.push({ aStart: as, aEnd: ae, bStart: bs, bEnd: be });
    }
  }
  return slideEdits(raw, a, b, ia, ib);
}

function myersEdits(
  a: readonly string[],
  b: readonly string[],
  as: number,
  ae: number,
  bs: number,
  be: number,
): Edit[] {
  const matched = matchLines(a.slice(as, ae), b.slice(bs, be));
  const edits: Edit[] = [];
  let prevA = 0;
  let prevB = 0;
  for (let j = 0; j < matched.length; j++) {
    const i = matched[j]!;
    if (i < 0) continue;
    if (i > prevA || j > prevB) {
      edits.push({ aStart: as + prevA, aEnd: as + i, bStart: bs + prevB, bEnd: bs + j });
    }
    prevA = i + 1;
    prevB = j + 1;
  }
  if (as + prevA < ae || bs + prevB < be) {
    edits.push({ aStart: as + prevA, aEnd: ae, bStart: bs + prevB, bEnd: be });
  }
  return edits;
}

const WHITESPACE = /^[ \t\r\n\f\v]*$/;

function indentation(line: string): number {
  let width = 0;
  for (const ch of line) {
    if (ch === ' ') width++;
    else if (ch === '\t') width += 8 - (width % 8);
    else break;
  }
  return width;
}

/**
 * Slider score of a run that ends before line `at` of `lines`: the indentation of that line, the
 * end of the file counting as smaller than any line (-1) and a blank line taking the indentation of
 * the next non-blank line (C001-ADR-009 §1).
 */
function sliderScore(lines: readonly string[], at: number): number {
  for (let i = at; i < lines.length; i++) {
    if (!WHITESPACE.test(lines[i]!)) return indentation(lines[i]!);
  }
  return -1;
}

/**
 * The slider rule: a run of added or deleted lines that can slide along equal lines without changing
 * the edit is placed where the line after it has the smallest score (`sliderScore`); remaining ties
 * go to the lowest position in the file. A run that comes to touch its neighbour merges with it.
 */
function slideEdits(
  edits: readonly Edit[],
  a: readonly string[],
  b: readonly string[],
  ia: Int32Array,
  ib: Int32Array,
): Edit[] {
  const out: Edit[] = [];
  for (let k = 0; k < edits.length; k++) {
    let edit = edits[k]!;
    const previous = out[out.length - 1];
    const next = edits[k + 1];
    const insertion = edit.aStart === edit.aEnd;
    if (insertion || edit.bStart === edit.bEnd) {
      const ids = insertion ? ib : ia;
      const lines = insertion ? b : a;
      const first = insertion ? edit.bStart : edit.aStart;
      let s = first;
      let t = insertion ? edit.bEnd : edit.aEnd;
      const lower = previous ? (insertion ? previous.bEnd : previous.aEnd) : 0;
      const upper = next ? (insertion ? next.bStart : next.aStart) : ids.length;
      while (s > lower && ids[s - 1] === ids[t - 1]) {
        s--;
        t--;
      }
      let bestS = s;
      let bestScore = sliderScore(lines, t);
      while (t < upper && ids[s] === ids[t]) {
        s++;
        t++;
        const score = sliderScore(lines, t);
        if (score < bestScore) {
          bestScore = score;
          bestS = s;
        }
      }
      const delta = bestS - first;
      const length = insertion ? edit.bEnd - edit.bStart : edit.aEnd - edit.aStart;
      edit = insertion
        ? {
            aStart: edit.aStart + delta,
            aEnd: edit.aEnd + delta,
            bStart: bestS,
            bEnd: bestS + length,
          }
        : {
            aStart: bestS,
            aEnd: bestS + length,
            bStart: edit.bStart + delta,
            bEnd: edit.bEnd + delta,
          };
    }
    if (previous && previous.aEnd === edit.aStart && previous.bEnd === edit.bStart) {
      out[out.length - 1] = {
        aStart: previous.aStart,
        aEnd: edit.aEnd,
        bStart: previous.bStart,
        bEnd: edit.bEnd,
      };
    } else {
      out.push(edit);
    }
  }
  return out;
}
