// Spike C001-T-014: the rename search set. C001-ADR-003 decision 4: the rename proof finds the
// snapshot files to parse through a per-snapshot index of identifier text, so it does not parse
// the whole repository. C001-REQ-407: a pure rename applies to the definition and to every use in
// the snapshot, so every snapshot file that mentions an old or a new name must be parsed.
import type { Extraction } from './extract.js';

const IDENTIFIER = /[A-Za-z_$][A-Za-z0-9_$]*/g;

/** The distinct identifier-like words of a text. */
export function identifiersOf(text: string): Set<string> {
  return new Set(text.match(IDENTIFIER) ?? []);
}

/** Inverted index: identifier text to the snapshot files that hold it. */
export class IdentifierIndex {
  private readonly files: string[] = [];
  private readonly postings = new Map<string, number[]>();

  add(path: string, text: string): void {
    const id = this.files.push(path) - 1;
    for (const word of identifiersOf(text)) {
      const list = this.postings.get(word);
      if (list) list.push(id);
      else this.postings.set(word, [id]);
    }
  }

  get fileCount(): number {
    return this.files.length;
  }

  get wordCount(): number {
    return this.postings.size;
  }

  filesWith(word: string): string[] {
    return (this.postings.get(word) ?? []).map((i) => this.files[i]!);
  }
}

/**
 * Names that a rename could have replaced in one changed file: symbols defined on the base side
 * and gone from the head side (old names), and symbols new on the head side (new names).
 */
export function renameCandidates(
  base: Pick<Extraction, 'symbols'> | null,
  head: Pick<Extraction, 'symbols'> | null,
): { oldNames: string[]; newNames: string[] } {
  const before = new Set(base?.symbols.map((s) => s.name) ?? []);
  const after = new Set(head?.symbols.map((s) => s.name) ?? []);
  return {
    oldNames: [...before].filter((n) => !after.has(n)).sort(),
    newNames: [...after].filter((n) => !before.has(n)).sort(),
  };
}

/** Snapshot files outside the changed set that mention one of the names, sorted. */
export function renameSearchSet(
  index: IdentifierIndex,
  names: Iterable<string>,
  changedPaths: ReadonlySet<string>,
): string[] {
  const out = new Set<string>();
  for (const name of names) {
    for (const file of index.filesWith(name)) if (!changedPaths.has(file)) out.add(file);
  }
  return [...out].sort();
}
