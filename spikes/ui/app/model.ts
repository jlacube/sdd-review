// Spike C001-T-023: the row models of the two virtualised lists, as pure functions (unit-tested).
// Every row has one fixed height, so the virtualiser never measures the DOM.
import type { SpikeFile, SpikeGroup, SpikeHunk } from './dataset.js';

export type HunkRow =
  | {
      readonly kind: 'group';
      readonly key: string;
      readonly groupId: string;
      readonly name: string;
      readonly hunks: number;
      readonly lines: number;
    }
  | { readonly kind: 'hunk'; readonly key: string; readonly hunkId: string; readonly label: string }
  | {
      readonly kind: 'line';
      readonly key: string;
      readonly hunkId: string;
      readonly lineKind: 'added' | 'deleted';
      readonly text: string;
    };

export interface HunkListModel {
  readonly rows: readonly HunkRow[];
  /** Row index of each hunk's header row. */
  readonly headerIndex: ReadonlyMap<string, number>;
  /** Hunks in display order (group by group), for next and previous. */
  readonly order: readonly string[];
}

export function hunkLabel(h: SpikeHunk): string {
  return `@@ -${h.oldStart},${h.oldLines} +${h.newStart},${h.newLines} @@ ${h.path}`;
}

/** The hunk list: per group a header, then each hunk's header and its changed lines. */
export function buildHunkRows(
  hunks: readonly SpikeHunk[],
  groups: readonly SpikeGroup[],
  assignment: Readonly<Record<string, string>>,
): HunkListModel {
  const byGroup = new Map<string, SpikeHunk[]>(groups.map((g) => [g.id, []]));
  for (const h of hunks) {
    const list = byGroup.get(assignment[h.hunkId] ?? '') ?? byGroup.get(groups[0]!.id)!;
    list.push(h);
  }
  const rows: HunkRow[] = [];
  const headerIndex = new Map<string, number>();
  const order: string[] = [];
  for (const g of groups) {
    const members = byGroup.get(g.id)!;
    const lines = members.reduce((n, h) => n + h.lines.length, 0);
    rows.push({
      kind: 'group',
      key: `g:${g.id}`,
      groupId: g.id,
      name: g.name,
      hunks: members.length,
      lines,
    });
    for (const h of members) {
      headerIndex.set(h.hunkId, rows.length);
      order.push(h.hunkId);
      rows.push({ kind: 'hunk', key: `h:${h.hunkId}`, hunkId: h.hunkId, label: hunkLabel(h) });
      h.lines.forEach((l, i) =>
        rows.push({
          kind: 'line',
          key: `l:${h.hunkId}:${i}`,
          hunkId: h.hunkId,
          lineKind: l.kind,
          text: l.text,
        }),
      );
    }
  }
  return { rows, headerIndex, order };
}

export interface ContextRow {
  readonly key: string;
  /** Line number on the shown side; null for a deleted line shown in a head-side view. */
  readonly number: number | null;
  readonly mark: 'added' | 'deleted' | 'none';
  readonly text: string;
}

export interface ContextModel {
  readonly rows: readonly ContextRow[];
  /** Row index of the first row of each hunk of the file. */
  readonly hunkRowIndex: ReadonlyMap<string, number>;
}

export function splitLines(text: string): string[] {
  const lines = text.split(/\r?\n/);
  if (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();
  return lines;
}

/**
 * The file context: the whole file on its shown side, with the hunks' added lines marked and
 * their deleted lines shown in place (zero-context hunks: `newLines` added lines from `newStart`;
 * a hunk without added lines has its deleted lines after line `newStart`).
 */
export function buildContextRows(file: SpikeFile, hunks: readonly SpikeHunk[]): ContextModel {
  const rows: ContextRow[] = [];
  const hunkRowIndex = new Map<string, number>();
  if (file.text === null) {
    rows.push({ key: 'binary', number: null, mark: 'none', text: '(binary file)' });
    for (const h of hunks) hunkRowIndex.set(h.hunkId, 0);
    return { rows, hunkRowIndex };
  }
  const lines = splitLines(file.text);
  if (file.side === 'old') {
    lines.forEach((text, i) => rows.push({ key: `o:${i}`, number: i + 1, mark: 'deleted', text }));
    for (const h of hunks) hunkRowIndex.set(h.hunkId, 0);
    return { rows, hunkRowIndex };
  }
  const added = new Set<number>();
  // Deleted lines anchored before new-side line n (n = lines.length + 1: at the end).
  const anchored = new Map<number, SpikeHunk[]>();
  const firstAdded = new Map<number, SpikeHunk>();
  for (const h of hunks) {
    for (let n = h.newStart; n < h.newStart + h.newLines; n++) added.add(n);
    if (h.newLines > 0) firstAdded.set(h.newStart, h);
    if (h.lines.some((l) => l.kind === 'deleted')) {
      const at = Math.min(h.newLines > 0 ? h.newStart : h.newStart + 1, lines.length + 1);
      anchored.set(at, [...(anchored.get(at) ?? []), h]);
    }
  }
  const emitDeleted = (n: number) => {
    for (const h of anchored.get(n) ?? []) {
      if (!hunkRowIndex.has(h.hunkId)) hunkRowIndex.set(h.hunkId, rows.length);
      h.lines.forEach((l, i) => {
        if (l.kind === 'deleted') {
          rows.push({ key: `d:${h.hunkId}:${i}`, number: null, mark: 'deleted', text: l.text });
        }
      });
    }
  };
  for (let n = 1; n <= lines.length; n++) {
    emitDeleted(n);
    const starting = firstAdded.get(n);
    if (starting && !hunkRowIndex.has(starting.hunkId)) {
      hunkRowIndex.set(starting.hunkId, rows.length);
    }
    rows.push({
      key: `n:${n}`,
      number: n,
      mark: added.has(n) ? 'added' : 'none',
      text: lines[n - 1]!,
    });
  }
  emitDeleted(lines.length + 1);
  for (const h of hunks) if (!hunkRowIndex.has(h.hunkId)) hunkRowIndex.set(h.hunkId, 0);
  return { rows, hunkRowIndex };
}

/** The group that a digit key names: '1'..'9' are groups 0..8, '0' is group 9. */
export function groupIndexOfKey(key: string): number | null {
  if (!/^[0-9]$/.test(key)) return null;
  return key === '0' ? 9 : Number(key) - 1;
}
