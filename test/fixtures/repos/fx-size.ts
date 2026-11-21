import { FixtureRepo, type FixtureOptions } from '../builder/fixture-repo.js';

/**
 * `fx-size` (CAP-01 acceptance, C001-TS-147 to C001-TS-149): a base commit B0 that holds a pool of
 * text files, on which `writeSizeChange` writes a change of an exact number of changed lines,
 * changed files and hunks into the working tree.
 *
 * Every line of the pool and of the change is unique, so the histogram diff (C001-CON-17) finds
 * exactly the insertions that `writeSizeChange` makes: each insertion is one hunk of added lines,
 * and two insertions of one file are separated by at least one unchanged base line.
 */

/** Files in the pool of B0: more than the largest change of the scenarios (340 files). */
export const SIZE_POOL_FILES = 400;
/** Lines of each pool file: up to this many hunks fit in one file. */
export const SIZE_POOL_LINES = 10;

const poolPath = (i: number) => `src/size/f${String(i).padStart(3, '0')}.ts`;
const baseLine = (file: number, line: number) => `export const b${file}_${line} = ${line};\n`;
const addedLine = (file: number, hunk: number, line: number) =>
  `export const a${file}_${hunk}_${line} = ${line};\n`;

export function buildFxSize(options: FixtureOptions = {}): FixtureRepo {
  const repo = FixtureRepo.create(options);
  const files: Record<string, string> = {};
  for (let f = 0; f < SIZE_POOL_FILES; f++) {
    let text = '';
    for (let l = 1; l <= SIZE_POOL_LINES; l++) text += baseLine(f, l);
    files[poolPath(f)] = text;
  }
  repo.commit('B0', { subject: 'B0: base', files });
  return repo;
}

/** A count as the scenarios write it: "10,001" → 10001. */
export const count = (text: string): number => Number(text.replace(/,/g, ''));

export interface SizeChange {
  readonly lines: number;
  readonly files: number;
  /** Default: one hunk per file. */
  readonly hunks?: number;
}

/** Spreads `total` over `parts` as evenly as possible, the larger parts first. */
function spread(total: number, parts: number): number[] {
  const each = Math.floor(total / parts);
  const extra = total % parts;
  return Array.from({ length: parts }, (_, i) => each + (i < extra ? 1 : 0));
}

/**
 * Writes the change into the working tree of an `fx-size` repository: `files` pool files edited,
 * `hunks` insertions spread over them and `lines` added lines spread over the insertions.
 */
export function writeSizeChange(repo: FixtureRepo, change: SizeChange): void {
  const hunks = change.hunks ?? change.files;
  if (change.files < 1 || change.files > SIZE_POOL_FILES) {
    throw new Error(`fx-size holds ${SIZE_POOL_FILES} files; ${change.files} asked`);
  }
  if (hunks < change.files || hunks > change.files * SIZE_POOL_LINES) {
    throw new Error(`${hunks} hunks cannot be spread over ${change.files} files`);
  }
  if (change.lines < hunks) throw new Error(`${change.lines} lines cannot fill ${hunks} hunks`);
  const hunksPerFile = spread(hunks, change.files);
  const linesPerHunk = spread(change.lines, hunks);
  let next = 0;
  for (let f = 0; f < change.files; f++) {
    let text = '';
    const inFile = hunksPerFile[f]!;
    for (let l = 1; l <= SIZE_POOL_LINES; l++) {
      text += baseLine(f, l);
      // Insertion l of the file follows base line l, so base line l + 1 separates it from the next.
      if (l <= inFile) {
        const n = linesPerHunk[next++]!;
        for (let j = 0; j < n; j++) text += addedLine(f, l, j);
      }
    }
    repo.write(poolPath(f), text);
  }
}
