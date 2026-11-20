/**
 * Line matching used by G-09 (line attribution) and by the rename detection of G-07. A plain
 * Myers O(ND) comparison on interned lines, with the common prefix and suffix cut off first and a
 * bound on the edit distance: beyond it the lines count as all replaced (no match), which only
 * makes attribution coarser, never wrong about which lines exist.
 *
 * This is not the histogram diff that fixes the hunks of a snapshot (C001-ADR-009, C001-T-008).
 */

export const MAX_EDIT_DISTANCE = 2000;

/** Splits bytes into lines, each keeping its line feed; no trailing empty line. */
export function splitLines(content: Buffer): string[] {
  const text = content.toString('latin1');
  const lines: string[] = [];
  let start = 0;
  for (;;) {
    const eol = text.indexOf('\n', start);
    if (eol < 0) break;
    lines.push(text.slice(start, eol + 1));
    start = eol + 1;
  }
  if (start < text.length) lines.push(text.slice(start));
  return lines;
}

/**
 * For each line of `b`, the index of the line of `a` it is matched with, or -1. Matched pairs are
 * increasing in both sequences.
 */
export function matchLines(a: readonly string[], b: readonly string[]): Int32Array {
  const result = new Int32Array(b.length).fill(-1);
  let head = 0;
  while (head < a.length && head < b.length && a[head] === b[head]) {
    result[head] = head;
    head++;
  }
  let tailA = a.length;
  let tailB = b.length;
  while (tailA > head && tailB > head && a[tailA - 1] === b[tailB - 1]) {
    tailA--;
    tailB--;
    result[tailB] = tailA;
  }
  if (head === tailA || head === tailB) return result;

  const ids = new Map<string, number>();
  const intern = (line: string): number => {
    let id = ids.get(line);
    if (id === undefined) {
      id = ids.size;
      ids.set(line, id);
    }
    return id;
  };
  const x = a.slice(head, tailA).map(intern);
  const y = b.slice(head, tailB).map(intern);
  const pairs = myers(x, y, Math.min(MAX_EDIT_DISTANCE, x.length + y.length));
  for (const [i, j] of pairs) result[head + j] = head + i;
  return result;
}

function myers(
  a: readonly number[],
  b: readonly number[],
  maxD: number,
): Array<readonly [number, number]> {
  const n = a.length;
  const m = b.length;
  const off = maxD + 1;
  const size = 2 * maxD + 3;
  const v = new Int32Array(size);
  const trace: Int32Array[] = [];
  for (let d = 0; d <= maxD; d++) {
    trace.push(v.slice());
    for (let k = -d; k <= d; k += 2) {
      let x: number;
      if (k === -d || (k !== d && v[off + k - 1]! < v[off + k + 1]!)) x = v[off + k + 1]!;
      else x = v[off + k - 1]! + 1;
      let y = x - k;
      while (x < n && y < m && a[x] === b[y]) {
        x++;
        y++;
      }
      v[off + k] = x;
      if (x >= n && y >= m) return backtrack(trace, d, n, m, off);
    }
  }
  return [];
}

function backtrack(
  trace: Int32Array[],
  last: number,
  n: number,
  m: number,
  off: number,
): Array<readonly [number, number]> {
  const pairs: Array<readonly [number, number]> = [];
  let x = n;
  let y = m;
  for (let d = last; d >= 0; d--) {
    const vd = trace[d]!;
    const k = x - y;
    const prevK = k === -d || (k !== d && vd[off + k - 1]! < vd[off + k + 1]!) ? k + 1 : k - 1;
    const prevX = vd[off + prevK]!;
    const prevY = prevX - prevK;
    while (x > prevX && y > prevY) {
      x--;
      y--;
      pairs.push([x, y]);
    }
    if (d > 0) {
      x = prevX;
      y = prevY;
    }
  }
  return pairs.reverse();
}
