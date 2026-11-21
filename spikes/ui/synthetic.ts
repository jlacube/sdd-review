// Spike C001-T-023: a synthetic change with consistent hunks and file texts, for smoke tests of
// the harness (never for the measurement, which uses a benchmark change's intake).
import type { SpikeDataset, SpikeFile, SpikeHunk, SpikeLine } from './app/dataset.js';
import { prng } from './session.js';

const WORDS = ['value', 'result', 'item', 'entry', 'node', 'record', 'option', 'field', 'count'];

function codeLine(rnd: () => number, n: number): string {
  const w = WORDS[Math.floor(rnd() * WORDS.length)]!;
  const indent = '  '.repeat(1 + Math.floor(rnd() * 3));
  return `${indent}const ${w}${n} = compute(${w}, ${Math.floor(rnd() * 1000)}); // line ${n}`;
}

/** A synthetic change of about `changedLines` changed lines (added plus deleted), 8 groups. */
export function syntheticDataset(changedLines: number, seed = 1): SpikeDataset {
  if (!Number.isInteger(changedLines) || changedLines < 10) {
    throw new RangeError(`a synthetic change has at least 10 changed lines (got ${changedLines})`);
  }
  const rnd = prng(seed);
  const fileCount = Math.max(2, Math.round(changedLines / 37));
  const groups = Array.from({ length: 8 }, (_, i) => ({
    id: `g${i + 1}`,
    name: `Intent ${i + 1}`,
  }));
  const files: SpikeFile[] = [];
  const hunks: SpikeHunk[] = [];
  const assignment: Record<string, string> = {};
  let remaining = changedLines;
  for (let f = 0; f < fileCount; f++) {
    const path = `src/module${Math.floor(f / 10)}/file${f}.ts`;
    let budget = f === fileCount - 1 ? remaining : Math.round(remaining / (fileCount - f));
    remaining -= budget;
    const text: string[] = [];
    let oldLine = 1;
    let h = 0;
    while (budget > 0) {
      const gap = 5 + Math.floor(rnd() * 35);
      for (let i = 0; i < gap; i++) text.push(codeLine(rnd, text.length + 1));
      oldLine += gap;
      const size = Math.min(budget, 2 + Math.floor(rnd() * 28));
      budget -= size;
      const shape = rnd();
      const deleted = shape < 0.1 ? size : shape < 0.25 ? 0 : Math.floor(size / 2);
      const added = size - deleted;
      const lines: SpikeLine[] = [];
      for (let i = 0; i < deleted; i++) lines.push({ kind: 'deleted', text: codeLine(rnd, -i) });
      const newStart = added > 0 ? text.length + 1 : text.length;
      for (let i = 0; i < added; i++) {
        const t = codeLine(rnd, text.length + 1);
        text.push(t);
        lines.push({ kind: 'added', text: t });
      }
      const hunkId = `h-${f}-${h++}`;
      hunks.push({
        hunkId,
        path,
        oldStart: deleted > 0 ? oldLine : oldLine - 1,
        oldLines: deleted,
        newStart,
        newLines: added,
        lines,
      });
      assignment[hunkId] = groups[Math.floor(rnd() * groups.length)]!.id;
      oldLine += deleted;
    }
    const tail = 5 + Math.floor(rnd() * 30);
    for (let i = 0; i < tail; i++) text.push(codeLine(rnd, text.length + 1));
    files.push({
      path,
      changeType: 'modified',
      binary: false,
      side: 'new',
      text: `${text.join('\n')}\n`,
    });
  }
  return {
    schema: 'sdd-review-ui-spike-data/1',
    id: `synthetic-${changedLines}`,
    source: 'synthetic',
    changedLines,
    files,
    hunks,
    groups,
    assignment,
  };
}
